import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { inspectOperationsAlerts, requiredAlertCodes } from './operations-alert-policy.mjs';
const alerts = parse(await readFile('ops/alerts.yaml', 'utf8')),
  failures = inspectOperationsAlerts(alerts);
for (const file of [
  'docs/runbooks/P0_ALERT_AND_FREEZE.md',
  'docs/runbooks/BACKUP_RESTORE.md',
  'docs/runbooks/MIGRATION_ROLLBACK.md',
  'docs/runbooks/PERFORMANCE_ACCEPTANCE.md',
  'docs/security/THREAT_MODEL_AND_DATA_FLOW.md',
  'ops/feature-flags.yaml',
  'ops/scripts/backup-postgres.ps1',
  'ops/scripts/restore-verify.ps1',
  'ops/sql/financial-snapshot.sql',
  'tooling/performance-gate.mjs',
]) {
  try {
    if ((await readFile(file, 'utf8')).trim().length < 100)
      failures.push(`incomplete operations artifact ${file}`);
  } catch {
    failures.push(`missing operations artifact ${file}`);
  }
}
const performanceGate = `${await readFile('tooling/performance-gate.mjs', 'utf8')}\n${await readFile(
  'tooling/performance-gate-lib.mjs',
  'utf8',
)}`;
for (const marker of [
  'PERFORMANCE_DATABASE_URL',
  'conversation_messages',
  'messageBacklog',
  'writeFile',
])
  if (!performanceGate.includes(marker))
    failures.push(`performance evidence boundary missing ${marker}`);
const backupRestore = `${await readFile('ops/scripts/backup-postgres.ps1', 'utf8')}\n${await readFile(
  'ops/scripts/restore-verify.ps1',
  'utf8',
)}\n${await readFile('ops/sql/financial-snapshot.sql', 'utf8')}`;
for (const marker of [
  'financialSnapshotSha256',
  'encrypted backup hash mismatch',
  'RPO exceeds 300 seconds',
  'RTO exceeds 3600 seconds',
  'databaseFixturesPassed',
  'reward_entry_net_cents',
])
  if (!backupRestore.includes(marker))
    failures.push(`backup/restore evidence boundary missing ${marker}`);
const migration = await readFile(
  'database/migrations/0015_operations_migration_and_privacy.sql',
  'utf8',
);
for (const marker of [
  'migration cannot switch with unexplained difference or missing reconciliation',
  'enqueue_restore_privacy_deletions',
  'legacy_migration_cursors',
  'privacy_deletion_propagation_tasks',
])
  if (!migration.includes(marker)) failures.push(`missing migration safety marker ${marker}`);
if (failures.length) {
  for (const failure of failures) console.error(`Operations gate failure: ${failure}`);
  process.exitCode = 1;
} else
  console.log(
    `Operations gate verified ${requiredAlertCodes.length} mandatory alerts, migration/restore/privacy controls and runbooks.`,
  );
