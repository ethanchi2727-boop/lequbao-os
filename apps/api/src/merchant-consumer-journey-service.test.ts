import { describe, expect, it, vi } from 'vitest';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import type { PlatformCartService } from './platform-cart-service.js';
import type { PlatformCheckoutService } from './platform-checkout-service.js';
import {
  createMerchantConsumerJourneyService,
  MerchantConsumerJourneyAuthenticationError,
  MerchantConsumerJourneyNotFoundError,
} from './merchant-consumer-journey-service.js';

const tenantId = '8d000000-0000-4000-8000-000000000001';
const customerId = '8d000000-0000-4000-8000-000000000002';
const storeId = '8d000000-0000-4000-8000-000000000003';
const accountId = '8d000000-0000-4000-8000-000000000004';
const variantId = '8d000000-0000-4000-8000-000000000005';
const itemId = '8d000000-0000-4000-8000-000000000006';
const checkoutId = '8d000000-0000-4000-8000-000000000007';
const otherTenantId = '8d000000-0000-4000-8000-000000000008';

const consumer: ConsumerSessionIdentity = {
  tenantId,
  customerId,
  storeId,
  sessionId: 'merchant-session',
  authLevel: 'PHONE_BOUND',
};
const life: LifeConsumerSessionIdentity = {
  accountId,
  sessionId: 'life-session',
  authLevel: 'PHONE_BOUND',
};

function cartPayload(includeScopedItem = true) {
  return {
    id: '8d000000-0000-4000-8000-000000000009',
    version: 2,
    itemCount: 100,
    groups: [
      {
        merchantTenantId: tenantId,
        storeId,
        items: includeScopedItem ? [{ id: itemId, quantity: 2 }] : [],
      },
      {
        merchantTenantId: otherTenantId,
        storeId: '8d000000-0000-4000-8000-000000000010',
        items: [{ id: '8d000000-0000-4000-8000-000000000011', quantity: 98 }],
      },
    ],
  };
}

function fixture(
  options: { validPair?: boolean; checkoutScope?: 'valid' | 'mixed' | 'none' } = {},
) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    queries.push({ sql, ...(values ? { values } : {}) });
    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SELECT set_config')
    )
      return { rows: [], rowCount: 0 };
    if (sql.includes('FROM consumer_sessions merchant_session'))
      return options.validPair === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ ok: true }], rowCount: 1 };
    if (sql.startsWith('SELECT count(*)::bigint AS total_count')) {
      if (options.checkoutScope === 'none')
        return { rows: [{ total_count: '0', scoped_count: '0' }], rowCount: 1 };
      if (options.checkoutScope === 'mixed')
        return { rows: [{ total_count: '2', scoped_count: '1' }], rowCount: 1 };
      return { rows: [{ total_count: '1', scoped_count: '1' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const cart: PlatformCartService = {
    get: vi.fn(async () => cartPayload()),
    setItem: vi.fn(async () => cartPayload()),
    removeItem: vi.fn(async () => cartPayload(false)),
  };
  const checkout: PlatformCheckoutService = {
    quote: vi.fn(async () => ({ id: checkoutId })),
    get: vi.fn(async () => ({ id: checkoutId })),
    submit: vi.fn(async () => ({ id: checkoutId, status: 'ORDERS_CREATED' })),
  };
  const service = createMerchantConsumerJourneyService(
    { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
    cart,
    checkout,
  );
  return { service, cart, checkout, queries };
}

describe('merchant consumer dual-identity journey', () => {
  it('returns only the authenticated merchant and store slice of the platform cart', async () => {
    const { service } = fixture();
    await expect(service.getCart({ consumer, life })).resolves.toMatchObject({
      itemCount: 2,
      groups: [{ merchantTenantId: tenantId, storeId }],
    });
  });

  it('derives merchant and store from the consumer session when setting an item', async () => {
    const { service, cart } = fixture();
    await service.setCartItem({ consumer, life }, { variantId, quantity: 3 });
    expect(cart.setItem).toHaveBeenCalledWith(life, {
      merchantTenantId: tenantId,
      storeId,
      variantId,
      quantity: 3,
    });
  });

  it('does not remove an item outside the authenticated merchant cart slice', async () => {
    const { service, cart } = fixture();
    await expect(
      service.removeCartItem({ consumer, life }, '8d000000-0000-4000-8000-000000000011'),
    ).rejects.toBeInstanceOf(MerchantConsumerJourneyNotFoundError);
    expect(cart.removeItem).not.toHaveBeenCalled();
  });

  it('quotes with server-derived merchant scope and source channel', async () => {
    const { service, checkout } = fixture();
    await service.quote({
      consumer,
      life,
      idempotencyKey: 'merchant-quote-1',
      body: {
        cartVersion: 2,
        fulfillmentChoices: [{ productType: 'PHYSICAL', orderType: 'STORE_PICKUP' }],
      },
    });
    expect(checkout.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: life,
        merchantScope: { tenantId, customerId, storeId },
        sourceChannel: 'MERCHANT_MINI_PROGRAM',
        body: {
          cartVersion: 2,
          fulfillmentChoices: [
            {
              productType: 'PHYSICAL',
              orderType: 'STORE_PICKUP',
              merchantTenantId: tenantId,
              storeId,
            },
          ],
        },
      }),
    );
  });

  it('rejects a revoked or mismatched dual-session pair before cart access', async () => {
    const { service, cart, queries } = fixture({ validPair: false });
    await expect(service.getCart({ consumer, life })).rejects.toBeInstanceOf(
      MerchantConsumerJourneyAuthenticationError,
    );
    expect(cart.get).not.toHaveBeenCalled();
    expect(queries.some(({ sql }) => sql === 'ROLLBACK')).toBe(true);
  });

  it('hides mixed-merchant or non-merchant checkout aggregates', async () => {
    const { service, checkout } = fixture({ checkoutScope: 'mixed' });
    await expect(service.getCheckout({ consumer, life }, checkoutId)).rejects.toBeInstanceOf(
      MerchantConsumerJourneyNotFoundError,
    );
    expect(checkout.get).not.toHaveBeenCalled();
  });

  it('submits only an entirely scoped merchant mini-program checkout', async () => {
    const { service, checkout } = fixture({ checkoutScope: 'valid' });
    await service.submitCheckout({ consumer, life, checkoutId, idempotencyKey: 'submit-1' });
    expect(checkout.submit).toHaveBeenCalledWith({
      identity: life,
      checkoutId,
      idempotencyKey: 'submit-1',
    });
  });
});
