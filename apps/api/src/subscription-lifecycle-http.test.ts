import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

const tenantId = '24000000-0000-4000-8000-000000000001';
const userId = '24000000-0000-4000-8000-000000000002';
const changeId = '24000000-0000-4000-8000-000000000003';
const previewId = '24000000-0000-4000-8000-000000000004';
const identity = {
  tenantId,
  userId,
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'subscription-http-session',
  authLevel: 'MFA' as const,
  accessScopes: ['TENANT'],
  assignedStoreIds: [],
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function fixture() {
  const authorize = vi.fn(async () => identity);
  const service = {
    listChanges: vi.fn().mockResolvedValue([]),
    getChange: vi.fn().mockResolvedValue({ id: changeId }),
    requestChange: vi.fn().mockResolvedValue({ id: changeId, status: 'PENDING' }),
    decideChange: vi.fn().mockResolvedValue({ id: changeId, status: 'APPROVED' }),
    applyApproved: vi.fn().mockResolvedValue({ id: changeId, status: 'APPLIED' }),
    listPreviews: vi.fn().mockResolvedValue([]),
    getPreview: vi.fn().mockResolvedValue({ id: previewId }),
    generatePreview: vi.fn().mockResolvedValue({ id: previewId }),
    updatePreviewStatus: vi.fn().mockResolvedValue({ id: previewId, status: 'CONTACTED' }),
  };
  return {
    authorize,
    service,
    options: {
      sessionIdentity: { verify: vi.fn(() => identity) },
      accessControl: { authorize, validate: vi.fn(async () => identity) } as never,
      subscriptionLifecycle: service,
      internalWorkerToken: 'subscription-worker-token-with-at-least-thirty-two-bytes',
    },
  };
}

describe('subscription lifecycle HTTP boundary', () => {
  it('creates a pending change from the authenticated user and requires idempotency', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription-lifecycle/changes',
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'change-1' },
      payload: { requestedBy: 'attacker', changeType: 'CANCEL' },
    });
    expect(response.statusCode).toBe(202);
    expect(fx.authorize).toHaveBeenCalledWith(identity, 'merchant.intake.write', { write: true });
    expect(fx.service.requestChange).toHaveBeenCalledWith(
      expect.objectContaining({ identity, idempotencyKey: 'change-1' }),
    );
  });

  it('requires MFA merchant confirmation and binds the decision to the route change', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/subscription-lifecycle/changes/${changeId}/actions/decide`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'decision-1' },
      payload: { changeId: 'attacker-change', decision: 'APPROVE' },
    });
    expect(response.statusCode).toBe(200);
    expect(fx.authorize).toHaveBeenCalledWith(identity, 'merchant.intake.confirm', {
      mfaRequired: true,
      write: true,
    });
    expect(fx.service.decideChange).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ changeId }) }),
    );
  });

  it('applies approved changes only through the constant-time internal worker boundary', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const url = `/api/v1/internal/subscription-lifecycle/changes/${changeId}/actions/apply`;
    expect((await app.inject({ method: 'POST', url, payload: { tenantId } })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url,
      headers: {
        authorization: 'Bearer subscription-worker-token-with-at-least-thirty-two-bytes',
      },
      payload: { tenantId },
    });
    expect(response.statusCode).toBe(200);
    expect(fx.service.applyApproved).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, changeId }),
    );
  });

  it('keeps renewal status actions server scoped and idempotent', async () => {
    const fx = fixture();
    app = await buildApp(fx.options);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/subscription-lifecycle/renewal-previews/${previewId}/actions/change-status`,
      headers: { authorization: 'Bearer signed', 'idempotency-key': 'preview-status-1' },
      payload: { previewId: 'attacker-preview', status: 'CONTACTED' },
    });
    expect(response.statusCode).toBe(200);
    expect(fx.service.updatePreviewStatus).toHaveBeenCalledWith(
      expect.objectContaining({ body: { previewId, status: 'CONTACTED' } }),
    );
  });
});
