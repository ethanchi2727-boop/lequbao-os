import { z } from 'zod';
import { UuidSchema, TenantIdSchema } from '@lequ/contracts';
import { ToolActorIdSchema, ToolSessionIdSchema, ToolTaskIdSchema, ToolTraceIdSchema } from './types.js';

/**
 * 写工具审计 sink。
 *
 * 每次写工具调用必落审计，包含租户、操作人、工具、参数、幂等键、结果状态、补偿动作。
 * 审计行只追加不修改——补偿只更新 status，不删除原行。
 *
 * 生产部署应替换为 PostgreSQL 不可变审计表（CREATE TRIGGER ... immutable），
 * 跨进程一致；此处内存实现仅用于契约测试与开发。
 */

export const ToolAuditEntrySchema = z.object({
  auditId: UuidSchema,
  tenantId: TenantIdSchema,
  actorId: ToolActorIdSchema,
  sessionId: ToolSessionIdSchema,
  taskId: ToolTaskIdSchema,
  traceId: ToolTraceIdSchema,
  toolName: z.string().min(1).max(120),
  arguments: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1).max(255),
  result: z.record(z.string(), z.unknown()),
  status: z.enum(['ACCEPTED', 'REPLAYED', 'COMPENSATED']),
  compensationAction: z.string().min(1).max(120).nullable(),
  recordedAt: z.iso.datetime({ offset: true }),
});
export type ToolAuditEntry = z.infer<typeof ToolAuditEntrySchema>;

export interface ToolAuditSink {
  append(input: Omit<ToolAuditEntry, 'auditId' | 'recordedAt'>): Promise<ToolAuditEntry>;
  // 按 idempotencyKey 查（补偿或重放用）
  find(taskId: string, idempotencyKey: string): Promise<ToolAuditEntry | undefined>;
}

export class InMemoryToolAuditSink implements ToolAuditSink {
  private readonly entries: ToolAuditEntry[] = [];

  async append(input: Omit<ToolAuditEntry, 'auditId' | 'recordedAt'>): Promise<ToolAuditEntry> {
    const auditId = UuidSchema.parse(crypto.randomUUID());
    const entry: ToolAuditEntry = ToolAuditEntrySchema.parse({
      ...input,
      auditId,
      recordedAt: new Date().toISOString(),
    });
    this.entries.push(entry);
    return entry;
  }

  async find(taskId: string, idempotencyKey: string): Promise<ToolAuditEntry | undefined> {
    const entry = this.entries.find(
      (item) => item.taskId === taskId && item.idempotencyKey === idempotencyKey,
    );
    return entry ? { ...entry } : undefined;
  }
}
