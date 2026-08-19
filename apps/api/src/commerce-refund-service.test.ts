import { describe, expect, it, vi } from 'vitest';
import { createCommerceRefundService } from './commerce-refund-service.js';

const tenantId = '4d000000-0000-4000-8000-000000000001';
const customerId = '4d000000-0000-4000-8000-000000000002';
const storeId = '4d000000-0000-4000-8000-000000000003';
const orderId = '4d000000-0000-4000-8000-000000000004';
const orderItemId = '4d000000-0000-4000-8000-000000000005';
const paymentIntentId = '4d000000-0000-4000-8000-000000000006';
const refundId = '4d000000-0000-4000-8000-000000000007';
const userId = '4d000000-0000-4000-8000-000000000008';
const platformAccountId = '4d000000-0000-4000-8000-000000000010';

const consumer = {
  tenantId,
  customerId,
  storeId,
  sessionId: 'consumer-refund-session',
  authLevel: 'PHONE_BOUND' as const,
};
const staff = {
  tenantId,
  userId,
  roleCodes: ['FINANCE'],
  storeIds: [storeId],
  sessionId: 'finance-session',
  authLevel: 'MFA' as const,
  accessScopes: ['TENANT'],
  assignedStoreIds: [],
};
type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

function fixture(options: { threshold?: number; usedUses?: number; providerError?: Error } = {}) {
  let status = 'SUBMITTING';
  let approvalStatus: string | null = null;
  let approvalRequired = false;
  let capturedRefundId = refundId;
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT id FROM orders')) return result([{ id: orderId }]);
    if (sql.startsWith('SELECT id FROM refunds')) return result([{ id: refundId }]);
    if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'idem' }]);
    if (sql.startsWith('SELECT orders.id,orders.store_id'))
      return result([
        {
          id: orderId,
          store_id: storeId,
          customer_id: customerId,
          status: 'PAID',
          payment_status: 'PAID',
          aftercare_status: 'NONE',
          paid_amount_cents: 1000,
          refunded_amount_cents: 0,
          payment_intent_id: paymentIntentId,
        },
      ]);
    if (sql.startsWith('SELECT item.id,item.quantity'))
      return result([
        {
          id: orderItemId,
          quantity: 2,
          refunded_quantity: 0,
          paid_allocation_cents: 1000,
          refunded_amount_cents: 0,
          used_uses: options.usedUses ?? 0,
        },
      ]);
    if (sql.startsWith('INSERT INTO refunds')) {
      capturedRefundId = String(values?.[0]);
      status = String(values?.[7]);
      approvalRequired = status === 'APPROVAL_REQUIRED';
      return result([], 1);
    }
    if (sql.startsWith('INSERT INTO refund_approvals')) {
      approvalStatus = 'PENDING';
      return result([], 1);
    }
    if (sql.startsWith('SELECT refund.id,refund.refund_no'))
      return result([
        {
          id: capturedRefundId,
          refund_no: 'RFTEST',
          order_id: orderId,
          amount_cents: 500,
          reason_code: 'CUSTOMER_REQUEST',
          status,
          approval_required: approvalRequired,
          version: 1,
        },
      ]);
    if (sql.startsWith('SELECT order_item_id,quantity,amount_cents'))
      return result([{ order_item_id: orderItemId, quantity: 1, amount_cents: 500 }]);
    if (sql.startsWith('SELECT approval.id,orders.store_id'))
      return result([
        {
          id: '4d000000-0000-4000-8000-000000000009',
          store_id: storeId,
          requested_by: null,
          status: approvalStatus,
          expires_at: '2027-08-18T08:00:00.000Z',
        },
      ]);
    if (sql.startsWith('UPDATE refund_approvals')) {
      approvalStatus = String(values?.[2]);
      return result([], 1);
    }
    if (sql.startsWith('UPDATE refunds SET status=$3')) {
      status = String(values?.[2]);
      return result([], 1);
    }
    if (sql.startsWith('SELECT refund.id AS refund_id'))
      return result([
        {
          refund_id: capturedRefundId,
          refund_status: status,
          payment_intent_id: paymentIntentId,
          amount_cents: 500,
          approval_required: approvalRequired,
          approval_status: approvalStatus,
          provider: 'SANDBOX',
          provider_payment_id: 'provider-payment-1',
          credential_secret_ref: 'secret://sandbox/payment',
          attempt_count: 0,
        },
      ]);
    if (sql.startsWith("UPDATE refunds SET status='PROCESSING'")) {
      status = 'PROCESSING';
      return result([], 1);
    }
    return result([], 1);
  });
  const provider = {
    submitRefund: options.providerError
      ? vi.fn().mockRejectedValue(options.providerError)
      : vi.fn().mockResolvedValue({
          providerRefundId: 'provider-refund-1',
          providerRequestId: 'provider-request-1',
          status: 'PROCESSING' as const,
        }),
  };
  const putText = vi.fn().mockResolvedValue(undefined);
  const client = { query, release: vi.fn() };
  const service = createCommerceRefundService({
    pool: { connect: vi.fn(async () => client) } as never,
    objectStore: { putText },
    provider,
    ...(options.threshold === undefined ? {} : { approvalThresholdCents: options.threshold }),
  });
  return { service, query, provider, putText };
}

const requestCommand = (extra: Record<string, unknown> = {}) => ({
  identity: consumer,
  idempotencyKey: 'refund-request-1',
  traceId: 'trace-refund-request-1',
  body: {
    orderId,
    requestType: 'UNUSED_GROUP_BUY_REFUND',
    reasonCode: 'CUSTOMER_REQUEST',
    items: [{ orderItemId, quantity: 1 }],
    ...extra,
  },
});

describe('refund request, approval and provider submission', () => {
  it('REF-001 derives a partial refund from original paid item allocation and ignores client amount', async () => {
    const fx = fixture();
    const response = await fx.service.request(requestCommand({ amountCents: 999_999 }));
    expect(response.amountCents).toBe(500);
    expect(response.items).toEqual([{ orderItemId, quantity: 1, amountCents: 500 }]);
    const refundInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO refunds'),
    );
    expect(refundInsert?.[1]?.[5]).toBe(500);
    expect(JSON.stringify(fx.query.mock.calls)).not.toContain('999999');
  });

  it('revalidates the platform session and active account-to-merchant link inside the refund service', async () => {
    const fx = fixture();
    await fx.service.requestPlatform({
      identity: {
        accountId: platformAccountId,
        sessionId: 'platform-refund-session',
        authLevel: 'PHONE_BOUND',
      },
      tenantId,
      customerId,
      storeId,
      idempotencyKey: 'platform-refund-1',
      traceId: 'platform-refund-trace',
      body: requestCommand().body,
    });
    const validation = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM platform_consumer_sessions'),
    );
    expect(validation?.[1]).toEqual([
      'platform-refund-session',
      platformAccountId,
      tenantId,
      customerId,
    ]);
  });

  it('REF-004 requires qualified approval before a high-value refund can call the provider', async () => {
    const fx = fixture({ threshold: 100 });
    const requested = await fx.service.request(requestCommand());
    expect(requested.status).toBe('APPROVAL_REQUIRED');
    expect(requested.approvalRequired).toBe(true);
    await expect(
      fx.service.submit({
        tenantId,
        refundId: requested.id,
        traceId: 'trace-submit-before-approval',
      }),
    ).rejects.toThrow('not ready for provider submission');
    expect(fx.provider.submitRefund).not.toHaveBeenCalled();

    await fx.service.approve({
      identity: staff,
      idempotencyKey: 'refund-approve-1',
      traceId: 'trace-refund-approve-1',
      body: { refundId: requested.id, decision: 'APPROVED', reason: '财务复核通过' },
    });
    await fx.service.submit({ tenantId, refundId: requested.id, traceId: 'trace-submit-approved' });
    expect(fx.provider.submitRefund).toHaveBeenCalledTimes(1);
  });

  it('lists persisted refunds only for the current merchant consumer order scope', async () => {
    const fx = fixture();
    await expect(fx.service.listForConsumer(consumer, orderId)).resolves.toEqual([
      expect.objectContaining({ id: refundId, orderId, amountCents: 500 }),
    ]);
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("source_channel='MERCHANT_MINI_PROGRAM'"),
      [tenantId, orderId, customerId, storeId],
    );
  });

  it('REF-002 records an unknown provider result and forbids blind external retry', async () => {
    const fx = fixture({ providerError: new Error('timeout after submission') });
    const requested = await fx.service.request(requestCommand());
    await expect(
      fx.service.submit({ tenantId, refundId: requested.id, traceId: 'trace-refund-timeout' }),
    ).rejects.toThrow('query before retry');
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("SET status='UNKNOWN'"))).toBe(
      true,
    );
    expect(fx.provider.submitRefund).toHaveBeenCalledTimes(1);
  });
});
