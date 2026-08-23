import YAML from 'yaml';

export const approvedPackageManager = 'pnpm@11.19.0';
export const approvedNodeVersion = '22.23.1';
export const approvedDependencyBuilds = Object.freeze({
  'core-js': false,
  'core-js-pure': false,
  esbuild: true,
});

const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const exoticSource = /^(?:git\+|git:|github:|gitlab:|bitbucket:|https?:|file:)/iu;

function inspectDependencyMap(file, field, dependencies, failures) {
  for (const [name, specifier] of Object.entries(dependencies ?? {})) {
    if (specifier === 'workspace:*' || exactVersion.test(specifier)) continue;
    failures.push(`${file}: ${field}.${name} must use an exact version or workspace:*`);
  }
}

function stableObject(value) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))),
  );
}

export function inspectDependencyInstallPolicy({
  workspaceSource,
  rootManifest,
  nodeVersion,
  packageManifests,
  lockfileSource,
  installSources,
}) {
  const failures = [];
  const workspace = YAML.parse(workspaceSource);
  if (rootManifest.packageManager !== approvedPackageManager)
    failures.push(`package.json: packageManager must be ${approvedPackageManager}`);
  if (nodeVersion.trim() !== approvedNodeVersion)
    failures.push(`.node-version: must be ${approvedNodeVersion}`);
  if (workspace.strictDepBuilds !== true)
    failures.push('pnpm-workspace.yaml: strictDepBuilds must be true');
  if (workspace.dangerouslyAllowAllBuilds !== false)
    failures.push('pnpm-workspace.yaml: dangerouslyAllowAllBuilds must be explicitly false');
  if (workspace.blockExoticSubdeps !== true)
    failures.push('pnpm-workspace.yaml: blockExoticSubdeps must be true');
  if (workspace.trustLockfile !== false)
    failures.push('pnpm-workspace.yaml: trustLockfile must be explicitly false');
  if (stableObject(workspace.allowBuilds) !== stableObject(approvedDependencyBuilds))
    failures.push(
      'pnpm-workspace.yaml: allowBuilds must approve only esbuild and deny reviewed core-js hooks',
    );

  for (const [file, manifest] of Object.entries(packageManifests)) {
    inspectDependencyMap(file, 'dependencies', manifest.dependencies, failures);
    inspectDependencyMap(file, 'devDependencies', manifest.devDependencies, failures);
    inspectDependencyMap(file, 'optionalDependencies', manifest.optionalDependencies, failures);
  }

  const lockfile = YAML.parse(lockfileSource);
  if (lockfile.lockfileVersion !== '9.0')
    failures.push('pnpm-lock.yaml: lockfileVersion must be 9.0');
  for (const [packageKey, snapshot] of Object.entries(lockfile.packages ?? {})) {
    if (exoticSource.test(packageKey))
      failures.push(`pnpm-lock.yaml: exotic package source is forbidden: ${packageKey}`);
    const resolution = snapshot?.resolution;
    if (
      !resolution ||
      typeof resolution.integrity !== 'string' ||
      !resolution.integrity.startsWith('sha512-')
    )
      failures.push(`pnpm-lock.yaml: package has no SHA-512 integrity: ${packageKey}`);
    if (typeof resolution?.tarball === 'string' && exoticSource.test(resolution.tarball))
      failures.push(`pnpm-lock.yaml: direct tarball source is forbidden: ${packageKey}`);
  }

  for (const [file, source] of Object.entries(installSources)) {
    for (const match of source.matchAll(
      /\b(?:corepack\s+)?pnpm(?:\.cmd)?\s+(?:install|i)\b[^\r\n]*/giu,
    ))
      if (!match[0].includes('--frozen-lockfile'))
        failures.push(`${file}: pnpm install must use --frozen-lockfile`);
  }
  return failures;
}
