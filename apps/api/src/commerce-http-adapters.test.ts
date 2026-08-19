import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createHttpCommerceAdapters } from './commerce-http-adapters.js';

const secret = 'callback-secret-with-at-least-thirty-two-bytes';
const options = (fetch: typeof globalThis.fetch) => ({
  baseUrl: 'https://provider.example.test',
  serviceToken: 'provider-service-token',
  callbackSecret: secret,
  fetch,
});

describe('commerce HTTP adapters', () => {
  it('accepts only an exact raw-body HMAC bound to the provider', async () => {
    const adapters = createHttpCommerceAdapters(options(vi.fn() as never));
    const event = {
      tenantId: '00000000-0000-4000-8000-000000000001',
      provider: 'SANDBOX',
      providerEventId: 'event-1',
      eventType: 'PAYMENT_SUCCEEDED',
      merchantAccountHash: 'a'.repeat(64),
      paymentIntentId: '00000000-0000-4000-8000-000000000002',
      providerTransactionId: 'transaction-1',
      amountCents: 100,
      occurredAt: '2026-08-18T12:00:00+08:00',
    };
    const rawBody = JSON.stringify(event);
    const signature = createHmac('sha256', secret).update(`SANDBOX\n${rawBody}`).digest('hex');
    await expect(
      adapters.callback.verify({ provider: 'SANDBOX', signature, rawBody }),
    ).resolves.toEqual(event);
    await expect(
      adapters.callback.verify({ provider: 'ALIPAY', signature, rawBody }),
    ).rejects.toThrow('invalid callback signature');
    await expect(
      adapters.callback.verify({ provider: 'SANDBOX', signature, rawBody: `${rawBody} ` }),
    ).rejects.toThrow('invalid callback signature');
  });

  it('rejects duplicate provider bill references before reconciliation', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          objectRef: 'bills/2026-08-18.json',
          sha256: 'b'.repeat(64),
          lines: [
            { type: 'PAYMENT', providerReferenceHash: 'c'.repeat(64), amountCents: 100 },
            { type: 'PAYMENT', providerReferenceHash: 'c'.repeat(64), amountCents: 100 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const adapters = createHttpCommerceAdapters(options(fetch));
    await expect(
      adapters.reconciliation.fetchDailyBill({
        tenantId: '00000000-0000-4000-8000-000000000001',
        provider: 'SANDBOX',
        businessDate: '2026-08-18',
        credentialSecretRef: 'secret/ref',
        traceId: 'trace-1',
      }),
    ).rejects.toThrow('duplicate references');
  });
});
