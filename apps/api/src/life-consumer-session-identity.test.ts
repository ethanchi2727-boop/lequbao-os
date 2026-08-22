import { describe, expect, it } from 'vitest';
import {
  LifeConsumerSessionAuthenticationError,
  createLifeConsumerSessionIdentityVerifier,
  createLifeConsumerSessionTokenSigner,
} from './life-consumer-session-identity.js';

const secret = 'life-consumer-session-secret-with-more-than-32-bytes';
const identity = {
  accountId: '52000000-0000-4000-8000-000000000001',
  sessionId: 'life-session-1',
  authLevel: 'PHONE_BOUND' as const,
};

describe('life consumer session identity', () => {
  it('uses a platform audience without embedding a merchant tenant or store', () => {
    const token = createLifeConsumerSessionTokenSigner(secret).sign(
      identity,
      Math.floor(Date.now() / 1000) + 300,
    );
    expect(createLifeConsumerSessionIdentityVerifier(secret).verify(`Bearer ${token}`)).toEqual(
      identity,
    );
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
    expect(payload).toMatchObject({ aud: 'lequbao-life', account_id: identity.accountId });
    expect(payload).not.toHaveProperty('tenant_id');
    expect(payload).not.toHaveProperty('store_id');
  });

  it('rejects merchant-consumer audience tokens and non-canonical signatures', () => {
    const token = createLifeConsumerSessionTokenSigner(secret).sign(
      identity,
      Math.floor(Date.now() / 1000) + 300,
    );
    const [header, payload, signature] = token.split('.') as [string, string, string];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const lastIndex = alphabet.indexOf(signature.at(-1)!);
    const nonCanonicalSignature = `${signature.slice(0, -1)}${alphabet[lastIndex | 1]}`;
    expect(Buffer.from(nonCanonicalSignature, 'base64url')).toEqual(
      Buffer.from(signature, 'base64url'),
    );
    expect(() =>
      createLifeConsumerSessionIdentityVerifier(secret).verify(
        `Bearer ${header}.${payload}.${nonCanonicalSignature}`,
      ),
    ).toThrow(LifeConsumerSessionAuthenticationError);
  });
});
