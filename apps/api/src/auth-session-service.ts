import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { SessionIdentity, SessionTokenSigner } from './session-identity.js';

const IssueSchema = z.object({
  tenantId: TenantIdSchema,
  userId: UuidSchema,
  authLevel: z.enum(['PASSWORD', 'MFA']),
  deviceId: z.string().min(16).max(512),
  audit: z
    .object({
      action: z.enum(['auth.session.issued', 'auth.tenant.switched']),
      traceId: z.string().min(1).max(128),
      ipHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/u)
        .optional(),
      userAgentHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/u)
        .optional(),
      assertionIdHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/u)
        .optional(),
      provider: z.enum(['ENTERPRISE_WECOM', 'PHONE_OTP']).optional(),
    })
    .optional(),
});
const RefreshSchema = z.object({
  tenantId: TenantIdSchema,
  userId: UuidSchema,
  sessionId: z.string().uuid(),
  refreshToken: z.string().min(32).max(512),
  deviceId: z.string().min(16).max(512),
});

export class AuthSubjectInactiveError extends Error {}
export class RefreshSessionInvalidError extends Error {}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  sessionExpiresAt: string;
  identity: SessionIdentity;
}

export interface AuthSessionService {
  issue(input: z.input<typeof IssueSchema>): Promise<SessionTokens>;
  refresh(input: z.input<typeof RefreshSchema>): Promise<SessionTokens>;
  revoke(identity: SessionIdentity, reason: string): Promise<void>;
}

interface RoleRow {
  role_code: string;
  store_id: string | null;
}

interface RefreshRow {
  refresh_token_hash: string | null;
  device_fingerprint_hash: string | null;
  auth_level: 'PASSWORD' | 'MFA';
  expires_at: Date | string;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sameDigest = (left: string | null, right: string) => {
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

export function createAuthSessionService(
  pool: Pick<pg.Pool, 'connect'>,
  signer: SessionTokenSigner,
  options: { accessTtlSeconds?: number; sessionTtlSeconds?: number } = {},
): AuthSessionService {
  const accessTtlSeconds = options.accessTtlSeconds ?? 15 * 60;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? 30 * 24 * 60 * 60;

  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function currentRoles(client: pg.PoolClient, tenantId: string, userId: string) {
    const roles = await client.query<RoleRow>(
      `SELECT assignment.role_code, assignment.store_id
         FROM tenant_memberships membership
         JOIN users actor ON actor.id = membership.user_id
         JOIN tenants tenant ON tenant.id = membership.tenant_id
         JOIN member_role_assignments assignment
           ON assignment.tenant_id = membership.tenant_id AND assignment.user_id = membership.user_id
        WHERE membership.tenant_id = $1 AND membership.user_id = $2
          AND membership.membership_status = 'ACTIVE' AND actor.status = 'ACTIVE'
          AND tenant.status IN ('TRIAL','ACTIVE','PAST_DUE')
          AND (assignment.valid_until IS NULL OR assignment.valid_until > now())`,
      [tenantId, userId],
    );
    if (roles.rowCount === 0) throw new AuthSubjectInactiveError();
    return roles.rows;
  }

  function tokenResult(
    identity: SessionIdentity,
    refreshToken: string,
    sessionExpiresAt: Date,
  ): SessionTokens {
    const accessTokenExpiresAt = new Date(Date.now() + accessTtlSeconds * 1000);
    return {
      accessToken: signer.sign(identity, Math.floor(accessTokenExpiresAt.getTime() / 1000)),
      refreshToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      identity,
    };
  }

  return {
    async issue(rawInput) {
      const input = IssueSchema.parse(rawInput);
      return transaction(input.tenantId, async (client) => {
        const roles = await currentRoles(client, input.tenantId, input.userId);
        const sessionId = randomUUID();
        const refreshToken = randomBytes(32).toString('base64url');
        const sessionExpiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
        await client.query(
          `INSERT INTO user_sessions(
             tenant_id, session_id, user_id, refresh_token_hash, device_fingerprint_hash,
             auth_level, issued_at, expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,now(),$7)`,
          [
            input.tenantId,
            sessionId,
            input.userId,
            digest(refreshToken),
            digest(input.deviceId),
            input.authLevel,
            sessionExpiresAt,
          ],
        );
        if (input.audit) {
          await client.query(
            `INSERT INTO audit_logs(
               tenant_id,actor_type,actor_id,action,resource_type,resource_id,
               result_code,ip_hash,user_agent_hash,after_redacted,trace_id
             ) VALUES ($1,'USER',$2,$3,'user_session',$4,'SUCCESS',$5,$6,$7::jsonb,$8)`,
            [
              input.tenantId,
              input.userId,
              input.audit.action,
              sessionId,
              input.audit.ipHash ?? null,
              input.audit.userAgentHash ?? null,
              JSON.stringify({
                authLevel: input.authLevel,
                ...(input.audit.provider ? { provider: input.audit.provider } : {}),
                ...(input.audit.assertionIdHash
                  ? { assertionIdHash: input.audit.assertionIdHash }
                  : {}),
              }),
              input.audit.traceId,
            ],
          );
        }
        const identity: SessionIdentity = {
          tenantId: input.tenantId,
          userId: input.userId,
          roleCodes: [...new Set(roles.map((role) => role.role_code))],
          storeIds: [
            ...new Set(
              roles
                .map((role) => role.store_id)
                .filter((storeId): storeId is string => storeId !== null),
            ),
          ],
          sessionId,
          authLevel: input.authLevel,
        };
        return tokenResult(identity, refreshToken, sessionExpiresAt);
      });
    },

    async refresh(rawInput) {
      const input = RefreshSchema.parse(rawInput);
      return transaction(input.tenantId, async (client) => {
        const session = await client.query<RefreshRow>(
          `SELECT refresh_token_hash, device_fingerprint_hash, auth_level, expires_at
             FROM user_sessions
            WHERE tenant_id = $1 AND session_id = $2 AND user_id = $3
              AND revoked_at IS NULL AND expires_at > now()
            FOR UPDATE`,
          [input.tenantId, input.sessionId, input.userId],
        );
        const current = session.rows[0];
        if (
          !current ||
          !sameDigest(current.refresh_token_hash, digest(input.refreshToken)) ||
          !sameDigest(current.device_fingerprint_hash, digest(input.deviceId))
        ) {
          throw new RefreshSessionInvalidError();
        }
        const roles = await currentRoles(client, input.tenantId, input.userId);
        const nextRefreshToken = randomBytes(32).toString('base64url');
        await client.query(
          `UPDATE user_sessions SET refresh_token_hash = $4, last_seen_at = now()
            WHERE tenant_id = $1 AND session_id = $2 AND user_id = $3`,
          [input.tenantId, input.sessionId, input.userId, digest(nextRefreshToken)],
        );
        const identity: SessionIdentity = {
          tenantId: input.tenantId,
          userId: input.userId,
          roleCodes: [...new Set(roles.map((role) => role.role_code))],
          storeIds: [
            ...new Set(
              roles
                .map((role) => role.store_id)
                .filter((storeId): storeId is string => storeId !== null),
            ),
          ],
          sessionId: input.sessionId,
          authLevel: current.auth_level,
        };
        return tokenResult(identity, nextRefreshToken, new Date(current.expires_at));
      });
    },

    async revoke(identity, rawReason) {
      const reason = z.string().min(1).max(255).parse(rawReason);
      await transaction(identity.tenantId, async (client) => {
        await client.query(
          `UPDATE user_sessions
              SET revoked_at = COALESCE(revoked_at, now()),
                  revoke_reason = COALESCE(revoke_reason, $4), refresh_token_hash = NULL
            WHERE tenant_id = $1 AND session_id = $2 AND user_id = $3`,
          [identity.tenantId, identity.sessionId, identity.userId, reason],
        );
      });
    },
  };
}
