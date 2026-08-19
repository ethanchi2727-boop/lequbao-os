import { describe, expect, it, vi } from 'vitest';
import {
  CommercePaymentSignatureError,
  createCommercePaymentService,
  type CommercePaymentCallbackEvent,
} from './commerce-payment-service.js';

const tenantId = '4c000000-0000-4000-8000-000000000001';
const customerId = '4c000000-0000-4000-8000-000000000002';
const storeId = '4c000000-0000-4000-8000-000000000003';
const orderId = '4c000000-0000-4000-8000-000000000004';
const orderItemId = '4c000000-0000-4000-8000-000000000005';
const variantId = '4c000000-0000-4000-8000-000000000006';
const paymentIntentId = '4c000000-0000-4000-8000-000000000007';
const paymentAccountId = '4c000000-0000-4000-8000-000000000008';
const callbackReceiptId = '4c000000-0000-4000-8000-000000000009';
const refundId = '4c000000-0000-4000-8000-000000000010';
const providerAccountHash = 'a'.repeat(64);

const consumer = {
  tenantId,
  customerId,
  storeId,
  sessionId: 'consumer-payment-session',
  authLevel: 'PHONE_BOUND' as const,
};
type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

const paymentEvent = (eventId = 'provider-event-payment-1'): CommercePaymentCallbackEvent => ({
  tenantId,
  provider: 'SANDBOX',
  providerEventId: eventId,
  eventType: 'PAYMENT_SUCCEEDED',
  merchantAccountHash: providerAccountHash,
  paymentIntentId,
  providerTransactionId: 'provider-transaction-1',
  amountCents: 1000,
  occurredAt: '2026-08-18T06:00:00.000Z',
});

function fixture(
  options: {
    event?: CommercePaymentCallbackEvent;
    verifierError?: Error;
    failPaymentOutbox?: boolean;
    replayPendingCreate?: boolean;
  } = {},
) {
  let receiptApplied = false;
  let receiptCreated = false;
  let receiptEventHash = '';
  let receiptPayloadHash = '';
  let idempotencyHash = '';
  const event = options.event ?? paymentEvent();
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('INSERT INTO idempotency_keys')) {
      idempotencyHash = String(values?.[2]);
      return options.replayPendingCreate ? result() : result([{ id: 'idem' }]);
    }
    if (sql.startsWith('SELECT request_hash,response_body'))
      return result([{ request_hash: idempotencyHash, response_body: null }]);
    if (sql.startsWith('UPDATE payment_intents intent SET last_query_at'))
      return result([
        {
          payment_intent_id: paymentIntentId,
          order_id: orderId,
          order_no: 'LQPAYMENT1',
          provider: 'SANDBOX',
          amount_cents: 1000,
          currency: 'CNY',
          credential_secret_ref: 'secret://sandbox/merchant-payment',
          provider_account_hash: providerAccountHash,
        },
      ]);
    if (sql.startsWith('SELECT id,order_no,customer_id'))
      return result([
        {
          id: orderId,
          order_no: 'LQPAYMENT1',
          customer_id: customerId,
          store_id: storeId,
          status: 'PENDING_PAYMENT',
          payable_amount_cents: 1000,
          currency: 'CNY',
          expires_at: '2027-08-18T06:00:00.000Z',
        },
      ]);
    if (sql.startsWith('SELECT id,provider_account_hash,credential_secret_ref'))
      return result([
        {
          id: paymentAccountId,
          provider_account_hash: providerAccountHash,
          credential_secret_ref: 'secret://sandbox/merchant-payment',
          settlement_subject_ref: 'merchant://sandbox-account',
        },
      ]);
    if (sql.startsWith("UPDATE payment_intents SET status='PROCESSING'")) return result([], 1);
    if (sql.startsWith('SELECT 1 FROM merchant_payment_accounts')) return result([{ ok: true }]);
    if (sql.startsWith('INSERT INTO payment_callback_receipts')) {
      if (receiptCreated) return result();
      receiptCreated = true;
      receiptEventHash = String(values?.[3]);
      receiptPayloadHash = String(values?.[5]);
      return result([{ id: callbackReceiptId }]);
    }
    if (sql.startsWith('SELECT id,tenant_id,provider_event_hash'))
      return result([
        {
          id: callbackReceiptId,
          tenant_id: tenantId,
          provider_event_hash: receiptEventHash,
          payload_hash: receiptPayloadHash,
          processing_status: receiptApplied ? 'APPLIED' : 'RECEIVED',
        },
      ]);
    if (sql.startsWith('SELECT payment.id AS payment_intent_id'))
      return result([
        {
          payment_intent_id: paymentIntentId,
          payment_status: 'PROCESSING',
          provider: 'SANDBOX',
          amount_cents: 1000,
          provider_account_hash: providerAccountHash,
          order_id: orderId,
          order_no: 'LQPAYMENT1',
          order_status: 'PENDING_PAYMENT',
          order_type: 'GROUP_BUY',
          customer_id: customerId,
          store_id: storeId,
          currency: 'CNY',
          order_version: 1,
        },
      ]);
    if (sql.startsWith('SELECT variant_id,quantity::bigint'))
      return result([{ variant_id: variantId, quantity: 2, order_item_id: orderItemId }]);
    if (sql.startsWith('SELECT COALESCE(sum('))
      return result([
        { reward_amount_cents: 50, rule_version: 'reward-v1', funding_source: 'MERCHANT' },
      ]);
    if (sql.startsWith('SELECT id,owner_type FROM reward_accounts'))
      return result([
        { id: '4c000000-0000-4000-8000-000000000011', owner_type: 'CUSTOMER' },
        { id: '4c000000-0000-4000-8000-000000000012', owner_type: 'MERCHANT_FUND' },
      ]);
    if (sql.includes("'payment.succeeded.v1'") && options.failPaymentOutbox)
      throw new Error('outbox unavailable');
    if (sql.startsWith('UPDATE payment_callback_receipts')) {
      receiptApplied = true;
      return result([], 1);
    }
    return result([], 1);
  });
  const putText = vi.fn().mockResolvedValue(undefined);
  const getText = vi.fn().mockResolvedValue(
    JSON.stringify({
      clientCredential: 'signed-client-credential',
      providerPaymentId: 'provider-prepay-1',
      expiresAt: '2027-08-18T06:00:00.000Z',
    }),
  );
  const gateway = {
    createPayment: vi.fn().mockResolvedValue({
      providerPaymentId: 'provider-prepay-1',
      clientCredential: 'signed-client-credential',
      expiresAt: '2027-08-18T06:00:00.000Z',
      responseSummary: { code: 'OK' },
    }),
  };
  const verifier = {
    verify: options.verifierError
      ? vi.fn().mockRejectedValue(options.verifierError)
      : vi.fn().mockResolvedValue(event),
  };
  const client = { query, release: vi.fn() };
  return {
    query,
    putText,
    gateway,
    verifier,
    service: createCommercePaymentService({
      pool: { connect: vi.fn(async () => client) } as never,
      objectStore: { putText, getText },
      provider: gateway,
      callbackVerifier: verifier,
      verificationTokenSecret: 'verification-token-secret-with-at-least-thirty-two-bytes',
    }),
  };
}

describe('merchant-direct payment', () => {
  it('PAY-001 creates the credential against the confirmed merchant account and server order amount', async () => {
    const fx = fixture();
    const response = await fx.service.createIntent({
      identity: consumer,
      idempotencyKey: 'payment-create-1',
      traceId: 'trace-payment-create-1',
      body: { orderId, provider: 'SANDBOX', amountCents: 1, merchantAccount: 'attacker' },
    });
    expect(response.amountCents).toBe(1000);
    expect(fx.gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 1000,
        credentialSecretRef: 'secret://sandbox/merchant-payment',
        providerAccountHash,
      }),
    );
    expect(JSON.stringify(fx.query.mock.calls)).not.toContain('attacker');
  });

  it('PAY-002 never turns an order PAID from client-supplied payment result fields', async () => {
    const fx = fixture();
    await fx.service.createIntent({
      identity: consumer,
      idempotencyKey: 'payment-forged-result',
      traceId: 'trace-payment-forged-result',
      body: { orderId, provider: 'SANDBOX', status: 'SUCCEEDED', paid: true },
    });
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE orders SET status='PAID'")),
    ).toBe(false);
  });

  it('uses a live platform account-to-merchant link for 乐趣生活 payment creation', async () => {
    const fx = fixture();
    await expect(
      fx.service.createPlatformIntent({
        identity: {
          accountId: '4c000000-0000-4000-8000-000000000099',
          sessionId: 'life-payment-session',
          authLevel: 'PHONE_BOUND',
        },
        merchantTenantId: tenantId,
        customerId,
        storeId,
        idempotencyKey: 'life-payment-create',
        traceId: 'trace-life-payment-create',
        body: { orderId, provider: 'SANDBOX' },
      }),
    ).resolves.toMatchObject({ orderId, status: 'PROCESSING' });
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.consumer_account_id'"),
      ['4c000000-0000-4000-8000-000000000099'],
    );
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes('platform_consumer_tenant_links')),
    ).toBe(true);
  });

  it('recovers an unknown provider-create result with the same local intent and idempotency key', async () => {
    const fx = fixture({ replayPendingCreate: true });
    const response = await fx.service.createIntent({
      identity: consumer,
      idempotencyKey: 'payment-timeout-recovery',
      traceId: 'trace-payment-timeout-recovery',
      body: { orderId, provider: 'SANDBOX' },
    });
    expect(response.id).toBe(paymentIntentId);
    expect(fx.gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId,
        idempotencyKey: 'payment-timeout-recovery',
      }),
    );
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes('last_query_at<now()'))).toBe(
      true,
    );
  });

  it('PAY-003 / REW-001 / REW-002 applies ten callbacks and one balanced reward grant', async () => {
    const fx = fixture();
    for (let delivery = 0; delivery < 10; delivery += 1)
      await fx.service.receiveCallback({
        provider: 'SANDBOX',
        signature: 'valid-signature',
        rawBody: '{"event":"payment-1"}',
        traceId: `trace-callback-${delivery}`,
      });
    const transactionWrites = () =>
      fx.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO payment_transactions'),
      ).length;
    expect(transactionWrites()).toBe(1);
    expect(
      fx.query.mock.calls.filter(([sql]) => String(sql).includes("'payment.succeeded.v1'")),
    ).toHaveLength(1);
    const rewardEntries = fx.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO ledger_entries'),
    );
    expect(rewardEntries).toHaveLength(1);
    expect(String(rewardEntries[0]?.[0])).toContain('($1,$2,$3,$5),($1,$2,$4,-$5)');
    const rewardRead = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('reward_amount_cents'),
    );
    expect(String(rewardRead?.[0])).toContain('item.reward_rule_snapshot');
    expect(String(rewardRead?.[0])).not.toContain('JOIN products');
  });

  it('PAY-004 rejects an invalid signature before raw evidence or database success is written', async () => {
    const fx = fixture({ verifierError: new Error('bad signature') });
    await expect(
      fx.service.receiveCallback({
        provider: 'SANDBOX',
        signature: 'invalid',
        rawBody: '{"forged":true}',
        traceId: 'trace-forged-callback',
      }),
    ).rejects.toBeInstanceOf(CommercePaymentSignatureError);
    expect(fx.putText).not.toHaveBeenCalled();
    expect(fx.query).not.toHaveBeenCalled();
  });

  it('PAY-005 rolls back payment success when durable Outbox insertion fails', async () => {
    const fx = fixture({ failPaymentOutbox: true });
    await expect(
      fx.service.receiveCallback({
        provider: 'SANDBOX',
        signature: 'valid-signature',
        rawBody: '{"event":"payment-outbox-failure"}',
        traceId: 'trace-outbox-failure',
      }),
    ).rejects.toThrow('callback transaction must be retried');
    expect(fx.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes("processing_status='APPLIED'")),
    ).toBe(false);
  });
});

describe('refund callback convergence', () => {
  const refundEvent: CommercePaymentCallbackEvent = {
    tenantId,
    provider: 'SANDBOX',
    providerEventId: 'provider-refund-event-1',
    eventType: 'REFUND_SUCCEEDED',
    merchantAccountHash: providerAccountHash,
    refundId,
    providerRefundId: 'provider-refund-1',
    amountCents: 200,
    occurredAt: '2026-08-18T07:00:00.000Z',
  };

  it('REF-002 / REF-003 / REW-003 converges success and appends linked reward reversal', async () => {
    const fx = fixture({ event: refundEvent });
    fx.query.mockImplementation(async (rawSql: string) => {
      const sql = rawSql.replace(/\s+/gu, ' ').trim();
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK'))
        return result();
      if (sql.startsWith("SELECT set_config('app.tenant_id'")) return result();
      if (sql.startsWith('SELECT 1 FROM merchant_payment_accounts')) return result([{ ok: true }]);
      if (sql.startsWith('INSERT INTO payment_callback_receipts'))
        return result([{ id: callbackReceiptId }]);
      if (sql.startsWith('SELECT refund.status AS refund_status'))
        return result([
          {
            refund_status: 'PROCESSING',
            amount_cents: 200,
            order_id: orderId,
            payment_intent_id: paymentIntentId,
            paid_amount_cents: 1000,
            refunded_amount_cents: 0,
            provider: 'SANDBOX',
            provider_account_hash: providerAccountHash,
          },
        ]);
      if (sql.startsWith('SELECT id,grant_transaction_id'))
        return result([
          {
            id: '4c000000-0000-4000-8000-000000000013',
            grant_transaction_id: '4c000000-0000-4000-8000-000000000014',
            account_id: '4c000000-0000-4000-8000-000000000015',
            granted_amount_cents: 50,
            reversed_amount_cents: 0,
            customer_id: customerId,
          },
        ]);
      if (sql.startsWith('SELECT account_id,amount_cents FROM ledger_entries'))
        return result([
          { account_id: '4c000000-0000-4000-8000-000000000015', amount_cents: 50 },
          { account_id: '4c000000-0000-4000-8000-000000000016', amount_cents: -50 },
        ]);
      return result([], 1);
    });
    await expect(
      fx.service.receiveCallback({
        provider: 'SANDBOX',
        signature: 'valid-signature',
        rawBody: '{"event":"refund-1"}',
        traceId: 'trace-refund-1',
      }),
    ).resolves.toEqual({ status: 'SUCCESS' });
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("SET status='VOIDED'"))).toBe(
      true,
    );
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("'REWARD_REVERSE'"))).toBe(
      true,
    );
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes('original_transaction_id')),
    ).toBe(true);
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("'refund.succeeded.v1'"))).toBe(
      true,
    );
  });
});
