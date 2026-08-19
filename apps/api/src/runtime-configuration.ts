type RuntimeEnvironment = Record<string, string | undefined>;

const alwaysRequired = [
  'DATABASE_URL',
  'AUTH_JWT_SECRET',
  'OBJECT_STORE_GATEWAY_URL',
  'OBJECT_STORE_SIGNING_SECRET',
] as const;

const launchGroups = [
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

export function validateApiRuntimeConfiguration(environment: RuntimeEnvironment) {
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
  }
}
