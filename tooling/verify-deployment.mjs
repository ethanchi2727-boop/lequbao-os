import { readFile } from 'node:fs/promises';

const [
  dockerfile,
  dockerignore,
  workflow,
  webServer,
  runbook,
  apiRuntime,
  workerRuntime,
  envExample,
] = await Promise.all([
  readFile('deploy/Dockerfile', 'utf8'),
  readFile('.dockerignore', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
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
for (const [name, source] of [
  ['API', apiRuntime],
  ['Worker', workerRuntime],
]) {
  if (!source.includes("environment.NODE_ENV === 'production'"))
    failures.push(`${name} production fail-closed configuration gate missing`);
}
for (const marker of [
  'COMMERCE_PROVIDER_GATEWAY_URL',
  'CUSTOMER_SERVICE_MODEL_URL',
  'MINI_PROGRAM_CALLBACK_TOKEN',
  'WECOM_CONFIG_GATEWAY_URL',
  'PRIVACY_DELETION_GATEWAY_URL',
  'PRIVACY_EXPORT_GATEWAY_URL',
])
  if (!envExample.includes(marker)) failures.push(`runtime environment example missing: ${marker}`);
for (const marker of [
  'immutable registry digest',
  'one-shot tenant-scoped job',
  'Missing event-gateway configuration fails before any Outbox claim',
  'refuses startup',
])
  if (!runbook.includes(marker)) failures.push(`Deployment runbook boundary missing: ${marker}`);

if (failures.length) {
  for (const failure of failures) console.error(`Deployment gate failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'Deployment gate verified API, Worker and Web non-root candidate targets and CI smoke.',
  );
}
