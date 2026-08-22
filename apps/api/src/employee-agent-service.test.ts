import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { SessionIdentity } from './session-identity.js';
import {
  createEmployeeAgentService,
  EmployeeAgentConflictError,
} from './employee-agent-service.js';

const identity = {
  tenantId: '28000000-0000-4000-8000-000000000001',
  userId: '28000000-0000-4000-8000-000000000002',
} as SessionIdentity;

function pool(query: ReturnType<typeof vi.fn>) {
  return {
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pick<pg.Pool, 'connect'>;
}

describe('employee Agent service', () => {
  it('uses the request hash in prompt object identity so a conflicting replay cannot overwrite it', async () => {
    const keys: string[] = [];
    const objectStore = {
      putText: vi.fn(async ({ objectKey }: { objectKey: string }) => keys.push(objectKey)),
    };
    const inserted: Record<string, unknown>[] = [];
    const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
      const sql = rawSql.replace(/\s+/gu, ' ');
      if (sql.includes('SELECT 1 FROM employee_agent_conversations'))
        return { rows: [{}], rowCount: 1 };
      if (sql.includes('SELECT * FROM employee_agent_tasks'))
        return { rows: inserted, rowCount: inserted.length };
      if (sql.includes('INSERT INTO employee_agent_tasks')) {
        const row = { id: values?.[0], request_hash: values?.[11] };
        inserted.push(row);
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const service = createEmployeeAgentService(pool(query), objectStore as never);
    const request = {
      conversationId: '28000000-0000-4000-8000-000000000003',
      prompt: '生成日报',
      mode: 'NORMAL',
      maxSteps: 4,
      maxToolCalls: 4,
      maxCostMicros: 1000,
      deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    await service.createTask(identity, 'same-key', request);
    await expect(
      service.createTask(identity, 'same-key', { ...request, prompt: '修改全部权限' }),
    ).rejects.toBeInstanceOf(EmployeeAgentConflictError);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('keeps an approved high-risk step waiting until the worker consumes the one-time approval', async () => {
    const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
      const sql = rawSql.replace(/\s+/gu, ' ').trim();
      statements.push({ sql, values });
      if (sql.includes('FROM employee_agent_approvals approval'))
        return {
          rows: [
            {
              id: 'approval-1',
              task_id: 'task-1',
              step_id: 'step-1',
              status: 'PENDING',
              expires_at: '2099-01-01T00:00:00.000Z',
              plan_version: 1,
              current_plan_version: 1,
              approval_level: 'CONFIRM',
              requested_by: identity.userId,
              task_status: 'WAITING_APPROVAL',
            },
          ],
          rowCount: 1,
        };
      if (sql.includes('UPDATE employee_agent_tasks'))
        return { rows: [{ status: 'WAITING_APPROVAL' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const service = createEmployeeAgentService(pool(query), { putText: vi.fn() });
    await expect(service.decideApproval(identity, 'approval-token', 'APPROVE')).resolves.toEqual({
      status: 'WAITING_APPROVAL',
    });
    const stepUpdate = statements.find(({ sql }) =>
      sql.includes('UPDATE employee_agent_task_steps'),
    );
    const taskUpdate = statements.find(({ sql }) => sql.includes('UPDATE employee_agent_tasks'));
    expect(stepUpdate?.values?.[2]).toBe('WAITING_APPROVAL');
    expect(taskUpdate?.values?.[2]).toBe('WAITING_APPROVAL');
  });
});
