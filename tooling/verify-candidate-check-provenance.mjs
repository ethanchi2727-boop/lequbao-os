import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredCandidateChecks = ['code-quality', 'postgres-contract', 'container-build'];
export const trustedCandidateWorkflowPath = '.github/workflows/ci.yml';

const candidatePattern = /^[0-9a-f]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

async function githubJson(fetchImpl, token, url) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok)
    throw new Error(`GitHub provenance request failed with HTTP ${response.status}`);
  return response.json();
}

export async function verifyCandidateCheckProvenance({
  candidate,
  repository,
  token,
  trustedRoot = 'trusted',
  candidateRoot = 'candidate',
  fetchImpl = fetch,
}) {
  if (!candidatePattern.test(candidate ?? '')) throw new Error('candidate must be a lowercase SHA');
  if (!repositoryPattern.test(repository ?? '')) throw new Error('repository must be owner/name');
  if (!token) throw new Error('GitHub token is required');

  const [trustedWorkflow, candidateWorkflow] = await Promise.all([
    readFile(path.join(trustedRoot, trustedCandidateWorkflowPath)),
    readFile(path.join(candidateRoot, trustedCandidateWorkflowPath)),
  ]);
  if (!trustedWorkflow.equals(candidateWorkflow))
    throw new Error('candidate CI workflow differs from trusted release policy');

  const apiRoot = `https://api.github.com/repos/${repository}`;
  const checks = await githubJson(
    fetchImpl,
    token,
    `${apiRoot}/commits/${candidate}/check-runs?per_page=100`,
  );
  if (!Array.isArray(checks?.check_runs) || !Number.isSafeInteger(checks?.total_count))
    throw new Error('GitHub check-run response is invalid');
  if (checks.total_count !== checks.check_runs.length)
    throw new Error('GitHub check-run response is incomplete');

  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const detailsPattern = new RegExp(
    `^https://github\\.com/${escapedRepository}/actions/runs/([1-9][0-9]*)/job/[1-9][0-9]*$`,
    'u',
  );
  const runCache = new Map();
  const verified = [];

  for (const required of requiredCandidateChecks) {
    let acceptedRunId;
    for (const check of checks.check_runs) {
      if (
        check?.name !== required ||
        check?.conclusion !== 'success' ||
        check?.head_sha !== candidate ||
        check?.app?.slug !== 'github-actions'
      )
        continue;
      const match = detailsPattern.exec(check.details_url ?? '');
      if (!match) continue;
      const runId = match[1];
      let run = runCache.get(runId);
      if (!run) {
        run = await githubJson(fetchImpl, token, `${apiRoot}/actions/runs/${runId}`);
        runCache.set(runId, run);
      }
      if (
        run?.conclusion === 'success' &&
        run?.head_sha === candidate &&
        run?.path === trustedCandidateWorkflowPath &&
        ['push', 'pull_request'].includes(run?.event) &&
        run?.repository?.full_name === repository &&
        run?.head_repository?.full_name === repository
      ) {
        acceptedRunId = runId;
        break;
      }
    }
    if (!acceptedRunId)
      throw new Error(`trusted successful candidate check is missing: ${required}`);
    verified.push({ name: required, workflowRunId: acceptedRunId });
  }

  return { candidate, repository, workflowPath: trustedCandidateWorkflowPath, checks: verified };
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await verifyCandidateCheckProvenance({
    candidate: option('candidate') ?? process.env.CANDIDATE_COMMIT,
    repository: option('repository') ?? process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
    trustedRoot: option('trusted-root') ?? 'trusted',
    candidateRoot: option('candidate-root') ?? 'candidate',
  });
  console.log(
    `Candidate check provenance verified: ${result.checks.map((check) => `${check.name}@${check.workflowRunId}`).join(', ')}.`,
  );
}
