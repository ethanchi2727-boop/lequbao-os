import { z } from 'zod';
import {
  HarnessSchemaVersionSchema,
  HarnessActorIdSchema,
  HarnessSessionIdSchema,
  HarnessTaskIdSchema,
  HarnessTraceIdSchema,
  type HarnessAttachment,
} from './types.js';
import { TenantIdSchema } from '@lequ/contracts';

/**
 * Harness Adapter 标准事件。
 *
 * 事件信封必须带 tenant_id、actor_id、session_id、task_id、sequence、trace_id、
 * occurred_at、schema_version。任一字段缺失视为契约破坏。
 *
 * 事件按 sequence 单调递增；subscribe 从 lastSequence 之后开始按序重放，支持断线续传。
 */

export const HarnessEventEnvelopeSchema = z.object({
  schemaVersion: HarnessSchemaVersionSchema,
  tenantId: TenantIdSchema,
  actorId: HarnessActorIdSchema,
  sessionId: HarnessSessionIdSchema,
  taskId: HarnessTaskIdSchema.nullable(),
  sequence: z.int().nonnegative(),
  traceId: HarnessTraceIdSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  eventType: z.string().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
});
export type HarnessEventEnvelope = z.infer<typeof HarnessEventEnvelopeSchema>;

export const HARNESS_EVENT_TYPES = [
  'session.created',
  'message.started',
  'message.delta',
  'message.completed',
  'tool.requested',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'approval.requested',
  'approval.resolved',
  'artifact.created',
  'task.paused',
  'task.resumed',
  'task.completed',
  'task.failed',
  'task.cancelled',
] as const;
export type HarnessEventType = (typeof HARNESS_EVENT_TYPES)[number];

export function assertHarnessEventType(value: string): asserts value is HarnessEventType {
  if (!HARNESS_EVENT_TYPES.includes(value as HarnessEventType)) {
    throw new Error(`未知 Harness 事件类型：${value}`);
  }
}

export interface HarnessEventEmitter {
  emit(event: HarnessEventEnvelope): void;
}

export interface HarnessEventSink {
  /** 持久化事件，返回分配的 sequence。断线续传从此读取。 */
  append(
    input: Omit<HarnessEventEnvelope, 'sequence' | 'occurredAt'> & { occurredAt?: string },
  ): Promise<HarnessEventEnvelope>;
  /** 从 lastSequence 之后按序重放。 */
  replay(input: {
    sessionId?: string;
    taskId?: string;
    afterSequence: number;
  }): AsyncIterable<HarnessEventEnvelope>;
}

export interface HarnessEventPayloads {
  'session.created': { harnessRunId: string };
  'message.started': { messageId: string };
  'message.delta': { messageId: string; delta: string };
  'message.completed': { messageId: string; finishReason: string };
  'tool.requested': { toolName: string; arguments: unknown; idempotencyKey: string };
  'tool.started': { toolName: string; attempt: number };
  'tool.completed': { toolName: string; result: unknown };
  'tool.failed': { toolName: string; error: string; retryable: boolean };
  'approval.requested': {
    approvalId: string;
    decisionKind: string;
    summary: string;
    impacts: string[];
  };
  'approval.resolved': {
    approvalId: string;
    decision: 'APPROVED' | 'REJECTED';
    operatorId: string;
  };
  'artifact.created': { artifactId: string; kind: string; ref: string };
  'task.paused': { reason: string; checkpoint: Record<string, unknown> };
  'task.resumed': { fromSequence: number };
  'task.completed': { finalSummary: string; artifacts: { artifactId: string; kind: string }[] };
  'task.failed': { error: string; partialArtifacts: { artifactId: string; kind: string }[] };
  'task.cancelled': { reason: string; operatorId: string };
}

/**
 * 构造一个标准事件信封（不分配 sequence；由 sink.append 落盘时分配）。
 * payload 形状由调用方保证与事件类型匹配；契约测试覆盖每种类型的载荷。
 */
export function buildHarnessEvent<K extends HarnessEventType>(base: {
  tenantId: string;
  actorId: string;
  sessionId: string;
  taskId: string | null;
  traceId: string;
  eventType: K;
  payload: HarnessEventPayloads[K];
}): Omit<HarnessEventEnvelope, 'sequence' | 'occurredAt'> & { occurredAt?: string } {
  assertHarnessEventType(base.eventType);
  const { tenantId, actorId, sessionId, taskId, traceId, eventType, payload } = base;
  return {
    schemaVersion: 1,
    tenantId: tenantId as never,
    actorId,
    sessionId,
    taskId,
    traceId,
    eventType,
    payload: payload as Record<string, unknown>,
  };
}

export function attachmentSummary(attachments: readonly HarnessAttachment[]): string {
  if (attachments.length === 0) return '无附件';
  const counts: Record<string, number> = {};
  for (const attachment of attachments)
    counts[attachment.kind] = (counts[attachment.kind] ?? 0) + 1;
  return Object.entries(counts)
    .map(([kind, count]) => `${kind}:${count}`)
    .join(' ');
}
