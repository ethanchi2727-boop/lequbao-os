import { createHash } from 'node:crypto';
import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type {
  ConsumerSessionIdentity,
  ConsumerSessionTokenSigner,
} from './consumer-session-identity.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const ExchangeSchema = z.object({
  merchantTenantId: TenantIdSchema,
  storeId: UuidSchema,
});

type ExchangeCommand = {
  identity: LifeConsumerSessionIdentity;
  idempotencyKey: string;
  body: unknown;
};

export interface LifeMerchantContextSessionService {
  exchange(command: ExchangeCommand): Promise<unknown>;
}

export class LifeMerchantContextAuthenticationError extends Error {}
export class LifeMerchantContextNotFoundError extends Error {}
export class LifeMerchantContextConflictError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function createLifeMerchantContextSessionService(
  pool: Pick<pg.Pool, 'connect'>,
  signer: ConsumerSessionTokenSigner,
  options: { accessTtlSeconds?: number } = {},
): LifeMerchantContextSessionService {
  const accessTtlSeconds = options.accessTtlSeconds ?? 15 * 60;
  if (!Number.isInteger(accessTtlSeconds) || accessTtlSeconds < 60 || accessTtlSeconds > 60 * 60)
    throw new Error('merchant context access TTL must be between 60 and 3600 seconds');

  return {
    async exchange(command) {
      const input = ExchangeSchema.parse(command.body);
      if (!command.idempotencyKey || command.idempotencyKey.length > 255)
        throw new LifeMerchantContextConflictError('idempotency key is required');

      const sessionId = `life-context:${digest(
        `${command.identity.accountId}:${command.identity.sessionId}:${command.idempotencyKey}`,
      ).slice(0, 48)}`;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
          command.identity.accountId,
        ]);
        const platformSession = await client.query<{
          auth_subject_hash: string;
          auth_level: ConsumerSessionIdentity['authLevel'];
          expires_at: Date | string;
        }>(
          `SELECT session.auth_subject_hash,session.auth_level,session.expires_at
             FROM platform_consumer_sessions session
             JOIN platform_consumer_accounts account ON account.id=session.account_id
            WHERE session.account_id=$1 AND session.session_id=$2
              AND session.revoked_at IS NULL AND session.expires_at>now()
              AND account.status='ACTIVE'
            FOR UPDATE OF session`,
          [command.identity.accountId, command.identity.sessionId],
        );
        const platform = platformSession.rows[0];
        if (!platform) throw new LifeMerchantContextAuthenticationError();

        const link = await client.query<{ customer_id: string }>(
          `SELECT customer_id
             FROM platform_consumer_tenant_links
            WHERE account_id=$1 AND merchant_tenant_id=$2 AND status='ACTIVE'`,
          [command.identity.accountId, input.merchantTenantId],
        );
        const customerId = link.rows[0]?.customer_id;
        if (!customerId) throw new LifeMerchantContextNotFoundError();

        await client.query("SELECT set_config('app.tenant_id',$1,true)", [input.merchantTenantId]);
        const store = await client.query(
          `SELECT 1 FROM stores
            WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
          [input.merchantTenantId, input.storeId],
        );
        if (store.rowCount !== 1) throw new LifeMerchantContextNotFoundError();

        const expiresAt = new Date(
          Math.min(new Date(platform.expires_at).getTime(), Date.now() + accessTtlSeconds * 1000),
        );
        await client.query(
          `INSERT INTO consumer_sessions(
             session_id,tenant_id,customer_id,store_id,auth_subject_hash,auth_level,expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (session_id) DO NOTHING`,
          [
            sessionId,
            input.merchantTenantId,
            customerId,
            input.storeId,
            platform.auth_subject_hash,
            platform.auth_level,
            expiresAt,
          ],
        );
        const issued = await client.query<{
          tenant_id: string;
          customer_id: string;
          store_id: string;
          auth_level: ConsumerSessionIdentity['authLevel'];
          expires_at: Date | string;
          revoked_at: Date | string | null;
        }>(
          `SELECT tenant_id,customer_id,store_id,auth_level,expires_at,revoked_at
             FROM consumer_sessions
            WHERE tenant_id=$1 AND session_id=$2`,
          [input.merchantTenantId, sessionId],
        );
        const context = issued.rows[0];
        if (
          !context ||
          context.customer_id !== customerId ||
          context.store_id !== input.storeId ||
          context.revoked_at ||
          new Date(context.expires_at).getTime() <= Date.now()
        )
          throw new LifeMerchantContextConflictError('merchant context replay mismatch');

        const identity: ConsumerSessionIdentity = {
          tenantId: context.tenant_id,
          customerId: context.customer_id,
          storeId: context.store_id,
          sessionId,
          authLevel: context.auth_level,
        };
        const effectiveExpiry = new Date(context.expires_at);
        const accessToken = signer.sign(identity, Math.floor(effectiveExpiry.getTime() / 1000));
        await client.query('COMMIT');
        return {
          merchantTenantId: identity.tenantId,
          storeId: identity.storeId,
          accessToken,
          expiresAt: effectiveExpiry.toISOString(),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
