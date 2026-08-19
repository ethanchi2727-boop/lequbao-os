import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyControlledResults } from './controlled-results.mjs';

const releaseCommit = 'a'.repeat(40);
const plan = {
  version: 1,
  suites: [
    {
      code: 'POSTGRES',
      environmentGate: 'POSTGRESQL',
      executorRole: 'database engineer',
      evidenceDirectory: 'postgres',
      requiredEvidence: ['fixture.log'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;
const temporaryDirectories = [];

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-results-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'postgres'));
  const evidence = 'controlled fixture passed\n';
  await writeFile(path.join(root, 'postgres', 'fixture.log'), evidence);
  const results = {
    version: 2,
    releaseCommit,
    planSha256: createHash('sha256').update(planSource).digest('hex'),
    generatedAt: new Date().toISOString(),
    suites: [
      {
        code: 'POSTGRES',
        result: 'PASS',
        environmentGate: 'POSTGRESQL',
        executedById: 'org:database-engineer-01',
        executedByRole: 'database engineer',
        reviewedById: 'org:release-owner-01',
        reviewedByRole: 'release owner',
        startedAt: '2026-08-19T01:00:00.000Z',
        completedAt: '2026-08-19T01:05:00.000Z',
        reviewedAt: '2026-08-19T01:06:00.000Z',
        evidence: [
          {
            file: 'postgres/fixture.log',
            sha256: createHash('sha256').update(evidence).digest('hex'),
          },
        ],
      },
    ],
    ...overrides,
  };
  const resultsFile = path.join(root, 'results.json');
  await writeFile(resultsFile, JSON.stringify(results));
  return { root, results, resultsFile };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('controlled launch results', () => {
  it('accepts only hash-verified evidence bound to the candidate and current plan', async () => {
    const { resultsFile } = await fixture();
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toEqual([]);
  });

  it('rejects a different candidate, plan hash or missing suite', async () => {
    const { resultsFile } = await fixture({
      releaseCommit: 'b'.repeat(40),
      planSha256: '0'.repeat(64),
      suites: [],
    });
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'controlled results are not bound to RELEASE_COMMIT',
        'controlled results are not bound to the current acceptance plan',
        'controlled result suite is missing: POSTGRES',
      ]),
    );
  });

  it('rejects self-review, undeclared evidence and a mismatched artifact hash', async () => {
    const { results, resultsFile } = await fixture();
    results.providerToken = 'must-not-enter-results';
    results.suites[0].reviewedByRole = 'database engineer';
    results.suites[0].reviewedById = 'org:database-engineer-01';
    results.suites[0].internalNote = 'undeclared';
    results.suites[0].evidence[0].sha256 = '0'.repeat(64);
    results.suites[0].evidence[0].note = 'undeclared';
    results.suites[0].evidence.push({ file: 'postgres/extra.log', sha256: '0'.repeat(64) });
    await writeFile(resultsFile, JSON.stringify(results));
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'controlled results contain undeclared fields: providerToken',
        'POSTGRES requires an independent reviewer role',
        'POSTGRES requires a different accountable reviewer',
        'POSTGRES contains undeclared fields: internalNote',
        'POSTGRES evidence contains undeclared fields: note',
        'POSTGRES evidence hash mismatch for postgres/fixture.log',
        'POSTGRES contains undeclared evidence: postgres/extra.log',
      ]),
    );
  });

  it('fails closed for malformed records and impossible execution chronology', async () => {
    const { results, resultsFile } = await fixture();
    results.generatedAt = '2026-08-19T01:02:00.000Z';
    results.suites[0].completedAt = '2026-08-19T01:05:00.000Z';
    results.suites[0].reviewedAt = '2026-08-19T01:04:00.000Z';
    results.suites[0].evidence.push(null);
    results.suites.push(null);
    await writeFile(resultsFile, JSON.stringify(results));
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        'POSTGRES completed after the controlled results were generated',
        'POSTGRES has invalid independent-review timestamp',
        'POSTGRES contains an invalid evidence record',
        'controlled results contain an invalid suite record',
      ]),
    );
  });

  it('rejects a non-object result document without throwing', async () => {
    const { resultsFile } = await fixture();
    await writeFile(resultsFile, 'null');
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toEqual(['CONTROLLED_RESULTS_FILE must contain a JSON object']);
  });

  it('verifies the complete eleven-suite plan and detects later artifact tampering', async () => {
    const actualPlanSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
    const actualPlan = JSON.parse(actualPlanSource);
    const root = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-full-plan-'));
    temporaryDirectories.push(root);
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    const generatedAt = new Date().toISOString();
    const suites = [];
    for (const suite of actualPlan.suites) {
      const directory = path.join(root, suite.evidenceDirectory);
      await mkdir(directory, { recursive: true });
      const evidence = [];
      for (const file of suite.requiredEvidence) {
        const contents = `${suite.code}:${file}\n`;
        await writeFile(path.join(directory, file), contents);
        evidence.push({
          file: path.posix.join(suite.evidenceDirectory, file),
          sha256: createHash('sha256').update(contents).digest('hex'),
        });
      }
      suites.push({
        code: suite.code,
        result: 'PASS',
        environmentGate: suite.environmentGate,
        executedById: `org:${suite.code.toLowerCase()}-executor`,
        executedByRole: suite.executorRole,
        reviewedById: `org:${suite.code.toLowerCase()}-reviewer`,
        reviewedByRole: `${suite.executorRole} independent reviewer`,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        completedAt,
        reviewedAt: new Date(Date.now() - 30_000).toISOString(),
        evidence,
      });
    }
    const candidate = 'c'.repeat(40);
    const resultsFile = path.join(root, 'results.json');
    await writeFile(
      resultsFile,
      JSON.stringify({
        version: 2,
        releaseCommit: candidate,
        planSha256: createHash('sha256').update(actualPlanSource).digest('hex'),
        generatedAt,
        suites,
      }),
    );
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toEqual([]);

    const firstSuite = actualPlan.suites[0];
    const firstFile = firstSuite.requiredEvidence[0];
    await writeFile(path.join(root, firstSuite.evidenceDirectory, firstFile), 'tampered\n');
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toContain(
      `${firstSuite.code} evidence hash mismatch for ${path.posix.join(firstSuite.evidenceDirectory, firstFile)}`,
    );
  });
});
