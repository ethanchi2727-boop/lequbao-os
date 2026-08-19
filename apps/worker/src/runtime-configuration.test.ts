import { describe, expect, it } from 'vitest';
import { validateWorkerRuntimeConfiguration } from './runtime-configuration.js';

const base = {
  DATABASE_URL: 'postgres://runtime:secret@database.example/lequ?sslmode=require',
  WORKER_TENANT_ID: '11111111-1111-4111-8111-111111111111',
  OUTBOX_EVENT_GATEWAY_URL: 'https://events.example',
  OUTBOX_EVENT_GATEWAY_TOKEN: 'event-token-strong',
};

const launch = {
  INTERNAL_API_URL: 'https://api.example',
  INTERNAL_WORKER_TOKEN: 'internal-token-strong',
  PRIVACY_DELETION_GATEWAY_URL: 'https://delete.example',
  PRIVACY_DELETION_GATEWAY_TOKEN: 'delete-token-strong',
  PRIVACY_EXPORT_GATEWAY_URL: 'https://export.example',
  PRIVACY_EXPORT_GATEWAY_TOKEN: 'export-token-strong',
};

describe('Worker runtime configuration', () => {
  it('rejects partial optional groups in every environment', () => {
    expect(() => validateWorkerRuntimeConfiguration(base)).not.toThrow();
    expect(() =>
      validateWorkerRuntimeConfiguration({ ...base, PRIVACY_EXPORT_GATEWAY_URL: 'https://x' }),
    ).toThrow(/PRIVACY_EXPORT_GATEWAY_TOKEN/u);
  });

  it('requires every launch worker path in production', () => {
    expect(() => validateWorkerRuntimeConfiguration({ ...base, NODE_ENV: 'production' })).toThrow(
      /INTERNAL_API_URL/u,
    );
    expect(() =>
      validateWorkerRuntimeConfiguration({ ...base, ...launch, NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('rejects placeholder or weak tokens, insecure gateways, mutable tenant ids and non-TLS databases', () => {
    for (const mutation of [
      { OUTBOX_EVENT_GATEWAY_TOKEN: 'placeholder-event-token' },
      { INTERNAL_WORKER_TOKEN: 'short' },
      { INTERNAL_API_URL: 'http://api.example' },
      { WORKER_TENANT_ID: 'tenant-id' },
      { DATABASE_URL: 'postgres://runtime:secret@database.example/lequ' },
    ])
      expect(() =>
        validateWorkerRuntimeConfiguration({
          ...base,
          ...launch,
          ...mutation,
          NODE_ENV: 'production',
        }),
      ).toThrow(/production configuration unsafe/u);
  });
});
