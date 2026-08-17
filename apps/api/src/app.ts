import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { TenantIdSchema } from '@lequ/contracts';
import { ZodError } from 'zod';
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
  IdempotencyConflictError,
  InactiveBeneficiaryError,
  RevenueRightConflictError,
  type RevenueRightService,
} from './revenue-right-service.js';
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

export interface AppOptions {
  databaseCheck?: () => Promise<void>;
  logger?: boolean;
  revenueRights?: RevenueRightService;
  distributionLocks?: DistributionLockService;
  distributionSettlements?: DistributionSettlementService;
  merchantIntake?: MerchantIntakeService;
  merchantIntakeUploads?: MerchantIntakeUploadService;
  merchantIntakeMessages?: MerchantIntakeMessageService;
  wecomIntakeCallback?: WeComIntakeCallbackService;
  sessionIdentity?: SessionIdentityVerifier;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cors, { origin: false });
  app.addContentTypeParser('application/xml', { parseAs: 'string' }, (_request, body, done) =>
    done(null, body),
  );

  app.get('/health', async () => ({ status: 'ok', version: '6.1.0' }));

  app.get('/ready', async (_request, reply) => {
    try {
      await options.databaseCheck?.();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.get('/api/v1/context', async (request, reply) => {
    const value = request.headers['x-tenant-id'];
    const parsed = TenantIdSchema.safeParse(Array.isArray(value) ? value[0] : value);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'INVALID_TENANT_CONTEXT' });
    }
    return { tenantId: parsed.data };
  });

  app.post<{ Params: { merchantProfileId: string } }>(
    '/api/v1/merchants/:merchantProfileId/revenue-rights',
    async (request, reply) => {
      const tenantHeader = request.headers['x-tenant-id'];
      const tenant = TenantIdSchema.safeParse(
        Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader,
      );
      const idempotencyHeader = request.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(idempotencyHeader)
        ? idempotencyHeader[0]
        : idempotencyHeader;
      if (!tenant.success || !idempotencyKey || idempotencyKey.length > 255) {
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      }
      if (!options.revenueRights) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });

      try {
        const result = await options.revenueRights.create({
          tenantId: tenant.data,
          merchantProfileId: request.params.merchantProfileId,
          idempotencyKey,
          body: request.body,
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
      const tenantHeader = request.headers['x-tenant-id'];
      const tenant = TenantIdSchema.safeParse(
        Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader,
      );
      const idempotencyHeader = request.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(idempotencyHeader)
        ? idempotencyHeader[0]
        : idempotencyHeader;
      if (!tenant.success || !idempotencyKey || idempotencyKey.length > 255) {
        return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      }
      if (!options.distributionLocks) return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      const body =
        request.body && typeof request.body === 'object'
          ? { ...request.body, subscriptionId: request.params.subscriptionId }
          : { subscriptionId: request.params.subscriptionId };
      try {
        const result = await options.distributionLocks.lock({
          tenantId: tenant.data,
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
      const context = requestContext(request.headers);
      if (!context) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.distributionSettlements)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSettlement(reply, async () => {
        const body = objectBody(request.body, { statementId: request.params.statementId });
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
      const context = requestContext(request.headers);
      if (!context) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
      if (!options.distributionSettlements)
        return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
      return handleSettlement(reply, async () => {
        const result = await options.distributionSettlements!.approve({
          ...context,
          traceId: request.id,
          body: objectBody(request.body, { approvalId: request.params.approvalId }),
        });
        return reply.send(result);
      });
    },
  );

  for (const action of ['pay', 'reverse'] as const) {
    app.post<{ Params: { statementId: string } }>(
      `/api/v1/distribution-statements/:statementId/actions/${action}`,
      async (request, reply) => {
        const context = requestContext(request.headers);
        if (!context) return reply.code(400).send({ code: 'INVALID_REQUEST_CONTEXT' });
        if (!options.distributionSettlements)
          return reply.code(503).send({ code: 'SERVICE_UNAVAILABLE' });
        return handleSettlement(reply, async () => {
          const result = await options.distributionSettlements![action]({
            ...context,
            traceId: request.id,
            body: objectBody(request.body, { statementId: request.params.statementId }),
          });
          return reply.send(result);
        });
      },
    );
  }

  app.post('/api/v1/merchant-intake/sessions', async (request, reply) => {
    const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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
      const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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
      const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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
      const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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
      const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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
      const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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
      const identity = authenticatedIdentity(options, request.headers.authorization, reply);
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

  return app;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function authenticatedIdentity(
  options: AppOptions,
  authorization: string | undefined,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
): SessionIdentity | undefined {
  if (!options.sessionIdentity) {
    reply.code(503).send({ code: 'AUTHENTICATION_UNAVAILABLE' });
    return undefined;
  }
  try {
    return options.sessionIdentity.verify(authorization);
  } catch (error) {
    if (error instanceof SessionAuthenticationError) {
      reply.code(401).send({ code: 'INVALID_SESSION' });
      return undefined;
    }
    throw error;
  }
}

function objectBody(body: unknown, authoritative: Record<string, string>): Record<string, unknown> {
  return body && typeof body === 'object' ? { ...body, ...authoritative } : authoritative;
}

function requestContext(headers: Record<string, string | string[] | undefined>) {
  const tenantHeader = headers['x-tenant-id'];
  const tenant = TenantIdSchema.safeParse(
    Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader,
  );
  const idempotencyHeader = headers['idempotency-key'];
  const idempotencyKey = Array.isArray(idempotencyHeader)
    ? idempotencyHeader[0]
    : idempotencyHeader;
  if (!tenant.success || !idempotencyKey || idempotencyKey.length > 255) return undefined;
  return { tenantId: tenant.data, idempotencyKey };
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
