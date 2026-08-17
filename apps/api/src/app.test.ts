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
});
