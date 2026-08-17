import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
  delivery: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.delivery}`,
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  hq: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`,
}

describe('E7 城市商家、收入、续费率、交付时长与 GMV', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    await app.close()
  })

  async function overview(
    query = 'period=30D',
    token = authorization.provider,
    expectedStatus = 200,
  ) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/city-metrics?${query}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(expectedStatus)
    return response.json()
  }

  it('按八项冻结口径汇总当前城市并提供趋势、洞察与数据新鲜度', async () => {
    const result = await overview()

    expect(result).toMatchObject({
      city: { id: 'city-shanghai', name: '上海城市中心' },
      period: {
        key: '30D',
        label: '近 30 天',
        timezone: 'Asia/Shanghai',
      },
      metrics: {
        totalMerchants: 3,
        deliveryTargetHours: 168,
      },
      policy: {
        version: 'provider-city-metrics-v1',
        cityScopeEnforced: true,
        noEstimatedRevenue: true,
      },
    })
    expect(result.metrics.activeMerchants).toBeGreaterThan(0)
    expect(result.metrics.serviceRevenueFen).toBeGreaterThan(0)
    expect(result.metrics.transactionGmvFen).toBeGreaterThanOrEqual(0)
    expect(result.trends).toHaveLength(6)
    expect(result.methodology).toHaveLength(8)
    expect(result.freshness.map(({ source }: { source: string }) => source)).toEqual([
      'CRM 商家主档',
      '交付工单',
      '续费周期',
      'Skill Network',
      '确认收入与交易账本',
      '交易订单',
    ])
    expect(result.merchants.map(({ leadId }: { leadId: string }) => leadId)).toEqual(
      expect.arrayContaining(['lead-yunheli', 'lead-muyun', 'lead-luming']),
    )
    expect(result.insights).toHaveLength(4)
  })

  it('服务收入、交易 GMV 与续费率严格等于确认事实净额', async () => {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const to = new Date().toISOString()
    const expectedRevenue = database.prepare(
      `SELECT COALESCE(SUM(performance_delta_fen), 0) AS value
       FROM sales_commission_ledger
       WHERE tenant_id = 'tenant-lequ' AND city_id = 'city-shanghai'
         AND category IN ('SIGNING', 'RENEWAL')
         AND kind IN ('RECOGNITION', 'REVERSAL')
         AND occurred_at >= ? AND occurred_at < ?`,
    ).get(from, to) as { value: number }
    const expectedGmv = database.prepare(
      `SELECT COALESCE(SUM(performance_delta_fen), 0) AS value
       FROM sales_commission_ledger
       WHERE tenant_id = 'tenant-lequ' AND city_id = 'city-shanghai'
         AND category = 'TRANSACTION_SHARE'
         AND kind IN ('RECOGNITION', 'REVERSAL')
         AND occurred_at >= ? AND occurred_at < ?`,
    ).get(from, to) as { value: number }

    const result = await overview()
    expect(result.metrics.serviceRevenueFen).toBe(expectedRevenue.value)
    expect(result.metrics.transactionGmvFen).toBe(expectedGmv.value)
    expect(result.metrics.renewalRate).toBe(
      result.metrics.closedRenewalCases === 0
        ? 0
        : Math.round(
          result.metrics.renewedCases / result.metrics.closedRenewalCases * 1000,
        ) / 10,
    )
  })

  it('支持周期切换与商家钻取，焦点不存在时不泄露资源', async () => {
    const result30 = await overview('period=30D&focusLeadId=lead-yunheli')
    const result365 = await overview('period=365D&focusLeadId=lead-yunheli')

    expect(result30.focusMerchant).toMatchObject({
      leadId: 'lead-yunheli',
      merchantName: '云和里·时令餐厅',
      ownerName: '上海销售顾问',
    })
    expect(result365.period.key).toBe('365D')
    expect(result365.metrics.serviceRevenueFen)
      .toBeGreaterThanOrEqual(result30.metrics.serviceRevenueFen)

    await overview('focusLeadId=not-visible', authorization.provider, 404)
  })

  it('城市范围在 SQL 层生效，总部可汇总而销售与交付身份不能读取经营收入', async () => {
    database.prepare(
      `UPDATE leads SET city_id = 'city-hangzhou' WHERE id = 'lead-luming'`,
    ).run()
    database.prepare(
      `UPDATE provider_renewal_cases
       SET city_id = 'city-hangzhou' WHERE lead_id = 'lead-luming'`,
    ).run()

    const provider = await overview()
    const hq = await overview('period=30D', authorization.hq)
    expect(provider.metrics.totalMerchants).toBe(2)
    expect(hq.metrics.totalMerchants).toBe(3)

    await overview('period=30D', authorization.sales, 403)
    await overview('period=30D', authorization.delivery, 403)
    await overview(
      'period=30D&focusLeadId=lead-luming',
      authorization.provider,
      404,
    )
  })

  it('非法周期由统一校验边界拒绝', async () => {
    await overview('period=ALL_TIME', authorization.provider, 400)
  })
})
