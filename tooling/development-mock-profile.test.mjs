import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  inspectDevelopmentMockProfile,
  parseEnvironmentSource,
} from './development-mock-profile.mjs';

let productionSource;
let mockSource;

beforeAll(async () => {
  [productionSource, mockSource] = await Promise.all([
    readFile('.env.example', 'utf8'),
    readFile('.env.development-mock.example', 'utf8'),
  ]);
});

describe('development mock profile', () => {
  test('maps every production provider group to the explicit local-only gateway', () => {
    expect(inspectDevelopmentMockProfile({ productionSource, mockSource })).toEqual([]);
  });

  test('rejects missing production settings and undeclared drift', () => {
    const changed = mockSource
      .replace(/^COMMERCE_PROVIDER_GATEWAY_TOKEN=.*\r?\n/mu, '')
      .concat('UNREVIEWED_PROVIDER_SWITCH=1\n');
    expect(inspectDevelopmentMockProfile({ productionSource, mockSource: changed })).toEqual(
      expect.arrayContaining([
        'COMMERCE_PROVIDER_GATEWAY_TOKEN is missing',
        'UNREVIEWED_PROVIDER_SWITCH is not declared by the mock profile contract',
      ]),
    );
  });

  test('rejects production mode, non-loopback gateways and token divergence', () => {
    const changed = mockSource
      .replace('NODE_ENV=development', 'NODE_ENV=production')
      .replace('LEQU_DEVELOPMENT_MOCK_HOST=127.0.0.1', 'LEQU_DEVELOPMENT_MOCK_HOST=mock.example')
      .replace(
        'IDENTITY_PROVIDER_GATEWAY_TOKEN=local-development-mock-token-not-secret-0001',
        'IDENTITY_PROVIDER_GATEWAY_TOKEN=different-development-token',
      );
    expect(inspectDevelopmentMockProfile({ productionSource, mockSource: changed })).toEqual(
      expect.arrayContaining([
        'NODE_ENV must equal development',
        'LEQU_DEVELOPMENT_MOCK_HOST must be loopback',
        'IDENTITY_PROVIDER_GATEWAY_TOKEN must equal LEQU_DEVELOPMENT_MOCK_TOKEN',
      ]),
    );
  });

  test('rejects malformed and duplicate assignments without printing values', () => {
    expect(parseEnvironmentSource('GOOD=value\nBAD LINE\nGOOD=again\n').failures).toEqual([
      'line 2 is not a KEY=value assignment',
      'GOOD is duplicated',
    ]);
  });

  test('rejects a non-canonical address encryption key', () => {
    const changed = mockSource.replace(/^(PLATFORM_ADDRESS_ENCRYPTION_KEY=.*)$/mu, '$1!');
    expect(inspectDevelopmentMockProfile({ productionSource, mockSource: changed })).toContain(
      'PLATFORM_ADDRESS_ENCRYPTION_KEY must be canonical base64 for 32 bytes',
    );
  });
});
