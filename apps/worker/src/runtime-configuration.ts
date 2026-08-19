type RuntimeEnvironment = Record<string, string | undefined>;

const alwaysRequired = [
  'DATABASE_URL',
  'WORKER_TENANT_ID',
  'OUTBOX_EVENT_GATEWAY_URL',
  'OUTBOX_EVENT_GATEWAY_TOKEN',
] as const;

const launchGroups = [
  ['INTERNAL_API_URL', 'INTERNAL_WORKER_TOKEN'],
  ['PRIVACY_DELETION_GATEWAY_URL', 'PRIVACY_DELETION_GATEWAY_TOKEN'],
  ['PRIVACY_EXPORT_GATEWAY_URL', 'PRIVACY_EXPORT_GATEWAY_TOKEN'],
] as const;

const configured = (environment: RuntimeEnvironment, name: string) =>
  Boolean(environment[name]?.trim());

const productionUrls = [
  'OUTBOX_EVENT_GATEWAY_URL',
  ...launchGroups.flatMap((group) => group.filter((name) => name.endsWith('_URL'))),
];
const productionTokens = [
  'OUTBOX_EVENT_GATEWAY_TOKEN',
  ...launchGroups.flatMap((group) => group.filter((name) => name.endsWith('_TOKEN'))),
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
  for (const name of productionTokens) {
    const value = environment[name]!;
    if (Buffer.byteLength(value, 'utf8') < 16) failures.push(`${name} (too short)`);
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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      environment.WORKER_TENANT_ID!,
    )
  )
    failures.push('WORKER_TENANT_ID (UUID required)');
  if (failures.length)
    throw new Error(`Worker production configuration unsafe: ${[...new Set(failures)].join(', ')}`);
}

export function validateWorkerRuntimeConfiguration(environment: RuntimeEnvironment) {
  const missingAlways = alwaysRequired.filter((name) => !configured(environment, name));
  if (missingAlways.length)
    throw new Error(`Worker runtime configuration missing: ${missingAlways.join(', ')}`);

  const incompleteGroups = launchGroups
    .filter((group) => {
      const count = group.filter((name) => configured(environment, name)).length;
      return count > 0 && count < group.length;
    })
    .flatMap((group) => group.filter((name) => !configured(environment, name)));
  if (incompleteGroups.length)
    throw new Error(
      `Worker runtime configuration group incomplete: ${incompleteGroups.join(', ')}`,
    );

  if (environment.NODE_ENV === 'production') {
    const missingLaunch = launchGroups
      .flatMap((group) => [...group])
      .filter((name) => !configured(environment, name));
    if (missingLaunch.length)
      throw new Error(
        `Worker production launch configuration missing: ${missingLaunch.join(', ')}`,
      );
    validateProductionValues(environment);
  }
}
