import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('cloud development workspace', () => {
  it('uses a health-gated PostgreSQL 15 service with persistent development storage', async () => {
    const compose = parseYaml(await read('.devcontainer/compose.yaml'));
    expect(compose.services.postgres.image).toMatch(/^postgres:15(?:-|$)/u);
    expect(compose.services.postgres.healthcheck.test.join(' ')).toContain('pg_isready');
    expect(compose.services.postgres.volumes).toContain('postgres-data:/var/lib/postgresql/data');
    expect(compose.services.workspace.depends_on.postgres.condition).toBe('service_healthy');
    expect(compose.services.workspace.environment.DATABASE_URL).toBe(
      'postgres://postgres:postgres@postgres:5432/lequ_v6',
    );
  });

  it('initializes and starts the development stack through explicit scripts', async () => {
    const definition = JSON.parse(await read('.devcontainer/devcontainer.json'));
    expect(definition.postCreateCommand).toBe('bash .devcontainer/bootstrap.sh');
    expect(definition.postStartCommand).toBe('bash .devcontainer/start-development.sh');
    expect(definition.forwardPorts).toEqual([3000, 3399, 4173]);

    const bootstrap = await read('.devcontainer/bootstrap.sh');
    expect(bootstrap).toContain('pnpm install --frozen-lockfile');
    expect(bootstrap).toContain('--file=database/schema.sql');
    expect(bootstrap).toContain('--set=development_seed=enabled');
    expect(bootstrap).toContain('--file=database/development-seed-verify.sql');
    expect(bootstrap).toContain('Expected 26 V6.1 migrations');
    expect(bootstrap).toContain('Refusing a partially initialized database');

    const start = await read('.devcontainer/start-development.sh');
    expect(start).toContain('development-mock-gateway.mjs');
    expect(start).toContain('apps/api/src/server.ts');
    expect(start).toContain('apps/workbench-web/server.mjs');
    expect(start).toContain('http://127.0.0.1:3000/ready');
  });

  it('keeps the deterministic seed opt-in, idempotent and free of financial facts', async () => {
    const seed = await read('database/development-seed.sql');
    expect(seed).toContain('pass -v development_seed=enabled');
    expect(seed).toContain('ON CONFLICT');
    expect(seed).toContain('production_eligible');
    for (const forbidden of [
      'INSERT INTO orders',
      'INSERT INTO payment_intents',
      'INSERT INTO ledger_entries',
      'INSERT INTO reward_grants',
      'INSERT INTO revenue_distribution_entries',
    ])
      expect(seed).not.toContain(forbidden);
  });

  it('runs the development seed twice in PostgreSQL CI before verifying it', async () => {
    const workflow = parseYaml(await read('.github/workflows/ci.yml'));
    const step = workflow.jobs['postgres-contract'].steps.find(
      (candidate) =>
        candidate.name === 'Prove development seed opt-in, idempotency and financial emptiness',
    );
    expect(step).toBeDefined();
    expect(step.run.match(/database\/development-seed\.sql/gu)).toHaveLength(2);
    expect(step.run).toContain('database/development-seed-verify.sql');
  });

  it('boots and smokes the complete development stack in an isolated CI job', async () => {
    const workflow = parseYaml(await read('.github/workflows/ci.yml'));
    const job = workflow.jobs['development-stack'];
    expect(job['timeout-minutes']).toBe(20);
    const commands = job.steps.map((step) => step.run ?? '').join('\n');
    expect(commands).toContain('docker compose -f .devcontainer/compose.yaml config --quiet');
    expect(commands).toContain('bash -n .devcontainer/bootstrap.sh');
    expect(commands).toContain('docker compose -f .devcontainer/compose.yaml up --detach --build');
    expect(commands).toContain('node tooling/development-stack-smoke.mjs');
    expect(commands).toContain('SELECT count(*) FROM user_sessions');
    expect(commands).toContain('down --volumes --remove-orphans');
  });

  it('keeps generated profiles and runtime process metadata out of Git', async () => {
    const ignore = await read('.gitignore');
    expect(ignore).toContain('.env.*.local');
    expect(ignore).toContain('.devcontainer/runtime/');
  });
});
