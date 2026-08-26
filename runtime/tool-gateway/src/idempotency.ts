import { ToolIdempotencyKeySchema, ToolTaskIdSchema } from './types.js';

/**
 * 写工具幂等键存储。
 *
 * 相同 (taskId, idempotencyKey) 重放返回同一凭证，避免模型重复发起副作用。
 * 生产部署应替换为 PostgreSQL 行锁或 Redis 短锁，避免跨进程重复。
 */

export interface ToolIdempotencyRecord {
  taskId: string;
  idempotencyKey: string;
  // ACCEPTED：首次受理；REPLAYED：重放返回；COMPENSATED：已补偿
  status: 'ACCEPTED' | 'REPLAYED' | 'COMPENSATED';
  auditId: string;
  result: Record<string, unknown>;
  recordedAt: string;
}

export interface ToolIdempotencyStore {
  // 已存在则返回旧记录，调用方按 status=REPLAYED 复用
  record(input: Omit<ToolIdempotencyRecord, 'recordedAt'>): Promise<ToolIdempotencyRecord>;
  get(taskId: string, idempotencyKey: string): Promise<ToolIdempotencyRecord | undefined>;
  markCompensated(taskId: string, idempotencyKey: string): Promise<void>;
}

export class InMemoryToolIdempotencyStore implements ToolIdempotencyStore {
  private readonly records = new Map<string, ToolIdempotencyRecord>();

  async record(input: Omit<ToolIdempotencyRecord, 'recordedAt'>): Promise<ToolIdempotencyRecord> {
    const taskId = ToolTaskIdSchema.parse(input.taskId);
    const idempotencyKey = ToolIdempotencyKeySchema.parse(input.idempotencyKey);
    const key = this.key(taskId, idempotencyKey);
    const existing = this.records.get(key);
    if (existing) return { ...existing, status: 'REPLAYED' };
    const record: ToolIdempotencyRecord = {
      ...input,
      taskId,
      idempotencyKey,
      status: 'ACCEPTED',
      recordedAt: new Date().toISOString(),
    };
    this.records.set(key, record);
    return record;
  }

  async get(taskId: string, idempotencyKey: string): Promise<ToolIdempotencyRecord | undefined> {
    const parsedTask = ToolTaskIdSchema.parse(taskId);
    const parsedKey = ToolIdempotencyKeySchema.parse(idempotencyKey);
    const record = this.records.get(this.key(parsedTask, parsedKey));
    return record ? { ...record } : undefined;
  }

  async markCompensated(taskId: string, idempotencyKey: string): Promise<void> {
    const parsedTask = ToolTaskIdSchema.parse(taskId);
    const parsedKey = ToolIdempotencyKeySchema.parse(idempotencyKey);
    const record = this.records.get(this.key(parsedTask, parsedKey));
    if (!record) throw new Error(`无幂等记录可补偿：${taskId}/${idempotencyKey}`);
    this.records.set(this.key(parsedTask, parsedKey), { ...record, status: 'COMPENSATED' });
  }

  private key(taskId: string, idempotencyKey: string): string {
    return `${taskId}:${idempotencyKey}`;
  }
}
