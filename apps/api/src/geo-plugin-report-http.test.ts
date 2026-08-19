import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;
const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'session',
  authLevel: 'MFA' as const,
};
const service = () => ({
  listPlugins: vi.fn().mockResolvedValue({ plugins: [] }),
  getPlugin: vi.fn().mockResolvedValue({ pluginCode: 'official-plugin' }),
  publishGeo: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
  installPlugin: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
  invokePlugin: vi.fn().mockResolvedValue({ status: 'SUCCEEDED' }),
  upgradePlugin: vi.fn().mockResolvedValue({ reauthorized: true }),
  uninstallPlugin: vi.fn().mockResolvedValue({ status: 'UNINSTALLED' }),
  monthlyReport: vi.fn().mockResolvedValue({ month: '2026-08', metrics: [] }),
  materializeMonthlyReport: vi
    .fn()
    .mockResolvedValue({ reportId: '00000000-0000-4000-8000-000000000090' }),
  checkGeoTarget: vi.fn().mockResolvedValue({
    targetId: '00000000-0000-4000-8000-000000000010',
    status: 'ACTIVE',
    differences: [],
  }),
});
function options(geoPluginReports = service()) {
  return {
    geoPluginReports,
    sessionIdentity: { verify: () => identity },
    accessControl: {
      validate: vi.fn().mockResolvedValue(identity),
      authorize: vi.fn().mockResolvedValue(identity),
    },
  };
}
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GEO, value report and official plugin HTTP contract', () => {
  it('publishes only through an authenticated GEO service boundary', async () => {
    const current = service();
    app = await buildApp(options(current));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/geo/profiles/00000000-0000-4000-8000-000000000010/actions/publish',
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'geo-publish-1' },
      payload: {
        profile: {},
        targetCode: 'LEQU_LIFE',
        channelAccount: 'merchant',
        authorizationConfirmed: true,
      },
    });
    expect(response.statusCode).toBe(202);
    expect(current.publishGeo).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'geo-publish-1' }),
    );
  });
  it('requires idempotency for install and invocation', async () => {
    app = await buildApp(options());
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plugins/installations',
          headers: { authorization: 'Bearer signed' },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/plugins/installations/00000000-0000-4000-8000-000000000010/invocations',
          headers: { authorization: 'Bearer signed' },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });
  it('wires install, upgrade and uninstall with employee identity', async () => {
    const current = service();
    app = await buildApp(options(current));
    const install = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/installations',
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'install-1' },
      payload: {},
    });
    const upgrade = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/installations/00000000-0000-4000-8000-000000000010/actions/upgrade',
      headers: { authorization: 'Bearer signed' },
      payload: {},
    });
    const uninstall = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/installations/00000000-0000-4000-8000-000000000010/actions/uninstall',
      headers: { authorization: 'Bearer signed' },
    });
    expect([install.statusCode, upgrade.statusCode, uninstall.statusCode]).toEqual([202, 202, 200]);
  });
  it('requires a report month and returns traceable report data', async () => {
    const current = service();
    app = await buildApp(options(current));
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/reports/monthly-value',
          headers: { authorization: 'Bearer signed' },
        })
      ).statusCode,
    ).toBe(400);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/monthly-value?month=2026-08',
      headers: { authorization: 'Bearer signed' },
    });
    expect(response.statusCode).toBe(200);
    expect(current.monthlyReport).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-08', identity }),
    );
  });
});
