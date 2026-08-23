import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { validatePerformanceConfig } from './performance-gate-lib.mjs';
import { isCanonicalBase64ByteLength } from './base64-encoding.mjs';

export const controlledStageRequirements = {
  47: [
    'DATABASE_URL',
    'AUTH_JWT_SECRET',
    'TRUSTED_PROXY_CIDRS',
    'IDENTITY_PROVIDER_GATEWAY_URL',
    'IDENTITY_PROVIDER_GATEWAY_TOKEN',
    'OBJECT_STORE_GATEWAY_URL',
    'OBJECT_STORE_SIGNING_SECRET',
    'WECOM_CONFIG_GATEWAY_URL',
    'WECOM_CONFIG_GATEWAY_TOKEN',
    'WECOM_NOTIFICATION_GATEWAY_URL',
    'WECOM_NOTIFICATION_GATEWAY_TOKEN',
    'PRIVACY_DELETION_GATEWAY_URL',
    'PRIVACY_DELETION_GATEWAY_TOKEN',
    'PRIVACY_EXPORT_GATEWAY_URL',
    'PRIVACY_EXPORT_GATEWAY_TOKEN',
  ],
  48: [
    'COMMERCE_PROVIDER_GATEWAY_URL',
    'COMMERCE_PROVIDER_GATEWAY_TOKEN',
    'COMMERCE_CALLBACK_SECRET',
    'VERIFICATION_TOKEN_SECRET',
    'MINI_PROGRAM_GATEWAY_URL',
    'MINI_PROGRAM_GATEWAY_TOKEN',
    'MINI_PROGRAM_BUILDER_URL',
    'MINI_PROGRAM_BUILDER_TOKEN',
    'MINI_PROGRAM_CALLBACK_TOKEN',
  ],
  49: [
    'CONTROLLED_BASE_URL',
    'CONSUMER_AUTH_JWT_SECRET',
    'LIFE_CONSUMER_AUTH_JWT_SECRET',
    'PLATFORM_ADDRESS_ENCRYPTION_KEY',
    'SALES_IDENTITY_HASH_SECRET',
    'INTERNAL_API_URL',
    'INTERNAL_WORKER_TOKEN',
    'OUTBOX_EVENT_GATEWAY_URL',
    'OUTBOX_EVENT_GATEWAY_TOKEN',
    'WORKER_TENANT_ID',
    'GEO_PLUGIN_GATEWAY_URL',
    'GEO_PLUGIN_GATEWAY_TOKEN',
    'CUSTOMER_SERVICE_KNOWLEDGE_URL',
    'CUSTOMER_SERVICE_KNOWLEDGE_TOKEN',
    'CUSTOMER_SERVICE_MODEL_URL',
    'CUSTOMER_SERVICE_MODEL_TOKEN',
    'CUSTOMER_SERVICE_BUSINESS_TOOLS_URL',
    'CUSTOMER_SERVICE_BUSINESS_TOOLS_TOKEN',
    'PERFORMANCE_BASE_URL',
    'PERFORMANCE_DATABASE_URL',
    'PERFORMANCE_CONVERSATION_PATH',
    'PERFORMANCE_CONVERSATION_BODY_JSON',
    'PERFORMANCE_WRITE_PATH',
    'PERFORMANCE_WRITE_BODY_JSON',
    'PERFORMANCE_REPORT_PATH',
    'PERFORMANCE_ENVIRONMENT',
    'PERFORMANCE_READ_BEARER_TOKEN',
    'PERFORMANCE_MESSAGE_BEARER_TOKEN',
    'PERFORMANCE_WRITE_BEARER_TOKEN',
    'PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON',
    'PERFORMANCE_DEPLOYED_IMAGES_JSON',
    'RELEASE_COMMIT',
  ],
  50: ['RELEASE_COMMIT', 'CONTROLLED_RESULTS_FILE'],
};

const secretPattern = /(SECRET|TOKEN|KEY)$/u;
const httpUrlPattern = /(_URL|BASE_URL)$/u;

function configured(environment, name) {
  return typeof environment[name] === 'string' && environment[name].trim().length > 0;
}

function invalidValue(environment, name) {
  const rawValue = environment[name];
  if (rawValue !== rawValue.trim()) return 'surrounding-whitespace';
  const value = rawValue;
  if (/replace-with|example-secret|changeme/iu.test(value)) return 'placeholder';
  const minimumSecretBytes =
    /(?:JWT_SECRET|SIGNING_SECRET|CALLBACK_SECRET|VERIFICATION_TOKEN_SECRET)$/u.test(name)
      ? 32
      : 16;
  if (secretPattern.test(name) && Buffer.byteLength(value, 'utf8') < minimumSecretBytes)
    return 'too-short';
  if (name === 'TRUSTED_PROXY_CIDRS') {
    const invalid = value.split(',').some((entry) => {
      const [address, rawPrefix, ...extra] = entry.trim().split('/');
      const version = isIP(address ?? '');
      const prefix = rawPrefix === undefined ? undefined : Number(rawPrefix);
      return (
        extra.length > 0 ||
        version === 0 ||
        (prefix !== undefined &&
          (!Number.isInteger(prefix) || prefix < 0 || prefix > (version === 4 ? 32 : 128)))
      );
    });
    if (invalid) return 'invalid-ip-or-cidr';
  }
  if (name === 'DATABASE_URL' || name === 'PERFORMANCE_DATABASE_URL') {
    try {
      const url = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) return 'invalid-postgres-url';
      if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return 'loopback';
      if (!['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? ''))
        return 'tls-required';
    } catch {
      return 'invalid-postgres-url';
    }
  } else if (httpUrlPattern.test(name)) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return 'not-https';
      if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return 'loopback';
    } catch {
      return 'invalid-url';
    }
  }
  if (
    name === 'PERFORMANCE_ENVIRONMENT' &&
    !['staging', 'controlled-preproduction'].includes(value)
  )
    return 'invalid-environment';
  if (
    name === 'WORKER_TENANT_ID' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    return 'invalid-uuid';
  if (name === 'PLATFORM_ADDRESS_ENCRYPTION_KEY' && !isCanonicalBase64ByteLength(value, 32))
    return 'invalid-32-byte-base64';
  if (name.endsWith('_BODY_JSON')) {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        return 'invalid-json-object';
    } catch {
      return 'invalid-json-object';
    }
  }
  if (name.endsWith('_IMAGE_MANIFEST_JSON') || name.endsWith('_DEPLOYED_IMAGES_JSON')) {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        return 'invalid-json-object';
    } catch {
      return 'invalid-json-object';
    }
  }
  if (name === 'RELEASE_COMMIT' && !/^[a-f0-9]{40}$/u.test(value)) return 'invalid-commit';
  if (name === 'CONTROLLED_RESULTS_FILE' && !path.isAbsolute(value)) return 'not-absolute';
  return undefined;
}

export function inspectControlledEnvironment(environment, stages = [47, 48, 49, 50]) {
  const names = [
    ...new Set(
      stages.flatMap((stage) => {
        const requirements = controlledStageRequirements[stage];
        if (!requirements) throw new Error(`unknown controlled stage ${stage}`);
        return requirements;
      }),
    ),
  ].sort();
  const missing = names.filter((name) => !configured(environment, name));
  const invalid = names
    .filter((name) => configured(environment, name))
    .map((name) => ({ name, reason: invalidValue(environment, name) }))
    .filter((item) => item.reason);
  if (environment.LEQU_DEVELOPMENT_MOCKS === '1')
    invalid.push({ name: 'LEQU_DEVELOPMENT_MOCKS', reason: 'development-mock-forbidden' });
  const performanceNames = controlledStageRequirements[49].filter(
    (name) => name.startsWith('PERFORMANCE_') || name === 'RELEASE_COMMIT',
  );
  if (stages.includes(49) && performanceNames.every((name) => configured(environment, name))) {
    try {
      validatePerformanceConfig(environment);
    } catch {
      invalid.push({ name: 'PERFORMANCE_CONFIGURATION', reason: 'contract-invalid' });
    }
  }
  return {
    stages,
    required: names.length,
    configured: names.length - missing.length,
    missing,
    invalid,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requested = process.argv
    .filter((argument) => argument.startsWith('--stage='))
    .map((argument) => Number(argument.split('=')[1]));
  const report = inspectControlledEnvironment(
    process.env,
    requested.length ? requested : undefined,
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.missing.length || report.invalid.length) process.exitCode = 1;
}
