import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectControlledEvidenceFile } from './controlled-evidence.mjs';

const temporaryDirectories = [];
async function evidence(name, contents) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-evidence-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, name);
  await writeFile(file, contents);
  return file;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('controlled evidence content boundary', () => {
  it('accepts populated redacted JSON and meaningful text logs', async () => {
    const json = await evidence(
      'capture.json',
      '{"authorization":"[REDACTED]","assertions":["amount-bound","callback-verified"]}\n',
    );
    const log = await evidence('execution.log', 'All 22 controlled database fixtures passed.\n');
    await expect(inspectControlledEvidenceFile(json)).resolves.toMatchObject({ failures: [] });
    await expect(inspectControlledEvidenceFile(log)).resolves.toMatchObject({ failures: [] });
  });

  it('rejects empty, trivial, invalid JSON and binary evidence', async () => {
    const empty = await evidence('empty.log', '');
    const trivial = await evidence('trivial.log', 'NOT RUN\n');
    const invalidJson = await evidence('invalid.json', '{not-json}\n');
    const binary = await evidence('binary.log', Buffer.from([1, 0, 2, 3]));
    expect((await inspectControlledEvidenceFile(empty)).failures).toContain('is empty');
    expect((await inspectControlledEvidenceFile(trivial)).failures).toContain(
      'contains only a placeholder verdict',
    );
    expect((await inspectControlledEvidenceFile(invalidJson)).failures).toContain(
      'contains invalid JSON',
    );
    expect((await inspectControlledEvidenceFile(binary)).failures).toContain(
      'contains binary NUL bytes',
    );
  });

  it('rejects common unredacted secret forms', async () => {
    const cases = [
      ['private.log', `-----BEGIN ${'PRIVATE'} KEY-----\nnot-a-real-key\n`],
      ['github.log', `token=${`ghp_${'a'.repeat(36)}`}\n`],
      ['bearer.log', `authorization: Bearer ${'a'.repeat(32)}\n`],
      ['database.log', 'postgres://release:unredacted-password@database.internal/lequ\n'],
      ['provider.log', `credential=${`sk_live_${'a'.repeat(24)}`}\n`],
    ];
    for (const [name, contents] of cases) {
      const result = await inspectControlledEvidenceFile(await evidence(name, contents));
      expect(result.failures.some((failure) => failure.includes('unredacted'))).toBe(true);
    }
  });
});
