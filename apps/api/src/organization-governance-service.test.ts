import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createOrganizationGovernanceService,
  OrganizationGovernanceAuthorizationError,
  OrganizationGovernanceStateError,
} from './organization-governance-service.js';

const tenantId = '17000000-0000-4000-8000-000000000001';
const actorId = '17000000-0000-4000-8000-000000000002';
const targetId = '17000000-0000-4000-8000-000000000003';
const assignmentId = '17000000-0000-4000-8000-000000000004';
const identity: AuthorizationContext = {
  tenantId,
  userId: actorId,
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'session-1',
  accessScopes: ['TENANT'],
  assignedStoreIds: [],
};

function fixture(handler: (sql: string, values?: unknown[]) => unknown[]) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    statements.push({ sql, values });
    const rows = handler(sql, values);
    return { rows, rowCount: rows.length };
  });
  const client = { query, release: vi.fn() };
  return {
    statements,
    service: createOrganizationGovernanceService({
      connect: vi.fn(async () => client),
    } as unknown as Pick<pg.Pool, 'connect'>),
  };
}

describe('organization governance', () => {
  it('returns tenant members with safe role assignments and no identity hashes', async () => {
    const fx = fixture((sql) =>
      sql.includes('FROM tenant_memberships membership')
        ? [
            {
              user_id: targetId,
              display_name: '门店店长',
              user_status: 'ACTIVE',
              employee_no: 'E-01',
              membership_status: 'ACTIVE',
              joined_at: '2026-08-01T00:00:00.000Z',
              assignments: [{ assignmentId, roleCode: 'STORE_MANAGER' }],
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-01T00:00:00.000Z',
            },
          ]
        : [],
    );
    const result = await fx.service.listMembers(identity, {});
    expect(result).toEqual([
      expect.objectContaining({ userId: targetId, membershipStatus: 'ACTIVE' }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/mobile_hash|email_hash|avatar/iu);
  });

  it('rejects store-scoped identities before organization-wide SQL', async () => {
    const fx = fixture(() => []);
    const storeIdentity = { ...identity, accessScopes: ['STORE'], assignedStoreIds: ['store-1'] };
    expect(() => fx.service.listMembers(storeIdentity, {})).toThrow(
      OrganizationGovernanceAuthorizationError,
    );
    expect(fx.statements).toHaveLength(0);
  });

  it('assigns a role idempotently and writes a redacted audit event', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT membership_status')) return [{ membership_status: 'ACTIVE' }];
      if (sql.startsWith('INSERT INTO member_role_assignments'))
        return [
          {
            id: assignmentId,
            user_id: targetId,
            role_code: 'STORE_MANAGER',
            store_id: null,
            valid_until: null,
            created_at: '2026-08-01T00:00:00.000Z',
          },
        ];
      return [];
    });
    await expect(
      fx.service.assignRole({
        identity,
        idempotencyKey: 'assign-1',
        traceId: 'trace-1',
        body: { userId: targetId, roleCode: 'FINANCE' },
      }),
    ).resolves.toMatchObject({ id: assignmentId });
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
    expect(
      fx.statements.find(({ sql }) => sql.startsWith('INSERT INTO idempotency_keys'))?.values,
    ).toEqual([tenantId, 'organization.role.assign', 'assign-1', expect.any(String)]);
  });

  it('blocks platform role escalation and malformed store-role scope before SQL', async () => {
    const fx = fixture(() => []);
    expect(() =>
      fx.service.assignRole({
        identity,
        idempotencyKey: 'platform-escalation',
        traceId: 'trace-escalation',
        body: { userId: targetId, roleCode: 'PLATFORM_ADMIN' },
      }),
    ).toThrow(OrganizationGovernanceAuthorizationError);
    expect(() =>
      fx.service.assignRole({
        identity,
        idempotencyKey: 'missing-store',
        traceId: 'trace-store',
        body: { userId: targetId, roleCode: 'STORE_MANAGER' },
      }),
    ).toThrow(OrganizationGovernanceStateError);
    expect(fx.statements).toHaveLength(0);
  });

  it('refuses to revoke the last active merchant owner', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT id,user_id,role_code,store_id'))
        return [
          { id: assignmentId, user_id: targetId, role_code: 'MERCHANT_OWNER', store_id: null },
        ];
      if (sql.startsWith('SELECT count(*)::int')) return [{ count: 1 }];
      return [];
    });
    await expect(
      fx.service.revokeRole({
        identity,
        idempotencyKey: 'revoke-1',
        traceId: 'trace-2',
        body: { assignmentId },
      }),
    ).rejects.toBeInstanceOf(OrganizationGovernanceStateError);
    expect(fx.statements.some(({ sql }) => sql.startsWith('DELETE FROM'))).toBe(false);
  });

  it('refuses self suspension before opening a database transaction', async () => {
    const fx = fixture(() => []);
    expect(() =>
      fx.service.changeMemberStatus({
        identity,
        idempotencyKey: 'status-1',
        traceId: 'trace-3',
        body: { userId: actorId, status: 'SUSPENDED' },
      }),
    ).toThrow(OrganizationGovernanceStateError);
    expect(fx.statements).toHaveLength(0);
  });

  it('lists only tenant audit metadata and excludes before/after payloads', async () => {
    const fx = fixture((sql) =>
      sql.includes('FROM audit_logs')
        ? [
            {
              id: 'audit-1',
              actor_type: 'USER',
              actor_id: actorId,
              action: 'ROLE_ASSIGNED',
              resource_type: 'member_role_assignment',
              resource_id: assignmentId,
              permission_code: 'role.manage',
              result_code: 'SUCCESS',
              trace_id: 'trace-1',
              occurred_at: '2026-08-01T00:00:00.000Z',
            },
          ]
        : [],
    );
    const result = await fx.service.listAudit(identity, {});
    expect(result).toEqual([expect.objectContaining({ action: 'ROLE_ASSIGNED' })]);
    expect(JSON.stringify(result)).not.toMatch(/before_redacted|after_redacted/iu);
  });
});
