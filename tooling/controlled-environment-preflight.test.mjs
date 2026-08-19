import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  apiProductionRequiredSettings,
  validateApiRuntimeConfiguration,
} from '../apps/api/src/runtime-configuration.ts';
import {
  validateWorkerRuntimeConfiguration,
  workerProductionRequiredSettings,
} from '../apps/worker/src/runtime-configuration.ts';
import { parse as parseYaml } from 'yaml';
import {
  controlledStageRequirements,
  inspectControlledEnvironment,
} from './controlled-environment-preflight.mjs';

function completeEnvironment() {
  const environment = {};
  const images = {
    api: `ghcr.io/lequ/api@sha256:${'a'.repeat(64)}`,
    worker: `ghcr.io/lequ/worker@sha256:${'b'.repeat(64)}`,
    web: `ghcr.io/lequ/web@sha256:${'c'.repeat(64)}`,
  };
  for (const name of Object.values(controlledStageRequirements).flat()) {
    if (name === 'RELEASE_COMMIT') environment[name] = 'a'.repeat(40);
    else if (name === 'CONTROLLED_RESULTS_FILE') environment[name] = path.resolve('results.json');
    else if (name === 'PERFORMANCE_ENVIRONMENT') environment[name] = 'controlled-preproduction';
    else if (name === 'PERFORMANCE_REPORT_PATH')
      environment[name] = path.resolve('artifacts/performance/report.json');
    else if (name === 'TRUSTED_PROXY_CIDRS') environment[name] = '10.0.0.0/8';
    else if (name === 'WORKER_TENANT_ID')
      environment[name] = '11111111-1111-4111-8111-111111111111';
    else if (name === 'PLATFORM_ADDRESS_ENCRYPTION_KEY')
      environment[name] = Buffer.alloc(32, 7).toString('base64');
    else if (name.endsWith('_BODY_JSON')) environment[name] = '{"probe":true}';
    else if (name === 'PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON')
      environment[name] = JSON.stringify({
        version: 1,
        releaseCommit: 'a'.repeat(40),
        workflowRunId: '123',
        images,
      });
    else if (name === 'PERFORMANCE_DEPLOYED_IMAGES_JSON')
      environment[name] = JSON.stringify(images);
    else if (name.endsWith('_PATH')) environment[name] = '/api/v1/probe';
    else if (name === 'DATABASE_URL' || name === 'PERFORMANCE_DATABASE_URL')
      environment[name] = 'postgres://user:password@database.internal/lequ?sslmode=require';
    else if (name.endsWith('_URL')) environment[name] = 'https://gateway.example.com';
    else if (/(?:JWT_SECRET|SIGNING_SECRET|CALLBACK_SECRET|VERIFICATION_TOKEN_SECRET)$/u.test(name))
      environment[name] = 's'.repeat(32);
    else environment[name] = 'controlled-secret-value';
  }
  return environment;
}

describe('controlled environment preflight', () => {
  it('reports only missing setting names and never environment values', () => {
    const environment = completeEnvironment();
    delete environment.IDENTITY_PROVIDER_GATEWAY_TOKEN;
    const report = inspectControlledEnvironment(environment, [47]);
    expect(report.missing).toEqual(['IDENTITY_PROVIDER_GATEWAY_TOKEN']);
    expect(JSON.stringify(report)).not.toContain('controlled-secret-value');
  });

  it('rejects loopback, placeholders, weak secrets, invalid JSON and a mutable commit ref', () => {
    const environment = completeEnvironment();
    Object.assign(environment, {
      CONTROLLED_BASE_URL: 'http://127.0.0.1:3000',
      CONSUMER_AUTH_JWT_SECRET: 'short',
      GEO_PLUGIN_GATEWAY_TOKEN: 'replace-with-secret',
      PERFORMANCE_WRITE_BODY_JSON: '[]',
      PLATFORM_ADDRESS_ENCRYPTION_KEY: 'not-32-byte-base64',
      RELEASE_COMMIT: 'main',
      TRUSTED_PROXY_CIDRS: 'all-proxies',
      WORKER_TENANT_ID: 'mutable-tenant',
    });
    const report = inspectControlledEnvironment(environment);
    expect(report.invalid).toEqual(
      expect.arrayContaining([
        { name: 'CONTROLLED_BASE_URL', reason: 'not-https' },
        { name: 'CONSUMER_AUTH_JWT_SECRET', reason: 'too-short' },
        { name: 'GEO_PLUGIN_GATEWAY_TOKEN', reason: 'placeholder' },
        { name: 'PERFORMANCE_WRITE_BODY_JSON', reason: 'invalid-json-object' },
        { name: 'PLATFORM_ADDRESS_ENCRYPTION_KEY', reason: 'invalid-32-byte-base64' },
        { name: 'RELEASE_COMMIT', reason: 'invalid-commit' },
        { name: 'TRUSTED_PROXY_CIDRS', reason: 'invalid-ip-or-cidr' },
        { name: 'WORKER_TENANT_ID', reason: 'invalid-uuid' },
      ]),
    );
  });

  it('accepts a complete non-loopback controlled profile', () => {
    const environment = completeEnvironment();
    expect(inspectControlledEnvironment(environment)).toMatchObject({
      stages: [47, 48, 49, 50],
      missing: [],
      invalid: [],
    });
    expect(() =>
      validateApiRuntimeConfiguration({ ...environment, NODE_ENV: 'production' }),
    ).not.toThrow();
    expect(() =>
      validateWorkerRuntimeConfiguration({ ...environment, NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('rejects development mock mode even when controlled values are otherwise valid', () => {
    const environment = { ...completeEnvironment(), LEQU_DEVELOPMENT_MOCKS: '1' };
    expect(inspectControlledEnvironment(environment).invalid).toContainEqual({
      name: 'LEQU_DEVELOPMENT_MOCKS',
      reason: 'development-mock-forbidden',
    });
  });

  it('covers every API and Worker production requirement and the environment example', async () => {
    const controlled = new Set([47, 48, 49].flatMap((stage) => controlledStageRequirements[stage]));
    const runtime = [...apiProductionRequiredSettings, ...workerProductionRequiredSettings];
    expect(new Set(apiProductionRequiredSettings).size).toBe(apiProductionRequiredSettings.length);
    expect(new Set(workerProductionRequiredSettings).size).toBe(
      workerProductionRequiredSettings.length,
    );
    for (const name of runtime) expect(controlled.has(name), name).toBe(true);

    const example = await readFile('.env.example', 'utf8');
    for (const name of new Set(runtime))
      expect(example, `.env.example is missing ${name}`).toMatch(new RegExp(`^${name}=`, 'mu'));
  });

  it('matches production TLS and minimum-secret constraints', () => {
    const environment = completeEnvironment();
    Object.assign(environment, {
      AUTH_JWT_SECRET: 'a'.repeat(16),
      DATABASE_URL: 'postgres://user:password@database.internal/lequ',
      PERFORMANCE_DATABASE_URL: 'postgres://user:password@database.internal/performance',
    });
    expect(inspectControlledEnvironment(environment).invalid).toEqual(
      expect.arrayContaining([
        { name: 'AUTH_JWT_SECRET', reason: 'too-short' },
        { name: 'DATABASE_URL', reason: 'tls-required' },
        { name: 'PERFORMANCE_DATABASE_URL', reason: 'tls-required' },
      ]),
    );
  });

  it('reuses the full performance topology contract before any load is sent', () => {
    const environment = completeEnvironment();
    const deployed = JSON.parse(environment.PERFORMANCE_DEPLOYED_IMAGES_JSON);
    deployed.worker = `ghcr.io/lequ/worker@sha256:${'d'.repeat(64)}`;
    environment.PERFORMANCE_DEPLOYED_IMAGES_JSON = JSON.stringify(deployed);
    expect(inspectControlledEnvironment(environment, [49]).invalid).toContainEqual({
      name: 'PERFORMANCE_CONFIGURATION',
      reason: 'contract-invalid',
    });

    const unsafeBody = completeEnvironment();
    unsafeBody.PERFORMANCE_WRITE_BODY_JSON = '{"providerToken":"must-not-enter-evidence"}';
    expect(inspectControlledEnvironment(unsafeBody, [49]).invalid).toContainEqual({
      name: 'PERFORMANCE_CONFIGURATION',
      reason: 'contract-invalid',
    });
  });

  it('maps every Stage 47-49 setting into the protected workflow and binds the candidate', async () => {
    const source = await readFile('.github/workflows/controlled-preflight.yml', 'utf8');
    const workflow = parseYaml(source);
    expect(workflow.permissions).toMatchObject({ contents: 'read', actions: 'read' });
    const environmentNames = new Set(Object.keys(workflow.jobs.preflight.env));
    for (const name of [47, 48, 49].flatMap((stage) => controlledStageRequirements[stage]))
      expect(environmentNames.has(name), `workflow is missing ${name}`).toBe(true);
    expect(source).toContain('if [ "$RELEASE_COMMIT" != "$CANDIDATE_COMMIT" ]');
    expect(source).toContain('configured RELEASE_COMMIT must equal candidate_commit');
    expect(source).toContain('candidate_image_run_id must be a numeric protected publisher run ID');
    expect(source).toContain('.path == ".github/workflows/publish-candidate-images.yml"');
    expect(source).toContain('gh run download "$CANDIDATE_IMAGE_RUN_ID"');
    expect(source).toContain('candidate-images-${CANDIDATE_COMMIT}-${CANDIDATE_IMAGE_RUN_ID}');
    expect(source).toContain(
      'configured candidate image manifest differs from protected publisher artifact',
    );
  });
});
