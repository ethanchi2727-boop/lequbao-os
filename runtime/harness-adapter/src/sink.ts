import { HarnessEventEnvelopeSchema, type HarnessEventEnvelope, type HarnessEventSink } from './events.js';

/**
 * 内存事件 sink（测试/开发与单进程运行用）。
 *
 * 事件按 sessionId 分组单调递增 sequence；replay 从 afterSequence 之后按序重放，
 * 支持断线续传。生产部署应替换为 PostgreSQL 支持的事件存储，保证跨进程一致。
 */
export class InMemoryHarnessEventSink implements HarnessEventSink {
  private readonly events: HarnessEventEnvelope[] = [];

  async append(
    input: Omit<HarnessEventEnvelope, 'sequence' | 'occurredAt'> & { occurredAt?: string },
  ): Promise<HarnessEventEnvelope> {
    const sequence = this.nextSequence(input.sessionId as string);
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const envelope: HarnessEventEnvelope = {
      ...(input as Omit<HarnessEventEnvelope, 'sequence' | 'occurredAt'>),
      sequence,
      occurredAt,
    } as HarnessEventEnvelope;
    const parsed = HarnessEventEnvelopeSchema.parse(envelope);
    this.events.push(parsed);
    return parsed;
  }

  async *replay(input: {
    sessionId?: string;
    taskId?: string;
    afterSequence: number;
  }): AsyncIterable<HarnessEventEnvelope> {
    for (const event of this.events) {
      if (event.sequence <= input.afterSequence) continue;
      if (input.sessionId !== undefined && event.sessionId !== input.sessionId) continue;
      if (input.taskId !== undefined && event.taskId !== input.taskId) continue;
      yield event;
    }
  }

  private nextSequence(sessionId: string): number {
    let max = 0;
    for (const event of this.events) {
      if (event.sessionId === sessionId && event.sequence > max) max = event.sequence;
    }
    return max + 1;
  }
}
