import { describe, expect, it, vi } from 'vitest';
import { createLifeSessionClient, parsePaymentCredential } from './life-session.js';

function storageFixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getStorageSync: vi.fn((key) => values.get(key)),
    setStorageSync: vi.fn((key, value) => values.set(key, value)),
    removeStorageSync: vi.fn((key) => values.delete(key)),
    values,
  };
}

const session = (accessToken = 'access-one', refreshToken = 'refresh-one'.padEnd(40, '-')) => ({
  accessToken,
  refreshToken,
  identity: { accountId: 'account-1', sessionId: 'session-1', authLevel: 'WECHAT' },
});

describe('life consumer session client', () => {
  it('uses the platform UniApp storage APIs by default', () => {
    const storage = storageFixture({ 'lequ.life.consumer.session.v1': session() });
    vi.stubGlobal('uni', storage);
    try {
      expect(createLifeSessionClient().load()).toEqual(session());
      expect(storage.getStorageSync).toHaveBeenCalledWith('lequ.life.consumer.session.v1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts only bounded JSON payment credentials and ignores a provider override', () => {
    expect(
      parsePaymentCredential('{"timeStamp":"1","nonceStr":"n","provider":"attacker"}'),
    ).toEqual({
      timeStamp: '1',
      nonceStr: 'n',
    });
    expect(() => parsePaymentCredential('not-json')).toThrow('INVALID_PAYMENT_CREDENTIAL');
    expect(() => parsePaymentCredential('[]')).toThrow('INVALID_PAYMENT_CREDENTIAL');
  });

  it('persists a stable device binding and never sends it as an authorization token', async () => {
    const storage = storageFixture();
    const transport = { request: vi.fn().mockResolvedValue({ statusCode: 200, data: session() }) };
    const client = createLifeSessionClient({ transport, storage, apiBase: '' });
    await client.exchange('WECHAT', 'one-time-assertion-value');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/life/auth/sessions/exchange',
        data: expect.objectContaining({ deviceId: expect.stringMatching(/^life-/u) }),
      }),
    );
    expect([...storage.values.values()]).not.toContain('one-time-assertion-value');
  });

  it('rotates once after a 401 and retries with the new access token', async () => {
    const storage = storageFixture({ 'lequ.life.consumer.session.v1': session() });
    const transport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ statusCode: 401, data: { code: 'INVALID_LIFE_CONSUMER_SESSION' } })
        .mockResolvedValueOnce({ statusCode: 200, data: session('access-two', 'refresh-two') })
        .mockResolvedValueOnce({ statusCode: 200, data: [{ id: 'store-1' }] }),
    };
    const client = createLifeSessionClient({ transport, storage, apiBase: '' });
    await expect(client.request('/api/v1/life/discovery/stores')).resolves.toEqual([
      { id: 'store-1' },
    ]);
    expect(transport.request.mock.calls[2][0].header.Authorization).toBe('Bearer access-two');
  });

  it('clears a rejected refresh instead of looping indefinitely', async () => {
    const storage = storageFixture({ 'lequ.life.consumer.session.v1': session() });
    const transport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ statusCode: 401, data: {} })
        .mockResolvedValueOnce({ statusCode: 401, data: {} }),
    };
    const client = createLifeSessionClient({ transport, storage, apiBase: '' });
    await expect(client.request('/api/v1/life/cart')).rejects.toMatchObject({ status: 401 });
    expect(client.load()).toBeNull();
    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it('revokes the server session before clearing the browser credential', async () => {
    const storage = storageFixture({ 'lequ.life.consumer.session.v1': session() });
    const transport = { request: vi.fn().mockResolvedValue({ statusCode: 204 }) };
    const client = createLifeSessionClient({ transport, storage, apiBase: '' });
    await client.logout();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/life/auth/sessions/revoke',
        method: 'POST',
        header: { Authorization: 'Bearer access-one' },
      }),
    );
    expect(client.load()).toBeNull();
  });

  it('exchanges a mobile OTP challenge without persisting the phone number or code', async () => {
    const storage = storageFixture();
    const transport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          statusCode: 200,
          data: {
            challengeId: 'mobile-challenge-0001',
            maskedDestination: '138****0000',
          },
        })
        .mockResolvedValueOnce({ statusCode: 200, data: session() }),
    };
    const client = createLifeSessionClient({ transport, storage, apiBase: '' });
    const challenge = await client.requestMobileOtp('+8613800000000');
    await client.exchangeMobileOtp(challenge.challengeId, '123456');
    expect(transport.request.mock.calls.map(([request]) => request.url)).toEqual([
      '/api/v1/life/auth/mobile-otp/challenges',
      '/api/v1/life/auth/mobile-otp/assertions/exchange',
    ]);
    expect(JSON.stringify([...storage.values.values()])).not.toContain('+8613800000000');
    expect(JSON.stringify([...storage.values.values()])).not.toContain('123456');
  });
});
