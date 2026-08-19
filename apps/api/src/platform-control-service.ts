import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

type Identity = SessionIdentity & Partial<AuthorizationContext>;
const ConnectorCodeSchema = z.enum(['WECOM_INTAKE', 'WECOM_NOTIFICATION']);
const ListSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  query: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
const RetryConnectorSchema = z.object({
  connectorCode: ConnectorCodeSchema,
  expectedVersion: z.number().int().positive(),
});
const PublishRewardRuleSchema = z.object({
  ruleCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/u),
  expectedCurrentVersion: z.number().int().nonnegative(),
  fundingSource: z.enum(['MERCHANT', 'PLATFORM_CAMPAIGN', 'PARTNER_CAMPAIGN']),
  triggerCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/u),
  grantConfig: z.object({
    amountCents: z.number().int().positive(),
    availableAfterHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 30),
    expiresAfterDays: z.number().int().min(1).max(3650),
  }),
  reversalPolicy: z.object({
    fullRefund: z.literal('FULL_REVERSAL'),
    partialRefund: z.literal('PROPORTIONAL_REVERSAL'),
  }),
});
const UpdatePlanSchema = z.object({
  expectedVersion: z.number().int().positive(),
  entitlements: z.record(z.string(), z.unknown()),
});
const ResolveDiscrepancySchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['RESOLVED', 'ACCEPTED_KNOWN']),
  resolutionCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,119}$/u),
});
const SavePartnerSchema = z.object({
  partnerId: UuidSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
  partnerCode: z.string().regex(/^[A-Z][A-Z0-9_-]{1,79}$/u),
  partnerName: z.string().trim().min(1).max(160),
  partnerType: z.enum(['CHANNEL_PARTNER', 'INVESTMENT_OPERATOR', 'REGIONAL_PROVIDER']),
  ownerUserId: UuidSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  region: z.object({
    provinceCode: z.string().trim().min(1).max(20),
    cityCode: z.string().trim().min(1).max(20).optional(),
    districtCode: z.string().trim().min(1).max(20).optional(),
  }),
});
const SaveModelBudgetSchema = z.object({
  routeCode: z.string().regex(/^[A-Z][A-Z0-9_.-]{1,79}$/u),
  expectedVersion: z.number().int().nonnegative(),
  purpose: z.string().trim().min(1).max(240),
  modelKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{1,159}$/u),
  perTaskBudgetCents: z.number().int().nonnegative(),
  monthlyBudgetCents: z.number().int().nonnegative(),
  maxSteps: z.number().int().min(1).max(12),
  maxToolCalls: z.number().int().min(0).max(20),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export class PlatformControlAuthorizationError extends Error {}
export class PlatformControlConflictError extends Error {}
export class PlatformControlStateError extends Error {}

export interface PlatformControlService {
  listConnectorHealth(identity: Identity): Promise<unknown[]>;
  retryConnector(
    identity: Identity,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listRewardRules(identity: Identity): Promise<unknown[]>;
  publishRewardRule(
    identity: Identity,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listSkills(identity: Identity, query: unknown): Promise<unknown[]>;
  listMerchants(identity: Identity, query: unknown): Promise<unknown[]>;
  listPlans(identity: Identity): Promise<unknown[]>;
  updatePlan(
    identity: Identity,
    planCode: string,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listDiscrepancies(identity: Identity, query: unknown): Promise<unknown[]>;
  resolveDiscrepancy(
    identity: Identity,
    discrepancyId: string,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listPartners(identity: Identity, query: unknown): Promise<unknown[]>;
  savePartner(
    identity: Identity,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listModelBudgets(identity: Identity, query: unknown): Promise<unknown[]>;
  saveModelBudget(
    identity: Identity,
    idempotencyKey: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
const platformRoles = new Set(['PLATFORM_ADMIN', 'PLATFORM_OPS', 'PLATFORM_FINANCE']);

function requireTenantScope(identity: Identity) {
  if (!identity.accessScopes?.some((scope) => ['TENANT', 'ALL', 'DUAL'].includes(scope)))
    throw new PlatformControlAuthorizationError();
}
function requirePlatform(identity: Identity, write = false) {
  if (!identity.roleCodes.some((role) => platformRoles.has(role)))
    throw new PlatformControlAuthorizationError();
  if (
    write &&
    !identity.roleCodes.some((role) => ['PLATFORM_ADMIN', 'PLATFORM_FINANCE'].includes(role))
  )
    throw new PlatformControlAuthorizationError();
}
function requirePlatformAdmin(identity: Identity) {
  if (!identity.roleCodes.includes('PLATFORM_ADMIN')) throw new PlatformControlAuthorizationError();
}
function assertPublicJson(value: unknown) {
  const encoded = JSON.stringify(value);
  if (
    encoded.length > 20_000 ||
    /"[^"\\]*(secret|password|token|cipher|private.?key)[^"\\]*"\s*:/iu.test(encoded)
  )
    throw new PlatformControlStateError('configuration contains secret-shaped data');
}

export function createPlatformControlService(
  pool: Pick<pg.Pool, 'connect'>,
): PlatformControlService {
  async function transaction<T>(
    tenantId: string | undefined,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
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

  async function auditedMutation<T extends Record<string, unknown>>(input: {
    identity: Identity;
    tenantId?: string;
    scope: string;
    idempotencyKey: string;
    request: unknown;
    traceId: string;
    action: string;
    permission: string;
    resourceType: string;
    work: (client: pg.PoolClient) => Promise<{ resourceId: string; result: T }>;
  }) {
    if (!input.idempotencyKey || input.idempotencyKey.length > 255)
      throw new PlatformControlConflictError();
    const requestHash = hash(input.request);
    return transaction(input.tenantId, async (client) => {
      const scoped = input.tenantId ? `${input.tenantId}:${input.scope}` : input.scope;
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
        `${scoped}:${input.idempotencyKey}`,
      ]);
      const replay = await client.query<{ request_hash: string; response_body: T }>(
        `SELECT request_hash,response_body FROM platform_control_receipts
          WHERE scope=$1 AND idempotency_key=$2`,
        [scoped, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new PlatformControlConflictError();
        return replay.rows[0].response_body;
      }
      const completed = await input.work(client);
      await client.query(
        `INSERT INTO platform_control_receipts(scope,idempotency_key,request_hash,
           resource_type,resource_id,response_body,actor_id)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [
          scoped,
          input.idempotencyKey,
          requestHash,
          input.resourceType,
          completed.resourceId,
          JSON.stringify(completed.result),
          input.identity.userId,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
           permission_code,result_code,after_redacted,trace_id)
         VALUES($1,'USER',$2,$3,$4,$5,$6,'SUCCESS',$7::jsonb,$8)`,
        [
          input.tenantId ?? null,
          input.identity.userId,
          input.action,
          input.resourceType,
          completed.resourceId,
          input.permission,
          JSON.stringify(completed.result),
          input.traceId,
        ],
      );
      return completed.result;
    });
  }

  return {
    async listConnectorHealth(identity) {
      requireTenantScope(identity);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT connector_code,status,last_inbound_at,last_outbound_at,last_success_at,
                  last_error_code,next_retry_at,version,updated_at
             FROM tenant_connector_health WHERE tenant_id=$1 ORDER BY connector_code`,
          [identity.tenantId],
        );
        return result.rows.map((row) => ({
          connectorCode: row.connector_code,
          status: row.status,
          lastInboundAt: iso(row.last_inbound_at),
          lastOutboundAt: iso(row.last_outbound_at),
          lastSuccessAt: iso(row.last_success_at),
          lastErrorCode: row.last_error_code,
          nextRetryAt: iso(row.next_retry_at),
          version: Number(row.version),
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    async retryConnector(identity, idempotencyKey, traceId, rawBody) {
      requireTenantScope(identity);
      const body = RetryConnectorSchema.parse(rawBody);
      return auditedMutation({
        identity,
        tenantId: identity.tenantId,
        scope: 'connector.retry',
        idempotencyKey,
        request: body,
        traceId,
        action: 'connector.health.retry',
        permission: 'merchant_profile.manage',
        resourceType: 'tenant_connector_health',
        work: async (client) => {
          const updated = await client.query(
            `UPDATE tenant_connector_health SET status='CHECKING',last_error_code=NULL,
                    next_retry_at=now(),version=version+1
              WHERE tenant_id=$1 AND connector_code=$2 AND version=$3 AND status<>'CHECKING'
              RETURNING id,connector_code,status,version`,
            [identity.tenantId, body.connectorCode, body.expectedVersion],
          );
          const row = updated.rows[0];
          if (!row) throw new PlatformControlStateError('connector version or state changed');
          await client.query(
            `INSERT INTO outbox_events(tenant_id,event_name,aggregate_type,aggregate_id,
               aggregate_version,partition_key,payload,trace_id,occurred_at)
             VALUES($1,'connector.health_check_requested.v1','tenant_connector_health',$2,$3,
                    'connector:'||$2,jsonb_build_object('connector_code',$4),$5,now())`,
            [identity.tenantId, row.id, row.version, row.connector_code, traceId],
          );
          return {
            resourceId: row.id,
            result: {
              connectorCode: row.connector_code,
              status: row.status,
              version: Number(row.version),
            },
          };
        },
      });
    },

    async listRewardRules(identity) {
      requireTenantScope(identity);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id,rule_code,version,status,funding_source,trigger_code,grant_config,
                  reversal_policy,effective_at,retired_at,created_at
             FROM reward_rule_versions WHERE tenant_id=$1 ORDER BY rule_code,version DESC`,
          [identity.tenantId],
        );
        return result.rows.map((row) => ({
          id: row.id,
          ruleCode: row.rule_code,
          version: Number(row.version),
          status: row.status,
          fundingSource: row.funding_source,
          triggerCode: row.trigger_code,
          grantConfig: row.grant_config,
          reversalPolicy: row.reversal_policy,
          effectiveAt: iso(row.effective_at),
          retiredAt: iso(row.retired_at),
          createdAt: iso(row.created_at),
        }));
      });
    },

    async publishRewardRule(identity, idempotencyKey, traceId, rawBody) {
      requireTenantScope(identity);
      const body = PublishRewardRuleSchema.parse(rawBody);
      return auditedMutation({
        identity,
        tenantId: identity.tenantId,
        scope: 'reward-rule.publish',
        idempotencyKey,
        request: body,
        traceId,
        action: 'reward_rule.publish',
        permission: 'reward_rule.manage',
        resourceType: 'reward_rule_version',
        work: async (client) => {
          const current = await client.query<{ id: string; version: number }>(
            `SELECT id,version FROM reward_rule_versions
              WHERE tenant_id=$1 AND rule_code=$2 AND status='ACTIVE' FOR UPDATE`,
            [identity.tenantId, body.ruleCode],
          );
          const currentVersion = Number(current.rows[0]?.version ?? 0);
          if (currentVersion !== body.expectedCurrentVersion)
            throw new PlatformControlStateError('reward rule version changed');
          if (current.rows[0])
            await client.query(
              `UPDATE reward_rule_versions SET status='RETIRED',retired_at=now()
                WHERE tenant_id=$1 AND id=$2`,
              [identity.tenantId, current.rows[0].id],
            );
          const id = randomUUID();
          const nextVersion = currentVersion + 1;
          await client.query(
            `INSERT INTO reward_rule_versions(id,tenant_id,rule_code,version,status,funding_source,
               trigger_code,grant_config,reversal_policy,effective_at,created_by)
             VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$7::jsonb,$8::jsonb,now(),$9)`,
            [
              id,
              identity.tenantId,
              body.ruleCode,
              nextVersion,
              body.fundingSource,
              body.triggerCode,
              JSON.stringify(body.grantConfig),
              JSON.stringify(body.reversalPolicy),
              identity.userId,
            ],
          );
          return {
            resourceId: id,
            result: {
              id,
              ruleCode: body.ruleCode,
              version: nextVersion,
              status: 'ACTIVE',
              fundingSource: body.fundingSource,
            },
          };
        },
      });
    },

    async listSkills(identity, rawQuery) {
      if (!identity.roleCodes.length) throw new PlatformControlAuthorizationError();
      const query = ListSchema.parse(rawQuery);
      return transaction(undefined, async (client) => {
        const result = await client.query(
          `SELECT skill_code,name,semantic_version,applicable_industries,required_permissions,
                  required_plugins,definition,published_at
             FROM official_skill_versions WHERE status='PUBLISHED'
              AND signature='sha256:'||package_digest
              AND ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR skill_code ILIKE '%'||$1||'%')
            ORDER BY name,semantic_version DESC LIMIT $2`,
          [query.query ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          skillCode: row.skill_code,
          name: row.name,
          version: row.semantic_version,
          applicableIndustries: row.applicable_industries,
          requiredPermissions: row.required_permissions,
          requiredPlugins: row.required_plugins,
          definition: row.definition,
          publishedAt: iso(row.published_at),
        }));
      });
    },

    async listMerchants(identity, rawQuery) {
      requirePlatform(identity);
      const query = ListSchema.parse(rawQuery);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT * FROM app.platform_merchant_directory($1,$2,$3,$4,$5)`,
          [
            identity.tenantId,
            identity.userId,
            query.query ?? null,
            query.status ?? null,
            query.limit,
          ],
        );
        return result.rows.map((row) => ({
          tenantId: row.tenant_id,
          tenantCode: row.tenant_code,
          displayName: row.display_name,
          status: row.status,
          dataRegion: row.data_region,
          industryCode: row.industry_code,
          profileStatus: row.profile_status,
          storeCount: Number(row.store_count),
          planCode: row.plan_code,
          subscriptionStatus: row.subscription_status,
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    async listPlans(identity) {
      requirePlatform(identity);
      return transaction(undefined, async (client) => {
        const result = await client.query(
          `SELECT plan_code,plan_name,billing_period,list_price_cents,entitlements,active,version,created_at
             FROM plans ORDER BY list_price_cents,plan_code`,
        );
        return result.rows.map((row) => ({
          planCode: row.plan_code,
          planName: row.plan_name,
          billingPeriod: row.billing_period,
          listPriceCents: Number(row.list_price_cents),
          entitlements: row.entitlements,
          active: row.active,
          version: Number(row.version),
          createdAt: iso(row.created_at),
        }));
      });
    },

    async updatePlan(identity, planCode, idempotencyKey, traceId, rawBody) {
      requirePlatform(identity, true);
      const body = UpdatePlanSchema.parse(rawBody);
      assertPublicJson(body.entitlements);
      return auditedMutation({
        identity,
        tenantId: identity.tenantId,
        scope: 'plan-entitlements.update',
        idempotencyKey,
        request: { planCode, ...body },
        traceId,
        action: 'plan.entitlements.update',
        permission: 'revenue_policy.manage',
        resourceType: 'plan',
        work: async (client) => {
          const updated = await client.query(
            `UPDATE plans SET entitlements=$3::jsonb,version=version+1
              WHERE plan_code=$1 AND version=$2 RETURNING plan_code,entitlements,version`,
            [planCode, body.expectedVersion, JSON.stringify(body.entitlements)],
          );
          const row = updated.rows[0];
          if (!row) throw new PlatformControlStateError('plan version changed');
          return {
            resourceId: row.plan_code,
            result: {
              planCode: row.plan_code,
              entitlements: row.entitlements,
              version: Number(row.version),
            },
          };
        },
      });
    },

    async listDiscrepancies(identity, rawQuery) {
      requireTenantScope(identity);
      const query = ListSchema.parse(rawQuery);
      return transaction(identity.tenantId, async (client) => {
        const result = await client.query(
          `SELECT discrepancy.id,discrepancy.batch_id,batch.business_date,batch.provider,
                  discrepancy.reason_code,discrepancy.amount_cents,discrepancy.status,
                  discrepancy.assigned_user_id,discrepancy.resolved_at,discrepancy.version,
                  discrepancy.created_at
             FROM commerce_reconciliation_discrepancies discrepancy
             JOIN commerce_reconciliation_batches batch
               ON batch.tenant_id=discrepancy.tenant_id AND batch.id=discrepancy.batch_id
            WHERE discrepancy.tenant_id=$1 AND ($2::text IS NULL OR discrepancy.status=$2)
            ORDER BY discrepancy.created_at DESC,discrepancy.id LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          batchId: row.batch_id,
          businessDate: row.business_date,
          provider: row.provider,
          reasonCode: row.reason_code,
          amountCents: Number(row.amount_cents),
          status: row.status,
          assignedUserId: row.assigned_user_id,
          resolvedAt: iso(row.resolved_at),
          version: Number(row.version),
          createdAt: iso(row.created_at),
        }));
      });
    },

    async resolveDiscrepancy(identity, discrepancyId, idempotencyKey, traceId, rawBody) {
      requireTenantScope(identity);
      const body = ResolveDiscrepancySchema.parse(rawBody);
      return auditedMutation({
        identity,
        tenantId: identity.tenantId,
        scope: 'reconciliation-discrepancy.resolve',
        idempotencyKey,
        request: { discrepancyId, ...body },
        traceId,
        action: 'reconciliation.discrepancy.resolve',
        permission: 'finance.reconcile',
        resourceType: 'commerce_reconciliation_discrepancy',
        work: async (client) => {
          const updated = await client.query(
            `UPDATE commerce_reconciliation_discrepancies
                SET status=$4,resolution_note_ref='code:'||$5,resolved_at=now(),resolved_by=$6,
                    assigned_user_id=COALESCE(assigned_user_id,$6),version=version+1,updated_at=now()
              WHERE tenant_id=$1 AND id=$2 AND version=$3 AND status IN ('OPEN','INVESTIGATING')
              RETURNING id,batch_id,status,version`,
            [
              identity.tenantId,
              discrepancyId,
              body.expectedVersion,
              body.decision,
              body.resolutionCode,
              identity.userId,
            ],
          );
          const row = updated.rows[0];
          if (!row) throw new PlatformControlStateError('discrepancy version or state changed');
          await client.query(
            `UPDATE commerce_reconciliation_batches SET status='RESOLVED',updated_at=now()
              WHERE tenant_id=$1 AND id=$2 AND status IN ('DIFFERENCE_FOUND','REVIEWING')
                AND NOT EXISTS(SELECT 1 FROM commerce_reconciliation_discrepancies
                  WHERE tenant_id=$1 AND batch_id=$2 AND status IN ('OPEN','INVESTIGATING'))`,
            [identity.tenantId, row.batch_id],
          );
          return {
            resourceId: row.id,
            result: {
              id: row.id,
              batchId: row.batch_id,
              status: row.status,
              version: Number(row.version),
              resolutionCode: body.resolutionCode,
            },
          };
        },
      });
    },

    async listPartners(identity, rawQuery) {
      requirePlatform(identity);
      const query = ListSchema.parse(rawQuery);
      return transaction(undefined, async (client) => {
        const result = await client.query(
          `SELECT partner.id,partner.partner_code,partner.partner_name,partner.partner_type,
                  partner.owner_user_id,partner.status,partner.version,partner.updated_at,
                  COALESCE(jsonb_agg(jsonb_build_object('id',region.id,'provinceCode',region.province_code,
                    'cityCode',region.city_code,'districtCode',region.district_code,'status',region.status,
                    'version',region.version) ORDER BY region.assigned_at)
                    FILTER(WHERE region.id IS NOT NULL),'[]'::jsonb) AS regions
             FROM channel_partners partner
             LEFT JOIN channel_partner_regions region ON region.partner_id=partner.id
            WHERE ($1::text IS NULL OR partner.partner_name ILIKE '%'||$1||'%'
                   OR partner.partner_code ILIKE '%'||$1||'%')
              AND ($2::text IS NULL OR partner.status=$2)
            GROUP BY partner.id ORDER BY partner.updated_at DESC,partner.id LIMIT $3`,
          [query.query ?? null, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          partnerCode: row.partner_code,
          partnerName: row.partner_name,
          partnerType: row.partner_type,
          ownerUserId: row.owner_user_id,
          status: row.status,
          version: Number(row.version),
          regions: row.regions,
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    async savePartner(identity, idempotencyKey, traceId, rawBody) {
      requirePlatformAdmin(identity);
      const body = SavePartnerSchema.parse(rawBody);
      if (body.partnerId && !body.expectedVersion)
        throw new PlatformControlStateError('expected partner version required');
      return auditedMutation({
        identity,
        tenantId: identity.tenantId,
        scope: 'channel-partner.save',
        idempotencyKey,
        request: body,
        traceId,
        action: 'channel_partner.save',
        permission: 'role.manage',
        resourceType: 'channel_partner',
        work: async (client) => {
          const owner = await client.query(
            `SELECT 1 FROM users user_account
              WHERE user_account.id=$1 AND user_account.status='ACTIVE'
                AND EXISTS(SELECT 1 FROM member_role_assignments assignment
                  WHERE assignment.user_id=user_account.id
                    AND assignment.role_code IN ('CHANNEL_PARTNER','INVESTMENT_OPERATOR','REGIONAL_PROVIDER')
                    AND (assignment.valid_until IS NULL OR assignment.valid_until>now())) LIMIT 1`,
            [body.ownerUserId],
          );
          if (owner.rowCount !== 1)
            throw new PlatformControlStateError('channel owner unavailable');
          const partnerId = body.partnerId ?? randomUUID();
          const partner = body.partnerId
            ? await client.query(
                `UPDATE channel_partners SET partner_code=$3,partner_name=$4,partner_type=$5,
                        owner_user_id=$6,status=$7,version=version+1
                  WHERE id=$1 AND version=$2
                  RETURNING id,partner_code,partner_name,partner_type,owner_user_id,status,version`,
                [
                  partnerId,
                  body.expectedVersion,
                  body.partnerCode,
                  body.partnerName,
                  body.partnerType,
                  body.ownerUserId,
                  body.status,
                ],
              )
            : await client.query(
                `INSERT INTO channel_partners(id,partner_code,partner_name,partner_type,owner_user_id,status)
                 VALUES($1,$2,$3,$4,$5,$6)
                 RETURNING id,partner_code,partner_name,partner_type,owner_user_id,status,version`,
                [
                  partnerId,
                  body.partnerCode,
                  body.partnerName,
                  body.partnerType,
                  body.ownerUserId,
                  body.status,
                ],
              );
          const row = partner.rows[0];
          if (!row) throw new PlatformControlStateError('partner version changed');
          await client.query(
            `INSERT INTO channel_partner_regions(partner_id,province_code,city_code,district_code,
               status,assigned_by)
             VALUES($1,$2,$3,$4,'ACTIVE',$5)
             ON CONFLICT (partner_id,province_code,city_code,district_code)
             DO UPDATE SET status='ACTIVE',ended_at=NULL,assigned_by=EXCLUDED.assigned_by,
                           assigned_at=now(),version=channel_partner_regions.version+1`,
            [
              partnerId,
              body.region.provinceCode,
              body.region.cityCode ?? null,
              body.region.districtCode ?? null,
              identity.userId,
            ],
          );
          return {
            resourceId: row.id,
            result: {
              id: row.id,
              partnerCode: row.partner_code,
              partnerName: row.partner_name,
              partnerType: row.partner_type,
              ownerUserId: row.owner_user_id,
              status: row.status,
              version: Number(row.version),
              region: body.region,
            },
          };
        },
      });
    },

    async listModelBudgets(identity, rawQuery) {
      requirePlatform(identity);
      const query = ListSchema.parse(rawQuery);
      return transaction(undefined, async (client) => {
        const result = await client.query(
          `SELECT route_code,purpose,model_key,per_task_budget_cents,monthly_budget_cents,
                  max_steps,max_tool_calls,status,version,updated_at
             FROM model_route_budgets
            WHERE ($1::text IS NULL OR route_code ILIKE '%'||$1||'%' OR purpose ILIKE '%'||$1||'%')
              AND ($2::text IS NULL OR status=$2)
            ORDER BY route_code LIMIT $3`,
          [query.query ?? null, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          routeCode: row.route_code,
          purpose: row.purpose,
          modelKey: row.model_key,
          perTaskBudgetCents: Number(row.per_task_budget_cents),
          monthlyBudgetCents: Number(row.monthly_budget_cents),
          maxSteps: Number(row.max_steps),
          maxToolCalls: Number(row.max_tool_calls),
          status: row.status,
          version: Number(row.version),
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    async saveModelBudget(identity, idempotencyKey, traceId, rawBody) {
      requirePlatform(identity, true);
      const body = SaveModelBudgetSchema.parse(rawBody);
      if (body.monthlyBudgetCents < body.perTaskBudgetCents)
        throw new PlatformControlStateError('monthly budget must cover one task');
      return auditedMutation({
        identity,
        tenantId: identity.tenantId,
        scope: 'model-route-budget.save',
        idempotencyKey,
        request: body,
        traceId,
        action: 'model_route_budget.save',
        permission: 'revenue_policy.manage',
        resourceType: 'model_route_budget',
        work: async (client) => {
          const current = await client.query<{ id: string; version: number }>(
            `SELECT id,version FROM model_route_budgets WHERE route_code=$1 FOR UPDATE`,
            [body.routeCode],
          );
          if (Number(current.rows[0]?.version ?? 0) !== body.expectedVersion)
            throw new PlatformControlStateError('model route version changed');
          const id = current.rows[0]?.id ?? randomUUID();
          const saved = await client.query(
            `INSERT INTO model_route_budgets(id,route_code,purpose,model_key,per_task_budget_cents,
               monthly_budget_cents,max_steps,max_tool_calls,status,updated_by,version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
             ON CONFLICT (route_code) DO UPDATE SET purpose=EXCLUDED.purpose,model_key=EXCLUDED.model_key,
               per_task_budget_cents=EXCLUDED.per_task_budget_cents,
               monthly_budget_cents=EXCLUDED.monthly_budget_cents,max_steps=EXCLUDED.max_steps,
               max_tool_calls=EXCLUDED.max_tool_calls,status=EXCLUDED.status,
               updated_by=EXCLUDED.updated_by,version=model_route_budgets.version+1
             RETURNING id,route_code,status,version`,
            [
              id,
              body.routeCode,
              body.purpose,
              body.modelKey,
              body.perTaskBudgetCents,
              body.monthlyBudgetCents,
              body.maxSteps,
              body.maxToolCalls,
              body.status,
              identity.userId,
            ],
          );
          const row = saved.rows[0];
          return {
            resourceId: row.id,
            result: {
              routeCode: row.route_code,
              status: row.status,
              version: Number(row.version),
            },
          };
        },
      });
    },
  };
}
