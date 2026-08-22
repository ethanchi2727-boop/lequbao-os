import { describe, expect, it } from 'vitest';
import {
  canRetryAgentTask,
  EmployeeAgentConversationRequestSchema,
  EmployeeAgentPlanSchema,
  EmployeeAgentTaskRequestSchema,
  nextAgentTaskStatus,
  canApproveAgentStep,
} from './employee-agent-policy.js';

const base = {
  conversationId: '10000000-0000-4000-8000-000000000001',
  mode: 'NORMAL' as const,
  prompt: '整理本店本周经营异常',
  maxSteps: 8,
  maxToolCalls: 10,
  maxCostMicros: 100_000,
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
};

describe('employee agent policy', () => {
  it('validates bounded conversation and structured plan contracts', () => {
    expect(
      EmployeeAgentConversationRequestSchema.safeParse({ mode: 'COMPLEX', title: '经营分析' })
        .success,
    ).toBe(true);
    expect(
      EmployeeAgentPlanSchema.safeParse([
        {
          actionCode: 'report.read',
          toolCode: 'monthly-report',
          riskLevel: 'AUTO',
          inputSummaryRedacted: { month: '2026-08' },
        },
      ]).success,
    ).toBe(true);
    expect(EmployeeAgentPlanSchema.safeParse([]).success).toBe(false);
    expect(
      EmployeeAgentPlanSchema.safeParse(
        Array.from({ length: 13 }, () => ({ actionCode: 'report.read', riskLevel: 'AUTO' })),
      ).success,
    ).toBe(false);
  });
  it('enforces conversational and background step limits', () => {
    expect(EmployeeAgentTaskRequestSchema.safeParse(base).success).toBe(true);
    expect(EmployeeAgentTaskRequestSchema.safeParse({ ...base, maxSteps: 9 }).success).toBe(false);
    expect(
      EmployeeAgentTaskRequestSchema.safeParse({ ...base, mode: 'BACKGROUND', maxSteps: 12 })
        .success,
    ).toBe(true);
  });

  it('never retries unknown, high-risk or twice-failed work', () => {
    expect(
      canRetryAgentTask({ status: 'FAILED', retryCount: 1, unknownResult: false, highRisk: false }),
    ).toBe(true);
    expect(
      canRetryAgentTask({ status: 'FAILED', retryCount: 2, unknownResult: false, highRisk: false }),
    ).toBe(false);
    expect(
      canRetryAgentTask({ status: 'FAILED', retryCount: 0, unknownResult: true, highRisk: false }),
    ).toBe(false);
    expect(
      canRetryAgentTask({ status: 'FAILED', retryCount: 0, unknownResult: false, highRisk: true }),
    ).toBe(false);
  });

  it('permits only explicit pause, resume, cancel and safe retry transitions', () => {
    const safe = { retryCount: 0, unknownResult: false, highRisk: false };
    expect(nextAgentTaskStatus({ ...safe, status: 'RUNNING' }, 'PAUSE')).toBe('PAUSED');
    expect(nextAgentTaskStatus({ ...safe, status: 'PAUSED' }, 'RESUME')).toBe('READY');
    expect(nextAgentTaskStatus({ ...safe, status: 'WAITING_APPROVAL' }, 'CANCEL')).toBe(
      'CANCELLED',
    );
    expect(nextAgentTaskStatus({ ...safe, status: 'FAILED' }, 'RETRY')).toBe('READY');
    expect(() => nextAgentTaskStatus({ ...safe, status: 'SUCCEEDED' }, 'RETRY')).toThrow(
      'INVALID_AGENT_TASK_TRANSITION',
    );
  });

  it('binds approval to expiry, plan version and a different dual confirmer', () => {
    const approval = {
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      approvalPlanVersion: 2,
      currentPlanVersion: 2,
      approvalLevel: 'DUAL_CONFIRM' as const,
      requestedBy: 'user-a',
      approvingUserId: 'user-b',
    };
    expect(canApproveAgentStep(approval)).toBe(true);
    expect(canApproveAgentStep({ ...approval, approvingUserId: 'user-a' })).toBe(false);
    expect(canApproveAgentStep({ ...approval, currentPlanVersion: 3 })).toBe(false);
    expect(canApproveAgentStep({ ...approval, expiresAt: new Date(0).toISOString() })).toBe(false);
  });
});
