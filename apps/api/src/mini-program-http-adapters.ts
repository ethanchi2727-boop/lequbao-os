import { z } from 'zod';
import type { MiniProgramCallbackDecoder } from './mini-program-callback.js';
import type {
  MiniProgramBuilder,
  MiniProgramProviderGateway,
} from './mini-program-lifecycle-service.js';

const AuthorizationGrantSchema = z.object({
  appId: z.string().min(1),
  subjectName: z.string().min(1),
  scopeCodes: z.array(z.string().min(1)),
  credentialSecretRef: z.string().min(1),
  authorizedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  externalRequestId: z.string().min(1),
});
const ExternalActionSchema = z.object({
  externalRequestId: z.string().min(1),
  externalAuditId: z.string().min(1).optional(),
  externalVersion: z.string().min(1).optional(),
});
const OnlineSchema = z.object({
  releaseId: z.string().nullable(),
  externalVersion: z.string().nullable(),
});
const BuildSchema = z.object({
  artifactRef: z.string().min(1),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  previewRef: z.string().min(1),
  templateCommit: z.string().min(1),
  backendApiVersion: z.string().min(1),
  databaseCompatibilityMin: z.string().min(1),
  databaseCompatibilityMax: z.string().min(1),
  smokeTestResult: z.object({
    passed: z.boolean(),
    checks: z.record(z.string(), z.boolean()),
  }),
});
const DecodedEventSchema = z.object({
  tenantId: z.uuid(),
  appId: z.string().min(1),
  providerEventId: z.string().min(1),
  eventType: z.enum(['AUTH_REVOKED', 'REVIEW_APPROVED', 'REVIEW_REJECTED']),
  externalAuditId: z.string().min(1).optional(),
  reasonCode: z.string().min(1).optional(),
  reasonSummary: z.string().min(1).optional(),
});

type HttpOptions = {
  baseUrl: string;
  serviceToken: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

function createJsonClient(options: HttpOptions) {
  if (!URL.canParse(options.baseUrl)) throw new Error('mini-program gateway URL must be absolute');
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('mini-program gateway token must contain at least 16 bytes');
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const request = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  return async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.serviceToken}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`mini-program upstream rejected request: ${response.status}`);
    return response.json();
  };
}

export type HttpMiniProgramProviderGateway = MiniProgramProviderGateway &
  MiniProgramCallbackDecoder;

export function createHttpMiniProgramProviderGateway(
  options: HttpOptions,
): HttpMiniProgramProviderGateway {
  const post = createJsonClient(options);
  const headers = (idempotencyKey: string, traceId: string) => ({
    'idempotency-key': idempotencyKey,
    'x-trace-id': traceId,
  });
  return {
    async exchangeAuthorization(input) {
      const result = AuthorizationGrantSchema.parse(
        await post(
          '/v1/wechat/authorizations/exchange',
          { authorizationCode: input.authorizationCode },
          headers(input.idempotencyKey, input.traceId),
        ),
      );
      return {
        appId: result.appId,
        subjectName: result.subjectName,
        scopeCodes: result.scopeCodes,
        credentialSecretRef: result.credentialSecretRef,
        authorizedAt: result.authorizedAt,
        externalRequestId: result.externalRequestId,
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
      };
    },
    async submitReview(input) {
      const result = ExternalActionSchema.parse(
        await post(
          '/v1/wechat/releases/submit-review',
          { appId: input.appId, releaseId: input.releaseId, artifactRef: input.artifactRef },
          headers(input.idempotencyKey, input.traceId),
        ),
      );
      if (!result.externalAuditId) throw new Error('mini-program audit id is missing');
      return {
        externalAuditId: result.externalAuditId,
        externalRequestId: result.externalRequestId,
      };
    },
    async publish(input) {
      const result = ExternalActionSchema.parse(
        await post(
          '/v1/wechat/releases/publish',
          {
            appId: input.appId,
            releaseId: input.releaseId,
            externalAuditId: input.externalAuditId,
          },
          headers(input.idempotencyKey, input.traceId),
        ),
      );
      if (!result.externalVersion) throw new Error('mini-program external version is missing');
      return {
        externalVersion: result.externalVersion,
        externalRequestId: result.externalRequestId,
      };
    },
    async queryOnline(input) {
      return OnlineSchema.parse(
        await post(
          '/v1/wechat/releases/query-online',
          { appId: input.appId, releaseId: input.releaseId },
          { 'x-trace-id': input.traceId },
        ),
      );
    },
    async rollback(input) {
      const result = ExternalActionSchema.parse(
        await post(
          '/v1/wechat/releases/rollback',
          { appId: input.appId, releaseId: input.releaseId, artifactRef: input.artifactRef },
          headers(input.idempotencyKey, input.traceId),
        ),
      );
      if (!result.externalVersion) throw new Error('mini-program rollback version is missing');
      return {
        externalVersion: result.externalVersion,
        externalRequestId: result.externalRequestId,
      };
    },
    async decodeCallback(input) {
      return DecodedEventSchema.parse(
        await post(
          '/v1/wechat/callbacks/decode',
          { encrypted: input.encrypted, timestamp: input.timestamp, nonce: input.nonce },
          { 'x-trace-id': input.traceId },
        ),
      );
    },
  };
}

export function createHttpMiniProgramBuilder(options: HttpOptions): MiniProgramBuilder {
  const post = createJsonClient(options);
  return {
    async build(input) {
      return BuildSchema.parse(
        await post('/v1/mini-program-builds', input, { 'x-trace-id': input.traceId }),
      );
    },
  };
}
