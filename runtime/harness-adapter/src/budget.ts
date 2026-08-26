import { z } from 'zod';
import { MinorCurrencyAmountSchema, UuidSchema } from '@lequ/contracts';
import {
  HarnessTaskIdSchema,
  HarnessBudgetSettlementSchema,
  type HarnessBudgetSettlement,
} from './types.js';

/**
 * 预算与失败策略。
 *
 * 每次 run 写入预估预算；调用前预占额度，完成后按实际结算，失败后返还
 * 可返部分（不可返部分记为已耗）。模型/插件超时采用有限重试，超过次数进入异常中心。
 */

const _BudgetLedgerEntrySchema = z.object({
  taskId: HarnessTaskIdSchema,
  tenantId: UuidSchema,
  preAuthorizedMinor: MinorCurrencyAmountSchema,
  actualCostMinor: MinorCurrencyAmountSchema.nullable(),
  refundedMinor: MinorCurrencyAmountSchema.nullable(),
  status: z.enum(['PRE_AUTHORIZED', 'SETTLED', 'REFUNDED']),
  settledAt: z.string().nullable(),
});
type BudgetLedgerEntry = z.infer<typeof _BudgetLedgerEntrySchema>;

export interface HarnessBudgetLedger {
  /** 预占额度（调用前）。 */
  preAuthorize(input: {
    taskId: string;
    tenantId: string;
    preAuthorizedMinor: string;
  }): Promise<void>;
  /** 结算（完成后按实际成本）。 */
  settle(input: {
    taskId: string;
    actualCostMinor: string;
    refundedMinor: string;
  }): Promise<HarnessBudgetSettlement>;
  /** 读取结算记录（审计）。 */
  get(taskId: string): Promise<BudgetLedgerEntry | undefined>;
}

export class InMemoryHarnessBudgetLedger implements HarnessBudgetLedger {
  private readonly entries = new Map<string, BudgetLedgerEntry>();

  async preAuthorize(input: {
    taskId: string;
    tenantId: string;
    preAuthorizedMinor: string;
  }): Promise<void> {
    const taskId = HarnessTaskIdSchema.parse(input.taskId);
    if (this.entries.has(taskId)) {
      throw new Error(`预算已存在：${taskId}，不可重复预占`);
    }
    const entry: BudgetLedgerEntry = {
      taskId,
      tenantId: UuidSchema.parse(input.tenantId),
      preAuthorizedMinor: MinorCurrencyAmountSchema.parse(input.preAuthorizedMinor),
      actualCostMinor: null,
      refundedMinor: null,
      status: 'PRE_AUTHORIZED',
      settledAt: null,
    };
    this.entries.set(taskId, entry);
  }

  async settle(input: {
    taskId: string;
    actualCostMinor: string;
    refundedMinor: string;
  }): Promise<HarnessBudgetSettlement> {
    const taskId = HarnessTaskIdSchema.parse(input.taskId);
    const entry = this.entries.get(taskId);
    if (!entry) throw new Error(`未知预算任务：${taskId}`);
    if (entry.status === 'SETTLED' || entry.status === 'REFUNDED') {
      throw new Error(`预算已结算：${taskId}（${entry.status}）`);
    }
    const actualCostMinor = MinorCurrencyAmountSchema.parse(input.actualCostMinor);
    const refundedMinor = MinorCurrencyAmountSchema.parse(input.refundedMinor);
    // 实际成本不得超过预占；返还不得超过预占与实际之差
    if (BigInt(actualCostMinor) > BigInt(entry.preAuthorizedMinor)) {
      throw new Error(`实际成本 ${actualCostMinor} 超过预占 ${entry.preAuthorizedMinor}`);
    }
    const maxRefund = BigInt(entry.preAuthorizedMinor) - BigInt(actualCostMinor);
    if (BigInt(refundedMinor) > maxRefund) {
      throw new Error(`返还 ${refundedMinor} 超过可返 ${maxRefund}`);
    }
    const settledAt = new Date().toISOString();
    // REFUNDED 仅当实际有返还（refunded > 0）；无返还的零成本结算仍为 SETTLED。
    const status: BudgetLedgerEntry['status'] = BigInt(refundedMinor) > 0n ? 'REFUNDED' : 'SETTLED';
    const settled: BudgetLedgerEntry = {
      ...entry,
      actualCostMinor,
      refundedMinor,
      status,
      settledAt,
    };
    this.entries.set(taskId, settled);
    return HarnessBudgetSettlementSchema.parse({
      taskId,
      preAuthorizedMinor: entry.preAuthorizedMinor,
      actualCostMinor,
      refundedMinor,
      settledAt,
    });
  }

  async get(taskId: string): Promise<BudgetLedgerEntry | undefined> {
    const parsed = HarnessTaskIdSchema.parse(taskId);
    const entry = this.entries.get(parsed);
    return entry ? { ...entry } : undefined;
  }
}

/** 有限重试策略：超时采用有限重试，超过次数进入异常中心。 */
export interface HarnessRetryPolicy {
  readonly maxAttempts: number;
  /** 是否可重试（指数退避由调用方实现，此处只判策略）。 */
  isRetryable(errorKind: string, attempt: number): boolean;
}

export class DefaultHarnessRetryPolicy implements HarnessRetryPolicy {
  readonly maxAttempts: number;
  private readonly retryableKinds: ReadonlySet<string>;
  constructor(
    maxAttempts = 3,
    retryableKinds = ['TIMEOUT', 'RATE_LIMITED', 'BACKEND_UNAVAILABLE'],
  ) {
    this.maxAttempts = maxAttempts;
    this.retryableKinds = new Set(retryableKinds);
  }
  isRetryable(errorKind: string, attempt: number): boolean {
    return attempt < this.maxAttempts && this.retryableKinds.has(errorKind);
  }
}
