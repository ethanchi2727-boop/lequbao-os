import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { TenantIdSchema } from '@lequ/contracts';

export interface AppOptions {
  databaseCheck?: () => Promise<void>;
  logger?: boolean;
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

  return app;
}
