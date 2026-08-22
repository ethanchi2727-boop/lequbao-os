import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';

const ProductTypeSchema = z.enum(['PHYSICAL', 'SERVICE', 'GROUP_BUY', 'DIGITAL_SUPPLY']);
const ProductListQuerySchema = z.object({
  productType: ProductTypeSchema.optional(),
  query: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export interface ConsumerCatalogService {
  getStorefront(identity: ConsumerSessionIdentity): Promise<unknown>;
  getMembership(identity: ConsumerSessionIdentity): Promise<unknown>;
  listProducts(identity: ConsumerSessionIdentity, query: unknown): Promise<unknown[]>;
  getProduct(identity: ConsumerSessionIdentity, productId: string): Promise<unknown>;
  getTraceReport(identity: ConsumerSessionIdentity, productId: string): Promise<unknown>;
}

export class ConsumerCatalogAuthenticationError extends Error {}
export class ConsumerCatalogNotFoundError extends Error {}

export function createConsumerCatalogService(
  pool: Pick<pg.Pool, 'connect'>,
): ConsumerCatalogService {
  async function transaction<T>(
    identity: ConsumerSessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
      const session = await client.query(
        `SELECT 1 FROM consumer_sessions
          WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
            AND revoked_at IS NULL AND expires_at>now()`,
        [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
      );
      if (session.rowCount !== 1) throw new ConsumerCatalogAuthenticationError();
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

  async function loadProduct(
    client: pg.PoolClient,
    identity: ConsumerSessionIdentity,
    productId: string,
  ) {
    const product = await client.query<{
      id: string;
      product_type: string;
      title: string;
      sale_price_cents: string | number;
      market_price_cents: string | number | null;
      version: number;
      updated_at: Date | string;
    }>(
      `SELECT product.id,product.product_type,product.title,product.sale_price_cents,
              product.market_price_cents,product.version,product.updated_at
         FROM products product
         JOIN stores store ON store.tenant_id=product.tenant_id AND store.id=product.store_id
        WHERE product.tenant_id=$1 AND product.store_id=$2 AND product.id=$3
          AND product.status='ON_SALE' AND store.status='ACTIVE'`,
      [identity.tenantId, identity.storeId, productId],
    );
    const row = product.rows[0];
    if (!row) throw new ConsumerCatalogNotFoundError();
    const variants = await client.query<{
      id: string;
      sku_code: string;
      title: string;
      sale_price_cents: string | number;
      available: boolean;
    }>(
      `SELECT variant.id,variant.sku_code,variant.title,variant.sale_price_cents,
              (COALESCE(balance.on_hand,0)-COALESCE(balance.reserved,0)>0) AS available
         FROM product_variants variant
         LEFT JOIN inventory_balances balance
           ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
        WHERE variant.tenant_id=$1 AND variant.product_id=$2 AND variant.status='ACTIVE'
        ORDER BY variant.created_at,variant.id`,
      [identity.tenantId, row.id],
    );
    return {
      id: row.id,
      merchantTenantId: identity.tenantId,
      storeId: identity.storeId,
      productType: row.product_type,
      title: row.title,
      salePriceCents: Number(row.sale_price_cents),
      marketPriceCents: row.market_price_cents === null ? null : Number(row.market_price_cents),
      version: row.version,
      updatedAt:
        row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      variants: variants.rows.map((variant) => ({
        id: variant.id,
        skuCode: variant.sku_code,
        title: variant.title,
        salePriceCents: Number(variant.sale_price_cents),
        available: variant.available,
      })),
    };
  }

  return {
    async getStorefront(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query<{
          id: string;
          store_name: string;
          province_code: string | null;
          city_code: string | null;
          district_code: string | null;
          longitude: string | number | null;
          latitude: string | number | null;
          opening_hours: unknown;
          updated_at: Date | string;
        }>(
          `SELECT id,store_name,province_code,city_code,district_code,longitude,latitude,
                  opening_hours,updated_at
             FROM stores
            WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
          [identity.tenantId, identity.storeId],
        );
        const row = result.rows[0];
        if (!row) throw new ConsumerCatalogNotFoundError();
        return {
          id: row.id,
          name: row.store_name,
          provinceCode: row.province_code,
          cityCode: row.city_code,
          districtCode: row.district_code,
          longitude: row.longitude === null ? null : Number(row.longitude),
          latitude: row.latitude === null ? null : Number(row.latitude),
          openingHours: row.opening_hours,
          updatedAt:
            row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        };
      });
    },

    async getMembership(identity) {
      return transaction(identity, async (client) => {
        const profile = await client.query<{
          id: string;
          status: string;
          first_seen_at: Date | string;
          last_seen_at: Date | string;
          reward_status: string | null;
          available_reward_cents: string | number;
        }>(
          `SELECT profile.id,profile.status,profile.first_seen_at,profile.last_seen_at,
                  account.status AS reward_status,
                  COALESCE(sum(entry.amount_cents) FILTER (
                    WHERE (entry.available_at IS NULL OR entry.available_at<=now())
                      AND (entry.expires_at IS NULL OR entry.expires_at>now())
                  ),0) AS available_reward_cents
             FROM customer_profiles profile
             LEFT JOIN reward_accounts account
               ON account.tenant_id=profile.tenant_id AND account.owner_type='CUSTOMER'
              AND account.owner_id=profile.id AND account.currency='CNY'
             LEFT JOIN ledger_entries entry
               ON entry.tenant_id=account.tenant_id AND entry.account_id=account.id
            WHERE profile.tenant_id=$1 AND profile.id=$2
            GROUP BY profile.id,account.status`,
          [identity.tenantId, identity.customerId],
        );
        const current = profile.rows[0];
        if (!current) throw new ConsumerCatalogAuthenticationError();
        const grants = await client.query<{
          id: string;
          order_id: string | null;
          rule_version: string;
          funding_source: string;
          granted_amount_cents: string | number;
          redeemed_amount_cents: string | number;
          reversed_amount_cents: string | number;
          status: string;
          available_at: Date | string | null;
          expires_at: Date | string | null;
        }>(
          `SELECT id,order_id,rule_version,funding_source,granted_amount_cents,
                  redeemed_amount_cents,reversed_amount_cents,status,available_at,expires_at
             FROM reward_grants
            WHERE tenant_id=$1 AND customer_id=$2
            ORDER BY created_at DESC,id DESC LIMIT 50`,
          [identity.tenantId, identity.customerId],
        );
        return {
          customerId: current.id,
          status: current.status,
          memberSince: new Date(current.first_seen_at).toISOString(),
          lastSeenAt: new Date(current.last_seen_at).toISOString(),
          rewardAccountStatus: current.reward_status ?? 'NOT_CREATED',
          availableRewardCents: Number(current.available_reward_cents),
          grants: grants.rows.map((grant) => ({
            id: grant.id,
            orderId: grant.order_id,
            ruleVersion: grant.rule_version,
            fundingSource: grant.funding_source,
            grantedAmountCents: Number(grant.granted_amount_cents),
            redeemedAmountCents: Number(grant.redeemed_amount_cents),
            reversedAmountCents: Number(grant.reversed_amount_cents),
            status: grant.status,
            availableAt: grant.available_at ? new Date(grant.available_at).toISOString() : null,
            expiresAt: grant.expires_at ? new Date(grant.expires_at).toISOString() : null,
          })),
        };
      });
    },

    async listProducts(identity, rawQuery) {
      const query = ProductListQuerySchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query<{ id: string }>(
          `SELECT product.id
             FROM products product
             JOIN stores store
               ON store.tenant_id=product.tenant_id AND store.id=product.store_id
            WHERE product.tenant_id=$1 AND product.store_id=$2
              AND product.status='ON_SALE' AND store.status='ACTIVE'
              AND ($3::text IS NULL OR product.product_type=$3)
              AND ($4::text IS NULL OR product.title ILIKE '%' || $4 || '%')
            ORDER BY product.updated_at DESC,product.id
            LIMIT $5 OFFSET $6`,
          [
            identity.tenantId,
            identity.storeId,
            query.productType ?? null,
            query.query ?? null,
            query.limit,
            query.offset,
          ],
        );
        return Promise.all(result.rows.map((row) => loadProduct(client, identity, row.id)));
      });
    },

    async getProduct(identity, rawProductId) {
      const productId = UuidSchema.parse(rawProductId);
      return transaction(identity, (client) => loadProduct(client, identity, productId));
    },

    async getTraceReport(identity, rawProductId) {
      const productId = UuidSchema.parse(rawProductId);
      return transaction(identity, async (client) => {
        await loadProduct(client, identity, productId);
        const report = await client.query<{
          id: string;
          report_version: number;
          title: string;
          summary: string;
          evidence: unknown;
          verified_at: Date | string;
          expires_at: Date | string | null;
        }>(
          `SELECT id,report_version,title,summary,evidence,verified_at,expires_at
             FROM product_trace_reports
            WHERE tenant_id=$1 AND product_id=$2 AND status='VERIFIED'
              AND (expires_at IS NULL OR expires_at>now())`,
          [identity.tenantId, productId],
        );
        const current = report.rows[0];
        if (!current) throw new ConsumerCatalogNotFoundError();
        return {
          id: current.id,
          productId,
          reportVersion: current.report_version,
          title: current.title,
          summary: current.summary,
          evidence: current.evidence,
          verifiedAt: new Date(current.verified_at).toISOString(),
          expiresAt: current.expires_at ? new Date(current.expires_at).toISOString() : null,
        };
      });
    },
  };
}
