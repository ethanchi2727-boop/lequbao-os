import { describe, expect, it } from 'vitest';
import {
  missingPersistedMessageIds,
  summarizeScenario,
  validatePerformanceConfig,
} from './performance-gate-lib.mjs';

const validEnvironment = {
  PERFORMANCE_BASE_URL: 'https://staging.example.test',
  PERFORMANCE_READ_BEARER_TOKEN: 'employee-read-credential',
  PERFORMANCE_MESSAGE_BEARER_TOKEN: 'consumer-message-credential',
  PERFORMANCE_WRITE_BEARER_TOKEN: 'bounded-write-credential',
  PERFORMANCE_DATABASE_URL: 'postgres://user@staging-db.example.test/lequ',
  PERFORMANCE_CONVERSATION_PATH: '/api/v1/customer-service/conversations/id/messages',
  PERFORMANCE_CONVERSATION_BODY_JSON: '{"messageType":"TEXT"}',
  PERFORMANCE_WRITE_PATH: '/api/v1/performance/write-fixture',
  PERFORMANCE_WRITE_BODY_JSON: '{"expectedVersion":1}',
  PERFORMANCE_REPORT_PATH: 'artifacts/performance/report.json',
  PERFORMANCE_ENVIRONMENT: 'controlled-preproduction',
};

describe('controlled performance gate', () => {
  it('requires every target, database, body and durable evidence setting', () => {
    expect(() => validatePerformanceConfig({})).toThrow('missing performance configuration');
    expect(validatePerformanceConfig(validEnvironment)).toMatchObject({
      concurrency: 20,
      requests: 200,
      environment: 'controlled-preproduction',
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
  });

  it('detects every acknowledged customer message missing from PostgreSQL', () => {
    expect(missingPersistedMessageIds(['a', 'b', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });
});
