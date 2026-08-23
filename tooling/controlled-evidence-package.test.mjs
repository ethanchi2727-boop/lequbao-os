import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  controlledEvidencePackageFiles,
  inspectControlledEvidencePackageInventory,
  stageControlledEvidencePackage,
} from './controlled-evidence-package.mjs';

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

const plan = {
  suites: [
    {
      code: 'EXAMPLE',
      evidenceDirectory: 'example-suite',
      requiredEvidence: ['proof.json', 'run.log'],
    },
  ],
};

async function fixture() {
  const parent = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-package-'));
  roots.push(parent);
  const evidenceRoot = path.join(parent, 'evidence');
  const outputRoot = path.join(parent, 'staged');
  await mkdir(evidenceRoot);
  for (const relative of controlledEvidencePackageFiles(plan)) {
    const absolute = path.join(evidenceRoot, ...relative.split('/'));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `${relative} controlled evidence\n`);
  }
  await writeFile(path.join(evidenceRoot, 'README.md'), 'operator-only workspace guide\n');
  await writeFile(path.join(evidenceRoot, 'decisions.template.json'), '{"result":"PENDING"}\n');
  return { evidenceRoot, outputRoot };
}

describe('controlled evidence release package inventory', () => {
  it('derives the exact 96-file release inventory from the authoritative plan', async () => {
    const actualPlan = JSON.parse(
      await readFile('docs/release/controlled-acceptance-plan.json', 'utf8'),
    );
    expect(controlledEvidencePackageFiles(actualPlan)).toHaveLength(96);
  });

  it('stages only the exact launch inputs and excludes operator workspace files', async () => {
    const { evidenceRoot, outputRoot } = await fixture();
    const staged = await stageControlledEvidencePackage({ plan, evidenceRoot, outputRoot });
    expect(staged.fileCount).toBe(6);
    expect(
      await inspectControlledEvidencePackageInventory({ plan, packageRoot: outputRoot }),
    ).toEqual([]);
    await expect(readFile(path.join(outputRoot, 'README.md'), 'utf8')).rejects.toThrow();
    await expect(
      readFile(path.join(outputRoot, 'decisions.template.json'), 'utf8'),
    ).rejects.toThrow();
  });

  it('rejects missing and undeclared package files', async () => {
    const { evidenceRoot, outputRoot } = await fixture();
    await stageControlledEvidencePackage({ plan, evidenceRoot, outputRoot });
    await rm(path.join(outputRoot, 'example-suite', 'run.log'));
    await writeFile(path.join(outputRoot, 'unexpected-secret.txt'), 'must not be uploaded\n');
    const failures = await inspectControlledEvidencePackageInventory({
      plan,
      packageRoot: outputRoot,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('example-suite/run.log'),
        expect.stringContaining('unexpected-secret.txt'),
      ]),
    );
  });

  it('refuses overwrite and package output inside the evidence workspace', async () => {
    const { evidenceRoot, outputRoot } = await fixture();
    await mkdir(outputRoot);
    await expect(
      stageControlledEvidencePackage({ plan, evidenceRoot, outputRoot }),
    ).rejects.toThrow();
    await expect(
      stageControlledEvidencePackage({
        plan,
        evidenceRoot,
        outputRoot: path.join(evidenceRoot, 'package'),
      }),
    ).rejects.toThrow('outside the controlled evidence workspace');
  });

  it('rejects an output whose parent junction resolves inside the evidence workspace', async () => {
    const { evidenceRoot } = await fixture();
    const alias = path.join(path.dirname(evidenceRoot), 'evidence-alias');
    await symlink(evidenceRoot, alias, 'junction');
    await expect(
      stageControlledEvidencePackage({
        plan,
        evidenceRoot,
        outputRoot: path.join(alias, 'package'),
      }),
    ).rejects.toThrow('outside the controlled evidence workspace');
    await expect(readFile(path.join(evidenceRoot, 'package', 'results.json'))).rejects.toThrow();
  });

  it('rejects unsafe and duplicate plan paths before staging', () => {
    expect(() =>
      controlledEvidencePackageFiles({
        suites: [{ evidenceDirectory: '../escape', requiredEvidence: ['proof.json'] }],
      }),
    ).toThrow('unsafe evidence directory');
    expect(() =>
      controlledEvidencePackageFiles({
        suites: [
          { evidenceDirectory: 'same', requiredEvidence: ['proof.json'] },
          { evidenceDirectory: 'same', requiredEvidence: ['proof.json'] },
        ],
      }),
    ).toThrow('duplicates a path');
  });
});
