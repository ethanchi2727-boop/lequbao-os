import { describe, expect, it } from 'vitest';
import {
  controlledSuiteCrossEvidenceRules,
  validateControlledSuiteDocuments,
} from './controlled-suite-evidence.mjs';

const digest = (target) => `ghcr.io/example/lequbao-v6-${target}@sha256:${'a'.repeat(64)}`;

describe('controlled suite cross-evidence contracts', () => {
  it('defines explicit cross-file rules for every validator-backed suite', () => {
    expect(Object.keys(controlledSuiteCrossEvidenceRules).sort()).toEqual([
      'BACKUP_RESTORE_PRIVACY',
      'COMMERCE_CONCURRENCY',
      'GREENFIELD_CUTOVER_GUARD',
      'IDENTITY_SECRETS_PRIVACY_ONCALL',
      'INTAKE_OBJECT_PIPELINE',
      'PAYMENT_PROVIDER_SANDBOX',
      'PERFORMANCE_CORE_AND_MESSAGES',
      'WECHAT_RELEASE_AND_ROLLBACK',
    ]);
    for (const rules of Object.values(controlledSuiteCrossEvidenceRules))
      expect(rules.length).toBeGreaterThan(0);
  });

  it('accepts reconciled commerce, payment and backup evidence', () => {
    expect(
      validateControlledSuiteDocuments('INTAKE_OBJECT_PIPELINE', {
        'upload-response.json': { objectRefHash: 'same-object' },
        'object-metadata.json': { objectRefHash: 'same-object' },
        'ocr-provenance.json': { objectRefHash: 'same-object' },
      }),
    ).toEqual([]);
    expect(
      validateControlledSuiteDocuments('COMMERCE_CONCURRENCY', {
        'concurrency-input.json': {
          stock: 3,
          requestedQuantity: 3,
          contenders: ['a', 'b', 'c'].map((contenderRef) => ({ contenderRef })),
        },
        'order-results.json': {
          successfulQuantity: 3,
          successfulOrders: ['a', 'b', 'c'].map((contenderRef) => ({ contenderRef })),
          failedContenders: [],
        },
        'inventory-ledger.json': { openingStock: 3, soldQuantity: 3, closingStock: 0 },
      }),
    ).toEqual([]);
    expect(
      validateControlledSuiteDocuments('PAYMENT_PROVIDER_SANDBOX', {
        'provider-request-redacted.json': {
          merchantAccountRef: 'merchant-hash',
          serverOrderAmountFen: 100,
        },
        'provider-callback-redacted.json': { merchantAccountRef: 'merchant-hash', amountFen: 100 },
        'merchant-account-reconciliation.json': {
          providerMerchantAccountRef: 'merchant-hash',
          platformMerchantAccountRef: 'merchant-hash',
          amountFen: 100,
        },
        'refund-unknown-recovery.json': { merchantAccountRef: 'merchant-hash' },
      }),
    ).toEqual([]);
    expect(
      validateControlledSuiteDocuments('BACKUP_RESTORE_PRIVACY', {
        'backup.manifest.json': {
          backupFile: 'candidate.dump.age',
          encryptedSha256: 'a'.repeat(64),
          financialSnapshotSha256: 'b'.repeat(64),
        },
        'restore-report.json': {
          backupFile: 'candidate.dump.age',
          encryptedSha256: 'a'.repeat(64),
          financialSnapshotSha256: 'b'.repeat(64),
        },
      }),
    ).toEqual([]);
  });

  it('rejects individually plausible but contradictory suite evidence', () => {
    expect(
      validateControlledSuiteDocuments('COMMERCE_CONCURRENCY', {
        'concurrency-input.json': { stock: 3, requestedQuantity: 3 },
        'order-results.json': { successfulQuantity: 4 },
        'inventory-ledger.json': { openingStock: 3, soldQuantity: 2, closingStock: 2 },
      }),
    ).toEqual(
      expect.arrayContaining([
        'successful quantity exceeds sellable stock',
        'successful quantity exceeds requested quantity',
        'ledger sold quantity does not match successful quantity',
        'closing stock does not reconcile with successful quantity',
      ]),
    );
    expect(
      validateControlledSuiteDocuments('INTAKE_OBJECT_PIPELINE', {
        'upload-response.json': {
          objectRefHash: 'one',
          uploadedAt: '2026-08-19T01:02:00.000Z',
        },
        'object-metadata.json': {
          objectRefHash: 'two',
          storedAt: '2026-08-19T01:01:00.000Z',
        },
        'ocr-provenance.json': {
          objectRefHash: 'three',
          provenance: { processedAt: '2026-08-19T01:00:00.000Z' },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'upload response and object metadata references do not match',
        'upload response and OCR provenance references do not match',
        'upload, retained storage and OCR timestamps are out of order',
      ]),
    );
    expect(
      validateControlledSuiteDocuments('PAYMENT_PROVIDER_SANDBOX', {
        'provider-request-redacted.json': { merchantAccountRef: 'one', serverOrderAmountFen: 100 },
        'provider-callback-redacted.json': { merchantAccountRef: 'two', amountFen: 99 },
        'merchant-account-reconciliation.json': {
          providerMerchantAccountRef: 'one',
          platformMerchantAccountRef: 'three',
          amountFen: 100,
        },
        'refund-unknown-recovery.json': { merchantAccountRef: 'one' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'merchant account references do not reconcile across payment evidence',
        'payment amounts do not reconcile across request callback and account evidence',
      ]),
    );
    expect(
      validateControlledSuiteDocuments('GREENFIELD_CUTOVER_GUARD', {
        'legacy-production-inventory.json': {
          generatedAt: '2026-08-19T01:01:00.000Z',
          sources: [
            {
              id: 'production-v5',
              declaredEnvironment: 'production',
              locationSha256: 'a'.repeat(64),
              outcome: 'DATA_PRESENT_REVIEW_REQUIRED',
              nonEmptyTableCount: 1,
              rowCount: 10,
            },
          ],
        },
        'greenfield-waiver.json': {
          reviewedAt: '2026-08-19T01:00:00.000Z',
          coverage: { databasePaths: [{ scopeRef: 'b'.repeat(64) }] },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'inventory source production-v5 is absent from waiver coverage',
        'production inventory source production-v5 is not empty',
        'greenfield waiver review precedes legacy inventory generation',
      ]),
    );
  });

  it('binds performance topology, WeChat rollback and alert acknowledgement across files', () => {
    const images = { api: digest('api'), worker: digest('worker'), web: digest('web') };
    const workflowRunId = '12345';
    const monitoring = {
      windowStartedAt: '2026-08-19T00:59:00.000Z',
      windowCompletedAt: '2026-08-19T01:02:00.000Z',
    };
    expect(
      validateControlledSuiteDocuments('PERFORMANCE_CORE_AND_MESSAGES', {
        'performance-report.json': {
          images,
          workflowRunId,
          startedAt: '2026-08-19T01:00:00.000Z',
          completedAt: '2026-08-19T01:01:00.000Z',
        },
        'candidate-image-digests.json': { images, workflowRunId },
        'monitoring-snapshot.json': monitoring,
        'deployment-topology.json': {
          services: {
            api: { image: images.api },
            worker: { image: images.worker },
            web: { image: images.web },
          },
        },
      }),
    ).toEqual([]);
    expect(
      validateControlledSuiteDocuments('PERFORMANCE_CORE_AND_MESSAGES', {
        'performance-report.json': {
          images,
          workflowRunId: '12346',
          startedAt: '2026-08-19T01:00:00.000Z',
          completedAt: '2026-08-19T01:01:00.000Z',
        },
        'candidate-image-digests.json': { images, workflowRunId },
        'monitoring-snapshot.json': monitoring,
        'deployment-topology.json': {
          services: {
            api: { image: images.api },
            worker: { image: images.worker },
            web: { image: images.web },
          },
        },
      }),
    ).toContain('performance report workflow run does not match the candidate manifest');
    expect(
      validateControlledSuiteDocuments('PERFORMANCE_CORE_AND_MESSAGES', {
        'performance-report.json': {
          images,
          workflowRunId,
          startedAt: '2026-08-19T01:00:00.000Z',
          completedAt: '2026-08-19T01:01:00.000Z',
        },
        'candidate-image-digests.json': { images, workflowRunId },
        'monitoring-snapshot.json': {
          windowStartedAt: '2026-08-19T01:00:30.000Z',
          windowCompletedAt: '2026-08-19T01:00:45.000Z',
        },
        'deployment-topology.json': {
          services: {
            api: { image: images.api },
            worker: { image: images.worker },
            web: { image: images.web },
          },
        },
      }),
    ).toContain('monitoring window does not cover the complete performance run');
    expect(
      validateControlledSuiteDocuments('WECHAT_RELEASE_AND_ROLLBACK', {
        'consumer-build.json': {
          version: 'consumer-1',
          builtAt: '2026-08-19T01:02:00.000Z',
        },
        'merchant-template-build.json': {
          version: 'merchant-1',
          builtAt: '2026-08-19T00:59:00.000Z',
        },
        'review-publish.json': {
          consumerVersion: 'consumer-2',
          merchantVersion: 'merchant-1',
          reviewVersion: 'review-1',
          publishedVersion: 'pilot-1',
          publishedAt: '2026-08-19T01:00:00.000Z',
        },
        'callback-redacted.json': { verifiedAt: '2026-08-19T00:59:00.000Z' },
        'device-matrix.json': {
          verifiedAt: '2026-08-19T00:59:00.000Z',
          scenarios: [
            { package: 'consumer', version: 'consumer-2' },
            { package: 'merchant-template', version: 'merchant-1' },
          ],
        },
        'rollback.json': {
          fromVersion: 'pilot-2',
          toVersion: 'pilot-2',
          verifiedAt: '2026-08-19T00:59:00.000Z',
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'published consumer version does not match its official build',
        'published WeChat version does not match the approved review version',
        'rollback source does not match the published version',
        'rollback must create a different safe release version',
        'consumer build must precede publication',
        'callback verification precedes publication',
        'device verification precedes publication',
        'consumer device scenario version does not match its official build',
        'rollback verification precedes publication',
      ]),
    );
    expect(
      validateControlledSuiteDocuments('IDENTITY_SECRETS_PRIVACY_ONCALL', {
        'alert-delivery.json': { alerts: ['P0-1'] },
        'oncall-acknowledgement.json': { alerts: ['P1-1'] },
      }),
    ).toContain('on-call acknowledgement does not cover the delivered alert identifiers');
    expect(
      validateControlledSuiteDocuments('IDENTITY_SECRETS_PRIVACY_ONCALL', {
        'alert-delivery.json': {
          alerts: [{ alertId: 'alert-1' }],
          recipients: [{ recipientRefHash: 'a'.repeat(64) }],
          deliveryResults: [
            {
              alertId: 'alert-1',
              recipientRefHash: 'a'.repeat(64),
              deliveredAt: '2026-08-19T01:02:00.000Z',
            },
          ],
        },
        'oncall-acknowledgement.json': {
          alerts: [{ alertId: 'alert-1' }],
          acknowledgements: [
            {
              alertId: 'alert-1',
              acknowledgedByRefHash: 'b'.repeat(64),
              acknowledgedAt: '2026-08-19T01:01:00.000Z',
            },
          ],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'on-call acknowledgement recipient differs for alert-1',
        'on-call acknowledgement precedes delivery for alert-1',
      ]),
    );
  });

  it('rejects a restore report bound to different backup bytes or financial facts', () => {
    expect(
      validateControlledSuiteDocuments('BACKUP_RESTORE_PRIVACY', {
        'backup.manifest.json': {
          backupFile: 'candidate.dump.age',
          encryptedSha256: 'a'.repeat(64),
          financialSnapshotSha256: 'b'.repeat(64),
        },
        'restore-report.json': {
          backupFile: 'candidate.dump.age',
          encryptedSha256: 'c'.repeat(64),
          financialSnapshotSha256: 'd'.repeat(64),
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'restore report references a different encrypted backup hash',
        'restore report references a different financial snapshot hash',
      ]),
    );
  });
});
