import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';

const UsageInputSchema = z.object({
  tenantId: TenantIdSchema,
  subscriptionId: UuidSchema,
  meterCode: z.string().min(1).max(80),
  sourceType: z.enum(['MODEL', 'IMAGE', 'OCR', 'ASR', 'VECTOR', 'WORKFLOW']),
  sourceId: z.string().min(1).max(255),
  provider: z.string().min(1).max(80),
  modelCode: z.string().min(1).max(120).optional(),
  quantity: z.number().positive().finite(),
  costCents: z.int().nonnegative(),
  occurredAt: z.iso.datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).default({}),
  traceId: z.string().min(1).max(255),
});

export type RecordUsageInput = z.input<typeof UsageInputSchema>;

export interface UsageReceipt {
  id: string;
  replayed: boolean;
  quantity: string;
  periodQuantity: string;
  hardLimit: string | null;
}

export class UsageIdempotencyConflictError extends Error {}
export class UsageLimitExceededError extends Error {}
export class EntitlementUnavailableError extends Error {}

export interface EntitlementUsageService {
  snapshot(tenantId: string, subscriptionId: string): Promise<string>;
  record(input: RecordUsageInput): Promise<UsageReceipt>;
}

interface ExistingUsageRow {
  id: string;
  quantity: string;
  cost_cents: string;
  provider: string;
  model_code: string | null;
}

const equalNumber = (left: string, right: number) => Number(left) === right;

export function createEntitlementUsageService(
  pool: Pick<pg.Pool, 'connect'>,
): EntitlementUsageService {
  async function transaction<T>(
    tenantId: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
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

  return {
    async snapshot(rawTenantId, rawSubscriptionId) {
      const tenantId = TenantIdSchema.parse(rawTenantId);
      const subscriptionId = UuidSchema.parse(rawSubscriptionId);
      return transaction(tenantId, async (client) => {
        const snapshot = await client.query<{ id: string }>(
          `INSERT INTO tenant_entitlement_snapshots(
             tenant_id, subscription_id, plan_code, subscription_version, entitlements,
             effective_from, effective_to
           )
           SELECT subscription.tenant_id, subscription.id, subscription.plan_code,
                  subscription.version, plan.entitlements, subscription.current_period_start,
                  subscription.current_period_end
             FROM tenant_subscriptions subscription
             JOIN plans plan ON plan.plan_code = subscription.plan_code AND plan.active
           WHERE subscription.tenant_id = $1 AND subscription.id = $2
              AND subscription.status IN ('TRIAL','ACTIVE')
           ON CONFLICT (tenant_id, subscription_id, subscription_version)
           DO NOTHING
           RETURNING id`,
          [tenantId, subscriptionId],
        );
        let id = snapshot.rows[0]?.id;
        if (!id) {
          const existing = await client.query<{ id: string }>(
            `SELECT snapshot.id
               FROM tenant_entitlement_snapshots snapshot
               JOIN tenant_subscriptions subscription
                 ON subscription.tenant_id=snapshot.tenant_id AND subscription.id=snapshot.subscription_id
              WHERE snapshot.tenant_id=$1 AND snapshot.subscription_id=$2
                AND snapshot.subscription_version=subscription.version
                AND subscription.status IN ('TRIAL','ACTIVE')`,
            [tenantId, subscriptionId],
          );
          id = existing.rows[0]?.id;
        }
        if (!id) throw new EntitlementUnavailableError();
        return id;
      });
    },

    async record(rawInput) {
      const input = UsageInputSchema.parse(rawInput);
      return transaction(input.tenantId, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO ai_usage_ledger_entries(
             tenant_id, subscription_id, meter_code, source_type, source_id, provider,
             model_code, quantity, cost_cents, occurred_at, metadata, trace_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
           ON CONFLICT (tenant_id, source_type, source_id, meter_code) DO NOTHING
           RETURNING id`,
          [
            input.tenantId,
            input.subscriptionId,
            input.meterCode,
            input.sourceType,
            input.sourceId,
            input.provider,
            input.modelCode ?? null,
            input.quantity,
            input.costCents,
            input.occurredAt,
            JSON.stringify(input.metadata),
            input.traceId,
          ],
        );

        if (inserted.rowCount === 0) {
          const existing = await client.query<ExistingUsageRow>(
            `SELECT id, quantity::text, cost_cents::text, provider, model_code
               FROM ai_usage_ledger_entries
              WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3 AND meter_code = $4`,
            [input.tenantId, input.sourceType, input.sourceId, input.meterCode],
          );
          const row = existing.rows[0];
          if (
            !row ||
            !equalNumber(row.quantity, input.quantity) ||
            Number(row.cost_cents) !== input.costCents ||
            row.provider !== input.provider ||
            row.model_code !== (input.modelCode ?? null)
          ) {
            throw new UsageIdempotencyConflictError();
          }
          const meter = await client.query<{ quantity: string; hard_limit: string | null }>(
            `SELECT quantity::text, hard_limit::text FROM usage_meters
              WHERE tenant_id = $1 AND meter_code = $2
                AND $3::timestamptz::date BETWEEN period_start AND period_end`,
            [input.tenantId, input.meterCode, input.occurredAt],
          );
          return {
            id: row.id,
            replayed: true,
            quantity: row.quantity,
            periodQuantity: meter.rows[0]?.quantity ?? row.quantity,
            hardLimit: meter.rows[0]?.hard_limit ?? null,
          };
        }

        const meter = await client.query<{ quantity: string; hard_limit: string | null }>(
          `INSERT INTO usage_meters(
             tenant_id, meter_code, period_start, period_end, quantity, soft_limit, hard_limit, cost_cents
           )
           SELECT $1, $2,
                  date_trunc('month', $3::timestamptz AT TIME ZONE tenant.timezone)::date,
                  (date_trunc('month', $3::timestamptz AT TIME ZONE tenant.timezone) + interval '1 month - 1 day')::date,
                  0,
                  NULLIF(snapshot.entitlements #>> ARRAY['usage_limits',$2,'soft'], '')::numeric,
                  NULLIF(snapshot.entitlements #>> ARRAY['usage_limits',$2,'hard'], '')::numeric,
                  0
             FROM tenants tenant
             JOIN tenant_entitlement_snapshots snapshot
               ON snapshot.tenant_id = tenant.id AND snapshot.subscription_id = $4
              AND snapshot.effective_from <= $3::timestamptz
              AND (snapshot.effective_to IS NULL OR snapshot.effective_to > $3::timestamptz)
            WHERE tenant.id = $1
           ON CONFLICT (tenant_id, meter_code, period_start, period_end) DO UPDATE
             SET meter_code = EXCLUDED.meter_code
           RETURNING quantity::text, hard_limit::text`,
          [input.tenantId, input.meterCode, input.occurredAt, input.subscriptionId],
        );
        const current = meter.rows[0];
        if (!current) throw new EntitlementUnavailableError();
        const nextQuantity = Number(current.quantity) + input.quantity;
        if (current.hard_limit !== null && nextQuantity > Number(current.hard_limit)) {
          throw new UsageLimitExceededError();
        }
        const updated = await client.query<{ quantity: string; hard_limit: string | null }>(
          `UPDATE usage_meters
              SET quantity = quantity + $4, cost_cents = cost_cents + $5, updated_at = now()
            WHERE tenant_id = $1 AND meter_code = $2
              AND $3::timestamptz::date BETWEEN period_start AND period_end
            RETURNING quantity::text, hard_limit::text`,
          [input.tenantId, input.meterCode, input.occurredAt, input.quantity, input.costCents],
        );
        return {
          id: inserted.rows[0]!.id,
          replayed: false,
          quantity: String(input.quantity),
          periodQuantity: updated.rows[0]!.quantity,
          hardLimit: updated.rows[0]!.hard_limit,
        };
      });
    },
  };
}
