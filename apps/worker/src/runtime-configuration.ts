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
  }
}
