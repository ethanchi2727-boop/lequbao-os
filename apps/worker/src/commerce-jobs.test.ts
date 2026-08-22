import { describe, expect, it, vi } from 'vitest';
import { dispatchCommerceJobs } from './commerce-jobs.js';

describe('commerce background jobs', () => {
  it('discovers tenant-scoped expiry and refund jobs and dispatches authoritative ids', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const results = await dispatchCommerceJobs({
      pool: { connect: vi.fn().mockResolvedValue({ query, release }) } as never,
      tenantId: '00000000-0000-4000-8000-000000000001',
      internalApiUrl: 'https://internal.example.test',
      internalWorkerToken: 'worker-token-with-at-least-thirty-two-bytes',
      fetch,
    });
    expect(results).toEqual([
      { type: 'EXPIRE_ORDER', id: 'order-1', accepted: true },
      { type: 'SUBMIT_REFUND', id: 'refund-1', accepted: true },
    ]);
    const orderDiscoverySql = String(query.mock.calls[2]?.[0]);
    expect(orderDiscoverySql).toContain('inventory_released_at IS NULL');
    expect(orderDiscoverySql).not.toContain('reservation_released_at');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://internal.example.test/api/v1/internal/commerce/orders/order-1/actions/expire',
      'https://internal.example.test/api/v1/internal/commerce/refunds/refund-1/actions/submit',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
