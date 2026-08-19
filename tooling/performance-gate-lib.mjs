import path from 'node:path';

const required = [
  'PERFORMANCE_BASE_URL',
  'PERFORMANCE_DATABASE_URL',
  'PERFORMANCE_CONVERSATION_PATH',
  'PERFORMANCE_CONVERSATION_BODY_JSON',
  'PERFORMANCE_WRITE_PATH',
  'PERFORMANCE_WRITE_BODY_JSON',
  'PERFORMANCE_REPORT_PATH',
  'PERFORMANCE_ENVIRONMENT',
];

const parseObject = (name, value) => {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new Error(`${name} must be a JSON object`);
  const encoded = JSON.stringify(parsed);
  if (/"[^"\\]*(secret|password|token|private.?key)[^"\\]*"\s*:/iu.test(encoded))
    throw new Error(`${name} contains secret-shaped fields`);
  return parsed;
};

export function validatePerformanceConfig(env) {
  const sharedToken = env.PERFORMANCE_BEARER_TOKEN;
  const tokenNames = [
    'PERFORMANCE_READ_BEARER_TOKEN',
    'PERFORMANCE_MESSAGE_BEARER_TOKEN',
    'PERFORMANCE_WRITE_BEARER_TOKEN',
  ];
  const missing = [
    ...required.filter((name) => !env[name]),
    ...(!sharedToken ? tokenNames.filter((name) => !env[name]) : []),
  ];
  if (missing.length) throw new Error(`missing performance configuration: ${missing.join(', ')}`);
  const environment = env.PERFORMANCE_ENVIRONMENT.trim().toLowerCase();
  if (!['controlled-preproduction', 'staging'].includes(environment))
    throw new Error('performance runs are allowed only in controlled-preproduction or staging');
  const base = new URL(env.PERFORMANCE_BASE_URL);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))
    throw new Error('performance base URL must use HTTPS outside localhost');
  if (/prod(uction)?/iu.test(`${base.hostname} ${env.PERFORMANCE_DATABASE_URL}`))
    throw new Error('refusing a production-shaped performance target');
  const apiPath = (name) => {
    const value = env[name];
    if (!value.startsWith('/api/')) throw new Error(`${name} must be an /api/ path`);
    const target = new URL(value, base);
    if (target.origin !== base.origin) throw new Error(`${name} must stay on the base origin`);
    return value;
  };
  const concurrency = Number(env.PERFORMANCE_CONCURRENCY ?? 20);
  const requests = Number(env.PERFORMANCE_REQUESTS ?? 200);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 200)
    throw new Error('PERFORMANCE_CONCURRENCY must be an integer from 1 to 200');
  if (!Number.isSafeInteger(requests) || requests < 20 || requests > 100000)
    throw new Error('PERFORMANCE_REQUESTS must be an integer from 20 to 100000');
  const reportPath = path.resolve(env.PERFORMANCE_REPORT_PATH);
  if (path.extname(reportPath).toLowerCase() !== '.json')
    throw new Error('PERFORMANCE_REPORT_PATH must end in .json');
  return {
    base,
    tokens: {
      read: env.PERFORMANCE_READ_BEARER_TOKEN ?? sharedToken,
      message: env.PERFORMANCE_MESSAGE_BEARER_TOKEN ?? sharedToken,
      write: env.PERFORMANCE_WRITE_BEARER_TOKEN ?? sharedToken,
    },
    databaseUrl: env.PERFORMANCE_DATABASE_URL,
    environment,
    concurrency,
    requests,
    reportPath,
    conversationPath: apiPath('PERFORMANCE_CONVERSATION_PATH'),
    conversationBody: parseObject(
      'PERFORMANCE_CONVERSATION_BODY_JSON',
      env.PERFORMANCE_CONVERSATION_BODY_JSON,
    ),
    writePath: apiPath('PERFORMANCE_WRITE_PATH'),
    writeBody: parseObject('PERFORMANCE_WRITE_BODY_JSON', env.PERFORMANCE_WRITE_BODY_JSON),
  };
}

export const percentile = (values, fraction) =>
  [...values].sort((left, right) => left - right)[
    Math.max(0, Math.ceil(values.length * fraction) - 1)
  ] ?? 0;

export function summarizeScenario({ name, limit, latencies, statuses }) {
  const errors = statuses.filter((status) => status < 200 || status >= 400).length;
  return {
    name,
    requests: statuses.length,
    successes: statuses.length - errors,
    errors,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    errorRate: statuses.length ? errors / statuses.length : 1,
    thresholdP95Ms: limit,
  };
}

export function missingPersistedMessageIds(expectedIds, persistedIds) {
  const persisted = new Set(persistedIds);
  return [...new Set(expectedIds)].filter((id) => !persisted.has(id));
}
