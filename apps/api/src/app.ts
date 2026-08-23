import { createHash, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import {
  CustomerServiceAiSecurityError,
  type CustomerServiceAiOrchestrator,
} from './customer-service-ai.js';
import {
  InactiveSessionError,
  PermissionDeniedError,
  TenantWriteSuspendedError,
  type AccessControlService,
  type AuthorizationContext,
  type AuthorizationOptions,
} from './access-control.js';
import {
  AuthSubjectInactiveError,
  RefreshSessionInvalidError,
  type AuthSessionService,
} from './auth-session-service.js';
import {
  IdentityExchangeRejectedError,
  IdentityExchangeRateLimitedError,
  IdentityExchangeUnavailableError,
  parseIdentityExchangeInput,
  type IdentityExchangeGateway,
} from './identity-exchange-http-adapter.js';
import {
  ConsumerSessionAuthenticationError,
  type ConsumerSessionIdentity,
  type ConsumerSessionIdentityVerifier,
} from './consumer-session-identity.js';
import {
  LifeConsumerSessionAuthenticationError,
  type LifeConsumerSessionIdentity,
  type LifeConsumerSessionIdentityVerifier,
} from './life-consumer-session-identity.js';
import {
  LifeConsumerAuthRejectedError,
  LifeConsumerRefreshRejectedError,
  LifeConsumerRevokeRejectedError,
  type LifeConsumerAuthService,
} from './life-consumer-auth-service.js';
import {
  LifeConsumerIdentityExchangeRateLimitedError,
  LifeConsumerIdentityExchangeRejectedError,
  LifeConsumerIdentityExchangeUnavailableError,
} from './life-consumer-identity-exchange-http-adapter.js';
import {
  ConsumerCatalogAuthenticationError,
  ConsumerCatalogNotFoundError,
  type ConsumerCatalogService,
} from './consumer-catalog-service.js';
import {
  ConsumerStoreSwitchAuthenticationError,
  ConsumerStoreSwitchConflictError,
  ConsumerStoreSwitchNotFoundError,
  type ConsumerStoreSwitchService,
} from './consumer-store-switch-service.js';
import {
  CustomerServiceAuthenticationError,
  CustomerServiceAuthorizationError,
  CustomerServiceConcurrencyError,
  CustomerServiceNotificationError,
  CustomerServiceStateError,
  type CustomerService,
} from './customer-service.js';
import {
  CommerceInventoryUnavailableError,
  CommerceOrderAuthenticationError,
  CommerceOrderAuthorizationError,
  CommerceOrderStateError,
  type CommerceOrderService,
} from './commerce-order-service.js';
import {
  CommercePaymentAuthenticationError,
  CommercePaymentAuthorizationError,
  CommercePaymentReplayConflictError,
  CommercePaymentSignatureError,
  CommercePaymentStateError,
  type CommercePaymentService,
} from './commerce-payment-service.js';
import {
  CommerceReconciliationAuthorizationError,
  CommerceReconciliationStateError,
  type CommerceReconciliationService,
} from './commerce-reconciliation-service.js';
import {
  CommerceRefundAuthenticationError,
  CommerceRefundAuthorizationError,
  CommerceRefundStateError,
  type CommerceRefundService,
} from './commerce-refund-service.js';
import {
  CommerceVerificationAuthenticationError,
  CommerceVerificationAuthorizationError,
  CommerceVerificationStateError,
  type CommerceVerificationService,
} from './commerce-verification-service.js';
import {
  DeliveryAcceptanceError,
  DeliveryAuthorizationError,
  DeliveryExecutionUnavailableError,
  DeliveryPrerequisiteError,
  DeliveryStateError,
  type DeliveryWorkflowService,
} from './delivery-workflow-service.js';
import {
  DistributionConfigurationError,
  DistributionSourceError,
  ProvisionalCostError,
  type DistributionLockService,
} from './distribution-lock-service.js';
import {
  DistributionApprovalError,
  DistributionAuthorizationError,
  DistributionPaymentEvidenceError,
  DistributionStateError,
  type DistributionSettlementService,
} from './distribution-settlement-service.js';
import {
  MerchantIntakeAuthorizationError,
  MerchantIntakeConfirmationError,
  MerchantIntakeConflictError,
  MerchantIntakeStateError,
  type MerchantIntakeService,
} from './merchant-intake-service.js';
import {
  IntakeObjectStoreUnavailableError,
  IntakeUploadEvidenceError,
  type MerchantIntakeUploadService,
} from './merchant-intake-upload-service.js';
import type { MerchantIntakeMessageService } from './merchant-intake-message-service.js';
import {
  MiniProgramCallbackAuthenticationError,
  MiniProgramCallbackUnavailableError,
  type MiniProgramCallbackService,
} from './mini-program-callback.js';
import {
  MiniProgramAuthorizationError,
  MiniProgramCallbackConflictError,
  MiniProgramConfirmationError,
  MiniProgramOwnershipConflictError,
  MiniProgramProviderError,
  MiniProgramStateError,
  type MiniProgramLifecycleService,
} from './mini-program-lifecycle-service.js';
import {
  IdempotencyConflictError,
  InactiveBeneficiaryError,
  RevenueRightConflictError,
  type RevenueRightService,
} from './revenue-right-service.js';
import {
  RevenueRightGovernanceAuthorizationError,
  RevenueRightGovernanceConflictError,
  RevenueRightGovernanceStateError,
  type RevenueRightGovernanceService,
} from './revenue-right-governance-service.js';
import {
  SessionAuthenticationError,
  type SessionIdentity,
  type SessionIdentityVerifier,
} from './session-identity.js';
import {
  WeComCallbackAuthenticationError,
  WeComCallbackConflictError,
  type WeComIntakeCallbackService,
} from './wecom-intake-callback.js';
import type { GeoPluginReportService } from './geo-plugin-report-service.js';
import {
  GeoPolicyError,
  PluginPolicyError,
  ReportPolicyError,
} from './geo-plugin-report-policy.js';
import { GeoPluginReportStateError } from './geo-plugin-report-service.js';
import { OperationalMetrics, securityHeaders } from './operational-observability.js';
import {
  MerchantOperationsAuthorizationError,
  MerchantOperationsConflictError,
  MerchantOperationsStateError,
  type MerchantOperationsService,
} from './merchant-operations-service.js';
import {
  OrganizationGovernanceAuthorizationError,
  OrganizationGovernanceConflictError,
  OrganizationGovernanceStateError,
  type OrganizationGovernanceService,
} from './organization-governance-service.js';
import {
  RevenueOperationsAuthorizationError,
  RevenueOperationsConflictError,
  type RevenueOperationsService,
} from './revenue-operations-service.js';
import {
  SalesLifecycleAuthorizationError,
  SalesLifecycleConflictError,
  SalesLifecycleStateError,
  type SalesLifecycleService,
} from './sales-lifecycle-service.js';
import {
  SubscriptionLifecycleAuthorizationError,
  SubscriptionLifecycleConflictError,
  SubscriptionLifecycleStateError,
  type SubscriptionLifecycleService,
} from './subscription-lifecycle-service.js';
import {
  PlatformCartAuthenticationError,
  PlatformCartItemNotFoundError,
  PlatformCartItemUnavailableError,
  type PlatformCartService,
} from './platform-cart-service.js';
import {
  PlatformOrderQueryAuthenticationError,
  PlatformOrderQueryNotFoundError,
  type PlatformOrderQueryService,
} from './platform-order-query-service.js';
import {
  PlatformCheckoutAuthenticationError,
  PlatformCheckoutConflictError,
  PlatformCheckoutNotFoundError,
  PlatformCheckoutUnavailableError,
  type PlatformCheckoutService,
} from './platform-checkout-service.js';
import {
  PlatformPaymentAuthenticationError,
  PlatformPaymentOrderNotFoundError,
  type PlatformPaymentService,
} from './platform-payment-service.js';
import {
  PlatformAddressAuthenticationError,
  PlatformAddressNotFoundError,
  type PlatformAddressService,
} from './platform-address-service.js';
import {
  PlatformInvoiceProfileAuthenticationError,
  PlatformInvoiceProfileNotFoundError,
  type PlatformInvoiceProfileService,
} from './platform-invoice-profile-service.js';
import {
  PlatformAftercareAuthenticationError,
  PlatformAftercareOrderNotFoundError,
  type PlatformAftercareService,
} from './platform-aftercare-service.js';
import {
  PlatformDiscoveryAuthenticationError,
  PlatformDiscoveryNotFoundError,
  type PlatformDiscoveryService,
} from './platform-discovery-service.js';
import {
  MerchantConsumerJourneyAuthenticationError,
  MerchantConsumerJourneyNotFoundError,
  type MerchantConsumerJourneyService,
} from './merchant-consumer-journey-service.js';
import {
  EmployeeAgentAuthorizationError,
  EmployeeAgentConflictError,
  type EmployeeAgentService,
} from './employee-agent-service.js';
import {
  OperationalHomeAuthorizationError,
  type OperationalHomeService,
} from './operational-home-service.js';
import {
  GeoOperationsAuthorizationError,
  GeoOperationsStateError,
  type GeoOperationsService,
} from './geo-operations-service.js';
import {
  CustomerServiceOperationsAuthorizationError,
  CustomerServiceOperationsConflictError,
  CustomerServiceOperationsStateError,
  type CustomerServiceOperationsService,
} from './customer-service-operations-service.js';
import {
  PlatformControlAuthorizationError,
  PlatformControlConflictError,
  PlatformControlStateError,
  type PlatformControlService,
} from './platform-control-service.js';

export interface AppOptions {
  databaseCheck?: () => Promise<void>;
  logger?: boolean;
  trustedProxy?: string[];
  authAuditHasher?: (purpose: 'ip' | 'user-agent' | 'assertion', value: string) => string;
  revenueRights?: RevenueRightService;
  revenueRightGovernance?: RevenueRightGovernanceService;
  distributionLocks?: DistributionLockService;
  distributionSettlements?: DistributionSettlementService;
  merchantIntake?: MerchantIntakeService;
  merchantIntakeUploads?: MerchantIntakeUploadService;
  merchantIntakeMessages?: MerchantIntakeMessageService;
  wecomIntakeCallback?: WeComIntakeCallbackService;
  sessionIdentity?: SessionIdentityVerifier;
  accessControl?: AccessControlService;
  authSessions?: AuthSessionService;
  identityExchange?: IdentityExchangeGateway;
  deliveryWorkflows?: DeliveryWorkflowService;
  miniPrograms?: MiniProgramLifecycleService;
  miniProgramCallback?: MiniProgramCallbackService;
  consumerSession?: ConsumerSessionIdentityVerifier;
  lifeConsumerSession?: LifeConsumerSessionIdentityVerifier;
  lifeConsumerAuth?: LifeConsumerAuthService;
  consumerCatalog?: ConsumerCatalogService;
  consumerStoreSwitch?: ConsumerStoreSwitchService;
  platformCart?: PlatformCartService;
  platformAddresses?: PlatformAddressService;
  platformInvoiceProfiles?: PlatformInvoiceProfileService;
  platformCheckout?: PlatformCheckoutService;
  platformOrders?: PlatformOrderQueryService;
  platformPayments?: PlatformPaymentService;
  platformAftercare?: PlatformAftercareService;
  platformDiscovery?: PlatformDiscoveryService;
  merchantConsumerJourney?: MerchantConsumerJourneyService;
  customerService?: CustomerService;
  customerServiceAi?: CustomerServiceAiOrchestrator;
  commerceOrders?: CommerceOrderService;
  commercePayments?: CommercePaymentService;
  commerceRefunds?: CommerceRefundService;
  commerceVerification?: CommerceVerificationService;
  commerceReconciliation?: CommerceReconciliationService;
  geoPluginReports?: GeoPluginReportService;
  merchantOperations?: MerchantOperationsService;
  organizationGovernance?: OrganizationGovernanceService;
  revenueOperations?: RevenueOperationsService;
  salesLifecycle?: SalesLifecycleService;
  subscriptionLifecycle?: SubscriptionLifecycleService;
  employeeAgent?: EmployeeAgentService;
  operationalHome?: OperationalHomeService;
  geoOperations?: GeoOperationsService;
  customerServiceOperations?: CustomerServiceOperationsService;
  platformControl?: PlatformControlService;
  internalWorkerToken?: string;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustedProxy ?? false,
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof EmployeeAgentAuthorizationError)
      return reply.code(404).send({ code: 'EMPLOYEE_AGENT_RESOURCE_NOT_FOUND' });
    if (error instanceof EmployeeAgentConflictError)
      return reply.code(409).send({ code: 'INVALID_EMPLOYEE_AGENT_STATE' });
    if (error instanceof OperationalHomeAuthorizationError)
      return reply.code(403).send({ code: 'OPERATIONAL_SCOPE_DENIED' });
    if (error instanceof GeoOperationsAuthorizationError)
      return reply.code(404).send({ code: 'GEO_RESOURCE_NOT_FOUND' });
    if (error instanceof GeoOperationsStateError)
      return reply.code(409).send({ code: 'INVALID_GEO_DIFFERENCE_STATE' });
    if (error instanceof CustomerServiceOperationsAuthorizationError)
      return reply.code(404).send({ code: 'CUSTOMER_SERVICE_RESOURCE_NOT_FOUND' });
    if (error instanceof CustomerServiceOperationsConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof CustomerServiceOperationsStateError)
      return reply.code(409).send({ code: 'INVALID_CUSTOMER_SERVICE_STATE' });
    if (error instanceof PlatformControlAuthorizationError)
      return reply.code(404).send({ code: 'PLATFORM_CONTROL_RESOURCE_NOT_FOUND' });
    if (error instanceof PlatformControlConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof PlatformControlStateError)
      return reply.code(409).send({ code: 'INVALID_PLATFORM_CONTROL_STATE' });
    const candidate =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: unknown }).statusCode
        : undefined;
    const status = typeof candidate === 'number' && candidate >= 400 ? candidate : 500;
    return reply.code(status).send({ code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED' });
  });
  const operationalMetrics = new OperationalMetrics();
  const requestStartedAt = new WeakMap<object, number>();
  const paymentCallbackRawBodies = new WeakMap<object, string>();
  await app.register(cors, { origin: false });
  app.addHook('onRequest', async (request, reply) => {
    requestStartedAt.set(request.raw, performance.now());
    for (const [name, value] of Object.entries(securityHeaders)) reply.header(name, value);
    reply.header('x-trace-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    operationalMetrics.record({
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      statusCode: reply.statusCode,
      durationMs: Math.max(
        0,
        performance.now() - (requestStartedAt.get(request.raw) ?? performance.now()),
      ),
    });
  });
  app.addContentTypeParser('application/xml', { parseAs: 'string' }, (_request, body, done) =>
    done(null, body),
  );
  app.addContentTypeParser(
    'application/vnd.lequ.payment-callback+json',
    { parseAs: 'string' },
    (_request, body, done) => done(null, body),
  );
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (
      !request.url.startsWith('/api/v1/webhooks/payments/') ||
      !request.headers['content-type']?.toLowerCase().startsWith('application/json')
    )
      return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const raw = Buffer.concat(chunks);
    paymentCallbackRawBodies.set(request.raw, raw.toString('utf8'));
    return Readable.from(raw);
  });

  app.get('/health', async () => ({ status: 'ok', version: '6.1.0' }));

  app.get('/ready', async (_request, reply) => {
    try {
      await options.databaseCheck?.();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/internal/v1/metrics', async (request, reply) => {
    if (
      !options.internalWorkerToken ||
      !validInternalBearer(options.internalWorkerToken, request.headers.authorization)
    )
      return reply.code(401).send({ code: 'INVALID_INTERNAL_WORKER' });
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(operationalMetrics.render());
  });

  app.post('/api/v1/auth/sessions/exchange', async (request, reply) => {
    if (!options.identityExchange || !options.authSessions)
      return reply.code(503).send({ code: 'AUTHENTICATION_UNAVAILABLE' });
    return handleAuthSession(reply, async () => {
      const exchangeInput = parseIdentityExchangeInput(request.body);
      const userAgent = request.headers['user-agent'] ?? '';
      const verified = await options.identityExchange!.exchange(exchangeInput, {
        sourceIp: request.ip,
        userAgent,
      });
      return options.authSessions!.issue({
        tenantId: verified.tenantId,
        userId: verified.userId,
        authLevel: verified.authLevel,
        deviceId: verified.deviceId,
        ...(options.authAuditHasher
          ? {
              audit: {
                action: 'auth.session.issued' as const,
                traceId: request.id,
                ipHash: options.authAuditHasher('ip', request.ip),
                userAgentHash: options.authAuditHasher('user-agent', userAgent),
                assertionIdHash: options.authAuditHasher('assertion', verified.assertionId),
                provider: verified.provider,
              },
            }
          : {}),
      });
    });
  });

  app.post('/api/v1/auth/sessions/refresh', async (request, reply) => {
    if (!options.authSessions) return reply.code(503).send({ code: 'AUTHENTICATION_UNAVAILABLE' });
    return handleAuthSession(reply, () =>
      options.authSessions!.refresh(request.body as Parameters<AuthSessionService['refresh']>[0]),
    );
  });

  app.post('/api/v1/auth/sessions/switch-tenant', async (request, reply) => {
    const identity = await authorizedIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    if (!options.authSessions) return reply.code(503).send({ code: 'AUTHENTICATION_UNAVAILABLE' });
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    return handleAuthSession(reply, () =>
      options.authSessions!.issue({
        ...body,
        userId: identity.userId,
        authLevel: identity.authLevel ?? 'PASSWORD',
        ...(options.authAuditHasher
          ? {
              audit: {
                action: 'auth.tenant.switched' as const,
                traceId: request.id,
                ipHash: options.authAuditHasher('ip', request.ip),
                userAgentHash: options.authAuditHasher(
                  'user-agent',
                  request.headers['user-agent'] ?? '',
                ),
              },
            }
          : {}),
      } as Parameters<AuthSessionService['issue']>[0]),
    );
  });

  app.post('/api/v1/auth/sessions/revoke', async (request, reply) => {
    const identity = await authorizedIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    if (!options.authSessions) return reply.code(503).send({ code: 'AUTHENTICATION_UNAVAILABLE' });
    const body = request.body as { reason?: string } | undefined;
    return handleAuthSession(reply, async () => {
      await options.authSessions!.revoke(identity, body?.reason ?? 'USER_LOGOUT');
      return reply.code(204).send();
    });
  });

  app.post('/api/v1/life/auth/sessions/exchange', async (request, reply) => {
    if (!options.lifeConsumerAuth)
      return reply.code(503).send({ code: 'LIFE_AUTHENTICATION_UNAVAILABLE' });
    return handleLifeConsumerAuth(reply, () =>
      options.lifeConsumerAuth!.exchange(request.body as never, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      }),
    );
  });

  app.post('/api/v1/life/auth/mobile-otp/challenges', async (request, reply) => {
    if (!options.lifeConsumerAuth)
      return reply.code(503).send({ code: 'LIFE_AUTHENTICATION_UNAVAILABLE' });
    return handleLifeConsumerAuth(reply, () =>
      options.lifeConsumerAuth!.requestMobileOtp(request.body as never, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      }),
    );
  });

  app.post('/api/v1/life/auth/mobile-otp/assertions/exchange', async (request, reply) => {
    if (!options.lifeConsumerAuth)
      return reply.code(503).send({ code: 'LIFE_AUTHENTICATION_UNAVAILABLE' });
    return handleLifeConsumerAuth(reply, () =>
      options.lifeConsumerAuth!.exchangeMobileOtp(request.body as never, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      }),
    );
  });

  app.post('/api/v1/life/auth/sessions/refresh', async (request, reply) => {
    if (!options.lifeConsumerAuth)
      return reply.code(503).send({ code: 'LIFE_AUTHENTICATION_UNAVAILABLE' });
    return handleLifeConsumerAuth(reply, () => options.lifeConsumerAuth!.refresh(request.body));
  });

  app.post('/api/v1/life/auth/sessions/revoke', async (request, reply) => {
    if (!options.lifeConsumerAuth)
      return reply.code(503).send({ code: 'LIFE_AUTHENTICATION_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const body = request.body as { reason?: string } | undefined;
    return handleLifeConsumerAuth(reply, async () => {
      await options.lifeConsumerAuth!.revoke(identity, body?.reason ?? 'USER_LOGOUT');
      return reply.code(204).send();
    });
  });

  app.get('/api/v1/context', async (request, reply) => {
    const identity = await authorizedIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return {
      tenantId: identity.tenantId,
      userId: identity.userId,
      roleCodes: identity.roleCodes,
      storeIds: identity.storeIds,
      sessionId: identity.sessionId,
    };
  });

  app.get('/api/v1/operational-home/today', async (request, reply) => {
    const identity = await authorizedIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    if (!options.operationalHome) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return options.operationalHome.getToday(identity);
  });

  app.get<{ Querystring: { storeId?: string } }>(
    '/api/v1/geo-operations/overview',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'geo.read',
      );
      if (!identity) return;
      if (!options.geoOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.geoOperations.overview(identity, request.query);
    },
  );
  app.get<{ Querystring: { storeId?: string; status?: string } }>(
    '/api/v1/geo-operations/differences',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'geo.read',
      );
      if (!identity) return;
      if (!options.geoOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.geoOperations.listDifferences(identity, request.query);
    },
  );
  app.post<{ Params: { differenceId: string } }>(
    '/api/v1/geo-operations/differences/:differenceId/actions/decide',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'geo.publish',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      if (!options.geoOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.geoOperations.decideDifference({
        identity,
        differenceId: request.params.differenceId,
        traceId: request.id,
        body: request.body,
      });
    },
  );

  app.get<{ Querystring: { storeId?: string; status?: string } }>(
    '/api/v1/customer-service-operations/shifts',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!identity) return;
      if (!options.customerServiceOperations)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.customerServiceOperations.listShifts(identity, request.query);
    },
  );
  app.post('/api/v1/customer-service-operations/shifts', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant_profile.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    if (!options.customerServiceOperations)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    return reply
      .code(201)
      .send(
        await options.customerServiceOperations.createShift(
          identity,
          key,
          request.id,
          request.body,
        ),
      );
  });
  app.get<{ Querystring: { storeId?: string; status?: string } }>(
    '/api/v1/customer-service-operations/tasks',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!identity) return;
      if (!options.customerServiceOperations)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.customerServiceOperations.listTasks(identity, request.query);
    },
  );
  app.post('/api/v1/customer-service-operations/tasks', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'customer_service.send',
      { write: true },
    );
    if (!identity) return;
    if (!options.customerServiceOperations)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    return reply
      .code(201)
      .send(
        await options.customerServiceOperations.createTask(identity, key, request.id, request.body),
      );
  });
  app.post<{ Params: { taskId: string } }>(
    '/api/v1/customer-service-operations/tasks/:taskId/actions/complete',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.close',
        { write: true },
      );
      if (!identity) return;
      if (!options.customerServiceOperations)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const key = headerValue(request.headers['idempotency-key']);
      if (!key || key.length > 255)
        return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      return options.customerServiceOperations.completeTask(
        identity,
        request.params.taskId,
        key,
        request.id,
        request.body,
      );
    },
  );
  app.get<{ Querystring: { storeId?: string; status?: string } }>(
    '/api/v1/customer-service-operations/quality-reviews',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!identity) return;
      if (!options.customerServiceOperations)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.customerServiceOperations.listQualityReviews(identity, request.query);
    },
  );
  app.post<{ Params: { reviewId: string } }>(
    '/api/v1/customer-service-operations/quality-reviews/:reviewId/actions/decide',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.close',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      if (!options.customerServiceOperations)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const key = headerValue(request.headers['idempotency-key']);
      if (!key || key.length > 255)
        return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      return options.customerServiceOperations.decideQualityReview(
        identity,
        request.params.reviewId,
        key,
        request.id,
        request.body,
      );
    },
  );

  app.get('/api/v1/integrations/wecom/connection-health', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'audit.read',
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return options.platformControl.listConnectorHealth(identity);
  });
  app.post('/api/v1/integrations/wecom/connection-health/actions/retry', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant_profile.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    return options.platformControl.retryConnector(identity, key, request.id, request.body);
  });
  app.get('/api/v1/reward-rules', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'reward_rule.manage',
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return options.platformControl.listRewardRules(identity);
  });
  app.post('/api/v1/reward-rules/actions/publish', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'reward_rule.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    return options.platformControl.publishRewardRule(identity, key, request.id, request.body);
  });
  app.get<{ Querystring: { query?: string; limit?: string } }>(
    '/api/v1/skills/catalog',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'plugin.install',
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.platformControl.listSkills(identity, request.query);
    },
  );
  app.get<{ Querystring: { query?: string; status?: string; limit?: string } }>(
    '/api/v1/platform/merchants',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'audit.read',
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.platformControl.listMerchants(identity, request.query);
    },
  );
  app.get('/api/v1/platform/plans', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'revenue_policy.manage',
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return options.platformControl.listPlans(identity);
  });
  app.post<{ Params: { planCode: string } }>(
    '/api/v1/platform/plans/:planCode/actions/update-entitlements',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_policy.manage',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const key = headerValue(request.headers['idempotency-key']);
      if (!key || key.length > 255)
        return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      return options.platformControl.updatePlan(
        identity,
        request.params.planCode,
        key,
        request.id,
        request.body,
      );
    },
  );
  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/api/v1/finance/reconciliation-discrepancies',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'finance.reconcile',
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.platformControl.listDiscrepancies(identity, request.query);
    },
  );
  app.post<{ Params: { discrepancyId: string } }>(
    '/api/v1/finance/reconciliation-discrepancies/:discrepancyId/actions/resolve',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'finance.reconcile',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const key = headerValue(request.headers['idempotency-key']);
      if (!key || key.length > 255)
        return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      return options.platformControl.resolveDiscrepancy(
        identity,
        request.params.discrepancyId,
        key,
        request.id,
        request.body,
      );
    },
  );
  app.get<{ Querystring: { query?: string; status?: string; limit?: string } }>(
    '/api/v1/platform/channel-partners',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'audit.read',
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.platformControl.listPartners(identity, request.query);
    },
  );
  app.post('/api/v1/platform/channel-partners/actions/save', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'role.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    return options.platformControl.savePartner(identity, key, request.id, request.body);
  });
  app.get<{ Querystring: { query?: string; status?: string; limit?: string } }>(
    '/api/v1/platform/model-route-budgets',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_policy.manage',
      );
      if (!identity) return;
      if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.platformControl.listModelBudgets(identity, request.query);
    },
  );
  app.post('/api/v1/platform/model-route-budgets/actions/save', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'revenue_policy.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    if (!options.platformControl) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    return options.platformControl.saveModelBudget(identity, key, request.id, request.body);
  });

  app.get('/api/v1/employee-agent/conversations', async (request, reply) => {
    const identity = await authorizedIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return options.employeeAgent.listConversations(identity);
  });
  app.post('/api/v1/employee-agent/conversations', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      undefined,
      { write: true },
    );
    if (!identity) return;
    if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return reply
      .code(201)
      .send(await options.employeeAgent.createConversation(identity, request.body));
  });
  app.get<{ Params: { conversationId: string } }>(
    '/api/v1/employee-agent/conversations/:conversationId',
    async (request, reply) => {
      const identity = await authorizedIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.employeeAgent.getConversation(identity, request.params.conversationId);
    },
  );
  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/employee-agent/tasks',
    async (request, reply) => {
      const identity = await authorizedIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.employeeAgent.listTasks(identity, request.query.status);
    },
  );
  app.post('/api/v1/employee-agent/tasks', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      undefined,
      { write: true },
    );
    if (!identity) return;
    const key = headerValue(request.headers['idempotency-key']);
    if (!key || key.length > 255) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return reply
      .code(201)
      .send(await options.employeeAgent.createTask(identity, key, request.body));
  });
  app.get<{ Params: { taskId: string } }>(
    '/api/v1/employee-agent/tasks/:taskId',
    async (request, reply) => {
      const identity = await authorizedIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.employeeAgent.getTask(identity, request.params.taskId);
    },
  );
  app.post<{ Params: { taskId: string } }>(
    '/api/v1/employee-agent/tasks/:taskId/plan',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        undefined,
        { write: true },
      );
      if (!identity) return;
      if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.employeeAgent.setPlan(identity, request.params.taskId, request.body);
    },
  );
  for (const [pathAction, serviceAction] of [
    ['pause', 'PAUSE'],
    ['resume', 'RESUME'],
    ['cancel', 'CANCEL'],
    ['retry', 'RETRY'],
  ] as const) {
    app.post<{ Params: { taskId: string } }>(
      `/api/v1/employee-agent/tasks/:taskId/actions/${pathAction}`,
      async (request, reply) => {
        const identity = await authorizedIdentity(
          options,
          request.headers.authorization,
          reply,
          undefined,
          { write: true },
        );
        if (!identity) return;
        if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return options.employeeAgent.actTask(identity, request.params.taskId, serviceAction);
      },
    );
  }
  app.post<{ Body: { token?: string; decision?: 'APPROVE' | 'REJECT' } }>(
    '/api/v1/employee-agent/approvals/actions/decide',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        undefined,
        { write: true },
      );
      if (!identity) return;
      if (!request.body?.token || !request.body.decision)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.employeeAgent) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return options.employeeAgent.decideApproval(
        identity,
        request.body.token,
        request.body.decision,
      );
    },
  );

  app.post('/api/v1/delivery-projects', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'delivery.create',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.deliveryWorkflows) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleDelivery(reply, async () =>
      reply.code(201).send(
        await options.deliveryWorkflows!.create({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/delivery-projects/:projectId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'delivery.read',
      );
      if (!identity) return;
      if (!options.deliveryWorkflows) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleDelivery(reply, () =>
        options.deliveryWorkflows!.get(identity, request.params.projectId),
      );
    },
  );

  for (const action of ['start', 'resume'] as const) {
    app.post<{ Params: { projectId: string } }>(
      `/api/v1/delivery-projects/:projectId/actions/${action}`,
      async (request, reply) => {
        const identity = await authorizedIdentity(
          options,
          request.headers.authorization,
          reply,
          'delivery.execute',
          { mfaRequired: true, write: true },
        );
        if (!identity) return;
        const idempotencyKey = headerValue(request.headers['idempotency-key']);
        if (!idempotencyKey) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
        if (!options.deliveryWorkflows)
          return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleDelivery(reply, () =>
          options.deliveryWorkflows!.start({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: { projectId: request.params.projectId },
          }),
        );
      },
    );
  }

  app.post<{ Params: { projectId: string } }>(
    '/api/v1/delivery-projects/:projectId/actions/suspend',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'delivery.execute',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.deliveryWorkflows) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleDelivery(reply, () =>
        options.deliveryWorkflows!.suspend({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: { projectId: request.params.projectId },
        }),
      );
    },
  );

  for (const action of ['execute', 'retry'] as const) {
    app.post<{ Params: { projectId: string; stepCode: string } }>(
      `/api/v1/delivery-projects/:projectId/steps/:stepCode/actions/${action}`,
      async (request, reply) => {
        const identity = await authorizedIdentity(
          options,
          request.headers.authorization,
          reply,
          'delivery.execute',
          { mfaRequired: true, write: true },
        );
        if (!identity) return;
        const idempotencyKey = headerValue(request.headers['idempotency-key']);
        if (!idempotencyKey) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
        if (!options.deliveryWorkflows)
          return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleDelivery(reply, () =>
          options.deliveryWorkflows![action === 'execute' ? 'executeStep' : 'retryStep']({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, {
              projectId: request.params.projectId,
              stepCode: request.params.stepCode,
            }),
          }),
        );
      },
    );
  }

  app.post<{ Params: { projectId: string } }>(
    '/api/v1/delivery-projects/:projectId/actions/accept',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'delivery.accept',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.deliveryWorkflows) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleDelivery(reply, () =>
        options.deliveryWorkflows!.accept({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { projectId: request.params.projectId }),
        }),
      );
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/api/v1/delivery-projects/:projectId/assignments',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'delivery.execute',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.deliveryWorkflows) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleDelivery(reply, () =>
        options.deliveryWorkflows!.assignTemporaryAccess({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { projectId: request.params.projectId }),
        }),
      );
    },
  );

  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/delivery-exceptions',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'delivery.read',
      );
      if (!identity) return;
      if (!options.deliveryWorkflows) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleDelivery(reply, () =>
        options.deliveryWorkflows!.listExceptions(identity, request.query.status),
      );
    },
  );

  app.post<{ Params: { merchantProfileId: string } }>(
    '/api/v1/merchants/:merchantProfileId/revenue-rights',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_right.create',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255) {
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      }
      if (!options.revenueRights) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });

      try {
        const result = await options.revenueRights.create({
          tenantId: identity.tenantId,
          merchantProfileId: request.params.merchantProfileId,
          idempotencyKey,
          body: objectBody(request.body, { createdBy: identity.userId }),
          traceId: request.id,
        });
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (error instanceof RevenueRightConflictError) {
          return reply.code(409).send({ code: 'ACTIVE_REVENUE_RIGHT_EXISTS' });
        }
        if (error instanceof InactiveBeneficiaryError) {
          return reply.code(422).send({ code: 'INVALID_REVENUE_BENEFICIARY' });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { subscriptionId: string } }>(
    '/api/v1/subscriptions/:subscriptionId/distribution-statements:lock',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'distribution.lock',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255) {
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      }
      if (!options.distributionLocks) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const body =
        request.body && typeof request.body === 'object'
          ? {
              ...request.body,
              subscriptionId: request.params.subscriptionId,
              lockedBy: identity.userId,
            }
          : { subscriptionId: request.params.subscriptionId, lockedBy: identity.userId };
      try {
        const result = await options.distributionLocks.lock({
          tenantId: identity.tenantId,
          idempotencyKey,
          traceId: request.id,
          body,
        });
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (error instanceof ProvisionalCostError) {
          return reply.code(409).send({ code: 'DIRECT_COSTS_NOT_ACTUAL' });
        }
        if (error instanceof DistributionSourceError) {
          return reply.code(422).send({ code: 'INVALID_DISTRIBUTION_SOURCE' });
        }
        if (error instanceof DistributionConfigurationError) {
          return reply.code(422).send({ code: 'INVALID_DISTRIBUTION_CONFIGURATION' });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { statementId: string } }>(
    '/api/v1/distribution-statements/:statementId/action-approvals',
    async (request, reply) => {
      const actionType =
        request.body && typeof request.body === 'object' && 'actionType' in request.body
          ? request.body.actionType
          : undefined;
      const permission = actionType === 'REVERSE' ? 'distribution.reverse' : 'distribution.pay';
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        permission,
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const context = idempotencyContext(request.headers, identity);
      if (!context) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.distributionSettlements)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSettlement(reply, async () => {
        const body = objectBody(request.body, {
          statementId: request.params.statementId,
          requestedBy: identity.userId,
        });
        const result = await options.distributionSettlements!.requestApproval({
          ...context,
          traceId: request.id,
          body,
        });
        return reply.code(201).send(result);
      });
    },
  );

  app.post<{ Params: { approvalId: string } }>(
    '/api/v1/distribution-action-approvals/:approvalId/actions/approve',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'settlement.approve',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const context = idempotencyContext(request.headers, identity);
      if (!context) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.distributionSettlements)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSettlement(reply, async () => {
        const result = await options.distributionSettlements!.approve({
          ...context,
          traceId: request.id,
          body: objectBody(request.body, {
            approvalId: request.params.approvalId,
            approvedBy: identity.userId,
          }),
        });
        return reply.send(result);
      });
    },
  );

  for (const action of ['pay', 'reverse'] as const) {
    app.post<{ Params: { statementId: string } }>(
      `/api/v1/distribution-statements/:statementId/actions/${action}`,
      async (request, reply) => {
        const identity = await authorizedIdentity(
          options,
          request.headers.authorization,
          reply,
          action === 'pay' ? 'distribution.pay' : 'distribution.reverse',
          { mfaRequired: true, write: true },
        );
        if (!identity) return;
        const context = idempotencyContext(request.headers, identity);
        if (!context) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
        if (!options.distributionSettlements)
          return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleSettlement(reply, async () => {
          const result = await options.distributionSettlements![action]({
            ...context,
            traceId: request.id,
            body: objectBody(request.body, {
              statementId: request.params.statementId,
              executedBy: identity.userId,
            }),
          });
          return reply.send(result);
        });
      },
    );
  }

  app.post<{ Params: { rightHolderId: string } }>(
    '/api/v1/revenue-right-holders/:rightHolderId/transfers',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_right.transfer_request',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.revenueRightGovernance)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueRightGovernance(reply, async () =>
        reply.code(202).send(
          await options.revenueRightGovernance!.requestTransfer({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { rightHolderId: request.params.rightHolderId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { transferId: string } }>(
    '/api/v1/revenue-right-transfers/:transferId/confirmations',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_right.transfer_request',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.revenueRightGovernance)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueRightGovernance(reply, async () =>
        reply.send(
          await options.revenueRightGovernance!.confirmTransfer({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { transferId: request.params.transferId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { transferId: string } }>(
    '/api/v1/revenue-right-transfers/:transferId/actions/approve',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_right.transfer_approve',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.revenueRightGovernance)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueRightGovernance(reply, async () =>
        reply.send(
          await options.revenueRightGovernance!.approveTransfer({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { transferId: request.params.transferId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { rightGroupId: string } }>(
    '/api/v1/revenue-right-groups/:rightGroupId/disputes',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'revenue_right.suspend',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.revenueRightGovernance)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueRightGovernance(reply, async () =>
        reply.code(202).send(
          await options.revenueRightGovernance!.openDispute({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { rightGroupId: request.params.rightGroupId }),
          }),
        ),
      );
    },
  );

  app.post('/api/v1/merchant-intake/sessions', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant.intake.create',
      { write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.merchantIntake) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleIntake(reply, async () => {
      const result = await options.merchantIntake!.createSession({
        identity,
        idempotencyKey,
        traceId: request.id,
        body: request.body,
      });
      return reply.code(201).send(result);
    });
  });

  app.get<{ Params: { sessionId: string } }>(
    '/api/v1/merchant-intake/sessions/:sessionId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.read',
      );
      if (!identity) return;
      if (!options.merchantIntake) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleIntake(reply, async () =>
        reply.send(await options.merchantIntake!.getSession(identity, request.params.sessionId)),
      );
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    '/api/v1/merchant-intake/sessions/:sessionId/uploads',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.write',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.merchantIntakeUploads)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleIntake(reply, async () => {
        const result = await options.merchantIntakeUploads!.create({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { sessionId: request.params.sessionId }),
        });
        return reply.code(201).send(result);
      });
    },
  );

  app.post<{ Params: { uploadId: string } }>(
    '/api/v1/merchant-intake/uploads/:uploadId/actions/complete',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.write',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.merchantIntakeUploads)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleIntake(reply, async () => {
        const result = await options.merchantIntakeUploads!.complete({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { uploadId: request.params.uploadId }),
        });
        return reply.code(202).send(result);
      });
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    '/api/v1/merchant-intake/sessions/:sessionId/messages',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.write',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.merchantIntakeMessages)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleIntake(reply, async () =>
        reply.code(202).send(
          await options.merchantIntakeMessages!.add({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { sessionId: request.params.sessionId }),
          }),
        ),
      );
    },
  );

  app.post<{
    Querystring: { msg_signature?: string; timestamp?: string; nonce?: string };
  }>('/api/v1/webhooks/wecom/intake', async (request, reply) => {
    const { msg_signature: signature, timestamp, nonce } = request.query;
    if (!signature || !timestamp || !nonce || typeof request.body !== 'string')
      return reply.code(400).send({ code: 'INVALID_WECOM_CALLBACK' });
    if (!options.wecomIntakeCallback) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    try {
      return reply.send(
        await options.wecomIntakeCallback.receive({
          signature,
          timestamp,
          nonce,
          xml: request.body,
          traceId: request.id,
        }),
      );
    } catch (error) {
      if (error instanceof WeComCallbackAuthenticationError)
        return reply.code(401).send({ code: 'INVALID_WECOM_SIGNATURE' });
      if (error instanceof WeComCallbackConflictError)
        return reply.code(409).send({ code: 'WECOM_EVENT_CONFLICT' });
      throw error;
    }
  });

  app.post<{ Params: { sessionId: string } }>(
    '/api/v1/merchant-intake/sessions/:sessionId/confirmations',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.confirm',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.merchantIntake) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleIntake(reply, async () =>
        reply.send(
          await options.merchantIntake!.confirm({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { sessionId: request.params.sessionId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    '/api/v1/merchant-intake/sessions/:sessionId/actions/commit',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.confirm',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.merchantIntake) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleIntake(reply, async () =>
        reply.send(
          await options.merchantIntake!.commit({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { sessionId: request.params.sessionId }),
          }),
        ),
      );
    },
  );

  app.post('/api/v1/customer-service/conversations', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCustomerService(reply, async () =>
      reply.code(201).send(
        await options.customerService!.createConversation({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/customer-service/conversations',
    async (request, reply) => {
      const consumer = tryConsumerIdentity(options, request.headers.authorization);
      if (consumer) {
        if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleCustomerService(reply, () =>
          options.customerService!.listConsumerConversations(consumer),
        );
      }
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!identity) return;
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCustomerService(reply, () =>
        options.customerService!.listQueue(identity, request.query.status),
      );
    },
  );

  app.get<{ Params: { conversationId: string } }>(
    '/api/v1/customer-service/conversations/:conversationId',
    async (request, reply) => {
      const consumer = tryConsumerIdentity(options, request.headers.authorization);
      if (consumer) {
        if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleCustomerService(reply, () =>
          options.customerService!.getConsumerConversation(consumer, request.params.conversationId),
        );
      }
      const staff = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!staff) return;
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCustomerService(reply, () =>
        options.customerService!.getConversation(staff, request.params.conversationId),
      );
    },
  );

  app.get<{ Params: { conversationId: string } }>(
    '/api/v1/customer-service/conversations/:conversationId/messages',
    async (request, reply) => {
      const consumer = tryConsumerIdentity(options, request.headers.authorization);
      if (consumer) {
        if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleCustomerService(reply, () =>
          options.customerService!.listConsumerMessages(consumer, request.params.conversationId),
        );
      }
      const staff = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!staff) return;
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCustomerService(reply, () =>
        options.customerService!.listMessages(staff, request.params.conversationId),
      );
    },
  );

  app.post<{ Params: { conversationId: string } }>(
    '/api/v1/customer-service/conversations/:conversationId/messages',
    async (request, reply) => {
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const consumer = tryConsumerIdentity(options, request.headers.authorization);
      if (consumer) {
        return handleCustomerService(reply, async () =>
          reply.code(201).send(
            await options.customerService!.sendCustomerMessage({
              identity: consumer,
              idempotencyKey,
              traceId: request.id,
              body: objectBody(request.body, { conversationId: request.params.conversationId }),
            }),
          ),
        );
      }
      const staff = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.send',
        { write: true },
      );
      if (!staff) return;
      return handleCustomerService(reply, async () =>
        reply.code(201).send(
          await options.customerService!.sendEmployeeMessage({
            identity: staff,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { conversationId: request.params.conversationId }),
          }),
        ),
      );
    },
  );

  app.get<{ Params: { conversationId: string; messageId: string } }>(
    '/api/v1/customer-service/conversations/:conversationId/messages/:messageId/content',
    async (request, reply) => {
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const consumer = tryConsumerIdentity(options, request.headers.authorization);
      if (consumer)
        return handleCustomerService(reply, () =>
          options.customerService!.getConsumerMessageContent(
            consumer,
            request.params.conversationId,
            request.params.messageId,
          ),
        );
      const staff = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!staff) return;
      return handleCustomerService(reply, () =>
        options.customerService!.getStaffMessageContent(
          staff,
          request.params.conversationId,
          request.params.messageId,
          request.id,
        ),
      );
    },
  );

  app.post<{ Params: { conversationId: string } }>(
    '/api/v1/customer-service/conversations/:conversationId/actions/request-human',
    async (request, reply) => {
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCustomerService(reply, async () =>
        reply.code(202).send(
          await options.customerService!.requestHuman({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { conversationId: request.params.conversationId }),
          }),
        ),
      );
    },
  );

  for (const action of ['accept', 'return-to-ai', 'close'] as const) {
    app.post<{ Params: { conversationId: string } }>(
      `/api/v1/customer-service/conversations/:conversationId/actions/${action}`,
      async (request, reply) => {
        const permission =
          action === 'accept'
            ? 'customer_service.accept'
            : action === 'close'
              ? 'customer_service.close'
              : 'customer_service.send';
        const identity = await authorizedIdentity(
          options,
          request.headers.authorization,
          reply,
          permission,
          { write: true },
        );
        if (!identity) return;
        const idempotencyKey = headerValue(request.headers['idempotency-key']);
        if (!idempotencyKey || idempotencyKey.length > 255)
          return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
        if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        const method = action === 'accept' ? 'accept' : action === 'close' ? 'close' : 'returnToAi';
        return handleCustomerService(reply, () =>
          options.customerService![method]({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { conversationId: request.params.conversationId }),
          }),
        );
      },
    );
  }

  app.get('/api/v1/customer-profile', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCustomerService(reply, () => options.customerService!.getProfile(identity));
  });

  app.post('/api/v1/customer-profile/consents', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCustomerService(reply, () =>
      options.customerService!.changeConsent({
        identity,
        idempotencyKey,
        traceId: request.id,
        body: request.body,
      }),
    );
  });

  app.post('/api/v1/customer-profile/privacy-requests', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCustomerService(reply, async () =>
      reply.code(202).send(
        await options.customerService!.requestPrivacy({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Querystring: { storeId?: string } }>(
    '/api/v1/customer-service/knowledge-publications',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant_profile.manage',
      );
      if (!identity) return;
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCustomerService(reply, () =>
        options.customerService!.listKnowledge(identity, request.query.storeId),
      );
    },
  );

  app.post('/api/v1/customer-service/knowledge-publications', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant_profile.manage',
      { write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCustomerService(reply, async () =>
      reply.code(201).send(
        await options.customerService!.publishKnowledge({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post<{ Params: { publicationId: string } }>(
    '/api/v1/customer-service/knowledge-publications/:publicationId/actions/revoke',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant_profile.manage',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.customerService) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCustomerService(reply, () =>
        options.customerService!.revokeKnowledge({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { publicationId: request.params.publicationId }),
        }),
      );
    },
  );

  app.post('/internal/v1/customer-service/ai-jobs/process', async (request, reply) => {
    if (!options.internalWorkerToken || !options.customerServiceAi)
      return reply.code(503).send({ code: 'AI_WORKER_UNAVAILABLE' });
    if (!validInternalBearer(options.internalWorkerToken, request.headers.authorization))
      return reply.code(401).send({ code: 'INVALID_WORKER_IDENTITY' });
    try {
      return reply
        .code(202)
        .send(
          await options.customerServiceAi.process(
            request.body as Parameters<CustomerServiceAiOrchestrator['process']>[0],
          ),
        );
    } catch (error) {
      if (error instanceof CustomerServiceAiSecurityError)
        return reply.code(202).send({ status: 'HANDOFF' });
      if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      throw error;
    }
  });

  app.post('/api/v1/mini-program-authorizations/actions/activate', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'miniprogram.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMiniProgram(reply, async () =>
      reply.code(201).send(
        await options.miniPrograms!.activateAuthorization({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Params: { miniProgramId: string } }>(
    '/api/v1/mini-programs/:miniProgramId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'miniprogram.manage',
      );
      if (!identity) return;
      if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMiniProgram(reply, () =>
        options.miniPrograms!.get(identity, request.params.miniProgramId),
      );
    },
  );

  app.post<{ Params: { miniProgramId: string } }>(
    '/api/v1/mini-programs/:miniProgramId/releases',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'miniprogram.manage',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMiniProgram(reply, async () =>
        reply.code(202).send(
          await options.miniPrograms!.createPreview({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { miniProgramId: request.params.miniProgramId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { miniProgramId: string; releaseId: string } }>(
    '/api/v1/mini-programs/:miniProgramId/releases/:releaseId/actions/confirm-preview',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'miniprogram.manage',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMiniProgram(reply, () =>
        options.miniPrograms!.confirmPreview({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, {
            miniProgramId: request.params.miniProgramId,
            releaseId: request.params.releaseId,
          }),
        }),
      );
    },
  );

  for (const action of ['submit-review', 'publish'] as const) {
    app.post<{ Params: { miniProgramId: string; releaseId: string } }>(
      `/api/v1/mini-programs/:miniProgramId/releases/:releaseId/actions/${action}`,
      async (request, reply) => {
        const permission =
          action === 'submit-review' ? 'miniprogram.release.submit' : 'miniprogram.release.publish';
        const identity = await authorizedIdentity(
          options,
          request.headers.authorization,
          reply,
          permission,
          { mfaRequired: true, write: true },
        );
        if (!identity) return;
        const idempotencyKey = headerValue(request.headers['idempotency-key']);
        if (!idempotencyKey || idempotencyKey.length > 255)
          return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
        if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        const command = {
          identity,
          idempotencyKey,
          traceId: request.id,
          body: {
            miniProgramId: request.params.miniProgramId,
            releaseId: request.params.releaseId,
          },
        };
        return handleMiniProgram(reply, async () =>
          reply
            .code(202)
            .send(
              await options.miniPrograms![action === 'submit-review' ? 'submitReview' : 'publish'](
                command,
              ),
            ),
        );
      },
    );
  }

  app.post<{ Params: { miniProgramId: string } }>(
    '/api/v1/mini-programs/:miniProgramId/actions/rollback',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'miniprogram.release.rollback',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMiniProgram(reply, async () =>
        reply.code(202).send(
          await options.miniPrograms!.rollback({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { miniProgramId: request.params.miniProgramId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { miniProgramId: string; releaseId: string } }>(
    '/api/v1/mini-programs/:miniProgramId/releases/:releaseId/rollout-health',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'miniprogram.release.publish',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.miniPrograms) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMiniProgram(reply, () =>
        options.miniPrograms!.recordRolloutHealth({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, {
            miniProgramId: request.params.miniProgramId,
            releaseId: request.params.releaseId,
          }),
        }),
      );
    },
  );

  app.post<{
    Querystring: { msg_signature?: string; timestamp?: string; nonce?: string };
  }>('/api/v1/webhooks/wechat/mini-program', async (request, reply) => {
    const { msg_signature: signature, timestamp, nonce } = request.query;
    if (!signature || !timestamp || !nonce || typeof request.body !== 'string')
      return reply.code(400).send({ code: 'INVALID_MINI_PROGRAM_CALLBACK' });
    if (!options.miniProgramCallback) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    try {
      await options.miniProgramCallback.receive({
        signature,
        timestamp,
        nonce,
        xml: request.body,
        traceId: request.id,
      });
      return reply.type('text/plain').send('success');
    } catch (error) {
      if (error instanceof MiniProgramCallbackAuthenticationError)
        return reply.code(401).send({ code: 'INVALID_MINI_PROGRAM_SIGNATURE' });
      if (error instanceof MiniProgramCallbackUnavailableError)
        return reply.code(503).send({ code: 'MINI_PROGRAM_CALLBACK_UNAVAILABLE' });
      if (error instanceof MiniProgramCallbackConflictError)
        return reply.code(409).send({ code: 'MINI_PROGRAM_CALLBACK_CONFLICT' });
      throw error;
    }
  });

  app.get('/api/v1/consumer/storefront', async (request, reply) => {
    if (!options.consumerCatalog) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handleConsumerCatalog(reply, () => options.consumerCatalog!.getStorefront(identity));
  });

  app.get('/api/v1/consumer/membership', async (request, reply) => {
    if (!options.consumerCatalog) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handleConsumerCatalog(reply, () => options.consumerCatalog!.getMembership(identity));
  });

  app.get('/api/v1/consumer/stores', async (request, reply) => {
    if (!options.consumerStoreSwitch) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handleConsumerStoreSwitch(reply, () => options.consumerStoreSwitch!.list(identity));
  });

  app.post('/api/v1/consumer/session/actions/switch-store', async (request, reply) => {
    if (!options.consumerStoreSwitch) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    return handleConsumerStoreSwitch(reply, () =>
      options.consumerStoreSwitch!.switch({
        identity,
        idempotencyKey,
        body: request.body,
      }),
    );
  });

  app.get<{
    Querystring: { productType?: string; query?: string; limit?: string; offset?: string };
  }>('/api/v1/consumer/products', async (request, reply) => {
    if (!options.consumerCatalog) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handleConsumerCatalog(reply, () =>
      options.consumerCatalog!.listProducts(identity, request.query),
    );
  });

  app.get<{ Params: { productId: string } }>(
    '/api/v1/consumer/products/:productId',
    async (request, reply) => {
      if (!options.consumerCatalog) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handleConsumerCatalog(reply, () =>
        options.consumerCatalog!.getProduct(identity, request.params.productId),
      );
    },
  );

  app.get<{ Params: { productId: string } }>(
    '/api/v1/consumer/products/:productId/trace-report',
    async (request, reply) => {
      if (!options.consumerCatalog) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handleConsumerCatalog(reply, () =>
        options.consumerCatalog!.getTraceReport(identity, request.params.productId),
      );
    },
  );

  app.get('/api/v1/life/cart', async (request, reply) => {
    if (!options.platformCart) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformCart(reply, () => options.platformCart!.get(identity));
  });

  app.get('/api/v1/life/discovery/stores', async (request, reply) => {
    if (!options.platformDiscovery) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    try {
      return await options.platformDiscovery.listStores(identity, request.query);
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (error instanceof PlatformDiscoveryAuthenticationError)
        return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
      throw error;
    }
  });

  app.get('/api/v1/life/discovery/products', async (request, reply) => {
    if (!options.platformDiscovery) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    try {
      return await options.platformDiscovery.listProducts(identity, request.query);
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (error instanceof PlatformDiscoveryAuthenticationError)
        return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
      throw error;
    }
  });

  app.get<{ Params: { productId: string } }>(
    '/api/v1/life/discovery/products/:productId',
    async (request, reply) => {
      if (!options.platformDiscovery?.getProduct)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      try {
        return await options.platformDiscovery.getProduct(identity, request.params.productId);
      } catch (error) {
        if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
        if (error instanceof PlatformDiscoveryAuthenticationError)
          return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
        if (error instanceof PlatformDiscoveryNotFoundError)
          return reply.code(404).send({ code: 'PRODUCT_NOT_FOUND' });
        throw error;
      }
    },
  );

  app.get<{ Params: { productId: string } }>(
    '/api/v1/life/discovery/products/:productId/trace-report',
    async (request, reply) => {
      if (!options.platformDiscovery?.getTraceReport)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      try {
        return await options.platformDiscovery.getTraceReport(identity, request.params.productId);
      } catch (error) {
        if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
        if (error instanceof PlatformDiscoveryAuthenticationError)
          return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
        if (error instanceof PlatformDiscoveryNotFoundError)
          return reply.code(404).send({ code: 'TRACE_REPORT_NOT_FOUND' });
        throw error;
      }
    },
  );

  app.get('/api/v1/life/addresses', async (request, reply) => {
    if (!options.platformAddresses) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformAddress(reply, () => options.platformAddresses!.list(identity));
  });

  app.get('/api/v1/life/invoice-profiles', async (request, reply) => {
    if (!options.platformInvoiceProfiles)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformInvoiceProfile(reply, () =>
      options.platformInvoiceProfiles!.list(identity),
    );
  });

  app.put('/api/v1/life/invoice-profiles', async (request, reply) => {
    if (!options.platformInvoiceProfiles)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformInvoiceProfile(reply, () =>
      options.platformInvoiceProfiles!.save(identity, request.body),
    );
  });

  app.delete<{ Params: { profileId: string } }>(
    '/api/v1/life/invoice-profiles/:profileId',
    async (request, reply) => {
      if (!options.platformInvoiceProfiles)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformInvoiceProfile(reply, async () => {
        await options.platformInvoiceProfiles!.archive(identity, request.params.profileId);
        return reply.code(204).send();
      });
    },
  );

  app.put('/api/v1/life/addresses', async (request, reply) => {
    if (!options.platformAddresses) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformAddress(reply, () =>
      options.platformAddresses!.save(identity, request.body),
    );
  });

  app.delete<{ Params: { addressId: string } }>(
    '/api/v1/life/addresses/:addressId',
    async (request, reply) => {
      if (!options.platformAddresses) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformAddress(reply, async () => {
        await options.platformAddresses!.archive(identity, request.params.addressId);
        return reply.code(204).send();
      });
    },
  );

  app.put('/api/v1/life/cart/items', async (request, reply) => {
    if (!options.platformCart) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformCart(reply, () => options.platformCart!.setItem(identity, request.body));
  });

  app.delete<{ Params: { itemId: string } }>(
    '/api/v1/life/cart/items/:itemId',
    async (request, reply) => {
      if (!options.platformCart) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformCart(reply, () =>
        options.platformCart!.removeItem(identity, request.params.itemId),
      );
    },
  );

  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/api/v1/life/orders',
    async (request, reply) => {
      if (!options.platformOrders) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformOrders(reply, () =>
        options.platformOrders!.list(identity, request.query),
      );
    },
  );

  app.post('/api/v1/life/checkouts/quote', async (request, reply) => {
    if (!options.platformCheckout) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    return handlePlatformCheckout(reply, async () =>
      reply.code(201).send(
        await options.platformCheckout!.quote({
          identity,
          idempotencyKey,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Params: { checkoutId: string } }>(
    '/api/v1/life/checkouts/:checkoutId',
    async (request, reply) => {
      if (!options.platformCheckout) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformCheckout(reply, () =>
        options.platformCheckout!.get(identity, request.params.checkoutId),
      );
    },
  );

  app.post<{ Params: { checkoutId: string } }>(
    '/api/v1/life/checkouts/:checkoutId/actions/submit',
    async (request, reply) => {
      if (!options.platformCheckout) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      return handlePlatformCheckout(reply, async () =>
        reply.code(202).send(
          await options.platformCheckout!.submit({
            identity,
            idempotencyKey,
            checkoutId: request.params.checkoutId,
          }),
        ),
      );
    },
  );

  app.get('/api/v1/merchant-consumer/cart', async (request, reply) => {
    if (!options.merchantConsumerJourney)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const consumer = consumerIdentity(options, request.headers.authorization, reply);
    if (!consumer) return;
    const life = lifeConsumerIdentity(
      options,
      headerValue(request.headers['x-life-authorization']),
      reply,
    );
    if (!life) return;
    return handleMerchantConsumerJourney(reply, () =>
      options.merchantConsumerJourney!.getCart({ consumer, life }),
    );
  });

  app.put('/api/v1/merchant-consumer/cart/items', async (request, reply) => {
    if (!options.merchantConsumerJourney)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const consumer = consumerIdentity(options, request.headers.authorization, reply);
    if (!consumer) return;
    const life = lifeConsumerIdentity(
      options,
      headerValue(request.headers['x-life-authorization']),
      reply,
    );
    if (!life) return;
    return handleMerchantConsumerJourney(reply, () =>
      options.merchantConsumerJourney!.setCartItem({ consumer, life }, request.body),
    );
  });

  app.delete<{ Params: { itemId: string } }>(
    '/api/v1/merchant-consumer/cart/items/:itemId',
    async (request, reply) => {
      if (!options.merchantConsumerJourney)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const consumer = consumerIdentity(options, request.headers.authorization, reply);
      if (!consumer) return;
      const life = lifeConsumerIdentity(
        options,
        headerValue(request.headers['x-life-authorization']),
        reply,
      );
      if (!life) return;
      return handleMerchantConsumerJourney(reply, () =>
        options.merchantConsumerJourney!.removeCartItem({ consumer, life }, request.params.itemId),
      );
    },
  );

  app.post('/api/v1/merchant-consumer/checkouts/quote', async (request, reply) => {
    if (!options.merchantConsumerJourney)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const consumer = consumerIdentity(options, request.headers.authorization, reply);
    if (!consumer) return;
    const life = lifeConsumerIdentity(
      options,
      headerValue(request.headers['x-life-authorization']),
      reply,
    );
    if (!life) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    return handleMerchantConsumerJourney(reply, async () =>
      reply.code(201).send(
        await options.merchantConsumerJourney!.quote({
          consumer,
          life,
          idempotencyKey,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Params: { checkoutId: string } }>(
    '/api/v1/merchant-consumer/checkouts/:checkoutId',
    async (request, reply) => {
      if (!options.merchantConsumerJourney)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const consumer = consumerIdentity(options, request.headers.authorization, reply);
      if (!consumer) return;
      const life = lifeConsumerIdentity(
        options,
        headerValue(request.headers['x-life-authorization']),
        reply,
      );
      if (!life) return;
      return handleMerchantConsumerJourney(reply, () =>
        options.merchantConsumerJourney!.getCheckout({ consumer, life }, request.params.checkoutId),
      );
    },
  );

  app.post<{ Params: { checkoutId: string } }>(
    '/api/v1/merchant-consumer/checkouts/:checkoutId/actions/submit',
    async (request, reply) => {
      if (!options.merchantConsumerJourney)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const consumer = consumerIdentity(options, request.headers.authorization, reply);
      if (!consumer) return;
      const life = lifeConsumerIdentity(
        options,
        headerValue(request.headers['x-life-authorization']),
        reply,
      );
      if (!life) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      return handleMerchantConsumerJourney(reply, async () =>
        reply.code(202).send(
          await options.merchantConsumerJourney!.submitCheckout({
            consumer,
            life,
            idempotencyKey,
            checkoutId: request.params.checkoutId,
          }),
        ),
      );
    },
  );

  app.get<{ Params: { orderId: string } }>(
    '/api/v1/life/orders/:orderId',
    async (request, reply) => {
      if (!options.platformOrders) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformOrders(reply, () =>
        options.platformOrders!.get(identity, request.params.orderId),
      );
    },
  );

  app.get<{ Params: { orderId: string } }>(
    '/api/v1/life/orders/:orderId/aftercare',
    async (request, reply) => {
      if (!options.platformAftercare) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformAftercare(reply, () =>
        options.platformAftercare!.getOrder(identity, request.params.orderId),
      );
    },
  );

  app.post<{ Params: { orderId: string } }>(
    '/api/v1/life/orders/:orderId/refunds',
    async (request, reply) => {
      if (!options.platformAftercare) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      return handlePlatformAftercare(reply, async () =>
        reply.code(202).send(
          await options.platformAftercare!.requestRefund({
            identity,
            orderId: request.params.orderId,
            idempotencyKey,
            traceId: request.id,
            body: request.body,
          }),
        ),
      );
    },
  );

  app.get<{ Params: { orderId: string } }>(
    '/api/v1/life/orders/:orderId/verification-entitlements',
    async (request, reply) => {
      if (!options.platformAftercare) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      return handlePlatformAftercare(reply, () =>
        options.platformAftercare!.listEntitlements(identity, request.params.orderId),
      );
    },
  );

  app.get('/api/v1/life/verification-entitlements', async (request, reply) => {
    if (!options.platformAftercare) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformAftercare(reply, () =>
      options.platformAftercare!.listAvailableEntitlements(identity),
    );
  });

  app.get<{ Querystring: { limit?: string } }>('/api/v1/life/rewards', async (request, reply) => {
    if (!options.platformAftercare) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    return handlePlatformAftercare(reply, () =>
      options.platformAftercare!.listRewards(identity, request.query),
    );
  });

  app.post('/api/v1/orders', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.commerceOrders) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCommerce(reply, async () =>
      reply.code(201).send(
        await options.commerceOrders!.create({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/api/v1/orders',
    async (request, reply) => {
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      if (!options.commerceOrders) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, () =>
        options.commerceOrders!.listForConsumer(identity, request.query),
      );
    },
  );

  app.get<{ Params: { orderId: string } }>('/api/v1/orders/:orderId', async (request, reply) => {
    if (!options.commerceOrders) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const consumer = tryConsumerIdentity(options, request.headers.authorization);
    if (consumer)
      return handleCommerce(reply, () =>
        options.commerceOrders!.getForConsumer(consumer, request.params.orderId),
      );
    const staff = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'order.read',
    );
    if (!staff) return;
    return handleCommerce(reply, () =>
      options.commerceOrders!.getForStaff(staff, request.params.orderId),
    );
  });

  app.post('/api/v1/payment-intents', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.commercePayments) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCommerce(reply, async () =>
      reply.code(202).send(
        await options.commercePayments!.createIntent({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post('/api/v1/life/payment-intents', async (request, reply) => {
    if (!options.platformPayments) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    const identity = lifeConsumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    return handlePlatformPayment(reply, async () =>
      reply.code(202).send(
        await options.platformPayments!.create({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post<{ Params: { provider: string } }>(
    '/api/v1/webhooks/payments/:provider',
    async (request, reply) => {
      if (!options.commercePayments) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const signature = headerValue(request.headers['x-payment-signature']);
      const rawBody =
        typeof request.body === 'string' ? request.body : paymentCallbackRawBodies.get(request.raw);
      if (!signature || !rawBody) return reply.code(400).send({ code: 'INVALID_PAYMENT_CALLBACK' });
      return handleCommerce(reply, async () =>
        reply.send(
          await options.commercePayments!.receiveCallback({
            provider: request.params.provider,
            signature,
            rawBody,
            traceId: request.id,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { orderId: string } }>(
    '/api/v1/orders/:orderId/refunds',
    async (request, reply) => {
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.commerceRefunds) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, async () =>
        reply.code(202).send(
          await options.commerceRefunds!.request({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { orderId: request.params.orderId }),
          }),
        ),
      );
    },
  );

  app.get<{ Params: { orderId: string } }>(
    '/api/v1/orders/:orderId/refunds',
    async (request, reply) => {
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      if (!options.commerceRefunds) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, () =>
        options.commerceRefunds!.listForConsumer(identity, request.params.orderId),
      );
    },
  );

  app.post<{ Params: { refundId: string } }>(
    '/api/v1/refunds/:refundId/actions/approve',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'refund.approve',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.commerceRefunds) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, () =>
        options.commerceRefunds!.approve({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { refundId: request.params.refundId }),
        }),
      );
    },
  );

  app.get<{ Params: { orderId: string } }>(
    '/api/v1/orders/:orderId/verification-entitlements',
    async (request, reply) => {
      const identity = consumerIdentity(options, request.headers.authorization, reply);
      if (!identity) return;
      if (!options.commerceVerification)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, () =>
        options.commerceVerification!.listConsumerTokens(identity, request.params.orderId),
      );
    },
  );

  app.get('/api/v1/verification-entitlements', async (request, reply) => {
    const identity = consumerIdentity(options, request.headers.authorization, reply);
    if (!identity) return;
    if (!options.commerceVerification) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCommerce(reply, () =>
      options.commerceVerification!.listAvailableForConsumer(identity),
    );
  });

  app.post('/api/v1/verification-uses', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'verification.execute',
      { write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.commerceVerification) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCommerce(reply, async () =>
      reply.code(201).send(
        await options.commerceVerification!.use({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  for (const route of [
    ['subscription', 'getSubscription'],
    ['plans', 'listPlans'],
  ] as const) {
    app.get(`/api/v1/revenue-operations/${route[0]}`, async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'report.value.read',
      );
      if (!identity) return;
      if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueOperations(reply, () => options.revenueOperations![route[1]](identity));
    });
  }

  for (const route of [
    ['usage', 'listUsage', 'report.value.read'],
    ['summary', 'getSummary', 'report.value.read'],
    ['statements', 'listStatements', 'distribution.read_all'],
    ['policies', 'listPolicies', 'distribution.read_all'],
    ['costs', 'listCosts', 'distribution.cost.read'],
  ] as const) {
    app.get(`/api/v1/revenue-operations/${route[0]}`, async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        route[2],
      );
      if (!identity) return;
      if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueOperations(reply, () =>
        options.revenueOperations![route[1]](identity, request.query),
      );
    });
  }

  app.get<{ Params: { statementId: string } }>(
    '/api/v1/revenue-operations/statements/:statementId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'distribution.read_all',
      );
      if (!identity) return;
      if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueOperations(reply, () =>
        options.revenueOperations!.getStatement(identity, request.params.statementId),
      );
    },
  );

  app.get('/api/v1/revenue-operations/disputes', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'distribution.cost.read',
    );
    if (!identity) return;
    if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleRevenueOperations(reply, () =>
      options.revenueOperations!.listDisputes(identity, request.query),
    );
  });

  app.get<{ Params: { costEntryId: string } }>(
    '/api/v1/revenue-operations/costs/:costEntryId/evidence',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'distribution.cost.read',
      );
      if (!identity) return;
      if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleRevenueOperations(reply, () =>
        options.revenueOperations!.getCostEvidence(
          identity,
          request.params.costEntryId,
          request.id,
        ),
      );
    },
  );

  app.post('/api/v1/revenue-operations/disputes', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'distribution.cost.read',
      { write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleRevenueOperations(reply, async () =>
      reply.code(201).send(
        await options.revenueOperations!.createDispute({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.get('/api/v1/revenue-operations/rights', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'revenue_right.read_all',
    );
    if (!identity) return;
    if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleRevenueOperations(reply, () =>
      options.revenueOperations!.listRights(identity, request.query),
    );
  });

  app.get('/api/v1/revenue-operations/transfers', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'revenue_right.read_all',
    );
    if (!identity) return;
    if (!options.revenueOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleRevenueOperations(reply, () =>
      options.revenueOperations!.listTransfers(identity, request.query),
    );
  });

  app.get('/api/v1/sales/opportunities', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant.intake.read',
    );
    if (!identity) return;
    if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleSalesLifecycle(reply, () => options.salesLifecycle!.list(identity, request.query));
  });

  app.get<{ Params: { opportunityId: string } }>(
    '/api/v1/sales/opportunities/:opportunityId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.read',
      );
      if (!identity) return;
      if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSalesLifecycle(reply, () =>
        options.salesLifecycle!.get(identity, request.params.opportunityId),
      );
    },
  );

  app.post('/api/v1/sales/opportunities', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant.intake.create',
      { write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleSalesLifecycle(reply, async () =>
      reply.code(201).send(
        await options.salesLifecycle!.create({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post<{ Params: { opportunityId: string } }>(
    '/api/v1/sales/opportunities/:opportunityId/actions/check-duplicates',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.write',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSalesLifecycle(reply, () =>
        options.salesLifecycle!.checkDuplicates({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { opportunityId: request.params.opportunityId }),
        }),
      );
    },
  );

  app.post<{ Params: { opportunityId: string } }>(
    '/api/v1/sales/opportunities/:opportunityId/quotes',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.write',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSalesLifecycle(reply, async () =>
        reply.code(201).send(
          await options.salesLifecycle!.createQuote({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { opportunityId: request.params.opportunityId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { opportunityId: string } }>(
    '/api/v1/sales/opportunities/:opportunityId/contracts',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.confirm',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSalesLifecycle(reply, async () =>
        reply.code(201).send(
          await options.salesLifecycle!.createContract({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { opportunityId: request.params.opportunityId }),
          }),
        ),
      );
    },
  );

  app.post<{ Params: { contractId: string } }>(
    '/api/v1/sales/contracts/:contractId/actions/sign',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.confirm',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSalesLifecycle(reply, () =>
        options.salesLifecycle!.signContract({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { contractId: request.params.contractId }),
        }),
      );
    },
  );

  app.post<{ Params: { contractId: string } }>(
    '/api/v1/sales/contracts/:contractId/collections',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'finance.reconcile',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.salesLifecycle) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSalesLifecycle(reply, async () =>
        reply.code(201).send(
          await options.salesLifecycle!.recordCollection({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: objectBody(request.body, { contractId: request.params.contractId }),
          }),
        ),
      );
    },
  );

  app.get('/api/v1/subscription-lifecycle/changes', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant.intake.read',
    );
    if (!identity) return;
    if (!options.subscriptionLifecycle)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleSubscriptionLifecycle(reply, () =>
      options.subscriptionLifecycle!.listChanges(identity, request.query),
    );
  });

  app.get<{ Params: { changeId: string } }>(
    '/api/v1/subscription-lifecycle/changes/:changeId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.read',
      );
      if (!identity) return;
      if (!options.subscriptionLifecycle)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSubscriptionLifecycle(reply, () =>
        options.subscriptionLifecycle!.getChange(identity, request.params.changeId),
      );
    },
  );

  app.post('/api/v1/subscription-lifecycle/changes', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant.intake.write',
      { write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.subscriptionLifecycle)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleSubscriptionLifecycle(reply, async () =>
      reply.code(202).send(
        await options.subscriptionLifecycle!.requestChange({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post<{ Params: { changeId: string } }>(
    '/api/v1/subscription-lifecycle/changes/:changeId/actions/decide',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.confirm',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.subscriptionLifecycle)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSubscriptionLifecycle(reply, () =>
        options.subscriptionLifecycle!.decideChange({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { changeId: request.params.changeId }),
        }),
      );
    },
  );

  app.post<{ Params: { changeId: string }; Body: { tenantId?: string } }>(
    '/api/v1/internal/subscription-lifecycle/changes/:changeId/actions/apply',
    async (request, reply) => {
      if (
        !options.internalWorkerToken ||
        !validInternalBearer(options.internalWorkerToken, request.headers.authorization)
      )
        return reply.code(401).send({ code: 'INVALID_INTERNAL_WORKER' });
      if (!request.body?.tenantId) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.subscriptionLifecycle)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSubscriptionLifecycle(reply, () =>
        options.subscriptionLifecycle!.applyApproved({
          tenantId: request.body.tenantId!,
          changeId: request.params.changeId,
          traceId: request.id,
        }),
      );
    },
  );

  app.get('/api/v1/subscription-lifecycle/renewal-previews', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'report.value.read',
    );
    if (!identity) return;
    if (!options.subscriptionLifecycle)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleSubscriptionLifecycle(reply, () =>
      options.subscriptionLifecycle!.listPreviews(identity, request.query),
    );
  });

  app.get<{ Params: { previewId: string } }>(
    '/api/v1/subscription-lifecycle/renewal-previews/:previewId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'report.value.read',
      );
      if (!identity) return;
      if (!options.subscriptionLifecycle)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSubscriptionLifecycle(reply, () =>
        options.subscriptionLifecycle!.getPreview(identity, request.params.previewId),
      );
    },
  );

  app.post(
    '/api/v1/subscription-lifecycle/renewal-previews/actions/generate',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'report.value.read',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.subscriptionLifecycle)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSubscriptionLifecycle(reply, async () =>
        reply.code(201).send(
          await options.subscriptionLifecycle!.generatePreview({
            identity,
            idempotencyKey,
            traceId: request.id,
            body: request.body,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { previewId: string } }>(
    '/api/v1/subscription-lifecycle/renewal-previews/:previewId/actions/change-status',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'merchant.intake.write',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.subscriptionLifecycle)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSubscriptionLifecycle(reply, () =>
        options.subscriptionLifecycle!.updatePreviewStatus({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { previewId: request.params.previewId }),
        }),
      );
    },
  );

  app.get('/api/v1/organization/members', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'member.manage',
    );
    if (!identity) return;
    if (!options.organizationGovernance)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleOrganizationGovernance(reply, () =>
      options.organizationGovernance!.listMembers(identity, request.query),
    );
  });

  app.get('/api/v1/organization/authorization-catalog', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'role.manage',
      { mfaRequired: true },
    );
    if (!identity) return;
    if (!options.organizationGovernance)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleOrganizationGovernance(reply, () =>
      options.organizationGovernance!.getAuthorizationCatalog(identity),
    );
  });

  app.post('/api/v1/organization/role-assignments', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'role.manage',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.organizationGovernance)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleOrganizationGovernance(reply, async () =>
      reply.code(201).send(
        await options.organizationGovernance!.assignRole({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post<{ Params: { assignmentId: string } }>(
    '/api/v1/organization/role-assignments/:assignmentId/actions/revoke',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'role.manage',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.organizationGovernance)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleOrganizationGovernance(reply, () =>
        options.organizationGovernance!.revokeRole({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: { assignmentId: request.params.assignmentId },
        }),
      );
    },
  );

  app.post<{ Params: { userId: string } }>(
    '/api/v1/organization/members/:userId/actions/change-status',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'member.manage',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.organizationGovernance)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleOrganizationGovernance(reply, () =>
        options.organizationGovernance!.changeMemberStatus({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: objectBody(request.body, { userId: request.params.userId }),
        }),
      );
    },
  );

  app.get('/api/v1/organization/audit-logs', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'audit.read',
    );
    if (!identity) return;
    if (!options.organizationGovernance)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleOrganizationGovernance(reply, () =>
      options.organizationGovernance!.listAudit(identity, request.query),
    );
  });

  app.get('/api/v1/organization/privacy-requests', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'customer_profile.export',
      { mfaRequired: true },
    );
    if (!identity) return;
    if (!options.organizationGovernance)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleOrganizationGovernance(reply, () =>
      options.organizationGovernance!.listPrivacyRequests(identity, request.query),
    );
  });

  app.get('/api/v1/organization/notifications', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'customer_service.read',
    );
    if (!identity) return;
    if (!options.organizationGovernance)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleOrganizationGovernance(reply, () =>
      options.organizationGovernance!.listNotifications(identity, request.query),
    );
  });

  app.get('/api/v1/merchant-operations/profile', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant_profile.manage',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.getMerchantProfile(identity),
    );
  });

  app.get('/api/v1/merchant-operations/stores', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant_profile.manage',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () => options.merchantOperations!.listStores(identity));
  });

  app.get('/api/v1/merchant-operations/products', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'merchant_profile.manage',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.listProducts(identity, request.query),
    );
  });

  app.post<{ Params: { productId: string } }>(
    '/api/v1/merchant-operations/products/:productId/actions/publish',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'order.manage',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const key = headerValue(request.headers['idempotency-key']);
      if (!key) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMerchantOperations(reply, () =>
        options.merchantOperations!.publishProduct(
          identity,
          request.params.productId,
          key,
          request.id,
          request.body,
        ),
      );
    },
  );

  app.get('/api/v1/merchant-operations/orders', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'order.read',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.listOrders(identity, request.query),
    );
  });

  app.get<{ Params: { orderId: string } }>(
    '/api/v1/merchant-operations/orders/:orderId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'order.read',
      );
      if (!identity) return;
      if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMerchantOperations(reply, () =>
        options.merchantOperations!.getOrder(identity, request.params.orderId),
      );
    },
  );

  app.get('/api/v1/merchant-operations/refunds', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'order.read',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.listRefunds(identity, request.query),
    );
  });

  app.get('/api/v1/merchant-operations/verification-uses', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'order.read',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.listVerificationUses(identity, request.query),
    );
  });

  app.get('/api/v1/merchant-operations/reconciliations', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'finance.reconcile',
      { mfaRequired: true },
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.listReconciliations(identity, request.query),
    );
  });

  app.get('/api/v1/merchant-operations/customers', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'customer_service.read',
    );
    if (!identity) return;
    if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleMerchantOperations(reply, () =>
      options.merchantOperations!.listCustomers(identity, request.query),
    );
  });

  app.get<{ Params: { customerId: string } }>(
    '/api/v1/merchant-operations/customers/:customerId',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!identity) return;
      if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMerchantOperations(reply, () =>
        options.merchantOperations!.getCustomer(identity, request.params.customerId),
      );
    },
  );

  app.get<{ Params: { customerId: string } }>(
    '/api/v1/merchant-operations/customers/:customerId/rewards',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'customer_service.read',
      );
      if (!identity) return;
      if (!options.merchantOperations) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleMerchantOperations(reply, () =>
        options.merchantOperations!.listCustomerRewards(identity, request.params.customerId),
      );
    },
  );

  app.post('/api/v1/commerce-reconciliations', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'finance.reconcile',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    if (!options.commerceReconciliation)
      return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleCommerce(reply, async () =>
      reply.code(201).send(
        await options.commerceReconciliation!.run({
          identity,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });

  app.post<{ Params: { orderId: string }; Body: { tenantId?: string } }>(
    '/api/v1/internal/commerce/orders/:orderId/actions/expire',
    async (request, reply) => {
      if (
        !options.internalWorkerToken ||
        !validInternalBearer(options.internalWorkerToken, request.headers.authorization)
      )
        return reply.code(401).send({ code: 'INVALID_INTERNAL_WORKER' });
      if (!request.body?.tenantId) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.commerceOrders) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, () =>
        options.commerceOrders!.expire({
          tenantId: request.body.tenantId!,
          orderId: request.params.orderId,
          traceId: request.id,
        }),
      );
    },
  );

  app.post<{ Params: { refundId: string }; Body: { tenantId?: string } }>(
    '/api/v1/internal/commerce/refunds/:refundId/actions/submit',
    async (request, reply) => {
      if (
        !options.internalWorkerToken ||
        !validInternalBearer(options.internalWorkerToken, request.headers.authorization)
      )
        return reply.code(401).send({ code: 'INVALID_INTERNAL_WORKER' });
      if (!request.body?.tenantId) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.commerceRefunds) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleCommerce(reply, async () =>
        reply.code(202).send(
          await options.commerceRefunds!.submit({
            tenantId: request.body.tenantId!,
            refundId: request.params.refundId,
            traceId: request.id,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { profileId: string } }>(
    '/api/v1/geo/profiles/:profileId/actions/publish',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'geo.publish',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, async () =>
        reply.code(202).send(
          await options.geoPluginReports!.publishGeo({
            identity,
            profileId: request.params.profileId,
            idempotencyKey,
            traceId: request.id,
            body: request.body,
          }),
        ),
      );
    },
  );

  app.post('/api/v1/plugins/installations', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'plugin.install',
      { mfaRequired: true, write: true },
    );
    if (!identity) return;
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.length > 255)
      return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
    if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleGeoPluginReport(reply, async () =>
      reply.code(202).send(
        await options.geoPluginReports!.installPlugin({
          identity,
          idempotencyKey,
          traceId: request.id,
          body: request.body,
        }),
      ),
    );
  });
  app.get('/api/v1/plugins/catalog', async (request, reply) => {
    const identity = await authorizedIdentity(
      options,
      request.headers.authorization,
      reply,
      'plugin.install',
    );
    if (!identity) return;
    if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
    return handleGeoPluginReport(reply, () => options.geoPluginReports!.listPlugins({ identity }));
  });
  app.get<{ Params: { pluginCode: string } }>(
    '/api/v1/plugins/catalog/:pluginCode',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'plugin.install',
      );
      if (!identity) return;
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, () =>
        options.geoPluginReports!.getPlugin({ identity, pluginCode: request.params.pluginCode }),
      );
    },
  );

  app.post<{ Params: { installationId: string } }>(
    '/api/v1/plugins/installations/:installationId/invocations',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'plugin.permission.grant',
        { write: true },
      );
      if (!identity) return;
      const idempotencyKey = headerValue(request.headers['idempotency-key']);
      if (!idempotencyKey || idempotencyKey.length > 255)
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, async () =>
        reply.code(202).send(
          await options.geoPluginReports!.invokePlugin({
            identity,
            installationId: request.params.installationId,
            idempotencyKey,
            traceId: request.id,
            body: request.body,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { installationId: string } }>(
    '/api/v1/plugins/installations/:installationId/actions/upgrade',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'plugin.install',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, async () =>
        reply.code(202).send(
          await options.geoPluginReports!.upgradePlugin({
            identity,
            installationId: request.params.installationId,
            traceId: request.id,
            body: request.body,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { installationId: string } }>(
    '/api/v1/plugins/installations/:installationId/actions/uninstall',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'plugin.install',
        { mfaRequired: true, write: true },
      );
      if (!identity) return;
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, async () =>
        reply.code(200).send(
          await options.geoPluginReports!.uninstallPlugin({
            identity,
            installationId: request.params.installationId,
            traceId: request.id,
          }),
        ),
      );
    },
  );

  app.get<{ Querystring: { month?: string; storeId?: string } }>(
    '/api/v1/reports/monthly-value',
    async (request, reply) => {
      const identity = await authorizedIdentity(
        options,
        request.headers.authorization,
        reply,
        'report.value.read',
      );
      if (!identity) return;
      if (!request.query.month) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, () =>
        options.geoPluginReports!.monthlyReport({
          identity,
          month: request.query.month!,
          ...(request.query.storeId ? { storeId: request.query.storeId } : {}),
        }),
      );
    },
  );

  app.post<{ Body: { tenantId?: string; month?: string; storeId?: string } }>(
    '/api/v1/internal/reports/monthly-value/actions/materialize',
    async (request, reply) => {
      if (
        !options.internalWorkerToken ||
        !validInternalBearer(options.internalWorkerToken, request.headers.authorization)
      )
        return reply.code(401).send({ code: 'INVALID_INTERNAL_WORKER' });
      if (!request.body?.tenantId || !request.body.month)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, async () =>
        reply.code(201).send(
          await options.geoPluginReports!.materializeMonthlyReport({
            tenantId: request.body.tenantId!,
            month: request.body.month!,
            ...(request.body.storeId ? { storeId: request.body.storeId } : {}),
          }),
        ),
      );
    },
  );
  app.post<{ Params: { targetId: string }; Body: { tenantId?: string } }>(
    '/api/v1/internal/geo/targets/:targetId/actions/check',
    async (request, reply) => {
      if (
        !options.internalWorkerToken ||
        !validInternalBearer(options.internalWorkerToken, request.headers.authorization)
      )
        return reply.code(401).send({ code: 'INVALID_INTERNAL_WORKER' });
      if (!request.body?.tenantId) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      if (!options.geoPluginReports) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleGeoPluginReport(reply, () =>
        options.geoPluginReports!.checkGeoTarget({
          tenantId: request.body.tenantId!,
          targetId: request.params.targetId,
          traceId: request.id,
        }),
      );
    },
  );

  return app;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validInternalBearer(expectedToken: string, authorization: string | undefined): boolean {
  if (Buffer.byteLength(expectedToken, 'utf8') < 32 || !authorization?.startsWith('Bearer '))
    return false;
  const expected = createHash('sha256').update(expectedToken).digest();
  const actual = createHash('sha256').update(authorization.slice('Bearer '.length)).digest();
  return timingSafeEqual(expected, actual);
}

async function authorizedIdentity(
  options: AppOptions,
  authorization: string | undefined,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  permissionCode?: string,
  authorizationOptions: AuthorizationOptions = {},
): Promise<(SessionIdentity & Partial<AuthorizationContext>) | undefined> {
  if (!options.sessionIdentity || !options.accessControl) {
    reply.code(503).send({ code: 'AUTHENTICATION_UNAVAILABLE' });
    return undefined;
  }
  try {
    const identity = options.sessionIdentity.verify(authorization);
    return permissionCode
      ? await options.accessControl.authorize(identity, permissionCode, authorizationOptions)
      : await options.accessControl.validate(identity, authorizationOptions);
  } catch (error) {
    if (error instanceof SessionAuthenticationError || error instanceof InactiveSessionError) {
      reply.code(401).send({ code: 'INVALID_SESSION' });
      return undefined;
    }
    if (error instanceof PermissionDeniedError) {
      reply.code(403).send({ code: 'PERMISSION_DENIED' });
      return undefined;
    }
    if (error instanceof TenantWriteSuspendedError) {
      reply.code(423).send({ code: 'TENANT_WRITE_SUSPENDED' });
      return undefined;
    }
    throw error;
  }
}

function tryConsumerIdentity(
  options: AppOptions,
  authorization: string | undefined,
): ConsumerSessionIdentity | undefined {
  if (!options.consumerSession) return undefined;
  try {
    return options.consumerSession.verify(authorization);
  } catch (error) {
    if (error instanceof ConsumerSessionAuthenticationError) return undefined;
    throw error;
  }
}

function consumerIdentity(
  options: AppOptions,
  authorization: string | undefined,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
): ConsumerSessionIdentity | undefined {
  if (!options.consumerSession) {
    reply.code(503).send({ code: 'CONSUMER_AUTHENTICATION_UNAVAILABLE' });
    return undefined;
  }
  try {
    return options.consumerSession.verify(authorization);
  } catch (error) {
    if (error instanceof ConsumerSessionAuthenticationError) {
      reply.code(401).send({ code: 'INVALID_CONSUMER_SESSION' });
      return undefined;
    }
    throw error;
  }
}

function lifeConsumerIdentity(
  options: AppOptions,
  authorization: string | undefined,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
): LifeConsumerSessionIdentity | undefined {
  if (!options.lifeConsumerSession) {
    reply.code(503).send({ code: 'LIFE_CONSUMER_AUTHENTICATION_UNAVAILABLE' });
    return undefined;
  }
  try {
    return options.lifeConsumerSession.verify(authorization);
  } catch (error) {
    if (error instanceof LifeConsumerSessionAuthenticationError) {
      reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
      return undefined;
    }
    throw error;
  }
}

function objectBody(body: unknown, authoritative: Record<string, string>): Record<string, unknown> {
  return body && typeof body === 'object' ? { ...body, ...authoritative } : authoritative;
}

async function handleConsumerCatalog(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof ConsumerCatalogAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_CONSUMER_SESSION' });
    if (error instanceof ConsumerCatalogNotFoundError)
      return reply.code(404).send({ code: 'CATALOG_RESOURCE_NOT_FOUND' });
    throw error;
  }
}

async function handleConsumerStoreSwitch(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof ConsumerStoreSwitchAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_CONSUMER_SESSION' });
    if (error instanceof ConsumerStoreSwitchNotFoundError)
      return reply.code(404).send({ code: 'STORE_NOT_FOUND' });
    if (error instanceof ConsumerStoreSwitchConflictError)
      return reply.code(409).send({ code: 'STORE_SWITCH_CONFLICT' });
    throw error;
  }
}

async function handlePlatformCart(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformCartAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformCartItemUnavailableError)
      return reply.code(409).send({ code: 'CART_ITEM_UNAVAILABLE' });
    if (error instanceof PlatformCartItemNotFoundError)
      return reply.code(404).send({ code: 'CART_ITEM_NOT_FOUND' });
    throw error;
  }
}

async function handleMerchantConsumerJourney(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof MerchantConsumerJourneyAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_MERCHANT_CONSUMER_IDENTITY_PAIR' });
    if (error instanceof MerchantConsumerJourneyNotFoundError)
      return reply.code(404).send({ code: 'MERCHANT_CONSUMER_RESOURCE_NOT_FOUND' });
    if (
      error instanceof PlatformCartAuthenticationError ||
      error instanceof PlatformCheckoutAuthenticationError
    )
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformCartItemUnavailableError)
      return reply.code(409).send({ code: 'CART_ITEM_UNAVAILABLE' });
    if (error instanceof PlatformCartItemNotFoundError)
      return reply.code(404).send({ code: 'CART_ITEM_NOT_FOUND' });
    if (error instanceof PlatformCheckoutConflictError)
      return reply.code(409).send({ code: 'CHECKOUT_CONFLICT' });
    if (error instanceof PlatformCheckoutNotFoundError)
      return reply.code(404).send({ code: 'CHECKOUT_NOT_FOUND' });
    if (error instanceof PlatformCheckoutUnavailableError)
      return reply.code(422).send({ code: 'CHECKOUT_UNAVAILABLE' });
    throw error;
  }
}

async function handlePlatformAddress(
  reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformAddressAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformAddressNotFoundError)
      return reply.code(404).send({ code: 'ADDRESS_NOT_FOUND' });
    throw error;
  }
}

async function handlePlatformInvoiceProfile(
  reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformInvoiceProfileAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformInvoiceProfileNotFoundError)
      return reply.code(404).send({ code: 'INVOICE_PROFILE_NOT_FOUND' });
    throw error;
  }
}

async function handlePlatformOrders(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformOrderQueryAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformOrderQueryNotFoundError)
      return reply.code(404).send({ code: 'ORDER_NOT_FOUND' });
    throw error;
  }
}

async function handlePlatformCheckout(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformCheckoutAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformCheckoutNotFoundError)
      return reply.code(404).send({ code: 'CHECKOUT_NOT_FOUND' });
    if (error instanceof PlatformCheckoutConflictError)
      return reply.code(409).send({ code: 'CHECKOUT_CONFLICT' });
    if (error instanceof PlatformCheckoutUnavailableError)
      return reply.code(422).send({ code: 'CHECKOUT_UNAVAILABLE' });
    throw error;
  }
}

async function handlePlatformPayment(
  reply: {
    code(statusCode: number): { send(payload: unknown): unknown };
    send(payload: unknown): unknown;
  },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformPaymentAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformPaymentOrderNotFoundError)
      return reply.code(404).send({ code: 'ORDER_NOT_FOUND' });
    return handleCommerce(reply, async () => {
      throw error;
    });
  }
}

async function handlePlatformAftercare(
  reply: {
    code(statusCode: number): { send(payload: unknown): unknown };
    send(payload: unknown): unknown;
  },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof PlatformAftercareAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_LIFE_CONSUMER_SESSION' });
    if (error instanceof PlatformAftercareOrderNotFoundError)
      return reply.code(404).send({ code: 'ORDER_NOT_FOUND' });
    return handleCommerce(reply, async () => {
      throw error;
    });
  }
}

function idempotencyContext(
  headers: Record<string, string | string[] | undefined>,
  identity: SessionIdentity,
) {
  const idempotencyHeader = headers['idempotency-key'];
  const idempotencyKey = Array.isArray(idempotencyHeader)
    ? idempotencyHeader[0]
    : idempotencyHeader;
  if (!idempotencyKey || idempotencyKey.length > 255) return undefined;
  return { tenantId: identity.tenantId, idempotencyKey };
}

async function handleSettlement(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof IdempotencyConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof DistributionStateError)
      return reply.code(409).send({ code: 'INVALID_DISTRIBUTION_STATE' });
    if (error instanceof DistributionAuthorizationError)
      return reply.code(403).send({ code: 'DISTRIBUTION_PERMISSION_DENIED' });
    if (error instanceof DistributionApprovalError)
      return reply.code(409).send({ code: 'INVALID_DISTRIBUTION_APPROVAL' });
    if (error instanceof DistributionPaymentEvidenceError)
      return reply.code(422).send({ code: 'INVALID_PAYMENT_EVIDENCE' });
    throw error;
  }
}

async function handleAuthSession(
  reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof RefreshSessionInvalidError || error instanceof AuthSubjectInactiveError)
      return reply.code(401).send({ code: 'INVALID_SESSION' });
    if (error instanceof IdentityExchangeRejectedError)
      return reply.code(401).send({ code: 'INVALID_IDENTITY_ASSERTION' });
    if (error instanceof IdentityExchangeRateLimitedError)
      return reply.code(429).send({ code: 'IDENTITY_RATE_LIMITED' });
    if (error instanceof IdentityExchangeUnavailableError)
      return reply.code(503).send({ code: 'IDENTITY_PROVIDER_UNAVAILABLE' });
    throw error;
  }
}

async function handleLifeConsumerAuth(
  reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (
      error instanceof LifeConsumerAuthRejectedError ||
      error instanceof LifeConsumerRefreshRejectedError ||
      error instanceof LifeConsumerRevokeRejectedError ||
      error instanceof LifeConsumerIdentityExchangeRejectedError
    )
      return reply.code(401).send({ code: 'INVALID_LIFE_IDENTITY_ASSERTION' });
    if (error instanceof LifeConsumerIdentityExchangeRateLimitedError)
      return reply.code(429).send({ code: 'LIFE_IDENTITY_RATE_LIMITED' });
    if (error instanceof LifeConsumerIdentityExchangeUnavailableError)
      return reply.code(503).send({ code: 'LIFE_IDENTITY_PROVIDER_UNAVAILABLE' });
    throw error;
  }
}

async function handleDelivery(
  reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof IdempotencyConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof DeliveryAuthorizationError)
      return reply.code(404).send({ code: 'DELIVERY_PROJECT_NOT_FOUND' });
    if (error instanceof DeliveryStateError)
      return reply.code(409).send({ code: 'INVALID_DELIVERY_STATE' });
    if (error instanceof DeliveryPrerequisiteError || error instanceof DeliveryAcceptanceError)
      return reply.code(422).send({ code: 'DELIVERY_PREREQUISITE_REQUIRED' });
    if (error instanceof DeliveryExecutionUnavailableError)
      return reply.code(503).send({ code: 'DELIVERY_EXECUTION_UNAVAILABLE' });
    throw error;
  }
}

async function handleRevenueRightGovernance(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof RevenueRightGovernanceAuthorizationError)
      return reply.code(403).send({ code: 'REVENUE_RIGHT_PERMISSION_DENIED' });
    if (error instanceof RevenueRightGovernanceConflictError)
      return reply.code(409).send({ code: 'REVENUE_RIGHT_IDEMPOTENCY_CONFLICT' });
    if (error instanceof RevenueRightGovernanceStateError)
      return reply.code(409).send({ code: 'INVALID_REVENUE_RIGHT_STATE' });
    throw error;
  }
}

async function handleIntake(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof IdempotencyConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof MerchantIntakeAuthorizationError)
      return reply.code(403).send({ code: 'MERCHANT_INTAKE_PERMISSION_DENIED' });
    if (error instanceof MerchantIntakeConflictError)
      return reply.code(409).send({ code: 'MERCHANT_INTAKE_VERSION_CONFLICT' });
    if (error instanceof MerchantIntakeStateError)
      return reply.code(409).send({ code: 'INVALID_MERCHANT_INTAKE_STATE' });
    if (error instanceof MerchantIntakeConfirmationError)
      return reply.code(422).send({ code: 'MERCHANT_INTAKE_CONFIRMATION_REQUIRED' });
    if (error instanceof IntakeUploadEvidenceError)
      return reply.code(422).send({ code: 'INVALID_UPLOAD_EVIDENCE' });
    if (error instanceof IntakeObjectStoreUnavailableError)
      return reply.code(503).send({ code: 'OBJECT_STORE_UNAVAILABLE' });
    throw error;
  }
}

async function handleMiniProgram(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof IdempotencyConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof MiniProgramOwnershipConflictError)
      return reply.code(409).send({ code: 'MINI_PROGRAM_APP_ID_ALREADY_BOUND' });
    if (error instanceof MiniProgramStateError)
      return reply.code(409).send({ code: 'INVALID_MINI_PROGRAM_STATE' });
    if (error instanceof MiniProgramConfirmationError)
      return reply.code(422).send({ code: 'MINI_PROGRAM_CONFIRMATION_REQUIRED' });
    if (error instanceof MiniProgramAuthorizationError)
      return reply.code(422).send({ code: 'MINI_PROGRAM_AUTHORIZATION_REQUIRED' });
    if (error instanceof MiniProgramProviderError)
      return reply.code(503).send({ code: 'MINI_PROGRAM_PROVIDER_UNAVAILABLE' });
    if (error instanceof MiniProgramCallbackConflictError)
      return reply.code(409).send({ code: 'MINI_PROGRAM_CALLBACK_CONFLICT' });
    throw error;
  }
}

async function handleCustomerService(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof IdempotencyConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof CustomerServiceAuthenticationError)
      return reply.code(401).send({ code: 'INVALID_CONSUMER_SESSION' });
    if (error instanceof CustomerServiceAuthorizationError)
      return reply.code(404).send({ code: 'CONVERSATION_NOT_FOUND' });
    if (error instanceof CustomerServiceConcurrencyError)
      return reply.code(409).send({ code: 'CONVERSATION_ALREADY_CLAIMED' });
    if (error instanceof CustomerServiceStateError)
      return reply.code(409).send({ code: 'INVALID_CONVERSATION_STATE' });
    if (error instanceof CustomerServiceNotificationError)
      return reply.code(503).send({ code: 'OPTIONAL_NOTIFICATION_FAILED' });
    throw error;
  }
}

async function handleMerchantOperations(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof MerchantOperationsAuthorizationError)
      return reply.code(404).send({ code: 'MERCHANT_RESOURCE_NOT_FOUND' });
    if (error instanceof MerchantOperationsConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof MerchantOperationsStateError)
      return reply.code(409).send({ code: 'INVALID_PRODUCT_PUBLICATION_STATE' });
    throw error;
  }
}

async function handleOrganizationGovernance(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof OrganizationGovernanceAuthorizationError)
      return reply.code(403).send({ code: 'ORGANIZATION_PERMISSION_DENIED' });
    if (error instanceof OrganizationGovernanceConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof OrganizationGovernanceStateError)
      return reply.code(409).send({ code: 'INVALID_ORGANIZATION_STATE' });
    throw error;
  }
}

async function handleRevenueOperations(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof RevenueOperationsAuthorizationError)
      return reply.code(404).send({ code: 'REVENUE_RESOURCE_NOT_FOUND' });
    if (error instanceof RevenueOperationsConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    throw error;
  }
}

async function handleSalesLifecycle(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof SalesLifecycleAuthorizationError)
      return reply.code(404).send({ code: 'SALES_RESOURCE_NOT_FOUND' });
    if (error instanceof SalesLifecycleConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof SalesLifecycleStateError)
      return reply.code(409).send({ code: 'INVALID_SALES_STATE' });
    throw error;
  }
}

async function handleSubscriptionLifecycle(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof SubscriptionLifecycleAuthorizationError)
      return reply.code(404).send({ code: 'SUBSCRIPTION_RESOURCE_NOT_FOUND' });
    if (error instanceof SubscriptionLifecycleConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof SubscriptionLifecycleStateError)
      return reply.code(409).send({ code: 'INVALID_SUBSCRIPTION_STATE' });
    throw error;
  }
}

async function handleCommerce(
  reply: {
    code(statusCode: number): { send(payload: unknown): unknown };
    send(payload: unknown): unknown;
  },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST' });
    if (error instanceof IdempotencyConflictError)
      return reply.code(409).send({ code: 'IDEMPOTENCY_CONFLICT' });
    if (error instanceof CommercePaymentSignatureError)
      return reply.code(401).send({ code: 'INVALID_PAYMENT_SIGNATURE' });
    if (error instanceof CommercePaymentReplayConflictError)
      return reply.code(409).send({ code: 'PAYMENT_CALLBACK_CONFLICT' });
    if (error instanceof CommerceInventoryUnavailableError)
      return reply.code(409).send({ code: 'INVENTORY_UNAVAILABLE' });
    if (
      error instanceof CommerceOrderAuthenticationError ||
      error instanceof CommercePaymentAuthenticationError ||
      error instanceof CommerceRefundAuthenticationError ||
      error instanceof CommerceVerificationAuthenticationError
    )
      return reply.code(401).send({ code: 'INVALID_CONSUMER_SESSION' });
    if (
      error instanceof CommerceOrderAuthorizationError ||
      error instanceof CommercePaymentAuthorizationError ||
      error instanceof CommerceRefundAuthorizationError ||
      error instanceof CommerceVerificationAuthorizationError ||
      error instanceof CommerceReconciliationAuthorizationError
    )
      return reply.code(403).send({ code: 'COMMERCE_PERMISSION_DENIED' });
    if (
      error instanceof CommerceOrderStateError ||
      error instanceof CommercePaymentStateError ||
      error instanceof CommerceRefundStateError ||
      error instanceof CommerceVerificationStateError ||
      error instanceof CommerceReconciliationStateError
    )
      return reply.code(409).send({ code: 'INVALID_COMMERCE_STATE' });
    throw error;
  }
}

async function handleGeoPluginReport(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  work: () => Promise<unknown>,
) {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof ZodError ||
      error instanceof GeoPolicyError ||
      error instanceof ReportPolicyError
    )
      return reply.code(422).send({
        code: error instanceof GeoPolicyError ? error.code : 'INVALID_REQUEST',
        ...(error instanceof GeoPolicyError ? { fields: error.fields } : {}),
      });
    if (error instanceof PluginPolicyError) {
      const status = error.code.includes('PERMISSION') || error.code.includes('EGRESS') ? 403 : 409;
      return reply.code(status).send({ code: error.code });
    }
    if (error instanceof GeoPluginReportStateError)
      return reply.code(409).send({ code: error.message });
    throw error;
  }
}
