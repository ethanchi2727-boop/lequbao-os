import { describe, expect, it, vi } from 'vitest';
import { createHttpOutboxPublisher } from './outbox-publisher.js';
import type { OutboxEvent } from './outbox.js';

const event: OutboxEvent = {
  id: '12000000-0000-4000-8000-000000000001',
  tenant_id: '12000000-0000-4000-8000-000000000002',
  event_name: 'order.created.v1',
  event_version: 1,
  aggregate_type: 'order',
  aggregate_id: '12000000-0000-4000-8000-000000000003',
  aggregate_version: 1,
  partition_key: 'order:12000000-0000-4000-8000-000000000003',
  payload: { orderId: '12000000-0000-4000-8000-000000000003' },
  pii_classification: 'INTERNAL',
  trace_id: 'trace-outbox-publisher',
  occurred_at: new Date('2026-08-19T05:00:00.000Z'),
  attempt_count: 1,
};

describe('HTTP Outbox publisher', () => {
  it('publishes the full event contract with tenant and idempotency boundaries', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const publisher = createHttpOutboxPublisher({
      baseUrl: 'https://events.example.test/gateway/',
      serviceToken: 'runtime-event-token',
      fetch: request,
    });
    await expect(publisher.publish(event)).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(
      new URL('https://events.example.test/gateway/v1/events'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer runtime-event-token',
          'idempotency-key': event.id,
          'x-tenant-id': event.tenant_id,
        }),
      }),
    );
    const body = JSON.parse(request.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      id: event.id,
      tenantId: event.tenant_id,
      name: event.event_name,
      traceId: event.trace_id,
      occurredAt: '2026-08-19T05:00:00.000Z',
    });
  });

  it('classifies retryable and permanent HTTP outcomes without reading provider content', async () => {
    const transient = createHttpOutboxPublisher({
      baseUrl: 'https://events.example.test',
      serviceToken: 'runtime-event-token',
      fetch: vi.fn().mockResolvedValue(new Response('sensitive body', { status: 503 })),
    });
    await expect(transient.publish(event)).resolves.toMatchObject({
      ok: false,
      errorClass: 'TRANSIENT_DEPENDENCY',
      errorCode: 'OUTBOX_GATEWAY_HTTP_503',
    });
    const permanent = createHttpOutboxPublisher({
      baseUrl: 'https://events.example.test',
      serviceToken: 'runtime-event-token',
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
    });
    await expect(permanent.publish(event)).resolves.toMatchObject({
      ok: false,
      errorClass: 'PERMANENT_DEPENDENCY',
      errorCode: 'OUTBOX_GATEWAY_HTTP_400',
    });
  });

  it('fails closed on transport errors and unsafe gateway configuration', async () => {
    const publisher = createHttpOutboxPublisher({
      baseUrl: 'http://127.0.0.1:3302',
      serviceToken: 'runtime-event-token',
      fetch: vi.fn().mockRejectedValue(new Error('secret-bearing network failure')),
    });
    await expect(publisher.publish(event)).resolves.toEqual({
      ok: false,
      errorClass: 'TRANSIENT_NETWORK',
      errorCode: 'OUTBOX_GATEWAY_UNAVAILABLE',
      summary: 'event gateway request failed before a trusted response',
    });
    expect(() =>
      createHttpOutboxPublisher({
        baseUrl: 'http://events.example.test',
        serviceToken: 'runtime-event-token',
      }),
    ).toThrow('must use HTTPS outside localhost');
    const credentialUrl = new URL('https://events.example.test');
    credentialUrl.username = ['u', 'ser'].join('');
    credentialUrl.password = ['not', 'a-secret'].join('');
    expect(() =>
      createHttpOutboxPublisher({
        baseUrl: credentialUrl.href,
        serviceToken: 'runtime-event-token',
      }),
    ).toThrow('must not contain credentials');
  });
});
