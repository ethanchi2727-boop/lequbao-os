import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  controlledJsonEvidenceContracts,
  requiredDatabaseFixtureFiles,
  validateControlledJsonEvidence,
} from './controlled-evidence-contracts.mjs';

describe('controlled JSON evidence contracts', () => {
  it('covers every JSON artifact in the authoritative controlled plan exactly', async () => {
    const plan = JSON.parse(await readFile('docs/release/controlled-acceptance-plan.json', 'utf8'));
    const artifacts = plan.suites
      .flatMap((suite) => suite.requiredEvidence)
      .filter((artifact) => artifact.endsWith('.json'))
      .sort();
    expect(Object.keys(controlledJsonEvidenceContracts).sort()).toEqual(artifacts);
  });

  it('rejects unrelated, missing, empty and wrong-type semantic evidence', () => {
    expect(validateControlledJsonEvidence('performance-report.json', { safe: true })).toContain(
      'performance-report.json is missing result',
    );
    expect(
      validateControlledJsonEvidence('performance-report.json', {
        result: 'PASS',
        releaseCommit: '',
        images: {},
        scenarios: {},
        persistence: {},
      }),
    ).toEqual(
      expect.arrayContaining([
        'performance-report.json releaseCommit must not be empty',
        'performance-report.json images must not be empty',
        'performance-report.json scenarios must be array',
        'performance-report.json persistence must not be empty',
      ]),
    );
  });

  it('enforces PASS, true and zero-unresolved invariants', () => {
    expect(
      validateControlledJsonEvidence('restore-report.json', {
        result: 'FAIL',
        rpoSeconds: 20,
        rtoSeconds: 40,
        financialSnapshotMatch: false,
        databaseFixturesPassed: ['fixture.sql'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'restore-report.json result must equal "PASS"',
        'restore-report.json financialSnapshotMatch must equal true',
      ]),
    );
    expect(
      validateControlledJsonEvidence('legal-document-release.json', {
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'candidate-1',
        documents: ['privacy'],
        surfaceMatrix: ['consumer'],
        approvals: ['legal'],
        unresolvedItems: ['missing-publication'],
      }),
    ).toContain('legal-document-release.json unresolvedItems must contain at most 0 items');
  });

  it('enforces candidate bindings, operational thresholds and digest formats', () => {
    expect(
      validateControlledJsonEvidence(
        'performance-report.json',
        {
          result: 'PASS',
          releaseCommit: 'b'.repeat(40),
          images: { api: 'bound' },
          scenarios: ['core-read'],
          persistence: { missing: 0 },
        },
        { releaseCommit: 'a'.repeat(40) },
      ),
    ).toContain('performance-report.json releaseCommit does not match releaseCommit');
    expect(
      validateControlledJsonEvidence('restore-report.json', {
        result: 'PASS',
        rpoSeconds: 301,
        rtoSeconds: 3601,
        financialSnapshotMatch: true,
        databaseFixturesPassed: ['fixture.sql'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'restore-report.json rpoSeconds must be at most 300',
        'restore-report.json rtoSeconds must be at most 3600',
      ]),
    );
    expect(
      validateControlledJsonEvidence('candidate-image-digests.json', {
        version: 1,
        releaseCommit: 'a'.repeat(40),
        workflowRunId: 'not-a-run',
        images: { api: 'latest', worker: 'latest', web: 'latest' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'candidate-image-digests.json images.api has invalid format',
        'candidate-image-digests.json images.worker has invalid format',
        'candidate-image-digests.json images.web has invalid format',
        'candidate-image-digests.json workflowRunId has invalid format',
      ]),
    );
    const image = (owner, target) =>
      `ghcr.io/${owner}/lequbao-v6-${target}@sha256:${'a'.repeat(64)}`;
    expect(
      validateControlledJsonEvidence('candidate-image-digests.json', {
        version: 1,
        releaseCommit: 'a'.repeat(40),
        workflowRunId: '12345',
        images: {
          api: image('owner-one', 'api'),
          worker: image('owner-two', 'worker'),
          web: image('owner-one', 'web'),
        },
      }),
    ).toContain('candidate-image-digests.json candidate images must share one GHCR owner');
    expect(
      validateControlledJsonEvidence('rollback.json', {
        result: 'PASS',
        fromVersion: '1.0.0',
        toVersion: '1.0.1',
        verifiedAt: '2099-01-01T00:00:00.000Z',
      }),
    ).toContain('rollback.json verifiedAt must not be in the future');
    expect(
      validateControlledJsonEvidence('rollback.json', {
        result: 'PASS',
        fromVersion: '1.0.0',
        toVersion: '1.0.1',
        verifiedAt: '2026-08-19T09:00:00.000+08:00',
      }),
    ).toContain('rollback.json verifiedAt must be a canonical millisecond UTC timestamp');
  });

  it('rejects hollow greenfield, financial and legal approvals', () => {
    expect(
      validateControlledJsonEvidence('greenfield-waiver.json', {
        result: 'PASS',
        releaseCommit: 'a'.repeat(40),
        environments: ['production'],
        coverage: { hosts: ['checked'] },
        domainZeroCounts: { orders: 0 },
        approvals: ['approved'],
        reviewedAt: '2026-08-19T01:00:00.000Z',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exact production business domains'),
        expect.stringContaining('coverage.objectStores'),
        expect.stringContaining('approvals[0] must be an object'),
        expect.stringContaining('approvals must include security reviewer'),
      ]),
    );
    expect(
      validateControlledJsonEvidence('financial-policy-approvals.json', {
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'deployment-1',
        decisionVersion: 'v1',
        effectiveAt: '2026-08-19T01:00:00.000Z',
        decisions: { paymentResponsibilityResolved: true },
        approvals: ['approved'],
        independentReview: { decision: 'PENDING' },
        unresolvedItems: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('distributionConflictC001Resolved'),
        expect.stringContaining('approvals must include finance owner'),
        expect.stringContaining('independentReview.decision'),
      ]),
    );
    expect(
      validateControlledJsonEvidence('legal-document-release.json', {
        result: 'PASS',
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'deployment-1',
        documents: ['privacy'],
        surfaceMatrix: ['consumer'],
        approvals: ['approved'],
        unresolvedItems: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('documents[0] must be an object'),
        expect.stringContaining('surfaceMatrix must include lequbao-web'),
        expect.stringContaining('approvals must include legal compliance reviewer'),
      ]),
    );
    const personalIdentityApprovals = validateControlledJsonEvidence(
      'financial-policy-approvals.json',
      {
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'deployment-1',
        decisionVersion: 'v1',
        effectiveAt: '2026-08-19T01:00:00.000Z',
        decisions: {},
        approvals: [
          {
            subjectId: 'owner@example.test',
            role: 'business owner',
            decision: 'APPROVED',
            receiptId: 'receipt with spaces',
            approvedAt: '2026-08-19T00:58:00.000Z',
          },
        ],
        independentReview: {
          subjectId: 'reviewer@example.test',
          decision: 'APPROVED',
          reviewedAt: '2026-08-19T00:59:00.000Z',
        },
        unresolvedItems: [],
      },
    );
    expect(personalIdentityApprovals).toEqual(
      expect.arrayContaining([
        expect.stringContaining('approvals[0].subjectId must be an approved opaque subject'),
        expect.stringContaining('approvals[0].receiptId must be an opaque reference'),
        expect.stringContaining('independentReview.subjectId must be an approved opaque subject'),
      ]),
    );
  });

  it('rejects hollow performance and disaster-recovery PASS evidence', () => {
    expect(
      validateControlledJsonEvidence('performance-report.json', {
        result: 'PASS',
        schemaVersion: 1,
        releaseCommit: 'a'.repeat(40),
        images: { api: 'bound' },
        startedAt: '2026-08-19T01:00:00.000Z',
        completedAt: '2026-08-19T01:01:00.000Z',
        concurrency: 1,
        requestsPerScenario: 1,
        durationSeconds: 60,
        scenarios: ['passed'],
        database: { before: {}, after: {} },
        persistence: {
          expectedMessageIds: 0,
          persistedMessageIds: 0,
          missingMessageIds: [],
          duplicateAcknowledgedMessageIds: ['same-message-id'],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('scenarios[0] must be an object'),
        expect.stringContaining('scenarios must include core-read'),
        expect.stringContaining('database.before.tableCount'),
        'performance-report.json persistence duplicateAcknowledgedMessageIds must be empty',
      ]),
    );
    expect(
      validateControlledJsonEvidence('restore-report.json', {
        result: 'PASS',
        schemaVersion: 1,
        backupFile: 'lequ-20260819T010000Z.dump.age',
        failureTime: '2026-08-19T01:00:00.000Z',
        backupCompletedAt: '2026-08-19T00:59:00.000Z',
        restoreStartedAt: '2026-08-19T01:01:00.000Z',
        restoreCompletedAt: '2026-08-19T01:02:00.000Z',
        rpoSeconds: 1,
        rtoSeconds: 120,
        rpoThresholdSeconds: 300,
        rtoThresholdSeconds: 3600,
        encryptedSha256: 'a'.repeat(64),
        financialSnapshotSha256: 'b'.repeat(64),
        encryptedSha256Verified: true,
        financialSnapshotMatch: true,
        privacyReplayTasksEnqueued: 1,
        databaseFixturesPassed: ['only-one.sql'],
        error: 'ignored failure',
      }),
    ).toEqual(
      expect.arrayContaining([
        'restore-report.json error must equal null for PASS',
        `restore-report.json databaseFixturesPassed must equal the exact ${requiredDatabaseFixtureFiles.length}-file fixture set`,
      ]),
    );
  });

  it('recomputes restore objectives and requires the current fixture set', () => {
    const failures = validateControlledJsonEvidence('restore-report.json', {
      result: 'PASS',
      schemaVersion: 1,
      backupFile: 'lequ-20260819T010000Z.dump.age',
      failureTime: '2026-08-19T01:01:00.000Z',
      backupCompletedAt: '2026-08-19T01:00:00.000Z',
      restoreStartedAt: '2026-08-19T01:02:00.000Z',
      restoreCompletedAt: '2026-08-19T01:03:00.000Z',
      rpoSeconds: 1,
      rtoSeconds: 1,
      rpoThresholdSeconds: 300,
      rtoThresholdSeconds: 3600,
      encryptedSha256: 'a'.repeat(64),
      financialSnapshotSha256: 'b'.repeat(64),
      encryptedSha256Verified: true,
      financialSnapshotMatch: true,
      privacyReplayTasksEnqueued: 1,
      databaseFixturesPassed: requiredDatabaseFixtureFiles.slice(1),
      error: null,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        `restore-report.json databaseFixturesPassed must equal the exact ${requiredDatabaseFixtureFiles.length}-file fixture set`,
        'restore-report.json rpoSeconds does not reconcile with the evidence timeline',
        'restore-report.json rtoSeconds does not reconcile with the evidence timeline',
      ]),
    );
  });

  it('recalculates performance counts, rates and percentile ordering', () => {
    const scenario = (name, thresholdP95Ms) => ({
      name,
      requests: 10,
      successes: 11,
      errors: -1,
      p50Ms: 20,
      p95Ms: 10,
      p99Ms: 15,
      errorRate: 0,
      thresholdP95Ms,
    });
    const failures = validateControlledJsonEvidence('performance-report.json', {
      result: 'PASS',
      schemaVersion: 1,
      releaseCommit: 'a'.repeat(40),
      workflowRunId: '12345',
      images: {
        api: `ghcr.io/example/lequbao-v6-api@sha256:${'a'.repeat(64)}`,
        worker: `ghcr.io/example/lequbao-v6-worker@sha256:${'b'.repeat(64)}`,
        web: `ghcr.io/example/lequbao-v6-web@sha256:${'c'.repeat(64)}`,
      },
      startedAt: '2026-08-19T01:00:00.000Z',
      completedAt: '2026-08-19T01:01:00.000Z',
      concurrency: 1.5,
      requestsPerScenario: 10,
      durationSeconds: 60,
      failure: null,
      scenarios: [
        scenario('core-read', 500),
        scenario('customer-message-write', 500),
        scenario('core-write', 800),
      ],
      persistence: {
        expectedMessageIds: -1,
        persistedMessageIds: 10.5,
        missingMessageIds: [],
        duplicateAcknowledgedMessageIds: [],
      },
      database: { before: {}, after: {} },
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'performance-report.json requestsPerScenario must be at least 20',
        'performance-report.json concurrency must be an integer',
        'performance-report.json scenarios[0].errors must be a non-negative integer',
        'performance-report.json scenarios[0].errorRate does not reconcile with errors and requests',
        'performance-report.json scenarios[0] percentiles must be ordered p50 <= p95 <= p99',
        'performance-report.json persistence expectedMessageIds must be a non-negative integer',
        'performance-report.json persistence persistedMessageIds must be a non-negative integer',
      ]),
    );
  });

  it('freezes monitoring saturation and chronology with unique alerts', () => {
    const failures = validateControlledJsonEvidence('monitoring-snapshot.json', {
      releaseCommit: 'a'.repeat(40),
      deploymentId: 'controlled-deployment-1',
      windowStartedAt: '2026-08-19T01:02:00.000Z',
      windowCompletedAt: '2026-08-19T01:01:00.000Z',
      capturedAt: '2026-08-19T01:00:00.000Z',
      alerts: [
        { alertId: 'load-alert', status: 'EXPECTED', observedAt: '2026-08-19T01:00:00.000Z' },
        { alertId: 'load-alert', status: 'OPEN', observedAt: 'not-a-time' },
      ],
      saturation: {
        cpuMaxPercent: 86,
        memoryMaxPercent: 90,
        databaseConnectionMaxPercent: 81,
      },
      backlog: { outboxDeadDelta: 0, unacknowledgedMessageCount: 0 },
      stopReleaseConditions: [],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'monitoring-snapshot.json saturation.cpuMaxPercent must be within 0..85',
        'monitoring-snapshot.json saturation.memoryMaxPercent must be within 0..85',
        'monitoring-snapshot.json saturation.databaseConnectionMaxPercent must be within 0..80',
        'monitoring-snapshot.json alert IDs must be unique',
        'monitoring-snapshot.json alerts[1].status must be EXPECTED or RESOLVED',
        'monitoring-snapshot.json alerts[1].observedAt must be a non-future ISO date-time',
        'monitoring-snapshot.json monitoring window and capture timestamps are out of order',
      ]),
    );
  });

  it('rejects non-canonical backup artifact names', () => {
    expect(
      validateControlledJsonEvidence('backup.manifest.json', {
        schemaVersion: 1,
        backupFile: '../candidate.dump.age',
        backupStartedAt: '2026-08-19T01:00:00.000Z',
        backupCompletedAt: '2026-08-19T01:01:00.000Z',
        encryptedSizeBytes: 1,
        encryptedSha256: 'a'.repeat(64),
        financialSnapshotSha256: 'b'.repeat(64),
        financialSnapshot: {
          schemaVersion: 1,
          tenantCount: 1,
          tenants: { '123e4567-e89b-42d3-a456-426614174000': { orders_count: 1 } },
        },
        writeFrozen: true,
      }),
    ).toContain('backup.manifest.json backupFile has invalid format');
  });

  it('requires complete typed tenant coverage in financial snapshots', () => {
    const failures = validateControlledJsonEvidence('backup.manifest.json', {
      schemaVersion: 1,
      backupFile: 'lequ-20260819T010000Z.dump.age',
      backupStartedAt: '2026-08-19T01:00:00.000Z',
      backupCompletedAt: '2026-08-19T01:01:00.000Z',
      encryptedSizeBytes: 1,
      encryptedSha256: 'a'.repeat(64),
      financialSnapshotSha256: 'b'.repeat(64),
      financialSnapshot: {
        schemaVersion: 1,
        tenantCount: 2,
        tenants: {
          'not-a-tenant': { invented_total: 1.5 },
        },
      },
      writeFrozen: true,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'backup.manifest.json financialSnapshot tenants must equal tenantCount',
        'backup.manifest.json financialSnapshot tenant ID has invalid format',
        'backup.manifest.json financialSnapshot contains undeclared metric invented_total',
        'backup.manifest.json financialSnapshot metric invented_total must be an integer',
      ]),
    );
  });

  it('requires one-time signed payment convergence and query-before-retry evidence', () => {
    expect(
      validateControlledJsonEvidence('provider-callback-redacted.json', {
        signatureVerified: true,
        replayRejected: false,
        merchantAccountRef: 'not-a-hash',
        amountFen: 100,
        paymentState: 'PENDING',
        appliedBusinessTransitions: 2,
        providerEventIdHash: 'a'.repeat(64),
      }),
    ).toEqual(
      expect.arrayContaining([
        'provider-callback-redacted.json replayRejected must equal true',
        'provider-callback-redacted.json merchantAccountRef has invalid format',
        'provider-callback-redacted.json paymentState must equal "SUCCEEDED"',
        'provider-callback-redacted.json appliedBusinessTransitions must equal 1',
      ]),
    );
    expect(
      validateControlledJsonEvidence('refund-unknown-recovery.json', {
        initialState: 'UNKNOWN',
        merchantAccountRef: 'a'.repeat(64),
        providerQuery: { performed: false, sameIdempotencyKey: false },
        finalState: 'UNKNOWN',
        queryBeforeRetry: false,
        convergenceCount: 2,
      }),
    ).toEqual(
      expect.arrayContaining([
        'refund-unknown-recovery.json queryBeforeRetry must equal true',
        'refund-unknown-recovery.json convergenceCount must equal 1',
        'refund-unknown-recovery.json providerQuery.performed must equal true',
        expect.stringContaining('terminal provider-confirmed refund state'),
      ]),
    );
  });

  it('requires official WeChat build, bounded publication and real-device evidence', () => {
    expect(
      validateControlledJsonEvidence('review-publish.json', {
        result: 'PASS',
        consumerVersion: 'consumer-1',
        merchantVersion: 'merchant-1',
        reviewVersion: 'review-1',
        publishedVersion: 'published-2',
        reviewResult: 'APPROVED',
        publishedAt: '2026-08-19T01:00:00.000Z',
        publicationReceiptHash: 'a'.repeat(64),
        pilotScope: { percentage: 0, scopeRefs: [] },
      }),
    ).toEqual(
      expect.arrayContaining([
        'review-publish.json publishedVersion must equal the approved reviewVersion',
        'review-publish.json pilotScope.percentage must be within 1..100',
        'review-publish.json pilotScope.scopeRefs must contain evidence',
      ]),
    );
    expect(
      validateControlledJsonEvidence('device-matrix.json', {
        result: 'PASS',
        verifiedAt: '2026-08-19T01:00:00.000Z',
        devices: ['tested'],
        scenarios: ['tested'],
        failures: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'device-matrix.json devices[0] must be an object',
        'device-matrix.json devices must include iOS',
        'device-matrix.json scenarios must include merchant-template',
      ]),
    );
  });

  it('requires identity, privacy and on-call domain facts rather than labels', () => {
    expect(
      validateControlledJsonEvidence('identity-session-redacted.json', {
        result: 'PASS',
        revocation: { revokedSessionRejected: false, latencySeconds: 61 },
        mfa: { highRiskRequired: false, downgradeRejected: false },
        sessions: ['verified'],
        failures: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('revokedSessionRejected'),
        expect.stringContaining('latencySeconds'),
        'identity-session-redacted.json sessions[0] must be an object',
      ]),
    );
    expect(
      validateControlledJsonEvidence('privacy-export-delete.json', {
        result: 'PASS',
        export: { encrypted: false, verifiedSessionDelivery: false, durationSeconds: 901 },
        deletion: { authorized: false, auditRecorded: false },
        targets: ['deleted'],
        unresolvedTargets: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'privacy-export-delete.json export.encrypted must equal true',
        expect.stringContaining('durationSeconds'),
        'privacy-export-delete.json targets[0] must be an object',
        'privacy-export-delete.json targets must include database',
      ]),
    );
    expect(
      validateControlledJsonEvidence('alert-delivery.json', {
        result: 'PASS',
        alerts: ['P0'],
        recipients: ['oncall'],
        deliveryResults: ['sent'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'alert-delivery.json alerts[0] must be an object',
        'alert-delivery.json alerts must include P1',
        expect.stringContaining('recipientRefHash'),
        'alert-delivery.json deliveryResults[0] must be an object',
      ]),
    );
  });

  it('requires structured database, worker, intake, inventory and plugin evidence', () => {
    expect(
      validateControlledJsonEvidence('rls-denials.json', {
        result: 'PASS',
        attempts: ['denied'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'rls-denials.json attempts[0] must be an object',
        'rls-denials.json attempts must include cross-tenant-read',
        'rls-denials.json attempts must include cross-tenant-write',
      ]),
    );
    expect(
      validateControlledJsonEvidence('tenant-context.json', {
        result: 'PASS',
        mismatchRejected: true,
        transactions: ['reset'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'tenant-context.json transactions[0] must be an object',
        'tenant-context.json transactions must alternate at least two tenants',
      ]),
    );
    expect(
      validateControlledJsonEvidence('concurrency-input.json', {
        stock: 3,
        requestedQuantity: 3,
        contenders: ['one'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'concurrency-input.json contenders[0] must be an object',
        'concurrency-input.json contender quantities must equal requestedQuantity',
        'concurrency-input.json requestedQuantity must exceed stock for the contention drill',
      ]),
    );
    expect(
      validateControlledJsonEvidence('runtime-policy.json', {
        result: 'PASS',
        allowedHosts: ['http://unsafe.example/path'],
        defaultDeny: true,
        networkPolicyApplied: true,
      }),
    ).toContain('runtime-policy.json allowedHosts[0] must be an origin-only HTTPS URL');
    expect(
      validateControlledJsonEvidence('geo-target-redacted.json', {
        result: 'PASS',
        targetRefHash: 'a'.repeat(64),
        storedClaims: [
          {
            field: 'ranking',
            valueHash: 'b'.repeat(64),
            verifiedAt: '2026-08-19T01:00:00.000Z',
          },
        ],
        forbiddenClaims: [],
      }),
    ).toContain(
      'geo-target-redacted.json storedClaims[0].field contains a forbidden performance claim',
    );
    expect(
      validateControlledJsonEvidence('deployment-topology.json', {
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'deployment-1',
        capturedAt: '2026-08-19T01:00:00.000Z',
        environment: 'production',
        services: {
          api: { image: `ghcr.io/example/api@sha256:${'a'.repeat(64)}` },
          worker: { image: `ghcr.io/example/worker@sha256:${'b'.repeat(64)}` },
          web: { image: `ghcr.io/example/web@sha256:${'c'.repeat(64)}` },
        },
        dataStores: ['checked'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'deployment-topology.json environment must equal "controlled-preproduction"',
        'deployment-topology.json dataStores[0] must be an object',
        'deployment-topology.json dataStores must include postgresql',
      ]),
    );
  });
});
