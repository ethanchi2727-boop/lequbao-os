import type pg from 'pg';
export async function dispatchPrivacyDeletionJobs(options: {
  pool: Pick<pg.Pool, 'connect'>;
  tenantId: string;
  gatewayUrl: string;
  gatewayToken: string;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}) {
  if (!URL.canParse(options.gatewayUrl))
    throw new Error('PRIVACY_DELETION_GATEWAY_URL must be absolute');
  if (Buffer.byteLength(options.gatewayToken, 'utf8') < 32)
    throw new Error('privacy gateway token too short');
  const client = await options.pool.connect();
  let tasks: {
    id: string;
    privacy_request_id: string;
    target_system: string;
    idempotency_key: string;
  }[];
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [options.tenantId]);
    const result = await client.query<(typeof tasks)[number]>(
      `SELECT id,privacy_request_id,target_system,idempotency_key FROM privacy_deletion_propagation_tasks WHERE tenant_id=$1 AND status IN('PENDING','FAILED') AND attempt_count<20 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,
      [options.tenantId, options.limit ?? 50],
    );
    tasks = result.rows;
    for (const task of tasks)
      await client.query(
        `UPDATE privacy_deletion_propagation_tasks SET status='RUNNING',attempt_count=attempt_count+1,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [options.tenantId, task.id],
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const request = options.fetch ?? globalThis.fetch,
    results = [] as { id: string; accepted: boolean }[];
  for (const task of tasks) {
    let accepted = false,
      errorCode: string | null = null;
    try {
      const response = await request(new URL('/v1/privacy/delete', options.gatewayUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.gatewayToken}`,
          'content-type': 'application/json',
          'idempotency-key': task.idempotency_key,
        },
        body: JSON.stringify({
          tenantId: options.tenantId,
          privacyRequestId: task.privacy_request_id,
          targetSystem: task.target_system,
        }),
        signal: AbortSignal.timeout(30000),
      });
      accepted = response.ok;
      if (!accepted) errorCode = `HTTP_${response.status}`;
    } catch {
      errorCode = 'GATEWAY_UNAVAILABLE';
    }
    const update = await options.pool.connect();
    try {
      await update.query('BEGIN');
      await update.query("SELECT set_config('app.tenant_id',$1,true)", [options.tenantId]);
      await update.query(
        `UPDATE privacy_deletion_propagation_tasks SET status=$3,last_error_code=$4,completed_at=CASE WHEN $3='SUCCEEDED' THEN now() ELSE NULL END,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [options.tenantId, task.id, accepted ? 'SUCCEEDED' : 'FAILED', errorCode],
      );
      await update.query('COMMIT');
    } catch (error) {
      await update.query('ROLLBACK');
      throw error;
    } finally {
      update.release();
    }
    results.push({ id: task.id, accepted });
  }
  return results;
}
