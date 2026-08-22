import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createHttpIdentityExchangeGateway,
  IdentityExchangeRejectedError,
  IdentityExchangeRateLimitedError,
  IdentityExchangeUnavailableError,
} from './identity-exchange-http-adapter.js';
import { buildApp } from './app.js';

const now = new Date('2026-08-19T08:00:00.000Z');
const input = {
  provider: 'ENTERPRISE_WECOM' as const,
  assertion: 'one-time-assertion-value',
  deviceId: 'device-fingerprint-0001',
};
const riskContext = { sourceIp: '203.0.113.10', userAgent: 'LequBrowser/6.1' };
const responseBody = {
  provider: input.provider,
  assertionId: 'assertion-receipt-0001',
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  authLevel: 'MFA' as const,
  deviceIdSha256: createHash('sha256').update(input.deviceId).digest('hex'),
  verifiedAt: '2026-08-19T07:59:30.000Z',
  expiresAt: '2026-08-19T08:02:00.000Z',
  riskDecision: 'ALLOW',
  rateLimitPolicyVersion: 'login-risk-v1',
};

describe('HTTP identity exchange gateway', () => {
  it('exchanges a one-time assertion and retains only canonical identity data', async () => {
    const fetchImpl = vi.fn(async () => Response.json(responseBody));
    const gateway = createHttpIdentityExchangeGateway({
      baseUrl: 'https://identity.example.com',
      serviceToken: 'service-token-123456',
      fetchImpl,
      now: () => now,
    });

    await expect(gateway.exchange(input, riskContext)).resolves.toMatchObject({
      tenantId: responseBody.tenantId,
      userId: responseBody.userId,
      authLevel: 'MFA',
      deviceId: input.deviceId,
    });
    const [, request] = (
      fetchImpl.mock.calls as unknown as Array<[URL, RequestInit | undefined]>
    )[0]!;
    expect(request?.headers).toMatchObject({ authorization: 'Bearer service-token-123456' });
    expect(request?.body).toBe(JSON.stringify({ ...input, riskContext }));
  });

  it('issues a session only from gateway-owned identity fields', async () => {
    const exchange = vi.fn(async () => ({
      ...responseBody,
      deviceId: input.deviceId,
    }));
    const issue = vi.fn(
      async (identity: {
        tenantId: string;
        userId: string;
        authLevel: 'PASSWORD' | 'MFA';
        deviceId: string;
      }) => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token-refresh-token-refresh-token',
        accessTokenExpiresAt: '2026-08-19T08:15:00.000Z',
        sessionExpiresAt: '2026-09-18T08:00:00.000Z',
        identity: {
          ...identity,
          roleCodes: ['MERCHANT_OWNER'],
          storeIds: [],
          sessionId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    );
    const app = await buildApp({
      identityExchange: { exchange },
      authAuditHasher: (purpose, value) =>
        createHash('sha256').update(`${purpose}\0${value}`).digest('hex'),
      authSessions: {
        issue,
        refresh: vi.fn(),
        revoke: vi.fn(),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sessions/exchange',
      payload: {
        ...input,
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        authLevel: 'PASSWORD',
      },
      headers: { 'user-agent': riskContext.userAgent },
    });

    expect(response.statusCode).toBe(200);
    expect(exchange).toHaveBeenCalledWith(input, {
      sourceIp: '127.0.0.1',
      userAgent: riskContext.userAgent,
    });
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: responseBody.tenantId,
        userId: responseBody.userId,
        authLevel: 'MFA',
        deviceId: input.deviceId,
        audit: expect.objectContaining({
          action: 'auth.session.issued',
          provider: input.provider,
          ipHash: createHash('sha256').update(['ip', '127.0.0.1'].join('\0')).digest('hex'),
          userAgentHash: createHash('sha256')
            .update(`user-agent\0${riskContext.userAgent}`)
            .digest('hex'),
          assertionIdHash: createHash('sha256')
            .update(`assertion\0${responseBody.assertionId}`)
            .digest('hex'),
        }),
      }),
    );
    await app.close();
  });

  it('returns a distinct generic response when the provider rate limits the assertion', async () => {
    const app = await buildApp({
      identityExchange: {
        exchange: vi.fn(async () => {
          throw new IdentityExchangeRateLimitedError();
        }),
      },
      authSessions: { issue: vi.fn(), refresh: vi.fn(), revoke: vi.fn() },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sessions/exchange',
      payload: input,
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ code: 'IDENTITY_RATE_LIMITED' });
    await app.close();
  });

  it('rejects non-HTTPS remote gateways and weak service tokens', () => {
    expect(() =>
      createHttpIdentityExchangeGateway({
        baseUrl: 'http://identity.example.com',
        serviceToken: 'service-token-123456',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      createHttpIdentityExchangeGateway({
        baseUrl: 'https://identity.example.com',
        serviceToken: 'short',
      }),
    ).toThrow('at least 16 bytes');
  });

  it('rejects provider, device, freshness and expiry binding drift', async () => {
    for (const drift of [
      { provider: 'PHONE_OTP' },
      { deviceIdSha256: '0'.repeat(64) },
      { verifiedAt: '2026-08-19T07:57:00.000Z' },
      { expiresAt: '2026-08-19T08:06:00.000Z' },
    ]) {
      const gateway = createHttpIdentityExchangeGateway({
        baseUrl: 'https://identity.example.com',
        serviceToken: 'service-token-123456',
        fetchImpl: vi.fn(async () => Response.json({ ...responseBody, ...drift })),
        now: () => now,
      });
      await expect(gateway.exchange(input, riskContext)).rejects.toBeInstanceOf(
        IdentityExchangeRejectedError,
      );
    }
  });

  it('separates rejected assertions from gateway outages and invalid responses', async () => {
    const denied = createHttpIdentityExchangeGateway({
      baseUrl: 'https://identity.example.com',
      serviceToken: 'service-token-123456',
      fetchImpl: vi.fn(async () => new Response(null, { status: 409 })),
    });
    await expect(denied.exchange(input, riskContext)).rejects.toBeInstanceOf(
      IdentityExchangeRejectedError,
    );

    const rateLimited = createHttpIdentityExchangeGateway({
      baseUrl: 'https://identity.example.com',
      serviceToken: 'service-token-123456',
      fetchImpl: vi.fn(async () => new Response(null, { status: 429 })),
    });
    await expect(rateLimited.exchange(input, riskContext)).rejects.toBeInstanceOf(
      IdentityExchangeRateLimitedError,
    );

    for (const fetchImpl of [
      vi.fn(async () => new Response(null, { status: 503 })),
      vi.fn(async () => Response.json({ invalid: true })),
      vi.fn(async () => {
        throw new Error('network');
      }),
    ]) {
      const gateway = createHttpIdentityExchangeGateway({
        baseUrl: 'https://identity.example.com',
        serviceToken: 'service-token-123456',
        fetchImpl,
      });
      await expect(gateway.exchange(input, riskContext)).rejects.toBeInstanceOf(
        IdentityExchangeUnavailableError,
      );
    }
  });
});
