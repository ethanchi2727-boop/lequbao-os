import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('backup and restore evidence boundary', () => {
  it('binds encrypted backup evidence to cutoff time and per-tenant financial facts', async () => {
    const backup = await readFile('ops/scripts/backup-postgres.ps1', 'utf8');
    const snapshot = await readFile('ops/sql/financial-snapshot.sql', 'utf8');
    expect(backup).toContain('BACKUP_DRILL_WRITE_FROZEN');
    expect(backup).toContain('financialSnapshotSha256');
    expect(backup).toContain('source financial snapshot has invalid tenant coverage');
    expect(snapshot).toContain('FROM tenants t LEFT JOIN per_tenant p ON p.tenant_id=t.id');
    expect(snapshot).toContain("encode(digest(t.id::text,'sha256'),'hex')");
    expect(snapshot).not.toContain('jsonb_object_agg(t.id::text');
    expect(backup).not.toContain('DATABASE_URL =');
    expect(backup).toContain("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    expect(backup).not.toContain("ToString('o')");
    expect(backup).toContain('[System.IO.Path]::GetTempPath()');
    expect(backup).toContain('if (-not $published)');
    expect(backup).not.toContain('$plain = Join-Path $resolved');
    expect(backup).toContain('[Text.UTF8Encoding]::new($false)');
    expect(backup).toContain('[IO.File]::Move($manifestTemp, $manifestPath)');
    for (const metric of [
      'orders_payable_cents',
      'verified_payment_cents',
      'succeeded_refund_cents',
      'verification_quantity',
      'reward_entry_net_cents',
    ])
      expect(snapshot).toContain(metric);
  });

  it('fails closed on hash, reconciliation, RPO, RTO, privacy or database fixture evidence', async () => {
    const restore = await readFile('ops/scripts/restore-verify.ps1', 'utf8');
    for (const marker of [
      'encrypted backup hash mismatch',
      'restored financial totals differ',
      'RPO exceeds 300 seconds',
      'RTO exceeds 3600 seconds',
      'privacy deletion replay enqueue failed',
      'restore drill contains no privacy deletion replay evidence',
      'database fixture failed',
      'databaseFixturesPassed',
      'RESTORE_DRILL_CONFIRMED_NON_PRODUCTION=true is required',
      'refusing a production-shaped restore target',
      'backup manifest fields are incomplete or undeclared',
      'backup manifest filename mismatch',
      'backup manifest digest format is invalid',
      'encrypted backup size mismatch',
      'backup manifest chronology is invalid',
      'backup or failure timestamp is not canonical UTC',
      'drill failure time is in the future',
      'RTO cannot be negative',
    ])
      expect(restore).toContain(marker);
    expect(restore).toContain('$manifest.writeFrozen -isnot [bool]');
    expect(restore).toContain("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    expect(restore).not.toContain("ToString('o')");
    expect(restore).toContain('[Text.UTF8Encoding]::new($false)');
    expect(restore).toContain('[IO.File]::Move($reportTemp, $reportFile)');
    expect(restore).toContain('targetDatabaseRefHash = Get-TextSha256 $TargetDatabase');
    expect(restore).toContain('fixtureDatabaseRefHash = Get-TextSha256 $fixtureDatabase');
    expect(restore).not.toContain('targetDatabase = $TargetDatabase');
    expect(restore).not.toContain('fixtureDatabase = $fixtureDatabase');
    expect(restore).not.toContain('[IO.File]::WriteAllText(\n    $reportFile');
    expect(restore).toContain('$env:RESTORE_DRILL_ENVIRONMENT -notin');
    expect(restore).toContain('if ($fixtureCreated)');
    expect(restore).toContain('$fixtureCreated = $true');
  });
});
