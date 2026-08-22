import { describe, expect, it, vi } from 'vitest';
import { dispatchGeoAndReportJobs } from './geo-report-jobs.js';

describe('GEO freshness and monthly report jobs', () => {
  it('checks only due tenant targets and idempotently requests the prior month', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'target-1' }] })
      .mockResolvedValueOnce({});
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await dispatchGeoAndReportJobs({
      pool: { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as never,
      tenantId: '00000000-0000-4000-8000-000000000001',
      internalApiUrl: 'https://internal.example',
      internalWorkerToken: 'worker-token-with-at-least-thirty-two-bytes',
      now: new Date('2026-09-02T00:00:00Z'),
      fetch,
    });
    expect(result).toEqual([
      { type: 'GEO_CHECK', id: 'target-1', accepted: true },
      { type: 'MONTHLY_REPORT', id: '2026-08', accepted: true },
    ]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://internal.example/api/v1/internal/geo/targets/target-1/actions/check',
      'https://internal.example/api/v1/internal/reports/monthly-value/actions/materialize',
    ]);
  });
});
