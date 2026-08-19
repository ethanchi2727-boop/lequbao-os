import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  claimTenantOutbox,
  consumeTenantEvent,
  replayDeadLetter,
  settleOutboxPublish,
  type OutboxEvent,
} from '../src/outbox.js';
import { dispatchTenantOutboxBatch } from '../src/outbox-runtime.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString, max: 1 });
const tenantA = randomUUID();
const tenantB = randomUUID();
const aggregateId = randomUUID();
const eventAId = randomUUID();
const eventBId = randomUUID();
const deadEventId = randomUUID();
const gapEventId = randomUUID();
const runtimeEventId = randomUUID();
const staleEventId = randomUUID();
const workerA = `fault-worker-a-${randomUUID()}`;
const workerB = `fault-worker-b-${randomUUID()}`;
const consumerName = `fault-consumer-${randomUUID()}`;

const eventInput = (
  id: string,
  tenantId: string,
  version: number,
  options: { attemptCount?: number; nextAttempt?: string; status?: string } = {},
) => [
  id,
  tenantId,
  aggregateId,
  version,
  options.status ?? 'PENDING',
  options.attemptCount ?? 0,
  options.nextAttempt ?? new Date(Date.now() - 1000).toISOString(),
];

try {
  const seed = await pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query(
      `INSERT INTO tenants(id,tenant_code,legal_name,display_name) VALUES
       ($1,$3,'Fault Injection A','Fault Injection A'),
       ($2,$4,'Fault Injection B','Fault Injection B')`,
      [tenantA, tenantB, `fault-a-${tenantA.slice(0, 8)}`, `fault-b-${tenantB.slice(0, 8)}`],
    );
    for (const values of [
      eventInput(eventAId, tenantA, 1),
      eventInput(eventBId, tenantB, 1),
      eventInput(deadEventId, tenantA, 2, {
        attemptCount: 11,
        nextAttempt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      eventInput(gapEventId, tenantA, 3, { status: 'PUBLISHED' }),
    ]) {
      await seed.query(
        `INSERT INTO outbox_events(
           id,tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,
           partition_key,payload,pii_classification,trace_id,occurred_at,status,
           attempt_count,next_attempt_at
         ) VALUES($1,$2,'fault.injected.v1','fault_aggregate',$3::uuid,$4::integer,
                  'fault:'||($3::uuid)::text,jsonb_build_object('version',$4::integer),
                  'INTERNAL','trace-fault-injection',now(),$5::text,$6::integer,$7::timestamptz)`,
        values,
      );
    }
    await seed.query('COMMIT');
  } catch (error) {
    await seed.query('ROLLBACK');
    throw error;
  } finally {
    seed.release();
  }

  const firstClaim = await claimTenantOutbox(pool, tenantA, workerA, 1);
  assert.equal(firstClaim.length, 1);
  assert.equal(firstClaim[0]?.id, eventAId);
  assert.equal(firstClaim[0]?.attempt_count, 1);

  const resetCheck = await pool.query<{ tenant_context: string | null }>(
    `SELECT current_setting('app.tenant_id',true) AS tenant_context`,
  );
  assert.ok([null, ''].includes(resetCheck.rows[0]?.tenant_context ?? null));

  assert.equal(
    await settleOutboxPublish(pool, tenantA, firstClaim[0]!, workerA, {
      ok: false,
      errorClass: 'TRANSIENT_NETWORK',
      errorCode: 'PROVIDER_TIMEOUT',
      summary: 'synthetic provider timeout\nwith redacted detail',
    }),
    'FAILED',
  );
  await pool.query(`UPDATE outbox_events SET next_attempt_at=now() WHERE tenant_id=$1 AND id=$2`, [
    tenantA,
    eventAId,
  ]);
  const retryClaim = await claimTenantOutbox(pool, tenantA, workerA, 1);
  assert.equal(retryClaim[0]?.id, eventAId);
  assert.equal(retryClaim[0]?.attempt_count, 2);
  assert.equal(
    await settleOutboxPublish(pool, tenantA, retryClaim[0]!, workerA, { ok: true }),
    'PUBLISHED',
  );

  const tenantBClaim = await claimTenantOutbox(pool, tenantB, workerB, 1);
  assert.equal(tenantBClaim[0]?.id, eventBId);
  assert.equal(tenantBClaim[0]?.tenant_id, tenantB);
  assert.equal(
    await settleOutboxPublish(pool, tenantB, tenantBClaim[0]!, workerB, { ok: true }),
    'PUBLISHED',
  );

  let handlerCalls = 0;
  const handler = async (client: pg.PoolClient, event: OutboxEvent) => {
    handlerCalls += 1;
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_type,actor_id,action,resource_type,resource_id,result_code,trace_id
       ) VALUES($1,'SYSTEM','fault-integration','consume','outbox_event',$2,'SUCCESS',$3)`,
      [event.tenant_id, event.id, `trace-consume-${event.id}`],
    );
  };
  assert.equal(
    await consumeTenantEvent(pool, tenantA, consumerName, retryClaim[0]!, handler),
    'PROCESSED',
  );
  assert.equal(
    await consumeTenantEvent(pool, tenantA, consumerName, retryClaim[0]!, handler),
    'DUPLICATE',
  );
  assert.equal(handlerCalls, 1);

  await assert.rejects(
    consumeTenantEvent(pool, tenantB, consumerName, retryClaim[0]!, handler),
    /EVENT_TENANT_MISMATCH/u,
  );
  const gapEvent: OutboxEvent = {
    ...retryClaim[0]!,
    id: gapEventId,
    aggregate_version: 3,
    payload: { version: 3 },
  };
  await assert.rejects(
    consumeTenantEvent(pool, tenantA, consumerName, gapEvent, handler),
    /EVENT_AGGREGATE_VERSION_OUT_OF_ORDER/u,
  );
  assert.equal(handlerCalls, 1);

  await pool.query(`UPDATE outbox_events SET next_attempt_at=now() WHERE tenant_id=$1 AND id=$2`, [
    tenantA,
    deadEventId,
  ]);
  const deadClaim = await claimTenantOutbox(pool, tenantA, workerA, 1);
  assert.equal(deadClaim[0]?.id, deadEventId);
  assert.equal(deadClaim[0]?.attempt_count, 12);
  assert.equal(
    await settleOutboxPublish(pool, tenantA, deadClaim[0]!, workerA, {
      ok: false,
      errorClass: 'PERMANENT_PROVIDER',
      errorCode: 'PROVIDER_REJECTED',
      summary: 'synthetic terminal rejection',
    }),
    'DEAD',
  );
  await replayDeadLetter(pool, tenantA, deadEventId);
  const replayClaim = await claimTenantOutbox(pool, tenantA, workerA, 1);
  assert.equal(replayClaim[0]?.id, deadEventId);
  assert.equal(
    await settleOutboxPublish(pool, tenantA, replayClaim[0]!, workerA, { ok: true }),
    'PUBLISHED',
  );

  await pool.query(
    `INSERT INTO outbox_events(
       id,tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,
       partition_key,payload,pii_classification,trace_id,occurred_at,status,
       attempt_count,next_attempt_at,locked_at,locked_by
     ) VALUES
       ($1,$3,'runtime.pending.v1','runtime_aggregate',$4,1,
        'runtime:'||($4::uuid)::text,'{}','INTERNAL','trace-runtime-pending',now(),
        'PENDING',0,now(),NULL,NULL),
       ($2,$3,'runtime.stale.v1','runtime_aggregate',$5,1,
        'runtime:'||($5::uuid)::text,'{}','INTERNAL','trace-runtime-stale',now(),
        'PROCESSING',1,now()+interval '1 hour',now()-interval '10 minutes','crashed-worker')`,
    [runtimeEventId, staleEventId, tenantA, randomUUID(), randomUUID()],
  );
  const publishedIds: string[] = [];
  const runtimeResults = await dispatchTenantOutboxBatch({
    pool,
    tenantId: tenantA,
    workerId: `runtime-worker-${randomUUID()}`,
    publisher: {
      publish: async (event) => {
        publishedIds.push(event.id);
        assert.equal(event.tenant_id, tenantA);
        assert.equal(event.pii_classification, 'INTERNAL');
        assert.ok(event.trace_id.startsWith('trace-runtime-'));
        return { ok: true };
      },
    },
    limit: 10,
  });
  assert.deepEqual(new Set(publishedIds), new Set([runtimeEventId, staleEventId]));
  assert.deepEqual(
    runtimeResults.map((result) => result.status),
    ['PUBLISHED', 'PUBLISHED'],
  );

  const evidence = await pool.query<{
    audit_results: string;
    inbox_receipts: string;
    gap_receipts: string;
    offset_version: number;
    dead_status: string;
    replay_count: number;
    replay_event_id: string;
  }>(
    `SELECT
       (SELECT count(*) FROM audit_logs WHERE tenant_id=$1 AND actor_id='fault-integration')::text AS audit_results,
       (SELECT count(*) FROM inbox_receipts WHERE tenant_id=$1 AND consumer_name=$2)::text AS inbox_receipts,
       (SELECT count(*) FROM inbox_receipts WHERE tenant_id=$1 AND consumer_name=$2 AND event_id=$3)::text AS gap_receipts,
       (SELECT last_aggregate_version FROM event_consumer_offsets
         WHERE tenant_id=$1 AND consumer_name=$2 AND aggregate_id=$4) AS offset_version,
       (SELECT status FROM outbox_events WHERE tenant_id=$1 AND id=$5) AS dead_status,
       (SELECT replay_count FROM event_dead_letters WHERE tenant_id=$1 AND event_id=$5) AS replay_count,
       (SELECT event_id::text FROM event_dead_letters WHERE tenant_id=$1 AND event_id=$5) AS replay_event_id`,
    [tenantA, consumerName, gapEventId, aggregateId, deadEventId],
  );
  assert.deepEqual(evidence.rows[0], {
    audit_results: '1',
    inbox_receipts: '1',
    gap_receipts: '0',
    offset_version: 1,
    dead_status: 'PUBLISHED',
    replay_count: 1,
    replay_event_id: deadEventId,
  });
  console.log(
    'Worker PostgreSQL fault injection passed: tenant reset, mismatch rejection, retry, inbox deduplication, gap rollback, dead letter, original-event replay, runtime publish and stale-claim recovery.',
  );
} finally {
  await pool.end();
}
