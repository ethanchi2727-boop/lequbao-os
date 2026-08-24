import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  requiredCandidateChecks,
  verifyCandidateCheckProvenance,
} from './verify-candidate-check-provenance.mjs';

const candidate = 'a'.repeat(40);
const repository = 'owner/repository';
const runId = '123456';

async function roots(candidateWorkflow = 'name: trusted\n') {
  const root = await mkdtemp(path.join(tmpdir(), 'lequ-check-provenance-'));
  const trustedRoot = path.join(root, 'trusted');
  const candidateRoot = path.join(root, 'candidate');
  await Promise.all([
    mkdir(path.join(trustedRoot, '.github/workflows'), { recursive: true }),
    mkdir(path.join(candidateRoot, '.github/workflows'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(trustedRoot, '.github/workflows/ci.yml'), 'name: trusted\n'),
    writeFile(path.join(candidateRoot, '.github/workflows/ci.yml'), candidateWorkflow),
  ]);
  return { trustedRoot, candidateRoot };
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function check(name, overrides = {}) {
  return {
    name,
    conclusion: 'success',
    head_sha: candidate,
    app: { slug: 'github-actions' },
    details_url: `https://github.com/${repository}/actions/runs/${runId}/job/789`,
    ...overrides,
  };
}

function run(overrides = {}) {
  return {
    conclusion: 'success',
    head_sha: candidate,
    path: '.github/workflows/ci.yml',
    event: 'push',
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    ...overrides,
  };
}

function githubFetch(checks, workflowRun = run()) {
  return async (url) =>
    url.includes('/check-runs')
      ? response({ total_count: checks.length, check_runs: checks })
      : response(workflowRun);
}

describe('candidate check provenance', () => {
  it('binds every required GitHub Actions check to the candidate and trusted CI run', async () => {
    const directories = await roots();
    const result = await verifyCandidateCheckProvenance({
      candidate,
      repository,
      token: 'test-token',
      ...directories,
      fetchImpl: githubFetch(requiredCandidateChecks.map((name) => check(name))),
    });
    expect(result.checks).toEqual(
      requiredCandidateChecks.map((name) => ({ name, workflowRunId: runId })),
    );
  });

  it('rejects a candidate-modified CI workflow before trusting its green checks', async () => {
    const directories = await roots('name: weakened\n');
    await expect(
      verifyCandidateCheckProvenance({
        candidate,
        repository,
        token: 'test-token',
        ...directories,
        fetchImpl: githubFetch(requiredCandidateChecks.map((name) => check(name))),
      }),
    ).rejects.toThrow(/differs from trusted/u);
  });

  it('rejects same-name checks from another app or commit', async () => {
    const directories = await roots();
    const checks = requiredCandidateChecks.map((name) => check(name));
    checks[0] = check('code-quality', { app: { slug: 'untrusted-app' } });
    checks.push(check('code-quality', { head_sha: 'b'.repeat(40) }));
    await expect(
      verifyCandidateCheckProvenance({
        candidate,
        repository,
        token: 'test-token',
        ...directories,
        fetchImpl: githubFetch(checks),
      }),
    ).rejects.toThrow(/code-quality/u);
  });

  it('rejects a check linked to the wrong workflow, repository or event', async () => {
    const directories = await roots();
    await expect(
      verifyCandidateCheckProvenance({
        candidate,
        repository,
        token: 'test-token',
        ...directories,
        fetchImpl: githubFetch(
          requiredCandidateChecks.map((name) => check(name)),
          run({ path: '.github/workflows/untrusted.yml', event: 'workflow_dispatch' }),
        ),
      }),
    ).rejects.toThrow(/code-quality/u);
  });

  it('fails closed when GitHub returns a malformed or truncated check-run page', async () => {
    const directories = await roots();
    const checks = requiredCandidateChecks.map((name) => check(name));
    const malformedFetch = async (url) =>
      url.includes('/check-runs')
        ? response({ total_count: Number.MAX_SAFE_INTEGER + 1, check_runs: checks })
        : response(run());
    await expect(
      verifyCandidateCheckProvenance({
        candidate,
        repository,
        token: 'test-token',
        ...directories,
        fetchImpl: malformedFetch,
      }),
    ).rejects.toThrow(/response is invalid/u);

    const truncatedFetch = async (url) =>
      url.includes('/check-runs')
        ? response({ total_count: checks.length + 1, check_runs: checks })
        : response(run());
    await expect(
      verifyCandidateCheckProvenance({
        candidate,
        repository,
        token: 'test-token',
        ...directories,
        fetchImpl: truncatedFetch,
      }),
    ).rejects.toThrow(/response is incomplete/u);
  });
});
