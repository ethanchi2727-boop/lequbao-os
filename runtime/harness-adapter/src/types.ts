import { z } from 'zod';
import { TenantIdSchema, UuidSchema, MinorCurrencyAmountSchema } from '@lequ/contracts';

/**
 * Harness Adapter 稳定接口类型。
 *
 * 上游 DeepSeek Harness 升级、替换或回滚时，本文件定义的会话 ID、任务 ID、
 * 事件语义、成果格式和审计记录不得改变。乐趣宝业务层只依赖本文件，不依赖
 * 上游内部类、数据库或插件实现。
 */

export const HarnessSchemaVersionSchema = z.literal(1);
export type HarnessSchemaVersion = z.infer<typeof HarnessSchemaVersionSchema>;

export const HarnessActorIdSchema = UuidSchema;
export const HarnessSessionIdSchema = UuidSchema;
export const HarnessTaskIdSchema = UuidSchema;
export const HarnessTraceIdSchema = UuidSchema;

export const HarnessRoleSchema = z.enum([
  'SALES',
  'OPERATIONS',
  'CUSTOMER_SERVICE',
  'MERCHANT_ADMIN',
  'PLATFORM_ADMIN',
]);
export type HarnessRole = z.infer<typeof HarnessRoleSchema>;

export const HarnessExecutionModeSchema = z.enum([
  'AUTO', // AI 自动执行可回滚项
  'ASSIST', // AI 起草，人工确认后落库
  'CONFIRM', // 仅出确认单，不执行
]);
export type HarnessExecutionMode = z.infer<typeof HarnessExecutionModeSchema>;

export const HarnessModelStrategySchema = z.object({
  routingKey: z.string().min(1).max(120),
  // 多模态视觉模型路由（0.1.1-rc.1 引入，如 DeepSeek-V4-Flash-Vision-Exp）
  visionEnabled: z.boolean().default(false),
  maxTokens: z.int().positive().max(2_000_000),
  temperatureCenti: z.int().min(0).max(200).default(100),
});
export type HarnessModelStrategy = z.infer<typeof HarnessModelStrategySchema>;

export const HarnessBudgetSchema = z.object({
  // 预估 token 上限，按整数 minor 货币单位计价（与订单/退款同口径）
  estimatedMaxCostMinor: MinorCurrencyAmountSchema,
  // 预占额度（调用前锁定，完成后结算，失败后返还可返部分）
  preAuthorizedMinor: MinorCurrencyAmountSchema,
});
export type HarnessBudget = z.infer<typeof HarnessBudgetSchema>;

export const HarnessAttachmentSchema = z.object({
  kind: z.enum(['text', 'image', 'file', 'audio']),
  mediaType: z.string().min(1).max(255),
  // Files API 上传后的对象键或内联 data URL；image 经自动缩放/格式转换后落盘
  objectKey: z.string().min(1).max(1024).optional(),
  // 内联文本或 data URL（小附件）
  inline: z.string().max(8_000_000).optional(),
  fileName: z.string().max(255).optional(),
});
export type HarnessAttachment = z.infer<typeof HarnessAttachmentSchema>;

export const HarnessCreateSessionInputSchema = z.object({
  tenantId: TenantIdSchema,
  actorId: HarnessActorIdSchema,
  role: HarnessRoleSchema,
  // 工作空间（如某商户的经营中心）
  spaceRef: z.string().min(1).max(255),
  modelStrategy: HarnessModelStrategySchema,
  budget: HarnessBudgetSchema,
  // 可用工具清单（实际调用必先进 Tool Gateway 复验）
  availableTools: z.array(z.string().min(1).max(120)).default([]),
});
export type HarnessCreateSessionInput = z.infer<typeof HarnessCreateSessionInputSchema>;

export const HarnessCreateSessionResultSchema = z.object({
  sessionId: HarnessSessionIdSchema,
  // 上游 Harness 运行 ID（仅审计与 health 用，业务层不依赖）
  harnessRunId: z.string().min(1).max(255),
  createdAt: z.iso.datetime({ offset: true }),
});
export type HarnessCreateSessionResult = z.infer<typeof HarnessCreateSessionResultSchema>;

export const HarnessRunInputSchema = z.object({
  sessionId: HarnessSessionIdSchema,
  message: z.string().min(1).max(200_000),
  attachments: z.array(HarnessAttachmentSchema).default([]),
  executionMode: HarnessExecutionModeSchema,
  idempotencyKey: z.string().min(1).max(255),
  traceId: HarnessTraceIdSchema,
});
export type HarnessRunInput = z.infer<typeof HarnessRunInputSchema>;

export const HarnessRunResultSchema = z.object({
  taskId: HarnessTaskIdSchema,
  // 已重放的事件序号上界（subscribe 从此点续传）
  lastSequence: z.int().nonnegative(),
});
export type HarnessRunResult = z.infer<typeof HarnessRunResultSchema>;

export const HarnessResumeInputSchema = z.object({
  taskId: HarnessTaskIdSchema,
  checkpoint: z.record(z.string(), z.unknown()),
  // 补充资料或人工确认（approval.resolved）
  supplements: z.array(HarnessAttachmentSchema).default([]),
  idempotencyKey: z.string().min(1).max(255),
  traceId: HarnessTraceIdSchema,
});
export type HarnessResumeInput = z.infer<typeof HarnessResumeInputSchema>;

export const HarnessCancelInputSchema = z.object({
  taskId: HarnessTaskIdSchema,
  reason: z.string().min(1).max(255),
  operatorId: HarnessActorIdSchema,
});
export type HarnessCancelInput = z.infer<typeof HarnessCancelInputSchema>;

export const HarnessCancelResultSchema = z.object({
  taskId: HarnessTaskIdSchema,
  status: z.enum(['CANCELLED', 'NOT_CANCELLABLE']),
  detail: z.string().max(255),
});
export type HarnessCancelResult = z.infer<typeof HarnessCancelResultSchema>;

export const HarnessSubscribeInputSchema = z
  .object({
    sessionId: HarnessSessionIdSchema.optional(),
    taskId: HarnessTaskIdSchema.optional(),
    lastSequence: z.int().nonnegative().default(0),
  })
  .refine((value) => value.sessionId !== undefined || value.taskId !== undefined, {
    message: 'subscribe 需要 sessionId 或 taskId 之一',
  });
export type HarnessSubscribeInput = z.infer<typeof HarnessSubscribeInputSchema>;

export const HarnessHealthResultSchema = z.object({
  adapterVersion: z.string().min(1).max(40),
  harnessCommit: z.string().min(7).max(64),
  status: z.enum(['OK', 'DEGRADED', 'UNAVAILABLE']),
  queuedTasks: z.int().nonnegative(),
  plugins: z.array(z.object({ name: z.string().min(1).max(120), healthy: z.boolean() })),
  modelRoutingVersion: z.string().min(1).max(40),
  dependencies: z.array(
    z.object({
      name: z.string().min(1).max(120),
      healthy: z.boolean(),
      detail: z.string().max(255),
    }),
  ),
});
export type HarnessHealthResult = z.infer<typeof HarnessHealthResultSchema>;

export const HarnessBudgetSettlementSchema = z.object({
  taskId: HarnessTaskIdSchema,
  preAuthorizedMinor: MinorCurrencyAmountSchema,
  actualCostMinor: MinorCurrencyAmountSchema,
  // 失败后返还的可返部分（不可返部分记为已耗）
  refundedMinor: MinorCurrencyAmountSchema,
  settledAt: z.iso.datetime({ offset: true }),
});
export type HarnessBudgetSettlement = z.infer<typeof HarnessBudgetSettlementSchema>;
