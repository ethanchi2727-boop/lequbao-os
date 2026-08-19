import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const ProductTypeSchema = z.enum(['PHYSICAL', 'GROUP_BUY', 'SERVICE']);
const OrderTypeSchema = z.enum([
  'PHYSICAL_DELIVERY',
  'STORE_PICKUP',
  'GROUP_BUY',
  'SERVICE_APPOINTMENT',
]);
const QuoteSchema = z.object({
  cartVersion: z.number().int().positive(),
  fulfillmentChoices: z
    .array(
      z.object({
        merchantTenantId: TenantIdSchema,
        storeId: UuidSchema,
        productType: ProductTypeSchema,
        orderType: OrderTypeSchema,
        addressId: UuidSchema.optional(),
      }),
    )
    .max(100)
    .default([]),
});
const CheckoutItemSnapshotSchema = z.object({
  cartItemId: UuidSchema,
  productId: UuidSchema,
  variantId: UuidSchema,
  productTitle: z.string().min(1),
  variantTitle: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineAmountCents: z.number().int().nonnegative(),
});

type CheckoutCommand = {
  identity: LifeConsumerSessionIdentity;
  idempotencyKey: string;
  body: unknown;
  merchantScope?: { tenantId: string; customerId: string; storeId: string };
  sourceChannel?: 'LEQU_LIFE' | 'MERCHANT_MINI_PROGRAM';
};

export interface PlatformCheckoutService {
  quote(command: CheckoutCommand): Promise<unknown>;
  submit(command: Omit<CheckoutCommand, 'body'> & { checkoutId: string }): Promise<unknown>;
  get(identity: LifeConsumerSessionIdentity, checkoutId: string): Promise<unknown>;
}

export class PlatformCheckoutAuthenticationError extends Error {}
export class PlatformCheckoutConflictError extends Error {}
export class PlatformCheckoutUnavailableError extends Error {}
export class PlatformCheckoutNotFoundError extends Error {}

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(',')}}`;
};
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

const defaultOrderType = (productType: z.infer<typeof ProductTypeSchema>) => {
  if (productType === 'PHYSICAL') return 'STORE_PICKUP' as const;
  if (productType === 'GROUP_BUY') return 'GROUP_BUY' as const;
  return 'SERVICE_APPOINTMENT' as const;
};

export function createPlatformCheckoutService(
  pool: Pick<pg.Pool, 'connect'>,
): PlatformCheckoutService {
  async function transaction<T>(
    identity: LifeConsumerSessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.accountId,
      ]);
      const session = await client.query(
        `SELECT 1
           FROM platform_consumer_sessions session
           JOIN platform_consumer_accounts account ON account.id=session.account_id
          WHERE session.session_id=$1 AND session.account_id=$2
            AND session.revoked_at IS NULL AND session.expires_at>now()
            AND account.status='ACTIVE'`,
        [identity.sessionId, identity.accountId],
      );
      if (session.rowCount !== 1) throw new PlatformCheckoutAuthenticationError();
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function load(client: pg.PoolClient, accountId: string, checkoutId: string) {
    const checkout = await client.query<{
      id: string;
      cart_id: string;
      cart_version: number;
      status: string;
      goods_amount_cents: string | number;
      discount_amount_cents: string | number;
      shipping_amount_cents: string | number;
      payable_amount_cents: string | number;
      reward_redemption_status: string;
      expires_at: Date | string;
    }>(
      `SELECT id,cart_id,cart_version,status,goods_amount_cents,discount_amount_cents,
              shipping_amount_cents,payable_amount_cents,reward_redemption_status,expires_at
         FROM platform_checkout_sessions WHERE account_id=$1 AND id=$2`,
      [accountId, checkoutId],
    );
    const row = checkout.rows[0];
    if (!row) throw new PlatformCheckoutNotFoundError();
    const groups = await client.query<{
      id: string;
      merchant_tenant_id: string;
      store_id: string;
      order_type: string;
      delivery_address_id: string | null;
      item_snapshot: unknown;
      policy_snapshot: unknown;
      discount_snapshot: unknown;
      goods_amount_cents: string | number;
      discount_amount_cents: string | number;
      shipping_amount_cents: string | number;
      payable_amount_cents: string | number;
      status: string;
      order_id: string | null;
      last_error_code: string | null;
    }>(
      `SELECT id,merchant_tenant_id,store_id,order_type,delivery_address_id,item_snapshot,
              policy_snapshot,discount_snapshot,goods_amount_cents,discount_amount_cents,
              shipping_amount_cents,payable_amount_cents,status,order_id,last_error_code
         FROM platform_checkout_groups WHERE account_id=$1 AND checkout_id=$2
        ORDER BY merchant_tenant_id,store_id,order_type`,
      [accountId, checkoutId],
    );
    return {
      id: row.id,
      cartId: row.cart_id,
      cartVersion: row.cart_version,
      status: row.status,
      goodsAmountCents: Number(row.goods_amount_cents),
      discountAmountCents: Number(row.discount_amount_cents),
      shippingAmountCents: Number(row.shipping_amount_cents),
      payableAmountCents: Number(row.payable_amount_cents),
      rewardRedemptionStatus: row.reward_redemption_status,
      expiresAt: new Date(row.expires_at).toISOString(),
      groups: groups.rows.map((group) => ({
        id: group.id,
        merchantTenantId: group.merchant_tenant_id,
        storeId: group.store_id,
        orderType: group.order_type,
        addressId: group.delivery_address_id,
        items: group.item_snapshot,
        policy: group.policy_snapshot,
        discount: group.discount_snapshot,
        goodsAmountCents: Number(group.goods_amount_cents),
        discountAmountCents: Number(group.discount_amount_cents),
        shippingAmountCents: Number(group.shipping_amount_cents),
        payableAmountCents: Number(group.payable_amount_cents),
        status: group.status,
        orderId: group.order_id,
        lastErrorCode: group.last_error_code,
      })),
    };
  }

  type CheckoutGroup = {
    id: string;
    merchant_tenant_id: string;
    customer_id: string;
    store_id: string;
    source_channel: 'LEQU_LIFE' | 'MERCHANT_MINI_PROGRAM';
    order_type: z.infer<typeof OrderTypeSchema>;
    delivery_address_id: string | null;
    item_snapshot: unknown;
    policy_snapshot: unknown;
    discount_snapshot: unknown;
    goods_amount_cents: string | number;
    discount_amount_cents: string | number;
    shipping_amount_cents: string | number;
    payable_amount_cents: string | number;
    status: string;
    order_id: string | null;
  };

  async function createGroupOrder(
    identity: LifeConsumerSessionIdentity,
    checkoutId: string,
    group: CheckoutGroup,
  ) {
    const items = z.array(CheckoutItemSnapshotSchema).min(1).parse(group.item_snapshot);
    const normalizedItems = [...items].sort((left, right) =>
      left.variantId.localeCompare(right.variantId),
    );
    const requestSnapshot = {
      checkoutId,
      groupId: group.id,
      merchantTenantId: group.merchant_tenant_id,
      customerId: group.customer_id,
      storeId: group.store_id,
      orderType: group.order_type,
      items: normalizedItems,
      goodsAmountCents: Number(group.goods_amount_cents),
      discountAmountCents: Number(group.discount_amount_cents),
      shippingAmountCents: Number(group.shipping_amount_cents),
      payableAmountCents: Number(group.payable_amount_cents),
      policy: group.policy_snapshot,
      discount: group.discount_snapshot,
      addressId: group.delivery_address_id,
    };
    return transaction(identity, async (client) => {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [group.merchant_tenant_id]);
      const link = await client.query(
        `SELECT 1 FROM platform_consumer_tenant_links
          WHERE account_id=$1 AND merchant_tenant_id=$2 AND customer_id=$3 AND status='ACTIVE'`,
        [identity.accountId, group.merchant_tenant_id, group.customer_id],
      );
      if (link.rowCount !== 1)
        throw new PlatformCheckoutUnavailableError('merchant customer link unavailable');
      const key = `life-checkout:${checkoutId}:${group.id}`;
      const requestHash = digest(requestSnapshot);
      const inserted = await client.query(
        `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
         VALUES ($1,'platform.checkout.group',$2,$3,now()+interval '24 hours')
         ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
        [group.merchant_tenant_id, key, requestHash],
      );
      if (inserted.rowCount !== 1) {
        const prior = await client.query<{ request_hash: string; response_body: unknown }>(
          `SELECT request_hash,response_body FROM idempotency_keys
            WHERE tenant_id=$1 AND scope='platform.checkout.group' AND idempotency_key=$2
            FOR UPDATE`,
          [group.merchant_tenant_id, key],
        );
        if (prior.rows[0]?.request_hash !== requestHash)
          throw new PlatformCheckoutConflictError('checkout group replay mismatch');
        const orderId = z.object({ orderId: UuidSchema }).safeParse(prior.rows[0]?.response_body);
        if (!orderId.success)
          throw new PlatformCheckoutConflictError('checkout group creation pending');
        return orderId.data.orderId;
      }
      const variants = await client.query<{
        variant_id: string;
        product_id: string;
        product_type: string;
        product_title: string;
        store_id: string | null;
        unit_price_cents: string | number;
        on_hand: string | number;
        reserved: string | number;
      }>(
        `SELECT variant.id AS variant_id,product.id AS product_id,product.product_type,
                product.title AS product_title,product.store_id,
                variant.sale_price_cents AS unit_price_cents,balance.on_hand,balance.reserved
           FROM product_variants variant
           JOIN products product ON product.tenant_id=variant.tenant_id AND product.id=variant.product_id
           JOIN inventory_balances balance ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
          WHERE variant.tenant_id=$1 AND variant.id=ANY($2::uuid[])
            AND variant.status='ACTIVE' AND product.status='ON_SALE'
          ORDER BY variant.id FOR UPDATE OF balance`,
        [group.merchant_tenant_id, normalizedItems.map((item) => item.variantId)],
      );
      if (variants.rows.length !== normalizedItems.length)
        throw new PlatformCheckoutUnavailableError('quoted product unavailable');
      const byVariant = new Map(variants.rows.map((variant) => [variant.variant_id, variant]));
      const expectedType =
        group.order_type === 'GROUP_BUY'
          ? 'GROUP_BUY'
          : group.order_type === 'SERVICE_APPOINTMENT'
            ? 'SERVICE'
            : 'PHYSICAL';
      for (const item of normalizedItems) {
        const variant = byVariant.get(item.variantId);
        if (
          !variant ||
          variant.product_id !== item.productId ||
          variant.store_id !== group.store_id ||
          variant.product_type !== expectedType ||
          Number(variant.unit_price_cents) !== item.unitPriceCents ||
          Number(variant.on_hand) - Number(variant.reserved) < item.quantity
        )
          throw new PlatformCheckoutUnavailableError('quote changed before order creation');
      }
      const goodsAmountCents = normalizedItems.reduce(
        (total, item) => total + item.unitPriceCents * item.quantity,
        0,
      );
      if (
        goodsAmountCents !== requestSnapshot.goodsAmountCents ||
        requestSnapshot.payableAmountCents !==
          goodsAmountCents +
            requestSnapshot.shippingAmountCents -
            requestSnapshot.discountAmountCents
      )
        throw new PlatformCheckoutUnavailableError('quoted amount no longer reconciles');
      let allocatedDiscount = 0;
      const allocatedItems = normalizedItems.map((item, index) => {
        const allocation =
          index === normalizedItems.length - 1
            ? requestSnapshot.discountAmountCents - allocatedDiscount
            : Math.floor(
                (item.lineAmountCents * requestSnapshot.discountAmountCents) / goodsAmountCents,
              );
        allocatedDiscount += allocation;
        return { ...item, discountAllocationCents: allocation };
      });
      const orderId = randomUUID();
      const orderNo = `LQ${orderId.replace(/-/gu, '').slice(0, 24).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      await client.query(
        `INSERT INTO orders(
           id,tenant_id,order_no,store_id,customer_id,source_channel,status,order_type,
           payment_status,fulfillment_status,verification_status,aftercare_status,
           goods_amount_cents,discount_amount_cents,shipping_amount_cents,payable_amount_cents,
           pricing_snapshot,expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING_PAYMENT',$7,'UNPAID','NOT_STARTED',$8,
                   'NONE',$9,$10,$11,$12,$13::jsonb,$14)`,
        [
          orderId,
          group.merchant_tenant_id,
          orderNo,
          group.store_id,
          group.customer_id,
          group.source_channel,
          group.order_type,
          group.order_type === 'GROUP_BUY' ? 'PENDING' : 'NOT_APPLICABLE',
          goodsAmountCents,
          requestSnapshot.discountAmountCents,
          requestSnapshot.shippingAmountCents,
          requestSnapshot.payableAmountCents,
          JSON.stringify({
            checkout_id: checkoutId,
            checkout_group_id: group.id,
            policy: requestSnapshot.policy,
            discount: requestSnapshot.discount,
          }),
          expiresAt,
        ],
      );
      for (const item of allocatedItems) {
        const orderItemId = randomUUID();
        await client.query(
          `INSERT INTO order_items(
             id,tenant_id,order_id,product_id,variant_id,title_snapshot,quantity,
             unit_price_cents,line_amount_cents,discount_allocation_cents
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            orderItemId,
            group.merchant_tenant_id,
            orderId,
            item.productId,
            item.variantId,
            item.productTitle,
            item.quantity,
            item.unitPriceCents,
            item.lineAmountCents,
            item.discountAllocationCents,
          ],
        );
        await client.query(
          `INSERT INTO inventory_ledger(
             tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
           ) VALUES ($1,$2,'RESERVE',$3,'ORDER',$4,$5)`,
          [
            group.merchant_tenant_id,
            item.variantId,
            item.quantity,
            orderId,
            `order-reserve:${orderId}:${item.variantId}`,
          ],
        );
      }
      await client.query(
        `INSERT INTO order_fulfillments(
           tenant_id,order_id,fulfillment_type,status,fulfillment_snapshot
         ) VALUES ($1,$2,$3,'NOT_STARTED',$4::jsonb)`,
        [
          group.merchant_tenant_id,
          orderId,
          group.order_type,
          JSON.stringify({
            checkout_id: checkoutId,
            checkout_group_id: group.id,
            delivery_address_id: group.delivery_address_id,
            policy: requestSnapshot.policy,
          }),
        ],
      );
      await client.query(
        `INSERT INTO order_state_history(
           tenant_id,order_id,order_status,payment_status,fulfillment_status,
           verification_status,aftercare_status,reason_code,actor_type,actor_id_hash,trace_id
         ) VALUES ($1,$2,'PENDING_PAYMENT','UNPAID','NOT_STARTED',$3,'NONE',
                   'PLATFORM_CHECKOUT_CREATED','CUSTOMER',$4,$5)`,
        [
          group.merchant_tenant_id,
          orderId,
          group.order_type === 'GROUP_BUY' ? 'PENDING' : 'NOT_APPLICABLE',
          digest(identity.accountId),
          `checkout:${checkoutId}`,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(
           tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
           payload,pii_classification,trace_id,occurred_at
         ) VALUES ($1,'order.created.v1','order',$2,1,'order:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now())`,
        [
          group.merchant_tenant_id,
          orderId,
          JSON.stringify({
            order_id: orderId,
            order_no: orderNo,
            store_id: group.store_id,
            customer_id_hash: digest(group.customer_id),
            amount_cents: requestSnapshot.payableAmountCents,
            checkout_id: checkoutId,
            checkout_group_id: group.id,
            expires_at: expiresAt,
          }),
          `checkout:${checkoutId}`,
        ],
      );
      await client.query(
        `UPDATE idempotency_keys SET response_status=201,response_body=$3::jsonb,
                resource_type='order',resource_id=$4
          WHERE tenant_id=$1 AND scope='platform.checkout.group' AND idempotency_key=$2`,
        [group.merchant_tenant_id, key, JSON.stringify({ orderId }), orderId],
      );
      return orderId;
    });
  }

  return {
    async quote(command) {
      const input = QuoteSchema.parse(command.body);
      if (!command.idempotencyKey || command.idempotencyKey.length > 255)
        throw new PlatformCheckoutConflictError('idempotency key is required');
      const normalized = {
        ...input,
        merchantScope: command.merchantScope ?? null,
        sourceChannel: command.sourceChannel ?? 'LEQU_LIFE',
        fulfillmentChoices: [...input.fulfillmentChoices].sort((left, right) =>
          `${left.merchantTenantId}:${left.storeId}:${left.productType}`.localeCompare(
            `${right.merchantTenantId}:${right.storeId}:${right.productType}`,
          ),
        ),
      };
      const requestHash = digest(normalized);
      return transaction(command.identity, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${command.identity.accountId}:quote:${command.idempotencyKey}`,
        ]);
        const replay = await client.query<{ id: string; request_hash: string }>(
          `SELECT id,request_hash FROM platform_checkout_sessions
            WHERE account_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [command.identity.accountId, command.idempotencyKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash)
            throw new PlatformCheckoutConflictError('idempotency key payload mismatch');
          return load(client, command.identity.accountId, replay.rows[0].id);
        }
        const cartResult = await client.query<{ id: string; version: number }>(
          `SELECT id,version FROM shopping_carts
            WHERE account_id=$1 AND status='ACTIVE' FOR UPDATE`,
          [command.identity.accountId],
        );
        const cart = cartResult.rows[0];
        if (!cart || cart.version !== input.cartVersion)
          throw new PlatformCheckoutConflictError('cart changed; refresh before checkout');
        const cartItems = await client.query<{
          id: string;
          merchant_tenant_id: string;
          store_id: string;
          product_id: string;
          variant_id: string;
          quantity: number;
        }>(
          `SELECT id,merchant_tenant_id,store_id,product_id,variant_id,quantity
             FROM shopping_cart_items
            WHERE cart_id=$1
              AND ($2::uuid IS NULL OR merchant_tenant_id=$2)
              AND ($3::uuid IS NULL OR store_id=$3)
            ORDER BY merchant_tenant_id,store_id,product_id,variant_id FOR UPDATE`,
          [
            cart.id,
            command.merchantScope?.tenantId ?? null,
            command.merchantScope?.storeId ?? null,
          ],
        );
        if (cartItems.rows.length === 0)
          throw new PlatformCheckoutUnavailableError('cart is empty');

        const choiceMap = new Map(
          normalized.fulfillmentChoices.map((choice) => [
            `${choice.merchantTenantId}:${choice.storeId}:${choice.productType}`,
            choice,
          ]),
        );
        const quotedGroups = [] as Array<{
          id: string;
          merchantTenantId: string;
          customerId: string;
          storeId: string;
          orderType: string;
          addressId: string | null;
          items: unknown[];
          policy: unknown;
          discount: unknown;
          goodsAmountCents: number;
          discountAmountCents: number;
          shippingAmountCents: number;
          payableAmountCents: number;
        }>;
        const tenantStores = new Map<string, typeof cartItems.rows>();
        for (const item of cartItems.rows) {
          const key = `${item.merchant_tenant_id}:${item.store_id}`;
          tenantStores.set(key, [...(tenantStores.get(key) ?? []), item]);
        }
        for (const items of tenantStores.values()) {
          const first = items[0]!;
          const link = await client.query<{ customer_id: string }>(
            `SELECT customer_id FROM platform_consumer_tenant_links
              WHERE account_id=$1 AND merchant_tenant_id=$2 AND status='ACTIVE'`,
            [command.identity.accountId, first.merchant_tenant_id],
          );
          const customerId = link.rows[0]?.customer_id;
          if (!customerId)
            throw new PlatformCheckoutUnavailableError('merchant customer link unavailable');
          if (command.merchantScope && customerId !== command.merchantScope.customerId)
            throw new PlatformCheckoutUnavailableError('merchant customer scope mismatch');
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            first.merchant_tenant_id,
          ]);
          const policyResult = await client.query<{
            id: string;
            policy_version: string;
            allowed_order_types: string[];
            delivery_fee_cents: string | number;
            free_delivery_threshold_cents: string | number | null;
            estimated_minutes: number | null;
            refund_rule_summary: string;
          }>(
            `SELECT id,policy_version,allowed_order_types,delivery_fee_cents,
                    free_delivery_threshold_cents,estimated_minutes,refund_rule_summary
               FROM store_checkout_policies
              WHERE tenant_id=$1 AND store_id=$2 AND status='ACTIVE'
                AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())`,
            [first.merchant_tenant_id, first.store_id],
          );
          const policy = policyResult.rows[0];
          if (!policy) throw new PlatformCheckoutUnavailableError('checkout policy unavailable');
          const live = await client.query<{
            cart_item_id: string;
            product_id: string;
            variant_id: string;
            product_type: z.infer<typeof ProductTypeSchema> | 'DIGITAL_SUPPLY';
            product_title: string;
            variant_title: string;
            quantity: number;
            unit_price_cents: string | number;
            available_quantity: string | number;
          }>(
            `SELECT item.id AS cart_item_id,product.id AS product_id,variant.id AS variant_id,
                    product.product_type,product.title AS product_title,
                    variant.title AS variant_title,item.quantity,variant.sale_price_cents AS unit_price_cents,
                    GREATEST(balance.on_hand-balance.reserved,0) AS available_quantity
               FROM shopping_cart_items item
               JOIN products product ON product.tenant_id=item.merchant_tenant_id AND product.id=item.product_id
               JOIN product_variants variant ON variant.tenant_id=product.tenant_id AND variant.id=item.variant_id
               JOIN inventory_balances balance ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
              WHERE item.id=ANY($1::uuid[]) AND product.status='ON_SALE' AND variant.status='ACTIVE'
              ORDER BY product.product_type,item.id`,
            [items.map((item) => item.id)],
          );
          if (
            live.rows.length !== items.length ||
            live.rows.some((item) => Number(item.available_quantity) < item.quantity)
          )
            throw new PlatformCheckoutUnavailableError('cart item or inventory unavailable');
          const productGroups = new Map<string, typeof live.rows>();
          for (const item of live.rows) {
            if (item.product_type === 'DIGITAL_SUPPLY')
              throw new PlatformCheckoutUnavailableError('digital supply checkout unsupported');
            productGroups.set(item.product_type, [
              ...(productGroups.get(item.product_type) ?? []),
              item,
            ]);
          }
          for (const [productType, productItems] of productGroups) {
            const typedProductType = ProductTypeSchema.parse(productType);
            const choice = choiceMap.get(
              `${first.merchant_tenant_id}:${first.store_id}:${typedProductType}`,
            );
            const orderType = choice?.orderType ?? defaultOrderType(typedProductType);
            const validType =
              (typedProductType === 'PHYSICAL' &&
                ['PHYSICAL_DELIVERY', 'STORE_PICKUP'].includes(orderType)) ||
              (typedProductType === 'GROUP_BUY' && orderType === 'GROUP_BUY') ||
              (typedProductType === 'SERVICE' && orderType === 'SERVICE_APPOINTMENT');
            if (!validType || !policy.allowed_order_types.includes(orderType))
              throw new PlatformCheckoutUnavailableError('fulfillment type unavailable');
            if (orderType === 'PHYSICAL_DELIVERY') {
              if (!choice?.addressId)
                throw new PlatformCheckoutUnavailableError('delivery address required');
              const address = await client.query(
                `SELECT 1 FROM platform_consumer_addresses
                  WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
                [command.identity.accountId, choice.addressId],
              );
              if (address.rowCount !== 1)
                throw new PlatformCheckoutUnavailableError('delivery address unavailable');
            }
            const itemSnapshot = productItems.map((item) => {
              const unitPriceCents = Number(item.unit_price_cents);
              return {
                cartItemId: item.cart_item_id,
                productId: item.product_id,
                variantId: item.variant_id,
                productTitle: item.product_title,
                variantTitle: item.variant_title,
                quantity: item.quantity,
                unitPriceCents,
                lineAmountCents: unitPriceCents * item.quantity,
              };
            });
            const goodsAmountCents = itemSnapshot.reduce(
              (total, item) => total + item.lineAmountCents,
              0,
            );
            if (!Number.isSafeInteger(goodsAmountCents) || goodsAmountCents <= 0)
              throw new PlatformCheckoutUnavailableError('invalid checkout amount');
            const discountRules = await client.query<{
              id: string;
              rule_version: string;
              display_name: string;
              discount_type: 'FIXED' | 'BASIS_POINTS';
              fixed_discount_cents: string | number | null;
              discount_basis_points: number | null;
              maximum_discount_cents: string | number | null;
            }>(
              `SELECT id,rule_version,display_name,discount_type,fixed_discount_cents,
                      discount_basis_points,maximum_discount_cents
                 FROM commerce_discount_rules
                WHERE tenant_id=$1 AND store_id=$2 AND status='ACTIVE'
                  AND minimum_goods_cents<=$3 AND starts_at<=now()
                  AND (ends_at IS NULL OR ends_at>now())
                ORDER BY priority,id`,
              [first.merchant_tenant_id, first.store_id, goodsAmountCents],
            );
            const candidates = discountRules.rows.map((rule) => {
              const raw =
                rule.discount_type === 'FIXED'
                  ? Number(rule.fixed_discount_cents)
                  : Math.floor((goodsAmountCents * Number(rule.discount_basis_points)) / 10_000);
              return {
                rule,
                amount: Math.min(
                  goodsAmountCents,
                  raw,
                  rule.maximum_discount_cents === null
                    ? Number.MAX_SAFE_INTEGER
                    : Number(rule.maximum_discount_cents),
                ),
              };
            });
            candidates.sort((left, right) => right.amount - left.amount);
            const selectedDiscount = candidates[0];
            const discountAmountCents = selectedDiscount?.amount ?? 0;
            const threshold =
              policy.free_delivery_threshold_cents === null
                ? null
                : Number(policy.free_delivery_threshold_cents);
            const shippingAmountCents =
              orderType === 'PHYSICAL_DELIVERY' &&
              (threshold === null || goodsAmountCents < threshold)
                ? Number(policy.delivery_fee_cents)
                : 0;
            quotedGroups.push({
              id: randomUUID(),
              merchantTenantId: first.merchant_tenant_id,
              customerId,
              storeId: first.store_id,
              orderType,
              addressId: choice?.addressId ?? null,
              items: itemSnapshot,
              policy: {
                id: policy.id,
                version: policy.policy_version,
                estimatedMinutes: policy.estimated_minutes,
                refundRuleSummary: policy.refund_rule_summary,
                freeDeliveryThresholdCents: threshold,
              },
              discount: selectedDiscount
                ? {
                    id: selectedDiscount.rule.id,
                    version: selectedDiscount.rule.rule_version,
                    name: selectedDiscount.rule.display_name,
                    amountCents: discountAmountCents,
                  }
                : { id: null, version: null, name: '无可用优惠', amountCents: 0 },
              goodsAmountCents,
              discountAmountCents,
              shippingAmountCents,
              payableAmountCents: goodsAmountCents + shippingAmountCents - discountAmountCents,
            });
          }
        }
        const totals = quotedGroups.reduce(
          (sum, group) => ({
            goods: sum.goods + group.goodsAmountCents,
            discount: sum.discount + group.discountAmountCents,
            shipping: sum.shipping + group.shippingAmountCents,
            payable: sum.payable + group.payableAmountCents,
          }),
          { goods: 0, discount: 0, shipping: 0, payable: 0 },
        );
        const checkoutId = randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
        await client.query(
          `INSERT INTO platform_checkout_sessions(
             id,account_id,cart_id,cart_version,idempotency_key,request_hash,status,
             goods_amount_cents,discount_amount_cents,shipping_amount_cents,payable_amount_cents,
             reward_redemption_status,expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,'QUOTED',$7,$8,$9,$10,'UNAVAILABLE_PENDING_POLICY',$11)`,
          [
            checkoutId,
            command.identity.accountId,
            cart.id,
            cart.version,
            command.idempotencyKey,
            requestHash,
            totals.goods,
            totals.discount,
            totals.shipping,
            totals.payable,
            expiresAt,
          ],
        );
        for (const group of quotedGroups)
          await client.query(
            `INSERT INTO platform_checkout_groups(
               id,checkout_id,account_id,merchant_tenant_id,customer_id,store_id,source_channel,order_type,
               delivery_address_id,item_snapshot,policy_snapshot,discount_snapshot,
               goods_amount_cents,discount_amount_cents,shipping_amount_cents,payable_amount_cents
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16)`,
            [
              group.id,
              checkoutId,
              command.identity.accountId,
              group.merchantTenantId,
              group.customerId,
              group.storeId,
              command.sourceChannel ?? 'LEQU_LIFE',
              group.orderType,
              group.addressId,
              JSON.stringify(group.items),
              JSON.stringify(group.policy),
              JSON.stringify(group.discount),
              group.goodsAmountCents,
              group.discountAmountCents,
              group.shippingAmountCents,
              group.payableAmountCents,
            ],
          );
        return load(client, command.identity.accountId, checkoutId);
      });
    },

    async submit(command) {
      const checkoutId = UuidSchema.parse(command.checkoutId);
      if (!command.idempotencyKey || command.idempotencyKey.length > 255)
        throw new PlatformCheckoutConflictError('idempotency key is required');
      const submitHash = digest({ checkoutId });
      const prepared = await transaction(command.identity, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${command.identity.accountId}:submit:${command.idempotencyKey}`,
        ]);
        const reusedSubmitKey = await client.query<{ id: string }>(
          `SELECT id FROM platform_checkout_sessions
            WHERE account_id=$1 AND submit_idempotency_key=$2 AND id<>$3`,
          [command.identity.accountId, command.idempotencyKey, checkoutId],
        );
        if (reusedSubmitKey.rowCount)
          throw new PlatformCheckoutConflictError('submit idempotency key already used');
        const checkout = await client.query<{
          status: string;
          cart_id: string;
          cart_version: number;
          expires_at: Date | string;
          submit_idempotency_key: string | null;
          submit_request_hash: string | null;
        }>(
          `SELECT status,cart_id,cart_version,expires_at,submit_idempotency_key,submit_request_hash
             FROM platform_checkout_sessions
            WHERE account_id=$1 AND id=$2 FOR UPDATE`,
          [command.identity.accountId, checkoutId],
        );
        const current = checkout.rows[0];
        if (!current) throw new PlatformCheckoutNotFoundError();
        if (
          current.submit_idempotency_key !== null &&
          (current.submit_idempotency_key !== command.idempotencyKey ||
            current.submit_request_hash !== submitHash)
        )
          throw new PlatformCheckoutConflictError('checkout submit idempotency mismatch');
        if (current.status === 'ORDERS_CREATED')
          return { expired: false, groups: [] as CheckoutGroup[] };
        if (new Date(current.expires_at).getTime() <= Date.now()) {
          await client.query(
            `UPDATE platform_checkout_sessions SET status='EXPIRED',updated_at=now()
              WHERE account_id=$1 AND id=$2`,
            [command.identity.accountId, checkoutId],
          );
          await client.query(
            `UPDATE platform_checkout_groups SET status='EXPIRED',updated_at=now()
              WHERE account_id=$1 AND checkout_id=$2 AND status<>'ORDER_CREATED'`,
            [command.identity.accountId, checkoutId],
          );
          return { expired: true, groups: [] as CheckoutGroup[] };
        }
        const cart = await client.query<{ version: number; status: string }>(
          `SELECT version,status FROM shopping_carts
            WHERE account_id=$1 AND id=$2 FOR UPDATE`,
          [command.identity.accountId, current.cart_id],
        );
        if (cart.rows[0]?.version !== current.cart_version || cart.rows[0]?.status !== 'ACTIVE')
          throw new PlatformCheckoutConflictError('cart changed after quote');
        await client.query(
          `UPDATE platform_checkout_sessions
              SET status='SUBMITTING',submit_idempotency_key=$3,submit_request_hash=$4,
                  submitted_at=COALESCE(submitted_at,now()),updated_at=now()
            WHERE account_id=$1 AND id=$2`,
          [command.identity.accountId, checkoutId, command.idempotencyKey, submitHash],
        );
        await client.query(
          `UPDATE platform_checkout_groups SET status='SUBMITTING',last_error_code=NULL,
                  updated_at=now()
            WHERE account_id=$1 AND checkout_id=$2 AND status<>'ORDER_CREATED'`,
          [command.identity.accountId, checkoutId],
        );
        const pending = await client.query<CheckoutGroup>(
          `SELECT id,merchant_tenant_id,customer_id,store_id,source_channel,order_type,delivery_address_id,
                  item_snapshot,policy_snapshot,discount_snapshot,goods_amount_cents,
                  discount_amount_cents,shipping_amount_cents,payable_amount_cents,status,order_id
             FROM platform_checkout_groups
            WHERE account_id=$1 AND checkout_id=$2 AND order_id IS NULL
            ORDER BY merchant_tenant_id,store_id,order_type`,
          [command.identity.accountId, checkoutId],
        );
        return { expired: false, groups: pending.rows };
      });
      if (prepared.expired) throw new PlatformCheckoutUnavailableError('checkout quote expired');
      for (const group of prepared.groups) {
        try {
          const orderId = await createGroupOrder(command.identity, checkoutId, group);
          await transaction(command.identity, async (client) => {
            await client.query(
              `UPDATE platform_checkout_groups
                  SET status='ORDER_CREATED',order_id=$4,last_error_code=NULL,updated_at=now()
                WHERE account_id=$1 AND checkout_id=$2 AND id=$3 AND order_id IS NULL`,
              [command.identity.accountId, checkoutId, group.id, orderId],
            );
          });
        } catch (error) {
          const errorCode =
            error instanceof PlatformCheckoutConflictError
              ? 'IDEMPOTENCY_CONFLICT'
              : error instanceof PlatformCheckoutUnavailableError
                ? 'QUOTE_CHANGED'
                : 'ORDER_CREATION_FAILED';
          await transaction(command.identity, async (client) => {
            await client.query(
              `UPDATE platform_checkout_groups
                  SET status='FAILED',last_error_code=$4,updated_at=now()
                WHERE account_id=$1 AND checkout_id=$2 AND id=$3 AND order_id IS NULL`,
              [command.identity.accountId, checkoutId, group.id, errorCode],
            );
          });
        }
      }
      return transaction(command.identity, async (client) => {
        const counts = await client.query<{
          total: string | number;
          created: string | number;
          failed: string | number;
        }>(
          `SELECT count(*)::bigint AS total,
                  count(*) FILTER (WHERE status='ORDER_CREATED')::bigint AS created,
                  count(*) FILTER (WHERE status='FAILED')::bigint AS failed
             FROM platform_checkout_groups WHERE account_id=$1 AND checkout_id=$2`,
          [command.identity.accountId, checkoutId],
        );
        const total = Number(counts.rows[0]?.total ?? 0);
        const created = Number(counts.rows[0]?.created ?? 0);
        const failed = Number(counts.rows[0]?.failed ?? 0);
        const status =
          total > 0 && created === total
            ? 'ORDERS_CREATED'
            : created > 0
              ? 'PARTIAL'
              : failed > 0
                ? 'FAILED'
                : 'SUBMITTING';
        await client.query(
          `UPDATE platform_checkout_sessions SET status=$3,updated_at=now()
            WHERE account_id=$1 AND id=$2`,
          [command.identity.accountId, checkoutId, status],
        );
        if (status === 'ORDERS_CREATED')
          await client.query(
            `UPDATE shopping_carts SET status='CHECKED_OUT',checked_out_at=now(),
                    version=version+1,updated_at=now()
              WHERE account_id=$1 AND id=(
                SELECT cart_id FROM platform_checkout_sessions WHERE account_id=$1 AND id=$2
              ) AND status='ACTIVE'`,
            [command.identity.accountId, checkoutId],
          );
        return load(client, command.identity.accountId, checkoutId);
      });
    },

    async get(identity, rawCheckoutId) {
      const checkoutId = UuidSchema.parse(rawCheckoutId);
      return transaction(identity, (client) => load(client, identity.accountId, checkoutId));
    },
  };
}
