import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const providerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`

describe('E4 Skill Network', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let geoWorkspaceId: string

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    const timestamp = new Date().toISOString()
    const projectId = randomUUID()
    geoWorkspaceId = randomUUID()
    database.prepare(
      `INSERT INTO miniapp_factory_projects
       (id, tenant_id, city_id, lead_id, merchant_name, delivery_type, status,
        template_code, current_draft_version, current_release_version, next_action,
        sla_due_at, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', 'lead-yunheli', '云和里·时令餐厅',
        'STANDARD_MINIAPP', 'LIVE', 'DINING_AURORA', 1, 1, '启动 GEO 扫描', ?, 7, ?, ?)`,
    ).run(projectId, timestamp, timestamp, timestamp)
    database.prepare(
      `INSERT INTO geo_workspaces
       (id, tenant_id, city_id, project_id, lead_id, merchant_name, status,
        score, previous_score, current_scan_version, next_action, compliance_notice,
        version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, 'lead-yunheli', '云和里·时令餐厅',
        'MONITORING', 94, 78, 2, '持续观测提及与订单归因', '不承诺第三方排名', 6, ?, ?)`,
    ).run(geoWorkspaceId, projectId, timestamp, timestamp)
    app = await buildApp({ database })
  })

  afterEach(async () => {
    if (app) await app.close()
  })

  async function createSuite(): Promise<Record<string, any>> {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/skills/suites',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:suite:create' },
      payload: { geoWorkspaceId, expectedGeoVersion: 6 },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  it('完成 Manifest、测试、认证、灰度、上线、强确认调用与暂停', async () => {
    let overview = await createSuite()
    const suiteId = overview.focusSuite.id as string
    expect(overview.focusSuite).toMatchObject({ status: 'DRAFT', version: 1 })

    const post = async (
      path: string,
      authorization = providerAuthorization,
      extra: Record<string, unknown> = {},
    ) => {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/skills/suites/${suiteId}/${path}`,
        headers: { authorization, 'idempotency-key': `e4:step:${path}` },
        payload: { expectedVersion: overview.focusSuite.version, ...extra },
      })
      expect(response.statusCode, response.body).toBe(200)
      overview = response.json() as Record<string, any>
    }

    await post('generate')
    expect(overview.skills).toHaveLength(3)
    expect(overview.skills.map((skill: { name: string }) => skill.name)).toEqual(['find_table', 'get_menu', 'reserve_table'])
    const reserve = overview.skills.find((skill: { name: string }) => skill.name === 'reserve_table')
    expect(reserve.manifest).toMatchObject({ riskLevel: 'L2', approvalRequired: true, idempotencyRequired: true })
    expect(reserve.manifest).toHaveProperty('inputSchema')
    expect(reserve.manifest).toHaveProperty('outputSchema')

    await post('test')
    expect(overview.tests).toHaveLength(12)
    expect(overview.tests.every((test: { status: string }) => test.status === 'PASSED')).toBe(true)
    await post('submit')

    const denied = await app.inject({
      method: 'POST', url: `/api/v1/skills/suites/${suiteId}/certify`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:certify:denied' },
      payload: { expectedVersion: overview.focusSuite.version },
    })
    expect(denied.statusCode).toBe(403)

    await post('certify', hqAuthorization)
    await post('gray', hqAuthorization)
    await post('publish', hqAuthorization)
    expect(overview.focusSuite.status).toBe('ONLINE')
    expect(overview.skills.every((skill: { status: string }) => skill.status === 'ONLINE')).toBe(true)

    const getMenu = overview.skills.find((skill: { name: string }) => skill.name === 'get_menu')
    let invoke = await app.inject({
      method: 'POST', url: `/api/v1/skills/suites/${suiteId}/invoke/${getMenu.id}`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:invoke:get-menu' },
      payload: { intent: '查看今晚菜单', payload: { locale: 'zh-CN' }, approvalConfirmed: false },
    })
    expect(invoke.statusCode, invoke.body).toBe(200)
    overview = invoke.json() as Record<string, any>

    const onlineReserve = overview.skills.find((skill: { name: string }) => skill.name === 'reserve_table')
    invoke = await app.inject({
      method: 'POST', url: `/api/v1/skills/suites/${suiteId}/invoke/${onlineReserve.id}`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:invoke:reserve:no-confirm' },
      payload: {
        intent: '预订今晚双人桌',
        payload: { partySize: 2, reservationAt: '2026-07-23T11:30:00.000Z', contactToken: 'contact-demo' },
        approvalConfirmed: false,
      },
    })
    expect(invoke.statusCode).toBe(409)
    expect(invoke.json().title).toBe('user_confirmation_required')

    invoke = await app.inject({
      method: 'POST', url: `/api/v1/skills/suites/${suiteId}/invoke/${onlineReserve.id}`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:invoke:reserve:confirmed' },
      payload: {
        intent: '预订今晚双人桌',
        payload: { partySize: 2, reservationAt: '2026-07-23T11:30:00.000Z', contactToken: 'contact-demo' },
        approvalConfirmed: true,
      },
    })
    expect(invoke.statusCode, invoke.body).toBe(200)
    overview = invoke.json() as Record<string, any>
    expect(overview.invocations).toHaveLength(2)
    expect(overview.invocations[0]).toMatchObject({ skillName: 'reserve_table', status: 'SUCCEEDED', resultValid: true })
    expect(overview.metrics).toMatchObject({ successRate: 100, p95LatencyMs: 268, complaintRate: 0, refundRate: 0 })

    await post('pause', hqAuthorization)
    expect(overview.focusSuite.status).toBe('PAUSED')
    expect(overview.events).toHaveLength(10)
    const audit = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'skill-network-e4'`,
    ).get() as { count: number }
    expect(audit.count).toBe(10)
    expect(() => database.exec("UPDATE skill_test_runs SET detail = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM skill_network_invocations')).toThrowError(/append-only/)
  })

  it('生成可幂等重放、拒绝过期版本且测试、调用和事件不可篡改', async () => {
    const overview = await createSuite()
    const suiteId = overview.focusSuite.id as string
    const request = {
      method: 'POST' as const,
      url: `/api/v1/skills/suites/${suiteId}/generate`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:generate:replay' },
      payload: { expectedVersion: 1 },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.body).toBe(replay.body)
    const stale = await app.inject({
      ...request,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:generate:stale' },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
    expect(() => database.exec("UPDATE skill_network_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
  })

  it('商家只读身份不能建套件，未进入观测的 GEO 工作区不能越级', async () => {
    const denied = await app.inject({
      method: 'POST', url: '/api/v1/skills/suites',
      headers: { authorization: merchantAuthorization, 'idempotency-key': 'e4:merchant:denied' },
      payload: { geoWorkspaceId, expectedGeoVersion: 6 },
    })
    expect(denied.statusCode).toBe(403)
    database.prepare(`UPDATE geo_workspaces SET status = 'PUBLISHED', version = 7 WHERE id = ?`).run(geoWorkspaceId)
    const notReady = await app.inject({
      method: 'POST', url: '/api/v1/skills/suites',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e4:geo:not-ready' },
      payload: { geoWorkspaceId, expectedGeoVersion: 7 },
    })
    expect(notReady.statusCode).toBe(409)
    expect(notReady.json().title).toBe('geo_not_ready_for_skills')
  })
})
