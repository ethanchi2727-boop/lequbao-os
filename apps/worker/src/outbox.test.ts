import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  assertOrderedVersion,
  replayDeadLetter,
  retryDelayMs,
  settleOutboxPublish,
} from './outbox.js';

function poolWithRows(rows: Array<{ rowCount: number; rows?: unknown[] }>) {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('set_config'))
        return { rowCount: null, rows: [] };
      return rows.shift() ?? { rowCount: 0, rows: [] };
    },
    release: () => undefined,
  };
  return {
    pool: { connect: async () => client } as unknown as pg.Pool,
    statements,
  };
}

describe('outbox retry policy', () => {
  it.each([
    [1, 10_000],
    [2, 30_000],
    [3, 120_000],
    [5, 1_800_000],
    [11, 7_200_000],
    [99, 7_200_000],
  ])('applies capped exponential backoff for attempt %i', (attempt, expected) => {
    expect(retryDelayMs(attempt)).toBe(expected);
  });

  it('normalizes invalid attempt numbers', () => {
    expect(retryDelayMs(-1)).toBe(10_000);
    expect(retryDelayMs(1.9)).toBe(10_000);
  });

  it('EVT-003 rejects a gap or replay under an aggregate ordering lock', () => {
    expect(() => assertOrderedVersion(4, 5)).not.toThrow();
    expect(() => assertOrderedVersion(4, 6)).toThrow('EVENT_AGGREGATE_VERSION_OUT_OF_ORDER');
    expect(() => assertOrderedVersion(4, 4)).toThrow('EVENT_AGGREGATE_VERSION_OUT_OF_ORDER');
  });

  it('moves the twelfth failed publish to a durable dead letter', async () => {
    const { pool, statements } = poolWithRows([{ rowCount: 1, rows: [{}] }, { rowCount: 1 }]);
    await expect(
      settleOutboxPublish(
        pool,
        '11000000-0000-4000-8000-000000000001',
        { id: '11000000-0000-4000-8000-000000000002', attempt_count: 12 },
        'worker-1',
        { ok: false, errorClass: 'DEPENDENCY', errorCode: 'TIMEOUT', summary: 'timed out' },
      ),
    ).resolves.toBe('DEAD');
    expect(statements.some((sql) => sql.includes("status='DEAD'"))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO event_dead_letters'))).toBe(true);
  });

  it('EVT-004 replays the original event id instead of creating a new fact', async () => {
    const { pool, statements } = poolWithRows([
      { rowCount: 1, rows: [{ event_id: '11000000-0000-4000-8000-000000000002' }] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 1 },
    ]);
    await replayDeadLetter(
      pool,
      '11000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000002',
    );
    expect(statements.some((sql) => sql.includes('INSERT INTO outbox_events'))).toBe(false);
    expect(statements.some((sql) => sql.includes("status='FAILED'"))).toBe(true);
  });
});
