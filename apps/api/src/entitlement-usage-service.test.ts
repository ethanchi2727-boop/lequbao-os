import { describe, expect, it, vi } from 'vitest';
import {
  EntitlementUnavailableError,
  UsageIdempotencyConflictError,
  UsageLimitExceededError,
  createEntitlementUsageService,
} from './entitlement-usage-service.js';

const input = {
  tenantId: '20000000-0000-4000-8000-000000000001',
  subscriptionId: '20000000-0000-4000-8000-000000000002',
  meterCode: 'AI_TOKENS',
  sourceType: 'MODEL' as const,
  sourceId: 'generation-1',
  provider: 'provider-a',
  modelCode: 'model-a',
  quantity: 25,
  costCents: 3,
  occurredAt: '2026-08-18T12:00:00+08:00',
  metadata: {},
  traceId: 'trace-1',
};

function service(handler: (sql: string) => { rows: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string) => {
    const result = handler(sql);
    return { ...result, rowCount: result.rowCount ?? result.rows.length };
  });
  return {
    query,
    value: createEntitlementUsageService({
      connect: async () => ({ query, release: vi.fn() }),
    } as never),
  };
}

describe('entitlement snapshots and immutable usage ledger', () => {
  it('snapshots only an active subscription and its versioned plan entitlements', async () => {
    const fixture = service((sql) => ({
      rows: sql.includes('INSERT INTO tenant_entitlement_snapshots') ? [{ id: 'snapshot-1' }] : [],
    }));
    await expect(fixture.value.snapshot(input.tenantId, input.subscriptionId)).resolves.toBe(
      'snapshot-1',
    );
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining("subscription.status IN ('TRIAL','ACTIVE')"),
      [input.tenantId, input.subscriptionId],
    );
  });

  it('replays an existing immutable entitlement snapshot without updating it', async () => {
    const fixture = service((sql) => {
      if (sql.includes('INSERT INTO tenant_entitlement_snapshots')) return { rows: [] };
      if (sql.includes('FROM tenant_entitlement_snapshots'))
        return { rows: [{ id: 'snapshot-1' }] };
      return { rows: [] };
    });
    await expect(fixture.value.snapshot(input.tenantId, input.subscriptionId)).resolves.toBe(
      'snapshot-1',
    );
    expect(fixture.query.mock.calls.some(([sql]) => String(sql).includes('DO UPDATE'))).toBe(false);
  });

  it('records one usage fact and updates the bounded monthly meter', async () => {
    const fixture = service((sql) => {
      if (sql.includes('INSERT INTO ai_usage_ledger_entries')) return { rows: [{ id: 'usage-1' }] };
      if (sql.includes('INSERT INTO usage_meters'))
        return { rows: [{ quantity: '50', hard_limit: '100' }] };
      if (sql.includes('UPDATE usage_meters'))
        return { rows: [{ quantity: '75', hard_limit: '100' }] };
      return { rows: [] };
    });
    await expect(fixture.value.record(input)).resolves.toEqual({
      id: 'usage-1',
      replayed: false,
      quantity: '25',
      periodQuantity: '75',
      hardLimit: '100',
    });
  });

  it('returns an identical replay without incrementing the meter again', async () => {
    const fixture = service((sql) => {
      if (sql.includes('INSERT INTO ai_usage_ledger_entries')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM ai_usage_ledger_entries'))
        return {
          rows: [
            {
              id: 'usage-1',
              quantity: '25',
              cost_cents: '3',
              provider: 'provider-a',
              model_code: 'model-a',
            },
          ],
        };
      if (sql.includes('SELECT quantity::text'))
        return { rows: [{ quantity: '75', hard_limit: '100' }] };
      return { rows: [] };
    });
    await expect(fixture.value.record(input)).resolves.toMatchObject({
      id: 'usage-1',
      replayed: true,
      periodQuantity: '75',
    });
    expect(
      fixture.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE usage_meters')),
    ).toBe(false);
  });

  it('rejects conflicting replays, missing snapshots and hard-limit overflow', async () => {
    const conflict = service((sql) => {
      if (sql.includes('INSERT INTO ai_usage_ledger_entries')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM ai_usage_ledger_entries'))
        return {
          rows: [
            {
              id: 'usage-1',
              quantity: '26',
              cost_cents: '3',
              provider: 'provider-a',
              model_code: 'model-a',
            },
          ],
        };
      return { rows: [] };
    });
    await expect(conflict.value.record(input)).rejects.toThrow(UsageIdempotencyConflictError);

    const missing = service((sql) =>
      sql.includes('INSERT INTO ai_usage_ledger_entries')
        ? { rows: [{ id: 'usage-2' }] }
        : { rows: [] },
    );
    await expect(missing.value.record(input)).rejects.toThrow(EntitlementUnavailableError);

    const exceeded = service((sql) => {
      if (sql.includes('INSERT INTO ai_usage_ledger_entries')) return { rows: [{ id: 'usage-3' }] };
      if (sql.includes('INSERT INTO usage_meters'))
        return { rows: [{ quantity: '90', hard_limit: '100' }] };
      return { rows: [] };
    });
    await expect(exceeded.value.record(input)).rejects.toThrow(UsageLimitExceededError);
  });
});
