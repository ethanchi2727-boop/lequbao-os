import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildControlledEnvironmentInventory,
  fetchGitHubEnvironmentNames,
  inspectControlledEnvironmentNames,
} from './controlled-environment-inventory.mjs';

async function inventory() {
  return buildControlledEnvironmentInventory(
    await readFile('.github/workflows/controlled-preflight.yml', 'utf8'),
  );
}

describe('controlled environment names-only inventory', () => {
  it('derives every stage requirement from the protected workflow without values', async () => {
    const result = await inventory();
    expect(result).toMatchObject({
      environment: 'controlled-preproduction',
      valuePolicy: 'names-only',
      counts: {
        stageReferences: 58,
        githubEnvironmentNames: 56,
        externalFileNames: 1,
        uniqueRequirements: 57,
      },
      stages: {
        47: { required: 15 },
        48: { required: 9 },
        49: { required: 32 },
        50: { required: 2, externalFiles: ['CONTROLLED_RESULTS_FILE'] },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\/|postgres:|Bearer |ghp_/u);
  });

  it('distinguishes reused stage references from unique provisioned names', async () => {
    const result = await inventory();
    const releaseCommitReferences = Object.values(result.stages).filter((stage) =>
      stage.variables.includes('RELEASE_COMMIT'),
    );
    expect(releaseCommitReferences).toHaveLength(2);
    expect(result.counts.stageReferences - result.counts.uniqueRequirements).toBe(1);
    expect(result.counts.githubEnvironmentNames + result.counts.externalFileNames).toBe(
      result.counts.uniqueRequirements,
    );
  });

  it('keeps sensitive material in secrets and topology names in variables', async () => {
    const result = await inventory();
    expect(result.stages[47].secrets).toContain('DATABASE_URL');
    expect(result.stages[48].secrets).toContain('COMMERCE_CALLBACK_SECRET');
    expect(result.stages[49].secrets).toContain('PERFORMANCE_WRITE_BEARER_TOKEN');
    expect(result.stages[49].variables).toContain('PERFORMANCE_DEPLOYED_IMAGES_JSON');
    expect(result.stages[49].variables).toContain('WORKER_TENANT_ID');
  });

  it('reports exact per-stage name coverage without inspecting values', async () => {
    const result = await inventory();
    const report = inspectControlledEnvironmentNames(result, {
      secrets: result.stages[47].secrets,
      variables: result.stages[47].variables,
      externalFiles: [],
    });
    expect(report.stages[47]).toMatchObject({ required: 15, configured: 15 });
    expect(report.stages[48].configured).toBe(0);
    expect(report.stages[50].missing.externalFiles).toEqual(['CONTROLLED_RESULTS_FILE']);
    expect(report.ready).toBe(false);
  });

  it('reports wrong GitHub storage classes and rejects cross-class ambiguity', async () => {
    const result = await inventory();
    const report = inspectControlledEnvironmentNames(result, {
      secrets: ['TRUSTED_PROXY_CIDRS'],
      variables: ['DATABASE_URL'],
      externalFiles: [],
    });
    expect(report.stages[47].misclassified).toEqual(
      expect.arrayContaining([
        { name: 'DATABASE_URL', expected: 'secret', actual: 'variable' },
        { name: 'TRUSTED_PROXY_CIDRS', expected: 'variable', actual: 'secret' },
      ]),
    );
    expect(report.ready).toBe(false);
    expect(() =>
      inspectControlledEnvironmentNames(result, {
        secrets: ['DATABASE_URL'],
        variables: ['DATABASE_URL'],
        externalFiles: [],
      }),
    ).toThrow(/appears in both secrets and variables/u);
  });

  it('fails exact inventory readiness when undeclared names are configured', async () => {
    const result = await inventory();
    const configured = {
      secrets: [...new Set(Object.values(result.stages).flatMap((stage) => stage.secrets))],
      variables: [...new Set(Object.values(result.stages).flatMap((stage) => stage.variables))],
      externalFiles: [
        ...new Set(Object.values(result.stages).flatMap((stage) => stage.externalFiles)),
      ],
    };
    expect(inspectControlledEnvironmentNames(result, configured)).toMatchObject({
      ready: true,
      unexpected: { secrets: [], variables: [], externalFiles: [] },
    });

    configured.secrets.push('UNDECLARED_SECRET');
    expect(inspectControlledEnvironmentNames(result, configured)).toMatchObject({
      ready: false,
      unexpected: { secrets: ['UNDECLARED_SECRET'] },
    });
  });

  it('rejects renamed workflow sources and malformed name inventories', () => {
    expect(() =>
      buildControlledEnvironmentInventory(
        `jobs:\n  preflight:\n    env:\n      DATABASE_URL: \${{ secrets.OTHER_NAME }}`,
      ),
    ).toThrow(/same named secret or variable/u);
    expect(() =>
      inspectControlledEnvironmentNames(
        { stages: { 47: { required: 1, secrets: ['A'], variables: [], externalFiles: [] } } },
        { secrets: ['A', 'A'] },
      ),
    ).toThrow(/duplicate A/u);
  });

  it('rejects sensitive values in variables and undeclared workflow mappings', async () => {
    const source = await readFile('.github/workflows/controlled-preflight.yml', 'utf8');
    expect(() =>
      buildControlledEnvironmentInventory(
        source.replace(
          'DATABASE_URL: ${{ secrets.DATABASE_URL }}',
          'DATABASE_URL: ${{ vars.DATABASE_URL }}',
        ),
      ),
    ).toThrow('controlled setting DATABASE_URL must be stored as a secret');
    expect(() =>
      buildControlledEnvironmentInventory(
        source.replace(
          '    env:\n',
          '    env:\n      UNDECLARED_GATEWAY_URL: ${{ vars.UNDECLARED_GATEWAY_URL }}\n',
        ),
      ),
    ).toThrow('protected workflow contains unexpected controlled setting UNDECLARED_GATEWAY_URL');
  });

  it('reads only GitHub environment names and never returns the access token', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      const secrets = url.includes('/secrets?');
      return {
        ok: true,
        status: 200,
        json: async () =>
          secrets
            ? {
                total_count: 2,
                secrets: [{ name: 'AUTH_JWT_SECRET' }, { name: 'DATABASE_URL' }],
              }
            : {
                total_count: 1,
                variables: [{ name: 'RELEASE_COMMIT', value: 'sensitive-variable-value' }],
              },
      };
    };
    const names = await fetchGitHubEnvironmentNames({
      repository: 'owner/repository',
      token: 'private-test-token',
      fetchImpl,
    });
    expect(names).toEqual({
      secrets: ['AUTH_JWT_SECRET', 'DATABASE_URL'],
      variables: ['RELEASE_COMMIT'],
      externalFiles: [],
    });
    expect(calls).toHaveLength(2);
    expect(calls.every(({ url }) => url.endsWith('per_page=100'))).toBe(true);
    expect(
      calls.every(({ options }) => options.headers.authorization === 'Bearer private-test-token'),
    ).toBe(true);
    expect(JSON.stringify(names)).not.toContain('private-test-token');
    expect(JSON.stringify(names)).not.toContain('sensitive-variable-value');
  });

  it('fails closed on invalid GitHub targets and API errors without returning response bodies', async () => {
    await expect(
      fetchGitHubEnvironmentNames({ repository: '../unsafe', token: 'token' }),
    ).rejects.toThrow(/owner\/name/u);
    await expect(
      fetchGitHubEnvironmentNames({
        repository: 'owner/repository',
        token: 'token',
        fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ secret: 'x' }) }),
      }),
    ).rejects.toThrow('GitHub secrets name request failed with status 403');
  });

  it('rejects truncated or malformed GitHub name responses', async () => {
    const responses = [
      { total_count: 2, secrets: [{ name: 'AUTH_JWT_SECRET' }] },
      { total_count: 0, variables: [] },
    ];
    await expect(
      fetchGitHubEnvironmentNames({
        repository: 'owner/repository',
        token: 'token',
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => responses.shift() }),
      }),
    ).rejects.toThrow('GitHub secrets name response is incomplete');

    const malformed = [{ secrets: [] }, { total_count: 0, variables: [] }];
    await expect(
      fetchGitHubEnvironmentNames({
        repository: 'owner/repository',
        token: 'token',
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => malformed.shift() }),
      }),
    ).rejects.toThrow('GitHub secrets name response is malformed');
  });
});
