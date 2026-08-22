import { describe, expect, it } from 'vitest';
import {
  OperationalMetrics,
  redactOperationalData,
  securityHeaders,
} from './operational-observability.js';
describe('operational security and metrics', () => {
  it('redacts secrets, tokens, phone numbers, addresses and message bodies recursively', () => {
    expect(
      redactOperationalData({
        authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
        nested: { phone: '13812345678' },
        safe: 'trace-1',
        message: 'private',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: { phone: '[REDACTED]' },
      safe: 'trace-1',
      message: '[REDACTED]',
    });
  });
  it('exports bounded route metrics without tenant or customer labels', () => {
    const metrics = new OperationalMetrics();
    metrics.record({ method: 'GET', route: '/health', statusCode: 200, durationMs: 10 });
    metrics.record({ method: 'GET', route: '/health', statusCode: 503, durationMs: 20 });
    const output = metrics.render();
    expect(output).toContain('lequ_http_requests_total{method="GET",route="/health"} 2');
    expect(output).toContain('lequ_http_failures_total{method="GET",route="/health"} 1');
    expect(output).not.toMatch(/tenant|customer/u);
  });
  it('sets browser hardening headers for every response', () => {
    expect(securityHeaders).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy': expect.stringContaining("frame-ancestors 'none'"),
    });
  });
});
