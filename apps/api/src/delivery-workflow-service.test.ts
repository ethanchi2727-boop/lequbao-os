import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DeliveryAcceptanceError,
  DeliveryAuthorizationError,
  STANDARD_898_STEPS,
  createDeliveryWorkflowService,
  type DeliveryGatewayResult,
  type DeliveryProject,
} from './delivery-workflow-service.js';

const tenantId = '41000000-0000-4000-8000-000000000001';
const userId = '41000000-0000-4000-8000-000000000002';
const projectId = '41000000-0000-4000-8000-000000000003';
const merchantProfileId = '41000000-0000-4000-8000-000000000004';
const storeId = '41000000-0000-4000-8000-000000000005';
const subscriptionId = '41000000-0000-4000-8000-000000000006';
const stepId = '41000000-0000-4000-8000-000000000007';
const attemptId = '41000000-0000-4000-8000-000000000008';

const identity = {
  tenantId,
  userId,
  roleCodes: ['BUSINESS_DEVELOPER'],
  storeIds: [],
  sessionId: 'session-1',
  authLevel: 'MFA' as const,
};

type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

const projectRow = (status = 'DRAFT', progress = 0) => ({
  id: projectId,
  merchant_profile_id: merchantProfileId,
  store_id: storeId,
  subscription_id: subscriptionId,
  workflow_code: 'merchant_delivery_standard',
  workflow_version: 1,
  rule_version: 1,
  status,
  progress_percent: progress,
  missing_items: status === 'WAITING_MERCHANT_INPUT' ? ['merchant.business_license'] : [],
  blocking_reason_code:
    status === 'WAITING_MERCHANT_INPUT'
      ? 'MERCHANT_PROFILE_INCOMPLETE'
      : status === 'WAITING_AUTHORIZATION'
        ? 'WECHAT_APPID_AUTHORIZATION_REQUIRED'
        : null,
  wait_category:
    status === 'WAITING_MERCHANT_INPUT' || status === 'WAITING_AUTHORIZATION'
      ? 'MERCHANT'
      : 'PLATFORM',
  accepted_by: status === 'DELIVERED' ? userId : null,
  accepted_at: status === 'DELIVERED' ? '2026-08-18T04:00:00.000Z' : null,
  platform_processing_seconds: '0',
  merchant_wait_seconds: '0',
  external_wait_seconds: '0',
  version: 1,
});

const stepRow = (status = 'PENDING', code = 'profile.validate') => ({
  id: stepId,
  step_code: code,
  step_group: code.startsWith('geo.') ? 'LAUNCH' : 'MERCHANT_PROFILE',
  required_step: true,
  execution_mode: 'AUTOMATED',
  status,
  attempt_count: status === 'FAILED' ? 1 : 0,
  last_error_code: status === 'FAILED' ? 'TARGET_RATE_LIMITED' : null,
  result_ref: null,
});

function fixture(
  handler: (sql: string, values: readonly unknown[] | undefined) => QueryResult | undefined,
  gatewayResult?: DeliveryGatewayResult,
) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    const handled = handler(sql.replace(/\s+/g, ' ').trim(), values);
    return handled ?? result();
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const gateway = {
    execute: vi.fn(
      async (): Promise<DeliveryGatewayResult> =>
        gatewayResult ?? { status: 'SUCCEEDED', output: {} },
    ),
  };
  return { service: createDeliveryWorkflowService(pool as never, gateway), query, gateway };
}

function loadRows(
  sql: string,
  status: string,
  stepStatus = 'PENDING',
  stepCode = 'profile.validate',
) {
  if (sql.includes('SELECT id, merchant_profile_id'))
    return result([projectRow(status, status === 'DELIVERED' ? 100 : 0)]);
  if (sql.includes('SELECT id, step_code, step_group'))
    return result([stepRow(stepStatus, stepCode)]);
  return undefined;
}

const command = (body: unknown, idempotencyKey = 'idem-1') => ({
  identity,
  idempotencyKey,
  traceId: 'trace-1',
  body,
});

describe('standard 898 delivery workflow', () => {
  it('DEL-001 freezes the complete unique standard workflow step catalog', () => {
    const codes = STANDARD_898_STEPS.map((step) => step.code);
    expect(codes).toHaveLength(38);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        'profile.validate',
        'miniapp.authorize',
        'miniapp.upload_preview',
        'geo.publish',
        'acceptance.merchant_signoff',
        'operation.day30_task',
      ]),
    );
  });

  it('DEL-001 creates one project and all required steps from an active 898 subscription', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.includes('SELECT 1 FROM merchant_profiles')) return result([{ ok: 1 }]);
      if (sql.startsWith('INSERT INTO delivery_projects')) return result([{ id: projectId }]);
      return loadRows(sql, 'DRAFT');
    });
    const created = await fx.service.create(
      command({ merchantProfileId, storeId, subscriptionId }),
    );
    expect(created.id).toBe(projectId);
    const stepInsert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO delivery_steps'),
    );
    expect(JSON.parse(String(stepInsert?.[1]?.[2]))).toHaveLength(38);
  });

  it('DEL-002 starts incomplete material as WAITING_MERCHANT_INPUT with exact missing fields', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.includes('profile.legal_subject_name'))
        return result([
          {
            status: 'DRAFT',
            legal_subject_name: 'Merchant',
            business_license_object_key: null,
            contact_name_ciphertext: 'cipher',
            contact_mobile_ciphertext: 'cipher',
            store_name: 'Store',
            address_ciphertext: 'cipher',
            longitude: '120',
            latitude: '30',
            opening_hours: [{ day: 1 }],
          },
        ]);
      return loadRows(sql, 'WAITING_MERCHANT_INPUT', 'WAITING_INPUT');
    });
    const started = await fx.service.start(command({ projectId }));
    expect(started.status).toBe('WAITING_MERCHANT_INPUT');
    expect(started.missingItems).toEqual(['merchant.business_license']);
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes("status='WAITING_MERCHANT_INPUT'") &&
          Array.isArray((values as unknown[])?.[2]) &&
          ((values as unknown[])?.[2] as unknown[]).includes('merchant.business_license'),
      ),
    ).toBe(true);
  });

  it('DEL-003 blocks an AppID step without authorization and never calls the provider', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT id,status,attempt_count'))
        return result([
          {
            id: stepId,
            status: 'PENDING',
            attempt_count: 0,
            action_version: 1,
            depends_on: [],
            retryable: true,
          },
        ]);
      if (sql.includes("provider='WECHAT_COMPONENT'")) return result();
      return loadRows(sql, 'WAITING_AUTHORIZATION', 'WAITING_AUTH', 'miniapp.authorize');
    });
    const blocked = await fx.service.executeStep(
      command({ projectId, stepCode: 'miniapp.upload_preview', inputSnapshot: {} }),
    );
    expect(blocked.status).toBe('WAITING_AUTHORIZATION');
    expect(fx.gateway.execute).not.toHaveBeenCalled();
  });

  it('DEL-004 returns the frozen response for an identical idempotent replay', async () => {
    const replay: DeliveryProject = {
      id: projectId,
      merchantProfileId,
      storeId,
      subscriptionId,
      workflowCode: 'merchant_delivery_standard',
      workflowVersion: 1,
      ruleVersion: 1,
      status: 'DRAFT',
      progressPercent: 0,
      missingItems: [],
      blockingReasonCode: null,
      waitCategory: 'PLATFORM',
      acceptedBy: null,
      acceptedAt: null,
      platformProcessingSeconds: '0',
      merchantWaitSeconds: '0',
      externalWaitSeconds: '0',
      version: 1,
      steps: [],
    };
    const requestBody = { merchantProfileId, storeId, subscriptionId };
    const requestHash = createHashForTest(requestBody);
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result();
      if (sql.startsWith('SELECT request_hash'))
        return result([{ request_hash: requestHash, response_body: replay }]);
      return undefined;
    });
    await expect(fx.service.create(command(requestBody))).resolves.toEqual(replay);
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO delivery_projects')),
    ).toBe(false);
  });

  it('DEL-005 preserves partial GEO success and marks only the project partially failed', async () => {
    let finalPhase = false;
    const fx = fixture(
      (sql) => {
        if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
        if (sql.startsWith('SELECT id,status,attempt_count'))
          return result([
            {
              id: stepId,
              status: 'PENDING',
              attempt_count: 0,
              action_version: 1,
              depends_on: [],
              retryable: true,
            },
          ]);
        if (sql.startsWith('INSERT INTO delivery_step_attempts')) {
          finalPhase = true;
          return result([{ id: attemptId }]);
        }
        if (sql.includes('required_count'))
          return result([{ required_count: '38', succeeded_count: '20' }]);
        if (finalPhase) return loadRows(sql, 'PARTIALLY_FAILED', 'FAILED', 'geo.publish');
        return undefined;
      },
      {
        status: 'PARTIALLY_FAILED',
        errorCode: 'ONE_TARGET_FAILED',
        employeeMessage: '单一目标发布失败',
        retryable: true,
        responsibility: 'THIRD_PARTY',
        nextAction: '仅重试失败目标',
        output: { successfulTargets: ['target-a'], failedTargets: ['target-b'] },
      },
    );
    const project = await fx.service.executeStep(
      command({ projectId, stepCode: 'geo.publish', inputSnapshot: {} }),
    );
    expect(project.status).toBe('PARTIALLY_FAILED');
    expect(fx.query.mock.calls.some(([sql]) => /^DELETE /i.test(String(sql)))).toBe(false);
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes('UPDATE delivery_step_attempts') &&
          JSON.parse(String((values as unknown[])?.[7])).successfulTargets[0] === 'target-a',
      ),
    ).toBe(true);
  });

  it('DEL-006 retries only the selected failed step with a new action version', async () => {
    let finishing = false;
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT id,status,attempt_count'))
        return result([
          {
            id: stepId,
            status: 'FAILED',
            attempt_count: 1,
            action_version: 1,
            depends_on: [],
            retryable: true,
          },
        ]);
      if (sql.startsWith('INSERT INTO delivery_step_attempts')) {
        finishing = true;
        return result([{ id: attemptId }]);
      }
      if (sql.includes('required_count'))
        return result([{ required_count: '38', succeeded_count: '21' }]);
      if (finishing) return loadRows(sql, 'PROVISIONING', 'SUCCEEDED', 'geo.publish');
      return undefined;
    });
    await fx.service.retryStep(command({ projectId, stepCode: 'geo.publish', inputSnapshot: {} }));
    expect(fx.gateway.execute).toHaveBeenCalledTimes(1);
    expect(fx.gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({ stepCode: 'geo.publish', actionVersion: 2 }),
    );
  });

  it('DEL-007 rejects acceptance while any required step is incomplete', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT 1 FROM delivery_steps')) return result([{ incomplete: 1 }]);
      return undefined;
    });
    await expect(
      fx.service.accept(command({ projectId, checklist: { businessFlow: true } })),
    ).rejects.toBeInstanceOf(DeliveryAcceptanceError);
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes("SET status='DELIVERED'")),
    ).toBe(false);
  });

  it('INT-006 keeps payment, price and refund-rule actions blocked without merchant confirmations', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT id,status,attempt_count'))
        return result([
          {
            id: stepId,
            status: 'PENDING',
            attempt_count: 0,
            action_version: 1,
            depends_on: [],
            retryable: false,
          },
        ]);
      if (sql.startsWith('SELECT DISTINCT ON (confirmation.confirmation_type)')) return result();
      return loadRows(sql, 'WAITING_MERCHANT_INPUT', 'WAITING_INPUT', 'launch.first_offer');
    });
    const blocked = await fx.service.executeStep(
      command({ projectId, stepCode: 'launch.first_offer', inputSnapshot: {} }),
    );
    expect(blocked.status).toBe('WAITING_MERCHANT_INPUT');
    expect(fx.gateway.execute).not.toHaveBeenCalled();
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes("blocking_reason_code='MERCHANT_CONFIRMATION_REQUIRED'") &&
          Array.isArray((values as unknown[])?.[2]) &&
          ((values as unknown[])?.[2] as unknown[]).includes('confirmation.REFUND_RULE'),
      ),
    ).toBe(true);
  });

  it('INT-007 requires a merchant-confirmed mini-program name and WeChat-review disclosure', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT id,status,attempt_count'))
        return result([
          {
            id: stepId,
            status: 'PENDING',
            attempt_count: 0,
            action_version: 1,
            depends_on: [],
            retryable: false,
          },
        ]);
      if (sql.includes("provider='WECHAT_COMPONENT'")) return result([{ active: 1 }]);
      if (sql.startsWith('SELECT DISTINCT ON (confirmation.confirmation_type)'))
        return result([
          {
            confirmation_type: 'PUBLISH_IMPACT',
            confirmed_payload: { miniProgramName: '商户自有名称' },
          },
        ]);
      return loadRows(sql, 'WAITING_MERCHANT_INPUT', 'WAITING_INPUT', 'miniapp.submit_review');
    });
    const blocked = await fx.service.executeStep(
      command({ projectId, stepCode: 'miniapp.submit_review', inputSnapshot: {} }),
    );
    expect(blocked.status).toBe('WAITING_MERCHANT_INPUT');
    expect(fx.gateway.execute).not.toHaveBeenCalled();
  });

  it('DEL-008 stores an immutable checklist receipt and the authoritative acceptor', async () => {
    const receiptId = '41000000-0000-4000-8000-000000000009';
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'reservation' }]);
      if (sql.startsWith('SELECT 1 FROM delivery_steps')) return result();
      if (sql.startsWith('SELECT step_code,status,result_ref'))
        return result([
          {
            step_code: 'acceptance.merchant_signoff',
            status: 'SUCCEEDED',
            result_ref: 'evidence-1',
          },
        ]);
      if (sql.startsWith('INSERT INTO delivery_acceptance_receipts'))
        return result([{ id: receiptId }]);
      return loadRows(sql, 'DELIVERED', 'SUCCEEDED', 'acceptance.merchant_signoff');
    });
    const delivered = await fx.service.accept(
      command({ projectId, checklist: { businessFlow: true, merchantSignoff: true } }),
    );
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.acceptedBy).toBe(userId);
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).startsWith('INSERT INTO delivery_acceptance_receipts') &&
          Array.isArray((values as unknown[])?.[4]) &&
          ((values as unknown[])?.[4] as unknown[]).includes(userId),
      ),
    ).toBe(true);
  });

  it('RBAC-007 hides unassigned delivery material from a regional provider', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT 1 FROM delivery_project_assignments')) return result();
      return undefined;
    });
    await expect(
      fx.service.get({ ...identity, roleCodes: ['REGIONAL_PROVIDER'] }, projectId),
    ).rejects.toBeInstanceOf(DeliveryAuthorizationError);
    expect(
      fx.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes("ARRAY['DELIVERY_MATERIALS']") &&
          String(sql).includes('expires_at > now()'),
      ),
    ).toBe(true);
  });
});

function createHashForTest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
