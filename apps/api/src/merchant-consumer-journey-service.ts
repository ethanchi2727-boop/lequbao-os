import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import type { PlatformCartService } from './platform-cart-service.js';
import type { PlatformCheckoutService } from './platform-checkout-service.js';

const SetItemSchema = z.object({
  variantId: UuidSchema,
  quantity: z.number().int().min(1).max(999),
});
const QuoteSchema = z.object({
  cartVersion: z.number().int().positive(),
  fulfillmentChoices: z
    .array(
      z.object({
        productType: z.enum(['PHYSICAL', 'GROUP_BUY', 'SERVICE']),
        orderType: z.enum([
          'PHYSICAL_DELIVERY',
          'STORE_PICKUP',
          'GROUP_BUY',
          'SERVICE_APPOINTMENT',
        ]),
        addressId: UuidSchema.optional(),
      }),
    )
    .max(3)
    .default([]),
});
const CartSchema = z.object({
  id: UuidSchema.nullable(),
  version: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  groups: z.array(
    z
      .object({
        merchantTenantId: UuidSchema,
        storeId: UuidSchema,
        items: z.array(z.object({ id: UuidSchema }).passthrough()),
      })
      .passthrough(),
  ),
});

type DualIdentity = {
  consumer: ConsumerSessionIdentity;
  life: LifeConsumerSessionIdentity;
};

export interface MerchantConsumerJourneyService {
  getCart(identity: DualIdentity): Promise<unknown>;
  setCartItem(identity: DualIdentity, body: unknown): Promise<unknown>;
  removeCartItem(identity: DualIdentity, itemId: string): Promise<unknown>;
  quote(command: DualIdentity & { idempotencyKey: string; body: unknown }): Promise<unknown>;
  getCheckout(identity: DualIdentity, checkoutId: string): Promise<unknown>;
  submitCheckout(
    command: DualIdentity & { idempotencyKey: string; checkoutId: string },
  ): Promise<unknown>;
}

export class MerchantConsumerJourneyAuthenticationError extends Error {}
export class MerchantConsumerJourneyNotFoundError extends Error {}

export function createMerchantConsumerJourneyService(
  pool: Pick<pg.Pool, 'connect'>,
  cart: PlatformCartService,
  checkout: PlatformCheckoutService,
): MerchantConsumerJourneyService {
  async function validate(identity: DualIdentity) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.life.accountId,
      ]);
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [
        identity.consumer.tenantId,
      ]);
      const pair = await client.query(
        `SELECT 1
           FROM consumer_sessions merchant_session
           JOIN platform_consumer_sessions platform_session
             ON platform_session.account_id=$5
           JOIN platform_consumer_accounts account ON account.id=platform_session.account_id
           JOIN platform_consumer_tenant_links link ON link.account_id=account.id
          WHERE merchant_session.tenant_id=$1 AND merchant_session.session_id=$2
            AND merchant_session.customer_id=$3 AND merchant_session.store_id=$4
            AND merchant_session.revoked_at IS NULL AND merchant_session.expires_at>now()
            AND platform_session.session_id=$6 AND platform_session.revoked_at IS NULL
            AND platform_session.expires_at>now() AND account.status='ACTIVE'
            AND link.merchant_tenant_id=$1 AND link.customer_id=$3 AND link.status='ACTIVE'`,
        [
          identity.consumer.tenantId,
          identity.consumer.sessionId,
          identity.consumer.customerId,
          identity.consumer.storeId,
          identity.life.accountId,
          identity.life.sessionId,
        ],
      );
      if (pair.rowCount !== 1) throw new MerchantConsumerJourneyAuthenticationError();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function assertCheckoutScope(identity: DualIdentity, rawCheckoutId: string) {
    const checkoutId = UuidSchema.parse(rawCheckoutId);
    await validate(identity);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.life.accountId,
      ]);
      const scope = await client.query<{
        total_count: string | number;
        scoped_count: string | number;
      }>(
        `SELECT count(*)::bigint AS total_count,
                count(*) FILTER (
                  WHERE merchant_tenant_id=$3 AND customer_id=$4 AND store_id=$5
                    AND source_channel='MERCHANT_MINI_PROGRAM'
                )::bigint AS scoped_count
           FROM platform_checkout_groups
          WHERE account_id=$1 AND checkout_id=$2`,
        [
          identity.life.accountId,
          checkoutId,
          identity.consumer.tenantId,
          identity.consumer.customerId,
          identity.consumer.storeId,
        ],
      );
      const total = Number(scope.rows[0]?.total_count ?? 0);
      const scoped = Number(scope.rows[0]?.scoped_count ?? 0);
      if (total === 0 || total !== scoped) throw new MerchantConsumerJourneyNotFoundError();
      await client.query('COMMIT');
      return checkoutId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  function scopeCart(identity: DualIdentity, rawCart: unknown) {
    const current = CartSchema.parse(rawCart);
    const groups = current.groups.filter(
      (group) =>
        group.merchantTenantId === identity.consumer.tenantId &&
        group.storeId === identity.consumer.storeId,
    );
    return {
      ...current,
      itemCount: groups.reduce(
        (total, group) =>
          total +
          group.items.reduce(
            (groupTotal, item) =>
              groupTotal +
              (typeof item.quantity === 'number' && Number.isInteger(item.quantity)
                ? item.quantity
                : 0),
            0,
          ),
        0,
      ),
      groups,
    };
  }

  return {
    async getCart(identity) {
      await validate(identity);
      return scopeCart(identity, await cart.get(identity.life));
    },

    async setCartItem(identity, rawBody) {
      const input = SetItemSchema.parse(rawBody);
      await validate(identity);
      const updated = await cart.setItem(identity.life, {
        merchantTenantId: identity.consumer.tenantId,
        storeId: identity.consumer.storeId,
        variantId: input.variantId,
        quantity: input.quantity,
      });
      return scopeCart(identity, updated);
    },

    async removeCartItem(identity, rawItemId) {
      const itemId = UuidSchema.parse(rawItemId);
      await validate(identity);
      const current = scopeCart(identity, await cart.get(identity.life));
      if (!current.groups.some((group) => group.items.some((item) => item.id === itemId)))
        throw new MerchantConsumerJourneyNotFoundError();
      return scopeCart(identity, await cart.removeItem(identity.life, itemId));
    },

    async quote(command) {
      const input = QuoteSchema.parse(command.body);
      await validate(command);
      return checkout.quote({
        identity: command.life,
        idempotencyKey: command.idempotencyKey,
        merchantScope: {
          tenantId: command.consumer.tenantId,
          customerId: command.consumer.customerId,
          storeId: command.consumer.storeId,
        },
        sourceChannel: 'MERCHANT_MINI_PROGRAM',
        body: {
          cartVersion: input.cartVersion,
          fulfillmentChoices: input.fulfillmentChoices.map((choice) => ({
            ...choice,
            merchantTenantId: command.consumer.tenantId,
            storeId: command.consumer.storeId,
          })),
        },
      });
    },

    async getCheckout(identity, rawCheckoutId) {
      const checkoutId = await assertCheckoutScope(identity, rawCheckoutId);
      return checkout.get(identity.life, checkoutId);
    },

    async submitCheckout(command) {
      const checkoutId = await assertCheckoutScope(command, command.checkoutId);
      return checkout.submit({
        identity: command.life,
        idempotencyKey: command.idempotencyKey,
        checkoutId,
      });
    },
  };
}
