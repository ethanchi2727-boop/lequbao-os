import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { CommerceRefundService } from './commerce-refund-service.js';
import type { CommerceVerificationService } from './commerce-verification-service.js';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const RewardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

type OrderScope = {
  merchantTenantId: string;
  customerId: string;
  storeId: string;
};

export interface PlatformAftercareService {
  getOrder(identity: LifeConsumerSessionIdentity, orderId: string): Promise<unknown>;
  requestRefund(command: {
    identity: LifeConsumerSessionIdentity;
    orderId: string;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
  listEntitlements(identity: LifeConsumerSessionIdentity, orderId: string): Promise<unknown[]>;
  listAvailableEntitlements(identity: LifeConsumerSessionIdentity): Promise<unknown[]>;
  listRewards(identity: LifeConsumerSessionIdentity, query: unknown): Promise<unknown[]>;
}

export class PlatformAftercareAuthenticationError extends Error {}
export class PlatformAftercareOrderNotFoundError extends Error {}

export function createPlatformAftercareService(
  pool: Pick<pg.Pool, 'connect'>,
  commerceRefunds: Pick<CommerceRefundService, 'requestPlatform'>,
  commerceVerification: Pick<CommerceVerificationService, 'listPlatformTokens'>,
): PlatformAftercareService {
  async function transaction<T>(
    identity: LifeConsumerSessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.accountId,
      ]);
      const session = await client.query(
        `SELECT 1
           FROM platform_consumer_sessions session
           JOIN platform_consumer_accounts account ON account.id=session.account_id
          WHERE session.session_id=$1 AND session.account_id=$2
            AND session.revoked_at IS NULL AND session.expires_at>now()
            AND account.status='ACTIVE'`,
        [identity.sessionId, identity.accountId],
      );
      if (session.rowCount !== 1) throw new PlatformAftercareAuthenticationError();
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

  async function activeLinks(client: pg.PoolClient, accountId: string) {
    const result = await client.query<{ merchant_tenant_id: string; customer_id: string }>(
      `SELECT merchant_tenant_id,customer_id
         FROM platform_consumer_tenant_links
        WHERE account_id=$1 AND status='ACTIVE'
        ORDER BY merchant_tenant_id`,
      [accountId],
    );
    return result.rows;
  }

  async function resolveOrder(
    client: pg.PoolClient,
    identity: LifeConsumerSessionIdentity,
    orderId: string,
  ): Promise<OrderScope> {
    for (const link of await activeLinks(client, identity.accountId)) {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [link.merchant_tenant_id]);
      const order = await client.query<{ store_id: string }>(
        `SELECT store_id FROM orders
          WHERE tenant_id=$1 AND id=$2 AND customer_id=$3 AND source_channel='LEQU_LIFE'`,
        [link.merchant_tenant_id, orderId, link.customer_id],
      );
      if (order.rows[0])
        return {
          merchantTenantId: link.merchant_tenant_id,
          customerId: link.customer_id,
          storeId: order.rows[0].store_id,
        };
    }
    throw new PlatformAftercareOrderNotFoundError();
  }

  async function scopeFor(identity: LifeConsumerSessionIdentity, rawOrderId: string) {
    const orderId = UuidSchema.parse(rawOrderId);
    return transaction(identity, async (client) => ({
      orderId,
      ...(await resolveOrder(client, identity, orderId)),
    }));
  }

  return {
    async getOrder(identity, rawOrderId) {
      const orderId = UuidSchema.parse(rawOrderId);
      return transaction(identity, async (client) => {
        const scope = await resolveOrder(client, identity, orderId);
        const refunds = await client.query<{
          id: string;
          refund_no: string;
          amount_cents: string | number;
          reason_code: string;
          status: string;
          created_at: Date | string;
          updated_at: Date | string;
          approval_status: string | null;
        }>(
          `SELECT refund.id,refund.refund_no,refund.amount_cents,refund.reason_code,
                  refund.status,refund.created_at,refund.updated_at,approval.status AS approval_status
             FROM refunds refund
             LEFT JOIN refund_approvals approval
               ON approval.tenant_id=refund.tenant_id AND approval.refund_id=refund.id
            WHERE refund.tenant_id=$1 AND refund.order_id=$2
            ORDER BY refund.created_at DESC,refund.id`,
          [scope.merchantTenantId, orderId],
        );
        const records = [];
        for (const refund of refunds.rows) {
          const items = await client.query<{
            order_item_id: string;
            quantity: number;
            amount_cents: string | number;
          }>(
            `SELECT order_item_id,quantity,amount_cents FROM refund_items
              WHERE tenant_id=$1 AND refund_id=$2 ORDER BY order_item_id`,
            [scope.merchantTenantId, refund.id],
          );
          records.push({
            id: refund.id,
            refundNo: refund.refund_no,
            amountCents: Number(refund.amount_cents),
            reasonCode: refund.reason_code,
            status: refund.status,
            approvalStatus: refund.approval_status,
            items: items.rows.map((item) => ({
              orderItemId: item.order_item_id,
              quantity: item.quantity,
              amountCents: Number(item.amount_cents),
            })),
            createdAt: new Date(refund.created_at).toISOString(),
            updatedAt: new Date(refund.updated_at).toISOString(),
          });
        }
        return { orderId, refunds: records };
      });
    },

    async requestRefund(command) {
      const scope = await scopeFor(command.identity, command.orderId);
      return commerceRefunds.requestPlatform({
        identity: command.identity,
        tenantId: scope.merchantTenantId,
        customerId: scope.customerId,
        storeId: scope.storeId,
        idempotencyKey: command.idempotencyKey,
        traceId: command.traceId,
        body:
          command.body && typeof command.body === 'object'
            ? { ...command.body, orderId: scope.orderId }
            : { orderId: scope.orderId },
      });
    },

    async listEntitlements(identity, rawOrderId) {
      const scope = await scopeFor(identity, rawOrderId);
      return commerceVerification.listPlatformTokens({
        identity,
        tenantId: scope.merchantTenantId,
        customerId: scope.customerId,
        storeId: scope.storeId,
        orderId: scope.orderId,
      });
    },

    async listAvailableEntitlements(identity) {
      const scopes = await transaction(identity, async (client) => {
        const resolved: Array<OrderScope & { orderId: string }> = [];
        for (const link of await activeLinks(client, identity.accountId)) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            link.merchant_tenant_id,
          ]);
          const orders = await client.query<{ id: string; store_id: string }>(
            `SELECT DISTINCT orders.id,orders.store_id
               FROM orders
               JOIN verification_entitlements entitlement
                 ON entitlement.tenant_id=orders.tenant_id AND entitlement.order_id=orders.id
              WHERE orders.tenant_id=$1 AND orders.customer_id=$2
                AND orders.source_channel='LEQU_LIFE'
                AND entitlement.status IN ('AVAILABLE','PARTIALLY_USED')
              ORDER BY orders.id`,
            [link.merchant_tenant_id, link.customer_id],
          );
          resolved.push(
            ...orders.rows.map((order) => ({
              merchantTenantId: link.merchant_tenant_id,
              customerId: link.customer_id,
              storeId: order.store_id,
              orderId: order.id,
            })),
          );
        }
        return resolved;
      });
      const tokens = [];
      for (const scope of scopes) {
        const orderTokens = await commerceVerification.listPlatformTokens({
          identity,
          tenantId: scope.merchantTenantId,
          customerId: scope.customerId,
          storeId: scope.storeId,
          orderId: scope.orderId,
        });
        tokens.push(...orderTokens.filter((token) => token.remainingUses > 0));
      }
      return tokens;
    },

    async listRewards(identity, rawQuery) {
      const query = RewardQuerySchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const rewards: Array<Record<string, unknown> & { createdAt: string }> = [];
        for (const link of await activeLinks(client, identity.accountId)) {
          await client.query("SELECT set_config('app.tenant_id',$1,true)", [
            link.merchant_tenant_id,
          ]);
          const result = await client.query<{
            id: string;
            order_id: string | null;
            granted_amount_cents: string | number;
            redeemed_amount_cents: string | number;
            reversed_amount_cents: string | number;
            status: string;
            funding_source: string;
            rule_version: string;
            available_at: Date | string | null;
            expires_at: Date | string | null;
            created_at: Date | string;
          }>(
            `SELECT grant.id,grant.order_id,grant.granted_amount_cents,
                    grant.redeemed_amount_cents,grant.reversed_amount_cents,grant.status,
                    grant.funding_source,grant.rule_version,grant.available_at,grant.expires_at,
                    grant.created_at
               FROM reward_grants grant
               JOIN reward_accounts account
                 ON account.tenant_id=grant.tenant_id AND account.id=grant.account_id
              WHERE grant.tenant_id=$1 AND grant.customer_id=$2
                AND account.owner_type='CUSTOMER' AND account.owner_id=$2
              ORDER BY grant.created_at DESC,grant.id
              LIMIT $3`,
            [link.merchant_tenant_id, link.customer_id, query.limit],
          );
          rewards.push(
            ...result.rows.map((reward) => ({
              id: reward.id,
              merchantTenantId: link.merchant_tenant_id,
              orderId: reward.order_id,
              grantedAmountCents: Number(reward.granted_amount_cents),
              redeemedAmountCents: Number(reward.redeemed_amount_cents),
              reversedAmountCents: Number(reward.reversed_amount_cents),
              availableAmountCents:
                Number(reward.granted_amount_cents) -
                Number(reward.redeemed_amount_cents) -
                Number(reward.reversed_amount_cents),
              status: reward.status,
              fundingSource: reward.funding_source,
              ruleVersion: reward.rule_version,
              availableAt: reward.available_at ? new Date(reward.available_at).toISOString() : null,
              expiresAt: reward.expires_at ? new Date(reward.expires_at).toISOString() : null,
              createdAt: new Date(reward.created_at).toISOString(),
            })),
          );
        }
        return rewards
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, query.limit);
      });
    },
  };
}
