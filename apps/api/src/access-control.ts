import type pg from 'pg';
import { z } from 'zod';
import type { SessionIdentity } from './session-identity.js';

const PermissionCodeSchema = z.string().min(1).max(120);

export class InactiveSessionError extends Error {}
export class PermissionDeniedError extends Error {}
export class TenantWriteSuspendedError extends Error {}

export interface AuthorizationOptions {
  mfaRequired?: boolean;
  write?: boolean;
}

export interface AuthorizationContext extends SessionIdentity {
  accessScopes: string[];
  assignedStoreIds: string[];
}

export interface AccessControlService {
  validate(identity: SessionIdentity, options?: AuthorizationOptions): Promise<SessionIdentity>;
  authorize(
    identity: SessionIdentity,
    permissionCode: string,
    options?: AuthorizationOptions,
  ): Promise<AuthorizationContext>;
}

interface SessionRow {
  auth_level: 'PASSWORD' | 'MFA';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
  tenant_status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'OFFBOARDING' | 'CLOSED';
}

interface GrantRow {
  access_scope: string;
  store_id: string | null;
}

export function createAccessControlService(pool: Pick<pg.Pool, 'connect'>): AccessControlService {
  async function withSession<T>(
    identity: SessionIdentity,
    options: AuthorizationOptions,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [identity.tenantId]);
      const session = await client.query<SessionRow>(
        `SELECT session.auth_level, session.risk_level, tenant.status AS tenant_status
           FROM user_sessions session
           JOIN users actor ON actor.id = session.user_id
           JOIN tenant_memberships membership
             ON membership.tenant_id = session.tenant_id AND membership.user_id = session.user_id
           JOIN tenants tenant ON tenant.id = session.tenant_id
          WHERE session.tenant_id = $1 AND session.session_id = $2 AND session.user_id = $3
            AND session.revoked_at IS NULL AND session.expires_at > now()
            AND actor.status = 'ACTIVE' AND membership.membership_status = 'ACTIVE'
          FOR UPDATE OF session`,
        [identity.tenantId, identity.sessionId, identity.userId],
      );
      const current = session.rows[0];
      if (!current || current.risk_level === 'BLOCKED') throw new InactiveSessionError();
      if (options.mfaRequired && current.auth_level !== 'MFA') {
        throw new PermissionDeniedError('multi-factor authentication is required');
      }
      if (options.write && !['TRIAL', 'ACTIVE'].includes(current.tenant_status)) {
        throw new TenantWriteSuspendedError();
      }
      const result = await work(client);
      await client.query(
        `UPDATE user_sessions SET last_seen_at = now()
          WHERE tenant_id = $1 AND session_id = $2 AND last_seen_at < now() - interval '5 minutes'`,
        [identity.tenantId, identity.sessionId],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    validate(identity, options = {}) {
      return withSession(identity, options, async () => identity);
    },

    async authorize(identity, rawPermissionCode, options = {}) {
      const permissionCode = PermissionCodeSchema.parse(rawPermissionCode);
      return withSession(identity, options, async (client) => {
        const grants = await client.query<GrantRow>(
          `SELECT permission.access_scope, assignment.store_id
             FROM member_role_assignments assignment
             JOIN role_permissions permission ON permission.role_code = assignment.role_code
            WHERE assignment.tenant_id = $1 AND assignment.user_id = $2
              AND assignment.role_code = ANY($3::text[])
              AND permission.permission_code = $4
              AND (assignment.valid_until IS NULL OR assignment.valid_until > now())`,
          [identity.tenantId, identity.userId, identity.roleCodes, permissionCode],
        );
        if (grants.rowCount === 0) throw new PermissionDeniedError();
        return {
          ...identity,
          accessScopes: [...new Set(grants.rows.map((grant) => grant.access_scope))],
          assignedStoreIds: [
            ...new Set(
              grants.rows
                .map((grant) => grant.store_id)
                .filter((storeId): storeId is string => storeId !== null),
            ),
          ],
        };
      });
    },
  };
}
