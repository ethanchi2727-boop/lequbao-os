import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;

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
  });

  it('fails readiness when the database is unavailable', async () => {
    app = await buildApp({ databaseCheck: () => Promise.reject(new Error('offline')) });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('rejects missing or malformed tenant context', async () => {
    app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/context' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'INVALID_TENANT_CONTEXT' });
  });

  it('accepts a valid tenant context', async () => {
    app = await buildApp();
    const tenantId = '00000000-0000-4000-8000-000000000003';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/context',
      headers: { 'x-tenant-id': tenantId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tenantId });
  });

  it('creates an active revenue right through the injected transactional service', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      merchantProfileId: '00000000-0000-4000-8000-000000000011',
      status: 'ACTIVE',
      startsAt: '2026-08-17T12:00:00+08:00',
      holders: [{ beneficiaryId: '00000000-0000-4000-8000-000000000012', shareBps: 7000 }],
    });
    app = await buildApp({ revenueRights: { create } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants/00000000-0000-4000-8000-000000000011/revenue-rights',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000003',
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
    app = await buildApp({ distributionLocks: { lock } });
    const subscriptionId = '00000000-0000-4000-8000-000000000021';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${subscriptionId}/distribution-statements:lock`,
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000003',
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
      distributionSettlements: {
        requestApproval,
        pay,
        approve: vi.fn(),
        reverse: vi.fn(),
      },
    });
    const headers = {
      'x-tenant-id': '00000000-0000-4000-8000-000000000003',
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
});
