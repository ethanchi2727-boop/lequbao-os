import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { controlledJsonEvidenceContracts } from './controlled-evidence-contracts.mjs';
import { controlledSuiteCrossEvidenceRules } from './controlled-suite-evidence.mjs';

const execFile = promisify(execFileCallback);
const opaqueLabel = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const safeDirectory = /^[a-z0-9-]+$/u;
const safeFile = /^[a-z0-9][a-z0-9.-]*$/u;

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function validateInputs({ plan, evidenceRoot, releaseCommit, deploymentId, environment }) {
  if (!path.isAbsolute(evidenceRoot)) throw new Error('evidenceRoot must be absolute');
  if (!/^[a-f0-9]{40}$/u.test(releaseCommit))
    throw new Error('releaseCommit must be an exact lowercase 40-character SHA');
  if (!opaqueLabel.test(deploymentId ?? ''))
    throw new Error('deploymentId must be an opaque label');
  if (!opaqueLabel.test(environment ?? '')) throw new Error('environment must be an opaque label');
  if (plan?.version !== 1 || !Array.isArray(plan.suites) || plan.suites.length === 0)
    throw new Error('controlled acceptance plan is invalid');
  const codes = new Set();
  for (const suite of plan.suites) {
    if (!/^[A-Z0-9_]+$/u.test(suite.code ?? '') || codes.has(suite.code))
      throw new Error(`invalid or duplicated suite code: ${suite.code ?? ''}`);
    codes.add(suite.code);
    if (!safeDirectory.test(suite.evidenceDirectory ?? ''))
      throw new Error(`${suite.code} has an unsafe evidence directory`);
    if (
      !Array.isArray(suite.requiredEvidence) ||
      suite.requiredEvidence.length === 0 ||
      suite.requiredEvidence.some((file) => !safeFile.test(file))
    )
      throw new Error(`${suite.code} has unsafe or missing evidence files`);
  }
}

function describeSemanticRule(rule) {
  const details = [rule.type];
  if (rule.equals !== undefined) details.push(`must equal \`${JSON.stringify(rule.equals)}\``);
  if (rule.binding) details.push(`must match workspace \`${rule.binding}\``);
  if (rule.minimum !== undefined) details.push(`minimum ${rule.minimum}`);
  if (rule.maximum !== undefined) details.push(`maximum ${rule.maximum}`);
  if (rule.pattern) details.push(`pattern \`${rule.pattern}\``);
  if (rule.format) details.push(`format \`${rule.format}\``);
  if (rule.maxItems === 0) details.push('must be empty');
  return details.join(', ');
}

function executionGuide({ plan, releaseCommit, deploymentId, environment, createdAt }) {
  const lines = [
    '# Controlled acceptance execution workspace',
    '',
    `- Release commit: \`${releaseCommit}\``,
    `- Deployment: \`${deploymentId}\``,
    `- Environment: \`${environment}\``,
    `- Prepared at: \`${createdAt}\``,
    '',
    'This workspace contains no PASS decision and no evidence placeholder. Execute every suite against the exact candidate, retain failed attempts, redact credentials and customer data, and obtain an independent review before changing `decisions.template.json` entries to `PASS`.',
    '',
  ];
  for (const suite of plan.suites) {
    const artifactLines = suite.requiredEvidence.flatMap((file) => {
      const contract = controlledJsonEvidenceContracts[file];
      return [
        `  - \`${file}\``,
        `    - Capture: \`pnpm controlled:capture -- --evidence-root=<absolute-this-directory> --suite=${suite.code} --artifact=${file} --source=<absolute-captured-source>\``,
        ...(contract
          ? [
              '    - Required JSON fields:',
              ...contract.map((rule) => `      - \`${rule.path}\`: ${describeSemanticRule(rule)}`),
            ]
          : []),
      ];
    });
    lines.push(
      `## ${suite.code}`,
      '',
      `- Gate: \`${suite.environmentGate}\``,
      `- Executor role: ${suite.executorRole}`,
      `- Runbook: \`${suite.runbook}\``,
      `- Evidence directory: \`${suite.evidenceDirectory}\``,
      '- Required artifacts:',
      ...artifactLines,
      '- Pass criteria:',
      ...suite.passCriteria.map((criterion) => `  - ${criterion}`),
      ...(controlledSuiteCrossEvidenceRules[suite.code]
        ? [
            '- Cross-artifact invariants:',
            ...controlledSuiteCrossEvidenceRules[suite.code].map((rule) => `  - ${rule}`),
          ]
        : []),
      '',
    );
  }
  lines.push(
    '## Final assembly',
    '',
    'After independent review, copy `decisions.template.json` to a separate immutable decision file, replace every pending field with the real accountable identity, role and UTC timestamps, then run:',
    '',
    '`pnpm controlled:assemble -- --decisions=<absolute-reviewed-decisions.json> --evidence-root=<absolute-this-directory>`',
    '',
    'The assembler refuses missing, invalid, unredacted or placeholder evidence and will not overwrite an existing `results.json`.',
    '',
    'After the local launch precheck passes, create a new upload staging directory containing only the exact verified manifest, context, artifacts and capture receipts:',
    '',
    '`pnpm controlled:stage-release -- --evidence-root=<absolute-this-directory> --output=<new-absolute-staging-directory>`',
    '',
    'Archive only that staging directory. Operator guides, decision templates, undeclared files and symlinks are forbidden from the release package.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

export function assertCandidateCheckout({ releaseCommit, headCommit, status }) {
  if (headCommit !== releaseCommit)
    throw new Error(`releaseCommit does not match checked-out HEAD ${headCommit}`);
  if (status.trim()) throw new Error('controlled evidence preparation requires a clean worktree');
}

export async function prepareControlledEvidenceWorkspace({
  plan,
  planSource,
  evidenceRoot,
  releaseCommit,
  deploymentId,
  environment,
  createdAt = new Date().toISOString(),
}) {
  validateInputs({ plan, evidenceRoot, releaseCommit, deploymentId, environment });
  if (!Number.isFinite(Date.parse(createdAt)))
    throw new Error('createdAt must be an ISO timestamp');

  await mkdir(path.dirname(evidenceRoot), { recursive: true });
  await mkdir(evidenceRoot);
  await mkdir(path.join(evidenceRoot, '.controlled-receipts'));
  for (const suite of plan.suites) {
    await mkdir(path.join(evidenceRoot, suite.evidenceDirectory), { recursive: false });
    await mkdir(path.join(evidenceRoot, '.controlled-receipts', suite.evidenceDirectory), {
      recursive: false,
    });
  }

  const planSha256 = createHash('sha256').update(planSource).digest('hex');
  const context = {
    version: 1,
    releaseCommit,
    planSha256,
    deploymentId,
    environment,
    createdAt,
    suiteCount: plan.suites.length,
    requiredArtifactCount: plan.suites.reduce(
      (total, suite) => total + suite.requiredEvidence.length,
      0,
    ),
  };
  const decisions = {
    version: 1,
    releaseCommit,
    suites: plan.suites.map((suite) => ({
      code: suite.code,
      result: 'PENDING',
      environmentGate: suite.environmentGate,
      executedById: 'PENDING',
      executedByRole: suite.executorRole,
      reviewedById: 'PENDING',
      reviewedByRole: 'PENDING',
      startedAt: 'PENDING',
      completedAt: 'PENDING',
      reviewedAt: 'PENDING',
    })),
  };
  await Promise.all([
    writeFile(
      path.join(evidenceRoot, 'controlled-execution-context.json'),
      `${JSON.stringify(context, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    ),
    writeFile(
      path.join(evidenceRoot, 'decisions.template.json'),
      `${JSON.stringify(decisions, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    ),
    writeFile(
      path.join(evidenceRoot, 'README.md'),
      executionGuide({ plan, releaseCommit, deploymentId, environment, createdAt }),
      { encoding: 'utf8', flag: 'wx' },
    ),
  ]);
  return context;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidenceRoot = argument('evidence-root');
  const releaseCommit = argument('release-commit');
  const deploymentId = argument('deployment-id');
  const environment = argument('environment');
  if (!evidenceRoot || !path.isAbsolute(evidenceRoot))
    throw new Error('--evidence-root must be a new absolute directory');
  if (!releaseCommit) throw new Error('--release-commit is required');
  if (!deploymentId) throw new Error('--deployment-id is required');
  if (!environment) throw new Error('--environment is required');
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFile('git', ['rev-parse', 'HEAD']),
    execFile('git', ['status', '--porcelain']),
  ]);
  assertCandidateCheckout({ releaseCommit, headCommit: head.trim(), status });
  const planSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
  const plan = JSON.parse(planSource);
  const context = await prepareControlledEvidenceWorkspace({
    plan,
    planSource,
    evidenceRoot,
    releaseCommit,
    deploymentId,
    environment,
  });
  console.log(
    `Prepared ${context.suiteCount} controlled suites and ${context.requiredArtifactCount} artifact slots without creating evidence placeholders.`,
  );
}
