import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionAuthenticationError, createSessionIdentityVerifier } from './session-identity.js';

const secret = 'intake-auth-test-secret-with-at-least-32-bytes';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload: Record<string, unknown>) => {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

const payload = {
  tenant_id: '90000000-0000-4000-8000-000000000001',
  user_id: '90000000-0000-4000-8000-000000000002',
  role_codes: ['MERCHANT_OWNER'],
  store_ids: [],
  session_id: 'session-1',
  exp: Math.floor(Date.now() / 1000) + 300,
};

describe('signed session identity', () => {
  it('derives tenant, actor and roles only from a valid signed token', () => {
    const identity = createSessionIdentityVerifier(secret).verify(`Bearer ${sign(payload)}`);
    expect(identity).toMatchObject({
      tenantId: payload.tenant_id,
      userId: payload.user_id,
      roleCodes: ['MERCHANT_OWNER'],
    });
  });

  it('rejects tampering, expiry and weak signing secrets', () => {
    const verifier = createSessionIdentityVerifier(secret);
    expect(() => verifier.verify(`Bearer ${sign({ ...payload, exp: 1 })}`)).toThrow(
      SessionAuthenticationError,
    );
    const token = sign(payload);
    const [header, body, signature] = token.split('.') as [string, string, string];
    const tamperedBody = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}`;
    expect(() => verifier.verify(`Bearer ${header}.${tamperedBody}.${signature}`)).toThrow(
      SessionAuthenticationError,
    );
    expect(() => createSessionIdentityVerifier('weak')).toThrow('32 bytes');
  });
});
