import { describe, expect, it, vi } from 'vitest';
import { dispatchPrivacyDeletionJobs } from './privacy-deletion-jobs.js';
describe('privacy deletion propagation', () => {
  it('claims tenant tasks and marks success only after the scoped gateway confirms deletion', async () => {
    const claimQuery = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'task-1',
            privacy_request_id: 'request-1',
            target_system: 'OBJECT_STORE',
            idempotency_key: 'delete-1',
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const updateQuery = vi.fn().mockResolvedValue({});
    const connect = vi
      .fn()
      .mockResolvedValueOnce({ query: claimQuery, release: vi.fn() })
      .mockResolvedValueOnce({ query: updateQuery, release: vi.fn() });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      await dispatchPrivacyDeletionJobs({
        pool: { connect } as never,
        tenantId: '00000000-0000-4000-8000-000000000001',
        gatewayUrl: 'https://privacy.example',
        gatewayToken: 'privacy-token-with-at-least-thirty-two-bytes',
        fetch,
      }),
    ).toEqual([{ id: 'task-1', accepted: true }]);
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://privacy.example/v1/privacy/delete'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'delete-1' }),
      }),
    );
    expect(updateQuery).toHaveBeenCalledWith(
      expect.stringContaining('status=$3'),
      expect.arrayContaining(['SUCCEEDED']),
    );
  });
});
