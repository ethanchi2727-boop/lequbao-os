import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`

describe('E8 乐趣生活首页、家庭身份、消息与搜索', () => {
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

  async function getHome(authorization = consumerAuthorization) {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/home',
      headers: { authorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  it('首页只返回本人家庭上下文、真实进度、待办和最近服务', async () => {
    const home = await getHome()
    expect(home.profile).toMatchObject({
      userId: 'user-demo-consumer',
      displayName: '陈知夏',
      version: 1,
    })
    expect(home.city).toMatchObject({ id: 'city-shanghai', name: '上海', isCurrent: true })
    expect(home.cities).toHaveLength(3)
    expect(home.household).toMatchObject({
      id: 'household-chen',
      name: '知夏一家',
      activeMember: { id: 'household-member-chen-self', mode: 'SELF' },
    })
    expect(home.household.members).toHaveLength(3)
    expect(home.unreadMessageCount).toBe(3)
    expect(home.quickIntents).toHaveLength(3)
    expect(home.prepared.length).toBeGreaterThanOrEqual(3)
    expect(home.inProgress[0]).toMatchObject({
      type: 'RESERVATION',
      merchantName: '云和里·静安店',
    })
    expect(home.recentServices).toHaveLength(4)
    expect(home.policy).toEqual({
      version: 'consumer-home-policy-v1',
      selfScopeEnforced: true,
      householdContextExplicit: true,
      locationOptional: true,
      noEstimatedAvailability: true,
    })
  })

  it('显式切换城市和儿童身份，使用乐观锁并支持幂等重放', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/consumer/context',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:context:child-hangzhou',
      },
      payload: {
        expectedVersion: 1,
        cityId: 'city-hangzhou',
        householdMemberId: 'household-member-chen-child',
      },
    }
    const changed = await app.inject(request)
    expect(changed.statusCode, changed.body).toBe(200)
    expect(changed.json()).toMatchObject({
      profile: { version: 2 },
      city: { id: 'city-hangzhou', name: '杭州' },
      household: { activeMember: { name: '安安', mode: 'CHILD' } },
    })
    expect(changed.json().quickIntents[0].label).toBe('周末亲子活动')

    const replay = await app.inject(request)
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(changed.body)
    const contextEvents = database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_context_events',
    ).get() as { count: number }
    expect(contextEvents.count).toBe(1)

    const stale = await app.inject({
      ...request,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:context:stale',
      },
      payload: {
        ...request.payload,
        cityId: 'city-suzhou',
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
  })

  it('拒绝切换到不属于本人家庭的身份', async () => {
    database.prepare(
      `INSERT INTO users (id, display_name, status, created_at)
       VALUES ('user-other-consumer', '其他消费者', 'ACTIVE', ?)`,
    ).run(new Date().toISOString())
    database.prepare(
      `INSERT INTO consumer_households
       (id, tenant_id, owner_user_id, name, default_city_id, version, created_at, updated_at)
       VALUES ('household-other', 'tenant-lequ', 'user-other-consumer',
               '其他家庭', 'city-shanghai', 1, ?, ?)`,
    ).run(new Date().toISOString(), new Date().toISOString())
    database.prepare(
      `INSERT INTO consumer_household_members
       (id, tenant_id, household_id, linked_user_id, name, relation, mode,
        avatar_key, subtitle, dietary_notes_json, permissions_json, status,
        created_at, updated_at)
       VALUES ('household-member-other', 'tenant-lequ', 'household-other',
               'user-other-consumer', '他人', '本人', 'SELF', 'OT', '他人身份',
               '[]', '[]', 'ACTIVE', ?, ?)`,
    ).run(new Date().toISOString(), new Date().toISOString())

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/context',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:context:foreign',
      },
      payload: {
        expectedVersion: 1,
        cityId: 'city-shanghai',
        householdMemberId: 'household-member-other',
      },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().title).toBe('consumer_household_member_not_found')
  })

  it('消息按本人和分类过滤，已读写入审计且内容不可篡改', async () => {
    const unread = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/messages?category=FAMILY&unreadOnly=true',
      headers: { authorization: consumerAuthorization },
    })
    expect(unread.statusCode, unread.body).toBe(200)
    expect(unread.json()).toMatchObject({
      unreadCount: 3,
      policy: {
        version: 'consumer-message-policy-v1',
        selfScopeEnforced: true,
        contentImmutable: true,
        readReceiptAudited: true,
      },
    })
    expect(unread.json().messages).toEqual([
      expect.objectContaining({
        id: 'consumer-message-family',
        category: 'FAMILY',
        read: false,
        version: 1,
      }),
    ])

    const readRequest = {
      method: 'POST' as const,
      url: '/api/v1/consumer/messages/consumer-message-family/read',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:message:family:read',
      },
      payload: { expectedVersion: 1 },
    }
    const read = await app.inject(readRequest)
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().unreadCount).toBe(2)
    expect(read.json().messages.find((message: any) =>
      message.id === 'consumer-message-family')).toMatchObject({ read: true, version: 2 })
    const replay = await app.inject(readRequest)
    expect(replay.body).toBe(read.body)

    const audit = database.prepare(
      `SELECT action, entity_id FROM audit_events
       WHERE run_id = 'consumer-home-e8' AND action = 'CONSUMER_MESSAGE_READ'`,
    ).get() as { action: string; entity_id: string }
    expect(audit).toEqual({
      action: 'CONSUMER_MESSAGE_READ',
      entity_id: 'consumer-message-family',
    })
    expect(() => database.exec(
      "UPDATE consumer_messages SET body = 'tampered' WHERE id = 'consumer-message-family'",
    )).toThrowError(/immutable/)
  })

  it('搜索只展示已发布且拥有平台展示授权的真实门店目录', async () => {
    database.prepare(
      `UPDATE consumer_store_publications
       SET visibility_status = 'PAUSED'
       WHERE id = 'consumer-publication-yunheli'`,
    ).run()
    const hidden = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/search',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:search:hidden',
      },
      payload: {
        query: '晚餐',
        cityId: 'city-shanghai',
        householdMemberId: 'household-member-chen-self',
        limit: 20,
      },
    })
    expect(hidden.statusCode, hidden.body).toBe(200)
    expect(hidden.json().resultCount).toBe(0)
    database.prepare(
      `UPDATE consumer_store_publications
       SET visibility_status = 'PUBLISHED'
       WHERE id = 'consumer-publication-yunheli'`,
    ).run()

    const request = {
      method: 'POST' as const,
      url: '/api/v1/consumer/search',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:search:dinner',
      },
      payload: {
        query: '晚餐',
        cityId: 'city-shanghai',
        householdMemberId: 'household-member-chen-self',
        limit: 20,
      },
    }
    const searched = await app.inject(request)
    expect(searched.statusCode, searched.body).toBe(200)
    expect(searched.json()).toMatchObject({
      query: '晚餐',
      city: { id: 'city-shanghai' },
      activeMember: { id: 'household-member-chen-self' },
      policy: {
        version: 'consumer-search-policy-v1',
        publishedStoresOnly: true,
        platformDisplayAuthorizationRequired: true,
        activeCatalogOnly: true,
        queryPrivateToUser: true,
        noPaidRanking: true,
      },
    })
    expect(searched.json().resultCount).toBeGreaterThan(0)
    expect(searched.json().results.every((result: any) =>
      result.merchantName === '云和里·静安店')).toBe(true)

    const replay = await app.inject(request)
    expect(replay.body).toBe(searched.body)
    const history = database.prepare(
      `SELECT COUNT(*) AS count FROM consumer_search_history
       WHERE user_id = 'user-demo-consumer' AND query = '晚餐'`,
    ).get() as { count: number }
    expect(history.count).toBe(2)

    const audit = database.prepare(
      `SELECT payload_json FROM audit_events
       WHERE run_id = 'consumer-home-e8' AND action = 'CONSUMER_SEARCH_EXECUTED'`,
    ).get() as { payload_json: string }
    expect(audit.payload_json).not.toContain('"query"')
    expect(audit.payload_json).not.toContain('晚餐')
    const searchOutbox = database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE run_id = 'consumer-home-e8' AND topic LIKE 'consumer.search%'`,
    ).get() as { count: number }
    expect(searchOutbox.count).toBe(0)
  })

  it('消费者权限与总部权限严格隔离，搜索上下文必须与当前版本一致', async () => {
    const hqDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/home',
      headers: { authorization: hqAuthorization },
    })
    expect(hqDenied.statusCode).toBe(403)
    expect(hqDenied.json().title).toBe('consumer_identity_required')

    const merchantDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/catalog/overview',
      headers: { authorization: consumerAuthorization },
    })
    expect(merchantDenied.statusCode).toBe(403)

    const staleSearch = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/search',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:search:stale-city',
      },
      payload: {
        query: '晚餐',
        cityId: 'city-hangzhou',
        householdMemberId: 'household-member-chen-self',
        limit: 20,
      },
    })
    expect(staleSearch.statusCode).toBe(409)
    expect(staleSearch.json().title).toBe('consumer_search_context_stale')

    const validSearch = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/search',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'e8:consumer:search:append-only-fixture',
      },
      payload: {
        query: '晚餐',
        cityId: 'city-shanghai',
        householdMemberId: 'household-member-chen-self',
        limit: 20,
      },
    })
    expect(validSearch.statusCode, validSearch.body).toBe(200)
    expect(() => database.exec(
      "UPDATE consumer_search_history SET query = 'tampered'",
    )).toThrowError(/append-only/)
  })
})
