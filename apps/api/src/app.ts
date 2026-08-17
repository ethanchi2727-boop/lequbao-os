import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { TenantIdSchema } from '@lequ/contracts';
import { ZodError } from 'zod';
import {
  IdempotencyConflictError,
  InactiveBeneficiaryError,
  RevenueRightConflictError,
  type RevenueRightService,
} from './revenue-right-service.js';

export interface AppOptions {
  databaseCheck?: () => Promise<void>;
  logger?: boolean;
  revenueRights?: RevenueRightService;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cors, { origin: false });

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

  return app;
}
