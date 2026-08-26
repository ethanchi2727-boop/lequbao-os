import { HarnessTaskIdSchema } from './types.js';

/**
 * 长任务检查点持久化。
 *
 * 上游在安全点写入检查点；resume 时从最近检查点继续。Adapter 不可用时，
 * 普通业务后台、支付、核销和人工客服仍可运行——已落盘的检查点不丢。
 */

export interface HarnessCheckpoint {
  taskId: string;
  sequence: number;
  // 上游恢复所需的最小状态（不包含业务库连接）
  state: Record<string, unknown>;
  savedAt: string;
}

export interface HarnessCheckpointStore {
  save(checkpoint: HarnessCheckpoint): Promise<void>;
  load(taskId: string): Promise<HarnessCheckpoint | undefined>;
  listAfter(taskId: string, afterSequence: number): Promise<HarnessCheckpoint[]>;
}

export class InMemoryHarnessCheckpointStore implements HarnessCheckpointStore {
  private readonly store = new Map<string, HarnessCheckpoint[]>();

  async save(checkpoint: HarnessCheckpoint): Promise<void> {
    const taskId = HarnessTaskIdSchema.parse(checkpoint.taskId);
    const list = this.store.get(taskId) ?? [];
    const last = list.at(-1);
    if (last && checkpoint.sequence <= last.sequence) {
      throw new Error(`检查点序号倒退：${checkpoint.sequence} <= ${last.sequence}`);
    }
    list.push({ ...checkpoint, taskId });
    this.store.set(taskId, list);
  }

  async load(taskId: string): Promise<HarnessCheckpoint | undefined> {
    const parsed = HarnessTaskIdSchema.parse(taskId);
    const list = this.store.get(parsed);
    const last = list?.at(-1);
    return last ? { ...last } : undefined;
  }

  async listAfter(taskId: string, afterSequence: number): Promise<HarnessCheckpoint[]> {
    const parsed = HarnessTaskIdSchema.parse(taskId);
    const list = this.store.get(parsed) ?? [];
    return list.filter((entry) => entry.sequence > afterSequence).map((entry) => ({ ...entry }));
  }
}
