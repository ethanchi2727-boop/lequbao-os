import { createHmac, timingSafeEqual } from 'node:crypto';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';

const SessionIdentitySchema = z.object({
  tenant_id: TenantIdSchema,
  user_id: UuidSchema,
  role_codes: z.array(z.string().min(1).max(80)).min(1),
  store_ids: z.array(UuidSchema).default([]),
  session_id: z.string().min(1).max(255),
  exp: z.int().positive(),
});

export interface SessionIdentity {
  tenantId: string;
  userId: string;
  roleCodes: string[];
  storeIds: string[];
  sessionId: string;
}

export interface SessionIdentityVerifier {
  verify(authorization: string | undefined): SessionIdentity;
}

export class SessionAuthenticationError extends Error {}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new SessionAuthenticationError('malformed session token');
  }
}

export function createSessionIdentityVerifier(secret: string): SessionIdentityVerifier {
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('AUTH_JWT_SECRET must contain at least 32 bytes');
  return {
    verify(authorization) {
      if (!authorization?.startsWith('Bearer '))
        throw new SessionAuthenticationError('bearer session token is required');
      const token = authorization.slice('Bearer '.length);
      const parts = token.split('.');
      if (parts.length !== 3) throw new SessionAuthenticationError('malformed session token');
      const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
      const header = z
        .object({ alg: z.literal('HS256'), typ: z.literal('JWT').optional() })
        .safeParse(decodeJson(encodedHeader));
      if (!header.success) throw new SessionAuthenticationError('unsupported session token');
      const expected = createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();
      let actual: Buffer;
      try {
        actual = Buffer.from(encodedSignature, 'base64url');
      } catch {
        throw new SessionAuthenticationError('malformed session signature');
      }
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new SessionAuthenticationError('invalid session signature');
      const payload = SessionIdentitySchema.safeParse(decodeJson(encodedPayload));
      if (!payload.success || payload.data.exp <= Math.floor(Date.now() / 1000))
        throw new SessionAuthenticationError('expired or invalid session token');
      return {
        tenantId: payload.data.tenant_id,
        userId: payload.data.user_id,
        roleCodes: [...new Set(payload.data.role_codes)],
        storeIds: payload.data.store_ids,
        sessionId: payload.data.session_id,
      };
    },
  };
}
