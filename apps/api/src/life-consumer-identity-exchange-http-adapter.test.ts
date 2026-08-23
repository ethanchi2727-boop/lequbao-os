import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createHttpLifeConsumerIdentityExchangeGateway,
  LifeConsumerIdentityExchangeRejectedError,
  LifeConsumerIdentityExchangeUnavailableError,
} from './life-consumer-identity-exchange-http-adapter.js';

const now = new Date('2026-08-23T00:00:00.000Z');
const input = {
  provider: 'WECHAT' as const,
  assertion: 'verified-wechat-assertion',
  deviceId: 'device-identifier-0001',
};
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const validBody = {
  provider: 'WECHAT',
  assertionId: 'assertion-identifier-0001',
  unionIdentifierHash: sha('union'),
  authSubjectHash: sha('subject'),
  authLevel: 'WECHAT',
  deviceIdSha256: sha(input.deviceId),
  verifiedAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  riskDecision: 'ALLOW',
  rateLimitPolicyVersion: 'risk-v1',
};

describe('life consumer identity exchange gateway', () => {
  it('accepts a fresh device-bound provider result without returning raw identifiers', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validBody), { status: 200 }));
    const gateway = createHttpLifeConsumerIdentityExchangeGateway({
      baseUrl: 'http://127.0.0.1:3399',
      serviceToken: 'development-service-token',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => now,
    });
    await expect(
      gateway.exchange(input, { sourceIp: '127.0.0.1', userAgent: 'vitest' }),
    ).resolves.toMatchObject({
      unionIdentifierHash: validBody.unionIdentifierHash,
      authSubjectHash: validBody.authSubjectHash,
      deviceId: input.deviceId,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/v1/consumer-identity/assertions/exchange' }),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects mismatched device binding and invalid phone elevation', async () => {
    for (const body of [
      { ...validBody, deviceIdSha256: sha('other') },
      { ...validBody, provider: 'MOBILE_OTP', authLevel: 'WECHAT' },
    ]) {
      const gateway = createHttpLifeConsumerIdentityExchangeGateway({
        baseUrl: 'https://identity.example',
        serviceToken: 'production-service-token',
        fetchImpl: (async () =>
          new Response(JSON.stringify(body), { status: 200 })) as typeof fetch,
        now: () => now,
      });
      await expect(
        gateway.exchange(
          body.provider === 'MOBILE_OTP' ? { ...input, provider: 'MOBILE_OTP' } : input,
          { sourceIp: '203.0.113.5', userAgent: 'vitest' },
        ),
      ).rejects.toBeInstanceOf(LifeConsumerIdentityExchangeRejectedError);
    }
  });

  it('treats malformed success payloads as provider unavailability', async () => {
    const gateway = createHttpLifeConsumerIdentityExchangeGateway({
      baseUrl: 'https://identity.example',
      serviceToken: 'production-service-token',
      fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch,
      now: () => now,
    });
    await expect(
      gateway.exchange(input, { sourceIp: '203.0.113.5', userAgent: '' }),
    ).rejects.toBeInstanceOf(LifeConsumerIdentityExchangeUnavailableError);
  });

  it('creates and verifies a short-lived device-bound mobile OTP challenge', async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith('/challenges'))
        return new Response(
          JSON.stringify({
            challengeId: 'mobile-challenge-0001',
            maskedDestination: '138****0000',
            expiresAt: new Date(now.getTime() + 300_000).toISOString(),
            resendAfterSeconds: 60,
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          assertion: 'verified-mobile-otp-assertion',
          expiresAt: new Date(now.getTime() + 60_000).toISOString(),
          deviceIdSha256: sha(input.deviceId),
        }),
        { status: 200 },
      );
    });
    const gateway = createHttpLifeConsumerIdentityExchangeGateway({
      baseUrl: 'https://identity.example',
      serviceToken: 'production-service-token',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => now,
    });
    await expect(
      gateway.requestMobileOtp(
        { mobile: '+8613800000000', deviceId: input.deviceId },
        { sourceIp: '203.0.113.5', userAgent: 'life-h5' },
      ),
    ).resolves.toMatchObject({ maskedDestination: '138****0000' });
    await expect(
      gateway.verifyMobileOtp(
        { challengeId: 'mobile-challenge-0001', code: '123456', deviceId: input.deviceId },
        { sourceIp: '203.0.113.5', userAgent: 'life-h5' },
      ),
    ).resolves.toEqual({ assertion: 'verified-mobile-otp-assertion', deviceId: input.deviceId });
  });
});
