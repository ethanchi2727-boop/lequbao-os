import { createHmac, timingSafeEqual } from 'node:crypto';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import { decodeCanonicalBase64Url } from './jwt-encoding.js';

const ConsumerSessionClaimsSchema = z.object({
  iss: z.literal('lequbao-api'),
  aud: z.literal('lequbao-consumer'),
  tenant_id: TenantIdSchema,
  customer_id: UuidSchema,
  store_id: UuidSchema,
  session_id: z.string().min(1).max(255),
  auth_level: z.enum(['WECHAT', 'PHONE_BOUND']),
  iat: z.int().positive(),
  exp: z.int().positive(),
});

export interface ConsumerSessionIdentity {
  tenantId: string;
  customerId: string;
  storeId: string;
  sessionId: string;
  authLevel: 'WECHAT' | 'PHONE_BOUND';
}

export interface ConsumerSessionIdentityVerifier {
  verify(authorization: string | undefined): ConsumerSessionIdentity;
}

export interface ConsumerSessionTokenSigner {
  sign(identity: ConsumerSessionIdentity, expiresAtEpochSeconds: number): string;
}

export class ConsumerSessionAuthenticationError extends Error {}

const decode = (encoded: string): unknown => {
  try {
    return JSON.parse(decodeCanonicalBase64Url(encoded).toString('utf8'));
  } catch {
    throw new ConsumerSessionAuthenticationError('malformed consumer session');
  }
};

const validateSecret = (secret: string) => {
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('CONSUMER_AUTH_JWT_SECRET must contain at least 32 bytes');
};

export function createConsumerSessionIdentityVerifier(
  secret: string,
): ConsumerSessionIdentityVerifier {
  validateSecret(secret);
  return {
    verify(authorization) {
      if (!authorization?.startsWith('Bearer '))
        throw new ConsumerSessionAuthenticationError('consumer bearer token is required');
      const parts = authorization.slice('Bearer '.length).split('.');
      if (parts.length !== 3) throw new ConsumerSessionAuthenticationError('malformed token');
      const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
      const header = z
        .object({ alg: z.literal('HS256'), typ: z.literal('JWT').optional() })
        .safeParse(decode(headerPart));
      if (!header.success) throw new ConsumerSessionAuthenticationError('unsupported token');
      const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
      let actual: Buffer;
      try {
        actual = decodeCanonicalBase64Url(signaturePart);
      } catch {
        throw new ConsumerSessionAuthenticationError('malformed consumer signature');
      }
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new ConsumerSessionAuthenticationError('invalid signature');
      const claims = ConsumerSessionClaimsSchema.safeParse(decode(payloadPart));
      if (!claims.success || claims.data.exp <= Math.floor(Date.now() / 1000))
        throw new ConsumerSessionAuthenticationError('expired or invalid token');
      return {
        tenantId: claims.data.tenant_id,
        customerId: claims.data.customer_id,
        storeId: claims.data.store_id,
        sessionId: claims.data.session_id,
        authLevel: claims.data.auth_level,
      };
    },
  };
}

export function createConsumerSessionTokenSigner(secret: string): ConsumerSessionTokenSigner {
  validateSecret(secret);
  return {
    sign(identity, expiresAtEpochSeconds) {
      const issuedAt = Math.floor(Date.now() / 1000);
      if (expiresAtEpochSeconds <= issuedAt)
        throw new Error('consumer session expiry must be future');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'lequbao-api',
          aud: 'lequbao-consumer',
          tenant_id: identity.tenantId,
          customer_id: identity.customerId,
          store_id: identity.storeId,
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
