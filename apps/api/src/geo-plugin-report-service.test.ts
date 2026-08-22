import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  createGeoPluginReportService,
  GeoPluginReportStateError,
} from './geo-plugin-report-service.js';

const identity = {
  tenantId: '4b000000-0000-4000-8000-000000000001',
  userId: '4b000000-0000-4000-8000-000000000002',
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'geo-session',
};
const body = {
  targetCode: 'LEQU_LIFE',
  channelAccount: 'merchant-account',
  authorizationConfirmed: true,
  profile: {
    merchantName: '测试商户',
    brandName: '测试品牌',
    storeName: '测试门店',
    address: '测试路 1 号',
    longitude: 120,
    latitude: 30,
    phone: '4000000000',
    businessHours: '09:00-21:00',
    categories: ['餐饮'],
    description: '经过商户确认的完整门店资料说明',
    imageUrls: ['https://example.test/store.jpg'],
    miniProgramUrl: 'https://example.test/mini-program',
    merchantConfirmed: true,
  },
};

function service(rowsByMarker: Record<string, unknown[]>) {
  const submit = vi.fn().mockResolvedValue({ status: 'SUCCEEDED' });
  const client = {
    query: async (rawSql: string) => {
      const sql = rawSql.replace(/\s+/gu, ' ').trim();
      const marker = Object.keys(rowsByMarker).find((candidate) => sql.includes(candidate));
      const rows = marker ? (rowsByMarker[marker] ?? []) : [];
      return { rows, rowCount: rows.length };
    },
    release: () => undefined,
  };
  return {
    submit,
    current: createGeoPluginReportService({
      pool: { connect: async () => client } as unknown as Pick<pg.Pool, 'connect'>,
      geo: { submit, inspect: vi.fn() },
      plugins: { invoke: vi.fn(), uninstall: vi.fn() },
    }),
  };
}

describe('GEO publication replay safety', () => {
  it('returns an exact completed idempotent result without calling the external target again', async () => {
    const expected = { profileId: 'profile-1', targetId: 'target-1', status: 'ACTIVE' };
    const requestHash = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256')
        .update(
          JSON.stringify({
            profileId: 'profile-1',
            profile: body.profile,
            targetCode: body.targetCode,
            channelAccount: body.channelAccount,
            authorizationConfirmed: body.authorizationConfirmed,
          }),
        )
        .digest('hex'),
    );
    const fx = service({
      'FROM idempotency_keys': [{ request_hash: requestHash, response_body: expected }],
    });
    await expect(
      fx.current.publishGeo({
        identity,
        profileId: 'profile-1',
        idempotencyKey: 'geo-publish-1',
        traceId: 'trace-geo',
        body,
      }),
    ).resolves.toEqual(expected);
    expect(fx.submit).not.toHaveBeenCalled();
  });

  it('blocks a new submission while the target result is active or still unknown', async () => {
    const fx = service({
      'FROM idempotency_keys': [],
      'SELECT status FROM geo_publish_targets': [{ status: 'PUBLISHING' }],
    });
    await expect(
      fx.current.publishGeo({
        identity,
        profileId: 'profile-1',
        idempotencyKey: 'geo-publish-2',
        traceId: 'trace-geo-2',
        body,
      }),
    ).rejects.toBeInstanceOf(GeoPluginReportStateError);
    expect(fx.submit).not.toHaveBeenCalled();
  });
});
