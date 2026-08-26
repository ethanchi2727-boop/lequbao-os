import { z } from 'zod';
import { TenantIdSchema, UuidSchema, MinorCurrencyAmountSchema } from '@lequ/contracts';

/**
 * Tool Gateway 稳定接口类型。
 *
 * Harness 和模型不能直连生产数据库：所有工具调用先进入本网关。
 * 本网关按服务端身份重新检查租户、角色、对象状态、金额、套餐和审批，
 * 不信任模型传入的 tenantId/role/金额——一切以服务端解析的身份与策略为准。
 *
 * 读工具返回最少必要数据；写工具必须有幂等键、确认、审计和补偿。
 */

export const ToolGatewaySchemaVersionSchema = z.literal(1);
export type ToolGatewaySchemaVersion = z.infer<typeof ToolGatewaySchemaVersionSchema>;

export const ToolActorIdSchema = UuidSchema;
export const ToolSessionIdSchema = UuidSchema;
export const ToolTaskIdSchema = UuidSchema;
export const ToolTraceIdSchema = UuidSchema;
export const ToolIdempotencyKeySchema = z.string().min(1).max(255);

export const ToolRoleSchema = z.enum([
  'SALES',
  'OPERATIONS',
  'CUSTOMER_SERVICE',
  'MERCHANT_ADMIN',
  'PLATFORM_ADMIN',
]);
export type ToolRole = z.infer<typeof ToolRoleSchema>;

export const ToolKindSchema = z.enum([
  'READ', // 只读：返回最少必要数据；无幂等键、无审计副作用
  'WRITE', // 写：幂等键 + 审计 + 补偿；变更业务库必经业务服务
]);
export type ToolKind = z.infer<typeof ToolKindSchema>;

export const ToolApprovalKindSchema = z.enum([
  'NONE',
  'PAYOUT_ACCOUNT',
  'PRICE_CHANGE',
  'REFUND_RULE',
  'LEGAL_ENTITY',
  'PERMISSION_GRANT',
  'PRODUCTION_PUBLISH',
]);
export type ToolApprovalKind = z.infer<typeof ToolApprovalKindSchema>;

/**
 * 服务端解析的身份（不信任模型传入）。Gateway 在入口用此身份覆盖模型传入值。
 */
export const ToolServerIdentitySchema = z.object({
  tenantId: TenantIdSchema,
  actorId: ToolActorIdSchema,
  role: ToolRoleSchema,
  // 工作空间（如某商户的经营中心），由服务端按 actor 解析
  spaceRef: z.string().min(1).max(255),
  // 模型/Adapter 在该会话内可用的工具白名单（再与 descriptor.requiredRoles 取交集）
  availableTools: z.array(z.string().min(1).max(120)).default([]),
});
export type ToolServerIdentity = z.infer<typeof ToolServerIdentitySchema>;

export const ToolInvocationRequestSchema = z.object({
  sessionId: ToolSessionIdSchema,
  taskId: ToolTaskIdSchema,
  traceId: ToolTraceIdSchema,
  toolName: z.string().min(1).max(120),
  // 模型传入的参数（不可信）；Gateway 与 descriptor 一起重新解析
  arguments: z.record(z.string(), z.unknown()).default({}),
  // 写工具必填幂等键；读工具忽略
  idempotencyKey: ToolIdempotencyKeySchema.optional(),
  // 模型可能传入它认为的金额；Gateway 不信任，仅作为策略输入
  claimedAmountMinor: MinorCurrencyAmountSchema.optional(),
  // 模型可能传入它认为的对象 ID；Gateway 必经 descriptor.objectStateSelector 复验
  claimedObjectId: z.string().min(1).max(255).optional(),
  requestedAt: z.iso.datetime({ offset: true }),
});
export type ToolInvocationRequest = z.infer<typeof ToolInvocationRequestSchema>;

export const ToolInvocationResultSchema = z.object({
  toolName: z.string().min(1).max(120),
  // 读：返回最少必要数据；写：返回受理凭证（不返回业务库内部行）
  result: z.record(z.string(), z.unknown()),
  // 写工具的幂等凭证：相同 idempotencyKey 重放返回同一凭证
  receipt: z
    .object({
      idempotencyKey: ToolIdempotencyKeySchema,
      auditId: UuidSchema,
      status: z.enum(['ACCEPTED', 'REPLAYED', 'COMPENSATED']),
    })
    .nullable(),
  // 审批要求：写工具可能要求人工确认后才落库
  approvalRequested: z
    .object({
      approvalId: UuidSchema,
      kind: ToolApprovalKindSchema,
      summary: z.string().min(1).max(255),
      impacts: z.array(z.string().min(1).max(120)),
    })
    .nullable(),
});
export type ToolInvocationResult = z.infer<typeof ToolInvocationResultSchema>;

export const ToolDescriptorSchema = z.object({
  name: z.string().min(1).max(120),
  kind: ToolKindSchema,
  // 服务端身份必须满足其一即可调用
  requiredRoles: z.array(ToolRoleSchema).min(1),
  // 写工具的审批要求；读工具固定 NONE
  approvalKind: ToolApprovalKindSchema.default('NONE'),
  // 模型可声明金额上限（用于退款/赔偿/改价/发券），策略层再按对象状态判断
  maxAmountMinor: MinorCurrencyAmountSchema.optional(),
  // 对象状态选择器：写工具按 arguments 中的某个字段读取对象状态，再与策略对比
  objectStateSelector: z
    .object({
      argumentKey: z.string().min(1).max(120),
      allowedStates: z.array(z.string().min(1).max(80)),
    })
    .optional(),
  // 补偿动作名（写工具失败后回滚）；不配置表示无补偿
  compensationAction: z.string().min(1).max(120).optional(),
  // 返回字段白名单：读工具只能返回这些字段，超出部分由网关剥离
  resultAllowList: z.array(z.string().min(1).max(120)).default([]),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export class ToolPolicyViolationError extends Error {
  override readonly name = 'ToolPolicyViolationError';
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class ToolNotFoundError extends Error {
  override readonly name = 'ToolNotFoundError';
  constructor(toolName: string) {
    super(`未知工具：${toolName}`);
  }
}

export const TOOL_POLICY_CODES = [
  'TOOL_NOT_FOUND',
  'ROLE_FORBIDDEN',
  'OBJECT_STATE_INVALID',
  'AMOUNT_OVER_LIMIT',
  'APPROVAL_REQUIRED',
  'IDEMPOTENCY_MISSING',
  'ARGUMENT_INVALID',
] as const;
export type ToolPolicyCode = (typeof TOOL_POLICY_CODES)[number];
