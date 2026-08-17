import { describe, expect, it } from 'vitest'
import {
  canAccessResource,
  canApproveAiRisk,
  fieldAccess,
  hasPermission,
  requireAccess,
  type Principal,
} from './index.js'

const sales: Principal = {
  subject: 'user-sales',
  displayName: '销售顾问',
  tenantId: 'tenant-lequ',
  roles: ['CITY_SALES'],
  dataScope: 'OWNED_MERCHANTS',
  cityIds: ['city-shanghai'],
  merchantIds: ['merchant-owned'],
  storeIds: [],
}

it('销售只能读取自己名下的商户数据', () => {
  expect(canAccessResource(sales, {
    tenantId: 'tenant-lequ',
    merchantId: 'merchant-owned',
  })).toBe(true)
  expect(canAccessResource(sales, {
    tenantId: 'tenant-lequ',
    merchantId: 'merchant-other',
  })).toBe(false)
})

it('数据权限不会被同名资源跨租户绕过', () => {
  expect(canAccessResource(sales, {
    tenantId: 'tenant-another',
    merchantId: 'merchant-owned',
  })).toBe(false)
})

it('销售没有发布 Skill 和 L2 AI 审批权限', () => {
  expect(hasPermission(sales, 'skill.release')).toBe(false)
  expect(canApproveAiRisk(sales, 'L2')).toBe(false)
  expect(() => requireAccess(sales, 'skill.release')).toThrowError(/权限/)
})

describe('总部超级管理员', () => {
  const hq: Principal = {
    ...sales,
    subject: 'user-hq',
    displayName: '总部超级管理员',
    roles: ['HQ_SUPER_ADMIN'],
    dataScope: 'PLATFORM',
    merchantIds: [],
  }

  it('拥有平台权限和 L3 高风险审批能力', () => {
    expect(hasPermission(hq, 'platform.configure')).toBe(true)
    expect(canApproveAiRisk(hq, 'L3')).toBe(true)
  })

  it('可查看受保护字段', () => {
    expect(fieldAccess(hq, 'identity.document')).toBe('FULL')
    expect(fieldAccess(hq, 'finance.bank_account')).toBe('FULL')
  })
})

it('门店员工只能看到脱敏后的顾客联系方式', () => {
  const clerk: Principal = {
    ...sales,
    roles: ['STORE_CLERK'],
    dataScope: 'STORE',
    merchantIds: ['merchant-owned'],
    storeIds: ['store-1'],
  }
  expect(fieldAccess(clerk, 'customer.contact')).toBe('MASKED')
  expect(fieldAccess(clerk, 'finance.bank_account')).toBe('NONE')
})

it('城市服务商管理员可在城市域完成销售与交付，但没有全国配置权限', () => {
  const providerAdmin: Principal = {
    ...sales,
    subject: 'user-provider-admin',
    displayName: '上海城市服务商管理员',
    roles: ['CITY_PROVIDER_ADMIN'],
    dataScope: 'CITY',
    merchantIds: [],
  }
  expect(hasPermission(providerAdmin, 'lead.assign')).toBe(true)
  expect(hasPermission(providerAdmin, 'contract.create')).toBe(true)
  expect(hasPermission(providerAdmin, 'miniapp.build')).toBe(true)
  expect(hasPermission(providerAdmin, 'miniapp.release')).toBe(false)
  expect(hasPermission(providerAdmin, 'platform.configure')).toBe(false)
  expect(canAccessResource(providerAdmin, {
    tenantId: 'tenant-lequ',
    cityId: 'city-shanghai',
  })).toBe(true)
  expect(canAccessResource(providerAdmin, {
    tenantId: 'tenant-lequ',
    cityId: 'city-hangzhou',
  })).toBe(false)
})

it('消费者只能访问自己的 SELF 数据且不能进入商户工作台', () => {
  const consumer: Principal = {
    subject: 'user-consumer',
    displayName: '陈知夏',
    tenantId: 'tenant-lequ',
    roles: ['CONSUMER'],
    dataScope: 'SELF',
    cityIds: ['city-shanghai'],
    merchantIds: [],
    storeIds: [],
  }
  expect(hasPermission(consumer, 'consumer.home.read')).toBe(true)
  expect(hasPermission(consumer, 'consumer.search')).toBe(true)
  expect(hasPermission(consumer, 'merchant.read')).toBe(false)
  expect(canAccessResource(consumer, {
    tenantId: 'tenant-lequ',
    userId: 'user-consumer',
  })).toBe(true)
  expect(canAccessResource(consumer, {
    tenantId: 'tenant-lequ',
    userId: 'user-another',
  })).toBe(false)
})
