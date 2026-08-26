import type {
  HarnessBackend,
  HarnessBackendNotification,
  HarnessBackendPromptBlock,
  HarnessBackendRunHandle,
} from './backend.js';
import type { HarnessRunInput } from './types.js';

/**
 * 决定性 stub 后端（测试/开发用，无需真实 harness runtime）。
 *
 * 按执行模式产出一组原生通知流，覆盖 Adapter 事件翻译器的所有分支：
 * - AUTO：session.created → message.started → message.delta×3 → message.completed → task.completed
 * - ASSIST：… → tool.requested → approval.requested → task.paused
 * - CONFIRM：session.created → approval.requested → task.paused
 */

let stubRunCounter = 0;

export class StubHarnessBackend implements HarnessBackend {
  private readonly modelRoutingVersion: string;
  private readonly promptFlows = new Map<string, HarnessBackendNotification[]>();
  private readonly cancelled = new Set<string>();

  constructor(modelRoutingVersion = 'stub-v0.1.1-rc.2') {
    this.modelRoutingVersion = modelRoutingVersion;
  }

  async initialize(input: {
    cwd: string;
    modelStrategy: { routingKey: string; visionEnabled: boolean; maxTokens: number; temperatureCenti: number };
    availableTools: readonly string[];
  }): Promise<{ harnessRunId: string; modelRoutingVersion: string }> {
    const harnessRunId = `stub-run-${++stubRunCounter}`;
    return { harnessRunId, modelRoutingVersion: this.modelRoutingVersion };
  }

  async sendPrompt(input: {
    sessionId: string;
    blocks: readonly HarnessBackendPromptBlock[];
    executionMode: HarnessRunInput['executionMode'];
    idempotencyKey: string;
    traceId: string;
  }): Promise<HarnessBackendRunHandle> {
    const runId = `stub-run-${++stubRunCounter}`;
    const flows = this.buildFlow(input);
    this.promptFlows.set(runId, flows);
    return { harnessRunId: runId, sessionId: input.sessionId };
  }

  async *streamEvents(input: {
    sessionId: string;
    runId: string;
    signal?: AbortSignal;
  }): AsyncIterable<HarnessBackendNotification> {
    const flow = this.promptFlows.get(input.runId) ?? [];
    for (const notification of flow) {
      if (this.cancelled.has(input.runId)) {
        yield { method: 'task.cancelled', params: { reason: 'cancelled', operatorId: 'stub' } };
        return;
      }
      if (input.signal?.aborted) return;
      yield notification;
    }
  }

  async cancelRun(input: { runId: string; reason: string }): Promise<{ cancelled: boolean; detail: string }> {
    this.cancelled.add(input.runId);
    return { cancelled: true, detail: input.reason };
  }

  async resumeRun(input: {
    runId: string;
    checkpoint: Record<string, unknown>;
    supplements: HarnessRunInput['attachments'];
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ resumed: boolean; detail: string }> {
    return { resumed: true, detail: `从检查点恢复，补充 ${input.supplements.length} 项` };
  }

  async rawHealth(): Promise<{
    commit: string;
    status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
    queuedTasks: number;
    plugins: { name: string; healthy: boolean }[];
    modelRoutingVersion: string;
    dependencies: { name: string; healthy: boolean; detail: string }[];
  }> {
    return {
      commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
      status: 'OK',
      queuedTasks: 0,
      plugins: [{ name: 'goal', healthy: true }, { name: 'attachment', healthy: true }],
      modelRoutingVersion: this.modelRoutingVersion,
      dependencies: [{ name: 'llm-router', healthy: true, detail: 'stub' }],
    };
  }

  private buildFlow(input: {
    blocks: readonly HarnessBackendPromptBlock[];
    executionMode: HarnessRunInput['executionMode'];
  }): HarnessBackendNotification[] {
    const messageId = `msg-${++stubRunCounter}`;
    const base: HarnessBackendNotification[] = [
      { method: 'session.created', params: { harnessRunId: `h-${stubRunCounter}` } },
      { method: 'message.started', params: { messageId } },
      { method: 'message.delta', params: { messageId, delta: '已' } },
      { method: 'message.delta', params: { messageId, delta: '核验' } },
      { method: 'message.delta', params: { messageId, delta: '完成' } },
      { method: 'message.completed', params: { messageId, finishReason: 'stop' } },
    ];
    if (input.executionMode === 'CONFIRM') {
      return [
        base[0] as HarnessBackendNotification,
        {
          method: 'approval.requested',
          params: {
            approvalId: `apr-${++stubRunCounter}`,
            decisionKind: 'PAYOUT_ACCOUNT',
            summary: '商家支付账户与小程序名称需要确认',
            impacts: ['主体授权', '对外展示'],
          },
        },
        { method: 'task.paused', params: { reason: '等待商家确认', checkpoint: { sequence: 1 } } },
      ];
    }
    if (input.executionMode === 'ASSIST') {
      return [
        ...base,
        {
          method: 'tool.requested',
          params: { toolName: 'verify.merchant.profile', arguments: { merchantId: 'stub' }, idempotencyKey: `idem-${++stubRunCounter}` },
        },
        {
          method: 'approval.requested',
          params: {
            approvalId: `apr-${++stubRunCounter}`,
            decisionKind: 'PAYOUT_ACCOUNT',
            summary: '是否向商家发送授权链接？',
            impacts: ['24 小时有效', '仅管理员可操作'],
          },
        },
        { method: 'task.paused', params: { reason: '等待商家授权', checkpoint: { sequence: base.length } } },
      ];
    }
    // AUTO
    return [
      ...base,
      {
        method: 'artifact.created',
        params: { artifactId: `art-${++stubRunCounter}`, kind: 'verification_report', ref: 'stub://artifact/1' },
      },
      {
        method: 'task.completed',
        params: { finalSummary: '上线前核验已完成', artifacts: [{ artifactId: 'art-1', kind: 'verification_report' }] },
      },
    ];
  }
}
