import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createSubscriptionLifecycleService,
  SubscriptionLifecycleStateError,
} from './subscription-lifecycle-service.js';

const tenantId = '23000000-0000-4000-8000-000000000001';
const requesterId = '23000000-0000-4000-8000-000000000002';
const approverId = '23000000-0000-4000-8000-000000000003';
const contractId = '23000000-0000-4000-8000-000000000004';
const changeId = '23000000-0000-4000-8000-000000000005';
const subscriptionId = '23000000-0000-4000-8000-000000000006';
const previewId = '23000000-0000-4000-8000-000000000007';
const identity: AuthorizationContext = {
  tenantId,
  userId: requesterId,
  roleCodes: ['BUSINESS_DEVELOPER'],
  storeIds: [],
  sessionId: 'subscription-session',
  accessScopes: ['ASSIGNED'],
  assignedStoreIds: [],
};

function fixture(handler: (sql: string, values?: unknown[]) => unknown[]) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    statements.push({ sql, values });
    const rows = handler(sql, values);
    return { rows, rowCount: rows.length };
  });
  const client = { query, release: vi.fn() };
  return {
    statements,
    service: createSubscriptionLifecycleService({
      connect: vi.fn(async () => client),
    } as unknown as Pick<pg.Pool, 'connect'>),
  };
}

const command = (body: unknown, idempotencyKey = 'subscription-key') => ({
  identity,
  idempotencyKey,
  traceId: 'trace-subscription',
  body,
});

const changeRow = (overrides: Record<string, unknown> = {}) => ({
  id: changeId,
  contract_id: contractId,
  subscription_id: null,
  applied_subscription_id: null,
  change_type: 'ACTIVATE',
  requested_plan_code: 'MERCHANT_898',
  effective_at: '2026-08-19T00:00:00.000Z',
  reason_code: 'NEW_MERCHANT',
  status: 'PENDING',
  requested_by: requesterId,
  approved_by: null,
  decided_by: null,
  decision_reason_code: null,
  decided_at: null,
  applied_at: null,
  version: 1,
  created_at: '2026-08-19T00:00:00.000Z',
  updated_at: '2026-08-19T00:00:00.000Z',
  ...overrides,
});

describe('subscription lifecycle', () => {
  it('requests activation only after signed contract collections cover the exact contract', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT contract.id,contract.status'))
        return [
          {
            id: contractId,
            status: 'SIGNED',
            amount_cents: '89800',
            currency: 'CNY',
            plan_code: 'MERCHANT_898',
          },
        ];
      if (sql.startsWith('SELECT COALESCE(sum(amount_cents)'))
        return [{ collected_cents: '89800' }];
      if (sql.startsWith('SELECT 1 FROM plans')) return [{ '?column?': 1 }];
      if (sql.startsWith('SELECT id FROM tenant_subscriptions')) return [];
      if (sql.startsWith('INSERT INTO subscription_change_requests')) return [changeRow()];
      return [];
    });
    await expect(
      fx.service.requestChange(
        command({
          changeType: 'ACTIVATE',
          contractId,
          requestedPlanCode: 'MERCHANT_898',
          effectiveAt: '2026-08-19T08:00:00+08:00',
          reasonCode: 'NEW_MERCHANT',
        }),
      ),
    ).resolves.toMatchObject({ id: changeId, changeType: 'ACTIVATE', status: 'PENDING' });
    expect(
      fx.statements.find(({ sql }) => sql.startsWith('INSERT INTO subscription_change_requests'))
        ?.values,
    ).toEqual([
      tenantId,
      contractId,
      null,
      'ACTIVATE',
      'MERCHANT_898',
      '2026-08-19T08:00:00+08:00',
      'NEW_MERCHANT',
      requesterId,
    ]);
  });

  it('refuses activation when confirmed net collections are short', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT contract.id,contract.status'))
        return [
          {
            id: contractId,
            status: 'SIGNED',
            amount_cents: '89800',
            currency: 'CNY',
            plan_code: 'MERCHANT_898',
          },
        ];
      if (sql.startsWith('SELECT COALESCE(sum(amount_cents)'))
        return [{ collected_cents: '89799' }];
      return [];
    });
    await expect(
      fx.service.requestChange(
        command({
          changeType: 'ACTIVATE',
          contractId,
          requestedPlanCode: 'MERCHANT_898',
          effectiveAt: '2026-08-19T08:00:00+08:00',
          reasonCode: 'NEW_MERCHANT',
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriptionLifecycleStateError);
    expect(
      fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO subscription_change_requests')),
    ).toBe(false);
  });

  it('prevents the requester from approving their own subscription change', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      return [];
    });
    await expect(
      fx.service.decideChange(command({ changeId, decision: 'APPROVE' }, 'approve-own-change')),
    ).rejects.toBeInstanceOf(SubscriptionLifecycleStateError);
    const update = fx.statements.find(({ sql }) =>
      sql.startsWith('UPDATE subscription_change_requests SET status='),
    );
    expect(update?.values?.[3]).toBe(requesterId);
    expect(update?.sql).toContain('requested_by<>$4');
  });

  it('allows a different MFA-authorized actor to approve and records the decision', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('UPDATE subscription_change_requests SET status='))
        return [
          changeRow({
            status: 'APPROVED',
            effective_at: '2026-08-18T00:00:00.000Z',
            approved_by: approverId,
            decided_by: approverId,
            decided_at: '2026-08-19T01:00:00.000Z',
            version: 2,
          }),
        ];
      return [];
    });
    const approverIdentity = { ...identity, userId: approverId, roleCodes: ['MERCHANT_OWNER'] };
    await expect(
      fx.service.decideChange({
        identity: approverIdentity,
        idempotencyKey: 'approve-change',
        traceId: 'trace-approval',
        body: { changeId, decision: 'APPROVE' },
      }),
    ).resolves.toMatchObject({ status: 'APPROVED', approvedBy: approverId });
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
  });

  it('requires a durable reason for rejection before opening a transaction', () => {
    const fx = fixture(() => []);
    expect(() =>
      fx.service.decideChange(command({ changeId, decision: 'REJECT' }, 'reject-change')),
    ).toThrow(SubscriptionLifecycleStateError);
    expect(fx.statements).toHaveLength(0);
  });

  it('atomically applies activation, emits the frozen event and audits a system actor', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request.*,COALESCE'))
        return [
          changeRow({
            status: 'APPROVED',
            effective_at: '2026-08-18T00:00:00.000Z',
            approved_by: approverId,
            decided_by: approverId,
            decided_at: '2026-08-19T01:00:00.000Z',
            plan_code: 'MERCHANT_898',
            billing_period: 'YEAR',
          }),
        ];
      if (sql.startsWith('INSERT INTO tenant_subscriptions'))
        return [
          {
            id: subscriptionId,
            plan_code: 'MERCHANT_898',
            status: 'ACTIVE',
            current_period_start: '2026-08-19T00:00:00.000Z',
            current_period_end: '2027-08-19T00:00:00.000Z',
            version: 1,
          },
        ];
      if (sql.startsWith("UPDATE subscription_change_requests SET status='APPLIED'"))
        return [
          changeRow({
            status: 'APPLIED',
            approved_by: approverId,
            decided_by: approverId,
            decided_at: '2026-08-19T01:00:00.000Z',
            applied_subscription_id: subscriptionId,
            applied_at: '2026-08-19T02:00:00.000Z',
            version: 3,
          }),
        ];
      return [];
    });
    await expect(
      fx.service.applyApproved({ tenantId, changeId, traceId: 'trace-apply' }),
    ).resolves.toMatchObject({ status: 'APPLIED', appliedSubscriptionId: subscriptionId });
    expect(
      fx.statements.some(({ sql }) => sql.includes("'tenant.subscription_activated.v1'")),
    ).toBe(true);
    const audit = fx.statements.find(({ sql }) => sql.startsWith('INSERT INTO audit_logs'));
    expect(audit?.sql).toContain("'SYSTEM','subscription-lifecycle'");
  });

  it('does not repeat an already applied change or emit another event', async () => {
    const fx = fixture((sql) =>
      sql.startsWith('SELECT request.*,COALESCE')
        ? [
            changeRow({
              status: 'APPLIED',
              approved_by: approverId,
              decided_by: approverId,
              decided_at: '2026-08-19T01:00:00.000Z',
              applied_subscription_id: subscriptionId,
              applied_at: '2026-08-19T02:00:00.000Z',
            }),
          ]
        : [],
    );
    await expect(
      fx.service.applyApproved({ tenantId, changeId, traceId: 'trace-replay' }),
    ).resolves.toMatchObject({ status: 'APPLIED' });
    expect(
      fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO tenant_subscriptions')),
    ).toBe(false);
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO outbox_events'))).toBe(
      false,
    );
  });

  it('builds a structured renewal preview only from a READY monthly report', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT subscription.id,subscription.plan_code'))
        return [
          {
            id: subscriptionId,
            plan_code: 'MERCHANT_898',
            current_period_end: '2026-09-19T00:00:00.000Z',
            report_month: '2026-08-01',
            report_status: 'READY',
            metrics: { PAID_ORDERS: 12, AI_SESSIONS: 0 },
          },
        ];
      if (sql.startsWith('INSERT INTO renewal_previews'))
        return [
          {
            id: previewId,
            subscription_id: subscriptionId,
            report_month: '2026-08-01',
            metrics_snapshot: { PAID_ORDERS: 12, AI_SESSIONS: 0 },
            issue_snapshot: [{ metricCode: 'AI_SESSIONS', reasonCode: 'NO_RECORDED_ACTIVITY' }],
            recommended_plan_code: 'MERCHANT_898',
            recommendation_reason: 'CONTINUE_CURRENT_PLAN',
            status: 'READY',
            due_at: '2026-09-19T00:00:00.000Z',
            generated_at: '2026-08-19T00:00:00.000Z',
            updated_at: '2026-08-19T00:00:00.000Z',
          },
        ];
      return [];
    });
    await expect(
      fx.service.generatePreview(
        command({ subscriptionId, reportMonth: '2026-08-01' }, 'generate-renewal-preview'),
      ),
    ).resolves.toMatchObject({
      id: previewId,
      metricsSnapshot: { PAID_ORDERS: 12, AI_SESSIONS: 0 },
      issueSnapshot: [{ metricCode: 'AI_SESSIONS', reasonCode: 'NO_RECORDED_ACTIVITY' }],
    });
  });
});
