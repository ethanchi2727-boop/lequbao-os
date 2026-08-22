import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

type GeoIdentity = SessionIdentity & Partial<AuthorizationContext>;
const QuerySchema = z.object({
  storeId: UuidSchema.optional(),
  status: z.enum(['OPEN', 'CONFIRMED', 'RESOLVED', 'IGNORED']).optional(),
});
const DecisionSchema = z.object({
  decision: z.enum(['RESOLVE', 'IGNORE']),
  reasonCode: z.string().trim().min(1).max(120),
});

export class GeoOperationsAuthorizationError extends Error {}
export class GeoOperationsStateError extends Error {}

export interface GeoOperationsService {
  overview(identity: GeoIdentity, query: unknown): Promise<unknown>;
  listDifferences(identity: GeoIdentity, query: unknown): Promise<unknown[]>;
  decideDifference(command: {
    identity: GeoIdentity;
    differenceId: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
}

function stores(identity: GeoIdentity, requestedStoreId?: string): string[] | null {
  if (!identity.accessScopes || !identity.assignedStoreIds)
    throw new GeoOperationsAuthorizationError();
  if (identity.accessScopes.some((scope) => ['TENANT', 'ALL'].includes(scope)))
    return requestedStoreId ? [requestedStoreId] : null;
  const assigned = [...new Set(identity.assignedStoreIds)];
  if (requestedStoreId) {
    if (!assigned.includes(requestedStoreId)) throw new GeoOperationsAuthorizationError();
    return [requestedStoreId];
  }
  if (assigned.length === 0) throw new GeoOperationsAuthorizationError();
  return assigned;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

export function createGeoOperationsService(pool: Pick<pg.Pool, 'connect'>): GeoOperationsService {
  async function tx<T>(identity: GeoIdentity, work: (client: pg.PoolClient) => Promise<T>) {
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
    overview(identity, rawQuery) {
      const query = QuerySchema.pick({ storeId: true }).parse(rawQuery);
      const scope = stores(identity, query.storeId);
      return tx(identity, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT profile.id AS profile_id,profile.store_id,store.store_name,
                  profile.canonical_name,profile.status AS profile_status,
                  profile.completeness_score,profile.consistency_score,profile.version,
                  target.id AS target_id,target.target_code,target.status AS target_status,
                  target.authorization_status,target.last_published_at,target.last_checked_at,
                  target.next_check_at,target.retry_after,
                  (SELECT count(*) FROM geo_difference_tasks difference
                    WHERE difference.tenant_id=profile.tenant_id
                      AND difference.geo_profile_id=profile.id
                      AND difference.status IN ('OPEN','CONFIRMED')) AS open_differences
             FROM geo_profiles profile JOIN stores store
               ON store.tenant_id=profile.tenant_id AND store.id=profile.store_id
             LEFT JOIN geo_publish_targets target
               ON target.tenant_id=profile.tenant_id AND target.geo_profile_id=profile.id
            WHERE profile.tenant_id=$1 AND ($2::uuid[] IS NULL OR profile.store_id=ANY($2))
            ORDER BY store.store_name,profile.id,target.target_code`,
          [identity.tenantId, scope],
        );
        const profiles = new Map<string, Record<string, unknown>>();
        for (const row of result.rows) {
          const id = String(row.profile_id);
          const profile = profiles.get(id) ?? {
            id,
            storeId: row.store_id,
            storeName: row.store_name,
            canonicalName: row.canonical_name,
            status: row.profile_status,
            completenessScore: Number(row.completeness_score),
            consistencyScore: Number(row.consistency_score),
            version: Number(row.version),
            openDifferences: Number(row.open_differences),
            targets: [],
          };
          if (row.target_id)
            (profile.targets as unknown[]).push({
              id: row.target_id,
              targetCode: row.target_code,
              status: row.target_status,
              authorizationStatus: row.authorization_status,
              lastPublishedAt: iso(row.last_published_at as Date | string | null),
              lastCheckedAt: iso(row.last_checked_at as Date | string | null),
              nextCheckAt: iso(row.next_check_at as Date | string | null),
              retryAfter: iso(row.retry_after as Date | string | null),
            });
          profiles.set(id, profile);
        }
        const values = [...profiles.values()];
        return {
          summary: {
            profiles: values.length,
            healthyTargets: values
              .flatMap((item) => item.targets as unknown[])
              .filter((item) => (item as { status: string }).status === 'ACTIVE').length,
            attentionTargets: values
              .flatMap((item) => item.targets as unknown[])
              .filter((item) =>
                ['FAILED', 'AUTH_REQUIRED', 'STALE'].includes((item as { status: string }).status),
              ).length,
            openDifferences: values.reduce((sum, item) => sum + Number(item.openDifferences), 0),
          },
          profiles: values,
        };
      });
    },
    listDifferences(identity, rawQuery) {
      const query = QuerySchema.parse(rawQuery);
      const scope = stores(identity, query.storeId);
      return tx(identity, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT difference.id,difference.geo_profile_id,difference.target_id,
                  profile.store_id,store.store_name,target.target_code,difference.field_name,
                  difference.status,difference.due_at,difference.resolved_at,difference.created_at
             FROM geo_difference_tasks difference
             JOIN geo_profiles profile ON profile.tenant_id=difference.tenant_id
               AND profile.id=difference.geo_profile_id
             JOIN stores store ON store.tenant_id=profile.tenant_id AND store.id=profile.store_id
             JOIN geo_publish_targets target ON target.tenant_id=difference.tenant_id
               AND target.id=difference.target_id
            WHERE difference.tenant_id=$1 AND ($2::uuid[] IS NULL OR profile.store_id=ANY($2))
              AND ($3::text IS NULL OR difference.status=$3)
            ORDER BY difference.due_at,difference.id LIMIT 200`,
          [identity.tenantId, scope, query.status ?? null],
        );
        return result.rows.map((row) => ({
          id: row.id,
          profileId: row.geo_profile_id,
          targetId: row.target_id,
          storeId: row.store_id,
          storeName: row.store_name,
          targetCode: row.target_code,
          fieldName: row.field_name,
          status: row.status,
          dueAt: iso(row.due_at as Date | string),
          resolvedAt: iso(row.resolved_at as Date | string | null),
          createdAt: iso(row.created_at as Date | string),
        }));
      });
    },
    decideDifference(command) {
      UuidSchema.parse(command.differenceId);
      const body = DecisionSchema.parse(command.body);
      const scope = stores(command.identity);
      return tx(command.identity, async (client) => {
        const current = await client.query<{ id: string; status: string }>(
          `SELECT difference.id,difference.status FROM geo_difference_tasks difference
             JOIN geo_profiles profile ON profile.tenant_id=difference.tenant_id
               AND profile.id=difference.geo_profile_id
            WHERE difference.tenant_id=$1 AND difference.id=$2
              AND ($3::uuid[] IS NULL OR profile.store_id=ANY($3)) FOR UPDATE`,
          [command.identity.tenantId, command.differenceId, scope],
        );
        const row = current.rows[0];
        if (!row) throw new GeoOperationsAuthorizationError();
        if (!['OPEN', 'CONFIRMED'].includes(row.status)) throw new GeoOperationsStateError();
        const status = body.decision === 'RESOLVE' ? 'RESOLVED' : 'IGNORED';
        await client.query(
          `UPDATE geo_difference_tasks SET status=$3,resolved_at=now()
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, command.differenceId, status],
        );
        await client.query(
          `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
             permission_code,result_code,after_redacted,trace_id)
           VALUES($1,'USER',$2,'geo.difference.decide','geo_difference',$3,
             'geo.publish','SUCCESS',$4::jsonb,$5)`,
          [
            command.identity.tenantId,
            command.identity.userId,
            command.differenceId,
            JSON.stringify({ status, reasonCode: body.reasonCode }),
            command.traceId,
          ],
        );
        return { id: command.differenceId, status };
      });
    },
  };
}
