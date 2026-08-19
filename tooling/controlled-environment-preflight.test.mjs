import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
    else if (name === 'TRUSTED_PROXY_CIDRS') environment[name] = '10.0.0.0/8';
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
      environment[name] = 'postgres://user:password@database.internal/lequ';
    else if (name.endsWith('_URL')) environment[name] = 'https://gateway.example.com';
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
      RELEASE_COMMIT: 'main',
      TRUSTED_PROXY_CIDRS: 'all-proxies',
    });
    const report = inspectControlledEnvironment(environment);
    expect(report.invalid).toEqual(
      expect.arrayContaining([
        { name: 'CONTROLLED_BASE_URL', reason: 'not-https' },
        { name: 'CONSUMER_AUTH_JWT_SECRET', reason: 'too-short' },
        { name: 'GEO_PLUGIN_GATEWAY_TOKEN', reason: 'placeholder' },
        { name: 'PERFORMANCE_WRITE_BODY_JSON', reason: 'invalid-json-object' },
        { name: 'RELEASE_COMMIT', reason: 'invalid-commit' },
        { name: 'TRUSTED_PROXY_CIDRS', reason: 'invalid-ip-or-cidr' },
      ]),
    );
  });

  it('accepts a complete non-loopback controlled profile', () => {
    expect(inspectControlledEnvironment(completeEnvironment())).toMatchObject({
      stages: [47, 48, 49, 50],
      missing: [],
      invalid: [],
    });
  });

  it('rejects development mock mode even when controlled values are otherwise valid', () => {
    const environment = { ...completeEnvironment(), LEQU_DEVELOPMENT_MOCKS: '1' };
    expect(inspectControlledEnvironment(environment).invalid).toContainEqual({
      name: 'LEQU_DEVELOPMENT_MOCKS',
      reason: 'development-mock-forbidden',
    });
  });
});
