import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import { createGeoOperationsService, GeoOperationsStateError } from './geo-operations-service.js';

const identity = {
  tenantId: '2a000000-0000-4000-8000-000000000001',
  userId: '2a000000-0000-4000-8000-000000000002',
  accessScopes: ['ASSIGNED'],
  assignedStoreIds: ['2a000000-0000-4000-8000-000000000003'],
} as AuthorizationContext;

function fixture(rowsByMarker: Record<string, unknown[]>) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    statements.push({ sql, values });
    const marker = Object.keys(rowsByMarker).find((candidate) => sql.includes(candidate));
    const rows = marker ? (rowsByMarker[marker] ?? []) : [];
    return { rows, rowCount: rows.length };
  });
  return {
    statements,
    service: createGeoOperationsService({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as unknown as Pick<pg.Pool, 'connect'>),
  };
}

describe('GEO operations read and remediation model', () => {
  it('returns channel health without external record IDs, hashes or provider summaries', async () => {
    const fx = fixture({
      'FROM geo_profiles profile JOIN stores': [
        {
          profile_id: 'profile-1',
          store_id: identity.assignedStoreIds[0],
          store_name: '一店',
          canonical_name: '一店',
          profile_status: 'DEGRADED',
          completeness_score: 90,
          consistency_score: 75,
          version: 2,
          target_id: 'target-1',
          target_code: 'MAP',
          target_status: 'STALE',
          authorization_status: 'ACTIVE',
          last_published_at: '2026-08-18T00:00:00Z',
          last_checked_at: '2026-08-19T00:00:00Z',
          next_check_at: '2026-08-26T00:00:00Z',
          retry_after: null,
          open_differences: '2',
          external_record_id: 'must-not-leak',
          response_summary: { secret: true },
        },
      ],
    });
    const result = await fx.service.overview(identity, {});
    expect(result).toMatchObject({
      summary: { profiles: 1, healthyTargets: 0, attentionTargets: 1, openDifferences: 2 },
      profiles: [{ targets: [{ targetCode: 'MAP', status: 'STALE' }] }],
    });
    expect(JSON.stringify(result)).not.toMatch(/external_record|response_summary|secret/iu);
    expect(
      fx.statements.find(({ sql }) => sql.startsWith('SELECT profile.id'))?.values?.[1],
    ).toEqual(identity.assignedStoreIds);
  });

  it('lists differences without exposing canonical or observed hashes', async () => {
    const fx = fixture({
      'FROM geo_difference_tasks difference': [
        {
          id: 'difference-1',
          geo_profile_id: 'profile-1',
          target_id: 'target-1',
          store_id: identity.assignedStoreIds[0],
          store_name: '一店',
          target_code: 'MAP',
          field_name: 'businessHours',
          status: 'OPEN',
          due_at: '2026-08-20T00:00:00Z',
          resolved_at: null,
          created_at: '2026-08-19T00:00:00Z',
        },
      ],
    });
    const result = await fx.service.listDifferences(identity, { status: 'OPEN' });
    expect(result).toEqual([
      expect.objectContaining({ id: 'difference-1', fieldName: 'businessHours', status: 'OPEN' }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/hash/iu);
  });

  it('resolves an in-scope open difference and records the real actor and reason', async () => {
    const differenceId = '2a000000-0000-4000-8000-000000000004';
    const fx = fixture({
      'SELECT difference.id,difference.status': [{ id: differenceId, status: 'OPEN' }],
    });
    await expect(
      fx.service.decideDifference({
        identity,
        differenceId,
        traceId: 'trace-geo',
        body: { decision: 'RESOLVE', reasonCode: 'MERCHANT_CONFIRMED' },
      }),
    ).resolves.toEqual({ id: differenceId, status: 'RESOLVED' });
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
    expect(
      fx.statements.find(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))?.values,
    ).toContain(identity.userId);

    const closed = fixture({
      'SELECT difference.id,difference.status': [{ id: differenceId, status: 'RESOLVED' }],
    });
    await expect(
      closed.service.decideDifference({
        identity,
        differenceId,
        traceId: 'trace-geo-2',
        body: { decision: 'IGNORE', reasonCode: 'NOT_APPLICABLE' },
      }),
    ).rejects.toBeInstanceOf(GeoOperationsStateError);
  });
});
