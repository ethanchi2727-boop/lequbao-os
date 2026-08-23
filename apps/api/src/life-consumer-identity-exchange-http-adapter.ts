import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const ProviderSchema = z.enum(['WECHAT', 'MOBILE_OTP']);
const InputSchema = z.object({
  provider: ProviderSchema,
  assertion: z.string().min(16).max(4096),
  deviceId: z.string().min(16).max(512),
});
const ResponseSchema = z.object({
  provider: ProviderSchema,
  assertionId: z.string().min(16).max(512),
  unionIdentifierHash: z.string().regex(/^[a-f0-9]{64}$/u),
  authSubjectHash: z.string().regex(/^[a-f0-9]{64}$/u),
  mobileHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
  authLevel: z.enum(['WECHAT', 'PHONE_BOUND']),
  deviceIdSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  verifiedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  riskDecision: z.literal('ALLOW'),
  rateLimitPolicyVersion: z.string().min(1).max(128),
});
const MobileOtpChallengeInputSchema = z.object({
  mobile: z.string().regex(/^\+?[1-9]\d{6,14}$/u),
  deviceId: z.string().min(16).max(512),
});
const MobileOtpChallengeResponseSchema = z.object({
  challengeId: z.string().min(16).max(512),
  maskedDestination: z.string().min(4).max(64),
  expiresAt: z.string().datetime({ offset: true }),
  resendAfterSeconds: z.number().int().min(0).max(600),
});
const MobileOtpVerificationInputSchema = z.object({
  challengeId: z.string().min(16).max(512),
  code: z.string().regex(/^\d{4,8}$/u),
  deviceId: z.string().min(16).max(512),
});
const MobileOtpVerificationResponseSchema = z.object({
  assertion: z.string().min(16).max(4096),
  expiresAt: z.string().datetime({ offset: true }),
  deviceIdSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type LifeConsumerIdentityExchangeInput = z.input<typeof InputSchema>;
export const parseLifeConsumerIdentityExchangeInput = (input: unknown) => InputSchema.parse(input);

export interface VerifiedLifeConsumerIdentityExchange {
  provider: z.infer<typeof ProviderSchema>;
  assertionId: string;
  unionIdentifierHash: string;
  authSubjectHash: string;
  mobileHash?: string;
  authLevel: 'WECHAT' | 'PHONE_BOUND';
  deviceId: string;
}

export interface LifeConsumerIdentityExchangeGateway {
  exchange(
    input: LifeConsumerIdentityExchangeInput,
    context: { sourceIp: string; userAgent: string },
  ): Promise<VerifiedLifeConsumerIdentityExchange>;
  requestMobileOtp(
    input: z.input<typeof MobileOtpChallengeInputSchema>,
    context: { sourceIp: string; userAgent: string },
  ): Promise<z.infer<typeof MobileOtpChallengeResponseSchema>>;
  verifyMobileOtp(
    input: z.input<typeof MobileOtpVerificationInputSchema>,
    context: { sourceIp: string; userAgent: string },
  ): Promise<{ assertion: string; deviceId: string }>;
}

export class LifeConsumerIdentityExchangeRejectedError extends Error {}
export class LifeConsumerIdentityExchangeRateLimitedError extends Error {}
export class LifeConsumerIdentityExchangeUnavailableError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sameDigest = (left: string, right: string) =>
  left.length === right.length &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

function secureGatewayUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local)
    throw new Error('life consumer identity gateway must use HTTPS outside localhost');
  return url;
}

export function createHttpLifeConsumerIdentityExchangeGateway(options: {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): LifeConsumerIdentityExchangeGateway {
  const baseUrl = secureGatewayUrl(options.baseUrl);
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('life consumer identity gateway token must be at least 16 bytes');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  const riskContext = (context: { sourceIp: string; userAgent: string }) =>
    z
      .object({ sourceIp: z.string().min(2).max(64), userAgent: z.string().max(1024) })
      .parse(context);

  async function post(path: string, body: unknown) {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.serviceToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new LifeConsumerIdentityExchangeUnavailableError();
    }
    if (response.status === 429) throw new LifeConsumerIdentityExchangeRateLimitedError();
    if ([400, 401, 403, 404, 409, 410, 422].includes(response.status))
      throw new LifeConsumerIdentityExchangeRejectedError();
    if (!response.ok) throw new LifeConsumerIdentityExchangeUnavailableError();
    try {
      return await response.json();
    } catch {
      throw new LifeConsumerIdentityExchangeUnavailableError();
    }
  }

  return {
    async exchange(rawInput, context) {
      const input = parseLifeConsumerIdentityExchangeInput(rawInput);
      let result: z.infer<typeof ResponseSchema>;
      try {
        result = ResponseSchema.parse(
          await post('/v1/consumer-identity/assertions/exchange', {
            ...input,
            riskContext: riskContext(context),
          }),
        );
      } catch (error) {
        if (
          error instanceof LifeConsumerIdentityExchangeRejectedError ||
          error instanceof LifeConsumerIdentityExchangeRateLimitedError
        )
          throw error;
        throw new LifeConsumerIdentityExchangeUnavailableError();
      }
      const current = now().getTime();
      const verifiedAt = Date.parse(result.verifiedAt);
      const expiresAt = Date.parse(result.expiresAt);
      if (
        result.provider !== input.provider ||
        !sameDigest(result.deviceIdSha256, digest(input.deviceId)) ||
        (result.provider === 'MOBILE_OTP' && result.authLevel !== 'PHONE_BOUND') ||
        (result.authLevel === 'PHONE_BOUND' && !result.mobileHash) ||
        verifiedAt > current + 30_000 ||
        current - verifiedAt > 120_000 ||
        expiresAt <= current ||
        expiresAt - current > 300_000
      )
        throw new LifeConsumerIdentityExchangeRejectedError();
      return {
        provider: result.provider,
        assertionId: result.assertionId,
        unionIdentifierHash: result.unionIdentifierHash,
        authSubjectHash: result.authSubjectHash,
        ...(result.mobileHash ? { mobileHash: result.mobileHash } : {}),
        authLevel: result.authLevel,
        deviceId: input.deviceId,
      };
    },

    async requestMobileOtp(rawInput, context) {
      const input = MobileOtpChallengeInputSchema.parse(rawInput);
      let result: z.infer<typeof MobileOtpChallengeResponseSchema>;
      try {
        result = MobileOtpChallengeResponseSchema.parse(
          await post('/v1/consumer-identity/mobile-otp/challenges', {
            ...input,
            riskContext: riskContext(context),
          }),
        );
      } catch (error) {
        if (
          error instanceof LifeConsumerIdentityExchangeRejectedError ||
          error instanceof LifeConsumerIdentityExchangeRateLimitedError
        )
          throw error;
        throw new LifeConsumerIdentityExchangeUnavailableError();
      }
      const expiresAt = Date.parse(result.expiresAt);
      if (expiresAt <= now().getTime() || expiresAt - now().getTime() > 600_000)
        throw new LifeConsumerIdentityExchangeRejectedError();
      return result;
    },

    async verifyMobileOtp(rawInput, context) {
      const input = MobileOtpVerificationInputSchema.parse(rawInput);
      let result: z.infer<typeof MobileOtpVerificationResponseSchema>;
      try {
        result = MobileOtpVerificationResponseSchema.parse(
          await post('/v1/consumer-identity/mobile-otp/assertions', {
            ...input,
            riskContext: riskContext(context),
          }),
        );
      } catch (error) {
        if (
          error instanceof LifeConsumerIdentityExchangeRejectedError ||
          error instanceof LifeConsumerIdentityExchangeRateLimitedError
        )
          throw error;
        throw new LifeConsumerIdentityExchangeUnavailableError();
      }
      const current = now().getTime();
      if (
        !sameDigest(result.deviceIdSha256, digest(input.deviceId)) ||
        Date.parse(result.expiresAt) <= current ||
        Date.parse(result.expiresAt) - current > 300_000
      )
        throw new LifeConsumerIdentityExchangeRejectedError();
      return { assertion: result.assertion, deviceId: input.deviceId };
    },
  };
}
