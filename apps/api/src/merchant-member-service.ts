import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { canAccessResource, type Principal } from '@lequ/auth'
import type {
  MerchantMemberBenefitSummary,
  MerchantMemberOverview,
  MerchantMemberSummary,
  MerchantMemberTimelineItem,
  MerchantRecallTaskSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'merchant-member-e5'
const SEGMENT_RULE_VERSION = 'member-segment-v1'
const PREDICTION_MODEL_VERSION = 'repurchase-local-v1'
const BENEFIT_RULE_VERSION = 'member-benefit-v1'

interface StoreRow {
  id: string
  tenant_id: string
  merchant_id: string
  city_id: string
  name: string
}

interface MemberRow {
  id: string
  store_id: string
  display_name: string
  phone_masked: string
  segment: MerchantMemberSummary['segment']
  tags_json: string
  order_count: number
  lifetime_value_fen: number
  average_ticket_fen: number
  repurchase_probability: number
  churn_risk: MerchantMemberSummary['churnRisk']
  prediction_reasons_json: string
  marketing_consent: number
  joined_at: string
  last_visit_at: string | null
  version: number
  updated_at: string
}

interface TimelineRow {
  id: string
  member_id: string
  type: MerchantMemberTimelineItem['type']
  title: string
  detail: string
  amount_fen: number | null
  source: string
  occurred_at: string
}

interface BenefitRow {
  id: string
  member_id: string
  kind: MerchantMemberBenefitSummary['kind']
  title: string
  value_fen: number
  status: MerchantMemberBenefitSummary['status']
  rule_version: string
  expires_at: string
  granted_at: string
}

interface RecallTaskRow {
  id: string
  store_id: string
  name: string
  channel: MerchantRecallTaskSummary['channel']
  status: MerchantRecallTaskSummary['status']
  member_ids_json: string
  audience_count: number
  excluded_no_consent_count: number
  content: string
  reason: string
  segment_rule_version: string
  prediction_model_version: string
  approval_confirmed: number
  scheduled_at: string
  created_at: string
  version: number
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function getStore(database: DatabaseSync, principal: Principal): StoreRow {
  const rows = database.prepare(
    `SELECT id, tenant_id, merchant_id, city_id, name
     FROM merchant_stores WHERE tenant_id = ? ORDER BY updated_at DESC`,
  ).all(principal.tenantId) as unknown as StoreRow[]
  const row = rows.find((candidate) => canAccessResource(principal, {
    tenantId: candidate.tenant_id,
    cityId: candidate.city_id,
    merchantId: candidate.merchant_id,
    storeId: candidate.id,
  }))
  if (!row) throw new DomainError(404, 'merchant_store_not_found', '当前数据范围内没有可访问的经营门店')
  return row
}

function getMember(
  database: DatabaseSync,
  principal: Principal,
  memberId: string,
): MemberRow {
  const store = getStore(database, principal)
  const row = database.prepare(
    `SELECT id, store_id, display_name, phone_masked, segment, tags_json,
            order_count, lifetime_value_fen, average_ticket_fen,
            repurchase_probability, churn_risk, prediction_reasons_json,
            marketing_consent, joined_at, last_visit_at, version, updated_at
     FROM merchant_members WHERE id = ? AND store_id = ?`,
  ).get(memberId, store.id) as unknown as MemberRow | undefined
  if (!row) throw new DomainError(404, 'merchant_member_not_found', '会员不存在或不在当前门店范围')
  return row
}

function memberSummary(row: MemberRow): MerchantMemberSummary {
  return {
    id: row.id,
    storeId: row.store_id,
    displayName: row.display_name,
    phoneMasked: row.phone_masked,
    segment: row.segment,
    tags: JSON.parse(row.tags_json) as string[],
    orderCount: row.order_count,
    lifetimeValueFen: row.lifetime_value_fen,
    averageTicketFen: row.average_ticket_fen,
    repurchaseProbability: row.repurchase_probability,
    churnRisk: row.churn_risk,
    predictionReasons: JSON.parse(row.prediction_reasons_json) as string[],
    marketingConsent: row.marketing_consent === 1,
    joinedAt: row.joined_at,
    lastVisitAt: row.last_visit_at,
    version: row.version,
  }
}

function recallSummary(row: RecallTaskRow): MerchantRecallTaskSummary {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    channel: row.channel,
    status: row.status,
    audienceCount: row.audience_count,
    excludedNoConsentCount: row.excluded_no_consent_count,
    memberIds: JSON.parse(row.member_ids_json) as string[],
    content: row.content,
    reason: row.reason,
    segmentRuleVersion: row.segment_rule_version,
    predictionModelVersion: row.prediction_model_version,
    approvalConfirmed: row.approval_confirmed === 1,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    version: row.version,
  }
}

export function getMerchantMemberOverview(
  database: DatabaseSync,
  principal: Principal,
  focusMemberId?: string,
): MerchantMemberOverview {
  const store = getStore(database, principal)
  const rows = database.prepare(
    `SELECT id, store_id, display_name, phone_masked, segment, tags_json,
            order_count, lifetime_value_fen, average_ticket_fen,
            repurchase_probability, churn_risk, prediction_reasons_json,
            marketing_consent, joined_at, last_visit_at, version, updated_at
     FROM merchant_members WHERE store_id = ?
     ORDER BY
       CASE segment WHEN 'HIGH_VALUE' THEN 1 WHEN 'DORMANT' THEN 2
                    WHEN 'ACTIVE' THEN 3 ELSE 4 END,
       lifetime_value_fen DESC, updated_at DESC`,
  ).all(store.id) as unknown as MemberRow[]
  const members = rows.map(memberSummary)
  const focusMember = focusMemberId
    ? members.find((member) => member.id === focusMemberId) ?? null
    : null
  if (focusMemberId && !focusMember) {
    throw new DomainError(404, 'merchant_member_not_found', '会员不存在或不在当前门店范围')
  }
  const timelineRows = focusMember ? database.prepare(
    `SELECT id, member_id, type, title, detail, amount_fen, source, occurred_at
     FROM merchant_member_timeline WHERE member_id = ?
     ORDER BY occurred_at DESC, sequence DESC LIMIT 50`,
  ).all(focusMember.id) as unknown as TimelineRow[] : []
  const benefitRows = focusMember ? database.prepare(
    `SELECT id, member_id, kind, title, value_fen, status, rule_version,
            expires_at, granted_at
     FROM merchant_member_benefits WHERE member_id = ?
     ORDER BY granted_at DESC`,
  ).all(focusMember.id) as unknown as BenefitRow[] : []
  const recallRows = database.prepare(
    `SELECT id, store_id, name, channel, status, member_ids_json, audience_count,
            excluded_no_consent_count, content, reason, segment_rule_version,
            prediction_model_version, approval_confirmed, scheduled_at, created_at, version
     FROM merchant_member_recall_tasks WHERE store_id = ?
     ORDER BY created_at DESC LIMIT 20`,
  ).all(store.id) as unknown as RecallTaskRow[]
  const updatedAt = [
    ...rows.map((row) => row.updated_at),
    ...recallRows.map((row) => row.created_at),
  ].sort().at(-1) ?? now()
  const totalProbability = rows.reduce((sum, row) => sum + row.repurchase_probability, 0)
  return {
    store: { id: store.id, name: store.name },
    metrics: {
      totalMembers: rows.length,
      newMembers: rows.filter((row) => row.segment === 'NEW').length,
      activeMembers: rows.filter((row) => row.segment === 'ACTIVE').length,
      dormantMembers: rows.filter((row) => row.segment === 'DORMANT').length,
      highValueMembers: rows.filter((row) => row.segment === 'HIGH_VALUE').length,
      consentedMembers: rows.filter((row) => row.marketing_consent === 1).length,
      averageRepurchaseProbability: rows.length
        ? Math.round(totalProbability / rows.length * 10) / 10
        : 0,
      atRiskValueFen: rows
        .filter((row) => row.churn_risk === 'HIGH')
        .reduce((sum, row) => sum + row.lifetime_value_fen, 0),
    },
    segmentRuleVersion: SEGMENT_RULE_VERSION,
    predictionModelVersion: PREDICTION_MODEL_VERSION,
    members,
    focusMember,
    timeline: timelineRows.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      type: row.type,
      title: row.title,
      detail: row.detail,
      amountFen: row.amount_fen,
      source: row.source,
      occurredAt: row.occurred_at,
    })),
    benefits: benefitRows.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      kind: row.kind,
      title: row.title,
      valueFen: row.value_fen,
      status: row.status,
      ruleVersion: row.rule_version,
      expiresAt: row.expires_at,
      grantedAt: row.granted_at,
    })),
    recallTasks: recallRows.map(recallSummary),
    updatedAt,
  }
}

function recordMemberEvent(
  database: DatabaseSync,
  principal: Principal,
  store: StoreRow,
  input: {
    memberId: string | null
    entityId: string
    entityType: string
    type: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  const payloadJson = JSON.stringify(input.payload)
  const riskLevel = typeof input.payload.riskLevel === 'string'
    ? input.payload.riskLevel
    : 'L1'
  database.prepare(
    `INSERT INTO merchant_member_events
     (id, tenant_id, merchant_id, store_id, member_id, actor_id, type,
      summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, store.merchant_id, store.id,
    input.memberId, principal.subject, input.type, input.summary,
    payloadJson, input.timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    input.type, input.entityType, input.entityId, riskLevel, input.summary,
    payloadJson, input.timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, input.type, payloadJson, input.timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `merchant.member.${input.type.toLowerCase()}.v1`,
    input.entityId, payloadJson, input.timestamp,
  )
}

function idempotentMemberMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string | undefined,
): MerchantMemberOverview {
  const requestHash = hash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== requestHash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1
       WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as MerchantMemberOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const focusMemberId = operation()
    const overview = getMerchantMemberOverview(database, principal, focusMemberId)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, requestHash, JSON.stringify(overview), now())
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function updateMemberTags(
  database: DatabaseSync,
  principal: Principal,
  input: { memberId: string; expectedVersion: number; tags: string[] },
  idempotencyKey: string,
): MerchantMemberOverview {
  const route = `/api/v1/merchant/members/${input.memberId}/tags`
  return idempotentMemberMutation(database, principal, idempotencyKey, route, input, () => {
    const store = getStore(database, principal)
    const member = getMember(database, principal, input.memberId)
    if (member.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '会员画像已更新，请刷新后重试')
    }
    const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))]
    if (tags.length > 8) throw new DomainError(409, 'member_tags_limit', '单个会员最多保留 8 个标签')
    const previousTags = JSON.parse(member.tags_json) as string[]
    const timestamp = now()
    database.prepare(
      `UPDATE merchant_members SET tags_json = ?, version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(tags), timestamp, member.id)
    database.prepare(
      `INSERT INTO merchant_member_timeline
       (id, tenant_id, merchant_id, store_id, member_id, type, title, detail,
        amount_fen, source, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'TAG_CHANGED', '会员标签已更新', ?, NULL,
        'MERCHANT', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, store.merchant_id, store.id, member.id,
      `${previousTags.join('、') || '无'} → ${tags.join('、') || '无'}`,
      timestamp, timestamp,
    )
    recordMemberEvent(database, principal, store, {
      memberId: member.id,
      entityId: member.id,
      entityType: 'merchant_member',
      type: 'MEMBER_TAGS_UPDATED',
      summary: '会员标签已版本化更新',
      payload: { previousTags, tags, riskLevel: 'L1' },
      timestamp,
    })
    return member.id
  })
}

export function grantMemberBenefit(
  database: DatabaseSync,
  principal: Principal,
  input: {
    memberId: string
    expectedVersion: number
    kind: MerchantMemberBenefitSummary['kind']
    title: string
    valueFen: number
    expiresAt: string
    confirmed: boolean
  },
  idempotencyKey: string,
): MerchantMemberOverview {
  const route = `/api/v1/merchant/members/${input.memberId}/benefits`
  return idempotentMemberMutation(database, principal, idempotencyKey, route, input, () => {
    const store = getStore(database, principal)
    const member = getMember(database, principal, input.memberId)
    if (member.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '会员画像已更新，请刷新后重试')
    }
    if (!input.confirmed) {
      throw new DomainError(409, 'merchant_confirmation_required', '发放会员权益会形成真实履约责任，请先确认权益内容与有效期')
    }
    if (new Date(input.expiresAt).getTime() <= Date.now()) {
      throw new DomainError(409, 'benefit_expiry_invalid', '会员权益到期时间必须晚于当前时间')
    }
    const timestamp = now()
    const benefitId = randomUUID()
    database.prepare(
      `INSERT INTO merchant_member_benefits
       (id, tenant_id, merchant_id, store_id, member_id, kind, title, value_fen,
        status, rule_version, expires_at, granted_by, granted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)`,
    ).run(
      benefitId, principal.tenantId, store.merchant_id, store.id, member.id,
      input.kind, input.title, input.valueFen, BENEFIT_RULE_VERSION,
      input.expiresAt, principal.subject, timestamp, timestamp, timestamp,
    )
    database.prepare(
      `UPDATE merchant_members SET version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, member.id)
    database.prepare(
      `INSERT INTO merchant_member_timeline
       (id, tenant_id, merchant_id, store_id, member_id, type, title, detail,
        amount_fen, source, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'BENEFIT_GRANTED', ?, ?, ?, 'MERCHANT', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, store.merchant_id, store.id, member.id,
      '会员权益已发放', `${input.title} · ${BENEFIT_RULE_VERSION}`,
      input.valueFen, timestamp, timestamp,
    )
    recordMemberEvent(database, principal, store, {
      memberId: member.id,
      entityId: benefitId,
      entityType: 'merchant_member_benefit',
      type: 'MEMBER_BENEFIT_GRANTED',
      summary: '会员权益已强确认发放',
      payload: {
        memberId: member.id,
        kind: input.kind,
        title: input.title,
        valueFen: input.valueFen,
        expiresAt: input.expiresAt,
        ruleVersion: BENEFIT_RULE_VERSION,
        confirmationCaptured: true,
        riskLevel: 'L2',
      },
      timestamp,
    })
    return member.id
  })
}

export function createMemberRecallTask(
  database: DatabaseSync,
  principal: Principal,
  input: {
    name: string
    memberIds: string[]
    channel: MerchantRecallTaskSummary['channel']
    content: string
    reason: string
    scheduledAt: string
    confirmed: boolean
  },
  idempotencyKey: string,
): MerchantMemberOverview {
  return idempotentMemberMutation(
    database, principal, idempotencyKey, '/api/v1/merchant/members/recall-tasks', input, () => {
      const store = getStore(database, principal)
      if (!input.confirmed) {
        throw new DomainError(409, 'merchant_confirmation_required', '召回任务涉及会员触达，请确认人群、授权、内容与计划时间')
      }
      if (new Date(input.scheduledAt).getTime() <= Date.now()) {
        throw new DomainError(409, 'recall_schedule_invalid', '召回计划时间必须晚于当前时间')
      }
      const requestedIds = [...new Set(input.memberIds)]
      const placeholders = requestedIds.map(() => '?').join(',')
      const rows = requestedIds.length ? database.prepare(
        `SELECT id, store_id, display_name, phone_masked, segment, tags_json,
                order_count, lifetime_value_fen, average_ticket_fen,
                repurchase_probability, churn_risk, prediction_reasons_json,
                marketing_consent, joined_at, last_visit_at, version, updated_at
         FROM merchant_members WHERE store_id = ? AND id IN (${placeholders})`,
      ).all(store.id, ...requestedIds) as unknown as MemberRow[] : []
      if (rows.length !== requestedIds.length) {
        throw new DomainError(404, 'merchant_member_not_found', '召回人群包含不存在或越权的会员')
      }
      const eligible = rows.filter((row) => row.marketing_consent === 1)
      const excluded = rows.length - eligible.length
      if (!eligible.length) {
        throw new DomainError(409, 'recall_audience_empty', '所选会员均未授权营销触达，不能创建召回任务')
      }
      const timestamp = now()
      const taskId = randomUUID()
      database.prepare(
        `INSERT INTO merchant_member_recall_tasks
         (id, tenant_id, merchant_id, store_id, name, channel, status,
          member_ids_json, audience_count, excluded_no_consent_count, content,
          reason, segment_rule_version, prediction_model_version,
          approval_confirmed, scheduled_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      ).run(
        taskId, principal.tenantId, store.merchant_id, store.id, input.name,
        input.channel, JSON.stringify(eligible.map((row) => row.id)), eligible.length,
        excluded, input.content, input.reason, SEGMENT_RULE_VERSION,
        PREDICTION_MODEL_VERSION, input.scheduledAt, principal.subject,
        timestamp, timestamp,
      )
      const timelineInsert = database.prepare(
        `INSERT INTO merchant_member_timeline
         (id, tenant_id, merchant_id, store_id, member_id, type, title, detail,
          amount_fen, source, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'RECALL_SCHEDULED', '已进入召回计划', ?,
          NULL, 'MERCHANT', ?, ?)`,
      )
      for (const member of eligible) {
        timelineInsert.run(
          randomUUID(), principal.tenantId, store.merchant_id, store.id, member.id,
          `${input.name} · ${input.channel} · 待计划执行`, timestamp, timestamp,
        )
      }
      recordMemberEvent(database, principal, store, {
        memberId: null,
        entityId: taskId,
        entityType: 'merchant_member_recall_task',
        type: 'MEMBER_RECALL_SCHEDULED',
        summary: `会员召回任务已强确认，${eligible.length} 人进入计划`,
        payload: {
          requestedCount: rows.length,
          audienceCount: eligible.length,
          excludedNoConsentCount: excluded,
          channel: input.channel,
          scheduledAt: input.scheduledAt,
          segmentRuleVersion: SEGMENT_RULE_VERSION,
          predictionModelVersion: PREDICTION_MODEL_VERSION,
          confirmationCaptured: true,
          deliveryStatus: 'NOT_SENT',
          riskLevel: 'L2',
        },
        timestamp,
      })
      return eligible.length === 1 ? eligible[0]?.id : undefined
    },
  )
}
