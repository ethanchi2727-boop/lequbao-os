import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleControlledResults } from './assemble-controlled-results.mjs';
import { captureControlledEvidenceArtifact } from './capture-controlled-evidence.mjs';
import { prepareControlledEvidenceWorkspace } from './prepare-controlled-evidence.mjs';

const temporaryDirectories = [];
const plan = {
  version: 1,
  suites: [
    {
      code: 'CONTROLLED_ONE',
      environmentGate: 'POSTGRESQL',
      executorRole: 'release engineer',
      runbook: 'docs/runbooks/CONTROLLED_ACCEPTANCE.md#postgresql-rls-and-financial-invariants',
      evidenceDirectory: 'controlled-one',
      requiredEvidence: ['execution.log', 'rls-denials.json'],
      passCriteria: ['controlled execution passes'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;
const rlsDenialsEvidence = {
  result: 'PASS',
  verifiedAt: '2026-08-19T01:00:00.000Z',
  attempts: ['cross-tenant-read', 'cross-tenant-write'].map((operation, index) => ({
    operation,
    actorTenantRefHash: 'a'.repeat(64),
    targetTenantRefHash: 'b'.repeat(64),
    denied: true,
    exposedFieldCount: 0,
    mutationCount: 0,
    auditRefHash: `${index + 1}`.repeat(64),
  })),
};

async function fixture(releaseCommit = 'a'.repeat(40)) {
  const parent = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-assembly-'));
  temporaryDirectories.push(parent);
  const root = path.join(parent, 'evidence');
  const sourceRoot = path.join(parent, 'source');
  await mkdir(sourceRoot);
  await prepareControlledEvidenceWorkspace({
    plan,
    planSource,
    evidenceRoot: root,
    releaseCommit,
    deploymentId: 'candidate-assembly-1',
    environment: 'controlled-preproduction',
    createdAt: '2026-08-19T00:59:00.000Z',
  });
  await writeFile(
    path.join(sourceRoot, 'execution.log'),
    'Controlled execution completed with all declared assertions passing.\n',
  );
  await writeFile(
    path.join(sourceRoot, 'rls-denials.json'),
    `${JSON.stringify(rlsDenialsEvidence)}\n`,
  );
  for (const artifact of plan.suites[0].requiredEvidence)
    await captureControlledEvidenceArtifact({
      plan,
      planSource,
      evidenceRoot: root,
      suiteCode: 'CONTROLLED_ONE',
      artifact,
      source: path.join(sourceRoot, artifact),
      capturedAt: '2026-08-19T01:00:00.000Z',
    });
  return root;
}

const decision = {
  code: 'CONTROLLED_ONE',
  result: 'PASS',
  environmentGate: 'POSTGRESQL',
  executedById: 'org:executor-01',
  executedByRole: 'release engineer',
  reviewedById: 'org:reviewer-01',
  reviewedByRole: 'release owner',
  startedAt: '2026-08-19T01:00:00.000Z',
  completedAt: '2026-08-19T01:05:00.000Z',
  reviewedAt: '2026-08-19T01:06:00.000Z',
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('controlled result assembly', () => {
  it('assembles the exact plan artifacts with calculated hashes', async () => {
    const root = await fixture();
    const results = await assembleControlledResults({
      plan,
      planSource,
      decisions: { version: 1, releaseCommit: 'a'.repeat(40), suites: [decision] },
      evidenceRoot: root,
      generatedAt: '2026-08-19T01:07:00.000Z',
    });
    expect(results).toMatchObject({
      version: 3,
      releaseCommit: 'a'.repeat(40),
      suites: [
        {
          code: 'CONTROLLED_ONE',
          evidence: [
            {
              file: 'controlled-one/execution.log',
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
              captureReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            },
            {
              file: 'controlled-one/rls-denials.json',
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
              captureReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            },
          ],
        },
      ],
    });
  });

  it('rejects missing evidence, unknown suites and duplicate decisions', async () => {
    const root = await fixture('b'.repeat(40));
    await rm(path.join(root, 'controlled-one', 'rls-denials.json'));
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: { version: 1, releaseCommit: 'b'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow();
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: {
          version: 1,
          releaseCommit: 'b'.repeat(40),
          suites: [decision, decision],
        },
        evidenceRoot: root,
      }),
    ).rejects.toThrow(/duplicated/u);
  });

  it('rejects a runtime plan object that differs from the hashed plan source', async () => {
    const root = await fixture('1'.repeat(40));
    await expect(
      assembleControlledResults({
        plan: {
          ...plan,
          suites: [
            { ...plan.suites[0], requiredEvidence: ['substituted.log', 'rls-denials.json'] },
          ],
        },
        planSource,
        decisions: { version: 1, releaseCommit: '1'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow('plan source does not match the plan object');
  });

  it('rejects same-person or pre-completion review metadata', async () => {
    const root = await fixture('c'.repeat(40));
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: {
          version: 1,
          releaseCommit: 'c'.repeat(40),
          suites: [
            {
              ...decision,
              reviewedById: decision.executedById,
              reviewedAt: '2026-08-19T01:04:00.000Z',
            },
          ],
        },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow(/different people/u);
  });

  it('rejects ambiguous decision and result timestamps before assembly', async () => {
    const root = await fixture('f'.repeat(40));
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: {
          version: 1,
          releaseCommit: 'f'.repeat(40),
          suites: [{ ...decision, startedAt: '2026-08-19T09:00:00.000+08:00' }],
        },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow(/chronology is invalid/u);
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: {
          version: 1,
          releaseCommit: 'f'.repeat(40),
          suites: [{ ...decision, startedAt: '2026-08-19T00:58:00.000Z' }],
        },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow(/chronology is invalid/u);
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: { version: 1, releaseCommit: 'f'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: '2026-08-19T09:07:00.000+08:00',
      }),
    ).rejects.toThrow(/canonical non-future millisecond UTC timestamp/u);
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: { version: 1, releaseCommit: 'f'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    ).rejects.toThrow(/canonical non-future millisecond UTC timestamp/u);
  });

  it('rejects evidence that bypasses or loses its capture receipt', async () => {
    const root = await fixture('e'.repeat(40));
    await rm(
      path.join(root, '.controlled-receipts', 'controlled-one', 'execution.log.receipt.json'),
    );
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: { version: 1, releaseCommit: 'e'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow(/capture receipt is missing/u);
  });

  it('rejects placeholder JSON and unredacted credentials before assembly', async () => {
    const root = await fixture('d'.repeat(40));
    await writeFile(path.join(root, 'controlled-one', 'rls-denials.json'), '{}\n');
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: { version: 1, releaseCommit: 'd'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow(/JSON root must be a non-empty object or array/u);

    await writeFile(
      path.join(root, 'controlled-one', 'rls-denials.json'),
      `${JSON.stringify(rlsDenialsEvidence)}\n`,
    );
    await writeFile(
      path.join(root, 'controlled-one', 'execution.log'),
      `authorization: Bearer ${'x'.repeat(32)}\n`,
    );
    await expect(
      assembleControlledResults({
        plan,
        planSource,
        decisions: { version: 1, releaseCommit: 'd'.repeat(40), suites: [decision] },
        evidenceRoot: root,
        generatedAt: '2026-08-19T01:07:00.000Z',
      }),
    ).rejects.toThrow(/unredacted Bearer credential/u);
  });
});
