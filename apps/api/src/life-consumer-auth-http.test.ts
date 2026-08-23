import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LifeConsumerAuthRejectedError,
  LifeConsumerRefreshRejectedError,
} from './life-consumer-auth-service.js';
import {
  LifeConsumerIdentityExchangeRateLimitedError,
  LifeConsumerIdentityExchangeUnavailableError,
} from './life-consumer-identity-exchange-http-adapter.js';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;
const tokens = {
  accessToken: 'signed-life-access',
  refreshToken: 'rotated-life-refresh-token-with-thirty-two-bytes',
  accessTokenExpiresAt: '2026-08-23T02:00:00.000Z',
  sessionExpiresAt: '2026-08-30T02:00:00.000Z',
  identity: {
    accountId: '00000000-0000-4000-8000-000000000001',
    sessionId: '00000000-0000-4000-8000-000000000002',
    authLevel: 'WECHAT' as const,
  },
};

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('life consumer authentication HTTP boundary', () => {
  it('forwards only the assertion plus server-observed request context', async () => {
    const exchange = vi.fn().mockResolvedValue(tokens);
    app = await buildApp({
      lifeConsumerAuth: {
        exchange,
        requestMobileOtp: vi.fn(),
        exchangeMobileOtp: vi.fn(),
        refresh: vi.fn(),
        revoke: vi.fn(),
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/life/auth/sessions/exchange',
      headers: { 'user-agent': 'lequ-life-test' },
      payload: {
        provider: 'WECHAT',
        assertion: 'one-time-wechat-assertion',
        deviceId: 'device-fingerprint-1234',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(tokens);
    expect(exchange).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'WECHAT' }),
      expect.objectContaining({ sourceIp: '127.0.0.1', userAgent: 'lequ-life-test' }),
    );
  });

  it('fails closed when the consumer authentication service is absent', async () => {
    app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/life/auth/sessions/exchange',
      payload: {},
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'LIFE_AUTHENTICATION_UNAVAILABLE' });
  });

  it.each([
    [new LifeConsumerAuthRejectedError(), 401, 'INVALID_LIFE_IDENTITY_ASSERTION'],
    [new LifeConsumerIdentityExchangeRateLimitedError(), 429, 'LIFE_IDENTITY_RATE_LIMITED'],
    [new LifeConsumerIdentityExchangeUnavailableError(), 503, 'LIFE_IDENTITY_PROVIDER_UNAVAILABLE'],
  ])('maps exchange failures without leaking identity state', async (error, status, code) => {
    app = await buildApp({
      lifeConsumerAuth: {
        exchange: vi.fn().mockRejectedValue(error),
        requestMobileOtp: vi.fn(),
        exchangeMobileOtp: vi.fn(),
        refresh: vi.fn(),
        revoke: vi.fn(),
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/life/auth/sessions/exchange',
      payload: {
        provider: 'WECHAT',
        assertion: 'one-time-wechat-assertion',
        deviceId: 'device-fingerprint-1234',
      },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ code });
  });

  it('returns a rotated refresh credential and rejects stale credentials', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(tokens)
      .mockRejectedValueOnce(new LifeConsumerRefreshRejectedError());
    app = await buildApp({
      lifeConsumerAuth: {
        exchange: vi.fn(),
        requestMobileOtp: vi.fn(),
        exchangeMobileOtp: vi.fn(),
        refresh,
        revoke: vi.fn(),
      },
    });
    const request = {
      method: 'POST' as const,
      url: '/api/v1/life/auth/sessions/refresh',
      payload: {
        accountId: tokens.identity.accountId,
        sessionId: tokens.identity.sessionId,
        refreshToken: 'previous-refresh-token-with-thirty-two-bytes',
        deviceId: 'device-fingerprint-1234',
      },
    };
    expect((await app.inject(request)).statusCode).toBe(200);
    const rejected = await app.inject(request);
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toEqual({ code: 'INVALID_LIFE_IDENTITY_ASSERTION' });
  });

  it('revokes a signed Life session and returns no credential material', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    app = await buildApp({
      lifeConsumerSession: { verify: vi.fn(() => tokens.identity) },
      lifeConsumerAuth: {
        exchange: vi.fn(),
        requestMobileOtp: vi.fn(),
        exchangeMobileOtp: vi.fn(),
        refresh: vi.fn(),
        revoke,
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/life/auth/sessions/revoke',
      headers: { authorization: 'Bearer signed-life-access' },
      payload: { reason: 'USER_LOGOUT' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(revoke).toHaveBeenCalledWith(tokens.identity, 'USER_LOGOUT');
  });

  it('forwards mobile OTP challenge and verification through the trusted gateway service', async () => {
    const requestMobileOtp = vi.fn().mockResolvedValue({
      challengeId: 'mobile-challenge-0001',
      maskedDestination: '138****0000',
      expiresAt: '2026-08-23T02:05:00.000Z',
      resendAfterSeconds: 60,
    });
    const exchangeMobileOtp = vi.fn().mockResolvedValue(tokens);
    app = await buildApp({
      lifeConsumerAuth: {
        exchange: vi.fn(),
        requestMobileOtp,
        exchangeMobileOtp,
        refresh: vi.fn(),
        revoke: vi.fn(),
      },
    });
    const challenge = await app.inject({
      method: 'POST',
      url: '/api/v1/life/auth/mobile-otp/challenges',
      headers: { 'user-agent': 'life-h5' },
      payload: { mobile: '+8613800000000', deviceId: 'device-fingerprint-1234' },
    });
    expect(challenge.statusCode).toBe(200);
    const exchange = await app.inject({
      method: 'POST',
      url: '/api/v1/life/auth/mobile-otp/assertions/exchange',
      headers: { 'user-agent': 'life-h5' },
      payload: {
        challengeId: 'mobile-challenge-0001',
        code: '123456',
        deviceId: 'device-fingerprint-1234',
      },
    });
    expect(exchange.statusCode).toBe(200);
    expect(requestMobileOtp).toHaveBeenCalledWith(
      expect.objectContaining({ mobile: '+8613800000000' }),
      expect.objectContaining({ sourceIp: '127.0.0.1', userAgent: 'life-h5' }),
    );
    expect(exchangeMobileOtp).toHaveBeenCalledWith(
      expect.objectContaining({ code: '123456' }),
      expect.objectContaining({ sourceIp: '127.0.0.1' }),
    );
  });
});
