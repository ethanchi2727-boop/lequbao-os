import { readFile } from 'node:fs/promises';
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

async function readCsv(relativePath) {
  return parseCsv(await readFile(resolve(root, relativePath), 'utf8'));
}

const [coreTests, extendedTests, pages, stageMap] = await Promise.all([
  readCsv('docs/v6.1/source-package/06_测试验收与质量门禁/V6.1_P0测试清单.csv'),
  readCsv('docs/v6.1/source-package/06_测试验收与质量门禁/测试验收清单.csv'),
  readCsv('docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树.csv'),
  readFile(resolve(root, 'docs/release/release-stage-map.json'), 'utf8').then(JSON.parse),
]);

const failures = [];
const tests = [...coreTests, ...extendedTests];
const testIds = new Set(tests.map((test) => test.test_id));
const prefixStages = new Map();

for (const [stage, prefixes] of Object.entries(stageMap.stages)) {
  const stageNumber = Number(stage);
  if (!Number.isInteger(stageNumber) || stageNumber < 2 || stageNumber > 10) {
    failures.push(`invalid stage number: ${stage}`);
  }
  for (const prefix of prefixes) {
    if (prefixStages.has(prefix)) failures.push(`duplicate test prefix mapping: ${prefix}`);
    prefixStages.set(prefix, stageNumber);
  }
}

if (coreTests.length !== 46) failures.push(`expected 46 core P0 tests, found ${coreTests.length}`);
if (extendedTests.length !== 97)
  failures.push(`expected 97 extended acceptance tests, found ${extendedTests.length}`);
if (tests.length !== 143)
  failures.push(`expected 143 total acceptance tests, found ${tests.length}`);
if (testIds.size !== tests.length) failures.push('acceptance test ids are not unique');

for (const test of tests) {
  const prefix = test.test_id.split('-')[0];
  if (!prefixStages.has(prefix)) failures.push(`unmapped acceptance test: ${test.test_id}`);
}

const leaves = pages.filter((page) => page.is_leaf === 'true');
const leafRoutes = leaves.map((page) => page.route);
if (pages.length !== 307) failures.push(`expected 307 page nodes, found ${pages.length}`);
if (leaves.length !== 197) failures.push(`expected 197 leaf pages, found ${leaves.length}`);
if (new Set(leafRoutes).size !== leafRoutes.length)
  failures.push('leaf page routes are not unique');

for (const page of leaves) {
  const states = page.states.split(';').filter(Boolean);
  if (!page.route.startsWith('/')) failures.push(`leaf page has no stable route: ${page.page_id}`);
  if (states.length !== 8) failures.push(`leaf page lacks eight states: ${page.page_id}`);
}

if (failures.length > 0) {
  throw new Error(`Release readiness plan verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(
  `Release plan verified: ${tests.length} acceptance tests mapped across stages 2-10; ${pages.length} page nodes and ${leaves.length} leaf routes accounted for.`,
);
