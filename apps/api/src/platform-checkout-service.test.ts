import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformCheckoutService,
  PlatformCheckoutAuthenticationError,
  PlatformCheckoutConflictError,
} from './platform-checkout-service.js';

const accountId = '7c000000-0000-4000-8000-000000000001';
const tenantId = '7c000000-0000-4000-8000-000000000002';
const customerId = '7c000000-0000-4000-8000-000000000003';
const storeId = '7c000000-0000-4000-8000-000000000004';
const cartId = '7c000000-0000-4000-8000-000000000005';
const cartItemId = '7c000000-0000-4000-8000-000000000006';
const productId = '7c000000-0000-4000-8000-000000000007';
const variantId = '7c000000-0000-4000-8000-000000000008';
const addressId = '7c000000-0000-4000-8000-000000000009';
const policyId = '7c000000-0000-4000-8000-000000000010';
const discountId = '7c000000-0000-4000-8000-000000000011';
const checkoutId = '7c000000-0000-4000-8000-000000000012';
const checkoutGroupId = '7c000000-0000-4000-8000-000000000013';

const identity = {
  accountId,
  sessionId: 'life-checkout-session',
  authLevel: 'PHONE_BOUND' as const,
};
const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount });

function fixture(
  options: {
    session?: boolean;
    cartVersion?: number;
    replayHash?: string;
    rewardGrants?: Array<{ id: string; availableCents: number }>;
  } = {},
) {
  let checkoutId = '';
  let checkoutValues: readonly unknown[] = [];
  const groupRows: unknown[] = [];
  const redemptionRows: unknown[] = [];
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions'))
      return options.session === false ? result() : result([{ ok: true }]);
    if (sql.startsWith('SELECT id,request_hash FROM platform_checkout_sessions'))
      return options.replayHash
        ? result([{ id: '7c000000-0000-4000-8000-000000000012', request_hash: options.replayHash }])
        : result();
    if (sql.startsWith('SELECT id,version FROM shopping_carts'))
      return result([{ id: cartId, version: options.cartVersion ?? 3 }]);
    if (sql.startsWith('SELECT id,merchant_tenant_id,store_id,product_id'))
      return result([
        {
          id: cartItemId,
          merchant_tenant_id: tenantId,
          store_id: storeId,
          product_id: productId,
          variant_id: variantId,
          quantity: 2,
        },
      ]);
    if (sql.startsWith('SELECT customer_id FROM platform_consumer_tenant_links'))
      return result([{ customer_id: customerId }]);
    if (sql.startsWith('SELECT id,policy_version,allowed_order_types'))
      return result([
        {
          id: policyId,
          policy_version: 'delivery-v1',
          allowed_order_types: ['PHYSICAL_DELIVERY', 'STORE_PICKUP'],
          delivery_fee_cents: 200,
          free_delivery_threshold_cents: 2000,
          estimated_minutes: 60,
          refund_rule_summary: '未发货可申请退款',
        },
      ]);
    if (sql.startsWith('SELECT item.id AS cart_item_id'))
      return result([
        {
          cart_item_id: cartItemId,
          product_id: productId,
          variant_id: variantId,
          product_type: 'PHYSICAL',
          product_title: '大米',
          variant_title: '5kg',
          quantity: 2,
          unit_price_cents: 500,
          available_quantity: 9,
        },
      ]);
    if (sql.startsWith('SELECT 1 FROM platform_consumer_addresses')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT id,rule_version,display_name'))
      return result([
        {
          id: discountId,
          rule_version: 'discount-v1',
          display_name: '九折',
          discount_type: 'BASIS_POINTS',
          fixed_discount_cents: null,
          discount_basis_points: 1000,
          maximum_discount_cents: 150,
        },
      ]);
    if (sql.startsWith('INSERT INTO platform_checkout_sessions')) {
      checkoutValues = values ?? [];
      checkoutId = String(values?.[0]);
      return result([], 1);
    }
    if (sql.startsWith('SELECT grant.id,grant.granted_amount_cents'))
      return result(
        (options.rewardGrants ?? []).map((grant) => ({
          id: grant.id,
          granted_amount_cents: grant.availableCents,
          redeemed_amount_cents: 0,
          reversed_amount_cents: 0,
        })),
      );
    if (sql.startsWith('INSERT INTO platform_checkout_reward_redemptions')) {
      redemptionRows.push({
        id: `redemption-${redemptionRows.length + 1}`,
        checkout_group_id: values?.[1],
        merchant_tenant_id: values?.[3],
        reward_grant_id: values?.[4],
        amount_cents: values?.[5],
        status: 'RESERVED',
        order_id: null,
      });
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,checkout_group_id,merchant_tenant_id,reward_grant_id'))
      return result(redemptionRows);
    if (sql.startsWith('INSERT INTO platform_checkout_groups')) {
      groupRows.push({
        id: values?.[0],
        merchant_tenant_id: values?.[3],
        store_id: values?.[5],
        source_channel: values?.[6],
        order_type: values?.[7],
        delivery_address_id: values?.[8],
        item_snapshot: JSON.parse(String(values?.[9])),
        policy_snapshot: JSON.parse(String(values?.[10])),
        discount_snapshot: JSON.parse(String(values?.[11])),
        goods_amount_cents: values?.[12],
        discount_amount_cents: values?.[13],
        shipping_amount_cents: values?.[14],
        payable_amount_cents: values?.[15],
        status: 'QUOTED',
        order_id: null,
        last_error_code: null,
      });
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,cart_id,cart_version,status'))
      return result([
        {
          id: checkoutId,
          cart_id: cartId,
          cart_version: 3,
          status: 'QUOTED',
          goods_amount_cents: checkoutValues[6],
          discount_amount_cents: checkoutValues[7],
          shipping_amount_cents: checkoutValues[8],
          payable_amount_cents: checkoutValues[9],
          reward_redemption_status: checkoutValues[11] ?? 'UNAVAILABLE_PENDING_POLICY',
          expires_at: checkoutValues[10],
        },
      ]);
    if (sql.startsWith('SELECT id,merchant_tenant_id,store_id,order_type'))
      return result(groupRows);
    return result();
  });
  return {
    query,
    service: createPlatformCheckoutService({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never),
  };
}

function submitFixture(
  options: {
    changedPrice?: boolean;
    sourceChannel?: 'LEQU_LIFE' | 'MERCHANT_MINI_PROGRAM';
    redemptions?: Array<{ id: string; rewardGrantId: string; amountCents: number }>;
  } = {},
) {
  let groupStatus = 'QUOTED';
  let orderId: string | null = null;
  let checkoutStatus = 'QUOTED';
  let redemptionsSettled = false;
  const itemSnapshot = [
    {
      cartItemId,
      productId,
      variantId,
      productTitle: '大米',
      variantTitle: '5kg',
      quantity: 2,
      unitPriceCents: 500,
      lineAmountCents: 1000,
    },
  ];
  const group = {
    id: checkoutGroupId,
    merchant_tenant_id: tenantId,
    customer_id: customerId,
    store_id: storeId,
    source_channel: options.sourceChannel ?? 'LEQU_LIFE',
    order_type: 'PHYSICAL_DELIVERY',
    delivery_address_id: addressId,
    item_snapshot: itemSnapshot,
    policy_snapshot: { id: policyId, version: 'delivery-v1' },
    discount_snapshot: { id: discountId, version: 'discount-v1', amountCents: 100 },
    goods_amount_cents: 1000,
    discount_amount_cents: 100,
    shipping_amount_cents: 200,
    payable_amount_cents: 1100,
    status: groupStatus,
    order_id: orderId,
  };
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT status,cart_id,cart_version,expires_at'))
      return result([
        {
          status: checkoutStatus,
          cart_id: cartId,
          cart_version: 3,
          expires_at: '2099-01-01T00:00:00.000Z',
          submit_idempotency_key: null,
          submit_request_hash: null,
        },
      ]);
    if (sql.startsWith('SELECT version,status FROM shopping_carts'))
      return result([{ version: 3, status: 'ACTIVE' }]);
    if (sql.startsWith('SELECT id,merchant_tenant_id,customer_id,store_id'))
      return result([{ ...group, status: groupStatus, order_id: orderId }]);
    if (sql.startsWith('SELECT id,merchant_tenant_id,reward_grant_id,amount_cents'))
      return result(
        redemptionsSettled
          ? []
          : (options.redemptions ?? []).map((redemption) => ({
              id: redemption.id,
              merchant_tenant_id: tenantId,
              reward_grant_id: redemption.rewardGrantId,
              amount_cents: redemption.amountCents,
            })),
      );
    if (sql.startsWith('UPDATE reward_grants')) return result([], 1);
    if (sql.startsWith('UPDATE platform_checkout_reward_redemptions')) {
      if (sql.includes("status='SETTLED'")) redemptionsSettled = true;
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,checkout_group_id,merchant_tenant_id,reward_grant_id'))
      return result(
        (options.redemptions ?? []).map((redemption) => ({
          id: redemption.id,
          checkout_group_id: checkoutGroupId,
          merchant_tenant_id: tenantId,
          reward_grant_id: redemption.rewardGrantId,
          amount_cents: redemption.amountCents,
          status: redemptionsSettled ? 'SETTLED' : 'RESERVED',
          order_id: orderId,
        })),
      );
    if (sql.startsWith('SELECT 1 FROM platform_consumer_tenant_links'))
      return result([{ ok: true }]);
    if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'idem' }]);
    if (sql.startsWith('SELECT variant.id AS variant_id'))
      return result([
        {
          variant_id: variantId,
          product_id: productId,
          product_type: 'PHYSICAL',
          product_title: '大米',
          store_id: storeId,
          unit_price_cents: options.changedPrice ? 501 : 500,
          on_hand: 9,
          reserved: 0,
        },
      ]);
    if (
      sql.startsWith('UPDATE platform_checkout_groups') &&
      sql.includes("status='ORDER_CREATED'")
    ) {
      groupStatus = 'ORDER_CREATED';
      orderId = String(values?.[3]);
      return result([], 1);
    }
    if (sql.startsWith('UPDATE platform_checkout_groups') && sql.includes("status='FAILED'")) {
      groupStatus = 'FAILED';
      return result([], 1);
    }
    if (sql.startsWith('SELECT count(*)::bigint AS total'))
      return result([
        {
          total: 1,
          created: groupStatus === 'ORDER_CREATED' ? 1 : 0,
          failed: groupStatus === 'FAILED' ? 1 : 0,
        },
      ]);
    if (sql.startsWith('UPDATE platform_checkout_sessions SET status=$3')) {
      checkoutStatus = String(values?.[2]);
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,cart_id,cart_version,status'))
      return result([
        {
          id: checkoutId,
          cart_id: cartId,
          cart_version: 3,
          status: checkoutStatus,
          goods_amount_cents: 1000,
          discount_amount_cents: 100,
          shipping_amount_cents: 200,
          payable_amount_cents: 1100,
          reward_redemption_status: 'UNAVAILABLE_PENDING_POLICY',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      ]);
    if (sql.startsWith('SELECT id,merchant_tenant_id,store_id,order_type'))
      return result([
        {
          ...group,
          status: groupStatus,
          order_id: orderId,
          last_error_code: groupStatus === 'FAILED' ? 'QUOTE_CHANGED' : null,
        },
      ]);
    return result();
  });
  return {
    query,
    service: createPlatformCheckoutService({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never),
  };
}

describe('platform checkout quote', () => {
  it('reprices, picks the best eligible discount and explains shipping per merchant group', async () => {
    const fx = fixture();
    const quote = (await fx.service.quote({
      identity,
      idempotencyKey: 'quote-1',
      body: {
        cartVersion: 3,
        payableAmountCents: 1,
        fulfillmentChoices: [
          {
            merchantTenantId: tenantId,
            storeId,
            productType: 'PHYSICAL',
            orderType: 'PHYSICAL_DELIVERY',
            addressId,
          },
        ],
      },
    })) as {
      goodsAmountCents: number;
      discountAmountCents: number;
      shippingAmountCents: number;
      payableAmountCents: number;
      rewardRedemptionStatus: string;
      groups: Array<{ policy: { version: string }; discount: { name: string } }>;
    };
    expect(quote).toMatchObject({
      goodsAmountCents: 1000,
      discountAmountCents: 100,
      shippingAmountCents: 200,
      payableAmountCents: 1100,
      rewardRedemptionStatus: 'UNAVAILABLE_PENDING_POLICY',
    });
    expect(quote.groups[0]).toMatchObject({
      policy: { version: 'delivery-v1' },
      discount: { name: '九折' },
    });
    expect(JSON.stringify(fx.query.mock.calls)).not.toContain('payableAmountCents":1');
  });

  it('requires an exact cart version before pricing', async () => {
    const fx = fixture({ cartVersion: 4 });
    await expect(
      fx.service.quote({ identity, idempotencyKey: 'quote-stale', body: { cartVersion: 3 } }),
    ).rejects.toBeInstanceOf(PlatformCheckoutConflictError);
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes('FROM products'))).toBe(false);
  });

  it('filters a merchant mini-program quote to its server-derived merchant scope', async () => {
    const fx = fixture();
    await fx.service.quote({
      identity,
      idempotencyKey: 'merchant-quote-1',
      merchantScope: { tenantId, customerId, storeId },
      sourceChannel: 'MERCHANT_MINI_PROGRAM',
      body: {
        cartVersion: 3,
        fulfillmentChoices: [
          {
            merchantTenantId: tenantId,
            storeId,
            productType: 'PHYSICAL',
            orderType: 'STORE_PICKUP',
          },
        ],
      },
    });
    const cartItems = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM shopping_cart_items'),
    );
    expect(cartItems?.[1]).toEqual([cartId, tenantId, storeId]);
    const groupInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO platform_checkout_groups'),
    );
    expect(groupInsert?.[1]?.[6]).toBe('MERCHANT_MINI_PROGRAM');
  });

  it('rejects reuse of an idempotency key with a different request hash', async () => {
    const fx = fixture({ replayHash: 'different' });
    await expect(
      fx.service.quote({ identity, idempotencyKey: 'quote-reused', body: { cartVersion: 3 } }),
    ).rejects.toBeInstanceOf(PlatformCheckoutConflictError);
  });

  it('rejects a revoked platform consumer session before reading the cart', async () => {
    const fx = fixture({ session: false });
    await expect(
      fx.service.quote({ identity, idempotencyKey: 'quote-auth', body: { cartVersion: 3 } }),
    ).rejects.toBeInstanceOf(PlatformCheckoutAuthenticationError);
  });

  it('applies available reward grants to the quote and caps them at the payable amount', async () => {
    const grantId = '7c000000-0000-4000-8000-000000000031';
    const fx = fixture({ rewardGrants: [{ id: grantId, availableCents: 2000 }] });
    const quote = (await fx.service.quote({
      identity,
      idempotencyKey: 'quote-reward-1',
      body: {
        cartVersion: 3,
        fulfillmentChoices: [],
        rewardRedemption: { action: 'APPLY' },
      },
    })) as {
      payableAmountCents: number;
      rewardRedemptionStatus: string;
      rewardRedemptionCents: number;
      cashPayableCents: number;
      rewardRedemptions: Array<{ rewardGrantId: string; amountCents: number; status: string }>;
    };
    expect(quote).toMatchObject({
      payableAmountCents: 900,
      rewardRedemptionStatus: 'APPLIED',
      rewardRedemptionCents: 900,
      cashPayableCents: 0,
      rewardRedemptions: [{ rewardGrantId: grantId, amountCents: 900, status: 'RESERVED' }],
    });
    const redemptionInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO platform_checkout_reward_redemptions'),
    );
    expect(redemptionInsert?.[1]).toEqual(expect.arrayContaining([grantId, 900]));
  });

  it('keeps reward redemption off when the request explicitly skips it', async () => {
    const fx = fixture({ rewardGrants: [{ id: '7c000000-0000-4000-8000-000000000032', availableCents: 500 }] });
    const quote = (await fx.service.quote({
      identity,
      idempotencyKey: 'quote-reward-skip',
      body: { cartVersion: 3, rewardRedemption: { action: 'SKIP' } },
    })) as { rewardRedemptionStatus: string; rewardRedemptionCents: number };
    expect(quote).toMatchObject({ rewardRedemptionStatus: 'NOT_APPLIED', rewardRedemptionCents: 0 });
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes('FROM reward_grants')),
    ).toBe(false);
  });

  it('debits redeemed reward amounts when the applied quote submits into orders', async () => {
    const redemptionId = '7c000000-0000-4000-8000-000000000041';
    const grantId = '7c000000-0000-4000-8000-000000000042';
    const fx = submitFixture({
      redemptions: [{ id: redemptionId, rewardGrantId: grantId, amountCents: 520 }],
    });
    const submitted = (await fx.service.submit({
      identity,
      checkoutId,
      idempotencyKey: 'submit-reward-1',
    })) as {
      status: string;
      rewardRedemptionCents: number;
      rewardRedemptions: Array<{ status: string; orderId: string }>;
    };
    expect(submitted.status).toBe('ORDERS_CREATED');
    expect(submitted.rewardRedemptionCents).toBe(520);
    expect(submitted.rewardRedemptions[0]?.status).toBe('SETTLED');
    const grantDebit = fx.query.mock.calls.find(([sql]) =>
      String(sql).startsWith('UPDATE reward_grants'),
    );
    expect(grantDebit?.[1]).toEqual([tenantId, grantId, 520]);
  });

  it('submits the quote as one merchant-direct order and closes the cart only after success', async () => {
    const fx = submitFixture();
    const submitted = (await fx.service.submit({
      identity,
      checkoutId,
      idempotencyKey: 'submit-1',
    })) as { status: string; groups: Array<{ orderId: string }> };
    expect(submitted.status).toBe('ORDERS_CREATED');
    expect(submitted.groups[0]?.orderId).toMatch(/^[0-9a-f-]{36}$/u);
    const orderInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO orders'),
    );
    expect(orderInsert?.[1]).toEqual(
      expect.arrayContaining([tenantId, storeId, customerId, 1000, 100, 200, 1100]),
    );
    expect(fx.query).toHaveBeenCalledWith(expect.stringContaining("'RESERVE'"), [
      tenantId,
      variantId,
      2,
      expect.any(String),
      expect.stringContaining('order-reserve:'),
    ]);
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("status='CHECKED_OUT'"))).toBe(
      true,
    );
  });

  it('retains a failed group for safe retry and does not close the cart when the quote changed', async () => {
    const fx = submitFixture({ changedPrice: true });
    const submitted = (await fx.service.submit({
      identity,
      checkoutId,
      idempotencyKey: 'submit-price-changed',
    })) as { status: string; groups: Array<{ status: string; lastErrorCode: string }> };
    expect(submitted).toMatchObject({
      status: 'FAILED',
      groups: [{ status: 'FAILED', lastErrorCode: 'QUOTE_CHANGED' }],
    });
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO orders'))).toBe(
      false,
    );
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("status='CHECKED_OUT'"))).toBe(
      false,
    );
  });

  it('preserves the independent merchant mini-program order source on submit', async () => {
    const fx = submitFixture({ sourceChannel: 'MERCHANT_MINI_PROGRAM' });
    await fx.service.submit({ identity, checkoutId, idempotencyKey: 'merchant-submit-1' });
    const orderInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO orders'),
    );
    expect(orderInsert?.[1]?.[5]).toBe('MERCHANT_MINI_PROGRAM');
  });
});
