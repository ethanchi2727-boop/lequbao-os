import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const hqAuth = { authorization: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}` }

describe('首个垂直切片 API', () => {
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

  it('拒绝缺少幂等键的写请求', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/experience/advance',
      headers: hqAuth,
      payload: { expectedStep: 1 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain('application/problem+json')
  })

  it('完成 12 步闭环并生成授权、Skill、订单、事件与审计', async () => {
    for (let step = 1; step <= 12; step += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/experience/advance',
        headers: {
          ...hqAuth,
          'idempotency-key': `test-run:${step}`,
        },
        payload: { expectedStep: step },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().completedSteps).toBe(step)
    }

    const snapshot = (await app.inject({
      method: 'GET',
      url: '/api/v1/experience',
      headers: hqAuth,
    })).json()

    expect(snapshot.completionRate).toBe(100)
    expect(snapshot.nextStep).toBeNull()
    expect(snapshot.merchant.state).toBe('TRANSACTION_ACTIVE')
    expect(snapshot.consents).toHaveLength(6)
    expect(snapshot.skills.map((skill: { name: string }) => skill.name).sort()).toEqual([
      'find_table',
      'get_menu',
      'reserve_table',
    ])
    expect(snapshot.reservation.status).toBe('MERCHANT_RECEIVED')
    expect(snapshot.audits).toHaveLength(12)
    expect(snapshot.metrics.auditCoverage).toBe(100)
    expect(snapshot.metrics.eventCount).toBe(12)
  })

  it('重复请求返回同一结果且不会重复推进', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/experience/advance',
      headers: { ...hqAuth, 'idempotency-key': 'replay-test:1' },
      payload: { expectedStep: 1 },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)

    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.json().runId).toBe(replay.json().runId)

    const snapshot = (await app.inject({
      method: 'GET',
      url: '/api/v1/experience',
      headers: hqAuth,
    })).json()
    expect(snapshot.completedSteps).toBe(1)
    expect(snapshot.audits).toHaveLength(1)
    expect(snapshot.metrics.idempotencyReplays).toBe(1)
  })

  it('审计表为只追加，禁止篡改历史证据', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/experience/advance',
      headers: { ...hqAuth, 'idempotency-key': 'append-only:1' },
      payload: { expectedStep: 1 },
    })

    expect(() => database.exec("UPDATE audit_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM audit_events')).toThrowError(/append-only/)
  })

  it('拒绝以过期步骤推进状态机', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/experience/advance',
      headers: { ...hqAuth, 'idempotency-key': 'stale-state:2' },
      payload: { expectedStep: 2 },
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().title).toBe('stale_workflow_state')
  })

  it('重复重置请求不会创建多个运行批次', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/experience/reset',
      headers: { ...hqAuth, 'idempotency-key': 'reset-idempotent:1' },
      payload: {},
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)

    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.json().runId).toBe(replay.json().runId)
    const row = database.prepare('SELECT COUNT(*) AS count FROM demo_runs').get() as {
      count: number
    }
    expect(row.count).toBe(2)
  })
})
