import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureControlledEvidenceArtifact } from './capture-controlled-evidence.mjs';
import {
  controlledJsonEvidenceContracts,
  requiredDatabaseFixtureFiles,
} from './controlled-evidence-contracts.mjs';
import { verifyControlledResults } from './controlled-results.mjs';
import { prepareControlledEvidenceWorkspace } from './prepare-controlled-evidence.mjs';
import { requiredAlertPolicy } from './operations-alert-policy.mjs';

const releaseCommit = 'a'.repeat(40);
const plan = {
  version: 1,
  suites: [
    {
      code: 'POSTGRES',
      environmentGate: 'POSTGRESQL',
      executorRole: 'database engineer',
      runbook: 'docs/runbooks/CONTROLLED_ACCEPTANCE.md#postgresql-rls-and-financial-invariants',
      evidenceDirectory: 'postgres',
      requiredEvidence: ['fixture.log'],
      passCriteria: ['database fixture passes'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;
const temporaryDirectories = [];

function semanticFixture(artifact, binding) {
  const value = {};
  for (const rule of controlledJsonEvidenceContracts[artifact]) {
    const segments = rule.path.split('.');
    let target = value;
    for (const segment of segments.slice(0, -1)) target = target[segment] ??= {};
    const sample =
      rule.equals !== undefined
        ? rule.equals
        : rule.binding
          ? binding[rule.binding]
          : rule.pattern?.includes('lequbao-v6-api')
            ? `ghcr.io/example/lequbao-v6-api@sha256:${'a'.repeat(64)}`
            : rule.pattern?.includes('lequbao-v6-worker')
              ? `ghcr.io/example/lequbao-v6-worker@sha256:${'a'.repeat(64)}`
              : rule.pattern?.includes('lequbao-v6-web')
                ? `ghcr.io/example/lequbao-v6-web@sha256:${'a'.repeat(64)}`
                : rule.pattern?.includes('{64}')
                  ? 'a'.repeat(64)
                  : rule.pattern?.includes('[1-9][0-9]')
                    ? '12345'
                    : rule.format === 'date-time'
                      ? '2026-08-19T01:00:00.000Z'
                      : rule.type === 'array'
                        ? rule.maxItems === 0
                          ? []
                          : [`${rule.path}-evidence`]
                        : rule.type === 'object'
                          ? { captured: true }
                          : rule.type === 'number'
                            ? (rule.minimum ?? 1)
                            : rule.type === 'boolean'
                              ? true
                              : `${rule.path}-evidence`;
    target[segments.at(-1)] = sample;
  }
  const images = {
    api: `ghcr.io/example/lequbao-v6-api@sha256:${'a'.repeat(64)}`,
    worker: `ghcr.io/example/lequbao-v6-worker@sha256:${'a'.repeat(64)}`,
    web: `ghcr.io/example/lequbao-v6-web@sha256:${'a'.repeat(64)}`,
  };
  const performanceSnapshot = {
    databaseName: 'lequ-controlled',
    sizeBytes: 1,
    connections: 1,
    committedTransactions: 1,
    rolledBackTransactions: 0,
    blocksRead: 1,
    blocksHit: 1,
    tempFiles: 0,
    tempBytes: 0,
    deadlocks: 0,
    estimatedLiveRows: 1,
    tableCount: 164,
    messageBacklog: { activeCount: 0, deadCount: 0, oldestActiveSeconds: 0 },
  };
  const performanceScenarios = [
    ['core-read', 500],
    ['customer-message-write', 500],
    ['core-write', 800],
  ].map(([name, thresholdP95Ms]) => ({
    name,
    requests: 20,
    successes: 20,
    errors: 0,
    p50Ms: 10,
    p95Ms: 20,
    p99Ms: 30,
    errorRate: 0,
    thresholdP95Ms,
  }));
  const alertRecords = Object.entries(requiredAlertPolicy).map(([code, [severity]], index) => ({
    alertId: `controlled-alert-${index + 1}`,
    code,
    severity,
    triggeredAt: '2026-08-19T01:00:00.000Z',
  }));
  const overrides = {
    'rls-denials.json': {
      attempts: ['cross-tenant-read', 'cross-tenant-write'].map((operation, index) => ({
        operation,
        denied: true,
        exposedFieldCount: 0,
        mutationCount: 0,
        auditRefHash: `${index + 1}`.repeat(64),
      })),
    },
    'tenant-context.json': {
      transactions: ['1', '2'].map((tenant, index) => ({
        connectionRefHash: 'c'.repeat(64),
        expectedTenantRefHash: tenant.repeat(64),
        observedTenantRefHash: tenant.repeat(64),
        resetVerified: true,
        sequence: index + 1,
      })),
    },
    'inbox-deduplication.json': {
      eventRefHash: 'd'.repeat(64),
      deliveryAttempts: 2,
      businessResultCount: 1,
      deliveries: [1, 2].map((attempt) => ({ eventRefHash: 'd'.repeat(64), attempt })),
      businessResults: [{ resultRefHash: 'e'.repeat(64) }],
    },
    'upload-response.json': { objectRefHash: '1'.repeat(64) },
    'object-metadata.json': { objectRefHash: '1'.repeat(64) },
    'object-metadata.json': {
      objectRefHash: '1'.repeat(64),
      retention: {
        policyRefHash: '2'.repeat(64),
        storageClass: 'compliance-retained',
        immutable: true,
        appliedAt: '2026-08-19T01:00:00.000Z',
        retainUntil: '2027-08-19T01:00:00.000Z',
      },
    },
    'ocr-provenance.json': {
      objectRefHash: '1'.repeat(64),
      candidates: [{ field: 'merchant-name', sourceRegionHash: '2'.repeat(64), confidence: 0.99 }],
      provenance: {
        gatewayRef: 'controlled-ocr-gateway',
        modelVersion: 'ocr-v1',
        processedAt: '2026-08-19T01:00:00.000Z',
      },
    },
    'concurrency-input.json': {
      stock: 3,
      requestedQuantity: 10,
      contenders: Array.from({ length: 10 }, (_, index) => ({
        contenderRef: `contender-${index}`,
        quantity: 1,
      })),
    },
    'order-results.json': {
      successfulQuantity: 3,
      successfulOrders: Array.from({ length: 3 }, (_, index) => ({
        contenderRef: `contender-${index}`,
        orderRefHash: `${index + 1}`.repeat(64),
        quantity: 1,
      })),
      failedContenders: Array.from({ length: 7 }, (_, index) => ({
        contenderRef: `contender-${index + 3}`,
        partialFactCount: 0,
      })),
    },
    'inventory-ledger.json': {
      openingStock: 3,
      closingStock: 0,
      soldQuantity: 3,
      entries: Array.from({ length: 3 }, (_, index) => ({
        type: 'SOLD',
        quantity: 1,
        orderRefHash: `${index + 1}`.repeat(64),
      })),
    },
    'provider-request-redacted.json': {
      orderRefHash: 'e'.repeat(64),
      merchantAccountRef: 'f'.repeat(64),
      serverOrderAmountFen: 100,
    },
    'provider-callback-redacted.json': {
      orderRefHash: 'e'.repeat(64),
      merchantAccountRef: 'f'.repeat(64),
      amountFen: 100,
    },
    'merchant-account-reconciliation.json': {
      orderRefHash: 'e'.repeat(64),
      providerMerchantAccountRef: 'f'.repeat(64),
      platformMerchantAccountRef: 'f'.repeat(64),
      amountFen: 100,
    },
    'refund-unknown-recovery.json': {
      merchantAccountRef: 'f'.repeat(64),
      providerQuery: {
        performed: true,
        sameIdempotencyKey: true,
        queriedAt: '2026-08-19T01:00:00.000Z',
      },
      finalState: 'REFUND_SUCCEEDED',
    },
    'runtime-policy.json': { allowedHosts: ['https://plugin-gateway.example.test/'] },
    'geo-target-redacted.json': {
      targetRefHash: '3'.repeat(64),
      storedClaims: [
        {
          field: 'merchant-name',
          valueHash: '4'.repeat(64),
          verifiedAt: '2026-08-19T01:00:00.000Z',
        },
      ],
    },
    'financial-policy-approvals.json': {
      decisionVersion: 'finance-v1',
      effectiveAt: '2026-08-19T01:00:00.000Z',
      decisions: {
        paymentResponsibilityResolved: true,
        merchantAccountMappingResolved: true,
        legacyBalanceResolved: true,
        distributionConflictC001Resolved: true,
        computeAllocationResolved: true,
        historicalSnapshotPreserved: true,
      },
      approvals: [
        {
          subjectId: 'org:business-owner',
          role: 'business owner',
          decision: 'APPROVED',
          receiptId: 'business-receipt',
          approvedAt: '2026-08-19T01:00:00.000Z',
        },
        {
          subjectId: 'org:finance-owner',
          role: 'finance owner',
          decision: 'APPROVED',
          receiptId: 'finance-receipt',
          approvedAt: '2026-08-19T01:00:00.000Z',
        },
      ],
      independentReview: {
        subjectId: 'org:finance-reviewer',
        decision: 'APPROVED',
        reviewedAt: '2026-08-19T01:00:00.000Z',
      },
    },
    'legacy-production-inventory.json': {
      generatedAt: '2026-08-19T01:00:00.000Z',
      verdict: 'INDEPENDENT_REVIEW_REQUIRED',
      limitations: ['independent waiver required'],
      sources: [
        {
          id: 'local-v5',
          kind: 'sqlite',
          declaredEnvironment: 'development',
          locationSha256: 'a'.repeat(64),
          fileSha256: 'b'.repeat(64),
          bytes: 1,
          tableCount: 1,
          nonEmptyTableCount: 1,
          rowCount: 1,
          outcome: 'DATA_PRESENT_REVIEW_REQUIRED',
        },
      ],
    },
    'greenfield-waiver.json': {
      result: 'PASS',
      environments: [
        {
          environment: 'production',
          ownerRef: 'org:production-owner',
          decision: 'ZERO_PRODUCTION_DATA',
        },
      ],
      coverage: Object.fromEntries(
        ['hosts', 'databasePaths', 'persistentVolumes', 'objectStores', 'providerLedgers'].map(
          (category) => [
            category,
            [
              {
                scopeRef: category === 'databasePaths' ? 'a'.repeat(64) : `${category}-scope`,
                ownerRef: `org:${category}-owner`,
                inspectionMethod: 'accountable inventory',
                inspectedAt: '2026-08-19T01:00:00.000Z',
                productionRecordCount: 0,
              },
            ],
          ],
        ),
      ),
      domainZeroCounts: Object.fromEntries(
        [
          'orders',
          'payments',
          'refunds',
          'rewards',
          'verifications',
          'customers',
          'consents',
          'merchants',
          'identities',
          'providerLedgers',
        ].map((domain) => [domain, 0]),
      ),
      approvals: [
        ...['product owner', 'business owner', 'security reviewer', 'migration owner'].map(
          (role, index) => ({
            subjectId: `org:greenfield-${index}`,
            role,
            decision: 'APPROVED',
            receiptId: `greenfield-receipt-${index}`,
            approvedAt: '2026-08-19T01:00:00.000Z',
          }),
        ),
      ],
      reviewedAt: '2026-08-19T01:00:00.000Z',
    },
    'backup.manifest.json': {
      backupFile: 'lequ-20260819T010000Z.dump.age',
      encryptedSha256: 'd'.repeat(64),
      financialSnapshotSha256: 'e'.repeat(64),
      financialSnapshot: {
        schemaVersion: 1,
        tenantCount: 1,
        tenants: { '123e4567-e89b-42d3-a456-426614174000': { orders_count: 1 } },
      },
    },
    'restore-report.json': {
      backupFile: 'lequ-20260819T010000Z.dump.age',
      encryptedSha256: 'd'.repeat(64),
      financialSnapshotSha256: 'e'.repeat(64),
      databaseFixturesPassed: requiredDatabaseFixtureFiles,
      error: null,
    },
    'physical-wal-evidence.json': {
      sourceFaultDomainRefHash: 'a'.repeat(64),
      recoveryFaultDomainRefHash: 'b'.repeat(64),
      timeline: [
        ['BACKUP_SELECTED', '2026-08-19T00:58:00.000Z', '1'],
        ['RESTORE_STARTED', '2026-08-19T00:59:00.000Z', '2'],
        ['WAL_REPLAY_COMPLETED', '2026-08-19T01:01:00.000Z', '3'],
        ['RECOVERY_VALIDATED', '2026-08-19T01:02:00.000Z', '4'],
      ].map(([event, at, ref]) => ({ event, at, evidenceRefHash: ref.repeat(64) })),
    },
    'external-deletion-samples.json': {
      result: 'PASS',
      targets: ['object-store', 'search', 'vector', 'cache'].map((target) => ({
        target,
        receiptRef: `${target}-receipt`,
        deleted: true,
        verifiedAt: '2026-08-19T01:00:00.000Z',
      })),
      samples: ['object-store', 'search', 'vector', 'cache'].map((target, index) => ({
        target,
        sampleRefHash: `${index + 6}`.repeat(64),
        receiptRef: `${target}-receipt`,
        remainingMatches: 0,
        verifiedAt: '2026-08-19T01:01:00.000Z',
      })),
    },
    'performance-report.json': {
      images,
      failure: null,
      requestsPerScenario: 20,
      scenarios: performanceScenarios,
      database: { before: performanceSnapshot, after: performanceSnapshot },
      persistence: {
        expectedMessageIds: 20,
        persistedMessageIds: 20,
        missingMessageIds: [],
        duplicateAcknowledgedMessageIds: [],
      },
    },
    'candidate-image-digests.json': { images },
    'deployment-topology.json': {
      environment: 'controlled-preproduction',
      services: {
        api: {
          image: images.api,
          deploymentRefHash: '1'.repeat(64),
          replicas: 2,
          readyReplicas: 2,
        },
        worker: {
          image: images.worker,
          deploymentRefHash: '2'.repeat(64),
          replicas: 2,
          readyReplicas: 2,
        },
        web: {
          image: images.web,
          deploymentRefHash: '3'.repeat(64),
          replicas: 2,
          readyReplicas: 2,
        },
      },
      dataStores: ['postgresql', 'object-store'].map((kind, index) => ({
        kind,
        endpointRefHash: `${index + 4}`.repeat(64),
        tlsVerified: true,
      })),
    },
    'monitoring-snapshot.json': {
      alerts: [
        {
          alertId: 'expected-load-alert',
          status: 'EXPECTED',
          observedAt: '2026-08-19T01:00:00.000Z',
        },
      ],
      saturation: { cpuMaxPercent: 70, memoryMaxPercent: 75, databaseConnectionMaxPercent: 60 },
      backlog: { outboxDeadDelta: 0, unacknowledgedMessageCount: 0 },
    },
    'consumer-build.json': { version: 'consumer-1' },
    'merchant-template-build.json': { version: 'merchant-1' },
    'review-publish.json': {
      consumerVersion: 'consumer-1',
      merchantVersion: 'merchant-1',
      reviewVersion: 'pilot-1',
      publishedVersion: 'pilot-1',
      pilotScope: { percentage: 10, scopeRefs: ['pilot-store-ref'] },
    },
    'device-matrix.json': {
      devices: ['iOS', 'Android'].map((platform, index) => ({
        platform,
        deviceRefHash: `${index + 1}`.repeat(64),
        officialClientVersion: 'official-client-1',
        result: 'PASS',
      })),
      scenarios: ['consumer', 'merchant-template'].map((packageName) => ({
        package: packageName,
        version: packageName === 'consumer' ? 'consumer-1' : 'merchant-1',
        result: 'PASS',
        deviceRefs: ['1'.repeat(64), '2'.repeat(64)],
      })),
    },
    'rollback.json': { fromVersion: 'pilot-1', toVersion: 'pilot-safe-2' },
    'identity-session-redacted.json': {
      revocation: {
        revokedSessionRejected: true,
        sessionRefHash: '6'.repeat(64),
        revocationReceiptHash: '7'.repeat(64),
        revokedAt: '2026-08-19T01:00:00.000Z',
        rejectedAt: '2026-08-19T01:00:05.000Z',
        latencySeconds: 5,
      },
      mfa: {
        highRiskRequired: true,
        downgradeRejected: true,
        challengeRefHash: '8'.repeat(64),
        challengedAt: '2026-08-19T01:00:00.000Z',
        downgradeRejectedAt: '2026-08-19T01:00:01.000Z',
      },
      sessions: [
        {
          sessionRefHash: '6'.repeat(64),
          tenantRefHash: '9'.repeat(64),
          tenantScopeVerified: true,
          shortLived: true,
          issuedAt: '2026-08-19T00:00:00.000Z',
          expiresAt: '2026-08-19T01:00:00.000Z',
        },
      ],
    },
    'secret-access-audit.json': {
      secretManager: 'vault:controlled',
      accessEvents: ['READ', 'ROTATE', 'DENIED_READ'].map((action, index) => ({
        secretRefHash: '7'.repeat(64),
        subjectRef:
          action === 'DENIED_READ'
            ? 'workforce:unauthorized-secret-reader'
            : 'workforce:controlled-secret-operator',
        action,
        allowed: action !== 'DENIED_READ',
        auditEventRefHash: `${index + 1}`.repeat(64),
        occurredAt: '2026-08-19T01:00:00.000Z',
      })),
    },
    'object-retention.json': {
      policy: {
        encryptionRequired: true,
        deletionEnforced: true,
        policyRefHash: '8'.repeat(64),
        effectiveAt: '2026-08-18T00:00:00.000Z',
        retentionDays: 30,
        encryptionMode: 'provider-managed',
      },
      objectsSampled: [
        {
          objectRefHash: '9'.repeat(64),
          policyRefHash: '8'.repeat(64),
          encryptionKeyRefHash: 'a'.repeat(64),
          deletionAuthorizationRefHash: 'b'.repeat(64),
          encrypted: true,
          retentionApplied: true,
          deletionVerified: true,
          createdAt: '2026-08-19T00:00:00.000Z',
          retentionUntil: '2026-09-18T00:00:00.000Z',
          deletionRequestedAt: '2026-08-19T01:00:00.000Z',
          deletedAt: '2026-08-19T01:01:00.000Z',
          verifiedAt: '2026-08-19T01:02:00.000Z',
        },
      ],
    },
    'privacy-export-delete.json': {
      export: {
        encrypted: true,
        verifiedSessionDelivery: true,
        requestedAt: '2026-08-19T01:00:00.000Z',
        completedAt: '2026-08-19T01:01:00.000Z',
        durationSeconds: 60,
        deliveryRefHash: 'c'.repeat(64),
        sessionRefHash: 'd'.repeat(64),
      },
      deletion: {
        authorized: true,
        auditRecorded: true,
        requestedAt: '2026-08-19T01:00:00.000Z',
        authorizedAt: '2026-08-19T01:01:00.000Z',
        completedAt: '2026-08-19T01:04:00.000Z',
        authorizationRefHash: 'e'.repeat(64),
        auditRefHash: 'f'.repeat(64),
      },
      targets: ['database', 'object-store', 'search', 'vector', 'cache'].map((target, index) => ({
        target,
        receiptHash: `${index + 1}`.repeat(64),
        deleted: true,
        deletedAt: '2026-08-19T01:02:00.000Z',
        verifiedAt: '2026-08-19T01:03:00.000Z',
      })),
    },
    'alert-delivery.json': {
      alerts: alertRecords,
      recipients: [{ recipientRefHash: 'a'.repeat(64), role: 'primary-on-call', channel: 'pager' }],
      deliveryResults: alertRecords.map((alert) => ({
        alertId: alert.alertId,
        delivered: true,
        deliveredAt: '2026-08-19T01:01:00.000Z',
        channelRefHash: 'b'.repeat(64),
        recipientRefHash: 'a'.repeat(64),
        attemptCount: 1,
      })),
    },
    'oncall-acknowledgement.json': {
      alerts: alertRecords,
      acknowledgements: alertRecords.map((alert) => ({
        alertId: alert.alertId,
        acknowledged: true,
        acknowledgedAt: '2026-08-19T01:02:00.000Z',
        escalationOutcome: 'ACKNOWLEDGED',
        acknowledgedByRefHash: 'a'.repeat(64),
      })),
    },
    'legal-document-release.json': {
      result: 'PASS',
      documents: [
        {
          documentId: 'privacy-policy',
          version: 'v1',
          ownerRef: 'org:legal-owner',
          approvalReceipt: 'legal-receipt-1',
          sha256: 'c'.repeat(64),
          publishedUrl: 'https://example.test/privacy',
          effectiveAt: '2026-08-19T01:00:00.000Z',
        },
      ],
      surfaceMatrix: ['lequbao-web', 'lequ-life-miniapp', 'merchant-miniapp'].map((surface) => ({
        surface,
        documentIds: ['privacy-policy'],
        publicationVerified: true,
        accountPrivacyInstructionsVerified: true,
        failures: [],
      })),
      approvals: [
        ...['product owner', 'legal compliance reviewer'].map((role, index) => ({
          subjectId: `org:legal-${index}`,
          role,
          decision: 'APPROVED',
          receiptId: `legal-receipt-${index}`,
          approvedAt: '2026-08-19T01:00:00.000Z',
        })),
      ],
    },
  };
  Object.assign(value, overrides[artifact]);
  return value;
}

async function fixture(overrides = {}) {
  const parent = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-results-'));
  temporaryDirectories.push(parent);
  const root = path.join(parent, 'evidence');
  const sourceRoot = path.join(parent, 'source');
  await mkdir(sourceRoot);
  await prepareControlledEvidenceWorkspace({
    plan,
    planSource,
    evidenceRoot: root,
    releaseCommit,
    deploymentId: 'candidate-results-1',
    environment: 'controlled-preproduction',
    createdAt: '2026-08-19T00:59:00.000Z',
  });
  const evidence = 'controlled fixture passed\n';
  const source = path.join(sourceRoot, 'fixture.log');
  await writeFile(source, evidence);
  const captured = await captureControlledEvidenceArtifact({
    plan,
    planSource,
    evidenceRoot: root,
    suiteCode: 'POSTGRES',
    artifact: 'fixture.log',
    source,
    capturedAt: '2026-08-19T01:00:00.000Z',
  });
  const results = {
    version: 3,
    releaseCommit,
    planSha256: createHash('sha256').update(planSource).digest('hex'),
    generatedAt: new Date().toISOString(),
    suites: [
      {
        code: 'POSTGRES',
        result: 'PASS',
        environmentGate: 'POSTGRESQL',
        executedById: 'org:database-engineer-01',
        executedByRole: 'database engineer',
        reviewedById: 'org:release-owner-01',
        reviewedByRole: 'release owner',
        startedAt: '2026-08-19T01:00:00.000Z',
        completedAt: '2026-08-19T01:05:00.000Z',
        reviewedAt: '2026-08-19T01:06:00.000Z',
        evidence: [
          {
            file: 'postgres/fixture.log',
            sha256: createHash('sha256').update(evidence).digest('hex'),
            captureReceiptSha256: captured.captureReceiptSha256,
          },
        ],
      },
    ],
    ...overrides,
  };
  const resultsFile = path.join(root, 'results.json');
  await writeFile(resultsFile, JSON.stringify(results));
  return { root, results, resultsFile };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('controlled launch results', () => {
  it('accepts only hash-verified evidence bound to the candidate and current plan', async () => {
    const { resultsFile } = await fixture();
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toEqual([]);
  });

  it('rejects a different candidate, plan hash or missing suite', async () => {
    const { resultsFile } = await fixture({
      releaseCommit: 'b'.repeat(40),
      planSha256: '0'.repeat(64),
      suites: [],
    });
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'controlled results are not bound to RELEASE_COMMIT',
        'controlled results are not bound to the current acceptance plan',
        'controlled result suite is missing: POSTGRES',
      ]),
    );
  });

  it('rejects self-review, undeclared evidence and a mismatched artifact hash', async () => {
    const { results, resultsFile } = await fixture();
    results.providerToken = 'must-not-enter-results';
    results.suites[0].reviewedByRole = 'database engineer';
    results.suites[0].reviewedById = 'org:database-engineer-01';
    results.suites[0].internalNote = 'undeclared';
    results.suites[0].evidence[0].sha256 = '0'.repeat(64);
    results.suites[0].evidence[0].note = 'undeclared';
    results.suites[0].evidence.push({ file: 'postgres/extra.log', sha256: '0'.repeat(64) });
    await writeFile(resultsFile, JSON.stringify(results));
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'controlled results contain undeclared fields: providerToken',
        'POSTGRES requires an independent reviewer role',
        'POSTGRES requires a different accountable reviewer',
        'POSTGRES contains undeclared fields: internalNote',
        'POSTGRES evidence contains undeclared fields: note',
        'POSTGRES evidence hash mismatch for postgres/fixture.log',
        'POSTGRES contains undeclared evidence: postgres/extra.log',
      ]),
    );
  });

  it('fails closed for malformed records and impossible execution chronology', async () => {
    const { results, resultsFile } = await fixture();
    results.generatedAt = '2026-08-19T01:02:00.000Z';
    results.suites[0].completedAt = '2026-08-19T01:05:00.000Z';
    results.suites[0].reviewedAt = '2026-08-19T01:04:00.000Z';
    results.suites[0].evidence.push(null);
    results.suites.push(null);
    await writeFile(resultsFile, JSON.stringify(results));
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'POSTGRES completed after the controlled results were generated',
        'POSTGRES has invalid independent-review timestamp',
        'POSTGRES contains an invalid evidence record',
        'controlled results contain an invalid suite record',
      ]),
    );
  });

  it('requires canonical millisecond UTC timestamps for results and review chronology', async () => {
    const { results, resultsFile } = await fixture();
    results.generatedAt = '2026-08-19T09:06:00.000+08:00';
    results.suites[0].startedAt = '2026-08-19T01:00:00Z';
    results.suites[0].reviewedAt = '2026-08-19T09:06:00.000+08:00';
    await writeFile(resultsFile, JSON.stringify(results));
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'controlled results generatedAt is invalid or in the future',
        'POSTGRES has invalid execution timestamps',
        'POSTGRES has invalid independent-review timestamp',
      ]),
    );
  });

  it('locks the controlled execution context schema, counts and creation time', async () => {
    const { root, resultsFile } = await fixture();
    const contextFile = path.join(root, 'controlled-execution-context.json');
    const context = JSON.parse(await readFile(contextFile, 'utf8'));
    context.undeclared = true;
    context.suiteCount = 2;
    context.requiredArtifactCount = 99;
    context.createdAt = '2026-08-19T08:59:00.000+08:00';
    context.deploymentId = 'operator@example.test';
    await writeFile(contextFile, JSON.stringify(context));
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'controlled execution context contains undeclared fields: undeclared',
        'controlled execution context is not bound to the candidate and current plan',
        'controlled execution context suite or artifact counts do not match the plan',
        'controlled execution context createdAt is invalid or after result generation',
      ]),
    );
  });

  it('rejects evidence captured after the controlled result was generated', async () => {
    const { results, resultsFile } = await fixture();
    results.generatedAt = '2026-08-19T00:59:30.000Z';
    await writeFile(resultsFile, JSON.stringify(results));
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toContain(
      'POSTGRES capture receipt is later than result generation for postgres/fixture.log',
    );
  });

  it('rejects a missing or semantically forged capture receipt even with a matching receipt hash', async () => {
    const missing = await fixture();
    const receiptFile = path.join(
      missing.root,
      '.controlled-receipts',
      'postgres',
      'fixture.log.receipt.json',
    );
    await rm(receiptFile);
    await expect(
      verifyControlledResults({
        plan,
        planSource,
        resultsFile: missing.resultsFile,
        releaseCommit,
      }),
    ).resolves.toContain('POSTGRES capture receipt is missing for postgres/fixture.log');

    const forged = await fixture();
    const forgedReceiptFile = path.join(
      forged.root,
      '.controlled-receipts',
      'postgres',
      'fixture.log.receipt.json',
    );
    const receipt = JSON.parse(await readFile(forgedReceiptFile, 'utf8'));
    receipt.deploymentId = 'different-deployment';
    const contents = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(forgedReceiptFile, contents);
    forged.results.suites[0].evidence[0].captureReceiptSha256 = createHash('sha256')
      .update(contents)
      .digest('hex');
    await writeFile(forged.resultsFile, JSON.stringify(forged.results));
    await expect(
      verifyControlledResults({
        plan,
        planSource,
        resultsFile: forged.resultsFile,
        releaseCommit,
      }),
    ).resolves.toContain(
      'POSTGRES capture receipt deploymentId does not match for postgres/fixture.log',
    );
  });

  it('rejects a non-object result document without throwing', async () => {
    const { resultsFile } = await fixture();
    await writeFile(resultsFile, 'null');
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toEqual(['CONTROLLED_RESULTS_FILE must contain a JSON object']);
  });

  it('verifies the complete eleven-suite plan and detects later artifact tampering', async () => {
    const actualPlanSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
    const actualPlan = JSON.parse(actualPlanSource);
    const parent = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-full-plan-'));
    temporaryDirectories.push(parent);
    const root = path.join(parent, 'evidence');
    const sourceRoot = path.join(parent, 'source');
    await mkdir(sourceRoot);
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    const generatedAt = new Date().toISOString();
    const candidate = 'c'.repeat(40);
    await prepareControlledEvidenceWorkspace({
      plan: actualPlan,
      planSource: actualPlanSource,
      evidenceRoot: root,
      releaseCommit: candidate,
      deploymentId: 'candidate-full-plan-1',
      environment: 'controlled-preproduction',
      createdAt: new Date(Date.now() - 180_000).toISOString(),
    });
    const suites = [];
    for (const suite of actualPlan.suites) {
      const sourceDirectory = path.join(sourceRoot, suite.evidenceDirectory);
      await mkdir(sourceDirectory, { recursive: true });
      const evidence = [];
      for (const file of suite.requiredEvidence) {
        const contents = file.endsWith('.json')
          ? `${JSON.stringify(
              semanticFixture(file, {
                releaseCommit: candidate,
                deploymentId: 'candidate-full-plan-1',
              }),
            )}\n`
          : `Controlled evidence for ${suite.code}: ${file}\n`;
        const source = path.join(sourceDirectory, file);
        await writeFile(source, contents);
        const captured = await captureControlledEvidenceArtifact({
          plan: actualPlan,
          planSource: actualPlanSource,
          evidenceRoot: root,
          suiteCode: suite.code,
          artifact: file,
          source,
          capturedAt: new Date(Date.now() - 90_000).toISOString(),
        });
        evidence.push({
          file: path.posix.join(suite.evidenceDirectory, file),
          sha256: createHash('sha256').update(contents).digest('hex'),
          captureReceiptSha256: captured.captureReceiptSha256,
        });
      }
      suites.push({
        code: suite.code,
        result: 'PASS',
        environmentGate: suite.environmentGate,
        executedById: `org:${suite.code.toLowerCase()}-executor`,
        executedByRole: suite.executorRole,
        reviewedById: `org:${suite.code.toLowerCase()}-reviewer`,
        reviewedByRole: `${suite.executorRole} independent reviewer`,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        completedAt,
        reviewedAt: new Date(Date.now() - 30_000).toISOString(),
        evidence,
      });
    }
    const resultsFile = path.join(root, 'results.json');
    const fullResults = {
      version: 3,
      releaseCommit: candidate,
      planSha256: createHash('sha256').update(actualPlanSource).digest('hex'),
      generatedAt,
      suites,
    };
    await writeFile(resultsFile, JSON.stringify(fullResults));
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toEqual([]);

    const performanceSuite = actualPlan.suites.find(
      (suite) => suite.code === 'PERFORMANCE_CORE_AND_MESSAGES',
    );
    const performanceFile = path.join(
      root,
      performanceSuite.evidenceDirectory,
      'performance-report.json',
    );
    const performance = JSON.parse(await readFile(performanceFile, 'utf8'));
    performance.images.api = `ghcr.io/example/lequbao-v6-api@sha256:${'b'.repeat(64)}`;
    const performanceContents = `${JSON.stringify(performance)}\n`;
    await writeFile(performanceFile, performanceContents);
    const performanceHash = createHash('sha256').update(performanceContents).digest('hex');
    const receiptFile = path.join(
      root,
      '.controlled-receipts',
      performanceSuite.evidenceDirectory,
      'performance-report.json.receipt.json',
    );
    const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
    receipt.sha256 = performanceHash;
    receipt.size = Buffer.byteLength(performanceContents);
    const receiptContents = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(receiptFile, receiptContents);
    const performanceResult = fullResults.suites
      .find((suite) => suite.code === performanceSuite.code)
      .evidence.find((item) => item.file.endsWith('/performance-report.json'));
    performanceResult.sha256 = performanceHash;
    performanceResult.captureReceiptSha256 = createHash('sha256')
      .update(receiptContents)
      .digest('hex');
    await writeFile(resultsFile, JSON.stringify(fullResults));
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toContain(
      'PERFORMANCE_CORE_AND_MESSAGES cross-evidence contract failed: performance report images do not match the candidate manifest',
    );

    const firstSuite = actualPlan.suites[0];
    const firstFile = firstSuite.requiredEvidence[0];
    await writeFile(path.join(root, firstSuite.evidenceDirectory, firstFile), 'tampered\n');
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toContain(
      `${firstSuite.code} evidence hash mismatch for ${path.posix.join(firstSuite.evidenceDirectory, firstFile)}`,
    );
  }, 30_000);

  it('rejects content-invalid evidence even when its hash is updated to match', async () => {
    const { root, results, resultsFile } = await fixture();
    const contents = 'TODO\n';
    await writeFile(path.join(root, 'postgres', 'fixture.log'), contents);
    results.suites[0].evidence[0].sha256 = createHash('sha256').update(contents).digest('hex');
    await writeFile(resultsFile, JSON.stringify(results));
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toContain(
      'POSTGRES evidence is invalid for postgres/fixture.log: contains only a placeholder verdict',
    );
  });
});
