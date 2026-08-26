import { UuidSchema } from '@lequ/contracts';
import {
  ToolInvocationRequestSchema,
  ToolServerIdentitySchema,
  ToolInvocationResultSchema,
  ToolDescriptorSchema,
  ToolApprovalKindSchema,
  type ToolInvocationRequest,
  type ToolInvocationResult,
  type ToolServerIdentity,
  type ToolDescriptor,
  ToolPolicyViolationError,
  ToolNotFoundError,
} from './types.js';
import type { ToolRegistry } from './registry.js';
import type { ToolAuditSink } from './audit.js';
import type { ToolIdempotencyStore } from './idempotency.js';
import { evaluatePolicy, type ObjectStateLookup } from './policy.js';

export interface ToolGatewayDeps {
  registry: ToolRegistry;
  audit: ToolAuditSink;
  idempotency: ToolIdempotencyStore;
  objectState?: ObjectStateLookup;
  gatewayVersion?: string;
}

/**
 * 乐趣宝 Tool Gateway。
 *
 * 所有 Harness/Adapter 的工具调用必经本类。Gateway 不直连业务库：
 * - 写工具的副作用由 descriptor.handler 内部经业务服务（API/事件/Outbox）完成；
 * - 对象状态查询通过 objectStateLookup 异步查（业务服务提供，RLS 隔离）；
 * - 审计只追加，幂等键防止重复副作用，补偿动作由 descriptor 声明。
 *
 * 模型传入的 tenantId/role/金额均不被信任；服务端解析的 identity 覆盖请求身份。
 */
export class ToolGateway {
  private readonly deps: ToolGatewayDeps;
  private readonly gatewayVersion: string;

  constructor(deps: ToolGatewayDeps) {
    this.deps = deps;
    this.gatewayVersion = deps.gatewayVersion ?? '0.1.0';
  }

  async invoke(
    requestInput: ToolInvocationRequest,
    identityInput: ToolServerIdentity,
  ): Promise<ToolInvocationResult> {
    const request = ToolInvocationRequestSchema.parse(requestInput);
    const identity = ToolServerIdentitySchema.parse(identityInput);

    const entry = this.deps.registry.get(request.toolName);
    if (!entry) {
      throw new ToolNotFoundError(request.toolName);
    }
    const descriptor = ToolDescriptorSchema.parse(entry.descriptor);

    // 1. 服务端身份白名单复验：模型只能调它在会话内被授权的工具
    if (!identity.availableTools.includes(descriptor.name)) {
      throw new ToolPolicyViolationError(
        'ROLE_FORBIDDEN',
        `工具 ${descriptor.name} 不在该会话的工具白名单`,
      );
    }

    // 2. 策略层复验租户/角色/对象状态/金额上限/幂等键
    const policyRequest: {
      idempotencyKey?: string;
      claimedAmountMinor?: string;
      claimedObjectId?: string;
      arguments: Record<string, unknown>;
    } = { arguments: request.arguments };
    if (request.idempotencyKey !== undefined) policyRequest.idempotencyKey = request.idempotencyKey;
    if (request.claimedAmountMinor !== undefined)
      policyRequest.claimedAmountMinor = request.claimedAmountMinor;
    if (request.claimedObjectId !== undefined)
      policyRequest.claimedObjectId = request.claimedObjectId;
    const decision = await evaluatePolicy(this.deps, {
      descriptor,
      identity,
      request: policyRequest,
    });
    if (!decision.allowed) {
      throw new ToolPolicyViolationError(decision.code ?? 'POLICY_VIOLATION', decision.message ?? '');
    }

    // 3. 写工具：先看幂等记录，已有则返回 REPLAYED
    if (descriptor.kind === 'WRITE') {
      const existing = await this.deps.idempotency.get(
        request.taskId,
        request.idempotencyKey ?? '',
      );
      if (existing) {
        return ToolInvocationResultSchema.parse({
          toolName: descriptor.name,
          result: existing.result,
          receipt: {
            idempotencyKey: existing.idempotencyKey,
            auditId: existing.auditId,
            status: 'REPLAYED',
          },
          approvalRequested: null,
        });
      }
    }

    // 4. 写工具如要求审批，先返回 approvalRequested；调用方走人工确认后再次调用同一幂等键
    if (descriptor.kind === 'WRITE' && descriptor.approvalKind !== 'NONE') {
      const approvalId = UuidSchema.parse(crypto.randomUUID());
      return ToolInvocationResultSchema.parse({
        toolName: descriptor.name,
        result: {},
        receipt: null,
        approvalRequested: {
          approvalId,
          kind: descriptor.approvalKind,
          summary: `${descriptor.name} 需要人工确认（${descriptor.approvalKind}）`,
          impacts: [descriptor.compensationAction ?? '无补偿动作'],
        },
      });
    }

    // 5. 执行 handler
    const handlerRequest: {
      sessionId: string;
      taskId: string;
      traceId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      idempotencyKey?: string;
      claimedAmountMinor?: string;
      claimedObjectId?: string;
      requestedAt: string;
    } = {
      sessionId: request.sessionId,
      taskId: request.taskId,
      traceId: request.traceId,
      toolName: request.toolName,
      arguments: request.arguments,
      requestedAt: request.requestedAt,
    };
    if (request.idempotencyKey !== undefined) handlerRequest.idempotencyKey = request.idempotencyKey;
    if (request.claimedAmountMinor !== undefined)
      handlerRequest.claimedAmountMinor = request.claimedAmountMinor;
    if (request.claimedObjectId !== undefined)
      handlerRequest.claimedObjectId = request.claimedObjectId;
    const handlerCall: {
      request: typeof handlerRequest;
      identity: { tenantId: string; actorId: string; role: string; spaceRef: string };
      verifiedObjectState?: string;
    } = {
      request: handlerRequest,
      identity: {
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        role: identity.role,
        spaceRef: identity.spaceRef,
      },
    };
    if (decision.verifiedObjectState !== undefined) {
      handlerCall.verifiedObjectState = decision.verifiedObjectState;
    }
    const handlerResult = await entry.handler(handlerCall);

    // 6. 读工具：剥离非白名单字段
    const filteredResult =
      descriptor.kind === 'READ' && descriptor.resultAllowList.length > 0
        ? Object.fromEntries(
            Object.entries(handlerResult).filter(([key]) =>
              descriptor.resultAllowList.includes(key),
            ),
          )
        : handlerResult;

    // 7. 写工具：落审计 + 幂等记录
    let receipt: ToolInvocationResult['receipt'] = null;
    if (descriptor.kind === 'WRITE' && request.idempotencyKey) {
      const audit = await this.deps.audit.append({
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        sessionId: request.sessionId,
        taskId: request.taskId,
        traceId: request.traceId,
        toolName: descriptor.name,
        arguments: request.arguments,
        idempotencyKey: request.idempotencyKey,
        result: filteredResult,
        status: 'ACCEPTED',
        compensationAction: descriptor.compensationAction ?? null,
      });
      const idempotencyRecord = await this.deps.idempotency.record({
        taskId: request.taskId,
        idempotencyKey: request.idempotencyKey,
        status: 'ACCEPTED',
        auditId: audit.auditId,
        result: filteredResult,
      });
      receipt = {
        idempotencyKey: idempotencyRecord.idempotencyKey,
        auditId: idempotencyRecord.auditId,
        status: idempotencyRecord.status === 'REPLAYED' ? 'REPLAYED' : 'ACCEPTED',
      };
    }

    return ToolInvocationResultSchema.parse({
      toolName: descriptor.name,
      result: filteredResult,
      receipt,
      approvalRequested: null,
    });
  }

  /** 写工具补偿：标记幂等记录为 COMPENSATED，审计只追加新行。 */
  async compensate(taskId: string, idempotencyKey: string, reason: string): Promise<void> {
    const audit = await this.deps.audit.find(taskId, idempotencyKey);
    if (!audit) throw new Error(`无审计记录可补偿：${taskId}/${idempotencyKey}`);
    await this.deps.idempotency.markCompensated(taskId, idempotencyKey);
    // 补偿行只追加，原行不删
    await this.deps.audit.append({
      tenantId: audit.tenantId,
      actorId: audit.actorId,
      sessionId: audit.sessionId,
      taskId: audit.taskId,
      traceId: audit.traceId,
      toolName: audit.toolName,
      arguments: { originalAuditId: audit.auditId, reason },
      idempotencyKey: `${idempotencyKey}:compensate`,
      result: {},
      status: 'COMPENSATED',
      compensationAction: audit.compensationAction,
    });
  }

  get version(): string {
    return this.gatewayVersion;
  }
}

// 重新导出避免业务层引用多个文件
export { ToolApprovalKindSchema };
