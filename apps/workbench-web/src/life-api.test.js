import { describe, expect, it, vi } from 'vitest';
import { createLifeApi, LifeApiError } from './life-api.js';

describe('Life H5 API client', () => {
  it('fails closed without a consumer session', async () => {
    const api = createLifeApi({ origin: 'https://bao.lequ.com' });
    await expect(api.products('PHYSICAL')).rejects.toEqual(
      expect.objectContaining({ name: 'LifeApiError', status: 401 }),
    );
  });

  it('uses same-origin authoritative catalog requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 'product-1' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = createLifeApi({ origin: 'https://bao.lequ.com', token: 'consumer-token' });
    await expect(api.products('PHYSICAL')).resolves.toEqual([{ id: 'product-1' }]);
    const [target, options] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(
      'https://bao.lequ.com/api/v1/consumer/products?productType=PHYSICAL&limit=20',
    );
    expect(options.headers.authorization).toBe('Bearer consumer-token');
    fetchMock.mockRestore();
  });

  it('reports an authoritative response failure instead of returning demo data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 503 }));
    const api = createLifeApi({ origin: 'https://bao.lequ.com', token: 'consumer-token' });
    await expect(api.storefront()).rejects.toBeInstanceOf(LifeApiError);
    vi.restoreAllMocks();
  });
});
