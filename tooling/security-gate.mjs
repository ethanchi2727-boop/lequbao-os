import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { inspectDependencyInstallPolicy } from './dependency-install-policy.mjs';
import { inspectDevelopmentMockProfile } from './development-mock-profile.mjs';
import {
  inspectProductionLicenseReport,
  readInstalledProductionLicenseReport,
} from './production-license-policy.mjs';
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  encoding: 'utf8',
});
if (listed.status !== 0) throw new Error('git file inventory unavailable');
const repositoryFiles = listed.stdout.split('\0').filter(Boolean);
const files = repositoryFiles.filter(
  (file) =>
    !/(?:^|\/)(?:node_modules|dist|coverage)(?:\/|$)/u.test(file) &&
    /\.(?:[cm]?[jt]sx?|json|ya?ml|md|sql|env|toml|ini|properties|sh|ps1)$/iu.test(file),
);
const patterns = [
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['GITHUB_TOKEN', /gh[pousr]_[A-Za-z0-9]{30,}/u],
  ['AWS_ACCESS_KEY', /AKIA[0-9A-Z]{16}/u],
  ['URL_CREDENTIAL', /https?:\/\/[^\s/:]+:[^\s/@]+@/u],
  ['JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u],
];
const failures = [];
for (const file of files) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const [code, pattern] of patterns) {
    if (pattern.test(text)) failures.push(`${code}:${file}`);
  }
}
const lockText = await readFile('pnpm-lock.yaml', 'utf8'),
  lockHash = createHash('sha256').update(lockText).digest('hex'),
  sbom = JSON.parse(await readFile('docs/release/sbom.cdx.json', 'utf8'));
const recorded = sbom.metadata?.properties?.find(
  (item) => item.name === 'lequ:pnpm-lock-sha256',
)?.value;
if (recorded !== lockHash) failures.push('SBOM_LOCK_HASH_MISMATCH');
if (!Array.isArray(sbom.components) || sbom.components.length < 1) failures.push('SBOM_EMPTY');
const packageFiles = repositoryFiles
    .filter((file) =>
      /^(?:package\.json|apps\/[^/]+\/package\.json|packages\/[^/]+\/package\.json)$/u.test(file),
    )
    .sort(),
  installFiles = [
    ...new Set([
      'README.md',
      '.devcontainer/bootstrap.sh',
      'deploy/Dockerfile',
      ...repositoryFiles.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/iu.test(file)),
    ]),
  ].sort(),
  packageManifests = Object.fromEntries(
    await Promise.all(
      packageFiles.map(async (file) => [file, JSON.parse(await readFile(file, 'utf8'))]),
    ),
  ),
  installSources = Object.fromEntries(
    await Promise.all(installFiles.map(async (file) => [file, await readFile(file, 'utf8')])),
  );
failures.push(
  ...inspectDependencyInstallPolicy({
    workspaceSource: await readFile('pnpm-workspace.yaml', 'utf8'),
    rootManifest: packageManifests['package.json'],
    nodeVersion: await readFile('.node-version', 'utf8'),
    packageManifests,
    lockfileSource: lockText,
    installSources,
  }).map((failure) => `DEPENDENCY_POLICY:${failure}`),
);
const productionLicenses = inspectProductionLicenseReport(readInstalledProductionLicenseReport());
failures.push(
  ...productionLicenses.failures.map((failure) => `PRODUCTION_LICENSE_POLICY:${failure}`),
);
failures.push(
  ...inspectDevelopmentMockProfile({
    productionSource: await readFile('.env.example', 'utf8'),
    mockSource: await readFile('.env.development-mock.example', 'utf8'),
  }).map((failure) => `DEVELOPMENT_MOCK_PROFILE:${failure}`),
);
if (failures.length) {
  for (const failure of failures) console.error(`Security gate failure: ${failure}`);
  process.exitCode = 1;
} else
  console.log(
    `Security gate verified ${files.length} text files, ${sbom.components.length} SBOM components and ${productionLicenses.packageVersions} production package versions across ${productionLicenses.licenses.length} approved licenses; no embedded production secret patterns.`,
  );
