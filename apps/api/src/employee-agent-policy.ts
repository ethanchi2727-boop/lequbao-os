import { z } from 'zod';

export const EmployeeAgentConversationRequestSchema = z.object({
  storeId: z.uuid().optional(),
  mode: z.enum(['NORMAL', 'COMPLEX']),
  title: z.string().trim().min(1).max(160),
});

export const EmployeeAgentPlanSchema = z
  .array(
    z.object({
      actionCode: z.string().regex(/^[a-z][a-z0-9_.-]{1,119}$/u),
      toolCode: z.string().trim().min(1).max(120).optional(),
      riskLevel: z.enum(['AUTO', 'NOTIFY', 'CONFIRM', 'DUAL_CONFIRM']),
      inputSummaryRedacted: z.record(z.string(), z.unknown()).default({}),
    }),
  )
  .min(1)
  .max(12);

export const EmployeeAgentTaskRequestSchema = z
  .object({
    conversationId: z.uuid(),
    mode: z.enum(['NORMAL', 'COMPLEX', 'BACKGROUND']),
    prompt: z.string().trim().min(1).max(20_000),
    maxSteps: z.int().min(1).max(12),
    maxToolCalls: z.int().min(0).max(100),
    maxCostMicros: z.int().min(0).max(100_000_000),
    deadlineAt: z.string().datetime({ offset: true }),
  })
  .superRefine((input, context) => {
    if (input.mode === 'NORMAL' && input.maxSteps > 8)
      context.addIssue({
        code: 'custom',
        path: ['maxSteps'],
        message: 'normal tasks allow at most 8 steps',
      });
    const deadline = new Date(input.deadlineAt).getTime();
    if (deadline <= Date.now() || deadline > Date.now() + 24 * 60 * 60 * 1000)
      context.addIssue({
        code: 'custom',
        path: ['deadlineAt'],
        message: 'deadline must be within 24 hours',
      });
  });

export function canRetryAgentTask(input: {
  status: string;
  retryCount: number;
  unknownResult: boolean;
  highRisk: boolean;
}) {
  return (
    input.status === 'FAILED' && input.retryCount < 2 && !input.unknownResult && !input.highRisk
  );
}

export type AgentTaskAction = 'PAUSE' | 'RESUME' | 'CANCEL' | 'RETRY';

export function nextAgentTaskStatus(
  input: { status: string; retryCount: number; unknownResult: boolean; highRisk: boolean },
  action: AgentTaskAction,
) {
  if (action === 'PAUSE' && ['READY', 'RUNNING'].includes(input.status)) return 'PAUSED';
  if (action === 'RESUME' && input.status === 'PAUSED') return 'READY';
  if (action === 'CANCEL' && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(input.status))
    return 'CANCELLED';
  if (action === 'RETRY' && canRetryAgentTask(input)) return 'READY';
  throw new Error('INVALID_AGENT_TASK_TRANSITION');
}

export function canApproveAgentStep(input: {
  status: string;
  expiresAt: string;
  approvalPlanVersion: number;
  currentPlanVersion: number;
  approvalLevel: 'CONFIRM' | 'DUAL_CONFIRM';
  requestedBy: string;
  approvingUserId: string;
}) {
  return (
    input.status === 'PENDING' &&
    new Date(input.expiresAt).getTime() > Date.now() &&
    input.approvalPlanVersion === input.currentPlanVersion &&
    (input.approvalLevel !== 'DUAL_CONFIRM' || input.requestedBy !== input.approvingUserId)
  );
}
