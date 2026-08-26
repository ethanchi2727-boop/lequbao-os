import { InMemoryToolRegistry, type ToolRegistryEntry } from './registry.js';

/**
 * 决定性 stub 注册表（测试/开发用，不连真实业务库）。
 *
 * 覆盖 Gateway 关键分支：
 * - READ：只读工具，返回最少必要数据（resultAllowList 剥离其他字段）；
 * - WRITE 无审批：直接受理，幂等重放；
 * - WRITE 含审批：先返回 approvalRequested，调用方人工确认后再次调用。
 *
 * 真实部署在 api 层用业务服务实现 descriptor.handler，本 stub 只用于契约测试。
 */
export function buildStubRegistry(): InMemoryToolRegistry {
  const registry = new InMemoryToolRegistry();

  const verifyMerchantProfile: ToolRegistryEntry = {
    descriptor: {
      name: 'verify.merchant.profile',
      kind: 'READ',
      requiredRoles: ['SALES', 'OPERATIONS'],
      approvalKind: 'NONE',
      resultAllowList: ['merchantId', 'displayName', 'status', 'verified'],
    },
    handler: async (ctx) => ({
      merchantId: ctx.request.arguments.merchantId ?? 'stub-merchant',
      displayName: '拾味小馆',
      status: 'SUBMITTED',
      verified: false,
      // 内部字段：应被 Gateway 剥离
      internalRiskScore: 88,
    }),
  };

  const sendPayoutAuthorizationLink: ToolRegistryEntry = {
    descriptor: {
      name: 'send.payout.authorization.link',
      kind: 'WRITE',
      requiredRoles: ['SALES', 'OPERATIONS'],
      approvalKind: 'PAYOUT_ACCOUNT',
      compensationAction: 'revoke.payout.link',
      resultAllowList: [],
      objectStateSelector: {
        argumentKey: 'merchantId',
        allowedStates: ['SUBMITTED', 'VERIFIED'],
      },
    },
    handler: async (ctx) => ({
      accepted: true,
      merchantId: ctx.request.arguments.merchantId ?? 'stub-merchant',
      sentAt: ctx.request.requestedAt,
    }),
  };

  const issueRefund: ToolRegistryEntry = {
    descriptor: {
      name: 'issue.refund',
      kind: 'WRITE',
      requiredRoles: ['CUSTOMER_SERVICE', 'OPERATIONS'],
      approvalKind: 'REFUND_RULE',
      maxAmountMinor: '500000', // 5000 元上限
      compensationAction: 'reverse.refund',
      resultAllowList: [],
      objectStateSelector: {
        argumentKey: 'orderId',
        allowedStates: ['PAID', 'PARTIAL_REFUND'],
      },
    },
    handler: async (ctx) => ({
      accepted: true,
      orderId: ctx.request.arguments.orderId ?? 'stub-order',
      refundAmountMinor: ctx.request.claimedAmountMinor ?? '0',
    }),
  };

  registry.register(verifyMerchantProfile);
  registry.register(sendPayoutAuthorizationLink);
  registry.register(issueRefund);

  return registry;
}

/**
 * 内存对象状态查询（stub）：按 merchantId/orderId 返回 fixture 状态。
 * 真实部署由业务服务提供 RLS 隔离的对象状态查询。
 */
export function buildStubObjectStateLookup() {
  const states = new Map<string, string>([
    ['stub-merchant', 'SUBMITTED'],
    ['stub-merchant-verified', 'VERIFIED'],
    ['stub-order', 'PAID'],
    ['stub-order-cancelled', 'CANCELLED'],
    ['stub-order-partial', 'PARTIAL_REFUND'],
  ]);
  return {
    async lookup(objectId: string): Promise<string | undefined> {
      return states.get(objectId);
    },
  };
}
