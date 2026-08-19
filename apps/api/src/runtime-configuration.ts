import { isIP } from 'node:net';

type RuntimeEnvironment = Record<string, string | undefined>;

const alwaysRequired = [
  'DATABASE_URL',
  'AUTH_JWT_SECRET',
  'OBJECT_STORE_GATEWAY_URL',
  'OBJECT_STORE_SIGNING_SECRET',
] as const;

const launchGroups = [
  ['IDENTITY_PROVIDER_GATEWAY_URL', 'IDENTITY_PROVIDER_GATEWAY_TOKEN'],
  ['TRUSTED_PROXY_CIDRS'],
  ['SALES_IDENTITY_HASH_SECRET'],
  ['CONSUMER_AUTH_JWT_SECRET'],
  ['LIFE_CONSUMER_AUTH_JWT_SECRET'],
  ['PLATFORM_ADDRESS_ENCRYPTION_KEY'],
  ['INTERNAL_WORKER_TOKEN'],
  ['WECOM_NOTIFICATION_GATEWAY_URL', 'WECOM_NOTIFICATION_GATEWAY_TOKEN'],
  [
    'COMMERCE_PROVIDER_GATEWAY_URL',
    'COMMERCE_PROVIDER_GATEWAY_TOKEN',
    'COMMERCE_CALLBACK_SECRET',
    'VERIFICATION_TOKEN_SECRET',
  ],
  ['GEO_PLUGIN_GATEWAY_URL', 'GEO_PLUGIN_GATEWAY_TOKEN'],
  [
    'CUSTOMER_SERVICE_KNOWLEDGE_URL',
    'CUSTOMER_SERVICE_KNOWLEDGE_TOKEN',
    'CUSTOMER_SERVICE_MODEL_URL',
    'CUSTOMER_SERVICE_MODEL_TOKEN',
    'CUSTOMER_SERVICE_BUSINESS_TOOLS_URL',
    'CUSTOMER_SERVICE_BUSINESS_TOOLS_TOKEN',
  ],
  [
    'MINI_PROGRAM_GATEWAY_URL',
    'MINI_PROGRAM_GATEWAY_TOKEN',
    'MINI_PROGRAM_BUILDER_URL',
    'MINI_PROGRAM_BUILDER_TOKEN',
    'MINI_PROGRAM_CALLBACK_TOKEN',
  ],
  ['WECOM_CONFIG_GATEWAY_URL', 'WECOM_CONFIG_GATEWAY_TOKEN'],
] as const;

const configured = (environment: RuntimeEnvironment, name: string) =>
  Boolean(environment[name]?.trim());

const productionUrls = [
  'OBJECT_STORE_GATEWAY_URL',
  ...launchGroups.flatMap((group) => group.filter((name) => name.endsWith('_URL'))),
];
const productionSecrets = [
  'AUTH_JWT_SECRET',
  'OBJECT_STORE_SIGNING_SECRET',
  ...launchGroups.flatMap((group) => group.filter((name) => /(SECRET|TOKEN|KEY)$/u.test(name))),
];

function validateProductionValues(environment: RuntimeEnvironment) {
  const failures: string[] = [];
  for (const name of productionUrls) {
    try {
      const url = new URL(environment[name]!);
      if (url.protocol !== 'https:') failures.push(`${name} (HTTPS required)`);
      if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname))
        failures.push(`${name} (loopback forbidden)`);
    } catch {
      failures.push(`${name} (invalid URL)`);
    }
  }
  for (const name of productionSecrets) {
    const value = environment[name]!;
    const minimum = /(JWT_SECRET|SIGNING_SECRET|CALLBACK_SECRET|VERIFICATION_TOKEN_SECRET)/u.test(
      name,
    )
      ? 32
      : 16;
    if (Buffer.byteLength(value, 'utf8') < minimum) failures.push(`${name} (too short)`);
    if (/replace-with|placeholder|changeme|example-secret/iu.test(value))
      failures.push(`${name} (placeholder forbidden)`);
  }
  try {
    const database = new URL(environment.DATABASE_URL!);
    if (!['postgres:', 'postgresql:'].includes(database.protocol))
      failures.push('DATABASE_URL (PostgreSQL required)');
    if (['127.0.0.1', 'localhost', '::1'].includes(database.hostname))
      failures.push('DATABASE_URL (loopback forbidden)');
    if (!['require', 'verify-full'].includes(database.searchParams.get('sslmode') ?? ''))
      failures.push('DATABASE_URL (sslmode=require or verify-full required)');
  } catch {
    failures.push('DATABASE_URL (invalid URL)');
  }
  const trustedProxies = environment.TRUSTED_PROXY_CIDRS!.split(',').map((entry) => entry.trim());
  for (const entry of trustedProxies) {
    const [address, rawPrefix, ...extra] = entry.split('/');
    const version = isIP(address ?? '');
    const prefix = rawPrefix === undefined ? undefined : Number(rawPrefix);
    if (
      !entry ||
      extra.length > 0 ||
      version === 0 ||
      (prefix !== undefined &&
        (!Number.isInteger(prefix) || prefix < 0 || prefix > (version === 4 ? 32 : 128)))
    )
      failures.push('TRUSTED_PROXY_CIDRS (invalid IP or CIDR)');
  }
  try {
    if (Buffer.from(environment.PLATFORM_ADDRESS_ENCRYPTION_KEY!, 'base64').length !== 32)
      failures.push('PLATFORM_ADDRESS_ENCRYPTION_KEY (32-byte base64 required)');
  } catch {
    failures.push('PLATFORM_ADDRESS_ENCRYPTION_KEY (invalid base64)');
  }
  if (failures.length)
    throw new Error(`API production configuration unsafe: ${[...new Set(failures)].join(', ')}`);
}

export function validateApiRuntimeConfiguration(environment: RuntimeEnvironment) {
  if (environment.NODE_ENV === 'production' && environment.LEQU_DEVELOPMENT_MOCKS === '1')
    throw new Error('API production configuration forbids LEQU_DEVELOPMENT_MOCKS');
  const missingAlways = alwaysRequired.filter((name) => !configured(environment, name));
  if (missingAlways.length)
    throw new Error(`API runtime configuration missing: ${missingAlways.join(', ')}`);

  const incompleteGroups = launchGroups
    .filter((group) => {
      const count = group.filter((name) => configured(environment, name)).length;
      return count > 0 && count < group.length;
    })
    .flatMap((group) => group.filter((name) => !configured(environment, name)));
  if (incompleteGroups.length)
    throw new Error(`API runtime configuration group incomplete: ${incompleteGroups.join(', ')}`);

  if (environment.NODE_ENV === 'production') {
    const missingLaunch = launchGroups
      .flatMap((group) => [...group])
      .filter((name) => !configured(environment, name));
    if (missingLaunch.length)
      throw new Error(`API production launch configuration missing: ${missingLaunch.join(', ')}`);
    validateProductionValues(environment);
  }
}
