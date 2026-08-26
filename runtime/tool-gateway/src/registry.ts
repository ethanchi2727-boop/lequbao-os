import type { ToolDescriptor } from './types.js';

/**
 * 工具注册表。
 *
 * 所有可被 Harness/Adapter 调用的工具必须先注册：descriptor 声明
 * 名称、读写、必需角色、审批要求、对象状态选择器与补偿动作。
 * Gateway 不接受未注册工具的调用——任何模型自创工具名都被拒。
 */

export interface ToolHandler {
  (input: {
    request: {
      sessionId: string;
      taskId: string;
      traceId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      idempotencyKey?: string;
      claimedAmountMinor?: string;
      claimedObjectId?: string;
      requestedAt: string;
    };
    identity: {
      tenantId: string;
      actorId: string;
      role: string;
      spaceRef: string;
    };
    // 已校验通过的对象状态（descriptor.objectStateSelector 解析后）
    verifiedObjectState?: string;
  }): Promise<Record<string, unknown>>;
}

export interface ToolRegistryEntry {
  descriptor: ToolDescriptor;
  handler: ToolHandler;
}

export interface ToolRegistry {
  register(entry: ToolRegistryEntry): void;
  get(toolName: string): ToolRegistryEntry | undefined;
  list(): readonly ToolRegistryEntry[];
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, ToolRegistryEntry>();

  register(entry: ToolRegistryEntry): void {
    if (this.tools.has(entry.descriptor.name)) {
      throw new Error(`工具已注册：${entry.descriptor.name}`);
    }
    this.tools.set(entry.descriptor.name, entry);
  }

  get(toolName: string): ToolRegistryEntry | undefined {
    const entry = this.tools.get(toolName);
    return entry ? { descriptor: { ...entry.descriptor }, handler: entry.handler } : undefined;
  }

  list(): readonly ToolRegistryEntry[] {
    return [...this.tools.values()].map((entry) => ({
      descriptor: { ...entry.descriptor },
      handler: entry.handler,
    }));
  }
}
