import { describe, expect, it } from 'vitest';
import {
  controlledSuiteCrossEvidenceRules,
  validateControlledSuiteDocuments,
} from './controlled-suite-evidence.mjs';

const digest = (target) => `ghcr.io/example/lequ-${target}@sha256:${'a'.repeat(64)}`;

describe('controlled suite cross-evidence contracts', () => {
  it('defines explicit cross-file rules for every validator-backed suite', () => {
    expect(Object.keys(controlledSuiteCrossEvidenceRules).sort()).toEqual([
      'BACKUP_RESTORE_PRIVACY',
      'COMMERCE_CONCURRENCY',
      'IDENTITY_SECRETS_PRIVACY_ONCALL',
      'PAYMENT_PROVIDER_SANDBOX',
      'PERFORMANCE_CORE_AND_MESSAGES',
      'WECHAT_RELEASE_AND_ROLLBACK',
    ]);
    for (const rules of Object.values(controlledSuiteCrossEvidenceRules))
      expect(rules.length).toBeGreaterThan(0);
  });

  it('accepts reconciled commerce, payment and backup evidence', () => {
    expect(
      validateControlledSuiteDocuments('COMMERCE_CONCURRENCY', {
        'concurrency-input.json': { stock: 3, requestedQuantity: 10 },
        'order-results.json': { successfulQuantity: 3 },
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
        'backup.manifest.json': { backupFile: 'candidate.dump.age' },
        'restore-report.json': { backupFile: 'candidate.dump.age' },
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
  });

  it('binds performance topology, WeChat rollback and alert acknowledgement across files', () => {
    const images = { api: digest('api'), worker: digest('worker'), web: digest('web') };
    expect(
      validateControlledSuiteDocuments('PERFORMANCE_CORE_AND_MESSAGES', {
        'performance-report.json': { images },
        'candidate-image-digests.json': { images },
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
      validateControlledSuiteDocuments('WECHAT_RELEASE_AND_ROLLBACK', {
        'consumer-build.json': { version: 'consumer-1' },
        'merchant-template-build.json': { version: 'merchant-1' },
        'review-publish.json': {
          consumerVersion: 'consumer-2',
          merchantVersion: 'merchant-1',
          publishedVersion: 'pilot-1',
        },
        'rollback.json': { fromVersion: 'pilot-2', toVersion: 'pilot-2' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'published consumer version does not match its official build',
        'rollback source does not match the published version',
        'rollback must create a different safe release version',
      ]),
    );
    expect(
      validateControlledSuiteDocuments('IDENTITY_SECRETS_PRIVACY_ONCALL', {
        'alert-delivery.json': { alerts: ['P0-1'] },
        'oncall-acknowledgement.json': { alerts: ['P1-1'] },
      }),
    ).toContain('on-call acknowledgement does not cover the delivered alert identifiers');
  });
});
