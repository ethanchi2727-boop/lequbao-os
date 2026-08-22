import { describe, expect, it, vi } from 'vitest';
import { createCommerceReconciliationService } from './commerce-reconciliation-service.js';

const tenantId = '4f000000-0000-4000-8000-000000000001';
const userId = '4f000000-0000-4000-8000-000000000002';
const paymentIntentId = '4f000000-0000-4000-8000-000000000003';
const refundId = '4f000000-0000-4000-8000-000000000004';
const paymentHash = 'a'.repeat(64);
const refundHash = 'b'.repeat(64);
const billHash = 'c'.repeat(64);
const identity = {
  tenantId,
  userId,
  roleCodes: ['FINANCE'],
  storeIds: [],
  sessionId: 'finance-reconciliation-session',
  authLevel: 'MFA' as const,
  accessScopes: ['TENANT'],
};
type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

function fixture(providerPaymentCents: number) {
  let batchId = '4f000000-0000-4000-8000-000000000005';
  let status = 'CALCULATING';
  let differenceCents = 0;
  const discrepancies: Array<{
    id: string;
    reason_code: string;
    amount_cents: number;
    status: string;
  }> = [];
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT id FROM commerce_reconciliation_batches')) return result();
    if (sql.startsWith('SELECT credential_secret_ref FROM merchant_payment_accounts'))
      return result([{ credential_secret_ref: 'secret://sandbox/reconciliation' }]);
    if (sql.startsWith('INSERT INTO commerce_reconciliation_batches')) {
      batchId = String(values?.[0]);
      return result([], 1);
    }
    if (sql.startsWith('SELECT payment.payment_intent_id AS business_id'))
      return result([
        { business_id: paymentIntentId, provider_reference_hash: paymentHash, amount_cents: 1000 },
      ]);
    if (sql.startsWith('SELECT refund.id AS business_id'))
      return result([
        { business_id: refundId, provider_reference_hash: refundHash, amount_cents: 200 },
      ]);
    if (sql.startsWith('SELECT COALESCE(sum(orders.paid_amount_cents)'))
      return result([{ paid_cents: 1000, refunded_cents: 200 }]);
    if (sql.startsWith('SELECT COALESCE((SELECT sum(entry.amount_cents)'))
      return result([{ reward_net_cents: 50, verification_count: 1 }]);
    if (sql.startsWith('UPDATE commerce_reconciliation_batches SET status=$3')) {
      status = String(values?.[2]);
      differenceCents = Number(values?.[9]);
      return result([], 1);
    }
    if (sql.startsWith('INSERT INTO commerce_reconciliation_discrepancies')) {
      discrepancies.push({
        id: '4f000000-0000-4000-8000-000000000006',
        reason_code: String(values?.[3]),
        amount_cents: Number(values?.[4]),
        status: 'OPEN',
      });
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,business_date,provider,status'))
      return result([
        {
          id: batchId,
          business_date: '2026-08-18',
          provider: 'SANDBOX',
          status,
          order_paid_cents: 1000,
          provider_paid_cents: providerPaymentCents,
          order_refunded_cents: 200,
          provider_refunded_cents: 200,
          reward_net_cents: 50,
          verification_count: 1,
          difference_cents: differenceCents,
        },
      ]);
    if (sql.startsWith('SELECT id,reason_code,amount_cents,status')) return result(discrepancies);
    return result([], 1);
  });
  const provider = {
    fetchDailyBill: vi.fn().mockResolvedValue({
      objectRef: 'object://sandbox/bill/2026-08-18',
      sha256: billHash,
      lines: [
        {
          type: 'PAYMENT' as const,
          providerReferenceHash: paymentHash,
          amountCents: providerPaymentCents,
        },
        { type: 'REFUND' as const, providerReferenceHash: refundHash, amountCents: 200 },
      ],
    }),
  };
  const service = createCommerceReconciliationService({
    pool: { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
    provider,
  });
  return { query, provider, service };
}

describe('daily commerce reconciliation', () => {
  it('REC-001 balances provider evidence against payments, refunds, orders, rewards and uses', async () => {
    const fx = fixture(1000);
    const response = await fx.service.run({
      identity,
      traceId: 'trace-reconciliation-balanced',
      body: { businessDate: '2026-08-18', provider: 'SANDBOX' },
    });
    expect(response).toEqual(
      expect.objectContaining({
        status: 'BALANCED',
        orderPaidCents: 1000,
        providerPaidCents: 1000,
        orderRefundedCents: 200,
        providerRefundedCents: 200,
        rewardNetCents: 50,
        verificationCount: 1,
        differenceCents: 0,
      }),
    );
    expect(fx.provider.fetchDailyBill).toHaveBeenCalledWith(
      expect.objectContaining({ credentialSecretRef: 'secret://sandbox/reconciliation' }),
    );
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining('provider_bill_object_ref'),
      expect.arrayContaining(['object://sandbox/bill/2026-08-18', billHash]),
    );
  });

  it('REC-002 stops on a one-cent provider difference and creates a human discrepancy', async () => {
    const fx = fixture(1001);
    const response = await fx.service.run({
      identity,
      traceId: 'trace-reconciliation-difference',
      body: { businessDate: '2026-08-18', provider: 'SANDBOX' },
    });
    expect(response.status).toBe('DIFFERENCE_FOUND');
    expect(response.differenceCents).toBe(1);
    expect(response.discrepancies).toEqual([
      expect.objectContaining({
        reasonCode: 'PAYMENT_AMOUNT_MISMATCH',
        amountCents: 1,
        status: 'OPEN',
      }),
    ]);
  });
});
