import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import {
  missingPersistedMessageIds,
  summarizeScenario,
  validatePerformanceConfig,
} from './performance-gate-lib.mjs';
import { capturePerformanceDatabaseSnapshot } from './performance-database-snapshot.mjs';

const config = validatePerformanceConfig(process.env);
const runId = `perf-${new Date().toISOString().replace(/[^0-9]/gu, '')}`;
const database = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });

const scenarios = [
  {
    name: 'core-read',
    method: 'GET',
    path: '/api/v1/context',
    limit: 500,
    token: config.tokens.read,
  },
  {
    name: 'customer-message-write',
    method: 'POST',
    path: config.conversationPath,
    limit: 500,
    body: config.conversationBody,
    proveMessagePersistence: true,
    token: config.tokens.message,
  },
  {
    name: 'core-write',
    method: 'POST',
    path: config.writePath,
    limit: 800,
    body: config.writeBody,
    token: config.tokens.write,
  },
];

const startedAt = new Date();
const started = performance.now();
const report = {
  schemaVersion: 1,
  runId,
  environment: config.environment,
  baseOrigin: config.base.origin,
  startedAt: startedAt.toISOString(),
  concurrency: config.concurrency,
  requestsPerScenario: config.requests,
  scenarios: [],
  database: { before: null, after: null },
  persistence: { expectedMessageIds: 0, persistedMessageIds: 0, missingMessageIds: [] },
  failure: null,
};
let failed = false;
let stage = 'database-before';
let before;
const expectedMessageIds = [];
try {
  before = await capturePerformanceDatabaseSnapshot(database);
  report.database.before = before;
  for (const scenario of scenarios) {
    stage = `scenario-${scenario.name}`;
    const latencies = [];
    const statuses = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: config.concurrency }, async () => {
        while (next < config.requests) {
          const index = next++;
          const requestStarted = performance.now();
          try {
            const body = scenario.body
              ? {
                  ...scenario.body,
                  ...(scenario.proveMessagePersistence
                    ? { content: `${runId} persistence probe ${index}` }
                    : {}),
                }
              : undefined;
            const response = await fetch(new URL(scenario.path, config.base), {
              method: scenario.method,
              headers: {
                authorization: `Bearer ${scenario.token}`,
                'content-type': 'application/json',
                'idempotency-key': `${runId}-${scenario.name}-${index}`,
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
              signal: AbortSignal.timeout(15000),
            });
            statuses.push(response.status);
            const payload = await response.json().catch(() => undefined);
            if (
              scenario.proveMessagePersistence &&
              response.status >= 200 &&
              response.status < 300 &&
              typeof payload?.id === 'string'
            )
              expectedMessageIds.push(payload.id);
          } catch {
            statuses.push(0);
          }
          latencies.push(performance.now() - requestStarted);
        }
      }),
    );
    const item = summarizeScenario({
      name: scenario.name,
      limit: scenario.limit,
      latencies,
      statuses,
    });
    report.scenarios.push(item);
    if (item.p95Ms > scenario.limit || item.errorRate > 0.01) failed = true;
  }

  stage = 'message-persistence';
  const persisted = expectedMessageIds.length
    ? await database.query(`SELECT id::text FROM conversation_messages WHERE id=ANY($1::uuid[])`, [
        expectedMessageIds,
      ])
    : { rows: [] };
  const persistedIds = persisted.rows.map((row) => row.id);
  const missing = missingPersistedMessageIds(expectedMessageIds, persistedIds);
  report.persistence = {
    expectedMessageIds: expectedMessageIds.length,
    persistedMessageIds: persistedIds.length,
    missingMessageIds: missing,
  };
  const customerScenario = report.scenarios.find(
    (scenario) => scenario.name === 'customer-message-write',
  );
  if (
    !customerScenario ||
    expectedMessageIds.length !== customerScenario.successes ||
    missing.length
  )
    failed = true;
  stage = 'database-after';
  report.database.after = await capturePerformanceDatabaseSnapshot(database);
  if (report.database.after.messageBacklog.deadCount > before.messageBacklog.deadCount)
    failed = true;
} catch (error) {
  failed = true;
  const candidate = typeof error?.code === 'string' ? error.code : 'RUNTIME_ERROR';
  report.failure = {
    stage,
    code: /^[A-Z0-9_]{1,40}$/u.test(candidate) ? candidate : 'RUNTIME_ERROR',
  };
} finally {
  try {
    await database.end();
  } catch {
    failed = true;
    report.failure ??= { stage: 'database-close', code: 'DATABASE_CLOSE_ERROR' };
  }
}

report.completedAt = new Date().toISOString();
report.durationSeconds = (performance.now() - started) / 1000;
report.result = failed ? 'FAIL' : 'PASS';
await mkdir(path.dirname(config.reportPath), { recursive: true });
await writeFile(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
