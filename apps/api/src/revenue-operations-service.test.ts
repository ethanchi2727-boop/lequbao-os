import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createRevenueOperationsService,
  RevenueOperationsAuthorizationError,
  RevenueOperationsConflictError,
} from './revenue-operations-service.js';

const tenantId = '18000000-0000-4000-8000-000000000001';
const statementId = '18000000-0000-4000-8000-000000000002';
const identity: AuthorizationContext = {
  tenantId,
  userId: '18000000-0000-4000-8000-000000000003',
  roleCodes: ['FINANCE'],
  storeIds: [],
  sessionId: 'session-1',
  accessScopes: ['TENANT'],
  assignedStoreIds: [],
};

function fixture(
  rowsByMarker: Record<string, unknown[]>,
  evidenceGateway?: {
    authorizeGet(input: { objectKey: string; maxBytes: number; expiresAt: string }): {
      downloadUrl: string;
      expiresAt: string;
    };
  },
) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    statements.push({ sql, values });
    const marker = Object.keys(rowsByMarker).find((candidate) => sql.includes(candidate));
    const rows = marker ? (rowsByMarker[marker] ?? []) : [];
    return { rows, rowCount: rows.length };
  });
  return {
    statements,
    service: createRevenueOperationsService(
      {
        connect: vi.fn(async () => ({ query, release: vi.fn() })),
      } as unknown as Pick<pg.Pool, 'connect'>,
      evidenceGateway,
    ),
  };
}

describe('revenue operations read model', () => {
  it('rejects store-only scope before opening a transaction', async () => {
    const fx = fixture({});
    const storeIdentity = { ...identity, accessScopes: ['STORE'] };
    await expect(fx.service.getSubscription(storeIdentity)).rejects.toBeInstanceOf(
      RevenueOperationsAuthorizationError,
    );
    expect(fx.statements).toHaveLength(0);
  });

  it('returns the current subscription and frozen entitlement snapshot fields', async () => {
    const fx = fixture({
      'FROM tenant_subscriptions subscription': [
        {
          id: 'subscription-1',
          plan_code: 'PRO_MONTHLY',
          plan_name: '专业版',
          billing_period: 'MONTH',
          list_price_cents: '29800',
          entitlements: { usage_limits: { token: { hard: 200000 } } },
          status: 'ACTIVE',
          starts_at: '2026-08-01T00:00:00.000Z',
          current_period_start: '2026-08-01T00:00:00.000Z',
          current_period_end: '2026-09-01T00:00:00.000Z',
          minimum_term_end: null,
          auto_renew: true,
          version: 2,
          updated_at: '2026-08-02T00:00:00.000Z',
        },
      ],
    });
    await expect(fx.service.getSubscription(identity)).resolves.toMatchObject({
      planCode: 'PRO_MONTHLY',
      listPriceCents: 29800,
      status: 'ACTIVE',
    });
  });

  it('derives the revenue summary only from frozen statement facts', async () => {
    const fx = fixture({
      'FROM revenue_distribution_statements': [
        {
          receipts: '10000',
          refunds: '1000',
          costs: '2000',
          distributable: '7000',
          statement_count: 2,
          attention_count: 1,
        },
      ],
    });
    await expect(fx.service.getSummary(identity, {})).resolves.toEqual({
      receiptCents: 10000,
      refundCents: 1000,
      directCostCents: 2000,
      distributableCents: 7000,
      statementCount: 2,
      attentionCount: 1,
    });
  });

  it('returns cost evidence presence without leaking its object key', async () => {
    const fx = fixture({
      'FROM direct_cost_catalog': [
        {
          cost_code: 'MODEL',
          cost_name: '模型成本',
          deductible: true,
          allocation_method: 'DIRECT_USAGE',
          description: '按量',
        },
      ],
      'FROM direct_cost_entries': [
        {
          id: 'cost-1',
          cost_code: 'MODEL',
          amount_cents: 200,
          has_evidence: true,
        },
      ],
    });
    const result = await fx.service.listCosts(identity, {});
    expect(result).toMatchObject({ entries: [{ has_evidence: true }] });
    expect(JSON.stringify(result)).not.toMatch(/object.?key/iu);
  });

  it('issues a short-lived bounded cost evidence URL only after scoped database access', async () => {
    const costEntryId = '18000000-0000-4000-8000-000000000008';
    const authorizeGet = vi.fn(({ expiresAt }) => ({
      downloadUrl: 'https://objects.invalid/evidence?signed=1',
      expiresAt,
    }));
    const fx = fixture(
      {
        'FROM direct_cost_entries cost': [
          {
            id: costEntryId,
            cost_code: 'MODEL',
            amount_cents: '200',
            service_period_start: '2026-08-01',
            service_period_end: '2026-08-31',
            supplier_ref: 'invoice-redacted',
            evidence_object_key: 'tenant/private/evidence.pdf',
          },
        ],
      },
      { authorizeGet },
    );
    const result = await fx.service.getCostEvidence(
      { ...identity, accessScopes: ['ASSIGNED'] },
      costEntryId,
      'trace-evidence',
    );
    expect(result).toMatchObject({
      id: costEntryId,
      amountCents: 200,
      downloadUrl: 'https://objects.invalid/evidence?signed=1',
    });
    expect(JSON.stringify(result)).not.toContain('object_key');
    expect(authorizeGet).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: 'tenant/private/evidence.pdf', maxBytes: 20_971_520 }),
    );
    expect(fx.statements.some(({ sql }) => sql.includes('distribution.cost_evidence.read'))).toBe(
      true,
    );
  });

  it('loads one statement with allocations, entries and dual-control approvals', async () => {
    const fx = fixture({
      'FROM revenue_distribution_statements': [
        {
          id: statementId,
          source_type: 'SUBSCRIPTION',
          source_id: 'source-1',
          subscription_id: 'subscription-1',
          policy_id: 'policy-1',
          period_start: '2026-08-01',
          period_end: '2026-08-31',
          actual_receipt_cents: '10000',
          refund_cents: '1000',
          direct_cost_cents: '2000',
          distributable_cents: '7000',
          status: 'LOCKED',
          locked_by: identity.userId,
          locked_at: '2026-09-01T00:00:00.000Z',
          version: 2,
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        },
      ],
      'FROM revenue_distribution_allocations': [{ id: 'allocation-1' }],
      'FROM revenue_distribution_entries entry': [{ id: 'entry-1' }],
      'FROM revenue_distribution_action_approvals': [{ id: 'approval-1' }],
    });
    await expect(fx.service.getStatement(identity, statementId)).resolves.toMatchObject({
      id: statementId,
      distributableCents: 7000,
      allocations: [{ id: 'allocation-1' }],
      entries: [{ id: 'entry-1' }],
      approvals: [{ id: 'approval-1' }],
    });
  });

  it('submits an owned revenue dispute with immutable idempotency evidence', async () => {
    const disputeId = '18000000-0000-4000-8000-000000000009';
    const fx = fixture({
      'FROM revenue_distribution_statements statement': [{ allowed: 1 }],
      'WHERE tenant_id=$1 AND requested_by=$2 AND idempotency_key=$3': [],
      'INSERT INTO revenue_distribution_disputes': [
        {
          id: disputeId,
          statement_id: statementId,
          cost_entry_id: null,
          dispute_type: 'REVENUE',
          reason_code: 'AMOUNT_MISMATCH',
          description: '实收金额与对账单不一致',
          status: 'OPEN',
          requested_by: identity.userId,
          resolved_by: null,
          resolution_code: null,
          resolution_note: null,
          created_at: '2026-08-19T00:00:00.000Z',
          updated_at: '2026-08-19T00:00:00.000Z',
          resolved_at: null,
        },
      ],
    });
    await expect(
      fx.service.createDispute({
        identity: { ...identity, accessScopes: ['ASSIGNED'] },
        idempotencyKey: 'dispute-1',
        traceId: 'trace-dispute',
        body: {
          statementId,
          disputeType: 'REVENUE',
          reasonCode: 'AMOUNT_MISMATCH',
          description: '实收金额与对账单不一致',
        },
      }),
    ).resolves.toMatchObject({ id: disputeId, status: 'OPEN' });
    expect(fx.statements.some(({ sql }) => sql.includes('distribution.dispute.submit'))).toBe(true);
  });

  it('rejects an idempotency key reused with a different dispute request', async () => {
    const fx = fixture({
      'FROM revenue_distribution_statements statement': [{ allowed: 1 }],
      'WHERE tenant_id=$1 AND requested_by=$2 AND idempotency_key=$3': [
        { request_hash: '0'.repeat(64) },
      ],
    });
    await expect(
      fx.service.createDispute({
        identity,
        idempotencyKey: 'reused',
        traceId: 'trace-dispute',
        body: {
          statementId,
          disputeType: 'REVENUE',
          reasonCode: 'AMOUNT_MISMATCH',
          description: 'different request',
        },
      }),
    ).rejects.toBeInstanceOf(RevenueOperationsConflictError);
  });
});
