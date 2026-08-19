import type pg from 'pg';

export async function dispatchGeoAndReportJobs(options: {
  pool: Pick<pg.Pool, 'connect'>;
  tenantId: string;
  internalApiUrl: string;
  internalWorkerToken: string;
  now?: Date;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}) {
  if (!URL.canParse(options.internalApiUrl)) throw new Error('INTERNAL_API_URL must be absolute');
  if (Buffer.byteLength(options.internalWorkerToken, 'utf8') < 32)
    throw new Error('INTERNAL_WORKER_TOKEN must contain at least 32 bytes');
  const client = await options.pool.connect();
  let targets: { id: string }[];
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [options.tenantId]);
    const result = await client.query<{ id: string }>(
      `SELECT id FROM geo_publish_targets WHERE tenant_id=$1 AND status IN ('ACTIVE','STALE','AUTH_REQUIRED') AND (next_check_at IS NULL OR next_check_at<=now()) ORDER BY next_check_at NULLS FIRST,id LIMIT $2`,
      [options.tenantId, options.limit ?? 100],
    );
    targets = result.rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const request = options.fetch ?? globalThis.fetch,
    base = options.internalApiUrl.replace(/\/$/u, '');
  const results: { type: 'GEO_CHECK' | 'MONTHLY_REPORT'; id: string; accepted: boolean }[] = [];
  for (const target of targets) {
    const response = await request(
      `${base}/api/v1/internal/geo/targets/${target.id}/actions/check`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.internalWorkerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tenantId: options.tenantId }),
        signal: AbortSignal.timeout(20000),
      },
    );
    results.push({ type: 'GEO_CHECK', id: target.id, accepted: response.ok });
  }
  const now = options.now ?? new Date();
  if (now.getUTCDate() <= 3) {
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = previous.toISOString().slice(0, 7);
    const response = await request(
      `${base}/api/v1/internal/reports/monthly-value/actions/materialize`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.internalWorkerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tenantId: options.tenantId, month }),
        signal: AbortSignal.timeout(20000),
      },
    );
    results.push({ type: 'MONTHLY_REPORT', id: month, accepted: response.ok });
  }
  return results;
}
