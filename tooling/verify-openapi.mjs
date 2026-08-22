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
  '/api/v1/auth/sessions/exchange',
  '/api/v1/auth/sessions/refresh',
  '/internal/v1/metrics',
  '/api/v1/auth/sessions/switch-tenant',
  '/api/v1/auth/sessions/revoke',
  '/api/v1/delivery-projects',
  '/api/v1/delivery-projects/{projectId}',
  '/api/v1/delivery-projects/{projectId}/actions/start',
  '/api/v1/delivery-projects/{projectId}/actions/suspend',
  '/api/v1/delivery-projects/{projectId}/actions/resume',
  '/api/v1/delivery-projects/{projectId}/steps/{stepCode}/actions/execute',
  '/api/v1/delivery-projects/{projectId}/steps/{stepCode}/actions/retry',
  '/api/v1/delivery-projects/{projectId}/actions/accept',
  '/api/v1/delivery-projects/{projectId}/assignments',
  '/api/v1/delivery-exceptions',
  '/api/v1/distribution-statements/{statementId}/action-approvals',
  '/api/v1/distribution-action-approvals/{approvalId}/actions/approve',
  '/api/v1/distribution-statements/{statementId}/actions/pay',
  '/api/v1/distribution-statements/{statementId}/actions/reverse',
  '/api/v1/revenue-right-holders/{rightHolderId}/transfers',
  '/api/v1/revenue-right-transfers/{transferId}/confirmations',
  '/api/v1/revenue-right-transfers/{transferId}/actions/approve',
  '/api/v1/revenue-right-groups/{rightGroupId}/disputes',
  '/api/v1/merchant-intake/sessions',
  '/api/v1/merchant-intake/sessions/{sessionId}',
  '/api/v1/merchant-intake/sessions/{sessionId}/uploads',
  '/api/v1/merchant-intake/uploads/{uploadId}/actions/complete',
  '/api/v1/merchant-intake/sessions/{sessionId}/messages',
  '/api/v1/merchant-intake/sessions/{sessionId}/confirmations',
  '/api/v1/merchant-intake/sessions/{sessionId}/actions/commit',
  '/api/v1/webhooks/wecom/intake',
  '/api/v1/mini-program-authorizations/actions/activate',
  '/api/v1/mini-programs/{miniProgramId}',
  '/api/v1/mini-programs/{miniProgramId}/releases',
  '/api/v1/mini-programs/{miniProgramId}/releases/{releaseId}/actions/confirm-preview',
  '/api/v1/mini-programs/{miniProgramId}/releases/{releaseId}/actions/submit-review',
  '/api/v1/mini-programs/{miniProgramId}/releases/{releaseId}/actions/publish',
  '/api/v1/mini-programs/{miniProgramId}/actions/rollback',
  '/api/v1/mini-programs/{miniProgramId}/releases/{releaseId}/rollout-health',
  '/api/v1/webhooks/wechat/mini-program',
  '/api/v1/customer-service/conversations',
  '/api/v1/customer-service/conversations/{conversationId}',
  '/api/v1/customer-service/conversations/{conversationId}/messages',
  '/api/v1/customer-service/conversations/{conversationId}/messages/{messageId}/content',
  '/api/v1/customer-service/conversations/{conversationId}/actions/request-human',
  '/api/v1/customer-service/conversations/{conversationId}/actions/accept',
  '/api/v1/customer-service/conversations/{conversationId}/actions/return-to-ai',
  '/api/v1/customer-service/conversations/{conversationId}/actions/close',
  '/api/v1/customer-profile',
  '/api/v1/customer-profile/consents',
  '/api/v1/customer-profile/privacy-requests',
  '/api/v1/customer-service/knowledge-publications',
  '/api/v1/customer-service/knowledge-publications/{publicationId}/actions/revoke',
  '/internal/v1/customer-service/ai-jobs/process',
  '/api/v1/orders',
  '/api/v1/consumer/products/{productId}/trace-report',
  '/api/v1/life/cart',
  '/api/v1/life/discovery/stores',
  '/api/v1/life/invoice-profiles',
  '/api/v1/life/invoice-profiles/{profileId}',
  '/api/v1/life/cart/items',
  '/api/v1/life/cart/items/{itemId}',
  '/api/v1/life/orders',
  '/api/v1/life/orders/{orderId}',
  '/api/v1/orders/{orderId}',
  '/api/v1/payment-intents',
  '/api/v1/webhooks/payments/{provider}',
  '/api/v1/orders/{orderId}/refunds',
  '/api/v1/refunds/{refundId}/actions/approve',
  '/api/v1/orders/{orderId}/verification-entitlements',
  '/api/v1/verification-uses',
  '/api/v1/commerce-reconciliations',
  '/api/v1/internal/commerce/orders/{orderId}/actions/expire',
  '/api/v1/internal/commerce/refunds/{refundId}/actions/submit',
  '/api/v1/geo/profiles/{profileId}/actions/publish',
  '/api/v1/plugins/installations',
  '/api/v1/plugins/catalog',
  '/api/v1/plugins/installations/{installationId}/invocations',
  '/api/v1/plugins/installations/{installationId}/actions/upgrade',
  '/api/v1/plugins/installations/{installationId}/actions/uninstall',
  '/api/v1/reports/monthly-value',
  '/api/v1/internal/reports/monthly-value/actions/materialize',
  '/api/v1/internal/geo/targets/{targetId}/actions/check',
]) {
  if (!specification.paths?.[path]) failures.push(`implemented endpoint is missing: ${path}`);
}

const publicPaths = new Set([
  '/health',
  '/ready',
  '/api/v1/auth/sessions/exchange',
  '/api/v1/auth/sessions/refresh',
  '/api/v1/webhooks/wecom/intake',
  '/api/v1/webhooks/wechat/mini-program',
  '/api/v1/webhooks/payments/{provider}',
]);
for (const [path, pathItem] of Object.entries(specification.paths ?? {})) {
  if (publicPaths.has(path)) continue;
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    if (
      !operation?.security?.some((requirement) =>
        ['EmployeeBearer', 'ConsumerBearer', 'LifeConsumerBearer', 'InternalWorkerBearer'].some(
          (scheme) => scheme in requirement,
        ),
      )
    ) {
      failures.push(
        `protected operation lacks an implemented security scheme: ${method.toUpperCase()} ${path}`,
      );
    }
  }
}
if (source.includes('#/components/parameters/TenantId') || source.includes('name: x-tenant-id')) {
  failures.push('client-supplied tenant identity remains in the implemented OpenAPI');
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
