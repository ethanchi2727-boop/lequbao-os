import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  controlledJsonEvidenceContracts,
  requiredDatabaseFixtureFiles,
  requiredDatabaseMigrationVersions,
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
      validateControlledJsonEvidence('legacy-production-inventory.json', {
        version: 1,
        releaseCommit: 'a'.repeat(40),
        generatedAt: '2026-08-19T01:00:00.000Z',
        verdict: 'INDEPENDENT_REVIEW_REQUIRED',
        limitations: ['review required'],
        sources: [
          {
            id: 'duplicate',
            kind: 'sqlite',
            declaredEnvironment: 'production',
            locationSha256: 'b'.repeat(64),
            fileSha256: 'c'.repeat(64),
            bytes: 1,
            tableCount: 0,
            nonEmptyTableCount: 1,
            rowCount: 1,
            outcome: 'EMPTY_REVIEW_REQUIRED',
          },
          {
            id: 'duplicate',
            kind: 'sqlite',
            declaredEnvironment: 'production',
            locationSha256: 'b'.repeat(64),
            fileSha256: 'd'.repeat(64),
            bytes: 1,
            tableCount: 1,
            nonEmptyTableCount: 0,
            rowCount: 0,
            outcome: 'DATA_PRESENT_REVIEW_REQUIRED',
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'legacy-production-inventory.json source IDs must be unique',
        'legacy-production-inventory.json source locations must be unique',
        'legacy-production-inventory.json sources[0].nonEmptyTableCount must not exceed tableCount',
        'legacy-production-inventory.json sources[0].EMPTY_REVIEW_REQUIRED conflicts with non-empty counts',
        'legacy-production-inventory.json sources[1].DATA_PRESENT_REVIEW_REQUIRED conflicts with zero counts',
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
        independentReview: { decision: 'PENDING', receiptId: 'review-receipt' },
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
            email: 'forbidden@example.test',
          },
        ],
        independentReview: {
          subjectId: 'reviewer@example.test',
          decision: 'APPROVED',
          receiptId: 'review-receipt',
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
    expect(
      validateControlledJsonEvidence('financial-policy-approvals.json', {
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'deployment-1',
        decisionVersion: 'finance decision with spaces',
        effectiveAt: '2026-08-19T01:00:00.000Z',
        decisions: {
          paymentResponsibilityResolved: true,
          merchantAccountMappingResolved: true,
          legacyBalanceResolved: true,
          distributionConflictC001Resolved: true,
          computeAllocationResolved: true,
          historicalSnapshotPreserved: true,
          undeclaredDecision: true,
        },
        approvals: [
          {
            subjectId: 'org:business-1',
            role: 'business owner',
            decision: 'APPROVED',
            receiptId: 'business-1',
            approvedAt: '2026-08-19T00:58:00.000Z',
            email: 'forbidden@example.test',
          },
          {
            subjectId: 'org:business-2',
            role: 'business owner',
            decision: 'APPROVED',
            receiptId: 'business-2',
            approvedAt: '2026-08-19T00:59:00.000Z',
          },
          {
            subjectId: 'org:finance',
            role: 'finance owner',
            decision: 'APPROVED',
            receiptId: 'finance',
            approvedAt: '2026-08-19T00:59:00.000Z',
          },
        ],
        independentReview: {
          subjectId: 'org:reviewer',
          decision: 'APPROVED',
          receiptId: 'review receipt with spaces',
          reviewedAt: '2026-08-19T01:01:00.000Z',
        },
        unresolvedItems: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'financial-policy-approvals.json decisions must contain the exact frozen decision fields',
        'financial-policy-approvals.json approval roles must be unique',
        'financial-policy-approvals.json approvals[0] fields are invalid',
        'financial-policy-approvals.json decisionVersion must be opaque',
        'financial-policy-approvals.json independentReview.receiptId must be an opaque reference',
        'financial-policy-approvals.json effectiveAt must not precede independent review',
      ]),
    );
    expect(
      validateControlledJsonEvidence('legal-document-release.json', {
        result: 'PASS',
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'deployment-1',
        documents: [
          {
            documentId: 'privacy-policy',
            version: 'v1',
            ownerRef: 'owner@example.test',
            approvalReceipt: 'unrelated-receipt',
            sha256: 'b'.repeat(64),
            publishedUrl: (() => {
              const url = new URL('https://localhost/privacy?unsafe=true');
              url.username = 'test-user';
              url.password = 'test-value';
              return url.href;
            })(),
            effectiveAt: '2026-08-19T00:59:00.000Z',
            legalEntityName: 'forbidden',
          },
          {
            documentId: 'terms-of-service',
            version: 'v1',
            ownerRef: 'org:legal-owner',
            approvalReceipt: 'legal-receipt',
            sha256: 'c'.repeat(64),
            publishedUrl: 'https://legal.example.test/terms',
            effectiveAt: '2026-08-19T01:00:00.000Z',
          },
        ],
        surfaceMatrix: [
          {
            surface: 'lequbao-web',
            documentIds: ['privacy-policy', 'privacy-policy'],
            publicationReceiptHash: 'd'.repeat(64),
            verifiedAt: '2026-08-19T00:58:00.000Z',
            publicationVerified: true,
            accountPrivacyInstructionsVerified: true,
            failures: [],
          },
          {
            surface: 'lequbao-web',
            documentIds: ['privacy-policy'],
            publicationReceiptHash: 'd'.repeat(64),
            verifiedAt: '2026-08-19T01:00:00.000Z',
            publicationVerified: true,
            accountPrivacyInstructionsVerified: true,
            failures: [],
          },
          {
            surface: 'unknown-client',
            documentIds: ['privacy-policy'],
            publicationReceiptHash: 'e'.repeat(64),
            verifiedAt: '2026-08-19T01:00:00.000Z',
            publicationVerified: true,
            accountPrivacyInstructionsVerified: true,
            failures: [],
          },
        ],
        approvals: [
          {
            subjectId: 'org:product-owner',
            role: 'product owner',
            decision: 'APPROVED',
            receiptId: 'product-receipt',
            approvedAt: '2026-08-19T01:00:00.000Z',
          },
          {
            subjectId: 'org:legal-reviewer',
            role: 'legal compliance reviewer',
            decision: 'APPROVED',
            receiptId: 'legal-receipt',
            approvedAt: '2026-08-19T01:00:00.000Z',
          },
        ],
        unresolvedItems: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'legal-document-release.json documents[0].ownerRef must be an approved opaque subject',
        'legal-document-release.json documents[0] fields are invalid',
        'legal-document-release.json documents[0].approvalReceipt must match the legal compliance approval',
        'legal-document-release.json documents[0].publishedUrl must be a public credential-free HTTPS URL',
        'legal-document-release.json documents[0].effectiveAt must not precede approval',
        'legal-document-release.json surfaceMatrix[0].documentIds must be unique',
        'legal-document-release.json surfaceMatrix[0].verifiedAt must not precede document effectiveness',
        'legal-document-release.json surfaces must be unique',
        'legal-document-release.json surface publication receipts must be unique',
        'legal-document-release.json surfaceMatrix[2].surface is not approved',
        'legal-document-release.json surfaceMatrix must include lequ-life-miniapp',
        'legal-document-release.json document terms-of-service is absent from every product surface',
      ]),
    );
  });

  it('requires opaque upload identity and concrete retained-object metadata', () => {
    expect(
      validateControlledJsonEvidence('upload-response.json', {
        status: 200.5,
        requestId: 'request with spaces',
        objectRefHash: 'a'.repeat(64),
        malwareScan: 'CLEAN',
        rawObjectKeyExposed: false,
        rawObjectKey: 'forbidden/object/key',
        uploadedAt: '2026-08-19T01:00:00.000Z',
      }),
    ).toEqual(
      expect.arrayContaining([
        'upload-response.json requestId must be an opaque reference',
        'upload-response.json status must be an integer',
        'upload-response.json fields are invalid',
      ]),
    );
    expect(
      validateControlledJsonEvidence('object-metadata.json', {
        objectRefHash: 'a'.repeat(64),
        encrypted: true,
        originalRetained: true,
        contentSha256: 'b'.repeat(64),
        storedAt: '2026-08-19T01:02:00.000Z',
        rawObjectKey: 'forbidden/object/key',
        retention: {
          policyRefHash: 'c'.repeat(64),
          storageClass: 'compliance-retained',
          immutable: true,
          appliedAt: '2026-08-19T01:01:00.000Z',
          retainUntil: '2027-08-19T01:00:00.000Z',
          undeclared: true,
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'object-metadata.json retention fields are invalid',
        'object-metadata.json fields are invalid',
        'object-metadata.json storage and retention timestamps are out of order',
      ]),
    );
  });

  it('keeps OCR evidence redacted, exact and reproducible', () => {
    const candidate = {
      field: 'merchant-name',
      sourceRegionHash: 'a'.repeat(64),
      confidence: 0.9,
      rawText: 'must-not-be-retained',
    };
    expect(
      validateControlledJsonEvidence('ocr-provenance.json', {
        objectRefHash: 'b'.repeat(64),
        candidates: [candidate, { ...candidate }],
        provenance: {
          gatewayRef: 'gateway with spaces',
          modelVersion: 'model with spaces',
          processedAt: '2026-08-19T01:00:00.000Z',
          rawResponse: true,
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'ocr-provenance.json candidates[0] fields are invalid',
        'ocr-provenance.json candidate field/source pairs must be unique',
        'ocr-provenance.json provenance fields are invalid',
        'ocr-provenance.json provenance.gatewayRef must be opaque',
        'ocr-provenance.json provenance.modelVersion must be opaque',
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
        targetDatabaseRefHash: 'c'.repeat(64),
        fixtureDatabaseRefHash: 'd'.repeat(64),
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
      targetDatabaseRefHash: 'c'.repeat(64),
      fixtureDatabaseRefHash: 'd'.repeat(64),
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
      database: {
        before: {
          capturedAt: '2026-08-19T01:02:00.000Z',
          databaseRefHash: 'd'.repeat(64),
          tableCount: 164,
          migrationVersions: [...requiredDatabaseMigrationVersions].reverse(),
        },
        after: {
          capturedAt: '2026-08-19T00:59:00.000Z',
          databaseRefHash: 'e'.repeat(64),
        },
      },
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
        'performance-report.json database.before.migrationVersions must match the candidate schema',
        'performance-report.json before and after snapshots must use the same database',
        'performance-report.json run and database snapshot timestamps are out of order',
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
        {
          alertId: 'load-alert',
          status: 'EXPECTED',
          observedAt: '2026-08-19T01:00:00.000Z',
          rawQuery: 'forbidden',
        },
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
        'monitoring-snapshot.json alerts[0] fields are invalid',
        'monitoring-snapshot.json alerts[1].status must be EXPECTED or RESOLVED',
        'monitoring-snapshot.json alerts[1].observedAt must be a non-future ISO date-time',
        'monitoring-snapshot.json monitoring window and capture timestamps are out of order',
      ]),
    );
  });

  it('requires fully ready services and unique supported data stores', () => {
    const image = (target) => `ghcr.io/example/lequbao-v6-${target}@sha256:${'a'.repeat(64)}`;
    const service = (target, replicas, readyReplicas, hash) => ({
      image: image(target),
      deploymentRefHash: hash.repeat(64),
      replicas,
      readyReplicas,
      endpoint: 'forbidden',
    });
    const failures = validateControlledJsonEvidence('deployment-topology.json', {
      releaseCommit: 'a'.repeat(40),
      deploymentId: 'controlled-deployment-1',
      capturedAt: '2026-08-19T01:00:00.000Z',
      environment: 'controlled-preproduction',
      services: {
        api: service('api', 2, 1, '1'),
        worker: service('worker', 2.5, 2, '2'),
        web: service('web', 1, 1, '3'),
      },
      dataStores: [
        { kind: 'postgresql', endpointRefHash: '4'.repeat(64), tlsVerified: true },
        { kind: 'postgresql', endpointRefHash: '4'.repeat(64), tlsVerified: true },
        {
          kind: 'object-store',
          endpointRefHash: '5'.repeat(64),
          tlsVerified: true,
          rawEndpoint: 'forbidden',
        },
        { kind: 'queue', endpointRefHash: '6'.repeat(64), tlsVerified: true },
      ],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'deployment-topology.json services.api must have every replica ready',
        'deployment-topology.json services.worker.replicas must be a positive integer',
        'deployment-topology.json services.api fields are invalid',
        'deployment-topology.json dataStores[2] fields are invalid',
        'deployment-topology.json data store kinds must be unique',
        'deployment-topology.json data store endpoint references must be unique',
        'deployment-topology.json dataStores[3].kind is not a supported data store',
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
          tenants: { ['c'.repeat(64)]: { orders_count: 1 } },
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
        'backup.manifest.json financialSnapshot tenant reference hash has invalid format',
        'backup.manifest.json financialSnapshot tenant metrics must equal the exact metric set',
        'backup.manifest.json financialSnapshot contains undeclared metric invented_total',
        'backup.manifest.json financialSnapshot metric invented_total must be an integer',
      ]),
    );
  });

  it('binds a zero-match deletion sample to every external target receipt', () => {
    const targets = ['object-store', 'search', 'vector', 'cache'].map((target) => ({
      target,
      receiptRef: `${target}-receipt`,
      deleted: true,
      verifiedAt: '2026-08-19T01:00:00.000Z',
    }));
    const failures = validateControlledJsonEvidence('external-deletion-samples.json', {
      result: 'PASS',
      targets,
      samples: [
        {
          target: 'object-store',
          sampleRefHash: 'a'.repeat(64),
          receiptRef: 'wrong-receipt',
          remainingMatches: 1,
          verifiedAt: '2026-08-19T00:59:00.000Z',
        },
      ],
      unresolvedTargets: [],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'external-deletion-samples.json samples[0].receiptRef does not match its target deletion receipt',
        'external-deletion-samples.json samples[0].remainingMatches must equal 0',
        'external-deletion-samples.json samples[0].verifiedAt must not precede target deletion verification',
        'external-deletion-samples.json samples must include search',
        'external-deletion-samples.json samples must include vector',
        'external-deletion-samples.json samples must include cache',
      ]),
    );
  });

  it('requires distinct fault domains and an ordered WAL recovery timeline', () => {
    const failures = validateControlledJsonEvidence('physical-wal-evidence.json', {
      result: 'PASS',
      backupSetRefHash: 'a'.repeat(64),
      sourceFaultDomainRefHash: 'b'.repeat(64),
      recoveryFaultDomainRefHash: 'b'.repeat(64),
      recoveryPoint: '2026-08-19T01:00:00.000Z',
      replayedThrough: '2026-08-19T00:59:00.000Z',
      crossFaultDomain: true,
      walReplayVerified: true,
      timeline: [
        {
          event: 'RECOVERY_VALIDATED',
          at: '2026-08-19T01:02:00.000Z',
          evidenceRefHash: 'c'.repeat(64),
          recoveryHost: 'forbidden',
        },
      ],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'physical-wal-evidence.json source and recovery fault domains must differ',
        'physical-wal-evidence.json replayedThrough must reach or pass recoveryPoint',
        'physical-wal-evidence.json timeline must contain the exact ordered recovery events',
        'physical-wal-evidence.json timeline[0] fields are invalid',
      ]),
    );
  });

  it('requires one-time signed payment convergence and query-before-retry evidence', () => {
    expect(
      validateControlledJsonEvidence('provider-callback-redacted.json', {
        signatureVerified: true,
        replayRejected: false,
        deliveryAttempts: 1.5,
        merchantAccountRef: 'not-a-hash',
        amountFen: 100,
        paymentState: 'PENDING',
        appliedBusinessTransitions: 2,
        providerEventIdHash: 'a'.repeat(64),
        rawPayload: 'forbidden',
      }),
    ).toEqual(
      expect.arrayContaining([
        'provider-callback-redacted.json replayRejected must equal true',
        'provider-callback-redacted.json deliveryAttempts must be an integer',
        'provider-callback-redacted.json fields are invalid',
        'provider-callback-redacted.json merchantAccountRef has invalid format',
        'provider-callback-redacted.json paymentState must equal "SUCCEEDED"',
        'provider-callback-redacted.json appliedBusinessTransitions must equal 1',
      ]),
    );
    expect(
      validateControlledJsonEvidence('refund-unknown-recovery.json', {
        initialState: 'UNKNOWN',
        refundRefHash: 'a'.repeat(64),
        merchantAccountRef: 'a'.repeat(64),
        idempotencyKeyHash: 'b'.repeat(64),
        providerQuery: {
          performed: false,
          sameIdempotencyKey: false,
          idempotencyKeyHash: 'c'.repeat(64),
          queriedAt: '2026-08-19T01:01:00.000Z',
          rawResponse: 'forbidden',
        },
        finalState: 'UNKNOWN',
        queryBeforeRetry: false,
        convergenceCount: 2,
        observedUnknownAt: '2026-08-19T01:02:00.000Z',
        completedAt: '2026-08-19T01:00:00.000Z',
      }),
    ).toEqual(
      expect.arrayContaining([
        'refund-unknown-recovery.json queryBeforeRetry must equal true',
        'refund-unknown-recovery.json convergenceCount must equal 1',
        'refund-unknown-recovery.json providerQuery.performed must equal true',
        'refund-unknown-recovery.json provider query idempotency hash does not match recovery',
        'refund-unknown-recovery.json providerQuery fields are invalid',
        'refund-unknown-recovery.json UNKNOWN, provider query and completion timestamps are out of order',
        expect.stringContaining('terminal provider-confirmed refund state'),
      ]),
    );
  });

  it('requires official WeChat build, bounded publication and real-device evidence', () => {
    expect(
      validateControlledJsonEvidence('callback-redacted.json', {
        signatureVerified: true,
        replayRejected: true,
        deliveryAttempts: 2,
        serverEventRef: 'a'.repeat(64),
        publishedVersion: 'pilot-1',
        appliedBusinessTransitions: 1,
        verifiedAt: '2026-08-19T01:00:00.000Z',
        rawCallback: 'forbidden',
      }),
    ).toContain('callback-redacted.json fields are invalid');
    expect(
      validateControlledJsonEvidence('consumer-build.json', {
        result: 'PASS',
        releaseCommit: 'a'.repeat(40),
        version: 'consumer version with spaces',
        officialTool: 'WeChat DevTools CLI',
        officialToolVersion: 'latest',
        buildSha256: 'b'.repeat(64),
        builtAt: '2026-08-19T01:00:00.000Z',
        appId: 'forbidden',
      }),
    ).toEqual(
      expect.arrayContaining([
        'consumer-build.json version must be opaque',
        'consumer-build.json fields are invalid',
        'consumer-build.json officialToolVersion must be a dotted numeric version',
      ]),
    );
    expect(
      validateControlledJsonEvidence('review-publish.json', {
        result: 'PASS',
        consumerVersion: 'consumer-1',
        merchantVersion: 'merchant-1',
        reviewVersion: 'review-1',
        publishedVersion: 'published-2',
        reviewResult: 'APPROVED',
        reviewedAt: '2026-08-19T01:01:00.000Z',
        reviewReceiptHash: 'b'.repeat(64),
        publishedAt: '2026-08-19T01:00:00.000Z',
        publicationReceiptHash: 'a'.repeat(64),
        pilotScope: {
          percentage: 0.5,
          scopeRefs: ['duplicate', 'duplicate'],
          rawStoreIds: ['forbidden'],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'review-publish.json publishedVersion must equal the approved reviewVersion',
        'review-publish.json pilotScope.percentage must be within 1..100',
        'review-publish.json pilotScope.scopeRefs must be unique',
        'review-publish.json pilotScope fields are invalid',
        'review-publish.json publishedAt must not precede reviewedAt',
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
    expect(
      validateControlledJsonEvidence('device-matrix.json', {
        result: 'PASS',
        verifiedAt: '2026-08-19T01:00:00.000Z',
        devices: [
          {
            platform: 'iOS',
            deviceRefHash: 'a'.repeat(64),
            officialClientVersion: 'latest',
            result: 'PASS',
            serialNumber: 'forbidden',
          },
          {
            platform: 'Android',
            deviceRefHash: 'b'.repeat(64),
            officialClientVersion: '8.0.52',
            result: 'PASS',
          },
        ],
        scenarios: [
          {
            package: 'consumer',
            version: 'consumer-1',
            result: 'PASS',
            deviceRefs: ['a'.repeat(64), 'a'.repeat(64)],
          },
          {
            package: 'merchant-template',
            version: '',
            result: 'PASS',
            deviceRefs: ['b'.repeat(64), 'c'.repeat(64)],
          },
        ],
        failures: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'device-matrix.json scenarios[0].deviceRefs must be unique',
        'device-matrix.json devices[0].officialClientVersion must be a dotted numeric version',
        'device-matrix.json devices[0] fields are invalid',
        'device-matrix.json scenarios[0].deviceRefs must include Android',
        'device-matrix.json scenarios[1].version must not be empty',
        'device-matrix.json scenarios[1].deviceRefs contains an unknown device reference',
        'device-matrix.json scenarios[1].deviceRefs must include iOS',
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
        'alert-delivery.json alerts must include AUTH_ANOMALY',
        'alert-delivery.json recipients[0] must be an object',
        'alert-delivery.json recipients must include primary-on-call',
        'alert-delivery.json deliveryResults[0] must be an object',
      ]),
    );
  });

  it('reconciles privacy export and target deletion timelines', () => {
    const failures = validateControlledJsonEvidence('privacy-export-delete.json', {
      result: 'PASS',
      export: {
        encrypted: true,
        verifiedSessionDelivery: true,
        requestedAt: '2026-08-19T01:00:00.000Z',
        completedAt: '2026-08-19T01:01:00.000Z',
        durationSeconds: 1,
        deliveryRefHash: 'a'.repeat(64),
        sessionRefHash: 'b'.repeat(64),
        rawArchive: 'forbidden',
      },
      deletion: {
        authorized: true,
        auditRecorded: true,
        requestedAt: '2026-08-19T01:00:00.000Z',
        authorizedAt: '2026-08-19T01:01:00.000Z',
        completedAt: '2026-08-19T01:02:00.000Z',
        authorizationRefHash: 'c'.repeat(64),
        auditRefHash: 'd'.repeat(64),
        userEmail: 'forbidden@example.test',
      },
      targets: ['database', 'object-store', 'search', 'vector', 'cache'].map((target, index) => ({
        target,
        receiptHash: `${index + 1}`.repeat(64),
        deleted: true,
        deletedAt: '2026-08-19T01:01:30.000Z',
        verifiedAt: '2026-08-19T01:03:00.000Z',
      })),
      unresolvedTargets: [],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'privacy-export-delete.json export fields are invalid',
        'privacy-export-delete.json deletion fields are invalid',
        'privacy-export-delete.json export.durationSeconds does not reconcile with timestamps',
        'privacy-export-delete.json targets[0] deletion and verification timestamps are out of order',
      ]),
    );
  });

  it('rejects unredacted on-call routing fields', () => {
    const alert = {
      alertId: 'alert-1',
      code: 'AUTH_ANOMALY',
      severity: 'P0',
      triggeredAt: '2026-08-19T01:00:00.000Z',
      rawMessage: 'forbidden',
    };
    const failures = validateControlledJsonEvidence('alert-delivery.json', {
      result: 'PASS',
      alerts: [alert],
      recipients: [
        {
          recipientRefHash: 'a'.repeat(64),
          role: 'primary-on-call',
          channel: 'pager',
          phoneNumber: 'forbidden',
        },
      ],
      deliveryResults: [
        {
          alertId: 'alert-1',
          delivered: true,
          deliveredAt: '2026-08-19T01:01:00.000Z',
          channelRefHash: 'b'.repeat(64),
          recipientRefHash: 'a'.repeat(64),
          attemptCount: 1,
          rawResponse: 'forbidden',
        },
      ],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'alert-delivery.json alerts[0] fields are invalid',
        'alert-delivery.json recipients[0] fields are invalid',
        'alert-delivery.json deliveryResults[0] fields are invalid',
      ]),
    );
  });

  it('requires read, rotation and denied-read audits for each sampled secret', () => {
    const secretRefHash = 'a'.repeat(64);
    const failures = validateControlledJsonEvidence('secret-access-audit.json', {
      result: 'PASS',
      secretManager: 'https://manager.example.test',
      accessEvents: [
        {
          secretRefHash,
          secretVersionRefHash: 'b'.repeat(64),
          subjectRef: 'person@example.test',
          action: 'READ',
          allowed: true,
          auditEventRefHash: 'b'.repeat(64),
          occurredAt: '2026-08-19T01:00:00.000Z',
          secretName: 'forbidden-secret-name',
        },
      ],
      leastPrivilegeVerified: true,
      rotationVerified: true,
      plaintextFindings: [],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'secret-access-audit.json secretManager must be an opaque provider reference',
        'secret-access-audit.json accessEvents[0].subjectRef must be an approved opaque subject',
        'secret-access-audit.json accessEvents[0] fields are invalid',
        `secret-access-audit.json secret ${secretRefHash} must include ROTATE`,
        `secret-access-audit.json secret ${secretRefHash} must include DENIED_READ`,
      ]),
    );
    const rotationFailures = validateControlledJsonEvidence('secret-access-audit.json', {
      result: 'PASS',
      secretManager: 'vault:controlled',
      accessEvents: [
        ['READ', true, 'a', '2026-08-19T01:02:00.000Z', 'workforce:operator'],
        ['ROTATE', true, 'a', '2026-08-19T01:01:00.000Z', 'workforce:operator'],
        ['DENIED_READ', false, 'b', '2026-08-19T01:00:00.000Z', 'workforce:denied'],
      ].map(([action, allowed, version, occurredAt, subjectRef], index) => ({
        secretRefHash,
        secretVersionRefHash: String(version).repeat(64),
        subjectRef,
        action,
        allowed,
        auditEventRefHash: `${index + 1}`.repeat(64),
        occurredAt,
      })),
      leastPrivilegeVerified: true,
      rotationVerified: true,
      plaintextFindings: [],
    });
    expect(rotationFailures).toEqual(
      expect.arrayContaining([
        'secret-access-audit.json denied read must target the pre-rotation secret version',
        'secret-access-audit.json rotation must create a different secret version',
        'secret-access-audit.json read, rotation and denied-read timestamps are out of order',
      ]),
    );
  });

  it('recomputes object retention and authorized deletion timelines', () => {
    const policyRefHash = 'a'.repeat(64);
    const failures = validateControlledJsonEvidence('object-retention.json', {
      result: 'PASS',
      policy: {
        encryptionRequired: true,
        deletionEnforced: true,
        policyRefHash,
        effectiveAt: '2026-08-19T01:00:00.000Z',
        retentionDays: 30,
        encryptionMode: 'provider-managed',
      },
      objectsSampled: [
        {
          objectRefHash: 'b'.repeat(64),
          policyRefHash,
          encryptionKeyRefHash: 'c'.repeat(64),
          deletionAuthorizationRefHash: 'd'.repeat(64),
          encrypted: true,
          retentionApplied: true,
          deletionVerified: true,
          createdAt: '2026-08-19T00:00:00.000Z',
          retentionUntil: '2026-08-20T00:00:00.000Z',
          deletionRequestedAt: '2026-08-19T01:02:00.000Z',
          deletedAt: '2026-08-19T01:01:00.000Z',
          verifiedAt: '2026-08-19T01:03:00.000Z',
          rawObjectKey: 'forbidden/object/key',
        },
      ],
      violations: [],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'object-retention.json objectsSampled[0] policy, creation and deletion timestamps are out of order',
        'object-retention.json objectsSampled[0] fields are invalid',
        'object-retention.json objectsSampled[0].retentionUntil does not match policy.retentionDays',
      ]),
    );
  });

  it('recomputes session lifetime and revocation rejection latency', () => {
    const failures = validateControlledJsonEvidence('identity-session-redacted.json', {
      result: 'PASS',
      revocation: {
        revokedSessionRejected: true,
        sessionRefHash: 'a'.repeat(64),
        revocationReceiptHash: 'b'.repeat(64),
        revokedAt: '2026-08-19T01:00:00.000Z',
        rejectedAt: '2026-08-19T01:01:00.000Z',
        latencySeconds: 1,
      },
      mfa: {
        highRiskRequired: true,
        downgradeRejected: true,
        challengeRefHash: 'c'.repeat(64),
        challengedAt: '2026-08-19T01:01:00.000Z',
        downgradeRejectedAt: '2026-08-19T01:00:00.000Z',
      },
      sessions: [
        {
          sessionRefHash: 'd'.repeat(64),
          tenantRefHash: 'e'.repeat(64),
          tenantScopeVerified: true,
          shortLived: true,
          issuedAt: '2026-08-19T00:00:00.000Z',
          expiresAt: '2026-08-19T02:00:00.000Z',
          userEmail: 'forbidden@example.test',
        },
      ],
      rawToken: 'forbidden',
      failures: [],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'identity-session-redacted.json revocation.latencySeconds does not reconcile with timestamps',
        'identity-session-redacted.json fields are invalid',
        'identity-session-redacted.json sessions[0] fields are invalid',
        'identity-session-redacted.json mfa.downgradeRejectedAt must not precede challengedAt',
        'identity-session-redacted.json sessions[0] lifetime must be within 1..3600 seconds',
        'identity-session-redacted.json revoked session must be present in sampled sessions',
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
      validateControlledJsonEvidence('rls-denials.json', {
        result: 'PASS',
        attempts: [
          {
            operation: 'cross-tenant-read',
            actorTenantRefHash: 'c'.repeat(64),
            targetTenantRefHash: 'c'.repeat(64),
            denied: true,
            exposedFieldCount: 0,
            mutationCount: 0,
            auditRefHash: 'a'.repeat(64),
            rawQuery: 'forbidden',
          },
          {
            operation: 'cross-tenant-read',
            actorTenantRefHash: 'c'.repeat(64),
            targetTenantRefHash: 'c'.repeat(64),
            denied: true,
            exposedFieldCount: 0,
            mutationCount: 0,
            auditRefHash: 'a'.repeat(64),
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'rls-denials.json attempt operations must be unique',
        'rls-denials.json audit references must be unique',
        'rls-denials.json attempts[0] must use different actor and target tenants',
        'rls-denials.json attempts[0] fields are invalid',
        'rls-denials.json attempts must include cross-tenant-write',
      ]),
    );
    expect(
      validateControlledJsonEvidence('tenant-context.json', {
        result: 'PASS',
        mismatchRejected: true,
        mismatchAttempt: {
          rejected: true,
          connectionTenantRefHash: 'd'.repeat(64),
          eventTenantRefHash: 'd'.repeat(64),
          auditRefHash: 'e'.repeat(64),
          rejectedAt: '2026-08-19T01:00:00.000Z',
        },
        transactions: [
          {
            connectionRefHash: 'a'.repeat(64),
            expectedTenantRefHash: 'b'.repeat(64),
            observedTenantRefHash: 'b'.repeat(64),
            resetVerified: true,
            sequence: 2,
            rawTenantId: 'forbidden',
          },
          {
            connectionRefHash: 'c'.repeat(64),
            expectedTenantRefHash: 'b'.repeat(64),
            observedTenantRefHash: 'b'.repeat(64),
            resetVerified: true,
            sequence: 2,
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'tenant-context.json transactions[0].sequence must equal 1',
        'tenant-context.json transactions[0] fields are invalid',
        'tenant-context.json transactions[1].expectedTenantRefHash must alternate between transactions',
        'tenant-context.json transactions must alternate at least two tenants',
        'tenant-context.json transactions must reuse one pooled connection',
        'tenant-context.json mismatch attempt must use different connection and event tenants',
      ]),
    );
    expect(
      validateControlledJsonEvidence('inbox-deduplication.json', {
        result: 'PASS',
        eventRefHash: 'd'.repeat(64),
        deliveryAttempts: 2,
        businessResultCount: 1,
        deliveries: [
          { eventRefHash: 'd'.repeat(64), attempt: 2 },
          { eventRefHash: 'd'.repeat(64), attempt: 2 },
        ],
        businessResults: [{ resultRefHash: 'e'.repeat(64) }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'inbox-deduplication.json deliveries[0].attempt must equal 1',
        'inbox-deduplication.json delivery attempts must be unique',
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
      validateControlledJsonEvidence('order-results.json', {
        successfulOrders: [
          {
            contenderRef: 'same',
            orderRefHash: 'a'.repeat(64),
            quantity: 0,
            customerEmail: 'forbidden@example.test',
          },
          {
            contenderRef: 'same',
            orderRefHash: 'a'.repeat(64),
            quantity: 1,
          },
        ],
        successfulQuantity: 1,
        failedContenders: [{ contenderRef: 'same', partialFactCount: 0 }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'order-results.json successfulOrders[0].quantity must be a positive integer',
        'order-results.json successfulOrders[0] fields are invalid',
        'order-results.json successful contender references must be unique',
        'order-results.json successful order references must be unique',
        'order-results.json contender cannot both succeed and fail',
      ]),
    );
    expect(
      validateControlledJsonEvidence('runtime-policy.json', {
        result: 'PASS',
        policyRefHash: 'a'.repeat(64),
        allowedHosts: [
          (() => {
            const url = new URL('https://localhost/');
            url.username = 'test-user';
            url.password = 'test-value';
            return url.href;
          })(),
        ],
        defaultDeny: true,
        networkPolicyApplied: true,
        appliedAt: '2026-08-19T01:00:00.000Z',
        allowedRequestLogSha256: 'b'.repeat(64),
        deniedRequestLogSha256: 'c'.repeat(64),
        denialAuditRefHash: 'd'.repeat(64),
        gatewayToken: 'forbidden',
      }),
    ).toEqual(
      expect.arrayContaining([
        'runtime-policy.json allowedHosts[0] must be an origin-only HTTPS URL',
        'runtime-policy.json fields are invalid',
      ]),
    );
    expect(
      validateControlledJsonEvidence('geo-target-redacted.json', {
        result: 'PASS',
        targetRefHash: 'a'.repeat(64),
        storedClaims: [
          {
            field: 'ranking',
            valueHash: 'b'.repeat(64),
            verifiedAt: '2026-08-19T01:00:00.000Z',
            rawValue: 'forbidden',
          },
        ],
        forbiddenClaims: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'geo-target-redacted.json storedClaims[0].field contains a forbidden performance claim',
        'geo-target-redacted.json storedClaims[0] fields are invalid',
      ]),
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
