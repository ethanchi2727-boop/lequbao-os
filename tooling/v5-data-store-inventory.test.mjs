import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildV5Inventory } from './v5-data-store-inventory.mjs';

const temporaryDirectories = [];

async function sqliteWithRows(rows = 0) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lequ-v5-inventory-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'legacy.sqlite');
  const database = new DatabaseSync(file);
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY, mobile TEXT NOT NULL)');
  const insert = database.prepare('INSERT INTO users (id, mobile) VALUES (?, ?)');
  for (let index = 0; index < rows; index++) insert.run(`user-${index}`, `1380000${index}`);
  database.close();
  return file;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('V5 data-store inventory', () => {
  it('reports only hashes and counts and always requires independent review for a development database', async () => {
    const file = await sqliteWithRows(1);
    const inventory = await buildV5Inventory(
      {
        version: 1,
        releaseCommit: 'a'.repeat(40),
        sources: [
          { id: 'local-v5', kind: 'sqlite', path: file, declaredEnvironment: 'development' },
        ],
      },
      '2026-08-19T00:00:00.000Z',
    );
    expect(inventory.verdict).toBe('INDEPENDENT_REVIEW_REQUIRED');
    expect(inventory.sources[0]).toMatchObject({
      outcome: 'DATA_PRESENT_REVIEW_REQUIRED',
      tableCount: 1,
      nonEmptyTableCount: 1,
      rowCount: 1,
      tables: [{ name: 'users', rowCount: 1 }],
    });
    const serialized = JSON.stringify(inventory);
    expect(serialized).not.toContain(file);
    expect(serialized).not.toContain('1380000');
  });

  it('stops release when a production or unknown source contains rows', async () => {
    const [production, unknown] = await Promise.all([sqliteWithRows(1), sqliteWithRows(2)]);
    const inventory = await buildV5Inventory({
      version: 1,
      releaseCommit: 'b'.repeat(40),
      sources: [
        {
          id: 'production-v5',
          kind: 'sqlite',
          path: production,
          declaredEnvironment: 'production',
        },
        { id: 'unknown-v5', kind: 'sqlite', path: unknown, declaredEnvironment: 'unknown' },
      ],
    });
    expect(inventory.verdict).toBe('STOP_RELEASE');
    expect(inventory.sources.map((source) => source.outcome)).toEqual([
      'STOP_RELEASE_DATA_PRESENT',
      'STOP_RELEASE_DATA_PRESENT',
    ]);
  });

  it('does not turn an empty source into a greenfield PASS', async () => {
    const file = await sqliteWithRows();
    const inventory = await buildV5Inventory({
      version: 1,
      releaseCommit: 'c'.repeat(40),
      sources: [{ id: 'empty-v5', kind: 'sqlite', path: file, declaredEnvironment: 'production' }],
    });
    expect(inventory.verdict).toBe('INDEPENDENT_REVIEW_REQUIRED');
    expect(inventory.sources[0].outcome).toBe('EMPTY_REVIEW_REQUIRED');
  });

  it('rejects ambiguous paths, duplicate ids and unsafe release bindings', async () => {
    const file = await sqliteWithRows();
    await expect(
      buildV5Inventory({
        version: 1,
        releaseCommit: 'not-a-sha',
        sources: [{ id: 'x', kind: 'sqlite', path: file, declaredEnvironment: 'test' }],
      }),
    ).rejects.toThrow(/releaseCommit/u);
    await expect(
      buildV5Inventory({
        version: 1,
        releaseCommit: 'd'.repeat(40),
        sources: [
          { id: 'x', kind: 'sqlite', path: file, declaredEnvironment: 'test' },
          { id: 'x', kind: 'sqlite', path: file, declaredEnvironment: 'test' },
        ],
      }),
    ).rejects.toThrow(/unique/u);
    await expect(
      buildV5Inventory({
        version: 1,
        releaseCommit: 'e'.repeat(40),
        sources: [
          { id: 'relative', kind: 'sqlite', path: 'legacy.sqlite', declaredEnvironment: 'test' },
        ],
      }),
    ).rejects.toThrow(/absolute/u);
  });

  it('uses create-new semantics for the evidence output contract', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lequ-v5-output-'));
    temporaryDirectories.push(directory);
    const output = path.join(directory, 'legacy-production-inventory.json');
    await writeFile(output, 'existing evidence', 'utf8');
    await expect(
      writeFile(output, 'replacement', { encoding: 'utf8', flag: 'wx' }),
    ).rejects.toThrow();
    await expect(readFile(output, 'utf8')).resolves.toBe('existing evidence');
  });
});
