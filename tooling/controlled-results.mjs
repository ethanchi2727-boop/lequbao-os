import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const digest = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(digest.digest('hex')));
  });

const safeTime = (value) => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
};

const unexpectedKeys = (value, allowed) =>
  Object.keys(value ?? {}).filter((key) => !allowed.includes(key));

export async function verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }) {
  const failures = [];
  if (!/^[a-f0-9]{40}$/u.test(releaseCommit ?? ''))
    return ['RELEASE_COMMIT must be the exact 40-character candidate commit'];
  let results;
  let resultsRoot;
  try {
    const absolute = path.resolve(resultsFile);
    resultsRoot = path.dirname(absolute);
    results = JSON.parse(await readFile(absolute, 'utf8'));
  } catch {
    return ['CONTROLLED_RESULTS_FILE is missing or invalid JSON'];
  }
  if (!results || Array.isArray(results) || typeof results !== 'object')
    return ['CONTROLLED_RESULTS_FILE must contain a JSON object'];
  if (results.version !== 1) failures.push('controlled results version must be 1');
  const extraResultKeys = unexpectedKeys(results, [
    'version',
    'releaseCommit',
    'planSha256',
    'generatedAt',
    'suites',
  ]);
  if (extraResultKeys.length)
    failures.push(`controlled results contain undeclared fields: ${extraResultKeys.join(', ')}`);
  if (results.releaseCommit !== releaseCommit)
    failures.push('controlled results are not bound to RELEASE_COMMIT');
  const expectedPlanHash = createHash('sha256').update(planSource).digest('hex');
  if (results.planSha256 !== expectedPlanHash)
    failures.push('controlled results are not bound to the current acceptance plan');
  const generatedAt = safeTime(results.generatedAt);
  if (generatedAt === undefined || generatedAt > Date.now() + 5 * 60_000)
    failures.push('controlled results generatedAt is invalid or in the future');
  if (!Array.isArray(results.suites)) return [...failures, 'controlled results suites are missing'];

  const expectedSuites = new Map(plan.suites.map((suite) => [suite.code, suite]));
  const seen = new Set();
  for (const result of results.suites) {
    if (!result || Array.isArray(result) || typeof result !== 'object') {
      failures.push('controlled results contain an invalid suite record');
      continue;
    }
    const suite = expectedSuites.get(result.code);
    if (!suite) {
      failures.push(`unknown controlled result suite ${result.code ?? ''}`);
      continue;
    }
    if (seen.has(result.code)) {
      failures.push(`duplicate controlled result suite ${result.code}`);
      continue;
    }
    seen.add(result.code);
    const extraSuiteKeys = unexpectedKeys(result, [
      'code',
      'result',
      'environmentGate',
      'executedByRole',
      'reviewedByRole',
      'startedAt',
      'completedAt',
      'evidence',
    ]);
    if (extraSuiteKeys.length)
      failures.push(`${result.code} contains undeclared fields: ${extraSuiteKeys.join(', ')}`);
    if (result.result !== 'PASS') failures.push(`${result.code} result is not PASS`);
    if (result.environmentGate !== suite.environmentGate)
      failures.push(`${result.code} environment gate does not match the plan`);
    if (result.executedByRole !== suite.executorRole)
      failures.push(`${result.code} executor role does not match the plan`);
    if (
      typeof result.reviewedByRole !== 'string' ||
      !result.reviewedByRole.trim() ||
      result.reviewedByRole === result.executedByRole
    )
      failures.push(`${result.code} requires an independent reviewer role`);
    const startedAt = safeTime(result.startedAt);
    const completedAt = safeTime(result.completedAt);
    if (startedAt === undefined || completedAt === undefined || completedAt < startedAt)
      failures.push(`${result.code} has invalid execution timestamps`);
    else {
      if (startedAt > Date.now() + 5 * 60_000 || completedAt > Date.now() + 5 * 60_000)
        failures.push(`${result.code} execution timestamps are in the future`);
      if (generatedAt !== undefined && completedAt > generatedAt)
        failures.push(`${result.code} completed after the controlled results were generated`);
    }
    if (!Array.isArray(result.evidence)) {
      failures.push(`${result.code} evidence list is missing`);
      continue;
    }
    const evidence = new Map();
    for (const item of result.evidence) {
      if (!item || Array.isArray(item) || typeof item !== 'object') {
        failures.push(`${result.code} contains an invalid evidence record`);
        continue;
      }
      const extraEvidenceKeys = unexpectedKeys(item, ['file', 'sha256']);
      if (extraEvidenceKeys.length)
        failures.push(
          `${result.code} evidence contains undeclared fields: ${extraEvidenceKeys.join(', ')}`,
        );
      if (typeof item.file !== 'string' || !item.file) {
        failures.push(`${result.code} evidence file must be a non-empty relative path`);
        continue;
      }
      if (evidence.has(item.file)) failures.push(`${result.code} duplicates evidence ${item.file}`);
      evidence.set(item.file, item);
    }
    for (const requiredFile of suite.requiredEvidence) {
      const expectedRelative = path.posix.join(suite.evidenceDirectory, requiredFile);
      const item = evidence.get(expectedRelative);
      if (!item) {
        failures.push(`${result.code} is missing evidence ${expectedRelative}`);
        continue;
      }
      if (!/^[a-f0-9]{64}$/u.test(item.sha256 ?? '')) {
        failures.push(`${result.code} has invalid SHA-256 for ${expectedRelative}`);
        continue;
      }
      const absolute = path.resolve(resultsRoot, ...expectedRelative.split('/'));
      const relative = path.relative(resultsRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        failures.push(`${result.code} evidence escapes the controlled results directory`);
        continue;
      }
      try {
        const [physicalRoot, physicalFile] = await Promise.all([
          realpath(resultsRoot),
          realpath(absolute),
        ]);
        const physicalRelative = path.relative(physicalRoot, physicalFile);
        if (physicalRelative.startsWith('..') || path.isAbsolute(physicalRelative)) {
          failures.push(
            `${result.code} evidence resolves outside the controlled results directory`,
          );
          continue;
        }
        const actual = await sha256File(physicalFile);
        if (actual !== item.sha256)
          failures.push(`${result.code} evidence hash mismatch for ${expectedRelative}`);
      } catch {
        failures.push(`${result.code} evidence file is missing: ${expectedRelative}`);
      }
    }
    const unexpected = [...evidence.keys()].filter(
      (file) =>
        !suite.requiredEvidence.some(
          (requiredFile) => file === path.posix.join(suite.evidenceDirectory, requiredFile),
        ),
    );
    if (unexpected.length)
      failures.push(`${result.code} contains undeclared evidence: ${unexpected.join(', ')}`);
  }
  for (const code of expectedSuites.keys())
    if (!seen.has(code)) failures.push(`controlled result suite is missing: ${code}`);
  return failures;
}
