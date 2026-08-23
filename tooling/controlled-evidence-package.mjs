import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, opendir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { captureReceiptPath } from './controlled-capture-receipt.mjs';
import { verifyControlledResults } from './controlled-results.mjs';
import { assertCandidateCheckout } from './prepare-controlled-evidence.mjs';

const execFile = promisify(execFileCallback);

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function controlledEvidencePackageFiles(plan) {
  const files = ['controlled-execution-context.json', 'results.json'];
  const seen = new Set(files);
  for (const suite of plan.suites ?? []) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(suite.evidenceDirectory ?? ''))
      throw new Error(
        `package plan has unsafe evidence directory: ${suite.evidenceDirectory ?? ''}`,
      );
    for (const artifact of suite.requiredEvidence ?? []) {
      if (!/^[a-z0-9][a-z0-9.-]*$/u.test(artifact))
        throw new Error(`package plan has unsafe artifact: ${artifact ?? ''}`);
      const artifactPath = path.posix.join(suite.evidenceDirectory, artifact);
      const receiptPath = path
        .relative('.', captureReceiptPath('.', suite, artifact))
        .split(path.sep)
        .join('/');
      for (const relative of [artifactPath, receiptPath]) {
        if (seen.has(relative)) throw new Error(`package plan duplicates a path: ${relative}`);
        seen.add(relative);
        files.push(relative);
      }
    }
  }
  return files.sort();
}

async function walkRegularFiles(root, directory = root) {
  const files = [];
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const absolute = path.join(directory, entry.name);
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink())
      throw new Error(`package contains a symbolic link: ${entry.name}`);
    if (metadata.isDirectory()) files.push(...(await walkRegularFiles(root, absolute)));
    else if (metadata.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    else throw new Error(`package contains a special filesystem entry: ${entry.name}`);
  }
  return files;
}

export async function inspectControlledEvidencePackageInventory({ plan, packageRoot }) {
  const expected = controlledEvidencePackageFiles(plan);
  let actual;
  try {
    actual = (await walkRegularFiles(packageRoot)).sort();
  } catch (error) {
    return [error instanceof Error ? error.message : 'controlled evidence package is unreadable'];
  }
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((file) => !actualSet.has(file));
  const extra = actual.filter((file) => !expectedSet.has(file));
  return [
    ...(missing.length ? [`controlled evidence package is missing: ${missing.join(', ')}`] : []),
    ...(extra.length
      ? [`controlled evidence package contains undeclared files: ${extra.join(', ')}`]
      : []),
  ];
}

export async function stageControlledEvidencePackage({ plan, evidenceRoot, outputRoot }) {
  if (!path.isAbsolute(evidenceRoot) || !path.isAbsolute(outputRoot))
    throw new Error('evidenceRoot and outputRoot must be absolute');
  const physicalEvidenceRoot = await realpath(evidenceRoot);
  const resolvedOutput = path.resolve(outputRoot);
  const physicalOutputParent = await realpath(path.dirname(resolvedOutput));
  const physicalOutput = path.join(physicalOutputParent, path.basename(resolvedOutput));
  if (inside(physicalEvidenceRoot, physicalOutput))
    throw new Error('package output must be outside the controlled evidence workspace');
  await mkdir(physicalOutput);
  for (const relative of controlledEvidencePackageFiles(plan)) {
    const source = path.resolve(physicalEvidenceRoot, ...relative.split('/'));
    const physicalSource = await realpath(source);
    if (!inside(physicalEvidenceRoot, physicalSource))
      throw new Error(`package source resolves outside the evidence workspace: ${relative}`);
    if (!(await lstat(physicalSource)).isFile())
      throw new Error(`package source is not a regular file: ${relative}`);
    const destination = path.resolve(physicalOutput, ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(physicalSource, destination, constants.COPYFILE_EXCL);
  }
  const failures = await inspectControlledEvidencePackageInventory({
    plan,
    packageRoot: physicalOutput,
  });
  if (failures.length) throw new Error(failures.join('; '));
  return { outputRoot: physicalOutput, fileCount: controlledEvidencePackageFiles(plan).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const verifyPackage = argument('verify-package');
  const evidenceRoot = argument('evidence-root');
  const outputRoot = argument('output');
  const planSource = await readFile('docs/release/controlled-acceptance-plan.json', 'utf8');
  const plan = JSON.parse(planSource);
  if (verifyPackage) {
    if (!path.isAbsolute(verifyPackage)) throw new Error('--verify-package must be absolute');
    const resultsFile = path.join(verifyPackage, 'results.json');
    const failures = [
      ...(await verifyControlledResults({
        plan,
        planSource,
        resultsFile,
        releaseCommit: process.env.RELEASE_COMMIT,
      })),
      ...(await inspectControlledEvidencePackageInventory({ plan, packageRoot: verifyPackage })),
    ];
    if (failures.length) {
      for (const failure of failures) console.error(`Controlled package failure: ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(
        `Controlled evidence package inventory verified: ${controlledEvidencePackageFiles(plan).length} exact files.`,
      );
    }
  } else {
    if (!evidenceRoot || !path.isAbsolute(evidenceRoot))
      throw new Error('--evidence-root must be absolute');
    if (!outputRoot || !path.isAbsolute(outputRoot))
      throw new Error('--output must be new and absolute');
    const resultsFile = path.join(evidenceRoot, 'results.json');
    const results = JSON.parse(await readFile(resultsFile, 'utf8'));
    const [{ stdout: head }, { stdout: status }] = await Promise.all([
      execFile('git', ['rev-parse', 'HEAD']),
      execFile('git', ['status', '--porcelain']),
    ]);
    assertCandidateCheckout({
      releaseCommit: results.releaseCommit,
      headCommit: head.trim(),
      status,
    });
    const failures = await verifyControlledResults({
      plan,
      planSource,
      resultsFile,
      releaseCommit: results.releaseCommit,
    });
    if (failures.length) throw new Error(`controlled results are invalid: ${failures.join('; ')}`);
    const staged = await stageControlledEvidencePackage({ plan, evidenceRoot, outputRoot });
    console.log(
      `Staged ${staged.fileCount} exact controlled evidence files at ${staged.outputRoot}.`,
    );
  }
}
