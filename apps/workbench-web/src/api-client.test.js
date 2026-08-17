import { describe, expect, it, vi } from 'vitest';
import { ApiError, createMerchantIntakeApi } from './api-client.js';

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('merchant intake browser API client', () => {
  it('derives identity from the bearer session and keeps session IDs in paths', async () => {
    const request = vi.fn().mockResolvedValue(response({ id: 'asset' }, 202));
    const api = createMerchantIntakeApi({
      baseUrl: 'https://api.example/',
      token: 'signed-session',
      fetch: request,
      idempotencyKey: () => 'message-key',
    });
    await api.addMessage('session/id', '补充营业时间');
    expect(request).toHaveBeenCalledWith(
      'https://api.example/api/v1/merchant-intake/sessions/session%2Fid/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer signed-session',
          'idempotency-key': 'message-key',
        }),
      }),
    );
  });

  it('uploads bytes only through the signed ticket before completing it', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          id: 'upload-1',
          uploadUrl: 'https://objects.example/upload',
          headers: { 'x-content-sha256': 'server-bound' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(response({ assetId: 'asset-1' }, 202));
    const api = createMerchantIntakeApi({
      baseUrl: 'https://api.example',
      token: 'signed-session',
      fetch: request,
      idempotencyKey: () => 'upload-key',
    });
    const file = new File(['license'], 'license.jpg', { type: 'image/jpeg' });
    await expect(api.upload('session-1', file)).resolves.toEqual({ assetId: 'asset-1' });
    expect(request.mock.calls[1]?.[0]).toBe('https://objects.example/upload');
    expect(request.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'PUT', headers: { 'x-content-sha256': 'server-bound' } }),
    );
    expect(request.mock.calls[2]?.[0]).toContain('/uploads/upload-1/actions/complete');
  });

  it('preserves structured API error codes for recoverable UI states', async () => {
    const api = createMerchantIntakeApi({
      baseUrl: 'https://api.example',
      token: 'signed-session',
      fetch: vi.fn().mockResolvedValue(response({ code: 'OBJECT_STORE_UNAVAILABLE' }, 503)),
    });
    await expect(api.getSession('session-1')).rejects.toEqual(
      expect.objectContaining({
        name: ApiError.name,
        status: 503,
        code: 'OBJECT_STORE_UNAVAILABLE',
      }),
    );
  });
});
