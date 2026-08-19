import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthSubjectInactiveError,
  RefreshSessionInvalidError,
  createAuthSessionService,
} from './auth-session-service.js';

const tenantId = '30000000-0000-4000-8000-000000000001';
const userId = '30000000-0000-4000-8000-000000000002';
const deviceId = 'device-fingerprint-at-least-16';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture(handler: (sql: string, values?: readonly unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    const rows = handler(sql, values);
    return { rows, rowCount: rows.length };
  });
  const sign = vi.fn(() => 'signed-access-token');
  return {
    query,
    sign,
    service: createAuthSessionService(
      { connect: async () => ({ query, release: vi.fn() }) } as never,
      { sign },
      { accessTtlSeconds: 300, sessionTtlSeconds: 3600 },
    ),
  };
}

describe('revocable auth session lifecycle', () => {
  it('derives roles from current assignments and stores only refresh/device hashes', async () => {
    const value = fixture((sql) =>
      sql.includes('FROM tenant_memberships')
        ? [
            { role_code: 'MERCHANT_OWNER', store_id: null },
            { role_code: 'STORE_MANAGER', store_id: '30000000-0000-4000-8000-000000000003' },
          ]
        : [],
    );
    const result = await value.service.issue({ tenantId, userId, authLevel: 'MFA', deviceId });
    expect(result).toMatchObject({
      accessToken: 'signed-access-token',
      identity: {
        tenantId,
        userId,
        roleCodes: ['MERCHANT_OWNER', 'STORE_MANAGER'],
        storeIds: ['30000000-0000-4000-8000-000000000003'],
        authLevel: 'MFA',
      },
    });
    const insertCall = value.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO user_sessions'),
    );
    expect(insertCall?.[1]).toContain(digest(result.refreshToken));
    expect(insertCall?.[1]).toContain(digest(deviceId));
    expect(insertCall?.[1]).not.toContain(result.refreshToken);
  });

  it('rejects issuance when membership, user, tenant or current role assignment is inactive', async () => {
    const value = fixture(() => []);
    await expect(
      value.service.issue({ tenantId, userId, authLevel: 'PASSWORD', deviceId }),
    ).rejects.toThrow(AuthSubjectInactiveError);
  });

  it('rotates a valid device-bound refresh token and rejects mismatches', async () => {
    const refreshToken = 'refresh-token-value-that-is-long-enough';
    const valid = fixture((sql) => {
      if (sql.includes('FROM user_sessions'))
        return [
          {
            refresh_token_hash: digest(refreshToken),
            device_fingerprint_hash: digest(deviceId),
            auth_level: 'MFA',
            expires_at: new Date(Date.now() + 3600_000),
          },
        ];
      if (sql.includes('FROM tenant_memberships'))
        return [{ role_code: 'MERCHANT_OWNER', store_id: null }];
      return [];
    });
    const result = await valid.service.refresh({
      tenantId,
      userId,
      sessionId: '30000000-0000-4000-8000-000000000004',
      refreshToken,
      deviceId,
    });
    expect(result.refreshToken).not.toBe(refreshToken);
    expect(
      valid.query.mock.calls.some(([sql]) => String(sql).includes('SET refresh_token_hash')),
    ).toBe(true);

    const invalid = fixture((sql) =>
      sql.includes('FROM user_sessions')
        ? [
            {
              refresh_token_hash: digest('different-token-that-is-long-enough'),
              device_fingerprint_hash: digest(deviceId),
              auth_level: 'MFA',
              expires_at: new Date(Date.now() + 3600_000),
            },
          ]
        : [],
    );
    await expect(
      invalid.service.refresh({
        tenantId,
        userId,
        sessionId: '30000000-0000-4000-8000-000000000004',
        refreshToken,
        deviceId,
      }),
    ).rejects.toThrow(RefreshSessionInvalidError);
  });

  it('revokes the current session idempotently and removes its refresh secret', async () => {
    const value = fixture(() => []);
    await value.service.revoke(
      {
        tenantId,
        userId,
        roleCodes: ['MERCHANT_OWNER'],
        storeIds: [],
        sessionId: '30000000-0000-4000-8000-000000000004',
      },
      'USER_LOGOUT',
    );
    expect(value.query).toHaveBeenCalledWith(
      expect.stringContaining('refresh_token_hash = NULL'),
      expect.arrayContaining(['USER_LOGOUT']),
    );
  });
});
