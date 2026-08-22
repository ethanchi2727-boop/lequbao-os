import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const CreateProjectSchema = z.object({
  merchantProfileId: UuidSchema,
  storeId: UuidSchema,
  subscriptionId: UuidSchema,
});
const ProjectActionSchema = z.object({ projectId: UuidSchema });
const ExecuteStepSchema = z.object({
  projectId: UuidSchema,
  stepCode: z.string().min(1).max(120),
  inputSnapshot: z.record(z.string(), z.unknown()).default({}),
});
const AcceptSchema = z.object({
  projectId: UuidSchema,
  checklist: z.record(z.string(), z.boolean()),
  additionalAcceptorIds: z.array(UuidSchema).default([]),
});
const AssignSchema = z.object({
  projectId: UuidSchema,
  assigneeUserId: UuidSchema,
  accessScope: z.array(z.enum(['DELIVERY_MATERIALS', 'STEP_EXECUTION'])).min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});

const StepSchema = z.object({
  id: UuidSchema,
  stepCode: z.string(),
  stepGroup: z.string(),
  required: z.boolean(),
  executionMode: z.enum(['AUTOMATED', 'HUMAN_CONFIRMATION', 'EXTERNAL_REVIEW']),
  status: z.enum([
    'PENDING',
    'WAITING_INPUT',
    'WAITING_AUTH',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'BLOCKED',
    'SKIPPED',
  ]),
  attemptCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  resultRef: z.string().nullable(),
});
const ProjectSchema = z.object({
  id: UuidSchema,
  merchantProfileId: UuidSchema,
  storeId: UuidSchema,
  subscriptionId: UuidSchema,
  workflowCode: z.literal('merchant_delivery_standard'),
  workflowVersion: z.number().int().positive(),
  ruleVersion: z.number().int().positive(),
  status: z.enum([
    'DRAFT',
    'WAITING_MERCHANT_INPUT',
    'WAITING_AUTHORIZATION',
    'PROVISIONING',
    'PARTIALLY_FAILED',
    'BLOCKED',
    'ACCEPTANCE',
    'DELIVERED',
    'OPERATING',
    'SUSPENDED',
    'CANCELLED',
  ]),
  progressPercent: z.number().int().min(0).max(100),
  missingItems: z.array(z.string()),
  blockingReasonCode: z.string().nullable(),
  waitCategory: z.enum(['PLATFORM', 'MERCHANT', 'WECHAT', 'THIRD_PARTY', 'INTERNAL']).nullable(),
  acceptedBy: UuidSchema.nullable(),
  acceptedAt: z.string().nullable(),
  platformProcessingSeconds: z.string().regex(/^\d+$/),
  merchantWaitSeconds: z.string().regex(/^\d+$/),
  externalWaitSeconds: z.string().regex(/^\d+$/),
  version: z.number().int().positive(),
  steps: z.array(StepSchema),
});

export type DeliveryProject = z.infer<typeof ProjectSchema>;

export type DeliveryGatewayResult =
  | { status: 'SUCCEEDED'; output: Record<string, unknown>; resultRef?: string }
  | {
      status: 'FAILED' | 'PARTIALLY_FAILED' | 'UNKNOWN';
      errorCode: string;
      employeeMessage: string;
      retryable: boolean;
      responsibility:
        'PLATFORM' | 'MERCHANT' | 'BUSINESS' | 'PRODUCT' | 'ENGINEERING' | 'WECHAT' | 'THIRD_PARTY';
      nextAction: string;
      output?: Record<string, unknown>;
    };

export interface DeliveryStepGateway {
  execute(input: {
    tenantId: string;
    projectId: string;
    stepCode: string;
    actionVersion: number;
    idempotencyKey: string;
    inputSnapshot: Record<string, unknown>;
  }): Promise<DeliveryGatewayResult>;
}

interface UserCommand {
  identity: SessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface DeliveryWorkflowService {
  create(command: UserCommand): Promise<DeliveryProject>;
  start(command: UserCommand): Promise<DeliveryProject>;
  executeStep(command: UserCommand): Promise<DeliveryProject>;
  retryStep(command: UserCommand): Promise<DeliveryProject>;
  accept(command: UserCommand): Promise<DeliveryProject>;
  suspend(command: UserCommand): Promise<DeliveryProject>;
  assignTemporaryAccess(command: UserCommand): Promise<DeliveryProject>;
  get(identity: SessionIdentity, projectId: string): Promise<DeliveryProject>;
  listExceptions(identity: SessionIdentity, status?: string): Promise<DeliveryException[]>;
}

export interface DeliveryException {
  id: string;
  projectId: string;
  stepCode: string | null;
  category: string;
  status: string;
  retryable: boolean;
  errorCode: string;
  employeeMessage: string;
  responsibility: string;
  nextAction: string;
  openedAt: string;
}

export class DeliveryPrerequisiteError extends Error {}
export class DeliveryStateError extends Error {}
export class DeliveryAcceptanceError extends Error {}
export class DeliveryAuthorizationError extends Error {}
export class DeliveryExecutionUnavailableError extends Error {}

interface StepDefinition {
  code: string;
  group: string;
  mode: 'AUTOMATED' | 'HUMAN_CONFIRMATION' | 'EXTERNAL_REVIEW';
  responsibility: 'PLATFORM' | 'MERCHANT' | 'WECHAT';
  dependsOn: string[];
  retryable: boolean;
}

const define = (
  group: string,
  code: string,
  mode: StepDefinition['mode'] = 'AUTOMATED',
  responsibility: StepDefinition['responsibility'] = 'PLATFORM',
  dependsOn: string[] = [],
  retryable = false,
): StepDefinition => ({ code, group, mode, responsibility, dependsOn, retryable });

export const STANDARD_898_STEPS: readonly StepDefinition[] = [
  define('MERCHANT_PROFILE', 'merchant.create'),
  define('MERCHANT_PROFILE', 'brand.create', 'AUTOMATED', 'PLATFORM', ['merchant.create']),
  define('MERCHANT_PROFILE', 'store.create', 'AUTOMATED', 'PLATFORM', ['brand.create']),
  define('MERCHANT_PROFILE', 'staff.invite', 'AUTOMATED', 'PLATFORM', ['store.create']),
  define('MERCHANT_PROFILE', 'profile.validate', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'store.create',
  ]),
  define('MINI_PROGRAM_AUTH', 'miniapp.choose_mode', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'profile.validate',
  ]),
  define('MINI_PROGRAM_AUTH', 'miniapp.authorize', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'miniapp.choose_mode',
  ]),
  define(
    'MINI_PROGRAM_AUTH',
    'miniapp.permission_check',
    'AUTOMATED',
    'PLATFORM',
    ['miniapp.authorize'],
    true,
  ),
  define('MINI_PROGRAM_AUTH', 'payment.bind', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'miniapp.authorize',
  ]),
  define('MINI_PROGRAM_AUTH', 'miniapp.owner_confirm', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'payment.bind',
  ]),
  define('CONTENT', 'template.select', 'HUMAN_CONFIRMATION', 'MERCHANT', ['profile.validate']),
  define('CONTENT', 'page.configure', 'AUTOMATED', 'PLATFORM', ['template.select'], true),
  define('CONTENT', 'catalog.import', 'AUTOMATED', 'PLATFORM', ['profile.validate'], true),
  define('CONTENT', 'knowledge.seed', 'AUTOMATED', 'PLATFORM', ['profile.validate'], true),
  define('CONTENT', 'ai_service.configure', 'AUTOMATED', 'PLATFORM', ['knowledge.seed'], true),
  define('CONTENT', 'geo.profile_build', 'AUTOMATED', 'PLATFORM', ['profile.validate'], true),
  define(
    'PREVIEW',
    'miniapp.upload_preview',
    'AUTOMATED',
    'PLATFORM',
    ['page.configure', 'miniapp.permission_check'],
    true,
  ),
  define(
    'PREVIEW',
    'miniapp.smoke_test',
    'AUTOMATED',
    'PLATFORM',
    ['miniapp.upload_preview'],
    true,
  ),
  define('PREVIEW', 'merchant.preview', 'HUMAN_CONFIRMATION', 'MERCHANT', ['miniapp.smoke_test']),
  define('PREVIEW', 'merchant.confirm_preview', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'merchant.preview',
  ]),
  define('REVIEW_RELEASE', 'miniapp.submit_review', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'merchant.confirm_preview',
  ]),
  define(
    'REVIEW_RELEASE',
    'miniapp.review_watch',
    'EXTERNAL_REVIEW',
    'WECHAT',
    ['miniapp.submit_review'],
    true,
  ),
  define('REVIEW_RELEASE', 'miniapp.rejection_route', 'AUTOMATED', 'PLATFORM', [
    'miniapp.review_watch',
  ]),
  define('REVIEW_RELEASE', 'miniapp.release_confirm', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'miniapp.review_watch',
  ]),
  define('REVIEW_RELEASE', 'miniapp.release', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'miniapp.release_confirm',
  ]),
  define(
    'REVIEW_RELEASE',
    'miniapp.online_check',
    'AUTOMATED',
    'PLATFORM',
    ['miniapp.release'],
    true,
  ),
  define('LAUNCH', 'geo.preview', 'HUMAN_CONFIRMATION', 'MERCHANT', ['geo.profile_build']),
  define('LAUNCH', 'geo.publish', 'AUTOMATED', 'PLATFORM', ['geo.preview'], true),
  define('LAUNCH', 'geo.evidence_collect', 'AUTOMATED', 'PLATFORM', ['geo.publish'], true),
  define(
    'LAUNCH',
    'launch.material_generate',
    'AUTOMATED',
    'PLATFORM',
    ['miniapp.online_check'],
    true,
  ),
  define('LAUNCH', 'launch.first_offer', 'HUMAN_CONFIRMATION', 'MERCHANT', ['catalog.import']),
  define('LAUNCH', 'launch.staff_task', 'AUTOMATED', 'PLATFORM', ['staff.invite']),
  define('ACCEPTANCE', 'acceptance.business_flow', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'miniapp.online_check',
    'launch.first_offer',
  ]),
  define('ACCEPTANCE', 'acceptance.ai_handoff', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'ai_service.configure',
  ]),
  define('ACCEPTANCE', 'acceptance.geo', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'geo.evidence_collect',
  ]),
  define('ACCEPTANCE', 'acceptance.merchant_signoff', 'HUMAN_CONFIRMATION', 'MERCHANT', [
    'acceptance.business_flow',
    'acceptance.ai_handoff',
    'acceptance.geo',
  ]),
  define('OPERATIONS', 'operation.day7_task', 'AUTOMATED', 'PLATFORM', [
    'acceptance.merchant_signoff',
  ]),
  define('OPERATIONS', 'operation.day30_task', 'AUTOMATED', 'PLATFORM', [
    'acceptance.merchant_signoff',
  ]),
] as const;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const STEP_CONFIRMATIONS: Readonly<Record<string, readonly string[]>> = {
  'payment.bind': ['PAYMENT'],
  'launch.first_offer': ['PRICE', 'REFUND_RULE'],
  'miniapp.submit_review': ['PUBLISH_IMPACT'],
  'miniapp.release': ['PAYMENT', 'PUBLISH_IMPACT'],
};

async function reserve(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  requestHash: string,
) {
  const inserted = await client.query(
    `INSERT INTO idempotency_keys(tenant_id, scope, idempotency_key, request_hash, expires_at)
     VALUES ($1,$2,$3,$4,now() + interval '24 hours')
     ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING RETURNING id`,
    [tenantId, scope, key, requestHash],
  );
  if (inserted.rowCount === 1) return undefined;
  const existing = await client.query<{ request_hash: string; response_body: unknown }>(
    `SELECT request_hash, response_body FROM idempotency_keys
      WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
    [tenantId, scope, key],
  );
  const replay = existing.rows[0];
  if (!replay || replay.request_hash !== requestHash) throw new IdempotencyConflictError();
  return ProjectSchema.parse(replay.response_body);
}

async function complete(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  project: DeliveryProject,
) {
  await client.query(
    `UPDATE idempotency_keys SET response_status=200, response_body=$4::jsonb,
            resource_type='delivery_project', resource_id=$5
      WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
    [tenantId, scope, key, JSON.stringify(project), project.id],
  );
}

async function loadProject(
  client: pg.PoolClient,
  tenantId: string,
  projectId: string,
): Promise<DeliveryProject> {
  const project = await client.query<{
    id: string;
    merchant_profile_id: string;
    store_id: string;
    subscription_id: string;
    workflow_code: string;
    workflow_version: number;
    rule_version: number;
    status: string;
    progress_percent: number;
    missing_items: string[];
    blocking_reason_code: string | null;
    wait_category: string | null;
    accepted_by: string | null;
    accepted_at: Date | string | null;
    platform_processing_seconds: string;
    merchant_wait_seconds: string;
    external_wait_seconds: string;
    version: number;
  }>(
    `SELECT id, merchant_profile_id, store_id, subscription_id, workflow_code,
            workflow_version, rule_version, status, progress_percent, missing_items,
            blocking_reason_code, wait_category, accepted_by, accepted_at,
            platform_processing_seconds::text, merchant_wait_seconds::text,
            external_wait_seconds::text, version
       FROM delivery_projects WHERE tenant_id=$1 AND id=$2`,
    [tenantId, projectId],
  );
  const row = project.rows[0];
  if (!row?.merchant_profile_id || !row.store_id || !row.subscription_id)
    throw new DeliveryStateError('delivery project unavailable');
  const steps = await client.query<{
    id: string;
    step_code: string;
    step_group: string;
    required_step: boolean;
    execution_mode: string;
    status: string;
    attempt_count: number;
    last_error_code: string | null;
    result_ref: string | null;
  }>(
    `SELECT id, step_code, step_group, required_step, execution_mode, status,
            attempt_count, last_error_code, result_ref
       FROM delivery_steps WHERE tenant_id=$1 AND project_id=$2 ORDER BY id`,
    [tenantId, projectId],
  );
  return ProjectSchema.parse({
    id: row.id,
    merchantProfileId: row.merchant_profile_id,
    storeId: row.store_id,
    subscriptionId: row.subscription_id,
    workflowCode: row.workflow_code,
    workflowVersion: row.workflow_version,
    ruleVersion: row.rule_version,
    status: row.status,
    progressPercent: row.progress_percent,
    missingItems: row.missing_items,
    blockingReasonCode: row.blocking_reason_code,
    waitCategory: row.wait_category,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    platformProcessingSeconds: row.platform_processing_seconds,
    merchantWaitSeconds: row.merchant_wait_seconds,
    externalWaitSeconds: row.external_wait_seconds,
    version: row.version,
    steps: steps.rows.map((step) => ({
      id: step.id,
      stepCode: step.step_code,
      stepGroup: step.step_group,
      required: step.required_step,
      executionMode: step.execution_mode,
      status: step.status,
      attemptCount: step.attempt_count,
      lastErrorCode: step.last_error_code,
      resultRef: step.result_ref,
    })),
  });
}

function missingProfileItems(row: {
  legal_subject_name: string | null;
  business_license_object_key: string | null;
  contact_name_ciphertext: string | null;
  contact_mobile_ciphertext: string | null;
  store_name: string | null;
  address_ciphertext: string | null;
  longitude: string | null;
  latitude: string | null;
  opening_hours: unknown;
}) {
  const missing: string[] = [];
  if (!row.legal_subject_name) missing.push('merchant.legal_subject_name');
  if (!row.business_license_object_key) missing.push('merchant.business_license');
  if (!row.contact_name_ciphertext) missing.push('merchant.contact_name');
  if (!row.contact_mobile_ciphertext) missing.push('merchant.contact_mobile');
  if (!row.store_name) missing.push('store.name');
  if (!row.address_ciphertext) missing.push('store.address');
  if (!row.longitude || !row.latitude) missing.push('store.location');
  if (!Array.isArray(row.opening_hours) || row.opening_hours.length === 0)
    missing.push('store.opening_hours');
  return missing;
}

export function createDeliveryWorkflowService(
  pool: Pick<pg.Pool, 'connect'>,
  gateway?: DeliveryStepGateway,
): DeliveryWorkflowService {
  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
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

  async function getWithAccess(identity: SessionIdentity, rawProjectId: string) {
    const projectId = UuidSchema.parse(rawProjectId);
    return transaction(identity.tenantId, async (client) => {
      if (identity.roleCodes.includes('REGIONAL_PROVIDER')) {
        const assignment = await client.query(
          `SELECT 1 FROM delivery_project_assignments
            WHERE tenant_id=$1 AND project_id=$2 AND assignee_user_id=$3
              AND access_scope @> ARRAY['DELIVERY_MATERIALS']::text[]
              AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
          [identity.tenantId, projectId, identity.userId],
        );
        if (assignment.rowCount !== 1) throw new DeliveryAuthorizationError();
      }
      return loadProject(client, identity.tenantId, projectId);
    });
  }

  async function assertAssignedExecution(
    client: pg.PoolClient,
    identity: SessionIdentity,
    projectId: string,
  ) {
    if (!identity.roleCodes.includes('REGIONAL_PROVIDER')) return;
    const assignment = await client.query(
      `SELECT 1 FROM delivery_project_assignments
        WHERE tenant_id=$1 AND project_id=$2 AND assignee_user_id=$3
          AND access_scope @> ARRAY['STEP_EXECUTION']::text[]
          AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
      [identity.tenantId, projectId, identity.userId],
    );
    if (assignment.rowCount !== 1) throw new DeliveryAuthorizationError();
  }

  async function setWaitingForAuthorization(
    client: pg.PoolClient,
    identity: SessionIdentity,
    projectId: string,
    traceId: string,
  ) {
    await client.query(
      `UPDATE delivery_projects SET status='WAITING_AUTHORIZATION', wait_category='MERCHANT',
              blocking_reason_code='WECHAT_APPID_AUTHORIZATION_REQUIRED', version=version+1
        WHERE tenant_id=$1 AND id=$2`,
      [identity.tenantId, projectId],
    );
    await client.query(
      `UPDATE delivery_steps SET status='WAITING_AUTH', last_error_code='AUTHORIZATION_REQUIRED'
        WHERE tenant_id=$1 AND project_id=$2 AND step_code='miniapp.authorize'`,
      [identity.tenantId, projectId],
    );
    await client.query(
      `INSERT INTO outbox_events(
         tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
         payload,pii_classification,trace_id,occurred_at
       ) SELECT $1,'delivery.authorization_required.v1','delivery_project',id,version,
                'delivery:' || id,$3::jsonb,'INTERNAL',$4,now()
           FROM delivery_projects WHERE tenant_id=$1 AND id=$2`,
      [
        identity.tenantId,
        projectId,
        JSON.stringify({
          project_id: projectId,
          step_code: 'miniapp.authorize',
          provider: 'WECHAT_COMPONENT',
          authorization_url_ref: null,
        }),
        traceId,
      ],
    );
  }

  async function execute(command: UserCommand, retryOnly: boolean): Promise<DeliveryProject> {
    const input = ExecuteStepSchema.parse(command.body);
    const scope = retryOnly ? 'delivery.step.retry' : 'delivery.step.execute';
    const requestHash = hash(input);
    const prepared = await transaction(command.identity.tenantId, async (client) => {
      const replay = await reserve(
        client,
        command.identity.tenantId,
        scope,
        command.idempotencyKey,
        requestHash,
      );
      if (replay) return { replay } as const;
      await assertAssignedExecution(client, command.identity, input.projectId);
      const step = await client.query<{
        id: string;
        status: string;
        attempt_count: number;
        action_version: number;
        depends_on: string[];
        retryable: boolean;
      }>(
        `SELECT id,status,attempt_count,action_version,depends_on,retryable
           FROM delivery_steps WHERE tenant_id=$1 AND project_id=$2 AND step_code=$3 FOR UPDATE`,
        [command.identity.tenantId, input.projectId, input.stepCode],
      );
      const current = step.rows[0];
      if (!current) throw new DeliveryStateError('delivery step unavailable');
      if (retryOnly && !['FAILED', 'BLOCKED'].includes(current.status))
        throw new DeliveryStateError('only a failed or blocked step can be retried');
      if (!retryOnly && !['PENDING', 'FAILED', 'BLOCKED'].includes(current.status))
        throw new DeliveryStateError('delivery step cannot execute from current state');
      if (retryOnly && !current.retryable)
        throw new DeliveryStateError('delivery step is not retryable');
      const dependencies = await client.query(
        `SELECT 1 FROM delivery_steps
          WHERE tenant_id=$1 AND project_id=$2 AND step_code=ANY($3::text[])
            AND status <> 'SUCCEEDED' LIMIT 1`,
        [command.identity.tenantId, input.projectId, current.depends_on],
      );
      if (dependencies.rowCount) throw new DeliveryPrerequisiteError('step dependency incomplete');

      if (input.stepCode.startsWith('miniapp.') && input.stepCode !== 'miniapp.choose_mode') {
        const authorization = await client.query(
          `SELECT 1 FROM external_authorizations
            WHERE tenant_id=$1 AND provider='WECHAT_COMPONENT' AND status='ACTIVE'
              AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
          [command.identity.tenantId],
        );
        if (authorization.rowCount !== 1) {
          await setWaitingForAuthorization(
            client,
            command.identity,
            input.projectId,
            command.traceId,
          );
          const blocked = await loadProject(client, command.identity.tenantId, input.projectId);
          await complete(client, command.identity.tenantId, scope, command.idempotencyKey, blocked);
          return { replay: blocked } as const;
        }
      }
      const requiredConfirmations = STEP_CONFIRMATIONS[input.stepCode] ?? [];
      if (requiredConfirmations.length > 0) {
        const confirmations = await client.query<{
          confirmation_type: string;
          confirmed_payload: unknown;
        }>(
          `SELECT DISTINCT ON (confirmation.confirmation_type)
                  confirmation.confirmation_type,confirmation.confirmed_payload
             FROM merchant_intake_sessions session
             JOIN merchant_intake_confirmations confirmation
               ON confirmation.tenant_id=session.tenant_id AND confirmation.session_id=session.id
            WHERE session.tenant_id=$1 AND session.delivery_project_id=$2
              AND confirmation.confirmation_type=ANY($3::text[])
            ORDER BY confirmation.confirmation_type,confirmation.confirmed_at DESC`,
          [command.identity.tenantId, input.projectId, requiredConfirmations],
        );
        const confirmedTypes = new Set(confirmations.rows.map((row) => row.confirmation_type));
        const missingConfirmations = requiredConfirmations.filter(
          (confirmation) => !confirmedTypes.has(confirmation),
        );
        const publishConfirmation = confirmations.rows.find(
          (row) => row.confirmation_type === 'PUBLISH_IMPACT',
        )?.confirmed_payload;
        if (
          requiredConfirmations.includes('PUBLISH_IMPACT') &&
          (!publishConfirmation ||
            typeof publishConfirmation !== 'object' ||
            typeof (publishConfirmation as Record<string, unknown>).miniProgramName !== 'string' ||
            !(publishConfirmation as Record<string, unknown>).wechatReviewDisclosureAccepted)
        ) {
          missingConfirmations.push('PUBLISH_IMPACT_NAME_AND_WECHAT_REVIEW');
        }
        if (missingConfirmations.length > 0) {
          const missingItems = [
            ...new Set(missingConfirmations.map((item) => `confirmation.${item}`)),
          ];
          await client.query(
            `UPDATE delivery_steps SET status='WAITING_INPUT',last_error_code='MERCHANT_CONFIRMATION_REQUIRED'
              WHERE tenant_id=$1 AND project_id=$2 AND id=$3`,
            [command.identity.tenantId, input.projectId, current.id],
          );
          await client.query(
            `UPDATE delivery_projects SET status='WAITING_MERCHANT_INPUT',missing_items=$3::text[],
                    wait_category='MERCHANT',blocking_reason_code='MERCHANT_CONFIRMATION_REQUIRED',
                    version=version+1
              WHERE tenant_id=$1 AND id=$2`,
            [command.identity.tenantId, input.projectId, missingItems],
          );
          const blocked = await loadProject(client, command.identity.tenantId, input.projectId);
          await complete(client, command.identity.tenantId, scope, command.idempotencyKey, blocked);
          return { replay: blocked } as const;
        }
      }
      if (!gateway) throw new DeliveryExecutionUnavailableError();
      const actionVersion = retryOnly ? current.action_version + 1 : current.action_version;
      const attemptNo = current.attempt_count + 1;
      const executionKey = `delivery:${input.projectId}:${input.stepCode}:v${actionVersion}`;
      const attempt = await client.query<{ id: string }>(
        `INSERT INTO delivery_step_attempts(
           tenant_id,project_id,step_id,attempt_no,action_version,idempotency_key,status,input_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6,'RUNNING',$7::jsonb) RETURNING id`,
        [
          command.identity.tenantId,
          input.projectId,
          current.id,
          attemptNo,
          actionVersion,
          executionKey,
          JSON.stringify(input.inputSnapshot),
        ],
      );
      await client.query(
        `UPDATE delivery_steps SET status='RUNNING',attempt_count=$4,action_version=$5,
                started_at=COALESCE(started_at,now()),last_error_code=NULL,last_error_message=NULL
          WHERE tenant_id=$1 AND project_id=$2 AND id=$3`,
        [command.identity.tenantId, input.projectId, current.id, attemptNo, actionVersion],
      );
      return {
        claim: {
          attemptId: attempt.rows[0]!.id,
          stepId: current.id,
          attemptNo,
          actionVersion,
          executionKey,
        },
      } as const;
    });
    if ('replay' in prepared) return prepared.replay;

    let result: DeliveryGatewayResult;
    try {
      result = await gateway!.execute({
        tenantId: command.identity.tenantId,
        projectId: input.projectId,
        stepCode: input.stepCode,
        actionVersion: prepared.claim.actionVersion,
        idempotencyKey: prepared.claim.executionKey,
        inputSnapshot: input.inputSnapshot,
      });
    } catch {
      result = {
        status: 'UNKNOWN',
        errorCode: 'PROVIDER_RESULT_UNKNOWN',
        employeeMessage: '第三方结果待确认，请先查询实际状态',
        retryable: false,
        responsibility: 'THIRD_PARTY',
        nextAction: '查询第三方实际状态',
      };
    }

    return transaction(command.identity.tenantId, async (client) => {
      const terminalStatus =
        result.status === 'SUCCEEDED'
          ? 'SUCCEEDED'
          : result.status === 'UNKNOWN'
            ? 'UNKNOWN'
            : 'FAILED';
      await client.query(
        `UPDATE delivery_step_attempts
            SET status=$4,retryable=$5,error_code=$6,error_message=$7,
                output_snapshot=$8::jsonb,completed_at=now()
          WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND status='RUNNING'`,
        [
          command.identity.tenantId,
          input.projectId,
          prepared.claim.attemptId,
          terminalStatus,
          result.status === 'SUCCEEDED' ? false : result.retryable,
          result.status === 'SUCCEEDED' ? null : result.errorCode,
          result.status === 'SUCCEEDED' ? null : result.employeeMessage,
          JSON.stringify(result.status === 'SUCCEEDED' ? result.output : (result.output ?? {})),
        ],
      );
      if (result.status === 'SUCCEEDED') {
        await client.query(
          `UPDATE delivery_steps SET status='SUCCEEDED',output_snapshot=$4::jsonb,result_ref=$5,
                  completed_at=now(),last_error_code=NULL,last_error_message=NULL
            WHERE tenant_id=$1 AND project_id=$2 AND id=$3`,
          [
            command.identity.tenantId,
            input.projectId,
            prepared.claim.stepId,
            JSON.stringify(result.output),
            result.resultRef ?? null,
          ],
        );
      } else {
        await client.query(
          `UPDATE delivery_steps SET status=$4,last_error_code=$5,last_error_message=$6,
                  next_retry_at=CASE WHEN $7 THEN now() + interval '1 minute' ELSE NULL END
            WHERE tenant_id=$1 AND project_id=$2 AND id=$3`,
          [
            command.identity.tenantId,
            input.projectId,
            prepared.claim.stepId,
            result.status === 'UNKNOWN' ? 'BLOCKED' : 'FAILED',
            result.errorCode,
            result.employeeMessage,
            result.retryable,
          ],
        );
        const category =
          result.status === 'UNKNOWN'
            ? 'UNKNOWN'
            : result.responsibility === 'MERCHANT'
              ? 'PARAMETER'
              : result.responsibility === 'WECHAT'
                ? 'REJECTED'
                : 'INTERNAL';
        await client.query(
          `INSERT INTO delivery_exceptions(
             tenant_id,project_id,step_id,category,retryable,error_code,employee_message,
             responsibility,next_action,owner_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            command.identity.tenantId,
            input.projectId,
            prepared.claim.stepId,
            category,
            result.retryable,
            result.errorCode,
            result.employeeMessage,
            result.responsibility,
            result.nextAction,
            command.identity.userId,
          ],
        );
      }
      const counts = await client.query<{ required_count: string; succeeded_count: string }>(
        `SELECT count(*) FILTER (WHERE required_step)::text AS required_count,
                count(*) FILTER (WHERE required_step AND status='SUCCEEDED')::text AS succeeded_count
           FROM delivery_steps WHERE tenant_id=$1 AND project_id=$2`,
        [command.identity.tenantId, input.projectId],
      );
      const required = Number(counts.rows[0]?.required_count ?? 0);
      const succeeded = Number(counts.rows[0]?.succeeded_count ?? 0);
      const progress = required === 0 ? 0 : Math.floor((succeeded * 100) / required);
      const projectStatus =
        result.status === 'PARTIALLY_FAILED'
          ? 'PARTIALLY_FAILED'
          : result.status === 'UNKNOWN'
            ? 'BLOCKED'
            : result.status === 'FAILED'
              ? 'PARTIALLY_FAILED'
              : progress === 100
                ? 'ACCEPTANCE'
                : 'PROVISIONING';
      await client.query(
        `UPDATE delivery_projects SET status=$3,progress_percent=$4,
                blocking_reason_code=$5,wait_category=$6,version=version+1
          WHERE tenant_id=$1 AND id=$2`,
        [
          command.identity.tenantId,
          input.projectId,
          projectStatus,
          progress,
          result.status === 'SUCCEEDED' ? null : result.errorCode,
          result.status === 'UNKNOWN'
            ? 'THIRD_PARTY'
            : result.status === 'SUCCEEDED'
              ? 'PLATFORM'
              : 'INTERNAL',
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(
           tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
           payload,pii_classification,trace_id,occurred_at
         ) SELECT $1,$3,'delivery_project',id,version,'delivery:' || id,$4::jsonb,'INTERNAL',$5,now()
             FROM delivery_projects WHERE tenant_id=$1 AND id=$2`,
        [
          command.identity.tenantId,
          input.projectId,
          result.status === 'SUCCEEDED' ? 'delivery.step_succeeded.v1' : 'delivery.step_failed.v1',
          JSON.stringify({
            project_id: input.projectId,
            step_code: input.stepCode,
            progress_percent: progress,
            ...(result.status === 'SUCCEEDED'
              ? { result_ref: result.resultRef ?? null }
              : { error_code: result.errorCode, retryable: result.retryable }),
          }),
          command.traceId,
        ],
      );
      const project = await loadProject(client, command.identity.tenantId, input.projectId);
      await complete(client, command.identity.tenantId, scope, command.idempotencyKey, project);
      return project;
    });
  }

  return {
    async create(command) {
      const input = CreateProjectSchema.parse(command.body);
      const requestHash = hash(input);
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          'delivery.project.create',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
        const prerequisites = await client.query(
          `SELECT 1
             FROM merchant_profiles profile
             JOIN stores store ON store.tenant_id=profile.tenant_id AND store.id=$3
             JOIN tenant_subscriptions subscription ON subscription.tenant_id=profile.tenant_id AND subscription.id=$4
            WHERE profile.tenant_id=$1 AND profile.id=$2
              AND subscription.plan_code='STANDARD_898_MONTH'
              AND subscription.status IN ('TRIAL','ACTIVE')
              AND store.status IN ('DRAFT','ACTIVE')`,
          [command.identity.tenantId, input.merchantProfileId, input.storeId, input.subscriptionId],
        );
        if (prerequisites.rowCount !== 1)
          throw new DeliveryPrerequisiteError(
            'active 898 subscription and merchant store are required',
          );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO delivery_projects(
             tenant_id,merchant_profile_id,store_id,subscription_id,project_type,status,
             workflow_code,workflow_version,rule_version,owner_user_id
           ) VALUES ($1,$2,$3,$4,'STANDARD_898','DRAFT','merchant_delivery_standard',1,1,$5)
           RETURNING id`,
          [
            command.identity.tenantId,
            input.merchantProfileId,
            input.storeId,
            input.subscriptionId,
            command.identity.userId,
          ],
        );
        const projectId = inserted.rows[0]!.id;
        await client.query(
          `INSERT INTO delivery_steps(
             tenant_id,project_id,step_code,step_group,required_step,execution_mode,
             responsibility,depends_on,retryable,max_auto_attempts
           ) SELECT $1,$2,step.code,step.group_code,true,step.mode,step.responsibility,
                    step.depends_on,step.retryable,CASE WHEN step.retryable THEN 2 ELSE 0 END
               FROM jsonb_to_recordset($3::jsonb) AS step(
                 code text,group_code text,mode text,responsibility text,depends_on text[],retryable boolean
               )`,
          [
            command.identity.tenantId,
            projectId,
            JSON.stringify(
              STANDARD_898_STEPS.map((step) => ({
                code: step.code,
                group_code: step.group,
                mode: step.mode,
                responsibility: step.responsibility,
                depends_on: step.dependsOn,
                retryable: step.retryable,
              })),
            ),
          ],
        );
        await client.query(
          `INSERT INTO delivery_status_history(tenant_id,project_id,to_status,changed_by)
           VALUES ($1,$2,'DRAFT',$3)`,
          [command.identity.tenantId, projectId, command.identity.userId],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'delivery.project_created.v1','delivery_project',$2,1,$3,$4::jsonb,'INTERNAL',$5,now())`,
          [
            command.identity.tenantId,
            projectId,
            `delivery:${projectId}`,
            JSON.stringify({
              project_id: projectId,
              store_id: input.storeId,
              package_code: 'STANDARD_898_MONTH',
              step_codes: STANDARD_898_STEPS.map((step) => step.code),
            }),
            command.traceId,
          ],
        );
        const project = await loadProject(client, command.identity.tenantId, projectId);
        await complete(
          client,
          command.identity.tenantId,
          'delivery.project.create',
          command.idempotencyKey,
          project,
        );
        return project;
      });
    },

    async start(command) {
      const input = ProjectActionSchema.parse(command.body);
      const requestHash = hash(input);
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          'delivery.project.start',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
        await assertAssignedExecution(client, command.identity, input.projectId);
        const details = await client.query<{
          status: string;
          legal_subject_name: string | null;
          business_license_object_key: string | null;
          contact_name_ciphertext: string | null;
          contact_mobile_ciphertext: string | null;
          store_name: string | null;
          address_ciphertext: string | null;
          longitude: string | null;
          latitude: string | null;
          opening_hours: unknown;
        }>(
          `SELECT project.status,profile.legal_subject_name,profile.business_license_object_key,
                  profile.contact_name_ciphertext,profile.contact_mobile_ciphertext,store.store_name,
                  store.address_ciphertext,store.longitude::text,store.latitude::text,store.opening_hours
             FROM delivery_projects project
             JOIN merchant_profiles profile ON profile.tenant_id=project.tenant_id AND profile.id=project.merchant_profile_id
             JOIN stores store ON store.tenant_id=project.tenant_id AND store.id=project.store_id
            WHERE project.tenant_id=$1 AND project.id=$2 FOR UPDATE OF project`,
          [command.identity.tenantId, input.projectId],
        );
        const row = details.rows[0];
        if (
          !row ||
          !['DRAFT', 'WAITING_MERCHANT_INPUT', 'WAITING_AUTHORIZATION', 'SUSPENDED'].includes(
            row.status,
          )
        )
          throw new DeliveryStateError('delivery project cannot start from current state');
        const missing = missingProfileItems(row);
        if (missing.length > 0) {
          await client.query(
            `UPDATE delivery_projects SET status='WAITING_MERCHANT_INPUT',missing_items=$3::text[],
                    wait_category='MERCHANT',blocking_reason_code='MERCHANT_PROFILE_INCOMPLETE',version=version+1
              WHERE tenant_id=$1 AND id=$2`,
            [command.identity.tenantId, input.projectId, missing],
          );
          await client.query(
            `UPDATE delivery_steps SET status='WAITING_INPUT',last_error_code='MERCHANT_PROFILE_INCOMPLETE'
              WHERE tenant_id=$1 AND project_id=$2 AND step_code='profile.validate'`,
            [command.identity.tenantId, input.projectId],
          );
        } else {
          const authorization = await client.query(
            `SELECT 1 FROM external_authorizations
              WHERE tenant_id=$1 AND provider='WECHAT_COMPONENT' AND status='ACTIVE'
                AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
            [command.identity.tenantId],
          );
          if (authorization.rowCount !== 1) {
            await setWaitingForAuthorization(
              client,
              command.identity,
              input.projectId,
              command.traceId,
            );
          } else {
            await client.query(
              `UPDATE delivery_projects SET status='PROVISIONING',missing_items='{}',wait_category='PLATFORM',
                      blocking_reason_code=NULL,platform_started_at=COALESCE(platform_started_at,now()),version=version+1
                WHERE tenant_id=$1 AND id=$2`,
              [command.identity.tenantId, input.projectId],
            );
          }
        }
        await client.query(
          `INSERT INTO delivery_status_history(
             tenant_id,project_id,from_status,to_status,wait_category,reason_code,changed_by
           ) SELECT $1,$2,$3,status,wait_category,blocking_reason_code,$4
               FROM delivery_projects WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.projectId, row.status, command.identity.userId],
        );
        const project = await loadProject(client, command.identity.tenantId, input.projectId);
        await complete(
          client,
          command.identity.tenantId,
          'delivery.project.start',
          command.idempotencyKey,
          project,
        );
        return project;
      });
    },

    executeStep(command) {
      return execute(command, false);
    },

    retryStep(command) {
      return execute(command, true);
    },

    async accept(command) {
      const input = AcceptSchema.parse(command.body);
      const requestHash = hash(input);
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          'delivery.project.accept',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
        const incomplete = await client.query(
          `SELECT 1 FROM delivery_steps
            WHERE tenant_id=$1 AND project_id=$2 AND required_step AND status <> 'SUCCEEDED' LIMIT 1`,
          [command.identity.tenantId, input.projectId],
        );
        if (incomplete.rowCount)
          throw new DeliveryAcceptanceError('required delivery step incomplete');
        const steps = await client.query<{
          step_code: string;
          status: string;
          result_ref: string | null;
        }>(
          `SELECT step_code,status,result_ref FROM delivery_steps
            WHERE tenant_id=$1 AND project_id=$2 AND required_step ORDER BY step_code`,
          [command.identity.tenantId, input.projectId],
        );
        const acceptedAt = new Date();
        const acceptedByIds = [
          ...new Set([command.identity.userId, ...input.additionalAcceptorIds]),
        ];
        const receiptBody = {
          projectId: input.projectId,
          checklist: input.checklist,
          requiredSteps: steps.rows,
          acceptedByIds,
          acceptedAt: acceptedAt.toISOString(),
        };
        const receipt = await client.query<{ id: string }>(
          `INSERT INTO delivery_acceptance_receipts(
             tenant_id,project_id,checklist,required_step_snapshot,accepted_by_ids,accepted_at,receipt_hash
           ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::uuid[],$6,$7) RETURNING id`,
          [
            command.identity.tenantId,
            input.projectId,
            JSON.stringify(input.checklist),
            JSON.stringify(steps.rows),
            acceptedByIds,
            acceptedAt,
            hash(receiptBody),
          ],
        );
        await client.query(
          `UPDATE delivery_projects SET status='DELIVERED',progress_percent=100,accepted_by=$3,
                  accepted_at=$4,wait_category=NULL,blocking_reason_code=NULL,version=version+1
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.projectId, command.identity.userId, acceptedAt],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) SELECT $1,'delivery.project_delivered.v1','delivery_project',id,version,
                    'delivery:' || id,$3::jsonb,'INTERNAL',$4,now()
               FROM delivery_projects WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            input.projectId,
            JSON.stringify({
              project_id: input.projectId,
              accepted_by: acceptedByIds,
              accepted_at: acceptedAt.toISOString(),
              checklist_ref: receipt.rows[0]!.id,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id,actor_type,actor_id,action,resource_type,resource_id,
             permission_code,result_code,after_redacted,trace_id
           ) VALUES ($1,'USER',$2,'ACCEPT','delivery_project',$3,'delivery.accept','SUCCESS',$4::jsonb,$5)`,
          [
            command.identity.tenantId,
            command.identity.userId,
            input.projectId,
            JSON.stringify({ receipt_id: receipt.rows[0]!.id, accepted_by_ids: acceptedByIds }),
            command.traceId,
          ],
        );
        const project = await loadProject(client, command.identity.tenantId, input.projectId);
        await complete(
          client,
          command.identity.tenantId,
          'delivery.project.accept',
          command.idempotencyKey,
          project,
        );
        return project;
      });
    },

    async suspend(command) {
      const input = ProjectActionSchema.parse(command.body);
      const requestHash = hash(input);
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          'delivery.project.suspend',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
        await assertAssignedExecution(client, command.identity, input.projectId);
        const updated = await client.query<{ from_status: string }>(
          `WITH current AS (
             SELECT status AS from_status FROM delivery_projects
              WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('DELIVERED','OPERATING','CANCELLED','SUSPENDED')
              FOR UPDATE
           )
           UPDATE delivery_projects project
              SET status='SUSPENDED',wait_category='INTERNAL',blocking_reason_code='MANUALLY_SUSPENDED',
                  version=version+1
             FROM current WHERE project.tenant_id=$1 AND project.id=$2
           RETURNING current.from_status`,
          [command.identity.tenantId, input.projectId],
        );
        const fromStatus = updated.rows[0]?.from_status;
        if (!fromStatus) throw new DeliveryStateError('delivery project cannot be suspended');
        await client.query(
          `INSERT INTO delivery_status_history(
             tenant_id,project_id,from_status,to_status,wait_category,reason_code,changed_by
           ) VALUES ($1,$2,$3,'SUSPENDED','INTERNAL','MANUALLY_SUSPENDED',$4)`,
          [command.identity.tenantId, input.projectId, fromStatus, command.identity.userId],
        );
        const project = await loadProject(client, command.identity.tenantId, input.projectId);
        await complete(
          client,
          command.identity.tenantId,
          'delivery.project.suspend',
          command.idempotencyKey,
          project,
        );
        return project;
      });
    },

    async assignTemporaryAccess(command) {
      const input = AssignSchema.parse(command.body);
      const requestHash = hash(input);
      return transaction(command.identity.tenantId, async (client) => {
        if (command.identity.roleCodes.includes('REGIONAL_PROVIDER'))
          throw new DeliveryAuthorizationError();
        const replay = await reserve(
          client,
          command.identity.tenantId,
          'delivery.project.assign',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
        const expiresAt = new Date(input.expiresAt);
        if (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 30 * 86_400_000)
          throw new DeliveryPrerequisiteError('temporary access must expire within 30 days');
        await client.query(
          `INSERT INTO delivery_project_assignments(
             tenant_id,project_id,assignee_user_id,access_scope,granted_by,expires_at
           ) VALUES ($1,$2,$3,$4::text[],$5,$6)
           ON CONFLICT (tenant_id,project_id,assignee_user_id) DO UPDATE
             SET access_scope=EXCLUDED.access_scope,granted_by=EXCLUDED.granted_by,
                 granted_at=now(),expires_at=EXCLUDED.expires_at,revoked_at=NULL,revoke_reason=NULL`,
          [
            command.identity.tenantId,
            input.projectId,
            input.assigneeUserId,
            input.accessScope,
            command.identity.userId,
            expiresAt,
          ],
        );
        const project = await loadProject(client, command.identity.tenantId, input.projectId);
        await complete(
          client,
          command.identity.tenantId,
          'delivery.project.assign',
          command.idempotencyKey,
          project,
        );
        return project;
      });
    },

    get: getWithAccess,

    async listExceptions(identity, rawStatus = 'OPEN') {
      const status = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']).parse(rawStatus);
      return transaction(identity.tenantId, async (client) => {
        const rows = await client.query<{
          id: string;
          project_id: string;
          step_code: string | null;
          category: string;
          status: string;
          retryable: boolean;
          error_code: string;
          employee_message: string;
          responsibility: string;
          next_action: string;
          opened_at: Date | string;
        }>(
          `SELECT exception.id,exception.project_id,step.step_code,exception.category,
                  exception.status,exception.retryable,exception.error_code,
                  exception.employee_message,exception.responsibility,exception.next_action,
                  exception.opened_at
             FROM delivery_exceptions exception
             JOIN delivery_projects project
               ON project.tenant_id=exception.tenant_id AND project.id=exception.project_id
             LEFT JOIN delivery_steps step ON step.id=exception.step_id
            WHERE exception.tenant_id=$1 AND exception.status=$2
              AND ($3::boolean = false OR EXISTS (
                SELECT 1 FROM delivery_project_assignments assignment
                 WHERE assignment.tenant_id=exception.tenant_id
                   AND assignment.project_id=exception.project_id
                   AND assignment.assignee_user_id=$4
                   AND assignment.access_scope @> ARRAY['DELIVERY_MATERIALS']::text[]
                   AND assignment.revoked_at IS NULL AND assignment.expires_at > now()
              ))
            ORDER BY exception.opened_at,exception.id`,
          [
            identity.tenantId,
            status,
            identity.roleCodes.includes('REGIONAL_PROVIDER'),
            identity.userId,
          ],
        );
        return rows.rows.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          stepCode: row.step_code,
          category: row.category,
          status: row.status,
          retryable: row.retryable,
          errorCode: row.error_code,
          employeeMessage: row.employee_message,
          responsibility: row.responsibility,
          nextAction: row.next_action,
          openedAt: new Date(row.opened_at).toISOString(),
        }));
      });
    },
  };
}
