import { createHash } from 'node:crypto';
import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import { IdempotencyConflictError } from './revenue-right-service.js';

const ActionSchema = z.enum(['PAY', 'REVERSE']);
const RequestApprovalSchema = z.object({
  statementId: UuidSchema,
  actionType: ActionSchema,
  reasonCode: z.string().min(1).max(80),
  requestedBy: UuidSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});
const ApproveSchema = z.object({ approvalId: UuidSchema, approvedBy: UuidSchema });
const PaySchema = z.object({
  statementId: UuidSchema,
  approvalId: UuidSchema,
  executedBy: UuidSchema,
  provider: z.string().min(1).max(80),
  completedAt: z.iso.datetime({ offset: true }),
  payments: z
    .array(
      z.object({
        allocationId: UuidSchema,
        providerPaymentRefHash: z.string().regex(/^[a-f0-9]{64}$/i),
      }),
    )
    .min(1),
});
const ReverseSchema = z.object({
  statementId: UuidSchema,
  approvalId: UuidSchema,
  executedBy: UuidSchema,
  reasonCode: z.string().min(1).max(80),
});

const ApprovalResponseSchema = z.object({
  id: UuidSchema,
  statementId: UuidSchema,
  actionType: ActionSchema,
  reasonCode: z.string(),
  status: z.enum(['PENDING', 'APPROVED']),
  requestedBy: UuidSchema,
  approvedBy: UuidSchema.nullable(),
  expiresAt: z.string(),
});
const SettlementResponseSchema = z.object({
  statementId: UuidSchema,
  status: z.enum(['PAID', 'REVERSED']),
  entryIds: z.array(UuidSchema),
});

export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;
export type SettlementResponse = z.infer<typeof SettlementResponseSchema>;
export class DistributionStateError extends Error {}
export class DistributionApprovalError extends Error {}
export class DistributionPaymentEvidenceError extends Error {}
export class DistributionAuthorizationError extends Error {}

interface Command {
  tenantId: string;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface DistributionSettlementService {
  requestApproval(command: Command): Promise<ApprovalResponse>;
  approve(command: Command): Promise<ApprovalResponse>;
  pay(command: Command): Promise<SettlementResponse>;
  reverse(command: Command): Promise<SettlementResponse>;
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function reserve(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<unknown | undefined> {
  const inserted = await client.query(
    `INSERT INTO idempotency_keys(tenant_id, scope, idempotency_key, request_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '24 hours')
     ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING RETURNING id`,
    [tenantId, scope, key, requestHash],
  );
  if (inserted.rowCount === 1) return undefined;
  const existing = await client.query<{ request_hash: string; response_body: unknown }>(
    `SELECT request_hash, response_body FROM idempotency_keys
      WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3 FOR UPDATE`,
    [tenantId, scope, key],
  );
  const replay = existing.rows[0];
  if (!replay || replay.request_hash !== requestHash) throw new IdempotencyConflictError();
  return replay.response_body;
}

async function complete(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  response: unknown,
  resourceType: string,
  resourceId: string,
) {
  await client.query(
    `UPDATE idempotency_keys SET response_status = 200, response_body = $4::jsonb,
            resource_type = $5, resource_id = $6
      WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3`,
    [tenantId, scope, key, JSON.stringify(response), resourceType, resourceId],
  );
}

async function assertPlatformFinance(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const authorized = await client.query(
    `SELECT 1
       FROM tenant_memberships membership
       JOIN member_role_assignments assignment
         ON assignment.tenant_id = membership.tenant_id AND assignment.user_id = membership.user_id
      WHERE membership.tenant_id = $1 AND membership.user_id = $2
        AND membership.membership_status = 'ACTIVE'
        AND assignment.role_code = 'PLATFORM_FINANCE'
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())`,
    [tenantId, userId],
  );
  if (authorized.rowCount !== 1)
    throw new DistributionAuthorizationError('active platform finance role is required');
}

export function createDistributionSettlementService(
  pool: Pick<pg.Pool, 'connect'>,
): DistributionSettlementService {
  async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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
    async requestApproval(command) {
      const tenantId = TenantIdSchema.parse(command.tenantId);
      const input = RequestApprovalSchema.parse(command.body);
      const requestHash = digest(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'distribution.approval.request',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return ApprovalResponseSchema.parse(replay);
        await assertPlatformFinance(client, tenantId, input.requestedBy);
        if (new Date(input.expiresAt).getTime() <= Date.now())
          throw new DistributionApprovalError('approval expiry must be in the future');
        const statement = await client.query<{ status: string }>(
          `SELECT status FROM revenue_distribution_statements
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.statementId],
        );
        const status = statement.rows[0]?.status;
        const allowed =
          input.actionType === 'PAY'
            ? status === 'LOCKED' || status === 'PAYABLE'
            : status === 'LOCKED' || status === 'PAYABLE' || status === 'PAID';
        if (!allowed) throw new DistributionStateError('statement is not actionable');
        const inserted = await client.query<{
          id: string;
          requested_at: Date;
        }>(
          `INSERT INTO revenue_distribution_action_approvals(
             tenant_id, statement_id, action_type, request_hash, reason_code, requested_by, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, requested_at`,
          [
            tenantId,
            input.statementId,
            input.actionType,
            requestHash,
            input.reasonCode,
            input.requestedBy,
            input.expiresAt,
          ],
        );
        const approvalId = inserted.rows[0]!.id;
        const response = ApprovalResponseSchema.parse({
          id: approvalId,
          statementId: input.statementId,
          actionType: input.actionType,
          reasonCode: input.reasonCode,
          status: 'PENDING',
          requestedBy: input.requestedBy,
          approvedBy: null,
          expiresAt: input.expiresAt,
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'REQUEST_APPROVAL', 'distribution_action_approval', $3,
                     $4, 'SUCCESS', $5::jsonb, $6)`,
          [
            tenantId,
            input.requestedBy,
            approvalId,
            input.actionType === 'PAY' ? 'distribution.pay' : 'distribution.reverse',
            JSON.stringify({
              statementId: input.statementId,
              actionType: input.actionType,
              requestHash,
            }),
            command.traceId,
          ],
        );
        await complete(
          client,
          tenantId,
          'distribution.approval.request',
          command.idempotencyKey,
          response,
          'distribution_action_approval',
          approvalId,
        );
        return response;
      });
    },

    async approve(command) {
      const tenantId = TenantIdSchema.parse(command.tenantId);
      const input = ApproveSchema.parse(command.body);
      const requestHash = digest(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'distribution.approval.approve',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return ApprovalResponseSchema.parse(replay);
        await assertPlatformFinance(client, tenantId, input.approvedBy);
        const approval = await client.query<{
          statement_id: string;
          action_type: 'PAY' | 'REVERSE';
          reason_code: string;
          status: string;
          requested_by: string;
          expires_at: Date;
        }>(
          `SELECT statement_id, action_type, reason_code, status, requested_by, expires_at
             FROM revenue_distribution_action_approvals
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.approvalId],
        );
        const row = approval.rows[0];
        if (
          !row ||
          row.status !== 'PENDING' ||
          row.requested_by === input.approvedBy ||
          row.expires_at.getTime() <= Date.now()
        )
          throw new DistributionApprovalError('approval is not approvable');
        await client.query(
          `UPDATE revenue_distribution_action_approvals
              SET status = 'APPROVED', approved_by = $3, approved_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.approvalId, input.approvedBy],
        );
        const response = ApprovalResponseSchema.parse({
          id: input.approvalId,
          statementId: row.statement_id,
          actionType: row.action_type,
          reasonCode: row.reason_code,
          status: 'APPROVED',
          requestedBy: row.requested_by,
          approvedBy: input.approvedBy,
          expiresAt: row.expires_at.toISOString(),
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'APPROVE', 'distribution_action_approval', $3,
                     $4, 'SUCCESS', $5::jsonb, $6)`,
          [
            tenantId,
            input.approvedBy,
            input.approvalId,
            row.action_type === 'PAY' ? 'distribution.pay' : 'distribution.reverse',
            JSON.stringify({ status: 'APPROVED' }),
            command.traceId,
          ],
        );
        await complete(
          client,
          tenantId,
          'distribution.approval.approve',
          command.idempotencyKey,
          response,
          'distribution_action_approval',
          input.approvalId,
        );
        return response;
      });
    },

    async pay(command) {
      const tenantId = TenantIdSchema.parse(command.tenantId);
      const input = PaySchema.parse(command.body);
      const requestHash = digest(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'distribution.pay',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return SettlementResponseSchema.parse(replay);
        await assertPlatformFinance(client, tenantId, input.executedBy);
        const approval = await client.query<{
          reason_code: string;
          approved_by: string;
          expires_at: Date;
          status: string;
        }>(
          `SELECT reason_code, approved_by, expires_at, status
             FROM revenue_distribution_action_approvals
            WHERE tenant_id = $1 AND id = $2 AND statement_id = $3 AND action_type = 'PAY'
            FOR UPDATE`,
          [tenantId, input.approvalId, input.statementId],
        );
        const approved = approval.rows[0];
        if (
          !approved ||
          approved.status !== 'APPROVED' ||
          approved.approved_by !== input.executedBy ||
          approved.expires_at.getTime() <= new Date(input.completedAt).getTime()
        )
          throw new DistributionApprovalError('current PAY approval is required');
        const statement = await client.query<{ status: string }>(
          `SELECT status FROM revenue_distribution_statements
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.statementId],
        );
        if (!['LOCKED', 'PAYABLE'].includes(statement.rows[0]?.status ?? ''))
          throw new DistributionStateError('statement is not payable');
        const allocations = await client.query<{
          id: string;
          beneficiary_id: string;
          allocated_cents: string;
          accrual_id: string | null;
        }>(
          `SELECT allocation.id, allocation.beneficiary_id, allocation.allocated_cents::text,
                  accrual.id AS accrual_id
             FROM revenue_distribution_allocations allocation
             LEFT JOIN revenue_distribution_entries accrual
               ON accrual.tenant_id = allocation.tenant_id AND accrual.allocation_id = allocation.id
              AND accrual.entry_type = 'ACCRUAL'
            WHERE allocation.tenant_id = $1 AND allocation.statement_id = $2
            ORDER BY allocation.id FOR UPDATE OF allocation`,
          [tenantId, input.statementId],
        );
        const positive = allocations.rows.filter((row) => BigInt(row.allocated_cents) > 0n);
        const paymentMap = new Map(
          input.payments.map((payment) => [payment.allocationId, payment]),
        );
        if (
          paymentMap.size !== input.payments.length ||
          paymentMap.size !== positive.length ||
          positive.some((row) => !paymentMap.has(row.id) || !row.accrual_id)
        )
          throw new DistributionPaymentEvidenceError('every positive allocation needs one proof');
        await client.query(
          `UPDATE revenue_distribution_statements SET status = 'PAYABLE'
            WHERE tenant_id = $1 AND id = $2 AND status = 'LOCKED'`,
          [tenantId, input.statementId],
        );
        await client.query(
          `UPDATE revenue_distribution_allocations SET status = 'PAYABLE'
            WHERE tenant_id = $1 AND statement_id = $2 AND status IN ('ACCRUED','HELD')`,
          [tenantId, input.statementId],
        );
        const entryIds: string[] = [];
        for (const allocation of positive) {
          const proof = paymentMap.get(allocation.id)!;
          await client.query(
            `INSERT INTO revenue_payout_attempts(
               tenant_id, allocation_id, approval_id, amount_cents, provider,
               provider_payment_ref_hash, idempotency_key, status, requested_by, completed_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUCCEEDED', $8, $9)`,
            [
              tenantId,
              allocation.id,
              input.approvalId,
              allocation.allocated_cents,
              input.provider,
              proof.providerPaymentRefHash,
              `${command.idempotencyKey}:${allocation.id}:attempt`,
              input.executedBy,
              input.completedAt,
            ],
          );
          const entry = await client.query<{ id: string }>(
            `INSERT INTO revenue_distribution_entries(
               tenant_id, allocation_id, entry_type, amount_cents, idempotency_key,
               original_entry_id, reason_code, created_by
             ) VALUES ($1, $2, 'PAYMENT', -($3::bigint), $4, $5,
                       'PROVIDER_PAYMENT_SUCCEEDED', $6) RETURNING id`,
            [
              tenantId,
              allocation.id,
              allocation.allocated_cents,
              `${command.idempotencyKey}:${allocation.id}:payment`,
              allocation.accrual_id,
              input.executedBy,
            ],
          );
          const entryId = entry.rows[0]!.id;
          entryIds.push(entryId);
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
               partition_key, payload, pii_classification, trace_id, occurred_at
             ) VALUES ($1, 'distribution.payment_completed.v1', 'distribution_entry', $2, 1,
                       $3, $4::jsonb, 'SENSITIVE', $5, $6)`,
            [
              tenantId,
              entryId,
              `beneficiary:${allocation.beneficiary_id}`,
              JSON.stringify({
                entry_id: entryId,
                allocation_id: allocation.id,
                beneficiary_id: allocation.beneficiary_id,
                amount_cents: allocation.allocated_cents,
                provider_payment_ref_hash: proof.providerPaymentRefHash,
              }),
              command.traceId,
              input.completedAt,
            ],
          );
        }
        await client.query(
          `UPDATE revenue_distribution_allocations SET status = 'PAID'
            WHERE tenant_id = $1 AND statement_id = $2`,
          [tenantId, input.statementId],
        );
        await client.query(
          `UPDATE revenue_distribution_statements SET status = 'PAID', version = version + 1
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.statementId],
        );
        await client.query(
          `UPDATE revenue_distribution_action_approvals SET status = 'CONSUMED', consumed_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.approvalId],
        );
        const response = SettlementResponseSchema.parse({
          statementId: input.statementId,
          status: 'PAID',
          entryIds,
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'PAY', 'distribution_statement', $3,
                     'distribution.pay', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            input.executedBy,
            input.statementId,
            JSON.stringify(response),
            command.traceId,
          ],
        );
        await complete(
          client,
          tenantId,
          'distribution.pay',
          command.idempotencyKey,
          response,
          'distribution_statement',
          input.statementId,
        );
        return response;
      });
    },

    async reverse(command) {
      const tenantId = TenantIdSchema.parse(command.tenantId);
      const input = ReverseSchema.parse(command.body);
      const requestHash = digest(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'distribution.reverse',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return SettlementResponseSchema.parse(replay);
        await assertPlatformFinance(client, tenantId, input.executedBy);
        const approval = await client.query<{
          reason_code: string;
          approved_by: string;
          expires_at: Date;
          status: string;
        }>(
          `SELECT reason_code, approved_by, expires_at, status
             FROM revenue_distribution_action_approvals
            WHERE tenant_id = $1 AND id = $2 AND statement_id = $3 AND action_type = 'REVERSE'
            FOR UPDATE`,
          [tenantId, input.approvalId, input.statementId],
        );
        const approved = approval.rows[0];
        if (
          !approved ||
          approved.status !== 'APPROVED' ||
          approved.approved_by !== input.executedBy ||
          approved.reason_code !== input.reasonCode ||
          approved.expires_at.getTime() <= Date.now()
        )
          throw new DistributionApprovalError('matching current REVERSE approval is required');
        const statement = await client.query<{ status: string }>(
          `SELECT status FROM revenue_distribution_statements
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.statementId],
        );
        const status = statement.rows[0]?.status;
        if (!['LOCKED', 'PAYABLE', 'PAID'].includes(status ?? ''))
          throw new DistributionStateError('statement is not reversible');
        const allocations = await client.query<{
          id: string;
          beneficiary_id: string;
          original_entry_id: string | null;
          original_amount: string | null;
        }>(
          `SELECT allocation.id, allocation.beneficiary_id,
                  original.id AS original_entry_id, original.amount_cents::text AS original_amount
             FROM revenue_distribution_allocations allocation
             LEFT JOIN revenue_distribution_entries original
               ON original.tenant_id = allocation.tenant_id AND original.allocation_id = allocation.id
              AND original.entry_type = $3
            WHERE allocation.tenant_id = $1 AND allocation.statement_id = $2
            ORDER BY allocation.id FOR UPDATE OF allocation`,
          [tenantId, input.statementId, status === 'PAID' ? 'PAYMENT' : 'ACCRUAL'],
        );
        const entryIds: string[] = [];
        for (const allocation of allocations.rows) {
          if (!allocation.original_entry_id || allocation.original_amount === null) continue;
          const entry = await client.query<{ id: string }>(
            `INSERT INTO revenue_distribution_entries(
               tenant_id, allocation_id, entry_type, amount_cents, idempotency_key,
               original_entry_id, reason_code, created_by
             ) VALUES ($1, $2, 'REVERSAL', -($3::bigint), $4, $5, $6, $7) RETURNING id`,
            [
              tenantId,
              allocation.id,
              allocation.original_amount,
              `${command.idempotencyKey}:${allocation.id}:reversal`,
              allocation.original_entry_id,
              input.reasonCode,
              input.executedBy,
            ],
          );
          const entryId = entry.rows[0]!.id;
          entryIds.push(entryId);
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
               partition_key, payload, pii_classification, trace_id, occurred_at
             ) VALUES ($1, 'distribution.reversed.v1', 'distribution_entry', $2, 1,
                       $3, $4::jsonb, 'SENSITIVE', $5, now())`,
            [
              tenantId,
              entryId,
              `beneficiary:${allocation.beneficiary_id}`,
              JSON.stringify({
                entry_id: entryId,
                original_entry_id: allocation.original_entry_id,
                allocation_id: allocation.id,
                amount_cents: (-BigInt(allocation.original_amount)).toString(),
                reason_code: input.reasonCode,
              }),
              command.traceId,
            ],
          );
        }
        await client.query(
          `UPDATE revenue_distribution_allocations SET status = 'REVERSED'
            WHERE tenant_id = $1 AND statement_id = $2`,
          [tenantId, input.statementId],
        );
        await client.query(
          `UPDATE revenue_distribution_statements SET status = 'REVERSED', version = version + 1
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.statementId],
        );
        await client.query(
          `UPDATE revenue_distribution_action_approvals SET status = 'CONSUMED', consumed_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.approvalId],
        );
        const response = SettlementResponseSchema.parse({
          statementId: input.statementId,
          status: 'REVERSED',
          entryIds,
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'REVERSE', 'distribution_statement', $3,
                     'distribution.reverse', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            input.executedBy,
            input.statementId,
            JSON.stringify(response),
            command.traceId,
          ],
        );
        await complete(
          client,
          tenantId,
          'distribution.reverse',
          command.idempotencyKey,
          response,
          'distribution_statement',
          input.statementId,
        );
        return response;
      });
    },
  };
}
