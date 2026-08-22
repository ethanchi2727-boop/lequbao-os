import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const allowedEnvironments = new Set([
  'development',
  'test',
  'controlled-preproduction',
  'production',
  'unknown',
]);

const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const digest = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(digest.digest('hex')));
  });

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

const requireString = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value;
};

export async function inspectV5SqliteSource(source) {
  const id = requireString(source?.id, 'source.id');
  if (source.kind !== 'sqlite') throw new Error(`${id} kind must be sqlite`);
  if (!allowedEnvironments.has(source.declaredEnvironment))
    throw new Error(`${id} declaredEnvironment is invalid`);
  const configuredPath = requireString(source.path, `${id}.path`);
  if (!path.isAbsolute(configuredPath)) throw new Error(`${id}.path must be absolute`);
  const physicalPath = await realpath(configuredPath);
  const metadata = await stat(physicalPath);
  if (!metadata.isFile()) throw new Error(`${id}.path must resolve to a file`);

  const database = new DatabaseSync(physicalPath, { readOnly: true });
  try {
    const tableNames = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    const tables = tableNames.map((name) => ({
      name,
      rowCount: Number(
        database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get().count,
      ),
    }));
    const nonEmptyTables = tables.filter((table) => table.rowCount > 0);
    const rows = nonEmptyTables.reduce((total, table) => total + table.rowCount, 0);
    const dataPresent = nonEmptyTables.length > 0;
    const stopRelease =
      dataPresent && ['production', 'unknown'].includes(source.declaredEnvironment);
    return {
      id,
      kind: 'sqlite',
      declaredEnvironment: source.declaredEnvironment,
      locationSha256: createHash('sha256').update(physicalPath).digest('hex'),
      fileSha256: await sha256File(physicalPath),
      bytes: metadata.size,
      userVersion: Number(database.prepare('PRAGMA user_version').get().user_version),
      tableCount: tables.length,
      nonEmptyTableCount: nonEmptyTables.length,
      rowCount: rows,
      tables,
      outcome: stopRelease
        ? 'STOP_RELEASE_DATA_PRESENT'
        : dataPresent
          ? 'DATA_PRESENT_REVIEW_REQUIRED'
          : 'EMPTY_REVIEW_REQUIRED',
    };
  } finally {
    database.close();
  }
}

export async function buildV5Inventory(config, generatedAt = new Date().toISOString()) {
  if (!config || Array.isArray(config) || typeof config !== 'object')
    throw new Error('inventory config must be an object');
  if (config.version !== 1) throw new Error('inventory config version must be 1');
  if (!/^[a-f0-9]{40}$/u.test(config.releaseCommit ?? ''))
    throw new Error('releaseCommit must be an exact lowercase 40-character SHA');
  if (!Array.isArray(config.sources) || config.sources.length === 0)
    throw new Error('at least one V5 data source is required');
  const ids = config.sources.map((source) => source?.id);
  if (new Set(ids).size !== ids.length) throw new Error('V5 data source ids must be unique');

  const sources = [];
  for (const source of config.sources) sources.push(await inspectV5SqliteSource(source));
  const stopRelease = sources.some((source) => source.outcome === 'STOP_RELEASE_DATA_PRESENT');
  return {
    version: 1,
    releaseCommit: config.releaseCommit,
    generatedAt,
    verdict: stopRelease ? 'STOP_RELEASE' : 'INDEPENDENT_REVIEW_REQUIRED',
    limitations: [
      'This inventory proves only the explicitly listed files were inspected.',
      'Declared environment labels require independent ownership and deployment evidence.',
      'This inventory never grants the greenfield waiver or substitutes for greenfield-waiver.json.',
    ],
    sources,
  };
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configPath = argument('config');
  const outputPath = argument('output');
  if (!configPath || !path.isAbsolute(configPath))
    throw new Error('--config must be an absolute path');
  if (!outputPath || !path.isAbsolute(outputPath))
    throw new Error('--output must be an absolute path');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const inventory = await buildV5Inventory(config);
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(
    `V5 inventory written: ${inventory.sources.length} source(s), verdict ${inventory.verdict}.`,
  );
  if (inventory.verdict === 'STOP_RELEASE') process.exitCode = 1;
}
