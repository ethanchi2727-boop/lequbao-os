import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const providerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`

describe('E2 MiniApp Factory', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    database.prepare(
      `UPDATE leads SET stage = 'READY_FOR_DELIVERY',
       next_action = '移交城市服务商启动 MiniApp 交付' WHERE id = 'lead-yunheli'`,
    ).run()
    app = await buildApp({ database })
  })

  afterEach(async () => {
    await app.close()
  })

  const createProject = async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/miniapp-factory/projects',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e2:create-project' },
      payload: {
        leadId: 'lead-yunheli', expectedLeadVersion: 1,
        deliveryType: 'STANDARD_MINIAPP', templateCode: 'DINING_AURORA',
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('完成两版生成、预览、商家确认、审核、灰度、发布与回滚', async () => {
    let overview = await createProject()
    const projectId = overview.focusProject.id as string
    expect(overview.focusProject).toMatchObject({ status: 'DRAFT', version: 1 })

    const post = async (
      path: string,
      version: number,
      key: string,
      authorization = providerAuthorization,
      extra: Record<string, unknown> = {},
    ) => {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/miniapp-factory/projects/${projectId}/${path}`,
        headers: { authorization, 'idempotency-key': key },
        payload: { expectedVersion: version, ...extra },
      })
      expect(response.statusCode, response.body).toBe(200)
      return response.json()
    }

    overview = await post('generate', 1, 'e2:v1:generate', providerAuthorization, { templateCode: 'DINING_AURORA' })
    expect(overview.currentVersion.schema.blocks).toHaveLength(8)
    expect(overview.currentVersion.content.generatedBy).toBe('miniapp-content-agent-2026.07')
    overview = await post('preview', 2, 'e2:v1:preview')
    expect(overview.currentVersion.previewPath).toContain('/preview/v1')
    overview = await post('merchant-approve', 3, 'e2:v1:merchant', providerAuthorization, { merchantApprover: '周云岚' })
    expect(overview.currentVersion).toMatchObject({ status: 'APPROVED', merchantApprovedBy: '周云岚' })
    overview = await post('review', 4, 'e2:v1:review')

    const deniedGray = await app.inject({
      method: 'POST', url: `/api/v1/miniapp-factory/projects/${projectId}/gray`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e2:v1:gray-denied' },
      payload: { expectedVersion: 5 },
    })
    expect(deniedGray.statusCode).toBe(403)

    overview = await post('gray', 5, 'e2:v1:gray', hqAuthorization)
    overview = await post('publish', 6, 'e2:v1:publish', hqAuthorization)
    expect(overview.focusProject).toMatchObject({ status: 'LIVE', currentReleaseVersion: 1 })

    overview = await post('revise', 7, 'e2:v2:revise', hqAuthorization)
    overview = await post('generate', 8, 'e2:v2:generate', hqAuthorization, { templateCode: 'CAFE_EDITORIAL' })
    expect(overview.currentVersion).toMatchObject({ version: 2, templateCode: 'CAFE_EDITORIAL' })
    overview = await post('preview', 9, 'e2:v2:preview', hqAuthorization)
    overview = await post('merchant-approve', 10, 'e2:v2:merchant', hqAuthorization, { merchantApprover: '周云岚' })
    overview = await post('review', 11, 'e2:v2:review', hqAuthorization)
    overview = await post('gray', 12, 'e2:v2:gray', hqAuthorization)
    overview = await post('publish', 13, 'e2:v2:publish', hqAuthorization)
    expect(overview.focusProject.currentReleaseVersion).toBe(2)

    overview = await post('rollback', 14, 'e2:rollback:v1', hqAuthorization, {
      targetVersion: 1, reason: 'v2 首页转化率异常，执行配置级快速回滚',
    })
    expect(overview.focusProject).toMatchObject({ status: 'LIVE', currentReleaseVersion: 1, version: 15 })
    expect(overview.versions).toMatchObject([
      { version: 2, status: 'ROLLED_BACK' },
      { version: 1, status: 'LIVE' },
    ])
    expect(overview.events).toHaveLength(15)

    const audit = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'miniapp-factory-e2'`,
    ).get() as { count: number }
    const outbox = database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'miniapp-factory-e2'`,
    ).get() as { count: number }
    expect(audit.count).toBe(15)
    expect(outbox.count).toBe(15)
  })

  it('生成请求可幂等重放并拒绝过期项目版本', async () => {
    const overview = await createProject()
    const projectId = overview.focusProject.id as string
    const request = {
      method: 'POST' as const,
      url: `/api/v1/miniapp-factory/projects/${projectId}/generate`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e2:idempotent-generate' },
      payload: { expectedVersion: 1, templateCode: 'DINING_AURORA' },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.body).toBe(replay.body)

    const stale = await app.inject({
      ...request,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e2:stale-generate' },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
  })

  it('交付事件为只追加证据且未就绪线索不能建项目', async () => {
    const overview = await createProject()
    expect(overview.eligibleLeads).toHaveLength(0)
    expect(() => database.exec("UPDATE miniapp_factory_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM miniapp_factory_events')).toThrowError(/append-only/)

    const rejected = await app.inject({
      method: 'POST', url: '/api/v1/miniapp-factory/projects',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e2:not-ready' },
      payload: {
        leadId: 'lead-muyun', expectedLeadVersion: 1,
        deliveryType: 'STANDARD_MINIAPP', templateCode: 'CAFE_EDITORIAL',
      },
    })
    expect(rejected.statusCode).toBe(409)
    expect(rejected.json().title).toBe('lead_not_ready_for_factory')
  })
})
