import { createHash } from 'node:crypto';
import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { SessionIdentity } from './session-identity.js';

const RequestTransferSchema = z.object({
  rightHolderId: UuidSchema,
  toBeneficiaryId: UuidSchema,
  agreementObjectKey: z.string().min(1).max(1024),
});
const ConfirmTransferSchema = z.object({
  transferId: UuidSchema,
  confirmationRole: z.enum(['FROM_BENEFICIARY', 'TO_BENEFICIARY']),
  evidence: z.record(z.string(), z.unknown()).default({}),
});
const ApproveTransferSchema = z.object({ transferId: UuidSchema });
const OpenDisputeSchema = z.object({
  rightGroupId: UuidSchema,
  claimantBeneficiaryIds: z.array(UuidSchema).min(2),
  reasonCode: z.string().min(1).max(80),
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export class RevenueRightGovernanceConflictError extends Error {}
export class RevenueRightGovernanceAuthorizationError extends Error {}
export class RevenueRightGovernanceStateError extends Error {}

interface Command {
  identity: SessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface RevenueRightGovernanceService {
  requestTransfer(command: Command): Promise<{ id: string; status: string; replayed: boolean }>;
  confirmTransfer(command: Command): Promise<{ id: string; status: string; replayed: boolean }>;
  approveTransfer(command: Command): Promise<{ id: string; status: string; replayed: boolean }>;
  openDispute(command: Command): Promise<{ id: string; status: string; replayed: boolean }>;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createRevenueRightGovernanceService(
  pool: Pick<pg.Pool, 'connect'>,
): RevenueRightGovernanceService {
  async function transaction<T>(
    identity: SessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const tenantId = TenantIdSchema.parse(identity.tenantId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
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

  async function reserve(
    client: pg.PoolClient,
    identity: SessionIdentity,
    scope: string,
    key: string,
    requestHash: string,
  ) {
    const inserted = await client.query(
      `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
       VALUES ($1,$2,$3,$4,now() + interval '24 hours')
       ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
      [identity.tenantId, scope, key, requestHash],
    );
    if (inserted.rowCount === 1) return undefined;
    const existing = await client.query<{ request_hash: string; response_body: unknown }>(
      `SELECT request_hash,response_body FROM idempotency_keys
        WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
      [identity.tenantId, scope, key],
    );
    if (existing.rows[0]?.request_hash !== requestHash)
      throw new RevenueRightGovernanceConflictError();
    return existing.rows[0]?.response_body as { id: string; status: string } | undefined;
  }

  async function complete(
    client: pg.PoolClient,
    identity: SessionIdentity,
    scope: string,
    key: string,
    response: unknown,
    resourceType: string,
    resourceId: string,
  ) {
    await client.query(
      `UPDATE idempotency_keys SET response_status=200,response_body=$4::jsonb,
              resource_type=$5,resource_id=$6
        WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
      [identity.tenantId, scope, key, JSON.stringify(response), resourceType, resourceId],
    );
  }

  return {
    async requestTransfer(command) {
      const input = RequestTransferSchema.parse(command.body);
      return transaction(command.identity, async (client) => {
        const scope = 'revenue-right.transfer.request';
        const replay = await reserve(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          hash(input),
        );
        if (replay) return { ...replay, replayed: true };
        const right = await client.query<{
          from_beneficiary_id: string;
          beneficiary_user_id: string | null;
        }>(
          `SELECT holder.beneficiary_id AS from_beneficiary_id, beneficiary.user_id AS beneficiary_user_id
             FROM merchant_revenue_right_holders holder
             JOIN merchant_revenue_right_groups rights
               ON rights.tenant_id=holder.tenant_id AND rights.id=holder.right_group_id
             JOIN revenue_beneficiaries beneficiary ON beneficiary.id=holder.beneficiary_id
            WHERE holder.tenant_id=$1 AND holder.id=$2 AND holder.status='ACTIVE'
              AND rights.status='ACTIVE' FOR UPDATE OF holder,rights`,
          [command.identity.tenantId, input.rightHolderId],
        );
        const current = right.rows[0];
        if (!current) throw new RevenueRightGovernanceStateError();
        if (current.beneficiary_user_id !== command.identity.userId)
          throw new RevenueRightGovernanceAuthorizationError();
        const target = await client.query(
          `SELECT 1 FROM revenue_beneficiaries
            WHERE id=$1 AND beneficiary_type='BUSINESS_PERSON' AND status='ACTIVE'`,
          [input.toBeneficiaryId],
        );
        if (target.rowCount !== 1 || current.from_beneficiary_id === input.toBeneficiaryId)
          throw new RevenueRightGovernanceStateError();
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO revenue_right_transfers(
             tenant_id,right_holder_id,from_beneficiary_id,to_beneficiary_id,status,
             agreement_object_key,requested_by
           ) VALUES ($1,$2,$3,$4,'WAITING_CONFIRMATIONS',$5,$6) RETURNING id`,
          [
            command.identity.tenantId,
            input.rightHolderId,
            current.from_beneficiary_id,
            input.toBeneficiaryId,
            input.agreementObjectKey,
            command.identity.userId,
          ],
        );
        const response = { id: inserted.rows[0]!.id, status: 'WAITING_CONFIRMATIONS' };
        await complete(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          response,
          'revenue_right_transfer',
          response.id,
        );
        return { ...response, replayed: false };
      });
    },

    async confirmTransfer(command) {
      const input = ConfirmTransferSchema.parse(command.body);
      return transaction(command.identity, async (client) => {
        const scope = `revenue-right.transfer.confirm.${input.confirmationRole}`;
        const replay = await reserve(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          hash(input),
        );
        if (replay) return { ...replay, replayed: true };
        const transfer = await client.query<{
          beneficiary_id: string;
          beneficiary_user_id: string | null;
        }>(
          `SELECT CASE $3 WHEN 'FROM_BENEFICIARY' THEN transfer.from_beneficiary_id
                          ELSE transfer.to_beneficiary_id END AS beneficiary_id,
                  beneficiary.user_id AS beneficiary_user_id
             FROM revenue_right_transfers transfer
             JOIN revenue_beneficiaries beneficiary
               ON beneficiary.id=CASE $3 WHEN 'FROM_BENEFICIARY' THEN transfer.from_beneficiary_id
                                        ELSE transfer.to_beneficiary_id END
            WHERE transfer.tenant_id=$1 AND transfer.id=$2 AND transfer.status='WAITING_CONFIRMATIONS'`,
          [command.identity.tenantId, input.transferId, input.confirmationRole],
        );
        const current = transfer.rows[0];
        if (!current) throw new RevenueRightGovernanceStateError();
        if (current.beneficiary_user_id !== command.identity.userId)
          throw new RevenueRightGovernanceAuthorizationError();
        const confirmation = await client.query<{ id: string }>(
          `INSERT INTO revenue_right_transfer_confirmations(
             tenant_id,transfer_id,confirmation_role,beneficiary_id,confirmed_by,evidence
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
          [
            command.identity.tenantId,
            input.transferId,
            input.confirmationRole,
            current.beneficiary_id,
            command.identity.userId,
            JSON.stringify(input.evidence),
          ],
        );
        const response = { id: confirmation.rows[0]!.id, status: 'CONFIRMED' };
        await complete(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          response,
          'revenue_right_transfer_confirmation',
          response.id,
        );
        return { ...response, replayed: false };
      });
    },

    async approveTransfer(command) {
      const input = ApproveTransferSchema.parse(command.body);
      return transaction(command.identity, async (client) => {
        const scope = 'revenue-right.transfer.approve';
        const replay = await reserve(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          hash(input),
        );
        if (replay) return { ...replay, replayed: true };
        const transfer = await client.query<{
          right_holder_id: string;
          to_beneficiary_id: string;
          requested_by: string;
        }>(
          `SELECT right_holder_id,to_beneficiary_id,requested_by FROM revenue_right_transfers
            WHERE tenant_id=$1 AND id=$2 AND status='WAITING_CONFIRMATIONS' FOR UPDATE`,
          [command.identity.tenantId, input.transferId],
        );
        const current = transfer.rows[0];
        if (!current || current.requested_by === command.identity.userId)
          throw new RevenueRightGovernanceStateError();
        const confirmations = await client.query(
          `SELECT 1 FROM revenue_right_transfer_confirmations WHERE tenant_id=$1 AND transfer_id=$2`,
          [command.identity.tenantId, input.transferId],
        );
        if (confirmations.rowCount !== 2) throw new RevenueRightGovernanceStateError();
        const holder = await client.query<{ right_group_id: string; share_bps: number }>(
          `UPDATE merchant_revenue_right_holders SET status='TRANSFERRED',ended_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' RETURNING right_group_id,share_bps`,
          [command.identity.tenantId, current.right_holder_id],
        );
        if (!holder.rows[0]) throw new RevenueRightGovernanceStateError();
        await client.query(
          `INSERT INTO merchant_revenue_right_holders(
             tenant_id,right_group_id,beneficiary_id,share_bps,status,starts_at
           ) VALUES ($1,$2,$3,$4,'ACTIVE',now())`,
          [
            command.identity.tenantId,
            holder.rows[0].right_group_id,
            current.to_beneficiary_id,
            holder.rows[0].share_bps,
          ],
        );
        await client.query(
          `UPDATE revenue_right_transfers SET status='EFFECTIVE',approved_by=$3,effective_at=now()
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.transferId, command.identity.userId],
        );
        const response = { id: input.transferId, status: 'EFFECTIVE' };
        await complete(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          response,
          'revenue_right_transfer',
          input.transferId,
        );
        return { ...response, replayed: false };
      });
    },

    async openDispute(command) {
      const input = OpenDisputeSchema.parse(command.body);
      return transaction(command.identity, async (client) => {
        const scope = 'revenue-right.dispute.open';
        const replay = await reserve(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          hash(input),
        );
        if (replay) return { ...replay, replayed: true };
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO revenue_right_disputes(
             tenant_id,right_group_id,claimant_beneficiary_ids,reason_code,evidence,opened_by
           ) VALUES ($1,$2,$3::uuid[],$4,$5::jsonb,$6) RETURNING id`,
          [
            command.identity.tenantId,
            input.rightGroupId,
            input.claimantBeneficiaryIds,
            input.reasonCode,
            JSON.stringify(input.evidence),
            command.identity.userId,
          ],
        );
        const response = { id: inserted.rows[0]!.id, status: 'OPEN' };
        await complete(
          client,
          command.identity,
          scope,
          command.idempotencyKey,
          response,
          'revenue_right_dispute',
          response.id,
        );
        return { ...response, replayed: false };
      });
    },
  };
}
