import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`

describe('E8 第四批：位置授权、附近列表与门店分布', () => {
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

  async function nearby(payload: Record<string, unknown>, authorization = consumerAuthorization) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/consumer/nearby',
      headers: { authorization },
      payload,
    })
  }

  it('未提供位置时按当前城市降级，仍返回授权门店和可信位置点', async () => {
    const response = await nearby({
      cityId: 'city-shanghai',
      householdMemberId: 'household-member-chen-self',
      limit: 20,
    })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json()
    expect(result).toMatchObject({
      city: { id: 'city-shanghai', isCurrent: true },
      activeMember: { id: 'household-member-chen-self', isCurrent: true },
      mode: 'CITY_FALLBACK',
      policy: {
        version: 'consumer-nearby-policy-v1',
        selfScopeEnforced: true,
        locationOptional: true,
        preciseLocationNotStored: true,
        publishedStoresOnly: true,
        platformDisplayAuthorizationRequired: true,
        straightLineDistanceOnly: true,
        noPaidRanking: true,
        navigationNotSupported: true,
      },
    })
    expect(result.stores).toHaveLength(4)
    expect(result.stores.every((store: any) =>
      store.distanceMeters === null && store.distanceMethod === null)).toBe(true)
    expect(result.map.points).toHaveLength(4)
    expect(result.notice).toContain('未使用精确位置')
  })

  it('提供位置时按直线距离排序且不把精确位置写入数据库', async () => {
    const before = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE action LIKE 'CONSUMER_NEARBY%'`,
    ).get() as { count: number }
    const response = await nearby({
      cityId: 'city-shanghai',
      householdMemberId: 'household-member-chen-self',
      location: {
        latitude: 31.22142,
        longitude: 121.43681,
        accuracyMeters: 18,
      },
      limit: 20,
    })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json()
    expect(result.mode).toBe('LOCATION')
    expect(result.stores[0]).toMatchObject({
      id: 'store-demo-jingan',
      distanceMeters: 0,
      distanceMethod: 'STRAIGHT_LINE',
    })
    expect(result.stores.slice(1).every((store: any) =>
      store.distanceMeters > 0)).toBe(true)
    expect(result.notice).toContain('直线距离')
    const after = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE action LIKE 'CONSUMER_NEARBY%'`,
    ).get() as { count: number }
    expect(after.count).toBe(before.count)
    const locationTables = database.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name LIKE '%user%location%'`,
    ).all()
    expect(locationTables).toEqual([])
  })

  it('列表和分布图都排除暂停发布、停业和无可信坐标门店', async () => {
    database.prepare(
      `UPDATE consumer_store_publications
       SET visibility_status = 'PAUSED'
       WHERE store_id = 'store-consumer-xuhui'`,
    ).run()
    database.prepare(
      `UPDATE merchant_stores
       SET operating_status = 'CLOSED'
       WHERE id = 'store-consumer-changning'`,
    ).run()
    database.prepare(
      `DELETE FROM consumer_store_locations
       WHERE store_id = 'store-consumer-huangpu'`,
    ).run()
    const response = await nearby({ limit: 20 })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json()
    expect(result.stores.map((store: any) => store.id)).toEqual([
      'store-demo-jingan',
      'store-consumer-huangpu',
    ])
    expect(result.stores[1].coordinates).toBeNull()
    expect(result.map.points.map((point: any) => point.storeId)).toEqual([
      'store-demo-jingan',
    ])
  })

  it('拒绝过期城市或家庭身份上下文以及非消费者角色', async () => {
    const stale = await nearby({
      cityId: 'city-hangzhou',
      householdMemberId: 'household-member-chen-self',
      limit: 20,
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('consumer_nearby_context_stale')

    const denied = await nearby({ limit: 20 }, hqAuthorization)
    expect(denied.statusCode).toBe(403)
  })

  it('拒绝非法坐标与过低质量的位置精度参数', async () => {
    const invalid = await nearby({
      location: {
        latitude: 131.2,
        longitude: 220,
        accuracyMeters: 20_000,
      },
      limit: 20,
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().title).toBe('validation_failed')
  })
})
