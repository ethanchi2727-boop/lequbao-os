import type { OutboxEvent } from './outbox.js';

export type OutboxPublishOutcome =
  { ok: true } | { ok: false; errorClass: string; errorCode: string; summary: string };

export interface OutboxPublisher {
  publish(event: OutboxEvent): Promise<OutboxPublishOutcome>;
}

export function createHttpOutboxPublisher(options: {
  baseUrl: string;
  serviceToken: string;
  fetch?: typeof globalThis.fetch;
}): OutboxPublisher {
  const base = new URL(options.baseUrl);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(base.hostname);
  if (base.username || base.password)
    throw new Error('OUTBOX_EVENT_GATEWAY_URL must not contain credentials');
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))
    throw new Error('OUTBOX_EVENT_GATEWAY_URL must use HTTPS outside localhost');
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('OUTBOX_EVENT_GATEWAY_TOKEN must contain at least 16 bytes');
  const endpoint = new URL('v1/events', base.href.endsWith('/') ? base : `${base.href}/`);
  const request = options.fetch ?? globalThis.fetch;
  return {
    async publish(event) {
      try {
        const response = await request(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.serviceToken}`,
            'content-type': 'application/json',
            'idempotency-key': event.id,
            'x-tenant-id': event.tenant_id,
          },
          body: JSON.stringify({
            id: event.id,
            tenantId: event.tenant_id,
            name: event.event_name,
            version: event.event_version,
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id,
            aggregateVersion: event.aggregate_version,
            partitionKey: event.partition_key,
            payload: event.payload,
            piiClassification: event.pii_classification,
            traceId: event.trace_id,
            occurredAt:
              event.occurred_at instanceof Date
                ? event.occurred_at.toISOString()
                : event.occurred_at,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return { ok: true };
        await response.body?.cancel();
        const transient =
          response.status === 408 || response.status === 429 || response.status >= 500;
        return {
          ok: false,
          errorClass: transient ? 'TRANSIENT_DEPENDENCY' : 'PERMANENT_DEPENDENCY',
          errorCode: `OUTBOX_GATEWAY_HTTP_${response.status}`,
          summary: 'event gateway rejected the publish request',
        };
      } catch {
        return {
          ok: false,
          errorClass: 'TRANSIENT_NETWORK',
          errorCode: 'OUTBOX_GATEWAY_UNAVAILABLE',
          summary: 'event gateway request failed before a trusted response',
        };
      }
    },
  };
}
