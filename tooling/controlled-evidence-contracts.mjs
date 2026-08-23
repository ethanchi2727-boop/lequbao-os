import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCanonicalUtcTimestamp } from './canonical-time.mjs';

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
  ],
  'object-metadata.json': [
    sha256('objectRefHash'),
    yes('encrypted'),
    yes('originalRetained'),
    sha256('contentSha256'),
    field('retention', 'object'),
  ],
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
    sha256('merchantAccountRef'),
    field('serverOrderAmountFen', 'number', { minimum: 1 }),
    sha256('idempotencyKeyHash'),
  ],
  'provider-callback-redacted.json': [
    yes('signatureVerified'),
    yes('replayRejected'),
    sha256('merchantAccountRef'),
    field('amountFen', 'number', { minimum: 1 }),
    field('paymentState', 'string', { equals: 'SUCCEEDED' }),
    field('appliedBusinessTransitions', 'number', { equals: 1 }),
    sha256('providerEventIdHash'),
  ],
  'merchant-account-reconciliation.json': [
    sha256('providerMerchantAccountRef'),
    sha256('platformMerchantAccountRef'),
    field('amountFen', 'number', { minimum: 1 }),
    yes('amountMatch'),
    yes('accountMatch'),
    empty('unexplainedItems'),
  ],
  'refund-unknown-recovery.json': [
    field('initialState', 'string', { equals: 'UNKNOWN' }),
    sha256('merchantAccountRef'),
    field('providerQuery', 'object'),
    field('finalState', 'string'),
    yes('queryBeforeRetry'),
    field('convergenceCount', 'number', { equals: 1 }),
  ],
  'financial-policy-approvals.json': [
    commit,
    deployment,
    field('decisionVersion', 'string'),
    timestamp('effectiveAt'),
    field('decisions', 'object'),
    field('approvals', 'array'),
    field('independentReview', 'object'),
    empty('unresolvedItems'),
  ],
  'runtime-policy.json': [
    pass,
    field('allowedHosts', 'array'),
    yes('defaultDeny'),
    yes('networkPolicyApplied'),
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
    field('backupFile', 'string'),
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
    field('backupFile', 'string'),
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
    timestamp('recoveryPoint'),
    field('faultDomain', 'string'),
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
    field('images', 'object'),
    timestamp('startedAt'),
    timestamp('completedAt'),
    field('concurrency', 'number', { minimum: 1 }),
    field('requestsPerScenario', 'number', { minimum: 1 }),
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
    empty('stopReleaseConditions'),
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
    timestamp('publishedAt'),
    sha256('publicationReceiptHash'),
    field('pilotScope', 'object'),
  ],
  'callback-redacted.json': [
    yes('signatureVerified'),
    yes('replayRejected'),
    sha256('serverEventRef'),
    field('appliedBusinessTransitions', 'number', { equals: 1 }),
    timestamp('verifiedAt'),
  ],
  'rollback.json': [
    pass,
    field('fromVersion', 'string'),
    field('toVersion', 'string'),
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
  for (const [index, source] of (Array.isArray(value.sources) ? value.sources : []).entries()) {
    const prefix = `${artifact} sources[${index}]`;
    if (!source || Array.isArray(source) || typeof source !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (source.kind !== 'sqlite') failures.push(`${prefix}.kind must equal "sqlite"`);
    if (
      !['development', 'test', 'controlled-preproduction', 'production'].includes(
        source.declaredEnvironment,
      )
    )
      failures.push(`${prefix}.declaredEnvironment must be reviewed and non-unknown`);
    if (!validSha256(source.locationSha256))
      failures.push(`${prefix}.locationSha256 has invalid format`);
    if (!validSha256(source.fileSha256)) failures.push(`${prefix}.fileSha256 has invalid format`);
    if (!['EMPTY_REVIEW_REQUIRED', 'DATA_PRESENT_REVIEW_REQUIRED'].includes(source.outcome))
      failures.push(`${prefix}.outcome contains a stop-release or unknown result`);
    for (const fieldName of ['bytes', 'tableCount', 'nonEmptyTableCount', 'rowCount'])
      if (!Number.isInteger(source[fieldName]) || source[fieldName] < 0)
        failures.push(`${prefix}.${fieldName} must be a non-negative integer`);
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
    if (typeof environment.ownerRef !== 'string' || !environment.ownerRef.trim())
      failures.push(`${prefix}.ownerRef must not be empty`);
    if (environment.decision !== 'ZERO_PRODUCTION_DATA')
      failures.push(`${prefix}.decision must equal "ZERO_PRODUCTION_DATA"`);
  }
  if (JSON.stringify(Object.keys(domains).sort()) !== JSON.stringify([...greenfieldDomains].sort()))
    failures.push(`${artifact} domainZeroCounts must cover the exact production business domains`);
  for (const domain of greenfieldDomains)
    if (domains[domain] !== 0) failures.push(`${artifact} domainZeroCounts.${domain} must equal 0`);
  for (const category of greenfieldCoverage) {
    const records = value.coverage?.[category];
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
      for (const fieldName of ['scopeRef', 'ownerRef', 'inspectionMethod'])
        if (typeof record[fieldName] !== 'string' || !record[fieldName].trim())
          failures.push(`${prefix}.${fieldName} must not be empty`);
      if (!validDateTime(record.inspectedAt))
        failures.push(`${prefix}.inspectedAt must be a non-future ISO date-time`);
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
  return failures;
}

function validateFinancialApprovals(value) {
  const artifact = 'financial-policy-approvals.json';
  const failures = [];
  const approvals = Array.isArray(value.approvals) ? value.approvals : [];
  for (const decision of [
    'paymentResponsibilityResolved',
    'merchantAccountMappingResolved',
    'legacyBalanceResolved',
    'distributionConflictC001Resolved',
    'computeAllocationResolved',
    'historicalSnapshotPreserved',
  ])
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
  return failures;
}

function validateLegalRelease(value) {
  const artifact = 'legal-document-release.json';
  const failures = [];
  const documentIds = new Set();
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
    if (typeof document.documentId === 'string') {
      if (documentIds.has(document.documentId))
        failures.push(`${artifact} documentIds must be unique`);
      documentIds.add(document.documentId);
    }
    if (!validSha256(document.sha256)) failures.push(`${prefix}.sha256 has invalid format`);
    try {
      const url = new URL(document.publishedUrl);
      if (url.protocol !== 'https:') throw new Error('not HTTPS');
    } catch {
      failures.push(`${prefix}.publishedUrl must be HTTPS`);
    }
    if (!validDateTime(document.effectiveAt))
      failures.push(`${prefix}.effectiveAt must be a non-future ISO date-time`);
  }
  const requiredSurfaces = new Set(['lequbao-web', 'lequ-life-miniapp', 'merchant-miniapp']);
  for (const [index, surface] of (Array.isArray(value.surfaceMatrix)
    ? value.surfaceMatrix
    : []
  ).entries()) {
    const prefix = `${artifact} surfaceMatrix[${index}]`;
    if (!surface || Array.isArray(surface) || typeof surface !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    requiredSurfaces.delete(surface.surface);
    if (!Array.isArray(surface.documentIds) || surface.documentIds.length === 0)
      failures.push(`${prefix}.documentIds must contain evidence`);
    else
      for (const documentId of surface.documentIds)
        if (!documentIds.has(documentId))
          failures.push(`${prefix}.documentIds contains an undeclared document`);
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
    ...validateApprovalSet(artifact, value.approvals, [
      'product owner',
      'legal compliance reviewer',
    ]),
  );
  return failures;
}

function validateBackupManifest(value) {
  const artifact = 'backup.manifest.json';
  const failures = [];
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
  if (fixtures.length < 22)
    failures.push(`${artifact} databaseFixturesPassed must contain all 22 fixtures`);
  if (new Set(fixtures).size !== fixtures.length)
    failures.push(`${artifact} databaseFixturesPassed must not contain duplicates`);
  const times = ['backupCompletedAt', 'failureTime', 'restoreStartedAt', 'restoreCompletedAt'].map(
    (fieldName) => Date.parse(value[fieldName]),
  );
  if (
    times.every(Number.isFinite) &&
    !(times[0] <= times[1] && times[1] <= times[2] && times[2] <= times[3])
  )
    failures.push(`${artifact} backup, failure and restore timestamps are out of order`);
  return failures;
}

function validatePhysicalWalEvidence(value) {
  const artifact = 'physical-wal-evidence.json';
  const failures = [];
  for (const [index, event] of (Array.isArray(value.timeline) ? value.timeline : []).entries()) {
    const prefix = `${artifact} timeline[${index}]`;
    if (!event || Array.isArray(event) || typeof event !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof event.event !== 'string' || !event.event.trim())
      failures.push(`${prefix}.event must not be empty`);
    if (!validDateTime(event.at)) failures.push(`${prefix}.at must be a non-future ISO date-time`);
  }
  return failures;
}

function validateExternalDeletionSamples(value) {
  const artifact = 'external-deletion-samples.json';
  const failures = [];
  const requiredTargets = new Set(['object-store', 'search', 'vector', 'cache']);
  for (const [index, target] of (Array.isArray(value.targets) ? value.targets : []).entries()) {
    const prefix = `${artifact} targets[${index}]`;
    if (!target || Array.isArray(target) || typeof target !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    requiredTargets.delete(target.target);
    if (typeof target.receiptRef !== 'string' || !target.receiptRef.trim())
      failures.push(`${prefix}.receiptRef must not be empty`);
    if (target.deleted !== true) failures.push(`${prefix}.deleted must equal true`);
    if (!validDateTime(target.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
  }
  for (const target of requiredTargets) failures.push(`${artifact} targets must include ${target}`);
  for (const [index, sample] of (Array.isArray(value.samples) ? value.samples : []).entries()) {
    if (!sample || Array.isArray(sample) || typeof sample !== 'object')
      failures.push(`${artifact} samples[${index}] must be an object`);
    else if (sample.remainingMatches !== 0)
      failures.push(`${artifact} samples[${index}].remainingMatches must equal 0`);
  }
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
    if (!Number.isFinite(snapshot[fieldName]) || snapshot[fieldName] < 0)
      failures.push(`${artifact} ${pathName}.${fieldName} must be non-negative`);
  if (snapshot.tableCount < 164)
    failures.push(`${artifact} ${pathName}.tableCount must include the 164-table candidate schema`);
  const backlog = snapshot.messageBacklog;
  for (const fieldName of ['activeCount', 'deadCount', 'oldestActiveSeconds'])
    if (!Number.isFinite(backlog?.[fieldName]) || backlog[fieldName] < 0)
      failures.push(`${artifact} ${pathName}.messageBacklog.${fieldName} must be non-negative`);
}

function validatePerformanceReport(value) {
  const artifact = 'performance-report.json';
  const failures = [];
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
    if (scenario.requests !== value.requestsPerScenario)
      failures.push(`${prefix}.requests does not match requestsPerScenario`);
    if (scenario.successes + scenario.errors !== scenario.requests)
      failures.push(`${prefix} successes and errors do not reconcile with requests`);
    if (!Number.isFinite(scenario.p95Ms) || scenario.p95Ms > limit)
      failures.push(`${prefix}.p95Ms exceeds the frozen threshold`);
    if (!Number.isFinite(scenario.errorRate) || scenario.errorRate < 0 || scenario.errorRate > 0.01)
      failures.push(`${prefix}.errorRate exceeds one percent`);
    for (const fieldName of ['p50Ms', 'p99Ms'])
      if (!Number.isFinite(scenario[fieldName]) || scenario[fieldName] < 0)
        failures.push(`${prefix}.${fieldName} must be non-negative`);
  }
  for (const name of Object.keys(performanceScenarioLimits))
    if (!names.has(name)) failures.push(`${artifact} scenarios must include ${name}`);
  if (names.size !== scenarios.length) failures.push(`${artifact} scenario names must be unique`);
  const message = scenarios.find((scenario) => scenario?.name === 'customer-message-write');
  if (value.persistence?.expectedMessageIds !== message?.successes)
    failures.push(`${artifact} persistence expected count must equal acknowledged messages`);
  if (value.persistence?.persistedMessageIds !== value.persistence?.expectedMessageIds)
    failures.push(`${artifact} every acknowledged message must persist`);
  if (
    !Array.isArray(value.persistence?.missingMessageIds) ||
    value.persistence.missingMessageIds.length
  )
    failures.push(`${artifact} persistence missingMessageIds must be empty`);
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
  return failures;
}

function validateReviewPublish(value) {
  const artifact = 'review-publish.json';
  const failures = [];
  if (value.reviewVersion !== value.publishedVersion)
    failures.push(`${artifact} publishedVersion must equal the approved reviewVersion`);
  const percentage = value.pilotScope?.percentage;
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)
    failures.push(`${artifact} pilotScope.percentage must be within 1..100`);
  if (!Array.isArray(value.pilotScope?.scopeRefs) || value.pilotScope.scopeRefs.length === 0)
    failures.push(`${artifact} pilotScope.scopeRefs must contain evidence`);
  return failures;
}

function validateDeviceMatrix(value) {
  const artifact = 'device-matrix.json';
  const failures = [];
  const devices = Array.isArray(value.devices) ? value.devices : [];
  const platforms = new Set();
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
    else packages.add(scenario.package);
    if (scenario.result !== 'PASS') failures.push(`${prefix}.result must equal "PASS"`);
    if (!Array.isArray(scenario.deviceRefs) || scenario.deviceRefs.length < 2)
      failures.push(`${prefix}.deviceRefs must cover both platforms`);
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
  if (value.mfa?.highRiskRequired !== true)
    failures.push(`${artifact} mfa.highRiskRequired must equal true`);
  if (value.mfa?.downgradeRejected !== true)
    failures.push(`${artifact} mfa.downgradeRejected must equal true`);
  for (const [index, session] of (Array.isArray(value.sessions) ? value.sessions : []).entries()) {
    const prefix = `${artifact} sessions[${index}]`;
    if (!session || Array.isArray(session) || typeof session !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!validSha256(session.sessionRefHash))
      failures.push(`${prefix}.sessionRefHash has invalid format`);
    if (session.tenantScopeVerified !== true)
      failures.push(`${prefix}.tenantScopeVerified must equal true`);
    if (session.shortLived !== true) failures.push(`${prefix}.shortLived must equal true`);
  }
  return failures;
}

function validateSecretAccessAudit(value) {
  const artifact = 'secret-access-audit.json';
  const failures = [];
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
    if (typeof event.subjectRef !== 'string' || !event.subjectRef.trim())
      failures.push(`${prefix}.subjectRef must not be empty`);
    if (!['READ', 'ROTATE'].includes(event.action))
      failures.push(`${prefix}.action is not approved`);
    if (event.allowed !== true) failures.push(`${prefix}.allowed must equal true`);
    if (!validDateTime(event.occurredAt))
      failures.push(`${prefix}.occurredAt must be a non-future ISO date-time`);
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
    if (object.encrypted !== true) failures.push(`${prefix}.encrypted must equal true`);
    if (object.retentionApplied !== true)
      failures.push(`${prefix}.retentionApplied must equal true`);
    if (object.deletionVerified !== true)
      failures.push(`${prefix}.deletionVerified must equal true`);
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
  if (value.deletion?.authorized !== true)
    failures.push(`${artifact} deletion.authorized must equal true`);
  if (value.deletion?.auditRecorded !== true)
    failures.push(`${artifact} deletion.auditRecorded must equal true`);
  const requiredTargets = new Set(['database', 'object-store', 'search', 'vector', 'cache']);
  for (const [index, target] of (Array.isArray(value.targets) ? value.targets : []).entries()) {
    const prefix = `${artifact} targets[${index}]`;
    if (!target || Array.isArray(target) || typeof target !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    requiredTargets.delete(target.target);
    if (!validSha256(target.receiptHash)) failures.push(`${prefix}.receiptHash has invalid format`);
    if (target.deleted !== true) failures.push(`${prefix}.deleted must equal true`);
    if (!validDateTime(target.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
  }
  for (const target of requiredTargets) failures.push(`${artifact} targets must include ${target}`);
  return failures;
}

function validateAlertDelivery(value) {
  const artifact = 'alert-delivery.json';
  const failures = [];
  const alerts = Array.isArray(value.alerts) ? value.alerts : [];
  const alertIds = new Set();
  const severities = new Set();
  for (const [index, alert] of alerts.entries()) {
    const prefix = `${artifact} alerts[${index}]`;
    if (!alert || Array.isArray(alert) || typeof alert !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof alert.alertId !== 'string' || !alert.alertId.trim())
      failures.push(`${prefix}.alertId must not be empty`);
    else alertIds.add(alert.alertId);
    if (!['P0', 'P1'].includes(alert.severity))
      failures.push(`${prefix}.severity must be P0 or P1`);
    else severities.add(alert.severity);
    if (!validDateTime(alert.triggeredAt))
      failures.push(`${prefix}.triggeredAt must be a non-future ISO date-time`);
  }
  for (const severity of ['P0', 'P1'])
    if (!severities.has(severity)) failures.push(`${artifact} alerts must include ${severity}`);
  for (const [index, recipient] of (Array.isArray(value.recipients)
    ? value.recipients
    : []
  ).entries())
    if (!recipient || typeof recipient !== 'object' || !validSha256(recipient.recipientRefHash))
      failures.push(`${artifact} recipients[${index}].recipientRefHash has invalid format`);
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
    if (!alertIds.has(delivery.alertId)) failures.push(`${prefix}.alertId is undeclared`);
    else delivered.add(delivery.alertId);
    if (delivery.delivered !== true) failures.push(`${prefix}.delivered must equal true`);
    if (!validDateTime(delivery.deliveredAt))
      failures.push(`${prefix}.deliveredAt must be a non-future ISO date-time`);
    if (!validSha256(delivery.channelRefHash))
      failures.push(`${prefix}.channelRefHash has invalid format`);
  }
  for (const alertId of alertIds)
    if (!delivered.has(alertId)) failures.push(`${artifact} has no delivery result for ${alertId}`);
  return failures;
}

function validateOncallAcknowledgement(value) {
  const artifact = 'oncall-acknowledgement.json';
  const failures = [];
  const alerts = Array.isArray(value.alerts) ? value.alerts : [];
  const alertIds = new Set(alerts.map((alert) => alert?.alertId).filter(Boolean));
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
    if (!alertIds.has(acknowledgement.alertId)) failures.push(`${prefix}.alertId is undeclared`);
    else acknowledged.add(acknowledgement.alertId);
    if (acknowledgement.acknowledged !== true)
      failures.push(`${prefix}.acknowledged must equal true`);
    if (!validDateTime(acknowledgement.acknowledgedAt))
      failures.push(`${prefix}.acknowledgedAt must be a non-future ISO date-time`);
    if (
      typeof acknowledgement.escalationOutcome !== 'string' ||
      !acknowledgement.escalationOutcome.trim()
    )
      failures.push(`${prefix}.escalationOutcome must not be empty`);
  }
  for (const alertId of alertIds)
    if (!acknowledged.has(alertId))
      failures.push(`${artifact} has no acknowledgement for ${alertId}`);
  return failures;
}

function validateRlsDenials(value) {
  const artifact = 'rls-denials.json';
  const failures = [];
  const operations = new Set();
  for (const [index, attempt] of (Array.isArray(value.attempts) ? value.attempts : []).entries()) {
    const prefix = `${artifact} attempts[${index}]`;
    if (!attempt || Array.isArray(attempt) || typeof attempt !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (!['cross-tenant-read', 'cross-tenant-write'].includes(attempt.operation))
      failures.push(`${prefix}.operation is not approved`);
    else operations.add(attempt.operation);
    if (attempt.denied !== true) failures.push(`${prefix}.denied must equal true`);
    if (attempt.exposedFieldCount !== 0) failures.push(`${prefix}.exposedFieldCount must equal 0`);
    if (attempt.mutationCount !== 0) failures.push(`${prefix}.mutationCount must equal 0`);
    if (!validSha256(attempt.auditRefHash))
      failures.push(`${prefix}.auditRefHash has invalid format`);
  }
  for (const operation of ['cross-tenant-read', 'cross-tenant-write'])
    if (!operations.has(operation)) failures.push(`${artifact} attempts must include ${operation}`);
  return failures;
}

function validateTenantContext(value) {
  const artifact = 'tenant-context.json';
  const failures = [];
  const expectedTenants = new Set();
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
    if (!validSha256(transaction.expectedTenantRefHash))
      failures.push(`${prefix}.expectedTenantRefHash has invalid format`);
    else expectedTenants.add(transaction.expectedTenantRefHash);
    if (transaction.observedTenantRefHash !== transaction.expectedTenantRefHash)
      failures.push(`${prefix}.observedTenantRefHash must equal expectedTenantRefHash`);
    if (transaction.resetVerified !== true)
      failures.push(`${prefix}.resetVerified must equal true`);
  }
  if (expectedTenants.size < 2)
    failures.push(`${artifact} transactions must alternate at least two tenants`);
  return failures;
}

function validateInboxDeduplication(value) {
  const artifact = 'inbox-deduplication.json';
  const failures = [];
  const deliveries = Array.isArray(value.deliveries) ? value.deliveries : [];
  const results = Array.isArray(value.businessResults) ? value.businessResults : [];
  if (deliveries.length !== value.deliveryAttempts)
    failures.push(`${artifact} deliveries must reconcile with deliveryAttempts`);
  if (results.length !== value.businessResultCount)
    failures.push(`${artifact} businessResults must reconcile with businessResultCount`);
  for (const [index, delivery] of deliveries.entries()) {
    if (!delivery || typeof delivery !== 'object' || delivery.eventRefHash !== value.eventRefHash)
      failures.push(`${artifact} deliveries[${index}] must reference the same event hash`);
  }
  for (const [index, result] of results.entries())
    if (!result || typeof result !== 'object' || !validSha256(result.resultRefHash))
      failures.push(`${artifact} businessResults[${index}].resultRefHash has invalid format`);
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
  for (const [index, order] of successful.entries())
    if (!order || typeof order !== 'object' || typeof order.contenderRef !== 'string')
      failures.push(`${artifact} successfulOrders[${index}] must identify its contender`);
  for (const [index, contender] of failed.entries()) {
    if (!contender || typeof contender !== 'object')
      failures.push(`${artifact} failedContenders[${index}] must be an object`);
    else if (contender.partialFactCount !== 0)
      failures.push(`${artifact} failedContenders[${index}].partialFactCount must equal 0`);
  }
  return failures;
}

function validateInventoryLedger(value) {
  const artifact = 'inventory-ledger.json';
  const failures = [];
  let sold = 0;
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
    if (typeof entry.orderRef !== 'string' || !entry.orderRef.trim())
      failures.push(`${prefix}.orderRef must not be empty`);
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
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
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
    if (/rank|traffic|conversion/iu.test(claim.field ?? ''))
      failures.push(`${prefix}.field contains a forbidden performance claim`);
    if (!validSha256(claim.valueHash)) failures.push(`${prefix}.valueHash has invalid format`);
    if (!validDateTime(claim.verifiedAt))
      failures.push(`${prefix}.verifiedAt must be a non-future ISO date-time`);
  }
  return failures;
}

function validateDeploymentTopology(value) {
  const artifact = 'deployment-topology.json';
  const failures = [];
  if (value.environment !== 'controlled-preproduction')
    failures.push(`${artifact} environment must equal "controlled-preproduction"`);
  const requiredStores = new Set(['postgresql', 'object-store']);
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
    if (!validSha256(store.endpointRefHash))
      failures.push(`${prefix}.endpointRefHash has invalid format`);
    if (store.tlsVerified !== true) failures.push(`${prefix}.tlsVerified must equal true`);
  }
  for (const store of requiredStores) failures.push(`${artifact} dataStores must include ${store}`);
  return failures;
}

function validateMonitoringSnapshot(value) {
  const artifact = 'monitoring-snapshot.json';
  const failures = [];
  for (const fieldName of ['cpuMaxPercent', 'memoryMaxPercent', 'databaseConnectionMaxPercent']) {
    const metric = value.saturation?.[fieldName];
    if (!Number.isFinite(metric) || metric < 0 || metric > 100)
      failures.push(`${artifact} saturation.${fieldName} must be within 0..100`);
  }
  if (value.backlog?.outboxDeadDelta !== 0)
    failures.push(`${artifact} backlog.outboxDeadDelta must equal 0`);
  if (value.backlog?.unacknowledgedMessageCount !== 0)
    failures.push(`${artifact} backlog.unacknowledgedMessageCount must equal 0`);
  for (const [index, alert] of (Array.isArray(value.alerts) ? value.alerts : []).entries()) {
    const prefix = `${artifact} alerts[${index}]`;
    if (!alert || Array.isArray(alert) || typeof alert !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof alert.alertId !== 'string' || !alert.alertId.trim())
      failures.push(`${prefix}.alertId must not be empty`);
    if (!['EXPECTED', 'RESOLVED'].includes(alert.status))
      failures.push(`${prefix}.status must be EXPECTED or RESOLVED`);
  }
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
  'refund-unknown-recovery.json': validateRefundUnknownRecovery,
  'review-publish.json': validateReviewPublish,
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
      else if (timestamp > Date.now() + 5 * 60_000)
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
