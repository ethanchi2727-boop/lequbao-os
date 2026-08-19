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
    '{"result":"PASS","attempts":[{"operation":"cross-tenant-read","denied":true}]}\n',
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
      '{"result":"PASS","attempts":[{"operation":"cross-tenant-read","denied":true}]}\n',
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
