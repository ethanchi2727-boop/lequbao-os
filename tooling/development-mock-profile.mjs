import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isCanonicalBase64ByteLength } from './base64-encoding.mjs';

const mockOnlyNames = [
  'LEQU_DEVELOPMENT_MOCKS',
  'LEQU_DEVELOPMENT_MOCK_HOST',
  'LEQU_DEVELOPMENT_MOCK_PORT',
  'LEQU_DEVELOPMENT_MOCK_TOKEN',
];

export function parseEnvironmentSource(source) {
  const values = {};
  const failures = [];
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      failures.push(`line ${index + 1} is not a KEY=value assignment`);
      continue;
    }
    const [, name, value] = match;
    if (Object.hasOwn(values, name)) failures.push(`${name} is duplicated`);
    values[name] = value;
  }
  return { values, failures };
}

const validUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value ?? '');

export function inspectDevelopmentMockProfile({ productionSource, mockSource }) {
  const production = parseEnvironmentSource(productionSource);
  const mock = parseEnvironmentSource(mockSource);
  const failures = [
    ...production.failures.map((failure) => `.env.example ${failure}`),
    ...mock.failures.map((failure) => `.env.development-mock ${failure}`),
  ];
  const productionNames = Object.keys(production.values);
  const expectedNames = new Set([...productionNames, ...mockOnlyNames]);
  for (const name of expectedNames) {
    if (!Object.hasOwn(mock.values, name)) failures.push(`${name} is missing`);
    else if (!mock.values[name]?.trim()) failures.push(`${name} is blank`);
  }
  for (const name of Object.keys(mock.values))
    if (!expectedNames.has(name))
      failures.push(`${name} is not declared by the mock profile contract`);

  if (mock.values.NODE_ENV !== 'development') failures.push('NODE_ENV must equal development');
  if (mock.values.LEQU_DEVELOPMENT_MOCKS !== '1')
    failures.push('LEQU_DEVELOPMENT_MOCKS must equal 1');
  if (!['127.0.0.1', 'localhost', '::1'].includes(mock.values.LEQU_DEVELOPMENT_MOCK_HOST))
    failures.push('LEQU_DEVELOPMENT_MOCK_HOST must be loopback');
  const port = Number(mock.values.LEQU_DEVELOPMENT_MOCK_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535)
    failures.push('LEQU_DEVELOPMENT_MOCK_PORT must be an unprivileged TCP port');
  const gatewayBase = `http://${mock.values.LEQU_DEVELOPMENT_MOCK_HOST}:${mock.values.LEQU_DEVELOPMENT_MOCK_PORT}`;

  const gatewayUrlNames = productionNames.filter(
    (name) =>
      name === 'OBJECT_STORE_GATEWAY_URL' ||
      name.endsWith('_GATEWAY_URL') ||
      /^CUSTOMER_SERVICE_.+_URL$/u.test(name) ||
      name === 'MINI_PROGRAM_BUILDER_URL',
  );
  for (const name of gatewayUrlNames)
    if (mock.values[name] !== gatewayBase) failures.push(`${name} must equal ${gatewayBase}`);

  const gatewayTokenNames = productionNames.filter(
    (name) =>
      name.endsWith('_GATEWAY_TOKEN') ||
      /^CUSTOMER_SERVICE_.+_TOKEN$/u.test(name) ||
      name === 'MINI_PROGRAM_BUILDER_TOKEN' ||
      name === 'MINI_PROGRAM_CALLBACK_TOKEN',
  );
  for (const name of gatewayTokenNames)
    if (mock.values[name] !== mock.values.LEQU_DEVELOPMENT_MOCK_TOKEN)
      failures.push(`${name} must equal LEQU_DEVELOPMENT_MOCK_TOKEN`);

  try {
    const database = new URL(mock.values.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol))
      failures.push('DATABASE_URL must use PostgreSQL');
  } catch {
    failures.push('DATABASE_URL must be an absolute PostgreSQL URL');
  }
  if (!validUuid(mock.values.WORKER_TENANT_ID)) failures.push('WORKER_TENANT_ID must be a UUID');
  if (mock.values.INTERNAL_API_URL !== `http://${mock.values.HOST}:${mock.values.PORT}`)
    failures.push('INTERNAL_API_URL must match the local API host and port');
  if (!isCanonicalBase64ByteLength(mock.values.PLATFORM_ADDRESS_ENCRYPTION_KEY, 32))
    failures.push('PLATFORM_ADDRESS_ENCRYPTION_KEY must be canonical base64 for 32 bytes');
  for (const [name, value] of Object.entries(mock.values))
    if (/replace-with|placeholder|changeme|example-secret/iu.test(value))
      failures.push(`${name} still contains a placeholder`);
  return [...new Set(failures)];
}

async function main() {
  const productionSource = await readFile('.env.example', 'utf8');
  const paths = ['.env.development-mock.example'];
  try {
    await readFile('.env.development-mock.local', 'utf8');
    paths.push('.env.development-mock.local');
  } catch {
    // The ignored local override is optional; the checked-in example remains mandatory.
  }
  for (const path of paths) {
    const failures = inspectDevelopmentMockProfile({
      productionSource,
      mockSource: await readFile(path, 'utf8'),
    });
    if (failures.length) {
      for (const failure of failures) console.error(`Development mock profile failure: ${failure}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(
    `Development mock profiles verified: ${paths.join(', ')}; all production provider groups are explicitly mapped to the development-only gateway.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
