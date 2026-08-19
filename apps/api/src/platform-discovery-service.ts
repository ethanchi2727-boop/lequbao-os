import type pg from 'pg';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const QuerySchema = z.object({
  cityCode: z.string().trim().min(1).max(20).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface PlatformDiscoveryService {
  listStores(identity: LifeConsumerSessionIdentity, query: unknown): Promise<unknown[]>;
}

export class PlatformDiscoveryAuthenticationError extends Error {}

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
  return {
    async listStores(identity, rawQuery) {
      const query = QuerySchema.parse(rawQuery);
      if ((query.latitude === undefined) !== (query.longitude === undefined))
        throw new z.ZodError([]);
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
        for (const link of links.rows) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            link.merchant_tenant_id,
          ]);
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
            [link.merchant_tenant_id, query.cityCode ?? null],
          );
          for (const store of result.rows) {
            const latitude = store.latitude === null ? null : Number(store.latitude);
            const longitude = store.longitude === null ? null : Number(store.longitude);
            stores.push({
              id: store.id,
              merchantTenantId: link.merchant_tenant_id,
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
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
