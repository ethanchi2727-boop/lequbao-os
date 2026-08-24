import { describe, expect, it, vi } from 'vitest';
import { createBaoSessionClient } from './bao-session.js';

function storageFixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getStorageSync: vi.fn((key) => values.get(key)),
    setStorageSync: vi.fn((key, value) => values.set(key, value)),
    removeStorageSync: vi.fn((key) => values.delete(key)),
  };
}
const session = (accessToken = 'employee-access-one') => ({
  accessToken,
  refreshToken: 'employee-refresh-token-with-thirty-two-bytes',
  identity: {
    tenantId: 'tenant-1',
    userId: 'user-1',
    sessionId: 'session-1',
    roleCodes: ['MERCHANT_OWNER'],
    storeIds: [],
    authLevel: 'MFA',
  },
});

describe('bao employee session client', () => {
  it('uses the platform UniApp storage APIs by default', () => {
    const storage = storageFixture({ 'lequ.bao.employee.session.v1': session() });
    vi.stubGlobal('uni', storage);
    try {
      expect(createBaoSessionClient().load()).toEqual(session());
      expect(storage.getStorageSync).toHaveBeenCalledWith('lequ.bao.employee.session.v1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exchanges an enterprise assertion without persisting it', async () => {
    const storage = storageFixture();
    const transport = { request: vi.fn().mockResolvedValue({ statusCode: 200, data: session() }) };
    const client = createBaoSessionClient({ transport, storage, apiBase: '' });
    await client.exchange('one-time-enterprise-assertion');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/auth/sessions/exchange',
        data: expect.objectContaining({ provider: 'ENTERPRISE_WECOM' }),
      }),
    );
  });

  it('refreshes once after 401 with the current employee scope', async () => {
    const storage = storageFixture({ 'lequ.bao.employee.session.v1': session() });
    const transport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ statusCode: 401, data: {} })
        .mockResolvedValueOnce({ statusCode: 200, data: session('employee-access-two') })
        .mockResolvedValueOnce({ statusCode: 200, data: { timezone: 'Asia/Shanghai' } }),
    };
    const client = createBaoSessionClient({ transport, storage, apiBase: '' });
    await expect(client.request('/api/v1/operational-home/today')).resolves.toMatchObject({
      timezone: 'Asia/Shanghai',
    });
    expect(transport.request.mock.calls[2][0].header.Authorization).toBe(
      'Bearer employee-access-two',
    );
  });

  it('switches tenant through a server-issued session and saves the whole replacement', async () => {
    const storage = storageFixture({ 'lequ.bao.employee.session.v1': session() });
    const replacement = {
      ...session('employee-access-two'),
      identity: { ...session().identity, tenantId: 'tenant-2', roleCodes: ['STORE_MANAGER'] },
    };
    const transport = {
      request: vi.fn().mockResolvedValue({ statusCode: 200, data: replacement }),
    };
    const client = createBaoSessionClient({ transport, storage, apiBase: '' });
    await expect(client.switchTenant('tenant-2')).resolves.toEqual(replacement);
    expect(client.load()).toEqual(replacement);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/auth/sessions/switch-tenant',
        method: 'POST',
        data: expect.objectContaining({ tenantId: 'tenant-2' }),
        header: { Authorization: 'Bearer employee-access-one' },
      }),
    );
  });

  it('revokes the server session before local logout', async () => {
    const storage = storageFixture({ 'lequ.bao.employee.session.v1': session() });
    const transport = { request: vi.fn().mockResolvedValue({ statusCode: 204 }) };
    const client = createBaoSessionClient({ transport, storage, apiBase: '' });
    await client.logout();
    expect(client.load()).toBeNull();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/auth/sessions/revoke' }),
    );
  });
});
