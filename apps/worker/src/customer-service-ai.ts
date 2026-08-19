import type pg from 'pg';
import { TenantIdSchema } from '@lequ/contracts';

export interface CustomerServiceAiDispatchResult {
  jobId: string;
  accepted: boolean;
  status: string;
}

export async function dispatchQueuedCustomerServiceAiJobs(options: {
  pool: pg.Pool;
  tenantId: string;
  workerId: string;
  internalApiUrl: string;
  internalWorkerToken: string;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}): Promise<CustomerServiceAiDispatchResult[]> {
  const tenantId = TenantIdSchema.parse(options.tenantId);
  if (!URL.canParse(options.internalApiUrl)) throw new Error('INTERNAL_API_URL must be absolute');
  if (Buffer.byteLength(options.internalWorkerToken, 'utf8') < 32)
    throw new Error('INTERNAL_WORKER_TOKEN must contain at least 32 bytes');
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));
  const client = await options.pool.connect();
  let jobIds: string[];
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const jobs = await client.query<{ id: string }>(
      `SELECT id FROM conversation_ai_jobs
        WHERE tenant_id=$1 AND status='QUEUED'
        ORDER BY created_at LIMIT $2`,
      [tenantId, limit],
    );
    jobIds = jobs.rows.map((job) => job.id);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const request = options.fetch ?? globalThis.fetch;
  const baseUrl = options.internalApiUrl.replace(/\/$/u, '');
  const results: CustomerServiceAiDispatchResult[] = [];
  for (const jobId of jobIds) {
    const traceId = `customer-service-ai:${jobId}`;
    try {
      const response = await request(`${baseUrl}/internal/v1/customer-service/ai-jobs/process`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.internalWorkerToken}`,
          'content-type': 'application/json',
          'x-trace-id': traceId,
        },
        body: JSON.stringify({ tenantId, jobId, workerId: options.workerId, traceId }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => ({}))) as { status?: string };
      results.push({
        jobId,
        accepted: response.ok,
        status: body.status ?? (response.ok ? 'ACCEPTED' : `HTTP_${response.status}`),
      });
    } catch {
      results.push({ jobId, accepted: false, status: 'NETWORK_ERROR' });
    }
  }
  return results;
}
