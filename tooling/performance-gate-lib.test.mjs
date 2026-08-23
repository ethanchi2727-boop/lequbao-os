import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  duplicateAcknowledgedMessageIds,
  matchingPersistedMessageIds,
  missingPersistedMessageIds,
  readBoundedPerformanceResponse,
  summarizeScenario,
  validatePerformanceConfig,
} from './performance-gate-lib.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const images = {
  api: `ghcr.io/lequ/lequbao-v6-api@${digest('a')}`,
  worker: `ghcr.io/lequ/lequbao-v6-worker@${digest('b')}`,
  web: `ghcr.io/lequ/lequbao-v6-web@${digest('c')}`,
};
const releaseCommit = 'd'.repeat(40);

const validEnvironment = {
  PERFORMANCE_BASE_URL: 'https://staging.example.test',
  PERFORMANCE_READ_BEARER_TOKEN: 'employee-read-credential',
  PERFORMANCE_MESSAGE_BEARER_TOKEN: 'consumer-message-credential',
  PERFORMANCE_WRITE_BEARER_TOKEN: 'bounded-write-credential',
  PERFORMANCE_DATABASE_URL: 'postgres://user@staging-db.example.test/lequ?sslmode=require',
  PERFORMANCE_CONVERSATION_PATH: '/api/v1/customer-service/conversations/id/messages',
  PERFORMANCE_CONVERSATION_BODY_JSON: '{"messageType":"TEXT"}',
  PERFORMANCE_WRITE_PATH: '/api/v1/performance/write-fixture',
  PERFORMANCE_WRITE_BODY_JSON: '{"expectedVersion":1}',
  PERFORMANCE_REPORT_PATH: path.join(tmpdir(), `lequ-performance-report-${process.pid}.json`),
  PERFORMANCE_ENVIRONMENT: 'controlled-preproduction',
  PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON: JSON.stringify({
    version: 1,
    releaseCommit,
    workflowRunId: '12345',
    images,
  }),
  PERFORMANCE_DEPLOYED_IMAGES_JSON: JSON.stringify(images),
  RELEASE_COMMIT: releaseCommit,
};

describe('controlled performance gate', () => {
  it('requires every target, database, body and durable evidence setting', () => {
    expect(() => validatePerformanceConfig({})).toThrow('missing performance configuration');
    expect(validatePerformanceConfig(validEnvironment)).toMatchObject({
      concurrency: 20,
      requests: 200,
      environment: 'controlled-preproduction',
      releaseCommit,
      workflowRunId: '12345',
      images,
      tokens: {
        read: 'employee-read-credential',
        message: 'consumer-message-credential',
        write: 'bounded-write-credential',
      },
    });
  });

  it('allows an explicitly shared identity only when all three scenarios accept it', () => {
    const shared = { ...validEnvironment, PERFORMANCE_BEARER_TOKEN: 'shared-credential' };
    delete shared.PERFORMANCE_READ_BEARER_TOKEN;
    delete shared.PERFORMANCE_MESSAGE_BEARER_TOKEN;
    delete shared.PERFORMANCE_WRITE_BEARER_TOKEN;
    expect(validatePerformanceConfig(shared).tokens).toEqual({
      read: 'shared-credential',
      message: 'shared-credential',
      write: 'shared-credential',
    });
    expect(() =>
      validatePerformanceConfig({ ...shared, PERFORMANCE_BEARER_TOKEN: 'short' }),
    ).toThrow('at least 16 bytes');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_READ_BEARER_TOKEN: ` ${validEnvironment.PERFORMANCE_READ_BEARER_TOKEN}`,
      }),
    ).toThrow('surrounding whitespace');
  });

  it('refuses production-shaped targets, cross-origin paths and secret-shaped bodies', () => {
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_BASE_URL: 'https://api.production.example.test',
      }),
    ).toThrow('production-shaped');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_WRITE_PATH: 'https://other.example.test/api/write',
      }),
    ).toThrow('must be an /api/ path');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_WRITE_BODY_JSON: '{"providerToken":"do-not-store"}',
      }),
    ).toThrow('secret-shaped');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_BASE_URL: ['https://operator', 'staging.example.test'].join('@'),
      }),
    ).toThrow('credential-free origin');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_BASE_URL: 'https://127.0.0.2',
      }),
    ).toThrow('must not use a local host');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_DATABASE_URL:
          'postgres://user@database.example.test/lequ?sslmode=require&sslmode=disable',
      }),
    ).toThrow('must require TLS');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_DATABASE_URL:
          'postgres://user@database.example.test/lequ?sslmode=require#ambiguous',
      }),
    ).toThrow('must not contain a fragment');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_DATABASE_URL: 'postgres://user@database.example.test/lequ',
      }),
    ).toThrow('must require TLS');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_DATABASE_URL: 'postgres://user@127.0.0.2/lequ?sslmode=require',
      }),
    ).toThrow('must not use a local host');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_WRITE_PATH: '/api/v1/fixture/../../admin',
      }),
    ).toThrow('canonical path');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_WRITE_PATH: '/api/v1/performance/write-fixture?unsafe=true',
      }),
    ).toThrow('canonical path');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_REPORT_PATH: 'relative-report.json',
      }),
    ).toThrow('must be absolute');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_REPORT_PATH: path.resolve('tooling/performance-report-test.json'),
      }),
    ).toThrow('outside the source tree');
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_REPORT_PATH: path.join(
          tmpdir(),
          'missing-lequ-performance-directory',
          'report.json',
        ),
      }),
    ).toThrow('parent must be an existing directory');
  });

  it('rejects a mutable candidate or any deployed image digest mismatch', () => {
    expect(() =>
      validatePerformanceConfig({ ...validEnvironment, RELEASE_COMMIT: 'main' }),
    ).toThrow(/RELEASE_COMMIT/u);
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_DEPLOYED_IMAGES_JSON: JSON.stringify({
          ...images,
          worker: `ghcr.io/lequ/lequbao-v6-worker@${digest('e')}`,
        }),
      }),
    ).toThrow(/deployed worker image/u);
    const manifest = JSON.parse(validEnvironment.PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON);
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON: JSON.stringify({
          ...manifest,
          workflowRunId: 'run-main',
        }),
      }),
    ).toThrow(/workflowRunId/u);
    const foreignWeb = `ghcr.io/foreign/lequbao-v6-web@${digest('c')}`;
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON: JSON.stringify({
          ...manifest,
          images: { ...images, web: foreignWeb },
        }),
        PERFORMANCE_DEPLOYED_IMAGES_JSON: JSON.stringify({ ...images, web: foreignWeb }),
      }),
    ).toThrow(/share one GHCR owner/u);
    const wrongPackage = `ghcr.io/lequ/unrelated-worker@${digest('b')}`;
    expect(() =>
      validatePerformanceConfig({
        ...validEnvironment,
        PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON: JSON.stringify({
          ...manifest,
          images: { ...images, worker: wrongPackage },
        }),
        PERFORMANCE_DEPLOYED_IMAGES_JSON: JSON.stringify({ ...images, worker: wrongPackage }),
      }),
    ).toThrow(/candidate worker image/u);
  });

  it('calculates percentile and error evidence against the frozen threshold', () => {
    expect(
      summarizeScenario({
        name: 'core-read',
        limit: 500,
        latencies: [10, 20, 30, 40, 500],
        statuses: [200, 200, 200, 200, 503],
      }),
    ).toMatchObject({ p50Ms: 30, p95Ms: 500, errors: 1, errorRate: 0.2 });
    expect(
      summarizeScenario({
        name: 'core-read',
        limit: 500,
        latencies: [10, 20, 30],
        statuses: [200, 302, 204],
      }),
    ).toMatchObject({ requests: 3, successes: 2, errors: 1, errorRate: 1 / 3 });
  });

  it('detects every acknowledged customer message missing from PostgreSQL', () => {
    expect(missingPersistedMessageIds(['a', 'b', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
    expect(duplicateAcknowledgedMessageIds(['a', 'b', 'b', 'c', 'a', 'b'])).toEqual(['b', 'a']);
    expect(
      matchingPersistedMessageIds(
        [
          { id: 'a', content: 'probe-a' },
          { id: 'b', content: 'probe-b' },
        ],
        [
          { id: 'a', content: 'stale-content' },
          { id: 'b', content: 'probe-b' },
          { id: 'foreign', content: 'probe-a' },
        ],
      ),
    ).toEqual(['b']);
  });

  it('reads response bytes within the cap and rejects declared or streamed overflow', async () => {
    await expect(
      readBoundedPerformanceResponse(new Response('{"id":"message-1"}'), 64),
    ).resolves.toEqual(Buffer.from('{"id":"message-1"}'));
    await expect(
      readBoundedPerformanceResponse(
        new Response('short', { headers: { 'content-length': '65' } }),
        64,
      ),
    ).rejects.toThrow('exceeds the byte limit');
    await expect(readBoundedPerformanceResponse(new Response('x'.repeat(65)), 64)).rejects.toThrow(
      'exceeds the byte limit',
    );
  });
});
