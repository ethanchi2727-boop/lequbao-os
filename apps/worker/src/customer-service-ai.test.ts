import { describe, expect, it, vi } from 'vitest';
import { dispatchQueuedCustomerServiceAiJobs } from './customer-service-ai.js';

describe('customer-service AI job dispatcher', () => {
  it('reads only tenant-scoped queued job ids and sends no chat content', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes('SELECT id FROM conversation_ai_jobs')
        ? { rows: [{ id: '48000000-0000-4000-8000-000000000002' }] }
        : { rows: [] },
    );
    const fetch = vi.fn(async (requestUrl: string | URL | Request, init?: RequestInit) => {
      void requestUrl;
      void init;
      return new Response(JSON.stringify({ status: 'SUCCEEDED' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    });
    const result = await dispatchQueuedCustomerServiceAiJobs({
      pool: { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
      tenantId: '48000000-0000-4000-8000-000000000001',
      workerId: 'worker-1',
      internalApiUrl: 'https://internal-api.example',
      internalWorkerToken: 'worker-token-with-at-least-thirty-two-bytes',
      fetch,
    });
    expect(result).toEqual([
      {
        jobId: '48000000-0000-4000-8000-000000000002',
        accepted: true,
        status: 'SUCCEEDED',
      },
    ]);
    const request = fetch.mock.calls[0]![1]!;
    expect(String(request.body)).toContain('48000000-0000-4000-8000-000000000002');
    expect(String(request.body)).not.toMatch(/content|message_text|query/iu);
  });
});
