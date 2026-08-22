import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const ActivateAuthorizationSchema = z.object({
  merchantProfileId: UuidSchema,
  deliveryProjectId: UuidSchema,
  merchantChosenName: z.string().trim().min(1).max(120),
  templateCode: z.string().min(1).max(120),
  authorizationCode: z.string().min(16).max(2048),
});
const CreatePreviewSchema = z.object({
  miniProgramId: UuidSchema,
  templateVersion: z.string().min(1).max(120),
  configVersion: z.int().positive(),
  config: z.record(z.string(), z.unknown()),
});
const ConfirmPreviewSchema = z.object({
  miniProgramId: UuidSchema,
  releaseId: UuidSchema,
  checklist: z.object({
    nameConfirmed: z.literal(true),
    logoConfirmed: z.literal(true),
    homepageConfirmed: z.literal(true),
    productConfirmed: z.literal(true),
    priceConfirmed: z.literal(true),
    storeConfirmed: z.literal(true),
    groupBuyRuleConfirmed: z.literal(true),
    customerServiceConfirmed: z.literal(true),
    categoryQualified: z.literal(true),
    privacyConfirmed: z.literal(true),
    paymentSubjectConfirmed: z.literal(true),
  }),
});
const ReleaseActionSchema = z.object({ miniProgramId: UuidSchema, releaseId: UuidSchema });
const RollbackSchema = z.object({
  miniProgramId: UuidSchema,
  reason: z.string().min(1).max(1000),
});
const RolloutHealthSchema = z.object({
  miniProgramId: UuidSchema,
  releaseId: UuidSchema,
  wave: z.enum(['INTERNAL', 'PILOT', 'CANARY', 'ALL']),
  healthy: z.boolean(),
  observedMetrics: z.record(z.string(), z.unknown()),
});

const ReleaseSchema = z.object({
  id: UuidSchema,
  releaseNumber: z.string(),
  templateVersion: z.string(),
  configVersion: z.number().int().positive(),
  configDigest: z.string().nullable(),
  buildDigest: z.string().nullable(),
  artifactRef: z.string().nullable(),
  externalAuditId: z.string().nullable(),
  externalVersion: z.string().nullable(),
  status: z.enum([
    'DRAFT',
    'BUILDING',
    'PREVIEW_READY',
    'BUILD_FAILED',
    'SUBMITTED',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'PUBLISHING',
    'PUBLISHED',
    'PUBLISH_FAILED',
    'ROLLED_BACK',
  ]),
  rejectionReason: z.string().nullable(),
  merchantConfirmedBy: UuidSchema.nullable(),
  merchantConfirmedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  rolledBackFromId: UuidSchema.nullable(),
  previousStableReleaseId: UuidSchema.nullable(),
});
const MiniProgramSchema = z.object({
  id: UuidSchema,
  merchantProfileId: UuidSchema,
  deliveryProjectId: UuidSchema,
  appId: z.string(),
  merchantChosenName: z.string(),
  templateCode: z.string(),
  status: z.enum(['DRAFT', 'AUTHORIZED', 'ACTIVE', 'SUSPENDED', 'AUTH_REVOKED']),
  currentReleaseId: UuidSchema.nullable(),
  pendingReleaseId: UuidSchema.nullable(),
  lastStableReleaseId: UuidSchema.nullable(),
  authorizationStatus: z.enum(['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR']),
  authorizationScope: z.array(z.string()),
  release: ReleaseSchema.nullable(),
});

export type MiniProgramView = z.infer<typeof MiniProgramSchema>;
export type MiniProgramReleaseView = z.infer<typeof ReleaseSchema>;

export interface MiniProgramAuthorizationGrant {
  appId: string;
  subjectName: string;
  scopeCodes: string[];
  credentialSecretRef: string;
  authorizedAt: string;
  expiresAt?: string;
  externalRequestId: string;
}

export interface MiniProgramBuildResult {
  artifactRef: string;
  artifactDigest: string;
  previewRef: string;
  templateCommit: string;
  backendApiVersion: string;
  databaseCompatibilityMin: string;
  databaseCompatibilityMax: string;
  smokeTestResult: { passed: boolean; checks: Record<string, boolean> };
}

export interface MiniProgramProviderGateway {
  exchangeAuthorization(input: {
    authorizationCode: string;
    idempotencyKey: string;
    traceId: string;
  }): Promise<MiniProgramAuthorizationGrant>;
  submitReview(input: {
    appId: string;
    releaseId: string;
    artifactRef: string;
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ externalAuditId: string; externalRequestId: string }>;
  publish(input: {
    appId: string;
    releaseId: string;
    externalAuditId: string;
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ externalVersion: string; externalRequestId: string }>;
  queryOnline(input: {
    appId: string;
    releaseId: string;
    traceId: string;
  }): Promise<{ releaseId: string | null; externalVersion: string | null }>;
  rollback(input: {
    appId: string;
    releaseId: string;
    artifactRef: string;
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ externalVersion: string; externalRequestId: string }>;
}

export interface MiniProgramBuilder {
  build(input: {
    miniProgramId: string;
    templateCode: string;
    templateVersion: string;
    configVersion: number;
    config: Record<string, unknown>;
    configDigest: string;
    traceId: string;
  }): Promise<MiniProgramBuildResult>;
}

interface UserCommand {
  identity: SessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface MiniProgramProviderEvent {
  tenantId: string;
  appId: string;
  providerEventId: string;
  eventType: 'AUTH_REVOKED' | 'REVIEW_APPROVED' | 'REVIEW_REJECTED';
  externalAuditId?: string;
  reasonCode?: string;
  reasonSummary?: string;
  ciphertextHash: string;
  encryptedPayloadObjectRef: string;
  receivedAt: string;
  traceId: string;
}

export interface MiniProgramLifecycleService {
  activateAuthorization(command: UserCommand): Promise<MiniProgramView>;
  createPreview(command: UserCommand): Promise<MiniProgramView>;
  confirmPreview(command: UserCommand): Promise<MiniProgramView>;
  submitReview(command: UserCommand): Promise<MiniProgramView>;
  publish(command: UserCommand): Promise<MiniProgramView>;
  rollback(command: UserCommand): Promise<MiniProgramView>;
  recordRolloutHealth(command: UserCommand): Promise<MiniProgramView>;
  handleProviderEvent(event: MiniProgramProviderEvent): Promise<MiniProgramView>;
  get(identity: SessionIdentity, miniProgramId: string): Promise<MiniProgramView>;
}

export class MiniProgramStateError extends Error {}
export class MiniProgramConfirmationError extends Error {}
export class MiniProgramOwnershipConflictError extends Error {}
export class MiniProgramProviderError extends Error {}
export class MiniProgramCallbackConflictError extends Error {}
export class MiniProgramAuthorizationError extends Error {}

const REQUIRED_AUTHORIZATION_SCOPES = ['ACCOUNT_INFO', 'CODE_MANAGEMENT'] as const;
const secretReferencePattern = /^(secret|vault|kms):\/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

const requestHash = (value: unknown) => digest(canonicalJson(value));

async function reserve(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  hash: string,
) {
  const inserted = await client.query(
    `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
     VALUES ($1,$2,$3,$4,now()+interval '24 hours')
     ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
    [tenantId, scope, key, hash],
  );
  if (inserted.rowCount === 1) return undefined;
  const existing = await client.query<{ request_hash: string; response_body: unknown }>(
    `SELECT request_hash,response_body FROM idempotency_keys
      WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
    [tenantId, scope, key],
  );
  const replay = existing.rows[0];
  if (!replay || replay.request_hash !== hash) throw new IdempotencyConflictError();
  if (replay.response_body === null)
    throw new MiniProgramStateError('command is pending or requires recovery');
  return MiniProgramSchema.parse(replay.response_body);
}

async function complete(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  response: MiniProgramView,
) {
  await client.query(
    `UPDATE idempotency_keys SET response_status=200,response_body=$4::jsonb,
            resource_type='mini_program',resource_id=$5
      WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
    [tenantId, scope, key, JSON.stringify(response), response.id],
  );
}

async function loadMiniProgram(
  client: pg.PoolClient,
  tenantId: string,
  miniProgramId: string,
): Promise<MiniProgramView> {
  const program = await client.query<{
    id: string;
    merchant_profile_id: string;
    delivery_project_id: string;
    app_id: string;
    merchant_chosen_name: string;
    template_code: string;
    status: string;
    current_release_id: string | null;
    pending_release_id: string | null;
    last_stable_release_id: string | null;
    authorization_status: string;
    authorization_scope: string[];
  }>(
    `SELECT mini.id,mini.merchant_profile_id,mini.delivery_project_id,mini.app_id,
            mini.merchant_chosen_name,mini.template_code,mini.status,mini.current_release_id,
            mini.pending_release_id,mini.last_stable_release_id,authorization.status AS authorization_status,
            authorization.authorization_scope
       FROM mini_programs mini
       JOIN external_authorizations authorization
         ON authorization.tenant_id=mini.tenant_id AND authorization.id=mini.authorization_id
      WHERE mini.tenant_id=$1 AND mini.id=$2`,
    [tenantId, miniProgramId],
  );
  const row = program.rows[0];
  if (!row?.merchant_profile_id || !row.delivery_project_id)
    throw new MiniProgramStateError('mini-program unavailable');
  let release: MiniProgramReleaseView | null = null;
  const visibleReleaseId = row.pending_release_id ?? row.current_release_id;
  if (visibleReleaseId) release = await loadRelease(client, tenantId, visibleReleaseId);
  return MiniProgramSchema.parse({
    id: row.id,
    merchantProfileId: row.merchant_profile_id,
    deliveryProjectId: row.delivery_project_id,
    appId: row.app_id,
    merchantChosenName: row.merchant_chosen_name,
    templateCode: row.template_code,
    status: row.status,
    currentReleaseId: row.current_release_id,
    pendingReleaseId: row.pending_release_id,
    lastStableReleaseId: row.last_stable_release_id,
    authorizationStatus: row.authorization_status,
    authorizationScope: row.authorization_scope,
    release,
  });
}

async function loadRelease(client: pg.PoolClient, tenantId: string, releaseId: string) {
  const release = await client.query<{
    id: string;
    release_number: string;
    template_version: string;
    config_version: number;
    config_digest: string | null;
    build_digest: string | null;
    build_artifact_ref: string | null;
    external_audit_id: string | null;
    external_version: string | null;
    status: string;
    rejection_reason: string | null;
    merchant_confirmed_by: string | null;
    merchant_confirmed_at: Date | string | null;
    published_at: Date | string | null;
    rolled_back_from_id: string | null;
    previous_stable_release_id: string | null;
  }>(
    `SELECT id,release_number::text,template_version,config_version,config_digest,build_digest,
            build_artifact_ref,external_audit_id,external_version,status,rejection_reason,
            merchant_confirmed_by,merchant_confirmed_at,published_at,rolled_back_from_id,
            previous_stable_release_id
       FROM mini_program_releases WHERE tenant_id=$1 AND id=$2`,
    [tenantId, releaseId],
  );
  const row = release.rows[0];
  if (!row) throw new MiniProgramStateError('release unavailable');
  return ReleaseSchema.parse({
    id: row.id,
    releaseNumber: row.release_number,
    templateVersion: row.template_version,
    configVersion: row.config_version,
    configDigest: row.config_digest,
    buildDigest: row.build_digest,
    artifactRef: row.build_artifact_ref,
    externalAuditId: row.external_audit_id,
    externalVersion: row.external_version,
    status: row.status,
    rejectionReason: row.rejection_reason,
    merchantConfirmedBy: row.merchant_confirmed_by,
    merchantConfirmedAt: row.merchant_confirmed_at
      ? new Date(row.merchant_confirmed_at).toISOString()
      : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    rolledBackFromId: row.rolled_back_from_id,
    previousStableReleaseId: row.previous_stable_release_id,
  });
}

export function createMiniProgramLifecycleService(
  pool: Pick<pg.Pool, 'connect'>,
  provider: MiniProgramProviderGateway,
  builder: MiniProgramBuilder,
): MiniProgramLifecycleService {
  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const response = await work(client);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function finishAttempt(
    tenantId: string,
    attemptId: string,
    status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN',
    response: Record<string, unknown>,
    errorCode?: string,
  ) {
    await transaction(tenantId, async (client) => {
      await client.query(
        `UPDATE mini_program_external_attempts
            SET status=$3,response_summary=$4::jsonb,error_code=$5,completed_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
        [tenantId, attemptId, status, JSON.stringify(response), errorCode ?? null],
      );
    });
  }

  async function syncDeliveryProgress(
    client: pg.PoolClient,
    tenantId: string,
    deliveryProjectId: string,
  ) {
    await client.query(
      `WITH totals AS (
         SELECT count(*) FILTER (WHERE required_step) AS required_count,
                count(*) FILTER (WHERE required_step AND status='SUCCEEDED') AS succeeded_count
           FROM delivery_steps WHERE tenant_id=$1 AND project_id=$2
       )
       UPDATE delivery_projects project
          SET progress_percent=CASE WHEN totals.required_count=0 THEN 0
                                    ELSE floor(totals.succeeded_count*100.0/totals.required_count)::integer END,
              version=version+1
         FROM totals WHERE project.tenant_id=$1 AND project.id=$2`,
      [tenantId, deliveryProjectId],
    );
  }

  async function succeedDeliverySteps(
    client: pg.PoolClient,
    tenantId: string,
    deliveryProjectId: string,
    stepCodes: string[],
    resultRef?: string,
  ) {
    await client.query(
      `UPDATE delivery_steps SET status='SUCCEEDED',result_ref=COALESCE($4,result_ref),
              completed_at=COALESCE(completed_at,now()),last_error_code=NULL,last_error_message=NULL
        WHERE tenant_id=$1 AND project_id=$2 AND step_code=ANY($3::text[])
          AND status <> 'SUCCEEDED'`,
      [tenantId, deliveryProjectId, stepCodes, resultRef ?? null],
    );
    await syncDeliveryProgress(client, tenantId, deliveryProjectId);
  }

  return {
    async activateAuthorization(command) {
      if (!command.identity.roleCodes.includes('MERCHANT_OWNER'))
        throw new MiniProgramAuthorizationError('merchant owner authorization is required');
      const input = ActivateAuthorizationSchema.parse(command.body);
      const scope = 'miniprogram.authorization.activate';
      const hash = requestHash({ ...input, authorizationCode: digest(input.authorizationCode) });
      const prepared = await transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          hash,
        );
        if (replay) return { replay } as const;
        const prerequisite = await client.query(
          `SELECT 1 FROM delivery_projects project
            WHERE project.tenant_id=$1 AND project.id=$2 AND project.merchant_profile_id=$3
              AND project.status NOT IN ('CANCELLED','DELIVERED','OPERATING')`,
          [command.identity.tenantId, input.deliveryProjectId, input.merchantProfileId],
        );
        if (prerequisite.rowCount !== 1)
          throw new MiniProgramStateError('active merchant delivery project is required');
        const attempt = await client.query<{ id: string }>(
          `INSERT INTO mini_program_external_attempts(
             tenant_id,action,action_version,idempotency_key,status,request_summary
           ) VALUES ($1,'AUTHORIZE',1,$2,'RUNNING',$3::jsonb) RETURNING id`,
          [
            command.identity.tenantId,
            `mini-program:authorize:${command.idempotencyKey}`,
            JSON.stringify({
              merchant_profile_id: input.merchantProfileId,
              delivery_project_id: input.deliveryProjectId,
            }),
          ],
        );
        return { attemptId: attempt.rows[0]!.id } as const;
      });
      if ('replay' in prepared) return prepared.replay;

      let grant: MiniProgramAuthorizationGrant;
      try {
        grant = await provider.exchangeAuthorization({
          authorizationCode: input.authorizationCode,
          idempotencyKey: `mini-program:authorize:${command.idempotencyKey}`,
          traceId: command.traceId,
        });
      } catch {
        await finishAttempt(
          command.identity.tenantId,
          prepared.attemptId,
          'UNKNOWN',
          {},
          'AUTHORIZATION_EXCHANGE_UNKNOWN',
        );
        throw new MiniProgramProviderError('authorization exchange result is unknown');
      }
      if (
        !REQUIRED_AUTHORIZATION_SCOPES.every((scopeCode) => grant.scopeCodes.includes(scopeCode)) ||
        !secretReferencePattern.test(grant.credentialSecretRef)
      ) {
        await finishAttempt(
          command.identity.tenantId,
          prepared.attemptId,
          'FAILED',
          { scope_codes: grant.scopeCodes },
          'INVALID_AUTHORIZATION_GRANT',
        );
        throw new MiniProgramAuthorizationError('required scope or secret reference is invalid');
      }

      const persisted = await transaction(command.identity.tenantId, async (client) => {
        let programId: string;
        await client.query('SAVEPOINT mini_program_app_binding');
        try {
          const authorization = await client.query<{ id: string }>(
            `INSERT INTO external_authorizations(
               tenant_id,provider,external_account_id,external_subject_name,authorization_scope,
               credential_secret_ref,status,authorized_by,authorized_at,expires_at,last_verified_at
             ) VALUES ($1,'WECHAT_COMPONENT',$2,$3,$4::text[],$5,'ACTIVE',$6,$7,$8,now())
             RETURNING id`,
            [
              command.identity.tenantId,
              grant.appId,
              grant.subjectName,
              grant.scopeCodes,
              grant.credentialSecretRef,
              command.identity.userId,
              grant.authorizedAt,
              grant.expiresAt ?? null,
            ],
          );
          const program = await client.query<{ id: string }>(
            `INSERT INTO mini_programs(
               tenant_id,merchant_profile_id,delivery_project_id,authorization_id,app_id,app_id_hash,
               merchant_chosen_name,template_code,status,publishing_confirmer_user_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AUTHORIZED',$9) RETURNING id`,
            [
              command.identity.tenantId,
              input.merchantProfileId,
              input.deliveryProjectId,
              authorization.rows[0]!.id,
              grant.appId,
              digest(grant.appId),
              input.merchantChosenName,
              input.templateCode,
              command.identity.userId,
            ],
          );
          programId = program.rows[0]!.id;
        } catch (error) {
          if ((error as { code?: string }).code !== '23505') throw error;
          await client.query('ROLLBACK TO SAVEPOINT mini_program_app_binding');
          await client.query(
            `UPDATE mini_program_external_attempts
                SET status='FAILED',error_code='APP_ID_ALREADY_BOUND',response_summary=$3::jsonb,
                    completed_at=now()
              WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
            [
              command.identity.tenantId,
              prepared.attemptId,
              JSON.stringify({ app_id_hash: digest(grant.appId) }),
            ],
          );
          return { conflict: true as const };
        }
        await client.query('RELEASE SAVEPOINT mini_program_app_binding');
        await succeedDeliverySteps(client, command.identity.tenantId, input.deliveryProjectId, [
          'miniapp.authorize',
          'miniapp.permission_check',
        ]);
        await client.query(
          `UPDATE mini_program_external_attempts
              SET status='SUCCEEDED',external_request_id=$3,response_summary=$4::jsonb,
                  completed_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
          [
            command.identity.tenantId,
            prepared.attemptId,
            grant.externalRequestId,
            JSON.stringify({ app_id_hash: digest(grant.appId), scope_codes: grant.scopeCodes }),
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'miniprogram.authorization_activated.v1','mini_program',$2,1,
                     'miniprogram:' || $2,$3::jsonb,'INTERNAL',$4,now())`,
          [
            command.identity.tenantId,
            programId,
            JSON.stringify({
              mini_program_id: programId,
              app_id_hash: digest(grant.appId),
              scope_codes: grant.scopeCodes,
              authorized_at: grant.authorizedAt,
            }),
            command.traceId,
          ],
        );
        const response = await loadMiniProgram(client, command.identity.tenantId, programId);
        await complete(client, command.identity.tenantId, scope, command.idempotencyKey, response);
        return { response };
      });
      if ('conflict' in persisted) throw new MiniProgramOwnershipConflictError();
      return persisted.response;
    },

    async createPreview(command) {
      const input = CreatePreviewSchema.parse(command.body);
      const scope = 'miniprogram.release.preview';
      const configCanonical = canonicalJson(input.config);
      const configDigest = digest(configCanonical);
      const hash = requestHash({ ...input, config: configCanonical });
      const prepared = await transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          hash,
        );
        if (replay) return { replay } as const;
        const program = await client.query<{
          template_code: string;
          status: string;
          authorization_status: string;
          current_release_id: string | null;
        }>(
          `SELECT mini.template_code,mini.status,authorization.status AS authorization_status,
                  mini.current_release_id
             FROM mini_programs mini
             JOIN external_authorizations authorization
               ON authorization.tenant_id=mini.tenant_id AND authorization.id=mini.authorization_id
            WHERE mini.tenant_id=$1 AND mini.id=$2 FOR UPDATE OF mini`,
          [command.identity.tenantId, input.miniProgramId],
        );
        const current = program.rows[0];
        if (
          !current ||
          current.authorization_status !== 'ACTIVE' ||
          current.status === 'AUTH_REVOKED'
        )
          throw new MiniProgramAuthorizationError();
        const release = await client.query<{ id: string }>(
          `INSERT INTO mini_program_releases(
             tenant_id,mini_program_id,template_version,config_version,config_snapshot,config_digest,
             status,previous_stable_release_id
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'DRAFT',$7) RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            input.templateVersion,
            input.configVersion,
            configCanonical,
            configDigest,
            current.current_release_id,
          ],
        );
        const releaseId = release.rows[0]!.id;
        await client.query(
          `UPDATE mini_program_releases SET status='BUILDING'
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, releaseId],
        );
        const attempt = await client.query<{ id: string }>(
          `INSERT INTO mini_program_external_attempts(
             tenant_id,mini_program_id,release_id,action,action_version,idempotency_key,status,request_summary
           ) VALUES ($1,$2,$3,'UPLOAD_PREVIEW',1,$4,'RUNNING',$5::jsonb) RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            releaseId,
            `mini-program:${input.miniProgramId}:preview:${releaseId}`,
            JSON.stringify({
              config_digest: configDigest,
              template_version: input.templateVersion,
            }),
          ],
        );
        return {
          claim: {
            releaseId,
            attemptId: attempt.rows[0]!.id,
            templateCode: current.template_code,
          },
        } as const;
      });
      if ('replay' in prepared) return prepared.replay;

      let build: MiniProgramBuildResult;
      try {
        build = await builder.build({
          miniProgramId: input.miniProgramId,
          templateCode: prepared.claim.templateCode,
          templateVersion: input.templateVersion,
          configVersion: input.configVersion,
          config: input.config,
          configDigest,
          traceId: command.traceId,
        });
      } catch {
        await transaction(command.identity.tenantId, async (client) => {
          await client.query(
            `UPDATE mini_program_releases SET status='BUILD_FAILED'
              WHERE tenant_id=$1 AND id=$2 AND status='BUILDING'`,
            [command.identity.tenantId, prepared.claim.releaseId],
          );
          await client.query(
            `UPDATE mini_program_external_attempts
                SET status='FAILED',error_code='BUILD_FAILED',completed_at=now()
              WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
            [command.identity.tenantId, prepared.claim.attemptId],
          );
        });
        throw new MiniProgramProviderError('template build failed');
      }
      if (!/^[a-f0-9]{64}$/.test(build.artifactDigest) || !build.smokeTestResult.passed) {
        await transaction(command.identity.tenantId, async (client) => {
          await client.query(
            `UPDATE mini_program_releases SET status='BUILD_FAILED'
              WHERE tenant_id=$1 AND id=$2 AND status='BUILDING'`,
            [command.identity.tenantId, prepared.claim.releaseId],
          );
          await client.query(
            `UPDATE mini_program_external_attempts
                SET status='FAILED',error_code='BUILD_VERIFICATION_FAILED',response_summary=$3::jsonb,
                    completed_at=now()
              WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
            [
              command.identity.tenantId,
              prepared.claim.attemptId,
              JSON.stringify({ smoke_test_result: build.smokeTestResult }),
            ],
          );
        });
        throw new MiniProgramProviderError('invalid or failed build artifact');
      }

      return transaction(command.identity.tenantId, async (client) => {
        const built = await client.query<{ id: string }>(
          `INSERT INTO mini_program_builds(
             tenant_id,mini_program_id,release_id,template_version,template_commit,config_version,
             config_digest,artifact_ref,artifact_digest,preview_ref,backend_api_version,
             database_compatibility_min,database_compatibility_max,smoke_test_result,built_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15) RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            prepared.claim.releaseId,
            input.templateVersion,
            build.templateCommit,
            input.configVersion,
            configDigest,
            build.artifactRef,
            build.artifactDigest,
            build.previewRef,
            build.backendApiVersion,
            build.databaseCompatibilityMin,
            build.databaseCompatibilityMax,
            JSON.stringify(build.smokeTestResult),
            command.identity.userId,
          ],
        );
        await client.query(
          `UPDATE mini_program_releases
              SET status='PREVIEW_READY',build_artifact_ref=$3,build_digest=$4,template_commit=$5,
                  backend_api_version=$6,database_compatibility_min=$7,database_compatibility_max=$8
            WHERE tenant_id=$1 AND id=$2 AND status='BUILDING'`,
          [
            command.identity.tenantId,
            prepared.claim.releaseId,
            build.artifactRef,
            build.artifactDigest,
            build.templateCommit,
            build.backendApiVersion,
            build.databaseCompatibilityMin,
            build.databaseCompatibilityMax,
          ],
        );
        await client.query(
          `UPDATE mini_program_external_attempts
              SET status='SUCCEEDED',response_summary=$3::jsonb,completed_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
          [
            command.identity.tenantId,
            prepared.claim.attemptId,
            JSON.stringify({
              build_id: built.rows[0]!.id,
              artifact_digest: build.artifactDigest,
              preview_ref: build.previewRef,
            }),
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'miniprogram.release_preview_ready.v1','mini_program_release',$2,1,
                     'miniprogram:' || $3,$4::jsonb,'INTERNAL',$5,now())`,
          [
            command.identity.tenantId,
            prepared.claim.releaseId,
            input.miniProgramId,
            JSON.stringify({
              release_id: prepared.claim.releaseId,
              mini_program_id: input.miniProgramId,
              template_version: input.templateVersion,
              preview_ref: build.previewRef,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `UPDATE mini_programs SET pending_release_id=$3
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.miniProgramId, prepared.claim.releaseId],
        );
        const project = await client.query<{ delivery_project_id: string }>(
          `SELECT delivery_project_id FROM mini_programs WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.miniProgramId],
        );
        if (project.rows[0]?.delivery_project_id) {
          await succeedDeliverySteps(
            client,
            command.identity.tenantId,
            project.rows[0].delivery_project_id,
            ['miniapp.upload_preview', 'miniapp.smoke_test'],
            build.previewRef,
          );
        }
        const response = await loadMiniProgram(
          client,
          command.identity.tenantId,
          input.miniProgramId,
        );
        await complete(client, command.identity.tenantId, scope, command.idempotencyKey, response);
        return response;
      });
    },

    async confirmPreview(command) {
      const input = ConfirmPreviewSchema.parse(command.body);
      if (!command.identity.roleCodes.includes('MERCHANT_OWNER'))
        throw new MiniProgramConfirmationError('merchant owner confirmation is required');
      const scope = 'miniprogram.release.confirm';
      const hash = requestHash(input);
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          hash,
        );
        if (replay) return replay;
        const build = await client.query<{
          id: string;
          config_digest: string;
          artifact_digest: string;
          merchant_chosen_name: string;
          delivery_project_id: string;
          publishing_confirmer_user_id: string;
        }>(
          `SELECT build.id,build.config_digest,build.artifact_digest,
                  mini.merchant_chosen_name,mini.delivery_project_id,
                  mini.publishing_confirmer_user_id
             FROM mini_program_releases release
             JOIN mini_program_builds build
               ON build.tenant_id=release.tenant_id AND build.release_id=release.id
             JOIN mini_programs mini
               ON mini.tenant_id=release.tenant_id AND mini.id=release.mini_program_id
            WHERE release.tenant_id=$1 AND release.id=$2 AND release.mini_program_id=$3
              AND release.status='PREVIEW_READY' FOR UPDATE OF release`,
          [command.identity.tenantId, input.releaseId, input.miniProgramId],
        );
        const current = build.rows[0];
        if (!current) throw new MiniProgramStateError('preview is not ready');
        if (current.publishing_confirmer_user_id !== command.identity.userId)
          throw new MiniProgramConfirmationError('assigned publishing confirmer is required');
        await client.query(
          `INSERT INTO mini_program_preview_confirmations(
             tenant_id,mini_program_id,release_id,build_id,config_digest,build_digest,checklist,confirmed_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            input.releaseId,
            current.id,
            current.config_digest,
            current.artifact_digest,
            JSON.stringify(input.checklist),
            command.identity.userId,
          ],
        );
        await client.query(
          `UPDATE mini_program_releases SET merchant_confirmed_by=$3,merchant_confirmed_at=now()
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.releaseId, command.identity.userId],
        );
        const intakeSession = await client.query<{ id: string }>(
          `SELECT id FROM merchant_intake_sessions
            WHERE tenant_id=$1 AND delivery_project_id=$2
            ORDER BY created_at DESC LIMIT 1`,
          [command.identity.tenantId, current.delivery_project_id],
        );
        if (!intakeSession.rows[0])
          throw new MiniProgramConfirmationError('delivery project lacks merchant intake evidence');
        await client.query(
          `INSERT INTO merchant_intake_confirmations(
             tenant_id,session_id,confirmation_type,confirmed_payload,confirmed_by,confirmation_channel
           ) VALUES
             ($1,$2,'PUBLISH_IMPACT',$3::jsonb,$5,'WEB_CLICK'),
             ($1,$2,'PAYMENT',$4::jsonb,$5,'WEB_CLICK')`,
          [
            command.identity.tenantId,
            intakeSession.rows[0].id,
            JSON.stringify({
              miniProgramName: current.merchant_chosen_name,
              wechatReviewDisclosureAccepted: true,
              checklist: input.checklist,
            }),
            JSON.stringify({ paymentSubjectConfirmed: true, checklist: input.checklist }),
            command.identity.userId,
          ],
        );
        await succeedDeliverySteps(client, command.identity.tenantId, current.delivery_project_id, [
          'merchant.preview',
          'merchant.confirm_preview',
        ]);
        const response = await loadMiniProgram(
          client,
          command.identity.tenantId,
          input.miniProgramId,
        );
        await complete(client, command.identity.tenantId, scope, command.idempotencyKey, response);
        return response;
      });
    },

    async submitReview(command) {
      const input = ReleaseActionSchema.parse(command.body);
      const scope = 'miniprogram.release.submit';
      const hash = requestHash(input);
      const prepared = await transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          hash,
        );
        if (replay) return { replay } as const;
        const release = await client.query<{
          app_id: string;
          artifact_ref: string;
          authorization_status: string;
          confirmation_id: string | null;
        }>(
          `SELECT mini.app_id,release.build_artifact_ref AS artifact_ref,
                  authorization.status AS authorization_status,confirmation.id AS confirmation_id
             FROM mini_program_releases release
             JOIN mini_programs mini ON mini.tenant_id=release.tenant_id AND mini.id=release.mini_program_id
             JOIN external_authorizations authorization
               ON authorization.tenant_id=mini.tenant_id AND authorization.id=mini.authorization_id
             LEFT JOIN mini_program_preview_confirmations confirmation
               ON confirmation.tenant_id=release.tenant_id AND confirmation.release_id=release.id
                 AND confirmation.config_digest=release.config_digest
                 AND confirmation.build_digest=release.build_digest
            WHERE release.tenant_id=$1 AND release.id=$2 AND release.mini_program_id=$3
              AND release.status='PREVIEW_READY' FOR UPDATE OF release`,
          [command.identity.tenantId, input.releaseId, input.miniProgramId],
        );
        const current = release.rows[0];
        if (!current?.confirmation_id) throw new MiniProgramConfirmationError();
        if (current.authorization_status !== 'ACTIVE') throw new MiniProgramAuthorizationError();
        await client.query(
          `UPDATE mini_program_releases SET status='SUBMITTED'
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.releaseId],
        );
        const attempt = await client.query<{ id: string }>(
          `INSERT INTO mini_program_external_attempts(
             tenant_id,mini_program_id,release_id,action,action_version,idempotency_key,status,request_summary
           ) VALUES ($1,$2,$3,'SUBMIT_REVIEW',1,$4,'RUNNING',$5::jsonb) RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            input.releaseId,
            `mini-program:${input.miniProgramId}:submit:${input.releaseId}`,
            JSON.stringify({ release_id: input.releaseId }),
          ],
        );
        return {
          claim: {
            appId: current.app_id,
            artifactRef: current.artifact_ref,
            attemptId: attempt.rows[0]!.id,
          },
        } as const;
      });
      if ('replay' in prepared) return prepared.replay;

      let submitted: { externalAuditId: string; externalRequestId: string };
      try {
        submitted = await provider.submitReview({
          appId: prepared.claim.appId,
          releaseId: input.releaseId,
          artifactRef: prepared.claim.artifactRef,
          idempotencyKey: `mini-program:${input.miniProgramId}:submit:${input.releaseId}`,
          traceId: command.traceId,
        });
      } catch {
        await finishAttempt(
          command.identity.tenantId,
          prepared.claim.attemptId,
          'UNKNOWN',
          {},
          'REVIEW_SUBMISSION_UNKNOWN',
        );
        throw new MiniProgramProviderError('review submission result is unknown');
      }
      return transaction(command.identity.tenantId, async (client) => {
        await client.query(
          `UPDATE mini_program_releases SET status='IN_REVIEW',external_audit_id=$3
            WHERE tenant_id=$1 AND id=$2 AND status='SUBMITTED'`,
          [command.identity.tenantId, input.releaseId, submitted.externalAuditId],
        );
        await client.query(
          `UPDATE mini_program_external_attempts
              SET status='SUCCEEDED',external_request_id=$3,response_summary=$4::jsonb,completed_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
          [
            command.identity.tenantId,
            prepared.claim.attemptId,
            submitted.externalRequestId,
            JSON.stringify({ external_audit_id: submitted.externalAuditId }),
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'miniprogram.release_submitted.v1','mini_program_release',$2,1,
                     'miniprogram:' || $3,$4::jsonb,'INTERNAL',$5,now())`,
          [
            command.identity.tenantId,
            input.releaseId,
            input.miniProgramId,
            JSON.stringify({
              release_id: input.releaseId,
              external_audit_id: submitted.externalAuditId,
              confirmed_by: command.identity.userId,
            }),
            command.traceId,
          ],
        );
        const project = await client.query<{ delivery_project_id: string }>(
          `SELECT delivery_project_id FROM mini_programs WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.miniProgramId],
        );
        if (project.rows[0]?.delivery_project_id) {
          await succeedDeliverySteps(
            client,
            command.identity.tenantId,
            project.rows[0].delivery_project_id,
            ['miniapp.submit_review'],
            submitted.externalAuditId,
          );
          await client.query(
            `UPDATE delivery_steps SET status='RUNNING',started_at=COALESCE(started_at,now())
              WHERE tenant_id=$1 AND project_id=$2 AND step_code='miniapp.review_watch'
                AND status IN ('PENDING','FAILED','BLOCKED')`,
            [command.identity.tenantId, project.rows[0].delivery_project_id],
          );
        }
        const response = await loadMiniProgram(
          client,
          command.identity.tenantId,
          input.miniProgramId,
        );
        await complete(client, command.identity.tenantId, scope, command.idempotencyKey, response);
        return response;
      });
    },

    async publish(command) {
      const input = ReleaseActionSchema.parse(command.body);
      const scope = 'miniprogram.release.publish';
      const hash = requestHash(input);
      const prepared = await transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          hash,
        );
        if (replay) return { replay } as const;
        const release = await client.query<{
          app_id: string;
          external_audit_id: string;
          previous_stable_release_id: string | null;
        }>(
          `SELECT mini.app_id,release.external_audit_id,release.previous_stable_release_id
             FROM mini_program_releases release
             JOIN mini_programs mini ON mini.tenant_id=release.tenant_id AND mini.id=release.mini_program_id
            WHERE release.tenant_id=$1 AND release.id=$2 AND release.mini_program_id=$3
              AND release.status='APPROVED' FOR UPDATE OF release`,
          [command.identity.tenantId, input.releaseId, input.miniProgramId],
        );
        const current = release.rows[0];
        if (!current?.external_audit_id)
          throw new MiniProgramStateError('only an approved reviewed release can publish');
        await client.query(
          `UPDATE mini_program_releases SET status='PUBLISHING'
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.releaseId],
        );
        const attempt = await client.query<{ id: string }>(
          `INSERT INTO mini_program_external_attempts(
             tenant_id,mini_program_id,release_id,action,action_version,idempotency_key,status
           ) VALUES ($1,$2,$3,'PUBLISH',1,$4,'RUNNING') RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            input.releaseId,
            `mini-program:${input.miniProgramId}:publish:${input.releaseId}`,
          ],
        );
        return { claim: { ...current, attemptId: attempt.rows[0]!.id } } as const;
      });
      if ('replay' in prepared) return prepared.replay;

      let externalVersion: string | null = null;
      let externalRequestId: string | null = null;
      let recoveredByQuery = false;
      try {
        const published = await provider.publish({
          appId: prepared.claim.app_id,
          releaseId: input.releaseId,
          externalAuditId: prepared.claim.external_audit_id,
          idempotencyKey: `mini-program:${input.miniProgramId}:publish:${input.releaseId}`,
          traceId: command.traceId,
        });
        externalVersion = published.externalVersion;
        externalRequestId = published.externalRequestId;
      } catch {
        const online = await provider.queryOnline({
          appId: prepared.claim.app_id,
          releaseId: input.releaseId,
          traceId: command.traceId,
        });
        if (online.releaseId === input.releaseId && online.externalVersion) {
          externalVersion = online.externalVersion;
          recoveredByQuery = true;
        }
      }
      if (!externalVersion) {
        await transaction(command.identity.tenantId, async (client) => {
          await client.query(
            `UPDATE mini_program_releases SET status='PUBLISH_FAILED'
              WHERE tenant_id=$1 AND id=$2 AND status='PUBLISHING'`,
            [command.identity.tenantId, input.releaseId],
          );
          await client.query(
            `UPDATE mini_program_external_attempts
                SET status='UNKNOWN',error_code='PUBLISH_RESULT_UNKNOWN',completed_at=now()
              WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
            [command.identity.tenantId, prepared.claim.attemptId],
          );
        });
        throw new MiniProgramProviderError('publish result remains unknown after online query');
      }
      return transaction(command.identity.tenantId, async (client) => {
        await client.query(
          `UPDATE mini_program_releases SET status='PUBLISHED',external_version=$3,published_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='PUBLISHING'`,
          [command.identity.tenantId, input.releaseId, externalVersion],
        );
        await client.query(
          `UPDATE mini_program_external_attempts
              SET status='SUCCEEDED',external_request_id=$3,response_summary=$4::jsonb,completed_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
          [
            command.identity.tenantId,
            prepared.claim.attemptId,
            externalRequestId,
            JSON.stringify({
              external_version: externalVersion,
              recovered_by_query: recoveredByQuery,
            }),
          ],
        );
        await client.query(
          `UPDATE mini_programs SET status='ACTIVE',last_stable_release_id=current_release_id,
                  current_release_id=$3,pending_release_id=NULL
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.miniProgramId, input.releaseId],
        );
        await client.query(
          `INSERT INTO mini_program_rollout_batches(
             tenant_id,mini_program_id,release_id,wave,status,traffic_percent,health_thresholds,
             observed_metrics,started_at,completed_at
           ) VALUES ($1,$2,$3,'INTERNAL','PASSED',1,'{}','{}',now(),now())
           ON CONFLICT (tenant_id,release_id,wave) DO NOTHING`,
          [command.identity.tenantId, input.miniProgramId, input.releaseId],
        );
        if (prepared.claim.previous_stable_release_id) {
          await client.query(
            `INSERT INTO mini_program_rollout_batches(
               tenant_id,mini_program_id,release_id,wave,status,traffic_percent,health_thresholds
             ) VALUES ($1,$2,$3,'PILOT','PENDING',5,$4::jsonb)
             ON CONFLICT (tenant_id,release_id,wave) DO NOTHING`,
            [
              command.identity.tenantId,
              input.miniProgramId,
              input.releaseId,
              JSON.stringify({ loginErrorRateMax: 0.01, paymentErrorRateMax: 0.001 }),
            ],
          );
        }
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'miniprogram.release_published.v1','mini_program_release',$2,1,
                     'miniprogram:' || $3,$4::jsonb,'INTERNAL',$5,now())`,
          [
            command.identity.tenantId,
            input.releaseId,
            input.miniProgramId,
            JSON.stringify({
              release_id: input.releaseId,
              mini_program_id: input.miniProgramId,
              external_version: externalVersion,
            }),
            command.traceId,
          ],
        );
        const project = await client.query<{ delivery_project_id: string }>(
          `SELECT delivery_project_id FROM mini_programs WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.miniProgramId],
        );
        if (project.rows[0]?.delivery_project_id) {
          await succeedDeliverySteps(
            client,
            command.identity.tenantId,
            project.rows[0].delivery_project_id,
            ['miniapp.release', 'miniapp.online_check'],
            externalVersion,
          );
        }
        const response = await loadMiniProgram(
          client,
          command.identity.tenantId,
          input.miniProgramId,
        );
        await complete(client, command.identity.tenantId, scope, command.idempotencyKey, response);
        return response;
      });
    },

    async rollback(command) {
      const input = RollbackSchema.parse(command.body);
      const scope = 'miniprogram.release.rollback';
      const hash = requestHash(input);
      const prepared = await transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          hash,
        );
        if (replay) return { replay } as const;
        const stable = await client.query<{
          app_id: string;
          current_release_id: string;
          stable_release_id: string;
          template_version: string;
          config_version: number;
          config_snapshot: unknown;
          config_digest: string;
          build_digest: string;
          build_artifact_ref: string;
          template_commit: string;
          backend_api_version: string;
          database_compatibility_min: string;
          database_compatibility_max: string;
        }>(
          `SELECT mini.app_id,mini.current_release_id,mini.last_stable_release_id AS stable_release_id,
                  stable.template_version,stable.config_version,stable.config_snapshot,stable.config_digest,
                  stable.build_digest,stable.build_artifact_ref,stable.template_commit,
                  stable.backend_api_version,stable.database_compatibility_min,
                  stable.database_compatibility_max
             FROM mini_programs mini
             JOIN mini_program_releases current
               ON current.tenant_id=mini.tenant_id AND current.id=mini.current_release_id
             JOIN mini_program_releases stable
               ON stable.tenant_id=mini.tenant_id AND stable.id=mini.last_stable_release_id
            WHERE mini.tenant_id=$1 AND mini.id=$2 AND current.status='PUBLISHED'
              AND mini.last_stable_release_id IS NOT NULL
              AND mini.last_stable_release_id <> mini.current_release_id
            FOR UPDATE OF mini,current`,
          [command.identity.tenantId, input.miniProgramId],
        );
        const previous = stable.rows[0];
        if (!previous) throw new MiniProgramStateError('no previous stable release is available');
        const release = await client.query<{ id: string }>(
          `INSERT INTO mini_program_releases(
             tenant_id,mini_program_id,template_version,config_version,config_snapshot,config_digest,
             build_digest,build_artifact_ref,template_commit,backend_api_version,
             database_compatibility_min,database_compatibility_max,status,rolled_back_from_id,
             previous_stable_release_id,rejection_reason
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,'DRAFT',$13,$14,$15)
           RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            previous.template_version,
            previous.config_version,
            JSON.stringify(previous.config_snapshot),
            previous.config_digest,
            previous.build_digest,
            previous.build_artifact_ref,
            previous.template_commit,
            previous.backend_api_version,
            previous.database_compatibility_min,
            previous.database_compatibility_max,
            previous.current_release_id,
            previous.stable_release_id,
            input.reason,
          ],
        );
        const releaseId = release.rows[0]!.id;
        await client.query(
          `INSERT INTO mini_program_builds(
             tenant_id,mini_program_id,release_id,template_version,template_commit,config_version,
             config_digest,artifact_ref,artifact_digest,preview_ref,backend_api_version,
             database_compatibility_min,database_compatibility_max,smoke_test_result,built_by
           ) SELECT $1,$2,$3,build.template_version,build.template_commit,build.config_version,
                    build.config_digest,build.artifact_ref,build.artifact_digest,build.preview_ref,
                    build.backend_api_version,build.database_compatibility_min,
                    build.database_compatibility_max,
                    jsonb_build_object('passed',true,'rollbackSourceBuildId',build.id),$5
               FROM mini_program_builds build
              WHERE build.tenant_id=$1 AND build.release_id=$4`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            releaseId,
            previous.stable_release_id,
            command.identity.userId,
          ],
        );
        await client.query(
          `UPDATE mini_program_releases SET status='PUBLISHING'
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, releaseId],
        );
        const attempt = await client.query<{ id: string }>(
          `INSERT INTO mini_program_external_attempts(
             tenant_id,mini_program_id,release_id,action,action_version,idempotency_key,status
           ) VALUES ($1,$2,$3,'ROLLBACK',1,$4,'RUNNING') RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            releaseId,
            `mini-program:${input.miniProgramId}:rollback:${releaseId}`,
          ],
        );
        return { claim: { ...previous, releaseId, attemptId: attempt.rows[0]!.id } } as const;
      });
      if ('replay' in prepared) return prepared.replay;

      let rolledBack: { externalVersion: string; externalRequestId: string };
      try {
        rolledBack = await provider.rollback({
          appId: prepared.claim.app_id,
          releaseId: prepared.claim.releaseId,
          artifactRef: prepared.claim.build_artifact_ref,
          idempotencyKey: `mini-program:${input.miniProgramId}:rollback:${prepared.claim.releaseId}`,
          traceId: command.traceId,
        });
      } catch {
        await finishAttempt(
          command.identity.tenantId,
          prepared.claim.attemptId,
          'UNKNOWN',
          {},
          'ROLLBACK_RESULT_UNKNOWN',
        );
        throw new MiniProgramProviderError('rollback result is unknown');
      }
      return transaction(command.identity.tenantId, async (client) => {
        await client.query(
          `UPDATE mini_program_releases SET status='PUBLISHED',external_version=$3,published_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='PUBLISHING'`,
          [command.identity.tenantId, prepared.claim.releaseId, rolledBack.externalVersion],
        );
        await client.query(
          `UPDATE mini_program_releases SET status='ROLLED_BACK'
            WHERE tenant_id=$1 AND id=$2 AND status='PUBLISHED'`,
          [command.identity.tenantId, prepared.claim.current_release_id],
        );
        await client.query(
          `UPDATE mini_programs SET current_release_id=$3,last_stable_release_id=$3,
                  pending_release_id=NULL,status='ACTIVE'
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.miniProgramId, prepared.claim.releaseId],
        );
        await client.query(
          `UPDATE mini_program_external_attempts
              SET status='SUCCEEDED',external_request_id=$3,response_summary=$4::jsonb,completed_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
          [
            command.identity.tenantId,
            prepared.claim.attemptId,
            rolledBack.externalRequestId,
            JSON.stringify({
              external_version: rolledBack.externalVersion,
              restored_release_id: prepared.claim.stable_release_id,
            }),
          ],
        );
        const response = await loadMiniProgram(
          client,
          command.identity.tenantId,
          input.miniProgramId,
        );
        await complete(client, command.identity.tenantId, scope, command.idempotencyKey, response);
        return response;
      });
    },

    async recordRolloutHealth(command) {
      const input = RolloutHealthSchema.parse(command.body);
      return transaction(command.identity.tenantId, async (client) => {
        const updated = await client.query(
          `UPDATE mini_program_rollout_batches
              SET status=CASE WHEN $5 THEN 'PASSED' ELSE 'HALTED' END,
                  observed_metrics=$4::jsonb,halted_reason=CASE WHEN $5 THEN NULL ELSE 'HEALTH_THRESHOLD_FAILED' END,
                  completed_at=now()
            WHERE tenant_id=$1 AND mini_program_id=$2 AND release_id=$3 AND wave=$6
              AND status IN ('PENDING','RUNNING') RETURNING id`,
          [
            command.identity.tenantId,
            input.miniProgramId,
            input.releaseId,
            JSON.stringify(input.observedMetrics),
            input.healthy,
            input.wave,
          ],
        );
        if (updated.rowCount !== 1) throw new MiniProgramStateError('rollout wave unavailable');
        if (input.healthy) {
          const order = ['INTERNAL', 'PILOT', 'CANARY', 'ALL'] as const;
          const next = order[order.indexOf(input.wave) + 1];
          if (next) {
            const traffic = next === 'PILOT' ? 5 : next === 'CANARY' ? 20 : 100;
            await client.query(
              `INSERT INTO mini_program_rollout_batches(
                 tenant_id,mini_program_id,release_id,wave,status,traffic_percent,health_thresholds
               ) VALUES ($1,$2,$3,$4,'PENDING',$5,$6::jsonb)
               ON CONFLICT (tenant_id,release_id,wave) DO NOTHING`,
              [
                command.identity.tenantId,
                input.miniProgramId,
                input.releaseId,
                next,
                traffic,
                JSON.stringify({ loginErrorRateMax: 0.01, paymentErrorRateMax: 0.001 }),
              ],
            );
          }
        }
        return loadMiniProgram(client, command.identity.tenantId, input.miniProgramId);
      });
    },

    async handleProviderEvent(event) {
      const input = z
        .object({
          tenantId: UuidSchema,
          appId: z.string().min(1),
          providerEventId: z.string().min(1).max(255),
          eventType: z.enum(['AUTH_REVOKED', 'REVIEW_APPROVED', 'REVIEW_REJECTED']),
          externalAuditId: z.string().optional(),
          reasonCode: z.string().optional(),
          reasonSummary: z.string().max(1000).optional(),
          ciphertextHash: z.string().regex(/^[a-f0-9]{64}$/),
          encryptedPayloadObjectRef: z.string().min(1),
          receivedAt: z.iso.datetime({ offset: true }),
          traceId: z.string().min(1),
        })
        .parse(event);
      return transaction(input.tenantId, async (client) => {
        const program = await client.query<{ id: string; delivery_project_id: string }>(
          `SELECT id,delivery_project_id FROM mini_programs
            WHERE tenant_id=$1 AND app_id_hash=$2 FOR UPDATE`,
          [input.tenantId, digest(input.appId)],
        );
        const current = program.rows[0];
        if (!current) throw new MiniProgramStateError('callback AppID is not bound to tenant');
        const existing = await client.query<{ ciphertext_hash: string }>(
          `SELECT ciphertext_hash FROM mini_program_provider_events
            WHERE provider_event_id=$1`,
          [input.providerEventId],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].ciphertext_hash !== input.ciphertextHash)
            throw new MiniProgramCallbackConflictError();
          return loadMiniProgram(client, input.tenantId, current.id);
        }
        let releaseId: string | null = null;
        if (input.eventType === 'AUTH_REVOKED') {
          await client.query(
            `UPDATE external_authorizations authorization SET status='REVOKED'
              FROM mini_programs mini
             WHERE mini.tenant_id=$1 AND mini.id=$2
               AND authorization.tenant_id=mini.tenant_id AND authorization.id=mini.authorization_id`,
            [input.tenantId, current.id],
          );
          await client.query(
            `UPDATE delivery_steps SET status='BLOCKED',last_error_code='APP_ID_AUTHORIZATION_REVOKED',
                    last_error_message='商户已撤销 AppID 授权'
              WHERE tenant_id=$1 AND project_id=$2 AND step_code LIKE 'miniapp.%'
                AND status IN ('PENDING','WAITING_AUTH','RUNNING','FAILED')`,
            [input.tenantId, current.delivery_project_id],
          );
          await client.query(
            `UPDATE delivery_projects SET status='WAITING_AUTHORIZATION',wait_category='MERCHANT',
                    blocking_reason_code='APP_ID_AUTHORIZATION_REVOKED',version=version+1
              WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('DELIVERED','OPERATING','CANCELLED')`,
            [input.tenantId, current.delivery_project_id],
          );
        } else {
          if (!input.externalAuditId)
            throw new MiniProgramStateError('review callback lacks audit id');
          const release = await client.query<{ id: string }>(
            `UPDATE mini_program_releases SET status=$4,rejection_reason=$5
              WHERE tenant_id=$1 AND mini_program_id=$2 AND external_audit_id=$3
                AND status IN ('SUBMITTED','IN_REVIEW') RETURNING id`,
            [
              input.tenantId,
              current.id,
              input.externalAuditId,
              input.eventType === 'REVIEW_APPROVED' ? 'APPROVED' : 'REJECTED',
              input.eventType === 'REVIEW_REJECTED'
                ? `${input.reasonCode ?? 'OTHER'}:${input.reasonSummary ?? ''}`
                : null,
            ],
          );
          releaseId = release.rows[0]?.id ?? null;
          if (!releaseId)
            throw new MiniProgramStateError('review callback does not match active release');
          if (input.eventType === 'REVIEW_REJECTED') {
            await client.query(
              `UPDATE delivery_steps SET status='FAILED',last_error_code=$3,last_error_message=$4
                WHERE tenant_id=$1 AND project_id=$2 AND step_code='miniapp.review_watch'`,
              [
                input.tenantId,
                current.delivery_project_id,
                input.reasonCode ?? 'REVIEW_REJECTED',
                input.reasonSummary ?? '微信审核驳回',
              ],
            );
            await client.query(
              `INSERT INTO delivery_exceptions(
                 tenant_id,project_id,step_id,category,retryable,error_code,employee_message,
                 responsibility,next_action
               ) SELECT $1,$2,id,'REJECTED',false,$3,$4,'MERCHANT','修正后生成新配置版本并重新确认'
                   FROM delivery_steps WHERE tenant_id=$1 AND project_id=$2
                     AND step_code='miniapp.review_watch'`,
              [
                input.tenantId,
                current.delivery_project_id,
                input.reasonCode ?? 'REVIEW_REJECTED',
                input.reasonSummary ?? '微信审核驳回',
              ],
            );
          } else {
            await succeedDeliverySteps(
              client,
              input.tenantId,
              current.delivery_project_id,
              ['miniapp.review_watch'],
              input.externalAuditId,
            );
          }
        }
        await client.query(
          `INSERT INTO mini_program_provider_events(
             tenant_id,mini_program_id,release_id,provider_event_id,event_type,ciphertext_hash,
             encrypted_payload_object_ref,decoded_summary,processing_status,received_at,processed_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'PROCESSED',$9,now())`,
          [
            input.tenantId,
            current.id,
            releaseId,
            input.providerEventId,
            input.eventType,
            input.ciphertextHash,
            input.encryptedPayloadObjectRef,
            JSON.stringify({
              external_audit_id: input.externalAuditId ?? null,
              reason_code: input.reasonCode ?? null,
            }),
            input.receivedAt,
          ],
        );
        if (input.eventType === 'REVIEW_REJECTED') {
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
               payload,pii_classification,trace_id,occurred_at
             ) VALUES ($1,'miniprogram.release_rejected.v1','mini_program_release',$2,1,
                       'miniprogram:' || $3,$4::jsonb,'INTERNAL',$5,now())`,
            [
              input.tenantId,
              releaseId,
              current.id,
              JSON.stringify({
                release_id: releaseId,
                reason_code: input.reasonCode ?? 'OTHER',
                reason_summary: input.reasonSummary ?? '',
                external_audit_id: input.externalAuditId,
              }),
              input.traceId,
            ],
          );
        }
        return loadMiniProgram(client, input.tenantId, current.id);
      });
    },

    async get(identity, rawMiniProgramId) {
      const miniProgramId = UuidSchema.parse(rawMiniProgramId);
      return transaction(identity.tenantId, (client) =>
        loadMiniProgram(client, identity.tenantId, miniProgramId),
      );
    },
  };
}
