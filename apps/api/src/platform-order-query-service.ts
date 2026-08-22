import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const ListQuerySchema = z.object({
  status: z
    .enum(['PENDING_PAYMENT', 'PAID', 'FULFILLING', 'COMPLETED', 'CANCELLED', 'CLOSED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface PlatformOrderQueryService {
  list(identity: LifeConsumerSessionIdentity, query: unknown): Promise<unknown[]>;
  get(identity: LifeConsumerSessionIdentity, orderId: string): Promise<unknown>;
}

export class PlatformOrderQueryAuthenticationError extends Error {}
export class PlatformOrderQueryNotFoundError extends Error {}

export function createPlatformOrderQueryService(
  pool: Pick<pg.Pool, 'connect'>,
): PlatformOrderQueryService {
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
      if (session.rowCount !== 1) throw new PlatformOrderQueryAuthenticationError();
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

  async function links(client: pg.PoolClient, accountId: string) {
    const result = await client.query<{ merchant_tenant_id: string; customer_id: string }>(
      `SELECT merchant_tenant_id,customer_id
         FROM platform_consumer_tenant_links
        WHERE account_id=$1 AND status='ACTIVE'
        ORDER BY merchant_tenant_id`,
      [accountId],
    );
    return result.rows;
  }

  const mapOrder = (row: {
    id: string;
    order_no: string;
    store_id: string;
    store_name: string;
    source_channel: string;
    order_type: string;
    status: string;
    payment_status: string;
    fulfillment_status: string;
    verification_status: string;
    aftercare_status: string;
    payable_amount_cents: string | number;
    goods_amount_cents?: string | number;
    discount_amount_cents?: string | number;
    shipping_amount_cents?: string | number;
    paid_amount_cents: string | number;
    refunded_amount_cents: string | number;
    currency: string;
    created_at: Date | string;
    updated_at: Date | string;
    merchant_tenant_id: string;
  }) => ({
    id: row.id,
    orderNo: row.order_no,
    merchantTenantId: row.merchant_tenant_id,
    storeId: row.store_id,
    storeName: row.store_name,
    sourceChannel: row.source_channel,
    orderType: row.order_type,
    status: row.status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    verificationStatus: row.verification_status,
    aftercareStatus: row.aftercare_status,
    payableAmountCents: Number(row.payable_amount_cents),
    goodsAmountCents: Number(row.goods_amount_cents ?? row.payable_amount_cents),
    discountAmountCents: Number(row.discount_amount_cents ?? 0),
    shippingAmountCents: Number(row.shipping_amount_cents ?? 0),
    paidAmountCents: Number(row.paid_amount_cents),
    refundedAmountCents: Number(row.refunded_amount_cents),
    currency: row.currency,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  });

  return {
    async list(identity, rawQuery) {
      const query = ListQuerySchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const rows: Array<ReturnType<typeof mapOrder>> = [];
        for (const link of await links(client, identity.accountId)) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            link.merchant_tenant_id,
          ]);
          const result = await client.query(
            `SELECT orders.id,orders.order_no,orders.store_id,store.store_name,
                    orders.source_channel,orders.order_type,orders.status,orders.payment_status,
                    orders.fulfillment_status,orders.verification_status,orders.aftercare_status,
                    orders.goods_amount_cents,orders.discount_amount_cents,
                    orders.shipping_amount_cents,orders.payable_amount_cents,orders.paid_amount_cents,
                    orders.refunded_amount_cents,orders.currency,orders.created_at,orders.updated_at,
                    orders.tenant_id AS merchant_tenant_id
               FROM orders
               JOIN stores store ON store.tenant_id=orders.tenant_id AND store.id=orders.store_id
              WHERE orders.tenant_id=$1 AND orders.customer_id=$2
                AND ($3::text IS NULL OR orders.status=$3)
              ORDER BY orders.created_at DESC,orders.id
              LIMIT $4`,
            [link.merchant_tenant_id, link.customer_id, query.status ?? null, query.limit],
          );
          rows.push(...result.rows.map(mapOrder));
        }
        return rows
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, query.limit);
      });
    },

    async get(identity, rawOrderId) {
      const orderId = UuidSchema.parse(rawOrderId);
      return transaction(identity, async (client) => {
        for (const link of await links(client, identity.accountId)) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            link.merchant_tenant_id,
          ]);
          const result = await client.query(
            `SELECT orders.id,orders.order_no,orders.store_id,store.store_name,
                    orders.source_channel,orders.order_type,orders.status,orders.payment_status,
                    orders.fulfillment_status,orders.verification_status,orders.aftercare_status,
                    orders.goods_amount_cents,orders.discount_amount_cents,
                    orders.shipping_amount_cents,orders.payable_amount_cents,orders.paid_amount_cents,
                    orders.refunded_amount_cents,orders.currency,orders.created_at,orders.updated_at,
                    orders.tenant_id AS merchant_tenant_id
               FROM orders
               JOIN stores store ON store.tenant_id=orders.tenant_id AND store.id=orders.store_id
              WHERE orders.tenant_id=$1 AND orders.customer_id=$2 AND orders.id=$3`,
            [link.merchant_tenant_id, link.customer_id, orderId],
          );
          const row = result.rows[0];
          if (!row) continue;
          const items = await client.query<{
            id: string;
            product_id: string;
            variant_id: string;
            title_snapshot: string;
            quantity: number;
            unit_price_cents: string | number;
            line_amount_cents: string | number;
            refunded_quantity: number;
            refunded_amount_cents: string | number;
          }>(
            `SELECT id,product_id,variant_id,title_snapshot,quantity,unit_price_cents,
                    line_amount_cents,refunded_quantity,refunded_amount_cents
               FROM order_items
              WHERE tenant_id=$1 AND order_id=$2
              ORDER BY id`,
            [link.merchant_tenant_id, orderId],
          );
          return {
            ...mapOrder(row),
            items: items.rows.map((item) => ({
              id: item.id,
              productId: item.product_id,
              variantId: item.variant_id,
              title: item.title_snapshot,
              quantity: item.quantity,
              unitPriceCents: Number(item.unit_price_cents),
              lineAmountCents: Number(item.line_amount_cents),
              refundedQuantity: item.refunded_quantity,
              refundedAmountCents: Number(item.refunded_amount_cents),
            })),
          };
        }
        throw new PlatformOrderQueryNotFoundError();
      });
    },
  };
}
