import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformDiscoveryService,
  PlatformDiscoveryAuthenticationError,
} from './platform-discovery-service.js';

const identity = {
  accountId: 'af000000-0000-4000-8000-000000000001',
  sessionId: 'life-discovery-session',
  authLevel: 'PHONE_BOUND' as const,
};
const tenantId = 'af000000-0000-4000-8000-000000000002';

function fixture(active = true) {
  const query = vi.fn(async (rawSql: string) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SELECT set_config')
    )
      return { rows: [], rowCount: 0 };
    if (sql.includes('FROM platform_consumer_sessions'))
      return active ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT merchant_tenant_id'))
      return { rows: [{ merchant_tenant_id: tenantId }], rowCount: 1 };
    if (sql.startsWith('SELECT store.id'))
      return {
        rows: [
          {
            id: 'af000000-0000-4000-8000-000000000003',
            store_name: '真实附近门店',
            city_code: '3101',
            district_code: '310115',
            longitude: '121.50',
            latitude: '31.20',
            opening_hours: { monday: '09:00-18:00' },
            product_count: '8',
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('SELECT product.id'))
      return {
        rows: [
          {
            id: 'af000000-0000-4000-8000-000000000004',
            store_id: 'af000000-0000-4000-8000-000000000003',
            store_name: '真实附近门店',
            product_type: 'PHYSICAL',
            title: '当日鲜切水果',
            variant_id: 'af000000-0000-4000-8000-000000000005',
            variant_title: '标准份',
            sale_price_cents: '3990',
            market_price_cents: '4590',
            available_quantity: '12',
          },
        ],
        rowCount: 1,
      };
    return { rows: [], rowCount: 0 };
  });
  return {
    query,
    service: createPlatformDiscoveryService({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never),
  };
}

describe('platform linked-merchant discovery', () => {
  it('returns safe live store projections sorted by measured distance', async () => {
    const { service, query } = fixture();
    await expect(
      service.listStores(identity, { cityCode: '3101', latitude: 31.21, longitude: 121.51 }),
    ).resolves.toEqual([
      expect.objectContaining({
        merchantTenantId: tenantId,
        name: '真实附近门店',
        productCount: 8,
        distanceKm: expect.any(Number),
      }),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("store.status='ACTIVE'"), [
      tenantId,
      '3101',
    ]);
  });

  it('rejects a revoked platform session before traversing merchant links', async () => {
    const { service, query } = fixture(false);
    await expect(service.listStores(identity, {})).rejects.toBeInstanceOf(
      PlatformDiscoveryAuthenticationError,
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('platform_consumer_tenant_links')),
    ).toBe(false);
  });

  it('returns only live products from merchants linked to the current platform account', async () => {
    const { service, query } = fixture();
    await expect(service.listProducts(identity, { productType: 'PHYSICAL' })).resolves.toEqual([
      expect.objectContaining({
        merchantTenantId: tenantId,
        title: '当日鲜切水果',
        salePriceCents: 3990,
        availableQuantity: 12,
      }),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("product.status='ON_SALE'"), [
      tenantId,
      null,
      'PHYSICAL',
      30,
    ]);
  });
});
