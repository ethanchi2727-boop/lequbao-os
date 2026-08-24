import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { SessionAuthenticationError } from './session-identity.js';

let app: FastifyInstance | undefined;

const financialIdentity = {
  tenantId: '00000000-0000-4000-8000-000000000003',
  userId: '00000000-0000-4000-8000-000000000013',
  roleCodes: ['PLATFORM_FINANCE'],
  storeIds: [],
  sessionId: 'signed-session',
};

const authFor = (identity: typeof financialIdentity) => ({
  sessionIdentity: {
    verify: (authorization: string | undefined) => {
      if (authorization !== 'Bearer signed') throw new SessionAuthenticationError();
      return identity;
    },
  },
  accessControl: {
    validate: async () => identity,
    authorize: async () => identity as never,
  },
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('platform API shell', () => {
  it('reports process health without claiming database readiness', async () => {
    app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '6.1.0' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-trace-id']).toBeTruthy();
  });

  it('keeps operational metrics behind a constant-time internal bearer boundary', async () => {
    const token = 'internal-worker-token-with-at-least-thirty-two-bytes';
    app = await buildApp({ internalWorkerToken: token });
    expect((await app.inject({ method: 'GET', url: '/internal/v1/metrics' })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: '/internal/v1/metrics',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('lequ_http_requests_total');
    expect(response.body).not.toMatch(/tenant|customer/u);
  });

  it('fails readiness when the database is unavailable', async () => {
    app = await buildApp({ databaseCheck: () => Promise.reject(new Error('offline')) });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('rejects unsigned context instead of trusting a tenant header', async () => {
    app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/context' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'AUTHENTICATION_UNAVAILABLE' });
  });

  it('derives context only from an active signed session', async () => {
    app = await buildApp(authFor(financialIdentity));
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/context',
      headers: { authorization: 'Bearer signed', 'x-tenant-id': 'attacker-tenant' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      tenantId: financialIdentity.tenantId,
      userId: financialIdentity.userId,
      roleCodes: financialIdentity.roleCodes,
      storeIds: financialIdentity.storeIds,
      sessionId: financialIdentity.sessionId,
      authLevel: 'PASSWORD',
    });
  });

  it('serves the today operating view only through the authorized employee context', async () => {
    const getToday = vi.fn().mockResolvedValue({
      timezone: 'Asia/Shanghai',
      storeScope: 'TENANT',
      metrics: { ordersCreated: 1 },
      todos: [],
    });
    app = await buildApp({
      ...authFor(financialIdentity),
      operationalHome: { getToday },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/operational-home/today',
      headers: { authorization: 'Bearer signed', 'x-tenant-id': 'attacker-tenant' },
    });
    expect(response.statusCode).toBe(200);
    expect(getToday).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: financialIdentity.tenantId }),
    );
  });

  it('enforces GEO read and MFA remediation through employee authorization', async () => {
    const overview = vi.fn().mockResolvedValue({ summary: {}, profiles: [] });
    const listDifferences = vi.fn().mockResolvedValue([]);
    const decideDifference = vi.fn().mockResolvedValue({ status: 'RESOLVED' });
    app = await buildApp({
      ...authFor(financialIdentity),
      geoOperations: { overview, listDifferences, decideDifference },
    });
    const headers = { authorization: 'Bearer signed' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/geo-operations/overview',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const differenceId = '00000000-0000-4000-8000-000000000089';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/geo-operations/differences/${differenceId}/actions/decide`,
      headers,
      payload: { decision: 'RESOLVE', reasonCode: 'MERCHANT_CONFIRMED' },
    });
    expect(response.statusCode).toBe(200);
    expect(overview).toHaveBeenCalledWith(expect.anything(), {});
    expect(decideDifference).toHaveBeenCalledWith(
      expect.objectContaining({
        differenceId,
        body: { decision: 'RESOLVE', reasonCode: 'MERCHANT_CONFIRMED' },
      }),
    );
  });

  it('forwards customer-service duty, task, and quality commands with server identity and idempotency', async () => {
    const service = {
      listShifts: vi.fn().mockResolvedValue([]),
      createShift: vi.fn().mockResolvedValue({ id: 'shift-1' }),
      listTasks: vi.fn().mockResolvedValue([]),
      createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
      completeTask: vi.fn().mockResolvedValue({ id: 'task-1', status: 'DONE' }),
      listQualityReviews: vi.fn().mockResolvedValue([]),
      decideQualityReview: vi.fn().mockResolvedValue({ id: 'review-1', status: 'REVIEWED' }),
    };
    app = await buildApp({
      ...authFor(financialIdentity),
      customerServiceOperations: service,
    });
    const headers = { authorization: 'Bearer signed', 'idempotency-key': 'customer-ops-key' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/customer-service-operations/shifts?status=SCHEDULED',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/customer-service-operations/tasks',
          headers,
          payload: { storeId: 'store-1' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/customer-service-operations/tasks/task-1/actions/complete',
          headers,
          payload: { expectedVersion: 1, resolutionCode: 'RESOLVED' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/customer-service-operations/quality-reviews/review-1/actions/decide',
          headers,
          payload: { expectedVersion: 1, decision: 'REVIEWED' },
        })
      ).statusCode,
    ).toBe(200);
    expect(service.listShifts).toHaveBeenCalledWith(expect.anything(), { status: 'SCHEDULED' });
    expect(service.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: financialIdentity.tenantId }),
      'customer-ops-key',
      expect.any(String),
      { storeId: 'store-1' },
    );
    expect(service.completeTask).toHaveBeenCalledWith(
      expect.anything(),
      'task-1',
      'customer-ops-key',
      expect.any(String),
      { expectedVersion: 1, resolutionCode: 'RESOLVED' },
    );
    expect(service.decideQualityReview).toHaveBeenCalledWith(
      expect.anything(),
      'review-1',
      'customer-ops-key',
      expect.any(String),
      { expectedVersion: 1, decision: 'REVIEWED' },
    );
  });

  it('forwards platform control reads and versioned commands without accepting client identity', async () => {
    const platformControl = {
      listConnectorHealth: vi.fn().mockResolvedValue([]),
      retryConnector: vi.fn().mockResolvedValue({ status: 'CHECKING' }),
      listRewardRules: vi.fn().mockResolvedValue([]),
      publishRewardRule: vi.fn().mockResolvedValue({ version: 2 }),
      listSkills: vi.fn().mockResolvedValue([]),
      listMerchants: vi.fn().mockResolvedValue([]),
      listPlans: vi.fn().mockResolvedValue([]),
      updatePlan: vi.fn().mockResolvedValue({ planCode: 'PRO', version: 2 }),
      listDiscrepancies: vi.fn().mockResolvedValue([]),
      resolveDiscrepancy: vi.fn().mockResolvedValue({ status: 'RESOLVED' }),
      listPartners: vi.fn().mockResolvedValue([]),
      savePartner: vi.fn().mockResolvedValue({ id: 'partner-1' }),
      listModelBudgets: vi.fn().mockResolvedValue([]),
      saveModelBudget: vi.fn().mockResolvedValue({ routeCode: 'CUSTOMER_SERVICE', version: 1 }),
    };
    app = await buildApp({ ...authFor(financialIdentity), platformControl });
    const headers = { authorization: 'Bearer signed', 'idempotency-key': 'platform-control-1' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/platform/merchants?status=ACTIVE',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/platform/plans/PRO/actions/update-entitlements',
          headers: { ...headers, 'x-tenant-id': 'attacker-tenant' },
          payload: { expectedVersion: 1, entitlements: { stores: 5 } },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/finance/reconciliation-discrepancies/difference-1/actions/resolve',
          headers,
          payload: {
            expectedVersion: 1,
            decision: 'RESOLVED',
            resolutionCode: 'PROVIDER_CONFIRMED',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(platformControl.listMerchants).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: financialIdentity.tenantId }),
      { status: 'ACTIVE' },
    );
    expect(platformControl.updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: financialIdentity.tenantId }),
      'PRO',
      'platform-control-1',
      expect.any(String),
      { expectedVersion: 1, entitlements: { stores: 5 } },
    );
    expect(platformControl.resolveDiscrepancy).toHaveBeenCalledWith(
      expect.anything(),
      'difference-1',
      'platform-control-1',
      expect.any(String),
      expect.objectContaining({ resolutionCode: 'PROVIDER_CONFIRMED' }),
    );
  });

  it('refreshes a device-bound session without requiring an access token', async () => {
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'next', refreshToken: 'rotated' });
    app = await buildApp({ authSessions: { refresh, issue: vi.fn(), revoke: vi.fn() } });
    const body = {
      tenantId: financialIdentity.tenantId,
      userId: financialIdentity.userId,
      sessionId: '00000000-0000-4000-8000-000000000014',
      refreshToken: 'r'.repeat(43),
      deviceId: 'device-identifier-1',
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sessions/refresh',
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(refresh).toHaveBeenCalledWith(body);
  });

  it('switches organization using only the authenticated user and current auth level', async () => {
    const issue = vi.fn().mockResolvedValue({ accessToken: 'tenant-token' });
    app = await buildApp({
      ...authFor({ ...financialIdentity, authLevel: 'MFA' } as typeof financialIdentity),
      authSessions: { issue, refresh: vi.fn(), revoke: vi.fn() },
    });
    const targetTenantId = '00000000-0000-4000-8000-000000000099';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sessions/switch-tenant',
      headers: { authorization: 'Bearer signed' },
      payload: { tenantId: targetTenantId, deviceId: 'device-identifier-1', userId: 'attacker' },
    });
    expect(response.statusCode).toBe(200);
    expect(issue).toHaveBeenCalledWith({
      tenantId: targetTenantId,
      userId: financialIdentity.userId,
      authLevel: 'MFA',
      deviceId: 'device-identifier-1',
    });
  });

  it('revokes the authenticated session and ignores any client identity', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    app = await buildApp({
      ...authFor(financialIdentity),
      authSessions: { issue: vi.fn(), refresh: vi.fn(), revoke },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sessions/revoke',
      headers: { authorization: 'Bearer signed' },
      payload: { reason: 'USER_LOGOUT', userId: 'attacker' },
    });
    expect(response.statusCode).toBe(204);
    expect(revoke).toHaveBeenCalledWith(financialIdentity, 'USER_LOGOUT');
  });

  it('keeps delivery project and step identity authoritative from the route', async () => {
    const executeStep = vi
      .fn()
      .mockResolvedValue({ id: 'delivery-project', status: 'PROVISIONING' });
    app = await buildApp({
      ...authFor({ ...financialIdentity, authLevel: 'MFA' } as typeof financialIdentity),
      deliveryWorkflows: {
        create: vi.fn(),
        start: vi.fn(),
        executeStep,
        retryStep: vi.fn(),
        accept: vi.fn(),
        suspend: vi.fn(),
        assignTemporaryAccess: vi.fn(),
        get: vi.fn(),
        listExceptions: vi.fn(),
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/delivery-projects/41000000-0000-4000-8000-000000000003/steps/geo.publish/actions/execute',
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'execute-geo-1' },
      payload: {
        projectId: '41000000-0000-4000-8000-999999999999',
        stepCode: 'miniapp.release',
        inputSnapshot: { targets: ['one'] },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(executeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ userId: financialIdentity.userId }),
        body: {
          projectId: '41000000-0000-4000-8000-000000000003',
          stepCode: 'geo.publish',
          inputSnapshot: { targets: ['one'] },
        },
      }),
    );
  });

  it('creates an active revenue right through the injected transactional service', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      merchantProfileId: '00000000-0000-4000-8000-000000000011',
      status: 'ACTIVE',
      startsAt: '2026-08-17T12:00:00+08:00',
      holders: [{ beneficiaryId: '00000000-0000-4000-8000-000000000012', shareBps: 7000 }],
    });
    app = await buildApp({ ...authFor(financialIdentity), revenueRights: { create } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants/00000000-0000-4000-8000-000000000011/revenue-rights',
      headers: {
        authorization: 'Bearer signed',
        'idempotency-key': 'merchant-11-original-right',
      },
      payload: {
        sourceContractRef: 'contract-11',
        startsAt: '2026-08-17T12:00:00+08:00',
        createdBy: '00000000-0000-4000-8000-000000000013',
        holders: [{ beneficiaryId: '00000000-0000-4000-8000-000000000012', shareBps: 7000 }],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'merchant-11-original-right' }),
    );
  });

  it('locks a distribution using the subscription path as the source of truth', async () => {
    const lock = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000020',
      status: 'LOCKED',
      policyVersion: 1,
      actualReceiptMinorUnits: '1000',
      refundMinorUnits: '100',
      directCostMinorUnits: '100',
      distributableMinorUnits: '800',
      allocations: [],
    });
    app = await buildApp({ ...authFor(financialIdentity), distributionLocks: { lock } });
    const subscriptionId = '00000000-0000-4000-8000-000000000021';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${subscriptionId}/distribution-statements:lock`,
      headers: {
        authorization: 'Bearer signed',
        'idempotency-key': 'lock-subscription-21-2026-08',
      },
      payload: {
        subscriptionId: '00000000-0000-4000-8000-999999999999',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        lockedBy: '00000000-0000-4000-8000-000000000022',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(lock).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ subscriptionId }) }),
    );
  });

  it('keeps approval and payout resource IDs authoritative from their paths', async () => {
    const requestApproval = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000030',
      statementId: '00000000-0000-4000-8000-000000000031',
      actionType: 'PAY',
      reasonCode: 'OBSERVATION_COMPLETE',
      status: 'PENDING',
      requestedBy: '00000000-0000-4000-8000-000000000032',
      approvedBy: null,
      expiresAt: '2026-08-18T12:00:00+08:00',
    });
    const pay = vi.fn().mockResolvedValue({
      statementId: '00000000-0000-4000-8000-000000000031',
      status: 'PAID',
      entryIds: ['00000000-0000-4000-8000-000000000033'],
    });
    app = await buildApp({
      ...authFor(financialIdentity),
      distributionSettlements: {
        requestApproval,
        pay,
        approve: vi.fn(),
        reverse: vi.fn(),
      },
    });
    const headers = {
      authorization: 'Bearer signed',
      'idempotency-key': 'distribution-action-31',
    };
    const statementId = '00000000-0000-4000-8000-000000000031';
    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/distribution-statements/${statementId}/action-approvals`,
      headers,
      payload: {
        statementId: '00000000-0000-4000-8000-999999999999',
        actionType: 'PAY',
        reasonCode: 'OBSERVATION_COMPLETE',
        requestedBy: '00000000-0000-4000-8000-000000000032',
        expiresAt: '2026-08-18T12:00:00+08:00',
      },
    });
    expect(approvalResponse.statusCode).toBe(201);
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ statementId }) }),
    );

    const payResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/distribution-statements/${statementId}/actions/pay`,
      headers: { ...headers, 'idempotency-key': 'distribution-pay-31' },
      payload: {
        statementId: '00000000-0000-4000-8000-999999999999',
        approvalId: '00000000-0000-4000-8000-000000000030',
        executedBy: '00000000-0000-4000-8000-000000000034',
        provider: 'WECHAT',
        completedAt: '2026-08-18T10:00:00+08:00',
        payments: [
          {
            allocationId: '00000000-0000-4000-8000-000000000035',
            providerPaymentRefHash: 'a'.repeat(64),
          },
        ],
      },
    });
    expect(payResponse.statusCode).toBe(200);
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ statementId }) }),
    );
  });

  it('requires signed identity and keeps intake upload IDs authoritative from paths', async () => {
    const identity = {
      tenantId: '00000000-0000-4000-8000-000000000003',
      userId: '00000000-0000-4000-8000-000000000040',
      roleCodes: ['MERCHANT_OWNER'],
      storeIds: [],
      sessionId: 'signed-session',
    };
    const create = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000041',
      sessionId: '00000000-0000-4000-8000-000000000042',
      objectKey: 'tenant/intake/upload',
      uploadUrl: 'https://objects.example/v1/upload',
      headers: { 'x-content-sha256': 'a'.repeat(64) },
      expiresAt: '2026-08-18T12:00:00.000Z',
    });
    const complete = vi.fn().mockResolvedValue({
      uploadId: '00000000-0000-4000-8000-000000000041',
      assetId: '00000000-0000-4000-8000-000000000043',
      sessionId: '00000000-0000-4000-8000-000000000042',
      securityStatus: 'PENDING',
      processingStatus: 'QUEUED',
    });
    app = await buildApp({
      sessionIdentity: {
        verify: (authorization) => {
          if (authorization !== 'Bearer signed') throw new SessionAuthenticationError();
          return identity;
        },
      },
      accessControl: authFor(identity).accessControl,
      merchantIntakeUploads: { create, complete },
    });
    const sessionId = '00000000-0000-4000-8000-000000000042';
    const unsigned = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant-intake/sessions/${sessionId}/uploads`,
      headers: { 'idempotency-key': 'upload-42' },
      payload: {},
    });
    expect(unsigned.statusCode).toBe(401);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant-intake/sessions/${sessionId}/uploads`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'upload-42' },
      payload: {
        sessionId: '00000000-0000-4000-8000-999999999999',
        assetType: 'IMAGE',
        sha256: 'a'.repeat(64),
        contentType: 'image/jpeg',
        maxBytes: 1024,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ identity, body: expect.objectContaining({ sessionId }) }),
    );

    const uploadId = '00000000-0000-4000-8000-000000000041';
    const completion = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant-intake/uploads/${uploadId}/actions/complete`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'complete-41' },
      payload: { uploadId: '00000000-0000-4000-8000-999999999999' },
    });
    expect(completion.statusCode).toBe(202);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ identity, body: expect.objectContaining({ uploadId }) }),
    );
  });

  it('accepts authenticated text messages and delegates verified WeCom XML callbacks', async () => {
    const identity = {
      tenantId: '00000000-0000-4000-8000-000000000003',
      userId: '00000000-0000-4000-8000-000000000040',
      roleCodes: ['MERCHANT_OWNER'],
      storeIds: [],
      sessionId: 'signed-session',
    };
    const add = vi.fn().mockResolvedValue({ id: 'asset' });
    const receive = vi.fn().mockResolvedValue({ accepted: true, replayed: false });
    app = await buildApp({
      sessionIdentity: { verify: () => identity },
      accessControl: authFor(identity).accessControl,
      merchantIntakeMessages: { add },
      wecomIntakeCallback: { receive },
    });
    const sessionId = '00000000-0000-4000-8000-000000000042';
    const message = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant-intake/sessions/${sessionId}/messages`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'message-42' },
      payload: { content: '补充营业时间' },
    });
    expect(message.statusCode).toBe(202);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ sessionId }) }),
    );

    const callback = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/wecom/intake?msg_signature=sig&timestamp=1&nonce=n',
      headers: { 'content-type': 'application/xml' },
      payload: '<xml/>',
    });
    expect(callback.statusCode).toBe(200);
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ signature: 'sig', timestamp: '1', nonce: 'n', xml: '<xml/>' }),
    );
  });

  it('keeps mini-program route IDs authoritative and acknowledges only delegated WeChat callbacks', async () => {
    const identity = {
      tenantId: '00000000-0000-4000-8000-000000000003',
      userId: '00000000-0000-4000-8000-000000000040',
      roleCodes: ['MERCHANT_OWNER'],
      storeIds: [],
      sessionId: 'signed-session',
      authLevel: 'MFA' as const,
    };
    const createPreview = vi.fn().mockResolvedValue({ id: 'mini-program', status: 'AUTHORIZED' });
    const receive = vi.fn().mockResolvedValue({ accepted: true });
    app = await buildApp({
      sessionIdentity: { verify: () => identity },
      accessControl: authFor(identity).accessControl,
      miniPrograms: { createPreview } as never,
      miniProgramCallback: { receive },
    });
    const miniProgramId = '00000000-0000-4000-8000-000000000051';
    const preview = await app.inject({
      method: 'POST',
      url: `/api/v1/mini-programs/${miniProgramId}/releases`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'preview-51' },
      payload: {
        miniProgramId: '00000000-0000-4000-8000-999999999999',
        templateVersion: '6.1.0',
        configVersion: 1,
        config: { theme: 'gold' },
      },
    });
    expect(preview.statusCode).toBe(202);
    expect(createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ miniProgramId }) }),
    );

    const callback = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/wechat/mini-program?msg_signature=sig&timestamp=1&nonce=n',
      headers: { 'content-type': 'application/xml' },
      payload: '<xml><Encrypt>ciphertext</Encrypt></xml>',
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.body).toBe('success');
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ signature: 'sig', timestamp: '1', nonce: 'n' }),
    );
  });

  it('uses the consumer-token audience and path-authoritative conversation id for customer messages', async () => {
    const consumer = {
      tenantId: '00000000-0000-4000-8000-000000000061',
      customerId: '00000000-0000-4000-8000-000000000062',
      storeId: '00000000-0000-4000-8000-000000000063',
      sessionId: 'consumer-session-61',
      authLevel: 'PHONE_BOUND' as const,
    };
    const sendCustomerMessage = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000064',
      senderType: 'CUSTOMER',
    });
    const listConsumerConversations = vi.fn().mockResolvedValue([]);
    app = await buildApp({
      consumerSession: { verify: () => consumer },
      customerService: { sendCustomerMessage, listConsumerConversations } as never,
    });
    const conversationId = '00000000-0000-4000-8000-000000000065';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/customer-service/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer consumer', 'idempotency-key': 'customer-message-65' },
      payload: {
        conversationId: '00000000-0000-4000-8000-999999999999',
        senderType: 'EMPLOYEE',
        senderUserId: '00000000-0000-4000-8000-999999999998',
        content: '请问营业时间？',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(sendCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: consumer,
        body: expect.objectContaining({ conversationId }),
      }),
    );
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/customer-service/conversations',
      headers: { authorization: 'Bearer consumer' },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listConsumerConversations).toHaveBeenCalledWith(consumer);
  });

  it('queues consumer privacy corrections without accepting a client-supplied customer identity', async () => {
    const consumer = {
      tenantId: '00000000-0000-4000-8000-000000000061',
      customerId: '00000000-0000-4000-8000-000000000062',
      storeId: '00000000-0000-4000-8000-000000000063',
      sessionId: 'consumer-session-61',
      authLevel: 'PHONE_BOUND' as const,
    };
    const requestPrivacy = vi.fn().mockResolvedValue({
      requestId: '00000000-0000-4000-8000-000000000066',
      status: 'QUEUED',
    });
    app = await buildApp({
      consumerSession: { verify: () => consumer },
      customerService: { requestPrivacy } as never,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/customer-profile/privacy-requests',
      headers: { authorization: 'Bearer consumer', 'idempotency-key': 'privacy-request-66' },
      payload: {
        customerId: '00000000-0000-4000-8000-999999999999',
        requestType: 'DELETE',
        scope: ['PROFILE_FACTS'],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(requestPrivacy).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: consumer,
        body: expect.not.objectContaining({ identity: expect.anything() }),
      }),
    );
  });

  it('keeps the knowledge publication id authoritative from the revoke route', async () => {
    const revokeKnowledge = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000067',
      status: 'REVOKED',
    });
    app = await buildApp({
      ...authFor(financialIdentity),
      customerService: { revokeKnowledge } as never,
    });
    const publicationId = '00000000-0000-4000-8000-000000000067';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/customer-service/knowledge-publications/${publicationId}/actions/revoke`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'revoke-knowledge-67' },
      payload: {
        publicationId: '00000000-0000-4000-8000-999999999999',
        reason: '规则已经失效',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(revokeKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ body: { publicationId, reason: '规则已经失效' } }),
    );
  });

  it('protects internal AI job processing with a separate constant-time worker bearer', async () => {
    const process = vi.fn().mockResolvedValue({ status: 'SUCCEEDED' });
    const token = 'internal-worker-token-with-at-least-thirty-two-bytes';
    app = await buildApp({
      customerServiceAi: { process },
      internalWorkerToken: token,
    });
    const payload = {
      tenantId: '00000000-0000-4000-8000-000000000071',
      jobId: '00000000-0000-4000-8000-000000000072',
      workerId: 'worker-1',
      traceId: 'trace-worker-1',
    };
    const denied = await app.inject({
      method: 'POST',
      url: '/internal/v1/customer-service/ai-jobs/process',
      headers: { authorization: 'Bearer incorrect-worker-token' },
      payload,
    });
    expect(denied.statusCode).toBe(401);
    expect(process).not.toHaveBeenCalled();
    const accepted = await app.inject({
      method: 'POST',
      url: '/internal/v1/customer-service/ai-jobs/process',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(accepted.statusCode).toBe(202);
    expect(process).toHaveBeenCalledWith(payload);
  });

  it('exposes consumer commerce commands without trusting path or payload identity fields', async () => {
    const consumer = {
      tenantId: '00000000-0000-4000-8000-000000000081',
      customerId: '00000000-0000-4000-8000-000000000082',
      storeId: '00000000-0000-4000-8000-000000000083',
      sessionId: 'consumer-session-81',
      authLevel: 'PHONE_BOUND' as const,
    };
    const create = vi.fn().mockResolvedValue({ id: 'order-1' });
    const createIntent = vi.fn().mockResolvedValue({ id: 'intent-1' });
    const request = vi.fn().mockResolvedValue({ id: 'refund-1' });
    const listConsumerTokens = vi.fn().mockResolvedValue([]);
    app = await buildApp({
      consumerSession: { verify: () => consumer },
      commerceOrders: { create } as never,
      commercePayments: { createIntent } as never,
      commerceRefunds: { request } as never,
      commerceVerification: { listConsumerTokens } as never,
    });
    const headers = { authorization: 'Bearer consumer', 'idempotency-key': 'commerce-81' };
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/orders', headers, payload: {} }))
        .statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/payment-intents', headers, payload: {} }))
        .statusCode,
    ).toBe(202);
    const orderId = '00000000-0000-4000-8000-000000000084';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${orderId}/refunds`,
          headers,
          payload: { orderId: 'attacker' },
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/orders/${orderId}/verification-entitlements`,
          headers: { authorization: 'Bearer consumer' },
        })
      ).statusCode,
    ).toBe(200);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ identity: consumer }));
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({ identity: consumer }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ body: { orderId } }));
    expect(listConsumerTokens).toHaveBeenCalledWith(consumer, orderId);
  });

  it('exposes the consumer catalog only through the verified store-bound session', async () => {
    const consumer = {
      tenantId: '00000000-0000-4000-8000-000000000081',
      customerId: '00000000-0000-4000-8000-000000000082',
      storeId: '00000000-0000-4000-8000-000000000083',
      sessionId: 'consumer-session-81',
      authLevel: 'PHONE_BOUND' as const,
    };
    const getStorefront = vi.fn().mockResolvedValue({ id: consumer.storeId });
    const listProducts = vi.fn().mockResolvedValue([{ id: 'product-1' }]);
    const getProduct = vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000085' });
    const getMembership = vi.fn().mockResolvedValue({ status: 'ACTIVE' });
    const getTraceReport = vi.fn().mockResolvedValue({ productId: 'trace-product' });
    app = await buildApp({
      consumerSession: { verify: () => consumer },
      consumerCatalog: {
        getStorefront,
        listProducts,
        getProduct,
        getMembership,
        getTraceReport,
      },
    });
    const headers = { authorization: 'Bearer consumer' };
    const productId = '00000000-0000-4000-8000-000000000085';
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/consumer/storefront', headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/consumer/membership', headers })).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/consumer/products?productType=GROUP_BUY&query=火锅&limit=10',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/consumer/products/${productId}/trace-report`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/consumer/products/${productId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(getStorefront).toHaveBeenCalledWith(consumer);
    expect(getMembership).toHaveBeenCalledWith(consumer);
    expect(listProducts).toHaveBeenCalledWith(
      consumer,
      expect.objectContaining({ productType: 'GROUP_BUY', query: '火锅', limit: '10' }),
    );
    expect(getProduct).toHaveBeenCalledWith(consumer, productId);
    expect(getTraceReport).toHaveBeenCalledWith(consumer, productId);
  });

  it('lists merchant stores and rotates the store-bound consumer session', async () => {
    const consumer = {
      tenantId: '00000000-0000-4000-8000-000000000081',
      customerId: '00000000-0000-4000-8000-000000000082',
      storeId: '00000000-0000-4000-8000-000000000083',
      sessionId: 'consumer-session-81',
      authLevel: 'PHONE_BOUND' as const,
    };
    const list = vi.fn().mockResolvedValue([{ id: consumer.storeId, current: true }]);
    const switchStore = vi.fn().mockResolvedValue({ accessToken: 'rotated-token' });
    app = await buildApp({
      consumerSession: { verify: () => consumer },
      consumerStoreSwitch: { list, switch: switchStore },
    });
    const headers = { authorization: 'Bearer consumer', 'idempotency-key': 'switch-store-1' };
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/consumer/stores', headers })).statusCode,
    ).toBe(200);
    const storeId = '00000000-0000-4000-8000-000000000084';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/consumer/session/actions/switch-store',
          headers,
          payload: { storeId },
        })
      ).statusCode,
    ).toBe(200);
    expect(list).toHaveBeenCalledWith(consumer);
    expect(switchStore).toHaveBeenCalledWith({
      identity: consumer,
      idempotencyKey: 'switch-store-1',
      body: { storeId },
    });
  });

  it('keeps the cross-merchant cart behind the separate platform consumer audience', async () => {
    const lifeConsumer = {
      accountId: '00000000-0000-4000-8000-000000000086',
      sessionId: 'life-session-86',
      authLevel: 'PHONE_BOUND' as const,
    };
    const get = vi.fn().mockResolvedValue({ id: 'cart-1', groups: [] });
    const setItem = vi.fn().mockResolvedValue({ id: 'cart-1', itemCount: 2 });
    const removeItem = vi.fn().mockResolvedValue({ id: 'cart-1', itemCount: 0 });
    const listDiscoveryStores = vi.fn().mockResolvedValue([]);
    const listDiscoveryProducts = vi.fn().mockResolvedValue([]);
    const getDiscoveryProduct = vi.fn().mockResolvedValue({ id: 'product-1' });
    const getDiscoveryTraceReport = vi.fn().mockResolvedValue({ id: 'trace-1' });
    app = await buildApp({
      lifeConsumerSession: { verify: () => lifeConsumer },
      platformCart: { get, setItem, removeItem },
      platformDiscovery: {
        listStores: listDiscoveryStores,
        listProducts: listDiscoveryProducts,
        getProduct: getDiscoveryProduct,
        getTraceReport: getDiscoveryTraceReport,
      },
    });
    const headers = { authorization: 'Bearer life-consumer' };
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/life/cart', headers })).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/life/discovery/stores?cityCode=3101&limit=20',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/life/discovery/products/00000000-0000-4000-8000-000000000091',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/life/discovery/products/00000000-0000-4000-8000-000000000091/trace-report',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/life/discovery/products?productType=PHYSICAL',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const payload = {
      merchantTenantId: '00000000-0000-4000-8000-000000000087',
      storeId: '00000000-0000-4000-8000-000000000088',
      variantId: '00000000-0000-4000-8000-000000000089',
      quantity: 2,
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/life/cart/items',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    const itemId = '00000000-0000-4000-8000-000000000090';
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/life/cart/items/${itemId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(get).toHaveBeenCalledWith(lifeConsumer);
    expect(listDiscoveryStores).toHaveBeenCalledWith(
      lifeConsumer,
      expect.objectContaining({ cityCode: '3101', limit: '20' }),
    );
    expect(getDiscoveryProduct).toHaveBeenCalledWith(
      lifeConsumer,
      '00000000-0000-4000-8000-000000000091',
    );
    expect(getDiscoveryTraceReport).toHaveBeenCalledWith(
      lifeConsumer,
      '00000000-0000-4000-8000-000000000091',
    );
    expect(setItem).toHaveBeenCalledWith(lifeConsumer, payload);
    expect(removeItem).toHaveBeenCalledWith(lifeConsumer, itemId);
  });

  it('requires both consumer audiences for merchant cart and checkout routes', async () => {
    const consumer = {
      tenantId: '00000000-0000-4000-8000-000000000087',
      customerId: '00000000-0000-4000-8000-000000000088',
      storeId: '00000000-0000-4000-8000-000000000089',
      sessionId: 'merchant-consumer-session',
      authLevel: 'PHONE_BOUND' as const,
    };
    const life = {
      accountId: '00000000-0000-4000-8000-000000000086',
      sessionId: 'life-session-86',
      authLevel: 'PHONE_BOUND' as const,
    };
    const consumerVerify = vi.fn(() => consumer);
    const lifeVerify = vi.fn(() => life);
    const getCart = vi.fn().mockResolvedValue({ id: 'cart-1', groups: [] });
    const setCartItem = vi.fn().mockResolvedValue({ id: 'cart-1', itemCount: 1 });
    const removeCartItem = vi.fn().mockResolvedValue({ id: 'cart-1', itemCount: 0 });
    const quote = vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000092' });
    const getCheckout = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000092',
    });
    const submitCheckout = vi.fn().mockResolvedValue({ status: 'ORDERS_CREATED' });
    app = await buildApp({
      consumerSession: { verify: consumerVerify },
      lifeConsumerSession: { verify: lifeVerify },
      merchantConsumerJourney: {
        getCart,
        setCartItem,
        removeCartItem,
        quote,
        getCheckout,
        submitCheckout,
      },
    });
    const dualHeaders = {
      authorization: 'Bearer merchant-consumer',
      'x-life-authorization': 'Bearer life-consumer',
    };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/merchant-consumer/cart',
          headers: dualHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/merchant-consumer/checkouts/quote',
          headers: { ...dualHeaders, 'idempotency-key': 'merchant-quote-1' },
          payload: { cartVersion: 2 },
        })
      ).statusCode,
    ).toBe(201);
    const checkoutId = '00000000-0000-4000-8000-000000000092';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/merchant-consumer/checkouts/${checkoutId}/actions/submit`,
          headers: { ...dualHeaders, 'idempotency-key': 'merchant-submit-1' },
        })
      ).statusCode,
    ).toBe(202);
    expect(consumerVerify).toHaveBeenCalledWith('Bearer merchant-consumer');
    expect(lifeVerify).toHaveBeenCalledWith('Bearer life-consumer');
    expect(getCart).toHaveBeenCalledWith({ consumer, life });
    expect(quote).toHaveBeenCalledWith({
      consumer,
      life,
      idempotencyKey: 'merchant-quote-1',
      body: { cartVersion: 2 },
    });
    expect(submitCheckout).toHaveBeenCalledWith({
      consumer,
      life,
      idempotencyKey: 'merchant-submit-1',
      checkoutId,
    });
  });

  it('keeps encrypted address CRUD behind the platform consumer audience', async () => {
    const lifeConsumer = {
      accountId: '00000000-0000-4000-8000-000000000086',
      sessionId: 'life-session-86',
      authLevel: 'PHONE_BOUND' as const,
    };
    const list = vi.fn().mockResolvedValue([]);
    const save = vi.fn().mockResolvedValue({ id: 'address-1' });
    const archive = vi.fn().mockResolvedValue(undefined);
    const invoiceList = vi.fn().mockResolvedValue([]);
    const invoiceSave = vi.fn().mockResolvedValue({ id: 'invoice-profile-1' });
    const invoiceArchive = vi.fn().mockResolvedValue(undefined);
    app = await buildApp({
      lifeConsumerSession: { verify: () => lifeConsumer },
      platformAddresses: { list, save, archive },
      platformInvoiceProfiles: {
        list: invoiceList,
        save: invoiceSave,
        archive: invoiceArchive,
      },
    });
    const headers = { authorization: 'Bearer life-consumer' };
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/life/addresses', headers })).statusCode,
    ).toBe(200);
    const payload = {
      recipientName: '禾木',
      mobile: '13812345678',
      provinceCode: '31',
      cityCode: '3101',
      districtCode: '310106',
      addressLine: '南京西路',
      isDefault: true,
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/life/addresses',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    const addressId = '00000000-0000-4000-8000-000000000094';
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/life/addresses/${addressId}`,
          headers,
        })
      ).statusCode,
    ).toBe(204);
    expect(list).toHaveBeenCalledWith(lifeConsumer);
    expect(save).toHaveBeenCalledWith(lifeConsumer, payload);
    expect(archive).toHaveBeenCalledWith(lifeConsumer, addressId);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/life/invoice-profiles', headers }))
        .statusCode,
    ).toBe(200);
    const invoicePayload = { profileType: 'PERSONAL', title: '个人', isDefault: true };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/life/invoice-profiles',
          headers,
          payload: invoicePayload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/life/invoice-profiles/00000000-0000-4000-8000-000000000095',
          headers,
        })
      ).statusCode,
    ).toBe(204);
    expect(invoiceList).toHaveBeenCalledWith(lifeConsumer);
    expect(invoiceSave).toHaveBeenCalledWith(lifeConsumer, invoicePayload);
    expect(invoiceArchive).toHaveBeenCalledWith(
      lifeConsumer,
      '00000000-0000-4000-8000-000000000095',
    );
  });

  it('queries cross-merchant orders only through platform consumer account links', async () => {
    const lifeConsumer = {
      accountId: '00000000-0000-4000-8000-000000000086',
      sessionId: 'life-session-86',
      authLevel: 'PHONE_BOUND' as const,
    };
    const list = vi.fn().mockResolvedValue([{ id: 'order-1' }]);
    const get = vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000091' });
    app = await buildApp({
      lifeConsumerSession: { verify: () => lifeConsumer },
      platformOrders: { list, get },
    });
    const headers = { authorization: 'Bearer life-consumer' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/life/orders?status=PAID&limit=20',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const orderId = '00000000-0000-4000-8000-000000000091';
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/life/orders/${orderId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(list).toHaveBeenCalledWith(
      lifeConsumer,
      expect.objectContaining({ status: 'PAID', limit: '20' }),
    );
    expect(get).toHaveBeenCalledWith(lifeConsumer, orderId);
  });

  it('quotes checkout behind the platform audience and requires an idempotency key', async () => {
    const lifeConsumer = {
      accountId: '00000000-0000-4000-8000-000000000086',
      sessionId: 'life-session-86',
      authLevel: 'PHONE_BOUND' as const,
    };
    const quote = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000092',
      payableAmountCents: 1100,
    });
    const get = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000092',
    });
    const submit = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000092',
      status: 'ORDERS_CREATED',
    });
    app = await buildApp({
      lifeConsumerSession: { verify: () => lifeConsumer },
      platformCheckout: { quote, get, submit },
    });
    const headers = {
      authorization: 'Bearer life-consumer',
      'idempotency-key': 'checkout-quote-92',
    };
    const payload = { cartVersion: 3, payableAmountCents: 1 };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/life/checkouts/quote',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(201);
    const checkoutId = '00000000-0000-4000-8000-000000000092';
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/life/checkouts/${checkoutId}`,
          headers: { authorization: headers.authorization },
        })
      ).statusCode,
    ).toBe(200);
    expect(quote).toHaveBeenCalledWith({
      identity: lifeConsumer,
      idempotencyKey: 'checkout-quote-92',
      body: payload,
    });
    expect(get).toHaveBeenCalledWith(lifeConsumer, checkoutId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/life/checkouts/${checkoutId}/actions/submit`,
          headers: {
            authorization: headers.authorization,
            'idempotency-key': 'checkout-submit-92',
          },
        })
      ).statusCode,
    ).toBe(202);
    expect(submit).toHaveBeenCalledWith({
      identity: lifeConsumer,
      idempotencyKey: 'checkout-submit-92',
      checkoutId,
    });
  });

  it('creates a merchant-direct payment only through the platform payment boundary', async () => {
    const lifeConsumer = {
      accountId: '00000000-0000-4000-8000-000000000086',
      sessionId: 'life-session-86',
      authLevel: 'PHONE_BOUND' as const,
    };
    const create = vi.fn().mockResolvedValue({ id: 'payment-1', status: 'PROCESSING' });
    app = await buildApp({
      lifeConsumerSession: { verify: () => lifeConsumer },
      platformPayments: { create },
    });
    const body = {
      orderId: '00000000-0000-4000-8000-000000000093',
      provider: 'WECHAT_PAY',
      merchantTenantId: 'attacker-selected-tenant',
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/life/payment-intents',
      headers: {
        authorization: 'Bearer life-consumer',
        'idempotency-key': 'life-payment-93',
      },
      payload: body,
    });
    expect(response.statusCode).toBe(202);
    expect(create).toHaveBeenCalledWith({
      identity: lifeConsumer,
      idempotencyKey: 'life-payment-93',
      traceId: expect.any(String),
      body,
    });
  });

  it('exposes employee merchant operations through live authorization and authoritative paths', async () => {
    const listProducts = vi.fn().mockResolvedValue([{ id: 'product-1' }]);
    const listOrders = vi.fn().mockResolvedValue([{ id: 'order-1' }]);
    const getOrder = vi.fn().mockResolvedValue({ id: 'order-detail' });
    const listCustomers = vi.fn().mockResolvedValue([{ id: 'customer-1' }]);
    const getCustomer = vi.fn().mockResolvedValue({ id: 'customer-detail' });
    const listCustomerRewards = vi.fn().mockResolvedValue([{ id: 'reward-1' }]);
    const publishProduct = vi.fn().mockResolvedValue({ status: 'ON_SALE', version: 2 });
    app = await buildApp({
      ...authFor(financialIdentity),
      merchantOperations: {
        listProducts,
        listOrders,
        getOrder,
        listCustomers,
        getCustomer,
        listCustomerRewards,
        publishProduct,
      } as never,
    });
    const headers = { authorization: 'Bearer signed' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/merchant-operations/products?storeId=00000000-0000-4000-8000-000000000099&productType=GROUP_BUY`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const customerId = '00000000-0000-4000-8000-000000000085';
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/merchant-operations/customers?status=ACTIVE',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/merchant-operations/customers/${customerId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/merchant-operations/customers/${customerId}/rewards`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/merchant-operations/orders?status=PAID&limit=20',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const orderId = '00000000-0000-4000-8000-000000000084';
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/merchant-operations/orders/${orderId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: financialIdentity.tenantId }),
      expect.objectContaining({ productType: 'GROUP_BUY' }),
    );
    expect(listOrders).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'PAID', limit: '20' }),
    );
    expect(getOrder).toHaveBeenCalledWith(expect.anything(), orderId);
    expect(listCustomers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'ACTIVE' }),
    );
    expect(getCustomer).toHaveBeenCalledWith(expect.anything(), customerId);
    expect(listCustomerRewards).toHaveBeenCalledWith(expect.anything(), customerId);
    const productId = '00000000-0000-4000-8000-000000000096';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/merchant-operations/products/${productId}/actions/publish`,
          headers: { ...headers, 'idempotency-key': 'publish-product-http-1' },
          payload: { expectedVersion: 1, confirmed: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(publishProduct).toHaveBeenCalledWith(
      expect.anything(),
      productId,
      'publish-product-http-1',
      expect.any(String),
      { expectedVersion: 1, confirmed: true },
    );
  });

  it('enforces the employee organization governance HTTP boundary and command context', async () => {
    const listMembers = vi.fn().mockResolvedValue([{ userId: 'member-1' }]);
    const getAuthorizationCatalog = vi.fn().mockResolvedValue({ roles: [], permissions: [] });
    const assignRole = vi.fn().mockResolvedValue({ id: 'assignment-1' });
    const listAudit = vi.fn().mockResolvedValue([{ id: 'audit-1' }]);
    const listPrivacyRequests = vi.fn().mockResolvedValue([]);
    const listNotifications = vi.fn().mockResolvedValue([]);
    app = await buildApp({
      ...authFor(financialIdentity),
      organizationGovernance: {
        listMembers,
        getAuthorizationCatalog,
        assignRole,
        listAudit,
        listPrivacyRequests,
        listNotifications,
      } as never,
    });
    const headers = { authorization: 'Bearer signed' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/organization/members?status=ACTIVE',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/organization/authorization-catalog',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const body = {
      userId: '17000000-0000-4000-8000-000000000003',
      roleCode: 'STORE_MANAGER',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/organization/role-assignments',
          headers: { ...headers, 'idempotency-key': 'role-assign-1' },
          payload: body,
        })
      ).statusCode,
    ).toBe(201);
    expect(assignRole).toHaveBeenCalledWith({
      identity: expect.objectContaining({ tenantId: financialIdentity.tenantId }),
      idempotencyKey: 'role-assign-1',
      traceId: expect.any(String),
      body,
    });
    expect(listMembers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'ACTIVE' }),
    );
  });

  it('exposes revenue operations only through authorized tenant read models', async () => {
    const getSubscription = vi.fn().mockResolvedValue({ id: 'subscription-1' });
    const getSummary = vi.fn().mockResolvedValue({ distributableCents: 7000 });
    const listStatements = vi.fn().mockResolvedValue([{ id: 'statement-1' }]);
    const getStatement = vi.fn().mockResolvedValue({ id: 'statement-detail' });
    const listRights = vi.fn().mockResolvedValue([{ id: 'right-1' }]);
    app = await buildApp({
      ...authFor(financialIdentity),
      revenueOperations: {
        getSubscription,
        getSummary,
        listStatements,
        getStatement,
        listRights,
      } as never,
    });
    const headers = { authorization: 'Bearer signed' };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/revenue-operations/subscription',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/revenue-operations/summary?periodStart=2026-08-01',
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const statementId = '18000000-0000-4000-8000-000000000002';
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/revenue-operations/statements/${statementId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(getSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodStart: '2026-08-01' }),
    );
    expect(getStatement).toHaveBeenCalledWith(expect.anything(), statementId);
  });

  it('preserves the exact payment callback body and signature for verification', async () => {
    const receiveCallback = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
    app = await buildApp({ commercePayments: { receiveCallback } as never });
    const rawBody = '{"provider":"SANDBOX","amountCents":100}';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/SANDBOX',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': 'a'.repeat(64),
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(receiveCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'SANDBOX',
        signature: 'a'.repeat(64),
        rawBody,
      }),
    );
  });

  it('protects commerce worker commands with the internal bearer and authoritative path id', async () => {
    const expire = vi.fn().mockResolvedValue({ id: 'expired-order' });
    const submit = vi.fn().mockResolvedValue({ id: 'submitted-refund' });
    const token = 'commerce-worker-token-with-at-least-thirty-two-bytes';
    app = await buildApp({
      internalWorkerToken: token,
      commerceOrders: { expire } as never,
      commerceRefunds: { submit } as never,
    });
    const tenantId = '00000000-0000-4000-8000-000000000091';
    const orderId = '00000000-0000-4000-8000-000000000092';
    const refundId = '00000000-0000-4000-8000-000000000093';
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/internal/commerce/orders/${orderId}/actions/expire`,
      payload: { tenantId },
    });
    expect(denied.statusCode).toBe(401);
    const headers = { authorization: `Bearer ${token}` };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/internal/commerce/orders/${orderId}/actions/expire`,
          headers,
          payload: { tenantId, orderId: 'attacker' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/internal/commerce/refunds/${refundId}/actions/submit`,
          headers,
          payload: { tenantId, refundId: 'attacker' },
        })
      ).statusCode,
    ).toBe(202);
    expect(expire).toHaveBeenCalledWith(expect.objectContaining({ tenantId, orderId }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ tenantId, refundId }));
  });
});
