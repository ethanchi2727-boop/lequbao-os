import type pg from 'pg';
import { TenantIdSchema } from '@lequ/contracts';

export interface OutboxEvent {
  id: string;
  tenant_id: string;
  event_name: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  partition_key: string;
  payload: unknown;
  pii_classification: 'PUBLIC' | 'INTERNAL' | 'PERSONAL' | 'SENSITIVE';
  trace_id: string;
  occurred_at: Date | string;
  attempt_count: number;
}

export function retryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  const schedule = [10_000, 30_000, 120_000, 600_000, 1_800_000, 7_200_000];
  return schedule[Math.min(normalizedAttempt, schedule.length) - 1] ?? 7_200_000;
}

export function assertOrderedVersion(lastVersion: number, eventVersion: number): void {
  if (!Number.isSafeInteger(eventVersion) || eventVersion < 1)
    throw new Error('EVENT_AGGREGATE_VERSION_INVALID');
  if (eventVersion !== lastVersion + 1) throw new Error('EVENT_AGGREGATE_VERSION_OUT_OF_ORDER');
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
          WHERE tenant_id = $1 AND (
            (status IN ('PENDING', 'FAILED') AND next_attempt_at <= now())
            OR (status = 'PROCESSING' AND locked_at < now() - interval '5 minutes')
          )
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
                event.aggregate_type, event.aggregate_id, event.aggregate_version,
                event.partition_key, event.payload, event.pii_classification,event.trace_id,
                event.occurred_at,event.attempt_count`,
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

async function withTenantTransaction<T>(
  pool: pg.Pool,
  tenantIdInput: string,
  operation: (client: pg.PoolClient, tenantId: string) => Promise<T>,
): Promise<T> {
  const tenantId = TenantIdSchema.parse(tenantIdInput);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await operation(client, tenantId);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function settleOutboxPublish(
  pool: pg.Pool,
  tenantIdInput: string,
  event: Pick<OutboxEvent, 'id' | 'attempt_count'>,
  workerId: string,
  outcome: { ok: true } | { ok: false; errorClass: string; errorCode: string; summary: string },
): Promise<'PUBLISHED' | 'FAILED' | 'DEAD'> {
  return withTenantTransaction(pool, tenantIdInput, async (client, tenantId) => {
    if (outcome.ok) {
      const published = await client.query(
        `UPDATE outbox_events
            SET status='PUBLISHED', published_at=now(), locked_at=NULL, locked_by=NULL,
                last_error=NULL
          WHERE tenant_id=$1 AND id=$2 AND status='PROCESSING' AND locked_by=$3
        RETURNING id`,
        [tenantId, event.id, workerId],
      );
      if (published.rowCount !== 1) throw new Error('OUTBOX_CLAIM_LOST');
      return 'PUBLISHED';
    }

    const summary = outcome.summary.replace(/[\r\n\t]+/gu, ' ').slice(0, 500);
    if (event.attempt_count >= 12) {
      const dead = await client.query(
        `UPDATE outbox_events
            SET status='DEAD', locked_at=NULL, locked_by=NULL, last_error=$4
          WHERE tenant_id=$1 AND id=$2 AND status='PROCESSING' AND locked_by=$3
        RETURNING id, created_at`,
        [tenantId, event.id, workerId, `${outcome.errorCode}: ${summary}`],
      );
      if (dead.rowCount !== 1) throw new Error('OUTBOX_CLAIM_LOST');
      await client.query(
        `INSERT INTO event_dead_letters(
           tenant_id,event_id,error_class,error_code,error_summary,first_failed_at,last_failed_at,
           attempt_count,recommended_action
         ) VALUES($1,$2,$3,$4,$5,now(),now(),$6,$7)
         ON CONFLICT(tenant_id,event_id,consumer_name) DO UPDATE
           SET error_class=EXCLUDED.error_class,error_code=EXCLUDED.error_code,
               error_summary=EXCLUDED.error_summary,last_failed_at=now(),
               attempt_count=EXCLUDED.attempt_count,recommended_action=EXCLUDED.recommended_action`,
        [
          tenantId,
          event.id,
          outcome.errorClass,
          outcome.errorCode,
          summary,
          event.attempt_count,
          'Inspect dependency and payload evidence, then explicitly replay the original event.',
        ],
      );
      return 'DEAD';
    }

    const failed = await client.query(
      `UPDATE outbox_events
          SET status='FAILED', next_attempt_at=now()+($4::integer*interval '1 millisecond'),
              locked_at=NULL, locked_by=NULL, last_error=$5
        WHERE tenant_id=$1 AND id=$2 AND status='PROCESSING' AND locked_by=$3
      RETURNING id`,
      [
        tenantId,
        event.id,
        workerId,
        retryDelayMs(event.attempt_count),
        `${outcome.errorCode}: ${summary}`,
      ],
    );
    if (failed.rowCount !== 1) throw new Error('OUTBOX_CLAIM_LOST');
    return 'FAILED';
  });
}

export async function replayDeadLetter(
  pool: pg.Pool,
  tenantIdInput: string,
  eventId: string,
): Promise<void> {
  await withTenantTransaction(pool, tenantIdInput, async (client, tenantId) => {
    const deadLetter = await client.query(
      `SELECT event_id FROM event_dead_letters
        WHERE tenant_id=$1 AND event_id=$2 AND resolved_at IS NULL
        FOR UPDATE`,
      [tenantId, eventId],
    );
    if (deadLetter.rowCount !== 1) throw new Error('DEAD_LETTER_NOT_FOUND');
    const restored = await client.query(
      `UPDATE outbox_events
          SET status='FAILED', next_attempt_at=now(), locked_at=NULL, locked_by=NULL,
              last_error='explicit dead-letter replay requested'
        WHERE tenant_id=$1 AND id=$2 AND status='DEAD'
      RETURNING id`,
      [tenantId, eventId],
    );
    if (restored.rowCount !== 1) throw new Error('DEAD_LETTER_EVENT_NOT_DEAD');
    await client.query(
      `UPDATE event_dead_letters
          SET replay_count=replay_count+1,last_replayed_at=now()
        WHERE tenant_id=$1 AND event_id=$2`,
      [tenantId, eventId],
    );
  });
}

export async function consumeTenantEvent(
  pool: pg.Pool,
  expectedTenantIdInput: string,
  consumerName: string,
  event: OutboxEvent,
  handler: (client: pg.PoolClient, event: OutboxEvent) => Promise<void>,
): Promise<'PROCESSED' | 'DUPLICATE'> {
  const expectedTenantId = TenantIdSchema.parse(expectedTenantIdInput);
  if (TenantIdSchema.parse(event.tenant_id) !== expectedTenantId)
    throw new Error('EVENT_TENANT_MISMATCH');
  return withTenantTransaction(pool, expectedTenantId, async (client, tenantId) => {
    const receipt = await client.query(
      `INSERT INTO inbox_receipts(tenant_id,consumer_name,event_id,payload_hash,result_code)
       VALUES($1,$2,$3,encode(digest(convert_to($4::text,'UTF8'),'sha256'),'hex'),'PROCESSING')
       ON CONFLICT(tenant_id,consumer_name,event_id) DO NOTHING RETURNING id`,
      [tenantId, consumerName, event.id, JSON.stringify(event.payload)],
    );
    if (receipt.rowCount === 0) return 'DUPLICATE';
    const offset = await client.query<{ last_aggregate_version: number }>(
      `SELECT last_aggregate_version FROM event_consumer_offsets
        WHERE tenant_id=$1 AND consumer_name=$2 AND aggregate_type=$3 AND aggregate_id=$4
        FOR UPDATE`,
      [tenantId, consumerName, event.aggregate_type, event.aggregate_id],
    );
    assertOrderedVersion(offset.rows[0]?.last_aggregate_version ?? 0, event.aggregate_version);
    await handler(client, event);
    await client.query(
      `INSERT INTO event_consumer_offsets(
         tenant_id,consumer_name,aggregate_type,aggregate_id,partition_key,
         last_aggregate_version,last_event_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(tenant_id,consumer_name,aggregate_type,aggregate_id) DO UPDATE
         SET partition_key=EXCLUDED.partition_key,
             last_aggregate_version=EXCLUDED.last_aggregate_version,
             last_event_id=EXCLUDED.last_event_id,updated_at=now()`,
      [
        tenantId,
        consumerName,
        event.aggregate_type,
        event.aggregate_id,
        event.partition_key,
        event.aggregate_version,
        event.id,
      ],
    );
    await client.query(
      `UPDATE inbox_receipts SET result_code='OK'
        WHERE tenant_id=$1 AND consumer_name=$2 AND event_id=$3`,
      [tenantId, consumerName, event.id],
    );
    return 'PROCESSED';
  });
}
