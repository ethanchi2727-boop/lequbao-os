import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  CommercePaymentCallbackVerifier,
  CommercePaymentProviderGateway,
} from './commerce-payment-service.js';
import type { CommerceReconciliationProvider } from './commerce-reconciliation-service.js';
import type { CommerceRefundProviderGateway } from './commerce-refund-service.js';

type Options = {
  baseUrl: string;
  serviceToken: string;
  callbackSecret: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

const PaymentResponseSchema = z.object({
  providerPaymentId: z.string().min(1).max(255),
  clientCredential: z.string().min(1).max(16_384),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  responseSummary: z.record(z.string(), z.unknown()),
});
const RefundResponseSchema = z.object({
  providerRefundId: z.string().min(1).max(255),
  providerRequestId: z.string().min(1).max(255),
  status: z.enum(['PROCESSING', 'SUCCEEDED']),
});
const CallbackSchema = z.object({
  tenantId: z.uuid(),
  provider: z.enum(['WECHAT_PAY', 'ALIPAY', 'SANDBOX']),
  providerEventId: z.string().min(1).max(255),
  eventType: z.enum(['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'REFUND_SUCCEEDED', 'REFUND_FAILED']),
  merchantAccountHash: z.string().regex(/^[a-f0-9]{64}$/u),
  paymentIntentId: z.uuid().optional(),
  refundId: z.uuid().optional(),
  providerTransactionId: z.string().min(1).max(255).optional(),
  providerRefundId: z.string().min(1).max(255).optional(),
  amountCents: z.number().int().positive(),
  reasonCode: z.string().min(1).max(120).optional(),
  occurredAt: z.string().datetime({ offset: true }),
});
const BillSchema = z.object({
  objectRef: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  lines: z.array(
    z.object({
      type: z.enum(['PAYMENT', 'REFUND']),
      providerReferenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
      amountCents: z.number().int().nonnegative(),
    }),
  ),
});

function client(options: Options) {
  if (!URL.canParse(options.baseUrl))
    throw new Error('COMMERCE_PROVIDER_GATEWAY_URL must be absolute');
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('COMMERCE_PROVIDER_GATEWAY_TOKEN must contain at least 16 bytes');
  if (Buffer.byteLength(options.callbackSecret, 'utf8') < 32)
    throw new Error('COMMERCE_CALLBACK_SECRET must contain at least 32 bytes');
  const fetcher = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  return async (path: string, body: unknown, traceId: string) => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.serviceToken}`,
        'content-type': 'application/json',
        'x-trace-id': traceId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
    if (!response.ok)
      throw new Error(`commerce provider gateway rejected request: ${response.status}`);
    return response.json();
  };
}

export function createHttpCommerceAdapters(options: Options): {
  payment: CommercePaymentProviderGateway;
  callback: CommercePaymentCallbackVerifier;
  refund: CommerceRefundProviderGateway;
  reconciliation: CommerceReconciliationProvider;
} {
  const post = client(options);
  return {
    payment: {
      async createPayment(input) {
        return PaymentResponseSchema.parse(await post('/v1/payments', input, input.traceId));
      },
    },
    callback: {
      async verify(input) {
        if (!/^[a-f0-9]{64}$/iu.test(input.signature))
          throw new Error('invalid callback signature');
        const expected = createHmac('sha256', options.callbackSecret)
          .update(`${input.provider}\n${input.rawBody}`)
          .digest();
        const actual = Buffer.from(input.signature, 'hex');
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
          throw new Error('invalid callback signature');
        const event = CallbackSchema.parse(JSON.parse(input.rawBody));
        if (event.provider !== input.provider) throw new Error('callback provider mismatch');
        return event;
      },
    },
    refund: {
      async submitRefund(input) {
        return RefundResponseSchema.parse(await post('/v1/refunds', input, input.traceId));
      },
    },
    reconciliation: {
      async fetchDailyBill(input) {
        const bill = BillSchema.parse(
          await post('/v1/reconciliation/daily-bill', input, input.traceId),
        );
        const seen = new Set<string>();
        for (const line of bill.lines) {
          const key = `${line.type}:${line.providerReferenceHash}`;
          if (seen.has(key)) throw new Error('provider bill contains duplicate references');
          seen.add(key);
        }
        return bill;
      },
    },
  };
}
