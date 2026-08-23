import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const approvedProductionLicenses = new Set([
  '0BSD',
  '(MIT AND Zlib)',
  'Apache 2.0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
]);

export function inspectProductionLicenseReport(report) {
  const failures = [];
  if (!report || Array.isArray(report) || typeof report !== 'object')
    return { failures: ['license report must be an object'], packageVersions: 0, licenses: [] };
  const entries = Object.entries(report);
  if (!entries.length)
    return { failures: ['license report must not be empty'], packageVersions: 0, licenses: [] };
  const seen = new Map();
  let packageVersions = 0;
  for (const [license, packages] of entries) {
    if (!approvedProductionLicenses.has(license))
      failures.push(`${license || '<blank>'} is not an approved production license`);
    if (!Array.isArray(packages) || packages.length === 0) {
      failures.push(`${license || '<blank>'} has no packages`);
      continue;
    }
    for (const [index, pkg] of packages.entries()) {
      const prefix = `${license}[${index}]`;
      if (!pkg || Array.isArray(pkg) || typeof pkg !== 'object') {
        failures.push(`${prefix} must be an object`);
        continue;
      }
      if (typeof pkg.name !== 'string' || !pkg.name.trim())
        failures.push(`${prefix}.name is missing`);
      if (pkg.license !== license) failures.push(`${prefix}.license must equal ${license}`);
      if (!Array.isArray(pkg.versions) || pkg.versions.length === 0) {
        failures.push(`${prefix}.versions must not be empty`);
        continue;
      }
      for (const version of pkg.versions) {
        if (typeof version !== 'string' || !version.trim()) {
          failures.push(`${prefix}.versions contains an invalid value`);
          continue;
        }
        packageVersions += 1;
        const identity = `${pkg.name}@${version}`;
        const previous = seen.get(identity);
        if (previous && previous !== license)
          failures.push(`${identity} is reported under both ${previous} and ${license}`);
        else seen.set(identity, license);
      }
    }
  }
  return {
    failures: [...new Set(failures)],
    packageVersions,
    licenses: entries.map(([key]) => key).sort(),
  };
}

export function readInstalledProductionLicenseReport(environment = process.env) {
  const npmExecutable = environment.npm_execpath;
  const command = npmExecutable
    ? process.execPath
    : process.platform === 'win32'
      ? 'pnpm.cmd'
      : 'pnpm';
  const args = npmExecutable
    ? [npmExecutable, 'licenses', 'list', '--prod', '--json']
    : ['licenses', 'list', '--prod', '--json'];
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    const diagnostic = result.stderr?.trim() || result.stdout?.trim() || result.error?.message;
    throw new Error(`production license inventory failed${diagnostic ? `: ${diagnostic}` : ''}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('production license inventory returned invalid JSON');
  }
}

async function main() {
  const inspected = inspectProductionLicenseReport(readInstalledProductionLicenseReport());
  if (inspected.failures.length) {
    for (const failure of inspected.failures)
      console.error(`Production license failure: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Production licenses verified: ${inspected.packageVersions} package versions across ${inspected.licenses.join(', ')}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
