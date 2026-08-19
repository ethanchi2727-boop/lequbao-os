import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const OrderTypeSchema = z.enum([
  'PHYSICAL_DELIVERY',
  'STORE_PICKUP',
  'GROUP_BUY',
  'SERVICE_APPOINTMENT',
]);
const CreateOrderSchema = z.object({
  storeId: UuidSchema,
  sourceChannel: z.enum(['MERCHANT_MINI_PROGRAM', 'LEQU_LIFE']),
  orderType: OrderTypeSchema,
  items: z
    .array(
      z.object({
        variantId: UuidSchema,
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(50),
});
const ListOrdersSchema = z.object({
  status: z
    .enum(['PENDING_PAYMENT', 'PAID', 'FULFILLING', 'COMPLETED', 'CANCELLED', 'CLOSED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const OrderItemSchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  variantId: UuidSchema,
  title: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineAmountCents: z.number().int().nonnegative(),
  refundedQuantity: z.number().int().nonnegative(),
});
const CommerceOrderSchema = z.object({
  id: UuidSchema,
  orderNo: z.string(),
  storeId: UuidSchema,
  customerId: UuidSchema,
  sourceChannel: z.string(),
  orderType: OrderTypeSchema,
  status: z.string(),
  paymentStatus: z.string(),
  fulfillmentStatus: z.string(),
  verificationStatus: z.string(),
  aftercareStatus: z.string(),
  goodsAmountCents: z.number().int().nonnegative(),
  discountAmountCents: z.number().int().nonnegative(),
  shippingAmountCents: z.number().int().nonnegative(),
  payableAmountCents: z.number().int().nonnegative(),
  paidAmountCents: z.number().int().nonnegative(),
  refundedAmountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  expiresAt: z.string().nullable(),
  version: z.number().int().positive(),
  pricingSnapshot: z.record(z.string(), z.unknown()),
  items: z.array(OrderItemSchema),
});

type StaffIdentity = SessionIdentity & {
  accessScopes?: string[];
  assignedStoreIds?: string[];
};
type ConsumerCommand = {
  identity: ConsumerSessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export type CommerceOrder = z.infer<typeof CommerceOrderSchema>;

export interface CommerceOrderService {
  create(command: ConsumerCommand): Promise<CommerceOrder>;
  listForConsumer(identity: ConsumerSessionIdentity, query: unknown): Promise<CommerceOrder[]>;
  getForConsumer(identity: ConsumerSessionIdentity, orderId: string): Promise<CommerceOrder>;
  getForStaff(identity: StaffIdentity, orderId: string): Promise<CommerceOrder>;
  expire(input: { tenantId: string; orderId: string; traceId: string }): Promise<CommerceOrder>;
}

export class CommerceOrderAuthenticationError extends Error {}
export class CommerceOrderAuthorizationError extends Error {}
export class CommerceOrderStateError extends Error {}
export class CommerceInventoryUnavailableError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(',')}}`;
};

const expectedProductType: Record<z.infer<typeof OrderTypeSchema>, string> = {
  PHYSICAL_DELIVERY: 'PHYSICAL',
  STORE_PICKUP: 'PHYSICAL',
  GROUP_BUY: 'GROUP_BUY',
  SERVICE_APPOINTMENT: 'SERVICE',
};

export function createCommerceOrderService(pool: Pick<pg.Pool, 'connect'>): CommerceOrderService {
  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
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

  async function validateConsumer(client: pg.PoolClient, identity: ConsumerSessionIdentity) {
    const result = await client.query(
      `SELECT 1 FROM consumer_sessions
        WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
          AND revoked_at IS NULL AND expires_at>now()`,
      [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
    );
    if (result.rowCount !== 1) throw new CommerceOrderAuthenticationError();
  }

  function assertStaffStore(identity: StaffIdentity, storeId: string) {
    const scopes = identity.accessScopes ?? [];
    if (scopes.some((scope) => ['TENANT', 'ALL'].includes(scope))) return;
    if (
      scopes.includes('STORE') &&
      (identity.assignedStoreIds ?? identity.storeIds).includes(storeId)
    )
      return;
    throw new CommerceOrderAuthorizationError();
  }

  async function reserve(client: pg.PoolClient, tenantId: string, key: string, request: unknown) {
    const hash = digest(canonical(request));
    const inserted = await client.query(
      `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
       VALUES ($1,'commerce.order.create',$2,$3,now()+interval '24 hours')
       ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
      [tenantId, key, hash],
    );
    if (inserted.rowCount === 1) return undefined;
    const prior = await client.query<{ request_hash: string; response_body: unknown }>(
      `SELECT request_hash,response_body FROM idempotency_keys
        WHERE tenant_id=$1 AND scope='commerce.order.create' AND idempotency_key=$2 FOR UPDATE`,
      [tenantId, key],
    );
    const row = prior.rows[0];
    if (!row || row.request_hash !== hash) throw new IdempotencyConflictError();
    if (row.response_body === null) throw new CommerceOrderStateError('order command pending');
    return CommerceOrderSchema.parse(row.response_body);
  }

  async function complete(
    client: pg.PoolClient,
    tenantId: string,
    key: string,
    response: CommerceOrder,
  ) {
    await client.query(
      `UPDATE idempotency_keys SET response_status=201,response_body=$3::jsonb,
              resource_type='order',resource_id=$4
        WHERE tenant_id=$1 AND scope='commerce.order.create' AND idempotency_key=$2`,
      [tenantId, key, JSON.stringify(response), response.id],
    );
  }

  async function loadOrder(client: pg.PoolClient, tenantId: string, orderId: string) {
    const header = await client.query<{
      id: string;
      order_no: string;
      store_id: string;
      customer_id: string;
      source_channel: string;
      order_type: z.infer<typeof OrderTypeSchema>;
      status: string;
      payment_status: string;
      fulfillment_status: string;
      verification_status: string;
      aftercare_status: string;
      goods_amount_cents: string | number;
      discount_amount_cents: string | number;
      shipping_amount_cents?: string | number;
      payable_amount_cents: string | number;
      paid_amount_cents: string | number;
      refunded_amount_cents: string | number;
      currency: string;
      expires_at: Date | string | null;
      version: number;
      pricing_snapshot?: unknown;
    }>(
      `SELECT id,order_no,store_id,customer_id,source_channel,order_type,status,payment_status,
              fulfillment_status,verification_status,aftercare_status,goods_amount_cents,
              discount_amount_cents,shipping_amount_cents,payable_amount_cents,paid_amount_cents,
              refunded_amount_cents,currency,expires_at,version,pricing_snapshot
         FROM orders WHERE tenant_id=$1 AND id=$2`,
      [tenantId, orderId],
    );
    const row = header.rows[0];
    if (!row) throw new CommerceOrderAuthorizationError();
    const items = await client.query<{
      id: string;
      product_id: string;
      variant_id: string;
      title_snapshot: string;
      quantity: number;
      unit_price_cents: string | number;
      line_amount_cents: string | number;
      refunded_quantity: number;
    }>(
      `SELECT id,product_id,variant_id,title_snapshot,quantity,unit_price_cents,
              line_amount_cents,refunded_quantity
         FROM order_items WHERE tenant_id=$1 AND order_id=$2 ORDER BY id`,
      [tenantId, orderId],
    );
    return CommerceOrderSchema.parse({
      id: row.id,
      orderNo: row.order_no,
      storeId: row.store_id,
      customerId: row.customer_id,
      sourceChannel: row.source_channel,
      orderType: row.order_type,
      status: row.status,
      paymentStatus: row.payment_status,
      fulfillmentStatus: row.fulfillment_status,
      verificationStatus: row.verification_status,
      aftercareStatus: row.aftercare_status,
      goodsAmountCents: Number(row.goods_amount_cents),
      discountAmountCents: Number(row.discount_amount_cents),
      shippingAmountCents: Number(row.shipping_amount_cents ?? 0),
      payableAmountCents: Number(row.payable_amount_cents),
      paidAmountCents: Number(row.paid_amount_cents),
      refundedAmountCents: Number(row.refunded_amount_cents),
      currency: row.currency,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      version: row.version,
      pricingSnapshot:
        row.pricing_snapshot && typeof row.pricing_snapshot === 'object'
          ? row.pricing_snapshot
          : {},
      items: items.rows.map((item) => ({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        title: item.title_snapshot,
        quantity: item.quantity,
        unitPriceCents: Number(item.unit_price_cents),
        lineAmountCents: Number(item.line_amount_cents),
        refundedQuantity: item.refunded_quantity,
      })),
    });
  }

  return {
    async create(command) {
      const input = CreateOrderSchema.parse(command.body);
      if (input.storeId !== command.identity.storeId)
        throw new CommerceOrderAuthorizationError('consumer store mismatch');
      if (new Set(input.items.map((item) => item.variantId)).size !== input.items.length)
        throw new CommerceOrderStateError('duplicate variants must be combined');
      const normalized = {
        ...input,
        items: [...input.items].sort((left, right) =>
          left.variantId.localeCompare(right.variantId),
        ),
      };
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const replay = await reserve(
          client,
          command.identity.tenantId,
          command.idempotencyKey,
          normalized,
        );
        if (replay) return replay;
        const variants = await client.query<{
          variant_id: string;
          product_id: string;
          product_type: string;
          product_title: string;
          store_id: string | null;
          unit_price_cents: string | number;
          on_hand: string | number;
          reserved: string | number;
          reward_rule_snapshot: unknown;
        }>(
          `SELECT variant.id AS variant_id,product.id AS product_id,product.product_type,
                  product.title AS product_title,product.store_id,
                  variant.sale_price_cents AS unit_price_cents,inventory.on_hand,inventory.reserved,
                  COALESCE(NULLIF(product.reward_rule_snapshot,'{}'::jsonb),
                    CASE WHEN default_rule.id IS NOT NULL THEN jsonb_build_object(
                      'amount_cents',(default_rule.grant_config->>'amountCents')::bigint,
                      'version',default_rule.version::text,
                      'funding_source',default_rule.funding_source,
                      'reversal_policy',default_rule.reversal_policy
                    ) ELSE '{}'::jsonb END) AS reward_rule_snapshot
             FROM product_variants variant
             JOIN products product ON product.tenant_id=variant.tenant_id AND product.id=variant.product_id
             JOIN inventory_balances inventory
               ON inventory.tenant_id=variant.tenant_id AND inventory.variant_id=variant.id
             LEFT JOIN LATERAL (
               SELECT id,version,funding_source,grant_config,reversal_policy
                 FROM reward_rule_versions
                WHERE tenant_id=product.tenant_id AND status='ACTIVE'
                  AND trigger_code='ORDER_PAID' AND effective_at<=now()
                ORDER BY effective_at DESC,version DESC LIMIT 1
             ) default_rule ON true
            WHERE variant.tenant_id=$1 AND variant.id=ANY($2::uuid[])
              AND variant.status='ACTIVE' AND product.status='ON_SALE'
            ORDER BY variant.id FOR UPDATE OF inventory`,
          [command.identity.tenantId, normalized.items.map((item) => item.variantId)],
        );
        if (variants.rows.length !== normalized.items.length)
          throw new CommerceInventoryUnavailableError('product or inventory unavailable');
        const byVariant = new Map(variants.rows.map((variant) => [variant.variant_id, variant]));
        let goodsAmountCents = 0;
        const pricedItems = normalized.items.map((item) => {
          const variant = byVariant.get(item.variantId)!;
          if (
            (variant.store_id !== null && variant.store_id !== input.storeId) ||
            variant.product_type !== expectedProductType[input.orderType] ||
            Number(variant.on_hand) - Number(variant.reserved) < item.quantity
          )
            throw new CommerceInventoryUnavailableError('sellable inventory unavailable');
          const unitPriceCents = Number(variant.unit_price_cents);
          const lineAmountCents = unitPriceCents * item.quantity;
          if (!Number.isSafeInteger(lineAmountCents))
            throw new CommerceOrderStateError('order amount exceeds safe range');
          goodsAmountCents += lineAmountCents;
          return { ...item, ...variant, unitPriceCents, lineAmountCents, itemId: randomUUID() };
        });
        if (!Number.isSafeInteger(goodsAmountCents) || goodsAmountCents <= 0)
          throw new CommerceOrderStateError('order amount is invalid');
        const orderId = randomUUID();
        const orderNo = `LQ${orderId.replace(/-/gu, '').slice(0, 24).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        await client.query(
          `INSERT INTO orders(
             id,tenant_id,order_no,store_id,customer_id,source_channel,status,order_type,
             payment_status,fulfillment_status,verification_status,aftercare_status,
             goods_amount_cents,discount_amount_cents,payable_amount_cents,expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING_PAYMENT',$7,'UNPAID','NOT_STARTED',$8,
                     'NONE',$9,0,$9,$10)`,
          [
            orderId,
            command.identity.tenantId,
            orderNo,
            input.storeId,
            command.identity.customerId,
            input.sourceChannel,
            input.orderType,
            input.orderType === 'GROUP_BUY' ? 'PENDING' : 'NOT_APPLICABLE',
            goodsAmountCents,
            expiresAt,
          ],
        );
        for (const item of pricedItems) {
          await client.query(
            `INSERT INTO order_items(
               id,tenant_id,order_id,product_id,variant_id,title_snapshot,quantity,
               unit_price_cents,line_amount_cents,reward_rule_snapshot
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
            [
              item.itemId,
              command.identity.tenantId,
              orderId,
              item.product_id,
              item.variantId,
              item.product_title,
              item.quantity,
              item.unitPriceCents,
              item.lineAmountCents,
              JSON.stringify(item.reward_rule_snapshot ?? {}),
            ],
          );
          await client.query(
            `INSERT INTO inventory_ledger(
               tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
             ) VALUES ($1,$2,'RESERVE',$3,'ORDER',$4,$5)`,
            [
              command.identity.tenantId,
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
            command.identity.tenantId,
            orderId,
            input.orderType,
            JSON.stringify({ source_channel: input.sourceChannel }),
          ],
        );
        await client.query(
          `INSERT INTO order_state_history(
             tenant_id,order_id,order_status,payment_status,fulfillment_status,
             verification_status,aftercare_status,reason_code,actor_type,actor_id_hash,trace_id
           ) VALUES ($1,$2,'PENDING_PAYMENT','UNPAID','NOT_STARTED',$3,'NONE',
                     'ORDER_CREATED','CUSTOMER',$4,$5)`,
          [
            command.identity.tenantId,
            orderId,
            input.orderType === 'GROUP_BUY' ? 'PENDING' : 'NOT_APPLICABLE',
            digest(command.identity.customerId),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'order.created.v1','order',$2,1,'order:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now())`,
          [
            command.identity.tenantId,
            orderId,
            JSON.stringify({
              order_id: orderId,
              order_no: orderNo,
              store_id: input.storeId,
              customer_id_hash: digest(command.identity.customerId),
              amount_cents: goodsAmountCents,
              item_refs: pricedItems.map((item) => ({
                order_item_id: item.itemId,
                variant_id: item.variantId,
                quantity: item.quantity,
              })),
              expires_at: expiresAt,
            }),
            command.traceId,
          ],
        );
        const response = await loadOrder(client, command.identity.tenantId, orderId);
        await complete(client, command.identity.tenantId, command.idempotencyKey, response);
        return response;
      });
    },

    async getForConsumer(identity, rawOrderId) {
      const orderId = UuidSchema.parse(rawOrderId);
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const order = await loadOrder(client, identity.tenantId, orderId);
        if (order.customerId !== identity.customerId) throw new CommerceOrderAuthorizationError();
        return order;
      });
    },

    async listForConsumer(identity, rawQuery) {
      const query = ListOrdersSchema.parse(rawQuery);
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const ids = await client.query<{ id: string }>(
          `SELECT id FROM orders
            WHERE tenant_id=$1 AND customer_id=$2 AND store_id=$3
              AND source_channel='MERCHANT_MINI_PROGRAM'
              AND ($4::text IS NULL OR status=$4)
            ORDER BY created_at DESC,id
            LIMIT $5`,
          [
            identity.tenantId,
            identity.customerId,
            identity.storeId,
            query.status ?? null,
            query.limit,
          ],
        );
        const orders = [];
        for (const row of ids.rows) orders.push(await loadOrder(client, identity.tenantId, row.id));
        return orders;
      });
    },

    async getForStaff(identity, rawOrderId) {
      const orderId = UuidSchema.parse(rawOrderId);
      return transaction(identity.tenantId, async (client) => {
        const order = await loadOrder(client, identity.tenantId, orderId);
        assertStaffStore(identity, order.storeId);
        return order;
      });
    },

    async expire(input) {
      const orderId = UuidSchema.parse(input.orderId);
      return transaction(input.tenantId, async (client) => {
        const locked = await client.query<{
          status: string;
          expires_at: Date | string | null;
          inventory_released_at: Date | string | null;
        }>(
          `SELECT status,expires_at,inventory_released_at FROM orders
            WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [input.tenantId, orderId],
        );
        const current = locked.rows[0];
        if (!current) throw new CommerceOrderAuthorizationError();
        if (
          current.status !== 'PENDING_PAYMENT' ||
          !current.expires_at ||
          new Date(current.expires_at).getTime() > Date.now()
        )
          return loadOrder(client, input.tenantId, orderId);
        if (!current.inventory_released_at) {
          const quantities = await client.query<{ variant_id: string; quantity: string | number }>(
            `SELECT variant_id,sum(quantity)::bigint AS quantity FROM order_items
              WHERE tenant_id=$1 AND order_id=$2 GROUP BY variant_id ORDER BY variant_id`,
            [input.tenantId, orderId],
          );
          for (const item of quantities.rows)
            await client.query(
              `INSERT INTO inventory_ledger(
                 tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
               ) VALUES ($1,$2,'RELEASE',$3,'ORDER_EXPIRY',$4,$5)`,
              [
                input.tenantId,
                item.variant_id,
                Number(item.quantity),
                orderId,
                `order-expire:${orderId}:${item.variant_id}`,
              ],
            );
        }
        await client.query(
          `UPDATE payment_intents SET status='EXPIRED',failure_code='ORDER_EXPIRED',version=version+1
            WHERE tenant_id=$1 AND order_id=$2 AND status IN ('CREATED','PROCESSING')`,
          [input.tenantId, orderId],
        );
        await client.query(
          `UPDATE orders SET status='CANCELLED',payment_status='FAILED',cancelled_at=now(),
                  inventory_released_at=COALESCE(inventory_released_at,now()),version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='PENDING_PAYMENT'`,
          [input.tenantId, orderId],
        );
        await client.query(
          `INSERT INTO order_state_history(
             tenant_id,order_id,order_status,payment_status,fulfillment_status,
             verification_status,aftercare_status,reason_code,actor_type,actor_id_hash,trace_id
           ) SELECT tenant_id,id,status,payment_status,fulfillment_status,verification_status,
                    aftercare_status,'PAYMENT_TIMEOUT','SYSTEM',$3,$4
               FROM orders WHERE tenant_id=$1 AND id=$2`,
          [input.tenantId, orderId, digest('commerce-order-expiry-worker'), input.traceId],
        );
        return loadOrder(client, input.tenantId, orderId);
      });
    },
  };
}
