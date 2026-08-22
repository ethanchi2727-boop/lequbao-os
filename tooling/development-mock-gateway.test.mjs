import { createHash } from 'node:crypto';
import { afterEach, describe, expect, test } from 'vitest';
import { createHttpCommerceAdapters } from '../apps/api/src/commerce-http-adapters.ts';
import {
  createHttpCustomerServiceKnowledgeGateway,
  createHttpCustomerServiceModelGateway,
} from '../apps/api/src/customer-service-http-adapters.ts';
import { createHttpIdentityExchangeGateway } from '../apps/api/src/identity-exchange-http-adapter.ts';
import { createIntakeObjectStoreGateway } from '../apps/api/src/intake-object-store.ts';
import {
  createHttpMiniProgramBuilder,
  createHttpMiniProgramProviderGateway,
} from '../apps/api/src/mini-program-http-adapters.ts';
import { createHttpWeComConfigResolver } from '../apps/api/src/wecom-intake-http-adapter.ts';
import { createHttpOutboxPublisher } from '../apps/worker/src/outbox-publisher.ts';
import {
  DEVELOPMENT_MOCK_TOKEN,
  startDevelopmentMockGateway,
} from './development-mock-gateway.mjs';

const running = [];
afterEach(async () => {
  await Promise.all(
    running.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function start() {
  const result = await startDevelopmentMockGateway({
    environment: { NODE_ENV: 'development', LEQU_DEVELOPMENT_MOCKS: '1' },
    port: 0,
  });
  running.push(result.server);
  const address = result.server.address();
  if (!address || typeof address === 'string') throw new Error('mock gateway address unavailable');
  return `http://127.0.0.1:${address.port}`;
}

const authorized = {
  authorization: `Bearer ${DEVELOPMENT_MOCK_TOKEN}`,
  'content-type': 'application/json',
};

describe('development mock gateway', () => {
  test('is explicit opt-in and refuses production', async () => {
    await expect(
      startDevelopmentMockGateway({ environment: { NODE_ENV: 'development' }, port: 0 }),
    ).rejects.toThrow(/LEQU_DEVELOPMENT_MOCKS=1/u);
    await expect(
      startDevelopmentMockGateway({
        environment: { NODE_ENV: 'production', LEQU_DEVELOPMENT_MOCKS: '1' },
        port: 0,
      }),
    ).rejects.toThrow(/refuses NODE_ENV=production/u);
  });

  test('serves identity data bound to the requested device', async () => {
    const base = await start();
    const deviceId = 'development-device-0001';
    const response = await fetch(`${base}/v1/identity/assertions/exchange`, {
      method: 'POST',
      headers: authorized,
      body: JSON.stringify({
        provider: 'PHONE_OTP',
        assertion: 'development-assertion-0001',
        deviceId,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-lequ-data-source')).toBe('development-mock');
    expect(await response.json()).toMatchObject({
      provider: 'PHONE_OTP',
      riskDecision: 'ALLOW',
      deviceIdSha256: createHash('sha256').update(deviceId).digest('hex'),
    });
  });

  test('supports signed object-store put, head and get contracts', async () => {
    const base = await start();
    const content = 'development mock object';
    const digest = createHash('sha256').update(content).digest('hex');
    const url = `${base}/v1/objects/tenant%2Ffile.txt?signature=development`;
    const put = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-content-sha256': digest,
        'x-max-bytes': '1024',
      },
      body: content,
    });
    expect(put.status).toBe(201);
    const head = await fetch(url, { method: 'HEAD' });
    expect(head.headers.get('x-content-sha256')).toBe(digest);
    const get = await fetch(`${url}&max_bytes=1024`);
    expect(await get.text()).toBe(content);
  });

  test('serves payment, customer-service and mini-program response shapes', async () => {
    const base = await start();
    const post = async (path, body) =>
      fetch(`${base}${path}`, { method: 'POST', headers: authorized, body: JSON.stringify(body) });
    expect(await (await post('/v1/payments', { provider: 'SANDBOX' })).json()).toMatchObject({
      clientCredential: 'development-mock-payment-credential',
    });
    expect(
      await (await post('/v1/customer-service/model/answer', { citations: [] })).json(),
    ).toMatchObject({ provider: 'LOCAL_DEVELOPMENT_MOCK', requiresHuman: true });
    expect(await (await post('/v1/mini-program-builds', {})).json()).toMatchObject({
      smokeTestResult: { passed: true },
    });
  });

  test('implements the complete declared provider-route matrix with mock provenance', async () => {
    const base = await start();
    const requests = [
      [
        'POST',
        '/v1/identity/assertions/exchange',
        { provider: 'PHONE_OTP', assertion: 'a', deviceId: 'd' },
        200,
      ],
      ['GET', '/v1/wecom/corps/development-corp', undefined, 200],
      ['GET', '/v1/wecom/corps/development-corp/members/development-member', undefined, 200],
      ['POST', '/v1/payments', { provider: 'SANDBOX' }, 200],
      ['POST', '/v1/refunds', { refundId: 'development-refund' }, 200],
      ['POST', '/v1/reconciliation/daily-bill', { businessDate: '2026-08-20' }, 200],
      ['POST', '/v1/customer-service/knowledge/search', { query: '开发测试' }, 200],
      ['POST', '/v1/customer-service/read-tools/query', { toolCode: 'ORDER_LOOKUP' }, 200],
      ['POST', '/v1/customer-service/model/answer', { citations: [] }, 200],
      ['POST', '/v1/wecom/internal/notifications', { message: 'development' }, 202],
      ['POST', '/v1/geo/submit', { target: 'development' }, 200],
      ['POST', '/v1/geo/inspect', { target: 'development' }, 200],
      ['POST', '/v1/plugins/invoke', { input: {} }, 200],
      ['POST', '/v1/plugins/uninstall', { installationId: 'development' }, 204],
      ['POST', '/v1/wechat/authorizations/exchange', { code: 'development' }, 200],
      ['POST', '/v1/wechat/releases/submit-review', { releaseId: 'development' }, 200],
      ['POST', '/v1/wechat/releases/publish', { releaseId: 'development' }, 200],
      ['POST', '/v1/wechat/releases/query-online', { releaseId: 'development' }, 200],
      ['POST', '/v1/wechat/releases/rollback', { releaseId: 'development' }, 200],
      ['POST', '/v1/wechat/callbacks/decode', { encrypted: 'development' }, 200],
      ['POST', '/v1/mini-program-builds', { templateCommit: 'development' }, 200],
      ['POST', '/v1/events', { id: idsForTest.eventId }, 202],
      ['POST', '/v1/privacy/delete', { requestId: 'development' }, 202],
      [
        'POST',
        '/v1/privacy-exports',
        { tenantId: idsForTest.tenantId, requestId: 'development' },
        200,
      ],
    ];
    for (const [method, path, body, expectedStatus] of requests) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: authorized,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      expect(response.status, `${method} ${path}`).toBe(expectedStatus);
      expect(response.headers.get('x-lequ-data-source'), `${method} ${path}`).toBe(
        'development-mock',
      );
    }
  });

  test('requires the development mock bearer token', async () => {
    const base = await start();
    expect((await fetch(`${base}/v1/events`, { method: 'POST' })).status).toBe(401);
  });

  test('satisfies the real HTTP adapter response contracts', async () => {
    const baseUrl = await start();
    const common = { baseUrl, serviceToken: DEVELOPMENT_MOCK_TOKEN };

    const identity = createHttpIdentityExchangeGateway(common);
    await expect(
      identity.exchange(
        {
          provider: 'PHONE_OTP',
          assertion: 'development-assertion-0002',
          deviceId: 'development-device-0002',
        },
        { sourceIp: '127.0.0.1', userAgent: 'vitest' },
      ),
    ).resolves.toMatchObject({ authLevel: 'MFA' });

    const objects = createIntakeObjectStoreGateway({
      baseUrl,
      signingSecret: 'development-mock-object-secret-0000000001',
    });
    const content = 'adapter contract content';
    const digest = createHash('sha256').update(content).digest('hex');
    await objects.putText({ objectKey: 'tenant/adapter.txt', content, sha256: digest });
    await expect(
      objects.getText({ objectKey: 'tenant/adapter.txt', maxBytes: 1024 }),
    ).resolves.toBe(content);

    const commerce = createHttpCommerceAdapters({
      ...common,
      callbackSecret: 'development-mock-callback-secret-00000001',
    });
    await expect(
      commerce.payment.createPayment({ provider: 'SANDBOX', traceId: 'development-trace' }),
    ).resolves.toMatchObject({ clientCredential: 'development-mock-payment-credential' });

    const knowledge = createHttpCustomerServiceKnowledgeGateway(common);
    const citations = await knowledge.search({
      tenantId: idsForTest.tenantId,
      storeId: idsForTest.storeId,
      query: '开发测试',
      limit: 1,
      traceId: 'development-trace',
    });
    const model = createHttpCustomerServiceModelGateway(common);
    await expect(
      model.answer({
        tenantId: idsForTest.tenantId,
        storeId: idsForTest.storeId,
        query: '开发测试',
        citations,
        promptVersion: 'development-v1',
        traceId: 'development-trace',
      }),
    ).resolves.toMatchObject({ provider: 'LOCAL_DEVELOPMENT_MOCK', requiresHuman: true });

    const miniProgram = createHttpMiniProgramProviderGateway(common);
    await expect(
      miniProgram.exchangeAuthorization({
        authorizationCode: 'development-code',
        idempotencyKey: 'development-idempotency',
        traceId: 'development-trace',
      }),
    ).resolves.toMatchObject({ appId: 'wx-development-mock' });
    const builder = createHttpMiniProgramBuilder(common);
    await expect(builder.build({ traceId: 'development-trace' })).resolves.toMatchObject({
      smokeTestResult: { passed: true },
    });

    const wecom = createHttpWeComConfigResolver(common);
    const corp = await wecom.resolveCorp('development-corp');
    expect(corp).toBeDefined();
    await expect(wecom.resolveMember(corp, 'development-member')).resolves.toMatchObject({
      identity: { userId: idsForTest.userId },
    });

    const outbox = createHttpOutboxPublisher(common);
    await expect(
      outbox.publish({
        id: idsForTest.eventId,
        tenant_id: idsForTest.tenantId,
        event_name: 'development.mock',
        event_version: 1,
        aggregate_type: 'development',
        aggregate_id: idsForTest.eventId,
        aggregate_version: 1,
        partition_key: idsForTest.tenantId,
        payload: {},
        pii_classification: 'NONE',
        trace_id: 'development-trace',
        occurred_at: new Date(),
      }),
    ).resolves.toEqual({ ok: true });
  });
});

const idsForTest = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  storeId: '10000000-0000-4000-8000-000000000003',
  eventId: '10000000-0000-4000-8000-000000000008',
};
