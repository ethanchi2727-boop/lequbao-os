import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const source = await readFile('apps/api/openapi.yaml', 'utf8');
const specification = parse(source);
const failures = [];

if (specification.openapi !== '3.1.0') failures.push('OpenAPI version must be 3.1.0');
if (!specification.paths?.['/api/v1/merchants/{merchantProfileId}/revenue-rights']?.post) {
  failures.push('implemented revenue-right endpoint is missing');
}
for (const path of [
  '/api/v1/distribution-statements/{statementId}/action-approvals',
  '/api/v1/distribution-action-approvals/{approvalId}/actions/approve',
  '/api/v1/distribution-statements/{statementId}/actions/pay',
  '/api/v1/distribution-statements/{statementId}/actions/reverse',
  '/api/v1/merchant-intake/sessions',
  '/api/v1/merchant-intake/sessions/{sessionId}',
  '/api/v1/merchant-intake/sessions/{sessionId}/assets',
  '/api/v1/merchant-intake/sessions/{sessionId}/confirmations',
  '/api/v1/merchant-intake/sessions/{sessionId}/actions/commit',
]) {
  if (!specification.paths?.[path]) failures.push(`implemented endpoint is missing: ${path}`);
}

const operationIds = [];
for (const [path, pathItem] of Object.entries(specification.paths ?? {})) {
  if (!path.startsWith('/')) failures.push(`invalid path: ${path}`);
  for (const operation of Object.values(pathItem ?? {})) {
    if (operation && typeof operation === 'object' && 'operationId' in operation) {
      operationIds.push(operation.operationId);
    }
  }
}
if (new Set(operationIds).size !== operationIds.length)
  failures.push('operationId values must be unique');

function visit(value) {
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value && typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
    const resolved = value.$ref
      .slice(2)
      .split('/')
      .reduce(
        (current, part) => current?.[part.replaceAll('~1', '/').replaceAll('~0', '~')],
        specification,
      );
    if (!resolved) failures.push(`unresolved reference: ${value.$ref}`);
  }
  for (const nested of Object.values(value)) visit(nested);
}
visit(specification);

if (failures.length > 0) {
  for (const failure of failures) console.error(`OpenAPI failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`OpenAPI verified: ${Object.keys(specification.paths).length} implemented paths.`);
}
