import { describe, expect, it } from 'vitest';
import { isCanonicalBase64ByteLength } from './base64-encoding.js';

describe('canonical base64 configuration encoding', () => {
  it('accepts only the canonical encoding of the expected byte length', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(isCanonicalBase64ByteLength(key, 32)).toBe(true);
    expect(isCanonicalBase64ByteLength(`${key}!`, 32)).toBe(false);
    expect(isCanonicalBase64ByteLength(key.replace(/=$/u, ''), 32)).toBe(false);
    expect(isCanonicalBase64ByteLength(Buffer.alloc(31, 7).toString('base64'), 32)).toBe(false);
  });
});
