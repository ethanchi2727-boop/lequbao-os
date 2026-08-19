import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureControlledEvidenceArtifact } from './capture-controlled-evidence.mjs';
import { controlledJsonEvidenceContracts } from './controlled-evidence-contracts.mjs';
import { verifyControlledResults } from './controlled-results.mjs';
import { prepareControlledEvidenceWorkspace } from './prepare-controlled-evidence.mjs';

const releaseCommit = 'a'.repeat(40);
const plan = {
  version: 1,
  suites: [
    {
      code: 'POSTGRES',
      environmentGate: 'POSTGRESQL',
      executorRole: 'database engineer',
      runbook: 'docs/runbooks/CONTROLLED_ACCEPTANCE.md#postgresql-rls-and-financial-invariants',
      evidenceDirectory: 'postgres',
      requiredEvidence: ['fixture.log'],
      passCriteria: ['database fixture passes'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;
const temporaryDirectories = [];

function semanticFixture(artifact, binding) {
  const value = {};
  for (const rule of controlledJsonEvidenceContracts[artifact]) {
    const segments = rule.path.split('.');
    let target = value;
    for (const segment of segments.slice(0, -1)) target = target[segment] ??= {};
    const sample =
      rule.equals !== undefined
        ? rule.equals
        : rule.binding
          ? binding[rule.binding]
          : rule.pattern?.includes('ghcr')
            ? `ghcr.io/example/lequ@sha256:${'a'.repeat(64)}`
            : rule.pattern?.includes('{64}')
              ? 'a'.repeat(64)
              : rule.format === 'date-time'
                ? '2026-08-19T01:00:00.000Z'
                : rule.type === 'array'
                  ? rule.maxItems === 0
                    ? []
                    : [`${rule.path}-evidence`]
                  : rule.type === 'object'
                    ? { captured: true }
                    : rule.type === 'number'
                      ? (rule.minimum ?? 1)
                      : rule.type === 'boolean'
                        ? true
                        : `${rule.path}-evidence`;
    target[segments.at(-1)] = sample;
  }
  const images = {
    api: `ghcr.io/example/lequ-api@sha256:${'a'.repeat(64)}`,
    worker: `ghcr.io/example/lequ-worker@sha256:${'a'.repeat(64)}`,
    web: `ghcr.io/example/lequ-web@sha256:${'a'.repeat(64)}`,
  };
  const overrides = {
    'concurrency-input.json': { stock: 3, requestedQuantity: 10 },
    'order-results.json': { successfulQuantity: 3 },
    'inventory-ledger.json': { openingStock: 3, closingStock: 0, soldQuantity: 3 },
    'provider-request-redacted.json': {
      merchantAccountRef: 'merchant-account-hash',
      serverOrderAmountFen: 100,
    },
    'provider-callback-redacted.json': {
      merchantAccountRef: 'merchant-account-hash',
      amountFen: 100,
    },
    'merchant-account-reconciliation.json': {
      providerMerchantAccountRef: 'merchant-account-hash',
      platformMerchantAccountRef: 'merchant-account-hash',
      amountFen: 100,
    },
    'refund-unknown-recovery.json': { merchantAccountRef: 'merchant-account-hash' },
    'backup.manifest.json': { backupFile: 'candidate.dump.age' },
    'restore-report.json': { backupFile: 'candidate.dump.age' },
    'performance-report.json': { images },
    'candidate-image-digests.json': { images },
    'deployment-topology.json': {
      services: {
        api: { image: images.api },
        worker: { image: images.worker },
        web: { image: images.web },
      },
    },
    'consumer-build.json': { version: 'consumer-1' },
    'merchant-template-build.json': { version: 'merchant-1' },
    'review-publish.json': {
      consumerVersion: 'consumer-1',
      merchantVersion: 'merchant-1',
      publishedVersion: 'pilot-1',
    },
    'rollback.json': { fromVersion: 'pilot-1', toVersion: 'pilot-safe-2' },
    'alert-delivery.json': { alerts: ['P0-1', 'P1-1'] },
    'oncall-acknowledgement.json': { alerts: ['P0-1', 'P1-1'] },
  };
  Object.assign(value, overrides[artifact]);
  return value;
}

async function fixture(overrides = {}) {
  const parent = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-results-'));
  temporaryDirectories.push(parent);
  const root = path.join(parent, 'evidence');
  const sourceRoot = path.join(parent, 'source');
  await mkdir(sourceRoot);
  await prepareControlledEvidenceWorkspace({
    plan,
    planSource,
    evidenceRoot: root,
    releaseCommit,
    deploymentId: 'candidate-results-1',
    environment: 'controlled-preproduction',
    createdAt: '2026-08-19T00:59:00.000Z',
  });
  const evidence = 'controlled fixture passed\n';
  const source = path.join(sourceRoot, 'fixture.log');
  await writeFile(source, evidence);
  const captured = await captureControlledEvidenceArtifact({
    plan,
    planSource,
    evidenceRoot: root,
    suiteCode: 'POSTGRES',
    artifact: 'fixture.log',
    source,
    capturedAt: '2026-08-19T01:00:00.000Z',
  });
  const results = {
    version: 3,
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
            captureReceiptSha256: captured.captureReceiptSha256,
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

  it('rejects a missing or semantically forged capture receipt even with a matching receipt hash', async () => {
    const missing = await fixture();
    const receiptFile = path.join(
      missing.root,
      '.controlled-receipts',
      'postgres',
      'fixture.log.receipt.json',
    );
    await rm(receiptFile);
    await expect(
      verifyControlledResults({
        plan,
        planSource,
        resultsFile: missing.resultsFile,
        releaseCommit,
      }),
    ).resolves.toContain('POSTGRES capture receipt is missing for postgres/fixture.log');

    const forged = await fixture();
    const forgedReceiptFile = path.join(
      forged.root,
      '.controlled-receipts',
      'postgres',
      'fixture.log.receipt.json',
    );
    const receipt = JSON.parse(await readFile(forgedReceiptFile, 'utf8'));
    receipt.deploymentId = 'different-deployment';
    const contents = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(forgedReceiptFile, contents);
    forged.results.suites[0].evidence[0].captureReceiptSha256 = createHash('sha256')
      .update(contents)
      .digest('hex');
    await writeFile(forged.resultsFile, JSON.stringify(forged.results));
    await expect(
      verifyControlledResults({
        plan,
        planSource,
        resultsFile: forged.resultsFile,
        releaseCommit,
      }),
    ).resolves.toContain(
      'POSTGRES capture receipt deploymentId does not match for postgres/fixture.log',
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
    const parent = await mkdtemp(path.join(tmpdir(), 'lequ-controlled-full-plan-'));
    temporaryDirectories.push(parent);
    const root = path.join(parent, 'evidence');
    const sourceRoot = path.join(parent, 'source');
    await mkdir(sourceRoot);
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    const generatedAt = new Date().toISOString();
    const candidate = 'c'.repeat(40);
    await prepareControlledEvidenceWorkspace({
      plan: actualPlan,
      planSource: actualPlanSource,
      evidenceRoot: root,
      releaseCommit: candidate,
      deploymentId: 'candidate-full-plan-1',
      environment: 'controlled-preproduction',
      createdAt: new Date(Date.now() - 180_000).toISOString(),
    });
    const suites = [];
    for (const suite of actualPlan.suites) {
      const sourceDirectory = path.join(sourceRoot, suite.evidenceDirectory);
      await mkdir(sourceDirectory, { recursive: true });
      const evidence = [];
      for (const file of suite.requiredEvidence) {
        const contents = file.endsWith('.json')
          ? `${JSON.stringify(
              semanticFixture(file, {
                releaseCommit: candidate,
                deploymentId: 'candidate-full-plan-1',
              }),
            )}\n`
          : `Controlled evidence for ${suite.code}: ${file}\n`;
        const source = path.join(sourceDirectory, file);
        await writeFile(source, contents);
        const captured = await captureControlledEvidenceArtifact({
          plan: actualPlan,
          planSource: actualPlanSource,
          evidenceRoot: root,
          suiteCode: suite.code,
          artifact: file,
          source,
          capturedAt: new Date(Date.now() - 90_000).toISOString(),
        });
        evidence.push({
          file: path.posix.join(suite.evidenceDirectory, file),
          sha256: createHash('sha256').update(contents).digest('hex'),
          captureReceiptSha256: captured.captureReceiptSha256,
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
    const resultsFile = path.join(root, 'results.json');
    const fullResults = {
      version: 3,
      releaseCommit: candidate,
      planSha256: createHash('sha256').update(actualPlanSource).digest('hex'),
      generatedAt,
      suites,
    };
    await writeFile(resultsFile, JSON.stringify(fullResults));
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toEqual([]);

    const performanceSuite = actualPlan.suites.find(
      (suite) => suite.code === 'PERFORMANCE_CORE_AND_MESSAGES',
    );
    const performanceFile = path.join(
      root,
      performanceSuite.evidenceDirectory,
      'performance-report.json',
    );
    const performance = JSON.parse(await readFile(performanceFile, 'utf8'));
    performance.images.api = `ghcr.io/example/lequ-api@sha256:${'b'.repeat(64)}`;
    const performanceContents = `${JSON.stringify(performance)}\n`;
    await writeFile(performanceFile, performanceContents);
    const performanceHash = createHash('sha256').update(performanceContents).digest('hex');
    const receiptFile = path.join(
      root,
      '.controlled-receipts',
      performanceSuite.evidenceDirectory,
      'performance-report.json.receipt.json',
    );
    const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
    receipt.sha256 = performanceHash;
    receipt.size = Buffer.byteLength(performanceContents);
    const receiptContents = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(receiptFile, receiptContents);
    const performanceResult = fullResults.suites
      .find((suite) => suite.code === performanceSuite.code)
      .evidence.find((item) => item.file.endsWith('/performance-report.json'));
    performanceResult.sha256 = performanceHash;
    performanceResult.captureReceiptSha256 = createHash('sha256')
      .update(receiptContents)
      .digest('hex');
    await writeFile(resultsFile, JSON.stringify(fullResults));
    await expect(
      verifyControlledResults({
        plan: actualPlan,
        planSource: actualPlanSource,
        resultsFile,
        releaseCommit: candidate,
      }),
    ).resolves.toContain(
      'PERFORMANCE_CORE_AND_MESSAGES cross-evidence contract failed: performance report images do not match the candidate manifest',
    );

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
  }, 15_000);

  it('rejects content-invalid evidence even when its hash is updated to match', async () => {
    const { root, results, resultsFile } = await fixture();
    const contents = 'TODO\n';
    await writeFile(path.join(root, 'postgres', 'fixture.log'), contents);
    results.suites[0].evidence[0].sha256 = createHash('sha256').update(contents).digest('hex');
    await writeFile(resultsFile, JSON.stringify(results));
    await expect(
      verifyControlledResults({ plan, planSource, resultsFile, releaseCommit }),
    ).resolves.toContain(
      'POSTGRES evidence is invalid for postgres/fixture.log: contains only a placeholder verdict',
    );
  });
});
