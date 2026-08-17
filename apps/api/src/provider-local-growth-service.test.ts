import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
  cityManager: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.cityManager}`,
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  hq: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`,
}

describe('E7 城市服务商本地线索池、销售分配、体检、合同与套餐', () => {
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
    token = authorization.provider,
    focusLeadId?: string,
  ) {
    const query = focusLeadId ? `?focusLeadId=${encodeURIComponent(focusLeadId)}` : ''
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/local-growth${query}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('城市服务商管理员只看到本城市线索、销售负载和版本化套餐', async () => {
    const result = await overview()
    expect(result).toMatchObject({
      city: { id: 'city-shanghai', name: '上海城市中心' },
      metrics: {
        totalLeads: 3,
        awaitingDiagnosis: 1,
        awaitingContract: 2,
        signed: 0,
        readyForDelivery: 0,
      },
      focusLead: {
        lead: { id: 'lead-yunheli', ownerId: 'user-demo-sales', stage: 'NEW' },
        ownerDisplayName: '上海销售顾问',
        diagnosis: null,
        contract: null,
        assignmentCount: 0,
      },
      policy: {
        assignmentRuleVersion: 'provider-lead-assignment-v1',
        packageRuleVersion: 'provider-package-catalog-2026.07',
        cityScopeEnforced: true,
        strongConfirmationRequired: true,
      },
      permissions: {
        canAssign: true,
        canDiagnose: true,
        canCreateContract: true,
        canApproveDiscount: true,
      },
    })
    expect(result.salespeople).toEqual([
      expect.objectContaining({
        userId: 'user-demo-sales',
        activeLeadCount: 3,
        availability: 'AVAILABLE',
      }),
      expect.objectContaining({
        userId: 'user-demo-sales-peer',
        activeLeadCount: 0,
        availability: 'AVAILABLE',
      }),
    ])
    expect(result.packages.map((item: { code: string; listPriceFen: number }) =>
      [item.code, item.listPriceFen])).toEqual([
      ['BASIC', 49_800],
      ['PRO', 99_800],
      ['AGENT', 169_800],
      ['CHAIN', 299_800],
    ])
    expect(result.packages.find((item: { code: string }) => item.code === 'PRO'))
      .toMatchObject({ recommended: true, capabilities: expect.arrayContaining(['六类独立授权']) })
  })

  it('销售分配必须强确认、乐观锁、同城在岗校验，并同步未完成任务', async () => {
    const noConfirmation = await app.inject({
      method: 'POST',
      url: '/api/v1/provider/local-growth/leads/lead-yunheli/assign',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-assignment:no-confirm',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-sales-peer',
        reason: '平衡本周商圈线索负载',
        confirmed: false,
      },
    })
    expect(noConfirmation.statusCode).toBe(422)
    expect(noConfirmation.json().title).toBe('provider_assignment_confirmation_required')

    const request = {
      method: 'POST' as const,
      url: '/api/v1/provider/local-growth/leads/lead-yunheli/assign',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-assignment:confirmed',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-sales-peer',
        reason: '宁安负责静安商圈且当前负载更低',
        confirmed: true,
      },
    }
    const assigned = await app.inject(request)
    const replay = await app.inject(request)
    expect(assigned.statusCode, assigned.body).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(assigned.body)
    expect(assigned.json()).toMatchObject({
      focusLead: {
        lead: { id: 'lead-yunheli', ownerId: 'user-demo-sales-peer', version: 2 },
        ownerDisplayName: '上海销售顾问·宁安',
        assignmentCount: 1,
      },
      assignmentEvents: [{
        previousOwnerId: 'user-demo-sales',
        targetOwnerId: 'user-demo-sales-peer',
        actorName: '上海城市服务商管理员',
        reason: '宁安负责静安商圈且当前负载更低',
      }],
    })
    expect(database.prepare(
      `SELECT owner_id FROM sales_tasks WHERE lead_id = 'lead-yunheli'
       AND status IN ('PENDING', 'SNOOZED')`,
    ).get()).toEqual({ owner_id: 'user-demo-sales-peer' })
    expect(database.prepare(
      `SELECT rule_version, lead_version FROM provider_lead_assignment_events
       WHERE lead_id = 'lead-yunheli'`,
    ).get()).toEqual({
      rule_version: 'provider-lead-assignment-v1',
      lead_version: 2,
    })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE topic = 'provider.lead.assigned.v1'`,
    ).get()).toEqual({ count: 1 })

    const stale = await app.inject({
      ...request,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-assignment:stale',
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
  })

  it('服务商可复用统一体检与合同域完成套餐签约和六类授权', async () => {
    const diagnosis = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-growth:diagnosis',
      },
      payload: { expectedVersion: 1 },
    })
    expect(diagnosis.statusCode, diagnosis.body).toBe(200)
    expect(diagnosis.json()).toMatchObject({
      focusLead: { stage: 'DIAGNOSED', healthScore: 82, version: 2 },
      diagnosis: { score: 82, grade: 'B+' },
    })

    const contract = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/contracts',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-growth:contract',
      },
      payload: { expectedVersion: 2, packageCode: 'BASIC', discountBps: 300 },
    })
    expect(contract.statusCode, contract.body).toBe(200)
    expect(contract.json().contract).toMatchObject({
      packageCode: 'BASIC',
      listPriceFen: 49_800,
      finalPriceFen: 48_306,
      discountStatus: 'AUTO_APPROVED',
    })

    const signed = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${contract.json().contract.id}/sign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-growth:sign',
      },
      payload: { leadId: 'lead-yunheli', expectedVersion: 1 },
    })
    expect(signed.statusCode, signed.body).toBe(200)
    const refreshed = await overview(authorization.provider, 'lead-yunheli')
    expect(refreshed.focusLead).toMatchObject({
      lead: { stage: 'SIGNED' },
      diagnosis: { score: 82 },
      contract: { status: 'SIGNED', authorizationCount: 6 },
    })
    expect(refreshed.focusLead.authorizationLabels).toEqual([
      '数字建档与小程序',
      'GEO 分发',
      'Skill 生成与调用',
      '乐趣生活展示',
      '交易、支付与会员',
      '代金券抽佣联盟',
    ])
  })

  it('销售不能进入城市管理池，总部和城市负责人可在各自数据域读取', async () => {
    const salesDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/provider/local-growth',
      headers: { authorization: authorization.sales },
    })
    expect(salesDenied.statusCode).toBe(403)

    expect((await overview(authorization.cityManager)).metrics.totalLeads).toBe(3)
    expect((await overview(authorization.hq)).metrics.totalLeads).toBe(3)

    database.prepare(
      `UPDATE memberships SET city_ids_json = '["city-hangzhou"]'
       WHERE user_id = 'user-demo-provider'`,
    ).run()
    const outOfScope = await app.inject({
      method: 'GET',
      url: '/api/v1/provider/local-growth?focusLeadId=lead-yunheli',
      headers: { authorization: authorization.provider },
    })
    expect(outOfScope.statusCode).toBe(404)
  })

  it('销售分配事实由数据库禁止修改和删除', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/provider/local-growth/leads/lead-yunheli/assign',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'provider-assignment:append-only',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-sales-peer',
        reason: '验证城市线索分配事实不可篡改',
        confirmed: true,
      },
    })
    expect(() => database.exec(
      `UPDATE provider_lead_assignment_events SET reason = 'tampered'`,
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      'DELETE FROM provider_lead_assignment_events',
    )).toThrowError(/append-only/)
  })
})
