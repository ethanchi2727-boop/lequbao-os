import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { inspectControlledEvidenceFile } from './controlled-evidence.mjs';
import { inspectControlledJsonEvidence } from './controlled-evidence-contracts.mjs';
import { captureReceiptPath, inspectCaptureReceipt } from './controlled-capture-receipt.mjs';
import { assertCandidateCheckout } from './prepare-controlled-evidence.mjs';
import { parseCanonicalUtcTimestamp } from './canonical-time.mjs';
import { assertControlledPlanSource } from './controlled-plan-source.mjs';

const execFile = promisify(execFileCallback);

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function captureControlledEvidenceArtifact({
  plan,
  planSource,
  evidenceRoot,
  suiteCode,
  artifact,
  source,
  capturedAt = new Date().toISOString(),
}) {
  if (!path.isAbsolute(evidenceRoot)) throw new Error('evidenceRoot must be absolute');
  if (!path.isAbsolute(source)) throw new Error('source must be absolute');
  assertControlledPlanSource(plan, planSource);
  if (typeof artifact !== 'string' || path.basename(artifact) !== artifact || !artifact.trim())
    throw new Error('artifact must be a single non-empty file name');
  const suite = plan.suites?.find((item) => item.code === suiteCode);
  if (!suite) throw new Error(`suite is not declared by the plan: ${suiteCode}`);
  if (!suite.requiredEvidence.includes(artifact))
    throw new Error(`${suiteCode} artifact is not declared by the plan: ${artifact}`);

  const context = JSON.parse(
    await readFile(path.join(evidenceRoot, 'controlled-execution-context.json'), 'utf8'),
  );
  const expectedPlanHash = createHash('sha256').update(planSource).digest('hex');
  if (context.planSha256 !== expectedPlanHash)
    throw new Error('controlled workspace plan hash does not match the current plan');
  if (!/^[a-f0-9]{40}$/u.test(context.releaseCommit ?? ''))
    throw new Error('controlled workspace release commit is invalid');
  const capturedTimestamp = parseCanonicalUtcTimestamp(capturedAt);
  if (capturedTimestamp === undefined)
    throw new Error('capturedAt must be a canonical millisecond UTC timestamp');
  const contextCreatedAt = parseCanonicalUtcTimestamp(context.createdAt);
  if (contextCreatedAt === undefined)
    throw new Error('controlled workspace createdAt must be a canonical millisecond UTC timestamp');
  if (capturedTimestamp < contextCreatedAt)
    throw new Error('capturedAt predates the evidence workspace');

  const destinationDirectory = path.join(evidenceRoot, suite.evidenceDirectory);
  const destination = path.join(destinationDirectory, artifact);
  const [physicalRoot, physicalDirectory, physicalSource] = await Promise.all([
    realpath(evidenceRoot),
    realpath(destinationDirectory),
    realpath(source),
  ]);
  if (!inside(physicalRoot, physicalDirectory))
    throw new Error(`${suiteCode} evidence directory resolves outside the workspace`);
  if (inside(physicalRoot, physicalSource))
    throw new Error('source must be outside the controlled evidence workspace');

  const sourceInspection = await inspectControlledEvidenceFile(physicalSource);
  if (sourceInspection.failures.length)
    throw new Error(`source evidence is invalid: ${sourceInspection.failures.join(', ')}`);
  const semanticFailures = await inspectControlledJsonEvidence(physicalSource, artifact, context);
  if (semanticFailures.length)
    throw new Error(
      `source evidence violates its semantic contract: ${semanticFailures.join(', ')}`,
    );
  await copyFile(physicalSource, destination, constants.COPYFILE_EXCL);
  const destinationInspection = await inspectControlledEvidenceFile(destination);
  if (
    destinationInspection.failures.length ||
    destinationInspection.sha256 !== sourceInspection.sha256 ||
    destinationInspection.sizeBytes !== sourceInspection.sizeBytes
  )
    throw new Error('captured evidence differs from the inspected source');
  const destinationSemanticFailures = await inspectControlledJsonEvidence(
    destination,
    artifact,
    context,
  );
  if (destinationSemanticFailures.length)
    throw new Error(
      `captured evidence violates its semantic contract: ${destinationSemanticFailures.join(', ')}`,
    );
  const receipt = {
    version: 1,
    releaseCommit: context.releaseCommit,
    planSha256: expectedPlanHash,
    deploymentId: context.deploymentId,
    environment: context.environment,
    suiteCode,
    artifact,
    sha256: destinationInspection.sha256,
    size: destinationInspection.sizeBytes,
    capturedAt,
  };
  await writeFile(
    captureReceiptPath(evidenceRoot, suite, artifact),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  const receiptInspection = await inspectCaptureReceipt({
    evidenceRoot,
    suite,
    artifact,
    evidenceInspection: destinationInspection,
    context,
    expectedPlanHash,
  });
  if (receiptInspection.failures.length)
    throw new Error(
      `captured evidence receipt is invalid: ${receiptInspection.failures.join(', ')}`,
    );
  return {
    suite: suiteCode,
    artifact,
    sha256: destinationInspection.sha256,
    size: destinationInspection.sizeBytes,
    releaseCommit: context.releaseCommit,
    captureReceiptSha256: receiptInspection.sha256,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidenceRoot = argument('evidence-root');
  const suiteCode = argument('suite');
  const artifact = argument('artifact');
  const source = argument('source');
  if (!evidenceRoot || !path.isAbsolute(evidenceRoot))
    throw new Error('--evidence-root must be an absolute path');
  if (!suiteCode) throw new Error('--suite is required');
  if (!artifact) throw new Error('--artifact is required');
  if (!source || !path.isAbsolute(source)) throw new Error('--source must be an absolute path');
  const planSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
  const plan = JSON.parse(planSource);
  const context = JSON.parse(
    await readFile(path.join(evidenceRoot, 'controlled-execution-context.json'), 'utf8'),
  );
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFile('git', ['rev-parse', 'HEAD']),
    execFile('git', ['status', '--porcelain']),
  ]);
  assertCandidateCheckout({
    releaseCommit: context.releaseCommit,
    headCommit: head.trim(),
    status,
  });
  const record = await captureControlledEvidenceArtifact({
    plan,
    planSource,
    evidenceRoot,
    suiteCode,
    artifact,
    source,
  });
  console.log(
    `Captured ${record.suite}/${record.artifact} (${record.size} bytes, sha256 ${record.sha256}).`,
  );
}
