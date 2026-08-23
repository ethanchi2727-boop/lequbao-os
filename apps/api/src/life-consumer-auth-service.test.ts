import { describe, expect, it, vi } from 'vitest';
import type { LifeConsumerIdentityExchangeGateway } from './life-consumer-identity-exchange-http-adapter.js';
import {
  createLifeConsumerAuthService,
  LifeConsumerAuthRejectedError,
  LifeConsumerRefreshRejectedError,
  LifeConsumerRevokeRejectedError,
} from './life-consumer-auth-service.js';

const accountId = '53000000-0000-4000-8000-000000000001';
const sessionId = '53000000-0000-4000-8000-000000000002';
const verified = {
  provider: 'WECHAT' as const,
  assertionId: 'one-time-assertion-0001',
  unionIdentifierHash: 'a'.repeat(64),
  authSubjectHash: 'b'.repeat(64),
  authLevel: 'WECHAT' as const,
  deviceId: 'consumer-device-0001',
};

function fixture(databaseError?: { code: string }) {
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (databaseError) throw databaseError;
    return {
      rows: [
        {
          account_id: accountId,
          session_id: sql.includes('refresh_') ? sessionId : (values[4] as string),
          auth_level: sql.includes('refresh_') ? 'WECHAT' : (values[3] as string),
          expires_at: new Date(Date.now() + 86_400_000),
        },
      ],
      rowCount: 1,
    };
  });
  const release = vi.fn();
  const gateway: LifeConsumerIdentityExchangeGateway = {
    exchange: vi.fn(async (input) =>
      input.provider === 'MOBILE_OTP'
        ? {
            ...verified,
            provider: 'MOBILE_OTP' as const,
            authLevel: 'PHONE_BOUND' as const,
            mobileHash: 'c'.repeat(64),
          }
        : verified,
    ),
    requestMobileOtp: vi.fn(async () => ({
      challengeId: 'mobile-challenge-0001',
      maskedDestination: '138****0000',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 60,
    })),
    verifyMobileOtp: vi.fn(async (input) => ({
      assertion: 'mobile-otp-assertion-value',
      deviceId: input.deviceId,
    })),
  };
  const signer = { sign: vi.fn(() => 'signed-life-access-token') };
  const service = createLifeConsumerAuthService(
    { connect: vi.fn(async () => ({ query, release })) } as never,
    signer,
    gateway,
  );
  return { service, query, release, gateway, signer };
}

describe('life consumer auth service', () => {
  it('consumes verified identity evidence and stores only hashes', async () => {
    const fx = fixture();
    const result = await fx.service.exchange(
      { provider: 'WECHAT', assertion: 'consumer-assertion-value', deviceId: verified.deviceId },
      { sourceIp: '203.0.113.8', userAgent: 'mini-program' },
    );
    expect(result).toMatchObject({
      accessToken: 'signed-life-access-token',
      identity: { accountId, authLevel: 'WECHAT' },
    });
    const values = fx.query.mock.calls[0]?.[1] as unknown[];
    expect(values).not.toContain(verified.assertionId);
    expect(values).not.toContain(verified.deviceId);
    expect(values[6]).toMatch(/^[a-f0-9]{64}$/u);
    expect(values[7]).toMatch(/^[a-f0-9]{64}$/u);
    expect(fx.release).toHaveBeenCalledOnce();
  });

  it('rotates refresh credentials for the same device-bound session', async () => {
    const fx = fixture();
    const result = await fx.service.refresh({
      accountId,
      sessionId,
      refreshToken: 'r'.repeat(43),
      deviceId: verified.deviceId,
    });
    expect(result.refreshToken).not.toBe('r'.repeat(43));
    expect(fx.query.mock.calls[0]?.[0]).toContain('refresh_platform_consumer_session');
  });

  it('maps assertion replay and rejected refresh to stable domain failures', async () => {
    await expect(
      fixture({ code: '23505' }).service.exchange(
        { provider: 'WECHAT', assertion: 'consumer-assertion-value', deviceId: verified.deviceId },
        { sourceIp: '203.0.113.8', userAgent: 'mini-program' },
      ),
    ).rejects.toBeInstanceOf(LifeConsumerAuthRejectedError);
    await expect(
      fixture({ code: '28000' }).service.refresh({
        accountId,
        sessionId,
        refreshToken: 'r'.repeat(43),
        deviceId: verified.deviceId,
      }),
    ).rejects.toBeInstanceOf(LifeConsumerRefreshRejectedError);
  });

  it('revokes only the authenticated platform consumer session', async () => {
    const fx = fixture();
    (fx.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ revoked: true }],
      rowCount: 1,
    });
    await expect(
      fx.service.revoke({ accountId, sessionId, authLevel: 'WECHAT' }, 'USER_LOGOUT'),
    ).resolves.toBeUndefined();
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining('revoke_platform_consumer_session'),
      [accountId, sessionId, 'USER_LOGOUT'],
    );

    const rejected = fixture();
    (rejected.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ revoked: false }],
      rowCount: 1,
    });
    await expect(
      rejected.service.revoke({ accountId, sessionId, authLevel: 'WECHAT' }),
    ).rejects.toBeInstanceOf(LifeConsumerRevokeRejectedError);
  });

  it('turns a verified mobile OTP challenge into a phone-bound session', async () => {
    const fx = fixture();
    await expect(
      fx.service.requestMobileOtp(
        { mobile: '+8613800000000', deviceId: verified.deviceId },
        { sourceIp: '203.0.113.8', userAgent: 'h5' },
      ),
    ).resolves.toMatchObject({ maskedDestination: '138****0000' });
    await expect(
      fx.service.exchangeMobileOtp(
        { challengeId: 'mobile-challenge-0001', code: '123456', deviceId: verified.deviceId },
        { sourceIp: '203.0.113.8', userAgent: 'h5' },
      ),
    ).resolves.toMatchObject({ identity: { authLevel: 'PHONE_BOUND' } });
    expect(fx.gateway.exchange).toHaveBeenCalledWith(
      {
        provider: 'MOBILE_OTP',
        assertion: 'mobile-otp-assertion-value',
        deviceId: verified.deviceId,
      },
      { sourceIp: '203.0.113.8', userAgent: 'h5' },
    );
  });
});
