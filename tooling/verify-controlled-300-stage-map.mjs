import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const forbiddenExecutionClaims = new Set([
  'accepted',
  'approved',
  'completed',
  'decision',
  'executed',
  'outcome',
  'passed',
  'result',
  'status',
]);

const expectedReleaseControls = [
  {
    stage: 292,
    code: 'CANDIDATE_BINDING',
    command: 'pnpm controlled:prepare',
    completionEvidence: ['releaseCommit', 'deploymentId', 'environment', 'planSha256'],
  },
  {
    stage: 293,
    code: 'NON_OVERWRITING_CAPTURE',
    command: 'pnpm controlled:capture',
    completionEvidence: ['47 source artifacts', '47 candidate-bound capture receipts'],
  },
  {
    stage: 294,
    code: 'INDEPENDENT_DECISIONS',
    completionEvidence: [
      'opaque executor identities',
      'different reviewer identities',
      'ordered review timestamps',
    ],
  },
  {
    stage: 295,
    code: 'RESULT_ASSEMBLY',
    command: 'pnpm controlled:assemble',
    completionEvidence: ['schema v3 results.json', 'eleven reviewed suite decisions'],
  },
  {
    stage: 296,
    code: 'EXACT_RELEASE_PACKAGE',
    command: 'pnpm controlled:stage-release',
    completionEvidence: ['exact 96-file staging directory', 'no extra or missing files'],
  },
  {
    stage: 297,
    code: 'IMMUTABLE_DRAFT_RELEASE',
    completionEvidence: ['candidate-bound draft release ID', 'unique asset ID', 'asset SHA-256'],
  },
  {
    stage: 298,
    code: 'PROTECTED_WORKFLOW_VERIFY',
    completionEvidence: [
      'trusted main workflow SHA',
      'same-repository workflow run',
      'GitHub Actions app identity',
    ],
  },
  {
    stage: 299,
    code: 'INDEPENDENT_ATTESTATION',
    completionEvidence: [
      'environment reviewer approval',
      'archive hash attestation',
      'workflow run ID',
    ],
  },
  {
    stage: 300,
    code: 'LAUNCH_DECISION',
    command: 'pnpm launch:gate',
    completionEvidence: [
      'eleven PASS suites',
      'exact release commit',
      'auditable go or no-go decision',
    ],
  },
];

const mappingFields = new Set(['version', 'status', 'stages']);
const suiteFields = new Set(['stage', 'kind', 'suiteCode', 'expectedArtifactCount']);
const releaseControlFields = new Set(['stage', 'kind', 'code', 'command', 'completionEvidence']);

export function validateControlled300StageMap(plan, mapping) {
  const failures = [];
  const expectedStages = Array.from({ length: 20 }, (_, index) => 281 + index);
  const stages = Array.isArray(mapping.stages) ? mapping.stages : [];
  const planSuites = Array.isArray(plan.suites) ? plan.suites : [];
  const actualStages = stages.map((item) => item.stage);
  if (Object.keys(mapping).some((key) => !mappingFields.has(key)))
    failures.push('mapping contains undeclared top-level fields');
  if (mapping.version !== 1) failures.push('mapping version must be 1');
  if (mapping.status !== 'CONTROLLED') failures.push('mapping status must remain CONTROLLED');
  if (
    actualStages.length !== expectedStages.length ||
    actualStages.some((stage, index) => stage !== expectedStages[index])
  )
    failures.push('mapping must contain ordered unique stages 281 through 300');

  const suites = stages.filter((item) => item.kind === 'suite');
  const controls = stages.filter((item) => item.kind === 'release-control');
  if (
    stages.some((item) => {
      const fields = item.kind === 'suite' ? suiteFields : releaseControlFields;
      return Object.keys(item).some((key) => !fields.has(key));
    })
  )
    failures.push('stage entries contain undeclared fields');
  const planByCode = new Map(planSuites.map((suite) => [suite.code, suite]));
  if (suites.length !== 11 || controls.length !== 9)
    failures.push('mapping must contain eleven suites and nine release controls');
  if (
    stages.some(
      (item) =>
        (item.stage >= 281 && item.stage <= 291 && item.kind !== 'suite') ||
        (item.stage >= 292 && item.stage <= 300 && item.kind !== 'release-control'),
    )
  )
    failures.push('stages 281-291 must be suites and stages 292-300 must be release controls');
  if (
    planSuites.some((suite) => !suites.some((item) => item.suiteCode === suite.code)) ||
    suites.some((item) => !planByCode.has(item.suiteCode))
  )
    failures.push('suite mapping must exactly cover the controlled acceptance plan');
  if (
    planSuites.length !== suites.length ||
    suites.some((item, index) => item.suiteCode !== planSuites[index]?.code)
  )
    failures.push('suite stages must preserve the controlled acceptance plan order');
  if (new Set(planSuites.map((suite) => suite.code)).size !== planSuites.length)
    failures.push('controlled acceptance plan suite codes must be unique');
  if (new Set(suites.map((item) => item.suiteCode)).size !== suites.length)
    failures.push('suite codes must be unique');
  for (const item of suites) {
    const suite = planByCode.get(item.suiteCode);
    if (!Number.isSafeInteger(item.expectedArtifactCount) || item.expectedArtifactCount <= 0)
      failures.push(
        `${item.suiteCode ?? 'unknown suite'} artifact count must be a positive integer`,
      );
    if (
      suite &&
      (!Array.isArray(suite.requiredEvidence) ||
        item.expectedArtifactCount !== suite.requiredEvidence.length)
    )
      failures.push(`${item.suiteCode} artifact count drifted`);
  }
  const artifactCount = suites.reduce(
    (total, item) =>
      total + (Number.isSafeInteger(item.expectedArtifactCount) ? item.expectedArtifactCount : 0),
    0,
  );
  if (artifactCount !== 47)
    failures.push('controlled suite mapping must cover exactly 47 evidence artifacts');
  if (
    controls.some(
      (item) =>
        !item.code ||
        !Array.isArray(item.completionEvidence) ||
        item.completionEvidence.length < 2 ||
        item.completionEvidence.some(
          (evidence) => typeof evidence !== 'string' || evidence.trim().length === 0,
        ) ||
        new Set(item.completionEvidence).size !== item.completionEvidence.length,
    )
  )
    failures.push('release controls need at least two unique non-empty evidence requirements');
  if (new Set(controls.map((item) => item.code)).size !== 9)
    failures.push('release control codes must be unique');
  if (
    expectedReleaseControls.some((expected, index) => {
      const actual = controls[index];
      return (
        !actual ||
        actual.stage !== expected.stage ||
        actual.code !== expected.code ||
        actual.command !== expected.command ||
        !Array.isArray(actual.completionEvidence) ||
        actual.completionEvidence.length !== expected.completionEvidence.length ||
        actual.completionEvidence.some(
          (evidence, evidenceIndex) => evidence !== expected.completionEvidence[evidenceIndex],
        )
      );
    })
  )
    failures.push(
      'release control stages, codes, commands and evidence must match the frozen sequence',
    );
  if (stages.some((item) => Object.keys(item).some((key) => forbiddenExecutionClaims.has(key))))
    failures.push('controlled mapping cannot claim execution or completion');

  return { failures, suites: suites.length, controls: controls.length, artifacts: artifactCount };
}

export async function verifyControlled300StageMap(root) {
  const [plan, mapping] = await Promise.all([
    readFile(join(root, 'docs/release/controlled-acceptance-plan.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/release/controlled-300-stage-map.json'), 'utf8').then(JSON.parse),
  ]);
  return validateControlled300StageMap(plan, mapping);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = await verifyControlled300StageMap(root);
  if (result.failures.length) {
    result.failures.forEach((failure) => console.error(`Controlled stage map failure: ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(
      `Controlled stage map verified: ${result.suites} suites, ${result.controls} release controls, ${result.artifacts} artifacts.`,
    );
  }
}
