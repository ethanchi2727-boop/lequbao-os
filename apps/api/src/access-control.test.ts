import { describe, expect, it, vi } from 'vitest';
import {
  InactiveSessionError,
  PermissionDeniedError,
  TenantWriteSuspendedError,
  createAccessControlService,
} from './access-control.js';

const identity = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'session-1',
};

function pool(sessionRows: unknown[], grantRows: unknown[]) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM user_sessions'))
      return { rows: sessionRows, rowCount: sessionRows.length };
    if (sql.includes('FROM member_role_assignments'))
      return { rows: grantRows, rowCount: grantRows.length };
    return { rows: [], rowCount: 0 };
  });
  return {
    query,
    service: createAccessControlService({
      connect: async () => ({ query, release: vi.fn() }),
    } as never),
  };
}

describe('database-backed access control', () => {
  it('validates an active session without granting an unrelated permission', async () => {
    const fixture = pool(
      [{ auth_level: 'PASSWORD', risk_level: 'LOW', tenant_status: 'ACTIVE' }],
      [],
    );
    await expect(fixture.service.validate(identity)).resolves.toEqual(identity);
    expect(fixture.query.mock.calls.some(([sql]) => String(sql).includes('role_permissions'))).toBe(
      false,
    );
  });

  it('requires a live session and intersects token roles with current grants', async () => {
    const fixture = pool(
      [{ auth_level: 'MFA', risk_level: 'LOW', tenant_status: 'ACTIVE' }],
      [
        { access_scope: 'TENANT', store_id: null },
        { access_scope: 'STORE', store_id: '10000000-0000-4000-8000-000000000003' },
      ],
    );
    await expect(
      fixture.service.authorize(identity, 'merchant.intake.confirm', {
        mfaRequired: true,
        write: true,
      }),
    ).resolves.toMatchObject({
      accessScopes: ['TENANT', 'STORE'],
      assignedStoreIds: ['10000000-0000-4000-8000-000000000003'],
    });
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('assignment.role_code = ANY'),
      expect.arrayContaining([identity.roleCodes, 'merchant.intake.confirm']),
    );
  });

  it('rejects revoked, expired, disabled or blocked sessions without checking grants', async () => {
    const missing = pool([], [{ access_scope: 'TENANT', store_id: null }]);
    await expect(missing.service.authorize(identity, 'merchant.intake.read')).rejects.toThrow(
      InactiveSessionError,
    );
    expect(missing.query.mock.calls.some(([sql]) => String(sql).includes('role_permissions'))).toBe(
      false,
    );

    const blocked = pool(
      [{ auth_level: 'MFA', risk_level: 'BLOCKED', tenant_status: 'ACTIVE' }],
      [],
    );
    await expect(blocked.service.authorize(identity, 'merchant.intake.read')).rejects.toThrow(
      InactiveSessionError,
    );
  });

  it('enforces MFA, current permissions and tenant write suspension', async () => {
    const passwordOnly = pool(
      [{ auth_level: 'PASSWORD', risk_level: 'LOW', tenant_status: 'ACTIVE' }],
      [{ access_scope: 'TENANT', store_id: null }],
    );
    await expect(
      passwordOnly.service.authorize(identity, 'distribution.pay', { mfaRequired: true }),
    ).rejects.toThrow(PermissionDeniedError);

    const noGrant = pool([{ auth_level: 'MFA', risk_level: 'LOW', tenant_status: 'ACTIVE' }], []);
    await expect(noGrant.service.authorize(identity, 'refund.approve')).rejects.toThrow(
      PermissionDeniedError,
    );

    const suspended = pool(
      [{ auth_level: 'MFA', risk_level: 'LOW', tenant_status: 'SUSPENDED' }],
      [{ access_scope: 'TENANT', store_id: null }],
    );
    await expect(
      suspended.service.authorize(identity, 'merchant.intake.write', { write: true }),
    ).rejects.toThrow(TenantWriteSuspendedError);
  });
});
