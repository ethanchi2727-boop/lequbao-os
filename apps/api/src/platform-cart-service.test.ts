import { describe, expect, it, vi } from 'vitest';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import {
  PlatformCartAuthenticationError,
  PlatformCartItemUnavailableError,
  createPlatformCartService,
} from './platform-cart-service.js';

const identity: LifeConsumerSessionIdentity = {
  accountId: '53000000-0000-4000-8000-000000000001',
  sessionId: 'life-session-1',
  authLevel: 'PHONE_BOUND',
};
const merchantTenantId = '53000000-0000-4000-8000-000000000002';
const storeId = '53000000-0000-4000-8000-000000000003';
const productId = '53000000-0000-4000-8000-000000000004';
const variantId = '53000000-0000-4000-8000-000000000005';
const cartId = '53000000-0000-4000-8000-000000000006';
const itemId = '53000000-0000-4000-8000-000000000007';

function fixture(
  options: { activeSession?: boolean; activeLink?: boolean; twoItems?: boolean } = {},
) {
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
      return options.activeLink === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (sql.includes('SELECT product.id AS product_id'))
      return { rows: [{ product_id: productId, available_quantity: '5' }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO shopping_carts'))
      return { rows: [{ id: cartId, version: 1 }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO shopping_cart_items')) return { rows: [], rowCount: 1 };
    if (sql.startsWith('SELECT id,version FROM shopping_carts'))
      return { rows: [{ id: cartId, version: 1 }], rowCount: 1 };
    if (sql.startsWith('SELECT id,merchant_tenant_id')) {
      const rows = [
        {
          id: itemId,
          merchant_tenant_id: merchantTenantId,
          store_id: storeId,
          product_id: productId,
          variant_id: variantId,
          quantity: 2,
          version: 1,
        },
      ];
      if (options.twoItems)
        rows.push({
          id: '53000000-0000-4000-8000-000000000017',
          merchant_tenant_id: '53000000-0000-4000-8000-000000000012',
          store_id: '53000000-0000-4000-8000-000000000013',
          product_id: '53000000-0000-4000-8000-000000000014',
          variant_id: '53000000-0000-4000-8000-000000000015',
          quantity: 1,
          version: 1,
        });
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('SELECT store.store_name'))
      return {
        rows: [
          {
            store_name: values?.[1] === storeId ? '门店一' : '门店二',
            product_title: '真实商品',
            product_type: 'PHYSICAL',
            variant_title: '标准规格',
            sale_price_cents: '3990',
            available_quantity: '5',
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('DELETE FROM shopping_cart_items'))
      return { rows: [{ cart_id: cartId }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const service = createPlatformCartService({
    connect: vi.fn(async () => ({ query, release })) as never,
  });
  return { service, queries, release };
}

describe('platform cross-merchant cart', () => {
  it('sets account scope, validates the merchant link and reprices from the merchant tenant', async () => {
    const { service, queries } = fixture();
    const cart = await service.setItem(identity, {
      merchantTenantId,
      storeId,
      variantId,
      quantity: 2,
    });
    expect(cart).toMatchObject({
      id: cartId,
      itemCount: 2,
      groups: [
        expect.objectContaining({
          merchantTenantId,
          storeId,
          subtotalCents: 7980,
        }),
      ],
    });
    expect(queries[1]).toMatchObject({
      values: [identity.accountId],
    });
    expect(
      queries.some(
        ({ sql, values }) =>
          sql.includes("set_config('app.tenant_id'") && values?.[0] === merchantTenantId,
      ),
    ).toBe(true);
    expect(
      queries.some(
        ({ sql, values }) => sql.startsWith('INSERT INTO shopping_cart_items') && values?.[5] === 2,
      ),
    ).toBe(true);
  });

  it('groups items from multiple merchants while switching tenant scope for each live price', async () => {
    const { service, queries } = fixture({ twoItems: true });
    const cart = (await service.get(identity)) as { itemCount: number; groups: unknown[] };
    expect(cart.itemCount).toBe(3);
    expect(cart.groups).toHaveLength(2);
    const tenantScopes = queries
      .filter(({ sql }) => sql.includes("set_config('app.tenant_id'"))
      .map(({ values }) => values?.[0]);
    expect(tenantScopes).toEqual([merchantTenantId, '53000000-0000-4000-8000-000000000012']);
  });

  it('rejects revoked platform sessions before reading or mutating the cart', async () => {
    const { service, queries } = fixture({ activeSession: false });
    await expect(service.get(identity)).rejects.toBeInstanceOf(PlatformCartAuthenticationError);
    expect(queries.some(({ sql }) => sql.includes('FROM shopping_carts'))).toBe(false);
  });

  it('rejects a merchant without an active account-to-tenant customer binding', async () => {
    const { service, queries } = fixture({ activeLink: false });
    await expect(
      service.setItem(identity, { merchantTenantId, storeId, variantId, quantity: 1 }),
    ).rejects.toBeInstanceOf(PlatformCartItemUnavailableError);
    expect(queries.some(({ sql }) => sql.startsWith('INSERT INTO shopping_cart_items'))).toBe(
      false,
    );
  });
});
