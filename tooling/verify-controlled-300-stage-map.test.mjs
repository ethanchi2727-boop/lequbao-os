import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  validateControlled300StageMap,
  verifyControlled300StageMap,
} from './verify-controlled-300-stage-map.mjs';

const clone = (value) => structuredClone(value);

describe('controlled 300-stage execution map', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('maps 281 through 300 without claiming unavailable external results', async () => {
    await expect(verifyControlled300StageMap(root)).resolves.toEqual({
      failures: [],
      suites: 11,
      controls: 9,
      artifacts: 47,
    });
  });

  it('rejects reordered stages and kinds outside their frozen ranges', async () => {
    const { plan, mapping } = await loadFixtures(root);
    [mapping.stages[0], mapping.stages[1]] = [mapping.stages[1], mapping.stages[0]];
    mapping.stages[10].kind = 'release-control';

    expect(validateControlled300StageMap(plan, mapping).failures).toEqual(
      expect.arrayContaining([
        'mapping must contain ordered unique stages 281 through 300',
        'stages 281-291 must be suites and stages 292-300 must be release controls',
      ]),
    );
  });

  it('rejects hidden execution claims and malformed evidence requirements', async () => {
    const { plan, mapping } = await loadFixtures(root);
    mapping.stages[0].approved = true;
    mapping.stages[11].completionEvidence = ['releaseCommit', 'releaseCommit'];

    expect(validateControlled300StageMap(plan, mapping).failures).toEqual(
      expect.arrayContaining([
        'release controls need at least two unique non-empty evidence requirements',
        'controlled mapping cannot claim execution or completion',
      ]),
    );
  });

  it('rejects non-integer artifact counts even when their total could look plausible', async () => {
    const { plan, mapping } = await loadFixtures(root);
    mapping.stages[0].expectedArtifactCount = 3.5;
    mapping.stages[1].expectedArtifactCount = 3.5;

    expect(validateControlled300StageMap(plan, mapping).failures).toEqual(
      expect.arrayContaining([
        'POSTGRES_RLS_FINANCE artifact count must be a positive integer',
        'WORKER_FAULT_INJECTION artifact count must be a positive integer',
        'controlled suite mapping must cover exactly 47 evidence artifacts',
      ]),
    );
  });
});

async function loadFixtures(root) {
  const [plan, mapping] = await Promise.all([
    readFile(join(root, 'docs/release/controlled-acceptance-plan.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/release/controlled-300-stage-map.json'), 'utf8').then(JSON.parse),
  ]);
  return { plan: clone(plan), mapping: clone(mapping) };
}
