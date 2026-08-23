import { describe, expect, it } from 'vitest';
import { validateApiRuntimeConfiguration } from './runtime-configuration.js';

const base = {
  DATABASE_URL: 'postgres://runtime:secret@database.example/lequ?sslmode=require',
  AUTH_JWT_SECRET: 'a'.repeat(32),
  OBJECT_STORE_GATEWAY_URL: 'https://objects.example',
  OBJECT_STORE_SIGNING_SECRET: 'b'.repeat(32),
};

const launch = {
  TRUSTED_PROXY_CIDRS: '10.0.0.0/8,2001:db8::/32',
  IDENTITY_PROVIDER_GATEWAY_URL: 'https://identity.example',
  IDENTITY_PROVIDER_GATEWAY_TOKEN: 'identity-provider-token-strong',
  SALES_IDENTITY_HASH_SECRET: 'c'.repeat(32),
  CONSUMER_AUTH_JWT_SECRET: 'd'.repeat(32),
  LIFE_CONSUMER_AUTH_JWT_SECRET: 'e'.repeat(32),
  PLATFORM_ADDRESS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  INTERNAL_WORKER_TOKEN: 'worker-token-strong',
  WECOM_NOTIFICATION_GATEWAY_URL: 'https://wecom.example',
  WECOM_NOTIFICATION_GATEWAY_TOKEN: 'wecom-notification-token',
  COMMERCE_PROVIDER_GATEWAY_URL: 'https://commerce.example',
  COMMERCE_PROVIDER_GATEWAY_TOKEN: 'commerce-token-strong',
  COMMERCE_CALLBACK_SECRET: 'f'.repeat(32),
  VERIFICATION_TOKEN_SECRET: '1'.repeat(32),
  GEO_PLUGIN_GATEWAY_URL: 'https://geo.example',
  GEO_PLUGIN_GATEWAY_TOKEN: 'geo-token-strong-value',
  CUSTOMER_SERVICE_KNOWLEDGE_URL: 'https://knowledge.example',
  CUSTOMER_SERVICE_KNOWLEDGE_TOKEN: 'knowledge-token-strong',
  CUSTOMER_SERVICE_MODEL_URL: 'https://model.example',
  CUSTOMER_SERVICE_MODEL_TOKEN: 'model-token-strong',
  CUSTOMER_SERVICE_BUSINESS_TOOLS_URL: 'https://tools.example',
  CUSTOMER_SERVICE_BUSINESS_TOOLS_TOKEN: 'tools-token-strong',
  MINI_PROGRAM_GATEWAY_URL: 'https://mini.example',
  MINI_PROGRAM_GATEWAY_TOKEN: 'mini-token-strong',
  MINI_PROGRAM_BUILDER_URL: 'https://builder.example',
  MINI_PROGRAM_BUILDER_TOKEN: 'builder-token-strong',
  MINI_PROGRAM_CALLBACK_TOKEN: 'callback-token-strong',
  WECOM_CONFIG_GATEWAY_URL: 'https://wecom-config.example',
  WECOM_CONFIG_GATEWAY_TOKEN: 'wecom-config-token',
};

describe('API runtime configuration', () => {
  it('forbids the development mock profile in production', () => {
    expect(() =>
      validateApiRuntimeConfiguration({ NODE_ENV: 'production', LEQU_DEVELOPMENT_MOCKS: '1' }),
    ).toThrow(/forbids LEQU_DEVELOPMENT_MOCKS/u);
  });
  it('allows a minimal development profile but rejects a partially configured provider group', () => {
    expect(() => validateApiRuntimeConfiguration(base)).not.toThrow();
    expect(() =>
      validateApiRuntimeConfiguration({ ...base, COMMERCE_PROVIDER_GATEWAY_URL: 'https://x' }),
    ).toThrow(/COMMERCE_PROVIDER_GATEWAY_TOKEN/u);
  });

  it('fails production closed when any launch flow is disabled', () => {
    expect(() =>
      validateApiRuntimeConfiguration({
        ...base,
        ...launch,
        NODE_ENV: 'production',
        GEO_PLUGIN_GATEWAY_TOKEN: '',
      }),
    ).toThrow(/GEO_PLUGIN_GATEWAY_TOKEN/u);
  });

  it('accepts the complete production launch profile', () => {
    expect(() =>
      validateApiRuntimeConfiguration({ ...base, ...launch, NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('rejects placeholders, weak secrets, insecure gateways and non-TLS PostgreSQL', () => {
    const credentialGateway = new URL('https://objects.example');
    credentialGateway.username = 'user';
    credentialGateway.password = 'password';
    for (const mutation of [
      { AUTH_JWT_SECRET: 'replace-with-at-least-32-bytes' },
      { AUTH_JWT_SECRET: ` ${launch.CONSUMER_AUTH_JWT_SECRET}` },
      { COMMERCE_CALLBACK_SECRET: 'too-short' },
      { OBJECT_STORE_GATEWAY_URL: 'http://objects.example' },
      { OBJECT_STORE_GATEWAY_URL: 'https://127.0.0.2' },
      { OBJECT_STORE_GATEWAY_URL: 'https://[::1]' },
      { OBJECT_STORE_GATEWAY_URL: credentialGateway.href },
      { DATABASE_URL: 'postgres://runtime:secret@database.example/lequ' },
      { DATABASE_URL: 'postgres://runtime:secret@[::1]/lequ?sslmode=require' },
      { PLATFORM_ADDRESS_ENCRYPTION_KEY: 'not-32-byte-base64' },
      { PLATFORM_ADDRESS_ENCRYPTION_KEY: `${launch.PLATFORM_ADDRESS_ENCRYPTION_KEY}!` },
      { TRUSTED_PROXY_CIDRS: 'not-a-cidr' },
      { TRUSTED_PROXY_CIDRS: '0.0.0.0/0' },
      { TRUSTED_PROXY_CIDRS: '::/0' },
      { TRUSTED_PROXY_CIDRS: '0.0.0.0' },
      { TRUSTED_PROXY_CIDRS: '::' },
      { TRUSTED_PROXY_CIDRS: '0::0' },
      { TRUSTED_PROXY_CIDRS: '0:0:0:0:0:0:0:0' },
      { TRUSTED_PROXY_CIDRS: '0000:0000:0000:0000:0000:0000:0000:0000' },
    ])
      expect(() =>
        validateApiRuntimeConfiguration({
          ...base,
          ...launch,
          ...mutation,
          NODE_ENV: 'production',
        }),
      ).toThrow(/production configuration unsafe/u);
  });
});
