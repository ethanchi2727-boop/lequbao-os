import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { claimEmployeeAgentStep } from './employee-agent-jobs.js';

describe('employee Agent worker', () => {
  it('atomically consumes the approved current-plan token before returning a high-risk step', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (rawSql: string) => {
      const sql = rawSql.replace(/\s+/gu, ' ').trim();
      statements.push(sql);
      if (sql.startsWith('SELECT status,deadline_at'))
        return {
          rows: [
            {
              status: 'WAITING_APPROVAL',
              deadline_at: new Date('2099-01-01T00:00:00.000Z'),
              actual_tool_calls: 0,
              max_tool_calls: 4,
              actual_cost_micros: '0',
              max_cost_micros: '1000',
              plan_version: 2,
            },
          ],
          rowCount: 1,
        };
      if (sql.includes('FROM employee_agent_task_steps step'))
        return {
          rows: [
            {
              id: 'step-1',
              task_id: 'task-1',
              approval_id: 'approval-1',
              status: 'WAITING_APPROVAL',
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    });
    const pool = {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as unknown as Pick<pg.Pool, 'connect'>;
    await expect(claimEmployeeAgentStep(pool, 'tenant-1', 'task-1')).resolves.toMatchObject({
      id: 'step-1',
    });
    expect(statements.some((sql) => sql.includes("status='CONSUMED',consumed_at=now()"))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes("SET status='RUNNING'"))).toBe(true);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('does not execute a high-risk step while approval is still pending', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'WAITING_APPROVAL',
            deadline_at: new Date('2099-01-01T00:00:00.000Z'),
            actual_tool_calls: 0,
            max_tool_calls: 4,
            actual_cost_micros: '0',
            max_cost_micros: '1000',
            plan_version: 2,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({});
    const pool = {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as unknown as Pick<pg.Pool, 'connect'>;
    await expect(claimEmployeeAgentStep(pool, 'tenant-1', 'task-1')).rejects.toThrow(
      'AGENT_APPROVAL_NOT_READY',
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
});
