import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const QuerySchema = z.object({
  cityCode: z.string().trim().min(1).max(20).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const ProductQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  productType: z.enum(['PHYSICAL', 'SERVICE', 'GROUP_BUY', 'DIGITAL_SUPPLY']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface PlatformDiscoveryService {
  listStores(identity: LifeConsumerSessionIdentity, query: unknown): Promise<unknown[]>;
  listProducts(identity: LifeConsumerSessionIdentity, query: unknown): Promise<unknown[]>;
  getProduct?(identity: LifeConsumerSessionIdentity, productId: string): Promise<unknown>;
  getTraceReport?(identity: LifeConsumerSessionIdentity, productId: string): Promise<unknown>;
}

export class PlatformDiscoveryAuthenticationError extends Error {}
export class PlatformDiscoveryNotFoundError extends Error {}

function distanceKm(leftLat: number, leftLng: number, rightLat: number, rightLng: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const lat = radians(rightLat - leftLat);
  const lng = radians(rightLng - leftLng);
  const value =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(leftLat)) * Math.cos(radians(rightLat)) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function createPlatformDiscoveryService(
  pool: Pick<pg.Pool, 'connect'>,
): PlatformDiscoveryService {
  async function open(identity: LifeConsumerSessionIdentity) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.accountId,
      ]);
      const session = await client.query(
        `SELECT 1 FROM platform_consumer_sessions session
          JOIN platform_consumer_accounts account ON account.id=session.account_id
         WHERE session.session_id=$1 AND session.account_id=$2
           AND session.revoked_at IS NULL AND session.expires_at>now()
           AND account.status='ACTIVE'`,
        [identity.sessionId, identity.accountId],
      );
      if (session.rowCount !== 1) throw new PlatformDiscoveryAuthenticationError();
      const links = await client.query<{ merchant_tenant_id: string }>(
        `SELECT merchant_tenant_id FROM platform_consumer_tenant_links
          WHERE account_id=$1 AND status='ACTIVE'
          ORDER BY merchant_tenant_id LIMIT 100`,
        [identity.accountId],
      );
      return { client, tenantIds: links.rows.map((link) => link.merchant_tenant_id) };
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
  }

  async function loadProduct(client: pg.PoolClient, merchantTenantId: string, productId: string) {
    const product = await client.query<{
      id: string;
      store_id: string;
      store_name: string;
      product_type: string;
      title: string;
      sale_price_cents: string | number;
      market_price_cents: string | number | null;
      version: number;
      updated_at: Date | string;
    }>(
      `SELECT product.id,product.store_id,store.store_name,product.product_type,product.title,
              product.sale_price_cents,product.market_price_cents,product.version,product.updated_at
         FROM products product
         JOIN stores store ON store.tenant_id=product.tenant_id AND store.id=product.store_id
        WHERE product.tenant_id=$1 AND product.id=$2
          AND product.status='ON_SALE' AND store.status='ACTIVE'`,
      [merchantTenantId, productId],
    );
    const current = product.rows[0];
    if (!current) return null;
    const variants = await client.query<{
      id: string;
      sku_code: string;
      title: string;
      sale_price_cents: string | number;
      available_quantity: string | number;
    }>(
      `SELECT variant.id,variant.sku_code,variant.title,variant.sale_price_cents,
              GREATEST(COALESCE(balance.on_hand,0)-COALESCE(balance.reserved,0),0)
                AS available_quantity
         FROM product_variants variant
         LEFT JOIN inventory_balances balance
           ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
        WHERE variant.tenant_id=$1 AND variant.product_id=$2 AND variant.status='ACTIVE'
        ORDER BY variant.created_at,variant.id`,
      [merchantTenantId, productId],
    );
    return {
      id: current.id,
      merchantTenantId,
      storeId: current.store_id,
      storeName: current.store_name,
      productType: current.product_type,
      title: current.title,
      salePriceCents: Number(current.sale_price_cents),
      marketPriceCents:
        current.market_price_cents === null ? null : Number(current.market_price_cents),
      version: current.version,
      updatedAt:
        current.updated_at instanceof Date
          ? current.updated_at.toISOString()
          : String(current.updated_at),
      variants: variants.rows.map((variant) => ({
        id: variant.id,
        skuCode: variant.sku_code,
        title: variant.title,
        salePriceCents: Number(variant.sale_price_cents),
        availableQuantity: Number(variant.available_quantity),
        available: Number(variant.available_quantity) > 0,
      })),
    };
  }

  return {
    async listStores(identity, rawQuery) {
      const query = QuerySchema.parse(rawQuery);
      if ((query.latitude === undefined) !== (query.longitude === undefined))
        throw new z.ZodError([]);
      let client: pg.PoolClient | undefined;
      try {
        const opened = await open(identity);
        client = opened.client;
        const stores: Array<{
          id: string;
          merchantTenantId: string;
          name: string;
          cityCode: string | null;
          districtCode: string | null;
          longitude: number | null;
          latitude: number | null;
          openingHours: unknown;
          productCount: number;
          distanceKm: number | null;
        }> = [];
        for (const merchantTenantId of opened.tenantIds) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [merchantTenantId]);
          const result = await client.query<{
            id: string;
            store_name: string;
            city_code: string | null;
            district_code: string | null;
            longitude: string | number | null;
            latitude: string | number | null;
            opening_hours: unknown;
            product_count: string | number;
          }>(
            `SELECT store.id,store.store_name,store.city_code,store.district_code,
                    store.longitude,store.latitude,store.opening_hours,
                    count(product.id) FILTER (WHERE product.status='ON_SALE') AS product_count
               FROM stores store
               LEFT JOIN products product
                 ON product.tenant_id=store.tenant_id AND product.store_id=store.id
              WHERE store.tenant_id=$1 AND store.status='ACTIVE'
                AND ($2::text IS NULL OR store.city_code=$2)
              GROUP BY store.id ORDER BY store.store_name,store.id`,
            [merchantTenantId, query.cityCode ?? null],
          );
          for (const store of result.rows) {
            const latitude = store.latitude === null ? null : Number(store.latitude);
            const longitude = store.longitude === null ? null : Number(store.longitude);
            stores.push({
              id: store.id,
              merchantTenantId,
              name: store.store_name,
              cityCode: store.city_code,
              districtCode: store.district_code,
              longitude,
              latitude,
              openingHours: store.opening_hours,
              productCount: Number(store.product_count),
              distanceKm:
                query.latitude !== undefined &&
                query.longitude !== undefined &&
                latitude !== null &&
                longitude !== null
                  ? Number(
                      distanceKm(query.latitude, query.longitude, latitude, longitude).toFixed(2),
                    )
                  : null,
            });
          }
        }
        stores.sort((left, right) => {
          if (left.distanceKm !== null || right.distanceKm !== null)
            return (left.distanceKm ?? Number.MAX_VALUE) - (right.distanceKm ?? Number.MAX_VALUE);
          return right.productCount - left.productCount || left.id.localeCompare(right.id);
        });
        await client.query('COMMIT');
        return stores.slice(0, query.limit);
      } catch (error) {
        await client?.query('ROLLBACK');
        throw error;
      } finally {
        client?.release();
      }
    },

    async listProducts(identity, rawQuery) {
      const query = ProductQuerySchema.parse(rawQuery);
      let client: pg.PoolClient | undefined;
      try {
        const opened = await open(identity);
        client = opened.client;
        const products: unknown[] = [];
        for (const merchantTenantId of opened.tenantIds) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [merchantTenantId]);
          const result = await client.query<{
            id: string;
            store_id: string;
            store_name: string;
            product_type: string;
            title: string;
            variant_id: string;
            variant_title: string;
            sale_price_cents: string | number;
            market_price_cents: string | number | null;
            available_quantity: string | number;
          }>(
            `SELECT product.id,product.store_id,store.store_name,product.product_type,
                    product.title,variant.id AS variant_id,variant.title AS variant_title,
                    variant.sale_price_cents,product.market_price_cents,
                    GREATEST(COALESCE(balance.on_hand,0)-COALESCE(balance.reserved,0),0)
                      AS available_quantity
               FROM products product
               JOIN stores store
                 ON store.tenant_id=product.tenant_id AND store.id=product.store_id
               JOIN LATERAL (
                 SELECT candidate.tenant_id,candidate.id,candidate.title,candidate.sale_price_cents
                   FROM product_variants candidate
                  WHERE candidate.tenant_id=product.tenant_id
                    AND candidate.product_id=product.id AND candidate.status='ACTIVE'
                  ORDER BY candidate.sale_price_cents,candidate.id LIMIT 1
               ) variant ON true
               LEFT JOIN inventory_balances balance
                 ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
              WHERE product.tenant_id=$1 AND product.status='ON_SALE'
                AND store.status='ACTIVE'
                AND ($2::uuid IS NULL OR product.store_id=$2)
                AND ($3::text IS NULL OR product.product_type=$3)
              ORDER BY product.updated_at DESC,product.id
              LIMIT $4`,
            [merchantTenantId, query.storeId ?? null, query.productType ?? null, query.limit],
          );
          for (const product of result.rows) {
            products.push({
              id: product.id,
              merchantTenantId,
              storeId: product.store_id,
              storeName: product.store_name,
              productType: product.product_type,
              title: product.title,
              variantId: product.variant_id,
              variantTitle: product.variant_title,
              salePriceCents: Number(product.sale_price_cents),
              marketPriceCents:
                product.market_price_cents === null ? null : Number(product.market_price_cents),
              availableQuantity: Number(product.available_quantity),
            });
          }
          if (products.length >= query.limit) break;
        }
        await client.query('COMMIT');
        return products.slice(0, query.limit);
      } catch (error) {
        await client?.query('ROLLBACK');
        throw error;
      } finally {
        client?.release();
      }
    },

    async getProduct(identity, rawProductId) {
      const productId = UuidSchema.parse(rawProductId);
      let client: pg.PoolClient | undefined;
      try {
        const opened = await open(identity);
        client = opened.client;
        for (const merchantTenantId of opened.tenantIds) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [merchantTenantId]);
          const product = await loadProduct(client, merchantTenantId, productId);
          if (product) {
            await client.query('COMMIT');
            return product;
          }
        }
        throw new PlatformDiscoveryNotFoundError();
      } catch (error) {
        await client?.query('ROLLBACK');
        throw error;
      } finally {
        client?.release();
      }
    },

    async getTraceReport(identity, rawProductId) {
      const productId = UuidSchema.parse(rawProductId);
      let client: pg.PoolClient | undefined;
      try {
        const opened = await open(identity);
        client = opened.client;
        for (const merchantTenantId of opened.tenantIds) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [merchantTenantId]);
          const product = await loadProduct(client, merchantTenantId, productId);
          if (!product) continue;
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
                AND (expires_at IS NULL OR expires_at>now())
              ORDER BY report_version DESC,id DESC LIMIT 1`,
            [merchantTenantId, productId],
          );
          const current = report.rows[0];
          if (!current) throw new PlatformDiscoveryNotFoundError();
          await client.query('COMMIT');
          return {
            id: current.id,
            productId,
            merchantTenantId,
            reportVersion: current.report_version,
            title: current.title,
            summary: current.summary,
            evidence: current.evidence,
            verifiedAt: new Date(current.verified_at).toISOString(),
            expiresAt: current.expires_at ? new Date(current.expires_at).toISOString() : null,
          };
        }
        throw new PlatformDiscoveryNotFoundError();
      } catch (error) {
        await client?.query('ROLLBACK');
        throw error;
      } finally {
        client?.release();
      }
    },
  };
}
