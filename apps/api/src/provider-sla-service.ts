import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  hasPermission,
  type Principal,
} from '@lequ/auth'
import type {
  ProviderSlaEventSummary,
  ProviderSlaIncidentSummary,
  ProviderSlaLevel,
  ProviderSlaOverview,
  ProviderWorkOrderStatus,
} from '@lequ/contracts'
import { DomainError } from './errors.js'
import { getProviderWorkOrderOverview } from './provider-work-order-service.js'

const RUN_ID = 'provider-delivery-sla-v1'
export const PROVIDER_SLA_POLICY_VERSION = 'provider-delivery-sla-policy-v1'
export const PROVIDER_SLA_SCAN_INTERVAL_SECONDS = 60

export const providerSlaTiers = [
  {
    level: 1 as const,
    afterHours: 0,
    label: 'L1 · 城市响应',
    recipients: ['工单负责人', '城市经理'],
    responseExpectation: '2 小时内确认责任人与恢复计划',
  },
  {
    level: 2 as const,
    afterHours: 4,
    label: 'L2 · 服务商介入',
    recipients: ['城市服务商管理员'],
    responseExpectation: '1 小时内介入并排除跨团队阻塞',
  },
  {
    level: 3 as const,
    afterHours: 12,
    label: 'L3 · 总部督办',
    recipients: ['总部运营'],
    responseExpectation: '立即督办并保留管理复盘证据',
  },
] as const

interface DueWorkOrderRow {
  id: string
  tenant_id: string
  city_id: string
  case_id: string
  lead_id: string
  status: ProviderWorkOrderStatus
  due_at: string
}

interface IncidentRow {
  id: string
  work_order_id: string
  case_id: string
  lead_id: string
  merchant_name: string
  work_order_title: string
  work_order_type: string
  work_order_status: ProviderWorkOrderStatus
  work_order_version: number
  priority: ProviderSlaIncidentSummary['priority']
  owner_id: string
  owner_name: string
  level: ProviderSlaLevel
  status: ProviderSlaIncidentSummary['status']
  due_at: string
  breached_at: string
  response_plan: string | null
  acknowledged_by_name: string | null
  acknowledged_at: string | null
  resolved_by_name: string | null
  resolved_at: string | null
  resolution_note: string | null
  version: number
  policy_version: string
  first_detected_at: string
  last_escalated_at: string
  updated_at: string
}

interface SlaEventRow {
  id: string
  sequence: number
  type: ProviderSlaEventSummary['type']
  level: ProviderSlaLevel
  summary: string
  actor_name: string
  payload_json: string
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

function now(): string {
  return new Date().toISOString()
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function cityScope(principal: Principal, alias: string): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope !== 'CITY' || principal.cityIds.length === 0) {
    return { clause: ' AND 0 = 1', values: [] }
  }
  return {
    clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
    values: [...principal.cityIds],
  }
}

function targetLevel(overdueHours: number): ProviderSlaLevel {
  if (overdueHours >= 12) return 3
  if (overdueHours >= 4) return 2
  return 1
}

function tier(level: ProviderSlaLevel) {
  return providerSlaTiers.find((item) => item.level === level) ?? providerSlaTiers[0]
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    ASSET_COLLECTION: '资料采集',
    MINIAPP_CONFIGURATION: '小程序配置',
    MERCHANT_REVIEW: '商家审阅',
    PLATFORM_REVIEW: '平台审核',
    GEO_OPTIMIZATION: 'GEO 优化',
    SKILL_ACTIVATION: 'Skill 激活',
    DELIVERY_ACCEPTANCE: '交付验收',
    OTHER: '其他协作',
  }
  return labels[type] ?? '交付工单'
}

function recordSlaEvent(
  database: DatabaseSync,
  principal: Principal,
  input: {
    incidentId: string
    workOrderId: string
    type: ProviderSlaEventSummary['type']
    level: ProviderSlaLevel
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  const payload = {
    ...input.payload,
    policyVersion: PROVIDER_SLA_POLICY_VERSION,
  }
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO provider_delivery_sla_events
     (id, tenant_id, incident_id, work_order_id, actor_id, type, level,
      summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    principal.tenantId,
    input.incidentId,
    input.workOrderId,
    principal.subject,
    input.type,
    input.level,
    input.summary,
    payloadJson,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'provider_delivery_sla_incident', ?, ?,
             'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    principal.roles[0] ?? 'system',
    `PROVIDER_DELIVERY_SLA_${input.type}`,
    input.incidentId,
    input.level === 3 ? 'L3' : 'L2',
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
    `provider_delivery_sla_${input.type.toLowerCase()}`,
    payloadJson,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    `provider.delivery.sla.${input.type.toLowerCase()}.v1`,
    input.incidentId,
    JSON.stringify({
      ...payload,
      deliveryState: 'PENDING_CONNECTOR',
      recipients: tier(input.level).recipients,
    }),
    input.timestamp,
  )
}

function scanKey(principal: Principal): string {
  const scope = principal.dataScope === 'PLATFORM'
    ? 'platform'
    : [...principal.cityIds].sort().join(',') || 'none'
  return `provider-sla:last-scan:${principal.tenantId}:${scope}`
}

function dueWorkOrders(database: DatabaseSync, principal: Principal): DueWorkOrderRow[] {
  const scope = cityScope(principal, 'orders')
  return database.prepare(
    `SELECT orders.id, orders.tenant_id, orders.city_id, orders.case_id,
            orders.lead_id, orders.status, orders.due_at
     FROM provider_delivery_work_orders orders
     WHERE orders.tenant_id = ?${scope.clause}
     ORDER BY orders.due_at`,
  ).all(principal.tenantId, ...scope.values) as unknown as DueWorkOrderRow[]
}

export function runProviderSlaScan(
  database: DatabaseSync,
  principal: Principal,
  timestamp = now(),
): ProviderSlaOverview {
  const observedAt = Date.parse(timestamp)
  if (!Number.isFinite(observedAt)) {
    throw new DomainError(400, 'sla_scan_timestamp_invalid', 'SLA 扫描时间无效')
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    for (const order of dueWorkOrders(database, principal)) {
      const existing = database.prepare(
        `SELECT id, level, status
         FROM provider_delivery_sla_incidents
         WHERE tenant_id = ? AND work_order_id = ?`,
      ).get(principal.tenantId, order.id) as {
        id: string
        level: ProviderSlaLevel
        status: ProviderSlaIncidentSummary['status']
      } | undefined

      if (order.status === 'COMPLETED') {
        if (existing && existing.status !== 'RESOLVED') {
          database.prepare(
            `UPDATE provider_delivery_sla_incidents
             SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?,
                 resolution_note = '工单已完成，系统自动关闭 SLA 异常',
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          ).run(principal.subject, timestamp, timestamp, existing.id)
          recordSlaEvent(database, principal, {
            incidentId: existing.id,
            workOrderId: order.id,
            type: 'RESOLVED',
            level: existing.level,
            summary: '工单已完成，SLA 异常由系统自动关闭',
            payload: { resolution: 'WORK_ORDER_COMPLETED' },
            timestamp,
          })
        }
        continue
      }

      const overdueMs = observedAt - Date.parse(order.due_at)
      if (overdueMs <= 0) continue
      const overdueHours = Math.max(1, Math.ceil(overdueMs / 3_600_000))
      const desiredLevel = targetLevel(overdueHours)
      if (existing?.status === 'RESOLVED') continue

      let incidentId = existing?.id
      const previousLevel = existing?.level ?? 0
      if (!incidentId) {
        incidentId = `sla-incident-${randomUUID()}`
        database.prepare(
          `INSERT INTO provider_delivery_sla_incidents
           (id, tenant_id, city_id, work_order_id, case_id, lead_id, level,
            status, due_at, breached_at, version, policy_version,
            first_detected_at, last_escalated_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, 1, ?, ?, ?, ?)`,
        ).run(
          incidentId,
          order.tenant_id,
          order.city_id,
          order.id,
          order.case_id,
          order.lead_id,
          desiredLevel,
          order.due_at,
          order.due_at,
          PROVIDER_SLA_POLICY_VERSION,
          timestamp,
          timestamp,
          timestamp,
        )
      } else if (desiredLevel > previousLevel) {
        database.prepare(
          `UPDATE provider_delivery_sla_incidents
           SET level = ?, status = 'OPEN', last_escalated_at = ?,
               version = version + 1, updated_at = ?
           WHERE id = ?`,
        ).run(desiredLevel, timestamp, timestamp, incidentId)
      }

      for (let level = previousLevel + 1; level <= desiredLevel; level += 1) {
        const typedLevel = level as ProviderSlaLevel
        const policy = tier(typedLevel)
        recordSlaEvent(database, principal, {
          incidentId,
          workOrderId: order.id,
          type: typedLevel === 1 ? 'DETECTED' : 'ESCALATED',
          level: typedLevel,
          summary: typedLevel === 1
            ? `工单超过截止时间，自动建立 ${policy.label} 异常`
            : `工单持续超时，自动升级至 ${policy.label}`,
          payload: {
            dueAt: order.due_at,
            overdueHours,
            recipients: policy.recipients,
            responseExpectation: policy.responseExpectation,
          },
          timestamp,
        })
      }
    }

    database.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(scanKey(principal), timestamp)
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
  return getProviderSlaOverview(database, principal)
}

function listIncidentRows(database: DatabaseSync, principal: Principal): IncidentRow[] {
  const scope = cityScope(principal, 'incidents')
  return database.prepare(
    `SELECT incidents.id, incidents.work_order_id, incidents.case_id, incidents.lead_id,
            leads.name AS merchant_name, orders.title AS work_order_title,
            orders.type AS work_order_type, orders.status AS work_order_status,
            orders.version AS work_order_version, orders.priority,
            orders.owner_id, owners.display_name AS owner_name,
            incidents.level, incidents.status, incidents.due_at,
            incidents.breached_at, incidents.response_plan,
            acknowledgers.display_name AS acknowledged_by_name,
            incidents.acknowledged_at,
            resolvers.display_name AS resolved_by_name,
            incidents.resolved_at, incidents.resolution_note,
            incidents.version, incidents.policy_version,
            incidents.first_detected_at, incidents.last_escalated_at,
            incidents.updated_at
     FROM provider_delivery_sla_incidents incidents
     JOIN provider_delivery_work_orders orders ON orders.id = incidents.work_order_id
     JOIN leads ON leads.id = incidents.lead_id
     JOIN users owners ON owners.id = orders.owner_id
     LEFT JOIN users acknowledgers ON acknowledgers.id = incidents.acknowledged_by
     LEFT JOIN users resolvers ON resolvers.id = incidents.resolved_by
     WHERE incidents.tenant_id = ?${scope.clause}
     ORDER BY
       CASE incidents.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
       incidents.level DESC, incidents.due_at`,
  ).all(principal.tenantId, ...scope.values) as unknown as IncidentRow[]
}

function toIncident(row: IncidentRow, timestamp: number): ProviderSlaIncidentSummary {
  return {
    id: row.id,
    workOrder: {
      id: row.work_order_id,
      title: row.work_order_title,
      typeLabel: typeLabel(row.work_order_type),
      status: row.work_order_status,
      version: row.work_order_version,
    },
    caseId: row.case_id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    owner: { userId: row.owner_id, displayName: row.owner_name },
    priority: row.priority,
    level: row.level,
    status: row.status,
    dueAt: row.due_at,
    breachedAt: row.breached_at,
    overdueHours: Math.max(0, Math.ceil((timestamp - Date.parse(row.due_at)) / 3_600_000)),
    escalationTarget: tier(row.level).recipients.join('、'),
    responsePlan: row.response_plan,
    acknowledgedBy: row.acknowledged_by_name,
    acknowledgedAt: row.acknowledged_at,
    resolvedBy: row.resolved_by_name,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    version: row.version,
    policyVersion: row.policy_version,
    firstDetectedAt: row.first_detected_at,
    lastEscalatedAt: row.last_escalated_at,
    updatedAt: row.updated_at,
  }
}

function eventsFor(
  database: DatabaseSync,
  principal: Principal,
  incidentId: string | undefined,
): ProviderSlaEventSummary[] {
  if (!incidentId) return []
  return (database.prepare(
    `SELECT events.id, events.sequence, events.type, events.level,
            events.summary, users.display_name AS actor_name,
            events.payload_json, events.created_at
     FROM provider_delivery_sla_events events
     JOIN users ON users.id = events.actor_id
     JOIN provider_delivery_sla_incidents incidents ON incidents.id = events.incident_id
     WHERE events.tenant_id = ? AND events.incident_id = ?
     ORDER BY events.sequence DESC`,
  ).all(principal.tenantId, incidentId) as unknown as SlaEventRow[]).map((row) => ({
    id: row.id,
    sequence: row.sequence,
    type: row.type,
    level: row.level,
    summary: row.summary,
    actorName: row.actor_name,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
  }))
}

export function getProviderSlaOverview(
  database: DatabaseSync,
  principal: Principal,
  focusIncidentId?: string | undefined,
): ProviderSlaOverview {
  const workOrders = getProviderWorkOrderOverview(database, principal)
  const timestamp = Date.now()
  const incidents = listIncidentRows(database, principal).map((row) => toIncident(row, timestamp))
  const focus = focusIncidentId
    ? incidents.find(({ id }) => id === focusIncidentId) ?? null
    : incidents.find(({ status }) => status !== 'RESOLVED') ?? incidents[0] ?? null
  if (focusIncidentId && !focus) {
    throw new DomainError(404, 'provider_sla_incident_not_found', 'SLA 异常不存在或不在当前城市范围内')
  }
  const active = incidents.filter(({ status }) => status !== 'RESOLVED')
  const lastScan = database.prepare(
    'SELECT value FROM app_settings WHERE key = ?',
  ).get(scanKey(principal)) as { value: string } | undefined
  return {
    city: workOrders.city,
    metrics: {
      active: active.length,
      unacknowledged: active.filter(({ status }) => status === 'OPEN').length,
      acknowledged: active.filter(({ status }) => status === 'ACKNOWLEDGED').length,
      level2OrAbove: active.filter(({ level }) => level >= 2).length,
      level3: active.filter(({ level }) => level === 3).length,
      resolved: incidents.filter(({ status }) => status === 'RESOLVED').length,
      maxOverdueHours: active.reduce((max, item) => Math.max(max, item.overdueHours), 0),
    },
    incidents,
    focusIncident: focus,
    events: eventsFor(database, principal, focus?.id),
    policy: {
      version: PROVIDER_SLA_POLICY_VERSION,
      scanIntervalSeconds: PROVIDER_SLA_SCAN_INTERVAL_SECONDS,
      tiers: providerSlaTiers.map((item) => ({
        ...item,
        recipients: [...item.recipients],
      })),
      notificationDelivery: 'OUTBOX_PENDING_CONNECTOR',
      appendOnlyEvidence: true,
    },
    permissions: {
      canAcknowledge: hasPermission(principal, 'delivery.sla.acknowledge'),
      canManage: hasPermission(principal, 'delivery.sla.manage'),
      canScan: hasPermission(principal, 'delivery.sla.scan'),
    },
    lastScanAt: lastScan?.value ?? null,
    updatedAt: now(),
  }
}

export function acknowledgeProviderSlaIncident(
  database: DatabaseSync,
  principal: Principal,
  input: {
    incidentId: string
    expectedVersion: number
    responsePlan: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSlaOverview {
  const route = `/api/v1/provider/delivery-sla/incidents/${input.incidentId}/acknowledge`
  const hash = requestHash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== hash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1
       WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as ProviderSlaOverview
  }
  if (!input.confirmed) {
    throw new DomainError(422, 'sla_acknowledgement_confirmation_required', '确认接单前必须完成强确认')
  }
  if (input.responsePlan.trim().length < 10) {
    throw new DomainError(422, 'sla_response_plan_required', '恢复计划至少需要 10 个字符')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = listIncidentRows(database, principal).find(({ id }) => id === input.incidentId)
    if (!row) {
      throw new DomainError(404, 'provider_sla_incident_not_found', 'SLA 异常不存在或不在当前城市范围内')
    }
    if (row.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', 'SLA 异常已更新，请刷新后重试')
    }
    if (row.status === 'RESOLVED') {
      throw new DomainError(409, 'sla_incident_already_resolved', '已关闭的 SLA 异常不能重复确认')
    }
    if (
      !hasPermission(principal, 'delivery.sla.manage')
      && row.owner_id !== principal.subject
    ) {
      throw new DomainError(403, 'sla_incident_owner_required', '交付人员只能确认本人负责的 SLA 异常')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE provider_delivery_sla_incidents
       SET status = 'ACKNOWLEDGED', response_plan = ?, acknowledged_by = ?,
           acknowledged_at = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.responsePlan.trim(), principal.subject, timestamp, timestamp, row.id)
    recordSlaEvent(database, principal, {
      incidentId: row.id,
      workOrderId: row.work_order_id,
      type: 'ACKNOWLEDGED',
      level: row.level,
      summary: `${principal.displayName} 已确认 ${tier(row.level).label} 异常并提交恢复计划`,
      payload: { responsePlan: input.responsePlan.trim() },
      timestamp,
    })
    const overview = getProviderSlaOverview(database, principal, row.id)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, hash, JSON.stringify(overview), timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

