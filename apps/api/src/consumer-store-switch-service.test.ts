import { describe, expect, it, vi } from 'vitest';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import {
  ConsumerStoreSwitchAuthenticationError,
  ConsumerStoreSwitchNotFoundError,
  createConsumerStoreSwitchService,
} from './consumer-store-switch-service.js';

const identity: ConsumerSessionIdentity = {
  tenantId: '9e000000-0000-4000-8000-000000000001',
  customerId: '9e000000-0000-4000-8000-000000000002',
  storeId: '9e000000-0000-4000-8000-000000000003',
  sessionId: 'current-session',
  authLevel: 'PHONE_BOUND',
};
const targetStoreId = '9e000000-0000-4000-8000-000000000004';

function fixture(options: { revoked?: boolean; store?: boolean } = {}) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  let insertedSessionId = '';
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    queries.push({ sql, ...(values ? { values } : {}) });
    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SELECT set_config')
    )
      return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT auth_subject_hash'))
      return {
        rows: [
          {
            auth_subject_hash: 'a'.repeat(64),
            auth_level: 'PHONE_BOUND',
            expires_at: '2099-01-01T00:00:00.000Z',
            revoked_at: options.revoked ? '2026-08-19T00:00:00.000Z' : null,
            revoke_reason: options.revoked ? 'OTHER' : null,
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('SELECT id,store_name'))
      return {
        rows: [
          {
            id: identity.storeId,
            store_name: '当前店',
            city_code: '3101',
            district_code: '310106',
            opening_hours: {},
          },
          {
            id: targetStoreId,
            store_name: '目标店',
            city_code: '3101',
            district_code: '310115',
            opening_hours: {},
          },
        ],
        rowCount: 2,
      };
    if (sql.startsWith('SELECT 1 FROM stores'))
      return options.store === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ ok: true }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO consumer_sessions')) {
      insertedSessionId = String(values?.[0]);
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE consumer_sessions')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const sign = vi.fn(() => 'signed-target-token');
  const service = createConsumerStoreSwitchService(
    { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
    { sign },
  );
  return { service, sign, queries, getInsertedSessionId: () => insertedSessionId };
}

describe('consumer store switching', () => {
  it('lists only active stores and marks the current signed store', async () => {
    const { service } = fixture();
    await expect(service.list(identity)).resolves.toEqual([
      expect.objectContaining({ id: identity.storeId, current: true }),
      expect.objectContaining({ id: targetStoreId, current: false }),
    ]);
  });

  it('atomically rotates the session without extending its expiry', async () => {
    const { service, sign, queries, getInsertedSessionId } = fixture();
    await expect(
      service.switch({ identity, idempotencyKey: 'switch-1', body: { storeId: targetStoreId } }),
    ).resolves.toMatchObject({ storeId: targetStoreId, accessToken: 'signed-target-token' });
    expect(getInsertedSessionId()).toMatch(/^store-switch:[a-f0-9]{48}$/u);
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: targetStoreId, sessionId: getInsertedSessionId() }),
      new Date('2099-01-01T00:00:00.000Z').getTime() / 1000,
    );
    expect(queries.some(({ sql }) => sql.startsWith('UPDATE consumer_sessions'))).toBe(true);
  });

  it('rejects inactive or cross-tenant target stores before rotating', async () => {
    const { service, queries } = fixture({ store: false });
    await expect(
      service.switch({
        identity,
        idempotencyKey: 'switch-missing',
        body: { storeId: targetStoreId },
      }),
    ).rejects.toBeInstanceOf(ConsumerStoreSwitchNotFoundError);
    expect(queries.some(({ sql }) => sql.startsWith('INSERT INTO consumer_sessions'))).toBe(false);
  });

  it('rejects an already revoked session that is not the exact idempotent replay', async () => {
    const { service, sign } = fixture({ revoked: true });
    await expect(
      service.switch({ identity, idempotencyKey: 'switch-2', body: { storeId: targetStoreId } }),
    ).rejects.toBeInstanceOf(ConsumerStoreSwitchAuthenticationError);
    expect(sign).not.toHaveBeenCalled();
  });
});
