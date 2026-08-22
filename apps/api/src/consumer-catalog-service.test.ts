import { describe, expect, it, vi } from 'vitest';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import {
  ConsumerCatalogAuthenticationError,
  ConsumerCatalogNotFoundError,
  createConsumerCatalogService,
} from './consumer-catalog-service.js';

const identity: ConsumerSessionIdentity = {
  tenantId: '51000000-0000-4000-8000-000000000001',
  customerId: '51000000-0000-4000-8000-000000000002',
  storeId: '51000000-0000-4000-8000-000000000003',
  sessionId: 'consumer-session',
  authLevel: 'PHONE_BOUND',
};
const productId = '51000000-0000-4000-8000-000000000004';

function fixture(overrides: { sessionRows?: unknown[]; storeRows?: unknown[] } = {}) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, ...(values ? { values } : {}) });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT set_config')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM consumer_sessions')) {
      const rows = overrides.sessionRows ?? [{ '?column?': 1 }];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM stores') && !sql.includes('JOIN stores')) {
      const rows = overrides.storeRows ?? [
        {
          id: identity.storeId,
          store_name: '真实门店',
          province_code: '11',
          city_code: '1101',
          district_code: '110101',
          longitude: '116.1',
          latitude: '39.9',
          opening_hours: [{ day: 1, open: '09:00', close: '18:00' }],
          updated_at: '2026-08-18T00:00:00.000Z',
        },
      ];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM customer_profiles profile'))
      return {
        rows: [
          {
            id: identity.customerId,
            status: 'ACTIVE',
            first_seen_at: '2026-01-01T00:00:00.000Z',
            last_seen_at: '2026-08-18T00:00:00.000Z',
            reward_status: 'ACTIVE',
            available_reward_cents: '880',
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('FROM reward_grants'))
      return {
        rows: [
          {
            id: '51000000-0000-4000-8000-000000000006',
            order_id: productId,
            rule_version: 'reward-v1',
            funding_source: 'MERCHANT',
            granted_amount_cents: '1000',
            redeemed_amount_cents: '100',
            reversed_amount_cents: '20',
            status: 'AVAILABLE',
            available_at: '2026-01-02T00:00:00.000Z',
            expires_at: null,
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('SELECT product.id') && sql.includes('ORDER BY product.updated_at'))
      return { rows: [{ id: productId }], rowCount: 1 };
    if (sql.startsWith('SELECT product.id'))
      return {
        rows: [
          {
            id: productId,
            product_type: 'PHYSICAL',
            title: '真实商品',
            sale_price_cents: '3990',
            market_price_cents: '4990',
            version: 2,
            updated_at: '2026-08-18T00:00:00.000Z',
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('SELECT variant.id'))
      return {
        rows: [
          {
            id: '51000000-0000-4000-8000-000000000005',
            sku_code: 'SKU-1',
            title: '标准规格',
            sale_price_cents: '3990',
            available: true,
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('FROM product_trace_reports'))
      return {
        rows: [
          {
            id: '51000000-0000-4000-8000-000000000007',
            report_version: 2,
            title: '批次溯源',
            summary: '已核验产地和检测信息',
            evidence: [{ type: 'ORIGIN', value: '浙江' }],
            verified_at: '2026-08-18T00:00:00.000Z',
            expires_at: null,
          },
        ],
        rowCount: 1,
      };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const service = createConsumerCatalogService({
    connect: vi.fn(async () => ({ query, release })) as never,
  });
  return { service, queries, release };
}

describe('consumer catalog service', () => {
  it('returns only safe public storefront fields in the bound tenant and store', async () => {
    const { service, queries } = fixture();
    const storefront = await service.getStorefront(identity);
    expect(storefront).toMatchObject({ id: identity.storeId, name: '真实门店' });
    expect(JSON.stringify(storefront)).not.toMatch(/ciphertext|object_key|service_phone/i);
    expect(queries.some(({ values }) => values?.[0] === identity.tenantId)).toBe(true);
    expect(queries.some(({ values }) => values?.[1] === identity.storeId)).toBe(true);
  });

  it('lists only on-sale products from the session-bound store and maps variants', async () => {
    const { service, queries } = fixture();
    const products = await service.listProducts(identity, {
      productType: 'PHYSICAL',
      query: '真实',
    });
    expect(products).toEqual([
      expect.objectContaining({
        id: productId,
        merchantTenantId: identity.tenantId,
        storeId: identity.storeId,
        title: '真实商品',
        salePriceCents: 3990,
        variants: [expect.objectContaining({ available: true })],
      }),
    ]);
    const list = queries.find(({ sql }) => sql.includes('ORDER BY product.updated_at'));
    expect(list?.sql).toContain("product.status='ON_SALE'");
    expect(list?.values?.slice(0, 4)).toEqual([
      identity.tenantId,
      identity.storeId,
      'PHYSICAL',
      '真实',
    ]);
  });

  it('rejects a revoked or expired consumer session before catalog reads', async () => {
    const { service, queries } = fixture({ sessionRows: [] });
    await expect(service.getStorefront(identity)).rejects.toBeInstanceOf(
      ConsumerCatalogAuthenticationError,
    );
    expect(queries.some(({ sql }) => sql.includes('FROM stores'))).toBe(false);
  });

  it('returns only the current customer membership and immutable reward projection', async () => {
    const { service, queries } = fixture();
    await expect(service.getMembership(identity)).resolves.toMatchObject({
      customerId: identity.customerId,
      status: 'ACTIVE',
      rewardAccountStatus: 'ACTIVE',
      availableRewardCents: 880,
      grants: [
        {
          ruleVersion: 'reward-v1',
          grantedAmountCents: 1000,
          redeemedAmountCents: 100,
          reversedAmountCents: 20,
        },
      ],
    });
    expect(queries.find(({ sql }) => sql.includes('FROM reward_grants'))?.values).toEqual([
      identity.tenantId,
      identity.customerId,
    ]);
  });

  it('does not expose a missing, inactive or cross-store product', async () => {
    const { service } = fixture({ storeRows: [] });
    await expect(service.getStorefront(identity)).rejects.toBeInstanceOf(
      ConsumerCatalogNotFoundError,
    );
  });

  it('returns only a current verified trace report for a bound live product', async () => {
    const { service } = fixture();
    await expect(service.getTraceReport(identity, productId)).resolves.toMatchObject({
      productId,
      reportVersion: 2,
      title: '批次溯源',
      evidence: [{ type: 'ORIGIN', value: '浙江' }],
    });
  });
});
