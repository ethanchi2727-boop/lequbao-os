import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import type { SessionIdentity } from './session-identity.js';

const ProviderSchema = z.enum(['WECHAT_PAY', 'ALIPAY', 'SANDBOX']);
const RunReconciliationSchema = z.object({
  businessDate: z.string().date(),
  provider: ProviderSchema,
});
const ProviderBillSchema = z.object({
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
const ReconciliationViewSchema = z.object({
  id: z.string().uuid(),
  businessDate: z.string(),
  provider: ProviderSchema,
  status: z.enum(['BALANCED', 'DIFFERENCE_FOUND', 'REVIEWING', 'RESOLVED', 'FAILED']),
  orderPaidCents: z.number().int().nonnegative(),
  providerPaidCents: z.number().int().nonnegative(),
  orderRefundedCents: z.number().int().nonnegative(),
  providerRefundedCents: z.number().int().nonnegative(),
  rewardNetCents: z.number().int(),
  verificationCount: z.number().int().nonnegative(),
  differenceCents: z.number().int(),
  discrepancies: z.array(
    z.object({
      id: z.string().uuid(),
      reasonCode: z.string(),
      amountCents: z.number().int(),
      status: z.string(),
    }),
  ),
});

type StaffIdentity = SessionIdentity & { accessScopes?: string[] };

export interface CommerceReconciliationProvider {
  fetchDailyBill(input: {
    tenantId: string;
    provider: z.infer<typeof ProviderSchema>;
    businessDate: string;
    credentialSecretRef: string;
    traceId: string;
  }): Promise<z.infer<typeof ProviderBillSchema>>;
}

export interface CommerceReconciliationService {
  run(command: {
    identity: StaffIdentity;
    traceId: string;
    body: unknown;
  }): Promise<z.infer<typeof ReconciliationViewSchema>>;
}

export class CommerceReconciliationAuthorizationError extends Error {}
export class CommerceReconciliationStateError extends Error {}

export function createCommerceReconciliationService(options: {
  pool: Pick<pg.Pool, 'connect'>;
  provider: CommerceReconciliationProvider;
}): CommerceReconciliationService {
  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await options.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function load(client: pg.PoolClient, tenantId: string, batchId: string) {
    const batch = await client.query<{
      id: string;
      business_date: Date | string;
      provider: z.infer<typeof ProviderSchema>;
      status: string;
      order_paid_cents: string | number;
      provider_paid_cents: string | number;
      order_refunded_cents: string | number;
      provider_refunded_cents: string | number;
      reward_net_cents: string | number;
      verification_count: string | number;
      difference_cents: string | number;
    }>(
      `SELECT id,business_date,provider,status,order_paid_cents,provider_paid_cents,
              order_refunded_cents,provider_refunded_cents,reward_net_cents,
              verification_count,difference_cents
         FROM commerce_reconciliation_batches WHERE tenant_id=$1 AND id=$2`,
      [tenantId, batchId],
    );
    const current = batch.rows[0];
    if (!current) throw new CommerceReconciliationStateError('reconciliation batch missing');
    const discrepancies = await client.query<{
      id: string;
      reason_code: string;
      amount_cents: string | number;
      status: string;
    }>(
      `SELECT id,reason_code,amount_cents,status FROM commerce_reconciliation_discrepancies
        WHERE tenant_id=$1 AND batch_id=$2 ORDER BY created_at,id`,
      [tenantId, batchId],
    );
    return ReconciliationViewSchema.parse({
      id: current.id,
      businessDate: new Date(current.business_date).toISOString().slice(0, 10),
      provider: current.provider,
      status: current.status,
      orderPaidCents: Number(current.order_paid_cents),
      providerPaidCents: Number(current.provider_paid_cents),
      orderRefundedCents: Number(current.order_refunded_cents),
      providerRefundedCents: Number(current.provider_refunded_cents),
      rewardNetCents: Number(current.reward_net_cents),
      verificationCount: Number(current.verification_count),
      differenceCents: Number(current.difference_cents),
      discrepancies: discrepancies.rows.map((item) => ({
        id: item.id,
        reasonCode: item.reason_code,
        amountCents: Number(item.amount_cents),
        status: item.status,
      })),
    });
  }

  return {
    async run(command) {
      const input = RunReconciliationSchema.parse(command.body);
      if (!(command.identity.accessScopes ?? []).some((scope) => ['TENANT', 'ALL'].includes(scope)))
        throw new CommerceReconciliationAuthorizationError('tenant finance scope required');
      const account = await transaction(command.identity.tenantId, async (client) => {
        const existing = await client.query<{ id: string; status: string }>(
          `SELECT id,status FROM commerce_reconciliation_batches
            WHERE tenant_id=$1 AND business_date=$2 AND provider=$3`,
          [command.identity.tenantId, input.businessDate, input.provider],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].status === 'CALCULATING')
            throw new CommerceReconciliationStateError('reconciliation batch is still calculating');
          return { existingBatchId: existing.rows[0].id };
        }
        const paymentAccount = await client.query<{ credential_secret_ref: string }>(
          `SELECT credential_secret_ref FROM merchant_payment_accounts
            WHERE tenant_id=$1 AND provider=$2 AND status='ACTIVE' AND confirmed_at IS NOT NULL
            ORDER BY confirmed_at DESC,id LIMIT 1`,
          [command.identity.tenantId, input.provider],
        );
        const current = paymentAccount.rows[0];
        if (!current) throw new CommerceReconciliationStateError('payment account unavailable');
        return { credentialSecretRef: current.credential_secret_ref };
      });
      if ('existingBatchId' in account && account.existingBatchId)
        return transaction(command.identity.tenantId, (client) =>
          load(client, command.identity.tenantId, account.existingBatchId),
        );
      if (!('credentialSecretRef' in account) || !account.credentialSecretRef)
        throw new CommerceReconciliationStateError('payment account unavailable');
      const bill = ProviderBillSchema.parse(
        await options.provider.fetchDailyBill({
          tenantId: command.identity.tenantId,
          provider: input.provider,
          businessDate: input.businessDate,
          credentialSecretRef: account.credentialSecretRef,
          traceId: command.traceId,
        }),
      );
      return transaction(command.identity.tenantId, async (client) => {
        const lockKey = `${command.identity.tenantId}:${input.provider}:${input.businessDate}`;
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [lockKey]);
        const raced = await client.query<{ id: string; status: string }>(
          `SELECT id,status FROM commerce_reconciliation_batches
            WHERE tenant_id=$1 AND business_date=$2 AND provider=$3`,
          [command.identity.tenantId, input.businessDate, input.provider],
        );
        if (raced.rows[0]) {
          if (raced.rows[0].status === 'CALCULATING')
            throw new CommerceReconciliationStateError('reconciliation batch is still calculating');
          return load(client, command.identity.tenantId, raced.rows[0].id);
        }
        const batchId = randomUUID();
        await client.query(
          `INSERT INTO commerce_reconciliation_batches(
             id,tenant_id,business_date,provider,provider_bill_object_ref,provider_bill_hash,status
           ) VALUES ($1,$2,$3,$4,$5,$6,'CALCULATING')`,
          [
            batchId,
            command.identity.tenantId,
            input.businessDate,
            input.provider,
            bill.objectRef,
            bill.sha256,
          ],
        );
        const payments = await client.query<{
          business_id: string;
          provider_reference_hash: string;
          amount_cents: string | number;
        }>(
          `SELECT payment.payment_intent_id AS business_id,
                  encode(digest(payment.provider_transaction_id,'sha256'),'hex') AS provider_reference_hash,
                  payment.amount_cents
             FROM payment_transactions payment
             JOIN payment_intents intent
               ON intent.tenant_id=payment.tenant_id AND intent.id=payment.payment_intent_id
            WHERE payment.tenant_id=$1 AND intent.provider=$2 AND payment.transaction_type='PAYMENT'
              AND payment.verified AND payment.provider_occurred_at>=$3::date
              AND payment.provider_occurred_at<$3::date+interval '1 day'`,
          [command.identity.tenantId, input.provider, input.businessDate],
        );
        const refunds = await client.query<{
          business_id: string;
          provider_reference_hash: string;
          amount_cents: string | number;
        }>(
          `SELECT refund.id AS business_id,
                  encode(digest(refund.provider_refund_id,'sha256'),'hex') AS provider_reference_hash,
                  refund.amount_cents
             FROM refunds refund
             JOIN payment_intents intent
               ON intent.tenant_id=refund.tenant_id AND intent.id=refund.payment_intent_id
            WHERE refund.tenant_id=$1 AND intent.provider=$2 AND refund.status='SUCCEEDED'
              AND refund.succeeded_at>=$3::date AND refund.succeeded_at<$3::date+interval '1 day'`,
          [command.identity.tenantId, input.provider, input.businessDate],
        );
        const orderProjection = await client.query<{
          paid_cents: string | number;
          refunded_cents: string | number;
        }>(
          `SELECT COALESCE(sum(orders.paid_amount_cents),0)::bigint AS paid_cents,
                  COALESCE(sum(orders.refunded_amount_cents),0)::bigint AS refunded_cents
             FROM orders WHERE tenant_id=$1 AND paid_at>=$2::date
              AND paid_at<$2::date+interval '1 day'`,
          [command.identity.tenantId, input.businessDate],
        );
        const internal = await client.query<{
          reward_net_cents: string | number;
          verification_count: string | number;
        }>(
          `SELECT
             COALESCE((SELECT sum(entry.amount_cents) FROM ledger_entries entry
               JOIN ledger_transactions tx ON tx.tenant_id=entry.tenant_id AND tx.id=entry.transaction_id
               JOIN reward_accounts account ON account.tenant_id=entry.tenant_id AND account.id=entry.account_id
              WHERE entry.tenant_id=$1 AND account.owner_type='CUSTOMER'
                AND tx.occurred_at>=$2::date AND tx.occurred_at<$2::date+interval '1 day'),0)::bigint
               AS reward_net_cents,
             COALESCE((SELECT count(*) FROM verification_uses use
              WHERE use.tenant_id=$1 AND use.used_at>=$2::date
                AND use.used_at<$2::date+interval '1 day'),0)::bigint AS verification_count`,
          [command.identity.tenantId, input.businessDate],
        );
        const providerByKey = new Map(
          bill.lines.map((line) => [`${line.type}:${line.providerReferenceHash}`, line]),
        );
        const matchedKeys = new Set<string>();
        const differences: Array<{ reason: string; amount: number; lineId?: string }> = [];
        const writeLine = async (
          type: 'PAYMENT' | 'REFUND',
          platform: {
            business_id: string;
            provider_reference_hash: string;
            amount_cents: string | number;
          },
        ) => {
          const key = `${type}:${platform.provider_reference_hash}`;
          const providerLine = providerByKey.get(key);
          if (providerLine) matchedKeys.add(key);
          const platformAmount = Number(platform.amount_cents);
          const providerAmount = providerLine?.amountCents ?? 0;
          const difference = providerAmount - platformAmount;
          const lineId = randomUUID();
          await client.query(
            `INSERT INTO commerce_reconciliation_lines(
               id,tenant_id,batch_id,line_type,business_id,provider_reference_hash,
               platform_amount_cents,provider_amount_cents,difference_cents,evidence_snapshot
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
            [
              lineId,
              command.identity.tenantId,
              batchId,
              type,
              platform.business_id,
              platform.provider_reference_hash,
              platformAmount,
              providerLine ? providerAmount : null,
              difference,
              JSON.stringify({ provider_bill_hash: bill.sha256 }),
            ],
          );
          if (difference !== 0)
            differences.push({ reason: `${type}_AMOUNT_MISMATCH`, amount: difference, lineId });
        };
        for (const payment of payments.rows) await writeLine('PAYMENT', payment);
        for (const refund of refunds.rows) await writeLine('REFUND', refund);
        for (const [key, providerLine] of providerByKey) {
          if (matchedKeys.has(key)) continue;
          differences.push({
            reason: `${providerLine.type}_MISSING_PLATFORM_RECORD`,
            amount: providerLine.amountCents,
          });
        }
        const paidCents = payments.rows.reduce(
          (sum, payment) => sum + Number(payment.amount_cents),
          0,
        );
        const refundedCents = refunds.rows.reduce(
          (sum, refund) => sum + Number(refund.amount_cents),
          0,
        );
        const providerPaid = bill.lines
          .filter((line) => line.type === 'PAYMENT')
          .reduce((sum, line) => sum + line.amountCents, 0);
        const providerRefunded = bill.lines
          .filter((line) => line.type === 'REFUND')
          .reduce((sum, line) => sum + line.amountCents, 0);
        if (Number(orderProjection.rows[0]?.paid_cents ?? 0) !== paidCents)
          differences.push({
            reason: 'ORDER_PAYMENT_PROJECTION_MISMATCH',
            amount: paidCents - Number(orderProjection.rows[0]?.paid_cents ?? 0),
          });
        if (Number(orderProjection.rows[0]?.refunded_cents ?? 0) !== refundedCents)
          differences.push({
            reason: 'ORDER_REFUND_PROJECTION_MISMATCH',
            amount: refundedCents - Number(orderProjection.rows[0]?.refunded_cents ?? 0),
          });
        const differenceCents = providerPaid - providerRefunded - (paidCents - refundedCents);
        const status =
          differences.length === 0 && differenceCents === 0 ? 'BALANCED' : 'DIFFERENCE_FOUND';
        await client.query(
          `UPDATE commerce_reconciliation_batches SET status=$3,order_paid_cents=$4,
                  provider_paid_cents=$5,order_refunded_cents=$6,provider_refunded_cents=$7,
                  reward_net_cents=$8,verification_count=$9,difference_cents=$10,
                  completed_at=now(),updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='CALCULATING'`,
          [
            command.identity.tenantId,
            batchId,
            status,
            paidCents,
            providerPaid,
            refundedCents,
            providerRefunded,
            Number(internal.rows[0]?.reward_net_cents ?? 0),
            Number(internal.rows[0]?.verification_count ?? 0),
            differenceCents,
          ],
        );
        for (const difference of differences) {
          if (difference.amount === 0) continue;
          await client.query(
            `INSERT INTO commerce_reconciliation_discrepancies(
               tenant_id,batch_id,line_id,reason_code,amount_cents,status
             ) VALUES ($1,$2,$3,$4,$5,'OPEN')`,
            [
              command.identity.tenantId,
              batchId,
              difference.lineId ?? null,
              difference.reason,
              difference.amount,
            ],
          );
        }
        return load(client, command.identity.tenantId, batchId);
      });
    },
  };
}
