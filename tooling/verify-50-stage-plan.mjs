import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows;
  return values.map((valueRow) =>
    Object.fromEntries(headers.map((header, index) => [header, valueRow[index] ?? ''])),
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

const [plan, evidenceMap, coreSource, extendedSource] = await Promise.all([
  readJson('docs/release/50-stage-release-plan.json'),
  readJson('docs/release/acceptance-evidence-map.json'),
  readFile(
    resolve(root, 'docs/v6.1/source-package/06_测试验收与质量门禁/V6.1_P0测试清单.csv'),
    'utf8',
  ),
  readFile(
    resolve(root, 'docs/v6.1/source-package/06_测试验收与质量门禁/测试验收清单.csv'),
    'utf8',
  ),
]);

const failures = [];
const expectedIds = Array.from({ length: 50 }, (_, index) => index + 1);
const actualIds = plan.stages.map((stage) => stage.id);

if (plan.version !== 1) failures.push(`unsupported plan version: ${plan.version}`);
if (plan.stages.length !== 50) failures.push(`expected 50 stages, found ${plan.stages.length}`);
if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
  failures.push('stage ids must be the ordered integers 1 through 50');

const acceptedStatuses = new Set(['local-complete', 'controlled-pending']);
const ownedPrefixes = new Map();

for (const stage of plan.stages) {
  if (!stage.title?.trim()) failures.push(`stage ${stage.id} has no title`);
  if (!acceptedStatuses.has(stage.status))
    failures.push(`stage ${stage.id} has invalid status ${stage.status}`);
  if (!stage.selfCheck?.trim()) failures.push(`stage ${stage.id} has no self-check`);
  if (!Array.isArray(stage.evidence) || stage.evidence.length === 0)
    failures.push(`stage ${stage.id} has no evidence`);

  const expectedStatus = stage.id <= 46 ? 'local-complete' : 'controlled-pending';
  if (stage.status !== expectedStatus)
    failures.push(`stage ${stage.id} must remain ${expectedStatus}`);

  for (const prefix of stage.acceptancePrefixes ?? []) {
    if (ownedPrefixes.has(prefix))
      failures.push(
        `acceptance prefix ${prefix} is owned by both stage ${ownedPrefixes.get(prefix)} and ${stage.id}`,
      );
    ownedPrefixes.set(prefix, stage.id);
  }

  for (const evidence of stage.evidence ?? []) {
    try {
      await stat(resolve(root, evidence));
    } catch {
      failures.push(`stage ${stage.id} evidence does not exist: ${evidence}`);
    }
  }
}

const tests = [...parseCsv(coreSource), ...parseCsv(extendedSource)];
const testIds = new Set(tests.map((test) => test.test_id));
const expectedPrefixes = new Set(tests.map((test) => test.test_id.split('-')[0]));

if (tests.length !== 143 || testIds.size !== 143)
  failures.push(`expected 143 unique acceptance cases, found ${testIds.size}`);

for (const prefix of expectedPrefixes) {
  if (!ownedPrefixes.has(prefix)) failures.push(`acceptance prefix has no stage owner: ${prefix}`);
}
for (const prefix of ownedPrefixes.keys()) {
  if (!expectedPrefixes.has(prefix))
    failures.push(`stage owns unknown acceptance prefix: ${prefix}`);
}

const statusCounts = new Map();
for (const test of tests) {
  const status = evidenceMap.statusOverrides[test.test_id] ?? evidenceMap.defaultStatus;
  statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
}

for (const [status, expected] of [
  ['LOCAL_PASS', 111],
  ['LOCAL_REVIEWED', 3],
  ['CONTROLLED_ENV_REQUIRED', 29],
]) {
  if (statusCounts.get(status) !== expected)
    failures.push(`expected ${expected} ${status} cases, found ${statusCounts.get(status) ?? 0}`);
}

const surfaceTotals = evidenceMap.surfaceReadiness.reduce(
  (totals, surface) => ({
    total: totals.total + surface.totalLeaves,
    authoritative: totals.authoritative + surface.authoritativeLeaves,
  }),
  { total: 0, authoritative: 0 },
);
if (surfaceTotals.total !== 197 || surfaceTotals.authoritative !== 197)
  failures.push(
    `expected 197/197 authoritative leaves, found ${surfaceTotals.authoritative}/${surfaceTotals.total}`,
  );
if (evidenceMap.launchExternalGates.length !== 7)
  failures.push(`expected seven external gates, found ${evidenceMap.launchExternalGates.length}`);

const counts = plan.frozenCounts;
for (const [key, expected] of Object.entries({
  pageNodes: 307,
  leafPages: 197,
  acceptanceCases: 143,
  sourceTables: 73,
  targetTables: 164,
  implementedOpenApiPaths: 193,
})) {
  if (counts[key] !== expected) failures.push(`frozen count ${key} must be ${expected}`);
}

if (failures.length > 0) {
  throw new Error(`Fifty-stage release plan verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(
  `Fifty-stage plan verified: 46 local-complete, 4 controlled-pending, 143 acceptance cases and 197/197 authoritative leaves.`,
);
