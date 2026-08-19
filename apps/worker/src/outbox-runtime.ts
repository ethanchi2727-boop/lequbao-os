import type pg from 'pg';
import { claimTenantOutbox, settleOutboxPublish } from './outbox.js';
import type { OutboxPublisher } from './outbox-publisher.js';

export async function dispatchTenantOutboxBatch(options: {
  pool: pg.Pool;
  tenantId: string;
  workerId: string;
  publisher: OutboxPublisher;
  limit?: number;
}) {
  const events = await claimTenantOutbox(
    options.pool,
    options.tenantId,
    options.workerId,
    options.limit,
  );
  const results = [];
  for (const event of events) {
    let outcome;
    try {
      outcome = await options.publisher.publish(event);
    } catch {
      outcome = {
        ok: false as const,
        errorClass: 'TRANSIENT_RUNTIME',
        errorCode: 'OUTBOX_PUBLISHER_UNEXPECTED_FAILURE',
        summary: 'publisher failed without a classified outcome',
      };
    }
    const status = await settleOutboxPublish(
      options.pool,
      options.tenantId,
      event,
      options.workerId,
      outcome,
    );
    results.push({ eventId: event.id, status });
  }
  return results;
}
