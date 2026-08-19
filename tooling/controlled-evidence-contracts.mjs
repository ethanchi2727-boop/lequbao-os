import { readFile } from 'node:fs/promises';
import path from 'node:path';

const field = (pathName, type, options = {}) => ({ path: pathName, type, ...options });
const pass = field('result', 'string', { equals: 'PASS' });
const yes = (pathName) => field(pathName, 'boolean', { equals: true });
const empty = (pathName) => field(pathName, 'array', { maxItems: 0 });
const commit = field('releaseCommit', 'string', {
  binding: 'releaseCommit',
  pattern: '^[a-f0-9]{40}$',
});
const deployment = field('deploymentId', 'string', { binding: 'deploymentId' });
const sha256 = (pathName) => field(pathName, 'string', { pattern: '^[a-f0-9]{64}$' });
const timestamp = (pathName) => field(pathName, 'string', { format: 'date-time' });
const imageDigest = (pathName) =>
  field(pathName, 'string', { pattern: '^ghcr\\.io/.+@sha256:[a-f0-9]{64}$' });

export const controlledJsonEvidenceContracts = {
  'rls-denials.json': [pass, field('attempts', 'array')],
  'tenant-context.json': [pass, field('transactions', 'array')],
  'inbox-deduplication.json': [
    pass,
    field('deliveries', 'array'),
    field('businessResults', 'array'),
  ],
  'upload-response.json': [
    field('status', 'number', { minimum: 200, maximum: 299 }),
    field('requestId', 'string'),
  ],
  'object-metadata.json': [yes('encrypted'), sha256('contentSha256'), field('retention', 'object')],
  'ocr-provenance.json': [field('candidates', 'array'), field('provenance', 'object')],
  'concurrency-input.json': [
    field('stock', 'number', { minimum: 0 }),
    field('requestedQuantity', 'number', { minimum: 1 }),
    field('contenders', 'array'),
  ],
  'order-results.json': [
    field('successfulOrders', 'array'),
    field('successfulQuantity', 'number', { minimum: 0 }),
    field('failedContenders', 'array'),
  ],
  'inventory-ledger.json': [
    field('openingStock', 'number', { minimum: 0 }),
    field('closingStock', 'number', { minimum: 0 }),
    field('soldQuantity', 'number', { minimum: 0 }),
    field('entries', 'array'),
  ],
  'provider-request-redacted.json': [
    field('merchantAccountRef', 'string'),
    field('serverOrderAmountFen', 'number', { minimum: 1 }),
    sha256('idempotencyKeyHash'),
  ],
  'provider-callback-redacted.json': [
    yes('signatureVerified'),
    field('merchantAccountRef', 'string'),
    field('amountFen', 'number', { minimum: 1 }),
    field('paymentState', 'string'),
    sha256('providerEventIdHash'),
  ],
  'merchant-account-reconciliation.json': [
    field('providerMerchantAccountRef', 'string'),
    field('platformMerchantAccountRef', 'string'),
    field('amountFen', 'number', { minimum: 1 }),
    yes('amountMatch'),
  ],
  'refund-unknown-recovery.json': [
    field('initialState', 'string'),
    field('merchantAccountRef', 'string'),
    field('providerQuery', 'object'),
    field('finalState', 'string'),
  ],
  'financial-policy-approvals.json': [
    commit,
    deployment,
    field('approvals', 'array'),
    empty('unresolvedItems'),
  ],
  'runtime-policy.json': [field('allowedHosts', 'array'), yes('defaultDeny')],
  'geo-target-redacted.json': [field('targetRefHash', 'string'), field('storedClaims', 'array')],
  'legacy-production-inventory.json': [
    commit,
    field('verdict', 'string'),
    field('sources', 'array'),
  ],
  'greenfield-waiver.json': [
    commit,
    field('environments', 'array'),
    field('domainZeroCounts', 'object'),
    field('approvals', 'array'),
  ],
  'backup.manifest.json': [
    field('schemaVersion', 'number', { equals: 1 }),
    field('backupFile', 'string'),
    sha256('encryptedSha256'),
    sha256('financialSnapshotSha256'),
    field('financialSnapshot', 'object'),
    yes('writeFrozen'),
  ],
  'restore-report.json': [
    pass,
    field('backupFile', 'string'),
    field('rpoSeconds', 'number', { minimum: 0, maximum: 300 }),
    field('rtoSeconds', 'number', { minimum: 0, maximum: 3600 }),
    yes('encryptedSha256Verified'),
    yes('financialSnapshotMatch'),
    field('databaseFixturesPassed', 'array'),
  ],
  'physical-wal-evidence.json': [
    pass,
    field('recoveryPoint', 'string'),
    field('faultDomain', 'string'),
    field('timeline', 'array'),
  ],
  'external-deletion-samples.json': [
    field('targets', 'array'),
    field('samples', 'array'),
    empty('unresolvedTargets'),
  ],
  'performance-report.json': [
    pass,
    commit,
    field('images', 'object'),
    field('scenarios', 'array'),
    field('persistence', 'object'),
  ],
  'deployment-topology.json': [
    commit,
    deployment,
    imageDigest('services.api.image'),
    imageDigest('services.worker.image'),
    imageDigest('services.web.image'),
    field('dataStores', 'array'),
  ],
  'monitoring-snapshot.json': [
    timestamp('capturedAt'),
    field('alerts', 'array'),
    field('saturation', 'object'),
    field('backlog', 'object'),
  ],
  'candidate-image-digests.json': [
    commit,
    imageDigest('images.api'),
    imageDigest('images.worker'),
    imageDigest('images.web'),
  ],
  'consumer-build.json': [
    pass,
    commit,
    field('version', 'string'),
    field('officialTool', 'string'),
  ],
  'merchant-template-build.json': [
    pass,
    commit,
    field('version', 'string'),
    field('officialTool', 'string'),
  ],
  'review-publish.json': [
    pass,
    field('consumerVersion', 'string'),
    field('merchantVersion', 'string'),
    field('reviewVersion', 'string'),
    field('publishedVersion', 'string'),
    field('pilotScope', 'object'),
  ],
  'callback-redacted.json': [
    yes('signatureVerified'),
    yes('replayRejected'),
    field('serverEventRef', 'string'),
  ],
  'rollback.json': [
    pass,
    field('fromVersion', 'string'),
    field('toVersion', 'string'),
    timestamp('verifiedAt'),
  ],
  'device-matrix.json': [field('devices', 'array'), field('scenarios', 'array'), empty('failures')],
  'identity-session-redacted.json': [
    field('revocation', 'object'),
    field('mfa', 'object'),
    field('sessions', 'array'),
  ],
  'secret-access-audit.json': [
    field('secretManager', 'string'),
    field('accessEvents', 'array'),
    empty('plaintextFindings'),
  ],
  'object-retention.json': [
    field('policy', 'object'),
    field('objectsSampled', 'array'),
    empty('violations'),
  ],
  'privacy-export-delete.json': [
    field('export', 'object'),
    field('deletion', 'object'),
    field('targets', 'array'),
  ],
  'alert-delivery.json': [
    field('alerts', 'array'),
    field('recipients', 'array'),
    field('deliveryResults', 'array'),
  ],
  'oncall-acknowledgement.json': [
    field('alerts', 'array'),
    field('acknowledgements', 'array'),
    empty('slaBreaches'),
  ],
  'legal-document-release.json': [
    commit,
    deployment,
    field('documents', 'array'),
    field('surfaceMatrix', 'array'),
    field('approvals', 'array'),
    empty('unresolvedItems'),
  ],
};

function valueAt(root, pathName) {
  let current = root;
  for (const segment of pathName.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) return { present: false };
    current = current[segment];
  }
  return { present: true, value: current };
}

function matchesType(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

export function validateControlledJsonEvidence(artifact, value, binding = {}) {
  if (path.extname(artifact).toLowerCase() !== '.json') return [];
  const contract = controlledJsonEvidenceContracts[artifact];
  if (!contract) return [`has no declared semantic contract for ${artifact}`];
  if (!value || Array.isArray(value) || typeof value !== 'object')
    return [`${artifact} must contain a JSON object`];
  const failures = [];
  for (const rule of contract) {
    const candidate = valueAt(value, rule.path);
    if (!candidate.present) {
      failures.push(`${artifact} is missing ${rule.path}`);
      continue;
    }
    if (!matchesType(candidate.value, rule.type)) {
      failures.push(`${artifact} ${rule.path} must be ${rule.type}`);
      continue;
    }
    if (rule.equals !== undefined && candidate.value !== rule.equals)
      failures.push(`${artifact} ${rule.path} must equal ${JSON.stringify(rule.equals)}`);
    if (
      rule.binding &&
      binding[rule.binding] !== undefined &&
      candidate.value !== binding[rule.binding]
    )
      failures.push(`${artifact} ${rule.path} does not match ${rule.binding}`);
    if (typeof candidate.value === 'string' && !candidate.value.trim())
      failures.push(`${artifact} ${rule.path} must not be empty`);
    if (Array.isArray(candidate.value)) {
      const minimum = rule.maxItems === 0 ? 0 : 1;
      if (candidate.value.length < minimum)
        failures.push(`${artifact} ${rule.path} must contain evidence`);
      if (rule.maxItems !== undefined && candidate.value.length > rule.maxItems)
        failures.push(`${artifact} ${rule.path} must contain at most ${rule.maxItems} items`);
    }
    if (typeof candidate.value === 'number') {
      if (rule.minimum !== undefined && candidate.value < rule.minimum)
        failures.push(`${artifact} ${rule.path} must be at least ${rule.minimum}`);
      if (rule.maximum !== undefined && candidate.value > rule.maximum)
        failures.push(`${artifact} ${rule.path} must be at most ${rule.maximum}`);
    }
    if (
      typeof candidate.value === 'string' &&
      rule.pattern &&
      !new RegExp(rule.pattern, 'u').test(candidate.value)
    )
      failures.push(`${artifact} ${rule.path} has invalid format`);
    if (
      typeof candidate.value === 'string' &&
      rule.format === 'date-time' &&
      !Number.isFinite(Date.parse(candidate.value))
    )
      failures.push(`${artifact} ${rule.path} must be an ISO date-time`);
    if (
      typeof candidate.value === 'string' &&
      rule.format === 'date-time' &&
      Number.isFinite(Date.parse(candidate.value)) &&
      Date.parse(candidate.value) > Date.now() + 5 * 60_000
    )
      failures.push(`${artifact} ${rule.path} must not be in the future`);
    if (rule.type === 'object' && candidate.value && Object.keys(candidate.value).length === 0)
      failures.push(`${artifact} ${rule.path} must not be empty`);
  }
  return failures;
}

export async function inspectControlledJsonEvidence(
  file,
  artifact = path.basename(file),
  binding = {},
) {
  if (path.extname(artifact).toLowerCase() !== '.json') return [];
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return [`${artifact} contains invalid JSON`];
  }
  return validateControlledJsonEvidence(artifact, parsed, binding);
}
