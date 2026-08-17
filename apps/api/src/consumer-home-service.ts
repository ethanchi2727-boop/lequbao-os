import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  ConsumerCitySummary,
  ConsumerHomeOverview,
  ConsumerHouseholdMemberSummary,
  ConsumerMessageCategory,
  ConsumerMessageOverview,
  ConsumerMessageSummary,
  ConsumerPreparedCardSummary,
  ConsumerProgressSummary,
  ConsumerSearchOverview,
  ConsumerSearchResultSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-home-e8'
const HOME_POLICY_VERSION = 'consumer-home-policy-v1' as const
const MESSAGE_POLICY_VERSION = 'consumer-message-policy-v1' as const
const SEARCH_POLICY_VERSION = 'consumer-search-policy-v1' as const

interface ProfileRow {
  user_id: string
  tenant_id: string
  display_name: string
  phone_masked: string
  customer_ref: string
  preferred_city_id: string
  active_household_id: string
  active_household_member_id: string
  version: number
  updated_at: string
}

interface CityRow {
  id: string
  name: string
  code: string
  service_level: ConsumerCitySummary['serviceLevel']
  status: 'ACTIVE' | 'PAUSED'
}

interface MemberRow {
  id: string
  name: string
  relation: string
  mode: ConsumerHouseholdMemberSummary['mode']
  avatar_key: string
  subtitle: string
  dietary_notes_json: string
  permissions_json: string
  status: 'ACTIVE' | 'PAUSED'
}

interface MessageRow {
  id: string
  category: ConsumerMessageCategory
  title: string
  body: string
  action_label: string | null
  action_target: string | null
  read_at: string | null
  created_at: string
  version: number
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

interface SearchCandidate {
  id: string
  type: ConsumerSearchResultSummary['type']
  title: string
  subtitle: string
  merchantName: string
  address: string
  category: string
  priceFen: number | null
  compareAtFen: number | null
  distanceMeters: number
  rating: number
  reviewCount: number
  badges: string[]
  tags: string[]
  reason: string
  actionTarget: string
}

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不是消费者本人')
  }
}

function profileFor(database: DatabaseSync, principal: Principal): ProfileRow {
  requireConsumer(principal)
  const row = database.prepare(
    `SELECT user_id, tenant_id, display_name, phone_masked, customer_ref,
            preferred_city_id, active_household_id,
            active_household_member_id, version, updated_at
     FROM consumer_profiles
     WHERE user_id = ? AND tenant_id = ?`,
  ).get(principal.subject, principal.tenantId) as unknown as ProfileRow | undefined
  if (!row) throw new DomainError(404, 'consumer_profile_not_found', '消费者档案不存在')
  return row
}

function citiesFor(
  database: DatabaseSync,
  principal: Principal,
  preferredCityId: string,
): ConsumerCitySummary[] {
  const rows = database.prepare(
    `SELECT id, name, code, service_level, status
     FROM consumer_cities
     WHERE tenant_id = ?
     ORDER BY sort_order, name`,
  ).all(principal.tenantId) as unknown as CityRow[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    serviceLevel: row.service_level,
    available: row.status === 'ACTIVE',
    isCurrent: row.id === preferredCityId,
  }))
}

function householdMembers(
  database: DatabaseSync,
  profile: ProfileRow,
): ConsumerHouseholdMemberSummary[] {
  const rows = database.prepare(
    `SELECT id, name, relation, mode, avatar_key, subtitle,
            dietary_notes_json, permissions_json, status
     FROM consumer_household_members
     WHERE tenant_id = ? AND household_id = ?
     ORDER BY CASE mode WHEN 'SELF' THEN 1 WHEN 'CHILD' THEN 2 ELSE 3 END,
              created_at`,
  ).all(profile.tenant_id, profile.active_household_id) as unknown as MemberRow[]
  return rows.filter(({ status }) => status === 'ACTIVE').map((row) => ({
    id: row.id,
    name: row.name,
    relation: row.relation,
    mode: row.mode,
    avatarKey: row.avatar_key,
    subtitle: row.subtitle,
    dietaryNotes: JSON.parse(row.dietary_notes_json) as string[],
    permissions: JSON.parse(row.permissions_json) as string[],
    isCurrent: row.id === profile.active_household_member_id,
  }))
}

function activeMember(
  members: ConsumerHouseholdMemberSummary[],
): ConsumerHouseholdMemberSummary {
  const member = members.find(({ isCurrent }) => isCurrent)
  if (!member) throw new DomainError(500, 'consumer_context_invalid', '当前家庭身份不存在')
  return member
}

function currentCity(cities: ConsumerCitySummary[]): ConsumerCitySummary {
  const city = cities.find(({ isCurrent }) => isCurrent)
  if (!city) throw new DomainError(500, 'consumer_city_invalid', '当前城市不存在')
  return city
}

function greeting(name: string): string {
  const hour = Number(new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(new Date()).slice(0, 2))
  if (hour < 11) return `早上好，${name}`
  if (hour < 14) return `中午好，${name}`
  if (hour < 18) return `下午好，${name}`
  return `晚上好，${name}`
}

function quickIntents(member: ConsumerHouseholdMemberSummary): ConsumerHomeOverview['quickIntents'] {
  if (member.mode === 'CHILD') {
    return [
      { id: 'family-weekend', label: '周末亲子活动', prompt: '安排一个适合 8 岁孩子的周末下午活动', icon: '乐', tone: 'VIOLET' },
      { id: 'family-food', label: '少辣家庭餐', prompt: '找一家少辣、儿童友好的家庭餐厅', icon: '食', tone: 'MINT' },
      { id: 'family-save', label: '家庭省钱方案', prompt: '比较本周家庭活动可用的权益', icon: '省', tone: 'AMBER' },
    ]
  }
  if (member.mode === 'ELDER') {
    return [
      { id: 'elder-health', label: '附近康养服务', prompt: '找附近适合长辈的康养服务', icon: '康', tone: 'MINT' },
      { id: 'elder-food', label: '低盐少糖餐', prompt: '推荐低盐少糖、环境安静的餐厅', icon: '食', tone: 'VIOLET' },
      { id: 'elder-travel', label: '少步行出行', prompt: '安排一个少步行、可代付款的出行方案', icon: '行', tone: 'AMBER' },
    ]
  }
  return [
    { id: 'tonight-food', label: '今晚吃什么', prompt: '今晚两个人吃饭，想要安静靠窗的位置', icon: '食', tone: 'MINT' },
    { id: 'save-money', label: '帮我省钱', prompt: '看看我快到期的权益，帮我安排最划算的用法', icon: '省', tone: 'AMBER' },
    { id: 'weekend-plan', label: '周末安排', prompt: '为全家安排一个轻松的周末下午', icon: '游', tone: 'VIOLET' },
  ]
}

function preparedCards(
  database: DatabaseSync,
  profile: ProfileRow,
  member: ConsumerHouseholdMemberSummary,
): ConsumerPreparedCardSummary[] {
  const cards: ConsumerPreparedCardSummary[] = []
  const entitlement = database.prepare(
    `SELECT id, title, description, expires_at
     FROM consumer_entitlements
     WHERE tenant_id = ? AND user_id = ? AND household_member_id = ?
       AND status = 'ACTIVE' AND expires_at > ?
     ORDER BY expires_at LIMIT 1`,
  ).get(
    profile.tenant_id,
    profile.user_id,
    member.id,
    now(),
  ) as {
    id: string
    title: string
    description: string
    expires_at: string
  } | undefined
  if (entitlement) {
    cards.push({
      id: entitlement.id,
      kind: 'BENEFIT',
      eyebrow: '即将到期',
      title: entitlement.title,
      description: entitlement.description,
      dueAt: entitlement.expires_at,
      actionLabel: '去使用',
      actionTarget: '/pages/module/index?path=orders/wallet',
      tone: 'AMBER',
    })
  }
  const task = database.prepare(
    `SELECT id, title, detail, due_at, action_target
     FROM consumer_household_tasks
     WHERE tenant_id = ? AND household_id = ? AND status = 'PENDING'
     ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at
     LIMIT 1`,
  ).get(profile.tenant_id, profile.active_household_id) as {
    id: string
    title: string
    detail: string
    due_at: string | null
    action_target: string
  } | undefined
  if (task) {
    cards.push({
      id: task.id,
      kind: 'FAMILY_TASK',
      eyebrow: '家庭待办',
      title: task.title,
      description: task.detail,
      dueAt: task.due_at,
      actionLabel: '去确认',
      actionTarget: task.action_target,
      tone: 'VIOLET',
    })
  }
  const previousOrder = database.prepare(
    `SELECT orders.id, orders.item_summary, stores.name
     FROM merchant_orders orders
     JOIN merchant_stores stores ON stores.id = orders.store_id
     WHERE orders.tenant_id = ? AND orders.customer_phone_masked = ?
       AND orders.status IN ('VERIFIED', 'COMPLETED')
     ORDER BY orders.updated_at DESC LIMIT 1`,
  ).get(profile.tenant_id, profile.phone_masked) as {
    id: string
    item_summary: string
    name: string
  } | undefined
  if (previousOrder) {
    cards.push({
      id: `reorder-${previousOrder.id}`,
      kind: 'REORDER',
      eyebrow: '一键复用',
      title: `再次选择${previousOrder.item_summary}`,
      description: `${previousOrder.name} · 仍会在确认页核对时间、人数与价格`,
      dueAt: null,
      actionLabel: '再来一次',
      actionTarget: `/pages/search/index?query=${encodeURIComponent(previousOrder.item_summary)}`,
      tone: 'CORAL',
    })
  }
  const service = database.prepare(
    `SELECT publications.id, stores.name, publications.recommendation_reason,
            spus.name AS service_name
     FROM consumer_store_publications publications
     JOIN merchant_stores stores ON stores.id = publications.store_id
     JOIN merchant_catalogs catalogs ON catalogs.store_id = stores.id
       AND catalogs.status = 'ACTIVE'
     JOIN merchant_spus spus ON spus.catalog_id = catalogs.id
       AND spus.status = 'ACTIVE'
     WHERE publications.tenant_id = ? AND publications.city_id = ?
       AND publications.visibility_status = 'PUBLISHED'
       AND publications.authorization_scope = 'PLATFORM_DISPLAY'
     ORDER BY publications.rating DESC, spus.sort_order
     LIMIT 1`,
  ).get(profile.tenant_id, profile.preferred_city_id) as {
    id: string
    name: string
    recommendation_reason: string
    service_name: string
  } | undefined
  if (service) {
    cards.push({
      id: `service-${service.id}`,
      kind: 'SERVICE',
      eyebrow: '为你推荐',
      title: service.service_name,
      description: service.recommendation_reason,
      dueAt: null,
      actionLabel: '看看',
      actionTarget: `/pages/search/index?query=${encodeURIComponent(service.service_name)}`,
      tone: 'MINT',
    })
  }
  return cards.slice(0, 4)
}

function progressItems(
  database: DatabaseSync,
  profile: ProfileRow,
): ConsumerProgressSummary[] {
  const rows = database.prepare(
    `SELECT orders.id, orders.order_type, orders.status, orders.item_summary,
            orders.service_at, orders.paid_amount_fen, stores.name
     FROM merchant_orders orders
     JOIN merchant_stores stores ON stores.id = orders.store_id
     WHERE orders.tenant_id = ? AND orders.customer_phone_masked = ?
       AND stores.city_id = ?
       AND orders.status NOT IN ('COMPLETED', 'REFUNDED', 'CANCELLED')
     ORDER BY COALESCE(orders.service_at, orders.updated_at), orders.updated_at DESC
     LIMIT 5`,
  ).all(
    profile.tenant_id,
    profile.phone_masked,
    profile.preferred_city_id,
  ) as unknown as Array<{
    id: string
    order_type: 'RESERVATION' | 'GROUP_BUY' | 'ECOMMERCE'
    status: string
    item_summary: string
    service_at: string | null
    paid_amount_fen: number
    name: string
  }>
  return rows.map((row) => ({
    id: row.id,
    type: row.order_type === 'RESERVATION' ? 'RESERVATION' : 'ORDER',
    status: row.status,
    title: row.item_summary,
    subtitle: row.status === 'PENDING_CONFIRMATION'
      ? '等待商家确认，暂未改变你的支付状态'
      : '订单正在按当前状态推进',
    merchantName: row.name,
    scheduledAt: row.service_at,
    amountFen: row.paid_amount_fen,
    actionLabel: '查看进度',
    actionTarget: `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(row.id)}`,
  }))
}

export function getConsumerHomeOverview(
  database: DatabaseSync,
  principal: Principal,
): ConsumerHomeOverview {
  const profile = profileFor(database, principal)
  const cities = citiesFor(database, principal, profile.preferred_city_id)
  const members = householdMembers(database, profile)
  const member = activeMember(members)
  const city = currentCity(cities)
  const household = database.prepare(
    `SELECT name FROM consumer_households
     WHERE id = ? AND tenant_id = ? AND owner_user_id = ?`,
  ).get(
    profile.active_household_id,
    principal.tenantId,
    principal.subject,
  ) as { name: string } | undefined
  if (!household) throw new DomainError(404, 'consumer_household_not_found', '家庭空间不存在')
  const unread = database.prepare(
    `SELECT COUNT(*) AS count FROM consumer_messages
     WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL`,
  ).get(principal.tenantId, principal.subject) as { count: number }
  const recentRows = database.prepare(
    `SELECT id, code, title, icon, last_used_at, action_target
     FROM consumer_recent_services
     WHERE tenant_id = ? AND user_id = ? AND household_member_id = ?
     ORDER BY last_used_at DESC LIMIT 5`,
  ).all(
    principal.tenantId,
    principal.subject,
    member.id,
  ) as unknown as Array<{
    id: string
    code: string
    title: string
    icon: string
    last_used_at: string
    action_target: string
  }>
  return {
    profile: {
      userId: profile.user_id,
      displayName: profile.display_name,
      phoneMasked: profile.phone_masked,
      greeting: greeting(member.name),
      version: profile.version,
    },
    city,
    cities,
    household: {
      id: profile.active_household_id,
      name: household.name,
      members,
      activeMember: member,
    },
    unreadMessageCount: unread.count,
    quickIntents: quickIntents(member),
    prepared: preparedCards(database, profile, member),
    inProgress: progressItems(database, profile),
    recentServices: recentRows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      icon: row.icon,
      lastUsedAt: row.last_used_at,
      actionTarget: row.action_target,
    })),
    searchHot: member.mode === 'CHILD'
      ? ['亲子手作', '儿童友好餐厅', '周末活动']
      : member.mode === 'ELDER'
        ? ['低盐餐厅', '康养服务', '少步行出行']
        : ['晚餐', '靠窗座', '家庭权益', '周末亲子'],
    policy: {
      version: HOME_POLICY_VERSION,
      selfScopeEnforced: true,
      householdContextExplicit: true,
      locationOptional: true,
      noEstimatedAvailability: true,
    },
    updatedAt: profile.updated_at,
  }
}

function requestReplay<T>(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
): T | null {
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(key, route) as unknown as IdempotencyRow | undefined
  if (!stored) return null
  if (stored.request_hash !== requestHash) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
  }
  database.prepare(
    `UPDATE idempotency_records SET replay_count = replay_count + 1
     WHERE key = ? AND route = ?`,
  ).run(key, route)
  return JSON.parse(stored.response_json) as T
}

function persistReplay(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
  response: unknown,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO idempotency_records
     (key, route, run_id, request_hash, response_json, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(key, route, RUN_ID, requestHash, JSON.stringify(response), timestamp)
}

function recordAction(
  database: DatabaseSync,
  principal: Principal,
  input: {
    action: string
    eventName: string
    entityType: string
    entityId: string
    riskLevel: 'L0' | 'L1'
    summary: string
    payload: Record<string, unknown>
    timestamp: string
    outboxTopic?: string
  },
): void {
  const payloadJson = JSON.stringify(input.payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, 'consumer', ?, ?, ?, ?, 'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    input.action,
    input.entityType,
    input.entityId,
    input.riskLevel,
    input.summary,
    payloadJson,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    input.eventName,
    payloadJson,
    input.timestamp,
  )
  if (input.outboxTopic) {
    database.prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      RUN_ID,
      principal.tenantId,
      input.outboxTopic,
      input.entityId,
      payloadJson,
      input.timestamp,
    )
  }
}

export function updateConsumerContext(
  database: DatabaseSync,
  principal: Principal,
  input: {
    expectedVersion: number
    cityId: string
    householdMemberId: string
  },
  idempotencyKey: string,
): ConsumerHomeOverview {
  const route = '/api/v1/consumer/context'
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerHomeOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay

  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = profileFor(database, principal)
    if (profile.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '家庭上下文已更新，请刷新后重试')
    }
    const city = database.prepare(
      `SELECT id, name FROM consumer_cities
       WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'`,
    ).get(input.cityId, principal.tenantId) as { id: string; name: string } | undefined
    if (!city) throw new DomainError(404, 'consumer_city_not_found', '城市未开放或不存在')
    const member = database.prepare(
      `SELECT members.id, members.name
       FROM consumer_household_members members
       JOIN consumer_households households ON households.id = members.household_id
       WHERE members.id = ? AND members.tenant_id = ? AND members.status = 'ACTIVE'
         AND households.id = ? AND households.owner_user_id = ?`,
    ).get(
      input.householdMemberId,
      principal.tenantId,
      profile.active_household_id,
      principal.subject,
    ) as { id: string; name: string } | undefined
    if (!member) {
      throw new DomainError(404, 'consumer_household_member_not_found', '家庭身份不存在或不属于当前用户')
    }
    const timestamp = now()
    const updated = database.prepare(
      `UPDATE consumer_profiles
       SET preferred_city_id = ?, active_household_member_id = ?,
           version = version + 1, updated_at = ?
       WHERE user_id = ? AND tenant_id = ? AND version = ?`,
    ).run(
      city.id,
      member.id,
      timestamp,
      principal.subject,
      principal.tenantId,
      input.expectedVersion,
    )
    if (updated.changes !== 1) {
      throw new DomainError(409, 'stale_entity_version', '家庭上下文已更新，请刷新后重试')
    }
    const payload = {
      fromCityId: profile.preferred_city_id,
      toCityId: city.id,
      fromMemberId: profile.active_household_member_id,
      toMemberId: member.id,
      profileVersion: profile.version + 1,
      policyVersion: HOME_POLICY_VERSION,
    }
    database.prepare(
      `INSERT INTO consumer_context_events
       (id, tenant_id, user_id, from_city_id, to_city_id, from_member_id,
        to_member_id, actor_id, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      principal.tenantId,
      principal.subject,
      profile.preferred_city_id,
      city.id,
      profile.active_household_member_id,
      member.id,
      principal.subject,
      `已切换到${city.name} · ${member.name}身份`,
      JSON.stringify(payload),
      timestamp,
    )
    recordAction(database, principal, {
      action: 'CONSUMER_CONTEXT_CHANGED',
      eventName: 'consumer_context_changed',
      entityType: 'consumer_profile',
      entityId: principal.subject,
      riskLevel: 'L1',
      summary: '消费者显式切换城市与家庭身份',
      payload,
      timestamp,
      outboxTopic: 'consumer.context.changed.v1',
    })
    const response = getConsumerHomeOverview(database, principal)
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function messageSummary(row: MessageRow): ConsumerMessageSummary {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    actionLabel: row.action_label,
    actionTarget: row.action_target,
    read: row.read_at !== null,
    createdAt: row.created_at,
    version: row.version,
  }
}

export function getConsumerMessages(
  database: DatabaseSync,
  principal: Principal,
  query: {
    category?: ConsumerMessageCategory | undefined
    unreadOnly?: boolean | undefined
  },
): ConsumerMessageOverview {
  profileFor(database, principal)
  const clauses = ['tenant_id = ?', 'user_id = ?']
  const values: Array<string | number> = [principal.tenantId, principal.subject]
  if (query.category) {
    clauses.push('category = ?')
    values.push(query.category)
  }
  if (query.unreadOnly) clauses.push('read_at IS NULL')
  const rows = database.prepare(
    `SELECT id, category, title, body, action_label, action_target,
            read_at, created_at, version
     FROM consumer_messages
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC, id`,
  ).all(...values) as unknown as MessageRow[]
  const all = database.prepare(
    `SELECT category, COUNT(*) AS total,
            SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread
     FROM consumer_messages
     WHERE tenant_id = ? AND user_id = ?
     GROUP BY category`,
  ).all(principal.tenantId, principal.subject) as unknown as Array<{
    category: ConsumerMessageCategory
    total: number
    unread: number
  }>
  const total = all.reduce((sum, row) => sum + row.total, 0)
  const unread = all.reduce((sum, row) => sum + row.unread, 0)
  const categories: Array<ConsumerMessageCategory | 'ALL'> = [
    'ALL', 'TRANSACTION', 'SERVICE', 'FAMILY', 'SYSTEM',
  ]
  return {
    unreadCount: unread,
    categoryCounts: categories.map((category) => {
      if (category === 'ALL') return { category, total, unread }
      const item = all.find((row) => row.category === category)
      return { category, total: item?.total ?? 0, unread: item?.unread ?? 0 }
    }),
    messages: rows.map(messageSummary),
    policy: {
      version: MESSAGE_POLICY_VERSION,
      selfScopeEnforced: true,
      contentImmutable: true,
      readReceiptAudited: true,
    },
    updatedAt: rows[0]?.created_at ?? new Date(0).toISOString(),
  }
}

export function markConsumerMessageRead(
  database: DatabaseSync,
  principal: Principal,
  input: {
    messageId: string
    expectedVersion: number
  },
  idempotencyKey: string,
): ConsumerMessageOverview {
  const route = `/api/v1/consumer/messages/${input.messageId}/read`
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerMessageOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay

  database.exec('BEGIN IMMEDIATE;')
  try {
    profileFor(database, principal)
    const message = database.prepare(
      `SELECT id, version, read_at FROM consumer_messages
       WHERE id = ? AND tenant_id = ? AND user_id = ?`,
    ).get(
      input.messageId,
      principal.tenantId,
      principal.subject,
    ) as { id: string; version: number; read_at: string | null } | undefined
    if (!message) throw new DomainError(404, 'consumer_message_not_found', '消息不存在')
    if (message.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '消息状态已更新，请刷新后重试')
    }
    const timestamp = now()
    if (message.read_at === null) {
      database.prepare(
        `UPDATE consumer_messages
         SET read_at = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      ).run(timestamp, message.id, input.expectedVersion)
      recordAction(database, principal, {
        action: 'CONSUMER_MESSAGE_READ',
        eventName: 'consumer_message_read',
        entityType: 'consumer_message',
        entityId: message.id,
        riskLevel: 'L0',
        summary: '消费者消息已读状态已记录',
        payload: {
          messageId: message.id,
          policyVersion: MESSAGE_POLICY_VERSION,
        },
        timestamp,
      })
    }
    const response = getConsumerMessages(database, principal, {})
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function searchCandidates(
  database: DatabaseSync,
  profile: ProfileRow,
): SearchCandidate[] {
  const publications = database.prepare(
    `SELECT publications.id, publications.merchant_id, publications.store_id,
            publications.category, publications.rating,
            publications.review_count, publications.distance_meters,
            publications.recommendation_reason, publications.badges_json,
            publications.tags_json, stores.name, stores.address,
            stores.business_hours
     FROM consumer_store_publications publications
     JOIN merchant_stores stores ON stores.id = publications.store_id
     WHERE publications.tenant_id = ? AND publications.city_id = ?
       AND publications.visibility_status = 'PUBLISHED'
       AND publications.authorization_scope = 'PLATFORM_DISPLAY'
       AND stores.operating_status = 'OPEN'
     ORDER BY publications.rating DESC, publications.review_count DESC`,
  ).all(
    profile.tenant_id,
    profile.preferred_city_id,
  ) as unknown as Array<{
    id: string
    merchant_id: string
    store_id: string
    category: string
    rating: number
    review_count: number
    distance_meters: number
    recommendation_reason: string
    badges_json: string
    tags_json: string
    name: string
    address: string
    business_hours: string
  }>
  const result: SearchCandidate[] = []
  for (const publication of publications) {
    const skuPrice = database.prepare(
      `SELECT MIN(skus.price_fen) AS price_fen,
              MIN(skus.compare_at_fen) AS compare_at_fen
       FROM merchant_catalogs catalogs
       JOIN merchant_spus spus ON spus.catalog_id = catalogs.id
       JOIN merchant_skus skus ON skus.spu_id = spus.id
       WHERE catalogs.store_id = ? AND catalogs.status = 'ACTIVE'
         AND spus.status = 'ACTIVE'
         AND skus.status IN ('ACTIVE', 'OUT_OF_STOCK')`,
    ).get(publication.store_id) as {
      price_fen: number | null
      compare_at_fen: number | null
    }
    const badges = JSON.parse(publication.badges_json) as string[]
    const tags = JSON.parse(publication.tags_json) as string[]
    result.push({
      id: publication.store_id,
      type: 'MERCHANT',
      title: publication.name,
      subtitle: `${publication.business_hours} · ${(publication.distance_meters / 1000).toFixed(1)}km`,
      merchantName: publication.name,
      address: publication.address,
      category: publication.category,
      priceFen: skuPrice.price_fen,
      compareAtFen: skuPrice.compare_at_fen,
      distanceMeters: publication.distance_meters,
      rating: publication.rating,
      reviewCount: publication.review_count,
      badges,
      tags,
      reason: publication.recommendation_reason,
      actionTarget: `/pages/store/index?storeId=${encodeURIComponent(publication.store_id)}`,
    })
    const products = database.prepare(
      `SELECT spus.id, spus.spu_type, spus.name, spus.category,
              spus.description, skus.price_fen, skus.compare_at_fen,
              skus.status
       FROM merchant_catalogs catalogs
       JOIN merchant_spus spus ON spus.catalog_id = catalogs.id
         AND spus.status = 'ACTIVE'
       JOIN merchant_skus skus ON skus.id = (
         SELECT candidate.id FROM merchant_skus candidate
         WHERE candidate.spu_id = spus.id
           AND candidate.status IN ('ACTIVE', 'OUT_OF_STOCK')
         ORDER BY CASE candidate.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
                  candidate.price_fen, candidate.id
         LIMIT 1
       )
       WHERE catalogs.store_id = ? AND catalogs.status = 'ACTIVE'
       ORDER BY spus.sort_order, spus.name`,
    ).all(publication.store_id) as unknown as Array<{
      id: string
      spu_type: 'PRODUCT' | 'SERVICE' | 'PACKAGE'
      name: string
      category: string
      description: string
      price_fen: number
      compare_at_fen: number | null
      status: 'ACTIVE' | 'OUT_OF_STOCK'
    }>
    for (const product of products) {
      result.push({
        id: product.id,
        type: product.spu_type === 'PRODUCT' ? 'PRODUCT' : 'SERVICE',
        title: product.name,
        subtitle: product.description,
        merchantName: publication.name,
        address: publication.address,
        category: product.category,
        priceFen: product.price_fen,
        compareAtFen: product.compare_at_fen,
        distanceMeters: publication.distance_meters,
        rating: publication.rating,
        reviewCount: publication.review_count,
        badges: product.status === 'OUT_OF_STOCK'
          ? [...badges, '暂时售罄']
          : badges,
        tags: [...tags, product.name, product.category, product.description],
        reason: product.status === 'OUT_OF_STOCK'
          ? '商品暂时售罄，页面不会伪造可用库存。'
          : publication.recommendation_reason,
        actionTarget: `/pages/store/index?storeId=${encodeURIComponent(publication.store_id)}&spuId=${encodeURIComponent(product.id)}`,
      })
    }
  }
  return result
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ')
}

function relevance(candidate: SearchCandidate, normalizedQuery: string): number {
  if (!normalizedQuery) return candidate.rating * 10
  const title = candidate.title.toLocaleLowerCase('zh-CN')
  const merchant = candidate.merchantName.toLocaleLowerCase('zh-CN')
  const category = candidate.category.toLocaleLowerCase('zh-CN')
  const text = [
    candidate.subtitle,
    candidate.address,
    candidate.reason,
    ...candidate.tags,
  ].join(' ').toLocaleLowerCase('zh-CN')
  let score = 0
  if (title === normalizedQuery) score += 160
  if (title.includes(normalizedQuery)) score += 100
  if (merchant.includes(normalizedQuery)) score += 70
  if (category.includes(normalizedQuery)) score += 60
  if (text.includes(normalizedQuery)) score += 35
  return score + candidate.rating
}

function recentQueries(
  database: DatabaseSync,
  principal: Principal,
): string[] {
  const rows = database.prepare(
    `SELECT query FROM consumer_search_history
     WHERE user_id = ? AND tenant_id = ?
     ORDER BY sequence DESC LIMIT 20`,
  ).all(principal.subject, principal.tenantId) as unknown as Array<{ query: string }>
  return [...new Set(rows.map(({ query }) => query))].slice(0, 6)
}

export function executeConsumerSearch(
  database: DatabaseSync,
  principal: Principal,
  input: {
    query: string
    cityId?: string | undefined
    householdMemberId?: string | undefined
    limit: number
  },
  idempotencyKey: string,
): ConsumerSearchOverview {
  const route = '/api/v1/consumer/search'
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerSearchOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay

  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = profileFor(database, principal)
    if (input.cityId && input.cityId !== profile.preferred_city_id) {
      throw new DomainError(409, 'consumer_search_context_stale', '搜索城市与当前家庭上下文不一致')
    }
    if (
      input.householdMemberId
      && input.householdMemberId !== profile.active_household_member_id
    ) {
      throw new DomainError(409, 'consumer_search_context_stale', '搜索身份与当前家庭上下文不一致')
    }
    const cities = citiesFor(database, principal, profile.preferred_city_id)
    const city = currentCity(cities)
    const member = activeMember(householdMembers(database, profile))
    const normalizedQuery = normalizeSearchQuery(input.query)
    const candidates = searchCandidates(database, profile)
    const ranked = candidates
      .map((candidate) => ({ candidate, score: relevance(candidate, normalizedQuery) }))
      .filter(({ score }) => normalizedQuery.length === 0 || score > 5)
      .sort((left, right) =>
        right.score - left.score
        || left.candidate.distanceMeters - right.candidate.distanceMeters
        || left.candidate.title.localeCompare(right.candidate.title, 'zh-CN'))
      .slice(0, input.limit)
      .map(({ candidate }) => candidate)
    const timestamp = now()
    database.prepare(
      `INSERT INTO consumer_search_history
       (id, tenant_id, user_id, household_member_id, city_id, query,
        normalized_query, result_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      principal.tenantId,
      principal.subject,
      member.id,
      city.id,
      input.query.trim(),
      normalizedQuery,
      ranked.length,
      timestamp,
    )
    const typeCounts: ConsumerSearchOverview['typeCounts'] = [
      { type: 'ALL', count: ranked.length },
      ...(['MERCHANT', 'SERVICE', 'PRODUCT'] as const).map((type) => ({
        type,
        count: ranked.filter((item) => item.type === type).length,
      })),
    ]
    const response: ConsumerSearchOverview = {
      query: input.query.trim(),
      normalizedQuery,
      city,
      activeMember: member,
      resultCount: ranked.length,
      results: ranked.map(({ tags: _tags, ...candidate }) => candidate),
      typeCounts,
      recentQueries: recentQueries(database, principal),
      suggestedQueries: member.mode === 'CHILD'
        ? ['亲子手作', '儿童友好餐厅', '周末活动']
        : member.mode === 'ELDER'
          ? ['低盐餐厅', '康养服务', '少步行出行']
          : ['晚餐', '靠窗', '主厨席', '家庭聚餐'],
      policy: {
        version: SEARCH_POLICY_VERSION,
        publishedStoresOnly: true,
        platformDisplayAuthorizationRequired: true,
        activeCatalogOnly: true,
        queryPrivateToUser: true,
        noPaidRanking: true,
      },
      searchedAt: timestamp,
    }
    const queryHash = createHash('sha256').update(normalizedQuery).digest('hex')
    recordAction(database, principal, {
      action: 'CONSUMER_SEARCH_EXECUTED',
      eventName: 'consumer_search_executed',
      entityType: 'consumer_search',
      entityId: principal.subject,
      riskLevel: 'L0',
      summary: '消费者完成一次授权内容搜索',
      payload: {
        queryHash,
        queryLength: normalizedQuery.length,
        cityId: city.id,
        householdMode: member.mode,
        resultCount: ranked.length,
        policyVersion: SEARCH_POLICY_VERSION,
      },
      timestamp,
    })
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
