import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  LeadStage,
  OnboardingLeadSummary,
  SalesNextBestActionSummary,
  SalesOpportunitySummary,
  SalesTaskEventSummary,
  SalesTaskKind,
  SalesTaskPriority,
  SalesTaskStatus,
  SalesTaskSummary,
  SalesWorkbenchOverview,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'sales-workbench-e6'
const TASK_RULE_VERSION = 'sales-task-projection-v1'
const RECOMMENDATION_POLICY_VERSION = 'sales-next-best-action-v1'
const RECOMMENDATION_MODEL_VERSION = 'sales-assist-local-v1'

interface LeadRow {
  id: string
  tenant_id: string
  city_id: string
  name: string
  category: string
  source: string
  contact_name: string
  contact_phone_masked: string
  address: string
  owner_id: string
  stage: LeadStage
  protection_expires_at: string
  dispute_status: OnboardingLeadSummary['disputeStatus']
  health_score: number | null
  loss_reason: string | null
  next_action: string
  next_action_at: string
  version: number
}

interface SalesTaskRow {
  id: string
  lead_id: string
  lead_name: string
  title: string
  kind: SalesTaskKind
  priority: SalesTaskPriority
  status: SalesTaskStatus
  due_at: string
  reminder_at: string
  source: SalesTaskSummary['source']
  completion_note: string | null
  completed_at: string | null
  version: number
}

interface MutableTaskRow extends SalesTaskRow {
  tenant_id: string
  city_id: string
  owner_id: string
  source_ref: string
  lead_version: number
}

interface SalesTaskEventRow {
  id: string
  task_id: string
  lead_id: string
  type: SalesTaskEventSummary['type']
  summary: string
  occurred_at: string
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

function leadScope(principal: Principal, alias = 'leads'): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope === 'CITY') {
    if (principal.cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
    return {
      clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
      values: [...principal.cityIds],
    }
  }
  return {
    clause: ` AND (
      ${alias}.owner_id = ? OR EXISTS (
        SELECT 1 FROM lead_collaborators lc
        WHERE lc.tenant_id = ${alias}.tenant_id
          AND lc.lead_id = ${alias}.id AND lc.user_id = ?
      )
    )`,
    values: [principal.subject, principal.subject],
  }
}

function performanceScope(
  principal: Principal,
  alias = 'sales_commission_ledger',
): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope === 'CITY') {
    if (principal.cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
    return {
      clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
      values: [...principal.cityIds],
    }
  }
  return {
    clause: ` AND ${alias}.salesperson_id = ?`,
    values: [principal.subject],
  }
}

function listLeads(database: DatabaseSync, principal: Principal): LeadRow[] {
  const scope = leadScope(principal)
  return database.prepare(
    `SELECT id, tenant_id, city_id, name, category, source, contact_name,
            contact_phone_masked, address, owner_id, stage, protection_expires_at,
            dispute_status, health_score, loss_reason, next_action, next_action_at,
            version
     FROM leads
     WHERE tenant_id = ?${scope.clause}
     ORDER BY next_action_at ASC, updated_at DESC`,
  ).all(principal.tenantId, ...scope.values) as unknown as LeadRow[]
}

function taskKind(lead: LeadRow): SalesTaskKind {
  if (lead.stage === 'NEW') {
    return lead.next_action.includes('体检') ? 'DIAGNOSIS' : 'FOLLOW_UP'
  }
  if (lead.stage === 'DIAGNOSED' || lead.stage === 'CONTRACT_DRAFT') return 'CONTRACT'
  if (lead.stage === 'SIGNED' || lead.stage === 'ASSET_REVIEW') return 'ASSET'
  if (lead.stage === 'READY_FOR_DELIVERY') return 'HANDOFF'
  return 'REMINDER'
}

function taskPriority(lead: LeadRow, dueAt = lead.next_action_at): SalesTaskPriority {
  const overdueHours = (Date.now() - Date.parse(dueAt)) / 3600000
  if (overdueHours >= 24 || lead.dispute_status === 'PENDING') return 'CRITICAL'
  if (overdueHours > 0 || Date.parse(lead.protection_expires_at) - Date.now() < 3 * 86400000) {
    return 'HIGH'
  }
  if (Date.parse(dueAt) - Date.now() <= 24 * 3600000) return 'HIGH'
  return lead.stage === 'CONTRACT_DRAFT' ? 'HIGH' : 'MEDIUM'
}

function sourceRef(lead: LeadRow): string {
  return [
    'lead-next-action',
    lead.id,
    `v${lead.version}`,
    hash({ action: lead.next_action, dueAt: lead.next_action_at }).slice(0, 12),
  ].join(':')
}

function insertProjectionEvent(
  database: DatabaseSync,
  principal: Principal,
  task: { id: string; leadId: string },
  type: SalesTaskEventSummary['type'],
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO sales_task_events
     (id, tenant_id, task_id, lead_id, actor_id, type, summary, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, task.id, task.leadId, principal.subject,
    type, summary, JSON.stringify(payload), timestamp,
  )
}

function refreshTaskProjection(
  database: DatabaseSync,
  principal: Principal,
  leads: LeadRow[],
): void {
  for (const lead of leads) {
    if (lead.stage === 'LOST') continue
    const ref = sourceRef(lead)
    const existing = database.prepare(
      `SELECT id FROM sales_tasks WHERE tenant_id = ? AND source_ref = ?`,
    ).get(principal.tenantId, ref) as { id: string } | undefined
    if (existing) continue

    const timestamp = now()
    const staleRows = database.prepare(
      `SELECT id, lead_id FROM sales_tasks
       WHERE tenant_id = ? AND lead_id = ? AND status IN ('PENDING', 'SNOOZED')`,
    ).all(principal.tenantId, lead.id) as unknown as Array<{ id: string; lead_id: string }>
    for (const stale of staleRows) {
      database.prepare(
        `UPDATE sales_tasks
         SET status = 'SUPERSEDED', version = version + 1, updated_at = ?
         WHERE id = ?`,
      ).run(timestamp, stale.id)
      insertProjectionEvent(
        database,
        principal,
        { id: stale.id, leadId: stale.lead_id },
        'SUPERSEDED',
        'CRM 下一步动作已变化，旧任务自动归档',
        { taskRuleVersion: TASK_RULE_VERSION, leadVersion: lead.version },
        timestamp,
      )
    }

    const id = `sales-task-${hash(ref).slice(0, 16)}`
    const reminderAt = new Date(Math.max(Date.now(), Date.parse(lead.next_action_at) - 3600000))
      .toISOString()
    database.prepare(
      `INSERT INTO sales_tasks
       (id, tenant_id, city_id, lead_id, owner_id, title, kind, priority, status,
        due_at, reminder_at, source, source_ref, lead_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, 'LEAD_NEXT_ACTION', ?, ?, ?, ?)`,
    ).run(
      id, principal.tenantId, lead.city_id, lead.id, lead.owner_id,
      lead.next_action, taskKind(lead), taskPriority(lead), lead.next_action_at,
      reminderAt, ref, lead.version, timestamp, timestamp,
    )
    insertProjectionEvent(
      database,
      principal,
      { id, leadId: lead.id },
      'CREATED',
      `已从 CRM 下一步动作生成任务：${lead.next_action}`,
      { taskRuleVersion: TASK_RULE_VERSION, leadVersion: lead.version },
      timestamp,
    )
  }
}

function taskSummary(row: SalesTaskRow): SalesTaskSummary {
  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    title: row.title,
    kind: row.kind,
    priority: row.priority,
    status: row.status,
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    source: row.source,
    completionNote: row.completion_note,
    completedAt: row.completed_at,
    version: row.version,
  }
}

function leadSummary(row: LeadRow): OnboardingLeadSummary {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    source: row.source,
    contactName: row.contact_name,
    contactPhoneMasked: row.contact_phone_masked,
    address: row.address,
    ownerId: row.owner_id,
    stage: row.stage,
    protectionExpiresAt: row.protection_expires_at,
    disputeStatus: row.dispute_status,
    healthScore: row.health_score,
    lossReason: row.loss_reason,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    version: row.version,
  }
}

function stageScore(stage: LeadStage): number {
  const scores: Record<LeadStage, number> = {
    NEW: 64,
    DIAGNOSED: 78,
    CONTRACT_DRAFT: 89,
    SIGNED: 84,
    ASSET_REVIEW: 80,
    READY_FOR_DELIVERY: 72,
    LOST: 0,
  }
  return scores[stage]
}

function recommendedPlay(lead: LeadRow): string {
  if (lead.dispute_status === 'PENDING') return '先补充归属证据并等待城市经理裁决，避免重复触达'
  const plays: Record<LeadStage, string> = {
    NEW: '用 15 分钟免费体检切入，先确认数字化痛点和决策人',
    DIAGNOSED: '围绕体检高优先级问题演示方案，用业务证据推进提案会',
    CONTRACT_DRAFT: '逐项核对套餐、折扣权限和六类授权，锁定签署时间',
    SIGNED: '预约资料采集，明确执照、门头和菜单的人工确认责任',
    ASSET_REVIEW: '完成识别结果人工复核并准备交付移交',
    READY_FOR_DELIVERY: '确认服务商接手人与 SLA，向商家同步交付里程碑',
    LOST: '仅在新的合法业务信号出现后重新激活',
  }
  return plays[lead.stage]
}

function opportunity(
  lead: LeadRow,
  task: SalesTaskSummary | undefined,
): SalesOpportunitySummary {
  const overdueHours = Math.max(0, Math.round((Date.now() - Date.parse(lead.next_action_at)) / 3600000))
  const protectionDays = Math.max(
    0,
    Math.ceil((Date.parse(lead.protection_expires_at) - Date.now()) / 86400000),
  )
  const healthContribution = lead.health_score === null ? 0 : Math.round((lead.health_score - 60) / 4)
  const urgencyContribution = overdueHours > 0 ? Math.min(10, 4 + Math.floor(overdueHours / 12)) : 0
  const disputePenalty = lead.dispute_status === 'PENDING' ? -8 : 0
  const opportunityScore = Math.max(
    1,
    Math.min(99, stageScore(lead.stage) + healthContribution + urgencyContribution + disputePenalty),
  )
  const signals = [
    overdueHours > 0 ? `下一动作已逾期 ${overdueHours} 小时` : '下一动作在计划时间内',
    `销售保护期剩余 ${protectionDays} 天`,
    `线索来源：${lead.source}`,
  ]
  if (lead.health_score !== null) signals.push(`AI 体检 ${lead.health_score} 分`)
  if (lead.dispute_status === 'PENDING') signals.push('归属申诉处理中')
  return {
    lead: leadSummary(lead),
    taskId: task?.id ?? null,
    priority: task?.priority ?? taskPriority(lead),
    opportunityScore,
    overdueHours,
    signals,
    recommendedPlay: recommendedPlay(lead),
  }
}

function nextBestAction(
  item: SalesOpportunitySummary,
  index: number,
): SalesNextBestActionSummary {
  return {
    id: `sales-nba-${item.lead.id}-${index + 1}`,
    leadId: item.lead.id,
    leadName: item.lead.name,
    title: item.lead.nextAction,
    rationale: [
      item.signals[0] ?? '存在待处理的 CRM 下一动作',
      item.signals.find((signal) => signal.startsWith('销售保护期')) ?? '当前线索仍在有效范围内',
      `当前阶段：${item.lead.stage}`,
    ],
    guardrail: '仅提供建议，不自动联系商家、不代替销售承诺，也不修改 CRM 阶段',
    priority: item.priority,
    recommendationScore: item.opportunityScore,
    policyVersion: RECOMMENDATION_POLICY_VERSION,
    modelVersion: RECOMMENDATION_MODEL_VERSION,
  }
}

function startOfLocalDay(date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function getSalesWorkbenchOverview(
  database: DatabaseSync,
  principal: Principal,
): SalesWorkbenchOverview {
  const leads = listLeads(database, principal)
  refreshTaskProjection(database, principal, leads)
  const scope = leadScope(principal)
  const taskRows = database.prepare(
    `SELECT sales_tasks.id, sales_tasks.lead_id, leads.name AS lead_name,
            sales_tasks.title, sales_tasks.kind, sales_tasks.priority, sales_tasks.status,
            sales_tasks.due_at, sales_tasks.reminder_at, sales_tasks.source,
            sales_tasks.completion_note, sales_tasks.completed_at, sales_tasks.version
     FROM sales_tasks
     JOIN leads ON leads.id = sales_tasks.lead_id
     WHERE sales_tasks.tenant_id = ?${scope.clause}
       AND sales_tasks.status IN ('PENDING', 'SNOOZED', 'DONE')
     ORDER BY
       CASE sales_tasks.status WHEN 'PENDING' THEN 1 WHEN 'SNOOZED' THEN 2 ELSE 3 END,
       CASE sales_tasks.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                                 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
       sales_tasks.due_at ASC`,
  ).all(principal.tenantId, ...scope.values) as unknown as SalesTaskRow[]
  const tasks = taskRows.map(taskSummary)
  const activeTasks = tasks.filter((task) => task.status === 'PENDING' || task.status === 'SNOOZED')
  const activeTaskByLead = new Map(activeTasks.map((task) => [task.leadId, task]))
  const focusOpportunities = leads
    .filter((lead) => lead.stage !== 'LOST')
    .map((lead) => opportunity(lead, activeTaskByLead.get(lead.id)))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
  const eventRows = database.prepare(
    `SELECT sales_task_events.id, sales_task_events.task_id, sales_task_events.lead_id,
            sales_task_events.type, sales_task_events.summary, sales_task_events.occurred_at
     FROM sales_task_events
     JOIN leads ON leads.id = sales_task_events.lead_id
     WHERE sales_task_events.tenant_id = ?${scope.clause}
     ORDER BY sales_task_events.sequence DESC LIMIT 30`,
  ).all(principal.tenantId, ...scope.values) as unknown as SalesTaskEventRow[]
  const dayStart = startOfLocalDay()
  const dayEnd = dayStart + 86400000
  const month = new Date()
  const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const ledgerScope = performanceScope(principal)
  const signedRevenue = database.prepare(
    `SELECT COALESCE(SUM(performance_delta_fen), 0) AS amount
     FROM sales_commission_ledger
     WHERE tenant_id = ? AND period = ? AND category = 'SIGNING'${ledgerScope.clause}`,
  ).get(principal.tenantId, period, ...ledgerScope.values) as { amount: number }
  const expectedCommission = database.prepare(
    `SELECT COALESCE(SUM(estimated_commission_delta_fen), 0) AS amount
     FROM sales_commission_ledger
     WHERE tenant_id = ? AND period = ?${ledgerScope.clause}`,
  ).get(principal.tenantId, period, ...ledgerScope.values) as { amount: number }
  const timestamp = now()
  return {
    metrics: {
      dueToday: activeTasks.filter((task) => {
        const due = Date.parse(task.dueAt)
        return due >= dayStart && due < dayEnd
      }).length,
      overdue: activeTasks.filter((task) => Date.parse(task.dueAt) < Date.now()).length,
      completedToday: tasks.filter((task) => {
        const completed = task.completedAt ? Date.parse(task.completedAt) : 0
        return completed >= dayStart && completed < dayEnd
      }).length,
      activeLeads: leads.filter((lead) => lead.stage !== 'LOST').length,
      protectedLeads: leads.filter((lead) =>
        lead.stage !== 'LOST' && Date.parse(lead.protection_expires_at) > Date.now(),
      ).length,
      monthlySignedRevenueFen: Number(signedRevenue.amount),
      expectedCommissionFen: Number(expectedCommission.amount),
    },
    tasks,
    focusOpportunities,
    nextBestActions: focusOpportunities.slice(0, 3).map(nextBestAction),
    recentEvents: eventRows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      leadId: row.lead_id,
      type: row.type,
      summary: row.summary,
      occurredAt: row.occurred_at,
    })),
    taskRuleVersion: TASK_RULE_VERSION,
    recommendationPolicyVersion: RECOMMENDATION_POLICY_VERSION,
    recommendationModelVersion: RECOMMENDATION_MODEL_VERSION,
    updatedAt: timestamp,
  }
}

function getTask(
  database: DatabaseSync,
  principal: Principal,
  taskId: string,
): MutableTaskRow {
  const scope = leadScope(principal)
  const row = database.prepare(
    `SELECT sales_tasks.id, sales_tasks.tenant_id, sales_tasks.city_id,
            sales_tasks.lead_id, leads.name AS lead_name, sales_tasks.owner_id,
            sales_tasks.title, sales_tasks.kind, sales_tasks.priority, sales_tasks.status,
            sales_tasks.due_at, sales_tasks.reminder_at, sales_tasks.source,
            sales_tasks.source_ref, sales_tasks.lead_version, sales_tasks.completion_note,
            sales_tasks.completed_at, sales_tasks.version
     FROM sales_tasks
     JOIN leads ON leads.id = sales_tasks.lead_id
     WHERE sales_tasks.id = ? AND sales_tasks.tenant_id = ?${scope.clause}`,
  ).get(taskId, principal.tenantId, ...scope.values) as unknown as MutableTaskRow | undefined
  if (!row) throw new DomainError(404, 'sales_task_not_found', '销售任务不存在或不在当前数据范围')
  return row
}

function assertTaskMutation(task: MutableTaskRow, expectedVersion: number): void {
  if (task.version !== expectedVersion) {
    throw new DomainError(409, 'stale_entity_version', '销售任务已更新，请刷新后重试')
  }
  if (task.status !== 'PENDING' && task.status !== 'SNOOZED') {
    throw new DomainError(409, 'sales_task_not_actionable', '当前销售任务不能再执行此操作')
  }
}

function recordSalesMutation(
  database: DatabaseSync,
  principal: Principal,
  task: MutableTaskRow,
  type: 'COMPLETED' | 'SNOOZED',
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  insertProjectionEvent(
    database,
    principal,
    { id: task.id, leadId: task.lead_id },
    type,
    summary,
    payload,
    timestamp,
  )
  database.prepare(
    `INSERT INTO lead_activities
     (id, tenant_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, task.lead_id, principal.subject,
    `SALES_TASK_${type}`, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'sales_task', ?, 'L1', 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    `SALES_TASK_${type}`, task.id, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, `SALES_TASK_${type}`, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales.task.${type.toLowerCase()}.v1`, task.id, payloadJson, timestamp,
  )
}

function idempotentTaskMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => void,
): SalesWorkbenchOverview {
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
    return JSON.parse(stored.response_json) as SalesWorkbenchOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    operation()
    const overview = getSalesWorkbenchOverview(database, principal)
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

export function completeSalesTask(
  database: DatabaseSync,
  principal: Principal,
  input: { taskId: string; expectedVersion: number; completionNote: string },
  idempotencyKey: string,
): SalesWorkbenchOverview {
  const route = `/api/v1/sales/tasks/${input.taskId}/complete`
  return idempotentTaskMutation(database, principal, idempotencyKey, route, input, () => {
    const task = getTask(database, principal, input.taskId)
    assertTaskMutation(task, input.expectedVersion)
    const timestamp = now()
    database.prepare(
      `UPDATE sales_tasks
       SET status = 'DONE', completion_note = ?, completed_at = ?,
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.completionNote, timestamp, timestamp, task.id)
    recordSalesMutation(
      database,
      principal,
      task,
      'COMPLETED',
      `销售任务已完成：${task.title}`,
      {
        completionNote: input.completionNote,
        leadId: task.lead_id,
        taskRuleVersion: TASK_RULE_VERSION,
      },
      timestamp,
    )
  })
}

export function snoozeSalesTask(
  database: DatabaseSync,
  principal: Principal,
  input: { taskId: string; expectedVersion: number; snoozeUntil: string; reason: string },
  idempotencyKey: string,
): SalesWorkbenchOverview {
  const route = `/api/v1/sales/tasks/${input.taskId}/snooze`
  return idempotentTaskMutation(database, principal, idempotencyKey, route, input, () => {
    const task = getTask(database, principal, input.taskId)
    assertTaskMutation(task, input.expectedVersion)
    const snoozeUntil = Date.parse(input.snoozeUntil)
    if (snoozeUntil <= Date.now() || snoozeUntil > Date.now() + 30 * 86400000) {
      throw new DomainError(400, 'invalid_snooze_time', '稍后提醒时间必须在未来 30 天内')
    }
    const timestamp = now()
    const reminderAt = new Date(Math.max(Date.now(), snoozeUntil - 3600000)).toISOString()
    database.prepare(
      `UPDATE sales_tasks
       SET status = 'SNOOZED', due_at = ?, reminder_at = ?,
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.snoozeUntil, reminderAt, timestamp, task.id)
    recordSalesMutation(
      database,
      principal,
      task,
      'SNOOZED',
      `销售任务已稍后提醒：${task.title}`,
      {
        reason: input.reason,
        snoozeUntil: input.snoozeUntil,
        leadId: task.lead_id,
        taskRuleVersion: TASK_RULE_VERSION,
      },
      timestamp,
    )
  })
}
