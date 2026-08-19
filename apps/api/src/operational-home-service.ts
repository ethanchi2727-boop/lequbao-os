import type pg from 'pg';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

type OperationalIdentity = SessionIdentity & Partial<AuthorizationContext>;

export class OperationalHomeAuthorizationError extends Error {}

export interface OperationalHomeService {
  getToday(identity: OperationalIdentity): Promise<unknown>;
}

function storeScope(identity: OperationalIdentity): string[] | null {
  if (!identity.accessScopes || !identity.assignedStoreIds)
    throw new OperationalHomeAuthorizationError();
  if (identity.accessScopes.some((scope) => ['TENANT', 'ALL'].includes(scope))) return null;
  const stores = [...new Set(identity.assignedStoreIds)];
  if (stores.length === 0) throw new OperationalHomeAuthorizationError();
  return stores;
}

const count = (value: unknown) => Number(value ?? 0);

export function createOperationalHomeService(
  pool: Pick<pg.Pool, 'connect'>,
): OperationalHomeService {
  return {
    async getToday(identity) {
      const stores = storeScope(identity);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
        const result = await client.query<Record<string, unknown>>(
          `WITH context AS (
             SELECT timezone,
               date_trunc('day',now() AT TIME ZONE timezone) AT TIME ZONE timezone AS day_start,
               (date_trunc('day',now() AT TIME ZONE timezone)+interval '1 day') AT TIME ZONE timezone AS day_end
               FROM tenants WHERE id=$1
           )
           SELECT context.timezone,context.day_start,context.day_end,
             (SELECT count(*) FROM orders item WHERE item.tenant_id=$1
               AND ($2::uuid[] IS NULL OR item.store_id=ANY($2))
               AND item.created_at>=context.day_start AND item.created_at<context.day_end) AS orders_created,
             (SELECT COALESCE(sum(item.paid_amount_cents),0) FROM orders item WHERE item.tenant_id=$1
               AND ($2::uuid[] IS NULL OR item.store_id=ANY($2))
               AND item.paid_at>=context.day_start AND item.paid_at<context.day_end) AS paid_amount_cents,
             (SELECT count(*) FROM orders item WHERE item.tenant_id=$1
               AND ($2::uuid[] IS NULL OR item.store_id=ANY($2))
               AND item.status IN ('PAID','FULFILLING')) AS fulfillment_count,
             (SELECT count(*) FROM refunds refund JOIN orders item
                ON item.tenant_id=refund.tenant_id AND item.id=refund.order_id
               WHERE refund.tenant_id=$1 AND ($2::uuid[] IS NULL OR item.store_id=ANY($2))
                 AND refund.status IN ('REQUESTED','APPROVAL_REQUIRED','SUBMITTING','PROCESSING','FAILED')) AS refund_count,
             (SELECT count(*) FROM handoff_tickets ticket JOIN conversations conversation
                ON conversation.tenant_id=ticket.tenant_id AND conversation.id=ticket.conversation_id
               WHERE ticket.tenant_id=$1 AND ($2::uuid[] IS NULL OR conversation.store_id=ANY($2))
                 AND ticket.status IN ('OPEN','ASSIGNED')) AS handoff_count,
             (SELECT count(*) FROM delivery_exceptions item WHERE item.tenant_id=$1
               AND item.status IN ('OPEN','IN_PROGRESS')) AS delivery_exception_count,
             (SELECT count(*) FROM employee_agent_tasks item WHERE item.tenant_id=$1
               AND item.created_by=$3 AND item.status IN ('WAITING_APPROVAL','FAILED')) AS agent_attention_count,
             (SELECT count(*) FROM customer_service_notifications notification
               JOIN conversations conversation ON conversation.tenant_id=notification.tenant_id
                 AND conversation.id=notification.conversation_id
               WHERE notification.tenant_id=$1 AND ($2::uuid[] IS NULL OR conversation.store_id=ANY($2))
                 AND notification.status IN ('PENDING','FAILED')) AS notification_count
           FROM context`,
          [identity.tenantId, stores, identity.userId],
        );
        const row = result.rows[0];
        if (!row) throw new OperationalHomeAuthorizationError();
        const metrics = {
          ordersCreated: count(row.orders_created),
          paidAmountCents: count(row.paid_amount_cents),
          fulfillment: count(row.fulfillment_count),
          refunds: count(row.refund_count),
          customerHandoffs: count(row.handoff_count),
          deliveryExceptions: count(row.delivery_exception_count),
          agentAttention: count(row.agent_attention_count),
          notifications: count(row.notification_count),
        };
        const definitions = [
          [
            'CUSTOMER_HANDOFF',
            '待接管客户会话',
            metrics.customerHandoffs,
            'URGENT',
            '/bao/page-099?status=HUMAN_QUEUED',
          ],
          ['REFUND', '待处理退款', metrics.refunds, 'HIGH', '/bao/page-092'],
          [
            'DELIVERY_EXCEPTION',
            '交付异常',
            metrics.deliveryExceptions,
            'HIGH',
            '/bao/page-149?status=OPEN',
          ],
          ['FULFILLMENT', '待履约订单', metrics.fulfillment, 'NORMAL', '/bao/page-090?status=PAID'],
          [
            'AGENT_ATTENTION',
            'Agent 待确认或失败任务',
            metrics.agentAttention,
            'NORMAL',
            '/bao/page-167',
          ],
          ['NOTIFICATION', '待投递内部通知', metrics.notifications, 'NORMAL', '/bao/page-193'],
        ] as const;
        await client.query('COMMIT');
        return {
          timezone: row.timezone,
          period: {
            start: new Date(row.day_start as string | Date).toISOString(),
            end: new Date(row.day_end as string | Date).toISOString(),
          },
          storeScope: stores === null ? 'TENANT' : 'ASSIGNED',
          metrics,
          todos: definitions
            .filter(([, , itemCount]) => itemCount > 0)
            .map(([kind, label, itemCount, priority, route]) => ({
              kind,
              label,
              count: itemCount,
              priority,
              route,
            })),
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
