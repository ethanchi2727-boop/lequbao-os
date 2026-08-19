import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleControlledResults } from './assemble-controlled-results.mjs';

const temporaryDirectories = [];
const plan = {
  version: 1,
  suites: [
    {
      code: 'CONTROLLED_ONE',
      environmentGate: 'POSTGRESQL',
      executorRole: 'release engineer',
      evidenceDirectory: 'controlled-one',
      requiredEvidence: ['execution.log', 'snapshot.json'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-assembly-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'controlled-one'));
  await writeFile(path.join(root, 'controlled-one', 'execution.log'), 'passed\n');
  await writeFile(path.join(root, 'controlled-one', 'snapshot.json'), '{"safe":true}\n');
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
      version: 2,
      releaseCommit: 'a'.repeat(40),
      suites: [
        {
          code: 'CONTROLLED_ONE',
          evidence: [
            {
              file: 'controlled-one/execution.log',
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            },
            {
              file: 'controlled-one/snapshot.json',
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            },
          ],
        },
      ],
    });
  });

  it('rejects missing evidence, unknown suites and duplicate decisions', async () => {
    const root = await fixture();
    await rm(path.join(root, 'controlled-one', 'snapshot.json'));
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
    const root = await fixture();
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
});
