import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  controlledJsonEvidenceContracts,
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
        releaseCommit: 'a'.repeat(40),
        images: { api: 'latest', worker: 'latest', web: 'latest' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'candidate-image-digests.json images.api has invalid format',
        'candidate-image-digests.json images.worker has invalid format',
        'candidate-image-digests.json images.web has invalid format',
      ]),
    );
    expect(
      validateControlledJsonEvidence('rollback.json', {
        result: 'PASS',
        fromVersion: '1.0.0',
        toVersion: '1.0.1',
        verifiedAt: '2099-01-01T00:00:00.000Z',
      }),
    ).toContain('rollback.json verifiedAt must not be in the future');
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
        persistence: { expectedMessageIds: 0, persistedMessageIds: 0, missingMessageIds: [] },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('scenarios[0] must be an object'),
        expect.stringContaining('scenarios must include core-read'),
        expect.stringContaining('database.before.tableCount'),
      ]),
    );
    expect(
      validateControlledJsonEvidence('restore-report.json', {
        result: 'PASS',
        schemaVersion: 1,
        backupFile: 'candidate.dump.age',
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
        'restore-report.json databaseFixturesPassed must contain all 22 fixtures',
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
