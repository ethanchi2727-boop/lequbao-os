import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const ChannelSchema = z.enum(['WEB', 'MOBILE_H5', 'WECOM']);
const ConfirmationTypeSchema = z.enum([
  'LEGAL_SUBJECT',
  'PAYMENT',
  'PRICE',
  'REFUND_RULE',
  'PUBLIC_CONTACT',
  'PUBLISH_IMPACT',
]);
const ImpactTargetSchema = z.enum(['MINI_PROGRAM', 'GEO', 'AI_SERVICE', 'PRODUCT', 'GROUP_BUY']);
const CreateSessionSchema = z.object({
  merchantProfileId: UuidSchema.nullable().optional(),
  deliveryProjectId: UuidSchema.nullable().optional(),
  channel: ChannelSchema,
  initialText: z.string().min(1).max(4000).nullable().optional(),
});
const AddAssetSchema = z.object({
  sessionId: UuidSchema,
  assetType: z.enum(['IMAGE', 'DOCUMENT', 'AUDIO', 'TEXT']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  objectKey: z.string().min(1).max(1000),
  originalFilename: z.string().max(255).nullable().optional(),
  mimeType: z.string().max(255).nullable().optional(),
  sourceMessageId: z.string().max(255).nullable().optional(),
});
const CandidateInputSchema = z.object({
  fieldPath: z.string().min(1).max(255),
  candidateValue: z.unknown(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
const ProcessingResultSchema = z.discriminatedUnion('securityStatus', [
  z.object({
    assetId: UuidSchema,
    securityStatus: z.literal('SAFE'),
    candidates: z.array(CandidateInputSchema),
    missingItems: z.array(z.string().min(1).max(255)).default([]),
    impactTargets: z.array(ImpactTargetSchema).default([]),
  }),
  z.object({
    assetId: UuidSchema,
    securityStatus: z.enum(['REJECTED', 'FAILED']),
    errorCode: z.string().min(1).max(120),
  }),
]);
const ConfirmSchema = z.object({
  sessionId: UuidSchema,
  confirmationType: ConfirmationTypeSchema,
  confirmedPayload: z.record(z.string(), z.unknown()),
  candidateIds: z.array(UuidSchema).min(1),
  confirmationChannel: z.enum(['WEB_CLICK', 'MOBILE_CLICK', 'WECOM_SECURE_CARD']),
  expectedVersion: z.int().positive(),
});
const CommitSchema = z.object({ sessionId: UuidSchema, expectedVersion: z.int().positive() });

const FieldSchema = z.object({
  id: UuidSchema,
  fieldPath: z.string(),
  candidateValue: z.unknown(),
  confidence: z.number().nullable(),
  decisionStatus: z.enum(['PROPOSED', 'CONFIRMED', 'CORRECTED', 'REJECTED', 'CONFLICT']),
  sourceAssetId: UuidSchema,
});
const SessionResponseSchema = z.object({
  id: UuidSchema,
  merchantProfileId: UuidSchema.nullable(),
  deliveryProjectId: UuidSchema.nullable(),
  channel: ChannelSchema,
  status: z.enum([
    'COLLECTING',
    'EXTRACTING',
    'WAITING_ANSWERS',
    'WAITING_CONFIRMATION',
    'CONFIRMED',
    'PUBLISHING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
  ]),
  fields: z.array(FieldSchema),
  missingItems: z.array(z.string()),
  impactTargets: z.array(ImpactTargetSchema),
  version: z.int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const AssetResponseSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  securityStatus: z.enum(['PENDING', 'SAFE', 'REJECTED', 'FAILED']),
  processingStatus: z.enum(['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED']),
});
const CommitResponseSchema = z.object({
  sessionId: UuidSchema,
  merchantProfileId: UuidSchema,
  status: z.literal('CONFIRMED'),
  changedFieldPaths: z.array(z.string()),
  impactTargets: z.array(ImpactTargetSchema),
});

export type MerchantIntakeSessionResponse = z.infer<typeof SessionResponseSchema>;
export class MerchantIntakeAuthorizationError extends Error {}
export class MerchantIntakeStateError extends Error {}
export class MerchantIntakeConflictError extends Error {}
export class MerchantIntakeConfirmationError extends Error {}

interface UserCommand {
  identity: SessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}
interface ProcessCommand {
  tenantId: string;
  idempotencyKey: string;
  traceId: string;
  processorId: string;
  body: unknown;
}

export interface MerchantIntakeService {
  createSession(command: UserCommand): Promise<MerchantIntakeSessionResponse>;
  getSession(identity: SessionIdentity, sessionId: string): Promise<MerchantIntakeSessionResponse>;
  addAsset(command: UserCommand): Promise<z.infer<typeof AssetResponseSchema>>;
  recordProcessingResult(command: ProcessCommand): Promise<MerchantIntakeSessionResponse>;
  confirm(command: UserCommand): Promise<MerchantIntakeSessionResponse>;
  commit(command: UserCommand): Promise<z.infer<typeof CommitResponseSchema>>;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const CREATE_WRITE_ROLES = [
  'BUSINESS_DEVELOPER',
  'INVESTMENT_OPERATOR',
  'REGIONAL_PROVIDER',
  'MERCHANT_OWNER',
  'PLATFORM_OPERATOR',
];
const CONFIRM_ROLES = ['MERCHANT_OWNER', 'PLATFORM_OPERATOR'];

export function requiresRegionalIntakeAssignment(roleCodes: string[]): boolean {
  return (
    roleCodes.includes('REGIONAL_PROVIDER') &&
    !roleCodes.some((role) => role !== 'REGIONAL_PROVIDER' && CREATE_WRITE_ROLES.includes(role))
  );
}

async function reserve(
  client: pg.PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  requestHash: string,
) {
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

async function assertActiveRole(
  client: pg.PoolClient,
  identity: SessionIdentity,
  allowedRoles: string[],
) {
  const tokenRoles = identity.roleCodes.filter((role) => allowedRoles.includes(role));
  if (tokenRoles.length === 0) throw new MerchantIntakeAuthorizationError();
  const result = await client.query(
    `SELECT 1 FROM tenant_memberships membership
       JOIN member_role_assignments assignment
         ON assignment.tenant_id = membership.tenant_id AND assignment.user_id = membership.user_id
      WHERE membership.tenant_id = $1 AND membership.user_id = $2
        AND membership.membership_status = 'ACTIVE'
        AND assignment.role_code = ANY($3::text[])
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now()) LIMIT 1`,
    [identity.tenantId, identity.userId, tokenRoles],
  );
  if (result.rowCount !== 1) throw new MerchantIntakeAuthorizationError();
}

async function assertRegionalProjectAssignment(
  client: pg.PoolClient,
  identity: SessionIdentity,
  options: { projectId?: string | null | undefined; sessionId?: string | undefined },
) {
  if (!requiresRegionalIntakeAssignment(identity.roleCodes)) return;
  const assignment = options.projectId
    ? await client.query(
        `SELECT 1 FROM delivery_project_assignments
          WHERE tenant_id=$1 AND project_id=$2 AND assignee_user_id=$3
            AND access_scope @> ARRAY['DELIVERY_MATERIALS']::text[]
            AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
        [identity.tenantId, options.projectId, identity.userId],
      )
    : await client.query(
        `SELECT 1 FROM merchant_intake_sessions session
          JOIN delivery_project_assignments assignment
            ON assignment.tenant_id=session.tenant_id AND assignment.project_id=session.delivery_project_id
         WHERE session.tenant_id=$1 AND session.id=$2 AND assignment.assignee_user_id=$3
           AND assignment.access_scope @> ARRAY['DELIVERY_MATERIALS']::text[]
           AND assignment.revoked_at IS NULL AND assignment.expires_at > now() LIMIT 1`,
        [identity.tenantId, options.sessionId, identity.userId],
      );
  if (assignment.rowCount !== 1) throw new MerchantIntakeAuthorizationError();
}

async function loadSession(
  client: pg.PoolClient,
  tenantId: string,
  sessionId: string,
): Promise<MerchantIntakeSessionResponse> {
  const session = await client.query<{
    id: string;
    merchant_profile_id: string | null;
    delivery_project_id: string | null;
    channel: string;
    status: string;
    missing_items: string[];
    impact_targets: string[];
    version: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, merchant_profile_id, delivery_project_id, channel, status, missing_items,
            impact_targets, version, created_at, updated_at
       FROM merchant_intake_sessions WHERE tenant_id = $1 AND id = $2`,
    [tenantId, sessionId],
  );
  if (!session.rows[0]) throw new MerchantIntakeStateError('session unavailable');
  const fields = await client.query<{
    id: string;
    field_path: string;
    candidate_value: unknown;
    confidence: string | null;
    decision_status: string;
    asset_id: string;
  }>(
    `SELECT id, field_path, candidate_value, confidence::text, decision_status, asset_id
       FROM merchant_intake_field_candidates
      WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at, id`,
    [tenantId, sessionId],
  );
  const row = session.rows[0];
  return SessionResponseSchema.parse({
    id: row.id,
    merchantProfileId: row.merchant_profile_id,
    deliveryProjectId: row.delivery_project_id,
    channel: row.channel,
    status: row.status,
    fields: fields.rows.map((field) => ({
      id: field.id,
      fieldPath: field.field_path,
      candidateValue: field.candidate_value,
      confidence: field.confidence === null ? null : Number(field.confidence),
      decisionStatus: field.decision_status,
      sourceAssetId: field.asset_id,
    })),
    missingItems: row.missing_items,
    impactTargets: row.impact_targets,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

export function createMerchantIntakeService(pool: Pick<pg.Pool, 'connect'>): MerchantIntakeService {
  async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
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
    async createSession(command) {
      const input = CreateSessionSchema.parse(command.body);
      const tenantId = command.identity.tenantId;
      const requestHash = hash(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'merchant-intake.session.create',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return SessionResponseSchema.parse(replay);
        await assertActiveRole(client, command.identity, CREATE_WRITE_ROLES);
        await assertRegionalProjectAssignment(client, command.identity, {
          projectId: input.deliveryProjectId,
        });
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO merchant_intake_sessions(
             tenant_id, merchant_profile_id, delivery_project_id, channel, created_by, last_message_at
           ) VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END)
           RETURNING id`,
          [
            tenantId,
            input.merchantProfileId ?? null,
            input.deliveryProjectId ?? null,
            input.channel,
            command.identity.userId,
            input.initialText ?? null,
          ],
        );
        const sessionId = inserted.rows[0]!.id;
        if (input.initialText) {
          const textHash = hash(input.initialText);
          await client.query(
            `INSERT INTO merchant_intake_assets(
               tenant_id, session_id, source_channel, asset_type, object_key, mime_type, sha256,
               security_status, processing_status, created_by
             ) VALUES ($1, $2, $3, 'TEXT', $4, 'text/plain', $5, 'SAFE', 'SUCCEEDED', $6)`,
            [
              tenantId,
              sessionId,
              input.channel,
              `inline:${textHash}`,
              textHash,
              command.identity.userId,
            ],
          );
        }
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES ($1, 'merchant.intake_session_created.v1', 'intake_session', $2, 1,
                     $3, $4::jsonb, 'PERSONAL', $5, now())`,
          [
            tenantId,
            sessionId,
            `intake:${sessionId}`,
            JSON.stringify({
              session_id: sessionId,
              merchant_profile_id: input.merchantProfileId ?? null,
              channel: input.channel,
              created_by: command.identity.userId,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'CREATE', 'merchant_intake_session', $3,
                     'merchant.intake.create', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            command.identity.userId,
            sessionId,
            JSON.stringify({ channel: input.channel, hasInitialText: Boolean(input.initialText) }),
            command.traceId,
          ],
        );
        const response = await loadSession(client, tenantId, sessionId);
        await complete(
          client,
          tenantId,
          'merchant-intake.session.create',
          command.idempotencyKey,
          response,
          'merchant_intake_session',
          sessionId,
        );
        return response;
      });
    },

    async getSession(identity, rawSessionId) {
      const sessionId = UuidSchema.parse(rawSessionId);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [identity.tenantId]);
        await assertActiveRole(client, identity, CREATE_WRITE_ROLES);
        await assertRegionalProjectAssignment(client, identity, { sessionId });
        return loadSession(client, identity.tenantId, sessionId);
      });
    },

    async addAsset(command) {
      const input = AddAssetSchema.parse(command.body);
      const tenantId = command.identity.tenantId;
      const requestHash = hash(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'merchant-intake.asset.add',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return AssetResponseSchema.parse(replay);
        await assertActiveRole(client, command.identity, CREATE_WRITE_ROLES);
        await assertRegionalProjectAssignment(client, command.identity, {
          sessionId: input.sessionId,
        });
        const session = await client.query<{ channel: string; status: string }>(
          `SELECT channel, status FROM merchant_intake_sessions
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.sessionId],
        );
        if (
          !session.rows[0] ||
          !['COLLECTING', 'EXTRACTING', 'WAITING_ANSWERS', 'WAITING_CONFIRMATION'].includes(
            session.rows[0].status,
          )
        )
          throw new MerchantIntakeStateError('session does not accept assets');
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO merchant_intake_assets(
             tenant_id, session_id, source_channel, source_message_id, asset_type, object_key,
             original_filename, mime_type, sha256, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            tenantId,
            input.sessionId,
            session.rows[0].channel,
            input.sourceMessageId ?? null,
            input.assetType,
            input.objectKey,
            input.originalFilename ?? null,
            input.mimeType ?? null,
            input.sha256.toLowerCase(),
            command.identity.userId,
          ],
        );
        const assetId = inserted.rows[0]!.id;
        if (session.rows[0].status === 'WAITING_CONFIRMATION') {
          await client.query(
            `UPDATE merchant_intake_sessions SET status = 'WAITING_ANSWERS'
              WHERE tenant_id = $1 AND id = $2`,
            [tenantId, input.sessionId],
          );
        }
        if (session.rows[0].status !== 'EXTRACTING') {
          await client.query(
            `UPDATE merchant_intake_sessions
                SET status = 'EXTRACTING', last_message_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [tenantId, input.sessionId],
          );
        }
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES ($1, 'merchant.intake_asset_received.v1', 'intake_asset', $2, 1,
                     $3, $4::jsonb, 'SENSITIVE', $5, now())`,
          [
            tenantId,
            assetId,
            `intake:${input.sessionId}`,
            JSON.stringify({
              session_id: input.sessionId,
              asset_id: assetId,
              asset_type: input.assetType,
              sha256: input.sha256.toLowerCase(),
              source_channel: session.rows[0].channel,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'RECEIVE_ASSET', 'merchant_intake_asset', $3,
                     'merchant.intake.write', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            command.identity.userId,
            assetId,
            JSON.stringify({ sessionId: input.sessionId, assetType: input.assetType }),
            command.traceId,
          ],
        );
        const response = AssetResponseSchema.parse({
          id: assetId,
          sessionId: input.sessionId,
          securityStatus: 'PENDING',
          processingStatus: 'QUEUED',
        });
        await complete(
          client,
          tenantId,
          'merchant-intake.asset.add',
          command.idempotencyKey,
          response,
          'merchant_intake_asset',
          assetId,
        );
        return response;
      });
    },

    async recordProcessingResult(command) {
      const input = ProcessingResultSchema.parse(command.body);
      const processorId = UuidSchema.parse(command.processorId);
      const requestHash = hash(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [command.tenantId]);
        const replay = await reserve(
          client,
          command.tenantId,
          'merchant-intake.asset.process',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return SessionResponseSchema.parse(replay);
        const asset = await client.query<{ session_id: string }>(
          `SELECT session_id FROM merchant_intake_assets
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [command.tenantId, input.assetId],
        );
        if (!asset.rows[0]) throw new MerchantIntakeStateError('asset unavailable');
        const sessionId = asset.rows[0].session_id;
        if (input.securityStatus !== 'SAFE') {
          await client.query(
            `UPDATE merchant_intake_assets
                SET security_status = $3, processing_status = 'FAILED', error_code = $4
              WHERE tenant_id = $1 AND id = $2`,
            [command.tenantId, input.assetId, input.securityStatus, input.errorCode],
          );
          await client.query(
            `UPDATE merchant_intake_sessions
                SET status = 'FAILED', missing_items = ARRAY['ASSET_SECURITY_RETRY']::text[]
              WHERE tenant_id = $1 AND id = $2 AND status = 'EXTRACTING'`,
            [command.tenantId, sessionId],
          );
          await client.query(
            `INSERT INTO audit_logs(
               tenant_id, actor_type, actor_id, action, resource_type, resource_id,
               permission_code, result_code, after_redacted, trace_id
             ) VALUES ($1, 'SYSTEM', $2, 'SECURITY_REJECT', 'merchant_intake_asset', $3,
                       'merchant.intake.write', $4, $5::jsonb, $6)`,
            [
              command.tenantId,
              processorId,
              input.assetId,
              input.errorCode,
              JSON.stringify({ processingStatus: 'FAILED' }),
              command.traceId,
            ],
          );
        } else {
          await client.query(
            `UPDATE merchant_intake_assets
                SET security_status = 'SAFE', processing_status = 'PROCESSING', error_code = NULL
              WHERE tenant_id = $1 AND id = $2`,
            [command.tenantId, input.assetId],
          );
          const existing = await client.query<{
            id: string;
            field_path: string;
            candidate_value: unknown;
            decision_status: string;
          }>(
            `SELECT id, field_path, candidate_value, decision_status
               FROM merchant_intake_field_candidates
              WHERE tenant_id = $1 AND session_id = $2 FOR UPDATE`,
            [command.tenantId, sessionId],
          );
          await client.query(
            `UPDATE merchant_intake_assets SET processing_status = 'SUCCEEDED'
              WHERE tenant_id = $1 AND id = $2`,
            [command.tenantId, input.assetId],
          );
          for (const candidate of input.candidates) {
            const conflicts = existing.rows.filter(
              (row) =>
                row.field_path === candidate.fieldPath &&
                JSON.stringify(row.candidate_value) !== JSON.stringify(candidate.candidateValue) &&
                row.decision_status !== 'REJECTED',
            );
            if (conflicts.length > 0) {
              await client.query(
                `UPDATE merchant_intake_field_candidates
                    SET decision_status = 'CONFLICT', decided_by = $4, decided_at = now()
                  WHERE tenant_id = $1 AND session_id = $2 AND id = ANY($3::uuid[])
                    AND decision_status = 'PROPOSED'`,
                [command.tenantId, sessionId, conflicts.map((row) => row.id), processorId],
              );
            }
            await client.query(
              `INSERT INTO merchant_intake_field_candidates(
                 tenant_id, session_id, asset_id, field_path, candidate_value, confidence,
                 decision_status, decided_by, decided_at
               ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,
                         CASE WHEN $7 = 'CONFLICT' THEN $8::uuid ELSE NULL END,
                         CASE WHEN $7 = 'CONFLICT' THEN now() ELSE NULL END)`,
              [
                command.tenantId,
                sessionId,
                input.assetId,
                candidate.fieldPath,
                JSON.stringify(candidate.candidateValue),
                candidate.confidence ?? null,
                conflicts.length > 0 ? 'CONFLICT' : 'PROPOSED',
                processorId,
              ],
            );
          }
          const conflicts = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM merchant_intake_field_candidates
              WHERE tenant_id = $1 AND session_id = $2 AND decision_status = 'CONFLICT'`,
            [command.tenantId, sessionId],
          );
          const conflictCount = Number(conflicts.rows[0]!.count);
          const updatedSession = await client.query<{ version: number }>(
            `UPDATE merchant_intake_sessions
                SET status = $3, missing_items = $4::text[], impact_targets = $5::text[]
              WHERE tenant_id = $1 AND id = $2 RETURNING version`,
            [
              command.tenantId,
              sessionId,
              conflictCount > 0 || input.missingItems.length > 0
                ? 'WAITING_ANSWERS'
                : 'WAITING_CONFIRMATION',
              input.missingItems,
              input.impactTargets,
            ],
          );
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
               partition_key, payload, pii_classification, trace_id, occurred_at
             ) VALUES ($1, 'merchant.intake_extraction_completed.v1', 'intake_session', $2, $3,
                       $4, $5::jsonb, 'SENSITIVE', $6, now())`,
            [
              command.tenantId,
              sessionId,
              updatedSession.rows[0]!.version,
              `intake:${sessionId}`,
              JSON.stringify({
                session_id: sessionId,
                field_count: input.candidates.length,
                conflict_count: conflictCount,
                missing_count: input.missingItems.length,
              }),
              command.traceId,
            ],
          );
          await client.query(
            `INSERT INTO audit_logs(
               tenant_id, actor_type, actor_id, action, resource_type, resource_id,
               permission_code, result_code, after_redacted, trace_id
             ) VALUES ($1, 'SYSTEM', $2, 'EXTRACT', 'merchant_intake_asset', $3,
                       'merchant.intake.write', 'SUCCESS', $4::jsonb, $5)`,
            [
              command.tenantId,
              processorId,
              input.assetId,
              JSON.stringify({
                sessionId,
                fieldPaths: input.candidates.map((candidate) => candidate.fieldPath),
                conflictCount,
                missingCount: input.missingItems.length,
              }),
              command.traceId,
            ],
          );
        }
        const response = await loadSession(client, command.tenantId, sessionId);
        await complete(
          client,
          command.tenantId,
          'merchant-intake.asset.process',
          command.idempotencyKey,
          response,
          'merchant_intake_session',
          sessionId,
        );
        return response;
      });
    },

    async confirm(command) {
      const input = ConfirmSchema.parse(command.body);
      const tenantId = command.identity.tenantId;
      const requestHash = hash(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'merchant-intake.confirm',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return SessionResponseSchema.parse(replay);
        await assertActiveRole(client, command.identity, CONFIRM_ROLES);
        const session = await client.query<{ status: string; version: number }>(
          `SELECT status, version FROM merchant_intake_sessions
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.sessionId],
        );
        if (
          !session.rows[0] ||
          session.rows[0].status !== 'WAITING_CONFIRMATION' ||
          session.rows[0].version !== input.expectedVersion
        )
          throw new MerchantIntakeConflictError('stale or unconfirmable session');
        const candidates = await client.query<{ id: string; field_path: string }>(
          `SELECT id, field_path FROM merchant_intake_field_candidates
            WHERE tenant_id = $1 AND session_id = $2 AND id = ANY($3::uuid[])
              AND decision_status IN ('PROPOSED','CONFLICT') FOR UPDATE`,
          [tenantId, input.sessionId, input.candidateIds],
        );
        if (candidates.rows.length !== new Set(input.candidateIds).size)
          throw new MerchantIntakeConfirmationError('confirmation candidates are invalid');
        const pathMatches = candidates.rows.every((candidate) => {
          const path = candidate.field_path;
          switch (input.confirmationType) {
            case 'LEGAL_SUBJECT':
              return path.startsWith('merchant.') && !path.startsWith('merchant.public_contact.');
            case 'PAYMENT':
              return path.startsWith('payment.');
            case 'PRICE':
              return path.startsWith('product.') && path.includes('price');
            case 'REFUND_RULE':
              return path.startsWith('refund.');
            case 'PUBLIC_CONTACT':
              return path.startsWith('merchant.public_contact.');
            case 'PUBLISH_IMPACT':
              return path.startsWith('publish.');
          }
        });
        if (!pathMatches) throw new MerchantIntakeConfirmationError('confirmation type mismatch');
        const confirmation = await client.query<{ id: string }>(
          `INSERT INTO merchant_intake_confirmations(
             tenant_id, session_id, confirmation_type, confirmed_payload,
             confirmed_by, confirmation_channel
           ) VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`,
          [
            tenantId,
            input.sessionId,
            input.confirmationType,
            JSON.stringify(input.confirmedPayload),
            command.identity.userId,
            input.confirmationChannel,
          ],
        );
        await client.query(
          `UPDATE merchant_intake_field_candidates
              SET decision_status = 'CONFIRMED', decided_by = $4, decided_at = now()
            WHERE tenant_id = $1 AND session_id = $2 AND id = ANY($3::uuid[])`,
          [tenantId, input.sessionId, input.candidateIds, command.identity.userId],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES ($1, 'merchant.intake_confirmation_recorded.v1', 'intake_confirmation', $2, 1,
                     $3, $4::jsonb, 'SENSITIVE', $5, now())`,
          [
            tenantId,
            confirmation.rows[0]!.id,
            `intake:${input.sessionId}`,
            JSON.stringify({
              session_id: input.sessionId,
              confirmation_id: confirmation.rows[0]!.id,
              confirmation_type: input.confirmationType,
              confirmed_by: command.identity.userId,
            }),
            command.traceId,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'CONFIRM', 'merchant_intake_confirmation', $3,
                     'merchant.intake.confirm', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            command.identity.userId,
            confirmation.rows[0]!.id,
            JSON.stringify({
              sessionId: input.sessionId,
              confirmationType: input.confirmationType,
              candidateIds: input.candidateIds,
            }),
            command.traceId,
          ],
        );
        const response = await loadSession(client, tenantId, input.sessionId);
        await complete(
          client,
          tenantId,
          'merchant-intake.confirm',
          command.idempotencyKey,
          response,
          'merchant_intake_confirmation',
          confirmation.rows[0]!.id,
        );
        return response;
      });
    },

    async commit(command) {
      const input = CommitSchema.parse(command.body);
      const tenantId = command.identity.tenantId;
      const requestHash = hash(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'merchant-intake.commit',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return CommitResponseSchema.parse(replay);
        await assertActiveRole(client, command.identity, CONFIRM_ROLES);
        const session = await client.query<{
          status: string;
          version: number;
          merchant_profile_id: string | null;
          impact_targets: string[];
        }>(
          `SELECT status, version, merchant_profile_id, impact_targets
             FROM merchant_intake_sessions WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.sessionId],
        );
        const sessionRow = session.rows[0];
        if (
          !sessionRow ||
          sessionRow.status !== 'WAITING_CONFIRMATION' ||
          sessionRow.version !== input.expectedVersion ||
          sessionRow.merchant_profile_id
        )
          throw new MerchantIntakeConflictError('stale or already committed session');
        const unresolved = await client.query(
          `SELECT 1 FROM merchant_intake_field_candidates
            WHERE tenant_id = $1 AND session_id = $2
              AND decision_status IN ('PROPOSED','CONFLICT') LIMIT 1`,
          [tenantId, input.sessionId],
        );
        if (unresolved.rowCount) throw new MerchantIntakeConfirmationError('unresolved candidates');
        const fields = await client.query<{
          id: string;
          field_path: string;
          candidate_value: unknown;
        }>(
          `SELECT id, field_path, candidate_value FROM merchant_intake_field_candidates
            WHERE tenant_id = $1 AND session_id = $2
              AND decision_status IN ('CONFIRMED','CORRECTED') ORDER BY field_path, created_at`,
          [tenantId, input.sessionId],
        );
        const committedFields = Object.fromEntries(
          fields.rows.map((field) => [field.field_path, field.candidate_value]),
        );
        const legalName = committedFields['merchant.legal_subject_name'];
        const industryCode = committedFields['merchant.industry_code'];
        if (typeof legalName !== 'string' || typeof industryCode !== 'string')
          throw new MerchantIntakeConfirmationError('legal name and industry are required');
        const confirmations = await client.query<{ id: string; confirmation_type: string }>(
          `SELECT id, confirmation_type FROM merchant_intake_confirmations
            WHERE tenant_id = $1 AND session_id = $2 ORDER BY confirmed_at`,
          [tenantId, input.sessionId],
        );
        if (!confirmations.rows.some((row) => row.confirmation_type === 'LEGAL_SUBJECT'))
          throw new MerchantIntakeConfirmationError('legal subject confirmation required');
        const profile = await client.query<{ id: string }>(
          `INSERT INTO merchant_profiles(
             tenant_id, legal_subject_name, industry_code, business_license_object_key,
             service_region_codes, profile_status
           ) VALUES ($1,$2,$3,$4,$5::text[],'DRAFT') RETURNING id`,
          [
            tenantId,
            legalName,
            industryCode,
            typeof committedFields['merchant.business_license_object_key'] === 'string'
              ? committedFields['merchant.business_license_object_key']
              : null,
            Array.isArray(committedFields['merchant.service_region_codes'])
              ? committedFields['merchant.service_region_codes']
              : [],
          ],
        );
        const merchantProfileId = profile.rows[0]!.id;
        const confirmedSession = await client.query<{ version: number }>(
          `UPDATE merchant_intake_sessions
              SET status = 'CONFIRMED', merchant_profile_id = $3, missing_items = '{}'
            WHERE tenant_id = $1 AND id = $2 RETURNING version`,
          [tenantId, input.sessionId, merchantProfileId],
        );
        const changedFieldPaths = fields.rows.map((field) => field.field_path);
        await client.query(
          `INSERT INTO merchant_intake_commits(
             tenant_id, session_id, merchant_profile_id, committed_fields, confirmation_ids,
             changed_field_paths, impact_targets, committed_by
           ) VALUES ($1,$2,$3,$4::jsonb,$5::uuid[],$6::text[],$7::text[],$8)`,
          [
            tenantId,
            input.sessionId,
            merchantProfileId,
            JSON.stringify(committedFields),
            confirmations.rows.map((row) => row.id),
            changedFieldPaths,
            sessionRow.impact_targets,
            command.identity.userId,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES ($1, 'merchant.intake_committed.v1', 'intake_session', $2, $3,
                     $4, $5::jsonb, 'SENSITIVE', $6, now())`,
          [
            tenantId,
            input.sessionId,
            confirmedSession.rows[0]!.version,
            `merchant:${merchantProfileId}`,
            JSON.stringify({
              session_id: input.sessionId,
              merchant_profile_id: merchantProfileId,
              changed_field_paths: changedFieldPaths,
              impact_targets: sessionRow.impact_targets,
            }),
            command.traceId,
          ],
        );
        const response = CommitResponseSchema.parse({
          sessionId: input.sessionId,
          merchantProfileId,
          status: 'CONFIRMED',
          changedFieldPaths,
          impactTargets: sessionRow.impact_targets,
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1, 'USER', $2, 'COMMIT', 'merchant_intake_session', $3,
                     'merchant.intake.confirm', 'SUCCESS', $4::jsonb, $5)`,
          [
            tenantId,
            command.identity.userId,
            input.sessionId,
            JSON.stringify(response),
            command.traceId,
          ],
        );
        await complete(
          client,
          tenantId,
          'merchant-intake.commit',
          command.idempotencyKey,
          response,
          'merchant_profile',
          merchantProfileId,
        );
        return response;
      });
    },
  };
}
