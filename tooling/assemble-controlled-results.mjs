import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyControlledResults } from './controlled-results.mjs';
import { inspectControlledEvidenceFile } from './controlled-evidence.mjs';
import { inspectControlledJsonEvidence } from './controlled-evidence-contracts.mjs';
import { inspectControlledSuiteEvidence } from './controlled-suite-evidence.mjs';
import { inspectCaptureReceipt } from './controlled-capture-receipt.mjs';
import { parseCanonicalUtcTimestamp } from './canonical-time.mjs';
import { assertControlledPlanSource } from './controlled-plan-source.mjs';

const suiteFields = [
  'code',
  'result',
  'environmentGate',
  'executedById',
  'executedByRole',
  'reviewedById',
  'reviewedByRole',
  'startedAt',
  'completedAt',
  'reviewedAt',
];

const opaqueLabel = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function assertDecision(decision, suite, generatedAt, workspaceCreatedAt) {
  if (!decision || Array.isArray(decision) || typeof decision !== 'object')
    throw new Error(`${suite.code} decision must be an object`);
  const extra = Object.keys(decision).filter((key) => !suiteFields.includes(key));
  if (extra.length)
    throw new Error(`${suite.code} decision has undeclared fields: ${extra.join(', ')}`);
  if (decision.result !== 'PASS') throw new Error(`${suite.code} decision must be PASS`);
  if (decision.environmentGate !== suite.environmentGate)
    throw new Error(`${suite.code} environment gate does not match the plan`);
  if (decision.executedByRole !== suite.executorRole)
    throw new Error(`${suite.code} executor role does not match the plan`);
  const subject = /^(?:github|org|workforce):[a-zA-Z0-9._-]{1,128}$/u;
  if (!subject.test(decision.executedById ?? '') || !subject.test(decision.reviewedById ?? ''))
    throw new Error(`${suite.code} requires approved opaque accountable subjects`);
  if (decision.executedById === decision.reviewedById)
    throw new Error(`${suite.code} executor and reviewer must be different people`);
  if (
    typeof decision.reviewedByRole !== 'string' ||
    !decision.reviewedByRole.trim() ||
    decision.reviewedByRole === decision.executedByRole
  )
    throw new Error(`${suite.code} reviewer role must be independent`);
  const startedAt = parseCanonicalUtcTimestamp(decision.startedAt);
  const completedAt = parseCanonicalUtcTimestamp(decision.completedAt);
  const reviewedAt = parseCanonicalUtcTimestamp(decision.reviewedAt);
  if (
    startedAt === undefined ||
    completedAt === undefined ||
    reviewedAt === undefined ||
    startedAt < workspaceCreatedAt ||
    completedAt < startedAt ||
    reviewedAt < completedAt ||
    startedAt > Date.now() + 5 * 60_000 ||
    completedAt > Date.now() + 5 * 60_000 ||
    reviewedAt > Date.now() + 5 * 60_000 ||
    reviewedAt > generatedAt
  )
    throw new Error(`${suite.code} execution and review chronology is invalid`);
}

async function evidenceRecord(root, suite, file, context, expectedPlanHash, generatedAt) {
  const relative = path.posix.join(suite.evidenceDirectory, file);
  const absolute = path.resolve(root, ...relative.split('/'));
  const relativeToRoot = path.relative(root, absolute);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot))
    throw new Error(`${suite.code} evidence escapes the evidence root: ${relative}`);
  const [physicalRoot, physicalFile] = await Promise.all([realpath(root), realpath(absolute)]);
  const physicalRelative = path.relative(physicalRoot, physicalFile);
  if (physicalRelative.startsWith('..') || path.isAbsolute(physicalRelative))
    throw new Error(`${suite.code} evidence resolves outside the evidence root: ${relative}`);
  const inspection = await inspectControlledEvidenceFile(physicalFile);
  if (inspection.failures.length)
    throw new Error(
      `${suite.code} evidence is invalid: ${relative}: ${inspection.failures.join(', ')}`,
    );
  const semanticFailures = await inspectControlledJsonEvidence(physicalFile, file, context);
  if (semanticFailures.length)
    throw new Error(
      `${suite.code} evidence violates its semantic contract: ${relative}: ${semanticFailures.join(', ')}`,
    );
  const receipt = await inspectCaptureReceipt({
    evidenceRoot: root,
    suite,
    artifact: file,
    evidenceInspection: inspection,
    context,
    expectedPlanHash,
  });
  if (receipt.failures.length)
    throw new Error(
      `${suite.code} capture receipt is invalid: ${relative}: ${receipt.failures.join(', ')}`,
    );
  if (receipt.capturedAt !== undefined && receipt.capturedAt > generatedAt)
    throw new Error(`${suite.code} capture receipt is later than result generation: ${relative}`);
  return {
    file: relative,
    sha256: inspection.sha256,
    captureReceiptSha256: receipt.sha256,
  };
}

export async function assembleControlledResults({
  plan,
  planSource,
  decisions,
  evidenceRoot,
  generatedAt = new Date().toISOString(),
}) {
  if (!path.isAbsolute(evidenceRoot)) throw new Error('evidenceRoot must be absolute');
  assertControlledPlanSource(plan, planSource);
  if (!decisions || Array.isArray(decisions) || typeof decisions !== 'object')
    throw new Error('decisions must be an object');
  const extraDecisionFields = Object.keys(decisions).filter(
    (field) => !['version', 'releaseCommit', 'suites'].includes(field),
  );
  if (extraDecisionFields.length)
    throw new Error(`decisions have undeclared fields: ${extraDecisionFields.join(', ')}`);
  if (decisions.version !== 1) throw new Error('decisions version must be 1');
  if (!/^[a-f0-9]{40}$/u.test(decisions.releaseCommit ?? ''))
    throw new Error('decisions releaseCommit must be an exact lowercase 40-character SHA');
  if (!Array.isArray(decisions.suites)) throw new Error('decisions suites are required');
  const expectedPlanHash = createHash('sha256').update(planSource).digest('hex');
  let context;
  try {
    context = JSON.parse(
      await readFile(path.join(evidenceRoot, 'controlled-execution-context.json'), 'utf8'),
    );
  } catch {
    throw new Error('controlled execution context is missing or invalid');
  }
  const contextFields = [
    'version',
    'releaseCommit',
    'planSha256',
    'deploymentId',
    'environment',
    'createdAt',
    'suiteCount',
    'requiredArtifactCount',
  ];
  const extraContextFields = Object.keys(context ?? {}).filter(
    (field) => !contextFields.includes(field),
  );
  const missingContextFields = contextFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(context ?? {}, field),
  );
  if (extraContextFields.length || missingContextFields.length)
    throw new Error('controlled execution context fields do not match the exact schema');
  const requiredArtifactCount = plan.suites.reduce(
    (total, suite) => total + suite.requiredEvidence.length,
    0,
  );
  if (
    context?.version !== 1 ||
    context.releaseCommit !== decisions.releaseCommit ||
    context.planSha256 !== expectedPlanHash ||
    !opaqueLabel.test(context.deploymentId ?? '') ||
    !opaqueLabel.test(context.environment ?? '') ||
    context.suiteCount !== plan.suites.length ||
    context.requiredArtifactCount !== requiredArtifactCount
  )
    throw new Error('controlled execution context does not match the decision candidate and plan');
  const generatedMilliseconds = parseCanonicalUtcTimestamp(generatedAt);
  if (generatedMilliseconds === undefined || generatedMilliseconds > Date.now() + 5 * 60_000)
    throw new Error('generatedAt must be a canonical non-future millisecond UTC timestamp');
  const contextCreatedAt = parseCanonicalUtcTimestamp(context.createdAt);
  if (
    contextCreatedAt === undefined ||
    contextCreatedAt > Date.now() + 5 * 60_000 ||
    contextCreatedAt > generatedMilliseconds
  )
    throw new Error('controlled execution context creation time is invalid');
  const byCode = new Map();
  for (const decision of decisions.suites) {
    if (!decision?.code || byCode.has(decision.code))
      throw new Error(`decision suite code is missing or duplicated: ${decision?.code ?? ''}`);
    byCode.set(decision.code, decision);
  }
  const expectedCodes = new Set(plan.suites.map((suite) => suite.code));
  const extraCodes = [...byCode.keys()].filter((code) => !expectedCodes.has(code));
  if (extraCodes.length) throw new Error(`unknown decision suites: ${extraCodes.join(', ')}`);

  const suites = [];
  for (const suite of plan.suites) {
    const decision = byCode.get(suite.code);
    if (!decision) throw new Error(`decision suite is missing: ${suite.code}`);
    assertDecision(decision, suite, generatedMilliseconds, contextCreatedAt);
    const evidence = [];
    for (const file of suite.requiredEvidence)
      evidence.push(
        await evidenceRecord(
          evidenceRoot,
          suite,
          file,
          context,
          expectedPlanHash,
          generatedMilliseconds,
        ),
      );
    const suiteFailures = await inspectControlledSuiteEvidence(evidenceRoot, suite);
    if (suiteFailures.length)
      throw new Error(`${suite.code} cross-evidence contract failed: ${suiteFailures.join(', ')}`);
    suites.push({ ...decision, evidence });
  }
  return {
    version: 3,
    releaseCommit: decisions.releaseCommit,
    planSha256: expectedPlanHash,
    generatedAt,
    suites,
  };
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decisionsFile = argument('decisions');
  const evidenceRoot = argument('evidence-root');
  if (!decisionsFile || !path.isAbsolute(decisionsFile))
    throw new Error('--decisions must be an absolute path');
  if (!evidenceRoot || !path.isAbsolute(evidenceRoot))
    throw new Error('--evidence-root must be an absolute path');
  const output = path.join(evidenceRoot, 'results.json');
  const planSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
  const plan = JSON.parse(planSource);
  const decisions = JSON.parse(await readFile(decisionsFile, 'utf8'));
  const results = await assembleControlledResults({ plan, planSource, decisions, evidenceRoot });
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  const failures = await verifyControlledResults({
    plan,
    planSource,
    resultsFile: output,
    releaseCommit: decisions.releaseCommit,
  });
  if (failures.length) {
    for (const failure of failures) console.error(`Controlled result assembly failure: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Controlled results assembled and verified for ${plan.suites.length} suites.`);
  }
}
