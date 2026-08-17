export const systemRoles = [
  'HQ_SUPER_ADMIN',
  'HQ_OPERATOR',
  'AI_POLICY_ADMIN',
  'CITY_PROVIDER_ADMIN',
  'CITY_MANAGER',
  'CITY_SALES',
  'CITY_DELIVERY',
  'MERCHANT_OWNER',
  'STORE_MANAGER',
  'STORE_CLERK',
  'FINANCE',
  'CONSUMER',
] as const

export type SystemRole = (typeof systemRoles)[number]

export const permissions = [
  'platform.configure',
  'tenant.read',
  'organization.manage',
  'identity.manage',
  'role.manage',
  'merchant.read',
  'merchant.write',
  'merchant.approve',
  'lead.read',
  'lead.write',
  'lead.assign',
  'lead.transfer',
  'sales.performance.read',
  'sales.target.manage',
  'sales.commission.settle',
  'sales.team.read',
  'sales.team.manage',
  'sales.team.level.approve',
  'sales.copilot.use',
  'contract.read',
  'contract.create',
  'contract.discount.approve',
  'delivery.workorder.read',
  'delivery.workorder.manage',
  'delivery.workorder.confirm',
  'delivery.sla.read',
  'delivery.sla.acknowledge',
  'delivery.sla.manage',
  'delivery.sla.scan',
  'delivery.renewal.read',
  'delivery.renewal.manage',
  'delivery.renewal.scan',
  'provider.metrics.read',
  'provider.settlement.read',
  'provider.settlement.manage',
  'provider.settlement.approve',
  'provider.settlement.settle',
  'consumer.home.read',
  'consumer.context.manage',
  'consumer.message.read',
  'consumer.message.manage',
  'consumer.search',
  'consumer.nearby.read',
  'consumer.store.read',
  'consumer.deal.manage',
  'consumer.assistant.read',
  'consumer.assistant.manage',
  'consumer.voice.manage',
  'consumer.image.manage',
  'consumer.reservation.confirm',
  'consumer.reservation.manage',
  'consumer.payment.manage',
  'miniapp.read',
  'miniapp.build',
  'miniapp.release',
  'geo.read',
  'geo.manage',
  'skill.read',
  'skill.manage',
  'skill.release',
  'order.read',
  'order.manage',
  'order.refund',
  'member.read',
  'member.manage',
  'marketing.manage',
  'voucher.read',
  'voucher.issue',
  'voucher.redeem',
  'voucher.settle',
  'finance.read',
  'finance.settle',
  'ai.use',
  'ai.policy.manage',
  'ai.risk.l2.approve',
  'ai.risk.l3.approve',
  'audit.read',
  'audit.export',
  'analytics.read',
  'workflow.execute',
  'demo.reset',
] as const

export type Permission = (typeof permissions)[number]
export type DataScope =
  | 'PLATFORM'
  | 'CITY'
  | 'OWNED_MERCHANTS'
  | 'MERCHANT'
  | 'STORE'
  | 'SELF'
export type FieldAccess = 'NONE' | 'MASKED' | 'FULL'
export type AiRiskLevel = 'L0' | 'L1' | 'L2' | 'L3'

export interface Principal {
  readonly subject: string
  readonly displayName: string
  readonly tenantId: string
  readonly roles: readonly SystemRole[]
  readonly dataScope: DataScope
  readonly cityIds: readonly string[]
  readonly merchantIds: readonly string[]
  readonly storeIds: readonly string[]
}

export interface ResourceScope {
  readonly tenantId: string
  readonly cityId?: string
  readonly merchantId?: string
  readonly storeId?: string
  readonly userId?: string
}

interface RolePolicy {
  readonly permissions: readonly Permission[] | '*'
  readonly maximumScope: DataScope
}

const rolePolicies: Readonly<Record<SystemRole, RolePolicy>> = {
  HQ_SUPER_ADMIN: { permissions: '*', maximumScope: 'PLATFORM' },
  HQ_OPERATOR: {
    permissions: [
      'tenant.read', 'merchant.read', 'merchant.write', 'merchant.approve',
      'lead.read', 'lead.write', 'lead.assign', 'lead.transfer', 'contract.read',
      'sales.performance.read', 'sales.target.manage', 'sales.team.read',
      'sales.team.manage', 'sales.team.level.approve', 'sales.copilot.use',
      'contract.create',
      'delivery.workorder.read', 'delivery.workorder.manage', 'delivery.workorder.confirm',
      'delivery.sla.read', 'delivery.sla.acknowledge', 'delivery.sla.manage', 'delivery.sla.scan',
      'delivery.renewal.read', 'delivery.renewal.manage', 'delivery.renewal.scan',
      'provider.metrics.read',
      'provider.settlement.read', 'provider.settlement.approve',
      'miniapp.read', 'miniapp.build', 'miniapp.release',
      'geo.read', 'geo.manage', 'skill.read', 'skill.manage', 'skill.release',
      'order.read', 'order.manage', 'member.read', 'marketing.manage',
      'voucher.read', 'analytics.read', 'ai.use', 'ai.risk.l2.approve',
      'audit.read', 'workflow.execute',
    ],
    maximumScope: 'PLATFORM',
  },
  AI_POLICY_ADMIN: {
    permissions: [
      'tenant.read', 'ai.use', 'ai.policy.manage', 'ai.risk.l2.approve',
      'ai.risk.l3.approve', 'audit.read', 'audit.export', 'analytics.read',
    ],
    maximumScope: 'PLATFORM',
  },
  CITY_PROVIDER_ADMIN: {
    permissions: [
      'tenant.read', 'merchant.read', 'merchant.write', 'merchant.approve',
      'lead.read', 'lead.write', 'lead.assign', 'lead.transfer',
      'contract.read', 'contract.create', 'contract.discount.approve',
      'delivery.workorder.read', 'delivery.workorder.manage', 'delivery.workorder.confirm',
      'delivery.sla.read', 'delivery.sla.acknowledge', 'delivery.sla.manage', 'delivery.sla.scan',
      'delivery.renewal.read', 'delivery.renewal.manage', 'delivery.renewal.scan',
      'provider.metrics.read',
      'provider.settlement.read', 'provider.settlement.manage',
      'miniapp.read', 'miniapp.build',
      'geo.read', 'geo.manage', 'skill.read', 'skill.manage',
      'order.read', 'member.read', 'marketing.manage',
      'voucher.read', 'finance.read', 'analytics.read', 'ai.use',
      'ai.risk.l2.approve', 'audit.read', 'workflow.execute',
    ],
    maximumScope: 'CITY',
  },
  CITY_MANAGER: {
    permissions: [
      'merchant.read', 'merchant.write', 'merchant.approve', 'lead.read',
      'lead.write', 'lead.assign', 'lead.transfer', 'contract.read',
      'sales.performance.read', 'sales.target.manage', 'sales.team.read',
      'sales.team.manage', 'sales.copilot.use', 'contract.create',
      'contract.discount.approve',
      'delivery.workorder.read', 'delivery.workorder.manage', 'delivery.workorder.confirm',
      'delivery.sla.read', 'delivery.sla.acknowledge', 'delivery.sla.manage', 'delivery.sla.scan',
      'delivery.renewal.read', 'delivery.renewal.manage', 'delivery.renewal.scan',
      'provider.metrics.read',
      'provider.settlement.read', 'provider.settlement.manage',
      'miniapp.read',
      'miniapp.build', 'miniapp.release', 'geo.read', 'geo.manage', 'skill.read',
      'skill.manage', 'skill.release', 'order.read', 'order.manage', 'member.read',
      'marketing.manage', 'voucher.read', 'finance.read', 'ai.use',
      'ai.risk.l2.approve', 'audit.read', 'analytics.read', 'workflow.execute',
    ],
    maximumScope: 'CITY',
  },
  CITY_SALES: {
    permissions: [
      'merchant.read', 'merchant.write', 'lead.read', 'lead.write',
      'sales.performance.read', 'sales.team.read', 'sales.copilot.use',
      'contract.read', 'contract.create',
      'miniapp.read', 'geo.read',
      'skill.read', 'analytics.read', 'ai.use', 'workflow.execute',
    ],
    maximumScope: 'OWNED_MERCHANTS',
  },
  CITY_DELIVERY: {
    permissions: [
      'merchant.read', 'merchant.write', 'lead.read', 'miniapp.read', 'miniapp.build',
      'delivery.workorder.read', 'delivery.workorder.manage',
      'delivery.sla.read', 'delivery.sla.acknowledge',
      'geo.read', 'geo.manage', 'skill.read', 'skill.manage', 'order.read',
      'analytics.read', 'ai.use', 'workflow.execute',
    ],
    maximumScope: 'CITY',
  },
  MERCHANT_OWNER: {
    permissions: [
      'merchant.read', 'merchant.write', 'contract.read', 'miniapp.read',
      'geo.read', 'skill.read', 'order.read', 'order.manage', 'order.refund',
      'member.read', 'member.manage', 'marketing.manage', 'voucher.read',
      'voucher.issue', 'voucher.redeem', 'finance.read', 'analytics.read',
      'ai.use', 'ai.risk.l2.approve', 'workflow.execute',
    ],
    maximumScope: 'MERCHANT',
  },
  STORE_MANAGER: {
    permissions: [
      'merchant.read', 'merchant.write', 'miniapp.read', 'geo.read', 'skill.read', 'order.read',
      'order.manage', 'order.refund', 'member.read', 'member.manage',
      'marketing.manage', 'voucher.read', 'voucher.issue', 'voucher.redeem',
      'finance.read', 'analytics.read', 'ai.use', 'workflow.execute',
    ],
    maximumScope: 'STORE',
  },
  STORE_CLERK: {
    permissions: [
      'merchant.read', 'order.read', 'order.manage', 'member.read',
      'voucher.read', 'voucher.redeem', 'ai.use', 'workflow.execute',
    ],
    maximumScope: 'STORE',
  },
  FINANCE: {
    permissions: [
      'merchant.read', 'order.read', 'voucher.read', 'voucher.settle',
      'sales.performance.read', 'sales.commission.settle',
      'provider.settlement.read', 'provider.settlement.approve', 'provider.settlement.settle',
      'finance.read', 'finance.settle', 'audit.read', 'analytics.read',
    ],
    maximumScope: 'MERCHANT',
  },
  CONSUMER: {
    permissions: [
      'consumer.home.read', 'consumer.context.manage',
      'consumer.message.read', 'consumer.message.manage', 'consumer.search',
      'consumer.nearby.read',
      'consumer.store.read', 'consumer.deal.manage',
      'consumer.assistant.read', 'consumer.assistant.manage',
      'consumer.voice.manage',
      'consumer.image.manage',
      'consumer.reservation.confirm', 'consumer.reservation.manage',
      'consumer.payment.manage',
      'ai.use', 'workflow.execute',
    ],
    maximumScope: 'SELF',
  },
}

export class AccessDeniedError extends Error {
  readonly code = 'access_denied'

  constructor(message = '当前身份没有执行此操作的权限') {
    super(message)
    this.name = 'AccessDeniedError'
  }
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.roles.some((role) => {
    const granted = rolePolicies[role].permissions
    return granted === '*' || granted.includes(permission)
  })
}

export function canAccessResource(
  principal: Principal,
  resource: ResourceScope,
): boolean {
  if (principal.tenantId !== resource.tenantId) return false

  switch (principal.dataScope) {
    case 'PLATFORM':
      return true
    case 'CITY':
      return resource.cityId !== undefined && principal.cityIds.includes(resource.cityId)
    case 'OWNED_MERCHANTS':
    case 'MERCHANT':
      return resource.merchantId !== undefined && principal.merchantIds.includes(resource.merchantId)
    case 'STORE':
      return resource.storeId !== undefined && principal.storeIds.includes(resource.storeId)
    case 'SELF':
      return resource.userId !== undefined && resource.userId === principal.subject
  }
}

export function requireAccess(
  principal: Principal,
  permission: Permission,
  resource?: ResourceScope,
): void {
  if (!hasPermission(principal, permission)) throw new AccessDeniedError()
  if (resource && !canAccessResource(principal, resource)) {
    throw new AccessDeniedError('当前身份无权访问该数据范围')
  }
}

export function canApproveAiRisk(principal: Principal, risk: AiRiskLevel): boolean {
  if (risk === 'L0' || risk === 'L1') return hasPermission(principal, 'ai.use')
  if (risk === 'L2') return hasPermission(principal, 'ai.risk.l2.approve')
  return hasPermission(principal, 'ai.risk.l3.approve')
}

export function fieldAccess(
  principal: Principal,
  field: 'customer.contact' | 'identity.document' | 'finance.bank_account',
): FieldAccess {
  if (principal.roles.includes('HQ_SUPER_ADMIN')) return 'FULL'
  if (field === 'finance.bank_account') {
    return principal.roles.some((role) => role === 'FINANCE' || role === 'MERCHANT_OWNER')
      ? 'FULL'
      : 'NONE'
  }
  if (field === 'identity.document') {
    return principal.roles.some((role) => role === 'HQ_OPERATOR' || role === 'CITY_MANAGER')
      ? 'FULL'
      : 'NONE'
  }
  return hasPermission(principal, 'order.read') ? 'MASKED' : 'NONE'
}

export function maximumScopeFor(role: SystemRole): DataScope {
  return rolePolicies[role].maximumScope
}
