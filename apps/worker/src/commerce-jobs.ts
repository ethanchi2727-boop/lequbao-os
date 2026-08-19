import type pg from 'pg';

type Job = { type: 'EXPIRE_ORDER' | 'SUBMIT_REFUND'; id: string };

export async function dispatchCommerceJobs(options: {
  pool: Pick<pg.Pool, 'connect'>;
  tenantId: string;
  internalApiUrl: string;
  internalWorkerToken: string;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}): Promise<Array<Job & { accepted: boolean }>> {
  if (!URL.canParse(options.internalApiUrl)) throw new Error('INTERNAL_API_URL must be absolute');
  if (Buffer.byteLength(options.internalWorkerToken, 'utf8') < 32)
    throw new Error('INTERNAL_WORKER_TOKEN must contain at least 32 bytes');
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error('invalid job limit');
  const client = await options.pool.connect();
  let jobs: Job[];
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [options.tenantId]);
    const orders = await client.query<{ id: string }>(
      `SELECT id FROM orders
        WHERE tenant_id=$1 AND status='PENDING_PAYMENT' AND expires_at<=now()
          AND reservation_released_at IS NULL
        ORDER BY expires_at,id LIMIT $2`,
      [options.tenantId, limit],
    );
    const remaining = Math.max(0, limit - orders.rows.length);
    const refunds =
      remaining === 0
        ? { rows: [] as { id: string }[] }
        : await client.query<{ id: string }>(
            `SELECT id FROM refunds
        WHERE tenant_id=$1 AND status='SUBMITTING'
        ORDER BY submitted_at NULLS FIRST,created_at,id LIMIT $2`,
            [options.tenantId, remaining],
          );
    jobs = [
      ...orders.rows.map(({ id }) => ({ type: 'EXPIRE_ORDER' as const, id })),
      ...refunds.rows.map(({ id }) => ({ type: 'SUBMIT_REFUND' as const, id })),
    ];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const request = options.fetch ?? globalThis.fetch;
  const baseUrl = options.internalApiUrl.replace(/\/$/u, '');
  const results: Array<Job & { accepted: boolean }> = [];
  for (const job of jobs) {
    const subject =
      job.type === 'EXPIRE_ORDER'
        ? `orders/${job.id}/actions/expire`
        : `refunds/${job.id}/actions/submit`;
    const response = await request(`${baseUrl}/api/v1/internal/commerce/${subject}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.internalWorkerToken}`,
        'content-type': 'application/json',
        'x-trace-id': `commerce-worker:${job.type}:${job.id}`,
      },
      body: JSON.stringify({ tenantId: options.tenantId }),
      signal: AbortSignal.timeout(20_000),
    });
    results.push({ ...job, accepted: response.ok });
  }
  return results;
}
