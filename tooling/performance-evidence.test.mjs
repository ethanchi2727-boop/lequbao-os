import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('performance evidence boundary', () => {
  it('keeps runtime routing and database names out of the persisted report', async () => {
    const gate = await readFile('tooling/performance-gate.mjs', 'utf8');
    const snapshot = await readFile('tooling/performance-database-snapshot.mjs', 'utf8');
    expect(gate).not.toContain('baseOrigin:');
    expect(gate).not.toContain('environment: config.environment');
    expect(gate).not.toContain('runId,\n  environment');
    expect(gate).toContain("redirect: 'error'");
    expect(snapshot).toContain("createHash('sha256').update(row.database_name).digest('hex')");
    expect(snapshot).not.toContain('databaseName: row.database_name');
  });
});
