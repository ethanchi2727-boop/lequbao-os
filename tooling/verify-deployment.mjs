import { readFile } from 'node:fs/promises';
import { inspectContainerImagePins } from './container-image-policy.mjs';
import { inspectGitHubActionPins } from './github-actions-policy.mjs';

const [
  dockerfile,
  previewCompose,
  previewStart,
  previewDatabaseInit,
  previewDatabaseMigration,
  dockerignore,
  workflow,
  controlledPreflight,
  candidatePublisher,
  controlledReleaseVerifier,
  webServer,
  webApp,
  webApiClient,
  runbook,
  apiRuntime,
  workerRuntime,
  envExample,
] = await Promise.all([
  readFile('deploy/Dockerfile', 'utf8'),
  readFile('compose.yaml', 'utf8'),
  readFile('deploy/start-bao-preview.sh', 'utf8'),
  readFile('deploy/init-bao-preview-postgres.sh', 'utf8'),
  readFile('deploy/migrate-bao-preview-postgres.sh', 'utf8'),
  readFile('.dockerignore', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('.github/workflows/controlled-preflight.yml', 'utf8'),
  readFile('.github/workflows/publish-candidate-images.yml', 'utf8'),
  readFile('.github/workflows/verify-controlled-release.yml', 'utf8'),
  readFile('apps/workbench-web/production-server.mjs', 'utf8'),
  readFile('apps/workbench-web/src/app.js', 'utf8'),
  readFile('apps/workbench-web/src/api-client.js', 'utf8'),
  readFile('docs/runbooks/DEPLOYMENT.md', 'utf8'),
  readFile('apps/api/src/runtime-configuration.ts', 'utf8'),
  readFile('apps/worker/src/runtime-configuration.ts', 'utf8'),
  readFile('.env.example', 'utf8'),
]);
const failures = [];
const [rootManifest, apiManifest, workerManifest, apiBuildConfig, workerBuildConfig] =
  await Promise.all(
    [
      'package.json',
      'apps/api/package.json',
      'apps/worker/package.json',
      'apps/api/tsconfig.build.json',
      'apps/worker/tsconfig.build.json',
    ].map(async (file) => JSON.parse(await readFile(file, 'utf8'))),
  );
failures.push(
  ...inspectContainerImagePins({
    dockerfiles: {
      'deploy/Dockerfile': dockerfile,
      '.devcontainer/Dockerfile': await readFile('.devcontainer/Dockerfile', 'utf8'),
    },
    manifests: {
      'compose.yaml': previewCompose,
      '.devcontainer/compose.yaml': await readFile('.devcontainer/compose.yaml', 'utf8'),
      '.github/workflows/ci.yml': workflow,
    },
  }),
);
failures.push(
  ...inspectGitHubActionPins({
    '.github/workflows/ci.yml': workflow,
    '.github/workflows/controlled-preflight.yml': controlledPreflight,
    '.github/workflows/publish-candidate-images.yml': candidatePublisher,
    '.github/workflows/verify-controlled-release.yml': controlledReleaseVerifier,
  }),
);
for (const target of ['api', 'worker', 'web']) {
  if (!new RegExp(` AS ${target}\\r?\\n`, 'u').test(dockerfile))
    failures.push(`Docker target missing: ${target}`);
  if (!workflow.includes(`--target ${target}`)) failures.push(`CI Docker build missing: ${target}`);
}
for (const marker of [
  'target: preview',
  'LEQU_PREVIEW_HOSTNAME: bao.lequ.com',
  'DATABASE_URL: postgres://postgres:',
  './database:/opt/lequ-database:ro',
])
  if (!previewCompose.includes(marker))
    failures.push(`Public preview compose marker missing: ${marker}`);
if (/^\s+ports:\s*$/gimu.test(previewCompose.split(/\n\s*app:/u)[0] ?? ''))
  failures.push('Public preview PostgreSQL must not publish a host port');
for (const marker of [
  'LEQU_PUBLIC_PREVIEW',
  'LEQU_PREVIEW_HOSTNAME',
  'WORKBENCH_API_PROXY_URL=http://127.0.0.1:3000',
  'tooling/development-mock-gateway.mjs',
  'apps/worker/src/main.ts',
  'touch "$worker_ready_marker"',
  'preview health will fail after the readiness marker expires',
])
  if (!previewStart.includes(marker))
    failures.push(`Public preview start marker missing: ${marker}`);
for (const marker of [
  '--file=/opt/lequ-database/schema.sql',
  '--set=development_seed=enabled',
  '--file=/opt/lequ-database/development-seed-verify.sql',
])
  if (!previewDatabaseInit.includes(marker))
    failures.push(`Public preview database marker missing: ${marker}`);
for (const marker of [
  '0027_platform_consumer_identity_exchange',
  '--file=/opt/lequ-database/development-seed.sql',
  '--file=/opt/lequ-database/development-seed-verify.sql',
])
  if (!previewDatabaseMigration.includes(marker))
    failures.push(`Public preview incremental database marker missing: ${marker}`);
for (const marker of ['migrate:', 'condition: service_completed_successfully'])
  if (!previewCompose.includes(marker))
    failures.push(`Public preview migration dependency missing: ${marker}`);
for (const marker of [
  'node:22.23.1-bookworm-slim',
  'pnpm@11.19.0',
  'pnpm install --frozen-lockfile',
  'deploy --prod --legacy',
  'USER node',
  'HEALTHCHECK',
  'LIFE_STATIC_ROOT=/app/life',
  'BAO_MOBILE_STATIC_ROOT=/app/bao-mobile',
  '/workspace/apps/life-uniapp/dist/build/h5/',
  '/workspace/apps/bao-uniapp/dist/build/h5/',
])
  if (!dockerfile.includes(marker)) failures.push(`Docker hardening marker missing: ${marker}`);
if (/\b(latest|ADD\s+https?:|COPY\s+.*\.env)/iu.test(dockerfile))
  failures.push('Dockerfile contains an unpinned or secret-bearing build instruction');
for (const marker of ['**/.env', '**/node_modules', '**/dist', '.git'])
  if (!dockerignore.includes(marker)) failures.push(`.dockerignore marker missing: ${marker}`);
for (const marker of [
  'content-security-policy',
  'permissions-policy',
  'x-content-type-options',
  'cross-origin-resource-policy',
  'x-permitted-cross-domain-policies',
  "frame-ancestors 'none'",
  'realpath(root)',
])
  if (!webServer.includes(marker)) failures.push(`Web production header missing: ${marker}`);
for (const marker of ['const apiBaseUrl = location.origin', 'expectedOrigin: location.origin'])
  if (!webApp.includes(marker)) failures.push(`Web same-origin API boundary missing: ${marker}`);
if (webApp.includes("params.get('apiBase')"))
  failures.push('Web production entrypoint must not accept an apiBase query override');
for (const marker of ['UNSAFE_API_ORIGIN', 'candidate.origin !== trusted'])
  if (!webApiClient.includes(marker))
    failures.push(`Web API-client same-origin enforcement missing: ${marker}`);
if (!workflow.includes('Smoke Web candidate image')) failures.push('Web image smoke step missing');
for (const marker of [
  'bao-preview-stack:',
  'docker compose -f compose.yaml up --detach --build',
  "--header 'Host: bao.lequ.com'",
  'http://127.0.0.1:8080/__development/login',
  'test -f /tmp/lequ-worker-ready',
])
  if (!workflow.includes(marker))
    failures.push(`Public preview CI smoke marker missing: ${marker}`);
for (const marker of [
  'Verify API production configuration fails closed',
  'Verify Worker production configuration fails closed',
])
  if (!workflow.includes(marker)) failures.push(`Container startup gate missing: ${marker}`);
for (const marker of [
  'environment: controlled-preproduction',
  'ref: main',
  'persist-credentials: false',
  'Resolve candidate without executing candidate code',
  'trusted/tooling/controlled-environment-preflight.mjs',
  'WORKER_TENANT_ID: ${{ vars.WORKER_TENANT_ID }}',
  'configured RELEASE_COMMIT must equal candidate_commit',
  'actions: read',
  'Prove Stage 49 candidate image manifest provenance',
  '.github/workflows/publish-candidate-images.yml',
  '.head_sha == $trusted',
  '/actions/runs/${CANDIDATE_IMAGE_RUN_ID}/artifacts?per_page=100',
  '.total_count == (.artifacts | length)',
  '(.workflow_run.id | tostring) == $run',
  '(.digest | test("^sha256:[0-9a-f]{64}$"))',
  '/actions/artifacts/${artifact_id}/zip',
  'candidate image artifact digest differs from GitHub metadata',
  "entries[0].filename != 'candidate-image-digests.json'",
])
  if (!controlledPreflight.includes(marker))
    failures.push(`Controlled preflight trust-boundary marker missing: ${marker}`);
for (const marker of [
  "if: ${{ github.ref == 'refs/heads/main' }}",
  'environment: controlled-preproduction',
  'checks: read',
  'packages: write',
  'persist-credentials: false',
  'Verify resolved candidate and required checks',
  'ref: ${{ github.sha }}',
  'verify-candidate-check-provenance.mjs',
  'docker/setup-buildx-action@',
  'docker/login-action@',
  'docker/build-push-action@',
  'target: api',
  'target: worker',
  'target: web',
  'provenance: mode=max',
  'sbom: true',
  'candidate-image-digests.json',
  'actions/upload-artifact@',
])
  if (!candidatePublisher.includes(marker))
    failures.push(`Candidate image publisher marker missing: ${marker}`);
if (/^\s*tags:\s*.*(?:^|[:/-])latest(?:\s|$)/imu.test(candidatePublisher))
  failures.push('Candidate image publisher must not create a mutable latest tag');
for (const marker of [
  "if: ${{ github.ref == 'refs/heads/main' }}",
  'environment: controlled-preproduction',
  'checks: read',
  'id-token: write',
  'attestations: write',
  'ref: ${{ github.sha }}',
  'ref: ${{ inputs.candidate_commit }}',
  'persist-credentials: false',
  '.draft == true',
  '.target_commitish == $candidate',
  '(.assets | length) == 1',
  '.assets[0].name == "controlled-evidence.tar.gz"',
  'repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}',
  'stat --format=%s evidence-package/controlled-evidence.tar.gz',
  'evidenceArchiveSha256',
  'verify-candidate-check-provenance.mjs',
  'links and special archive entries are forbidden',
  "name == 'results.json'",
  '--no-same-owner --no-same-permissions',
  'node ../trusted/tooling/controlled-evidence-package.mjs',
  '--verify-package=${{ github.workspace }}/evidence',
  'node ../trusted/tooling/verify-acceptance-evidence.mjs --launch',
  'actions/attest@',
  'actions/upload-artifact@',
])
  if (!controlledReleaseVerifier.includes(marker))
    failures.push(`Controlled launch verifier marker missing: ${marker}`);
for (const [name, source] of [
  ['API', apiRuntime],
  ['Worker', workerRuntime],
]) {
  if (!source.includes("environment.NODE_ENV === 'production'"))
    failures.push(`${name} production fail-closed configuration gate missing`);
  if (!source.includes('production configuration unsafe'))
    failures.push(`${name} production unsafe-value gate missing`);
}
for (const marker of [
  'COMMERCE_PROVIDER_GATEWAY_URL',
  'CUSTOMER_SERVICE_MODEL_URL',
  'MINI_PROGRAM_CALLBACK_TOKEN',
  'WECOM_CONFIG_GATEWAY_URL',
  'IDENTITY_PROVIDER_GATEWAY_URL',
  'TRUSTED_PROXY_CIDRS',
  'PRIVACY_DELETION_GATEWAY_URL',
  'PRIVACY_EXPORT_GATEWAY_URL',
])
  if (!envExample.includes(marker)) failures.push(`runtime environment example missing: ${marker}`);
for (const marker of [
  'immutable registry digest',
  'one-shot tenant-scoped job',
  'Missing event-gateway configuration fails before any Outbox claim',
  'refuses startup',
  'controlled-preproduction',
  'sslmode=require',
  'blanket trusted proxy',
])
  if (!runbook.includes(marker)) failures.push(`Deployment runbook boundary missing: ${marker}`);
if (!rootManifest.scripts?.check?.includes('pnpm artifacts:check'))
  failures.push('Full repository gate must verify built production artifacts');
if (
  rootManifest.scripts?.['controlled:inventory'] !==
  'node tooling/controlled-environment-inventory.mjs'
)
  failures.push('Controlled environment names-only inventory command is missing');
for (const [name, manifest, buildConfig] of [
  ['API', apiManifest, apiBuildConfig],
  ['Worker', workerManifest, workerBuildConfig],
]) {
  if (JSON.stringify(manifest.files) !== JSON.stringify(['dist']))
    failures.push(`${name} package files must equal ["dist"]`);
  for (const setting of ['declaration', 'declarationMap', 'sourceMap'])
    if (buildConfig.compilerOptions?.[setting] !== false)
      failures.push(`${name} production build must disable ${setting}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`Deployment gate failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'Deployment gate verified runtime-only artifacts, non-root images, CI smoke, protected candidate publication and attested controlled launch verification.',
  );
}
