import { describe, expect, it, vi } from 'vitest';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import {
  PlatformOrderQueryAuthenticationError,
  PlatformOrderQueryNotFoundError,
  createPlatformOrderQueryService,
} from './platform-order-query-service.js';

const identity: LifeConsumerSessionIdentity = {
  accountId: '55000000-0000-4000-8000-000000000001',
  sessionId: 'life-session-orders',
  authLevel: 'PHONE_BOUND',
};
const tenantA = '55000000-0000-4000-8000-000000000002';
const tenantB = '55000000-0000-4000-8000-000000000003';
const customerA = '55000000-0000-4000-8000-000000000004';
const customerB = '55000000-0000-4000-8000-000000000005';
const orderA = '55000000-0000-4000-8000-000000000006';

function order(tenant: string, id: string, createdAt: string) {
  return {
    id,
    order_no: `ORDER-${id.slice(-2)}`,
    store_id: '55000000-0000-4000-8000-000000000007',
    store_name: tenant === tenantA ? '门店 A' : '门店 B',
    source_channel: 'LEQU_LIFE',
    order_type: 'PHYSICAL_DELIVERY',
    status: 'PAID',
    payment_status: 'PAID',
    fulfillment_status: 'PREPARING',
    verification_status: 'NOT_APPLICABLE',
    aftercare_status: 'NONE',
    payable_amount_cents: '3990',
    paid_amount_cents: '3990',
    refunded_amount_cents: '0',
    currency: 'CNY',
    created_at: createdAt,
    updated_at: createdAt,
    merchant_tenant_id: tenant,
  };
}

function fixture(options: { activeSession?: boolean; findOrder?: boolean } = {}) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, ...(values ? { values } : {}) });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT set_config')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM platform_consumer_sessions'))
      return options.activeSession === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (sql.includes('FROM platform_consumer_tenant_links'))
      return {
        rows: [
          { merchant_tenant_id: tenantA, customer_id: customerA },
          { merchant_tenant_id: tenantB, customer_id: customerB },
        ],
        rowCount: 2,
      };
    if (sql.includes('FROM orders') && sql.includes('orders.id=$3')) {
      if (values?.[0] === tenantA && options.findOrder !== false)
        return { rows: [order(tenantA, orderA, '2026-08-18T10:00:00.000Z')], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('FROM orders')) {
      const row =
        values?.[0] === tenantA
          ? order(tenantA, orderA, '2026-08-18T10:00:00.000Z')
          : order(tenantB, '55000000-0000-4000-8000-000000000016', '2026-08-19T10:00:00.000Z');
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('FROM order_items'))
      return {
        rows: [
          {
            id: '55000000-0000-4000-8000-000000000008',
            product_id: '55000000-0000-4000-8000-000000000009',
            variant_id: '55000000-0000-4000-8000-000000000010',
            title_snapshot: '下单时商品标题',
            quantity: 1,
            unit_price_cents: '3990',
            line_amount_cents: '3990',
            refunded_quantity: 0,
            refunded_amount_cents: '0',
          },
        ],
        rowCount: 1,
      };
    return { rows: [], rowCount: 0 };
  });
  const service = createPlatformOrderQueryService({
    connect: vi.fn(async () => ({ query, release: vi.fn() })) as never,
  });
  return { service, queries };
}

describe('platform consumer order query', () => {
  it('merges linked-merchant orders by time without accepting a client tenant id', async () => {
    const { service, queries } = fixture();
    const orders = (await service.list(identity, { status: 'PAID', limit: 10 })) as Array<{
      merchantTenantId: string;
    }>;
    expect(orders.map((item) => item.merchantTenantId)).toEqual([tenantB, tenantA]);
    const reads = queries.filter(({ sql }) => sql.includes('FROM orders'));
    expect(reads.map(({ values }) => values?.slice(0, 3))).toEqual([
      [tenantA, customerA, 'PAID'],
      [tenantB, customerB, 'PAID'],
    ]);
  });

  it('finds an order only through an active account-to-tenant customer link', async () => {
    const { service } = fixture();
    await expect(service.get(identity, orderA)).resolves.toMatchObject({
      id: orderA,
      merchantTenantId: tenantA,
      items: [expect.objectContaining({ title: '下单时商品标题' })],
    });
  });

  it('returns the same not-found result when no linked tenant owns the order', async () => {
    const { service } = fixture({ findOrder: false });
    await expect(service.get(identity, orderA)).rejects.toBeInstanceOf(
      PlatformOrderQueryNotFoundError,
    );
  });

  it('rejects revoked platform sessions before reading tenant links', async () => {
    const { service, queries } = fixture({ activeSession: false });
    await expect(service.list(identity, {})).rejects.toBeInstanceOf(
      PlatformOrderQueryAuthenticationError,
    );
    expect(queries.some(({ sql }) => sql.includes('platform_consumer_tenant_links'))).toBe(false);
  });
});
