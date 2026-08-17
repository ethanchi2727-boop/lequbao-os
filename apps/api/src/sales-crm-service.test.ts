import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const salesAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`

describe('E6 销售宝商家 CRM 与商机地图', () => {
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

  async function getCrm(url = '/api/v1/sales/crm') {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: salesAuthorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('返回销售数据范围内的线索、聚合指标、负责人和可信位置元数据', async () => {
    const crm = await getCrm()
    expect(crm.metrics).toMatchObject({
      total: 3,
      filtered: 3,
      protected: 3,
      located: 3,
    })
    expect(crm.map.points).toHaveLength(3)
    expect(crm.map.center.latitude).toBeCloseTo(31.21527, 4)
    expect(crm.map.center.longitude).toBeCloseTo(121.43557, 4)
    expect(crm.filters).toEqual({
      sources: ['老客转介绍', '商圈活动', '销售外拓'],
      stages: ['NEW', 'DIAGNOSED', 'CONTRACT_DRAFT'],
    })
    const yunheli = crm.leads.find((item: { lead: { id: string } }) =>
      item.lead.id === 'lead-yunheli',
    )
    expect(yunheli).toMatchObject({
      ownerDisplayName: '上海销售顾问',
      followUpCount: 0,
      activityCount: 1,
      lastFollowUpAt: null,
      location: {
        district: '静安区',
        geocodeSource: 'LOCAL_REFERENCE',
        confidence: 0.96,
        version: 1,
      },
    })
  })

  it('支持关键词、阶段、来源和跟进时机组合筛选', async () => {
    database.prepare('UPDATE leads SET next_action_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 60 * 60 * 1000).toISOString(), 'lead-yunheli')

    const filtered = await getCrm(
      `/api/v1/sales/crm?keyword=${encodeURIComponent('云和')}`
      + `&stage=NEW&source=${encodeURIComponent('销售外拓')}&timing=OVERDUE`,
    )
    expect(filtered.query).toEqual({
      keyword: '云和',
      stage: 'NEW',
      source: '销售外拓',
      timing: 'OVERDUE',
    })
    expect(filtered.metrics.filtered).toBe(1)
    expect(filtered.leads.map((item: { lead: { id: string } }) => item.lead.id))
      .toEqual(['lead-yunheli'])
    expect(filtered.map.points).toHaveLength(1)

    const none = await getCrm('/api/v1/sales/crm?keyword=不存在的商家')
    expect(none.metrics).toMatchObject({ total: 3, filtered: 0 })
    expect(none.map).toEqual({
      center: { latitude: 31.2304, longitude: 121.4737 },
      points: [],
    })
  })

  it('新增跟进后立即反映跟进次数、最近时间和 CRM 时间线活动数', async () => {
    const before = await getCrm()
    const lead = before.leads.find((item: { lead: { id: string } }) =>
      item.lead.id === 'lead-yunheli',
    ).lead
    const followedUp = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/followups',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-crm:follow-up-yunheli',
      },
      payload: {
        expectedVersion: lead.version,
        channel: 'VISIT',
        summary: '已到店确认午市客群与高峰排队痛点',
        nextAction: '邀请主理人查看 AI 体检报告',
        nextActionAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    })
    expect(followedUp.statusCode, followedUp.body).toBe(200)

    const after = await getCrm('/api/v1/sales/crm?keyword=云和里')
    expect(after.leads[0]).toMatchObject({
      followUpCount: 1,
      activityCount: 2,
      lead: {
        nextAction: '邀请主理人查看 AI 体检报告',
        version: 2,
      },
    })
    expect(Date.parse(after.leads[0].lastFollowUpAt)).toBeGreaterThan(0)
  })

  it('新建未定位线索仍进入列表但不伪造地图坐标', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-crm:create-unlocated',
      },
      payload: {
        name: '风桥手作烘焙',
        category: '烘焙',
        source: '门店拜访',
        contactName: '林女士',
        contactPhoneMasked: '137****8821',
        address: '上海市静安区万航渡路 889 号',
        cityId: 'city-shanghai',
      },
    })
    expect(created.statusCode, created.body).toBe(200)

    const crm = await getCrm('/api/v1/sales/crm?keyword=风桥')
    expect(crm.metrics).toMatchObject({ total: 4, filtered: 1, located: 3 })
    expect(crm.leads[0]).toMatchObject({
      lead: { name: '风桥手作烘焙' },
      location: null,
    })
    expect(crm.map.points).toHaveLength(0)
  })

  it('列表与地图查询在 SQL 层继承线索归属范围，商户角色无权读取', async () => {
    for (const [leadId, key] of [
      ['lead-yunheli', 'e6-crm:transfer-yunheli'],
      ['lead-muyun', 'e6-crm:transfer-muyun'],
    ] as const) {
      const transferred = await app.inject({
        method: 'POST',
        url: `/api/v1/onboarding/leads/${leadId}/transfer`,
        headers: {
          authorization: hqAuthorization,
          'idempotency-key': key,
        },
        payload: {
          expectedVersion: 1,
          targetOwnerId: 'user-demo-provider',
          reason: '城市负责人调整归属用于 CRM 数据范围验收',
        },
      })
      expect(transferred.statusCode, transferred.body).toBe(200)
    }

    const scoped = await getCrm()
    expect(scoped.metrics).toMatchObject({ total: 1, filtered: 1, located: 1 })
    expect(scoped.leads[0].lead.id).toBe('lead-luming')
    expect(scoped.map.points.map((item: { leadId: string }) => item.leadId))
      .toEqual(['lead-luming'])

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/crm',
      headers: { authorization: merchantAuthorization },
    })
    expect(denied.statusCode).toBe(403)
  })
})
