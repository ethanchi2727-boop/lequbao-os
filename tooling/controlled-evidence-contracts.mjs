import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCanonicalUtcTimestamp } from './canonical-time.mjs';
import { requiredAlertCodes, requiredAlertPolicy } from './operations-alert-policy.mjs';

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
const futureTimestamp = (pathName) =>
  field(pathName, 'string', { format: 'date-time', allowFuture: true });
const candidateImageDigest = (pathName, target) =>
  field(pathName, 'string', {
    pattern: `^ghcr\\.io/[a-z0-9][a-z0-9-]{0,38}/lequbao-v6-${target}@sha256:[a-f0-9]{64}$`,
  });

export const requiredDatabaseFixtureFiles = Object.freeze(
  (await readdir(new URL('../database/tests/', import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort(),
);

export const controlledJsonEvidenceContracts = {
  'rls-denials.json': [pass, field('attempts', 'array')],
  'tenant-context.json': [pass, yes('mismatchRejected'), field('transactions', 'array')],
  'inbox-deduplication.json': [
    pass,
    sha256('eventRefHash'),
    field('deliveryAttempts', 'number', { minimum: 2 }),
    field('businessResultCount', 'number', { equals: 1 }),
    field('deliveries', 'array'),
    field('businessResults', 'array'),
  ],
  'upload-response.json': [
    field('status', 'number', { minimum: 200, maximum: 299 }),
    field('requestId', 'string'),
    sha256('objectRefHash'),
    field('malwareScan', 'string', { equals: 'CLEAN' }),
    field('rawObjectKeyExposed', 'boolean', { equals: false }),
    timestamp('uploadedAt'),
  ],
  'object-metadata.json': [
    sha256('objectRefHash'),
    yes('encrypted'),
    yes('originalRetained'),
    sha256('contentSha256'),
    timestamp('storedAt'),
    field('retention', 'object'),
    sha256('retention.policyRefHash'),
    field('retention.storageClass', 'string', { equals: 'compliance-retained' }),
    yes('retention.immutable'),
    timestamp('retention.appliedAt'),
    futureTimestamp('retention.retainUntil'),
  ],
  'ocr-provenance.json': [
    sha256('objectRefHash'),
    field('candidates', 'array'),
    field('provenance', 'object'),
  ],
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
    sha256('orderRefHash'),
    sha256('merchantAccountRef'),
    field('serverOrderAmountFen', 'number', { minimum: 1 }),
    sha256('idempotencyKeyHash'),
    timestamp('requestedAt'),
  ],
  'provider-callback-redacted.json': [
    yes('signatureVerified'),
    yes('replayRejected'),
    sha256('orderRefHash'),
    sha256('merchantAccountRef'),
    field('amountFen', 'number', { minimum: 1 }),
    field('paymentState', 'string', { equals: 'SUCCEEDED' }),
    field('appliedBusinessTransitions', 'number', { equals: 1 }),
    sha256('providerEventIdHash'),
    timestamp('receivedAt'),
    timestamp('appliedAt'),
  ],
  'merchant-account-reconciliation.json': [
    sha256('orderRefHash'),
    sha256('providerMerchantAccountRef'),
    sha256('platformMerchantAccountRef'),
    field('amountFen', 'number', { minimum: 1 }),
    yes('amountMatch'),
    yes('accountMatch'),
    empty('unexplainedItems'),
    timestamp('reconciledAt'),
  ],
  'refund-unknown-recovery.json': [
    field('initialState', 'string', { equals: 'UNKNOWN' }),
    sha256('merchantAccountRef'),
    field('providerQuery', 'object'),
    timestamp('observedUnknownAt'),
    timestamp('providerQuery.queriedAt'),
    field('finalState', 'string'),
    yes('queryBeforeRetry'),
    field('convergenceCount', 'number', { equals: 1 }),
    timestamp('completedAt'),
  ],
  'financial-policy-approvals.json': [
    commit,
    deployment,
    field('decisionVersion', 'string'),
    timestamp('effectiveAt'),
    field('decisions', 'object'),
    field('approvals', 'array'),
    field('independentReview', 'object'),
    field('independentReview.receiptId', 'string'),
    empty('unresolvedItems'),
  ],
  'runtime-policy.json': [
    pass,
    sha256('policyRefHash'),
    field('allowedHosts', 'array'),
    yes('defaultDeny'),
    yes('networkPolicyApplied'),
    timestamp('appliedAt'),
    sha256('allowedRequestLogSha256'),
    sha256('deniedRequestLogSha256'),
    sha256('denialAuditRefHash'),
  ],
  'geo-target-redacted.json': [
    pass,
    sha256('targetRefHash'),
    field('storedClaims', 'array'),
    empty('forbiddenClaims'),
  ],
  'legacy-production-inventory.json': [
    commit,
    timestamp('generatedAt'),
    field('verdict', 'string', { equals: 'INDEPENDENT_REVIEW_REQUIRED' }),
    field('limitations', 'array'),
    field('sources', 'array'),
  ],
  'greenfield-waiver.json': [
    pass,
    commit,
    field('environments', 'array'),
    field('coverage', 'object'),
    field('domainZeroCounts', 'object'),
    field('approvals', 'array'),
    timestamp('reviewedAt'),
  ],
  'backup.manifest.json': [
    field('schemaVersion', 'number', { equals: 1 }),
    field('backupFile', 'string', { pattern: '^lequ-[0-9]{8}T[0-9]{6}Z\\.dump\\.age$' }),
    timestamp('backupStartedAt'),
    timestamp('backupCompletedAt'),
    field('encryptedSizeBytes', 'number', { minimum: 1 }),
    sha256('encryptedSha256'),
    sha256('financialSnapshotSha256'),
    field('financialSnapshot', 'object'),
    yes('writeFrozen'),
  ],
  'restore-report.json': [
    pass,
    field('schemaVersion', 'number', { equals: 1 }),
    field('backupFile', 'string', { pattern: '^lequ-[0-9]{8}T[0-9]{6}Z\\.dump\\.age$' }),
    timestamp('failureTime'),
    timestamp('backupCompletedAt'),
    timestamp('restoreStartedAt'),
    timestamp('restoreCompletedAt'),
    field('rpoSeconds', 'number', { minimum: 0, maximum: 300 }),
    field('rtoSeconds', 'number', { minimum: 0, maximum: 3600 }),
    field('rpoThresholdSeconds', 'number', { equals: 300 }),
    field('rtoThresholdSeconds', 'number', { equals: 3600 }),
    sha256('encryptedSha256'),
    sha256('financialSnapshotSha256'),
    yes('encryptedSha256Verified'),
    yes('financialSnapshotMatch'),
    field('privacyReplayTasksEnqueued', 'number', { minimum: 1 }),
    field('databaseFixturesPassed', 'array'),
  ],
  'physical-wal-evidence.json': [
    pass,
    sha256('backupSetRefHash'),
    sha256('sourceFaultDomainRefHash'),
    sha256('recoveryFaultDomainRefHash'),
    timestamp('recoveryPoint'),
    timestamp('replayedThrough'),
    yes('crossFaultDomain'),
    yes('walReplayVerified'),
    field('timeline', 'array'),
  ],
  'external-deletion-samples.json': [
    pass,
    field('targets', 'array'),
    field('samples', 'array'),
    empty('unresolvedTargets'),
  ],
  'performance-report.json': [
    pass,
    field('schemaVersion', 'number', { equals: 1 }),
    commit,
    field('workflowRunId', 'string', { pattern: '^[1-9][0-9]{0,19}$' }),
    field('images', 'object'),
    timestamp('startedAt'),
    timestamp('completedAt'),
    field('concurrency', 'number', { minimum: 1, maximum: 200 }),
    field('requestsPerScenario', 'number', { minimum: 20, maximum: 100000 }),
    field('durationSeconds', 'number', { minimum: 0 }),
    field('scenarios', 'array'),
    field('database', 'object'),
    field('persistence', 'object'),
  ],
  'deployment-topology.json': [
    commit,
    deployment,
    timestamp('capturedAt'),
    field('environment', 'string'),
    candidateImageDigest('services.api.image', 'api'),
    sha256('services.api.deploymentRefHash'),
    field('services.api.replicas', 'number', { minimum: 1 }),
    field('services.api.readyReplicas', 'number', { minimum: 1 }),
    candidateImageDigest('services.worker.image', 'worker'),
    sha256('services.worker.deploymentRefHash'),
    field('services.worker.replicas', 'number', { minimum: 1 }),
    field('services.worker.readyReplicas', 'number', { minimum: 1 }),
    candidateImageDigest('services.web.image', 'web'),
    sha256('services.web.deploymentRefHash'),
    field('services.web.replicas', 'number', { minimum: 1 }),
    field('services.web.readyReplicas', 'number', { minimum: 1 }),
    field('dataStores', 'array'),
  ],
  'monitoring-snapshot.json': [
    commit,
    deployment,
    timestamp('windowStartedAt'),
    timestamp('windowCompletedAt'),
    timestamp('capturedAt'),
    field('alerts', 'array'),
    field('saturation', 'object'),
    field('backlog', 'object'),
    empty('stopReleaseConditions'),
  ],
  'candidate-image-digests.json': [
    field('version', 'number', { equals: 1 }),
    commit,
    field('workflowRunId', 'string', { pattern: '^[1-9][0-9]{0,19}$' }),
    candidateImageDigest('images.api', 'api'),
    candidateImageDigest('images.worker', 'worker'),
    candidateImageDigest('images.web', 'web'),
  ],
  'consumer-build.json': [
    pass,
    commit,
    field('version', 'string'),
    field('officialTool', 'string', { equals: 'WeChat DevTools CLI' }),
    field('officialToolVersion', 'string'),
    sha256('buildSha256'),
    timestamp('builtAt'),
  ],
  'merchant-template-build.json': [
    pass,
    commit,
    field('version', 'string'),
    field('officialTool', 'string', { equals: 'WeChat DevTools CLI' }),
    field('officialToolVersion', 'string'),
    sha256('buildSha256'),
    timestamp('builtAt'),
  ],
  'review-publish.json': [
    pass,
    field('consumerVersion', 'string'),
    field('merchantVersion', 'string'),
    field('reviewVersion', 'string'),
    field('publishedVersion', 'string'),
    field('reviewResult', 'string', { equals: 'APPROVED' }),
    timestamp('reviewedAt'),
    sha256('reviewReceiptHash'),
    timestamp('publishedAt'),
    sha256('publicationReceiptHash'),
    field('pilotScope', 'object'),
  ],
  'callback-redacted.json': [
    yes('signatureVerified'),
    yes('replayRejected'),
    sha256('serverEventRef'),
    field('publishedVersion', 'string'),
    field('appliedBusinessTransitions', 'number', { equals: 1 }),
    timestamp('verifiedAt'),
  ],
  'rollback.json': [
    pass,
    field('fromVersion', 'string'),
    field('toVersion', 'string'),
    sha256('toBuildSha256'),
    yes('authorizationVerified'),
    timestamp('verifiedAt'),
    yes('serverStateVerified'),
    sha256('rollbackReceiptHash'),
  ],
  'device-matrix.json': [
    pass,
    timestamp('verifiedAt'),
    field('devices', 'array'),
    field('scenarios', 'array'),
    empty('failures'),
  ],
  'identity-session-redacted.json': [
    pass,
    field('revocation', 'object'),
    field('mfa', 'object'),
    field('sessions', 'array'),
    empty('failures'),
  ],
  'secret-access-audit.json': [
    pass,
    field('secretManager', 'string'),
    field('accessEvents', 'array'),
    yes('leastPrivilegeVerified'),
    yes('rotationVerified'),
    empty('plaintextFindings'),
  ],
  'object-retention.json': [
    pass,
    field('policy', 'object'),
    field('objectsSampled', 'array'),
    empty('violations'),
  ],
  'privacy-export-delete.json': [
    pass,
    field('export', 'object'),
    field('deletion', 'object'),
    field('targets', 'array'),
    empty('unresolvedTargets'),
  ],
  'alert-delivery.json': [
    pass,
    field('alerts', 'array'),
    field('recipients', 'array'),
    field('deliveryResults', 'array'),
  ],
  'oncall-acknowledgement.json': [
    pass,
    field('alerts', 'array'),
    field('acknowledgements', 'array'),
    empty('slaBreaches'),
  ],
  'legal-document-release.json': [
    pass,
    commit,
    deployment,
    field('documents', 'array'),
    field('surfaceMatrix', 'array'),
    field('approvals', 'array'),
    empty('unresolvedItems'),
  ],
};

export const controlledJsonEvidenceReviewRules = Object.freeze({
  'deployment-topology.json': [
    'the controlled-preproduction topology runs the exact API, Worker and Web candidate digests',
    'PostgreSQL and object-store dependencies are TLS protected and hash-redacted',
  ],
  'monitoring-snapshot.json': [
    'resource saturation remains within bounded percentages, no dead Outbox or unacknowledged message appears and no stop-release condition is open',
  ],
  'rls-denials.json': [
    'cross-tenant read and write are both denied with zero exposed fields and zero mutation',
  ],
  'tenant-context.json': [
    'every pooled transaction observes only its expected tenant and the mismatched event is rejected',
  ],
  'inbox-deduplication.json': [
    'the same hashed event is delivered at least twice but creates exactly one business result',
  ],
  'upload-response.json': [
    'a clean malware result returns a hashed object reference without exposing its raw storage key',
  ],
  'object-metadata.json': [
    'the same object reference retains an encrypted original with immutable content hash and policy',
  ],
  'ocr-provenance.json': [
    'each bounded-confidence candidate has a hashed source region and versioned gateway provenance',
  ],
  'concurrency-input.json': [
    'individual contenders and quantities reconcile to the declared request total and exceed stock',
  ],
  'order-results.json': [
    'successful quantities reconcile and every failed contender leaves zero partial fact',
  ],
  'inventory-ledger.json': [
    'structured sold entries reconcile with sold quantity and closing stock',
  ],
  'runtime-policy.json': [
    'the applied network policy defaults deny and permits only unique origin-only HTTPS hosts',
  ],
  'geo-target-redacted.json': [
    'the target and stored values are hash-redacted and contain no ranking, traffic or conversion claim',
  ],
  'identity-session-redacted.json': [
    'revoked sessions are rejected, high-risk MFA cannot be downgraded and sampled sessions stay tenant-scoped and short-lived',
  ],
  'secret-access-audit.json': [
    'versioned secret-manager events use hashed secret references, least privilege and rotation with no plaintext finding',
  ],
  'object-retention.json': [
    'sampled objects prove encryption, retention application and deletion behavior with zero violation',
  ],
  'privacy-export-delete.json': [
    'encrypted export reaches only the verified session within fifteen minutes',
    'database, object-store, search, vector and cache deletion targets each have a verified receipt',
  ],
  'alert-delivery.json': [
    'P0 and P1 alerts are each delivered to hashed real-recipient channels with timestamps',
  ],
  'oncall-acknowledgement.json': [
    'every delivered P0/P1 alert is acknowledged with timestamp and escalation outcome and no SLA breach',
  ],
  'consumer-build.json': [
    'the consumer package is built by the versioned official WeChat DevTools CLI and SHA-256 bound',
  ],
  'merchant-template-build.json': [
    'the merchant template is built by the versioned official WeChat DevTools CLI and SHA-256 bound',
  ],
  'review-publish.json': [
    'official review is APPROVED and the published version matches the reviewed version',
    'the publication receipt is SHA-256 bound and pilot scope is non-empty and bounded',
  ],
  'callback-redacted.json': [
    'signature verification and replay rejection pass and exactly one business transition is applied',
  ],
  'rollback.json': [
    'rollback creates a different release, verifies authoritative server state and retains a receipt hash',
  ],
  'device-matrix.json': [
    'both iOS and Android run consumer and merchant scenarios on official clients with zero failures',
  ],
  'provider-request-redacted.json': [
    'the amount is server-derived and both merchant account and idempotency references are SHA-256 redacted',
  ],
  'provider-callback-redacted.json': [
    'signature and replay rejection pass and exactly one business transition reaches SUCCEEDED',
  ],
  'merchant-account-reconciliation.json': [
    'provider and platform account/amount comparisons both match with zero unexplained items',
  ],
  'refund-unknown-recovery.json': [
    'UNKNOWN is queried before retry with the same idempotency key and converges exactly once',
  ],
  'financial-policy-approvals.json': [
    'business and finance owners are different accountable subjects with APPROVED receipts',
    'payment ownership, merchant mapping, legacy balances, C-001, compute allocation and historical snapshots are all resolved',
    'an additional different subject independently reviews the decision after both approvals',
  ],
  'legacy-production-inventory.json': [
    'every listed SQLite source has location/file hashes, non-negative counts and no stop-release or unknown outcome',
    'the inventory remains INDEPENDENT_REVIEW_REQUIRED until the separate waiver is approved',
  ],
  'greenfield-waiver.json': [
    'hosts, database paths, persistent volumes, object stores and provider ledgers each contain accountable zero-record inspection evidence',
    'all ten production business domains have an exact zero count',
    'product, business, security and migration owners are different accountable approving subjects',
  ],
  'legal-document-release.json': [
    'every immutable document has an HTTPS publication, SHA-256, version, owner, approval receipt and effective time',
    '乐趣宝 Web, 乐趣生活 mini-program and merchant mini-program each bind published documents with no failed checks',
    'product and legal/compliance approvals come from different accountable subjects',
  ],
  'backup.manifest.json': [
    'encrypted backup bytes and the financial snapshot are SHA-256 bound after a frozen write boundary',
    'backup start/completion chronology and positive encrypted size are retained',
  ],
  'restore-report.json': [
    'the exact encrypted and financial hashes are repeated from the backup manifest',
    'all 22 database fixtures, privacy replay, financial match and encrypted-byte verification pass within RPO/RTO',
  ],
  'physical-wal-evidence.json': [
    'WAL replay reaches the declared recovery point in a different fault domain',
    'the non-future recovery timeline contains structured events',
  ],
  'external-deletion-samples.json': [
    'object-store, search, vector and cache targets each have deletion receipts and zero remaining matches',
  ],
  'performance-report.json': [
    'core-read, customer-message-write and core-write use the frozen P95/error thresholds and reconcile every request',
    'all acknowledged messages persist and dead Outbox count does not increase',
    'before/after database snapshots contain the complete 164-table candidate schema and non-negative counters',
  ],
});

const validSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const opaqueSubject = /^(?:github|org|workforce):[A-Za-z0-9._-]{1,128}$/u;
const opaqueReference = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const validDateTime = (value) =>
  parseCanonicalUtcTimestamp(value) !== undefined &&
  parseCanonicalUtcTimestamp(value) <= Date.now() + 5 * 60_000;

function validateApprovalSet(artifact, approvals, requiredRoles) {
  const failures = [];
  if (!Array.isArray(approvals)) return failures;
  const subjects = new Set();
  const approvedRoles = new Set();
  for (const [index, approval] of approvals.entries()) {
    const prefix = `${artifact} approvals[${index}]`;
    if (!approval || Array.isArray(approval) || typeof approval !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!opaqueSubject.test(approval.subjectId ?? ''))
      failures.push(`${prefix}.subjectId must be an approved opaque subject`);
    else if (subjects.has(approval.subjectId))
      failures.push(`${artifact} approval subjects must differ`);
    else subjects.add(approval.subjectId);
    if (!requiredRoles.includes(approval.role)) failures.push(`${prefix}.role is not approved`);
    else if (approvedRoles.has(approval.role))
      failures.push(`${artifact} approval roles must be unique`);
    else approvedRoles.add(approval.role);
    if (approval.decision !== 'APPROVED') failures.push(`${prefix}.decision must equal "APPROVED"`);
    if (!opaqueReference.test(approval.receiptId ?? ''))
      failures.push(`${prefix}.receiptId must be an opaque reference`);
    if (!validDateTime(approval.approvedAt))
      failures.push(`${prefix}.approvedAt must be a non-future ISO date-time`);
  }
  for (const role of requiredRoles)
    if (!approvedRoles.has(role)) failures.push(`${artifact} approvals must include ${role}`);
  return failures;
}

function validateLegacyInventory(value) {
  const artifact = 'legacy-production-inventory.json';
  const failures = [];
  const sourceIds = new Set();
  const locations = new Set();
  for (const [index, source] of (Array.isArray(value.sources) ? value.sources : []).entries()) {
    const prefix = `${artifact} sources[${index}]`;
    if (!source || Array.isArray(source) || typeof source !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (source.kind !== 'sqlite') failures.push(`${prefix}.kind must equal "sqlite"`);
    if (!opaqueReference.test(source.id ?? '')) failures.push(`${prefix}.id must be opaque`);
    else if (sourceIds.has(source.id)) failures.push(`${artifact} source IDs must be unique`);
    else sourceIds.add(source.id);
    if (
      !['development', 'test', 'controlled-preproduction', 'production'].includes(
        source.declaredEnvironment,
      )
    )
      failures.push(`${prefix}.declaredEnvironment must be reviewed and non-unknown`);
    if (!validSha256(source.locationSha256))
      failures.push(`${prefix}.locationSha256 has invalid format`);
    else if (locations.has(source.locationSha256))
      failures.push(`${artifact} source locations must be unique`);
    else locations.add(source.locationSha256);
    if (!validSha256(source.fileSha256)) failures.push(`${prefix}.fileSha256 has invalid format`);
    if (!['EMPTY_REVIEW_REQUIRED', 'DATA_PRESENT_REVIEW_REQUIRED'].includes(source.outcome))
      failures.push(`${prefix}.outcome contains a stop-release or unknown result`);
    for (const fieldName of ['bytes', 'tableCount', 'nonEmptyTableCount', 'rowCount'])
      if (!Number.isInteger(source[fieldName]) || source[fieldName] < 0)
        failures.push(`${prefix}.${fieldName} must be a non-negative integer`);
    if (source.nonEmptyTableCount > source.tableCount)
      failures.push(`${prefix}.nonEmptyTableCount must not exceed tableCount`);
    const empty = source.nonEmptyTableCount === 0 && source.rowCount === 0;
    if (source.outcome === 'EMPTY_REVIEW_REQUIRED' && !empty)
      failures.push(`${prefix}.EMPTY_REVIEW_REQUIRED conflicts with non-empty counts`);
    if (source.outcome === 'DATA_PRESENT_REVIEW_REQUIRED' && empty)
      failures.push(`${prefix}.DATA_PRESENT_REVIEW_REQUIRED conflicts with zero counts`);
  }
  return failures;
}

const greenfieldDomains = [
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
];
const greenfieldCoverage = [
  'hosts',
  'databasePaths',
  'persistentVolumes',
  'objectStores',
  'providerLedgers',
];

function validateGreenfieldWaiver(value) {
  const artifact = 'greenfield-waiver.json';
  const failures = [];
  const domains = value.domainZeroCounts ?? {};
  const environments = new Set();
  const inspectionTimes = [];
  for (const [index, environment] of (Array.isArray(value.environments)
    ? value.environments
    : []
  ).entries()) {
    const prefix = `${artifact} environments[${index}]`;
    if (!environment || Array.isArray(environment) || typeof environment !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof environment.environment !== 'string' || !environment.environment.trim())
      failures.push(`${prefix}.environment must not be empty`);
    else if (environments.has(environment.environment))
      failures.push(`${artifact} environments must be unique`);
    else environments.add(environment.environment);
    if (!opaqueSubject.test(environment.ownerRef ?? ''))
      failures.push(`${prefix}.ownerRef must be an approved opaque subject`);
    if (environment.decision !== 'ZERO_PRODUCTION_DATA')
      failures.push(`${prefix}.decision must equal "ZERO_PRODUCTION_DATA"`);
  }
  if (!environments.has('production'))
    failures.push(`${artifact} environments must include production`);
  if (JSON.stringify(Object.keys(domains).sort()) !== JSON.stringify([...greenfieldDomains].sort()))
    failures.push(`${artifact} domainZeroCounts must cover the exact production business domains`);
  for (const domain of greenfieldDomains)
    if (domains[domain] !== 0) failures.push(`${artifact} domainZeroCounts.${domain} must equal 0`);
  for (const category of greenfieldCoverage) {
    const records = value.coverage?.[category];
    const scopeRefs = new Set();
    if (!Array.isArray(records) || records.length === 0) {
      failures.push(`${artifact} coverage.${category} must contain inspection evidence`);
      continue;
    }
    for (const [index, record] of records.entries()) {
      const prefix = `${artifact} coverage.${category}[${index}]`;
      if (!record || Array.isArray(record) || typeof record !== 'object') {
        failures.push(`${prefix} must be an object`);
        continue;
      }
      if (!opaqueReference.test(record.scopeRef ?? ''))
        failures.push(`${prefix}.scopeRef must be opaque`);
      else if (scopeRefs.has(record.scopeRef))
        failures.push(`${artifact} coverage.${category} scopeRefs must be unique`);
      else scopeRefs.add(record.scopeRef);
      if (!opaqueSubject.test(record.ownerRef ?? ''))
        failures.push(`${prefix}.ownerRef must be an approved opaque subject`);
      if (typeof record.inspectionMethod !== 'string' || !record.inspectionMethod.trim())
        failures.push(`${prefix}.inspectionMethod must not be empty`);
      if (!validDateTime(record.inspectedAt))
        failures.push(`${prefix}.inspectedAt must be a non-future ISO date-time`);
      else inspectionTimes.push(Date.parse(record.inspectedAt));
      if (record.productionRecordCount !== 0)
        failures.push(`${prefix}.productionRecordCount must equal 0`);
    }
  }
  failures.push(
    ...validateApprovalSet(artifact, value.approvals, [
      'product owner',
      'business owner',
      'security reviewer',
      'migration owner',
    ]),
  );
  const approvalTimes = (Array.isArray(value.approvals) ? value.approvals : [])
    .map((approval) => Date.parse(approval?.approvedAt))
    .filter(Number.isFinite);
  const reviewedAt = Date.parse(value.reviewedAt);
  if (
    Number.isFinite(reviewedAt) &&
    [...inspectionTimes, ...approvalTimes].some((timestamp) => timestamp > reviewedAt)
  )
    failures.push(`${artifact} reviewedAt must follow inspections and approvals`);
  return failures;
}

function validateFinancialApprovals(value) {
  const artifact = 'financial-policy-approvals.json';
  const failures = [];
  const approvals = Array.isArray(value.approvals) ? value.approvals : [];
  const requiredDecisions = [
    'paymentResponsibilityResolved',
    'merchantAccountMappingResolved',
    'legacyBalanceResolved',
    'distributionConflictC001Resolved',
    'computeAllocationResolved',
    'historicalSnapshotPreserved',
  ];
  if (
    JSON.stringify(Object.keys(value.decisions ?? {}).sort()) !==
    JSON.stringify([...requiredDecisions].sort())
  )
    failures.push(`${artifact} decisions must contain the exact frozen decision fields`);
  for (const decision of requiredDecisions)
    if (value.decisions?.[decision] !== true)
      failures.push(`${artifact} decisions.${decision} must equal true`);
  failures.push(...validateApprovalSet(artifact, approvals, ['business owner', 'finance owner']));
  const review = value.independentReview;
  if (review?.decision !== 'APPROVED')
    failures.push(`${artifact} independentReview.decision must equal "APPROVED"`);
  if (!opaqueSubject.test(review?.subjectId ?? ''))
    failures.push(`${artifact} independentReview.subjectId must be an approved opaque subject`);
  if (!validDateTime(review?.reviewedAt))
    failures.push(`${artifact} independentReview.reviewedAt must be a non-future ISO date-time`);
  if (!opaqueReference.test(review?.receiptId ?? ''))
    failures.push(`${artifact} independentReview.receiptId must be an opaque reference`);
  if (!opaqueReference.test(value.decisionVersion ?? ''))
    failures.push(`${artifact} decisionVersion must be opaque`);
  if (approvals.some((approval) => approval?.subjectId === review?.subjectId))
    failures.push(`${artifact} independent reviewer must differ from approvers`);
  const approvalTimes = approvals
    .map((approval) => Date.parse(approval?.approvedAt))
    .filter(Number.isFinite);
  if (
    approvalTimes.length &&
    validDateTime(review?.reviewedAt) &&
    Date.parse(review.reviewedAt) < Math.max(...approvalTimes)
  )
    failures.push(`${artifact} independent review must occur after both approvals`);
  if (
    approvalTimes.length &&
    validDateTime(value.effectiveAt) &&
    Date.parse(value.effectiveAt) < Math.max(...approvalTimes)
  )
    failures.push(`${artifact} effectiveAt must not precede approval`);
  if (
    validDateTime(review?.reviewedAt) &&
    validDateTime(value.effectiveAt) &&
    Date.parse(value.effectiveAt) < Date.parse(review.reviewedAt)
  )
    failures.push(`${artifact} effectiveAt must not precede independent review`);
  return failures;
}

function validateLegalRelease(value) {
  const artifact = 'legal-document-release.json';
  const failures = [];
  const documentIds = new Set();
  const approvals = Array.isArray(value.approvals) ? value.approvals : [];
  const legalApprovalReceipt = approvals.find(
    (approval) => approval?.role === 'legal compliance reviewer',
  )?.receiptId;
  const approvalTimes = approvals
    .map((approval) => Date.parse(approval?.approvedAt))
    .filter(Number.isFinite);
  for (const [index, document] of (Array.isArray(value.documents)
    ? value.documents
    : []
  ).entries()) {
    const prefix = `${artifact} documents[${index}]`;
    if (!document || Array.isArray(document) || typeof document !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    for (const fieldName of ['documentId', 'version', 'ownerRef', 'approvalReceipt'])
      if (typeof document[fieldName] !== 'string' || !document[fieldName].trim())
        failures.push(`${prefix}.${fieldName} must not be empty`);
    if (!opaqueSubject.test(document.ownerRef ?? ''))
      failures.push(`${prefix}.ownerRef must be an approved opaque subject`);
    if (!opaqueReference.test(document.approvalReceipt ?? ''))
      failures.push(`${prefix}.approvalReceipt must be an opaque reference`);
    if (legalApprovalReceipt && document.approvalReceipt !== legalApprovalReceipt)
      failures.push(`${prefix}.approvalReceipt must match the legal compliance approval`);
    if (typeof document.documentId === 'string') {
      if (documentIds.has(document.documentId))
        failures.push(`${artifact} documentIds must be unique`);
      documentIds.add(document.documentId);
    }
    if (!validSha256(document.sha256)) failures.push(`${prefix}.sha256 has invalid format`);
    try {
      const url = new URL(document.publishedUrl);
      const hostname = url.hostname.toLowerCase();
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        ['localhost', '0.0.0.0', '::', '::1'].includes(hostname) ||
        /^127(?:\.[0-9]{1,3}){3}$/u.test(hostname)
      )
        throw new Error('not a public credential-free HTTPS URL');
    } catch {
      failures.push(`${prefix}.publishedUrl must be a public credential-free HTTPS URL`);
    }
    if (!validDateTime(document.effectiveAt))
      failures.push(`${prefix}.effectiveAt must be a non-future ISO date-time`);
    else if (approvalTimes.length && Date.parse(document.effectiveAt) < Math.max(...approvalTimes))
      failures.push(`${prefix}.effectiveAt must not precede approval`);
  }
  const allowedSurfaces = ['lequbao-web', 'lequ-life-miniapp', 'merchant-miniapp'];
  const requiredSurfaces = new Set(allowedSurfaces);
  const observedSurfaces = new Set();
  const publicationReceipts = new Set();
  for (const [index, surface] of (Array.isArray(value.surfaceMatrix)
    ? value.surfaceMatrix
    : []
  ).entries()) {
    const prefix = `${artifact} surfaceMatrix[${index}]`;
    if (!surface || Array.isArray(surface) || typeof surface !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!allowedSurfaces.includes(surface.surface))
      failures.push(`${prefix}.surface is not approved`);
    else if (observedSurfaces.has(surface.surface))
      failures.push(`${artifact} surfaces must be unique`);
    else {
      observedSurfaces.add(surface.surface);
      requiredSurfaces.delete(surface.surface);
    }
    if (!Array.isArray(surface.documentIds) || surface.documentIds.length === 0)
      failures.push(`${prefix}.documentIds must contain evidence`);
    else {
      if (new Set(surface.documentIds).size !== surface.documentIds.length)
        failures.push(`${prefix}.documentIds must be unique`);
      for (const documentId of surface.documentIds)
        if (!documentIds.has(documentId))
          failures.push(`${prefix}.documentIds contains an undeclared document`);
    }
    if (!validSha256(surface.publicationReceiptHash))
      failures.push(`${prefix}.publicationReceiptHash has invalid format`);
    else if (publicationReceipts.has(surface.publicationReceiptHash))
      failures.push(`${artifact} surface publication receipts must be unique`);
    else publicationReceipts.add(surface.publicationReceiptHash);
    if (!validDateTime(surface.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
    else {
      const referencedEffectiveTimes = (surface.documentIds ?? [])
        .map((documentId) =>
          Date.parse(
            value.documents?.find((document) => document?.documentId === documentId)?.effectiveAt,
          ),
        )
        .filter(Number.isFinite);
      if (
        referencedEffectiveTimes.length &&
        Date.parse(surface.verifiedAt) < Math.max(...referencedEffectiveTimes)
      )
        failures.push(`${prefix}.verifiedAt must not precede document effectiveness`);
    }
    if (surface.publicationVerified !== true)
      failures.push(`${prefix}.publicationVerified must equal true`);
    if (surface.accountPrivacyInstructionsVerified !== true)
      failures.push(`${prefix}.accountPrivacyInstructionsVerified must equal true`);
    if (!Array.isArray(surface.failures) || surface.failures.length !== 0)
      failures.push(`${prefix}.failures must be empty`);
  }
  for (const surface of requiredSurfaces)
    failures.push(`${artifact} surfaceMatrix must include ${surface}`);
  failures.push(
    ...validateApprovalSet(artifact, approvals, ['product owner', 'legal compliance reviewer']),
  );
  return failures;
}

function validateBackupManifest(value) {
  const artifact = 'backup.manifest.json';
  const failures = [];
  if (!Number.isSafeInteger(value.encryptedSizeBytes))
    failures.push(`${artifact} encryptedSizeBytes must be an integer`);
  const snapshot = value.financialSnapshot;
  const snapshotKeys =
    snapshot && !Array.isArray(snapshot) && typeof snapshot === 'object'
      ? Object.keys(snapshot).sort()
      : [];
  if (JSON.stringify(snapshotKeys) !== JSON.stringify(['schemaVersion', 'tenantCount', 'tenants']))
    failures.push(`${artifact} financialSnapshot fields are invalid`);
  if (snapshot?.schemaVersion !== 1)
    failures.push(`${artifact} financialSnapshot.schemaVersion must equal 1`);
  if (!Number.isSafeInteger(snapshot?.tenantCount) || snapshot.tenantCount < 1)
    failures.push(`${artifact} financialSnapshot.tenantCount must be a positive integer`);
  const tenants = snapshot?.tenants;
  const tenantEntries =
    tenants && !Array.isArray(tenants) && typeof tenants === 'object'
      ? Object.entries(tenants)
      : [];
  if (tenantEntries.length !== snapshot?.tenantCount)
    failures.push(`${artifact} financialSnapshot tenants must equal tenantCount`);
  const allowedMetrics = new Set([
    'orders_count',
    'orders_paid_cents',
    'orders_payable_cents',
    'orders_refunded_cents',
    'reward_entry_count',
    'reward_entry_net_cents',
    'reward_grant_count',
    'reward_granted_cents',
    'reward_redeemed_cents',
    'reward_reversed_cents',
    'succeeded_refund_cents',
    'succeeded_refund_count',
    'verification_quantity',
    'verification_use_count',
    'verified_payment_cents',
    'verified_payment_count',
  ]);
  for (const [tenantId, metrics] of tenantEntries) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(tenantId))
      failures.push(`${artifact} financialSnapshot tenant ID has invalid format`);
    if (!metrics || Array.isArray(metrics) || typeof metrics !== 'object') {
      failures.push(`${artifact} financialSnapshot tenant metrics must be an object`);
      continue;
    }
    for (const [metric, amount] of Object.entries(metrics)) {
      if (!allowedMetrics.has(metric))
        failures.push(`${artifact} financialSnapshot contains undeclared metric ${metric}`);
      if (!Number.isSafeInteger(amount))
        failures.push(`${artifact} financialSnapshot metric ${metric} must be an integer`);
    }
  }
  if (
    validDateTime(value.backupStartedAt) &&
    validDateTime(value.backupCompletedAt) &&
    Date.parse(value.backupCompletedAt) < Date.parse(value.backupStartedAt)
  )
    failures.push(`${artifact} backupCompletedAt must not precede backupStartedAt`);
  return failures;
}

function validateRestoreReport(value) {
  const artifact = 'restore-report.json';
  const failures = [];
  if (value.error !== null) failures.push(`${artifact} error must equal null for PASS`);
  const fixtures = Array.isArray(value.databaseFixturesPassed) ? value.databaseFixturesPassed : [];
  if (
    !fixtures.every((fixture) => typeof fixture === 'string') ||
    JSON.stringify([...fixtures].sort()) !== JSON.stringify(requiredDatabaseFixtureFiles)
  )
    failures.push(
      `${artifact} databaseFixturesPassed must equal the exact ${requiredDatabaseFixtureFiles.length}-file fixture set`,
    );
  if (new Set(fixtures).size !== fixtures.length)
    failures.push(`${artifact} databaseFixturesPassed must not contain duplicates`);
  if (!Number.isSafeInteger(value.privacyReplayTasksEnqueued))
    failures.push(`${artifact} privacyReplayTasksEnqueued must be an integer`);
  const times = ['backupCompletedAt', 'failureTime', 'restoreStartedAt', 'restoreCompletedAt'].map(
    (fieldName) => Date.parse(value[fieldName]),
  );
  if (
    times.every(Number.isFinite) &&
    !(times[0] <= times[1] && times[1] <= times[2] && times[2] <= times[3])
  )
    failures.push(`${artifact} backup, failure and restore timestamps are out of order`);
  if (times.every(Number.isFinite)) {
    const calculatedRpoSeconds = (times[1] - times[0]) / 1000;
    const calculatedRtoSeconds = (times[3] - times[1]) / 1000;
    if (
      Number.isFinite(value.rpoSeconds) &&
      Math.abs(value.rpoSeconds - calculatedRpoSeconds) > 0.01
    )
      failures.push(`${artifact} rpoSeconds does not reconcile with the evidence timeline`);
    if (
      Number.isFinite(value.rtoSeconds) &&
      Math.abs(value.rtoSeconds - calculatedRtoSeconds) > 0.01
    )
      failures.push(`${artifact} rtoSeconds does not reconcile with the evidence timeline`);
  }
  return failures;
}

function validatePhysicalWalEvidence(value) {
  const artifact = 'physical-wal-evidence.json';
  const failures = [];
  if (value.sourceFaultDomainRefHash === value.recoveryFaultDomainRefHash)
    failures.push(`${artifact} source and recovery fault domains must differ`);
  const recoveryPoint = Date.parse(value.recoveryPoint);
  const replayedThrough = Date.parse(value.replayedThrough);
  if (
    Number.isFinite(recoveryPoint) &&
    Number.isFinite(replayedThrough) &&
    replayedThrough < recoveryPoint
  )
    failures.push(`${artifact} replayedThrough must reach or pass recoveryPoint`);
  const requiredEvents = [
    'BACKUP_SELECTED',
    'RESTORE_STARTED',
    'WAL_REPLAY_COMPLETED',
    'RECOVERY_VALIDATED',
  ];
  const timeline = Array.isArray(value.timeline) ? value.timeline : [];
  const observedEvents = [];
  const eventTimes = [];
  const evidenceRefs = new Set();
  for (const [index, event] of timeline.entries()) {
    const prefix = `${artifact} timeline[${index}]`;
    if (!event || Array.isArray(event) || typeof event !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    observedEvents.push(event.event);
    if (!validDateTime(event.at)) failures.push(`${prefix}.at must be a non-future ISO date-time`);
    eventTimes.push(Date.parse(event.at));
    if (!validSha256(event.evidenceRefHash))
      failures.push(`${prefix}.evidenceRefHash has invalid format`);
    else if (evidenceRefs.has(event.evidenceRefHash))
      failures.push(`${artifact} timeline evidence references must be unique`);
    else evidenceRefs.add(event.evidenceRefHash);
  }
  if (JSON.stringify(observedEvents) !== JSON.stringify(requiredEvents))
    failures.push(`${artifact} timeline must contain the exact ordered recovery events`);
  if (
    eventTimes.length === requiredEvents.length &&
    eventTimes.every(Number.isFinite) &&
    eventTimes.some((time, index) => index > 0 && time < eventTimes[index - 1])
  )
    failures.push(`${artifact} timeline timestamps must be non-decreasing`);
  if (
    eventTimes.length === requiredEvents.length &&
    Number.isFinite(replayedThrough) &&
    Number.isFinite(eventTimes[2]) &&
    eventTimes[2] < replayedThrough
  )
    failures.push(`${artifact} WAL completion event must not precede replayedThrough`);
  return failures;
}

function validateExternalDeletionSamples(value) {
  const artifact = 'external-deletion-samples.json';
  const failures = [];
  const targetNames = ['object-store', 'search', 'vector', 'cache'];
  const requiredTargets = new Set(targetNames);
  const targetRecords = new Map();
  const receiptRefs = new Set();
  for (const [index, target] of (Array.isArray(value.targets) ? value.targets : []).entries()) {
    const prefix = `${artifact} targets[${index}]`;
    if (!target || Array.isArray(target) || typeof target !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!targetNames.includes(target.target)) failures.push(`${prefix}.target is not supported`);
    else if (targetRecords.has(target.target))
      failures.push(`${artifact} target names must be unique`);
    else {
      requiredTargets.delete(target.target);
      targetRecords.set(target.target, target);
    }
    if (!opaqueReference.test(target.receiptRef ?? ''))
      failures.push(`${prefix}.receiptRef must be an opaque reference`);
    else if (receiptRefs.has(target.receiptRef))
      failures.push(`${artifact} target receipt references must be unique`);
    else receiptRefs.add(target.receiptRef);
    if (target.deleted !== true) failures.push(`${prefix}.deleted must equal true`);
    if (!validDateTime(target.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
  }
  for (const target of requiredTargets) failures.push(`${artifact} targets must include ${target}`);
  const sampledTargets = new Set();
  const sampleRefs = new Set();
  for (const [index, sample] of (Array.isArray(value.samples) ? value.samples : []).entries()) {
    const prefix = `${artifact} samples[${index}]`;
    if (!sample || Array.isArray(sample) || typeof sample !== 'object') {
      failures.push(`${artifact} samples[${index}] must be an object`);
      continue;
    }
    if (!targetNames.includes(sample.target)) failures.push(`${prefix}.target is not supported`);
    else sampledTargets.add(sample.target);
    if (!validSha256(sample.sampleRefHash))
      failures.push(`${prefix}.sampleRefHash has invalid format`);
    else if (sampleRefs.has(sample.sampleRefHash))
      failures.push(`${artifact} sample references must be unique`);
    else sampleRefs.add(sample.sampleRefHash);
    if (!opaqueReference.test(sample.receiptRef ?? ''))
      failures.push(`${prefix}.receiptRef must be an opaque reference`);
    else if (targetRecords.get(sample.target)?.receiptRef !== sample.receiptRef)
      failures.push(`${prefix}.receiptRef does not match its target deletion receipt`);
    if (sample.remainingMatches !== 0) failures.push(`${prefix}.remainingMatches must equal 0`);
    if (!validDateTime(sample.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
    const deletionTime = Date.parse(targetRecords.get(sample.target)?.verifiedAt);
    const sampleTime = Date.parse(sample.verifiedAt);
    if (Number.isFinite(deletionTime) && Number.isFinite(sampleTime) && sampleTime < deletionTime)
      failures.push(`${prefix}.verifiedAt must not precede target deletion verification`);
  }
  for (const target of targetNames)
    if (!sampledTargets.has(target)) failures.push(`${artifact} samples must include ${target}`);
  return failures;
}

const performanceScenarioLimits = Object.freeze({
  'core-read': 500,
  'customer-message-write': 500,
  'core-write': 800,
});

function validatePerformanceSnapshot(artifact, pathName, snapshot, failures) {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') {
    failures.push(`${artifact} ${pathName} must be an object`);
    return;
  }
  if (typeof snapshot.databaseName !== 'string' || !snapshot.databaseName.trim())
    failures.push(`${artifact} ${pathName}.databaseName must not be empty`);
  for (const fieldName of [
    'sizeBytes',
    'connections',
    'committedTransactions',
    'rolledBackTransactions',
    'blocksRead',
    'blocksHit',
    'tempFiles',
    'tempBytes',
    'deadlocks',
    'estimatedLiveRows',
    'tableCount',
  ])
    if (!Number.isSafeInteger(snapshot[fieldName]) || snapshot[fieldName] < 0)
      failures.push(`${artifact} ${pathName}.${fieldName} must be a non-negative integer`);
  if (snapshot.tableCount < 164)
    failures.push(`${artifact} ${pathName}.tableCount must include the 164-table candidate schema`);
  const backlog = snapshot.messageBacklog;
  for (const fieldName of ['activeCount', 'deadCount'])
    if (!Number.isSafeInteger(backlog?.[fieldName]) || backlog[fieldName] < 0)
      failures.push(
        `${artifact} ${pathName}.messageBacklog.${fieldName} must be a non-negative integer`,
      );
  if (!Number.isFinite(backlog?.oldestActiveSeconds) || backlog.oldestActiveSeconds < 0)
    failures.push(
      `${artifact} ${pathName}.messageBacklog.oldestActiveSeconds must be non-negative`,
    );
}

function validateCandidateImageOwner(artifact, images) {
  const owners = ['api', 'worker', 'web']
    .map((target) => /^ghcr\.io\/([^/]+)\//u.exec(images?.[target] ?? '')?.[1])
    .filter(Boolean);
  return owners.length === 3 && new Set(owners).size !== 1
    ? [`${artifact} candidate images must share one GHCR owner`]
    : [];
}

function validatePerformanceReport(value) {
  const artifact = 'performance-report.json';
  const failures = validateCandidateImageOwner(artifact, value.images);
  if (!Number.isSafeInteger(value.concurrency))
    failures.push(`${artifact} concurrency must be an integer`);
  if (!Number.isSafeInteger(value.requestsPerScenario))
    failures.push(`${artifact} requestsPerScenario must be an integer`);
  if (value.failure !== null) failures.push(`${artifact} failure must equal null for PASS`);
  const scenarios = Array.isArray(value.scenarios) ? value.scenarios : [];
  const names = new Set();
  for (const [index, scenario] of scenarios.entries()) {
    const prefix = `${artifact} scenarios[${index}]`;
    if (!scenario || Array.isArray(scenario) || typeof scenario !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    names.add(scenario.name);
    const limit = performanceScenarioLimits[scenario.name];
    if (limit === undefined) failures.push(`${prefix}.name is not an approved scenario`);
    if (scenario.thresholdP95Ms !== limit)
      failures.push(`${prefix}.thresholdP95Ms does not match the frozen threshold`);
    if (!Number.isSafeInteger(scenario.requests) || scenario.requests < 1)
      failures.push(`${prefix}.requests must be a positive integer`);
    if (scenario.requests !== value.requestsPerScenario)
      failures.push(`${prefix}.requests does not match requestsPerScenario`);
    for (const fieldName of ['successes', 'errors'])
      if (!Number.isSafeInteger(scenario[fieldName]) || scenario[fieldName] < 0)
        failures.push(`${prefix}.${fieldName} must be a non-negative integer`);
    if (scenario.successes + scenario.errors !== scenario.requests)
      failures.push(`${prefix} successes and errors do not reconcile with requests`);
    if (!Number.isFinite(scenario.p95Ms) || scenario.p95Ms < 0 || scenario.p95Ms > limit)
      failures.push(`${prefix}.p95Ms exceeds the frozen threshold`);
    if (!Number.isFinite(scenario.errorRate) || scenario.errorRate < 0 || scenario.errorRate > 0.01)
      failures.push(`${prefix}.errorRate exceeds one percent`);
    const calculatedErrorRate = scenario.requests > 0 ? scenario.errors / scenario.requests : 1;
    if (
      Number.isFinite(scenario.errorRate) &&
      Number.isFinite(calculatedErrorRate) &&
      Math.abs(scenario.errorRate - calculatedErrorRate) > 1e-12
    )
      failures.push(`${prefix}.errorRate does not reconcile with errors and requests`);
    for (const fieldName of ['p50Ms', 'p99Ms'])
      if (!Number.isFinite(scenario[fieldName]) || scenario[fieldName] < 0)
        failures.push(`${prefix}.${fieldName} must be non-negative`);
    if (
      Number.isFinite(scenario.p50Ms) &&
      Number.isFinite(scenario.p95Ms) &&
      Number.isFinite(scenario.p99Ms) &&
      (scenario.p50Ms > scenario.p95Ms || scenario.p95Ms > scenario.p99Ms)
    )
      failures.push(`${prefix} percentiles must be ordered p50 <= p95 <= p99`);
  }
  for (const name of Object.keys(performanceScenarioLimits))
    if (!names.has(name)) failures.push(`${artifact} scenarios must include ${name}`);
  if (names.size !== scenarios.length) failures.push(`${artifact} scenario names must be unique`);
  const message = scenarios.find((scenario) => scenario?.name === 'customer-message-write');
  for (const fieldName of ['expectedMessageIds', 'persistedMessageIds'])
    if (!Number.isSafeInteger(value.persistence?.[fieldName]) || value.persistence[fieldName] < 0)
      failures.push(`${artifact} persistence ${fieldName} must be a non-negative integer`);
  if (value.persistence?.expectedMessageIds !== message?.successes)
    failures.push(`${artifact} persistence expected count must equal acknowledged messages`);
  if (value.persistence?.persistedMessageIds !== value.persistence?.expectedMessageIds)
    failures.push(`${artifact} every acknowledged message must persist`);
  if (
    !Array.isArray(value.persistence?.missingMessageIds) ||
    value.persistence.missingMessageIds.length
  )
    failures.push(`${artifact} persistence missingMessageIds must be empty`);
  if (
    !Array.isArray(value.persistence?.duplicateAcknowledgedMessageIds) ||
    value.persistence.duplicateAcknowledgedMessageIds.length
  )
    failures.push(`${artifact} persistence duplicateAcknowledgedMessageIds must be empty`);
  validatePerformanceSnapshot(artifact, 'database.before', value.database?.before, failures);
  validatePerformanceSnapshot(artifact, 'database.after', value.database?.after, failures);
  const beforeDead = value.database?.before?.messageBacklog?.deadCount;
  const afterDead = value.database?.after?.messageBacklog?.deadCount;
  if (Number.isFinite(beforeDead) && Number.isFinite(afterDead) && afterDead > beforeDead)
    failures.push(`${artifact} dead Outbox count must not increase`);
  if (
    validDateTime(value.startedAt) &&
    validDateTime(value.completedAt) &&
    Date.parse(value.completedAt) < Date.parse(value.startedAt)
  )
    failures.push(`${artifact} completedAt must not precede startedAt`);
  return failures;
}

function validateRefundUnknownRecovery(value) {
  const artifact = 'refund-unknown-recovery.json';
  const failures = [];
  if (value.providerQuery?.performed !== true)
    failures.push(`${artifact} providerQuery.performed must equal true`);
  if (value.providerQuery?.sameIdempotencyKey !== true)
    failures.push(`${artifact} providerQuery.sameIdempotencyKey must equal true`);
  if (!['REFUND_SUCCEEDED', 'REFUND_FAILED'].includes(value.finalState))
    failures.push(`${artifact} finalState must be a terminal provider-confirmed refund state`);
  const timeline = [value.observedUnknownAt, value.providerQuery?.queriedAt, value.completedAt].map(
    Date.parse,
  );
  if (
    timeline.every(Number.isFinite) &&
    !(timeline[0] <= timeline[1] && timeline[1] <= timeline[2])
  )
    failures.push(`${artifact} UNKNOWN, provider query and completion timestamps are out of order`);
  return failures;
}

function validateProviderCallback(value) {
  const artifact = 'provider-callback-redacted.json';
  const failures = [];
  const receivedAt = Date.parse(value.receivedAt);
  const appliedAt = Date.parse(value.appliedAt);
  if (Number.isFinite(receivedAt) && Number.isFinite(appliedAt) && appliedAt < receivedAt)
    failures.push(`${artifact} appliedAt must not precede receivedAt`);
  return failures;
}

function validateReviewPublish(value) {
  const artifact = 'review-publish.json';
  const failures = [];
  if (value.reviewVersion !== value.publishedVersion)
    failures.push(`${artifact} publishedVersion must equal the approved reviewVersion`);
  const percentage = value.pilotScope?.percentage;
  if (!Number.isSafeInteger(percentage) || percentage <= 0 || percentage > 100)
    failures.push(`${artifact} pilotScope.percentage must be within 1..100`);
  if (!Array.isArray(value.pilotScope?.scopeRefs) || value.pilotScope.scopeRefs.length === 0)
    failures.push(`${artifact} pilotScope.scopeRefs must contain evidence`);
  else {
    const scopeRefs = new Set();
    for (const [index, scopeRef] of value.pilotScope.scopeRefs.entries()) {
      if (!opaqueReference.test(scopeRef ?? ''))
        failures.push(`${artifact} pilotScope.scopeRefs[${index}] must be opaque`);
      else if (scopeRefs.has(scopeRef))
        failures.push(`${artifact} pilotScope.scopeRefs must be unique`);
      else scopeRefs.add(scopeRef);
    }
  }
  const reviewedAt = Date.parse(value.reviewedAt);
  const publishedAt = Date.parse(value.publishedAt);
  if (Number.isFinite(reviewedAt) && Number.isFinite(publishedAt) && publishedAt < reviewedAt)
    failures.push(`${artifact} publishedAt must not precede reviewedAt`);
  return failures;
}

function validateWechatBuild(artifact, value) {
  const failures = [];
  if (!opaqueReference.test(value.version ?? ''))
    failures.push(`${artifact} version must be opaque`);
  if (!/^[0-9]+(?:\.[0-9]+){1,3}$/u.test(value.officialToolVersion ?? ''))
    failures.push(`${artifact} officialToolVersion must be a dotted numeric version`);
  return failures;
}

function validateWechatCallback(value) {
  const artifact = 'callback-redacted.json';
  const failures = [];
  if (!opaqueReference.test(value.publishedVersion ?? ''))
    failures.push(`${artifact} publishedVersion must be opaque`);
  return failures;
}

function validateWechatRollback(value) {
  const artifact = 'rollback.json';
  const failures = [];
  if (value.toVersion === value.fromVersion)
    failures.push(`${artifact} must create a different safe release version`);
  return failures;
}

function validateDeviceMatrix(value) {
  const artifact = 'device-matrix.json';
  const failures = [];
  const devices = Array.isArray(value.devices) ? value.devices : [];
  const platforms = new Set();
  const devicePlatforms = new Map();
  for (const [index, device] of devices.entries()) {
    const prefix = `${artifact} devices[${index}]`;
    if (!device || Array.isArray(device) || typeof device !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!['iOS', 'Android'].includes(device.platform))
      failures.push(`${prefix}.platform must be iOS or Android`);
    else platforms.add(device.platform);
    if (!validSha256(device.deviceRefHash))
      failures.push(`${prefix}.deviceRefHash has invalid format`);
    else if (devicePlatforms.has(device.deviceRefHash))
      failures.push(`${artifact} device references must be unique`);
    else devicePlatforms.set(device.deviceRefHash, device.platform);
    if (typeof device.officialClientVersion !== 'string' || !device.officialClientVersion.trim())
      failures.push(`${prefix}.officialClientVersion must not be empty`);
    if (device.result !== 'PASS') failures.push(`${prefix}.result must equal "PASS"`);
  }
  for (const platform of ['iOS', 'Android'])
    if (!platforms.has(platform)) failures.push(`${artifact} devices must include ${platform}`);
  const scenarios = Array.isArray(value.scenarios) ? value.scenarios : [];
  const packages = new Set();
  for (const [index, scenario] of scenarios.entries()) {
    const prefix = `${artifact} scenarios[${index}]`;
    if (!scenario || Array.isArray(scenario) || typeof scenario !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!['consumer', 'merchant-template'].includes(scenario.package))
      failures.push(`${prefix}.package is not approved`);
    else if (packages.has(scenario.package))
      failures.push(`${artifact} scenario packages must be unique`);
    else packages.add(scenario.package);
    if (typeof scenario.version !== 'string' || !scenario.version.trim())
      failures.push(`${prefix}.version must not be empty`);
    if (scenario.result !== 'PASS') failures.push(`${prefix}.result must equal "PASS"`);
    if (!Array.isArray(scenario.deviceRefs) || scenario.deviceRefs.length < 2) {
      failures.push(`${prefix}.deviceRefs must cover both platforms`);
      continue;
    }
    const uniqueRefs = new Set(scenario.deviceRefs);
    if (uniqueRefs.size !== scenario.deviceRefs.length)
      failures.push(`${prefix}.deviceRefs must be unique`);
    const scenarioPlatforms = new Set();
    for (const reference of uniqueRefs) {
      if (!devicePlatforms.has(reference))
        failures.push(`${prefix}.deviceRefs contains an unknown device reference`);
      else scenarioPlatforms.add(devicePlatforms.get(reference));
    }
    for (const platform of ['iOS', 'Android'])
      if (!scenarioPlatforms.has(platform))
        failures.push(`${prefix}.deviceRefs must include ${platform}`);
  }
  for (const packageName of ['consumer', 'merchant-template'])
    if (!packages.has(packageName))
      failures.push(`${artifact} scenarios must include ${packageName}`);
  return failures;
}

function validateIdentitySessionEvidence(value) {
  const artifact = 'identity-session-redacted.json';
  const failures = [];
  if (value.revocation?.revokedSessionRejected !== true)
    failures.push(`${artifact} revocation.revokedSessionRejected must equal true`);
  if (
    !Number.isFinite(value.revocation?.latencySeconds) ||
    value.revocation.latencySeconds < 0 ||
    value.revocation.latencySeconds > 60
  )
    failures.push(`${artifact} revocation.latencySeconds must be within 0..60`);
  if (!validSha256(value.revocation?.sessionRefHash))
    failures.push(`${artifact} revocation.sessionRefHash has invalid format`);
  if (!validSha256(value.revocation?.revocationReceiptHash))
    failures.push(`${artifact} revocation.revocationReceiptHash has invalid format`);
  const revocationTimeline = ['revokedAt', 'rejectedAt'].map((fieldName) => {
    if (!validDateTime(value.revocation?.[fieldName]))
      failures.push(`${artifact} revocation.${fieldName} must be a non-future ISO date-time`);
    return Date.parse(value.revocation?.[fieldName]);
  });
  if (revocationTimeline.every(Number.isFinite) && revocationTimeline[1] < revocationTimeline[0])
    failures.push(`${artifact} revocation.rejectedAt must not precede revokedAt`);
  const calculatedRevocationSeconds = (revocationTimeline[1] - revocationTimeline[0]) / 1000;
  if (
    Number.isFinite(calculatedRevocationSeconds) &&
    Number.isFinite(value.revocation?.latencySeconds) &&
    Math.abs(calculatedRevocationSeconds - value.revocation.latencySeconds) > 0.01
  )
    failures.push(`${artifact} revocation.latencySeconds does not reconcile with timestamps`);
  if (value.mfa?.highRiskRequired !== true)
    failures.push(`${artifact} mfa.highRiskRequired must equal true`);
  if (value.mfa?.downgradeRejected !== true)
    failures.push(`${artifact} mfa.downgradeRejected must equal true`);
  if (!validSha256(value.mfa?.challengeRefHash))
    failures.push(`${artifact} mfa.challengeRefHash has invalid format`);
  const mfaTimeline = ['challengedAt', 'downgradeRejectedAt'].map((fieldName) => {
    if (!validDateTime(value.mfa?.[fieldName]))
      failures.push(`${artifact} mfa.${fieldName} must be a non-future ISO date-time`);
    return Date.parse(value.mfa?.[fieldName]);
  });
  if (mfaTimeline.every(Number.isFinite) && mfaTimeline[1] < mfaTimeline[0])
    failures.push(`${artifact} mfa.downgradeRejectedAt must not precede challengedAt`);
  const sessionRefs = new Set();
  for (const [index, session] of (Array.isArray(value.sessions) ? value.sessions : []).entries()) {
    const prefix = `${artifact} sessions[${index}]`;
    if (!session || Array.isArray(session) || typeof session !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!validSha256(session.sessionRefHash))
      failures.push(`${prefix}.sessionRefHash has invalid format`);
    else if (sessionRefs.has(session.sessionRefHash))
      failures.push(`${artifact} session references must be unique`);
    else sessionRefs.add(session.sessionRefHash);
    if (!validSha256(session.tenantRefHash))
      failures.push(`${prefix}.tenantRefHash has invalid format`);
    if (session.tenantScopeVerified !== true)
      failures.push(`${prefix}.tenantScopeVerified must equal true`);
    if (session.shortLived !== true) failures.push(`${prefix}.shortLived must equal true`);
    const sessionTimeline = ['issuedAt', 'expiresAt'].map((fieldName) => {
      const timestamp = parseCanonicalUtcTimestamp(session[fieldName]);
      if (timestamp === undefined)
        failures.push(`${prefix}.${fieldName} must be a canonical millisecond UTC timestamp`);
      else if (fieldName === 'issuedAt' && timestamp > Date.now() + 5 * 60_000)
        failures.push(`${prefix}.${fieldName} must be a non-future ISO date-time`);
      return timestamp;
    });
    const lifetimeSeconds = (sessionTimeline[1] - sessionTimeline[0]) / 1000;
    if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0 || lifetimeSeconds > 3600)
      failures.push(`${prefix} lifetime must be within 1..3600 seconds`);
  }
  if (
    validSha256(value.revocation?.sessionRefHash) &&
    !sessionRefs.has(value.revocation.sessionRefHash)
  )
    failures.push(`${artifact} revoked session must be present in sampled sessions`);
  return failures;
}

function validateSecretAccessAudit(value) {
  const artifact = 'secret-access-audit.json';
  const failures = [];
  if (!/^[A-Za-z][A-Za-z0-9._:-]{2,63}$/u.test(value.secretManager ?? ''))
    failures.push(`${artifact} secretManager must be an opaque provider reference`);
  const actionsBySecret = new Map();
  const auditRefs = new Set();
  const allowedSubjectsBySecret = new Map();
  const deniedSubjectsBySecret = new Map();
  for (const [index, event] of (Array.isArray(value.accessEvents)
    ? value.accessEvents
    : []
  ).entries()) {
    const prefix = `${artifact} accessEvents[${index}]`;
    if (!event || Array.isArray(event) || typeof event !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!validSha256(event.secretRefHash))
      failures.push(`${prefix}.secretRefHash has invalid format`);
    if (!opaqueSubject.test(event.subjectRef ?? ''))
      failures.push(`${prefix}.subjectRef must be an approved opaque subject`);
    if (!['READ', 'ROTATE', 'DENIED_READ'].includes(event.action))
      failures.push(`${prefix}.action is not approved`);
    else if (validSha256(event.secretRefHash)) {
      const actions = actionsBySecret.get(event.secretRefHash) ?? new Set();
      if (actions.has(event.action))
        failures.push(`${artifact} secret actions must be unique per secret`);
      else actions.add(event.action);
      actionsBySecret.set(event.secretRefHash, actions);
      const subjects =
        event.action === 'DENIED_READ' ? deniedSubjectsBySecret : allowedSubjectsBySecret;
      const subjectSet = subjects.get(event.secretRefHash) ?? new Set();
      subjectSet.add(event.subjectRef);
      subjects.set(event.secretRefHash, subjectSet);
    }
    const expectedAllowed = event.action !== 'DENIED_READ';
    if (event.allowed !== expectedAllowed)
      failures.push(`${prefix}.allowed does not match the audited action`);
    if (!validSha256(event.auditEventRefHash))
      failures.push(`${prefix}.auditEventRefHash has invalid format`);
    else if (auditRefs.has(event.auditEventRefHash))
      failures.push(`${artifact} audit event references must be unique`);
    else auditRefs.add(event.auditEventRefHash);
    if (!validDateTime(event.occurredAt))
      failures.push(`${prefix}.occurredAt must be a non-future ISO date-time`);
  }
  for (const [secretRefHash, actions] of actionsBySecret) {
    for (const action of ['READ', 'ROTATE', 'DENIED_READ'])
      if (!actions.has(action))
        failures.push(`${artifact} secret ${secretRefHash} must include ${action}`);
    const authorizedSubjects = allowedSubjectsBySecret.get(secretRefHash) ?? new Set();
    const deniedSubjects = deniedSubjectsBySecret.get(secretRefHash) ?? new Set();
    if ([...authorizedSubjects].some((subject) => deniedSubjects.has(subject)))
      failures.push(`${artifact} denied and authorized secret subjects must differ`);
  }
  return failures;
}

function validateObjectRetention(value) {
  const artifact = 'object-retention.json';
  const failures = [];
  if (value.policy?.encryptionRequired !== true)
    failures.push(`${artifact} policy.encryptionRequired must equal true`);
  if (value.policy?.deletionEnforced !== true)
    failures.push(`${artifact} policy.deletionEnforced must equal true`);
  if (!validSha256(value.policy?.policyRefHash))
    failures.push(`${artifact} policy.policyRefHash has invalid format`);
  if (!validDateTime(value.policy?.effectiveAt))
    failures.push(`${artifact} policy.effectiveAt must be a non-future ISO date-time`);
  if (
    !Number.isSafeInteger(value.policy?.retentionDays) ||
    value.policy.retentionDays < 1 ||
    value.policy.retentionDays > 3650
  )
    failures.push(`${artifact} policy.retentionDays must be an integer within 1..3650`);
  if (!['provider-managed', 'AES-256-GCM'].includes(value.policy?.encryptionMode))
    failures.push(`${artifact} policy.encryptionMode is not approved`);
  const objectRefs = new Set();
  for (const [index, object] of (Array.isArray(value.objectsSampled)
    ? value.objectsSampled
    : []
  ).entries()) {
    const prefix = `${artifact} objectsSampled[${index}]`;
    if (!object || Array.isArray(object) || typeof object !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!validSha256(object.objectRefHash))
      failures.push(`${prefix}.objectRefHash has invalid format`);
    else if (objectRefs.has(object.objectRefHash))
      failures.push(`${artifact} object references must be unique`);
    else objectRefs.add(object.objectRefHash);
    if (object.policyRefHash !== value.policy?.policyRefHash)
      failures.push(`${prefix}.policyRefHash does not match policy`);
    if (!validSha256(object.encryptionKeyRefHash))
      failures.push(`${prefix}.encryptionKeyRefHash has invalid format`);
    if (!validSha256(object.deletionAuthorizationRefHash))
      failures.push(`${prefix}.deletionAuthorizationRefHash has invalid format`);
    if (object.encrypted !== true) failures.push(`${prefix}.encrypted must equal true`);
    if (object.retentionApplied !== true)
      failures.push(`${prefix}.retentionApplied must equal true`);
    if (object.deletionVerified !== true)
      failures.push(`${prefix}.deletionVerified must equal true`);
    const fields = [
      'createdAt',
      'retentionUntil',
      'deletionRequestedAt',
      'deletedAt',
      'verifiedAt',
    ];
    const timeline = fields.map((fieldName) => {
      const timestamp = parseCanonicalUtcTimestamp(object[fieldName]);
      if (timestamp === undefined)
        failures.push(`${prefix}.${fieldName} must be a canonical millisecond UTC timestamp`);
      else if (fieldName !== 'retentionUntil' && timestamp > Date.now() + 5 * 60_000)
        failures.push(`${prefix}.${fieldName} must be a non-future ISO date-time`);
      return timestamp;
    });
    const policyEffectiveAt = Date.parse(value.policy?.effectiveAt);
    if (
      [policyEffectiveAt, timeline[0], timeline[2], timeline[3], timeline[4]].every(
        Number.isFinite,
      ) &&
      !(
        policyEffectiveAt <= timeline[0] &&
        timeline[0] <= timeline[2] &&
        timeline[2] <= timeline[3] &&
        timeline[3] <= timeline[4]
      )
    )
      failures.push(`${prefix} policy, creation and deletion timestamps are out of order`);
    const expectedRetentionUntil =
      timeline[0] + Number(value.policy?.retentionDays) * 24 * 60 * 60 * 1000;
    if (
      Number.isFinite(timeline[0]) &&
      Number.isFinite(timeline[1]) &&
      Number.isSafeInteger(value.policy?.retentionDays) &&
      Math.abs(timeline[1] - expectedRetentionUntil) > 1000
    )
      failures.push(`${prefix}.retentionUntil does not match policy.retentionDays`);
  }
  return failures;
}

function validatePrivacyExportDelete(value) {
  const artifact = 'privacy-export-delete.json';
  const failures = [];
  if (value.export?.encrypted !== true)
    failures.push(`${artifact} export.encrypted must equal true`);
  if (value.export?.verifiedSessionDelivery !== true)
    failures.push(`${artifact} export.verifiedSessionDelivery must equal true`);
  if (
    !Number.isFinite(value.export?.durationSeconds) ||
    value.export.durationSeconds < 0 ||
    value.export.durationSeconds > 900
  )
    failures.push(`${artifact} export.durationSeconds must be within 0..900`);
  for (const fieldName of ['deliveryRefHash', 'sessionRefHash'])
    if (!validSha256(value.export?.[fieldName]))
      failures.push(`${artifact} export.${fieldName} has invalid format`);
  const exportRequestedAt = Date.parse(value.export?.requestedAt);
  const exportCompletedAt = Date.parse(value.export?.completedAt);
  if (!validDateTime(value.export?.requestedAt))
    failures.push(`${artifact} export.requestedAt must be a non-future ISO date-time`);
  if (!validDateTime(value.export?.completedAt))
    failures.push(`${artifact} export.completedAt must be a non-future ISO date-time`);
  if (
    Number.isFinite(exportRequestedAt) &&
    Number.isFinite(exportCompletedAt) &&
    exportCompletedAt < exportRequestedAt
  )
    failures.push(`${artifact} export.completedAt must not precede requestedAt`);
  const calculatedExportSeconds = (exportCompletedAt - exportRequestedAt) / 1000;
  if (
    Number.isFinite(calculatedExportSeconds) &&
    Number.isFinite(value.export?.durationSeconds) &&
    Math.abs(calculatedExportSeconds - value.export.durationSeconds) > 0.01
  )
    failures.push(`${artifact} export.durationSeconds does not reconcile with timestamps`);
  if (value.deletion?.authorized !== true)
    failures.push(`${artifact} deletion.authorized must equal true`);
  if (value.deletion?.auditRecorded !== true)
    failures.push(`${artifact} deletion.auditRecorded must equal true`);
  for (const fieldName of ['authorizationRefHash', 'auditRefHash'])
    if (!validSha256(value.deletion?.[fieldName]))
      failures.push(`${artifact} deletion.${fieldName} has invalid format`);
  const deletionTimeline = ['requestedAt', 'authorizedAt', 'completedAt'].map((fieldName) => {
    if (!validDateTime(value.deletion?.[fieldName]))
      failures.push(`${artifact} deletion.${fieldName} must be a non-future ISO date-time`);
    return Date.parse(value.deletion?.[fieldName]);
  });
  if (
    deletionTimeline.every(Number.isFinite) &&
    !(deletionTimeline[0] <= deletionTimeline[1] && deletionTimeline[1] <= deletionTimeline[2])
  )
    failures.push(`${artifact} deletion timestamps are out of order`);
  const targetNames = ['database', 'object-store', 'search', 'vector', 'cache'];
  const requiredTargets = new Set(targetNames);
  const receiptHashes = new Set();
  for (const [index, target] of (Array.isArray(value.targets) ? value.targets : []).entries()) {
    const prefix = `${artifact} targets[${index}]`;
    if (!target || Array.isArray(target) || typeof target !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!targetNames.includes(target.target)) failures.push(`${prefix}.target is not supported`);
    else if (!requiredTargets.has(target.target))
      failures.push(`${artifact} target names must be unique`);
    else requiredTargets.delete(target.target);
    if (!validSha256(target.receiptHash)) failures.push(`${prefix}.receiptHash has invalid format`);
    else if (receiptHashes.has(target.receiptHash))
      failures.push(`${artifact} target receipt hashes must be unique`);
    else receiptHashes.add(target.receiptHash);
    if (target.deleted !== true) failures.push(`${prefix}.deleted must equal true`);
    if (!validDateTime(target.deletedAt))
      failures.push(`${prefix}.deletedAt must be a non-future ISO date-time`);
    if (!validDateTime(target.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
    const deletedAt = Date.parse(target.deletedAt);
    const verifiedAt = Date.parse(target.verifiedAt);
    if (
      [deletionTimeline[1], deletedAt, verifiedAt, deletionTimeline[2]].every(Number.isFinite) &&
      !(
        deletionTimeline[1] <= deletedAt &&
        deletedAt <= verifiedAt &&
        verifiedAt <= deletionTimeline[2]
      )
    )
      failures.push(`${prefix} deletion and verification timestamps are out of order`);
  }
  for (const target of requiredTargets) failures.push(`${artifact} targets must include ${target}`);
  return failures;
}

function validateRequiredAlertSet(artifact, alerts, failures) {
  const alertIds = new Set();
  const alertCodes = new Set();
  const byId = new Map();
  for (const [index, alert] of alerts.entries()) {
    const prefix = `${artifact} alerts[${index}]`;
    if (!alert || Array.isArray(alert) || typeof alert !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!opaqueReference.test(alert.alertId ?? ''))
      failures.push(`${prefix}.alertId must be an opaque reference`);
    else if (alertIds.has(alert.alertId)) failures.push(`${artifact} alert IDs must be unique`);
    else {
      alertIds.add(alert.alertId);
      byId.set(alert.alertId, alert);
    }
    const policy = requiredAlertPolicy[alert.code];
    if (!policy) failures.push(`${prefix}.code is not a required alert`);
    else if (alertCodes.has(alert.code)) failures.push(`${artifact} alert codes must be unique`);
    else {
      alertCodes.add(alert.code);
      if (alert.severity !== policy[0])
        failures.push(`${prefix}.severity does not match the required alert policy`);
    }
    if (!validDateTime(alert.triggeredAt))
      failures.push(`${prefix}.triggeredAt must be a non-future ISO date-time`);
  }
  for (const code of requiredAlertCodes)
    if (!alertCodes.has(code)) failures.push(`${artifact} alerts must include ${code}`);
  return byId;
}

function validateAlertDelivery(value) {
  const artifact = 'alert-delivery.json';
  const failures = [];
  const alerts = Array.isArray(value.alerts) ? value.alerts : [];
  const alertsById = validateRequiredAlertSet(artifact, alerts, failures);
  const recipients = new Set();
  let primaryRecipient = false;
  for (const [index, recipient] of (Array.isArray(value.recipients)
    ? value.recipients
    : []
  ).entries()) {
    if (!recipient || Array.isArray(recipient) || typeof recipient !== 'object') {
      failures.push(`${artifact} recipients[${index}] must be an object`);
      continue;
    }
    if (!validSha256(recipient.recipientRefHash))
      failures.push(`${artifact} recipients[${index}].recipientRefHash has invalid format`);
    else if (recipients.has(recipient.recipientRefHash))
      failures.push(`${artifact} recipient references must be unique`);
    else recipients.add(recipient.recipientRefHash);
    if (!['primary-on-call', 'secondary-on-call'].includes(recipient.role))
      failures.push(`${artifact} recipients[${index}].role is invalid`);
    else if (recipient.role === 'primary-on-call') primaryRecipient = true;
    if (!['pager', 'sms', 'voice', 'email'].includes(recipient.channel))
      failures.push(`${artifact} recipients[${index}].channel is invalid`);
  }
  if (!primaryRecipient) failures.push(`${artifact} recipients must include primary-on-call`);
  const delivered = new Set();
  for (const [index, delivery] of (Array.isArray(value.deliveryResults)
    ? value.deliveryResults
    : []
  ).entries()) {
    const prefix = `${artifact} deliveryResults[${index}]`;
    if (!delivery || Array.isArray(delivery) || typeof delivery !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    const alert = alertsById.get(delivery.alertId);
    if (!alert) failures.push(`${prefix}.alertId is undeclared`);
    else if (delivered.has(delivery.alertId))
      failures.push(`${artifact} must contain one delivery result per alert`);
    else delivered.add(delivery.alertId);
    if (delivery.delivered !== true) failures.push(`${prefix}.delivered must equal true`);
    if (!validDateTime(delivery.deliveredAt))
      failures.push(`${prefix}.deliveredAt must be a non-future ISO date-time`);
    if (!validSha256(delivery.channelRefHash))
      failures.push(`${prefix}.channelRefHash has invalid format`);
    if (!recipients.has(delivery.recipientRefHash))
      failures.push(`${prefix}.recipientRefHash is undeclared`);
    if (!Number.isSafeInteger(delivery.attemptCount) || delivery.attemptCount < 1)
      failures.push(`${prefix}.attemptCount must be a positive integer`);
    const triggeredAt = Date.parse(alert?.triggeredAt);
    const deliveredAt = Date.parse(delivery.deliveredAt);
    if (Number.isFinite(triggeredAt) && Number.isFinite(deliveredAt) && deliveredAt < triggeredAt)
      failures.push(`${prefix}.deliveredAt must not precede alert trigger`);
  }
  for (const alertId of alertsById.keys())
    if (!delivered.has(alertId)) failures.push(`${artifact} has no delivery result for ${alertId}`);
  return failures;
}

function validateOncallAcknowledgement(value) {
  const artifact = 'oncall-acknowledgement.json';
  const failures = [];
  const alerts = Array.isArray(value.alerts) ? value.alerts : [];
  const alertsById = validateRequiredAlertSet(artifact, alerts, failures);
  const acknowledged = new Set();
  for (const [index, acknowledgement] of (Array.isArray(value.acknowledgements)
    ? value.acknowledgements
    : []
  ).entries()) {
    const prefix = `${artifact} acknowledgements[${index}]`;
    if (!acknowledgement || Array.isArray(acknowledgement) || typeof acknowledgement !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    const alert = alertsById.get(acknowledgement.alertId);
    if (!alert) failures.push(`${prefix}.alertId is undeclared`);
    else if (acknowledged.has(acknowledgement.alertId))
      failures.push(`${artifact} must contain one acknowledgement per alert`);
    else acknowledged.add(acknowledgement.alertId);
    if (acknowledgement.acknowledged !== true)
      failures.push(`${prefix}.acknowledged must equal true`);
    if (!validDateTime(acknowledgement.acknowledgedAt))
      failures.push(`${prefix}.acknowledgedAt must be a non-future ISO date-time`);
    if (acknowledgement.escalationOutcome !== 'ACKNOWLEDGED')
      failures.push(`${prefix}.escalationOutcome must equal ACKNOWLEDGED`);
    if (!validSha256(acknowledgement.acknowledgedByRefHash))
      failures.push(`${prefix}.acknowledgedByRefHash has invalid format`);
    const triggeredAt = Date.parse(alert?.triggeredAt);
    const acknowledgedAt = Date.parse(acknowledgement.acknowledgedAt);
    if (
      Number.isFinite(triggeredAt) &&
      Number.isFinite(acknowledgedAt) &&
      acknowledgedAt < triggeredAt
    )
      failures.push(`${prefix}.acknowledgedAt must not precede alert trigger`);
  }
  for (const alertId of alertsById.keys())
    if (!acknowledged.has(alertId))
      failures.push(`${artifact} has no acknowledgement for ${alertId}`);
  return failures;
}

function validateRlsDenials(value) {
  const artifact = 'rls-denials.json';
  const failures = [];
  const operations = new Set();
  const auditRefs = new Set();
  for (const [index, attempt] of (Array.isArray(value.attempts) ? value.attempts : []).entries()) {
    const prefix = `${artifact} attempts[${index}]`;
    if (!attempt || Array.isArray(attempt) || typeof attempt !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!['cross-tenant-read', 'cross-tenant-write'].includes(attempt.operation))
      failures.push(`${prefix}.operation is not approved`);
    else if (operations.has(attempt.operation))
      failures.push(`${artifact} attempt operations must be unique`);
    else operations.add(attempt.operation);
    if (attempt.denied !== true) failures.push(`${prefix}.denied must equal true`);
    if (attempt.exposedFieldCount !== 0) failures.push(`${prefix}.exposedFieldCount must equal 0`);
    if (attempt.mutationCount !== 0) failures.push(`${prefix}.mutationCount must equal 0`);
    if (!validSha256(attempt.auditRefHash))
      failures.push(`${prefix}.auditRefHash has invalid format`);
    else if (auditRefs.has(attempt.auditRefHash))
      failures.push(`${artifact} audit references must be unique`);
    else auditRefs.add(attempt.auditRefHash);
  }
  for (const operation of ['cross-tenant-read', 'cross-tenant-write'])
    if (!operations.has(operation)) failures.push(`${artifact} attempts must include ${operation}`);
  return failures;
}

function validateTenantContext(value) {
  const artifact = 'tenant-context.json';
  const failures = [];
  const expectedTenants = new Set();
  const connections = new Set();
  let previousTenant;
  for (const [index, transaction] of (Array.isArray(value.transactions)
    ? value.transactions
    : []
  ).entries()) {
    const prefix = `${artifact} transactions[${index}]`;
    if (!transaction || Array.isArray(transaction) || typeof transaction !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!validSha256(transaction.connectionRefHash))
      failures.push(`${prefix}.connectionRefHash has invalid format`);
    else connections.add(transaction.connectionRefHash);
    if (!validSha256(transaction.expectedTenantRefHash))
      failures.push(`${prefix}.expectedTenantRefHash has invalid format`);
    else {
      expectedTenants.add(transaction.expectedTenantRefHash);
      if (transaction.expectedTenantRefHash === previousTenant)
        failures.push(`${prefix}.expectedTenantRefHash must alternate between transactions`);
      previousTenant = transaction.expectedTenantRefHash;
    }
    if (transaction.observedTenantRefHash !== transaction.expectedTenantRefHash)
      failures.push(`${prefix}.observedTenantRefHash must equal expectedTenantRefHash`);
    if (transaction.resetVerified !== true)
      failures.push(`${prefix}.resetVerified must equal true`);
    if (!Number.isSafeInteger(transaction.sequence) || transaction.sequence !== index + 1)
      failures.push(`${prefix}.sequence must equal ${index + 1}`);
  }
  if (expectedTenants.size < 2)
    failures.push(`${artifact} transactions must alternate at least two tenants`);
  if (connections.size > 1)
    failures.push(`${artifact} transactions must reuse one pooled connection`);
  return failures;
}

function validateInboxDeduplication(value) {
  const artifact = 'inbox-deduplication.json';
  const failures = [];
  const deliveries = Array.isArray(value.deliveries) ? value.deliveries : [];
  const results = Array.isArray(value.businessResults) ? value.businessResults : [];
  const attempts = new Set();
  const resultRefs = new Set();
  if (deliveries.length !== value.deliveryAttempts)
    failures.push(`${artifact} deliveries must reconcile with deliveryAttempts`);
  if (results.length !== value.businessResultCount)
    failures.push(`${artifact} businessResults must reconcile with businessResultCount`);
  for (const [index, delivery] of deliveries.entries()) {
    if (!delivery || typeof delivery !== 'object' || delivery.eventRefHash !== value.eventRefHash)
      failures.push(`${artifact} deliveries[${index}] must reference the same event hash`);
    if (!Number.isSafeInteger(delivery?.attempt))
      failures.push(`${artifact} deliveries[${index}].attempt must be an integer`);
    else {
      if (attempts.has(delivery.attempt))
        failures.push(`${artifact} delivery attempts must be unique`);
      attempts.add(delivery.attempt);
      if (delivery.attempt !== index + 1)
        failures.push(`${artifact} deliveries[${index}].attempt must equal ${index + 1}`);
    }
  }
  for (const [index, result] of results.entries()) {
    if (!result || typeof result !== 'object' || !validSha256(result.resultRefHash))
      failures.push(`${artifact} businessResults[${index}].resultRefHash has invalid format`);
    else if (resultRefs.has(result.resultRefHash))
      failures.push(`${artifact} business result references must be unique`);
    else resultRefs.add(result.resultRefHash);
  }
  return failures;
}

function validateUploadResponse(value) {
  const artifact = 'upload-response.json';
  const failures = [];
  if (!opaqueReference.test(value.requestId ?? ''))
    failures.push(`${artifact} requestId must be an opaque reference`);
  if (!Number.isSafeInteger(value.status)) failures.push(`${artifact} status must be an integer`);
  return failures;
}

function validateObjectMetadata(value) {
  const artifact = 'object-metadata.json';
  const failures = [];
  const retention = value.retention;
  const keys =
    retention && !Array.isArray(retention) && typeof retention === 'object'
      ? Object.keys(retention).sort()
      : [];
  if (
    JSON.stringify(keys) !==
    JSON.stringify(['appliedAt', 'immutable', 'policyRefHash', 'retainUntil', 'storageClass'])
  )
    failures.push(`${artifact} retention fields are invalid`);
  const appliedAt = Date.parse(retention?.appliedAt);
  const retainUntil = Date.parse(retention?.retainUntil);
  const storedAt = Date.parse(value.storedAt);
  if (
    [storedAt, appliedAt, retainUntil].every(Number.isFinite) &&
    !(storedAt <= appliedAt && appliedAt < retainUntil)
  )
    failures.push(`${artifact} storage and retention timestamps are out of order`);
  return failures;
}

function validateOcrProvenance(value) {
  const artifact = 'ocr-provenance.json';
  const failures = [];
  for (const [index, candidate] of (Array.isArray(value.candidates)
    ? value.candidates
    : []
  ).entries()) {
    const prefix = `${artifact} candidates[${index}]`;
    if (!candidate || Array.isArray(candidate) || typeof candidate !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof candidate.field !== 'string' || !candidate.field.trim())
      failures.push(`${prefix}.field must not be empty`);
    if (!validSha256(candidate.sourceRegionHash))
      failures.push(`${prefix}.sourceRegionHash has invalid format`);
    if (
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1
    )
      failures.push(`${prefix}.confidence must be within 0..1`);
  }
  for (const fieldName of ['gatewayRef', 'modelVersion'])
    if (typeof value.provenance?.[fieldName] !== 'string' || !value.provenance[fieldName].trim())
      failures.push(`${artifact} provenance.${fieldName} must not be empty`);
  if (!validDateTime(value.provenance?.processedAt))
    failures.push(`${artifact} provenance.processedAt must be a non-future ISO date-time`);
  return failures;
}

function validateConcurrencyInput(value) {
  const artifact = 'concurrency-input.json';
  const failures = [];
  const contenders = Array.isArray(value.contenders) ? value.contenders : [];
  let requested = 0;
  const refs = new Set();
  for (const [index, contender] of contenders.entries()) {
    const prefix = `${artifact} contenders[${index}]`;
    if (!contender || Array.isArray(contender) || typeof contender !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof contender.contenderRef !== 'string' || !contender.contenderRef.trim())
      failures.push(`${prefix}.contenderRef must not be empty`);
    else if (refs.has(contender.contenderRef))
      failures.push(`${artifact} contenderRefs must be unique`);
    else refs.add(contender.contenderRef);
    if (!Number.isInteger(contender.quantity) || contender.quantity < 1)
      failures.push(`${prefix}.quantity must be a positive integer`);
    else requested += contender.quantity;
  }
  if (requested !== value.requestedQuantity)
    failures.push(`${artifact} contender quantities must equal requestedQuantity`);
  if (requested <= value.stock)
    failures.push(`${artifact} requestedQuantity must exceed stock for the contention drill`);
  return failures;
}

function validateOrderResults(value) {
  const artifact = 'order-results.json';
  const failures = [];
  const successful = Array.isArray(value.successfulOrders) ? value.successfulOrders : [];
  const failed = Array.isArray(value.failedContenders) ? value.failedContenders : [];
  const quantity = successful.reduce(
    (total, order) => total + (Number.isInteger(order?.quantity) ? order.quantity : 0),
    0,
  );
  if (quantity !== value.successfulQuantity)
    failures.push(`${artifact} successful order quantities must equal successfulQuantity`);
  const contenderRefs = new Set();
  const orderRefs = new Set();
  for (const [index, order] of successful.entries()) {
    if (!order || typeof order !== 'object' || typeof order.contenderRef !== 'string') {
      failures.push(`${artifact} successfulOrders[${index}] must identify its contender`);
      continue;
    }
    if (contenderRefs.has(order.contenderRef))
      failures.push(`${artifact} successful contender references must be unique`);
    else contenderRefs.add(order.contenderRef);
    if (!validSha256(order.orderRefHash))
      failures.push(`${artifact} successfulOrders[${index}].orderRefHash has invalid format`);
    else if (orderRefs.has(order.orderRefHash))
      failures.push(`${artifact} successful order references must be unique`);
    else orderRefs.add(order.orderRefHash);
    if (!Number.isSafeInteger(order.quantity) || order.quantity < 1)
      failures.push(`${artifact} successfulOrders[${index}].quantity must be a positive integer`);
  }
  for (const [index, contender] of failed.entries()) {
    if (!contender || typeof contender !== 'object')
      failures.push(`${artifact} failedContenders[${index}] must be an object`);
    else if (contender.partialFactCount !== 0)
      failures.push(`${artifact} failedContenders[${index}].partialFactCount must equal 0`);
    if (typeof contender?.contenderRef !== 'string' || !contender.contenderRef.trim())
      failures.push(`${artifact} failedContenders[${index}].contenderRef must not be empty`);
    else if (contenderRefs.has(contender.contenderRef))
      failures.push(`${artifact} contender cannot both succeed and fail`);
    else contenderRefs.add(contender.contenderRef);
  }
  return failures;
}

function validateInventoryLedger(value) {
  const artifact = 'inventory-ledger.json';
  const failures = [];
  let sold = 0;
  const orderRefs = new Set();
  for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    const prefix = `${artifact} entries[${index}]`;
    if (!entry || Array.isArray(entry) || typeof entry !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (entry.type !== 'SOLD') failures.push(`${prefix}.type must equal "SOLD"`);
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1)
      failures.push(`${prefix}.quantity must be a positive integer`);
    else sold += entry.quantity;
    if (!validSha256(entry.orderRefHash))
      failures.push(`${prefix}.orderRefHash has invalid format`);
    else if (orderRefs.has(entry.orderRefHash))
      failures.push(`${artifact} order references must be unique`);
    else orderRefs.add(entry.orderRefHash);
  }
  if (sold !== value.soldQuantity)
    failures.push(`${artifact} entry quantities must equal soldQuantity`);
  return failures;
}

function validateRuntimePolicy(value) {
  const artifact = 'runtime-policy.json';
  const failures = [];
  const origins = new Set();
  for (const [index, allowedHost] of (Array.isArray(value.allowedHosts)
    ? value.allowedHosts
    : []
  ).entries()) {
    try {
      const url = new URL(allowedHost);
      const hostname = url.hostname.toLowerCase();
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        ['localhost', '0.0.0.0', '::', '::1'].includes(hostname) ||
        /^127(?:\.[0-9]{1,3}){3}$/u.test(hostname)
      )
        throw new Error('not an origin-only HTTPS host');
      if (origins.has(url.origin)) failures.push(`${artifact} allowedHosts must be unique`);
      origins.add(url.origin);
    } catch {
      failures.push(`${artifact} allowedHosts[${index}] must be an origin-only HTTPS URL`);
    }
  }
  return failures;
}

function validateGeoTarget(value) {
  const artifact = 'geo-target-redacted.json';
  const failures = [];
  const fields = new Set();
  for (const [index, claim] of (Array.isArray(value.storedClaims)
    ? value.storedClaims
    : []
  ).entries()) {
    const prefix = `${artifact} storedClaims[${index}]`;
    if (!claim || Array.isArray(claim) || typeof claim !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof claim.field !== 'string' || !claim.field.trim())
      failures.push(`${prefix}.field must not be empty`);
    else if (fields.has(claim.field)) failures.push(`${artifact} claim fields must be unique`);
    else fields.add(claim.field);
    if (
      /rank|traffic|conversion|credential|secret|token|password|raw-response/iu.test(
        claim.field ?? '',
      )
    )
      failures.push(`${prefix}.field contains a forbidden performance claim`);
    if (!validSha256(claim.valueHash)) failures.push(`${prefix}.valueHash has invalid format`);
    if (!validDateTime(claim.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
  }
  return failures;
}

function validateDeploymentTopology(value) {
  const artifact = 'deployment-topology.json';
  const failures = validateCandidateImageOwner(artifact, {
    api: value.services?.api?.image,
    worker: value.services?.worker?.image,
    web: value.services?.web?.image,
  });
  if (value.environment !== 'controlled-preproduction')
    failures.push(`${artifact} environment must equal "controlled-preproduction"`);
  if (
    JSON.stringify(Object.keys(value.services ?? {}).sort()) !==
    JSON.stringify(['api', 'web', 'worker'])
  )
    failures.push(`${artifact} services must contain exactly api, web and worker`);
  for (const target of ['api', 'worker', 'web']) {
    const service = value.services?.[target];
    if (!Number.isSafeInteger(service?.replicas) || service.replicas < 1)
      failures.push(`${artifact} services.${target}.replicas must be a positive integer`);
    if (!Number.isSafeInteger(service?.readyReplicas) || service.readyReplicas < 1)
      failures.push(`${artifact} services.${target}.readyReplicas must be a positive integer`);
    if (
      Number.isSafeInteger(service?.replicas) &&
      Number.isSafeInteger(service?.readyReplicas) &&
      service.readyReplicas !== service.replicas
    )
      failures.push(`${artifact} services.${target} must have every replica ready`);
  }
  const requiredStores = new Set(['postgresql', 'object-store']);
  const supportedStores = new Set(['postgresql', 'object-store', 'cache', 'search', 'vector']);
  const observedStores = new Set();
  const endpointRefs = new Set();
  for (const [index, store] of (Array.isArray(value.dataStores)
    ? value.dataStores
    : []
  ).entries()) {
    const prefix = `${artifact} dataStores[${index}]`;
    if (!store || Array.isArray(store) || typeof store !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    requiredStores.delete(store.kind);
    if (!supportedStores.has(store.kind))
      failures.push(`${prefix}.kind is not a supported data store`);
    else if (observedStores.has(store.kind))
      failures.push(`${artifact} data store kinds must be unique`);
    else observedStores.add(store.kind);
    if (!validSha256(store.endpointRefHash))
      failures.push(`${prefix}.endpointRefHash has invalid format`);
    else if (endpointRefs.has(store.endpointRefHash))
      failures.push(`${artifact} data store endpoint references must be unique`);
    else endpointRefs.add(store.endpointRefHash);
    if (store.tlsVerified !== true) failures.push(`${prefix}.tlsVerified must equal true`);
  }
  for (const store of requiredStores) failures.push(`${artifact} dataStores must include ${store}`);
  return failures;
}

function validateMonitoringSnapshot(value) {
  const artifact = 'monitoring-snapshot.json';
  const failures = [];
  const saturationLimits = {
    cpuMaxPercent: 85,
    memoryMaxPercent: 85,
    databaseConnectionMaxPercent: 80,
  };
  if (
    JSON.stringify(Object.keys(value.saturation ?? {}).sort()) !==
    JSON.stringify(Object.keys(saturationLimits).sort())
  )
    failures.push(`${artifact} saturation fields are invalid`);
  for (const [fieldName, limit] of Object.entries(saturationLimits)) {
    const metric = value.saturation?.[fieldName];
    if (!Number.isFinite(metric) || metric < 0 || metric > limit)
      failures.push(`${artifact} saturation.${fieldName} must be within 0..${limit}`);
  }
  if (
    JSON.stringify(Object.keys(value.backlog ?? {}).sort()) !==
    JSON.stringify(['outboxDeadDelta', 'unacknowledgedMessageCount'])
  )
    failures.push(`${artifact} backlog fields are invalid`);
  if (value.backlog?.outboxDeadDelta !== 0)
    failures.push(`${artifact} backlog.outboxDeadDelta must equal 0`);
  if (value.backlog?.unacknowledgedMessageCount !== 0)
    failures.push(`${artifact} backlog.unacknowledgedMessageCount must equal 0`);
  const alertIds = new Set();
  for (const [index, alert] of (Array.isArray(value.alerts) ? value.alerts : []).entries()) {
    const prefix = `${artifact} alerts[${index}]`;
    if (!alert || Array.isArray(alert) || typeof alert !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof alert.alertId !== 'string' || !alert.alertId.trim())
      failures.push(`${prefix}.alertId must not be empty`);
    else if (alertIds.has(alert.alertId)) failures.push(`${artifact} alert IDs must be unique`);
    else alertIds.add(alert.alertId);
    if (!['EXPECTED', 'RESOLVED'].includes(alert.status))
      failures.push(`${prefix}.status must be EXPECTED or RESOLVED`);
    if (!validDateTime(alert.observedAt))
      failures.push(`${prefix}.observedAt must be a non-future ISO date-time`);
  }
  const timeline = [value.windowStartedAt, value.windowCompletedAt, value.capturedAt].map(
    Date.parse,
  );
  if (
    timeline.every(Number.isFinite) &&
    !(timeline[0] <= timeline[1] && timeline[1] <= timeline[2])
  )
    failures.push(`${artifact} monitoring window and capture timestamps are out of order`);
  return failures;
}

const controlledArtifactValidators = {
  'legacy-production-inventory.json': validateLegacyInventory,
  'greenfield-waiver.json': validateGreenfieldWaiver,
  'financial-policy-approvals.json': validateFinancialApprovals,
  'legal-document-release.json': validateLegalRelease,
  'backup.manifest.json': validateBackupManifest,
  'restore-report.json': validateRestoreReport,
  'physical-wal-evidence.json': validatePhysicalWalEvidence,
  'external-deletion-samples.json': validateExternalDeletionSamples,
  'performance-report.json': validatePerformanceReport,
  'candidate-image-digests.json': (value) =>
    validateCandidateImageOwner('candidate-image-digests.json', value.images),
  'refund-unknown-recovery.json': validateRefundUnknownRecovery,
  'provider-callback-redacted.json': validateProviderCallback,
  'review-publish.json': validateReviewPublish,
  'consumer-build.json': (value) => validateWechatBuild('consumer-build.json', value),
  'merchant-template-build.json': (value) =>
    validateWechatBuild('merchant-template-build.json', value),
  'callback-redacted.json': validateWechatCallback,
  'rollback.json': validateWechatRollback,
  'device-matrix.json': validateDeviceMatrix,
  'identity-session-redacted.json': validateIdentitySessionEvidence,
  'secret-access-audit.json': validateSecretAccessAudit,
  'object-retention.json': validateObjectRetention,
  'privacy-export-delete.json': validatePrivacyExportDelete,
  'alert-delivery.json': validateAlertDelivery,
  'oncall-acknowledgement.json': validateOncallAcknowledgement,
  'rls-denials.json': validateRlsDenials,
  'tenant-context.json': validateTenantContext,
  'inbox-deduplication.json': validateInboxDeduplication,
  'upload-response.json': validateUploadResponse,
  'object-metadata.json': validateObjectMetadata,
  'ocr-provenance.json': validateOcrProvenance,
  'concurrency-input.json': validateConcurrencyInput,
  'order-results.json': validateOrderResults,
  'inventory-ledger.json': validateInventoryLedger,
  'runtime-policy.json': validateRuntimePolicy,
  'geo-target-redacted.json': validateGeoTarget,
  'deployment-topology.json': validateDeploymentTopology,
  'monitoring-snapshot.json': validateMonitoringSnapshot,
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
    if (typeof candidate.value === 'string' && rule.format === 'date-time') {
      const timestamp = parseCanonicalUtcTimestamp(candidate.value);
      if (timestamp === undefined)
        failures.push(`${artifact} ${rule.path} must be a canonical millisecond UTC timestamp`);
      else if (!rule.allowFuture && timestamp > Date.now() + 5 * 60_000)
        failures.push(`${artifact} ${rule.path} must not be in the future`);
    }
    if (rule.type === 'object' && candidate.value && Object.keys(candidate.value).length === 0)
      failures.push(`${artifact} ${rule.path} must not be empty`);
  }
  failures.push(...(controlledArtifactValidators[artifact]?.(value) ?? []));
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
