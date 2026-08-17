import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const providerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`

describe('E3 GEO OS', () => {
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

  async function createLiveProject(): Promise<{ id: string; version: number }> {
    let response = await app.inject({
      method: 'POST', url: '/api/v1/miniapp-factory/projects',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e3:factory:create' },
      payload: {
        leadId: 'lead-yunheli', expectedLeadVersion: 1,
        deliveryType: 'STANDARD_MINIAPP', templateCode: 'DINING_AURORA',
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    let overview = response.json()
    const projectId = overview.focusProject.id as string
    const steps: Array<[string, Record<string, unknown>]> = [
      ['generate', { templateCode: 'DINING_AURORA' }],
      ['preview', {}],
      ['merchant-approve', { merchantApprover: '周云岚' }],
      ['review', {}],
      ['gray', {}],
      ['publish', {}],
    ]
    for (const [path, extra] of steps) {
      const authorization = ['gray', 'publish'].includes(path) ? hqAuthorization : providerAuthorization
      response = await app.inject({
        method: 'POST', url: `/api/v1/miniapp-factory/projects/${projectId}/${path}`,
        headers: { authorization, 'idempotency-key': `e3:factory:${path}` },
        payload: { expectedVersion: overview.focusProject.version, ...extra },
      })
      expect(response.statusCode, response.body).toBe(200)
      overview = response.json()
    }
    return { id: projectId, version: overview.focusProject.version as number }
  }

  async function createWorkspace(): Promise<Record<string, any>> {
    const project = await createLiveProject()
    const response = await app.inject({
      method: 'POST', url: '/api/v1/geo/workspaces',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e3:geo:create' },
      payload: { projectId: project.id, expectedProjectVersion: project.version },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  it('完成九维扫描、差异修复、商家确认、发布与可见性观测', async () => {
    let overview = await createWorkspace()
    const workspaceId = overview.focusWorkspace.id as string
    expect(overview.focusWorkspace).toMatchObject({ status: 'PENDING', version: 1 })
    expect(overview.identity).toMatchObject({ matchStatus: 'MATCHED', confidence: 0.97 })
    expect(overview.facts).toHaveLength(5)

    const post = async (path: string, extra: Record<string, unknown> = {}) => {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/geo/workspaces/${workspaceId}/${path}`,
        headers: { authorization: providerAuthorization, 'idempotency-key': `e3:geo:${path}` },
        payload: { expectedVersion: overview.focusWorkspace.version, ...extra },
      })
      expect(response.statusCode, response.body).toBe(200)
      overview = response.json() as Record<string, any>
    }

    await post('scan')
    expect(overview.focusWorkspace).toMatchObject({ status: 'ISSUE_FOUND', score: 78 })
    expect(overview.dimensions).toHaveLength(9)
    expect(overview.dimensions.reduce((sum: number, item: { score: number }) => sum + item.score, 0)).toBe(78)
    expect(overview.channelComparisons).toHaveLength(4)
    expect(overview.issues).toHaveLength(4)

    await post('propose')
    expect(overview.contentPlan).toMatchObject({ status: 'GENERATED', modelVersion: 'geo-content-planner-2026.07' })
    expect(overview.contentPlan.items).toHaveLength(3)
    expect(overview.contentPlan.items.every((item: { evidenceFactKeys: string[] }) => item.evidenceFactKeys.length > 0)).toBe(true)

    await post('merchant-approve', { merchantApprover: '周云岚' })
    expect(overview.contentPlan).toMatchObject({ status: 'APPROVED', approvedBy: '周云岚' })
    await post('publish')
    expect(overview.issues.every((issue: { status: string }) => issue.status === 'PUBLISHED')).toBe(true)
    await post('monitor')
    expect(overview.focusWorkspace).toMatchObject({ status: 'MONITORING', previousScore: 78, score: 94 })
    expect(overview.dimensions).toHaveLength(9)
    expect(overview.observations).toHaveLength(3)
    expect(overview.events).toHaveLength(6)
    expect(overview.focusWorkspace.complianceNotice).toContain('不承诺')

    const audit = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'geo-os-e3'`,
    ).get() as { count: number }
    const outbox = database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'geo-os-e3'`,
    ).get() as { count: number }
    expect(audit.count).toBe(6)
    expect(outbox.count).toBe(6)
  })

  it('只读商家不能执行修复，未上线 MiniApp 不能创建 GEO 工作区', async () => {
    const project = await createLiveProject()
    const denied = await app.inject({
      method: 'POST', url: '/api/v1/geo/workspaces',
      headers: { authorization: merchantAuthorization, 'idempotency-key': 'e3:merchant:denied' },
      payload: { projectId: project.id, expectedProjectVersion: project.version },
    })
    expect(denied.statusCode).toBe(403)

    database.prepare(
      `UPDATE miniapp_factory_projects SET status = 'DRAFT', version = version + 1 WHERE id = ?`,
    ).run(project.id)
    const notLive = await app.inject({
      method: 'POST', url: '/api/v1/geo/workspaces',
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e3:not-live' },
      payload: { projectId: project.id, expectedProjectVersion: project.version + 1 },
    })
    expect(notLive.statusCode).toBe(409)
    expect(notLive.json().title).toBe('miniapp_not_live')
  })

  it('写操作可幂等重放、拒绝过期版本，扫描与事件快照不可篡改', async () => {
    const overview = await createWorkspace()
    const workspaceId = overview.focusWorkspace.id as string
    const request = {
      method: 'POST' as const,
      url: `/api/v1/geo/workspaces/${workspaceId}/scan`,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e3:scan:replay' },
      payload: { expectedVersion: 1 },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.body).toBe(replay.body)

    const stale = await app.inject({
      ...request,
      headers: { authorization: providerAuthorization, 'idempotency-key': 'e3:scan:stale' },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
    expect(() => database.exec("UPDATE geo_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM geo_score_snapshots')).toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM geo_channel_snapshots')).toThrowError(/append-only/)
  })
})
