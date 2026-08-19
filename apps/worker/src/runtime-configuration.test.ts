import { describe, expect, it } from 'vitest';
import { validateWorkerRuntimeConfiguration } from './runtime-configuration.js';

const base = {
  DATABASE_URL: 'postgres://database',
  WORKER_TENANT_ID: 'tenant-id',
  OUTBOX_EVENT_GATEWAY_URL: 'https://events.example',
  OUTBOX_EVENT_GATEWAY_TOKEN: 'event-token',
};

const launch = {
  INTERNAL_API_URL: 'https://api.example',
  INTERNAL_WORKER_TOKEN: 'internal-token',
  PRIVACY_DELETION_GATEWAY_URL: 'https://delete.example',
  PRIVACY_DELETION_GATEWAY_TOKEN: 'delete-token',
  PRIVACY_EXPORT_GATEWAY_URL: 'https://export.example',
  PRIVACY_EXPORT_GATEWAY_TOKEN: 'export-token',
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
});
