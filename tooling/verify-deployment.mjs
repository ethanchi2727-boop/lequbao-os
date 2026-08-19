import { readFile } from 'node:fs/promises';

const [
  dockerfile,
  dockerignore,
  workflow,
  controlledPreflight,
  candidatePublisher,
  controlledReleaseVerifier,
  webServer,
  runbook,
  apiRuntime,
  workerRuntime,
  envExample,
] = await Promise.all([
  readFile('deploy/Dockerfile', 'utf8'),
  readFile('.dockerignore', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('.github/workflows/controlled-preflight.yml', 'utf8'),
  readFile('.github/workflows/publish-candidate-images.yml', 'utf8'),
  readFile('.github/workflows/verify-controlled-release.yml', 'utf8'),
  readFile('apps/workbench-web/production-server.mjs', 'utf8'),
  readFile('docs/runbooks/DEPLOYMENT.md', 'utf8'),
  readFile('apps/api/src/runtime-configuration.ts', 'utf8'),
  readFile('apps/worker/src/runtime-configuration.ts', 'utf8'),
  readFile('.env.example', 'utf8'),
]);
const failures = [];
for (const target of ['api', 'worker', 'web']) {
  if (!dockerfile.includes(` AS ${target}\n`)) failures.push(`Docker target missing: ${target}`);
  if (!workflow.includes(`--target ${target}`)) failures.push(`CI Docker build missing: ${target}`);
}
for (const marker of [
  'node:22.23.1-bookworm-slim',
  'pnpm@11.19.0',
  'pnpm install --frozen-lockfile',
  'deploy --prod --legacy',
  'USER node',
  'HEALTHCHECK',
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
  "frame-ancestors 'none'",
])
  if (!webServer.includes(marker)) failures.push(`Web production header missing: ${marker}`);
if (!workflow.includes('Smoke Web candidate image')) failures.push('Web image smoke step missing');
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
  'gh run download "$CANDIDATE_IMAGE_RUN_ID"',
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
  'code-quality postgres-contract container-build',
  'docker/setup-buildx-action@v4',
  'docker/login-action@v4',
  'docker/build-push-action@v7',
  'target: api',
  'target: worker',
  'target: web',
  'provenance: mode=max',
  'sbom: true',
  'candidate-image-digests.json',
  'actions/upload-artifact@v7',
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
  '.isDraft == true',
  '.targetCommitish == $candidate',
  'code-quality postgres-contract container-build',
  'links and special archive entries are forbidden',
  "name == 'results.json'",
  '--no-same-owner --no-same-permissions',
  'node ../trusted/tooling/controlled-evidence-package.mjs',
  '--verify-package=${{ github.workspace }}/evidence',
  'node ../trusted/tooling/verify-acceptance-evidence.mjs --launch',
  'actions/attest@v4',
  'actions/upload-artifact@v7',
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

if (failures.length) {
  for (const failure of failures) console.error(`Deployment gate failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'Deployment gate verified non-root images, CI smoke, protected candidate publication and attested controlled launch verification.',
  );
}
