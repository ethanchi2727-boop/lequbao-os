import { createHash } from 'node:crypto';
import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import {
  allocateExactly,
  assertLockableAndReconciled,
  calculateStatement,
  type AllocationParticipant,
} from './revenue-distribution.js';
import { IdempotencyConflictError } from './revenue-right-service.js';

const LockDistributionInputSchema = z
  .object({
    subscriptionId: UuidSchema,
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    lockedBy: UuidSchema,
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    path: ['periodEnd'],
    message: 'period end must not precede period start',
  });

const LockedDistributionResponseSchema = z.object({
  id: UuidSchema,
  status: z.literal('LOCKED'),
  policyVersion: z.int().positive(),
  actualReceiptMinorUnits: z.string(),
  refundMinorUnits: z.string(),
  directCostMinorUnits: z.string(),
  distributableMinorUnits: z.string(),
  allocations: z.array(
    z.object({
      beneficiaryId: UuidSchema,
      beneficiaryRole: z.enum(['ORIGINATING_BUSINESS', 'SHANGZHI', 'LEQU_LIFE']),
      shareBps: z.int().positive(),
      allocatedMinorUnits: z.string(),
    }),
  ),
});

export type LockedDistributionResponse = z.infer<typeof LockedDistributionResponseSchema>;

export class DistributionSourceError extends Error {}
export class DistributionConfigurationError extends Error {}
export class ProvisionalCostError extends Error {}

export interface LockDistributionCommand {
  tenantId: string;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface DistributionLockService {
  lock(command: LockDistributionCommand): Promise<LockedDistributionResponse>;
}

interface AllocationTarget extends AllocationParticipant {
  beneficiaryId: string;
  beneficiaryRole: 'ORIGINATING_BUSINESS' | 'SHANGZHI' | 'LEQU_LIFE';
  rightHolderId?: string;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createDistributionLockService(
  pool: Pick<pg.Pool, 'connect'>,
): DistributionLockService {
  return {
    async lock(command: LockDistributionCommand): Promise<LockedDistributionResponse> {
      const tenantId = TenantIdSchema.parse(command.tenantId);
      const input = LockDistributionInputSchema.parse(command.body);
      const requestHash = hash(input);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const reservation = await client.query(
          `INSERT INTO idempotency_keys(tenant_id, scope, idempotency_key, request_hash, expires_at)
           VALUES ($1, 'distribution.lock', $2, $3, now() + interval '24 hours')
           ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING RETURNING id`,
          [tenantId, command.idempotencyKey, requestHash],
        );
        if (reservation.rowCount === 0) {
          const existing = await client.query<{ request_hash: string; response_body: unknown }>(
            `SELECT request_hash, response_body FROM idempotency_keys
              WHERE tenant_id = $1 AND scope = 'distribution.lock' AND idempotency_key = $2 FOR UPDATE`,
            [tenantId, command.idempotencyKey],
          );
          const replay = existing.rows[0];
          if (!replay || replay.request_hash !== requestHash) throw new IdempotencyConflictError();
          const response = LockedDistributionResponseSchema.parse(replay.response_body);
          await client.query('COMMIT');
          return response;
        }

        const subscription = await client.query<{ id: string }>(
          `SELECT id FROM tenant_subscriptions
            WHERE tenant_id = $1 AND id = $2 AND status IN ('ACTIVE','PAST_DUE','SUSPENDED') FOR SHARE`,
          [tenantId, input.subscriptionId],
        );
        if (subscription.rowCount !== 1)
          throw new DistributionSourceError('subscription unavailable');

        const cash = await client.query<{ receipt_cents: string; refund_cents: string }>(
          `SELECT
             COALESCE(sum(amount_cents) FILTER (WHERE bucket = 'RECEIPT'), 0)::text AS receipt_cents,
             COALESCE(sum(amount_cents) FILTER (WHERE bucket = 'REFUND'), 0)::text AS refund_cents
           FROM subscription_cash_ledger_entries
          WHERE tenant_id = $1 AND subscription_id = $2
            AND occurred_at >= $3::date AND occurred_at < ($4::date + interval '1 day')`,
          [tenantId, input.subscriptionId, input.periodStart, input.periodEnd],
        );
        const actualReceipt = BigInt(cash.rows[0]!.receipt_cents);
        const refunds = BigInt(cash.rows[0]!.refund_cents);
        if (actualReceipt < 0n || refunds < 0n)
          throw new DistributionSourceError('cash corrections exceed confirmations');

        const costs = await client.query<{ total_cents: string; has_provisional: boolean }>(
          `SELECT
             COALESCE(sum(amount_cents) FILTER (WHERE cost_status <> 'REVERSED'), 0)::text AS total_cents,
             COALESCE(bool_or(cost_status = 'PROVISIONAL'), false) AS has_provisional
           FROM direct_cost_entries
          WHERE tenant_id = $1 AND subscription_id = $2
            AND service_period_start <= $4::date AND service_period_end >= $3::date`,
          [tenantId, input.subscriptionId, input.periodStart, input.periodEnd],
        );
        if (costs.rows[0]!.has_provisional) throw new ProvisionalCostError();
        const statement = calculateStatement({
          actualReceiptMinorUnits: actualReceipt,
          refundMinorUnits: refunds,
          directCosts: [{ amountMinorUnits: BigInt(costs.rows[0]!.total_cents), status: 'ACTUAL' }],
        });

        const policies = await client.query<{ id: string; policy_version: number }>(
          `SELECT id, policy_version FROM revenue_share_policies
            WHERE tenant_id = $1 AND policy_type = 'SUBSCRIPTION' AND status = 'ACTIVE'
              AND effective_from::date <= $3::date
              AND (effective_to IS NULL OR effective_to::date >= $2::date)
            ORDER BY policy_version DESC LIMIT 2`,
          [tenantId, input.periodStart, input.periodEnd],
        );
        if (policies.rows.length !== 1)
          throw new DistributionConfigurationError('active policy must be unambiguous');
        const policy = policies.rows[0]!;
        const splits = await client.query<{ beneficiary_role: string; share_bps: number }>(
          `SELECT beneficiary_role, share_bps FROM revenue_share_policy_splits
            WHERE tenant_id = $1 AND policy_id = $2`,
          [tenantId, policy.id],
        );
        const splitMap = new Map(
          splits.rows.map((split) => [split.beneficiary_role, split.share_bps]),
        );
        if (
          splitMap.get('ORIGINATING_BUSINESS') !== 7000 ||
          splitMap.get('SHANGZHI') !== 1000 ||
          splitMap.get('LEQU_LIFE') !== 2000 ||
          splits.rows.length !== 3
        ) {
          throw new DistributionConfigurationError('subscription policy is not frozen 70/10/20');
        }

        const holders = await client.query<{
          right_holder_id: string;
          beneficiary_id: string;
          share_bps: number;
        }>(
          `SELECT holder.id AS right_holder_id, holder.beneficiary_id, holder.share_bps
             FROM merchant_profiles merchant
             JOIN merchant_revenue_right_groups rights
               ON rights.tenant_id = merchant.tenant_id AND rights.merchant_profile_id = merchant.id
             JOIN merchant_revenue_right_holders holder
               ON holder.tenant_id = rights.tenant_id AND holder.right_group_id = rights.id
            WHERE merchant.tenant_id = $1 AND rights.status = 'ACTIVE' AND holder.status = 'ACTIVE'
              AND rights.starts_at < ($2::date + interval '1 day')
              AND (rights.ended_at IS NULL OR rights.ended_at >= $3::date)`,
          [tenantId, input.periodEnd, input.periodStart],
        );
        if (holders.rows.reduce((sum, holder) => sum + holder.share_bps, 0) !== 7000) {
          throw new DistributionConfigurationError('active business right must total 7000 bps');
        }
        const platform = await client.query<{ id: string; beneficiary_type: string }>(
          `SELECT id, beneficiary_type FROM revenue_beneficiaries
            WHERE status = 'ACTIVE' AND beneficiary_type IN ('SHANGZHI_ENTITY','LEQU_LIFE_ENTITY')`,
        );
        if (platform.rows.length !== 2)
          throw new DistributionConfigurationError('platform beneficiaries must be unique');
        const platformMap = new Map(
          platform.rows.map((beneficiary) => [beneficiary.beneficiary_type, beneficiary.id]),
        );
        if (!platformMap.has('SHANGZHI_ENTITY') || !platformMap.has('LEQU_LIFE_ENTITY')) {
          throw new DistributionConfigurationError('both platform beneficiary types are required');
        }

        const targets: AllocationTarget[] = [
          ...holders.rows.map((holder) => ({
            key: `business:${holder.beneficiary_id}`,
            beneficiaryId: holder.beneficiary_id,
            beneficiaryRole: 'ORIGINATING_BUSINESS' as const,
            rightHolderId: holder.right_holder_id,
            shareBps: holder.share_bps,
          })),
          {
            key: `platform:${platformMap.get('SHANGZHI_ENTITY')!}`,
            beneficiaryId: platformMap.get('SHANGZHI_ENTITY')!,
            beneficiaryRole: 'SHANGZHI',
            shareBps: 1000,
          },
          {
            key: `platform:${platformMap.get('LEQU_LIFE_ENTITY')!}`,
            beneficiaryId: platformMap.get('LEQU_LIFE_ENTITY')!,
            beneficiaryRole: 'LEQU_LIFE',
            shareBps: 2000,
          },
        ];
        const exact = allocateExactly(
          statement.distributableMinorUnits,
          targets,
          `platform:${platformMap.get('LEQU_LIFE_ENTITY')!}`,
        );
        assertLockableAndReconciled(statement, exact);

        const insertedStatement = await client.query<{ id: string }>(
          `INSERT INTO revenue_distribution_statements(
             tenant_id, source_type, source_id, subscription_id, policy_id, period_start, period_end,
             actual_receipt_cents, refund_cents, direct_cost_cents, distributable_cents,
             status, locked_by, locked_at
           ) VALUES ($1, 'SUBSCRIPTION', $2, $2, $3, $4, $5, $6, $7, $8, $9, 'REVIEW', $10, now())
           RETURNING id`,
          [
            tenantId,
            input.subscriptionId,
            policy.id,
            input.periodStart,
            input.periodEnd,
            actualReceipt.toString(),
            refunds.toString(),
            statement.directCostMinorUnits.toString(),
            statement.distributableMinorUnits.toString(),
            input.lockedBy,
          ],
        );
        const statementId = insertedStatement.rows[0]!.id;
        const responseAllocations: LockedDistributionResponse['allocations'] = [];
        for (const allocation of exact) {
          const target = targets.find((candidate) => candidate.key === allocation.key)!;
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO revenue_distribution_allocations(
               tenant_id, statement_id, beneficiary_id, right_holder_id, beneficiary_role,
               share_bps, allocated_cents
             ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [
              tenantId,
              statementId,
              target.beneficiaryId,
              target.rightHolderId ?? null,
              target.beneficiaryRole,
              target.shareBps,
              allocation.allocatedMinorUnits.toString(),
            ],
          );
          if (allocation.allocatedMinorUnits !== 0n) {
            await client.query(
              `INSERT INTO revenue_distribution_entries(
                 tenant_id, allocation_id, entry_type, amount_cents, idempotency_key, reason_code, created_by
               ) VALUES ($1, $2, 'ACCRUAL', $3, $4, 'STATEMENT_LOCKED', $5)`,
              [
                tenantId,
                inserted.rows[0]!.id,
                allocation.allocatedMinorUnits.toString(),
                `${command.idempotencyKey}:${target.beneficiaryId}:accrual`,
                input.lockedBy,
              ],
            );
          }
          responseAllocations.push({
            beneficiaryId: target.beneficiaryId,
            beneficiaryRole: target.beneficiaryRole,
            shareBps: target.shareBps,
            allocatedMinorUnits: allocation.allocatedMinorUnits.toString(),
          });
        }
        await client.query(
          `UPDATE revenue_distribution_statements SET status = 'LOCKED' WHERE tenant_id = $1 AND id = $2`,
          [tenantId, statementId],
        );
        const response = LockedDistributionResponseSchema.parse({
          id: statementId,
          status: 'LOCKED',
          policyVersion: policy.policy_version,
          actualReceiptMinorUnits: actualReceipt.toString(),
          refundMinorUnits: refunds.toString(),
          directCostMinorUnits: statement.directCostMinorUnits.toString(),
          distributableMinorUnits: statement.distributableMinorUnits.toString(),
          allocations: responseAllocations,
        });
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES ($1, 'distribution.statement_locked.v1', 'distribution_statement', $2, 1,
                     $3, $4::jsonb, 'SENSITIVE', $5, now())`,
          [
            tenantId,
            statementId,
            `statement:${statementId}`,
            JSON.stringify({
              statement_id: statementId,
              actual_receipt_cents: actualReceipt.toString(),
              refund_cents: refunds.toString(),
              direct_cost_cents: statement.directCostMinorUnits.toString(),
              distributable_cents: statement.distributableMinorUnits.toString(),
              policy_version: policy.policy_version,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'LOCK', 'distribution_statement', $3,
                     'distribution.lock', 'SUCCESS', $4::jsonb, $5)`,
          [tenantId, input.lockedBy, statementId, JSON.stringify(response), command.traceId],
        );
        await client.query(
          `UPDATE idempotency_keys SET response_status = 201, response_body = $3::jsonb,
                    resource_type = 'distribution_statement', resource_id = $4
            WHERE tenant_id = $1 AND scope = 'distribution.lock' AND idempotency_key = $2`,
          [tenantId, command.idempotencyKey, JSON.stringify(response), statementId],
        );
        await client.query('COMMIT');
        return response;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
