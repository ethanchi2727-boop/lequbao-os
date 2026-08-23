import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function verifyControlled300StageMap(root) {
  const [plan, mapping] = await Promise.all([
    readFile(join(root, 'docs/release/controlled-acceptance-plan.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/release/controlled-300-stage-map.json'), 'utf8').then(JSON.parse),
  ]);
  const failures = [];
  const expectedStages = Array.from({ length: 20 }, (_, index) => 281 + index);
  const actualStages = mapping.stages.map((item) => item.stage);
  if (mapping.status !== 'CONTROLLED') failures.push('mapping status must remain CONTROLLED');
  if (
    new Set(actualStages).size !== 20 ||
    expectedStages.some((stage) => !actualStages.includes(stage))
  )
    failures.push('mapping must contain unique stages 281 through 300');

  const suites = mapping.stages.filter((item) => item.kind === 'suite');
  const controls = mapping.stages.filter((item) => item.kind === 'release-control');
  const planByCode = new Map(plan.suites.map((suite) => [suite.code, suite]));
  if (suites.length !== 11 || controls.length !== 9)
    failures.push('mapping must contain eleven suites and nine release controls');
  if (
    plan.suites.some((suite) => !suites.some((item) => item.suiteCode === suite.code)) ||
    suites.some((item) => !planByCode.has(item.suiteCode))
  )
    failures.push('suite mapping must exactly cover the controlled acceptance plan');
  for (const item of suites) {
    const suite = planByCode.get(item.suiteCode);
    if (suite && item.expectedArtifactCount !== suite.requiredEvidence.length)
      failures.push(`${item.suiteCode} artifact count drifted`);
  }
  if (suites.reduce((total, item) => total + item.expectedArtifactCount, 0) !== 47)
    failures.push('controlled suite mapping must cover exactly 47 evidence artifacts');
  if (
    controls.some(
      (item) =>
        !item.code ||
        !Array.isArray(item.completionEvidence) ||
        item.completionEvidence.length < 2 ||
        'result' in item,
    )
  )
    failures.push('release controls need evidence requirements and cannot predeclare a result');
  if (new Set(controls.map((item) => item.code)).size !== 9)
    failures.push('release control codes must be unique');
  if (mapping.stages.some((item) => 'passed' in item || item.status === 'DONE'))
    failures.push('controlled mapping cannot claim execution or completion');

  return { failures, suites: suites.length, controls: controls.length, artifacts: 47 };
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
