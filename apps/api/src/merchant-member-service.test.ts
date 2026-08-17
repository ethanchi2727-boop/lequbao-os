import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`
const managerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.manager}`
const clerkAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.clerk}`

describe('E5 经营宝会员分层、权益与召回', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    if (app) await app.close()
  })

  async function getOverview(focusMemberId?: string, authorization = merchantAuthorization) {
    const query = focusMemberId ? `?focusMemberId=${encodeURIComponent(focusMemberId)}` : ''
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/members/overview${query}`,
      headers: { authorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  it('返回四类会员、授权覆盖、风险价值和可解释复购预测', async () => {
    const overview = await getOverview()
    expect(overview.store).toEqual({ id: 'store-demo-jingan', name: '云和里·静安店' })
    expect(overview.metrics).toEqual({
      totalMembers: 5,
      newMembers: 1,
      activeMembers: 1,
      dormantMembers: 2,
      highValueMembers: 1,
      consentedMembers: 4,
      averageRepurchaseProbability: 58.2,
      atRiskValueFen: 686000,
    })
    expect(overview.segmentRuleVersion).toBe('member-segment-v1')
    expect(overview.predictionModelVersion).toBe('repurchase-local-v1')
    expect(overview.members.find((member: any) => member.id === 'member-e5-high-value'))
      .toMatchObject({
        segment: 'HIGH_VALUE',
        repurchaseProbability: 92,
        churnRisk: 'LOW',
        marketingConsent: true,
      })

    const focus = await getOverview('member-e5-high-value')
    expect(focus.timeline.length).toBeGreaterThanOrEqual(2)
    expect(focus.benefits[0]).toMatchObject({
      title: '云和里臻享会员',
      status: 'ACTIVE',
      ruleVersion: 'member-benefit-v1',
    })
  })

  it('版本化更新会员标签并支持幂等重放，拒绝店员越权', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/merchant/members/member-e5-active/tags',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:member:tags:active',
      },
      payload: {
        expectedVersion: 1,
        tags: ['双人餐', '靠窗', '纪念日', '纪念日'],
      },
    }
    const changed = await app.inject(request)
    expect(changed.statusCode, changed.body).toBe(200)
    expect(changed.json().focusMember).toMatchObject({
      id: 'member-e5-active',
      tags: ['双人餐', '靠窗', '纪念日'],
      version: 2,
    })
    const replay = await app.inject(request)
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(changed.body)

    const denied = await app.inject({
      ...request,
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:member:tags:clerk',
      },
      payload: { expectedVersion: 2, tags: ['越权标签'] },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('会员权益必须强确认有效期与履约责任，并生成规则证据', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const missingConfirmation = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/members/member-e5-new/benefits',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:member:benefit:no-confirm',
      },
      payload: {
        expectedVersion: 1,
        kind: 'EXPERIENCE',
        title: '新客主厨问候',
        valueFen: 0,
        expiresAt,
        confirmed: false,
      },
    })
    expect(missingConfirmation.statusCode).toBe(409)
    expect(missingConfirmation.json().title).toBe('merchant_confirmation_required')

    const granted = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/members/member-e5-new/benefits',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:member:benefit:confirmed',
      },
      payload: {
        expectedVersion: 1,
        kind: 'COUPON',
        title: '新客复购礼遇',
        valueFen: 5000,
        expiresAt,
        confirmed: true,
      },
    })
    expect(granted.statusCode, granted.body).toBe(200)
    const overview = granted.json() as Record<string, any>
    expect(overview.focusMember).toMatchObject({ id: 'member-e5-new', version: 2 })
    expect(overview.benefits[0]).toMatchObject({
      kind: 'COUPON',
      title: '新客复购礼遇',
      valueFen: 5000,
      status: 'ACTIVE',
      ruleVersion: 'member-benefit-v1',
    })
    expect(overview.timeline[0].type).toBe('BENEFIT_GRANTED')
  })

  it('召回任务排除已撤权会员，强确认后只创建待计划任务而不伪造发送', async () => {
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/members/recall-tasks',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:member:recall:dormant',
      },
      payload: {
        name: '沉睡高价值会员温和召回',
        memberIds: ['member-e5-dormant', 'member-e5-dormant-no-consent'],
        channel: 'WECHAT',
        content: '好久不见，为你保留了一份时令菜单与到店礼遇。',
        reason: '高流失风险且历史客单较高',
        scheduledAt,
        confirmed: true,
      },
    })
    expect(created.statusCode, created.body).toBe(200)
    const task = created.json().recallTasks[0]
    expect(task).toMatchObject({
      status: 'SCHEDULED',
      audienceCount: 1,
      excludedNoConsentCount: 1,
      memberIds: ['member-e5-dormant'],
      approvalConfirmed: true,
      segmentRuleVersion: 'member-segment-v1',
      predictionModelVersion: 'repurchase-local-v1',
    })

    const event = database.prepare(
      `SELECT payload_json FROM merchant_member_events
       WHERE type = 'MEMBER_RECALL_SCHEDULED'`,
    ).get() as { payload_json: string }
    expect(JSON.parse(event.payload_json)).toMatchObject({
      deliveryStatus: 'NOT_SENT',
      audienceCount: 1,
      excludedNoConsentCount: 1,
    })
  })

  it('会员时间线和会员事件保持只追加且每次高风险动作均写入审计', async () => {
    const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/members/recall-tasks',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:member:recall:evidence',
      },
      payload: {
        name: '企业礼盒会员召回',
        memberIds: ['member-e5-dormant'],
        channel: 'SMS',
        content: '云和里秋季礼盒已更新，欢迎查看本季企业采购方案。',
        reason: '历史企业采购会员进入高流失风险',
        scheduledAt,
        confirmed: true,
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    const audit = database.prepare(
      `SELECT risk_level, payload_json FROM audit_events
       WHERE run_id = 'merchant-member-e5' AND action = 'MEMBER_RECALL_SCHEDULED'`,
    ).get() as { risk_level: string; payload_json: string }
    expect(audit.risk_level).toBe('L2')
    expect(JSON.parse(audit.payload_json).confirmationCaptured).toBe(true)
    expect(() => database.exec("UPDATE merchant_member_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec("DELETE FROM merchant_member_timeline"))
      .toThrowError(/append-only/)
  })
})
