import { describe, expect, it } from 'vitest';
import { capturePerformanceDatabaseSnapshot } from './performance-database-snapshot.mjs';
import { requiredDatabaseMigrationVersions } from './controlled-evidence-contracts.mjs';

const rows = () => ({
  database: {
    database_name: 'lequ-controlled',
    size_bytes: '1024',
    numbackends: 2,
    xact_commit: '10',
    xact_rollback: '1',
    blks_read: '3',
    blks_hit: '20',
    temp_files: '0',
    temp_bytes: '0',
    deadlocks: '0',
  },
  tables: { estimated_live_rows: '200', table_count: 164 },
  outbox: { active_count: 1, dead_count: 0, oldest_active_seconds: 0.5 },
  migrations: requiredDatabaseMigrationVersions.map((version) => ({ version })),
});

const database = (values) => ({
  query: async (sql) => {
    if (sql.includes('pg_stat_database')) return { rows: values.database ? [values.database] : [] };
    if (sql.includes('pg_stat_user_tables')) return { rows: values.tables ? [values.tables] : [] };
    if (sql.includes('outbox_events')) return { rows: values.outbox ? [values.outbox] : [] };
    return { rows: values.migrations ?? [] };
  },
});

describe('performance database snapshot', () => {
  it('derives the exact candidate migration inventory from repository SQL', () => {
    expect(requiredDatabaseMigrationVersions).toHaveLength(27);
    expect(requiredDatabaseMigrationVersions.at(0)).toBe('0001_baseline');
    expect(requiredDatabaseMigrationVersions.at(-1)).toBe(
      '0027_platform_consumer_identity_exchange',
    );
  });

  it('normalizes complete PostgreSQL statistics without precision loss', async () => {
    await expect(capturePerformanceDatabaseSnapshot(database(rows()))).resolves.toMatchObject({
      capturedAt: expect.stringMatching(/Z$/u),
      databaseRefHash: 'bfa064f377d805b4dbd0e84d8d0edc01fcb7efa45612eab8915eb771fb9c68e6',
      sizeBytes: 1024,
      tableCount: 164,
      migrationVersions: requiredDatabaseMigrationVersions,
      messageBacklog: { activeCount: 1, deadCount: 0, oldestActiveSeconds: 0.5 },
    });
  });

  it('rejects missing aggregate rows instead of replacing them with zero', async () => {
    const values = rows();
    values.database = undefined;
    await expect(capturePerformanceDatabaseSnapshot(database(values))).rejects.toThrow(
      'requires all aggregate rows and migrations',
    );
  });

  it('rejects non-finite, negative or imprecise counters', async () => {
    const values = rows();
    values.tables.table_count = -1;
    await expect(capturePerformanceDatabaseSnapshot(database(values))).rejects.toThrow(
      'tableCount must be a non-negative integer',
    );
    values.tables.table_count = Number.MAX_SAFE_INTEGER + 1;
    await expect(capturePerformanceDatabaseSnapshot(database(values))).rejects.toThrow(
      'tableCount must be a non-negative integer',
    );
  });

  it('rejects duplicate migration versions', async () => {
    const values = rows();
    values.migrations = [{ version: '0001_baseline' }, { version: '0001_baseline' }];
    await expect(capturePerformanceDatabaseSnapshot(database(values))).rejects.toThrow(
      'migration versions must be unique',
    );
  });
});
