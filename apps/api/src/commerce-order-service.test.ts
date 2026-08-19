import { describe, expect, it, vi } from 'vitest';
import {
  CommerceInventoryUnavailableError,
  createCommerceOrderService,
} from './commerce-order-service.js';

const tenantId = '4b000000-0000-4000-8000-000000000001';
const customerId = '4b000000-0000-4000-8000-000000000002';
const storeId = '4b000000-0000-4000-8000-000000000003';
const productId = '4b000000-0000-4000-8000-000000000004';
const variantId = '4b000000-0000-4000-8000-000000000005';
const orderId = '4b000000-0000-4000-8000-000000000006';
const orderItemId = '4b000000-0000-4000-8000-000000000007';

const consumer = {
  tenantId,
  customerId,
  storeId,
  sessionId: 'consumer-commerce-session',
  authLevel: 'PHONE_BOUND' as const,
};

type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

function createFixture(options: { available?: number } = {}) {
  let createdOrderId = orderId;
  let createdOrderNo = 'LQORDER';
  let createdExpiresAt = '2026-08-18T06:15:00.000Z';
  let status = 'PENDING_PAYMENT';
  let paymentStatus = 'UNPAID';
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT id FROM orders')) return result([{ id: orderId }]);
    if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'idempotency' }]);
    if (sql.startsWith('SELECT variant.id AS variant_id'))
      return result([
        {
          variant_id: variantId,
          product_id: productId,
          product_type: 'GROUP_BUY',
          product_title: '双人套餐',
          store_id: storeId,
          unit_price_cents: 500,
          on_hand: options.available ?? 5,
          reserved: 0,
          reward_rule_snapshot: {
            amount_cents: 25,
            version: '7',
            funding_source: 'MERCHANT',
          },
        },
      ]);
    if (sql.startsWith('INSERT INTO orders')) {
      createdOrderId = String(values?.[0]);
      createdOrderNo = String(values?.[2]);
      createdExpiresAt = String(values?.[9]);
      return result([], 1);
    }
    if (sql.startsWith('INSERT INTO order_items')) return result([], 1);
    if (sql.startsWith('INSERT INTO inventory_ledger')) return result([], 1);
    if (sql.startsWith("UPDATE orders SET status='CANCELLED'")) {
      status = 'CANCELLED';
      paymentStatus = 'FAILED';
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,order_no,store_id,customer_id'))
      return result([
        {
          id: createdOrderId,
          order_no: createdOrderNo,
          store_id: storeId,
          customer_id: customerId,
          source_channel: 'MERCHANT_MINI_PROGRAM',
          order_type: 'GROUP_BUY',
          status,
          payment_status: paymentStatus,
          fulfillment_status: 'NOT_STARTED',
          verification_status: 'PENDING',
          aftercare_status: 'NONE',
          goods_amount_cents: 1000,
          discount_amount_cents: 0,
          payable_amount_cents: 1000,
          paid_amount_cents: 0,
          refunded_amount_cents: 0,
          currency: 'CNY',
          expires_at: createdExpiresAt,
          version: status === 'CANCELLED' ? 2 : 1,
        },
      ]);
    if (sql.startsWith('SELECT id,product_id,variant_id'))
      return result([
        {
          id: orderItemId,
          product_id: productId,
          variant_id: variantId,
          title_snapshot: '双人套餐',
          quantity: 2,
          unit_price_cents: 500,
          line_amount_cents: 1000,
          refunded_quantity: 0,
        },
      ]);
    return result();
  });
  const client = { query, release: vi.fn() };
  return {
    query,
    service: createCommerceOrderService({ connect: vi.fn(async () => client) } as never),
  };
}

describe('commerce order and inventory', () => {
  it('ORD-001 prices on the server and reserves order inventory in the same transaction', async () => {
    const fx = createFixture();
    const response = await fx.service.create({
      identity: consumer,
      idempotencyKey: 'order-create-1',
      traceId: 'trace-order-create-1',
      body: {
        storeId,
        sourceChannel: 'MERCHANT_MINI_PROGRAM',
        orderType: 'GROUP_BUY',
        payableAmountCents: 1,
        items: [{ variantId, quantity: 2, unitPriceCents: 1 }],
      },
    });
    expect(response.payableAmountCents).toBe(1000);
    const orderInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO orders'),
    );
    expect(orderInsert?.[1]?.[8]).toBe(1000);
    expect(JSON.stringify(orderInsert?.[1])).not.toContain('"1"');
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("'RESERVE'"),
      expect.arrayContaining([tenantId, variantId, 2]),
    );
    const itemInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO order_items'),
    );
    expect(String(itemInsert?.[0])).toContain('reward_rule_snapshot');
    expect(itemInsert?.[1]?.[9]).toBe(
      JSON.stringify({ amount_cents: 25, version: '7', funding_source: 'MERCHANT' }),
    );
    expect(
      fx.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes('LEFT JOIN LATERAL') &&
          String(sql).includes("trigger_code='ORDER_PAID'") &&
          String(sql).includes('product.reward_rule_snapshot'),
      ),
    ).toBe(true);
    const beginIndex = fx.query.mock.calls.findIndex(([sql]) => sql === 'BEGIN');
    const commitIndex = fx.query.mock.calls.findIndex(([sql]) => sql === 'COMMIT');
    const orderIndex = fx.query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('INSERT INTO orders'),
    );
    const reserveIndex = fx.query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('INSERT INTO inventory_ledger'),
    );
    expect(beginIndex).toBeLessThan(orderIndex);
    expect(orderIndex).toBeLessThan(reserveIndex);
    expect(reserveIndex).toBeLessThan(commitIndex);
  });

  it('ORD-002 rejects a request above sellable inventory before creating an order', async () => {
    const fx = createFixture({ available: 1 });
    await expect(
      fx.service.create({
        identity: consumer,
        idempotencyKey: 'order-create-insufficient',
        traceId: 'trace-order-insufficient',
        body: {
          storeId,
          sourceChannel: 'MERCHANT_MINI_PROGRAM',
          orderType: 'GROUP_BUY',
          items: [{ variantId, quantity: 2 }],
        },
      }),
    ).rejects.toBeInstanceOf(CommerceInventoryUnavailableError);
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO orders'))).toBe(
      false,
    );
  });

  it('lists only the current customer and store merchant-mini-program orders', async () => {
    const fx = createFixture();
    await expect(
      fx.service.listForConsumer(consumer, { status: 'PENDING_PAYMENT' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: orderId, sourceChannel: 'MERCHANT_MINI_PROGRAM' }),
    ]);
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("source_channel='MERCHANT_MINI_PROGRAM'"),
      [tenantId, customerId, storeId, 'PENDING_PAYMENT', 30],
    );
  });

  it('ORD-003 releases an expired order reservation once and closes pending payment intents', async () => {
    let status = 'PENDING_PAYMENT';
    const query = vi.fn(async (rawSql: string) => {
      const sql = rawSql.replace(/\s+/gu, ' ').trim();
      if (sql.startsWith('SELECT status,expires_at,inventory_released_at'))
        return result([
          { status, expires_at: '2020-01-01T00:00:00.000Z', inventory_released_at: null },
        ]);
      if (sql.startsWith('SELECT variant_id,sum(quantity)'))
        return result([{ variant_id: variantId, quantity: 2 }]);
      if (sql.startsWith("UPDATE orders SET status='CANCELLED'")) {
        status = 'CANCELLED';
        return result([], 1);
      }
      if (sql.startsWith('SELECT id,order_no,store_id,customer_id'))
        return result([
          {
            id: orderId,
            order_no: 'LQEXPIRED',
            store_id: storeId,
            customer_id: customerId,
            source_channel: 'MERCHANT_MINI_PROGRAM',
            order_type: 'GROUP_BUY',
            status,
            payment_status: status === 'CANCELLED' ? 'FAILED' : 'UNPAID',
            fulfillment_status: 'NOT_STARTED',
            verification_status: 'PENDING',
            aftercare_status: 'NONE',
            goods_amount_cents: 1000,
            discount_amount_cents: 0,
            payable_amount_cents: 1000,
            paid_amount_cents: 0,
            refunded_amount_cents: 0,
            currency: 'CNY',
            expires_at: '2020-01-01T00:00:00.000Z',
            version: 2,
          },
        ]);
      if (sql.startsWith('SELECT id,product_id,variant_id')) return result([]);
      return result();
    });
    const service = createCommerceOrderService({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never);
    await expect(service.expire({ tenantId, orderId, traceId: 'trace-expire' })).resolves.toEqual(
      expect.objectContaining({ status: 'CANCELLED', paymentStatus: 'FAILED' }),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("'RELEASE'"), [
      tenantId,
      variantId,
      2,
      orderId,
      `order-expire:${orderId}:${variantId}`,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='EXPIRED'"), [
      tenantId,
      orderId,
    ]);
  });
});
