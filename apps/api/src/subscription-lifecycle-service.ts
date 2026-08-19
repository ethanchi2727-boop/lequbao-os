import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

const ListSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const RequestChangeSchema = z
  .object({
    changeType: z.enum(['ACTIVATE', 'RENEW', 'CANCEL', 'PLAN_CHANGE']),
    contractId: UuidSchema.optional(),
    subscriptionId: UuidSchema.optional(),
    requestedPlanCode: z.string().trim().min(1).max(80).optional(),
    effectiveAt: z.iso.datetime({ offset: true }),
    reasonCode: z.string().trim().min(1).max(80),
  })
  .superRefine((value, context) => {
    const valid =
      (value.changeType === 'ACTIVATE' &&
        value.contractId &&
        !value.subscriptionId &&
        value.requestedPlanCode) ||
      (value.changeType === 'RENEW' && value.contractId && value.subscriptionId) ||
      (value.changeType === 'PLAN_CHANGE' &&
        value.contractId &&
        value.subscriptionId &&
        value.requestedPlanCode) ||
      (value.changeType === 'CANCEL' &&
        !value.contractId &&
        value.subscriptionId &&
        !value.requestedPlanCode);
    if (!valid) context.addIssue({ code: 'custom', message: 'invalid subscription change shape' });
  });
const DecideSchema = z.object({
  changeId: UuidSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
  reasonCode: z.string().trim().min(1).max(80).optional(),
});
const PreviewGenerationSchema = z.object({
  subscriptionId: UuidSchema,
  reportMonth: z.iso.date(),
});
const PreviewStatusSchema = z.object({
  previewId: UuidSchema,
  status: z.enum(['CONTACTED', 'ACCEPTED', 'DECLINED']),
});

type Identity = SessionIdentity & Partial<AuthorizationContext>;
type Command = {
  identity: Identity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export class SubscriptionLifecycleAuthorizationError extends Error {}
export class SubscriptionLifecycleConflictError extends Error {}
export class SubscriptionLifecycleStateError extends Error {}

export interface SubscriptionLifecycleService {
  listChanges(identity: Identity, query: unknown): Promise<unknown[]>;
  getChange(identity: Identity, changeId: string): Promise<unknown>;
  requestChange(command: Command): Promise<unknown>;
  decideChange(command: Command): Promise<unknown>;
  applyApproved(input: { tenantId: string; changeId: string; traceId: string }): Promise<unknown>;
  listPreviews(identity: Identity, query: unknown): Promise<unknown[]>;
  getPreview(identity: Identity, previewId: string): Promise<unknown>;
  generatePreview(command: Command): Promise<unknown>;
  updatePreviewStatus(command: Command): Promise<unknown>;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
const monthDate = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

function changeView(row: Record<string, unknown>) {
  return {
    id: row.id,
    contractId: row.contract_id ?? null,
    subscriptionId: row.subscription_id ?? null,
    appliedSubscriptionId: row.applied_subscription_id ?? null,
    changeType: row.change_type,
    requestedPlanCode: row.requested_plan_code ?? null,
    effectiveAt: iso(row.effective_at as Date | string | null),
    reasonCode: row.reason_code,
    status: row.status,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by ?? null,
    decidedBy: row.decided_by ?? null,
    decisionReasonCode: row.decision_reason_code ?? null,
    decidedAt: iso(row.decided_at as Date | string | null),
    appliedAt: iso(row.applied_at as Date | string | null),
    version: Number(row.version),
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  };
}

function previewView(row: Record<string, unknown>) {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    reportMonth: monthDate(row.report_month as Date | string),
    metricsSnapshot: row.metrics_snapshot,
    issueSnapshot: row.issue_snapshot,
    recommendedPlanCode: row.recommended_plan_code ?? null,
    recommendationReason: row.recommendation_reason,
    status: row.status,
    dueAt: iso(row.due_at as Date | string | null),
    generatedAt: iso(row.generated_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  };
}

export function createSubscriptionLifecycleService(
  pool: Pick<pg.Pool, 'connect'>,
): SubscriptionLifecycleService {
  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
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

  async function idempotent<T>(
    command: Command,
    scope: string,
    normalizedBody: unknown,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    return transaction(command.identity.tenantId, async (client) => {
      const requestHash = createHash('sha256').update(JSON.stringify(normalizedBody)).digest('hex');
      const receipt = await client.query<{ request_hash: string; response_body: T | null }>(
        `SELECT request_hash,response_body FROM idempotency_keys
          WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
        [command.identity.tenantId, scope, command.idempotencyKey],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].request_hash !== requestHash || receipt.rows[0].response_body === null)
          throw new SubscriptionLifecycleConflictError();
        return receipt.rows[0].response_body;
      }
      await client.query(
        `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
         VALUES($1,$2,$3,$4,now()+interval '30 days')`,
        [command.identity.tenantId, scope, command.idempotencyKey, requestHash],
      );
      const result = await work(client);
      await client.query(
        `UPDATE idempotency_keys SET response_status=200,response_body=$4::jsonb
          WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
        [command.identity.tenantId, scope, command.idempotencyKey, JSON.stringify(result)],
      );
      return result;
    });
  }

  async function audit(
    client: pg.PoolClient,
    identity: Identity,
    traceId: string,
    action: string,
    resourceId: string,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
        permission_code,result_code,after_redacted,trace_id)
       VALUES($1,'USER',$2,$3,'subscription_change_request',$4,
        'merchant.intake.confirm','SUCCESS',$5::jsonb,$6)`,
      [identity.tenantId, identity.userId, action, resourceId, JSON.stringify(after), traceId],
    );
  }

  async function paidContract(client: pg.PoolClient, tenantId: string, contractId: string) {
    const result = await client.query(
      `SELECT contract.id,contract.status,contract.amount_cents,contract.currency,
              quote.plan_code
         FROM sales_contracts contract
         JOIN sales_quotes quote ON quote.tenant_id=contract.tenant_id AND quote.id=contract.quote_id
        WHERE contract.tenant_id=$1 AND contract.id=$2
        FOR UPDATE OF contract`,
      [tenantId, contractId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'SIGNED') throw new SubscriptionLifecycleStateError();
    const collected = await client.query<{ collected_cents: string }>(
      `SELECT COALESCE(sum(amount_cents),0)::text AS collected_cents
         FROM sales_collection_receipts
        WHERE tenant_id=$1 AND contract_id=$2 AND currency=$3`,
      [tenantId, contractId, row.currency],
    );
    if (Number(collected.rows[0]?.collected_cents ?? 0) < Number(row.amount_cents))
      throw new SubscriptionLifecycleStateError();
    return { ...row, collected_cents: collected.rows[0]?.collected_cents ?? '0' };
  }

  return {
    listChanges(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id,contract_id,subscription_id,applied_subscription_id,change_type,
                  requested_plan_code,effective_at,reason_code,status,requested_by,approved_by,
                  decided_by,decision_reason_code,decided_at,applied_at,version,created_at,updated_at
             FROM subscription_change_requests WHERE tenant_id=$1
              AND ($2::text IS NULL OR status=$2)
            ORDER BY created_at DESC,id LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => changeView(row));
      });
    },

    getChange(identity, rawChangeId) {
      const changeId = UuidSchema.parse(rawChangeId);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id,contract_id,subscription_id,applied_subscription_id,change_type,
                  requested_plan_code,effective_at,reason_code,status,requested_by,approved_by,
                  decided_by,decision_reason_code,decided_at,applied_at,version,created_at,updated_at
             FROM subscription_change_requests WHERE tenant_id=$1 AND id=$2`,
          [identity.tenantId, changeId],
        );
        if (!result.rows[0]) throw new SubscriptionLifecycleAuthorizationError();
        return changeView(result.rows[0]);
      });
    },

    requestChange(command) {
      const body = RequestChangeSchema.parse(command.body);
      return idempotent(command, 'subscription.change.request', body, async (client) => {
        let requestedPlanCode = body.requestedPlanCode ?? null;
        if (body.contractId) {
          const contract = await paidContract(client, command.identity.tenantId, body.contractId);
          if (requestedPlanCode && requestedPlanCode !== contract.plan_code)
            throw new SubscriptionLifecycleStateError();
          requestedPlanCode = contract.plan_code;
        }
        if (requestedPlanCode) {
          const plan = await client.query(`SELECT 1 FROM plans WHERE plan_code=$1 AND active`, [
            requestedPlanCode,
          ]);
          if (!plan.rows[0]) throw new SubscriptionLifecycleStateError();
        }
        if (body.changeType === 'ACTIVATE') {
          const live = await client.query(
            `SELECT id FROM tenant_subscriptions WHERE tenant_id=$1
              AND status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') FOR UPDATE`,
            [command.identity.tenantId],
          );
          if (live.rows[0]) throw new SubscriptionLifecycleStateError();
        } else {
          const subscription = await client.query(
            `SELECT id,plan_code,status FROM tenant_subscriptions
              WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
            [command.identity.tenantId, body.subscriptionId],
          );
          const current = subscription.rows[0];
          if (!current || ['CANCELLED', 'EXPIRED'].includes(current.status))
            throw new SubscriptionLifecycleStateError();
          if (body.changeType === 'RENEW' && current.plan_code !== requestedPlanCode)
            throw new SubscriptionLifecycleStateError();
          if (body.changeType === 'PLAN_CHANGE' && current.plan_code === requestedPlanCode)
            throw new SubscriptionLifecycleStateError();
        }
        const inserted = await client.query(
          `INSERT INTO subscription_change_requests(tenant_id,contract_id,subscription_id,
            change_type,requested_plan_code,effective_at,reason_code,requested_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id,contract_id,subscription_id,applied_subscription_id,change_type,
             requested_plan_code,effective_at,reason_code,status,requested_by,approved_by,
             decided_by,decision_reason_code,decided_at,applied_at,version,created_at,updated_at`,
          [
            command.identity.tenantId,
            body.contractId ?? null,
            body.subscriptionId ?? null,
            body.changeType,
            requestedPlanCode,
            body.effectiveAt,
            body.reasonCode,
            command.identity.userId,
          ],
        );
        const result = changeView(inserted.rows[0]);
        await audit(
          client,
          command.identity,
          command.traceId,
          'SUBSCRIPTION_CHANGE_REQUESTED',
          String(result.id),
          {
            changeType: body.changeType,
            requestedPlanCode,
            effectiveAt: body.effectiveAt,
          },
        );
        return result;
      });
    },

    decideChange(command) {
      const body = DecideSchema.parse(command.body);
      if (body.decision === 'REJECT' && !body.reasonCode)
        throw new SubscriptionLifecycleStateError();
      return idempotent(command, 'subscription.change.decide', body, async (client) => {
        const result = await client.query(
          `UPDATE subscription_change_requests SET status=$3,
                  approved_by=CASE WHEN $3='APPROVED' THEN $4::uuid ELSE NULL END,
                  decided_by=$4,decision_reason_code=$5,decided_at=now(),version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='PENDING' AND requested_by<>$4
            RETURNING id,contract_id,subscription_id,applied_subscription_id,change_type,
              requested_plan_code,effective_at,reason_code,status,requested_by,approved_by,
              decided_by,decision_reason_code,decided_at,applied_at,version,created_at,updated_at`,
          [
            command.identity.tenantId,
            body.changeId,
            body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            command.identity.userId,
            body.decision === 'REJECT' ? body.reasonCode : null,
          ],
        );
        if (!result.rows[0]) throw new SubscriptionLifecycleStateError();
        const response = changeView(result.rows[0]);
        await audit(
          client,
          command.identity,
          command.traceId,
          body.decision === 'APPROVE'
            ? 'SUBSCRIPTION_CHANGE_APPROVED'
            : 'SUBSCRIPTION_CHANGE_REJECTED',
          body.changeId,
          { decision: body.decision, reasonCode: body.reasonCode ?? null },
        );
        return response;
      });
    },

    applyApproved(input) {
      const tenantId = UuidSchema.parse(input.tenantId);
      const changeId = UuidSchema.parse(input.changeId);
      return transaction(tenantId, async (client) => {
        const selected = await client.query(
          `SELECT request.*,COALESCE(request.requested_plan_code,subscription.plan_code) AS plan_code,
                  plan.billing_period
             FROM subscription_change_requests request
             LEFT JOIN tenant_subscriptions subscription
               ON subscription.tenant_id=request.tenant_id AND subscription.id=request.subscription_id
             LEFT JOIN plans plan
               ON plan.plan_code=COALESCE(request.requested_plan_code,subscription.plan_code)
            WHERE request.tenant_id=$1 AND request.id=$2 FOR UPDATE OF request`,
          [tenantId, changeId],
        );
        const change = selected.rows[0];
        if (!change) throw new SubscriptionLifecycleAuthorizationError();
        if (change.status === 'APPLIED') return changeView(change);
        if (change.status !== 'APPROVED' || new Date(change.effective_at).getTime() > Date.now())
          throw new SubscriptionLifecycleStateError();
        let subscription;
        if (change.change_type === 'ACTIVATE') {
          const inserted = await client.query(
            `INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,starts_at,
              current_period_start,current_period_end,auto_renew)
             VALUES($1,$2,'ACTIVE',$3,$3,
               $3::timestamptz+CASE WHEN $4='YEAR' THEN interval '1 year' ELSE interval '1 month' END,
               true)
             RETURNING id,plan_code,status,current_period_start,current_period_end,version`,
            [tenantId, change.plan_code, change.effective_at, change.billing_period],
          );
          subscription = inserted.rows[0];
        } else if (change.change_type === 'RENEW') {
          const updated = await client.query(
            `UPDATE tenant_subscriptions SET status='ACTIVE',auto_renew=true,plan_code=$3,
              current_period_start=GREATEST(current_period_end,$4::timestamptz),
              current_period_end=GREATEST(current_period_end,$4::timestamptz)
                +CASE WHEN $5='YEAR' THEN interval '1 year' ELSE interval '1 month' END,
              version=version+1,updated_at=now()
             WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('CANCELLED','EXPIRED')
             RETURNING id,plan_code,status,current_period_start,current_period_end,version`,
            [
              tenantId,
              change.subscription_id,
              change.plan_code,
              change.effective_at,
              change.billing_period,
            ],
          );
          subscription = updated.rows[0];
        } else if (change.change_type === 'PLAN_CHANGE') {
          const updated = await client.query(
            `UPDATE tenant_subscriptions SET status='ACTIVE',plan_code=$3,
              current_period_start=$4,current_period_end=$4::timestamptz
                +CASE WHEN $5='YEAR' THEN interval '1 year' ELSE interval '1 month' END,
              version=version+1,updated_at=now()
             WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('CANCELLED','EXPIRED')
             RETURNING id,plan_code,status,current_period_start,current_period_end,version`,
            [
              tenantId,
              change.subscription_id,
              change.plan_code,
              change.effective_at,
              change.billing_period,
            ],
          );
          subscription = updated.rows[0];
        } else {
          const updated = await client.query(
            `UPDATE tenant_subscriptions SET status='CANCELLED',auto_renew=false,
              version=version+1,updated_at=now()
             WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('CANCELLED','EXPIRED')
             RETURNING id,plan_code,status,current_period_start,current_period_end,version`,
            [tenantId, change.subscription_id],
          );
          subscription = updated.rows[0];
        }
        if (!subscription) throw new SubscriptionLifecycleStateError();
        const applied = await client.query(
          `UPDATE subscription_change_requests SET status='APPLIED',applied_subscription_id=$3,
                  applied_at=now(),version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='APPROVED'
            RETURNING id,contract_id,subscription_id,applied_subscription_id,change_type,
              requested_plan_code,effective_at,reason_code,status,requested_by,approved_by,
              decided_by,decision_reason_code,decided_at,applied_at,version,created_at,updated_at`,
          [tenantId, changeId, subscription.id],
        );
        if (change.change_type !== 'CANCEL') {
          await client.query(
            `INSERT INTO outbox_events(tenant_id,event_name,event_version,aggregate_type,
              aggregate_id,aggregate_version,partition_key,payload,trace_id,occurred_at)
             VALUES($1,'tenant.subscription_activated.v1',1,'subscription',$2,$3,
               'subscription:'||($2::uuid)::text,$4::jsonb,$5,now())`,
            [
              tenantId,
              subscription.id,
              subscription.version,
              JSON.stringify({
                subscription_id: subscription.id,
                plan_code: subscription.plan_code,
                period_start: iso(subscription.current_period_start),
                period_end: iso(subscription.current_period_end),
              }),
              input.traceId,
            ],
          );
        }
        await client.query(
          `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
            result_code,after_redacted,trace_id)
           VALUES($1,'SYSTEM','subscription-lifecycle','SUBSCRIPTION_CHANGE_APPLIED',
            'subscription_change_request',$2,'SUCCESS',$3::jsonb,$4)`,
          [
            tenantId,
            changeId,
            JSON.stringify({
              changeType: change.change_type,
              subscriptionId: subscription.id,
              status: subscription.status,
            }),
            input.traceId,
          ],
        );
        return changeView(applied.rows[0]);
      });
    },

    listPreviews(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id,subscription_id,report_month,metrics_snapshot,issue_snapshot,
                  recommended_plan_code,recommendation_reason,status,due_at,generated_at,updated_at
             FROM renewal_previews WHERE tenant_id=$1
              AND ($2::text IS NULL OR status=$2)
            ORDER BY due_at,id LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => previewView(row));
      });
    },

    getPreview(identity, rawPreviewId) {
      const previewId = UuidSchema.parse(rawPreviewId);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id,subscription_id,report_month,metrics_snapshot,issue_snapshot,
                  recommended_plan_code,recommendation_reason,status,due_at,generated_at,updated_at
             FROM renewal_previews WHERE tenant_id=$1 AND id=$2`,
          [identity.tenantId, previewId],
        );
        if (!result.rows[0]) throw new SubscriptionLifecycleAuthorizationError();
        return previewView(result.rows[0]);
      });
    },

    generatePreview(command) {
      const body = PreviewGenerationSchema.parse(command.body);
      return idempotent(command, 'subscription.renewal-preview.generate', body, async (client) => {
        const source = await client.query(
          `SELECT subscription.id,subscription.plan_code,subscription.current_period_end,
                  report.report_month,report.status AS report_status,
                  COALESCE(jsonb_object_agg(metric.metric_code,metric.metric_value)
                    FILTER(WHERE metric.metric_code IS NOT NULL),'{}'::jsonb) AS metrics
             FROM tenant_subscriptions subscription
             JOIN monthly_value_reports report ON report.tenant_id=subscription.tenant_id
               AND report.report_month=$3::date AND report.store_id IS NULL
             LEFT JOIN monthly_value_report_metrics metric
               ON metric.tenant_id=report.tenant_id AND metric.report_id=report.id
            WHERE subscription.tenant_id=$1 AND subscription.id=$2
              AND subscription.status IN ('ACTIVE','PAST_DUE','SUSPENDED')
            GROUP BY subscription.id,report.report_month,report.status`,
          [command.identity.tenantId, body.subscriptionId, body.reportMonth],
        );
        const row = source.rows[0];
        if (!row || row.report_status !== 'READY') throw new SubscriptionLifecycleStateError();
        const issues = Object.entries(row.metrics as Record<string, string | number>)
          .filter(([, value]) => Number(value) === 0)
          .map(([metricCode]) => ({ metricCode, reasonCode: 'NO_RECORDED_ACTIVITY' }));
        const inserted = await client.query(
          `INSERT INTO renewal_previews(tenant_id,subscription_id,report_month,
            metrics_snapshot,issue_snapshot,recommended_plan_code,recommendation_reason,due_at)
           VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,'CONTINUE_CURRENT_PLAN',$7)
           ON CONFLICT(tenant_id,subscription_id,report_month) DO NOTHING
           RETURNING id,subscription_id,report_month,metrics_snapshot,issue_snapshot,
             recommended_plan_code,recommendation_reason,status,due_at,generated_at,updated_at`,
          [
            command.identity.tenantId,
            body.subscriptionId,
            body.reportMonth,
            JSON.stringify(row.metrics),
            JSON.stringify(issues),
            row.plan_code,
            row.current_period_end,
          ],
        );
        const result =
          inserted.rows[0] ??
          (
            await client.query(
              `SELECT id,subscription_id,report_month,metrics_snapshot,issue_snapshot,
                      recommended_plan_code,recommendation_reason,status,due_at,generated_at,updated_at
                 FROM renewal_previews
                WHERE tenant_id=$1 AND subscription_id=$2 AND report_month=$3::date`,
              [command.identity.tenantId, body.subscriptionId, body.reportMonth],
            )
          ).rows[0];
        return previewView(result);
      });
    },

    updatePreviewStatus(command) {
      const body = PreviewStatusSchema.parse(command.body);
      return idempotent(command, 'subscription.renewal-preview.status', body, async (client) => {
        const result = await client.query(
          `UPDATE renewal_previews SET status=$3
            WHERE tenant_id=$1 AND id=$2 AND status IN ('READY','CONTACTED')
            RETURNING id,subscription_id,report_month,metrics_snapshot,issue_snapshot,
              recommended_plan_code,recommendation_reason,status,due_at,generated_at,updated_at`,
          [command.identity.tenantId, body.previewId, body.status],
        );
        if (!result.rows[0]) throw new SubscriptionLifecycleStateError();
        return previewView(result.rows[0]);
      });
    },
  };
}
