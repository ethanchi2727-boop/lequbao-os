import { access, readFile } from 'node:fs/promises';
import { verifyControlledResults } from './controlled-results.mjs';

function parseCsv(source) {
  source = source.replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((columns) =>
    Object.fromEntries(headers.map((header, i) => [header, columns[i]])),
  );
}

const sources = [
  'docs/v6.1/source-package/06_测试验收与质量门禁/V6.1_P0测试清单.csv',
  'docs/v6.1/source-package/06_测试验收与质量门禁/测试验收清单.csv',
];
const tests = (
  await Promise.all(sources.map(async (file) => parseCsv(await readFile(file, 'utf8'))))
).flat();
const evidenceMap = JSON.parse(await readFile('docs/release/acceptance-evidence-map.json', 'utf8'));
const controlledPlanSource = await readFile(evidenceMap.controlledAcceptancePlan, 'utf8');
const controlledPlan = JSON.parse(controlledPlanSource);
const allowedStatuses = new Set(['LOCAL_PASS', 'LOCAL_REVIEWED', 'CONTROLLED_ENV_REQUIRED']);
const failures = [];
const counts = new Map();
for (const test of tests) {
  const prefix = test.test_id.split('-')[0];
  const evidence = evidenceMap.prefixEvidence[prefix];
  if (!Array.isArray(evidence) || evidence.length === 0) {
    failures.push(`${test.test_id} has no evidence source`);
    continue;
  }
  for (const file of evidence) {
    try {
      await access(file);
    } catch {
      failures.push(`${test.test_id} evidence does not exist: ${file}`);
    }
  }
  const status = evidenceMap.statusOverrides[test.test_id] ?? evidenceMap.defaultStatus;
  if (!allowedStatuses.has(status)) failures.push(`${test.test_id} has invalid status ${status}`);
  counts.set(status, (counts.get(status) ?? 0) + 1);
}
for (const testId of Object.keys(evidenceMap.statusOverrides))
  if (!tests.some((test) => test.test_id === testId))
    failures.push(`unknown status override ${testId}`);
if (tests.length !== 143) failures.push(`expected 143 acceptance cases, found ${tests.length}`);
const launch = process.argv.includes('--launch');
if (!Array.isArray(evidenceMap.launchExternalGates) || evidenceMap.launchExternalGates.length !== 7)
  failures.push('seven explicit external launch gates are required');

const controlledIds = tests
  .filter(
    (test) =>
      (evidenceMap.statusOverrides[test.test_id] ?? evidenceMap.defaultStatus) ===
      'CONTROLLED_ENV_REQUIRED',
  )
  .map((test) => test.test_id)
  .sort();
const expectedEnvironmentGates = new Set([
  'POSTGRESQL',
  'WECHAT',
  'PAYMENT_REFUND',
  'GEO_PLUGIN',
  'BACKUP_RESTORE',
  'PERFORMANCE',
  'IDENTITY_OBJECT_PRIVACY',
]);
const mandatoryControlledEvidence = new Map([
  ['PAYMENT_PROVIDER_SANDBOX', ['financial-policy-approvals.json']],
  ['PERFORMANCE_CORE_AND_MESSAGES', ['candidate-image-digests.json']],
  ['IDENTITY_SECRETS_PRIVACY_ONCALL', ['legal-document-release.json']],
]);
if (controlledPlan.version !== 1 || !Array.isArray(controlledPlan.suites)) {
  failures.push('controlled acceptance plan is invalid');
} else {
  const suiteCodes = new Set();
  const plannedIds = [];
  const environmentGates = new Set();
  for (const suite of controlledPlan.suites) {
    const caseIds = Array.isArray(suite.caseIds) ? suite.caseIds : [];
    if (!suite.code || suiteCodes.has(suite.code))
      failures.push(`controlled suite has missing or duplicate code ${suite.code ?? ''}`);
    suiteCodes.add(suite.code);
    environmentGates.add(suite.environmentGate);
    if (!Array.isArray(suite.caseIds) || (!suite.externalOnly && caseIds.length === 0))
      failures.push(`${suite.code} must map cases or be explicitly external-only`);
    if (suite.externalOnly && caseIds.length)
      failures.push(`${suite.code} external-only suite cannot map acceptance cases`);
    plannedIds.push(...caseIds);
    for (const field of ['executorRole', 'runbook', 'evidenceDirectory'])
      if (typeof suite[field] !== 'string' || !suite[field].trim())
        failures.push(`${suite.code} is missing ${field}`);
    for (const field of ['requiredEvidence', 'passCriteria'])
      if (!Array.isArray(suite[field]) || suite[field].length === 0)
        failures.push(`${suite.code} is missing ${field}`);
    for (const requiredFile of mandatoryControlledEvidence.get(suite.code) ?? [])
      if (!suite.requiredEvidence?.includes(requiredFile))
        failures.push(`${suite.code} must require ${requiredFile}`);
    if (
      Array.isArray(suite.requiredEvidence) &&
      suite.requiredEvidence.some((file) => !/^[a-z0-9][a-z0-9._-]+$/u.test(file))
    )
      failures.push(`${suite.code} contains an unsafe evidence filename`);
    if (!/^[a-z0-9-]+$/u.test(suite.evidenceDirectory ?? ''))
      failures.push(`${suite.code} has unsafe evidence directory`);
    const runbookFile = String(suite.runbook ?? '').split('#')[0];
    try {
      await access(runbookFile);
    } catch {
      failures.push(`${suite.code} runbook does not exist: ${runbookFile}`);
    }
  }
  const duplicateIds = plannedIds.filter((id, index) => plannedIds.indexOf(id) !== index);
  if (duplicateIds.length)
    failures.push(
      `controlled cases mapped more than once: ${[...new Set(duplicateIds)].join(', ')}`,
    );
  const sortedPlannedIds = [...plannedIds].sort();
  if (JSON.stringify(sortedPlannedIds) !== JSON.stringify(controlledIds))
    failures.push('controlled acceptance plan does not map exactly the 29 pending cases');
  if (
    environmentGates.size !== expectedEnvironmentGates.size ||
    [...expectedEnvironmentGates].some((gate) => !environmentGates.has(gate))
  )
    failures.push('controlled acceptance plan does not cover all seven external gates');
}
if (launch) {
  if (!process.env.CONTROLLED_RESULTS_FILE) {
    failures.push('CONTROLLED_RESULTS_FILE is required for launch');
  } else {
    failures.push(
      ...(await verifyControlledResults({
        plan: controlledPlan,
        planSource: controlledPlanSource,
        resultsFile: process.env.CONTROLLED_RESULTS_FILE,
        releaseCommit: process.env.RELEASE_COMMIT,
      })),
    );
  }
}

const surfaceReadiness = evidenceMap.surfaceReadiness;
if (!Array.isArray(surfaceReadiness) || surfaceReadiness.length !== 3) {
  failures.push('three product surface-readiness records are required');
} else {
  let totalLeaves = 0;
  let authoritativeLeaves = 0;
  for (const surface of surfaceReadiness) {
    const classifiedLeaves =
      surface.authoritativeLeaves + surface.failClosedLeaves + surface.prototypeOnlyLeaves;
    totalLeaves += surface.totalLeaves;
    authoritativeLeaves += surface.authoritativeLeaves;
    if (classifiedLeaves !== surface.totalLeaves)
      failures.push(`${surface.product} leaf readiness does not add up`);
    if (!Array.isArray(surface.evidence) || surface.evidence.length === 0) {
      failures.push(`${surface.product} has no surface-readiness evidence`);
      continue;
    }
    for (const file of surface.evidence) {
      try {
        await access(file);
      } catch {
        failures.push(`${surface.product} surface evidence does not exist: ${file}`);
      }
    }
    if (launch && (surface.failClosedLeaves > 0 || surface.prototypeOnlyLeaves > 0))
      failures.push(
        `${surface.product} launch surface is incomplete: ${surface.authoritativeLeaves}/${surface.totalLeaves} authoritative leaves`,
      );
  }
  if (totalLeaves !== 197) failures.push(`expected 197 launch leaves, found ${totalLeaves}`);
  if (!launch)
    console.log(
      `Launch surfaces mapped: ${authoritativeLeaves}/${totalLeaves} authoritative leaves.`,
    );
}

if (failures.length) {
  for (const failure of failures) console.error(`Acceptance evidence failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    launch
      ? `Launch acceptance verified: ${tests.length} cases, ${controlledPlan.suites.length} controlled suites and seven external gates are bound to the candidate commit.`
      : `Acceptance evidence mapped: ${tests.length} cases; ${counts.get('LOCAL_PASS') ?? 0} local automated, ${counts.get('LOCAL_REVIEWED') ?? 0} locally reviewed, ${counts.get('CONTROLLED_ENV_REQUIRED') ?? 0} controlled-environment pending.`,
  );
}
