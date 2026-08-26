import type {
  HarnessBackend,
  HarnessBackendNotification,
  HarnessBackendPromptBlock,
  HarnessBackendRunHandle,
} from './backend.js';
import { HarnessBackendUnavailableError } from './backend.js';
import type { HarnessCreateSessionInput, HarnessRunInput } from './types.js';

/**
 * 远程后端：通过 harness JSON-RPC 协议（initialize / session.prompt / notifications）
 * 连接真实 DeepSeek Harness runtime。
 *
 * 上游升级只改本文件，不改 Adapter 公共契约。runtime 不可达时抛
 * HarnessBackendUnavailableError，Adapter 降级——普通业务后台、支付、核销和
 * 人工客服仍可运行。
 */

interface RemoteHarnessOptions {
  // harness runtime 的 JSON-RPC 基址，如 http://127.0.0.1:2345
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  // 每个上游调用的超时（毫秒）
  timeoutMs?: number;
}

export class RemoteHarnessBackend implements HarnessBackend {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: RemoteHarnessOptions) {
    if (!URL.canParse(options.endpoint)) {
      throw new Error(`RemoteHarnessBackend endpoint 非法：${options.endpoint}`);
    }
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async initialize(input: {
    cwd: string;
    modelStrategy: HarnessCreateSessionInput['modelStrategy'];
    availableTools: readonly string[];
  }): Promise<{ harnessRunId: string; modelRoutingVersion: string }> {
    const response = await this.rpc('initialize', {
      cwd: input.cwd,
      provider: 'deepseek',
      model: input.modelStrategy.routingKey,
      maxTokens: input.modelStrategy.maxTokens,
      visionEnabled: input.modelStrategy.visionEnabled,
      tools: [...input.availableTools],
    });
    const harnessRunId = readString(response.result, 'harnessRunId');
    const modelRoutingVersion = readString(response.result, 'modelRoutingVersion');
    return { harnessRunId, modelRoutingVersion };
  }

  async sendPrompt(input: {
    sessionId: string;
    blocks: readonly HarnessBackendPromptBlock[];
    executionMode: HarnessRunInput['executionMode'];
    idempotencyKey: string;
    traceId: string;
  }): Promise<HarnessBackendRunHandle> {
    const response = await this.rpc('session.prompt', {
      sessionId: input.sessionId,
      contentBlocks: input.blocks.map((block) => ({
        type: block.type,
        ...(block.text !== undefined ? { text: block.text } : {}),
        ...(block.objectKey !== undefined ? { objectKey: block.objectKey } : {}),
        ...(block.mediaType !== undefined ? { mediaType: block.mediaType } : {}),
      })),
      executionMode: input.executionMode,
      idempotencyKey: input.idempotencyKey,
      traceId: input.traceId,
    });
    const harnessRunId = readString(response.result, 'runId');
    return { harnessRunId, sessionId: input.sessionId };
  }

  async *streamEvents(input: {
    sessionId: string;
    runId: string;
    signal?: AbortSignal;
  }): AsyncIterable<HarnessBackendNotification> {
    // harness 通知以 NDJSON 流返回；按行解析为 notification。
    const controller = new AbortController();
    if (input.signal) input.signal.addEventListener('abort', () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const streamResponse = await this.fetchImpl(`${this.endpoint}/notifications?sessionId=${encodeURIComponent(input.sessionId)}&runId=${encodeURIComponent(input.runId)}`, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/x-ndjson' },
      });
      if (!streamResponse.ok || !streamResponse.body) {
        throw new HarnessBackendUnavailableError(`通知流不可用：HTTP ${streamResponse.status}`);
      }
      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          yield JSON.parse(trimmed) as HarnessBackendNotification;
        }
      }
    } catch (error) {
      if (error instanceof HarnessBackendUnavailableError) throw error;
      if (controller.signal.aborted) return;
      throw new HarnessBackendUnavailableError(`通知流中断：${toMessage(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async cancelRun(input: { runId: string; reason: string }): Promise<{ cancelled: boolean; detail: string }> {
    const response = await this.rpc('run.cancel', { runId: input.runId, reason: input.reason });
    const result = response.result as { cancelled?: boolean; detail?: string } | null;
    return { cancelled: result?.cancelled === true, detail: result?.detail ?? input.reason };
  }

  async resumeRun(input: {
    runId: string;
    checkpoint: Record<string, unknown>;
    supplements: HarnessRunInput['attachments'];
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ resumed: boolean; detail: string }> {
    const response = await this.rpc('run.resume', {
      runId: input.runId,
      checkpoint: input.checkpoint,
      supplements: input.supplements,
      idempotencyKey: input.idempotencyKey,
      traceId: input.traceId,
    });
    const result = response.result as { resumed?: boolean; detail?: string } | null;
    return { resumed: result?.resumed === true, detail: result?.detail ?? '已恢复' };
  }

  async rawHealth(): Promise<{
    commit: string;
    status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
    queuedTasks: number;
    plugins: { name: string; healthy: boolean }[];
    modelRoutingVersion: string;
    dependencies: { name: string; healthy: boolean; detail: string }[];
  }> {
    try {
      const response = await this.rpc('health', {});
      const result = response.result as {
        commit?: string;
        status?: string;
        queuedTasks?: number;
        plugins?: { name: string; healthy: boolean }[];
        modelRoutingVersion?: string;
        dependencies?: { name: string; healthy: boolean; detail: string }[];
      } | null;
      return {
        commit: result?.commit ?? 'unknown',
        status: parseStatus(result?.status),
        queuedTasks: result?.queuedTasks ?? 0,
        plugins: result?.plugins ?? [],
        modelRoutingVersion: result?.modelRoutingVersion ?? 'unknown',
        dependencies: result?.dependencies ?? [],
      };
    } catch {
      return {
        commit: 'unknown',
        status: 'UNAVAILABLE',
        queuedTasks: 0,
        plugins: [],
        modelRoutingVersion: 'unknown',
        dependencies: [{ name: 'harness-runtime', healthy: false, detail: '不可达' }],
      };
    }
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<{ result: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.endpoint}/rpc`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
      });
      if (!response.ok) {
        throw new HarnessBackendUnavailableError(`JSON-RPC ${method} 失败：HTTP ${response.status}`);
      }
      const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) {
        throw new Error(`JSON-RPC ${method} 错误：${body.error.message ?? '未知'}`);
      }
      return { result: body.result };
    } catch (error) {
      if (error instanceof HarnessBackendUnavailableError) throw error;
      if (controller.signal.aborted) {
        throw new HarnessBackendUnavailableError(`JSON-RPC ${method} 超时（${this.timeoutMs}ms）`);
      }
      throw new HarnessBackendUnavailableError(`JSON-RPC ${method} 不可达：${toMessage(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readString(value: unknown, key: string): string {
  const record = value as Record<string, unknown> | null;
  const raw = record?.[key];
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`harness 响应缺少字段 ${key}`);
  }
  return raw;
}

function parseStatus(value?: string): 'OK' | 'DEGRADED' | 'UNAVAILABLE' {
  if (value === 'OK' || value === 'DEGRADED' || value === 'UNAVAILABLE') return value;
  return 'DEGRADED';
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
