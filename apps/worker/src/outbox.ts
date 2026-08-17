import type pg from 'pg';
import { TenantIdSchema } from '@lequ/contracts';

export interface OutboxEvent {
  id: string;
  tenant_id: string;
  event_name: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  attempt_count: number;
}

export function retryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  return Math.min(15 * 60_000, 1_000 * 2 ** (normalizedAttempt - 1));
}

// RLS 保持开启：调度器按租户调用，不授予 Worker 跨租户绕过权限。
export async function claimTenantOutbox(
  pool: pg.Pool,
  tenantIdInput: string,
  workerId: string,
  limit = 20,
): Promise<OutboxEvent[]> {
  const tenantId = TenantIdSchema.parse(tenantIdInput);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query<OutboxEvent>(
      `WITH claimable AS (
         SELECT id
           FROM outbox_events
          WHERE tenant_id = $1
            AND status IN ('PENDING', 'FAILED')
            AND next_attempt_at <= now()
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE outbox_events AS event
          SET status = 'PROCESSING',
              attempt_count = event.attempt_count + 1,
              locked_at = now(),
              locked_by = $3
         FROM claimable
        WHERE event.id = claimable.id
      RETURNING event.id, event.tenant_id, event.event_name, event.event_version,
                event.aggregate_type, event.aggregate_id, event.payload, event.attempt_count`,
      [tenantId, safeLimit, workerId],
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
