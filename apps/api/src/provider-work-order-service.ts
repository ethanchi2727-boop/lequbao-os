import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  ProviderDeliveryStage,
  ProviderWorkOrderAttachmentSummary,
  ProviderWorkOrderConfirmationSummary,
  ProviderWorkOrderEventSummary,
  ProviderWorkOrderOverview,
  ProviderWorkOrderStatus,
  ProviderWorkOrderSummary,
  ProviderWorkOrderType,
  ProviderWorkOrderTypeDefinition,
} from '@lequ/contracts'
import { DomainError } from './errors.js'
import { getProviderDeliveryBoardOverview } from './provider-delivery-board-service.js'

const RUN_ID = 'provider-work-order-e7'
const RULE_VERSION = 'provider-work-order-policy-v1'
export const MAX_WORK_ORDER_ATTACHMENT_BYTES = 8 * 1024 * 1024
export const WORK_ORDER_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const

export const providerWorkOrderTypes: readonly ProviderWorkOrderTypeDefinition[] = [
  {
    key: 'ASSET_COLLECTION',
    label: '资料采集',
    icon: '资',
    description: '采集、核对营业执照、门头、菜单与经营资料。',
    defaultHours: 12,
    confirmationRequired: true,
    recommendedStage: 'CAPTURING',
  },
  {
    key: 'MINIAPP_CONFIGURATION',
    label: '小程序配置',
    icon: '程',
    description: '生成页面、配置内容并形成可分享预览。',
    defaultHours: 24,
    confirmationRequired: true,
    recommendedStage: 'MINIAPP_GENERATING',
  },
  {
    key: 'MERCHANT_REVIEW',
    label: '商家审阅',
    icon: '审',
    description: '组织商家核对内容、范围与交付版本。',
    defaultHours: 12,
    confirmationRequired: true,
    recommendedStage: 'MERCHANT_CONFIRMATION',
  },
  {
    key: 'PLATFORM_REVIEW',
    label: '平台审核',
    icon: '核',
    description: '补齐审核材料并跟踪灰度和发布门禁。',
    defaultHours: 24,
    confirmationRequired: false,
    recommendedStage: 'REVIEWING',
  },
  {
    key: 'GEO_OPTIMIZATION',
    label: 'GEO 优化',
    icon: 'G',
    description: '处理实体、渠道一致性、内容与可见性问题。',
    defaultHours: 48,
    confirmationRequired: true,
    recommendedStage: 'GEO_SERVICING',
  },
  {
    key: 'SKILL_ACTIVATION',
    label: 'Skill 激活',
    icon: 'S',
    description: '完成能力生成、测试、认证、灰度与调用验证。',
    defaultHours: 48,
    confirmationRequired: true,
    recommendedStage: 'SKILL_GENERATING',
  },
  {
    key: 'DELIVERY_ACCEPTANCE',
    label: '交付验收',
    icon: '验',
    description: '汇总交付资产、验收结论与首次运营安排。',
    defaultHours: 12,
    confirmationRequired: true,
    recommendedStage: 'DELIVERED',
  },
  {
    key: 'OTHER',
    label: '其他协作',
    icon: '协',
    description: '记录标准类型之外的可追踪交付任务。',
    defaultHours: 24,
    confirmationRequired: false,
    recommendedStage: 'WAITING_CAPTURE',
  },
] as const

interface WorkOrderRow {
  id: string
  case_id: string
  lead_id: string
  merchant_name: string
  type: ProviderWorkOrderType
  stage: ProviderDeliveryStage
  title: string
  description: string
  status: ProviderWorkOrderStatus
  priority: ProviderWorkOrderSummary['priority']
  owner_id: string
  owner_name: string
  due_at: string
  confirmation_required: number
  attachment_count: number
  submitted_at: string | null
  completed_at: string | null
  version: number
  created_at: string
  updated_at: string
  confirmation_id: string | null
  confirmation_decision: ProviderWorkOrderConfirmationSummary['decision'] | null
  confirmer_name: string | null
  confirmer_role: string | null
  confirmation_comment: string | null
  confirmation_actor_name: string | null
  confirmation_work_order_version: number | null
  confirmation_created_at: string | null
}

interface AttachmentRow {
  id: string
  category: ProviderWorkOrderAttachmentSummary['category']
  file_name: string
  mime_type: string
  byte_size: number
  sha256: string
  uploaded_by: string
  created_at: string
}

interface ConfirmationRow {
  id: string
  decision: ProviderWorkOrderConfirmationSummary['decision']
  confirmer_name: string
  confirmer_role: string
  comment: string
  actor_name: string
  work_order_version: number
  created_at: string
}

interface EventRow {
  id: string
  sequence: number
  type: ProviderWorkOrderEventSummary['type']
  summary: string
  actor_name: string
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

interface WorkOrderMutationResult {
  workOrderId: string
  caseId: string
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

function typeDefinition(type: ProviderWorkOrderType): ProviderWorkOrderTypeDefinition {
  const definition = providerWorkOrderTypes.find(({ key }) => key === type)
  if (!definition) throw new DomainError(400, 'work_order_type_invalid', '工单类型不存在')
  return definition
}

function latestConfirmation(row: WorkOrderRow): ProviderWorkOrderConfirmationSummary | null {
  if (
    !row.confirmation_id
    || !row.confirmation_decision
    || !row.confirmer_name
    || !row.confirmer_role
    || row.confirmation_comment === null
    || !row.confirmation_actor_name
    || row.confirmation_work_order_version === null
    || !row.confirmation_created_at
  ) return null
  return {
    id: row.confirmation_id,
    decision: row.confirmation_decision,
    confirmerName: row.confirmer_name,
    confirmerRole: row.confirmer_role,
    comment: row.confirmation_comment,
    actorName: row.confirmation_actor_name,
    workOrderVersion: row.confirmation_work_order_version,
    createdAt: row.confirmation_created_at,
  }
}

function toWorkOrder(row: WorkOrderRow, timestamp: number): ProviderWorkOrderSummary {
  const hoursRemaining = Math.ceil((Date.parse(row.due_at) - timestamp) / 3_600_000)
  const slaStatus: ProviderWorkOrderSummary['slaStatus'] = row.status === 'COMPLETED'
    ? 'COMPLETED'
    : hoursRemaining < 0
      ? 'OVERDUE'
      : hoursRemaining <= 24
        ? 'DUE_SOON'
        : 'ON_TRACK'
  return {
    id: row.id,
    caseId: row.case_id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    type: row.type,
    typeLabel: typeDefinition(row.type).label,
    stage: row.stage,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    owner: { userId: row.owner_id, displayName: row.owner_name },
    dueAt: row.due_at,
    slaStatus,
    hoursRemaining,
    confirmationRequired: row.confirmation_required === 1,
    attachmentCount: row.attachment_count,
    latestConfirmation: latestConfirmation(row),
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listWorkOrderRows(database: DatabaseSync, principal: Principal): WorkOrderRow[] {
  const scope = cityScope(principal, 'orders')
  return database.prepare(
    `SELECT orders.id, orders.case_id, orders.lead_id, leads.name AS merchant_name,
            orders.type, orders.stage, orders.title, orders.description,
            orders.status, orders.priority, orders.owner_id,
            owners.display_name AS owner_name, orders.due_at,
            orders.confirmation_required,
            (SELECT COUNT(*) FROM provider_delivery_work_order_attachments attachments
             WHERE attachments.work_order_id = orders.id) AS attachment_count,
            orders.submitted_at, orders.completed_at, orders.version,
            orders.created_at, orders.updated_at,
            confirmations.id AS confirmation_id,
            confirmations.decision AS confirmation_decision,
            confirmations.confirmer_name, confirmations.confirmer_role,
            confirmations.comment AS confirmation_comment,
            confirmation_actors.display_name AS confirmation_actor_name,
            confirmations.work_order_version AS confirmation_work_order_version,
            confirmations.created_at AS confirmation_created_at
     FROM provider_delivery_work_orders orders
     JOIN leads
       ON leads.id = orders.lead_id
      AND leads.tenant_id = orders.tenant_id
     JOIN users owners ON owners.id = orders.owner_id
     LEFT JOIN provider_delivery_work_order_confirmations confirmations
       ON confirmations.sequence = (
         SELECT MAX(latest.sequence)
         FROM provider_delivery_work_order_confirmations latest
         WHERE latest.work_order_id = orders.id
       )
     LEFT JOIN users confirmation_actors ON confirmation_actors.id = confirmations.actor_id
     WHERE orders.tenant_id = ?${scope.clause}
     ORDER BY
       CASE orders.status
         WHEN 'CHANGES_REQUESTED' THEN 0
         WHEN 'WAITING_MERCHANT' THEN 1
         WHEN 'IN_PROGRESS' THEN 2
         WHEN 'OPEN' THEN 3
         ELSE 4
       END,
       CASE orders.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
       orders.due_at,
       orders.updated_at DESC`,
  ).all(principal.tenantId, ...scope.values) as unknown as WorkOrderRow[]
}

function listOperators(database: DatabaseSync, principal: Principal) {
  const scope = principal.dataScope === 'PLATFORM'
    ? { clause: '', values: [] as string[] }
    : principal.dataScope === 'CITY' && principal.cityIds.length > 0
      ? {
          clause: ` AND EXISTS (
            SELECT 1 FROM json_each(memberships.city_ids_json)
            WHERE json_each.value IN (${principal.cityIds.map(() => '?').join(', ')})
          )`,
          values: [...principal.cityIds],
        }
      : { clause: ' AND 0 = 1', values: [] as string[] }
  return database.prepare(
    `SELECT users.id AS user_id, users.display_name, role_assignments.role,
            (SELECT COUNT(*)
             FROM provider_delivery_work_orders active
             WHERE active.owner_id = users.id
               AND active.tenant_id = memberships.tenant_id
               AND active.status <> 'COMPLETED') AS active_count
     FROM users
     JOIN memberships
       ON memberships.user_id = users.id
      AND memberships.tenant_id = ?
      AND memberships.status = 'ACTIVE'
     JOIN role_assignments
       ON role_assignments.membership_id = memberships.id
      AND role_assignments.role IN ('CITY_PROVIDER_ADMIN', 'CITY_MANAGER', 'CITY_DELIVERY')
     WHERE users.status = 'ACTIVE'${scope.clause}
     ORDER BY active_count, users.display_name`,
  ).all(principal.tenantId, ...scope.values) as unknown as Array<{
    user_id: string
    display_name: string
    role: 'CITY_PROVIDER_ADMIN' | 'CITY_MANAGER' | 'CITY_DELIVERY'
    active_count: number
  }>
}

function attachmentsFor(
  database: DatabaseSync,
  principal: Principal,
  workOrderId: string | undefined,
): ProviderWorkOrderAttachmentSummary[] {
  if (!workOrderId) return []
  return (database.prepare(
    `SELECT attachments.id, attachments.category, attachments.file_name,
            attachments.mime_type, attachments.byte_size, attachments.sha256,
            users.display_name AS uploaded_by, attachments.created_at
     FROM provider_delivery_work_order_attachments attachments
     JOIN users ON users.id = attachments.created_by
     JOIN provider_delivery_work_orders orders ON orders.id = attachments.work_order_id
     WHERE attachments.tenant_id = ? AND attachments.work_order_id = ?
     ORDER BY attachments.sequence DESC`,
  ).all(principal.tenantId, workOrderId) as unknown as AttachmentRow[]).map((row) => ({
    id: row.id,
    category: row.category,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }))
}

function confirmationsFor(
  database: DatabaseSync,
  principal: Principal,
  workOrderId: string | undefined,
): ProviderWorkOrderConfirmationSummary[] {
  if (!workOrderId) return []
  return (database.prepare(
    `SELECT confirmations.id, confirmations.decision,
            confirmations.confirmer_name, confirmations.confirmer_role,
            confirmations.comment, users.display_name AS actor_name,
            confirmations.work_order_version, confirmations.created_at
     FROM provider_delivery_work_order_confirmations confirmations
     JOIN users ON users.id = confirmations.actor_id
     WHERE confirmations.tenant_id = ? AND confirmations.work_order_id = ?
     ORDER BY confirmations.sequence DESC`,
  ).all(principal.tenantId, workOrderId) as unknown as ConfirmationRow[]).map((row) => ({
    id: row.id,
    decision: row.decision,
    confirmerName: row.confirmer_name,
    confirmerRole: row.confirmer_role,
    comment: row.comment,
    actorName: row.actor_name,
    workOrderVersion: row.work_order_version,
    createdAt: row.created_at,
  }))
}

function eventsFor(
  database: DatabaseSync,
  principal: Principal,
  workOrderId: string | undefined,
): ProviderWorkOrderEventSummary[] {
  if (!workOrderId) return []
  return (database.prepare(
    `SELECT events.id, events.sequence, events.type, events.summary,
            users.display_name AS actor_name, events.created_at
     FROM provider_delivery_work_order_events events
     JOIN users ON users.id = events.actor_id
     WHERE events.tenant_id = ? AND events.work_order_id = ?
     ORDER BY events.sequence DESC`,
  ).all(principal.tenantId, workOrderId) as unknown as EventRow[]).map((row) => ({
    id: row.id,
    sequence: row.sequence,
    type: row.type,
    summary: row.summary,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }))
}

export function getProviderWorkOrderOverview(
  database: DatabaseSync,
  principal: Principal,
  input: {
    focusCaseId?: string | undefined
    focusWorkOrderId?: string | undefined
  } = {},
): ProviderWorkOrderOverview {
  const delivery = getProviderDeliveryBoardOverview(database, principal, input.focusCaseId)
  const timestamp = Date.now()
  const workOrders = listWorkOrderRows(database, principal).map((row) => toWorkOrder(row, timestamp))
  const caseId = input.focusCaseId ?? delivery.focusCase?.id
  const focus = input.focusWorkOrderId
    ? workOrders.find(({ id }) => id === input.focusWorkOrderId) ?? null
    : workOrders.find((item) => !caseId || item.caseId === caseId) ?? null
  if (input.focusWorkOrderId && !focus) {
    throw new DomainError(404, 'provider_work_order_not_found', '工单不存在或不在当前城市范围内')
  }
  const operators = listOperators(database, principal)
  return {
    city: delivery.city,
    metrics: {
      total: workOrders.length,
      open: workOrders.filter(({ status }) => status === 'OPEN').length,
      inProgress: workOrders.filter(({ status }) => status === 'IN_PROGRESS').length,
      waitingMerchant: workOrders.filter(({ status }) => status === 'WAITING_MERCHANT').length,
      changesRequested: workOrders.filter(({ status }) => status === 'CHANGES_REQUESTED').length,
      overdue: workOrders.filter(({ slaStatus }) => slaStatus === 'OVERDUE').length,
      completed: workOrders.filter(({ status }) => status === 'COMPLETED').length,
    },
    cases: delivery.cases,
    workOrders,
    focusWorkOrder: focus,
    attachments: attachmentsFor(database, principal, focus?.id),
    confirmations: confirmationsFor(database, principal, focus?.id),
    events: eventsFor(database, principal, focus?.id),
    operators: operators.map((item) => ({
      userId: item.user_id,
      displayName: item.display_name,
      role: item.role,
      activeWorkOrderCount: item.active_count,
    })),
    typeCatalog: [...providerWorkOrderTypes],
    policy: {
      ruleVersion: RULE_VERSION,
      maxAttachmentBytes: MAX_WORK_ORDER_ATTACHMENT_BYTES,
      allowedMimeTypes: [...WORK_ORDER_ALLOWED_MIME_TYPES],
      merchantConfirmationSnapshot: true,
      appendOnlyEvidence: true,
    },
    permissions: {
      canManage: hasPermission(principal, 'delivery.workorder.manage'),
      canConfirm: hasPermission(principal, 'delivery.workorder.confirm'),
      canUpload: hasPermission(principal, 'delivery.workorder.manage'),
    },
    updatedAt: now(),
  }
}

function getWorkOrder(
  database: DatabaseSync,
  principal: Principal,
  workOrderId: string,
): WorkOrderRow {
  const row = listWorkOrderRows(database, principal).find(({ id }) => id === workOrderId)
  if (!row) {
    throw new DomainError(404, 'provider_work_order_not_found', '工单不存在或不在当前城市范围内')
  }
  return row
}

function assertVersion(row: WorkOrderRow, expectedVersion: number): void {
  if (row.version !== expectedVersion) {
    throw new DomainError(409, 'stale_entity_version', '工单已被更新，请刷新后重试')
  }
}

function assertOwner(
  database: DatabaseSync,
  principal: Principal,
  ownerId: string,
  cityId: string,
): void {
  const candidate = listOperators(database, principal).find(({ user_id }) => user_id === ownerId)
  if (!candidate) {
    throw new DomainError(422, 'work_order_owner_invalid', '负责人必须是当前城市在岗的交付或管理人员')
  }
  const cities = database.prepare(
    `SELECT memberships.city_ids_json
     FROM memberships
     WHERE memberships.user_id = ? AND memberships.tenant_id = ?`,
  ).get(ownerId, principal.tenantId) as { city_ids_json: string } | undefined
  const parsed = cities ? JSON.parse(cities.city_ids_json) as unknown : []
  if (!Array.isArray(parsed) || !parsed.includes(cityId)) {
    throw new DomainError(422, 'work_order_owner_city_mismatch', '负责人不属于案件所在城市')
  }
}

function recordWorkOrderEvent(
  database: DatabaseSync,
  principal: Principal,
  input: {
    workOrderId: string
    caseId: string
    type: ProviderWorkOrderEventSummary['type']
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  const payloadJson = JSON.stringify({
    ...input.payload,
    ruleVersion: RULE_VERSION,
  })
  database.prepare(
    `INSERT INTO provider_delivery_work_order_events
     (id, tenant_id, work_order_id, case_id, actor_id, type, summary,
      payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    principal.tenantId,
    input.workOrderId,
    input.caseId,
    principal.subject,
    input.type,
    input.summary,
    payloadJson,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'provider_delivery_work_order', ?, 'L2',
             'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    principal.roles[0] ?? 'system',
    `PROVIDER_WORK_ORDER_${input.type}`,
    input.workOrderId,
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
    `provider_work_order_${input.type.toLowerCase()}`,
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
    `provider.delivery.work-order.${input.type.toLowerCase().replaceAll('_', '-')}.v1`,
    input.workOrderId,
    payloadJson,
    input.timestamp,
  )
}

function idempotentMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  requestValue: unknown,
  operation: () => WorkOrderMutationResult,
): ProviderWorkOrderOverview {
  const hash = requestHash(requestValue)
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
    return JSON.parse(stored.response_json) as ProviderWorkOrderOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const result = operation()
    const overview = getProviderWorkOrderOverview(database, principal, {
      focusCaseId: result.caseId,
      focusWorkOrderId: result.workOrderId,
    })
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, hash, JSON.stringify(overview), now())
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function createProviderWorkOrder(
  database: DatabaseSync,
  principal: Principal,
  input: {
    caseId: string
    type: ProviderWorkOrderType
    title: string
    description: string
    priority: ProviderWorkOrderSummary['priority']
    ownerId: string
    dueAt: string
    confirmationRequired?: boolean | undefined
  },
  idempotencyKey: string,
): ProviderWorkOrderOverview {
  return idempotentMutation(
    database,
    principal,
    idempotencyKey,
    '/api/v1/provider/delivery-work-orders',
    input,
    () => {
      const delivery = getProviderDeliveryBoardOverview(database, principal, input.caseId)
      const deliveryCase = delivery.focusCase
      if (!deliveryCase) {
        throw new DomainError(404, 'provider_delivery_case_not_found', '交付案件不存在')
      }
      const dueAt = Date.parse(input.dueAt)
      const timestamp = now()
      if (!Number.isFinite(dueAt) || dueAt <= Date.parse(timestamp)) {
        throw new DomainError(422, 'work_order_due_at_invalid', '截止时间必须晚于当前时间')
      }
      if (dueAt > Date.parse(timestamp) + 30 * 24 * 3_600_000) {
        throw new DomainError(422, 'work_order_due_at_too_far', '工单截止时间不能超过未来 30 天')
      }
      const caseRow = database.prepare(
        `SELECT city_id FROM provider_delivery_cases
         WHERE id = ? AND tenant_id = ?`,
      ).get(input.caseId, principal.tenantId) as { city_id: string }
      assertOwner(database, principal, input.ownerId, caseRow.city_id)
      const definition = typeDefinition(input.type)
      const confirmationRequired = input.type === 'OTHER'
        ? input.confirmationRequired === true
        : definition.confirmationRequired
      const workOrderId = `work-order-${randomUUID()}`
      database.prepare(
        `INSERT INTO provider_delivery_work_orders
         (id, tenant_id, city_id, case_id, lead_id, type, stage, title,
          description, status, priority, owner_id, due_at,
          confirmation_required, version, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).run(
        workOrderId,
        principal.tenantId,
        caseRow.city_id,
        input.caseId,
        deliveryCase.leadId,
        input.type,
        deliveryCase.stage,
        input.title,
        input.description,
        input.priority,
        input.ownerId,
        input.dueAt,
        confirmationRequired ? 1 : 0,
        principal.subject,
        timestamp,
        timestamp,
      )
      recordWorkOrderEvent(database, principal, {
        workOrderId,
        caseId: input.caseId,
        type: 'CREATED',
        summary: `已创建“${input.title}”工单并分配负责人`,
        payload: {
          type: input.type,
          stage: deliveryCase.stage,
          ownerId: input.ownerId,
          dueAt: input.dueAt,
          priority: input.priority,
          confirmationRequired,
        },
        timestamp,
      })
      return { workOrderId, caseId: input.caseId }
    },
  )
}

export function assignProviderWorkOrder(
  database: DatabaseSync,
  principal: Principal,
  input: {
    workOrderId: string
    expectedVersion: number
    targetOwnerId: string
    reason: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderWorkOrderOverview {
  const route = `/api/v1/provider/delivery-work-orders/${input.workOrderId}/assign`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(422, 'work_order_assignment_confirmation_required', '调整负责人前必须完成强确认')
    }
    const order = getWorkOrder(database, principal, input.workOrderId)
    assertVersion(order, input.expectedVersion)
    if (order.status === 'COMPLETED') {
      throw new DomainError(409, 'work_order_already_completed', '已完成工单不能调整负责人')
    }
    if (order.owner_id === input.targetOwnerId) {
      throw new DomainError(409, 'work_order_owner_unchanged', '目标人员已经是当前负责人')
    }
    const city = database.prepare(
      'SELECT city_id FROM provider_delivery_work_orders WHERE id = ?',
    ).get(order.id) as { city_id: string }
    assertOwner(database, principal, input.targetOwnerId, city.city_id)
    const timestamp = now()
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET owner_id = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(input.targetOwnerId, timestamp, order.id, input.expectedVersion)
    recordWorkOrderEvent(database, principal, {
      workOrderId: order.id,
      caseId: order.case_id,
      type: 'ASSIGNED',
      summary: `工单负责人已调整：${input.reason}`,
      payload: {
        previousOwnerId: order.owner_id,
        targetOwnerId: input.targetOwnerId,
        reason: input.reason,
      },
      timestamp,
    })
    return { workOrderId: order.id, caseId: order.case_id }
  })
}

export function startProviderWorkOrder(
  database: DatabaseSync,
  principal: Principal,
  input: { workOrderId: string; expectedVersion: number },
  idempotencyKey: string,
): ProviderWorkOrderOverview {
  const route = `/api/v1/provider/delivery-work-orders/${input.workOrderId}/start`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const order = getWorkOrder(database, principal, input.workOrderId)
    assertVersion(order, input.expectedVersion)
    if (!['OPEN', 'CHANGES_REQUESTED'].includes(order.status)) {
      throw new DomainError(409, 'work_order_status_invalid', '当前工单状态不能开始处理')
    }
    const resumed = order.status === 'CHANGES_REQUESTED'
    const timestamp = now()
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET status = 'IN_PROGRESS', version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(timestamp, order.id, input.expectedVersion)
    recordWorkOrderEvent(database, principal, {
      workOrderId: order.id,
      caseId: order.case_id,
      type: resumed ? 'RESUMED' : 'STARTED',
      summary: resumed ? '已根据商家反馈恢复处理' : '负责人已开始处理工单',
      payload: { previousStatus: order.status, nextStatus: 'IN_PROGRESS' },
      timestamp,
    })
    return { workOrderId: order.id, caseId: order.case_id }
  })
}

export function uploadProviderWorkOrderAttachment(
  database: DatabaseSync,
  principal: Principal,
  input: {
    workOrderId: string
    expectedVersion: number
    category: ProviderWorkOrderAttachmentSummary['category']
    fileName: string
    mimeType: string
    content: Buffer
  },
  idempotencyKey: string,
): ProviderWorkOrderOverview {
  const route = `/api/v1/provider/delivery-work-orders/${input.workOrderId}/attachments`
  const sha256 = createHash('sha256').update(input.content).digest('hex')
  const requestValue = {
    workOrderId: input.workOrderId,
    expectedVersion: input.expectedVersion,
    category: input.category,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.content.byteLength,
    sha256,
  }
  return idempotentMutation(database, principal, idempotencyKey, route, requestValue, () => {
    const order = getWorkOrder(database, principal, input.workOrderId)
    assertVersion(order, input.expectedVersion)
    if (order.status !== 'IN_PROGRESS') {
      throw new DomainError(409, 'work_order_attachment_status_invalid', '只有处理中工单可以添加附件')
    }
    if (input.content.byteLength <= 0 || input.content.byteLength > MAX_WORK_ORDER_ATTACHMENT_BYTES) {
      throw new DomainError(413, 'work_order_attachment_size_invalid', '附件必须大于 0 且不超过 8MB')
    }
    if (!WORK_ORDER_ALLOWED_MIME_TYPES.includes(input.mimeType as typeof WORK_ORDER_ALLOWED_MIME_TYPES[number])) {
      throw new DomainError(415, 'work_order_attachment_type_invalid', '附件仅支持 JPG、PNG、WebP、PDF 或文本')
    }
    const duplicate = database.prepare(
      `SELECT id FROM provider_delivery_work_order_attachments
       WHERE work_order_id = ? AND sha256 = ?`,
    ).get(order.id, sha256)
    if (duplicate) throw new DomainError(409, 'work_order_attachment_duplicate', '同一附件已经上传')
    const timestamp = now()
    const attachmentId = `work-order-attachment-${randomUUID()}`
    database.prepare(
      `INSERT INTO provider_delivery_work_order_attachments
       (id, tenant_id, work_order_id, category, file_name, mime_type,
        byte_size, sha256, content, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      attachmentId,
      principal.tenantId,
      order.id,
      input.category,
      input.fileName,
      input.mimeType,
      input.content.byteLength,
      sha256,
      input.content,
      principal.subject,
      timestamp,
    )
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(timestamp, order.id, input.expectedVersion)
    recordWorkOrderEvent(database, principal, {
      workOrderId: order.id,
      caseId: order.case_id,
      type: 'ATTACHMENT_ADDED',
      summary: `已上传附件：${input.fileName}`,
      payload: {
        attachmentId,
        category: input.category,
        mimeType: input.mimeType,
        byteSize: input.content.byteLength,
        sha256,
      },
      timestamp,
    })
    return { workOrderId: order.id, caseId: order.case_id }
  })
}

export function submitProviderWorkOrder(
  database: DatabaseSync,
  principal: Principal,
  input: {
    workOrderId: string
    expectedVersion: number
    handoffNote: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderWorkOrderOverview {
  const route = `/api/v1/provider/delivery-work-orders/${input.workOrderId}/submit`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(422, 'work_order_submit_confirmation_required', '提交工单前必须完成强确认')
    }
    const order = getWorkOrder(database, principal, input.workOrderId)
    assertVersion(order, input.expectedVersion)
    if (order.status !== 'IN_PROGRESS') {
      throw new DomainError(409, 'work_order_status_invalid', '只有处理中工单可以提交')
    }
    const attachment = database.prepare(
      `SELECT id FROM provider_delivery_work_order_attachments
       WHERE work_order_id = ? LIMIT 1`,
    ).get(order.id)
    if (!attachment) {
      throw new DomainError(422, 'work_order_attachment_required', '提交工单前至少上传一项交付附件')
    }
    const timestamp = now()
    const nextStatus: ProviderWorkOrderStatus = order.confirmation_required === 1
      ? 'WAITING_MERCHANT'
      : 'COMPLETED'
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET status = ?, submitted_at = ?, completed_at = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(
      nextStatus,
      timestamp,
      nextStatus === 'COMPLETED' ? timestamp : null,
      timestamp,
      order.id,
      input.expectedVersion,
    )
    recordWorkOrderEvent(database, principal, {
      workOrderId: order.id,
      caseId: order.case_id,
      type: 'SUBMITTED',
      summary: nextStatus === 'COMPLETED' ? '交付附件已提交，工单完成' : '交付附件已提交，等待商家确认',
      payload: { handoffNote: input.handoffNote, nextStatus },
      timestamp,
    })
    return { workOrderId: order.id, caseId: order.case_id }
  })
}

export function confirmProviderWorkOrder(
  database: DatabaseSync,
  principal: Principal,
  input: {
    workOrderId: string
    expectedVersion: number
    decision: ProviderWorkOrderConfirmationSummary['decision']
    confirmerName: string
    confirmerRole: string
    comment: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderWorkOrderOverview {
  const route = `/api/v1/provider/delivery-work-orders/${input.workOrderId}/merchant-confirmation`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(422, 'merchant_confirmation_required', '必须确认已核验商家身份与反馈内容')
    }
    const order = getWorkOrder(database, principal, input.workOrderId)
    assertVersion(order, input.expectedVersion)
    if (order.status !== 'WAITING_MERCHANT' || order.confirmation_required !== 1) {
      throw new DomainError(409, 'merchant_confirmation_status_invalid', '当前工单不在商家确认阶段')
    }
    const timestamp = now()
    const nextVersion = order.version + 1
    const nextStatus: ProviderWorkOrderStatus = input.decision === 'APPROVED'
      ? 'COMPLETED'
      : 'CHANGES_REQUESTED'
    database.prepare(
      `INSERT INTO provider_delivery_work_order_confirmations
       (id, tenant_id, work_order_id, decision, confirmer_name, confirmer_role,
        comment, actor_id, work_order_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `work-order-confirmation-${randomUUID()}`,
      principal.tenantId,
      order.id,
      input.decision,
      input.confirmerName,
      input.confirmerRole,
      input.comment,
      principal.subject,
      nextVersion,
      timestamp,
    )
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET status = ?, completed_at = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(
      nextStatus,
      nextStatus === 'COMPLETED' ? timestamp : null,
      timestamp,
      order.id,
      input.expectedVersion,
    )
    const approved = input.decision === 'APPROVED'
    recordWorkOrderEvent(database, principal, {
      workOrderId: order.id,
      caseId: order.case_id,
      type: approved ? 'MERCHANT_APPROVED' : 'MERCHANT_CHANGES_REQUESTED',
      summary: approved ? `商家 ${input.confirmerName} 已确认交付` : `商家 ${input.confirmerName} 要求调整`,
      payload: {
        decision: input.decision,
        confirmerName: input.confirmerName,
        confirmerRole: input.confirmerRole,
        comment: input.comment,
        workOrderVersion: nextVersion,
      },
      timestamp,
    })
    return { workOrderId: order.id, caseId: order.case_id }
  })
}

export function getProviderWorkOrderAttachment(
  database: DatabaseSync,
  principal: Principal,
  attachmentId: string,
): { fileName: string; mimeType: string; content: Buffer } {
  const scope = cityScope(principal, 'orders')
  const row = database.prepare(
    `SELECT attachments.file_name, attachments.mime_type, attachments.content
     FROM provider_delivery_work_order_attachments attachments
     JOIN provider_delivery_work_orders orders ON orders.id = attachments.work_order_id
     WHERE attachments.id = ? AND attachments.tenant_id = ?${scope.clause}`,
  ).get(attachmentId, principal.tenantId, ...scope.values) as {
    file_name: string
    mime_type: string
    content: Uint8Array
  } | undefined
  if (!row) {
    throw new DomainError(404, 'work_order_attachment_not_found', '附件不存在或不在当前城市范围内')
  }
  return {
    fileName: row.file_name,
    mimeType: row.mime_type,
    content: Buffer.from(row.content),
  }
}
