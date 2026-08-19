import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const DEVELOPMENT_MOCK_TOKEN = 'local-development-mock-token-not-secret-0001';

const ids = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  storeId: '10000000-0000-4000-8000-000000000003',
  publicationId: '10000000-0000-4000-8000-000000000004',
  documentId: '10000000-0000-4000-8000-000000000005',
  citationId: '10000000-0000-4000-8000-000000000006',
  intakeSessionId: '10000000-0000-4000-8000-000000000007',
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertDevelopmentOnly(environment) {
  if (environment.NODE_ENV === 'production')
    throw new Error('development mock gateway refuses NODE_ENV=production');
  if (environment.LEQU_DEVELOPMENT_MOCKS !== '1')
    throw new Error('set LEQU_DEVELOPMENT_MOCKS=1 to acknowledge development-only mock data');
}

async function readBody(request, maximumBytes = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(response, status, body) {
  const content = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': content.length,
    'cache-control': 'no-store',
    'x-lequ-data-source': 'development-mock',
  });
  response.end(content);
}

function empty(response, status = 204) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'x-lequ-data-source': 'development-mock',
  });
  response.end();
}

function objectKey(pathname) {
  const prefix = '/v1/objects/';
  return pathname.startsWith(prefix)
    ? decodeURIComponent(pathname.slice(prefix.length))
    : undefined;
}

const futureIso = (milliseconds = 5 * 60_000) => new Date(Date.now() + milliseconds).toISOString();

async function route(request, response, state, options) {
  const url = new URL(request.url ?? '/', 'http://development-mock.local');
  if (request.method === 'GET' && url.pathname === '/health')
    return json(response, 200, { status: 'ok', dataSource: 'development-mock' });

  const key = objectKey(url.pathname);
  if (key !== undefined) {
    if (!url.searchParams.has('signature'))
      return json(response, 401, { error: 'signature required' });
    if (request.method === 'PUT') {
      const body = await readBody(request, Number(request.headers['x-max-bytes'] ?? 1_048_576));
      const digest = sha256(body);
      if (digest !== request.headers['x-content-sha256'])
        return json(response, 422, { error: 'content digest mismatch' });
      state.objects.set(key, {
        body,
        contentType: request.headers['content-type'] ?? 'application/octet-stream',
        sha256: digest,
      });
      return empty(response, 201);
    }
    const stored = state.objects.get(key);
    if (!stored) return json(response, 404, { error: 'object not found' });
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'content-type': stored.contentType,
        'content-length': stored.body.length,
        'x-content-sha256': stored.sha256,
        'x-lequ-data-source': 'development-mock',
      });
      return response.end();
    }
    if (request.method === 'GET') {
      const maximum = Number(url.searchParams.get('max_bytes') ?? stored.body.length);
      if (stored.body.length > maximum) return json(response, 413, { error: 'object too large' });
      response.writeHead(200, {
        'content-type': stored.contentType,
        'content-length': stored.body.length,
        'x-content-sha256': stored.sha256,
        'x-lequ-data-source': 'development-mock',
      });
      return response.end(stored.body);
    }
    return json(response, 405, { error: 'method not allowed' });
  }

  if (request.headers.authorization !== `Bearer ${options.token}`)
    return json(response, 401, { error: 'mock token required' });

  const bodyBuffer = await readBody(request);
  let body = {};
  if (bodyBuffer.length) {
    try {
      body = JSON.parse(bodyBuffer.toString('utf8'));
    } catch {
      return json(response, 400, { error: 'invalid JSON' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/v1/identity/assertions/exchange') {
    return json(response, 200, {
      provider: body.provider,
      assertionId: `development-mock-${sha256(String(body.assertion)).slice(0, 20)}`,
      tenantId: options.tenantId,
      userId: options.userId,
      authLevel: 'MFA',
      deviceIdSha256: sha256(String(body.deviceId)),
      verifiedAt: new Date().toISOString(),
      expiresAt: futureIso(),
      riskDecision: 'ALLOW',
      rateLimitPolicyVersion: 'development-mock-v1',
    });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/v1/wecom/corps/')) {
    const parts = url.pathname.split('/').map(decodeURIComponent);
    const corpId = parts[4];
    if (parts.length === 5)
      return json(response, 200, {
        tenantId: options.tenantId,
        corpId,
        token: 'development-mock-wecom-callback-token',
        encodingAesKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      });
    if (parts[5] === 'members' && parts[6])
      return json(response, 200, {
        userId: options.userId,
        roleCodes: ['MERCHANT_OWNER'],
        storeIds: [options.storeId],
        sessionId: `development-mock-wecom-${parts[6]}`,
        intakeSessionId: ids.intakeSessionId,
      });
  }

  if (request.method === 'POST' && url.pathname === '/v1/payments')
    return json(response, 200, {
      providerPaymentId: `mock-pay-${randomUUID()}`,
      clientCredential: 'development-mock-payment-credential',
      expiresAt: futureIso(15 * 60_000),
      responseSummary: { dataSource: 'development-mock', provider: body.provider ?? 'SANDBOX' },
    });
  if (request.method === 'POST' && url.pathname === '/v1/refunds')
    return json(response, 200, {
      providerRefundId: `mock-refund-${randomUUID()}`,
      providerRequestId: `mock-request-${randomUUID()}`,
      status: 'SUCCEEDED',
    });
  if (request.method === 'POST' && url.pathname === '/v1/reconciliation/daily-bill')
    return json(response, 200, {
      objectRef: `development-mock/bills/${body.businessDate ?? 'current'}.json`,
      sha256: sha256(JSON.stringify(body)),
      lines: [],
    });

  if (request.method === 'POST' && url.pathname === '/v1/customer-service/knowledge/search')
    return json(response, 200, [
      {
        id: ids.citationId,
        publicationId: ids.publicationId,
        tenantId: body.tenantId ?? options.tenantId,
        storeId: body.storeId ?? options.storeId,
        documentId: ids.documentId,
        documentVersion: 1,
        title: '开发模拟知识条目',
        excerpt: '这是明确标记的 development-mock 内容，不可作为生产事实或验收证据。',
        sourceType: 'EMPLOYEE_CONFIRMED_QA',
        expiresAt: null,
      },
    ]);
  if (request.method === 'POST' && url.pathname === '/v1/customer-service/read-tools/query')
    return json(response, 200, {
      data: { dataSource: 'development-mock', toolCode: body.toolCode ?? 'UNKNOWN' },
      sourceVersion: 'development-mock-v1',
      observedAt: new Date().toISOString(),
    });
  if (request.method === 'POST' && url.pathname === '/v1/customer-service/model/answer')
    return json(response, 200, {
      answer: '这是开发模拟回答，正式环境必须接入经批准的模型和知识服务。',
      usedCitationIds: Array.isArray(body.citations) ? body.citations.map((item) => item.id) : [],
      confidence: 0.5,
      requiresHuman: true,
      riskLabels: ['DEVELOPMENT_MOCK'],
      modelRoute: 'development-mock',
      modelCode: 'deterministic-mock-v1',
      provider: 'LOCAL_DEVELOPMENT_MOCK',
      modelTraceRef: `mock-trace-${randomUUID()}`,
      inputUnits: 0,
      outputUnits: 0,
      costMinorUnits: 0,
    });
  if (request.method === 'POST' && url.pathname === '/v1/wecom/internal/notifications')
    return json(response, 202, { accepted: true, dataSource: 'development-mock' });

  if (request.method === 'POST' && url.pathname === '/v1/geo/submit')
    return json(response, 200, {
      status: 'SUCCEEDED',
      externalRecordId: `mock-geo-${randomUUID()}`,
      publicUrl: 'http://127.0.0.1/development-mock/geo',
      responseReference: `mock-response-${randomUUID()}`,
      summary: { dataSource: 'development-mock' },
    });
  if (request.method === 'POST' && url.pathname === '/v1/geo/inspect')
    return json(response, 200, {
      accessible: true,
      authorizationActive: true,
      responseReference: `mock-inspection-${randomUUID()}`,
      strongFieldHashes: {},
    });
  if (request.method === 'POST' && url.pathname === '/v1/plugins/invoke')
    return json(response, 200, {
      status: 'SUCCEEDED',
      result: { dataSource: 'development-mock', echo: body.input ?? {} },
    });
  if (request.method === 'POST' && url.pathname === '/v1/plugins/uninstall') return empty(response);

  if (request.method === 'POST' && url.pathname === '/v1/wechat/authorizations/exchange')
    return json(response, 200, {
      appId: 'wx-development-mock',
      subjectName: '开发模拟主体',
      scopeCodes: ['DEVELOPMENT_MOCK'],
      credentialSecretRef: 'mock-secret-ref://wechat/development',
      authorizedAt: new Date().toISOString(),
      externalRequestId: `mock-request-${randomUUID()}`,
    });
  if (request.method === 'POST' && url.pathname === '/v1/wechat/releases/submit-review')
    return json(response, 200, {
      externalRequestId: `mock-request-${randomUUID()}`,
      externalAuditId: `mock-audit-${randomUUID()}`,
    });
  if (request.method === 'POST' && url.pathname === '/v1/wechat/releases/publish')
    return json(response, 200, {
      externalRequestId: `mock-request-${randomUUID()}`,
      externalVersion: 'development-mock-v1',
    });
  if (request.method === 'POST' && url.pathname === '/v1/wechat/releases/query-online')
    return json(response, 200, {
      releaseId: body.releaseId ?? null,
      externalVersion: body.releaseId ? 'development-mock-v1' : null,
    });
  if (request.method === 'POST' && url.pathname === '/v1/wechat/releases/rollback')
    return json(response, 200, {
      externalRequestId: `mock-request-${randomUUID()}`,
      externalVersion: 'development-mock-rollback-v1',
    });
  if (request.method === 'POST' && url.pathname === '/v1/wechat/callbacks/decode')
    return json(response, 200, {
      tenantId: options.tenantId,
      appId: 'wx-development-mock',
      providerEventId: `mock-event-${sha256(String(body.encrypted)).slice(0, 20)}`,
      eventType: 'REVIEW_APPROVED',
      externalAuditId: 'mock-audit-approved',
    });
  if (request.method === 'POST' && url.pathname === '/v1/mini-program-builds')
    return json(response, 200, {
      artifactRef: `development-mock/artifacts/${randomUUID()}.zip`,
      artifactDigest: sha256(JSON.stringify(body)),
      previewRef: 'http://127.0.0.1/development-mock/preview',
      templateCommit: body.templateCommit ?? 'development-mock-template',
      backendApiVersion: '6.1.0-development-mock',
      databaseCompatibilityMin: '6.1.0',
      databaseCompatibilityMax: '6.1.x',
      smokeTestResult: { passed: true, checks: { developmentMockContract: true } },
    });

  if (request.method === 'POST' && url.pathname === '/v1/events') {
    state.events.push({ id: body.id, receivedAt: new Date().toISOString() });
    return json(response, 202, { accepted: true, dataSource: 'development-mock' });
  }
  if (request.method === 'POST' && url.pathname === '/v1/privacy/delete')
    return json(response, 202, { accepted: true, dataSource: 'development-mock' });
  if (request.method === 'POST' && url.pathname === '/v1/privacy-exports')
    return json(response, 200, {
      objectKey: `${body.tenantId}/development-mock/privacy/${body.requestId}.json.enc`,
      encryptionKeyRef: 'mock-kms://development-only/key-v1',
      expiresAt: futureIso(14 * 60_000),
      encrypted: true,
      deliveryAccepted: true,
    });

  return json(response, 404, { error: 'development mock route not implemented' });
}

export async function startDevelopmentMockGateway({
  environment = process.env,
  host = environment.LEQU_DEVELOPMENT_MOCK_HOST ?? '127.0.0.1',
  port = Number(environment.LEQU_DEVELOPMENT_MOCK_PORT ?? 3399),
  token = environment.LEQU_DEVELOPMENT_MOCK_TOKEN ?? DEVELOPMENT_MOCK_TOKEN,
  tenantId = environment.LEQU_DEVELOPMENT_MOCK_TENANT_ID ?? ids.tenantId,
  userId = environment.LEQU_DEVELOPMENT_MOCK_USER_ID ?? ids.userId,
  storeId = environment.LEQU_DEVELOPMENT_MOCK_STORE_ID ?? ids.storeId,
} = {}) {
  assertDevelopmentOnly(environment);
  const state = { objects: new Map(), events: [] };
  const server = createServer((request, response) => {
    route(request, response, state, { token, tenantId, userId, storeId }).catch((error) =>
      json(response, 500, {
        error: 'development mock request failed',
        detail: error instanceof Error ? error.message : 'unknown error',
      }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return { server, state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = await startDevelopmentMockGateway();
  const address = server.address();
  const location =
    typeof address === 'object' && address ? `${address.address}:${address.port}` : address;
  console.log(`Lequ development mock gateway listening on ${location}`);
  console.log('Data source: development-mock. This process is forbidden in production.');
}
