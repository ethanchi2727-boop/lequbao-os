export async function capturePerformanceDatabaseSnapshot(database) {
  const [databaseStats, tableStats, outbox] = await Promise.all([
    database.query(
      `SELECT current_database() AS database_name,pg_database_size(current_database())::bigint AS size_bytes,
              numbackends,xact_commit,xact_rollback,blks_read,blks_hit,temp_files,temp_bytes,deadlocks
         FROM pg_stat_database WHERE datname=current_database()`,
    ),
    database.query(
      `SELECT COALESCE(sum(n_live_tup),0)::bigint AS estimated_live_rows,
              count(*)::integer AS table_count
         FROM pg_stat_user_tables`,
    ),
    database.query(
      `SELECT count(*) FILTER(WHERE status IN ('PENDING','FAILED','PROCESSING'))::integer AS active_count,
              count(*) FILTER(WHERE status='DEAD')::integer AS dead_count,
              COALESCE(extract(epoch FROM now()-(min(created_at)
                FILTER(WHERE status IN ('PENDING','FAILED','PROCESSING')))),0)::double precision
                AS oldest_active_seconds
         FROM outbox_events`,
    ),
  ]);
  const row = databaseStats.rows[0] ?? {};
  return {
    databaseName: row.database_name,
    sizeBytes: Number(row.size_bytes ?? 0),
    connections: Number(row.numbackends ?? 0),
    committedTransactions: Number(row.xact_commit ?? 0),
    rolledBackTransactions: Number(row.xact_rollback ?? 0),
    blocksRead: Number(row.blks_read ?? 0),
    blocksHit: Number(row.blks_hit ?? 0),
    tempFiles: Number(row.temp_files ?? 0),
    tempBytes: Number(row.temp_bytes ?? 0),
    deadlocks: Number(row.deadlocks ?? 0),
    estimatedLiveRows: Number(tableStats.rows[0]?.estimated_live_rows ?? 0),
    tableCount: Number(tableStats.rows[0]?.table_count ?? 0),
    messageBacklog: {
      activeCount: Number(outbox.rows[0]?.active_count ?? 0),
      deadCount: Number(outbox.rows[0]?.dead_count ?? 0),
      oldestActiveSeconds: Number(outbox.rows[0]?.oldest_active_seconds ?? 0),
    },
  };
}
