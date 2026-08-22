import { describe, expect, it } from 'vitest';
import {
  GeoPolicyError,
  PluginPolicyError,
  assertGeoCopyIsCompliant,
  assertPluginCall,
  assertPluginInstall,
  buildTraceableMonthlyReport,
  nextCircuitState,
  requiresPluginReauthorization,
  validateGeoProfile,
} from './geo-plugin-report-policy.js';

const profile = {
  merchantName: '示例商户',
  brandName: '乐趣餐厅',
  storeName: '中心店',
  address: '测试路1号',
  longitude: 121.1,
  latitude: 31.2,
  phone: '02112345678',
  businessHours: '09:00-21:00',
  categories: ['餐饮'],
  description: '提供经过商户确认的本地餐饮服务。',
  imageUrls: ['https://img.example/store.webp'],
  miniProgramUrl: 'https://m.example/store',
  lequLifeUrl: 'https://life.example/store',
  merchantConfirmed: true as const,
};
const manifest = {
  pluginId: 'com.lequ.geo',
  publisher: '乐趣宝' as const,
  version: '1.0.0',
  permissions: ['store.read'],
  allowedDomains: ['api.example.com'],
  fee: { unit: 'CALL', amountCents: 0 },
  uninstallImpact: '停止同步',
  dataDeletionScopes: ['cache'],
  timeoutSeconds: 10,
  maxRetries: 2,
};

describe('GEO launch policy', () => {
  it('rejects missing required publication facts with exact fields', () => {
    expect(() => validateGeoProfile({ ...profile, phone: '' })).toThrow(GeoPolicyError);
    try {
      validateGeoProfile({ ...profile, phone: '' });
    } catch (error) {
      expect((error as GeoPolicyError).fields).toContain('phone');
    }
  });
  it('accepts a merchant-confirmed complete profile', () => {
    expect(validateGeoProfile(profile).completenessScore).toBe(100);
  });
  it('blocks ranking, traffic and inclusion promises', () => {
    expect(() => assertGeoCopyIsCompliant('我们保证排名第一')).toThrow('GEO_PROMISE_PROHIBITED');
  });
});

describe('official plugin launch policy', () => {
  it('requires owner confirmation and exact permission disclosure', () => {
    expect(() =>
      assertPluginInstall({ manifest, acceptedPermissions: [], responsibleOwnerConfirmed: true }),
    ).toThrow('PERMISSION_ACCEPTANCE_MISMATCH');
    expect(
      assertPluginInstall({
        manifest,
        acceptedPermissions: ['store.read'],
        responsibleOwnerConfirmed: true,
      }),
    ).toMatchObject({ permissionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  });
  it('denies missing permission and undeclared egress', () => {
    expect(() =>
      assertPluginCall({
        manifest,
        grantedPermissions: [],
        requiredPermission: 'store.read',
        circuitStatus: 'CLOSED',
      }),
    ).toThrow('PLUGIN_PERMISSION_DENIED');
    expect(() =>
      assertPluginCall({
        manifest,
        grantedPermissions: ['store.read'],
        requiredPermission: 'store.read',
        requestedUrl: 'https://evil.example/x',
        circuitStatus: 'CLOSED',
      }),
    ).toThrow('PLUGIN_EGRESS_DENIED');
  });
  it('requires reauthorization for new permission or domain', () => {
    expect(
      requiresPluginReauthorization(manifest, {
        ...manifest,
        version: '2.0.0',
        permissions: ['store.read', 'customer.export'],
      }),
    ).toBe(true);
    expect(requiresPluginReauthorization(manifest, { ...manifest, version: '1.0.1' })).toBe(false);
  });
  it('opens an independent circuit after consecutive failures and blocks calls', () => {
    expect(nextCircuitState({ currentFailures: 2, outcome: 'TIMEOUT' })).toEqual({
      failures: 3,
      status: 'OPEN',
    });
    expect(() =>
      assertPluginCall({
        manifest,
        grantedPermissions: ['store.read'],
        requiredPermission: 'store.read',
        circuitStatus: 'OPEN',
      }),
    ).toThrow(PluginPolicyError);
  });
});

describe('monthly value report policy', () => {
  it('makes every metric traceable to definition, version and source events', () => {
    const eventId = '00000000-0000-4000-8000-000000000091';
    const report = buildTraceableMonthlyReport({
      month: '2026-08',
      generatedThrough: '2026-09-01T00:00:00+08:00',
      metrics: [
        {
          metricCode: 'PAID_ORDERS',
          displayName: '支付订单数',
          unit: 'COUNT',
          value: 1,
          sourceEventIds: [eventId],
          sourceEventTypes: ['commerce.order.paid'],
          calculationVersion: 'v1',
          definition: '周期内首次进入已支付状态的订单',
        },
      ],
    });
    expect(report.metrics[0]).toMatchObject({ sourceCount: 1, traceable: true });
    expect(report.disclaimer).toContain('不代表外部收录、排名或流量');
  });
});
