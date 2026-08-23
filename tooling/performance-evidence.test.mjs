import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('performance evidence boundary', () => {
  it('keeps runtime routing and database names out of the persisted report', async () => {
    const gate = await readFile('tooling/performance-gate.mjs', 'utf8');
    const snapshot = await readFile('tooling/performance-database-snapshot.mjs', 'utf8');
    expect(gate).not.toContain('baseOrigin:');
    expect(gate).toContain('environment: config.environment');
    expect(gate).not.toContain('runId,\n  environment');
    expect(gate).toContain("redirect: 'error'");
    expect(gate).toContain('readBoundedPerformanceResponse(response)');
    expect(gate).toContain('message persistence response must be application/json');
    expect(gate).toContain('message persistence response id must be a UUID');
    expect(gate).toContain('missingMessageRefHashes: missing.map(messageRefHash)');
    expect(gate).toContain('SELECT id::text,content FROM conversation_messages');
    expect(gate).toContain('matchingPersistedMessageIds(expectedMessages, persisted.rows)');
    expect(gate).not.toContain('missingMessageIds: missing');
    expect(gate.indexOf('statuses.push(response.status)')).toBeGreaterThan(
      gate.indexOf('readBoundedPerformanceResponse(response)'),
    );
    expect(gate).toContain('connectionTimeoutMillis: 10_000');
    expect(gate).toContain('statement_timeout: 15_000');
    expect(gate).toContain('query_timeout: 20_000');
    expect(gate).toContain('-${randomUUID()}`');
    expect(snapshot).toContain("createHash('sha256').update(row.database_name).digest('hex')");
    expect(snapshot).not.toContain('databaseName: row.database_name');
  });
});
