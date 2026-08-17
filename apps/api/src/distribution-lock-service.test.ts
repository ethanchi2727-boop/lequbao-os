import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  ProvisionalCostError,
  createDistributionLockService,
} from './distribution-lock-service.js';

const command = {
  tenantId: '60000000-0000-4000-8000-000000000001',
  idempotencyKey: 'lock:subscription-2:2026-08',
  traceId: 'trace-lock-1',
  body: {
    subscriptionId: '60000000-0000-4000-8000-000000000002',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    lockedBy: '60000000-0000-4000-8000-000000000003',
  },
};

describe('distribution lock service', () => {
  it('derives trusted amounts and commits exact allocations, accruals, audit and outbox together', async () => {
    const statements: string[] = [];
    let allocationSequence = 0;
    const client = {
      async query(sql: string) {
        const normalized = sql.replace(/\s+/gu, ' ').trim();
        statements.push(normalized);
        if (sql.includes('INSERT INTO idempotency_keys'))
          return { rowCount: 1, rows: [{ id: 'reservation' }] };
        if (sql.includes('SELECT id FROM tenant_subscriptions'))
          return { rowCount: 1, rows: [{ id: command.body.subscriptionId }] };
        if (sql.includes('FROM subscription_cash_ledger_entries'))
          return { rowCount: 1, rows: [{ receipt_cents: '1000', refund_cents: '100' }] };
        if (sql.includes('FROM direct_cost_entries'))
          return { rowCount: 1, rows: [{ total_cents: '100', has_provisional: false }] };
        if (sql.includes('FROM revenue_share_policies')) {
          return {
            rowCount: 1,
            rows: [{ id: '60000000-0000-4000-8000-000000000004', policy_version: 1 }],
          };
        }
        if (sql.includes('FROM revenue_share_policy_splits')) {
          return {
            rowCount: 3,
            rows: [
              { beneficiary_role: 'ORIGINATING_BUSINESS', share_bps: 7000 },
              { beneficiary_role: 'SHANGZHI', share_bps: 1000 },
              { beneficiary_role: 'LEQU_LIFE', share_bps: 2000 },
            ],
          };
        }
        if (sql.includes('FROM merchant_profiles merchant')) {
          return {
            rowCount: 2,
            rows: [
              {
                right_holder_id: '60000000-0000-4000-8000-000000000005',
                beneficiary_id: '60000000-0000-4000-8000-000000000006',
                share_bps: 4000,
              },
              {
                right_holder_id: '60000000-0000-4000-8000-000000000007',
                beneficiary_id: '60000000-0000-4000-8000-000000000008',
                share_bps: 3000,
              },
            ],
          };
        }
        if (sql.includes('FROM revenue_beneficiaries')) {
          return {
            rowCount: 2,
            rows: [
              { id: '60000000-0000-4000-8000-000000000009', beneficiary_type: 'SHANGZHI_ENTITY' },
              { id: '60000000-0000-4000-8000-000000000010', beneficiary_type: 'LEQU_LIFE_ENTITY' },
            ],
          };
        }
        if (sql.includes('INSERT INTO revenue_distribution_statements')) {
          return { rowCount: 1, rows: [{ id: '60000000-0000-4000-8000-000000000011' }] };
        }
        if (sql.includes('INSERT INTO revenue_distribution_allocations')) {
          allocationSequence += 1;
          return {
            rowCount: 1,
            rows: [
              { id: `60000000-0000-4000-8000-${String(allocationSequence).padStart(12, '0')}` },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
    const service = createDistributionLockService({
      connect: async () => client,
    } as unknown as Pick<pg.Pool, 'connect'>);

    const result = await service.lock(command);
    expect(result).toMatchObject({
      status: 'LOCKED',
      actualReceiptMinorUnits: '1000',
      refundMinorUnits: '100',
      directCostMinorUnits: '100',
      distributableMinorUnits: '800',
    });
    expect(result.allocations.map((allocation) => allocation.allocatedMinorUnits)).toEqual([
      '320',
      '240',
      '80',
      '160',
    ]);
    expect(
      statements.filter((sql) => sql.includes('INSERT INTO revenue_distribution_entries')),
    ).toHaveLength(4);
    expect(statements.some((sql) => sql.includes('distribution.statement_locked.v1'))).toBe(true);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('rolls back before policy or allocation when any cost is still provisional', async () => {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.replace(/\s+/gu, ' ').trim());
        if (sql.includes('INSERT INTO idempotency_keys')) return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT id FROM tenant_subscriptions'))
          return { rowCount: 1, rows: [{ id: command.body.subscriptionId }] };
        if (sql.includes('FROM subscription_cash_ledger_entries'))
          return { rowCount: 1, rows: [{ receipt_cents: '1000', refund_cents: '0' }] };
        if (sql.includes('FROM direct_cost_entries'))
          return { rowCount: 1, rows: [{ total_cents: '100', has_provisional: true }] };
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
    const service = createDistributionLockService({
      connect: async () => client,
    } as unknown as Pick<pg.Pool, 'connect'>);

    await expect(service.lock(command)).rejects.toBeInstanceOf(ProvisionalCostError);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some((sql) => sql.includes('FROM revenue_share_policies'))).toBe(false);
  });
});
