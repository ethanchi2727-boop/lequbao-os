import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type {
  LifeConsumerIdentityExchangeGateway,
  LifeConsumerIdentityExchangeInput,
} from './life-consumer-identity-exchange-http-adapter.js';
import type {
  LifeConsumerSessionIdentity,
  LifeConsumerSessionTokenSigner,
} from './life-consumer-session-identity.js';

const RefreshInputSchema = z.object({
  accountId: UuidSchema,
  sessionId: z.string().uuid(),
  refreshToken: z.string().min(32).max(512),
  deviceId: z.string().min(16).max(512),
});

interface SessionRow {
  account_id: string;
  session_id: string;
  auth_level: 'WECHAT' | 'PHONE_BOUND';
  expires_at: Date | string;
}

export interface LifeConsumerSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  sessionExpiresAt: string;
  identity: LifeConsumerSessionIdentity & { accountId: string };
}

export class LifeConsumerAuthRejectedError extends Error {}
export class LifeConsumerRefreshRejectedError extends Error {}
export class LifeConsumerRevokeRejectedError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function createLifeConsumerAuthService(
  pool: Pick<pg.Pool, 'connect'>,
  signer: LifeConsumerSessionTokenSigner,
  identityGateway: LifeConsumerIdentityExchangeGateway,
  options: { accessTtlSeconds?: number; sessionTtlSeconds?: number } = {},
) {
  const accessTtlSeconds = options.accessTtlSeconds ?? 15 * 60;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? 7 * 24 * 60 * 60;

  function tokens(row: SessionRow, refreshToken: string): LifeConsumerSessionTokens {
    const sessionExpiresAt = new Date(row.expires_at);
    const accessTokenExpiresAt = new Date(
      Math.min(Date.now() + accessTtlSeconds * 1000, sessionExpiresAt.getTime()),
    );
    const identity: LifeConsumerSessionIdentity = {
      accountId: row.account_id,
      sessionId: row.session_id,
      authLevel: row.auth_level,
    };
    return {
      accessToken: signer.sign(identity, Math.floor(accessTokenExpiresAt.getTime() / 1000)),
      refreshToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      identity,
    };
  }

  async function querySession(sql: string, values: unknown[], rejected: Error) {
    const client = await pool.connect();
    try {
      const result = await client.query<SessionRow>(sql, values);
      const row = result.rows[0];
      if (!row) throw rejected;
      return row;
    } catch (error) {
      if (
        (error as { code?: string }).code === '23505' ||
        (error as { code?: string }).code === '28000'
      )
        throw rejected;
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async exchange(
      input: LifeConsumerIdentityExchangeInput,
      context: { sourceIp: string; userAgent: string },
    ) {
      const verified = await identityGateway.exchange(input, context);
      const sessionId = randomUUID();
      const refreshToken = randomBytes(32).toString('base64url');
      const sessionExpiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
      const row = await querySession(
        `SELECT account_id,session_id,auth_level,expires_at
           FROM app.issue_platform_consumer_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          verified.unionIdentifierHash,
          verified.mobileHash ?? null,
          verified.authSubjectHash,
          verified.authLevel,
          sessionId,
          sessionExpiresAt,
          digest(verified.assertionId),
          digest(verified.deviceId),
          digest(refreshToken),
          verified.provider,
        ],
        new LifeConsumerAuthRejectedError(),
      );
      return tokens(row, refreshToken);
    },

    requestMobileOtp(
      input: { mobile: string; deviceId: string },
      context: { sourceIp: string; userAgent: string },
    ) {
      return identityGateway.requestMobileOtp(input, context);
    },

    async exchangeMobileOtp(
      input: { challengeId: string; code: string; deviceId: string },
      context: { sourceIp: string; userAgent: string },
    ) {
      const verified = await identityGateway.verifyMobileOtp(input, context);
      return this.exchange(
        { provider: 'MOBILE_OTP', assertion: verified.assertion, deviceId: verified.deviceId },
        context,
      );
    },

    async refresh(rawInput: unknown) {
      const input = RefreshInputSchema.parse(rawInput);
      const nextRefreshToken = randomBytes(32).toString('base64url');
      const row = await querySession(
        `SELECT account_id,session_id,auth_level,expires_at
           FROM app.refresh_platform_consumer_session($1,$2,$3,$4,$5)`,
        [
          input.accountId,
          input.sessionId,
          digest(input.refreshToken),
          digest(input.deviceId),
          digest(nextRefreshToken),
        ],
        new LifeConsumerRefreshRejectedError(),
      );
      return tokens(row, nextRefreshToken);
    },

    async revoke(identity: LifeConsumerSessionIdentity, reason = 'USER_LOGOUT') {
      const parsedReason = z.string().trim().min(1).max(255).parse(reason);
      const client = await pool.connect();
      try {
        const result = await client.query<{ revoked: boolean }>(
          'SELECT app.revoke_platform_consumer_session($1,$2,$3) AS revoked',
          [identity.accountId, identity.sessionId, parsedReason],
        );
        if (result.rows[0]?.revoked !== true) throw new LifeConsumerRevokeRejectedError();
      } finally {
        client.release();
      }
    },
  };
}

export type LifeConsumerAuthService = ReturnType<typeof createLifeConsumerAuthService>;
