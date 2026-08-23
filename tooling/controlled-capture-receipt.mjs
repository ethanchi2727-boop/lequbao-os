import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { inspectControlledEvidenceFile } from './controlled-evidence.mjs';
import { parseCanonicalUtcTimestamp } from './canonical-time.mjs';

const receiptFields = [
  'version',
  'releaseCommit',
  'planSha256',
  'deploymentId',
  'environment',
  'suiteCode',
  'artifact',
  'sha256',
  'size',
  'capturedAt',
];

export function captureReceiptPath(evidenceRoot, suite, artifact) {
  return path.join(
    evidenceRoot,
    '.controlled-receipts',
    suite.evidenceDirectory,
    `${artifact}.receipt.json`,
  );
}

export async function inspectCaptureReceipt({
  evidenceRoot,
  suite,
  artifact,
  evidenceInspection,
  context,
  expectedPlanHash,
}) {
  const failures = [];
  const receiptFile = captureReceiptPath(evidenceRoot, suite, artifact);
  try {
    const [physicalRoot, physicalReceipt] = await Promise.all([
      realpath(evidenceRoot),
      realpath(receiptFile),
    ]);
    const relative = path.relative(physicalRoot, physicalReceipt);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      return { failures: ['capture receipt resolves outside the evidence workspace'] };
    const inspection = await inspectControlledEvidenceFile(physicalReceipt);
    for (const reason of inspection.failures) failures.push(`capture receipt ${reason}`);
    let receipt;
    try {
      receipt = JSON.parse(await readFile(physicalReceipt, 'utf8'));
    } catch {
      failures.push('capture receipt is invalid JSON');
      return { failures, sha256: inspection.sha256 };
    }
    const extra = Object.keys(receipt ?? {}).filter((key) => !receiptFields.includes(key));
    if (extra.length) failures.push(`capture receipt has undeclared fields: ${extra.join(', ')}`);
    const missing = receiptFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(receipt ?? {}, field),
    );
    if (missing.length) failures.push(`capture receipt is missing fields: ${missing.join(', ')}`);
    const expected = {
      version: 1,
      releaseCommit: context.releaseCommit,
      planSha256: expectedPlanHash,
      deploymentId: context.deploymentId,
      environment: context.environment,
      suiteCode: suite.code,
      artifact,
      sha256: evidenceInspection.sha256,
      size: evidenceInspection.sizeBytes,
    };
    for (const [field, value] of Object.entries(expected))
      if (receipt?.[field] !== value) failures.push(`capture receipt ${field} does not match`);
    const capturedAt = parseCanonicalUtcTimestamp(receipt?.capturedAt);
    if (capturedAt === undefined || capturedAt > Date.now() + 5 * 60_000)
      failures.push('capture receipt capturedAt is invalid or in the future');
    const contextCreatedAt = parseCanonicalUtcTimestamp(context?.createdAt);
    if (capturedAt !== undefined && contextCreatedAt !== undefined && capturedAt < contextCreatedAt)
      failures.push('capture receipt capturedAt predates the evidence workspace');
    return { failures, sha256: inspection.sha256, capturedAt };
  } catch {
    return { failures: ['capture receipt is missing'] };
  }
}
