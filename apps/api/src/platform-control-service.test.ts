import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createPlatformControlService,
  PlatformControlAuthorizationError,
  PlatformControlStateError,
} from './platform-control-service.js';

const tenantId = '3b000000-0000-4000-8000-000000000001';
const userId = '3b000000-0000-4000-8000-000000000002';
const tenantIdentity = {
  tenantId,
  userId,
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'tenant-session',
  accessScopes: ['TENANT'],
  assignedStoreIds: [],
} as AuthorizationContext;
const platformIdentity = {
  ...tenantIdentity,
  roleCodes: ['PLATFORM_ADMIN'],
  accessScopes: ['ALL'],
} as AuthorizationContext;

function fixture(rowsByMarker: Record<string, unknown[]>) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const client = {
    query: async (rawSql: string, values?: unknown[]) => {
      const sql = rawSql.replace(/\s+/gu, ' ').trim();
      statements.push({ sql, values });
      const marker = Object.keys(rowsByMarker).find((candidate) => sql.includes(candidate));
      const rows = marker ? (rowsByMarker[marker] ?? []) : [];
      return { rows, rowCount: rows.length };
    },
    release: () => undefined,
  };
  return {
    statements,
    service: createPlatformControlService({
      connect: async () => client,
    } as unknown as Pick<pg.Pool, 'connect'>),
  };
}

describe('platform control plane', () => {
  it('retries a versioned tenant connector through one durable outbox request', async () => {
    const connectorId = '3b000000-0000-4000-8000-000000000003';
    const fx = fixture({
      'FROM platform_control_receipts': [],
      'UPDATE tenant_connector_health': [
        { id: connectorId, connector_code: 'WECOM_INTAKE', status: 'CHECKING', version: 2 },
      ],
    });
    await expect(
      fx.service.retryConnector(tenantIdentity, 'connector-retry-1', 'trace-connector', {
        connectorCode: 'WECOM_INTAKE',
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ connectorCode: 'WECOM_INTAKE', status: 'CHECKING', version: 2 });
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO outbox_events'))).toBe(true);
    expect(
      fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO platform_control_receipts')),
    ).toBe(true);
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
  });

  it('publishes a new reward rule version with explicit funding and refund reversal', async () => {
    const fx = fixture({
      'FROM platform_control_receipts': [],
      'FROM reward_rule_versions': [{ id: 'old-rule', version: 2 }],
    });
    await expect(
      fx.service.publishRewardRule(tenantIdentity, 'reward-rule-1', 'trace-reward', {
        ruleCode: 'ORDER_PAID_REWARD',
        expectedCurrentVersion: 2,
        fundingSource: 'MERCHANT',
        triggerCode: 'ORDER_PAID',
        grantConfig: { amountCents: 100, availableAfterHours: 24, expiresAfterDays: 365 },
        reversalPolicy: {
          fullRefund: 'FULL_REVERSAL',
          partialRefund: 'PROPORTIONAL_REVERSAL',
        },
      }),
    ).resolves.toMatchObject({ ruleCode: 'ORDER_PAID_REWARD', version: 3, status: 'ACTIVE' });
    expect(
      fx.statements.some(
        ({ sql }) =>
          sql.startsWith('UPDATE reward_rule_versions') && sql.includes("status='RETIRED'"),
      ),
    ).toBe(true);
    expect(
      fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO reward_rule_versions')),
    ).toBe(true);
  });

  it('lists only signed published official skill versions', async () => {
    const fx = fixture({
      'FROM official_skill_versions': [
        {
          skill_code: 'first-group-buy-launch',
          name: '首个团购上线',
          semantic_version: '1.0.0',
          applicable_industries: [],
          required_permissions: ['order.manage'],
          required_plugins: [],
          definition: { maxSteps: 12 },
          published_at: '2026-08-19T00:00:00.000Z',
        },
      ],
    });
    await expect(fx.service.listSkills(tenantIdentity, { query: '团购' })).resolves.toEqual([
      expect.objectContaining({ skillCode: 'first-group-buy-launch', version: '1.0.0' }),
    ]);
    expect(fx.statements.find(({ sql }) => sql.includes('official_skill_versions'))?.sql).toContain(
      "status='PUBLISHED'",
    );
  });

  it('keeps the cross-merchant directory behind a platform role', async () => {
    const fx = fixture({});
    await expect(fx.service.listMerchants(tenantIdentity, {})).rejects.toBeInstanceOf(
      PlatformControlAuthorizationError,
    );
    expect(fx.statements).toHaveLength(0);
  });

  it('reads the cross-merchant directory only through the database authorization boundary', async () => {
    const fx = fixture({
      'app.platform_merchant_directory': [
        {
          tenant_id: tenantId,
          tenant_code: 'MERCHANT_1',
          display_name: '商户一号',
          status: 'ACTIVE',
          data_region: 'CN',
          industry_code: 'FOOD',
          profile_status: 'VERIFIED',
          store_count: 2,
          plan_code: 'PRO_MONTH',
          subscription_status: 'ACTIVE',
          updated_at: '2026-08-19T00:00:00.000Z',
        },
      ],
    });
    await expect(fx.service.listMerchants(platformIdentity, {})).resolves.toEqual([
      expect.objectContaining({ tenantId, storeCount: 2, planCode: 'PRO_MONTH' }),
    ]);
    expect(
      fx.statements.some(
        ({ sql, values }) =>
          sql.startsWith('SELECT * FROM app.platform_merchant_directory') &&
          values?.[0] === tenantId &&
          values?.[1] === userId,
      ),
    ).toBe(true);
    expect(fx.statements.some(({ sql }) => sql.includes('FROM tenants tenant'))).toBe(false);
  });

  it('updates plan entitlements by version and rejects secret-shaped configuration', async () => {
    const blocked = fixture({});
    await expect(
      blocked.service.updatePlan(platformIdentity, 'PRO_MONTH', 'plan-secret', 'trace-plan', {
        expectedVersion: 1,
        entitlements: { providerToken: 'must-not-be-here' },
      }),
    ).rejects.toBeInstanceOf(PlatformControlStateError);
    expect(blocked.statements).toHaveLength(0);

    const fx = fixture({
      'FROM platform_control_receipts': [],
      'UPDATE plans SET': [{ plan_code: 'PRO_MONTH', entitlements: { stores: 5 }, version: 2 }],
    });
    await expect(
      fx.service.updatePlan(platformIdentity, 'PRO_MONTH', 'plan-update-1', 'trace-plan', {
        expectedVersion: 1,
        entitlements: { stores: 5 },
      }),
    ).resolves.toMatchObject({ planCode: 'PRO_MONTH', version: 2 });
  });

  it('resolves a reconciliation discrepancy without changing immutable financial facts', async () => {
    const discrepancyId = '3b000000-0000-4000-8000-000000000004';
    const fx = fixture({
      'FROM platform_control_receipts': [],
      'UPDATE commerce_reconciliation_discrepancies': [
        { id: discrepancyId, batch_id: 'batch-1', status: 'RESOLVED', version: 2 },
      ],
    });
    await expect(
      fx.service.resolveDiscrepancy(
        tenantIdentity,
        discrepancyId,
        'difference-resolve-1',
        'trace-difference',
        { expectedVersion: 1, decision: 'RESOLVED', resolutionCode: 'PROVIDER_CONFIRMED' },
      ),
    ).resolves.toMatchObject({ id: discrepancyId, status: 'RESOLVED', version: 2 });
    expect(
      fx.statements.some(
        ({ sql }) =>
          sql.startsWith('UPDATE commerce_reconciliation_batches') && !sql.includes('amount'),
      ),
    ).toBe(true);
  });

  it('enforces frozen AI execution caps in model routing budgets', async () => {
    const fx = fixture({});
    await expect(
      fx.service.saveModelBudget(platformIdentity, 'model-route-1', 'trace-model', {
        routeCode: 'CUSTOMER_SERVICE',
        expectedVersion: 0,
        purpose: '客服回答',
        modelKey: 'provider/model-v1',
        perTaskBudgetCents: 10,
        monthlyBudgetCents: 1000,
        maxSteps: 13,
        maxToolCalls: 20,
        status: 'ACTIVE',
      }),
    ).rejects.toBeDefined();
    expect(fx.statements).toHaveLength(0);
  });
});
