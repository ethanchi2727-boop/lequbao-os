import { describe, expect, it, vi } from 'vitest';
import { createIntakeObjectStoreGateway } from './intake-object-store.js';

const secret = 'object-store-test-secret-with-at-least-32-bytes';

describe('tenant intake object-store gateway', () => {
  it('binds upload authorization to object key, hash, type, size and expiry', () => {
    const store = createIntakeObjectStoreGateway({
      baseUrl: 'https://objects.example.test',
      signingSecret: secret,
    });
    const authorization = store.authorizePut({
      objectKey: 'tenant/session/upload',
      sha256: 'a'.repeat(64),
      contentType: 'image/jpeg',
      maxBytes: 1024,
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(authorization.uploadUrl).toContain('tenant%2Fsession%2Fupload');
    expect(authorization.uploadUrl).toMatch(/signature=[a-f0-9]{64}$/u);
    expect(authorization.headers).toEqual({
      'content-type': 'image/jpeg',
      'x-content-sha256': 'a'.repeat(64),
      'x-max-bytes': '1024',
    });
  });

  it('binds download authorization to object key, size limit and a short expiry', () => {
    const store = createIntakeObjectStoreGateway({
      baseUrl: 'https://objects.example.test',
      signingSecret: secret,
    });
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const authorization = store.authorizeGet({
      objectKey: 'tenant/private/cost evidence.pdf',
      maxBytes: 1024,
      expiresAt,
    });
    expect(authorization.expiresAt).toBe(expiresAt);
    expect(authorization.downloadUrl).toContain('max_bytes=1024');
    expect(authorization.downloadUrl).toContain('signature=');
    expect(authorization.downloadUrl).not.toContain(secret);
  });

  it('accepts only complete provider HEAD evidence', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          'x-content-sha256': 'b'.repeat(64),
          'content-length': '2048',
          'content-type': 'application/pdf',
        },
      }),
    );
    const store = createIntakeObjectStoreGateway({
      baseUrl: 'https://objects.example.test',
      signingSecret: secret,
      fetch,
    });
    await expect(store.stat('tenant/document')).resolves.toEqual({
      sha256: 'b'.repeat(64),
      sizeBytes: 2048,
      contentType: 'application/pdf',
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('signature='), { method: 'HEAD' });
  });
});
