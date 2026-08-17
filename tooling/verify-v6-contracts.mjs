import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const schema = await read('database/schema.sql');
const sourceSchema = await read(
  'docs/v6.1/source-package/05_数据API事件权限与安全/database/schema.sql',
);
const migration = await read('database/migrations/0002_v6_1_永久收益权与AI对话建档.sql');
const pageStats = JSON.parse(
  await read('docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树统计.json'),
);
const events = await read(
  'docs/v6.1/source-package/05_数据API事件权限与安全/events/领域事件目录.csv',
);

const failures = [];
const tableCount = [...schema.matchAll(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim)].length;
const sourceTableCount = [...sourceSchema.matchAll(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim)]
  .length;
if (sourceTableCount !== 73)
  failures.push(`expected 73 source-package tables, found ${sourceTableCount}`);
if (tableCount !== 77) failures.push(`expected 77 audited target tables, found ${tableCount}`);
if (pageStats.total_nodes !== 307)
  failures.push(`expected 307 page nodes, found ${pageStats.total_nodes}`);
if (pageStats.leaf_pages !== 197)
  failures.push(`expected 197 leaf pages, found ${pageStats.leaf_pages}`);
if (events.trim().split(/\r?\n/u).length - 1 !== 46) failures.push('expected 46 domain events');
if (/^\+/mu.test(migration)) failures.push('migration contains accidental diff markers');
if (!schema.includes('ENABLE ROW LEVEL SECURITY')) failures.push('schema does not enable RLS');
if (!schema.includes('CREATE TRIGGER audit_logs_immutable'))
  failures.push('immutable audit trigger missing');

if (failures.length > 0) {
  for (const failure of failures) console.error(`V6 contract failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'V6 contracts verified: 73 source tables, 77 audited target tables, 307 nodes, 197 leaves, 46 domain events, RLS and audit guards.',
  );
}
