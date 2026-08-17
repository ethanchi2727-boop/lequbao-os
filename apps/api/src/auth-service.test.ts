import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS, authenticate } from './auth-service.js'
import { createDatabase } from './database.js'

describe('会话认证与 API 权限执行', () => {
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

  it('拒绝未认证的业务 API 请求', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/experience' })
    expect(response.statusCode).toBe(401)
    expect(response.json().title).toBe('authentication_required')
  })

  it('只保存访问令牌哈希并返回当前会话', async () => {
    const plainTokenRow = database.prepare(
      'SELECT token_hash FROM auth_sessions WHERE token_hash = ?',
    ).get(DEVELOPMENT_ACCESS_TOKENS.hq)
    expect(plainTokenRow).toBeUndefined()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { authorization: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}` },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      subject: 'user-demo-hq',
      roles: ['HQ_SUPER_ADMIN'],
      dataScope: 'PLATFORM',
    })
  })

  it('消费者会话使用独立 SELF 数据范围', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: {
        authorization: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`,
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      subject: 'user-demo-consumer',
      displayName: '陈知夏',
      roles: ['CONSUMER'],
      dataScope: 'SELF',
    })
  })

  it('门店员工可读业务数据但不能重置平台体验', async () => {
    const authorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.clerk}`
    const read = await app.inject({
      method: 'GET', url: '/api/v1/experience', headers: { authorization },
    })
    expect(read.statusCode).toBe(200)

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/experience/reset',
      headers: { authorization, 'idempotency-key': 'clerk-reset-denied' },
      payload: {},
    })
    expect(reset.statusCode).toBe(403)
    expect(reset.json().title).toBe('access_denied')
  })

  it('拒绝不存在的 Bearer 会话', () => {
    expect(() => authenticate(database, 'Bearer invalid-token'))
      .toThrowError(/无效或已过期/)
  })
})
