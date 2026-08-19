import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createCustomerServiceOperationsService,
  CustomerServiceOperationsAuthorizationError,
  CustomerServiceOperationsStateError,
} from './customer-service-operations-service.js';

const tenantId = '2b000000-0000-4000-8000-000000000001';
const storeId = '2b000000-0000-4000-8000-000000000002';
const identity = {
  tenantId,
  userId: '2b000000-0000-4000-8000-000000000003',
  roleCodes: ['STORE_MANAGER'],
  storeIds: [storeId],
  sessionId: 'session-cs-ops',
  accessScopes: ['STORE'],
  assignedStoreIds: [storeId],
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
    service: createCustomerServiceOperationsService({
      connect: async () => client,
    } as unknown as Pick<pg.Pool, 'connect'>),
  };
}

describe('customer-service operations', () => {
  it('creates a bounded non-overlapping shift for an active scoped assignee', async () => {
    const assigneeUserId = '2b000000-0000-4000-8000-000000000004';
    const fx = fixture({
      'FROM customer_service_shifts WHERE tenant_id=$1 AND idempotency_key': [],
      'FROM tenant_memberships membership': [{}],
      'tstzrange(starts_at': [],
      'INSERT INTO customer_service_shifts': [{ id: 'shift-1', status: 'SCHEDULED' }],
    });
    await expect(
      fx.service.createShift(identity, 'shift-key-1', 'trace-shift', {
        storeId,
        assigneeUserId,
        startsAt: '2026-08-20T01:00:00.000Z',
        endsAt: '2026-08-20T09:00:00.000Z',
      }),
    ).resolves.toMatchObject({ id: 'shift-1', status: 'SCHEDULED' });
    expect(fx.statements.some(({ sql }) => sql.startsWith('SELECT pg_advisory_xact_lock'))).toBe(
      true,
    );
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
  });

  it('rejects an overlapping shift instead of silently double-booking', async () => {
    const fx = fixture({
      'FROM customer_service_shifts WHERE tenant_id=$1 AND idempotency_key': [],
      'FROM tenant_memberships membership': [{}],
      'tstzrange(starts_at': [{}],
    });
    await expect(
      fx.service.createShift(identity, 'shift-key-2', 'trace-shift-2', {
        storeId,
        assigneeUserId: '2b000000-0000-4000-8000-000000000004',
        startsAt: '2026-08-20T01:00:00.000Z',
        endsAt: '2026-08-20T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(CustomerServiceOperationsStateError);
  });

  it('creates a resource-bound customer task without customer plaintext', async () => {
    const customerId = '2b000000-0000-4000-8000-000000000005';
    const fx = fixture({
      'FROM customer_service_tasks WHERE tenant_id=$1 AND idempotency_key': [],
      'SELECT 1 FROM customer_profiles customer': [{}],
      'INSERT INTO customer_service_tasks': [
        { id: 'task-1', status: 'OPEN', summary_redacted: { topic: '回访' } },
      ],
    });
    const result = await fx.service.createTask(identity, 'task-key-1', 'trace-task', {
      storeId,
      customerId,
      taskType: 'FOLLOW_UP',
      priority: 'NORMAL',
      dueAt: '2026-08-21T01:00:00.000Z',
      summaryRedacted: { topic: '回访' },
    });
    expect(result).toMatchObject({ id: 'task-1', status: 'OPEN' });
    expect(JSON.stringify(result)).not.toMatch(/mobile|nickname|message_content/iu);
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
  });

  it('creates a traceable remediation task when quality review requires correction', async () => {
    const reviewId = '2b000000-0000-4000-8000-000000000006';
    const fx = fixture({
      'SELECT review.*,conversation.customer_id': [
        {
          id: reviewId,
          store_id: storeId,
          conversation_id: 'conversation-1',
          customer_id: 'customer-1',
          status: 'PENDING',
          version: 1,
          decision_idempotency_key: null,
        },
      ],
      'UPDATE customer_service_quality_reviews': [
        { id: reviewId, status: 'REMEDIATION_REQUIRED', version: 2 },
      ],
    });
    await expect(
      fx.service.decideQualityReview(identity, reviewId, 'quality-key-1', 'trace-quality', {
        expectedVersion: 1,
        decision: 'REMEDIATION_REQUIRED',
        accuracyScore: 60,
        safetyScore: 90,
        policyScore: 70,
        findingsRedacted: { issueCode: 'KNOWLEDGE_GAP' },
        remediationDueAt: '2026-08-22T01:00:00.000Z',
      }),
    ).resolves.toMatchObject({ status: 'REMEDIATION_REQUIRED', version: 2 });
    expect(
      fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO customer_service_tasks')),
    ).toBe(true);
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true);
  });

  it('fails closed before SQL when employee store scope is missing', async () => {
    const fx = fixture({});
    await expect(
      fx.service.listTasks({ tenantId, userId: identity.userId } as never, {}),
    ).rejects.toBeInstanceOf(CustomerServiceOperationsAuthorizationError);
    expect(fx.statements).toHaveLength(0);
  });
});
