import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

const identity = {
  tenantId: '22000000-0000-4000-8000-000000000001',
  userId: '22000000-0000-4000-8000-000000000002',
  roleCodes: ['BUSINESS_DEVELOPER'],
  storeIds: [],
  sessionId: 'sales-http-session',
  authLevel: 'MFA' as const,
  accessScopes: ['ASSIGNED'],
  assignedStoreIds: [],
};
const opportunityId = '22000000-0000-4000-8000-000000000003';
const contractId = '22000000-0000-4000-8000-000000000004';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function fixture() {
  const authorize = vi.fn(async () => identity);
  const service = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: opportunityId }),
    create: vi.fn().mockResolvedValue({ id: opportunityId }),
    checkDuplicates: vi.fn().mockResolvedValue({ result: 'CLEAR' }),
    createQuote: vi.fn().mockResolvedValue({ id: 'quote-1' }),
    createContract: vi.fn().mockResolvedValue({ id: contractId }),
    signContract: vi.fn().mockResolvedValue({ id: contractId, status: 'SIGNED' }),
    recordCollection: vi.fn().mockResolvedValue({ id: 'receipt-1' }),
  };
  return {
    authorize,
    service,
    options: {
      sessionIdentity: { verify: vi.fn(() => identity) },
      accessControl: { authorize, validate: vi.fn(async () => identity) } as never,
      salesLifecycle: service,
    },
  };
}

describe('sales lifecycle HTTP boundary', () => {
  it('authorizes assigned opportunity reads and passes only the server identity', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/opportunities?status=NEW',
      headers: { authorization: 'Bearer signed' },
    });
    expect(response.statusCode).toBe(200);
    expect(fx.authorize).toHaveBeenCalledWith(identity, 'merchant.intake.read', {});
    expect(fx.service.list).toHaveBeenCalledWith(identity, { status: 'NEW' });
  });

  it('requires idempotency and binds new opportunities to the server identity', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const withoutKey = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/opportunities',
      headers: { authorization: 'Bearer signed' },
      payload: { ownerUserId: 'attacker' },
    });
    expect(withoutKey.statusCode).toBe(400);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/opportunities',
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'create-opportunity-1' },
      payload: { ownerUserId: 'attacker' },
    });
    expect(response.statusCode).toBe(201);
    expect(fx.service.create).toHaveBeenCalledWith(
      expect.objectContaining({ identity, idempotencyKey: 'create-opportunity-1' }),
    );
  });

  it('requires MFA confirmation and makes the contract route parameter authoritative', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/contracts/${contractId}/actions/sign`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'sign-contract-1' },
      payload: { contractId: 'attacker-contract', merchantSignerReference: 'safe-reference' },
    });
    expect(response.statusCode).toBe(200);
    expect(fx.authorize).toHaveBeenCalledWith(identity, 'merchant.intake.confirm', {
      mfaRequired: true,
      write: true,
    });
    expect(fx.service.signContract).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ contractId }) }),
    );
  });

  it('keeps collection confirmation behind finance reconciliation and MFA', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/contracts/${contractId}/collections`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'collection-1' },
      payload: { amountCents: 89800 },
    });
    expect(response.statusCode).toBe(201);
    expect(fx.authorize).toHaveBeenCalledWith(identity, 'finance.reconcile', {
      mfaRequired: true,
      write: true,
    });
    expect(fx.service.recordCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ contractId, amountCents: 89800 }),
      }),
    );
  });
});
