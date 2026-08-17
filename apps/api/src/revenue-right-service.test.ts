import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { IdempotencyConflictError, createRevenueRightService } from './revenue-right-service.js';

const command = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  merchantProfileId: '00000000-0000-4000-8000-000000000002',
  idempotencyKey: 'original-right:merchant-2',
  traceId: 'trace-1',
  body: {
    sourceContractRef: 'contract-2',
    startsAt: '2026-08-17T12:00:00+08:00',
    createdBy: '00000000-0000-4000-8000-000000000003',
    evidence: { objectKey: 'contracts/2.pdf' },
    holders: [
      { beneficiaryId: '00000000-0000-4000-8000-000000000004', shareBps: 4000 },
      { beneficiaryId: '00000000-0000-4000-8000-000000000005', shareBps: 3000 },
    ],
  },
};

describe('revenue right service', () => {
  it('commits the active right, outbox event, audit and idempotent response atomically', async () => {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.replace(/\s+/gu, ' ').trim());
        if (sql.includes('INSERT INTO idempotency_keys'))
          return { rowCount: 1, rows: [{ id: 'reservation' }] };
        if (sql.includes('FROM revenue_beneficiaries')) {
          return {
            rowCount: 2,
            rows: [
              { id: command.body.holders[0]!.beneficiaryId },
              { id: command.body.holders[1]!.beneficiaryId },
            ],
          };
        }
        if (sql.includes('INSERT INTO merchant_revenue_right_groups')) {
          return { rowCount: 1, rows: [{ id: '00000000-0000-4000-8000-000000000006' }] };
        }
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
    const service = createRevenueRightService({
      connect: async () => client,
    } as unknown as Pick<pg.Pool, 'connect'>);

    await expect(service.create(command)).resolves.toMatchObject({
      status: 'ACTIVE',
      holders: command.body.holders,
    });
    expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.some((sql) => sql.includes('INSERT INTO outbox_events'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(statements.some((sql) => sql.includes("resource_type = 'revenue_right_group'"))).toBe(
      true,
    );
    expect(statements).not.toContain('ROLLBACK');
  });

  it('rolls back when the same idempotency key is reused with another request', async () => {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.replace(/\s+/gu, ' ').trim());
        if (sql.includes('INSERT INTO idempotency_keys')) return { rowCount: 0, rows: [] };
        if (sql.includes('SELECT request_hash')) {
          return { rowCount: 1, rows: [{ request_hash: 'different', response_body: null }] };
        }
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
    const service = createRevenueRightService({
      connect: async () => client,
    } as unknown as Pick<pg.Pool, 'connect'>);

    await expect(service.create(command)).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some((sql) => sql.includes('INSERT INTO outbox_events'))).toBe(false);
  });
});
