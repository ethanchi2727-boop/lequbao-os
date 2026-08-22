import { describe, expect, it, vi } from 'vitest';
import { createCommerceVerificationService } from './commerce-verification-service.js';
import { createVerificationToken } from './verification-token.js';

const tenantId = '4e000000-0000-4000-8000-000000000001';
const customerId = '4e000000-0000-4000-8000-000000000002';
const storeId = '4e000000-0000-4000-8000-000000000003';
const otherStoreId = '4e000000-0000-4000-8000-000000000004';
const orderId = '4e000000-0000-4000-8000-000000000005';
const entitlementId = '4e000000-0000-4000-8000-000000000006';
const useId = '4e000000-0000-4000-8000-000000000007';
const userId = '4e000000-0000-4000-8000-000000000008';
const platformAccountId = '4e000000-0000-4000-8000-000000000009';
const secret = 'verification-token-secret-with-at-least-thirty-two-bytes';
const validUntil = '2027-08-18T09:00:00.000Z';
const token = createVerificationToken(secret, {
  entitlementId,
  tenantId,
  orderId,
  generation: 1,
  validUntil,
});

const consumer = {
  tenantId,
  customerId,
  storeId,
  sessionId: 'consumer-verification-session',
  authLevel: 'PHONE_BOUND' as const,
};
const staff = {
  tenantId,
  userId,
  roleCodes: ['VERIFIER'],
  storeIds: [storeId],
  sessionId: 'verifier-session',
  authLevel: 'MFA' as const,
  accessScopes: ['TENANT'],
  assignedStoreIds: [],
};
type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

function fixture() {
  let inserted = false;
  let storedTokenDigest = '';
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT entitlement.id,entitlement.order_id'))
      return result([
        {
          id: entitlementId,
          order_id: orderId,
          customer_id: customerId,
          token_generation: 1,
          total_uses: 2,
          used_uses: inserted ? 1 : 0,
          status: inserted ? 'PARTIALLY_USED' : 'AVAILABLE',
          valid_from: '2026-08-18T09:00:00.000Z',
          valid_until: validUntil,
        },
      ]);
    if (sql.startsWith('SELECT entitlement_id,store_id,quantity,token_digest'))
      return inserted
        ? result([
            {
              entitlement_id: entitlementId,
              store_id: storeId,
              quantity: 1,
              token_digest: storedTokenDigest,
            },
          ])
        : result();
    if (sql.startsWith('SELECT id,order_id,allowed_store_ids,status'))
      return result([
        {
          id: entitlementId,
          order_id: orderId,
          allowed_store_ids: [storeId],
          status: 'AVAILABLE',
        },
      ]);
    if (sql.startsWith('INSERT INTO verification_uses')) {
      inserted = true;
      storedTokenDigest = String(values?.[7]);
      return result([], 1);
    }
    if (sql.startsWith('SELECT count(*) FILTER'))
      return result([{ available_count: 0, partially_used_count: 1, total_count: 1 }]);
    if (sql.startsWith('SELECT use.id AS verification_use_id'))
      return result([
        {
          verification_use_id: useId,
          entitlement_id: entitlementId,
          order_id: orderId,
          store_id: storeId,
          quantity: 1,
          remaining_uses: 1,
          status: 'PARTIALLY_USED',
          used_at: '2026-08-18T09:05:00.000Z',
        },
      ]);
    return result([], 1);
  });
  const service = createCommerceVerificationService({
    pool: { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
    verificationTokenSecret: secret,
  });
  return { query, service };
}

describe('verification entitlement security and idempotency', () => {
  it('issues an opaque token that does not reveal the order or tenant identifier', async () => {
    const fx = fixture();
    const [credential] = await fx.service.listConsumerTokens(consumer, orderId);
    expect(credential?.verificationToken).toBe(token);
    expect(token).not.toContain(orderId);
    expect(token).not.toContain(tenantId);
    expect(token).toMatch(/^lqv1\.[A-Za-z0-9_-]+$/u);
  });

  it('lists only usable merchant-mini-program vouchers in the current customer/store scope', async () => {
    const fx = fixture();
    await expect(fx.service.listAvailableForConsumer(consumer)).resolves.toEqual([
      expect.objectContaining({ entitlementId, orderId, remainingUses: 2 }),
    ]);
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("orders.source_channel='MERCHANT_MINI_PROGRAM'"),
      [tenantId, customerId, storeId],
    );
  });

  it('revalidates the platform session and active merchant link before signing a token', async () => {
    const fx = fixture();
    await fx.service.listPlatformTokens({
      identity: {
        accountId: platformAccountId,
        sessionId: 'platform-verification-session',
        authLevel: 'PHONE_BOUND',
      },
      tenantId,
      customerId,
      storeId,
      orderId,
    });
    const validation = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM platform_consumer_sessions'),
    );
    expect(validation?.[1]).toEqual([
      'platform-verification-session',
      platformAccountId,
      tenantId,
      customerId,
    ]);
  });

  it('VER-001 returns the first use for an exact idempotent replay and inserts once', async () => {
    const fx = fixture();
    const command = {
      identity: staff,
      idempotencyKey: 'verification-use-1',
      traceId: 'trace-verification-use-1',
      body: { verificationToken: token, storeId, quantity: 1 },
    };
    const first = await fx.service.use(command);
    const replay = await fx.service.use(command);
    expect(replay).toEqual(first);
    expect(
      fx.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO verification_uses')),
    ).toHaveLength(1);
  });

  it('VER-002 rejects a valid entitlement at a different store without changing uses', async () => {
    const fx = fixture();
    await expect(
      fx.service.use({
        identity: staff,
        idempotencyKey: 'verification-wrong-store',
        traceId: 'trace-verification-wrong-store',
        body: { verificationToken: token, storeId: otherStoreId, quantity: 1 },
      }),
    ).rejects.toThrow('store is not allowed');
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO verification_uses')),
    ).toBe(false);
  });

  it('VER-003 blocks a high-risk device before a use record and exposes no order plaintext', async () => {
    const fx = fixture();
    await expect(
      fx.service.use({
        identity: staff,
        idempotencyKey: 'verification-blocked-device',
        traceId: 'trace-verification-blocked-device',
        body: { verificationToken: token, storeId, quantity: 1, deviceRiskLevel: 'BLOCKED' },
      }),
    ).rejects.toThrow('device is blocked');
    expect(JSON.stringify(fx.query.mock.calls)).not.toContain(token);
  });
});
