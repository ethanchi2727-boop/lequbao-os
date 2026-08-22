import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { CommercePaymentService } from './commerce-payment-service.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const CreatePlatformPaymentSchema = z.object({
  orderId: UuidSchema,
  provider: z.enum(['WECHAT_PAY', 'ALIPAY', 'SANDBOX']),
});

export interface PlatformPaymentService {
  create(command: {
    identity: LifeConsumerSessionIdentity;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
}

export class PlatformPaymentAuthenticationError extends Error {}
export class PlatformPaymentOrderNotFoundError extends Error {}

export function createPlatformPaymentService(
  pool: Pick<pg.Pool, 'connect'>,
  commercePayments: Pick<CommercePaymentService, 'createPlatformIntent'>,
): PlatformPaymentService {
  return {
    async create(command) {
      const input = CreatePlatformPaymentSchema.parse(command.body);
      const client = await pool.connect();
      let scope: { merchantTenantId: string; customerId: string; storeId: string } | undefined;
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
          command.identity.accountId,
        ]);
        const session = await client.query(
          `SELECT 1
             FROM platform_consumer_sessions session
             JOIN platform_consumer_accounts account ON account.id=session.account_id
            WHERE session.session_id=$1 AND session.account_id=$2
              AND session.revoked_at IS NULL AND session.expires_at>now()
              AND account.status='ACTIVE'`,
          [command.identity.sessionId, command.identity.accountId],
        );
        if (session.rowCount !== 1) throw new PlatformPaymentAuthenticationError();
        const links = await client.query<{ merchant_tenant_id: string; customer_id: string }>(
          `SELECT merchant_tenant_id,customer_id
             FROM platform_consumer_tenant_links
            WHERE account_id=$1 AND status='ACTIVE'
            ORDER BY merchant_tenant_id`,
          [command.identity.accountId],
        );
        for (const link of links.rows) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            link.merchant_tenant_id,
          ]);
          const order = await client.query<{ store_id: string }>(
            `SELECT store_id FROM orders
              WHERE tenant_id=$1 AND id=$2 AND customer_id=$3 AND source_channel='LEQU_LIFE'`,
            [link.merchant_tenant_id, input.orderId, link.customer_id],
          );
          if (order.rows[0]) {
            scope = {
              merchantTenantId: link.merchant_tenant_id,
              customerId: link.customer_id,
              storeId: order.rows[0].store_id,
            };
            break;
          }
        }
        if (!scope) throw new PlatformPaymentOrderNotFoundError();
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return commercePayments.createPlatformIntent({
        identity: command.identity,
        ...scope,
        idempotencyKey: command.idempotencyKey,
        traceId: command.traceId,
        body: input,
      });
    },
  };
}
