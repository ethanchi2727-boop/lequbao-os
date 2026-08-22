import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  CreateRevenueRightRequestSchema,
  RevenueRightResponseSchema,
  TenantIdSchema,
  UuidSchema,
  type RevenueRightResponse,
} from '@lequ/contracts';

export class IdempotencyConflictError extends Error {}
export class RevenueRightConflictError extends Error {}
export class InactiveBeneficiaryError extends Error {}

export interface CreateRevenueRightCommand {
  tenantId: string;
  merchantProfileId: string;
  idempotencyKey: string;
  body: unknown;
  traceId: string;
}

export interface RevenueRightService {
  create(command: CreateRevenueRightCommand): Promise<RevenueRightResponse>;
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createRevenueRightService(pool: Pick<pg.Pool, 'connect'>): RevenueRightService {
  return {
    async create(command) {
      const tenantId = TenantIdSchema.parse(command.tenantId);
      const merchantProfileId = UuidSchema.parse(command.merchantProfileId);
      const input = CreateRevenueRightRequestSchema.parse(command.body);
      const hash = requestHash({ merchantProfileId, input });
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

        const reservation = await client.query<{ id: string }>(
          `INSERT INTO idempotency_keys(
             tenant_id, scope, idempotency_key, request_hash, expires_at
           ) VALUES ($1, 'revenue-right.create', $2, $3, now() + interval '24 hours')
           ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING
           RETURNING id`,
          [tenantId, command.idempotencyKey, hash],
        );

        if (reservation.rowCount === 0) {
          const existing = await client.query<{ request_hash: string; response_body: unknown }>(
            `SELECT request_hash, response_body
               FROM idempotency_keys
              WHERE tenant_id = $1 AND scope = 'revenue-right.create' AND idempotency_key = $2
              FOR UPDATE`,
            [tenantId, command.idempotencyKey],
          );
          const replay = existing.rows[0];
          if (!replay || replay.request_hash !== hash) throw new IdempotencyConflictError();
          const response = RevenueRightResponseSchema.parse(replay.response_body);
          await client.query('COMMIT');
          return response;
        }

        const beneficiaryIds = input.holders.map((holder) => holder.beneficiaryId);
        const beneficiaries = await client.query<{ id: string }>(
          `SELECT id
             FROM revenue_beneficiaries
            WHERE id = ANY($1::uuid[])
              AND beneficiary_type = 'BUSINESS_PERSON'
              AND status = 'ACTIVE'`,
          [beneficiaryIds],
        );
        if (beneficiaries.rows.length !== beneficiaryIds.length)
          throw new InactiveBeneficiaryError();

        let group: { id: string };
        try {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO merchant_revenue_right_groups(
               tenant_id, merchant_profile_id, status, source_contract_ref, evidence, starts_at, created_by
             ) VALUES ($1, $2, 'PENDING', $3, $4::jsonb, $5, $6)
             RETURNING id`,
            [
              tenantId,
              merchantProfileId,
              input.sourceContractRef,
              JSON.stringify(input.evidence),
              input.startsAt,
              input.createdBy,
            ],
          );
          group = inserted.rows[0]!;
        } catch (error) {
          if ((error as { code?: string }).code === '23505') throw new RevenueRightConflictError();
          throw error;
        }

        await client.query(
          `INSERT INTO merchant_revenue_right_holders(
             tenant_id, right_group_id, beneficiary_id, share_bps, starts_at
           )
           SELECT $1, $2, holder.beneficiary_id, holder.share_bps, $5
             FROM unnest($3::uuid[], $4::integer[]) AS holder(beneficiary_id, share_bps)`,
          [
            tenantId,
            group.id,
            beneficiaryIds,
            input.holders.map((holder) => holder.shareBps),
            input.startsAt,
          ],
        );
        await client.query(
          `UPDATE merchant_revenue_right_groups SET status = 'ACTIVE' WHERE tenant_id = $1 AND id = $2`,
          [tenantId, group.id],
        );

        const response = RevenueRightResponseSchema.parse({
          id: group.id,
          merchantProfileId,
          status: 'ACTIVE',
          startsAt: input.startsAt,
          holders: input.holders,
        });
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES (
             $1, 'revenue_right.activated.v1', 'revenue_right_group', $2, 1,
             $3, $4::jsonb, 'SENSITIVE', $5, now()
           )`,
          [
            tenantId,
            group.id,
            `merchant:${merchantProfileId}`,
            JSON.stringify({
              right_group_id: group.id,
              merchant_profile_id: merchantProfileId,
              holder_ids: beneficiaryIds,
              total_share_bps: 7000,
              starts_at: input.startsAt,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'CREATE', 'revenue_right_group', $3,
                     'revenue_right.create', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            input.createdBy,
            group.id,
            JSON.stringify({ status: 'ACTIVE', total_share_bps: 7000 }),
            command.traceId,
          ],
        );
        await client.query(
          `UPDATE idempotency_keys
              SET response_status = 201, response_body = $3::jsonb,
                  resource_type = 'revenue_right_group', resource_id = $4
            WHERE tenant_id = $1 AND scope = 'revenue-right.create' AND idempotency_key = $2`,
          [tenantId, command.idempotencyKey, JSON.stringify(response), group.id],
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
