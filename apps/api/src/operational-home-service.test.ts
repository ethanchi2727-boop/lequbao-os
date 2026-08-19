import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createOperationalHomeService,
  OperationalHomeAuthorizationError,
} from './operational-home-service.js';

const identity = {
  tenantId: '29000000-0000-4000-8000-000000000001',
  userId: '29000000-0000-4000-8000-000000000002',
  accessScopes: ['ASSIGNED'],
  assignedStoreIds: ['29000000-0000-4000-8000-000000000003'],
} as AuthorizationContext;

function fixture(row: Record<string, unknown>) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    statements.push(values ? { sql, values } : { sql });
    return sql.startsWith('WITH context')
      ? { rows: [row], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  });
  return {
    statements,
    service: createOperationalHomeService({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as unknown as Pick<pg.Pool, 'connect'>),
  };
}

describe('operational home service', () => {
  it('aggregates only assigned-store work and emits server-owned drill-down routes', async () => {
    const fx = fixture({
      timezone: 'Asia/Shanghai',
      day_start: '2026-08-18T16:00:00.000Z',
      day_end: '2026-08-19T16:00:00.000Z',
      orders_created: '5',
      paid_amount_cents: '9900',
      fulfillment_count: '2',
      refund_count: '1',
      handoff_count: '3',
      delivery_exception_count: '0',
      agent_attention_count: '1',
      notification_count: '0',
    });
    const result = await fx.service.getToday(identity);
    expect(result).toMatchObject({
      timezone: 'Asia/Shanghai',
      storeScope: 'ASSIGNED',
      metrics: { ordersCreated: 5, paidAmountCents: 9900, customerHandoffs: 3 },
      todos: [
        { kind: 'CUSTOMER_HANDOFF', count: 3, route: '/bao/page-099?status=HUMAN_QUEUED' },
        { kind: 'REFUND', count: 1 },
        { kind: 'FULFILLMENT', count: 2 },
        { kind: 'AGENT_ATTENTION', count: 1 },
      ],
    });
    const aggregate = fx.statements.find(({ sql }) => sql.startsWith('WITH context'));
    expect(aggregate?.values?.[1]).toEqual(identity.assignedStoreIds);
    expect(aggregate?.values?.[2]).toBe(identity.userId);
  });

  it('allows tenant scope without inventing a client-selected store list', async () => {
    const fx = fixture({
      timezone: 'Asia/Shanghai',
      day_start: '2026-08-18T16:00:00.000Z',
      day_end: '2026-08-19T16:00:00.000Z',
    });
    await expect(
      fx.service.getToday({ ...identity, accessScopes: ['TENANT'] }),
    ).resolves.toMatchObject({
      storeScope: 'TENANT',
    });
    expect(fx.statements.find(({ sql }) => sql.startsWith('WITH context'))?.values?.[1]).toBeNull();
  });

  it('fails closed when access-control scope is absent', async () => {
    const fx = fixture({});
    await expect(
      fx.service.getToday({ tenantId: identity.tenantId, userId: identity.userId } as never),
    ).rejects.toBeInstanceOf(OperationalHomeAuthorizationError);
    expect(fx.statements).toHaveLength(0);
  });
});
