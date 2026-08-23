import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedSequence = [
  'format:check',
  'lint',
  'frontend:check',
  'experience:closure',
  'controlled:stage-map',
  'controlled:inventory',
  'workbench:performance',
  'openapi:check',
  'security:check',
  'operations:check',
  'deployment:check',
  'typecheck',
  'test',
  'build',
  'artifacts:check',
];

const controlledExecutionScripts = [
  'controlled:preflight',
  'controlled:prepare',
  'controlled:capture',
  'controlled:assemble',
  'controlled:stage-release',
  'launch:gate',
];

function commandTokens(command) {
  return command
    .split('&&')
    .map((part) => part.trim().match(/^pnpm\s+([^\s]+)/u)?.[1])
    .filter(Boolean);
}

export async function verifyLocalReleaseGateSequence(root) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const actual = commandTokens(pkg.scripts.check);
  const positions = expectedSequence.map((script) => actual.indexOf(script));
  const checks = expectedSequence.map((script, index) => ({
    name: script,
    passed:
      typeof pkg.scripts[script] === 'string' &&
      positions[index] >= 0 &&
      (index === 0 || positions[index] > positions[index - 1]),
  }));
  checks.push({
    name: 'controlled-execution-gates-excluded',
    passed: controlledExecutionScripts.every((script) => !actual.includes(script)),
  });
  const failures = checks.filter((check) => !check.passed).map((check) => check.name);
  if (failures.length)
    throw new Error(`Local release gate sequence failed: ${failures.join(', ')}`);
  return { checks, sequence: expectedSequence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const report = await verifyLocalReleaseGateSequence(root);
  console.log(
    `Local release sequence passed: ${report.sequence.length} ordered local/static gates and controlled execution gates excluded.`,
  );
}
