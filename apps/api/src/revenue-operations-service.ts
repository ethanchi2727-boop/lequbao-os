import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { IntakeObjectStore } from './intake-object-store.js';
import type { SessionIdentity } from './session-identity.js';

const ListSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const PeriodSchema = ListSchema.extend({
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  sourceType: z.enum(['SUBSCRIPTION', 'COMPUTE_PACK']).optional(),
});
const DisputeListSchema = ListSchema.extend({
  statementId: UuidSchema.optional(),
});
const CreateDisputeSchema = z
  .object({
    statementId: UuidSchema,
    costEntryId: UuidSchema.optional(),
    disputeType: z.enum(['COST', 'REVENUE']),
    reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/u),
    description: z.string().trim().min(1).max(2000),
  })
  .superRefine((input, context) => {
    if ((input.disputeType === 'COST') !== Boolean(input.costEntryId))
      context.addIssue({
        code: 'custom',
        message: 'costEntryId is required only for COST disputes',
      });
  });
type Identity = SessionIdentity & Partial<AuthorizationContext>;
type DisputeCommand = {
  identity: Identity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export class RevenueOperationsAuthorizationError extends Error {}
export class RevenueOperationsConflictError extends Error {}

export interface RevenueOperationsService {
  getSubscription(identity: Identity): Promise<unknown>;
  listPlans(identity: Identity): Promise<unknown[]>;
  listUsage(identity: Identity, query: unknown): Promise<unknown[]>;
  getSummary(identity: Identity, query: unknown): Promise<unknown>;
  listStatements(identity: Identity, query: unknown): Promise<unknown[]>;
  getStatement(identity: Identity, statementId: string): Promise<unknown>;
  listRights(identity: Identity, query: unknown): Promise<unknown[]>;
  listPolicies(identity: Identity, query: unknown): Promise<unknown[]>;
  listCosts(identity: Identity, query: unknown): Promise<unknown>;
  getCostEvidence(identity: Identity, costEntryId: string, traceId: string): Promise<unknown>;
  listDisputes(identity: Identity, query: unknown): Promise<unknown[]>;
  createDispute(command: DisputeCommand): Promise<unknown>;
  listTransfers(identity: Identity, query: unknown): Promise<unknown[]>;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

function tenantWide(identity: Identity) {
  if (!identity.accessScopes?.some((scope) => ['TENANT', 'ALL', 'DUAL'].includes(scope)))
    throw new RevenueOperationsAuthorizationError();
}

const isTenantWide = (identity: Identity) =>
  Boolean(identity.accessScopes?.some((scope) => ['TENANT', 'ALL', 'DUAL'].includes(scope)));

async function assertStatementAccess(
  client: pg.PoolClient,
  identity: Identity,
  statementId: string,
) {
  const result = await client.query(
    `SELECT 1 FROM revenue_distribution_statements statement
      WHERE statement.tenant_id=$1 AND statement.id=$2
        AND ($3::boolean OR EXISTS (
          SELECT 1 FROM revenue_distribution_allocations allocation
          JOIN revenue_beneficiaries beneficiary ON beneficiary.id=allocation.beneficiary_id
          WHERE allocation.tenant_id=statement.tenant_id
            AND allocation.statement_id=statement.id AND beneficiary.user_id=$4
        )) LIMIT 1`,
    [identity.tenantId, statementId, isTenantWide(identity), identity.userId],
  );
  if (result.rowCount !== 1) throw new RevenueOperationsAuthorizationError();
}

export function createRevenueOperationsService(
  pool: Pick<pg.Pool, 'connect'>,
  evidenceGateway?: Pick<IntakeObjectStore, 'authorizeGet'>,
): RevenueOperationsService {
  async function transaction<T>(
    identity: Identity,
    work: (client: pg.PoolClient) => Promise<T>,
    requireTenantWide = true,
  ) {
    if (requireTenantWide) tenantWide(identity);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
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

  return {
    getSubscription(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT subscription.id,subscription.plan_code,plan.plan_name,plan.billing_period,
                  plan.list_price_cents,COALESCE(snapshot.entitlements,plan.entitlements) AS entitlements,
                  subscription.status,
                  subscription.starts_at,subscription.current_period_start,
                  subscription.current_period_end,subscription.minimum_term_end,
                  subscription.auto_renew,subscription.version,subscription.updated_at
             FROM tenant_subscriptions subscription
             JOIN plans plan ON plan.plan_code=subscription.plan_code
             LEFT JOIN tenant_entitlement_snapshots snapshot
               ON snapshot.tenant_id=subscription.tenant_id
              AND snapshot.subscription_id=subscription.id
              AND snapshot.subscription_version=subscription.version
            WHERE subscription.tenant_id=$1
            ORDER BY subscription.created_at DESC LIMIT 1`,
          [identity.tenantId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
          id: row.id,
          planCode: row.plan_code,
          planName: row.plan_name,
          billingPeriod: row.billing_period,
          listPriceCents: Number(row.list_price_cents),
          entitlements: row.entitlements,
          status: row.status,
          startsAt: iso(row.starts_at),
          currentPeriodStart: iso(row.current_period_start),
          currentPeriodEnd: iso(row.current_period_end),
          minimumTermEnd: iso(row.minimum_term_end),
          autoRenew: row.auto_renew,
          version: Number(row.version),
          updatedAt: iso(row.updated_at),
        };
      });
    },

    listPlans(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT plan_code,plan_name,billing_period,list_price_cents,entitlements,created_at
             FROM plans WHERE active ORDER BY list_price_cents,plan_code`,
        );
        return result.rows.map((row) => ({
          planCode: row.plan_code,
          planName: row.plan_name,
          billingPeriod: row.billing_period,
          listPriceCents: Number(row.list_price_cents),
          entitlements: row.entitlements,
          createdAt: iso(row.created_at),
        }));
      });
    },

    listUsage(identity, rawQuery) {
      const query = PeriodSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT meter_code,period_start,period_end,quantity::text,soft_limit::text,
                  hard_limit::text,cost_cents,updated_at
             FROM usage_meters WHERE tenant_id=$1
              AND ($2::date IS NULL OR period_end >= $2)
              AND ($3::date IS NULL OR period_start <= $3)
            ORDER BY period_start DESC,meter_code LIMIT $4`,
          [identity.tenantId, query.periodStart ?? null, query.periodEnd ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          meterCode: row.meter_code,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          quantity: row.quantity,
          softLimit: row.soft_limit,
          hardLimit: row.hard_limit,
          costCents: Number(row.cost_cents),
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    getSummary(identity, rawQuery) {
      const query = PeriodSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT COALESCE(sum(actual_receipt_cents),0)::text AS receipts,
                  COALESCE(sum(refund_cents),0)::text AS refunds,
                  COALESCE(sum(direct_cost_cents),0)::text AS costs,
                  COALESCE(sum(distributable_cents),0)::text AS distributable,
                  count(*)::int AS statement_count,
                  count(*) FILTER(WHERE status IN('WAITING_COST','REVIEW'))::int AS attention_count
             FROM revenue_distribution_statements WHERE tenant_id=$1
              AND ($2::date IS NULL OR period_end >= $2)
              AND ($3::date IS NULL OR period_start <= $3)
              AND ($4::text IS NULL OR source_type=$4)`,
          [
            identity.tenantId,
            query.periodStart ?? null,
            query.periodEnd ?? null,
            query.sourceType ?? null,
          ],
        );
        const row = result.rows[0];
        return {
          receiptCents: Number(row.receipts),
          refundCents: Number(row.refunds),
          directCostCents: Number(row.costs),
          distributableCents: Number(row.distributable),
          statementCount: Number(row.statement_count),
          attentionCount: Number(row.attention_count),
        };
      });
    },

    listStatements(identity, rawQuery) {
      const query = PeriodSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,source_type,source_id,subscription_id,policy_id,period_start,period_end,
                  actual_receipt_cents,refund_cents,direct_cost_cents,distributable_cents,
                  status,locked_by,locked_at,version,created_at,updated_at
             FROM revenue_distribution_statements WHERE tenant_id=$1
              AND ($2::text IS NULL OR status=$2)
              AND ($3::date IS NULL OR period_end >= $3)
              AND ($4::date IS NULL OR period_start <= $4)
              AND ($5::text IS NULL OR source_type=$5)
            ORDER BY period_end DESC,id LIMIT $6`,
          [
            identity.tenantId,
            query.status ?? null,
            query.periodStart ?? null,
            query.periodEnd ?? null,
            query.sourceType ?? null,
            query.limit,
          ],
        );
        return result.rows.map(mapStatement);
      });
    },

    getStatement(identity, rawStatementId) {
      const statementId = UuidSchema.parse(rawStatementId);
      return transaction(identity, async (client) => {
        const statement = await client.query(
          `SELECT id,source_type,source_id,subscription_id,policy_id,period_start,period_end,
                  actual_receipt_cents,refund_cents,direct_cost_cents,distributable_cents,
                  status,locked_by,locked_at,version,created_at,updated_at
             FROM revenue_distribution_statements WHERE tenant_id=$1 AND id=$2`,
          [identity.tenantId, statementId],
        );
        if (!statement.rows[0]) throw new RevenueOperationsAuthorizationError();
        const [allocations, entries, approvals] = await Promise.all([
          client.query(
            `SELECT id,beneficiary_role,share_bps,allocated_cents,status,right_holder_id,
                    created_at,updated_at FROM revenue_distribution_allocations
              WHERE tenant_id=$1 AND statement_id=$2 ORDER BY beneficiary_role,id`,
            [identity.tenantId, statementId],
          ),
          client.query(
            `SELECT entry.id,entry.allocation_id,entry.entry_type,entry.amount_cents,entry.currency,
                    entry.reason_code,entry.original_entry_id,entry.created_at
               FROM revenue_distribution_entries entry
               JOIN revenue_distribution_allocations allocation
                 ON allocation.tenant_id=entry.tenant_id AND allocation.id=entry.allocation_id
              WHERE entry.tenant_id=$1 AND allocation.statement_id=$2
              ORDER BY entry.created_at,entry.id`,
            [identity.tenantId, statementId],
          ),
          client.query(
            `SELECT id,action_type,reason_code,status,requested_by,approved_by,requested_at,
                    expires_at,approved_at,consumed_at,version
               FROM revenue_distribution_action_approvals
              WHERE tenant_id=$1 AND statement_id=$2 ORDER BY requested_at DESC,id`,
            [identity.tenantId, statementId],
          ),
        ]);
        return {
          ...mapStatement(statement.rows[0]),
          allocations: allocations.rows,
          entries: entries.rows,
          approvals: approvals.rows,
        };
      });
    },

    listRights(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT rights.id,rights.merchant_profile_id,rights.right_type,rights.status,
                  rights.starts_at,rights.ended_at,rights.end_reason,rights.version,
                  COALESCE(jsonb_agg(jsonb_build_object('holderId',holder.id,
                    'beneficiaryId',holder.beneficiary_id,'shareBps',holder.share_bps,
                    'status',holder.status,'startsAt',holder.starts_at,'endedAt',holder.ended_at)
                    ORDER BY holder.created_at) FILTER(WHERE holder.id IS NOT NULL),'[]'::jsonb) AS holders
             FROM merchant_revenue_right_groups rights
             LEFT JOIN merchant_revenue_right_holders holder
               ON holder.tenant_id=rights.tenant_id AND holder.right_group_id=rights.id
            WHERE rights.tenant_id=$1 AND ($2::text IS NULL OR rights.status=$2)
            GROUP BY rights.id ORDER BY rights.created_at DESC,rights.id LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows;
      });
    },

    listPolicies(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT policy.id,policy.policy_type,policy.policy_version,policy.cost_basis,
                  policy.status,policy.effective_from,policy.effective_to,policy.approved_at,
                  COALESCE(jsonb_agg(jsonb_build_object('beneficiaryRole',split.beneficiary_role,
                    'shareBps',split.share_bps) ORDER BY split.beneficiary_role)
                    FILTER(WHERE split.id IS NOT NULL),'[]'::jsonb) AS splits
             FROM revenue_share_policies policy
             LEFT JOIN revenue_share_policy_splits split
               ON split.tenant_id=policy.tenant_id AND split.policy_id=policy.id
            WHERE policy.tenant_id=$1 AND ($2::text IS NULL OR policy.status=$2)
            GROUP BY policy.id ORDER BY policy.policy_type,policy.policy_version DESC LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows;
      });
    },

    listCosts(identity, rawQuery) {
      const query = PeriodSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const [catalog, entries] = await Promise.all([
          client.query(
            `SELECT cost_code,cost_name,deductible,allocation_method,description
               FROM direct_cost_catalog WHERE active ORDER BY cost_code`,
          ),
          client.query(
            `SELECT id,subscription_id,source_type,source_id,service_period_start,
                    service_period_end,cost_code,quantity::text,unit_cost_cents::text,
                    amount_cents,cost_status,supplier_ref,(evidence_object_key IS NOT NULL) AS has_evidence,
                    reversal_of,created_at
               FROM direct_cost_entries WHERE tenant_id=$1
                AND ($2::text IS NULL OR cost_status=$2)
                AND ($3::date IS NULL OR service_period_end >= $3)
                AND ($4::date IS NULL OR service_period_start <= $4)
              ORDER BY service_period_end DESC,id LIMIT $5`,
            [
              identity.tenantId,
              query.status ?? null,
              query.periodStart ?? null,
              query.periodEnd ?? null,
              query.limit,
            ],
          ),
        ]);
        return { catalog: catalog.rows, entries: entries.rows };
      });
    },

    getCostEvidence(identity, rawCostEntryId, traceId) {
      const costEntryId = UuidSchema.parse(rawCostEntryId);
      return transaction(
        identity,
        async (client) => {
          const result = await client.query<Record<string, unknown>>(
            `SELECT cost.id,cost.cost_code,cost.amount_cents,cost.service_period_start,
                    cost.service_period_end,cost.supplier_ref,cost.evidence_object_key
               FROM direct_cost_entries cost
              WHERE cost.tenant_id=$1 AND cost.id=$2 AND cost.evidence_object_key IS NOT NULL
                AND ($3::boolean OR EXISTS (
                  SELECT 1 FROM revenue_distribution_statements statement
                  JOIN revenue_distribution_allocations allocation
                    ON allocation.tenant_id=statement.tenant_id
                   AND allocation.statement_id=statement.id
                  JOIN revenue_beneficiaries beneficiary ON beneficiary.id=allocation.beneficiary_id
                  WHERE statement.tenant_id=cost.tenant_id
                    AND statement.source_type=cost.source_type AND statement.source_id=cost.source_id
                    AND beneficiary.user_id=$4
                )) LIMIT 1`,
            [identity.tenantId, costEntryId, isTenantWide(identity), identity.userId],
          );
          const row = result.rows[0];
          if (!row || !evidenceGateway) throw new RevenueOperationsAuthorizationError();
          const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
          const authorization = evidenceGateway.authorizeGet({
            objectKey: String(row.evidence_object_key),
            maxBytes: 20_971_520,
            expiresAt,
          });
          await client.query(
            `INSERT INTO audit_logs(
               tenant_id,actor_type,actor_id,action,resource_type,resource_id,
               permission_code,result_code,after_redacted,trace_id
             ) VALUES ($1,'USER',$2,'distribution.cost_evidence.read','direct_cost_entry',$3,
                       'distribution.cost.read','SUCCESS',$4::jsonb,$5)`,
            [
              identity.tenantId,
              identity.userId,
              costEntryId,
              JSON.stringify({ expiresAt: authorization.expiresAt, maxBytes: 20_971_520 }),
              traceId,
            ],
          );
          return {
            id: row.id,
            costCode: row.cost_code,
            amountCents: Number(row.amount_cents),
            servicePeriodStart: row.service_period_start,
            servicePeriodEnd: row.service_period_end,
            supplierRef: row.supplier_ref,
            ...authorization,
          };
        },
        false,
      );
    },

    listDisputes(identity, rawQuery) {
      const query = DisputeListSchema.parse(rawQuery);
      return transaction(
        identity,
        async (client) => {
          const result = await client.query(
            `SELECT dispute.id,dispute.statement_id,dispute.cost_entry_id,dispute.dispute_type,
                    dispute.reason_code,dispute.description,dispute.status,dispute.requested_by,
                    dispute.resolved_by,dispute.resolution_code,dispute.resolution_note,
                    dispute.created_at,dispute.updated_at,dispute.resolved_at
               FROM revenue_distribution_disputes dispute
              WHERE dispute.tenant_id=$1
                AND ($2::text IS NULL OR dispute.status=$2)
                AND ($3::uuid IS NULL OR dispute.statement_id=$3)
                AND ($4::boolean OR dispute.requested_by=$5)
              ORDER BY dispute.created_at DESC,dispute.id LIMIT $6`,
            [
              identity.tenantId,
              query.status ?? null,
              query.statementId ?? null,
              isTenantWide(identity),
              identity.userId,
              query.limit,
            ],
          );
          return result.rows.map(mapDispute);
        },
        false,
      );
    },

    createDispute(command) {
      const input = CreateDisputeSchema.parse(command.body);
      const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      return transaction(
        command.identity,
        async (client) => {
          await assertStatementAccess(client, command.identity, input.statementId);
          if (input.costEntryId) {
            const cost = await client.query(
              `SELECT 1 FROM direct_cost_entries cost
                JOIN revenue_distribution_statements statement
                  ON statement.tenant_id=cost.tenant_id
                 AND statement.source_type=cost.source_type AND statement.source_id=cost.source_id
               WHERE cost.tenant_id=$1 AND cost.id=$2 AND statement.id=$3
                 AND cost.service_period_start<=statement.period_end
                 AND cost.service_period_end>=statement.period_start LIMIT 1`,
              [command.identity.tenantId, input.costEntryId, input.statementId],
            );
            if (cost.rowCount !== 1) throw new RevenueOperationsAuthorizationError();
          }
          const existing = await client.query<Record<string, unknown>>(
            `SELECT * FROM revenue_distribution_disputes
              WHERE tenant_id=$1 AND requested_by=$2 AND idempotency_key=$3 FOR UPDATE`,
            [command.identity.tenantId, command.identity.userId, command.idempotencyKey],
          );
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash)
              throw new RevenueOperationsConflictError();
            return mapDispute(existing.rows[0]);
          }
          const inserted = await client.query<Record<string, unknown>>(
            `INSERT INTO revenue_distribution_disputes(
               tenant_id,statement_id,cost_entry_id,dispute_type,reason_code,description,
               requested_by,idempotency_key,request_hash
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              command.identity.tenantId,
              input.statementId,
              input.costEntryId ?? null,
              input.disputeType,
              input.reasonCode,
              input.description,
              command.identity.userId,
              command.idempotencyKey,
              requestHash,
            ],
          );
          const dispute = inserted.rows[0]!;
          await client.query(
            `INSERT INTO audit_logs(
               tenant_id,actor_type,actor_id,action,resource_type,resource_id,
               permission_code,result_code,after_redacted,trace_id
             ) VALUES ($1,'USER',$2,'distribution.dispute.submit','revenue_distribution_dispute',$3,
                       'distribution.cost.read','SUCCESS',$4::jsonb,$5)`,
            [
              command.identity.tenantId,
              command.identity.userId,
              dispute.id,
              JSON.stringify({
                statementId: input.statementId,
                disputeType: input.disputeType,
                reasonCode: input.reasonCode,
                hasCostEntry: Boolean(input.costEntryId),
              }),
              command.traceId,
            ],
          );
          return mapDispute(dispute);
        },
        false,
      );
    },

    listTransfers(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,right_holder_id,from_beneficiary_id,to_beneficiary_id,status,
                  requested_by,approved_by,effective_at,created_at,updated_at,
                  (agreement_object_key IS NOT NULL) AS has_agreement
             FROM revenue_right_transfers WHERE tenant_id=$1
              AND ($2::text IS NULL OR status=$2)
            ORDER BY created_at DESC,id LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows;
      });
    },
  };
}

function mapStatement(row: Record<string, unknown>) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    subscriptionId: row.subscription_id,
    policyId: row.policy_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    actualReceiptCents: Number(row.actual_receipt_cents),
    refundCents: Number(row.refund_cents),
    directCostCents: Number(row.direct_cost_cents),
    distributableCents: Number(row.distributable_cents),
    status: row.status,
    lockedBy: row.locked_by,
    lockedAt: iso(row.locked_at as Date | string | null),
    version: Number(row.version),
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  };
}

function mapDispute(row: Record<string, unknown>) {
  return {
    id: row.id,
    statementId: row.statement_id,
    costEntryId: row.cost_entry_id,
    disputeType: row.dispute_type,
    reasonCode: row.reason_code,
    description: row.description,
    status: row.status,
    requestedBy: row.requested_by,
    resolvedBy: row.resolved_by,
    resolutionCode: row.resolution_code,
    resolutionNote: row.resolution_note,
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
    resolvedAt: iso(row.resolved_at as Date | string | null),
  };
}
