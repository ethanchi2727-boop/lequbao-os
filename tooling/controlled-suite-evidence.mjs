import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const controlledSuiteCrossEvidenceRules = {
  INTAKE_OBJECT_PIPELINE: [
    'upload response and retained encrypted metadata reference the same redacted object',
  ],
  COMMERCE_CONCURRENCY: [
    'opening stock equals the declared input stock',
    'successful quantity does not exceed stock or requested quantity',
    'ledger sold quantity equals successful quantity',
    'closing stock equals opening stock minus successful quantity',
    'every contender has exactly one successful or failed outcome and failed outcomes have no partial fact',
  ],
  PAYMENT_PROVIDER_SANDBOX: [
    'request, callback, reconciliation and refund use the same merchant account reference',
    'request, callback and reconciliation use the same amount',
  ],
  BACKUP_RESTORE_PRIVACY: [
    'restore report references the exact encrypted backup manifest file',
    'restore report repeats the exact encrypted artifact and financial snapshot hashes',
  ],
  PERFORMANCE_CORE_AND_MESSAGES: [
    'performance report images equal the protected candidate manifest',
    'deployment topology API, Worker and Web images equal the protected candidate manifest',
  ],
  WECHAT_RELEASE_AND_ROLLBACK: [
    'reviewed consumer and merchant versions equal their official build artifacts',
    'published version equals the approved review version',
    'rollback starts from the published version and creates a different safe version',
  ],
  IDENTITY_SECRETS_PRIVACY_ONCALL: [
    'on-call acknowledgement covers the exact alert identifiers retained by alert delivery',
  ],
};

const same = (left, right) => isDeepStrictEqual(left, right);

export function validateControlledSuiteDocuments(suiteCode, documents) {
  const failures = [];
  const get = (artifact) => documents[artifact];
  if (suiteCode === 'INTAKE_OBJECT_PIPELINE') {
    const upload = get('upload-response.json');
    const metadata = get('object-metadata.json');
    if (upload && metadata && upload.objectRefHash !== metadata.objectRefHash)
      failures.push('upload response and object metadata references do not match');
  } else if (suiteCode === 'COMMERCE_CONCURRENCY') {
    const input = get('concurrency-input.json');
    const orders = get('order-results.json');
    const ledger = get('inventory-ledger.json');
    if (input && orders && ledger) {
      if (ledger.openingStock !== input.stock)
        failures.push('opening stock does not match concurrency input stock');
      if (orders.successfulQuantity > input.stock)
        failures.push('successful quantity exceeds sellable stock');
      if (orders.successfulQuantity > input.requestedQuantity)
        failures.push('successful quantity exceeds requested quantity');
      if (ledger.soldQuantity !== orders.successfulQuantity)
        failures.push('ledger sold quantity does not match successful quantity');
      if (ledger.closingStock !== ledger.openingStock - orders.successfulQuantity)
        failures.push('closing stock does not reconcile with successful quantity');
      const inputRefs = new Set((input.contenders ?? []).map((item) => item?.contenderRef));
      const successRefs = (orders.successfulOrders ?? []).map((item) => item?.contenderRef);
      const failedRefs = (orders.failedContenders ?? []).map((item) => item?.contenderRef);
      const outcomeRefs = [...successRefs, ...failedRefs];
      if (
        outcomeRefs.length !== inputRefs.size ||
        new Set(outcomeRefs).size !== outcomeRefs.length ||
        outcomeRefs.some((reference) => !inputRefs.has(reference))
      )
        failures.push('commerce contender outcomes do not reconcile exactly with input contenders');
    }
  } else if (suiteCode === 'PAYMENT_PROVIDER_SANDBOX') {
    const request = get('provider-request-redacted.json');
    const callback = get('provider-callback-redacted.json');
    const reconciliation = get('merchant-account-reconciliation.json');
    const refund = get('refund-unknown-recovery.json');
    if (request && callback && reconciliation && refund) {
      const accounts = [
        request.merchantAccountRef,
        callback.merchantAccountRef,
        reconciliation.providerMerchantAccountRef,
        reconciliation.platformMerchantAccountRef,
        refund.merchantAccountRef,
      ];
      if (new Set(accounts).size !== 1)
        failures.push('merchant account references do not reconcile across payment evidence');
      if (
        request.serverOrderAmountFen !== callback.amountFen ||
        request.serverOrderAmountFen !== reconciliation.amountFen
      )
        failures.push(
          'payment amounts do not reconcile across request callback and account evidence',
        );
    }
  } else if (suiteCode === 'BACKUP_RESTORE_PRIVACY') {
    const backup = get('backup.manifest.json');
    const restore = get('restore-report.json');
    if (backup && restore && backup.backupFile !== restore.backupFile)
      failures.push('restore report references a different backup file');
    if (backup && restore && backup.encryptedSha256 !== restore.encryptedSha256)
      failures.push('restore report references a different encrypted backup hash');
    if (backup && restore && backup.financialSnapshotSha256 !== restore.financialSnapshotSha256)
      failures.push('restore report references a different financial snapshot hash');
  } else if (suiteCode === 'PERFORMANCE_CORE_AND_MESSAGES') {
    const report = get('performance-report.json');
    const topology = get('deployment-topology.json');
    const manifest = get('candidate-image-digests.json');
    if (report && topology && manifest) {
      if (!same(report.images, manifest.images))
        failures.push('performance report images do not match the candidate manifest');
      const deployed = {
        api: topology.services?.api?.image,
        worker: topology.services?.worker?.image,
        web: topology.services?.web?.image,
      };
      if (!same(deployed, manifest.images))
        failures.push('deployment topology images do not match the candidate manifest');
    }
  } else if (suiteCode === 'WECHAT_RELEASE_AND_ROLLBACK') {
    const consumer = get('consumer-build.json');
    const merchant = get('merchant-template-build.json');
    const publish = get('review-publish.json');
    const rollback = get('rollback.json');
    if (consumer && merchant && publish && rollback) {
      if (consumer.version !== publish.consumerVersion)
        failures.push('published consumer version does not match its official build');
      if (merchant.version !== publish.merchantVersion)
        failures.push('published merchant version does not match its official build');
      if (publish.reviewVersion !== publish.publishedVersion)
        failures.push('published WeChat version does not match the approved review version');
      if (rollback.fromVersion !== publish.publishedVersion)
        failures.push('rollback source does not match the published version');
      if (rollback.toVersion === rollback.fromVersion)
        failures.push('rollback must create a different safe release version');
    }
  } else if (suiteCode === 'IDENTITY_SECRETS_PRIVACY_ONCALL') {
    const delivery = get('alert-delivery.json');
    const acknowledgement = get('oncall-acknowledgement.json');
    if (delivery && acknowledgement && !same(delivery.alerts, acknowledgement.alerts))
      failures.push('on-call acknowledgement does not cover the delivered alert identifiers');
  }
  return failures;
}

export async function inspectControlledSuiteEvidence(evidenceRoot, suite) {
  if (!controlledSuiteCrossEvidenceRules[suite.code]) return [];
  const documents = {};
  for (const artifact of suite.requiredEvidence.filter((file) => file.endsWith('.json'))) {
    try {
      documents[artifact] = JSON.parse(
        await readFile(path.join(evidenceRoot, suite.evidenceDirectory, artifact), 'utf8'),
      );
    } catch {
      // Individual artifact validation owns missing and malformed diagnostics.
    }
  }
  return validateControlledSuiteDocuments(suite.code, documents);
}
