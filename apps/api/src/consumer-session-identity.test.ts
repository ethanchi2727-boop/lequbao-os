import { describe, expect, it } from 'vitest';
import {
  ConsumerSessionAuthenticationError,
  createConsumerSessionIdentityVerifier,
  createConsumerSessionTokenSigner,
} from './consumer-session-identity.js';

const secret = 'consumer-session-secret-with-more-than-32-bytes';
const identity = {
  tenantId: '45000000-0000-4000-8000-000000000001',
  customerId: '45000000-0000-4000-8000-000000000002',
  storeId: '45000000-0000-4000-8000-000000000003',
  sessionId: 'consumer-session-1',
  authLevel: 'PHONE_BOUND' as const,
};

describe('consumer session identity', () => {
  it('binds tenant, customer, store and auth level to a dedicated audience', () => {
    const token = createConsumerSessionTokenSigner(secret).sign(
      identity,
      Math.floor(Date.now() / 1000) + 300,
    );
    expect(createConsumerSessionIdentityVerifier(secret).verify(`Bearer ${token}`)).toEqual(
      identity,
    );
  });

  it('rejects tampered and employee-audience tokens', () => {
    const token = createConsumerSessionTokenSigner(secret).sign(
      identity,
      Math.floor(Date.now() / 1000) + 300,
    );
    expect(() =>
      createConsumerSessionIdentityVerifier(secret).verify(`Bearer ${token.slice(0, -1)}x`),
    ).toThrow(ConsumerSessionAuthenticationError);
    const [header, payload] = token.split('.');
    const wrongAudience = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')),
        aud: 'lequbao-workbench',
      }),
    ).toString('base64url');
    expect(() =>
      createConsumerSessionIdentityVerifier(secret).verify(
        `Bearer ${header}.${wrongAudience}.${token.split('.')[2]}`,
      ),
    ).toThrow(ConsumerSessionAuthenticationError);
  });
});
