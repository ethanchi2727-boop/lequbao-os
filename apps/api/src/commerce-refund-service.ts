import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import type { IntakeObjectStore } from './intake-object-store.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const RequestRefundSchema = z.object({
  orderId: UuidSchema,
  requestType: z.enum([
    'UNSHIPPED_REFUND',
    'RETURN_REFUND',
    'UNUSED_GROUP_BUY_REFUND',
    'SERVICE_DISPUTE',
    'OTHER',
  ]),
  reasonCode: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  items: z
    .array(z.object({ orderItemId: UuidSchema, quantity: z.number().int().positive() }))
    .min(1)
    .max(50),
});
const ApproveRefundSchema = z.object({
  refundId: UuidSchema,
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(1).max(500),
});
const RefundViewSchema = z.object({
  id: UuidSchema,
  refundNo: z.string(),
  orderId: UuidSchema,
  amountCents: z.number().int().positive(),
  reasonCode: z.string(),
  status: z.string(),
  approvalRequired: z.boolean(),
  items: z.array(
    z.object({
      orderItemId: UuidSchema,
      quantity: z.number().int().positive(),
      amountCents: z.number().int().nonnegative(),
    }),
  ),
  version: z.number().int().positive(),
});

type StaffIdentity = SessionIdentity & {
  accessScopes?: string[];
  assignedStoreIds?: string[];
};
type RefundIdentity = ConsumerSessionIdentity & { platformAccountId?: string };
type ConsumerCommand = {
  identity: RefundIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};
type StaffCommand = {
  identity: StaffIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export type CommerceRefundView = z.infer<typeof RefundViewSchema>;

export interface CommerceRefundProviderGateway {
  submitRefund(input: {
    tenantId: string;
    refundId: string;
    paymentIntentId: string;
    provider: string;
    credentialSecretRef: string;
    providerPaymentId: string;
    amountCents: number;
    idempotencyKey: string;
    traceId: string;
  }): Promise<{
    providerRefundId: string;
    providerRequestId: string;
    status: 'PROCESSING' | 'SUCCEEDED';
  }>;
}

export interface CommerceRefundService {
  request(command: ConsumerCommand): Promise<CommerceRefundView>;
  listForConsumer(
    identity: ConsumerSessionIdentity,
    orderId: string,
  ): Promise<CommerceRefundView[]>;
  requestPlatform(command: {
    identity: LifeConsumerSessionIdentity;
    tenantId: string;
    customerId: string;
    storeId: string;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<CommerceRefundView>;
  approve(command: StaffCommand): Promise<CommerceRefundView>;
  submit(input: {
    tenantId: string;
    refundId: string;
    traceId: string;
  }): Promise<CommerceRefundView>;
}

export class CommerceRefundAuthenticationError extends Error {}
export class CommerceRefundAuthorizationError extends Error {}
export class CommerceRefundStateError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(',')}}`;
};

export function createCommerceRefundService(options: {
  pool: Pick<pg.Pool, 'connect'>;
  objectStore: Pick<IntakeObjectStore, 'putText'>;
  provider: CommerceRefundProviderGateway;
  approvalThresholdCents?: number;
}): CommerceRefundService {
  const threshold = options.approvalThresholdCents ?? 50_000;
  if (!Number.isSafeInteger(threshold) || threshold < 1)
    throw new Error('refund approval threshold is invalid');

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

  async function validateConsumer(client: pg.PoolClient, identity: RefundIdentity) {
    if (identity.platformAccountId) {
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.platformAccountId,
      ]);
      const platform = await client.query(
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
      if (platform.rowCount !== 1) throw new CommerceRefundAuthenticationError();
      return;
    }
    const result = await client.query(
      `SELECT 1 FROM consumer_sessions
        WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
          AND revoked_at IS NULL AND expires_at>now()`,
      [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
    );
    if (result.rowCount !== 1) throw new CommerceRefundAuthenticationError();
  }

  function assertStaffStore(identity: StaffIdentity, storeId: string) {
    const scopes = identity.accessScopes ?? [];
    if (scopes.some((scope) => ['TENANT', 'ALL'].includes(scope))) return;
    if (
      scopes.includes('STORE') &&
      (identity.assignedStoreIds ?? identity.storeIds).includes(storeId)
    )
      return;
    throw new CommerceRefundAuthorizationError();
  }

  async function loadRefund(client: pg.PoolClient, tenantId: string, refundId: string) {
    const header = await client.query<{
      id: string;
      refund_no: string;
      order_id: string;
      amount_cents: string | number;
      reason_code: string;
      status: string;
      approval_required: boolean;
      version: number;
    }>(
      `SELECT refund.id,refund.refund_no,refund.order_id,refund.amount_cents,refund.reason_code,
              refund.status,(refund.approval_policy_snapshot->>'approval_required')::boolean
                AS approval_required,refund.version
         FROM refunds refund WHERE refund.tenant_id=$1 AND refund.id=$2`,
      [tenantId, refundId],
    );
    const current = header.rows[0];
    if (!current) throw new CommerceRefundAuthorizationError();
    const items = await client.query<{
      order_item_id: string;
      quantity: number;
      amount_cents: string | number;
    }>(
      `SELECT order_item_id,quantity,amount_cents FROM refund_items
        WHERE tenant_id=$1 AND refund_id=$2 ORDER BY order_item_id`,
      [tenantId, refundId],
    );
    return RefundViewSchema.parse({
      id: current.id,
      refundNo: current.refund_no,
      orderId: current.order_id,
      amountCents: Number(current.amount_cents),
      reasonCode: current.reason_code,
      status: current.status,
      approvalRequired: current.approval_required,
      items: items.rows.map((item) => ({
        orderItemId: item.order_item_id,
        quantity: item.quantity,
        amountCents: Number(item.amount_cents),
      })),
      version: current.version,
    });
  }

  return {
    async request(command) {
      const input = RequestRefundSchema.parse(command.body);
      if (new Set(input.items.map((item) => item.orderItemId)).size !== input.items.length)
        throw new CommerceRefundStateError('duplicate refund items must be combined');
      const normalized = {
        ...input,
        description: input.description ? digest(input.description) : undefined,
        items: [...input.items].sort((left, right) =>
          left.orderItemId.localeCompare(right.orderItemId),
        ),
      };
      const descriptionObjectRef = input.description
        ? `${command.identity.tenantId}/aftercare/${input.orderId}/${digest(command.idempotencyKey)}.txt`
        : null;
      if (input.description && descriptionObjectRef)
        await options.objectStore.putText({
          objectKey: descriptionObjectRef,
          content: input.description,
          sha256: digest(input.description),
        });
      const scope = `commerce.refund.request:${input.orderId}`;
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const requestHash = digest(canonical(normalized));
        const insertedKey = await client.query(
          `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
           VALUES ($1,$2,$3,$4,now()+interval '24 hours')
           ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
          [command.identity.tenantId, scope, command.idempotencyKey, requestHash],
        );
        if (insertedKey.rowCount === 0) {
          const replay = await client.query<{ request_hash: string; response_body: unknown }>(
            `SELECT request_hash,response_body FROM idempotency_keys
              WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
            [command.identity.tenantId, scope, command.idempotencyKey],
          );
          const prior = replay.rows[0];
          if (!prior || prior.request_hash !== requestHash) throw new IdempotencyConflictError();
          if (prior.response_body === null)
            throw new CommerceRefundStateError('refund request pending');
          return RefundViewSchema.parse(prior.response_body);
        }
        const order = await client.query<{
          id: string;
          store_id: string;
          customer_id: string;
          status: string;
          payment_status: string;
          aftercare_status: string;
          paid_amount_cents: string | number;
          refunded_amount_cents: string | number;
          payment_intent_id: string;
        }>(
          `SELECT orders.id,orders.store_id,orders.customer_id,orders.status,orders.payment_status,
                  orders.aftercare_status,orders.paid_amount_cents,orders.refunded_amount_cents,
                  payment.id AS payment_intent_id
             FROM orders
             JOIN payment_intents payment
               ON payment.tenant_id=orders.tenant_id AND payment.order_id=orders.id
              AND payment.status IN ('SUCCEEDED','PARTIALLY_REFUNDED')
            WHERE orders.tenant_id=$1 AND orders.id=$2 FOR UPDATE OF orders`,
          [command.identity.tenantId, input.orderId],
        );
        const current = order.rows[0];
        if (
          !current ||
          current.customer_id !== command.identity.customerId ||
          current.store_id !== command.identity.storeId
        )
          throw new CommerceRefundAuthorizationError();
        if (!['PAID', 'FULFILLING', 'COMPLETED'].includes(current.status))
          throw new CommerceRefundStateError('order is not refundable');
        const orderItems = await client.query<{
          id: string;
          quantity: number;
          refunded_quantity: number;
          paid_allocation_cents: string | number;
          refunded_amount_cents: string | number;
          used_uses: string | number;
        }>(
          `SELECT item.id,item.quantity,item.refunded_quantity,item.paid_allocation_cents,
                  item.refunded_amount_cents,
                  COALESCE(sum(entitlement.used_uses),0)::bigint AS used_uses
             FROM order_items item
             LEFT JOIN verification_entitlements entitlement
               ON entitlement.tenant_id=item.tenant_id AND entitlement.order_item_id=item.id
            WHERE item.tenant_id=$1 AND item.order_id=$2 AND item.id=ANY($3::uuid[])
            GROUP BY item.id ORDER BY item.id FOR UPDATE OF item`,
          [
            command.identity.tenantId,
            input.orderId,
            normalized.items.map((item) => item.orderItemId),
          ],
        );
        if (orderItems.rows.length !== normalized.items.length)
          throw new CommerceRefundAuthorizationError('refund item does not belong to order');
        const byId = new Map(orderItems.rows.map((item) => [item.id, item]));
        let amountCents = 0;
        let hasUsedEntitlement = false;
        const calculated = normalized.items.map((requested) => {
          const item = byId.get(requested.orderItemId)!;
          const remainingQuantity = item.quantity - item.refunded_quantity;
          if (requested.quantity > remainingQuantity)
            throw new CommerceRefundStateError('refund quantity exceeds remaining order item');
          const remainingAmount =
            Number(item.paid_allocation_cents) - Number(item.refunded_amount_cents);
          const itemAmount =
            requested.quantity === remainingQuantity
              ? remainingAmount
              : Math.floor(
                  (Number(item.paid_allocation_cents) * requested.quantity) / item.quantity,
                );
          if (itemAmount < 0 || itemAmount > remainingAmount)
            throw new CommerceRefundStateError('refund amount is invalid');
          amountCents += itemAmount;
          hasUsedEntitlement ||= Number(item.used_uses) > 0;
          return { ...requested, amountCents: itemAmount };
        });
        if (
          !Number.isSafeInteger(amountCents) ||
          amountCents <= 0 ||
          amountCents > Number(current.paid_amount_cents) - Number(current.refunded_amount_cents)
        )
          throw new CommerceRefundStateError('refund exceeds paid amount');
        const approvalRequired =
          amountCents >= threshold ||
          hasUsedEntitlement ||
          Number(current.refunded_amount_cents) > 0 ||
          ['RETURN_REFUND', 'SERVICE_DISPUTE', 'OTHER'].includes(input.requestType);
        const aftercareId = randomUUID();
        const refundId = randomUUID();
        const refundNo = `RF${refundId.replace(/-/gu, '').slice(0, 24).toUpperCase()}`;
        await client.query(
          `INSERT INTO aftercare_requests(
             id,tenant_id,order_id,customer_id,request_type,reason_code,description_object_ref,
             status,due_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'REQUESTED',now()+interval '48 hours')`,
          [
            aftercareId,
            command.identity.tenantId,
            input.orderId,
            command.identity.customerId,
            input.requestType,
            input.reasonCode,
            descriptionObjectRef,
          ],
        );
        await client.query(
          `INSERT INTO refunds(
             id,tenant_id,refund_no,order_id,payment_intent_id,amount_cents,reason_code,status,
             idempotency_key,requested_by_customer_id,aftercare_request_id,approval_policy_snapshot
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
          [
            refundId,
            command.identity.tenantId,
            refundNo,
            input.orderId,
            current.payment_intent_id,
            amountCents,
            input.reasonCode,
            approvalRequired ? 'APPROVAL_REQUIRED' : 'SUBMITTING',
            command.idempotencyKey,
            command.identity.customerId,
            aftercareId,
            JSON.stringify({
              version: 'refund-v1',
              threshold_cents: threshold,
              approval_required: approvalRequired,
              used_entitlement: hasUsedEntitlement,
            }),
          ],
        );
        for (const item of calculated)
          await client.query(
            `INSERT INTO refund_items(tenant_id,refund_id,order_item_id,quantity,amount_cents)
             VALUES ($1,$2,$3,$4,$5)`,
            [
              command.identity.tenantId,
              refundId,
              item.orderItemId,
              item.quantity,
              item.amountCents,
            ],
          );
        if (approvalRequired)
          await client.query(
            `INSERT INTO refund_approvals(
               tenant_id,refund_id,requested_by_customer_id,status,request_reason,expires_at
             ) VALUES ($1,$2,$3,'PENDING',$4,now()+interval '24 hours')`,
            [command.identity.tenantId, refundId, command.identity.customerId, input.reasonCode],
          );
        await client.query(
          `UPDATE orders SET aftercare_status='REQUESTED',version=version+1
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.orderId],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'refund.requested.v1','refund',$2,1,'order:'||($3::uuid)::text,$4::jsonb,
                     'PERSONAL',$5,now())`,
          [
            command.identity.tenantId,
            refundId,
            input.orderId,
            JSON.stringify({
              refund_id: refundId,
              order_id: input.orderId,
              amount_cents: amountCents,
              approval_required: approvalRequired,
              reason_code: input.reasonCode,
            }),
            command.traceId,
          ],
        );
        const response = await loadRefund(client, command.identity.tenantId, refundId);
        await client.query(
          `UPDATE idempotency_keys SET response_status=202,response_body=$4::jsonb,
                  resource_type='refund',resource_id=$5
            WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
          [
            command.identity.tenantId,
            scope,
            command.idempotencyKey,
            JSON.stringify(response),
            refundId,
          ],
        );
        return response;
      });
    },

    async requestPlatform(command) {
      return this.request({
        identity: {
          sessionId: command.identity.sessionId,
          tenantId: command.tenantId,
          customerId: command.customerId,
          storeId: command.storeId,
          authLevel: command.identity.authLevel,
          platformAccountId: command.identity.accountId,
        },
        idempotencyKey: command.idempotencyKey,
        traceId: command.traceId,
        body: command.body,
      });
    },

    async listForConsumer(identity, rawOrderId) {
      const orderId = UuidSchema.parse(rawOrderId);
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const order = await client.query<{ id: string }>(
          `SELECT id FROM orders
            WHERE tenant_id=$1 AND id=$2 AND customer_id=$3 AND store_id=$4
              AND source_channel='MERCHANT_MINI_PROGRAM'`,
          [identity.tenantId, orderId, identity.customerId, identity.storeId],
        );
        if (order.rowCount !== 1) throw new CommerceRefundAuthorizationError();
        const refunds = await client.query<{ id: string }>(
          `SELECT id FROM refunds
            WHERE tenant_id=$1 AND order_id=$2
            ORDER BY created_at DESC,id`,
          [identity.tenantId, orderId],
        );
        const records = [];
        for (const refund of refunds.rows)
          records.push(await loadRefund(client, identity.tenantId, refund.id));
        return records;
      });
    },

    async approve(command) {
      const input = ApproveRefundSchema.parse(command.body);
      const scope = `commerce.refund.approve:${input.refundId}`;
      return transaction(command.identity.tenantId, async (client) => {
        const requestHash = digest(canonical(input));
        const key = await client.query(
          `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
           VALUES ($1,$2,$3,$4,now()+interval '24 hours')
           ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
          [command.identity.tenantId, scope, command.idempotencyKey, requestHash],
        );
        if (key.rowCount === 0) {
          const replay = await client.query<{ request_hash: string; response_body: unknown }>(
            `SELECT request_hash,response_body FROM idempotency_keys
              WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
            [command.identity.tenantId, scope, command.idempotencyKey],
          );
          const prior = replay.rows[0];
          if (!prior || prior.request_hash !== requestHash) throw new IdempotencyConflictError();
          if (prior.response_body === null) throw new CommerceRefundStateError('approval pending');
          return RefundViewSchema.parse(prior.response_body);
        }
        const approval = await client.query<{
          id: string;
          store_id: string;
          requested_by: string | null;
          status: string;
          expires_at: Date | string;
        }>(
          `SELECT approval.id,orders.store_id,approval.requested_by,approval.status,approval.expires_at
             FROM refund_approvals approval
             JOIN refunds refund ON refund.tenant_id=approval.tenant_id AND refund.id=approval.refund_id
             JOIN orders ON orders.tenant_id=refund.tenant_id AND orders.id=refund.order_id
            WHERE approval.tenant_id=$1 AND approval.refund_id=$2 FOR UPDATE OF approval,refund`,
          [command.identity.tenantId, input.refundId],
        );
        const current = approval.rows[0];
        if (!current) throw new CommerceRefundAuthorizationError();
        assertStaffStore(command.identity, current.store_id);
        if (
          current.status !== 'PENDING' ||
          new Date(current.expires_at).getTime() <= Date.now() ||
          current.requested_by === command.identity.userId
        )
          throw new CommerceRefundStateError('refund approval is not decidable');
        await client.query(
          `UPDATE refund_approvals SET status=$3,decided_by=$4,decision_reason=$5,decided_at=now()
            WHERE tenant_id=$1 AND refund_id=$2 AND status='PENDING'`,
          [
            command.identity.tenantId,
            input.refundId,
            input.decision,
            command.identity.userId,
            input.reason,
          ],
        );
        await client.query(
          `UPDATE refunds SET status=$3,approved_by=$4,version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='APPROVAL_REQUIRED'`,
          [
            command.identity.tenantId,
            input.refundId,
            input.decision === 'APPROVED' ? 'SUBMITTING' : 'REJECTED',
            input.decision === 'APPROVED' ? command.identity.userId : null,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id,actor_type,actor_id,action,resource_type,resource_id,permission_code,
             result_code,after_redacted,trace_id
           ) VALUES ($1,'USER',$2,'refund.approve','refund',$3,'refund.approve',$4,$5::jsonb,$6)`,
          [
            command.identity.tenantId,
            command.identity.userId,
            input.refundId,
            input.decision,
            JSON.stringify({ reason_digest: digest(input.reason) }),
            command.traceId,
          ],
        );
        const response = await loadRefund(client, command.identity.tenantId, input.refundId);
        await client.query(
          `UPDATE idempotency_keys SET response_status=200,response_body=$4::jsonb,
                  resource_type='refund',resource_id=$5
            WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
          [
            command.identity.tenantId,
            scope,
            command.idempotencyKey,
            JSON.stringify(response),
            input.refundId,
          ],
        );
        return response;
      });
    },

    async submit(input) {
      const refundId = UuidSchema.parse(input.refundId);
      const claim = await transaction(input.tenantId, async (client) => {
        const selected = await client.query<{
          refund_id: string;
          refund_status: string;
          payment_intent_id: string;
          amount_cents: string | number;
          approval_required: boolean;
          approval_status: string | null;
          provider: string;
          provider_payment_id: string;
          credential_secret_ref: string;
          attempt_count: string | number;
        }>(
          `SELECT refund.id AS refund_id,refund.status AS refund_status,refund.payment_intent_id,
                  refund.amount_cents,
                  (refund.approval_policy_snapshot->>'approval_required')::boolean AS approval_required,
                  approval.status AS approval_status,payment.provider,payment.provider_payment_id,
                  account.credential_secret_ref,
                  (SELECT count(*) FROM refund_provider_attempts attempt
                    WHERE attempt.tenant_id=refund.tenant_id AND attempt.refund_id=refund.id) AS attempt_count
             FROM refunds refund
             JOIN payment_intents payment
               ON payment.tenant_id=refund.tenant_id AND payment.id=refund.payment_intent_id
             JOIN merchant_payment_accounts account
               ON account.tenant_id=payment.tenant_id AND account.id=payment.merchant_payment_account_id
             LEFT JOIN refund_approvals approval
               ON approval.tenant_id=refund.tenant_id AND approval.refund_id=refund.id
            WHERE refund.tenant_id=$1 AND refund.id=$2 FOR UPDATE OF refund`,
          [input.tenantId, refundId],
        );
        const current = selected.rows[0];
        if (!current) throw new CommerceRefundAuthorizationError();
        if (current.refund_status !== 'SUBMITTING')
          throw new CommerceRefundStateError('refund is not ready for provider submission');
        if (current.approval_required && current.approval_status !== 'APPROVED')
          throw new CommerceRefundAuthorizationError('qualified refund approval is required');
        if (!current.provider_payment_id)
          throw new CommerceRefundStateError('provider payment reference is missing');
        const attemptNo = Number(current.attempt_count) + 1;
        const idempotencyKey = `refund:${refundId}:attempt:${attemptNo}`;
        const attemptId = randomUUID();
        await client.query(
          `INSERT INTO refund_provider_attempts(
             id,tenant_id,refund_id,attempt_no,idempotency_key,request_digest,status
           ) VALUES ($1,$2,$3,$4,$5,$6,'SUBMITTED')`,
          [
            attemptId,
            input.tenantId,
            refundId,
            attemptNo,
            idempotencyKey,
            digest(
              canonical({
                refundId,
                paymentIntentId: current.payment_intent_id,
                amountCents: Number(current.amount_cents),
              }),
            ),
          ],
        );
        await client.query(
          `UPDATE refunds SET status='PROCESSING',submitted_at=now(),failure_code=NULL,version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='SUBMITTING'`,
          [input.tenantId, refundId],
        );
        return {
          ...current,
          attemptId,
          idempotencyKey,
          amountCents: Number(current.amount_cents),
        };
      });
      try {
        const submitted = await options.provider.submitRefund({
          tenantId: input.tenantId,
          refundId,
          paymentIntentId: claim.payment_intent_id,
          provider: claim.provider,
          credentialSecretRef: claim.credential_secret_ref,
          providerPaymentId: claim.provider_payment_id,
          amountCents: claim.amountCents,
          idempotencyKey: claim.idempotencyKey,
          traceId: input.traceId,
        });
        return transaction(input.tenantId, async (client) => {
          await client.query(
            `UPDATE refund_provider_attempts SET provider_request_id=$3,status=$4,
                    response_summary=$5::jsonb,completed_at=CASE WHEN $4='SUCCEEDED' THEN now() ELSE NULL END
              WHERE tenant_id=$1 AND id=$2 AND status='SUBMITTED'`,
            [
              input.tenantId,
              claim.attemptId,
              submitted.providerRequestId,
              submitted.status,
              JSON.stringify({ provider_refund_id_hash: digest(submitted.providerRefundId) }),
            ],
          );
          await client.query(
            `UPDATE refunds SET provider_refund_id=$3,version=version+1
              WHERE tenant_id=$1 AND id=$2 AND status='PROCESSING'`,
            [input.tenantId, refundId, submitted.providerRefundId],
          );
          return loadRefund(client, input.tenantId, refundId);
        });
      } catch (error) {
        await transaction(input.tenantId, async (client) => {
          await client.query(
            `UPDATE refund_provider_attempts SET status='UNKNOWN',error_code='PROVIDER_RESULT_UNKNOWN',
                    response_summary=$3::jsonb
              WHERE tenant_id=$1 AND id=$2 AND status='SUBMITTED'`,
            [input.tenantId, claim.attemptId, JSON.stringify({ retry_requires_query: true })],
          );
        });
        throw new CommerceRefundStateError(
          'refund provider result is unknown; query before retry',
          {
            cause: error,
          },
        );
      }
    },
  };
}
