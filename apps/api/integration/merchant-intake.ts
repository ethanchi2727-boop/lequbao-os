import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createMerchantIntakeService } from '../src/merchant-intake-service.js';
import { createMerchantIntakeUploadService } from '../src/merchant-intake-upload-service.js';
import type { SessionIdentity } from '../src/session-identity.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const tenantId = randomUUID();
const ownerId = randomUUID();
const processorId = randomUUID();
const identity: SessionIdentity = {
  tenantId,
  userId: ownerId,
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'integration-owner-session',
};
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const pool = new pg.Pool({ connectionString });
try {
  await pool.query(
    `INSERT INTO tenants(id, tenant_code, legal_name, display_name)
     VALUES ($1, $2, 'Intake Integration Legal', 'Intake Integration')`,
    [tenantId, `intake-${tenantId.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO users(id, display_name) VALUES ($1, 'Merchant Owner'), ($2, 'AI Processor')`,
    [ownerId, processorId],
  );
  await pool.query(
    `INSERT INTO tenant_memberships(tenant_id, user_id, membership_status)
     VALUES ($1, $2, 'ACTIVE')`,
    [tenantId, ownerId],
  );
  await pool.query(
    `INSERT INTO member_role_assignments(tenant_id, user_id, role_code)
     VALUES ($1, $2, 'MERCHANT_OWNER')`,
    [tenantId, ownerId],
  );

  const service = createMerchantIntakeService(pool);
  const uploadEvidence = new Map<
    string,
    { sha256: string; sizeBytes: number; contentType: string }
  >();
  const uploads = createMerchantIntakeUploadService(pool, {
    authorizePut: ({ objectKey, expiresAt }) => ({
      uploadUrl: `https://objects.integration.invalid/${encodeURIComponent(objectKey)}`,
      headers: {},
      expiresAt,
    }),
    authorizeGet: ({ objectKey, expiresAt }) => ({
      downloadUrl: `https://object-store.invalid/${encodeURIComponent(objectKey)}`,
      expiresAt,
    }),
    stat: async (objectKey) => {
      const evidence = uploadEvidence.get(objectKey);
      if (!evidence) throw new Error('object evidence missing');
      return evidence;
    },
    putText: async () => undefined,
    getText: async () => '',
  });
  const createCommand = {
    identity,
    idempotencyKey: 'intake:create:happy',
    traceId: 'trace-intake-create-happy',
    body: { channel: 'WEB' },
  };
  const created = await service.createSession(createCommand);
  assert.deepEqual(await service.createSession(createCommand), created);
  assert.equal(created.status, 'COLLECTING');

  const uploadCommand = {
    identity,
    idempotencyKey: 'intake:upload:license',
    traceId: 'trace-intake-upload-license',
    body: {
      sessionId: created.id,
      assetType: 'IMAGE',
      sha256: sha('license-image'),
      contentType: 'image/jpeg',
      maxBytes: 1024,
    },
  };
  const upload = await uploads.create(uploadCommand);
  assert.deepEqual(await uploads.create(uploadCommand), upload);
  uploadEvidence.set(upload.objectKey, {
    sha256: sha('license-image'),
    sizeBytes: 512,
    contentType: 'image/jpeg',
  });
  const completeCommand = {
    identity,
    idempotencyKey: 'intake:upload:license:complete',
    traceId: 'trace-intake-upload-license-complete',
    body: { uploadId: upload.id },
  };
  const asset = await uploads.complete(completeCommand);
  assert.deepEqual(await uploads.complete(completeCommand), asset);
  const processCommand = {
    tenantId,
    idempotencyKey: 'intake:process:license',
    traceId: 'trace-intake-process-license',
    processorId,
    body: {
      assetId: asset.assetId,
      securityStatus: 'SAFE' as const,
      candidates: [
        {
          fieldPath: 'merchant.legal_subject_name',
          candidateValue: '拾味小馆餐饮有限公司',
          confidence: 0.99,
        },
        {
          fieldPath: 'merchant.industry_code',
          candidateValue: 'LOCAL_LIFE_FOOD',
          confidence: 0.96,
        },
        {
          fieldPath: 'merchant.business_license_object_key',
          candidateValue: upload.objectKey,
          confidence: 1,
        },
      ],
      missingItems: [],
      impactTargets: ['MINI_PROGRAM', 'GEO', 'AI_SERVICE'],
    },
  };
  const extracted = await service.recordProcessingResult(processCommand);
  assert.deepEqual(await service.recordProcessingResult(processCommand), extracted);
  assert.equal(extracted.status, 'WAITING_CONFIRMATION');
  assert.equal(extracted.assets.length, 1);
  assert.deepEqual(extracted.assets[0], {
    id: asset.assetId,
    sourceChannel: 'WEB',
    assetType: 'IMAGE',
    originalFilename: null,
    mimeType: 'image/jpeg',
    sha256: sha('license-image'),
    securityStatus: 'SAFE',
    processingStatus: 'SUCCEEDED',
    errorCode: null,
    createdBy: ownerId,
    createdAt: extracted.assets[0]?.createdAt,
  });
  assert.equal('objectKey' in extracted.assets[0]!, false);
  assert.equal(extracted.fields.length, 3);
  assert.ok(extracted.fields.every((field) => field.decisionStatus === 'PROPOSED'));

  const confirmCommand = {
    identity,
    idempotencyKey: 'intake:confirm:legal',
    traceId: 'trace-intake-confirm-legal',
    body: {
      sessionId: created.id,
      confirmationType: 'LEGAL_SUBJECT',
      confirmedPayload: { legalSubjectName: '拾味小馆餐饮有限公司' },
      candidateIds: extracted.fields.map((field) => field.id),
      confirmationChannel: 'WEB_CLICK',
      expectedVersion: extracted.version,
    },
  };
  const confirmed = await service.confirm(confirmCommand);
  assert.deepEqual(await service.confirm(confirmCommand), confirmed);
  assert.ok(confirmed.fields.every((field) => field.decisionStatus === 'CONFIRMED'));

  const commitCommand = {
    identity,
    idempotencyKey: 'intake:commit:happy',
    traceId: 'trace-intake-commit-happy',
    body: { sessionId: created.id, expectedVersion: confirmed.version },
  };
  const committed = await service.commit(commitCommand);
  assert.deepEqual(await service.commit(commitCommand), committed);
  assert.equal(committed.status, 'CONFIRMED');
  assert.deepEqual(committed.impactTargets, ['MINI_PROGRAM', 'GEO', 'AI_SERVICE']);

  const unsafeSession = await service.createSession({
    identity,
    idempotencyKey: 'intake:create:unsafe',
    traceId: 'trace-intake-create-unsafe',
    body: { channel: 'MOBILE_H5' },
  });
  const unsafeAsset = await service.addAsset({
    identity,
    idempotencyKey: 'intake:asset:unsafe',
    traceId: 'trace-intake-asset-unsafe',
    body: {
      sessionId: unsafeSession.id,
      assetType: 'DOCUMENT',
      sha256: sha('unsafe-document'),
      objectKey: `${tenantId}/intake/${unsafeSession.id}/unsafe.pdf`,
    },
  });
  const rejected = await service.recordProcessingResult({
    tenantId,
    idempotencyKey: 'intake:process:unsafe',
    traceId: 'trace-intake-process-unsafe',
    processorId,
    body: { assetId: unsafeAsset.id, securityStatus: 'REJECTED', errorCode: 'MALWARE_DETECTED' },
  });
  assert.equal(rejected.status, 'FAILED');
  assert.equal(rejected.assets[0]?.securityStatus, 'REJECTED');
  assert.equal(rejected.assets[0]?.errorCode, 'MALWARE_DETECTED');
  assert.equal(rejected.fields.length, 0);

  const conflictSession = await service.createSession({
    identity,
    idempotencyKey: 'intake:create:conflict',
    traceId: 'trace-intake-create-conflict',
    body: { channel: 'WEB' },
  });
  const firstConflictAsset = await service.addAsset({
    identity,
    idempotencyKey: 'intake:asset:conflict:1',
    traceId: 'trace-intake-asset-conflict-1',
    body: {
      sessionId: conflictSession.id,
      assetType: 'IMAGE',
      sha256: sha('conflict-license'),
      objectKey: `${tenantId}/intake/${conflictSession.id}/license.jpg`,
    },
  });
  await service.recordProcessingResult({
    tenantId,
    idempotencyKey: 'intake:process:conflict:1',
    traceId: 'trace-intake-process-conflict-1',
    processorId,
    body: {
      assetId: firstConflictAsset.id,
      securityStatus: 'SAFE',
      candidates: [
        {
          fieldPath: 'merchant.legal_subject_name',
          candidateValue: '证照主体甲',
          confidence: 0.99,
        },
      ],
      missingItems: [],
      impactTargets: [],
    },
  });
  const secondConflictAsset = await service.addAsset({
    identity,
    idempotencyKey: 'intake:asset:conflict:2',
    traceId: 'trace-intake-asset-conflict-2',
    body: {
      sessionId: conflictSession.id,
      assetType: 'IMAGE',
      sha256: sha('conflict-storefront'),
      objectKey: `${tenantId}/intake/${conflictSession.id}/storefront.jpg`,
    },
  });
  const conflicted = await service.recordProcessingResult({
    tenantId,
    idempotencyKey: 'intake:process:conflict:2',
    traceId: 'trace-intake-process-conflict-2',
    processorId,
    body: {
      assetId: secondConflictAsset.id,
      securityStatus: 'SAFE',
      candidates: [
        { fieldPath: 'merchant.legal_subject_name', candidateValue: '门头名称乙', confidence: 0.8 },
      ],
      missingItems: [],
      impactTargets: [],
    },
  });
  assert.equal(conflicted.status, 'WAITING_ANSWERS');
  assert.deepEqual(
    conflicted.fields.map((field) => [field.candidateValue, field.decisionStatus]),
    [
      ['证照主体甲', 'CONFLICT'],
      ['门头名称乙', 'CONFLICT'],
    ],
  );

  const evidence = await pool.query<{
    sessions: string;
    assets: string;
    candidates: string;
    confirmations: string;
    commits: string;
    profiles: string;
    outbox: string;
    audits: string;
    uploads: string;
  }>(
    `SELECT
       (SELECT count(*) FROM merchant_intake_sessions WHERE tenant_id = $1)::text AS sessions,
       (SELECT count(*) FROM merchant_intake_assets WHERE tenant_id = $1)::text AS assets,
       (SELECT count(*) FROM merchant_intake_field_candidates WHERE tenant_id = $1)::text AS candidates,
       (SELECT count(*) FROM merchant_intake_confirmations WHERE tenant_id = $1)::text AS confirmations,
       (SELECT count(*) FROM merchant_intake_commits WHERE tenant_id = $1)::text AS commits,
       (SELECT count(*) FROM merchant_profiles WHERE tenant_id = $1)::text AS profiles,
       (SELECT count(*) FROM outbox_events WHERE tenant_id = $1 AND event_name LIKE 'merchant.intake_%')::text AS outbox,
       (SELECT count(*) FROM audit_logs WHERE tenant_id = $1 AND permission_code LIKE 'merchant.intake.%')::text AS audits,
       (SELECT count(*) FROM merchant_intake_uploads WHERE tenant_id = $1 AND status = 'CONSUMED')::text AS uploads`,
    [tenantId],
  );
  assert.deepEqual(evidence.rows[0], {
    sessions: '3',
    assets: '4',
    candidates: '5',
    confirmations: '1',
    commits: '1',
    profiles: '1',
    outbox: '12',
    audits: '14',
    uploads: '1',
  });
  console.log(
    'Merchant intake PostgreSQL integration passed: signed actor roles, safe extraction, conflict retention, explicit confirmation, immutable commit and idempotent replay.',
  );
} finally {
  await pool.end();
}
