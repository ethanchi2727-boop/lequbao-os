import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import type { IntakeObjectStore } from './intake-object-store.js';
import { IdempotencyConflictError } from './revenue-right-service.js';
import { createVerificationToken } from './verification-token.js';

const ProviderSchema = z.enum(['WECHAT_PAY', 'ALIPAY', 'SANDBOX']);
const CreatePaymentSchema = z.object({ orderId: UuidSchema, provider: ProviderSchema });
const CallbackEventSchema = z.object({
  tenantId: UuidSchema,
  provider: ProviderSchema,
  providerEventId: z.string().min(1).max(255),
  eventType: z.enum(['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'REFUND_SUCCEEDED', 'REFUND_FAILED']),
  merchantAccountHash: z.string().regex(/^[a-f0-9]{64}$/u),
  paymentIntentId: UuidSchema.optional(),
  refundId: UuidSchema.optional(),
  providerTransactionId: z.string().min(1).max(255).optional(),
  providerRefundId: z.string().min(1).max(255).optional(),
  amountCents: z.number().int().positive(),
  reasonCode: z.string().min(1).max(120).optional(),
  occurredAt: z.string().datetime({ offset: true }),
});
const PaymentIntentViewSchema = z.object({
  id: UuidSchema,
  orderId: UuidSchema,
  provider: ProviderSchema,
  providerPaymentId: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.enum(['PROCESSING', 'SUCCEEDED']),
  clientCredential: z.string().min(1),
  expiresAt: z.string().nullable(),
});

type PaymentIdentity = ConsumerSessionIdentity & {
  platformAccountId?: string;
};
type ConsumerCommand = {
  identity: PaymentIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export type CommercePaymentCallbackEvent = z.infer<typeof CallbackEventSchema>;
export type CommercePaymentIntentView = z.infer<typeof PaymentIntentViewSchema>;

export interface CommercePaymentProviderGateway {
  createPayment(input: {
    tenantId: string;
    paymentIntentId: string;
    provider: z.infer<typeof ProviderSchema>;
    credentialSecretRef: string;
    providerAccountHash: string;
    orderNo: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    traceId: string;
  }): Promise<{
    providerPaymentId: string;
    clientCredential: string;
    expiresAt: string | null;
    responseSummary: Record<string, unknown>;
  }>;
}

export interface CommercePaymentCallbackVerifier {
  verify(input: {
    provider: string;
    signature: string;
    rawBody: string;
  }): Promise<CommercePaymentCallbackEvent>;
}

export interface CommercePaymentService {
  createIntent(command: ConsumerCommand): Promise<CommercePaymentIntentView>;
  createPlatformIntent(command: {
    identity: LifeConsumerSessionIdentity;
    merchantTenantId: string;
    customerId: string;
    storeId: string;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<CommercePaymentIntentView>;
  receiveCallback(input: {
    provider: string;
    signature: string;
    rawBody: string;
    traceId: string;
  }): Promise<{ status: 'SUCCESS' | 'ALREADY_APPLIED' | 'RETRY_REQUIRED' }>;
}

export class CommercePaymentAuthenticationError extends Error {}
export class CommercePaymentAuthorizationError extends Error {}
export class CommercePaymentStateError extends Error {}
export class CommercePaymentSignatureError extends Error {}
export class CommercePaymentReplayConflictError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(',')}}`;
};

export function createCommercePaymentService(options: {
  pool: Pick<pg.Pool, 'connect'>;
  objectStore: Pick<IntakeObjectStore, 'putText' | 'getText'>;
  provider: CommercePaymentProviderGateway;
  callbackVerifier: CommercePaymentCallbackVerifier;
  verificationTokenSecret: string;
}): CommercePaymentService {
  if (Buffer.byteLength(options.verificationTokenSecret, 'utf8') < 32)
    throw new Error('VERIFICATION_TOKEN_SECRET must contain at least 32 bytes');

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

  async function validateConsumer(client: pg.PoolClient, identity: PaymentIdentity) {
    if (identity.platformAccountId) {
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.platformAccountId,
      ]);
      const result = await client.query(
        `SELECT 1
           FROM platform_consumer_sessions session
           JOIN platform_consumer_accounts account ON account.id=session.account_id
           JOIN platform_consumer_tenant_links link ON link.account_id=account.id
          WHERE session.session_id=$1 AND session.account_id=$2
            AND session.revoked_at IS NULL AND session.expires_at>now()
            AND account.status='ACTIVE' AND link.merchant_tenant_id=$3
            AND link.customer_id=$4 AND link.status='ACTIVE'`,
        [identity.sessionId, identity.platformAccountId, identity.tenantId, identity.customerId],
      );
      if (result.rowCount !== 1) throw new CommercePaymentAuthenticationError();
      return;
    }
    const result = await client.query(
      `SELECT 1 FROM consumer_sessions
        WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
          AND revoked_at IS NULL AND expires_at>now()`,
      [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
    );
    if (result.rowCount !== 1) throw new CommercePaymentAuthenticationError();
  }

  function verificationToken(input: {
    entitlementId: string;
    tenantId: string;
    orderId: string;
    generation: number;
    validUntil: string;
  }) {
    return createVerificationToken(options.verificationTokenSecret, input);
  }

  async function loadCredential(objectRef: string) {
    const content = await options.objectStore.getText({ objectKey: objectRef, maxBytes: 16_384 });
    return z
      .object({
        clientCredential: z.string().min(1),
        providerPaymentId: z.string().min(1),
        expiresAt: z.string().nullable(),
      })
      .parse(JSON.parse(content));
  }

  async function applyPaymentSucceeded(
    client: pg.PoolClient,
    event: CommercePaymentCallbackEvent,
    traceId: string,
  ) {
    if (!event.paymentIntentId || !event.providerTransactionId)
      throw new CommercePaymentStateError('payment success identifiers are incomplete');
    const selected = await client.query<{
      payment_intent_id: string;
      payment_status: string;
      provider: string;
      amount_cents: string | number;
      provider_account_hash: string;
      order_id: string;
      order_no: string;
      order_status: string;
      order_type: string;
      customer_id: string;
      store_id: string;
      currency: string;
      order_version: number;
    }>(
      `SELECT payment.id AS payment_intent_id,payment.status AS payment_status,payment.provider,
              payment.amount_cents,account.provider_account_hash,payment.order_id,orders.order_no,
              orders.status AS order_status,orders.order_type,orders.customer_id,orders.store_id,
              orders.currency,orders.version AS order_version
         FROM payment_intents payment
         JOIN orders ON orders.tenant_id=payment.tenant_id AND orders.id=payment.order_id
         JOIN merchant_payment_accounts account
           ON account.tenant_id=payment.tenant_id AND account.id=payment.merchant_payment_account_id
        WHERE payment.tenant_id=$1 AND payment.id=$2 FOR UPDATE OF payment,orders`,
      [event.tenantId, event.paymentIntentId],
    );
    const current = selected.rows[0];
    if (
      !current ||
      current.provider !== event.provider ||
      current.provider_account_hash !== event.merchantAccountHash ||
      Number(current.amount_cents) !== event.amountCents
    )
      throw new CommercePaymentAuthorizationError('payment callback scope mismatch');
    if (['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(current.payment_status)) return;
    if (
      !['CREATED', 'PROCESSING'].includes(current.payment_status) ||
      current.order_status !== 'PENDING_PAYMENT'
    )
      throw new CommercePaymentStateError('payment is not confirmable');
    await client.query(
      `INSERT INTO payment_transactions(
         tenant_id,payment_intent_id,provider_transaction_id,transaction_type,amount_cents,
         verified,provider_occurred_at,response_summary
       ) VALUES ($1,$2,$3,'PAYMENT',$4,true,$5,$6::jsonb)`,
      [
        event.tenantId,
        event.paymentIntentId,
        event.providerTransactionId,
        event.amountCents,
        event.occurredAt,
        JSON.stringify({ provider_event_id_hash: digest(event.providerEventId) }),
      ],
    );
    const quantities = await client.query<{
      variant_id: string;
      quantity: string | number;
      order_item_id: string;
    }>(
      `SELECT variant_id,quantity::bigint, id AS order_item_id FROM order_items
        WHERE tenant_id=$1 AND order_id=$2 ORDER BY variant_id`,
      [event.tenantId, current.order_id],
    );
    for (const item of quantities.rows)
      await client.query(
        `INSERT INTO inventory_ledger(
           tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
         ) VALUES ($1,$2,'CONSUME',$3,'PAYMENT',$4,$5)`,
        [
          event.tenantId,
          item.variant_id,
          Number(item.quantity),
          current.order_id,
          `payment-consume:${event.paymentIntentId}:${item.variant_id}`,
        ],
      );
    if (current.order_type === 'GROUP_BUY') {
      const validUntil = new Date(
        new Date(event.occurredAt).getTime() + 365 * 86_400_000,
      ).toISOString();
      for (const item of quantities.rows) {
        const entitlementId = randomUUID();
        const token = verificationToken({
          entitlementId,
          tenantId: event.tenantId,
          orderId: current.order_id,
          generation: 1,
          validUntil,
        });
        await client.query(
          `INSERT INTO verification_entitlements(
             id,tenant_id,order_item_id,order_id,verification_code_hash,total_uses,used_uses,
             status,valid_from,valid_until,allowed_store_ids,token_generation
           ) VALUES ($1,$2,$3,$4,$5,$6,0,'AVAILABLE',$7,$8,ARRAY[$9::uuid],1)`,
          [
            entitlementId,
            event.tenantId,
            item.order_item_id,
            current.order_id,
            digest(token),
            Number(item.quantity),
            event.occurredAt,
            validUntil,
            current.store_id,
          ],
        );
      }
    }
    await client.query(
      `UPDATE payment_intents SET status='SUCCEEDED',provider_payment_id=COALESCE(provider_payment_id,$3),
              succeeded_at=$4,version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status IN ('CREATED','PROCESSING')`,
      [event.tenantId, event.paymentIntentId, event.providerTransactionId, event.occurredAt],
    );
    await client.query(
      `UPDATE orders SET status='PAID',payment_status='PAID',paid_amount_cents=$3,paid_at=$4,
              verification_status=CASE WHEN order_type='GROUP_BUY' THEN 'AVAILABLE' ELSE verification_status END,
              version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status='PENDING_PAYMENT'`,
      [event.tenantId, current.order_id, event.amountCents, event.occurredAt],
    );
    await client.query(
      `INSERT INTO order_state_history(
         tenant_id,order_id,order_status,payment_status,fulfillment_status,verification_status,
         aftercare_status,reason_code,actor_type,actor_id_hash,trace_id
       ) SELECT tenant_id,id,status,payment_status,fulfillment_status,verification_status,
                aftercare_status,'PAYMENT_CONFIRMED','PROVIDER',$3,$4
           FROM orders WHERE tenant_id=$1 AND id=$2`,
      [event.tenantId, current.order_id, digest(event.providerTransactionId), traceId],
    );
    await grantReward(client, {
      tenantId: event.tenantId,
      orderId: current.order_id,
      customerId: current.customer_id,
      paidAmountCents: event.amountCents,
      occurredAt: event.occurredAt,
      traceId,
    });
    await client.query(
      `INSERT INTO outbox_events(
         tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
         payload,pii_classification,trace_id,occurred_at
       ) SELECT $1,'payment.succeeded.v1','payment_intent',$2,version,'order:'||order_id,
                $3::jsonb,'INTERNAL',$4,now()
           FROM payment_intents WHERE tenant_id=$1 AND id=$2`,
      [
        event.tenantId,
        event.paymentIntentId,
        JSON.stringify({
          payment_intent_id: event.paymentIntentId,
          order_id: current.order_id,
          provider_transaction_id_hash: digest(event.providerTransactionId),
          amount_cents: event.amountCents,
          paid_at: event.occurredAt,
        }),
        traceId,
      ],
    );
  }

  async function grantReward(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      orderId: string;
      customerId: string;
      paidAmountCents: number;
      occurredAt: string;
      traceId: string;
    },
  ) {
    const rule = await client.query<{
      reward_amount_cents: string | number;
      rule_version: string | null;
      funding_source: string | null;
    }>(
      `SELECT COALESCE(sum(
                LEAST((item.reward_rule_snapshot->>'amount_cents')::bigint * item.quantity,$3)
              ),0)::bigint AS reward_amount_cents,
              max(item.reward_rule_snapshot->>'version') AS rule_version,
              max(item.reward_rule_snapshot->>'funding_source') AS funding_source
         FROM order_items item
        WHERE item.tenant_id=$1 AND item.order_id=$2
          AND item.reward_rule_snapshot ? 'amount_cents'`,
      [input.tenantId, input.orderId, input.paidAmountCents],
    );
    const amount = Number(rule.rows[0]?.reward_amount_cents ?? 0);
    if (amount <= 0) return;
    await client.query(
      `INSERT INTO reward_accounts(tenant_id,owner_type,owner_id,currency,status)
       VALUES ($1,'CUSTOMER',$2,'CNY','ACTIVE'),($1,'MERCHANT_FUND',NULL,'CNY','ACTIVE')
       ON CONFLICT DO NOTHING`,
      [input.tenantId, input.customerId],
    );
    const accounts = await client.query<{ id: string; owner_type: string }>(
      `SELECT id,owner_type FROM reward_accounts
        WHERE tenant_id=$1 AND currency='CNY' AND
              ((owner_type='CUSTOMER' AND owner_id=$2) OR (owner_type='MERCHANT_FUND' AND owner_id IS NULL))`,
      [input.tenantId, input.customerId],
    );
    const customerAccount = accounts.rows.find((account) => account.owner_type === 'CUSTOMER');
    const merchantAccount = accounts.rows.find((account) => account.owner_type === 'MERCHANT_FUND');
    if (!customerAccount || !merchantAccount)
      throw new CommercePaymentStateError('reward accounts are unavailable');
    const transactionId = randomUUID();
    const grantId = randomUUID();
    const version = rule.rows[0]?.rule_version ?? 'reward-default-v1';
    const funding = rule.rows[0]?.funding_source ?? 'MERCHANT';
    await client.query(
      `INSERT INTO ledger_transactions(
         id,tenant_id,transaction_type,business_type,business_id,rule_snapshot,occurred_at
       ) VALUES ($1,$2,'REWARD_GRANT','ORDER',$3,$4::jsonb,$5)`,
      [
        transactionId,
        input.tenantId,
        input.orderId,
        JSON.stringify({ version, funding }),
        input.occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO ledger_entries(tenant_id,transaction_id,account_id,amount_cents)
       VALUES ($1,$2,$3,$5),($1,$2,$4,-$5)`,
      [input.tenantId, transactionId, customerAccount.id, merchantAccount.id, amount],
    );
    await client.query(
      `INSERT INTO reward_grants(
         id,tenant_id,customer_id,account_id,order_id,grant_transaction_id,rule_version,
         funding_source,granted_amount_cents,status,available_at,expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'AVAILABLE',$10,$10::timestamptz+interval '365 days')`,
      [
        grantId,
        input.tenantId,
        input.customerId,
        customerAccount.id,
        input.orderId,
        transactionId,
        version,
        funding,
        amount,
        input.occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO outbox_events(
         tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
         payload,pii_classification,trace_id,occurred_at
       ) VALUES ($1,'reward.granted.v1','ledger_transaction',$2,1,'customer:'||($3::uuid)::text,
                 $4::jsonb,'PERSONAL',$5,now())`,
      [
        input.tenantId,
        transactionId,
        digest(input.customerId),
        JSON.stringify({
          ledger_transaction_id: transactionId,
          order_id: input.orderId,
          rule_version: version,
          amount_cents: amount,
          available_at: input.occurredAt,
        }),
        input.traceId,
      ],
    );
  }

  async function releaseFailedPayment(
    client: pg.PoolClient,
    event: CommercePaymentCallbackEvent,
    traceId: string,
  ) {
    if (!event.paymentIntentId) throw new CommercePaymentStateError('payment id is missing');
    const selected = await client.query<{
      order_id: string;
      status: string;
      provider: string;
      provider_account_hash: string;
      inventory_released_at: Date | string | null;
    }>(
      `SELECT payment.order_id,payment.status,payment.provider,account.provider_account_hash,
              orders.inventory_released_at
         FROM payment_intents payment
         JOIN merchant_payment_accounts account
           ON account.tenant_id=payment.tenant_id AND account.id=payment.merchant_payment_account_id
         JOIN orders ON orders.tenant_id=payment.tenant_id AND orders.id=payment.order_id
        WHERE payment.tenant_id=$1 AND payment.id=$2 FOR UPDATE OF payment,orders`,
      [event.tenantId, event.paymentIntentId],
    );
    const current = selected.rows[0];
    if (
      !current ||
      current.provider !== event.provider ||
      current.provider_account_hash !== event.merchantAccountHash
    )
      throw new CommercePaymentAuthorizationError();
    if (['FAILED', 'EXPIRED'].includes(current.status)) return;
    if (!['CREATED', 'PROCESSING'].includes(current.status))
      throw new CommercePaymentStateError('successful payment cannot be downgraded');
    if (!current.inventory_released_at) {
      const items = await client.query<{ variant_id: string; quantity: string | number }>(
        `SELECT variant_id,sum(quantity)::bigint AS quantity FROM order_items
          WHERE tenant_id=$1 AND order_id=$2 GROUP BY variant_id ORDER BY variant_id`,
        [event.tenantId, current.order_id],
      );
      for (const item of items.rows)
        await client.query(
          `INSERT INTO inventory_ledger(
             tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
           ) VALUES ($1,$2,'RELEASE',$3,'PAYMENT_FAILED',$4,$5)`,
          [
            event.tenantId,
            item.variant_id,
            Number(item.quantity),
            current.order_id,
            `payment-failed:${event.paymentIntentId}:${item.variant_id}`,
          ],
        );
    }
    await client.query(
      `UPDATE payment_intents SET status='FAILED',failure_code=$3,version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status IN ('CREATED','PROCESSING')`,
      [event.tenantId, event.paymentIntentId, event.reasonCode ?? 'PROVIDER_FAILED'],
    );
    await client.query(
      `UPDATE orders SET status='CANCELLED',payment_status='FAILED',cancelled_at=now(),
              inventory_released_at=COALESCE(inventory_released_at,now()),version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status='PENDING_PAYMENT'`,
      [event.tenantId, current.order_id],
    );
    await client.query(
      `INSERT INTO outbox_events(
         tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
         payload,pii_classification,trace_id,occurred_at
       ) SELECT $1,'payment.failed.v1','payment_intent',$2,version,'order:'||order_id,
                $3::jsonb,'INTERNAL',$4,now()
           FROM payment_intents WHERE tenant_id=$1 AND id=$2`,
      [
        event.tenantId,
        event.paymentIntentId,
        JSON.stringify({
          payment_intent_id: event.paymentIntentId,
          order_id: current.order_id,
          reason_code: event.reasonCode ?? 'PROVIDER_FAILED',
          failed_at: event.occurredAt,
        }),
        traceId,
      ],
    );
  }

  async function reverseReward(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      orderId: string;
      refundId: string;
      refundAmountCents: number;
      paidAmountCents: number;
      occurredAt: string;
      traceId: string;
    },
  ) {
    const grants = await client.query<{
      id: string;
      grant_transaction_id: string;
      account_id: string;
      granted_amount_cents: string | number;
      reversed_amount_cents: string | number;
      customer_id: string;
    }>(
      `SELECT id,grant_transaction_id,account_id,granted_amount_cents,reversed_amount_cents,customer_id
         FROM reward_grants WHERE tenant_id=$1 AND order_id=$2 FOR UPDATE`,
      [input.tenantId, input.orderId],
    );
    for (const grant of grants.rows) {
      const remaining = Number(grant.granted_amount_cents) - Number(grant.reversed_amount_cents);
      const proportional = Math.floor(
        (Number(grant.granted_amount_cents) * input.refundAmountCents) / input.paidAmountCents,
      );
      const amount = Math.min(remaining, proportional);
      if (amount <= 0) continue;
      const originalEntries = await client.query<{
        account_id: string;
        amount_cents: string | number;
      }>(
        `SELECT account_id,amount_cents FROM ledger_entries
          WHERE tenant_id=$1 AND transaction_id=$2 ORDER BY id`,
        [input.tenantId, grant.grant_transaction_id],
      );
      const reversalId = randomUUID();
      await client.query(
        `INSERT INTO ledger_transactions(
           id,tenant_id,transaction_type,business_type,business_id,original_transaction_id,
           reason_code,rule_snapshot,occurred_at
         ) VALUES ($1,$2,'REWARD_REVERSE','REFUND',$3,$4,'REFUND_SUCCEEDED',$5::jsonb,$6)`,
        [
          reversalId,
          input.tenantId,
          input.refundId,
          grant.grant_transaction_id,
          JSON.stringify({ proportional_to_paid_cents: input.paidAmountCents }),
          input.occurredAt,
        ],
      );
      const positive = originalEntries.rows.find((entry) => Number(entry.amount_cents) > 0);
      const negative = originalEntries.rows.find((entry) => Number(entry.amount_cents) < 0);
      if (!positive || !negative)
        throw new CommercePaymentStateError('original reward ledger is invalid');
      await client.query(
        `INSERT INTO ledger_entries(tenant_id,transaction_id,account_id,amount_cents)
         VALUES ($1,$2,$3,-$5),($1,$2,$4,$5)`,
        [input.tenantId, reversalId, positive.account_id, negative.account_id, amount],
      );
      await client.query(
        `UPDATE reward_grants SET reversed_amount_cents=reversed_amount_cents+$3,
                status=CASE WHEN reversed_amount_cents+$3=granted_amount_cents THEN 'REVERSED' ELSE status END,
                version=version+1,updated_at=now()
          WHERE tenant_id=$1 AND id=$2`,
        [input.tenantId, grant.id, amount],
      );
      await client.query(
        `INSERT INTO outbox_events(
           tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
           payload,pii_classification,trace_id,occurred_at
         ) VALUES ($1,'reward.reversed.v1','ledger_transaction',$2,1,'customer:'||($3::uuid)::text,
                   $4::jsonb,'PERSONAL',$5,now())`,
        [
          input.tenantId,
          reversalId,
          digest(grant.customer_id),
          JSON.stringify({
            ledger_transaction_id: reversalId,
            original_transaction_id: grant.grant_transaction_id,
            order_id: input.orderId,
            amount_cents: amount,
            reason_code: 'REFUND_SUCCEEDED',
          }),
          input.traceId,
        ],
      );
    }
  }

  async function applyRefundEvent(
    client: pg.PoolClient,
    event: CommercePaymentCallbackEvent,
    traceId: string,
  ) {
    if (!event.refundId) throw new CommercePaymentStateError('refund id is missing');
    const selected = await client.query<{
      refund_status: string;
      amount_cents: string | number;
      order_id: string;
      payment_intent_id: string;
      paid_amount_cents: string | number;
      refunded_amount_cents: string | number;
      provider: string;
      provider_account_hash: string;
    }>(
      `SELECT refund.status AS refund_status,refund.amount_cents,refund.order_id,
              refund.payment_intent_id,orders.paid_amount_cents,orders.refunded_amount_cents,
              payment.provider,account.provider_account_hash
         FROM refunds refund
         JOIN orders ON orders.tenant_id=refund.tenant_id AND orders.id=refund.order_id
         JOIN payment_intents payment
           ON payment.tenant_id=refund.tenant_id AND payment.id=refund.payment_intent_id
         JOIN merchant_payment_accounts account
           ON account.tenant_id=payment.tenant_id AND account.id=payment.merchant_payment_account_id
        WHERE refund.tenant_id=$1 AND refund.id=$2 FOR UPDATE OF refund,orders,payment`,
      [event.tenantId, event.refundId],
    );
    const current = selected.rows[0];
    if (
      !current ||
      current.provider !== event.provider ||
      current.provider_account_hash !== event.merchantAccountHash ||
      Number(current.amount_cents) !== event.amountCents
    )
      throw new CommercePaymentAuthorizationError('refund callback scope mismatch');
    if (event.eventType === 'REFUND_FAILED') {
      if (current.refund_status === 'FAILED') return;
      if (!['SUBMITTING', 'PROCESSING'].includes(current.refund_status))
        throw new CommercePaymentStateError('refund cannot fail from current state');
      await client.query(
        `UPDATE refunds SET status='FAILED',failure_code=$3,version=version+1
          WHERE tenant_id=$1 AND id=$2 AND status IN ('SUBMITTING','PROCESSING')`,
        [event.tenantId, event.refundId, event.reasonCode ?? 'PROVIDER_FAILED'],
      );
      return;
    }
    if (!event.providerRefundId)
      throw new CommercePaymentStateError('provider refund id is missing');
    if (current.refund_status === 'SUCCEEDED') return;
    if (!['SUBMITTING', 'PROCESSING'].includes(current.refund_status))
      throw new CommercePaymentStateError('refund is not confirmable');
    const nextRefunded = Number(current.refunded_amount_cents) + event.amountCents;
    const paid = Number(current.paid_amount_cents);
    if (nextRefunded > paid) throw new CommercePaymentStateError('refund exceeds paid amount');
    await client.query(
      `UPDATE refunds SET status='SUCCEEDED',provider_refund_id=$3,succeeded_at=$4,
              failure_code=NULL,version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status IN ('SUBMITTING','PROCESSING')`,
      [event.tenantId, event.refundId, event.providerRefundId, event.occurredAt],
    );
    await client.query(
      `UPDATE order_items item SET refunded_quantity=refunded_quantity+refund_item.quantity
         FROM refund_items refund_item
        WHERE refund_item.tenant_id=$1 AND refund_item.refund_id=$2
          AND item.tenant_id=refund_item.tenant_id AND item.id=refund_item.order_item_id`,
      [event.tenantId, event.refundId],
    );
    await client.query(
      `UPDATE verification_entitlements entitlement
          SET status='VOIDED',void_reason='REFUNDED',version=version+1,updated_at=now()
         FROM refund_items refund_item
        WHERE refund_item.tenant_id=$1 AND refund_item.refund_id=$2
          AND entitlement.tenant_id=refund_item.tenant_id
          AND entitlement.order_item_id=refund_item.order_item_id
          AND entitlement.status IN ('AVAILABLE','PARTIALLY_USED')
          AND entitlement.total_uses-entitlement.used_uses<=refund_item.quantity`,
      [event.tenantId, event.refundId],
    );
    const paymentStatus = nextRefunded === paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await client.query(
      `UPDATE orders SET refunded_amount_cents=$3,payment_status=$4,
              verification_status=CASE
                WHEN NOT EXISTS (
                  SELECT 1 FROM verification_entitlements entitlement
                   WHERE entitlement.tenant_id=orders.tenant_id AND entitlement.order_id=orders.id
                     AND entitlement.status IN ('AVAILABLE','PARTIALLY_USED')
                ) THEN 'VOIDED' ELSE verification_status END,
              version=version+1
        WHERE tenant_id=$1 AND id=$2`,
      [event.tenantId, current.order_id, nextRefunded, paymentStatus],
    );
    await client.query(
      `UPDATE payment_intents SET status=$3,version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status IN ('SUCCEEDED','PARTIALLY_REFUNDED')`,
      [event.tenantId, current.payment_intent_id, paymentStatus],
    );
    await reverseReward(client, {
      tenantId: event.tenantId,
      orderId: current.order_id,
      refundId: event.refundId,
      refundAmountCents: event.amountCents,
      paidAmountCents: paid,
      occurredAt: event.occurredAt,
      traceId,
    });
    await client.query(
      `INSERT INTO outbox_events(
         tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
         payload,pii_classification,trace_id,occurred_at
       ) SELECT $1,'refund.succeeded.v1','refund',$2,version,'order:'||order_id,
                $3::jsonb,'INTERNAL',$4,now()
           FROM refunds WHERE tenant_id=$1 AND id=$2`,
      [
        event.tenantId,
        event.refundId,
        JSON.stringify({
          refund_id: event.refundId,
          order_id: current.order_id,
          amount_cents: event.amountCents,
          provider_refund_id_hash: digest(event.providerRefundId),
          succeeded_at: event.occurredAt,
        }),
        traceId,
      ],
    );
  }

  const service: CommercePaymentService = {
    async createIntent(command) {
      const input = CreatePaymentSchema.parse(command.body);
      const requestHash = digest(canonical(input));
      const descriptor = await transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const inserted = await client.query(
          `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
           VALUES ($1,'commerce.payment.create',$2,$3,now()+interval '24 hours')
           ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
          [command.identity.tenantId, command.idempotencyKey, requestHash],
        );
        if (inserted.rowCount === 0) {
          const replay = await client.query<{ request_hash: string; response_body: unknown }>(
            `SELECT request_hash,response_body FROM idempotency_keys
              WHERE tenant_id=$1 AND scope='commerce.payment.create' AND idempotency_key=$2 FOR UPDATE`,
            [command.identity.tenantId, command.idempotencyKey],
          );
          const prior = replay.rows[0];
          if (!prior || prior.request_hash !== requestHash) throw new IdempotencyConflictError();
          if (prior.response_body === null) {
            const pending = await client.query<{
              payment_intent_id: string;
              order_id: string;
              order_no: string;
              provider: z.infer<typeof ProviderSchema>;
              amount_cents: string | number;
              currency: string;
              credential_secret_ref: string;
              provider_account_hash: string;
            }>(
              `UPDATE payment_intents intent SET last_query_at=now()
                 FROM orders orders,merchant_payment_accounts account
                WHERE intent.tenant_id=$1 AND intent.idempotency_key=$2 AND intent.status='CREATED'
                  AND (intent.last_query_at IS NULL OR intent.last_query_at<now()-interval '30 seconds')
                  AND orders.tenant_id=intent.tenant_id AND orders.id=intent.order_id
                  AND account.tenant_id=intent.tenant_id AND account.id=intent.merchant_payment_account_id
                RETURNING intent.id AS payment_intent_id,intent.order_id,orders.order_no,
                          intent.provider,intent.amount_cents,intent.currency,
                          account.credential_secret_ref,account.provider_account_hash`,
              [command.identity.tenantId, command.idempotencyKey],
            );
            const retry = pending.rows[0];
            if (!retry) throw new CommercePaymentStateError('payment credential creation pending');
            return {
              kind: 'NEW' as const,
              paymentIntentId: retry.payment_intent_id,
              orderId: retry.order_id,
              orderNo: retry.order_no,
              provider: retry.provider,
              amountCents: Number(retry.amount_cents),
              currency: retry.currency,
              status: 'CREATED',
              credentialSecretRef: retry.credential_secret_ref,
              providerAccountHash: retry.provider_account_hash,
              credentialObjectRef: '',
            };
          }
          const stored = z
            .object({
              paymentIntentId: UuidSchema,
              orderId: UuidSchema,
              provider: ProviderSchema,
              amountCents: z.number().int().positive(),
              currency: z.string(),
              status: z.string(),
              credentialObjectRef: z.string(),
            })
            .parse(prior.response_body);
          return { kind: 'REPLAY' as const, ...stored };
        }
        const order = await client.query<{
          id: string;
          order_no: string;
          customer_id: string;
          store_id: string;
          status: string;
          payable_amount_cents: string | number;
          currency: string;
          expires_at: Date | string | null;
        }>(
          `SELECT id,order_no,customer_id,store_id,status,payable_amount_cents,currency,expires_at
             FROM orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [command.identity.tenantId, input.orderId],
        );
        const current = order.rows[0];
        if (
          !current ||
          current.customer_id !== command.identity.customerId ||
          current.store_id !== command.identity.storeId
        )
          throw new CommercePaymentAuthorizationError();
        if (
          current.status !== 'PENDING_PAYMENT' ||
          (current.expires_at && new Date(current.expires_at).getTime() <= Date.now())
        )
          throw new CommercePaymentStateError('order is not payable');
        const account = await client.query<{
          id: string;
          provider_account_hash: string;
          credential_secret_ref: string;
          settlement_subject_ref: string;
        }>(
          `SELECT id,provider_account_hash,credential_secret_ref,settlement_subject_ref
             FROM merchant_payment_accounts
            WHERE tenant_id=$1 AND provider=$2 AND status='ACTIVE' AND confirmed_at IS NOT NULL
            ORDER BY confirmed_at DESC,id LIMIT 1`,
          [command.identity.tenantId, input.provider],
        );
        const merchantAccount = account.rows[0];
        if (!merchantAccount)
          throw new CommercePaymentStateError('merchant payment account is not confirmed');
        const paymentIntentId = randomUUID();
        await client.query(
          `INSERT INTO payment_intents(
             id,tenant_id,order_id,provider,merchant_payment_account_ref,
             merchant_payment_account_id,amount_cents,currency,status,idempotency_key,
             client_request_hash,expires_at,last_query_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CREATED',$9,$10,$11,now())`,
          [
            paymentIntentId,
            command.identity.tenantId,
            current.id,
            input.provider,
            merchantAccount.settlement_subject_ref,
            merchantAccount.id,
            Number(current.payable_amount_cents),
            current.currency,
            command.idempotencyKey,
            requestHash,
            current.expires_at,
          ],
        );
        return {
          kind: 'NEW' as const,
          paymentIntentId,
          orderId: current.id,
          orderNo: current.order_no,
          provider: input.provider,
          amountCents: Number(current.payable_amount_cents),
          currency: current.currency,
          status: 'CREATED',
          credentialSecretRef: merchantAccount.credential_secret_ref,
          providerAccountHash: merchantAccount.provider_account_hash,
          credentialObjectRef: '',
        };
      });
      if (descriptor.kind === 'REPLAY') {
        const credential = await loadCredential(descriptor.credentialObjectRef);
        return PaymentIntentViewSchema.parse({
          id: descriptor.paymentIntentId,
          orderId: descriptor.orderId,
          provider: descriptor.provider,
          providerPaymentId: credential.providerPaymentId,
          amountCents: descriptor.amountCents,
          currency: descriptor.currency,
          status: descriptor.status,
          clientCredential: credential.clientCredential,
          expiresAt: credential.expiresAt,
        });
      }
      const created = await options.provider.createPayment({
        tenantId: command.identity.tenantId,
        paymentIntentId: descriptor.paymentIntentId,
        provider: descriptor.provider,
        credentialSecretRef: descriptor.credentialSecretRef,
        providerAccountHash: descriptor.providerAccountHash,
        orderNo: descriptor.orderNo,
        amountCents: descriptor.amountCents,
        currency: descriptor.currency,
        idempotencyKey: command.idempotencyKey,
        traceId: command.traceId,
      });
      const credentialContent = JSON.stringify({
        clientCredential: created.clientCredential,
        providerPaymentId: created.providerPaymentId,
        expiresAt: created.expiresAt,
      });
      const credentialObjectRef = `${command.identity.tenantId}/payments/${descriptor.paymentIntentId}/credential.json`;
      await options.objectStore.putText({
        objectKey: credentialObjectRef,
        content: credentialContent,
        sha256: digest(credentialContent),
      });
      await transaction(command.identity.tenantId, async (client) => {
        const updated = await client.query(
          `UPDATE payment_intents SET status='PROCESSING',provider_payment_id=$3,
                  provider_request_object_ref=$4,version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='CREATED'`,
          [
            command.identity.tenantId,
            descriptor.paymentIntentId,
            created.providerPaymentId,
            credentialObjectRef,
          ],
        );
        if (updated.rowCount !== 1) throw new CommercePaymentStateError('payment intent changed');
        await client.query(
          `UPDATE orders SET payment_status='PROCESSING',version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='PENDING_PAYMENT'`,
          [command.identity.tenantId, descriptor.orderId],
        );
        await client.query(
          `UPDATE idempotency_keys SET response_status=201,response_body=$3::jsonb,
                  resource_type='payment_intent',resource_id=$4
            WHERE tenant_id=$1 AND scope='commerce.payment.create' AND idempotency_key=$2`,
          [
            command.identity.tenantId,
            command.idempotencyKey,
            JSON.stringify({
              paymentIntentId: descriptor.paymentIntentId,
              orderId: descriptor.orderId,
              provider: descriptor.provider,
              amountCents: descriptor.amountCents,
              currency: descriptor.currency,
              status: 'PROCESSING',
              credentialObjectRef,
            }),
            descriptor.paymentIntentId,
          ],
        );
      });
      return PaymentIntentViewSchema.parse({
        id: descriptor.paymentIntentId,
        orderId: descriptor.orderId,
        provider: descriptor.provider,
        providerPaymentId: created.providerPaymentId,
        amountCents: descriptor.amountCents,
        currency: descriptor.currency,
        status: 'PROCESSING',
        clientCredential: created.clientCredential,
        expiresAt: created.expiresAt,
      });
    },

    async createPlatformIntent(command) {
      return service.createIntent({
        identity: {
          tenantId: command.merchantTenantId,
          customerId: command.customerId,
          storeId: command.storeId,
          sessionId: command.identity.sessionId,
          authLevel: command.identity.authLevel,
          platformAccountId: command.identity.accountId,
        },
        idempotencyKey: command.idempotencyKey,
        traceId: command.traceId,
        body: command.body,
      });
    },

    async receiveCallback(input) {
      let event: CommercePaymentCallbackEvent;
      try {
        event = CallbackEventSchema.parse(
          await options.callbackVerifier.verify({
            provider: input.provider,
            signature: input.signature,
            rawBody: input.rawBody,
          }),
        );
      } catch (error) {
        throw new CommercePaymentSignatureError('payment callback verification failed', {
          cause: error,
        });
      }
      if (event.provider !== input.provider)
        throw new CommercePaymentSignatureError('payment callback provider mismatch');
      if (event.eventType.startsWith('PAYMENT_') !== Boolean(event.paymentIntentId))
        throw new CommercePaymentSignatureError('payment callback subject mismatch');
      if (event.eventType.startsWith('REFUND_') !== Boolean(event.refundId))
        throw new CommercePaymentSignatureError('refund callback subject mismatch');
      const payloadHash = digest(input.rawBody);
      const eventHash = digest(canonical(event));
      const objectKey = `${event.tenantId}/payment-callbacks/${input.provider}/${digest(event.providerEventId)}.json`;
      await options.objectStore.putText({
        objectKey,
        content: input.rawBody,
        sha256: payloadHash,
      });
      return transaction(event.tenantId, async (client) => {
        const account = await client.query(
          `SELECT 1 FROM merchant_payment_accounts
            WHERE tenant_id=$1 AND provider=$2 AND provider_account_hash=$3 AND status='ACTIVE'`,
          [event.tenantId, event.provider, event.merchantAccountHash],
        );
        if (account.rowCount !== 1) throw new CommercePaymentAuthorizationError();
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO payment_callback_receipts(
             tenant_id,provider,provider_event_id,provider_event_hash,payload_object_ref,payload_hash,
             signature_verified,event_type,payment_intent_id,refund_id,processing_status,
             provider_occurred_at
           ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,'RECEIVED',$10)
           ON CONFLICT (provider,provider_event_id) DO NOTHING RETURNING id`,
          [
            event.tenantId,
            event.provider,
            event.providerEventId,
            eventHash,
            objectKey,
            payloadHash,
            event.eventType,
            event.paymentIntentId ?? null,
            event.refundId ?? null,
            event.occurredAt,
          ],
        );
        let receiptId = inserted.rows[0]?.id;
        if (!receiptId) {
          const prior = await client.query<{
            id: string;
            tenant_id: string;
            provider_event_hash: string;
            payload_hash: string;
            processing_status: string;
          }>(
            `SELECT id,tenant_id,provider_event_hash,payload_hash,processing_status
               FROM payment_callback_receipts
              WHERE provider=$1 AND provider_event_id=$2 FOR UPDATE`,
            [event.provider, event.providerEventId],
          );
          const current = prior.rows[0];
          if (
            !current ||
            current.tenant_id !== event.tenantId ||
            current.provider_event_hash !== eventHash ||
            current.payload_hash !== payloadHash
          )
            throw new CommercePaymentReplayConflictError();
          if (current.processing_status === 'APPLIED')
            return { status: 'ALREADY_APPLIED' as const };
          receiptId = current.id;
        }
        try {
          if (event.eventType === 'PAYMENT_SUCCEEDED')
            await applyPaymentSucceeded(client, event, input.traceId);
          else if (event.eventType === 'PAYMENT_FAILED')
            await releaseFailedPayment(client, event, input.traceId);
          else await applyRefundEvent(client, event, input.traceId);
          await client.query(
            `UPDATE payment_callback_receipts
                SET processing_status='APPLIED',error_code=NULL,applied_at=now()
              WHERE tenant_id=$1 AND id=$2 AND processing_status IN ('RECEIVED','FAILED_RETRYABLE')`,
            [event.tenantId, receiptId],
          );
          return { status: 'SUCCESS' as const };
        } catch (error) {
          if (
            error instanceof CommercePaymentAuthorizationError ||
            error instanceof CommercePaymentStateError
          )
            throw error;
          throw new CommercePaymentStateError('callback transaction must be retried', {
            cause: error,
          });
        }
      });
    },
  };
  return service;
}
