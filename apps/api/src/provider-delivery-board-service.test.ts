import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  hq: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`,
}

describe('E7 城市服务商九阶段交付看板', () => {
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

  async function signYunheli(): Promise<string> {
    const diagnosis = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'delivery-board:diagnosis',
      },
      payload: { expectedVersion: 1 },
    })
    expect(diagnosis.statusCode, diagnosis.body).toBe(200)

    const drafted = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/contracts',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'delivery-board:contract',
      },
      payload: { expectedVersion: 2, packageCode: 'PRO', discountBps: 300 },
    })
    expect(drafted.statusCode, drafted.body).toBe(200)

    const contractId = drafted.json().contract.id as string
    const signed = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${contractId}/sign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'delivery-board:sign',
      },
      payload: { leadId: 'lead-yunheli', expectedVersion: 1 },
    })
    expect(signed.statusCode, signed.body).toBe(200)

    const row = database.prepare(
      `SELECT id FROM provider_delivery_cases WHERE lead_id = 'lead-yunheli'`,
    ).get() as { id: string }
    return row.id
  }

  async function overview(focusCaseId?: string, token = authorization.provider) {
    const query = focusCaseId ? `?focusCaseId=${encodeURIComponent(focusCaseId)}` : ''
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/delivery-board${query}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('签约自动建立七日 SLA 案件并保留负责人、下一步和统一证据', async () => {
    const caseId = await signYunheli()
    const result = await overview(caseId)

    expect(result).toMatchObject({
      city: { id: 'city-shanghai', name: '上海城市中心' },
      metrics: {
        total: 1,
        active: 1,
        atRisk: 0,
        overdue: 0,
        delivered: 0,
        averageProgressRate: 11,
      },
      focusCase: {
        id: caseId,
        leadId: 'lead-yunheli',
        merchantName: '云和里·时令餐厅',
        stage: 'WAITING_CAPTURE',
        stageIndex: 1,
        progressRate: 11,
        owner: {
          userId: 'user-demo-provider',
          displayName: '上海城市服务商管理员',
        },
        priority: 'HIGH',
        slaStatus: 'ON_TRACK',
        sourceStatuses: {
          lead: 'SIGNED',
          miniapp: null,
          geo: null,
          skill: null,
        },
      },
      policy: {
        projectionVersion: 'provider-delivery-projection-v1',
        overallSlaHours: 168,
        cityScopeEnforced: true,
        sourceOfTruth: ['ONBOARDING', 'MINIAPP_FACTORY', 'GEO_OS', 'SKILL_NETWORK'],
      },
      permissions: {
        canView: true,
        canOperateFactory: true,
        canOperateGeo: true,
        canOperateSkill: true,
      },
    })
    expect(result.focusCase.nextAction).toBeTruthy()
    expect(result.stages).toHaveLength(9)
    expect(result.stages.map((stage: { index: number }) => stage.index))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'DELIVERY',
        type: 'CASE_CREATED',
        actorName: '上海城市服务商管理员',
      }),
      expect.objectContaining({
        source: 'ONBOARDING',
        type: 'CONTRACT_SIGNED',
      }),
    ]))
  })

  it('从权威领域状态自动投影全部九个阶段而不复制业务状态', async () => {
    const caseId = await signYunheli()
    const timestamp = new Date().toISOString()
    const stage = async () => (await overview(caseId)).focusCase.stage as string

    expect(await stage()).toBe('WAITING_CAPTURE')

    database.prepare(
      `UPDATE leads SET stage = 'ASSET_REVIEW', next_action = '确认三类经营资料',
       updated_at = ? WHERE id = 'lead-yunheli'`,
    ).run(timestamp)
    expect(await stage()).toBe('CAPTURING')

    database.prepare(
      `UPDATE leads SET stage = 'READY_FOR_DELIVERY', next_action = '创建标准小程序',
       updated_at = ? WHERE id = 'lead-yunheli'`,
    ).run(timestamp)
    expect(await stage()).toBe('MINIAPP_GENERATING')

    const projectId = randomUUID()
    database.prepare(
      `INSERT INTO miniapp_factory_projects
       (id, tenant_id, city_id, lead_id, merchant_name, delivery_type, status,
        template_code, current_draft_version, current_release_version, next_action,
        sla_due_at, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', 'lead-yunheli', '云和里·时令餐厅',
        'STANDARD_MINIAPP', 'PREVIEW', 'DINING_AURORA', 1, NULL, '等待商家确认',
        ?, 2, ?, ?)`,
    ).run(projectId, timestamp, timestamp, timestamp)
    expect(await stage()).toBe('MERCHANT_CONFIRMATION')

    database.prepare(
      `UPDATE miniapp_factory_projects
       SET status = 'MERCHANT_APPROVAL', next_action = '提交平台审核', updated_at = ?
       WHERE id = ?`,
    ).run(timestamp, projectId)
    expect(await stage()).toBe('REVIEWING')

    database.prepare(
      `UPDATE miniapp_factory_projects
       SET status = 'LIVE', next_action = '创建 GEO 工作区', updated_at = ?
       WHERE id = ?`,
    ).run(timestamp, projectId)
    expect(await stage()).toBe('LIVE')

    const workspaceId = randomUUID()
    database.prepare(
      `INSERT INTO geo_workspaces
       (id, tenant_id, city_id, project_id, lead_id, merchant_name, status,
        score, previous_score, current_scan_version, next_action, compliance_notice,
        version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, 'lead-yunheli', '云和里·时令餐厅',
        'PENDING', NULL, NULL, 0, '启动实体一致性扫描', '不承诺第三方排名', 1, ?, ?)`,
    ).run(workspaceId, projectId, timestamp, timestamp)
    expect(await stage()).toBe('GEO_SERVICING')

    const suiteId = randomUUID()
    database.prepare(
      `INSERT INTO skill_suites
       (id, tenant_id, city_id, geo_workspace_id, lead_id, merchant_name,
        status, next_action, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, 'lead-yunheli',
        '云和里·时令餐厅', 'GENERATED', '执行能力测试', 2, ?, ?)`,
    ).run(suiteId, workspaceId, timestamp, timestamp)
    expect(await stage()).toBe('SKILL_GENERATING')

    database.prepare(
      `UPDATE skill_suites SET status = 'ONLINE', next_action = '完成交付验收',
       updated_at = ? WHERE id = ?`,
    ).run(timestamp, suiteId)
    const delivered = await overview(caseId)
    expect(delivered.focusCase).toMatchObject({
      stage: 'DELIVERED',
      stageIndex: 9,
      progressRate: 100,
      slaStatus: 'COMPLETED',
    })
    expect(delivered.metrics).toMatchObject({ active: 0, delivered: 1 })
  })

  it('SLA 风险自动识别，销售被拒绝且跨城市焦点不可探测', async () => {
    const caseId = await signYunheli()
    database.prepare(
      `UPDATE provider_delivery_cases SET target_due_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run('2020-01-01T00:00:00.000Z', new Date().toISOString(), caseId)

    const overdue = await overview(caseId)
    expect(overdue.metrics).toMatchObject({ atRisk: 1, overdue: 1 })
    expect(overdue.focusCase.slaStatus).toBe('OVERDUE')
    expect(overdue.focusCase.hoursRemaining).toBeLessThan(0)

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/provider/delivery-board',
      headers: { authorization: authorization.sales },
    })
    expect(denied.statusCode).toBe(403)

    database.prepare(
      `UPDATE memberships SET city_ids_json = '["city-hangzhou"]'
       WHERE user_id = 'user-demo-provider'`,
    ).run()
    const outOfScope = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/delivery-board?focusCaseId=${caseId}`,
      headers: { authorization: authorization.provider },
    })
    expect(outOfScope.statusCode).toBe(404)

    const hq = await overview(caseId, authorization.hq)
    expect(hq.focusCase.id).toBe(caseId)
  })

  it('交付案件事实由数据库禁止修改与删除', async () => {
    const caseId = await signYunheli()
    expect(() => database.prepare(
      `UPDATE provider_delivery_case_events SET summary = 'tampered'
       WHERE case_id = ?`,
    ).run(caseId)).toThrow(/append-only/)
    expect(() => database.prepare(
      'DELETE FROM provider_delivery_case_events WHERE case_id = ?',
    ).run(caseId)).toThrow(/append-only/)
  })
})
