import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  controlledJsonEvidenceContracts,
  validateControlledJsonEvidence,
} from './controlled-evidence-contracts.mjs';

describe('controlled JSON evidence contracts', () => {
  it('covers every JSON artifact in the authoritative controlled plan exactly', async () => {
    const plan = JSON.parse(await readFile('docs/release/controlled-acceptance-plan.json', 'utf8'));
    const artifacts = plan.suites
      .flatMap((suite) => suite.requiredEvidence)
      .filter((artifact) => artifact.endsWith('.json'))
      .sort();
    expect(Object.keys(controlledJsonEvidenceContracts).sort()).toEqual(artifacts);
  });

  it('rejects unrelated, missing, empty and wrong-type semantic evidence', () => {
    expect(validateControlledJsonEvidence('performance-report.json', { safe: true })).toContain(
      'performance-report.json is missing result',
    );
    expect(
      validateControlledJsonEvidence('performance-report.json', {
        result: 'PASS',
        releaseCommit: '',
        images: {},
        scenarios: {},
        persistence: {},
      }),
    ).toEqual(
      expect.arrayContaining([
        'performance-report.json releaseCommit must not be empty',
        'performance-report.json images must not be empty',
        'performance-report.json scenarios must be array',
        'performance-report.json persistence must not be empty',
      ]),
    );
  });

  it('enforces PASS, true and zero-unresolved invariants', () => {
    expect(
      validateControlledJsonEvidence('restore-report.json', {
        result: 'FAIL',
        rpoSeconds: 20,
        rtoSeconds: 40,
        financialSnapshotMatch: false,
        databaseFixturesPassed: ['fixture.sql'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'restore-report.json result must equal "PASS"',
        'restore-report.json financialSnapshotMatch must equal true',
      ]),
    );
    expect(
      validateControlledJsonEvidence('legal-document-release.json', {
        releaseCommit: 'a'.repeat(40),
        deploymentId: 'candidate-1',
        documents: ['privacy'],
        surfaceMatrix: ['consumer'],
        approvals: ['legal'],
        unresolvedItems: ['missing-publication'],
      }),
    ).toContain('legal-document-release.json unresolvedItems must contain at most 0 items');
  });

  it('enforces candidate bindings, operational thresholds and digest formats', () => {
    expect(
      validateControlledJsonEvidence(
        'performance-report.json',
        {
          result: 'PASS',
          releaseCommit: 'b'.repeat(40),
          images: { api: 'bound' },
          scenarios: ['core-read'],
          persistence: { missing: 0 },
        },
        { releaseCommit: 'a'.repeat(40) },
      ),
    ).toContain('performance-report.json releaseCommit does not match releaseCommit');
    expect(
      validateControlledJsonEvidence('restore-report.json', {
        result: 'PASS',
        rpoSeconds: 301,
        rtoSeconds: 3601,
        financialSnapshotMatch: true,
        databaseFixturesPassed: ['fixture.sql'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'restore-report.json rpoSeconds must be at most 300',
        'restore-report.json rtoSeconds must be at most 3600',
      ]),
    );
    expect(
      validateControlledJsonEvidence('candidate-image-digests.json', {
        releaseCommit: 'a'.repeat(40),
        images: { api: 'latest', worker: 'latest', web: 'latest' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'candidate-image-digests.json images.api has invalid format',
        'candidate-image-digests.json images.worker has invalid format',
        'candidate-image-digests.json images.web has invalid format',
      ]),
    );
    expect(
      validateControlledJsonEvidence('rollback.json', {
        result: 'PASS',
        fromVersion: '1.0.0',
        toVersion: '1.0.1',
        verifiedAt: '2099-01-01T00:00:00.000Z',
      }),
    ).toContain('rollback.json verifiedAt must not be in the future');
  });
});
