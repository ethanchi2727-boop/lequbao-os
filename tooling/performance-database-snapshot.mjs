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
  if (databaseStats.rows.length !== 1 || tableStats.rows.length !== 1 || outbox.rows.length !== 1)
    throw new Error('performance database snapshot queries must each return exactly one row');
  const row = databaseStats.rows[0];
  if (typeof row.database_name !== 'string' || !row.database_name.trim())
    throw new Error('performance database snapshot is missing the database name');
  const integer = (fieldName, value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0)
      throw new Error(`performance database snapshot ${fieldName} must be a non-negative integer`);
    return parsed;
  };
  const decimal = (fieldName, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0)
      throw new Error(`performance database snapshot ${fieldName} must be non-negative`);
    return parsed;
  };
  return {
    databaseName: row.database_name,
    sizeBytes: integer('sizeBytes', row.size_bytes),
    connections: integer('connections', row.numbackends),
    committedTransactions: integer('committedTransactions', row.xact_commit),
    rolledBackTransactions: integer('rolledBackTransactions', row.xact_rollback),
    blocksRead: integer('blocksRead', row.blks_read),
    blocksHit: integer('blocksHit', row.blks_hit),
    tempFiles: integer('tempFiles', row.temp_files),
    tempBytes: integer('tempBytes', row.temp_bytes),
    deadlocks: integer('deadlocks', row.deadlocks),
    estimatedLiveRows: integer('estimatedLiveRows', tableStats.rows[0].estimated_live_rows),
    tableCount: integer('tableCount', tableStats.rows[0].table_count),
    messageBacklog: {
      activeCount: integer('messageBacklog.activeCount', outbox.rows[0].active_count),
      deadCount: integer('messageBacklog.deadCount', outbox.rows[0].dead_count),
      oldestActiveSeconds: decimal(
        'messageBacklog.oldestActiveSeconds',
        outbox.rows[0].oldest_active_seconds,
      ),
    },
  };
}
