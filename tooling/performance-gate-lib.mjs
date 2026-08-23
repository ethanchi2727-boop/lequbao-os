import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isForbiddenLocalHostname } from './controlled-network-policy.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const required = [
  'PERFORMANCE_BASE_URL',
  'PERFORMANCE_DATABASE_URL',
  'PERFORMANCE_CONVERSATION_PATH',
  'PERFORMANCE_CONVERSATION_BODY_JSON',
  'PERFORMANCE_WRITE_PATH',
  'PERFORMANCE_WRITE_BODY_JSON',
  'PERFORMANCE_REPORT_PATH',
  'PERFORMANCE_ENVIRONMENT',
  'PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON',
  'PERFORMANCE_DEPLOYED_IMAGES_JSON',
  'RELEASE_COMMIT',
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

const imageReferencePattern = (target) =>
  new RegExp(`^ghcr\\.io/([a-z0-9][a-z0-9-]{0,38})/lequbao-v6-${target}@sha256:[a-f0-9]{64}$`, 'u');

const exactKeys = (value, expected) => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && expected.every((key, index) => keys[index] === key);
};

function parseImageBinding(env) {
  if (!/^[a-f0-9]{40}$/u.test(env.RELEASE_COMMIT))
    throw new Error('RELEASE_COMMIT must be an exact lowercase 40-character SHA');
  const manifest = parseObject(
    'PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON',
    env.PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON,
  );
  const deployed = parseObject(
    'PERFORMANCE_DEPLOYED_IMAGES_JSON',
    env.PERFORMANCE_DEPLOYED_IMAGES_JSON,
  );
  if (!exactKeys(manifest, ['images', 'releaseCommit', 'version', 'workflowRunId']))
    throw new Error('candidate image manifest fields are invalid');
  if (manifest.version !== 1 || manifest.releaseCommit !== env.RELEASE_COMMIT)
    throw new Error('candidate image manifest is not bound to RELEASE_COMMIT');
  if (!/^[1-9][0-9]{0,19}$/u.test(manifest.workflowRunId ?? ''))
    throw new Error('candidate image manifest workflowRunId must be a positive numeric ID');
  if (!exactKeys(manifest.images ?? {}, ['api', 'web', 'worker']))
    throw new Error('candidate image manifest must contain API Worker and Web');
  if (!exactKeys(deployed, ['api', 'web', 'worker']))
    throw new Error('deployed images must contain API Worker and Web');
  const owners = new Set();
  for (const target of ['api', 'worker', 'web']) {
    const match = imageReferencePattern(target).exec(manifest.images[target] ?? '');
    if (!match) throw new Error(`candidate ${target} image must use an immutable GHCR digest`);
    owners.add(match[1]);
    if (deployed[target] !== manifest.images[target])
      throw new Error(`deployed ${target} image does not match the candidate digest`);
  }
  if (owners.size !== 1)
    throw new Error('candidate API Worker and Web images must share one GHCR owner');
  return {
    releaseCommit: env.RELEASE_COMMIT,
    workflowRunId: manifest.workflowRunId,
    images: manifest.images,
  };
}

export function validatePerformanceConfig(env) {
  const sharedToken = env.PERFORMANCE_BEARER_TOKEN;
  const tokenNames = [
    'PERFORMANCE_READ_BEARER_TOKEN',
    'PERFORMANCE_MESSAGE_BEARER_TOKEN',
    'PERFORMANCE_WRITE_BEARER_TOKEN',
  ];
  const configured = (name) => typeof env[name] === 'string' && env[name].trim().length > 0;
  const missing = [
    ...required.filter((name) => !configured(name)),
    ...(!configured('PERFORMANCE_BEARER_TOKEN')
      ? tokenNames.filter((name) => !configured(name))
      : []),
  ];
  if (missing.length) throw new Error(`missing performance configuration: ${missing.join(', ')}`);
  for (const name of [...required, 'PERFORMANCE_BEARER_TOKEN', ...tokenNames])
    if (typeof env[name] === 'string' && env[name] !== env[name].trim())
      throw new Error(`${name} must not contain surrounding whitespace`);
  const effectiveTokens = tokenNames.map((name) => env[name] ?? sharedToken);
  if (effectiveTokens.some((token) => Buffer.byteLength(token, 'utf8') < 16))
    throw new Error('performance bearer tokens must contain at least 16 bytes');
  const environment = env.PERFORMANCE_ENVIRONMENT.trim().toLowerCase();
  if (!['controlled-preproduction', 'staging'].includes(environment))
    throw new Error('performance runs are allowed only in controlled-preproduction or staging');
  const base = new URL(env.PERFORMANCE_BASE_URL);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash)
    throw new Error('performance base URL must be a credential-free origin');
  if (base.protocol !== 'https:') throw new Error('performance base URL must use HTTPS');
  if (isForbiddenLocalHostname(base.hostname))
    throw new Error('performance base URL must not use a local host');
  let databaseUrl;
  try {
    databaseUrl = new URL(env.PERFORMANCE_DATABASE_URL);
  } catch {
    throw new Error('PERFORMANCE_DATABASE_URL must be a PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !databaseUrl.hostname)
    throw new Error('PERFORMANCE_DATABASE_URL must be a PostgreSQL URL');
  if (databaseUrl.hash) throw new Error('PERFORMANCE_DATABASE_URL must not contain a fragment');
  if (isForbiddenLocalHostname(databaseUrl.hostname))
    throw new Error('PERFORMANCE_DATABASE_URL must not use a local host');
  const sslModes = databaseUrl.searchParams.getAll('sslmode');
  if (sslModes.length !== 1 || !['require', 'verify-full'].includes(sslModes[0]))
    throw new Error('PERFORMANCE_DATABASE_URL must require TLS');
  if (/prod(uction)?/iu.test(`${base.hostname} ${databaseUrl.hostname} ${databaseUrl.pathname}`))
    throw new Error('refusing a production-shaped performance target');
  const apiPath = (name) => {
    const value = env[name];
    if (!value.startsWith('/api/')) throw new Error(`${name} must be an /api/ path`);
    const target = new URL(value, base);
    if (target.origin !== base.origin) throw new Error(`${name} must stay on the base origin`);
    if (target.pathname !== value || target.search || target.hash)
      throw new Error(`${name} must be a canonical path without query or fragment`);
    return value;
  };
  const concurrency = Number(env.PERFORMANCE_CONCURRENCY ?? 20);
  const requests = Number(env.PERFORMANCE_REQUESTS ?? 200);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 200)
    throw new Error('PERFORMANCE_CONCURRENCY must be an integer from 1 to 200');
  if (!Number.isSafeInteger(requests) || requests < 20 || requests > 100000)
    throw new Error('PERFORMANCE_REQUESTS must be an integer from 20 to 100000');
  if (!path.isAbsolute(env.PERFORMANCE_REPORT_PATH))
    throw new Error('PERFORMANCE_REPORT_PATH must be absolute');
  const reportPath = path.resolve(env.PERFORMANCE_REPORT_PATH);
  if (path.extname(reportPath).toLowerCase() !== '.json')
    throw new Error('PERFORMANCE_REPORT_PATH must end in .json');
  const reportParent = path.dirname(reportPath);
  if (!existsSync(reportParent) || !statSync(reportParent).isDirectory())
    throw new Error('PERFORMANCE_REPORT_PATH parent must be an existing directory');
  const physicalReportPath = path.join(realpathSync(reportParent), path.basename(reportPath));
  if (inside(repositoryRoot, physicalReportPath))
    throw new Error('PERFORMANCE_REPORT_PATH must be outside the source tree');
  if (existsSync(reportPath)) throw new Error('PERFORMANCE_REPORT_PATH must be a new file');
  const imageBinding = parseImageBinding(env);
  return {
    base,
    tokens: {
      read: effectiveTokens[0],
      message: effectiveTokens[1],
      write: effectiveTokens[2],
    },
    databaseUrl: databaseUrl.href,
    environment,
    concurrency,
    requests,
    reportPath: physicalReportPath,
    ...imageBinding,
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
  const errors = statuses.filter((status) => status < 200 || status >= 300).length;
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

export function duplicateAcknowledgedMessageIds(expectedIds) {
  const seen = new Set();
  const duplicates = new Set();
  for (const id of expectedIds) {
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }
  return [...duplicates];
}

export async function readBoundedPerformanceResponse(response, maximumBytes = 1024 * 1024) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error('performance response maximumBytes must be a positive integer');
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
    throw new Error('performance response exceeds the byte limit');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel('performance response exceeds the byte limit');
        throw new Error('performance response exceeds the byte limit');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
