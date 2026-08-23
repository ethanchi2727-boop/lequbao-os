import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { controlledStageRequirements } from './controlled-environment-preflight.mjs';

const workflowPath = '.github/workflows/controlled-preflight.yml';
const expressionPattern = /^\$\{\{\s*(secrets|vars)\.([A-Z][A-Z0-9_]*)\s*\}\}$/u;
const secretSettingPattern = /(?:SECRET|TOKEN|KEY|DATABASE_URL|BODY_JSON)$/u;

export function buildControlledEnvironmentInventory(workflowSource) {
  const workflow = parseYaml(workflowSource);
  const mappings = workflow?.jobs?.preflight?.env;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings))
    throw new Error('controlled preflight environment mapping is missing');

  const sources = new Map();
  for (const [name, expression] of Object.entries(mappings)) {
    const match = typeof expression === 'string' ? expression.match(expressionPattern) : undefined;
    if (!match || match[2] !== name)
      throw new Error(`controlled setting ${name} must map to the same named secret or variable`);
    const source = match[1] === 'secrets' ? 'secret' : 'variable';
    const expectedSource = secretSettingPattern.test(name) ? 'secret' : 'variable';
    if (source !== expectedSource)
      throw new Error(`controlled setting ${name} must be stored as a ${expectedSource}`);
    sources.set(name, source);
  }

  const expectedWorkflowNames = new Set(
    Object.values(controlledStageRequirements)
      .flat()
      .filter((name) => name !== 'CONTROLLED_RESULTS_FILE'),
  );
  const unexpectedNames = [...sources.keys()].filter((name) => !expectedWorkflowNames.has(name));
  if (unexpectedNames.length)
    throw new Error(
      `protected workflow contains unexpected controlled setting ${unexpectedNames[0]}`,
    );

  const stages = {};
  for (const stage of [47, 48, 49, 50]) {
    const secrets = [];
    const variables = [];
    const externalFiles = [];
    for (const name of controlledStageRequirements[stage]) {
      const source = sources.get(name);
      if (source === 'secret') secrets.push(name);
      else if (source === 'variable') variables.push(name);
      else if (stage === 50 && name === 'CONTROLLED_RESULTS_FILE') externalFiles.push(name);
      else throw new Error(`controlled setting ${name} is not mapped by the protected workflow`);
    }
    stages[stage] = {
      required: secrets.length + variables.length + externalFiles.length,
      secrets: secrets.sort(),
      variables: variables.sort(),
      externalFiles: externalFiles.sort(),
    };
  }

  const uniqueSecrets = new Set(Object.values(stages).flatMap((stage) => stage.secrets));
  const uniqueVariables = new Set(Object.values(stages).flatMap((stage) => stage.variables));
  const uniqueExternalFiles = new Set(
    Object.values(stages).flatMap((stage) => stage.externalFiles),
  );

  return {
    version: 1,
    environment: 'controlled-preproduction',
    valuePolicy: 'names-only',
    counts: {
      stageReferences: Object.values(stages).reduce((sum, stage) => sum + stage.required, 0),
      githubEnvironmentNames: uniqueSecrets.size + uniqueVariables.size,
      externalFileNames: uniqueExternalFiles.size,
      uniqueRequirements: uniqueSecrets.size + uniqueVariables.size + uniqueExternalFiles.size,
    },
    stages,
  };
}

function nameSet(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of setting names`);
  const result = new Set();
  for (const name of value) {
    if (typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(name))
      throw new Error(`${field} contains an invalid setting name`);
    if (result.has(name)) throw new Error(`${field} contains duplicate ${name}`);
    result.add(name);
  }
  return result;
}

export function inspectControlledEnvironmentNames(inventory, configuredNames) {
  if (!configuredNames || typeof configuredNames !== 'object' || Array.isArray(configuredNames))
    throw new Error('configured name inventory must be an object');
  const configured = {
    secrets: nameSet(configuredNames.secrets ?? [], 'secrets'),
    variables: nameSet(configuredNames.variables ?? [], 'variables'),
    externalFiles: nameSet(configuredNames.externalFiles ?? [], 'externalFiles'),
  };
  for (const [left, right] of [
    ['secrets', 'variables'],
    ['secrets', 'externalFiles'],
    ['variables', 'externalFiles'],
  ]) {
    for (const name of configured[left])
      if (configured[right].has(name))
        throw new Error(`${name} appears in both ${left} and ${right}`);
  }
  const expected = {
    secrets: new Set(Object.values(inventory.stages).flatMap((stage) => stage.secrets)),
    variables: new Set(Object.values(inventory.stages).flatMap((stage) => stage.variables)),
    externalFiles: new Set(Object.values(inventory.stages).flatMap((stage) => stage.externalFiles)),
  };
  const unexpected = Object.fromEntries(
    Object.entries(configured).map(([kind, names]) => [
      kind,
      [...names].filter((name) => !expected[kind].has(name)).sort(),
    ]),
  );
  const stages = Object.fromEntries(
    Object.entries(inventory.stages).map(([stage, requirements]) => {
      const missing = {
        secrets: requirements.secrets.filter((name) => !configured.secrets.has(name)),
        variables: requirements.variables.filter((name) => !configured.variables.has(name)),
        externalFiles: requirements.externalFiles.filter(
          (name) => !configured.externalFiles.has(name),
        ),
      };
      const misclassified = [
        ...requirements.secrets.flatMap((name) =>
          configured.variables.has(name)
            ? [{ name, expected: 'secret', actual: 'variable' }]
            : configured.externalFiles.has(name)
              ? [{ name, expected: 'secret', actual: 'externalFile' }]
              : [],
        ),
        ...requirements.variables.flatMap((name) =>
          configured.secrets.has(name)
            ? [{ name, expected: 'variable', actual: 'secret' }]
            : configured.externalFiles.has(name)
              ? [{ name, expected: 'variable', actual: 'externalFile' }]
              : [],
        ),
        ...requirements.externalFiles.flatMap((name) =>
          configured.secrets.has(name)
            ? [{ name, expected: 'externalFile', actual: 'secret' }]
            : configured.variables.has(name)
              ? [{ name, expected: 'externalFile', actual: 'variable' }]
              : [],
        ),
      ];
      const configuredCount =
        requirements.required -
        Object.values(missing).reduce((sum, names) => sum + names.length, 0);
      return [
        stage,
        { required: requirements.required, configured: configuredCount, missing, misclassified },
      ];
    }),
  );
  return {
    valuePolicy: 'names-only',
    stages,
    unexpected,
    ready:
      Object.values(stages).every(
        (stage) => stage.configured === stage.required && stage.misclassified.length === 0,
      ) && Object.values(unexpected).every((names) => names.length === 0),
  };
}

export async function fetchGitHubEnvironmentNames({
  repository,
  environment = 'controlled-preproduction',
  token,
  fetchImpl = globalThis.fetch,
}) {
  const [owner, name, ...extra] = (repository ?? '').split('/');
  if (
    extra.length ||
    !owner ||
    !name ||
    ['.', '..'].includes(owner) ||
    ['.', '..'].includes(name) ||
    !/^[A-Za-z0-9_.-]+$/u.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/u.test(name)
  )
    throw new Error('GitHub repository must use owner/name form');
  if (!/^[A-Za-z0-9_.-]+$/u.test(environment))
    throw new Error('GitHub environment name is invalid');
  if (typeof token !== 'string' || !token.trim()) throw new Error('GH_TOKEN is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/environments/${encodeURIComponent(environment)}`;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };
  const [secretsResponse, variablesResponse] = await Promise.all([
    fetchImpl(`${base}/secrets?per_page=100`, { headers }),
    fetchImpl(`${base}/variables?per_page=100`, { headers }),
  ]);
  for (const [kind, response] of [
    ['secrets', secretsResponse],
    ['variables', variablesResponse],
  ]) {
    if (!response?.ok)
      throw new Error(`GitHub ${kind} name request failed with status ${response?.status ?? 0}`);
  }
  const [secretPayload, variablePayload] = await Promise.all([
    secretsResponse.json(),
    variablesResponse.json(),
  ]);
  function extractNames(payload, field) {
    const records = payload?.[field];
    if (!Array.isArray(records) || !Number.isInteger(payload.total_count))
      throw new Error(`GitHub ${field} name response is malformed`);
    if (payload.total_count !== records.length)
      throw new Error(`GitHub ${field} name response is incomplete`);
    return records.map((item) => item?.name);
  }
  return {
    secrets: extractNames(secretPayload, 'secrets'),
    variables: extractNames(variablePayload, 'variables'),
    externalFiles: [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workflowSource = await readFile(workflowPath, 'utf8');
  const inventory = buildControlledEnvironmentInventory(workflowSource);
  const namesArgument = process.argv.find((argument) => argument.startsWith('--names='));
  const githubArgument = process.argv.find((argument) => argument.startsWith('--github='));
  if (namesArgument && githubArgument)
    throw new Error('--names and --github are mutually exclusive');
  if (!namesArgument && !githubArgument) console.log(JSON.stringify(inventory, null, 2));
  else if (namesArgument) {
    const namesPath = path.resolve(namesArgument.slice('--names='.length));
    const configuredNames = JSON.parse(await readFile(namesPath, 'utf8'));
    const report = inspectControlledEnvironmentNames(inventory, configuredNames);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 1;
  } else {
    const environmentArgument = process.argv.find((argument) =>
      argument.startsWith('--environment='),
    );
    const configuredNames = await fetchGitHubEnvironmentNames({
      repository: githubArgument.slice('--github='.length),
      environment: environmentArgument?.slice('--environment='.length),
      token: process.env.GH_TOKEN,
    });
    const report = inspectControlledEnvironmentNames(inventory, configuredNames);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 1;
  }
}
