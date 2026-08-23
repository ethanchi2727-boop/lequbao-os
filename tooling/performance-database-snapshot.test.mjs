import { describe, expect, it } from 'vitest';
import { capturePerformanceDatabaseSnapshot } from './performance-database-snapshot.mjs';

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
});

const database = (values) => ({
  query: async (sql) => {
    if (sql.includes('pg_stat_database')) return { rows: values.database ? [values.database] : [] };
    if (sql.includes('pg_stat_user_tables')) return { rows: values.tables ? [values.tables] : [] };
    return { rows: values.outbox ? [values.outbox] : [] };
  },
});

describe('performance database snapshot', () => {
  it('normalizes complete PostgreSQL statistics without precision loss', async () => {
    await expect(capturePerformanceDatabaseSnapshot(database(rows()))).resolves.toMatchObject({
      databaseName: 'lequ-controlled',
      sizeBytes: 1024,
      tableCount: 164,
      messageBacklog: { activeCount: 1, deadCount: 0, oldestActiveSeconds: 0.5 },
    });
  });

  it('rejects missing aggregate rows instead of replacing them with zero', async () => {
    const values = rows();
    values.database = undefined;
    await expect(capturePerformanceDatabaseSnapshot(database(values))).rejects.toThrow(
      'must each return exactly one row',
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
});
