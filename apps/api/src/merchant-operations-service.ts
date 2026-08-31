import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

const ListQuerySchema = z.object({
  storeId: UuidSchema.optional(),
  status: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const ProductQuerySchema = ListQuerySchema.extend({
  productType: z.enum(['PHYSICAL', 'SERVICE', 'GROUP_BUY', 'DIGITAL_SUPPLY']).optional(),
});
const CustomerQuerySchema = ListQuerySchema.extend({
  query: z.string().trim().min(1).max(80).optional(),
});
const PublishProductSchema = z.object({
  expectedVersion: z.number().int().positive(),
  confirmed: z.literal(true),
});

export class MerchantOperationsAuthorizationError extends Error {}
export class MerchantOperationsConflictError extends Error {}
export class MerchantOperationsStateError extends Error {}

type OperationsIdentity = SessionIdentity & Partial<AuthorizationContext>;

export interface MerchantOperationsService {
  getMerchantProfile(identity: OperationsIdentity): Promise<unknown>;
  listStores(identity: OperationsIdentity): Promise<unknown[]>;
  listProducts(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  publishProduct(
    identity: OperationsIdentity,
    productId: string,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listOrders(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  getOrder(identity: OperationsIdentity, orderId: string): Promise<unknown>;
  listRefunds(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  listVerificationUses(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  listReconciliations(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  listCustomers(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  getCustomer(identity: OperationsIdentity, customerId: string): Promise<unknown>;
  listCustomerRewards(identity: OperationsIdentity, customerId: string): Promise<unknown[]>;
}

function storeScope(identity: OperationsIdentity, requestedStoreId?: string): string[] | null {
  if (!identity.accessScopes || !identity.assignedStoreIds)
    throw new MerchantOperationsAuthorizationError();
  if (identity.accessScopes.some((scope) => ['TENANT', 'ALL'].includes(scope)))
    return requestedStoreId ? [requestedStoreId] : null;
  const allowed = [...new Set(identity.assignedStoreIds)];
  if (requestedStoreId) {
    if (!allowed.includes(requestedStoreId)) throw new MerchantOperationsAuthorizationError();
    return [requestedStoreId];
  }
  if (allowed.length === 0) throw new MerchantOperationsAuthorizationError();
  return allowed;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

export function createMerchantOperationsService(
  pool: Pick<pg.Pool, 'connect'>,
): MerchantOperationsService {
  async function transaction<T>(
    identity: OperationsIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
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

  return {
    getMerchantProfile(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query<{
          id: string;
          legal_subject_name: string;
          industry_code: string;
          service_region_codes: string[];
          profile_status: string;
          verified_at: Date | string | null;
          version: number;
          updated_at: Date | string;
        }>(
          `SELECT id,legal_subject_name,industry_code,service_region_codes,profile_status,
                  verified_at,version,updated_at
             FROM merchant_profiles WHERE tenant_id=$1`,
          [identity.tenantId],
        );
        const row = result.rows[0];
        if (!row) throw new MerchantOperationsAuthorizationError();
        return {
          id: row.id,
          legalSubjectName: row.legal_subject_name,
          merchantName: row.legal_subject_name,
          industryCode: row.industry_code,
          serviceRegionCodes: row.service_region_codes,
          status: row.profile_status,
          verifiedAt: iso(row.verified_at),
          version: row.version,
          updatedAt: iso(row.updated_at),
        };
      });
    },

    listStores(identity) {
      const stores = storeScope(identity);
      return transaction(identity, async (client) => {
        const result = await client.query<{
          id: string;
          store_code: string;
          store_name: string;
          status: string;
          province_code: string | null;
          city_code: string | null;
          district_code: string | null;
          opening_hours: unknown;
          version: number;
          updated_at: Date | string;
        }>(
          `SELECT id,store_code,store_name,status,province_code,city_code,district_code,
                  opening_hours,version,updated_at
             FROM stores
            WHERE tenant_id=$1 AND ($2::uuid[] IS NULL OR id=ANY($2))
            ORDER BY store_name,id`,
          [identity.tenantId, stores],
        );
        return result.rows.map((row) => ({
          id: row.id,
          storeCode: row.store_code,
          storeName: row.store_name,
          status: row.status,
          regionCodes: [row.province_code, row.city_code, row.district_code].filter(Boolean),
          openingHours: row.opening_hours,
          version: row.version,
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    listProducts(identity, rawQuery) {
      const query = ProductQuerySchema.parse(rawQuery);
      const stores = storeScope(identity, query.storeId);
      return transaction(identity, async (client) => {
        const result = await client.query<{
          id: string;
          store_id: string | null;
          product_type: string;
          title: string;
          status: string;
          sale_price_cents: string | number;
          market_price_cents: string | number | null;
          version: number;
          variant_count: string | number;
          on_hand: string | number;
          reserved: string | number;
          updated_at: Date | string;
        }>(
          `SELECT product.id,product.store_id,product.product_type,product.title,product.status,
                  product.sale_price_cents,product.market_price_cents,product.version,product.updated_at,
                  count(DISTINCT variant.id) AS variant_count,
                  COALESCE(sum(balance.on_hand),0) AS on_hand,
                  COALESCE(sum(balance.reserved),0) AS reserved
             FROM products product
             LEFT JOIN product_variants variant
               ON variant.tenant_id=product.tenant_id AND variant.product_id=product.id
             LEFT JOIN inventory_balances balance
               ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
            WHERE product.tenant_id=$1
              AND ($2::uuid[] IS NULL OR product.store_id=ANY($2))
              AND ($3::text IS NULL OR product.status=$3)
              AND ($4::text IS NULL OR product.product_type=$4)
            GROUP BY product.id
            ORDER BY product.updated_at DESC,product.id
            LIMIT $5`,
          [identity.tenantId, stores, query.status ?? null, query.productType ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          productType: row.product_type,
          title: row.title,
          status: row.status,
          salePriceCents: Number(row.sale_price_cents),
          marketPriceCents: row.market_price_cents === null ? null : Number(row.market_price_cents),
          variantCount: Number(row.variant_count),
          onHand: Number(row.on_hand),
          reserved: Number(row.reserved),
          version: row.version,
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    publishProduct(identity, productId, idempotencyKey, rawTraceId, rawBody) {
      const body = PublishProductSchema.parse(rawBody);
      UuidSchema.parse(productId);
      if (!idempotencyKey || idempotencyKey.length > 255)
        throw new MerchantOperationsConflictError();
      const scope = storeScope(identity);
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ productId, ...body }))
        .digest('hex');
      return transaction(identity, async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
          `${identity.tenantId}:${idempotencyKey}`,
        ]);
        const replay = await client.query<Record<string, unknown>>(
          `SELECT product_id,request_hash,to_status,product_version,published_at
             FROM product_publication_receipts
            WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [identity.tenantId, idempotencyKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash)
            throw new MerchantOperationsConflictError();
          return {
            productId: replay.rows[0].product_id,
            status: replay.rows[0].to_status,
            version: Number(replay.rows[0].product_version),
            publishedAt: iso(replay.rows[0].published_at as Date | string),
            replayed: true,
          };
        }
        const product = await client.query<{
          id: string;
          store_id: string | null;
          product_type: string;
          status: string;
          sale_price_cents: string;
          version: number;
          store_status: string | null;
        }>(
          `SELECT product.id,product.store_id,product.product_type,product.status,
                  product.sale_price_cents::text,product.version,store.status AS store_status
             FROM products product LEFT JOIN stores store
               ON store.tenant_id=product.tenant_id AND store.id=product.store_id
            WHERE product.tenant_id=$1 AND product.id=$2
              AND ($3::uuid[] IS NULL OR product.store_id=ANY($3)) FOR UPDATE OF product`,
          [identity.tenantId, productId, scope],
        );
        const row = product.rows[0];
        if (!row) throw new MerchantOperationsAuthorizationError();
        if (
          row.product_type !== 'GROUP_BUY' ||
          !['DRAFT', 'OFF_SALE'].includes(row.status) ||
          row.version !== body.expectedVersion ||
          row.store_status !== 'ACTIVE' ||
          Number(row.sale_price_cents) <= 0
        )
          throw new MerchantOperationsStateError();
        const availability = await client.query<{
          active_variants: string;
          available_quantity: string;
        }>(
          `SELECT count(*) FILTER (WHERE variant.status='ACTIVE')::text AS active_variants,
                  COALESCE(sum(balance.on_hand-balance.reserved)
                    FILTER (WHERE variant.status='ACTIVE'),0)::text AS available_quantity
             FROM product_variants variant LEFT JOIN inventory_balances balance
               ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
            WHERE variant.tenant_id=$1 AND variant.product_id=$2`,
          [identity.tenantId, productId],
        );
        const stock = availability.rows[0];
        if (!stock || Number(stock.active_variants) < 1 || BigInt(stock.available_quantity) < 1n)
          throw new MerchantOperationsStateError();
        const updated = await client.query<{ version: number; updated_at: Date | string }>(
          `UPDATE products SET status='ON_SALE',version=version+1,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING version,updated_at`,
          [identity.tenantId, productId, body.expectedVersion],
        );
        if (updated.rowCount !== 1) throw new MerchantOperationsConflictError();
        const version = updated.rows[0]!.version;
        await client.query(
          `INSERT INTO product_publication_receipts(tenant_id,product_id,idempotency_key,
             request_hash,from_status,to_status,product_version,published_by)
           VALUES($1,$2,$3,$4,$5,'ON_SALE',$6,$7)`,
          [
            identity.tenantId,
            productId,
            idempotencyKey,
            requestHash,
            row.status,
            version,
            identity.userId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
             permission_code,result_code,before_redacted,after_redacted,trace_id)
           VALUES($1,'USER',$2,'product.publish','product',$3,'order.manage','SUCCESS',
             $4::jsonb,$5::jsonb,$6)`,
          [
            identity.tenantId,
            identity.userId,
            productId,
            JSON.stringify({ status: row.status, version: row.version }),
            JSON.stringify({ status: 'ON_SALE', version }),
            rawTraceId,
          ],
        );
        return {
          productId,
          status: 'ON_SALE',
          version,
          publishedAt: iso(updated.rows[0]!.updated_at),
          replayed: false,
        };
      });
    },

    listOrders(identity, rawQuery) {
      const query = ListQuerySchema.parse(rawQuery);
      const stores = storeScope(identity, query.storeId);
      return transaction(identity, async (client) => {
        const result = await client.query<{
          id: string;
          order_no: string;
          store_id: string;
          status: string;
          payable_amount_cents: string | number;
          paid_amount_cents: string | number;
          refunded_amount_cents: string | number;
          currency: string;
          paid_at: Date | string | null;
          version: number;
          created_at: Date | string;
          updated_at: Date | string;
        }>(
          `SELECT id,order_no,store_id,status,payable_amount_cents,paid_amount_cents,
                  refunded_amount_cents,currency,paid_at,version,created_at,updated_at
             FROM orders
            WHERE tenant_id=$1 AND ($2::uuid[] IS NULL OR store_id=ANY($2))
              AND ($3::text IS NULL OR status=$3)
            ORDER BY created_at DESC,id LIMIT $4`,
          [identity.tenantId, stores, query.status ?? null, query.limit],
        );
        return result.rows.map(mapOrder);
      });
    },

    getOrder(identity, orderIdInput) {
      const orderId = UuidSchema.parse(orderIdInput);
      const stores = storeScope(identity);
      return transaction(identity, async (client) => {
        const order = await client.query<Parameters<typeof mapOrder>[0]>(
          `SELECT id,order_no,store_id,status,payable_amount_cents,paid_amount_cents,
                  refunded_amount_cents,currency,paid_at,version,created_at,updated_at
             FROM orders
            WHERE tenant_id=$1 AND id=$2 AND ($3::uuid[] IS NULL OR store_id=ANY($3))`,
          [identity.tenantId, orderId, stores],
        );
        const row = order.rows[0];
        if (!row) throw new MerchantOperationsAuthorizationError();
        const [items, refunds] = await Promise.all([
          client.query(
            `SELECT id,title_snapshot,quantity,unit_price_cents,line_amount_cents,refunded_quantity
               FROM order_items WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at,id`,
            [identity.tenantId, orderId],
          ),
          client.query(
            `SELECT id,refund_no,amount_cents,reason_code,status,requested_by,approved_by,
                    succeeded_at,created_at,updated_at
               FROM refunds WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at,id`,
            [identity.tenantId, orderId],
          ),
        ]);
        return { ...mapOrder(row), items: items.rows, refunds: refunds.rows };
      });
    },

    listRefunds(identity, rawQuery) {
      const query = ListQuerySchema.parse(rawQuery);
      const stores = storeScope(identity, query.storeId);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT refund.id,refund.refund_no,refund.order_id,orders.store_id,
                  refund.amount_cents,refund.reason_code,refund.status,refund.requested_by,
                  refund.approved_by,refund.succeeded_at,refund.created_at,refund.updated_at
             FROM refunds refund
             JOIN orders ON orders.tenant_id=refund.tenant_id AND orders.id=refund.order_id
            WHERE refund.tenant_id=$1 AND ($2::uuid[] IS NULL OR orders.store_id=ANY($2))
              AND ($3::text IS NULL OR refund.status=$3)
            ORDER BY refund.created_at DESC,refund.id LIMIT $4`,
          [identity.tenantId, stores, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          refundNo: row.refund_no,
          orderId: row.order_id,
          storeId: row.store_id,
          amountCents: Number(row.amount_cents),
          reasonCode: row.reason_code,
          status: row.status,
          requestedBy: row.requested_by,
          approvedBy: row.approved_by,
          succeededAt: iso(row.succeeded_at),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    listVerificationUses(identity, rawQuery) {
      const query = ListQuerySchema.parse(rawQuery);
      const stores = storeScope(identity, query.storeId);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT use.id,use.entitlement_id,use.store_id,use.quantity,use.verifier_user_id,
                  use.used_at,use.reversed_by_id,use.reversal_reason
             FROM verification_uses use
            WHERE use.tenant_id=$1 AND ($2::uuid[] IS NULL OR use.store_id=ANY($2))
            ORDER BY use.used_at DESC,use.id LIMIT $3`,
          [identity.tenantId, stores, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          entitlementId: row.entitlement_id,
          storeId: row.store_id,
          quantity: Number(row.quantity),
          verifierUserId: row.verifier_user_id,
          usedAt: iso(row.used_at),
          reversedById: row.reversed_by_id,
          reversalReason: row.reversal_reason,
        }));
      });
    },

    listReconciliations(identity, rawQuery) {
      const query = ListQuerySchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,business_date,provider,status,order_paid_cents,provider_paid_cents,
                  order_refunded_cents,provider_refunded_cents,reward_net_cents,
                  verification_count,difference_cents,completed_at,created_at,updated_at
             FROM commerce_reconciliation_batches
            WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2)
            ORDER BY business_date DESC,provider LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          businessDate: row.business_date,
          provider: row.provider,
          status: row.status,
          orderPaidCents: Number(row.order_paid_cents),
          providerPaidCents: Number(row.provider_paid_cents),
          orderRefundedCents: Number(row.order_refunded_cents),
          providerRefundedCents: Number(row.provider_refunded_cents),
          rewardNetCents: Number(row.reward_net_cents),
          verificationCount: Number(row.verification_count),
          differenceCents: Number(row.difference_cents),
          completedAt: iso(row.completed_at),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    listCustomers(identity, rawQuery) {
      const query = CustomerQuerySchema.parse(rawQuery);
      const stores = storeScope(identity, query.storeId);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT profile.id,profile.status,profile.first_seen_at,profile.last_seen_at,profile.version,
                  (SELECT count(*) FROM orders
                    WHERE tenant_id=profile.tenant_id AND customer_id=profile.id
                      AND ($2::uuid[] IS NULL OR store_id=ANY($2))) AS order_count,
                  (SELECT count(*) FROM conversations
                    WHERE tenant_id=profile.tenant_id AND customer_id=profile.id
                      AND ($2::uuid[] IS NULL OR store_id=ANY($2))) AS conversation_count
             FROM customer_profiles profile
            WHERE profile.tenant_id=$1
              AND ($3::text IS NULL OR profile.status=$3)
              AND ($4::text IS NULL OR profile.id::text ILIKE '%' || $4 || '%')
              AND ($2::uuid[] IS NULL OR EXISTS (
                    SELECT 1 FROM orders scoped_order
                     WHERE scoped_order.tenant_id=profile.tenant_id
                       AND scoped_order.customer_id=profile.id AND scoped_order.store_id=ANY($2)
                  ) OR EXISTS (
                    SELECT 1 FROM conversations scoped_conversation
                     WHERE scoped_conversation.tenant_id=profile.tenant_id
                       AND scoped_conversation.customer_id=profile.id
                       AND scoped_conversation.store_id=ANY($2)
                  ))
            ORDER BY profile.last_seen_at DESC,profile.id LIMIT $5`,
          [identity.tenantId, stores, query.status ?? null, query.query ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          status: row.status,
          firstSeenAt: iso(row.first_seen_at),
          lastSeenAt: iso(row.last_seen_at),
          version: Number(row.version),
          orderCount: Number(row.order_count),
          conversationCount: Number(row.conversation_count),
        }));
      });
    },

    getCustomer(identity, customerIdInput) {
      const customerId = UuidSchema.parse(customerIdInput);
      const stores = storeScope(identity);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT profile.id,profile.status,profile.first_seen_at,profile.last_seen_at,profile.version,
                  COALESCE((SELECT jsonb_object_agg(consent_type,status) FROM (
                    SELECT DISTINCT ON (consent_type) consent_type,status
                      FROM customer_consents
                     WHERE tenant_id=profile.tenant_id AND customer_id=profile.id
                     ORDER BY consent_type,occurred_at DESC,id DESC
                  ) current_consents),'{}'::jsonb) AS consents,
                  (SELECT count(*) FROM orders WHERE tenant_id=profile.tenant_id
                    AND customer_id=profile.id AND ($3::uuid[] IS NULL OR store_id=ANY($3))) AS order_count,
                  (SELECT count(*) FROM conversations WHERE tenant_id=profile.tenant_id
                    AND customer_id=profile.id AND ($3::uuid[] IS NULL OR store_id=ANY($3))) AS conversation_count
             FROM customer_profiles profile
            WHERE profile.tenant_id=$1 AND profile.id=$2
              AND ($3::uuid[] IS NULL OR EXISTS (
                    SELECT 1 FROM orders scoped_order WHERE scoped_order.tenant_id=profile.tenant_id
                      AND scoped_order.customer_id=profile.id AND scoped_order.store_id=ANY($3)
                  ) OR EXISTS (
                    SELECT 1 FROM conversations scoped_conversation
                     WHERE scoped_conversation.tenant_id=profile.tenant_id
                       AND scoped_conversation.customer_id=profile.id
                       AND scoped_conversation.store_id=ANY($3)
                  ))`,
          [identity.tenantId, customerId, stores],
        );
        const row = result.rows[0];
        if (!row) throw new MerchantOperationsAuthorizationError();
        return {
          id: row.id,
          status: row.status,
          firstSeenAt: iso(row.first_seen_at),
          lastSeenAt: iso(row.last_seen_at),
          version: Number(row.version),
          consents: row.consents,
          orderCount: Number(row.order_count),
          conversationCount: Number(row.conversation_count),
        };
      });
    },

    listCustomerRewards(identity, customerIdInput) {
      const customerId = UuidSchema.parse(customerIdInput);
      const stores = storeScope(identity);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT grant.id,grant.order_id,grant.rule_version,grant.funding_source,
                  grant.granted_amount_cents,grant.redeemed_amount_cents,
                  grant.reversed_amount_cents,grant.status,grant.available_at,
                  grant.expires_at,grant.created_at,grant.updated_at
             FROM reward_grants grant
             LEFT JOIN orders ON orders.tenant_id=grant.tenant_id AND orders.id=grant.order_id
            WHERE grant.tenant_id=$1 AND grant.customer_id=$2
              AND ($3::uuid[] IS NULL OR orders.store_id=ANY($3))
            ORDER BY grant.created_at DESC,grant.id`,
          [identity.tenantId, customerId, stores],
        );
        return result.rows.map((row) => ({
          id: row.id,
          orderId: row.order_id,
          ruleVersion: row.rule_version,
          fundingSource: row.funding_source,
          grantedAmountCents: Number(row.granted_amount_cents),
          redeemedAmountCents: Number(row.redeemed_amount_cents),
          reversedAmountCents: Number(row.reversed_amount_cents),
          status: row.status,
          availableAt: iso(row.available_at),
          expiresAt: iso(row.expires_at),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        }));
      });
    },
  };
}

function mapOrder(row: {
  id: string;
  order_no: string;
  store_id: string;
  status: string;
  payable_amount_cents: string | number;
  paid_amount_cents: string | number;
  refunded_amount_cents: string | number;
  currency: string;
  paid_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}) {
  return {
    id: row.id,
    orderNo: row.order_no,
    storeId: row.store_id,
    status: row.status,
    payableAmountCents: Number(row.payable_amount_cents),
    paidAmountCents: Number(row.paid_amount_cents),
    refundedAmountCents: Number(row.refunded_amount_cents),
    currency: row.currency,
    paidAt: iso(row.paid_at),
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
