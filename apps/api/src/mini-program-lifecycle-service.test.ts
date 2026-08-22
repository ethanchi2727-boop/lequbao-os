import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MiniProgramConfirmationError,
  MiniProgramOwnershipConflictError,
  MiniProgramStateError,
  canonicalJson,
  createMiniProgramLifecycleService,
  type MiniProgramBuildResult,
  type MiniProgramProviderGateway,
} from './mini-program-lifecycle-service.js';

const tenantId = '43000000-0000-4000-8000-000000000001';
const userId = '43000000-0000-4000-8000-000000000002';
const merchantProfileId = '43000000-0000-4000-8000-000000000003';
const deliveryProjectId = '43000000-0000-4000-8000-000000000004';
const miniProgramId = '43000000-0000-4000-8000-000000000005';
const authorizationId = '43000000-0000-4000-8000-000000000006';
const releaseId = '43000000-0000-4000-8000-000000000007';
const stableReleaseId = '43000000-0000-4000-8000-000000000008';
const attemptId = '43000000-0000-4000-8000-000000000009';
const buildId = '43000000-0000-4000-8000-000000000010';
const rollbackReleaseId = '43000000-0000-4000-8000-000000000011';
const artifactDigest = 'a'.repeat(64);
const configDigest = 'b'.repeat(64);

const identity = {
  tenantId,
  userId,
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'session-1',
  authLevel: 'MFA' as const,
};

type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

const miniRow = (
  options: {
    status?: string;
    currentReleaseId?: string | null;
    pendingReleaseId?: string | null;
  } = {},
) => ({
  id: miniProgramId,
  merchant_profile_id: merchantProfileId,
  delivery_project_id: deliveryProjectId,
  app_id: 'wx-merchant-app',
  merchant_chosen_name: '商户自有小程序',
  template_code: 'restaurant-standard',
  status: options.status ?? 'AUTHORIZED',
  current_release_id: options.currentReleaseId ?? null,
  pending_release_id: options.pendingReleaseId ?? null,
  last_stable_release_id: stableReleaseId,
  authorization_status: 'ACTIVE',
  authorization_scope: ['ACCOUNT_INFO', 'CODE_MANAGEMENT'],
});

const releaseRow = (status: string, id = releaseId) => ({
  id,
  release_number: '1',
  template_version: '6.1.0',
  config_version: 1,
  config_digest: configDigest,
  build_digest: artifactDigest,
  build_artifact_ref: 'artifact://mini/1',
  external_audit_id: status === 'PREVIEW_READY' ? null : 'audit-1',
  external_version: status === 'PUBLISHED' ? 'ext-1' : null,
  status,
  rejection_reason: status === 'REJECTED' ? 'CATEGORY:invalid' : null,
  merchant_confirmed_by: userId,
  merchant_confirmed_at: '2026-08-18T04:00:00.000Z',
  published_at: status === 'PUBLISHED' ? '2026-08-18T05:00:00.000Z' : null,
  rolled_back_from_id: null,
  previous_stable_release_id: stableReleaseId,
});

function fixture(
  handler: (sql: string, values: readonly unknown[] | undefined) => QueryResult | undefined,
  overrides: Partial<MiniProgramProviderGateway> = {},
) {
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    return handler(sql, values) ?? result();
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const provider: MiniProgramProviderGateway = {
    exchangeAuthorization: vi.fn(async () => ({
      appId: 'wx-merchant-app',
      subjectName: 'Merchant Subject',
      scopeCodes: ['ACCOUNT_INFO', 'CODE_MANAGEMENT'],
      credentialSecretRef: 'vault://wechat/merchant-app',
      authorizedAt: '2026-08-18T04:00:00+08:00',
      externalRequestId: 'authorize-request-1',
    })),
    submitReview: vi.fn(async () => ({
      externalAuditId: 'audit-1',
      externalRequestId: 'review-request-1',
    })),
    publish: vi.fn(async () => ({
      externalVersion: 'ext-1',
      externalRequestId: 'publish-request-1',
    })),
    queryOnline: vi.fn(async () => ({ releaseId: null, externalVersion: null })),
    rollback: vi.fn(async () => ({
      externalVersion: 'ext-rollback',
      externalRequestId: 'rollback-request-1',
    })),
    ...overrides,
  };
  const buildResult: MiniProgramBuildResult = {
    artifactRef: 'artifact://mini/1',
    artifactDigest,
    previewRef: 'preview://mini/1',
    templateCommit: 'commit-abc',
    backendApiVersion: 'v1',
    databaseCompatibilityMin: '0010',
    databaseCompatibilityMax: '0011',
    smokeTestResult: { passed: true, checks: { login: true, privacy: true } },
  };
  const builder = { build: vi.fn(async () => buildResult) };
  return {
    service: createMiniProgramLifecycleService(pool as never, provider, builder),
    provider,
    builder,
    query,
  };
}

const command = (body: unknown, idempotencyKey = 'idem-1') => ({
  identity,
  idempotencyKey,
  traceId: 'trace-1',
  body,
});

function loadRows(
  sql: string,
  status = 'AUTHORIZED',
  releaseStatus?: string,
  visibleId = releaseId,
) {
  if (sql.startsWith('SELECT mini.id,mini.merchant_profile_id'))
    return result([
      miniRow({
        status,
        currentReleaseId: releaseStatus === 'PUBLISHED' ? visibleId : null,
        pendingReleaseId: releaseStatus && releaseStatus !== 'PUBLISHED' ? visibleId : null,
      }),
    ]);
  if (sql.startsWith('SELECT id,release_number::text'))
    return result([releaseRow(releaseStatus ?? 'PREVIEW_READY', visibleId)]);
  return undefined;
}

describe('merchant-owned mini-program lifecycle', () => {
  it('MP-001 stores only provider secret references while preserving the merchant AppID and scopes', async () => {
    const authorizationCode = 'official-one-time-code-123';
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT 1 FROM delivery_projects')) return result([{ ok: true }]);
      if (sql.startsWith('INSERT INTO mini_program_external_attempts'))
        return result([{ id: attemptId }]);
      if (sql.startsWith('INSERT INTO external_authorizations'))
        return result([{ id: authorizationId }]);
      if (sql.startsWith('INSERT INTO mini_programs')) return result([{ id: miniProgramId }]);
      return loadRows(sql);
    });
    const response = await fx.service.activateAuthorization(
      command({
        merchantProfileId,
        deliveryProjectId,
        merchantChosenName: '商户自有小程序',
        templateCode: 'restaurant-standard',
        authorizationCode,
      }),
    );
    expect(response.id).toBe(miniProgramId);
    expect(fx.provider.exchangeAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationCode }),
    );
    const databaseValues = fx.query.mock.calls.flatMap((call) => call[1] ?? []);
    expect(databaseValues).not.toContain(authorizationCode);
    expect(databaseValues).toContain('vault://wechat/merchant-app');
  });

  it('MP-002 converts the global AppID uniqueness violation into an ownership conflict', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT 1 FROM delivery_projects')) return result([{ ok: true }]);
      if (sql.startsWith('INSERT INTO mini_program_external_attempts'))
        return result([{ id: attemptId }]);
      if (sql.startsWith('INSERT INTO external_authorizations'))
        return result([{ id: authorizationId }]);
      if (sql.startsWith('INSERT INTO mini_programs'))
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      return undefined;
    });
    await expect(
      fx.service.activateAuthorization(
        command({
          merchantProfileId,
          deliveryProjectId,
          merchantChosenName: '同一 AppID',
          templateCode: 'restaurant-standard',
          authorizationCode: 'official-one-time-code-123',
        }),
      ),
    ).rejects.toBeInstanceOf(MiniProgramOwnershipConflictError);
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).startsWith('ROLLBACK TO SAVEPOINT')),
    ).toBe(true);
  });

  it('MP-003 binds a deterministic config digest to the immutable preview artifact', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT mini.template_code'))
        return result([
          {
            template_code: 'restaurant-standard',
            status: 'AUTHORIZED',
            authorization_status: 'ACTIVE',
            current_release_id: null,
          },
        ]);
      if (sql.startsWith('INSERT INTO mini_program_releases')) return result([{ id: releaseId }]);
      if (sql.startsWith('INSERT INTO mini_program_external_attempts'))
        return result([{ id: attemptId }]);
      if (sql.startsWith('INSERT INTO mini_program_builds')) return result([{ id: buildId }]);
      return loadRows(sql, 'AUTHORIZED', 'PREVIEW_READY');
    });
    const config = { theme: { color: '#FF5A36', modules: ['offer', 'store'] }, name: '商户店' };
    const response = await fx.service.createPreview(
      command({ miniProgramId, templateVersion: '6.1.0', configVersion: 1, config }),
    );
    const expectedConfigDigest = createHash('sha256').update(canonicalJson(config)).digest('hex');
    expect(response.release?.status).toBe('PREVIEW_READY');
    expect(fx.builder.build).toHaveBeenCalledWith(
      expect.objectContaining({ configDigest: expectedConfigDigest }),
    );
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).startsWith('INSERT INTO mini_program_builds') &&
          (values as unknown[])?.includes(expectedConfigDigest) &&
          (values as unknown[])?.includes(artifactDigest),
      ),
    ).toBe(true);
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('MP-004 rejects review submission without a matching privacy/category preview confirmation', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT mini.app_id,release.build_artifact_ref'))
        return result([
          {
            app_id: 'wx-merchant-app',
            artifact_ref: 'artifact://mini/1',
            authorization_status: 'ACTIVE',
            confirmation_id: null,
          },
        ]);
      return undefined;
    });
    await expect(
      fx.service.submitReview(command({ miniProgramId, releaseId })),
    ).rejects.toBeInstanceOf(MiniProgramConfirmationError);
    expect(fx.provider.submitReview).not.toHaveBeenCalled();
  });

  it('MP-005 applies an exact rejected-review callback once and replays without a second state update', async () => {
    let storedHash: string | null = null;
    let releaseUpdates = 0;
    const event = {
      tenantId,
      appId: 'wx-merchant-app',
      providerEventId: 'provider-event-1',
      eventType: 'REVIEW_REJECTED' as const,
      externalAuditId: 'audit-1',
      reasonCode: 'CATEGORY',
      reasonSummary: '类目资质不完整',
      ciphertextHash: 'c'.repeat(64),
      encryptedPayloadObjectRef: 'object://wechat/provider-event-1',
      receivedAt: '2026-08-18T04:00:00+08:00',
      traceId: 'trace-callback',
    };
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT id,delivery_project_id FROM mini_programs'))
        return result([{ id: miniProgramId, delivery_project_id: deliveryProjectId }]);
      if (sql.startsWith('SELECT ciphertext_hash'))
        return storedHash ? result([{ ciphertext_hash: storedHash }]) : result();
      if (sql.startsWith('UPDATE mini_program_releases SET status=')) {
        releaseUpdates += 1;
        return result([{ id: releaseId }]);
      }
      if (sql.startsWith('INSERT INTO mini_program_provider_events'))
        storedHash = event.ciphertextHash;
      return loadRows(sql, 'AUTHORIZED', 'REJECTED');
    });
    await fx.service.handleProviderEvent(event);
    await fx.service.handleProviderEvent(event);
    expect(releaseUpdates).toBe(1);
    expect(
      fx.query.mock.calls.filter(([sql]) =>
        String(sql).startsWith('INSERT INTO mini_program_provider_events'),
      ),
    ).toHaveLength(1);
  });

  it('MP-006 refuses to publish a release that has not passed review', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT mini.app_id,release.external_audit_id')) return result();
      return undefined;
    });
    await expect(fx.service.publish(command({ miniProgramId, releaseId }))).rejects.toBeInstanceOf(
      MiniProgramStateError,
    );
    expect(fx.provider.publish).not.toHaveBeenCalled();
  });

  it('MP-007 queries the online version after a publish timeout and converges without republishing', async () => {
    const publish = vi.fn(async () => {
      throw new Error('timeout');
    });
    const queryOnline = vi.fn(async () => ({ releaseId, externalVersion: 'ext-recovered' }));
    const fx = fixture(
      (sql) => {
        if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
        if (sql.startsWith('SELECT mini.app_id,release.external_audit_id'))
          return result([
            {
              app_id: 'wx-merchant-app',
              external_audit_id: 'audit-1',
              previous_stable_release_id: stableReleaseId,
            },
          ]);
        if (sql.startsWith('INSERT INTO mini_program_external_attempts'))
          return result([{ id: attemptId }]);
        return loadRows(sql, 'ACTIVE', 'PUBLISHED');
      },
      { publish, queryOnline },
    );
    const response = await fx.service.publish(command({ miniProgramId, releaseId }));
    expect(response.release?.status).toBe('PUBLISHED');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(queryOnline).toHaveBeenCalledTimes(1);
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes("SET status='SUCCEEDED'") &&
          JSON.parse(String((values as unknown[])?.[3])).recovered_by_query === true,
      ),
    ).toBe(true);
  });

  it('MP-008 creates a new rollback release from the last stable artifact without deleting history', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT mini.app_id,mini.current_release_id'))
        return result([
          {
            app_id: 'wx-merchant-app',
            current_release_id: releaseId,
            stable_release_id: stableReleaseId,
            template_version: '6.0.9',
            config_version: 7,
            config_snapshot: { safe: true },
            config_digest: configDigest,
            build_digest: artifactDigest,
            build_artifact_ref: 'artifact://mini/stable',
            template_commit: 'commit-stable',
            backend_api_version: 'v1',
            database_compatibility_min: '0010',
            database_compatibility_max: '0011',
          },
        ]);
      if (sql.startsWith('INSERT INTO mini_program_releases'))
        return result([{ id: rollbackReleaseId }]);
      if (sql.startsWith('INSERT INTO mini_program_external_attempts'))
        return result([{ id: attemptId }]);
      return loadRows(sql, 'ACTIVE', 'PUBLISHED', rollbackReleaseId);
    });
    const response = await fx.service.rollback(
      command({ miniProgramId, reason: '新版本支付故障' }),
    );
    expect(response.currentReleaseId).toBe(rollbackReleaseId);
    expect(fx.provider.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ artifactRef: 'artifact://mini/stable' }),
    );
    expect(fx.query.mock.calls.some(([sql]) => /^DELETE /i.test(String(sql)))).toBe(false);
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).startsWith('INSERT INTO mini_program_releases') &&
          (values as unknown[])?.includes(releaseId) &&
          (values as unknown[])?.includes(stableReleaseId),
      ),
    ).toBe(true);
  });
});
