import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformAftercareService,
  PlatformAftercareAuthenticationError,
  PlatformAftercareOrderNotFoundError,
} from './platform-aftercare-service.js';

const accountId = '7e000000-0000-4000-8000-000000000001';
const tenantId = '7e000000-0000-4000-8000-000000000002';
const customerId = '7e000000-0000-4000-8000-000000000003';
const storeId = '7e000000-0000-4000-8000-000000000004';
const orderId = '7e000000-0000-4000-8000-000000000005';
const identity = { accountId, sessionId: 'life-aftercare', authLevel: 'PHONE_BOUND' as const };
const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount });

function fixture(options: { activeSession?: boolean; order?: boolean } = {}) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    queries.push({ sql, ...(values ? { values } : {}) });
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions'))
      return options.activeSession === false ? result() : result([{ ok: true }]);
    if (sql.startsWith('SELECT merchant_tenant_id,customer_id'))
      return result([{ merchant_tenant_id: tenantId, customer_id: customerId }]);
    if (sql.startsWith('SELECT store_id FROM orders'))
      return options.order === false ? result() : result([{ store_id: storeId }]);
    if (sql.startsWith('SELECT DISTINCT orders.id,orders.store_id'))
      return result([{ id: orderId, store_id: storeId }]);
    if (sql.includes('FROM refunds refund'))
      return result([
        {
          id: '7e000000-0000-4000-8000-000000000006',
          refund_no: 'RF-1',
          amount_cents: '1200',
          reason_code: 'DAMAGED',
          status: 'PROCESSING',
          approval_status: 'APPROVED',
          created_at: '2026-08-19T01:00:00.000Z',
          updated_at: '2026-08-19T02:00:00.000Z',
        },
      ]);
    if (sql.includes('FROM refund_items'))
      return result([
        {
          order_item_id: '7e000000-0000-4000-8000-000000000007',
          quantity: 1,
          amount_cents: '1200',
        },
      ]);
    if (sql.includes('FROM reward_grants grant'))
      return result([
        {
          id: '7e000000-0000-4000-8000-000000000008',
          order_id: orderId,
          granted_amount_cents: '300',
          redeemed_amount_cents: '50',
          reversed_amount_cents: '20',
          status: 'AVAILABLE',
          funding_source: 'MERCHANT',
          rule_version: 'v1',
          available_at: '2026-08-19T00:00:00.000Z',
          expires_at: null,
          created_at: '2026-08-19T00:00:00.000Z',
        },
      ]);
    return result();
  });
  const requestPlatform = vi.fn().mockResolvedValue({ id: 'refund' });
  const listPlatformTokens = vi
    .fn()
    .mockResolvedValue([{ entitlementId: 'entitlement', remainingUses: 1 }]);
  return {
    queries,
    requestPlatform,
    listPlatformTokens,
    service: createPlatformAftercareService(
      { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
      { requestPlatform },
      { listPlatformTokens },
    ),
  };
}

describe('platform aftercare boundary', () => {
  it('derives refund tenant/customer/store only from an active linked order', async () => {
    const fx = fixture();
    await fx.service.requestRefund({
      identity,
      orderId,
      idempotencyKey: 'refund-1',
      traceId: 'trace-1',
      body: { requestType: 'OTHER', merchantTenantId: 'attacker' },
    });
    expect(fx.requestPlatform).toHaveBeenCalledWith({
      identity,
      tenantId,
      customerId,
      storeId,
      idempotencyKey: 'refund-1',
      traceId: 'trace-1',
      body: { requestType: 'OTHER', merchantTenantId: 'attacker', orderId },
    });
  });

  it('resolves verification tokens through the same server-owned scope', async () => {
    const fx = fixture();
    await expect(fx.service.listEntitlements(identity, orderId)).resolves.toEqual([
      { entitlementId: 'entitlement', remainingUses: 1 },
    ]);
    expect(fx.listPlatformTokens).toHaveBeenCalledWith({
      identity,
      tenantId,
      customerId,
      storeId,
      orderId,
    });
  });

  it('lists usable vouchers across linked merchants without accepting a tenant filter', async () => {
    const fx = fixture();
    await expect(fx.service.listAvailableEntitlements(identity)).resolves.toEqual([
      { entitlementId: 'entitlement', remainingUses: 1 },
    ]);
    expect(fx.listPlatformTokens).toHaveBeenCalledWith({
      identity,
      tenantId,
      customerId,
      storeId,
      orderId,
    });
  });

  it('returns persisted refund progress and item amounts without client status synthesis', async () => {
    const fx = fixture();
    await expect(fx.service.getOrder(identity, orderId)).resolves.toEqual({
      orderId,
      refunds: [
        expect.objectContaining({
          refundNo: 'RF-1',
          amountCents: 1200,
          status: 'PROCESSING',
          approvalStatus: 'APPROVED',
          items: [expect.objectContaining({ amountCents: 1200 })],
        }),
      ],
    });
  });

  it('merges reward grants from account links and computes only server-ledger availability', async () => {
    const fx = fixture();
    await expect(fx.service.listRewards(identity, { limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        merchantTenantId: tenantId,
        grantedAmountCents: 300,
        redeemedAmountCents: 50,
        reversedAmountCents: 20,
        availableAmountCents: 230,
      }),
    ]);
  });

  it('fails before tenant discovery when the platform session is revoked', async () => {
    const fx = fixture({ activeSession: false });
    await expect(fx.service.listRewards(identity, {})).rejects.toBeInstanceOf(
      PlatformAftercareAuthenticationError,
    );
    expect(fx.queries.some(({ sql }) => sql.includes('platform_consumer_tenant_links'))).toBe(
      false,
    );
  });

  it('does not reveal orders outside active links', async () => {
    const fx = fixture({ order: false });
    await expect(fx.service.getOrder(identity, orderId)).rejects.toBeInstanceOf(
      PlatformAftercareOrderNotFoundError,
    );
  });
});
