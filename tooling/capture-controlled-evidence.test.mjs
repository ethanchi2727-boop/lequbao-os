import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureControlledEvidenceArtifact } from './capture-controlled-evidence.mjs';
import { prepareControlledEvidenceWorkspace } from './prepare-controlled-evidence.mjs';

const roots = [];
const plan = {
  version: 1,
  suites: [
    {
      code: 'POSTGRES_RLS_FINANCE',
      environmentGate: 'POSTGRESQL',
      executorRole: 'release database engineer',
      runbook: 'docs/runbooks/CONTROLLED_ACCEPTANCE.md#postgresql-rls-and-financial-invariants',
      evidenceDirectory: 'postgres-rls-finance',
      requiredEvidence: ['clean-schema.log', 'rls-denials.json', 'financial-policy-approvals.json'],
      passCriteria: ['clean schema passes'],
    },
  ],
};
const planSource = `${JSON.stringify(plan, null, 2)}\n`;
const releaseCommit = 'a'.repeat(40);
let evidenceRoot;
let sourceRoot;

function freshRoot(name) {
  const root = path.join(
    tmpdir(),
    `lequ-controlled-capture-${name}-${process.pid}-${Date.now()}-${Math.random()}`,
  );
  roots.push(root);
  return root;
}

beforeEach(async () => {
  evidenceRoot = freshRoot('evidence');
  sourceRoot = freshRoot('source');
  await mkdir(sourceRoot, { recursive: true });
  await prepareControlledEvidenceWorkspace({
    plan,
    planSource,
    evidenceRoot,
    releaseCommit,
    deploymentId: 'candidate-1',
    environment: 'controlled-preproduction',
    createdAt: '2026-08-19T12:00:00.000Z',
  });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('controlled evidence capture', () => {
  it('copies a valid declared artifact without overwriting and returns its binding', async () => {
    const source = path.join(sourceRoot, 'clean-schema.log');
    await writeFile(source, 'PostgreSQL clean schema completed with 26 migrations.\n');
    const input = {
      plan,
      planSource,
      evidenceRoot,
      suiteCode: 'POSTGRES_RLS_FINANCE',
      artifact: 'clean-schema.log',
      source,
    };
    const record = await captureControlledEvidenceArtifact(input);
    expect(record).toMatchObject({
      suite: 'POSTGRES_RLS_FINANCE',
      artifact: 'clean-schema.log',
      releaseCommit,
      size: 54,
      captureReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(
      await readFile(path.join(evidenceRoot, 'postgres-rls-finance', 'clean-schema.log'), 'utf8'),
    ).toBe('PostgreSQL clean schema completed with 26 migrations.\n');
    await expect(captureControlledEvidenceArtifact(input)).rejects.toThrow();
  });

  it('rejects undeclared artifacts, invalid content and a changed plan', async () => {
    const source = path.join(sourceRoot, 'capture.log');
    await writeFile(source, 'TODO\n');
    const input = {
      plan,
      planSource,
      evidenceRoot,
      suiteCode: 'POSTGRES_RLS_FINANCE',
      artifact: 'clean-schema.log',
      source,
    };
    await expect(captureControlledEvidenceArtifact(input)).rejects.toThrow(
      'contains only a placeholder verdict',
    );
    await expect(
      captureControlledEvidenceArtifact({ ...input, artifact: 'undeclared.log' }),
    ).rejects.toThrow('artifact is not declared');
    await writeFile(source, 'PostgreSQL fixture execution completed successfully.\n');
    await expect(
      captureControlledEvidenceArtifact({
        ...input,
        capturedAt: '2026-08-19T09:00:00.000+08:00',
      }),
    ).rejects.toThrow('canonical millisecond UTC timestamp');
    await expect(
      captureControlledEvidenceArtifact({
        ...input,
        capturedAt: '2026-08-19T11:59:00.000Z',
      }),
    ).rejects.toThrow('capturedAt predates the evidence workspace');
    await expect(
      readFile(path.join(evidenceRoot, 'postgres-rls-finance', 'clean-schema.log')),
    ).rejects.toThrow();
    await expect(
      captureControlledEvidenceArtifact({ ...input, planSource: `${planSource}\n` }),
    ).rejects.toThrow('plan hash does not match');
    await expect(
      captureControlledEvidenceArtifact({
        ...input,
        plan: {
          ...plan,
          suites: [{ ...plan.suites[0], requiredEvidence: ['capture.log'] }],
        },
      }),
    ).rejects.toThrow('plan source does not match the plan object');
  });

  it('rejects a declared artifact name that can escape its suite directory', async () => {
    const source = path.join(sourceRoot, 'escaped.log');
    await writeFile(source, 'Evidence that must stay in its declared suite directory.\n');
    await expect(
      captureControlledEvidenceArtifact({
        plan,
        planSource,
        evidenceRoot,
        suiteCode: 'POSTGRES_RLS_FINANCE',
        artifact: '../escaped.log',
        source,
      }),
    ).rejects.toThrow('artifact must be a single non-empty file name');
    await expect(readFile(path.join(evidenceRoot, 'escaped.log'))).rejects.toThrow();
  });

  it('rejects a source located inside the evidence workspace', async () => {
    const source = path.join(evidenceRoot, 'source.log');
    await writeFile(source, 'Externally captured but misplaced evidence content.\n');
    await expect(
      captureControlledEvidenceArtifact({
        plan,
        planSource,
        evidenceRoot,
        suiteCode: 'POSTGRES_RLS_FINANCE',
        artifact: 'clean-schema.log',
        source,
      }),
    ).rejects.toThrow('source must be outside');
  });

  it('rejects structurally valid JSON that is unrelated to the declared artifact semantics', async () => {
    const source = path.join(sourceRoot, 'rls-denials.json');
    const input = {
      plan,
      planSource,
      evidenceRoot,
      suiteCode: 'POSTGRES_RLS_FINANCE',
      artifact: 'rls-denials.json',
      source,
    };
    await writeFile(source, '{"safe":true,"captured":true}\n');
    await expect(captureControlledEvidenceArtifact(input)).rejects.toThrow(
      'rls-denials.json is missing result',
    );
    await writeFile(
      source,
      `${JSON.stringify({
        result: 'PASS',
        attempts: ['cross-tenant-read', 'cross-tenant-write'].map((operation, index) => ({
          operation,
          actorTenantRefHash: 'a'.repeat(64),
          targetTenantRefHash: 'b'.repeat(64),
          denied: true,
          exposedFieldCount: 0,
          mutationCount: 0,
          auditRefHash: `${index + 1}`.repeat(64),
        })),
      })}\n`,
    );
    await expect(captureControlledEvidenceArtifact(input)).resolves.toMatchObject({
      artifact: 'rls-denials.json',
      captureReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it('rejects semantic evidence bound to a different candidate or deployment', async () => {
    const source = path.join(sourceRoot, 'financial-policy-approvals.json');
    const financialApproval = {
      decisionVersion: 'finance-v1',
      effectiveAt: '2026-08-19T01:00:00.000Z',
      decisions: {
        paymentResponsibilityResolved: true,
        merchantAccountMappingResolved: true,
        legacyBalanceResolved: true,
        distributionConflictC001Resolved: true,
        computeAllocationResolved: true,
        historicalSnapshotPreserved: true,
      },
      approvals: [
        {
          subjectId: 'org:business-owner',
          role: 'business owner',
          decision: 'APPROVED',
          receiptId: 'business-receipt',
          approvedAt: '2026-08-19T01:00:00.000Z',
        },
        {
          subjectId: 'org:finance-owner',
          role: 'finance owner',
          decision: 'APPROVED',
          receiptId: 'finance-receipt',
          approvedAt: '2026-08-19T01:00:00.000Z',
        },
      ],
      independentReview: {
        subjectId: 'org:finance-reviewer',
        decision: 'APPROVED',
        receiptId: 'finance-review-receipt',
        reviewedAt: '2026-08-19T01:00:00.000Z',
      },
      unresolvedItems: [],
    };
    const input = {
      plan,
      planSource,
      evidenceRoot,
      suiteCode: 'POSTGRES_RLS_FINANCE',
      artifact: 'financial-policy-approvals.json',
      source,
    };
    await writeFile(
      source,
      `${JSON.stringify({
        releaseCommit: 'b'.repeat(40),
        deploymentId: 'different-deployment',
        ...financialApproval,
      })}\n`,
    );
    await expect(captureControlledEvidenceArtifact(input)).rejects.toThrow(
      'releaseCommit does not match releaseCommit',
    );
    await writeFile(
      source,
      `${JSON.stringify({
        releaseCommit,
        deploymentId: 'candidate-1',
        ...financialApproval,
      })}\n`,
    );
    await expect(captureControlledEvidenceArtifact(input)).resolves.toMatchObject({
      artifact: 'financial-policy-approvals.json',
    });
  });
});
