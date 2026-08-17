import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { IntakeObjectStore } from './intake-object-store.js';
import {
  MerchantIntakeAuthorizationError,
  MerchantIntakeStateError,
} from './merchant-intake-service.js';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const CreateUploadSchema = z
  .object({
    sessionId: UuidSchema,
    assetType: z.enum(['IMAGE', 'DOCUMENT', 'AUDIO']),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    contentType: z.string().min(1).max(255),
    maxBytes: z.int().min(1).max(52_428_800),
  })
  .superRefine((input, context) => {
    const allowed = {
      IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
      DOCUMENT: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      AUDIO: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/amr'],
    }[input.assetType];
    if (!allowed.includes(input.contentType))
      context.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: 'content type does not match asset type',
      });
  });
const CompleteUploadSchema = z.object({ uploadId: UuidSchema });

const UploadResponseSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  objectKey: z.string(),
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
const CompletionResponseSchema = z.object({
  uploadId: UuidSchema,
  assetId: UuidSchema,
  sessionId: UuidSchema,
  securityStatus: z.literal('PENDING'),
  processingStatus: z.literal('QUEUED'),
});

export class IntakeUploadEvidenceError extends Error {}
export class IntakeObjectStoreUnavailableError extends Error {}

interface Command {
  identity: SessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface MerchantIntakeUploadService {
  create(command: Command): Promise<z.infer<typeof UploadResponseSchema>>;
  complete(command: Command): Promise<z.infer<typeof CompletionResponseSchema>>;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const WRITE_ROLES = [
  'BUSINESS_DEVELOPER',
  'INVESTMENT_OPERATOR',
  'REGIONAL_PROVIDER',
  'MERCHANT_OWNER',
  'PLATFORM_OPERATOR',
];

async function assertRole(client: pg.PoolClient, identity: SessionIdentity) {
  const roles = identity.roleCodes.filter((role) => WRITE_ROLES.includes(role));
  if (roles.length === 0) throw new MerchantIntakeAuthorizationError();
  const result = await client.query(
    `SELECT 1 FROM tenant_memberships membership
       JOIN member_role_assignments assignment
         ON assignment.tenant_id = membership.tenant_id AND assignment.user_id = membership.user_id
      WHERE membership.tenant_id = $1 AND membership.user_id = $2
        AND membership.membership_status = 'ACTIVE'
        AND assignment.role_code = ANY($3::text[])
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now()) LIMIT 1`,
    [identity.tenantId, identity.userId, roles],
  );
  if (result.rowCount !== 1) throw new MerchantIntakeAuthorizationError();
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
     VALUES ($1,$2,$3,$4,now() + interval '24 hours')
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

async function completeIdempotency(
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

export function createMerchantIntakeUploadService(
  pool: Pick<pg.Pool, 'connect'>,
  objectStore: IntakeObjectStore,
): MerchantIntakeUploadService {
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
    async create(command) {
      const input = CreateUploadSchema.parse(command.body);
      const tenantId = command.identity.tenantId;
      const requestHash = hash(input);
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'merchant-intake.upload.create',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return UploadResponseSchema.parse(replay);
        await assertRole(client, command.identity);
        const session = await client.query<{ status: string }>(
          `SELECT status FROM merchant_intake_sessions WHERE tenant_id = $1 AND id = $2 FOR SHARE`,
          [tenantId, input.sessionId],
        );
        if (
          !session.rows[0] ||
          !['COLLECTING', 'EXTRACTING', 'WAITING_ANSWERS', 'WAITING_CONFIRMATION'].includes(
            session.rows[0].status,
          )
        )
          throw new MerchantIntakeStateError('session does not accept uploads');
        const id = await client.query<{ id: string }>('SELECT gen_random_uuid()::text AS id');
        const uploadId = id.rows[0]!.id;
        const objectKey = `${tenantId}/intake/${input.sessionId}/${uploadId}`;
        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        await client.query(
          `INSERT INTO merchant_intake_uploads(
             id, tenant_id, session_id, asset_type, object_key, expected_sha256,
             content_type, max_bytes, expires_at, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            uploadId,
            tenantId,
            input.sessionId,
            input.assetType,
            objectKey,
            input.sha256.toLowerCase(),
            input.contentType,
            input.maxBytes,
            expiresAt,
            command.identity.userId,
          ],
        );
        const authorization = objectStore.authorizePut({
          objectKey,
          sha256: input.sha256.toLowerCase(),
          contentType: input.contentType,
          maxBytes: input.maxBytes,
          expiresAt,
        });
        const response = UploadResponseSchema.parse({
          id: uploadId,
          sessionId: input.sessionId,
          objectKey,
          ...authorization,
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1,'USER',$2,'AUTHORIZE_UPLOAD','merchant_intake_upload',$3,
                     'merchant.intake.write','SUCCESS',$4::jsonb,$5)`,
          [
            tenantId,
            command.identity.userId,
            uploadId,
            JSON.stringify({
              sessionId: input.sessionId,
              assetType: input.assetType,
              maxBytes: input.maxBytes,
            }),
            command.traceId,
          ],
        );
        await completeIdempotency(
          client,
          tenantId,
          'merchant-intake.upload.create',
          command.idempotencyKey,
          response,
          'merchant_intake_upload',
          uploadId,
        );
        return response;
      });
    },

    async complete(command) {
      const input = CompleteUploadSchema.parse(command.body);
      const tenantId = command.identity.tenantId;
      const requestHash = hash(input);
      const context = await transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await client.query<{ request_hash: string; response_body: unknown }>(
          `SELECT request_hash, response_body FROM idempotency_keys
            WHERE tenant_id = $1 AND scope = 'merchant-intake.upload.complete'
              AND idempotency_key = $2`,
          [tenantId, command.idempotencyKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash) throw new IdempotencyConflictError();
          return { replay: CompletionResponseSchema.parse(replay.rows[0].response_body) } as const;
        }
        await assertRole(client, command.identity);
        const result = await client.query<{
          session_id: string;
          object_key: string;
          expected_sha256: string;
          content_type: string;
          max_bytes: string;
        }>(
          `SELECT session_id, object_key, expected_sha256, content_type, max_bytes::text
             FROM merchant_intake_uploads WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.uploadId],
        );
        if (!result.rows[0]) throw new MerchantIntakeStateError('upload unavailable');
        return { ticket: result.rows[0] } as const;
      });
      if ('replay' in context) return context.replay;
      let evidence;
      try {
        evidence = await objectStore.stat(context.ticket.object_key);
      } catch (error) {
        throw new IntakeObjectStoreUnavailableError(String(error));
      }
      return transaction(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const replay = await reserve(
          client,
          tenantId,
          'merchant-intake.upload.complete',
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return CompletionResponseSchema.parse(replay);
        await assertRole(client, command.identity);
        const upload = await client.query<{
          session_id: string;
          asset_type: string;
          object_key: string;
          expected_sha256: string;
          content_type: string;
          max_bytes: string;
          status: string;
          expires_at: Date;
          created_by: string;
        }>(
          `SELECT session_id, asset_type, object_key, expected_sha256, content_type,
                  max_bytes::text, status, expires_at, created_by
             FROM merchant_intake_uploads WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, input.uploadId],
        );
        const ticket = upload.rows[0];
        if (!ticket || ticket.status !== 'CREATED' || ticket.expires_at.getTime() <= Date.now())
          throw new MerchantIntakeStateError('upload authorization is not consumable');
        if (
          evidence.sha256 !== ticket.expected_sha256 ||
          evidence.contentType !== ticket.content_type ||
          evidence.sizeBytes > Number(ticket.max_bytes)
        )
          throw new IntakeUploadEvidenceError('stored object does not match upload authorization');
        const session = await client.query<{ channel: string; status: string }>(
          `SELECT channel, status FROM merchant_intake_sessions
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, ticket.session_id],
        );
        if (
          !session.rows[0] ||
          !['COLLECTING', 'EXTRACTING', 'WAITING_ANSWERS', 'WAITING_CONFIRMATION'].includes(
            session.rows[0].status,
          )
        )
          throw new MerchantIntakeStateError('session unavailable for upload completion');
        const asset = await client.query<{ id: string }>(
          `INSERT INTO merchant_intake_assets(
             tenant_id, session_id, source_channel, asset_type, object_key, mime_type,
             sha256, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            tenantId,
            ticket.session_id,
            session.rows[0].channel,
            ticket.asset_type,
            ticket.object_key,
            ticket.content_type,
            ticket.expected_sha256,
            ticket.created_by,
          ],
        );
        const assetId = asset.rows[0]!.id;
        if (session.rows[0].status === 'WAITING_CONFIRMATION') {
          await client.query(
            `UPDATE merchant_intake_sessions SET status = 'WAITING_ANSWERS' WHERE tenant_id = $1 AND id = $2`,
            [tenantId, ticket.session_id],
          );
        }
        if (session.rows[0].status !== 'EXTRACTING') {
          await client.query(
            `UPDATE merchant_intake_sessions SET status = 'EXTRACTING', last_message_at = now() WHERE tenant_id = $1 AND id = $2`,
            [tenantId, ticket.session_id],
          );
        }
        await client.query(
          `UPDATE merchant_intake_uploads SET status = 'CONSUMED', asset_id = $3, consumed_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.uploadId, assetId],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id, event_name, aggregate_type, aggregate_id, aggregate_version,
             partition_key, payload, pii_classification, trace_id, occurred_at
           ) VALUES ($1,'merchant.intake_asset_received.v1','intake_asset',$2,1,$3,$4::jsonb,'SENSITIVE',$5,now())`,
          [
            tenantId,
            assetId,
            `intake:${ticket.session_id}`,
            JSON.stringify({
              session_id: ticket.session_id,
              asset_id: assetId,
              asset_type: ticket.asset_type,
              sha256: ticket.expected_sha256,
              source_channel: session.rows[0].channel,
            }),
            command.traceId,
          ],
        );
        const response = CompletionResponseSchema.parse({
          uploadId: input.uploadId,
          assetId,
          sessionId: ticket.session_id,
          securityStatus: 'PENDING',
          processingStatus: 'QUEUED',
        });
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id, actor_type, actor_id, action, resource_type, resource_id,
             permission_code, result_code, after_redacted, trace_id
           ) VALUES ($1,'USER',$2,'COMPLETE_UPLOAD','merchant_intake_upload',$3,
                     'merchant.intake.write','SUCCESS',$4::jsonb,$5)`,
          [
            tenantId,
            command.identity.userId,
            input.uploadId,
            JSON.stringify({ assetId, sizeBytes: evidence.sizeBytes }),
            command.traceId,
          ],
        );
        await completeIdempotency(
          client,
          tenantId,
          'merchant-intake.upload.complete',
          command.idempotencyKey,
          response,
          'merchant_intake_asset',
          assetId,
        );
        return response;
      });
    },
  };
}
