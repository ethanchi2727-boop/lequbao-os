import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformPaymentService,
  PlatformPaymentAuthenticationError,
  PlatformPaymentOrderNotFoundError,
} from './platform-payment-service.js';

const accountId = '7d000000-0000-4000-8000-000000000001';
const tenantId = '7d000000-0000-4000-8000-000000000002';
const customerId = '7d000000-0000-4000-8000-000000000003';
const storeId = '7d000000-0000-4000-8000-000000000004';
const orderId = '7d000000-0000-4000-8000-000000000005';
const identity = { accountId, sessionId: 'life-pay-session', authLevel: 'PHONE_BOUND' as const };
const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount });

function fixture(options: { session?: boolean; order?: boolean } = {}) {
  const query = vi.fn(async (rawSql: string) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions'))
      return options.session === false ? result() : result([{ ok: true }]);
    if (sql.startsWith('SELECT merchant_tenant_id,customer_id'))
      return result([{ merchant_tenant_id: tenantId, customer_id: customerId }]);
    if (sql.startsWith('SELECT store_id FROM orders'))
      return options.order === false ? result() : result([{ store_id: storeId }]);
    return result();
  });
  const createPlatformIntent = vi.fn().mockResolvedValue({ id: 'payment-intent' });
  return {
    createPlatformIntent,
    service: createPlatformPaymentService(
      { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
      { createPlatformIntent },
    ),
  };
}

describe('platform merchant-direct payment boundary', () => {
  it('derives tenant, customer and store from active platform links instead of client input', async () => {
    const fx = fixture();
    await expect(
      fx.service.create({
        identity,
        idempotencyKey: 'life-payment-1',
        traceId: 'trace-life-payment-1',
        body: { orderId, provider: 'WECHAT_PAY', merchantTenantId: 'attacker' },
      }),
    ).resolves.toEqual({ id: 'payment-intent' });
    expect(fx.createPlatformIntent).toHaveBeenCalledWith({
      identity,
      merchantTenantId: tenantId,
      customerId,
      storeId,
      idempotencyKey: 'life-payment-1',
      traceId: 'trace-life-payment-1',
      body: { orderId, provider: 'WECHAT_PAY' },
    });
  });

  it('rejects a revoked platform session before resolving an order', async () => {
    const fx = fixture({ session: false });
    await expect(
      fx.service.create({
        identity,
        idempotencyKey: 'pay-auth',
        traceId: 'trace',
        body: { orderId, provider: 'WECHAT_PAY' },
      }),
    ).rejects.toBeInstanceOf(PlatformPaymentAuthenticationError);
  });

  it('does not reveal whether an order exists outside active merchant links', async () => {
    const fx = fixture({ order: false });
    await expect(
      fx.service.create({
        identity,
        idempotencyKey: 'pay-missing',
        traceId: 'trace',
        body: { orderId, provider: 'WECHAT_PAY' },
      }),
    ).rejects.toBeInstanceOf(PlatformPaymentOrderNotFoundError);
  });
});
