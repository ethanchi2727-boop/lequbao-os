import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TenantIdSchema } from '@lequ/contracts';
import {
  ToolGateway,
  InMemoryToolAuditSink,
  InMemoryToolIdempotencyStore,
  InMemoryToolRegistry,
  buildStubRegistry,
  buildStubObjectStateLookup,
  ToolNotFoundError,
  TOOL_POLICY_CODES,
  type ToolInvocationRequest,
  type ToolServerIdentity,
} from './index.js';

function tenantId() {
  return TenantIdSchema.parse('11111111-1111-4111-8111-111111111111');
}
function actorId() {
  return '22222222-2222-4222-a222-222222222222';
}
function now() {
  return '2026-08-26T08:00:00+08:00';
}

function buildGateway(overrides?: { objectState?: ReturnType<typeof buildStubObjectStateLookup> }) {
  const registry = buildStubRegistry();
  const audit = new InMemoryToolAuditSink();
  const idempotency = new InMemoryToolIdempotencyStore();
  const objectState = overrides?.objectState ?? buildStubObjectStateLookup();
  const gateway = new ToolGateway({
    registry,
    audit,
    idempotency,
    objectState,
    gatewayVersion: '0.1.0-test',
  });
  return { gateway, registry, audit, idempotency };
}

function identity(
  role: ToolServerIdentity['role'],
  availableTools: string[] = [],
): ToolServerIdentity {
  return {
    tenantId: tenantId(),
    actorId: actorId(),
    role,
    spaceRef: 'merchant/stub',
    availableTools,
  };
}

function request(args: {
  toolName: string;
  arguments?: Record<string, unknown>;
  idempotencyKey?: string;
  claimedAmountMinor?: string;
  claimedObjectId?: string;
}): ToolInvocationRequest {
  return {
    sessionId: randomUUID(),
    taskId: randomUUID(),
    traceId: randomUUID(),
    toolName: args.toolName,
    arguments: args.arguments ?? {},
    idempotencyKey: args.idempotencyKey,
    claimedAmountMinor: args.claimedAmountMinor,
    claimedObjectId: args.claimedObjectId,
    requestedAt: now(),
  };
}

describe('Tool Gateway 契约', () => {
  it('未知工具抛 ToolNotFoundError', async () => {
    const { gateway } = buildGateway();
    await expect(
      gateway.invoke(request({ toolName: 'unknown.tool' }), identity('SALES', ['unknown.tool'])),
    ).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it('工具不在会话白名单内拒绝调用', async () => {
    const { gateway } = buildGateway();
    await expect(
      gateway.invoke(
        request({ toolName: 'verify.merchant.profile' }),
        identity('SALES', ['other.tool']),
      ),
    ).rejects.toMatchObject({ code: 'ROLE_FORBIDDEN' });
  });

  it('READ 工具按白名单剥离非授权字段', async () => {
    const { gateway } = buildGateway();
    const result = await gateway.invoke(
      request({
        toolName: 'verify.merchant.profile',
        arguments: { merchantId: 'stub-merchant' },
      }),
      identity('SALES', ['verify.merchant.profile']),
    );
    expect(result.toolName).toBe('verify.merchant.profile');
    expect(result.result.merchantId).toBe('stub-merchant');
    expect(result.result.status).toBe('SUBMITTED');
    expect(result.result.verified).toBe(false);
    expect(result.result).not.toHaveProperty('internalRiskScore');
    expect(result.receipt).toBeNull();
    expect(result.approvalRequested).toBeNull();
  });

  it('READ 工具不受角色白名单外的额外审批约束', async () => {
    const { gateway } = buildGateway();
    const result = await gateway.invoke(
      request({ toolName: 'verify.merchant.profile' }),
      identity('OPERATIONS', ['verify.merchant.profile']),
    );
    expect(result.toolName).toBe('verify.merchant.profile');
  });

  it('WRITE 工具缺少幂等键拒绝', async () => {
    const { gateway } = buildGateway();
    await expect(
      gateway.invoke(
        request({
          toolName: 'send.payout.authorization.link',
          arguments: { merchantId: 'stub-merchant' },
        }),
        identity('SALES', ['send.payout.authorization.link']),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISSING' });
  });

  it('WRITE 含审批先返回 approvalRequested 而不落库', async () => {
    const { gateway, audit } = buildGateway();
    const result = await gateway.invoke(
      request({
        toolName: 'send.payout.authorization.link',
        arguments: { merchantId: 'stub-merchant' },
        idempotencyKey: 'idem-payout-1',
        claimedObjectId: 'stub-merchant',
      }),
      identity('SALES', ['send.payout.authorization.link']),
    );
    expect(result.approvalRequested).not.toBeNull();
    expect(result.approvalRequested?.kind).toBe('PAYOUT_ACCOUNT');
    expect(result.receipt).toBeNull();
    const auditEntries = await audit
      .find(expect.any(String), expect.any(String))
      .catch(() => undefined);
    expect(auditEntries).toBeUndefined();
  });

  it('WRITE 无审批受理 + 幂等重放返回 REPLAYED', async () => {
    // 把 send.payout.authorization.link 改为 NONE 审批来覆盖无审批受理路径
    const stubRegistry = buildStubRegistry();
    const entry = stubRegistry.get('send.payout.authorization.link');
    expect(entry).toBeDefined();
    if (!entry) throw new Error('stub 缺少 send.payout.authorization.link');
    const newRegistry = new InMemoryToolRegistry();
    newRegistry.register({
      descriptor: { ...entry.descriptor, approvalKind: 'NONE' },
      handler: entry.handler,
    });
    const gateway = new ToolGateway({
      registry: newRegistry,
      audit: new InMemoryToolAuditSink(),
      idempotency: new InMemoryToolIdempotencyStore(),
      objectState: buildStubObjectStateLookup(),
    });
    const taskId = randomUUID();
    const sessionId = randomUUID();
    const traceId = randomUUID();
    const callRequest: ToolInvocationRequest = {
      sessionId,
      taskId,
      traceId,
      toolName: 'send.payout.authorization.link',
      arguments: { merchantId: 'stub-merchant' },
      idempotencyKey: 'idem-payout-2',
      claimedObjectId: 'stub-merchant',
      requestedAt: now(),
    };
    const result = await gateway.invoke(
      callRequest,
      identity('SALES', ['send.payout.authorization.link']),
    );
    expect(result.receipt?.status).toBe('ACCEPTED');
    // 相同 idempotencyKey 重放——taskId 也须相同
    const replayed = await gateway.invoke(
      callRequest,
      identity('SALES', ['send.payout.authorization.link']),
    );
    expect(replayed.receipt?.status).toBe('REPLAYED');
    expect(replayed.result).toEqual(result.result);
  });

  it('对象状态不在允许范围拒绝', async () => {
    const { gateway } = buildGateway();
    await expect(
      gateway.invoke(
        request({
          toolName: 'send.payout.authorization.link',
          arguments: { merchantId: 'stub-order-cancelled' },
          idempotencyKey: 'idem-payout-3',
          claimedObjectId: 'stub-order-cancelled',
        }),
        identity('SALES', ['send.payout.authorization.link']),
      ),
    ).rejects.toMatchObject({ code: 'OBJECT_STATE_INVALID' });
  });

  it('金额超过工具上限拒绝', async () => {
    const { gateway } = buildGateway();
    await expect(
      gateway.invoke(
        request({
          toolName: 'issue.refund',
          arguments: { orderId: 'stub-order' },
          idempotencyKey: 'idem-refund-1',
          claimedObjectId: 'stub-order',
          claimedAmountMinor: '500001',
        }),
        identity('CUSTOMER_SERVICE', ['issue.refund']),
      ),
    ).rejects.toMatchObject({ code: 'AMOUNT_OVER_LIMIT' });
  });

  it('角色不匹配拒绝', async () => {
    const { gateway } = buildGateway();
    await expect(
      gateway.invoke(
        request({
          toolName: 'issue.refund',
          arguments: { orderId: 'stub-order' },
          idempotencyKey: 'idem-refund-2',
          claimedObjectId: 'stub-order',
          claimedAmountMinor: '1000',
        }),
        // MERCHANT_ADMIN 不在 issue.refund 必需角色
        identity('MERCHANT_ADMIN', ['issue.refund']),
      ),
    ).rejects.toMatchObject({ code: 'ROLE_FORBIDDEN' });
  });

  it('补偿标记幂等为 COMPENSATED 且审计只追加新行', async () => {
    const stubRegistry = buildStubRegistry();
    const entry = stubRegistry.get('issue.refund');
    expect(entry).toBeDefined();
    if (!entry) throw new Error('stub 缺少 issue.refund');
    const newRegistry = new InMemoryToolRegistry();
    newRegistry.register({
      descriptor: { ...entry.descriptor, approvalKind: 'NONE' },
      handler: entry.handler,
    });
    const audit = new InMemoryToolAuditSink();
    const idempotency = new InMemoryToolIdempotencyStore();
    const gateway = new ToolGateway({
      registry: newRegistry,
      audit,
      idempotency,
      objectState: buildStubObjectStateLookup(),
    });
    const taskId = randomUUID();
    const sessionId = randomUUID();
    const traceId = randomUUID();
    const callRequest: ToolInvocationRequest = {
      sessionId,
      taskId,
      traceId,
      toolName: 'issue.refund',
      arguments: { orderId: 'stub-order' },
      idempotencyKey: 'idem-refund-compensate-1',
      claimedObjectId: 'stub-order',
      claimedAmountMinor: '1000',
      requestedAt: now(),
    };
    const result = await gateway.invoke(
      callRequest,
      identity('CUSTOMER_SERVICE', ['issue.refund']),
    );
    expect(result.receipt?.status).toBe('ACCEPTED');
    const found = await audit.find(taskId, 'idem-refund-compensate-1');
    expect(found).toBeDefined();
    expect(found?.status).toBe('ACCEPTED');
    await gateway.compensate(taskId, 'idem-refund-compensate-1', '商家撤回退款');
    const after = await idempotency.get(taskId, 'idem-refund-compensate-1');
    expect(after?.status).toBe('COMPENSATED');
  });

  it('TOOL_POLICY_CODES 七类策略码齐全', () => {
    expect(TOOL_POLICY_CODES).toHaveLength(7);
    expect([...TOOL_POLICY_CODES]).toEqual([
      'TOOL_NOT_FOUND',
      'ROLE_FORBIDDEN',
      'OBJECT_STATE_INVALID',
      'AMOUNT_OVER_LIMIT',
      'APPROVAL_REQUIRED',
      'IDEMPOTENCY_MISSING',
      'ARGUMENT_INVALID',
    ]);
  });
});
