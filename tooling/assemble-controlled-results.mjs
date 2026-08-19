import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyControlledResults } from './controlled-results.mjs';

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

const hashFile = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const safeTime = (value) => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
};

function assertDecision(decision, suite, generatedAt) {
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
  const startedAt = safeTime(decision.startedAt);
  const completedAt = safeTime(decision.completedAt);
  const reviewedAt = safeTime(decision.reviewedAt);
  if (
    startedAt === undefined ||
    completedAt === undefined ||
    reviewedAt === undefined ||
    completedAt < startedAt ||
    reviewedAt < completedAt ||
    reviewedAt > generatedAt
  )
    throw new Error(`${suite.code} execution and review chronology is invalid`);
}

async function evidenceRecord(root, suite, file) {
  const relative = path.posix.join(suite.evidenceDirectory, file);
  const absolute = path.resolve(root, ...relative.split('/'));
  const relativeToRoot = path.relative(root, absolute);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot))
    throw new Error(`${suite.code} evidence escapes the evidence root: ${relative}`);
  const [physicalRoot, physicalFile] = await Promise.all([realpath(root), realpath(absolute)]);
  const physicalRelative = path.relative(physicalRoot, physicalFile);
  if (physicalRelative.startsWith('..') || path.isAbsolute(physicalRelative))
    throw new Error(`${suite.code} evidence resolves outside the evidence root: ${relative}`);
  return { file: relative, sha256: await hashFile(physicalFile) };
}

export async function assembleControlledResults({
  plan,
  planSource,
  decisions,
  evidenceRoot,
  generatedAt = new Date().toISOString(),
}) {
  if (!path.isAbsolute(evidenceRoot)) throw new Error('evidenceRoot must be absolute');
  if (!decisions || Array.isArray(decisions) || typeof decisions !== 'object')
    throw new Error('decisions must be an object');
  if (decisions.version !== 1) throw new Error('decisions version must be 1');
  if (!/^[a-f0-9]{40}$/u.test(decisions.releaseCommit ?? ''))
    throw new Error('decisions releaseCommit must be an exact lowercase 40-character SHA');
  if (!Array.isArray(decisions.suites)) throw new Error('decisions suites are required');
  const generatedMilliseconds = safeTime(generatedAt);
  if (generatedMilliseconds === undefined) throw new Error('generatedAt must be a UTC timestamp');
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
    assertDecision(decision, suite, generatedMilliseconds);
    const evidence = [];
    for (const file of suite.requiredEvidence)
      evidence.push(await evidenceRecord(evidenceRoot, suite, file));
    suites.push({ ...decision, evidence });
  }
  return {
    version: 2,
    releaseCommit: decisions.releaseCommit,
    planSha256: createHash('sha256').update(planSource).digest('hex'),
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
