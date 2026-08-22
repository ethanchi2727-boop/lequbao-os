import { readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
function parseCsv(source) {
  source = source.replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}
const file = 'docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树.csv',
  rows = parseCsv(await readFile(file, 'utf8'));
const leaves = rows
  .filter((row) => row.product === '乐趣宝' && row.is_leaf === 'true')
  .map((row) => ({
    id: row.page_id.toLowerCase(),
    title: row.title,
    route: row.route,
    primaryRole: row.primary_role,
    purpose: row.purpose,
    components: row.components.split(';').filter(Boolean),
    actions: row.primary_actions.split(';').filter(Boolean),
    states: row.states.split(';').filter(Boolean),
    apiDomains: row.api_domains.split(';').filter(Boolean),
    priority: row.priority,
    acceptance: row.acceptance,
  }));
const failures = [];
if (leaves.length !== 135) failures.push(`expected 135 workbench leaves, found ${leaves.length}`);
if (new Set(leaves.map((x) => x.route)).size !== leaves.length)
  failures.push('duplicate workbench leaf route');
for (const leaf of leaves) {
  if (!leaf.route.startsWith('/bao/page-')) failures.push(`invalid route ${leaf.id}`);
  if (leaf.states.length !== 8) failures.push(`missing eight states ${leaf.id}`);
}
const target = 'apps/workbench-web/src/page-contracts.mjs',
  prettierConfig = (await resolveConfig(target)) ?? {},
  content = await format(
    `// Generated from the frozen V6.1 page tree. Do not edit manually.\nexport const workbenchPageContracts = ${JSON.stringify(leaves, null, 2)};\nexport const workbenchPageById = new Map(workbenchPageContracts.map((page) => [page.id, page]));\n`,
    { ...prettierConfig, parser: 'babel' },
  );
if (process.argv.includes('--verify')) {
  let existing;
  try {
    existing = await readFile(target, 'utf8');
  } catch {
    existing = '';
  }
  if (existing !== content) failures.push('generated workbench page contracts are stale');
} else await writeFile(target, content);
if (failures.length) {
  for (const failure of failures) console.error(`Workbench contract failure: ${failure}`);
  process.exitCode = 1;
} else
  console.log(
    `Workbench contracts ${process.argv.includes('--verify') ? 'verified' : 'generated'}: ${leaves.length} leaf routes with eight states.`,
  );
