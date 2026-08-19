import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCandidateCheckout,
  prepareControlledEvidenceWorkspace,
} from './prepare-controlled-evidence.mjs';

const roots = [];
const releaseCommit = 'a'.repeat(40);
const plan = {
  version: 1,
  suites: [
    {
      code: 'POSTGRES_RLS_FINANCE',
      environmentGate: 'POSTGRESQL',
      executorRole: 'release database engineer',
      runbook: 'docs/runbooks/CONTROLLED_ACCEPTANCE.md#postgresql-rls-and-financial-invariants',
      evidenceDirectory: 'postgres-rls-finance',
      requiredEvidence: ['clean-schema.log', 'rls-denials.json'],
      passCriteria: ['clean schema passes', 'cross-tenant access is denied'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function freshRoot(name) {
  const root = path.join(
    tmpdir(),
    `lequ-controlled-prepare-${name}-${process.pid}-${Date.now()}-${Math.random()}`,
  );
  roots.push(root);
  return root;
}

describe('controlled evidence workspace preparation', () => {
  it('creates candidate-bound metadata, exact suite directories and no evidence placeholders', async () => {
    const evidenceRoot = freshRoot('valid');
    const context = await prepareControlledEvidenceWorkspace({
      plan,
      planSource,
      evidenceRoot,
      releaseCommit,
      deploymentId: 'candidate-2026-08-19.1',
      environment: 'controlled-preproduction',
      createdAt: '2026-08-19T12:00:00.000Z',
    });
    expect(context).toMatchObject({
      releaseCommit,
      suiteCount: 1,
      requiredArtifactCount: 2,
    });
    expect(await readdir(path.join(evidenceRoot, 'postgres-rls-finance'))).toEqual([]);
    const decisions = JSON.parse(
      await readFile(path.join(evidenceRoot, 'decisions.template.json'), 'utf8'),
    );
    expect(decisions.suites[0]).toMatchObject({
      code: 'POSTGRES_RLS_FINANCE',
      result: 'PENDING',
      executedById: 'PENDING',
      reviewedById: 'PENDING',
    });
    const guide = await readFile(path.join(evidenceRoot, 'README.md'), 'utf8');
    expect(guide).toContain('`clean-schema.log`');
    expect(guide).toContain('`rls-denials.json`');
    expect(guide).toContain(plan.suites[0].runbook);
    expect(guide).toContain(
      '--suite=POSTGRES_RLS_FINANCE --artifact=clean-schema.log --source=<absolute-captured-source>',
    );
    expect(guide).toContain('`attempts`: array');
    expect(guide).toContain('contains no PASS decision and no evidence placeholder');
  });

  it('refuses reuse, unsafe plan paths and invalid candidate metadata', async () => {
    const evidenceRoot = freshRoot('reuse');
    const input = {
      plan,
      planSource,
      evidenceRoot,
      releaseCommit,
      deploymentId: 'candidate-1',
      environment: 'staging',
    };
    await prepareControlledEvidenceWorkspace(input);
    await expect(prepareControlledEvidenceWorkspace(input)).rejects.toThrow();
    await expect(
      prepareControlledEvidenceWorkspace({
        ...input,
        evidenceRoot: freshRoot('unsafe'),
        plan: {
          ...plan,
          suites: [{ ...plan.suites[0], requiredEvidence: ['../escape.log'] }],
        },
      }),
    ).rejects.toThrow('unsafe or missing evidence files');
    await expect(
      prepareControlledEvidenceWorkspace({
        ...input,
        evidenceRoot: freshRoot('commit'),
        releaseCommit: 'not-a-commit',
      }),
    ).rejects.toThrow('exact lowercase 40-character SHA');
  });

  it('requires the exact clean candidate checkout', () => {
    expect(() =>
      assertCandidateCheckout({ releaseCommit, headCommit: releaseCommit, status: '' }),
    ).not.toThrow();
    expect(() =>
      assertCandidateCheckout({ releaseCommit, headCommit: 'b'.repeat(40), status: '' }),
    ).toThrow('does not match checked-out HEAD');
    expect(() =>
      assertCandidateCheckout({ releaseCommit, headCommit: releaseCommit, status: ' M app.ts' }),
    ).toThrow('requires a clean worktree');
  });

  it('materializes every directory and checklist entry from the authoritative plan', async () => {
    const actualPlanSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
    const actualPlan = JSON.parse(actualPlanSource);
    const evidenceRoot = freshRoot('authoritative');
    const context = await prepareControlledEvidenceWorkspace({
      plan: actualPlan,
      planSource: actualPlanSource,
      evidenceRoot,
      releaseCommit,
      deploymentId: 'candidate-authoritative-1',
      environment: 'controlled-preproduction',
      createdAt: '2026-08-19T12:00:00.000Z',
    });
    expect(context.suiteCount).toBe(11);
    expect(context.requiredArtifactCount).toBe(
      actualPlan.suites.reduce((total, suite) => total + suite.requiredEvidence.length, 0),
    );
    const guide = await readFile(path.join(evidenceRoot, 'README.md'), 'utf8');
    for (const suite of actualPlan.suites) {
      expect(await readdir(path.join(evidenceRoot, suite.evidenceDirectory))).toEqual([]);
      expect(guide).toContain(suite.runbook);
      for (const artifact of suite.requiredEvidence) expect(guide).toContain(`\`${artifact}\``);
    }
    expect(guide).toContain('Cross-artifact invariants:');
    expect(guide).toContain('performance report images equal the protected candidate manifest');
  });
});
