import { describe, expect, it, vi } from 'vitest';
import {
  createLifeMerchantContextSessionService,
  LifeMerchantContextAuthenticationError,
  LifeMerchantContextConflictError,
  LifeMerchantContextNotFoundError,
} from './life-merchant-context-session-service.js';

const life = {
  accountId: '00000000-0000-4000-8000-000000000101',
  sessionId: 'life-session-101',
  authLevel: 'PHONE_BOUND' as const,
};
const merchantTenantId = '00000000-0000-4000-8000-000000000102';
const customerId = '00000000-0000-4000-8000-000000000103';
const storeId = '00000000-0000-4000-8000-000000000104';

function fixture(overrides: { platform?: unknown[]; link?: unknown[]; storeCount?: number } = {}) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const contextRows: unknown[] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push(values ? { sql, values } : { sql });
    if (sql.includes('FROM platform_consumer_sessions session'))
      return {
        rows: overrides.platform ?? [
          {
            auth_subject_hash: 'a'.repeat(64),
            auth_level: 'PHONE_BOUND',
            expires_at: new Date(Date.now() + 60 * 60 * 1000),
          },
        ],
        rowCount: (overrides.platform ?? [1]).length,
      };
    if (sql.includes('FROM platform_consumer_tenant_links'))
      return {
        rows: overrides.link ?? [{ customer_id: customerId }],
        rowCount: (overrides.link ?? [1]).length,
      };
    if (sql.startsWith('SELECT 1 FROM stores'))
      return {
        rows: overrides.storeCount === 0 ? [] : [{ ok: true }],
        rowCount: overrides.storeCount ?? 1,
      };
    if (sql.startsWith('INSERT INTO consumer_sessions')) {
      contextRows.push({
        tenant_id: values?.[1],
        customer_id: values?.[2],
        store_id: values?.[3],
        auth_level: values?.[5],
        expires_at: values?.[6],
        revoked_at: null,
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM consumer_sessions'))
      return { rows: contextRows, rowCount: contextRows.length };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
  const sign = vi.fn().mockReturnValue('merchant-access-token');
  return { pool, query, queries, release, sign };
}

describe('life merchant context session service', () => {
  it('issues a short merchant-scoped session only from an active platform link and store', async () => {
    const fx = fixture();
    const service = createLifeMerchantContextSessionService(
      fx.pool as never,
      { sign: fx.sign },
      { accessTtlSeconds: 300 },
    );
    const result = await service.exchange({
      identity: life,
      idempotencyKey: 'life-merchant-context-1',
      body: { merchantTenantId, storeId },
    });

    expect(result).toMatchObject({
      merchantTenantId,
      storeId,
      accessToken: 'merchant-access-token',
    });
    expect(fx.sign).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: merchantTenantId, customerId, storeId }),
      expect.any(Number),
    );
    expect(fx.queries.some(({ sql }) => sql.includes("set_config('app.consumer_account_id'"))).toBe(
      true,
    );
    expect(fx.queries.some(({ sql }) => sql.includes("set_config('app.tenant_id'"))).toBe(true);
    expect(fx.queries.some(({ sql }) => sql.startsWith('INSERT INTO consumer_sessions'))).toBe(
      true,
    );
    expect(fx.queries.at(-1)?.sql).toBe('COMMIT');
    expect(fx.release).toHaveBeenCalledOnce();
  });

  it('rejects a revoked or missing platform session', async () => {
    const fx = fixture({ platform: [] });
    const service = createLifeMerchantContextSessionService(fx.pool as never, { sign: fx.sign });
    await expect(
      service.exchange({
        identity: life,
        idempotencyKey: 'context-2',
        body: { merchantTenantId, storeId },
      }),
    ).rejects.toBeInstanceOf(LifeMerchantContextAuthenticationError);
    expect(fx.queries.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('hides an unlinked merchant and inactive store behind the same not-found boundary', async () => {
    const unlinked = fixture({ link: [] });
    await expect(
      createLifeMerchantContextSessionService(unlinked.pool as never, {
        sign: unlinked.sign,
      }).exchange({
        identity: life,
        idempotencyKey: 'context-3',
        body: { merchantTenantId, storeId },
      }),
    ).rejects.toBeInstanceOf(LifeMerchantContextNotFoundError);

    const inactiveStore = fixture({ storeCount: 0 });
    await expect(
      createLifeMerchantContextSessionService(inactiveStore.pool as never, {
        sign: inactiveStore.sign,
      }).exchange({
        identity: life,
        idempotencyKey: 'context-4',
        body: { merchantTenantId, storeId },
      }),
    ).rejects.toBeInstanceOf(LifeMerchantContextNotFoundError);
  });

  it('requires a bounded idempotency key before writing a context session', async () => {
    const fx = fixture();
    const service = createLifeMerchantContextSessionService(fx.pool as never, { sign: fx.sign });
    await expect(
      service.exchange({ identity: life, idempotencyKey: '', body: { merchantTenantId, storeId } }),
    ).rejects.toBeInstanceOf(LifeMerchantContextConflictError);
    expect(fx.pool.connect).not.toHaveBeenCalled();
  });
});
