import { createHmac, timingSafeEqual } from 'node:crypto';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import { decodeCanonicalBase64Url } from './jwt-encoding.js';

const ClaimsSchema = z.object({
  iss: z.literal('lequbao-api'),
  aud: z.literal('lequbao-life'),
  account_id: UuidSchema,
  session_id: z.string().min(1).max(255),
  auth_level: z.enum(['WECHAT', 'PHONE_BOUND']),
  iat: z.int().positive(),
  exp: z.int().positive(),
});

export interface LifeConsumerSessionIdentity {
  accountId: string;
  sessionId: string;
  authLevel: 'WECHAT' | 'PHONE_BOUND';
}

export interface LifeConsumerSessionIdentityVerifier {
  verify(authorization: string | undefined): LifeConsumerSessionIdentity;
}

export interface LifeConsumerSessionTokenSigner {
  sign(identity: LifeConsumerSessionIdentity, expiresAtEpochSeconds: number): string;
}

export class LifeConsumerSessionAuthenticationError extends Error {}

function secretGuard(secret: string) {
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('LIFE_CONSUMER_AUTH_JWT_SECRET must contain at least 32 bytes');
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(decodeCanonicalBase64Url(value).toString('utf8'));
  } catch {
    throw new LifeConsumerSessionAuthenticationError('malformed life consumer token');
  }
}

export function createLifeConsumerSessionIdentityVerifier(
  secret: string,
): LifeConsumerSessionIdentityVerifier {
  secretGuard(secret);
  return {
    verify(authorization) {
      if (!authorization?.startsWith('Bearer '))
        throw new LifeConsumerSessionAuthenticationError('life consumer bearer token is required');
      const parts = authorization.slice('Bearer '.length).split('.');
      if (parts.length !== 3)
        throw new LifeConsumerSessionAuthenticationError('malformed life consumer token');
      const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
      const header = z
        .object({ alg: z.literal('HS256'), typ: z.literal('JWT').optional() })
        .safeParse(decodeJson(headerPart));
      if (!header.success)
        throw new LifeConsumerSessionAuthenticationError('unsupported life consumer token');
      const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
      let actual: Buffer;
      try {
        actual = decodeCanonicalBase64Url(signaturePart);
      } catch {
        throw new LifeConsumerSessionAuthenticationError('malformed life consumer signature');
      }
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new LifeConsumerSessionAuthenticationError('invalid life consumer signature');
      const claims = ClaimsSchema.safeParse(decodeJson(payloadPart));
      if (!claims.success || claims.data.exp <= Math.floor(Date.now() / 1000))
        throw new LifeConsumerSessionAuthenticationError('expired or invalid life consumer token');
      return {
        accountId: claims.data.account_id,
        sessionId: claims.data.session_id,
        authLevel: claims.data.auth_level,
      };
    },
  };
}

export function createLifeConsumerSessionTokenSigner(
  secret: string,
): LifeConsumerSessionTokenSigner {
  secretGuard(secret);
  return {
    sign(identity, expiresAtEpochSeconds) {
      const issuedAt = Math.floor(Date.now() / 1000);
      if (expiresAtEpochSeconds <= issuedAt)
        throw new Error('life consumer session expiry must be future');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'lequbao-api',
          aud: 'lequbao-life',
          account_id: identity.accountId,
          session_id: identity.sessionId,
          auth_level: identity.authLevel,
          iat: issuedAt,
          exp: expiresAtEpochSeconds,
        }),
      ).toString('base64url');
      const signature = createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');
      return `${header}.${payload}.${signature}`;
    },
  };
}
