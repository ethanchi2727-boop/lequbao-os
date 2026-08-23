import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { inspectDependencyInstallPolicy } from './dependency-install-policy.mjs';

const packageFiles = [
  'package.json',
  'apps/api/package.json',
  'apps/bao-uniapp/package.json',
  'apps/consumer-miniapp/package.json',
  'apps/life-uniapp/package.json',
  'apps/merchant-miniapp/package.json',
  'apps/workbench-web/package.json',
  'apps/worker/package.json',
  'packages/contracts/package.json',
];
const installFiles = [
  'README.md',
  '.devcontainer/bootstrap.sh',
  '.github/workflows/ci.yml',
  'deploy/Dockerfile',
];

async function repositoryPolicyInput() {
  const packageManifests = Object.fromEntries(
    await Promise.all(
      packageFiles.map(async (file) => [file, JSON.parse(await readFile(file, 'utf8'))]),
    ),
  );
  const installSources = Object.fromEntries(
    await Promise.all(installFiles.map(async (file) => [file, await readFile(file, 'utf8')])),
  );
  return {
    workspaceSource: await readFile('pnpm-workspace.yaml', 'utf8'),
    rootManifest: packageManifests['package.json'],
    nodeVersion: await readFile('.node-version', 'utf8'),
    packageManifests,
    lockfileSource: await readFile('pnpm-lock.yaml', 'utf8'),
    installSources,
  };
}

describe('dependency installation supply-chain policy', () => {
  it('keeps the repository install path frozen, integrity-bound and explicitly reviewed', async () => {
    expect(inspectDependencyInstallPolicy(await repositoryPolicyInput())).toEqual([]);
  });

  it('rejects unreviewed lifecycle scripts and dangerous blanket approval', async () => {
    const input = await repositoryPolicyInput();
    input.workspaceSource = input.workspaceSource
      .replace('strictDepBuilds: true', 'strictDepBuilds: false')
      .replace('dangerouslyAllowAllBuilds: false', 'dangerouslyAllowAllBuilds: true');
    expect(inspectDependencyInstallPolicy(input)).toEqual([
      expect.stringContaining('strictDepBuilds'),
      expect.stringContaining('dangerouslyAllowAllBuilds'),
    ]);
  });

  it('rejects dependency ranges and lock entries without integrity', async () => {
    const input = await repositoryPolicyInput();
    input.packageManifests = {
      'package.json': { ...input.rootManifest, devDependencies: { example: '^1.0.0' } },
    };
    input.lockfileSource = "lockfileVersion: '9.0'\npackages:\n  example@1.0.0: {}\n";
    expect(inspectDependencyInstallPolicy(input)).toEqual([
      expect.stringContaining('must use an exact version'),
      expect.stringContaining('has no SHA-512 integrity'),
    ]);
  });

  it('rejects exotic sources and non-frozen install commands', async () => {
    const input = await repositoryPolicyInput();
    input.lockfileSource =
      "lockfileVersion: '9.0'\npackages:\n  'git+https://example.test/pkg.git':\n    resolution:\n      integrity: sha512-test\n";
    input.installSources = { README: 'corepack pnpm install\n' };
    expect(inspectDependencyInstallPolicy(input)).toEqual([
      expect.stringContaining('exotic package source'),
      expect.stringContaining('--frozen-lockfile'),
    ]);
  });
});
