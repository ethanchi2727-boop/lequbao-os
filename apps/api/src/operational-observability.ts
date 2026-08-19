const sensitiveKey =
  /authorization|cookie|token|secret|password|credential|certificate|content|message|address|phone/i;
const secretValue =
  /(?:ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{16,})/gu;
const phoneValue = /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/gu;
export function redactOperationalData(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(secretValue, '[REDACTED_SECRET]').replace(phoneValue, '[REDACTED_PHONE]');
  if (Array.isArray(value)) return value.map(redactOperationalData);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redactOperationalData(item),
      ]),
    );
  return value;
}
export class OperationalMetrics {
  private requests = new Map<string, number>();
  private failures = new Map<string, number>();
  private durations = new Map<string, number[]>();
  record(input: { method: string; route: string; statusCode: number; durationMs: number }) {
    const key = `${input.method} ${input.route}`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    if (input.statusCode >= 500) this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
    const values = this.durations.get(key) ?? [];
    values.push(input.durationMs);
    if (values.length > 1000) values.shift();
    this.durations.set(key, values);
  }
  render() {
    const lines = [
      '# HELP lequ_http_requests_total Completed HTTP requests',
      '# TYPE lequ_http_requests_total counter',
    ];
    for (const [key, count] of this.requests) {
      const [method, ...route] = key.split(' ');
      lines.push(
        `lequ_http_requests_total{method="${method}",route="${route.join(' ')}"} ${count}`,
      );
    }
    lines.push(
      '# HELP lequ_http_failures_total HTTP 5xx responses',
      '# TYPE lequ_http_failures_total counter',
    );
    for (const [key, count] of this.failures) {
      const [method, ...route] = key.split(' ');
      lines.push(
        `lequ_http_failures_total{method="${method}",route="${route.join(' ')}"} ${count}`,
      );
    }
    lines.push(
      '# HELP lequ_http_duration_ms_p95 Rolling request latency p95',
      '# TYPE lequ_http_duration_ms_p95 gauge',
    );
    for (const [key, values] of this.durations) {
      const sorted = [...values].sort((a, b) => a - b),
        p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
      const [method, ...route] = key.split(' ');
      lines.push(
        `lequ_http_duration_ms_p95{method="${method}",route="${route.join(' ')}"} ${p95.toFixed(3)}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}
export const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
