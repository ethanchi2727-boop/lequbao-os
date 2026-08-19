import { z } from 'zod';
import type {
  CustomerServiceBusinessToolGateway,
  CustomerServiceKnowledgeGateway,
  CustomerServiceModelGateway,
} from './customer-service-ai.js';
import type { CustomerServiceNotificationDispatcher } from './customer-service.js';

type HttpOptions = {
  baseUrl: string;
  serviceToken: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

const CitationSchema = z.object({
  id: z.uuid(),
  publicationId: z.uuid(),
  tenantId: z.uuid(),
  storeId: z.uuid(),
  documentId: z.uuid(),
  documentVersion: z.number().int().positive(),
  title: z.string().min(1).max(500),
  excerpt: z.string().min(1).max(2000),
  sourceType: z.enum([
    'MERCHANT_RULE',
    'PRODUCT_REALTIME',
    'ORDER_REALTIME',
    'MERCHANT_FILE',
    'EMPLOYEE_CONFIRMED_QA',
    'PUBLIC_REFERENCE',
  ]),
  expiresAt: z.string().datetime().nullable(),
});
const ToolResultSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  sourceVersion: z.string().min(1),
  observedAt: z.string().datetime(),
});
const ModelAnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  usedCitationIds: z.array(z.uuid()),
  confidence: z.number().min(0).max(1),
  requiresHuman: z.boolean(),
  riskLabels: z.array(z.string()),
  modelRoute: z.string().min(1),
  modelCode: z.string().min(1),
  provider: z.string().min(1),
  modelTraceRef: z.string().min(1),
  inputUnits: z.number().int().nonnegative(),
  outputUnits: z.number().int().nonnegative(),
  costMinorUnits: z.number().int().nonnegative(),
});

function jsonClient(options: HttpOptions) {
  if (!URL.canParse(options.baseUrl))
    throw new Error('customer-service gateway URL must be absolute');
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('customer-service gateway token must contain at least 16 bytes');
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const request = options.fetch ?? globalThis.fetch;
  return async (path: string, body: unknown, traceId: string) => {
    const response = await request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.serviceToken}`,
        'content-type': 'application/json',
        'x-trace-id': traceId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    if (!response.ok)
      throw new Error(`customer-service upstream rejected request: ${response.status}`);
    return response.json();
  };
}

export function createHttpCustomerServiceKnowledgeGateway(
  options: HttpOptions,
): CustomerServiceKnowledgeGateway {
  const post = jsonClient(options);
  return {
    async search(input) {
      return z.array(CitationSchema).parse(
        await post(
          '/v1/customer-service/knowledge/search',
          {
            tenantId: input.tenantId,
            storeId: input.storeId,
            query: input.query,
            limit: input.limit,
          },
          input.traceId,
        ),
      );
    },
  };
}

export function createHttpCustomerServiceBusinessToolGateway(
  options: HttpOptions,
): CustomerServiceBusinessToolGateway {
  const post = jsonClient(options);
  return {
    async query(input) {
      return ToolResultSchema.parse(
        await post(
          '/v1/customer-service/read-tools/query',
          {
            tenantId: input.tenantId,
            storeId: input.storeId,
            customerId: input.customerId,
            toolCode: input.toolCode,
            query: input.query,
            contextType: input.contextType,
            contextId: input.contextId,
          },
          input.traceId,
        ),
      );
    },
  };
}

export function createHttpCustomerServiceModelGateway(
  options: HttpOptions,
): CustomerServiceModelGateway {
  const post = jsonClient(options);
  return {
    async answer(input) {
      return ModelAnswerSchema.parse(
        await post(
          '/v1/customer-service/model/answer',
          {
            tenantId: input.tenantId,
            storeId: input.storeId,
            query: input.query,
            citations: input.citations,
            ...(input.toolResult ? { toolResult: input.toolResult } : {}),
            promptVersion: input.promptVersion,
          },
          input.traceId,
        ),
      );
    },
  };
}

export function createHttpCustomerServiceNotificationDispatcher(
  options: HttpOptions,
): CustomerServiceNotificationDispatcher {
  const post = jsonClient(options);
  return {
    async sendWeComInternal(input) {
      await post('/v1/wecom/internal/notifications', input, input.traceId);
    },
  };
}
