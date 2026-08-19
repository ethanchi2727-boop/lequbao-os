import { createHash, timingSafeEqual } from 'node:crypto';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';

const ProviderSchema = z.enum(['ENTERPRISE_WECOM', 'PHONE_OTP']);
const ExchangeInputSchema = z.object({
  provider: ProviderSchema,
  assertion: z.string().min(16).max(4096),
  deviceId: z.string().min(16).max(512),
});
const ExchangeResponseSchema = z.object({
  provider: ProviderSchema,
  assertionId: z.string().min(16).max(512),
  tenantId: TenantIdSchema,
  userId: UuidSchema,
  authLevel: z.enum(['PASSWORD', 'MFA']),
  deviceIdSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  verifiedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  riskDecision: z.literal('ALLOW'),
  rateLimitPolicyVersion: z.string().min(1).max(128),
});

export type IdentityExchangeInput = z.input<typeof ExchangeInputSchema>;
export type IdentityProvider = z.infer<typeof ProviderSchema>;
export const parseIdentityExchangeInput = (input: unknown): IdentityExchangeInput =>
  ExchangeInputSchema.parse(input);

export interface VerifiedIdentityExchange {
  provider: IdentityProvider;
  assertionId: string;
  tenantId: string;
  userId: string;
  authLevel: 'PASSWORD' | 'MFA';
  deviceId: string;
  verifiedAt: string;
  expiresAt: string;
}

export interface IdentityExchangeGateway {
  exchange(
    input: IdentityExchangeInput,
    context: { sourceIp: string; userAgent: string },
  ): Promise<VerifiedIdentityExchange>;
}

export class IdentityExchangeRejectedError extends Error {}
export class IdentityExchangeRateLimitedError extends Error {}
export class IdentityExchangeUnavailableError extends Error {}

function secureGatewayUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const local =
    url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !local)
    throw new Error('identity provider gateway must use HTTPS outside localhost');
  return url;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sameDigest = (left: string, right: string) =>
  left.length === right.length &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

export function createHttpIdentityExchangeGateway(options: {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): IdentityExchangeGateway {
  const baseUrl = secureGatewayUrl(options.baseUrl);
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('identity provider gateway token must be at least 16 bytes');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async exchange(rawInput, context) {
      const input = parseIdentityExchangeInput(rawInput);
      const riskContext = z
        .object({ sourceIp: z.string().min(2).max(64), userAgent: z.string().max(1024) })
        .parse(context);
      let response: Response;
      try {
        response = await fetchImpl(new URL('/v1/identity/assertions/exchange', baseUrl), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.serviceToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ...input, riskContext }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new IdentityExchangeUnavailableError('identity provider gateway unavailable');
      }

      if (response.status === 429)
        throw new IdentityExchangeRateLimitedError('identity assertion rate limited');
      if ([400, 401, 403, 404, 409, 410, 422].includes(response.status))
        throw new IdentityExchangeRejectedError('identity assertion rejected');
      if (!response.ok)
        throw new IdentityExchangeUnavailableError('identity provider gateway unavailable');

      let result: z.infer<typeof ExchangeResponseSchema>;
      try {
        result = ExchangeResponseSchema.parse(await response.json());
      } catch {
        throw new IdentityExchangeUnavailableError('identity provider gateway response invalid');
      }

      const current = now().getTime();
      const verifiedAt = Date.parse(result.verifiedAt);
      const expiresAt = Date.parse(result.expiresAt);
      if (
        result.provider !== input.provider ||
        !sameDigest(result.deviceIdSha256, digest(input.deviceId)) ||
        verifiedAt > current + 30_000 ||
        current - verifiedAt > 120_000 ||
        expiresAt <= current ||
        expiresAt - current > 300_000
      )
        throw new IdentityExchangeRejectedError('identity assertion binding invalid');

      return {
        provider: result.provider,
        assertionId: result.assertionId,
        tenantId: result.tenantId,
        userId: result.userId,
        authLevel: result.authLevel,
        deviceId: input.deviceId,
        verifiedAt: result.verifiedAt,
        expiresAt: result.expiresAt,
      };
    },
  };
}
