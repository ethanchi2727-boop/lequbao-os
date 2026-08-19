import { describe, expect, it } from 'vitest';
import { validateApiRuntimeConfiguration } from './runtime-configuration.js';

const base = {
  DATABASE_URL: 'postgres://database',
  AUTH_JWT_SECRET: 'auth-secret',
  OBJECT_STORE_GATEWAY_URL: 'http://127.0.0.1:3301',
  OBJECT_STORE_SIGNING_SECRET: 'object-secret',
};

const launch = {
  SALES_IDENTITY_HASH_SECRET: 'sales-secret',
  CONSUMER_AUTH_JWT_SECRET: 'consumer-secret',
  LIFE_CONSUMER_AUTH_JWT_SECRET: 'life-secret',
  PLATFORM_ADDRESS_ENCRYPTION_KEY: 'address-key',
  INTERNAL_WORKER_TOKEN: 'worker-token',
  WECOM_NOTIFICATION_GATEWAY_URL: 'https://wecom.example',
  WECOM_NOTIFICATION_GATEWAY_TOKEN: 'wecom-notification-token',
  COMMERCE_PROVIDER_GATEWAY_URL: 'https://commerce.example',
  COMMERCE_PROVIDER_GATEWAY_TOKEN: 'commerce-token',
  COMMERCE_CALLBACK_SECRET: 'commerce-callback',
  VERIFICATION_TOKEN_SECRET: 'verification-token',
  GEO_PLUGIN_GATEWAY_URL: 'https://geo.example',
  GEO_PLUGIN_GATEWAY_TOKEN: 'geo-token',
  CUSTOMER_SERVICE_KNOWLEDGE_URL: 'https://knowledge.example',
  CUSTOMER_SERVICE_KNOWLEDGE_TOKEN: 'knowledge-token',
  CUSTOMER_SERVICE_MODEL_URL: 'https://model.example',
  CUSTOMER_SERVICE_MODEL_TOKEN: 'model-token',
  CUSTOMER_SERVICE_BUSINESS_TOOLS_URL: 'https://tools.example',
  CUSTOMER_SERVICE_BUSINESS_TOOLS_TOKEN: 'tools-token',
  MINI_PROGRAM_GATEWAY_URL: 'https://mini.example',
  MINI_PROGRAM_GATEWAY_TOKEN: 'mini-token',
  MINI_PROGRAM_BUILDER_URL: 'https://builder.example',
  MINI_PROGRAM_BUILDER_TOKEN: 'builder-token',
  MINI_PROGRAM_CALLBACK_TOKEN: 'callback-token',
  WECOM_CONFIG_GATEWAY_URL: 'https://wecom-config.example',
  WECOM_CONFIG_GATEWAY_TOKEN: 'wecom-config-token',
};

describe('API runtime configuration', () => {
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
});
