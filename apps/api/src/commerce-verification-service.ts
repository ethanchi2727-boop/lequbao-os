import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';
import { createVerificationToken } from './verification-token.js';

const UseVerificationSchema = z.object({
  verificationToken: z.string().min(32).max(512),
  storeId: UuidSchema,
  quantity: z.number().int().positive().max(999),
  deviceRiskLevel: z.enum(['NORMAL', 'ELEVATED', 'HIGH', 'BLOCKED']).default('NORMAL'),
});
const VerificationResultSchema = z.object({
  verificationUseId: UuidSchema,
  entitlementId: UuidSchema,
  orderId: UuidSchema,
  storeId: UuidSchema,
  quantity: z.number().int().positive(),
  remainingUses: z.number().int().nonnegative(),
  status: z.enum(['AVAILABLE', 'PARTIALLY_USED', 'FULLY_USED', 'VOIDED']),
  usedAt: z.string(),
});
const ConsumerTokenSchema = z.object({
  entitlementId: UuidSchema,
  orderId: UuidSchema,
  verificationToken: z.string(),
  remainingUses: z.number().int().nonnegative(),
  status: z.string(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
});

type StaffIdentity = SessionIdentity & {
  accessScopes?: string[];
  assignedStoreIds?: string[];
};
type VerificationConsumerIdentity = ConsumerSessionIdentity & { platformAccountId?: string };
type StaffCommand = {
  identity: StaffIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export type CommerceVerificationResult = z.infer<typeof VerificationResultSchema>;

export interface CommerceVerificationService {
  listAvailableForConsumer(
    identity: ConsumerSessionIdentity,
  ): Promise<z.infer<typeof ConsumerTokenSchema>[]>;
  listConsumerTokens(
    identity: VerificationConsumerIdentity,
    orderId: string,
  ): Promise<z.infer<typeof ConsumerTokenSchema>[]>;
  listPlatformTokens(input: {
    identity: LifeConsumerSessionIdentity;
    tenantId: string;
    customerId: string;
    storeId: string;
    orderId: string;
  }): Promise<z.infer<typeof ConsumerTokenSchema>[]>;
  use(command: StaffCommand): Promise<CommerceVerificationResult>;
}

export class CommerceVerificationAuthenticationError extends Error {}
export class CommerceVerificationAuthorizationError extends Error {}
export class CommerceVerificationStateError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());

export function createCommerceVerificationService(options: {
  pool: Pick<pg.Pool, 'connect'>;
  verificationTokenSecret: string;
}): CommerceVerificationService {
  createVerificationToken(options.verificationTokenSecret, {
    entitlementId: '00000000-0000-4000-8000-000000000000',
    tenantId: '00000000-0000-4000-8000-000000000000',
    orderId: '00000000-0000-4000-8000-000000000000',
    generation: 1,
    validUntil: '1970-01-01T00:00:00.000Z',
  });

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

  async function validateConsumer(client: pg.PoolClient, identity: VerificationConsumerIdentity) {
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
      if (platform.rowCount !== 1) throw new CommerceVerificationAuthenticationError();
      return;
    }
    const result = await client.query(
      `SELECT 1 FROM consumer_sessions
        WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
          AND revoked_at IS NULL AND expires_at>now()`,
      [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
    );
    if (result.rowCount !== 1) throw new CommerceVerificationAuthenticationError();
  }

  function assertStaffStore(identity: StaffIdentity, storeId: string) {
    const scopes = identity.accessScopes ?? [];
    if (scopes.some((scope) => ['TENANT', 'ALL'].includes(scope))) return;
    if (
      scopes.includes('STORE') &&
      (identity.assignedStoreIds ?? identity.storeIds).includes(storeId)
    )
      return;
    throw new CommerceVerificationAuthorizationError();
  }

  async function loadResult(client: pg.PoolClient, tenantId: string, idempotencyKey: string) {
    const result = await client.query<{
      verification_use_id: string;
      entitlement_id: string;
      order_id: string;
      store_id: string;
      quantity: number;
      remaining_uses: number;
      status: string;
      used_at: Date | string;
    }>(
      `SELECT use.id AS verification_use_id,use.entitlement_id,entitlement.order_id,use.store_id,
              use.quantity,entitlement.total_uses-entitlement.used_uses AS remaining_uses,
              entitlement.status,use.used_at
         FROM verification_uses use
         JOIN verification_entitlements entitlement
           ON entitlement.tenant_id=use.tenant_id AND entitlement.id=use.entitlement_id
        WHERE use.tenant_id=$1 AND use.idempotency_key=$2`,
      [tenantId, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) throw new CommerceVerificationStateError('verification result missing');
    return VerificationResultSchema.parse({
      verificationUseId: row.verification_use_id,
      entitlementId: row.entitlement_id,
      orderId: row.order_id,
      storeId: row.store_id,
      quantity: row.quantity,
      remainingUses: row.remaining_uses,
      status: row.status,
      usedAt: new Date(row.used_at).toISOString(),
    });
  }

  return {
    async listAvailableForConsumer(identity) {
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const entitlements = await client.query<{
          id: string;
          order_id: string;
          token_generation: number;
          total_uses: number;
          used_uses: number;
          status: string;
          valid_from: Date | string | null;
          valid_until: Date | string | null;
        }>(
          `SELECT entitlement.id,entitlement.order_id,entitlement.token_generation,
                  entitlement.total_uses,entitlement.used_uses,entitlement.status,
                  entitlement.valid_from,entitlement.valid_until
             FROM verification_entitlements entitlement
             JOIN orders ON orders.tenant_id=entitlement.tenant_id AND orders.id=entitlement.order_id
            WHERE entitlement.tenant_id=$1 AND orders.customer_id=$2 AND orders.store_id=$3
              AND orders.source_channel='MERCHANT_MINI_PROGRAM'
              AND entitlement.status IN ('AVAILABLE','PARTIALLY_USED')
              AND entitlement.total_uses>entitlement.used_uses
            ORDER BY entitlement.created_at DESC,entitlement.id`,
          [identity.tenantId, identity.customerId, identity.storeId],
        );
        return entitlements.rows.map((entitlement) => {
          const validUntil = entitlement.valid_until
            ? new Date(entitlement.valid_until).toISOString()
            : '9999-12-31T23:59:59.999Z';
          return ConsumerTokenSchema.parse({
            entitlementId: entitlement.id,
            orderId: entitlement.order_id,
            verificationToken: createVerificationToken(options.verificationTokenSecret, {
              entitlementId: entitlement.id,
              tenantId: identity.tenantId,
              orderId: entitlement.order_id,
              generation: entitlement.token_generation,
              validUntil,
            }),
            remainingUses: entitlement.total_uses - entitlement.used_uses,
            status: entitlement.status,
            validFrom: entitlement.valid_from
              ? new Date(entitlement.valid_from).toISOString()
              : null,
            validUntil: entitlement.valid_until
              ? new Date(entitlement.valid_until).toISOString()
              : null,
          });
        });
      });
    },

    async listConsumerTokens(identity, rawOrderId) {
      const orderId = UuidSchema.parse(rawOrderId);
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const entitlements = await client.query<{
          id: string;
          order_id: string;
          customer_id: string;
          token_generation: number;
          total_uses: number;
          used_uses: number;
          status: string;
          valid_from: Date | string | null;
          valid_until: Date | string | null;
        }>(
          `SELECT entitlement.id,entitlement.order_id,orders.customer_id,
                  entitlement.token_generation,entitlement.total_uses,entitlement.used_uses,
                  entitlement.status,entitlement.valid_from,entitlement.valid_until
             FROM verification_entitlements entitlement
             JOIN orders ON orders.tenant_id=entitlement.tenant_id AND orders.id=entitlement.order_id
            WHERE entitlement.tenant_id=$1 AND entitlement.order_id=$2 ORDER BY entitlement.id`,
          [identity.tenantId, orderId],
        );
        if (
          entitlements.rows.length === 0 ||
          entitlements.rows.some((entitlement) => entitlement.customer_id !== identity.customerId)
        )
          throw new CommerceVerificationAuthorizationError();
        return entitlements.rows.map((entitlement) => {
          const validUntil = entitlement.valid_until
            ? new Date(entitlement.valid_until).toISOString()
            : '9999-12-31T23:59:59.999Z';
          return ConsumerTokenSchema.parse({
            entitlementId: entitlement.id,
            orderId: entitlement.order_id,
            verificationToken: createVerificationToken(options.verificationTokenSecret, {
              entitlementId: entitlement.id,
              tenantId: identity.tenantId,
              orderId: entitlement.order_id,
              generation: entitlement.token_generation,
              validUntil,
            }),
            remainingUses: entitlement.total_uses - entitlement.used_uses,
            status: entitlement.status,
            validFrom: entitlement.valid_from
              ? new Date(entitlement.valid_from).toISOString()
              : null,
            validUntil: entitlement.valid_until
              ? new Date(entitlement.valid_until).toISOString()
              : null,
          });
        });
      });
    },

    async listPlatformTokens(input) {
      return this.listConsumerTokens(
        {
          sessionId: input.identity.sessionId,
          tenantId: input.tenantId,
          customerId: input.customerId,
          storeId: input.storeId,
          authLevel: input.identity.authLevel,
          platformAccountId: input.identity.accountId,
        },
        input.orderId,
      );
    },

    async use(command) {
      const input = UseVerificationSchema.parse(command.body);
      assertStaffStore(command.identity, input.storeId);
      const tokenDigest = digest(input.verificationToken);
      const requestHash = digest(
        canonical({
          tokenDigest,
          storeId: input.storeId,
          quantity: input.quantity,
          deviceRiskLevel: input.deviceRiskLevel,
        }),
      );
      return transaction(command.identity.tenantId, async (client) => {
        const existing = await client.query<{
          entitlement_id: string;
          store_id: string;
          quantity: number;
          token_digest: string;
        }>(
          `SELECT entitlement_id,store_id,quantity,token_digest FROM verification_uses
            WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [command.identity.tenantId, command.idempotencyKey],
        );
        if (existing.rows[0]) {
          const prior = existing.rows[0];
          if (
            prior.store_id !== input.storeId ||
            prior.quantity !== input.quantity ||
            prior.token_digest !== tokenDigest
          )
            throw new IdempotencyConflictError();
          return loadResult(client, command.identity.tenantId, command.idempotencyKey);
        }
        const entitlement = await client.query<{
          id: string;
          order_id: string;
          allowed_store_ids: string[];
          status: string;
        }>(
          `SELECT id,order_id,allowed_store_ids,status FROM verification_entitlements
            WHERE tenant_id=$1 AND verification_code_hash=$2 FOR UPDATE`,
          [command.identity.tenantId, tokenDigest],
        );
        const current = entitlement.rows[0];
        if (!current)
          throw new CommerceVerificationAuthorizationError('verification token invalid');
        if (
          current.allowed_store_ids.length > 0 &&
          !current.allowed_store_ids.includes(input.storeId)
        )
          throw new CommerceVerificationAuthorizationError('verification store is not allowed');
        if (input.deviceRiskLevel === 'BLOCKED')
          throw new CommerceVerificationAuthorizationError('verification device is blocked');
        const useId = randomUUID();
        await client.query(
          `INSERT INTO verification_uses(
             id,tenant_id,entitlement_id,store_id,quantity,verifier_user_id,idempotency_key,
             token_digest,device_risk_level,trace_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            useId,
            command.identity.tenantId,
            current.id,
            input.storeId,
            input.quantity,
            command.identity.userId,
            command.idempotencyKey,
            tokenDigest,
            input.deviceRiskLevel,
            command.traceId,
          ],
        );
        const projection = await client.query<{
          available_count: string | number;
          partially_used_count: string | number;
          total_count: string | number;
        }>(
          `SELECT count(*) FILTER (WHERE status='AVAILABLE') AS available_count,
                  count(*) FILTER (WHERE status='PARTIALLY_USED') AS partially_used_count,
                  count(*) AS total_count
             FROM verification_entitlements WHERE tenant_id=$1 AND order_id=$2`,
          [command.identity.tenantId, current.order_id],
        );
        const counts = projection.rows[0]!;
        const hasRemaining =
          Number(counts.available_count) + Number(counts.partially_used_count) > 0;
        await client.query(
          `UPDATE orders SET status=$3,payment_status=payment_status,
                  fulfillment_status=$4,verification_status=$5,
                  completed_at=CASE WHEN $3='COMPLETED' THEN now() ELSE completed_at END,
                  version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status IN ('PAID','FULFILLING')`,
          [
            command.identity.tenantId,
            current.order_id,
            hasRemaining ? 'FULFILLING' : 'COMPLETED',
            hasRemaining ? 'PARTIALLY_FULFILLED' : 'FULFILLED',
            hasRemaining ? 'PARTIALLY_USED' : 'FULLY_USED',
          ],
        );
        await client.query(
          `UPDATE order_fulfillments SET status=$3,
                  fulfilled_at=CASE WHEN $3='FULFILLED' THEN now() ELSE NULL END,
                  version=version+1,updated_at=now()
            WHERE tenant_id=$1 AND order_id=$2`,
          [
            command.identity.tenantId,
            current.order_id,
            hasRemaining ? 'PARTIALLY_FULFILLED' : 'FULFILLED',
          ],
        );
        const response = await loadResult(
          client,
          command.identity.tenantId,
          command.idempotencyKey,
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'verification.used.v1','verification_entitlement',$2,$3,
                     'order:'||($4::uuid)::text,$5::jsonb,'PERSONAL',$6,now())`,
          [
            command.identity.tenantId,
            current.id,
            response.remainingUses + response.quantity,
            current.order_id,
            JSON.stringify({
              verification_use_id: response.verificationUseId,
              entitlement_id: current.id,
              order_id: current.order_id,
              store_id: input.storeId,
              quantity: input.quantity,
              used_at: response.usedAt,
              request_hash: requestHash,
            }),
            command.traceId,
          ],
        );
        return response;
      });
    },
  };
}
