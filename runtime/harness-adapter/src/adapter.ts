import { UuidSchema } from '@lequ/contracts';
import {
  HarnessCreateSessionInputSchema,
  HarnessRunInputSchema,
  HarnessResumeInputSchema,
  HarnessCancelInputSchema,
  HarnessSubscribeInputSchema,
  HarnessHealthResultSchema,
  type HarnessCreateSessionInput,
  type HarnessCreateSessionResult,
  type HarnessRunInput,
  type HarnessRunResult,
  type HarnessResumeInput,
  type HarnessCancelInput,
  type HarnessCancelResult,
  type HarnessSubscribeInput,
  type HarnessHealthResult,
  type HarnessAttachment,
} from './types.js';
import type {
  HarnessBackend,
  HarnessBackendNotification,
  HarnessBackendPromptBlock,
} from './backend.js';
import { HarnessBackendUnavailableError } from './backend.js';
import { buildHarnessEvent, type HarnessEventSink, type HarnessEventEnvelope } from './events.js';
import type { HarnessBudgetLedger } from './budget.js';
import { DefaultHarnessRetryPolicy } from './budget.js';
import type { HarnessCheckpointStore } from './checkpoint.js';

export interface HarnessAdapterDeps {
  backend: HarnessBackend;
  events: HarnessEventSink;
  budget: HarnessBudgetLedger;
  checkpoints: HarnessCheckpointStore;
  adapterVersion?: string;
  cwd?: string;
  retryPolicy?: DefaultHarnessRetryPolicy;
}

/**
 * Harness Adapter 稳定门面。
 *
 * 业务层只调本类的六个方法（createSession/run/resume/cancel/subscribe/health）。
 * 上游升级、替换或回滚时，会话 ID、任务 ID、事件语义、成果格式和审计记录不变。
 *
 * Adapter 不可用时，普通业务后台、支付、核销和人工客服仍可运行——调用方应捕获
 * HarnessBackendUnavailableError 并降级，不让 AI 故障阻塞主业务。
 */
export class HarnessAdapter {
  private readonly deps: HarnessAdapterDeps;
  private readonly adapterVersion: string;
  private readonly cwd: string;
  private readonly retryPolicy: DefaultHarnessRetryPolicy;

  constructor(deps: HarnessAdapterDeps) {
    this.deps = deps;
    this.adapterVersion = deps.adapterVersion ?? '0.1.0';
    this.cwd = deps.cwd ?? process.cwd();
    this.retryPolicy = deps.retryPolicy ?? new DefaultHarnessRetryPolicy();
  }

  async createSession(input: HarnessCreateSessionInput): Promise<HarnessCreateSessionResult> {
    const parsed = HarnessCreateSessionInputSchema.parse(input);
    const { harnessRunId } = await this.deps.backend.initialize({
      cwd: this.cwd,
      modelStrategy: parsed.modelStrategy,
      availableTools: parsed.availableTools,
    });
    const sessionId = UuidSchema.parse(crypto.randomUUID());
    const createdAt = new Date().toISOString();
    await this.deps.events.append(
      buildHarnessEvent({
        tenantId: parsed.tenantId,
        actorId: parsed.actorId,
        sessionId,
        taskId: null,
        traceId: crypto.randomUUID(),
        eventType: 'session.created',
        payload: { harnessRunId },
      }),
    );
    return { sessionId, harnessRunId, createdAt };
  }

  async run(input: HarnessRunInput): Promise<HarnessRunResult> {
    const parsed = HarnessRunInputSchema.parse(input);
    const taskId = UuidSchema.parse(crypto.randomUUID());
    // 预占预算
    await this.deps.budget.preAuthorize({
      taskId,
      tenantId: await this.resolveTenant(parsed.sessionId),
      preAuthorizedMinor: '0', // 由 api 层按 modelStrategy 估价后传入；Adapter 不自定金额
    });
    const blocks: HarnessBackendPromptBlock[] = parsed.message
      ? [
          { type: 'text' as const, text: parsed.message },
          ...parsed.attachments.map((attachment: HarnessAttachment): HarnessBackendPromptBlock => {
            const block: HarnessBackendPromptBlock = {
              type: attachment.kind === 'text' ? ('text' as const) : attachment.kind,
              mediaType: attachment.mediaType,
            };
            if (attachment.inline !== undefined) block.text = attachment.inline;
            if (attachment.objectKey !== undefined) block.objectKey = attachment.objectKey;
            return block;
          }),
        ]
      : [];
    let lastSequence = 0;
    try {
      const handle = await this.deps.backend.sendPrompt({
        sessionId: parsed.sessionId,
        blocks,
        executionMode: parsed.executionMode,
        idempotencyKey: parsed.idempotencyKey,
        traceId: parsed.traceId,
      });
      // 翻译并落盘事件流
      for await (const notification of this.deps.backend.streamEvents({
        sessionId: parsed.sessionId,
        runId: handle.harnessRunId,
      })) {
        const envelope = await this.translate({
          notification,
          tenantId: await this.resolveTenant(parsed.sessionId),
          actorId: await this.resolveActor(parsed.sessionId),
          sessionId: parsed.sessionId,
          taskId,
          traceId: parsed.traceId,
        });
        if (envelope) {
          const stored = await this.deps.events.append(envelope);
          lastSequence = stored.sequence;
          // task.paused 落检查点（含会话/任务/运行 ID 以便 resume 反查）
          if (stored.eventType === 'task.paused') {
            await this.deps.checkpoints.save({
              taskId,
              sequence: stored.sequence,
              state: {
                ...((stored.payload as { checkpoint?: Record<string, unknown> }).checkpoint ?? {}),
                sessionId: parsed.sessionId,
                taskId,
                runId: handle.harnessRunId,
              },
              savedAt: stored.occurredAt,
            });
          }
        }
      }
      // 完成后按实际成本结算（stub 场景实际成本为 0；真实场景由 backend 上报）
      await this.deps.budget.settle({
        taskId,
        actualCostMinor: '0',
        refundedMinor: '0',
      });
    } catch (error) {
      if (error instanceof HarnessBackendUnavailableError) {
        // 降级：失败后返还可返部分（此处全返，因为尚未实际消耗）
        await this.deps.budget.settle({ taskId, actualCostMinor: '0', refundedMinor: '0' });
        await this.deps.events.append(
          buildHarnessEvent({
            tenantId: await this.resolveTenant(parsed.sessionId),
            actorId: await this.resolveActor(parsed.sessionId),
            sessionId: parsed.sessionId,
            taskId,
            traceId: parsed.traceId,
            eventType: 'task.failed',
            payload: { error: error.message, partialArtifacts: [] },
          }),
        );
        throw error;
      }
      throw error;
    }
    return { taskId, lastSequence };
  }

  async resume(input: HarnessResumeInput): Promise<{ taskId: string; lastSequence: number }> {
    const parsed = HarnessResumeInputSchema.parse(input);
    const checkpoint = await this.deps.checkpoints.load(parsed.taskId);
    if (!checkpoint) {
      throw new Error(`无检查点可恢复：${parsed.taskId}`);
    }
    const storedSessionId = String(checkpoint.state.sessionId ?? '');
    await this.deps.events.append(
      buildHarnessEvent({
        tenantId: await this.resolveTenant(storedSessionId),
        actorId: await this.resolveActor(storedSessionId),
        sessionId: storedSessionId,
        taskId: parsed.taskId,
        traceId: parsed.traceId,
        eventType: 'task.resumed',
        payload: { fromSequence: checkpoint.sequence },
      }),
    );
    // 上游从检查点继续（真实 backend 实现；stub 直接返回）
    await this.deps.backend.resumeRun({
      runId: String(checkpoint.state.runId ?? ''),
      checkpoint: checkpoint.state,
      supplements: parsed.supplements,
      idempotencyKey: parsed.idempotencyKey,
      traceId: parsed.traceId,
    });
    return { taskId: parsed.taskId, lastSequence: checkpoint.sequence };
  }

  async cancel(input: HarnessCancelInput): Promise<HarnessCancelResult> {
    const parsed = HarnessCancelInputSchema.parse(input);
    const checkpoint = await this.deps.checkpoints.load(parsed.taskId);
    const runId = checkpoint ? String(checkpoint.state.runId ?? '') : '';
    if (!runId || !checkpoint) {
      return { taskId: parsed.taskId, status: 'NOT_CANCELLABLE', detail: '无运行态可取消' };
    }
    const storedSessionId = String(checkpoint.state.sessionId ?? '');
    const result = await this.deps.backend.cancelRun({ runId, reason: parsed.reason });
    await this.deps.events.append(
      buildHarnessEvent({
        tenantId: await this.resolveTenant(storedSessionId),
        actorId: parsed.operatorId,
        sessionId: storedSessionId,
        taskId: parsed.taskId,
        traceId: crypto.randomUUID(),
        eventType: 'task.cancelled',
        payload: { reason: parsed.reason, operatorId: parsed.operatorId },
      }),
    );
    return {
      taskId: parsed.taskId,
      status: result.cancelled ? 'CANCELLED' : 'NOT_CANCELLABLE',
      detail: result.detail,
    };
  }

  async subscribe(input: HarnessSubscribeInput): Promise<HarnessEventEnvelope[]> {
    const parsed = HarnessSubscribeInputSchema.parse(input);
    const collected: HarnessEventEnvelope[] = [];
    const replayInput: { sessionId?: string; taskId?: string; afterSequence: number } = {
      afterSequence: parsed.lastSequence,
    };
    if (parsed.sessionId !== undefined) replayInput.sessionId = parsed.sessionId;
    if (parsed.taskId !== undefined) replayInput.taskId = parsed.taskId;
    for await (const event of this.deps.events.replay(replayInput)) {
      collected.push(event);
    }
    return collected;
  }

  async health(): Promise<HarnessHealthResult> {
    const raw = await this.deps.backend.rawHealth();
    const result: HarnessHealthResult = {
      adapterVersion: this.adapterVersion,
      harnessCommit: raw.commit,
      status: raw.status,
      queuedTasks: raw.queuedTasks,
      plugins: raw.plugins,
      modelRoutingVersion: raw.modelRoutingVersion,
      dependencies: raw.dependencies,
    };
    return HarnessHealthResultSchema.parse(result);
  }

  private async translate(input: {
    notification: HarnessBackendNotification;
    tenantId: string;
    actorId: string;
    sessionId: string;
    taskId: string;
    traceId: string;
  }): Promise<Parameters<HarnessEventSink['append']>[0] | null> {
    const { notification, tenantId, actorId, sessionId, taskId, traceId } = input;
    const params = notification.params;
    const base = { tenantId, actorId, sessionId, taskId, traceId };
    switch (notification.method) {
      case 'session.created':
        return buildHarnessEvent({
          ...base,
          eventType: 'session.created',
          payload: { harnessRunId: String(params.harnessRunId ?? '') },
        });
      case 'message.started':
      case 'session.message.started':
        return buildHarnessEvent({
          ...base,
          eventType: 'message.started',
          payload: { messageId: String(params.messageId ?? '') },
        });
      case 'message.delta':
      case 'session.message.delta':
        return buildHarnessEvent({
          ...base,
          eventType: 'message.delta',
          payload: { messageId: String(params.messageId ?? ''), delta: String(params.delta ?? '') },
        });
      case 'message.completed':
      case 'session.message.completed':
        return buildHarnessEvent({
          ...base,
          eventType: 'message.completed',
          payload: {
            messageId: String(params.messageId ?? ''),
            finishReason: String(params.finishReason ?? 'stop'),
          },
        });
      case 'tool.requested':
        return buildHarnessEvent({
          ...base,
          eventType: 'tool.requested',
          payload: {
            toolName: String(params.toolName ?? ''),
            arguments: params.arguments ?? {},
            idempotencyKey: String(params.idempotencyKey ?? ''),
          },
        });
      case 'tool.started':
        return buildHarnessEvent({
          ...base,
          eventType: 'tool.started',
          payload: {
            toolName: String(params.toolName ?? ''),
            attempt: Number(params.attempt ?? 1),
          },
        });
      case 'tool.completed':
        return buildHarnessEvent({
          ...base,
          eventType: 'tool.completed',
          payload: { toolName: String(params.toolName ?? ''), result: params.result },
        });
      case 'tool.failed':
        return buildHarnessEvent({
          ...base,
          eventType: 'tool.failed',
          payload: {
            toolName: String(params.toolName ?? ''),
            error: String(params.error ?? ''),
            retryable: Boolean(params.retryable),
          },
        });
      case 'approval.requested':
        return buildHarnessEvent({
          ...base,
          eventType: 'approval.requested',
          payload: {
            approvalId: String(params.approvalId ?? ''),
            decisionKind: String(params.decisionKind ?? ''),
            summary: String(params.summary ?? ''),
            impacts: Array.isArray(params.impacts) ? (params.impacts as string[]) : [],
          },
        });
      case 'approval.resolved':
        return buildHarnessEvent({
          ...base,
          eventType: 'approval.resolved',
          payload: {
            approvalId: String(params.approvalId ?? ''),
            decision: params.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED',
            operatorId: String(params.operatorId ?? ''),
          },
        });
      case 'artifact.created':
        return buildHarnessEvent({
          ...base,
          eventType: 'artifact.created',
          payload: {
            artifactId: String(params.artifactId ?? ''),
            kind: String(params.kind ?? ''),
            ref: String(params.ref ?? ''),
          },
        });
      case 'task.paused':
        return buildHarnessEvent({
          ...base,
          eventType: 'task.paused',
          payload: {
            reason: String(params.reason ?? ''),
            checkpoint: (params.checkpoint as Record<string, unknown>) ?? {},
          },
        });
      case 'task.resumed':
        return buildHarnessEvent({
          ...base,
          eventType: 'task.resumed',
          payload: { fromSequence: Number(params.fromSequence ?? 0) },
        });
      case 'task.completed':
        return buildHarnessEvent({
          ...base,
          eventType: 'task.completed',
          payload: {
            finalSummary: String(params.finalSummary ?? ''),
            artifacts: Array.isArray(params.artifacts)
              ? (params.artifacts as { artifactId: string; kind: string }[])
              : [],
          },
        });
      case 'task.failed':
        return buildHarnessEvent({
          ...base,
          eventType: 'task.failed',
          payload: {
            error: String(params.error ?? ''),
            partialArtifacts: Array.isArray(params.partialArtifacts)
              ? (params.partialArtifacts as { artifactId: string; kind: string }[])
              : [],
          },
        });
      case 'task.cancelled':
        return buildHarnessEvent({
          ...base,
          eventType: 'task.cancelled',
          payload: {
            reason: String(params.reason ?? ''),
            operatorId: String(params.operatorId ?? ''),
          },
        });
      default:
        return null; // 未知通知忽略；契约测试覆盖所有已知类型
    }
  }

  // 会话→租户/操作人的映射由事件 sink 提供（session.created 已落盘）。
  // 真实实现按 sessionId 查；此处从最近事件反查以保持 Adapter 自洽。
  private async resolveTenant(sessionId: string): Promise<string> {
    if (!sessionId) return UuidSchema.parse('00000000-0000-0000-0000-000000000000');
    const recent = this.deps.events.replay({ sessionId, afterSequence: 0 });
    for await (const event of recent) {
      return event.tenantId as string;
    }
    return UuidSchema.parse('00000000-0000-0000-0000-000000000000');
  }

  private async resolveActor(sessionId: string): Promise<string> {
    if (!sessionId) return UuidSchema.parse('00000000-0000-0000-0000-000000000000');
    const recent = this.deps.events.replay({ sessionId, afterSequence: 0 });
    for await (const event of recent) {
      return event.actorId as string;
    }
    return UuidSchema.parse('00000000-0000-0000-0000-000000000000');
  }
}
