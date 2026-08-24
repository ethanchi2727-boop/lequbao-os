import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('public preview stack', () => {
  it('retries the idempotent migration after a transient PostgreSQL restart', async () => {
    const compose = parseYaml(await read('compose.yaml'));
    const migration = await read('deploy/migrate-bao-preview-postgres.sh');

    expect(compose.services.migrate.restart).toBe('on-failure:5');
    expect(compose.services.app.depends_on.migrate.condition).toBe(
      'service_completed_successfully',
    );
    expect(migration).toContain('0027_platform_consumer_identity_exchange');
    expect(migration).toContain('--file=/opt/lequ-database/development-seed.sql');
  });

  it('smokes the PC intake write path through the combined preview topology', async () => {
    const workflow = parseYaml(await read('.github/workflows/ci.yml'));
    const commands = workflow.jobs['bao-preview-stack'].steps
      .map((step) => step.run ?? '')
      .join('\n');
    const smoke = await read('tooling/preview-stack-smoke.mjs');

    expect(commands).toContain('node tooling/preview-stack-smoke.mjs');
    expect(smoke).toContain("from 'node:http'");
    expect(smoke).toContain('headers: { ...hostHeaders, ...init.headers }');
    expect(smoke).toContain('/__development/login');
    expect(smoke).toContain('/api/v1/merchant-intake/sessions');
    expect(smoke).toContain('/messages');
    expect(smoke).toContain("processingStatus, 'QUEUED'");
  });
});
