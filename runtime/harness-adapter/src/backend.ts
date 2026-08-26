import type { HarnessCreateSessionInput, HarnessRunInput, HarnessResumeInput } from './types.js';

/**
 * Harness 后端接口（Adapter 内部缝）。
 *
 * Adapter 只依赖本接口；真实实现 RemoteHarnessBackend 走 harness JSON-RPC 协议
 * （initialize / session.prompt / notifications），测试用 StubHarnessBackend 决定性返回。
 * 上游升级只改 RemoteHarnessBackend，不改 Adapter 公共契约。
 */

export interface HarnessBackendRunHandle {
  harnessRunId: string;
  sessionId: string;
}

export interface HarnessBackendPromptBlock {
  type: 'text' | 'image' | 'file' | 'audio';
  text?: string;
  objectKey?: string;
  mediaType?: string;
}

/** 上游原生通知（JSON-RPC notification）；Adapter 翻译为 16 标准事件。 */
export interface HarnessBackendNotification {
  method: string;
  params: Record<string, unknown>;
}

export interface HarnessBackend {
  /** 对应 harness initialize：cwd/provider/model/maxTokens/插件路由。 */
  initialize(input: {
    cwd: string;
    modelStrategy: HarnessCreateSessionInput['modelStrategy'];
    availableTools: readonly string[];
  }): Promise<{ harnessRunId: string; modelRoutingVersion: string }>;

  /** 对应 start_session + session.prompt；返回 run handle 供 streamEvents 订阅。 */
  sendPrompt(input: {
    sessionId: string;
    blocks: readonly HarnessBackendPromptBlock[];
    executionMode: HarnessRunInput['executionMode'];
    idempotencyKey: string;
    traceId: string;
  }): Promise<HarnessBackendRunHandle>;

  /** 订阅上游通知流，按到达顺序产出；Adapter 翻译后落盘到事件 sink。 */
  streamEvents(input: {
    sessionId: string;
    runId: string;
    signal?: AbortSignal;
  }): AsyncIterable<HarnessBackendNotification>;

  /** 取消运行；上游返回是否可取消。 */
  cancelRun(input: {
    runId: string;
    reason: string;
  }): Promise<{ cancelled: boolean; detail: string }>;

  /** 恢复运行（带检查点）；上游从最近安全点继续。 */
  resumeRun(input: {
    runId: string;
    checkpoint: Record<string, unknown>;
    supplements: HarnessResumeInput['supplements'];
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ resumed: boolean; detail: string }>;

  /** 上游健康信息；Adapter 聚合为 HarnessHealthResult。 */
  rawHealth(): Promise<{
    commit: string;
    status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
    queuedTasks: number;
    plugins: { name: string; healthy: boolean }[];
    modelRoutingVersion: string;
    dependencies: { name: string; healthy: boolean; detail: string }[];
  }>;
}

export const HARNESS_BACKEND_UNAVAILABLE = 'HARNESS_BACKEND_UNAVAILABLE';

export class HarnessBackendUnavailableError extends Error {
  override readonly name = 'HarnessBackendUnavailableError';
  constructor(message = 'Harness 后端暂不可用，普通业务后台、支付、核销和人工客服仍可运行') {
    super(message);
  }
}
