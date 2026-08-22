import pg from 'pg';
import { capturePerformanceDatabaseSnapshot } from './performance-database-snapshot.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
  const snapshot = await capturePerformanceDatabaseSnapshot(database);
  if (snapshot.tableCount < 164) throw new Error('performance snapshot database is incomplete');
  if (!Number.isFinite(snapshot.messageBacklog.oldestActiveSeconds))
    throw new Error('performance snapshot Outbox age is invalid');
  console.log(
    `Performance database snapshot passed: ${snapshot.tableCount} tables, ${snapshot.messageBacklog.deadCount} dead Outbox events.`,
  );
} finally {
  await database.end();
}
