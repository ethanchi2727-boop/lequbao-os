import type { ToolDescriptor } from './types.js';

/**
 * 服务端身份与对象状态策略。
 *
 * Gateway 入口必经策略层：
 * - 不信任模型传入的 tenantId/role——以服务端解析的 identity 为准；
 * - 必要时按 descriptor.objectStateSelector 异步查对象状态（业务服务提供，
 *   网关不直连业务库）；
 * - 金额上限、补偿动作等由 descriptor 声明，策略只做对比。
 *
 * 真实实现可对接业务服务或 RLS 查询；此处提供接口与本地默认策略。
 */

export interface ObjectStateLookup {
  // 按对象 ID 返回当前状态（业务服务提供，不直连业务库）
  lookup(objectId: string): Promise<string | undefined>;
}

export interface ToolPolicyDeps {
  objectState?: ObjectStateLookup;
}

export interface PolicyContext {
  descriptor: ToolDescriptor;
  identity: {
    tenantId: string;
    actorId: string;
    role: string;
    spaceRef: string;
  };
  request: {
    idempotencyKey?: string;
    claimedAmountMinor?: string;
    claimedObjectId?: string;
    arguments: Record<string, unknown>;
  };
}

export interface PolicyDecision {
  allowed: boolean;
  code?: string;
  message?: string;
  verifiedObjectState?: string;
}

export async function evaluatePolicy(
  deps: ToolPolicyDeps,
  ctx: PolicyContext,
): Promise<PolicyDecision> {
  const { descriptor, identity, request } = ctx;
  let verifiedObjectState: string | undefined;

  // 1. 角色复验（服务端身份为准）
  if (!descriptor.requiredRoles.includes(identity.role as never)) {
    return {
      allowed: false,
      code: 'ROLE_FORBIDDEN',
      message: `角色 ${identity.role} 不允许调用 ${descriptor.name}`,
    };
  }

  // 2. 写工具必有幂等键
  if (descriptor.kind === 'WRITE') {
    if (!request.idempotencyKey) {
      return {
        allowed: false,
        code: 'IDEMPOTENCY_MISSING',
        message: `写工具 ${descriptor.name} 必须提供幂等键`,
      };
    }
  }

  // 3. 对象状态复验（如配置 selector）——校验通过后继续后续检查，不提前 return
  if (descriptor.objectStateSelector && request.claimedObjectId && deps.objectState) {
    const state = await deps.objectState.lookup(request.claimedObjectId);
    if (state === undefined) {
      return {
        allowed: false,
        code: 'OBJECT_STATE_INVALID',
        message: `对象 ${request.claimedObjectId} 不存在或当前用户无权访问`,
      };
    }
    if (!descriptor.objectStateSelector.allowedStates.includes(state)) {
      return {
        allowed: false,
        code: 'OBJECT_STATE_INVALID',
        message: `对象状态 ${state} 不在允许范围 ${descriptor.objectStateSelector.allowedStates.join(', ')}`,
      };
    }
    verifiedObjectState = state;
  }

  // 4. 金额上限复验
  if (descriptor.maxAmountMinor && request.claimedAmountMinor) {
    if (BigInt(request.claimedAmountMinor) > BigInt(descriptor.maxAmountMinor)) {
      return {
        allowed: false,
        code: 'AMOUNT_OVER_LIMIT',
        message: `金额 ${request.claimedAmountMinor} 超过工具上限 ${descriptor.maxAmountMinor}`,
      };
    }
  }

  // 5. 写工具审批要求——网关不替业务服务拍板；仅返回 approvalRequested 由调用方触发人工流程
  const decision: PolicyDecision = { allowed: true };
  if (verifiedObjectState !== undefined) decision.verifiedObjectState = verifiedObjectState;
  return decision;
}
