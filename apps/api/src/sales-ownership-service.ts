import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  LeadCollaboratorSummary,
  LeadOwnershipActorSummary,
  LeadOwnershipAppealSummary,
  LeadOwnershipDecision,
  LeadOwnershipEventSummary,
  LeadStage,
  LeadTransferRequestSummary,
  OnboardingLeadSummary,
  SalesOwnershipOverview,
  SystemRole,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'sales-ownership-e6'
const PROTECTION_POLICY_VERSION = 'lead-protection-30d-v1'
const DAY_MS = 24 * 60 * 60 * 1000

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
  created_at: string
  updated_at: string
}

interface ActorRow {
  user_id: string
  display_name: string
  roles: string
  city_ids_json: string
}

interface TransferRequestRow {
  id: string
  lead_id: string
  requested_by: string
  current_owner_id: string
  target_owner_id: string
  reason: string
  evidence_json: string
  status: LeadTransferRequestSummary['status']
  decision_by: string | null
  decision_note: string | null
  decided_at: string | null
  lead_version_at_request: number
  version: number
  created_at: string
  updated_at: string
}

interface AppealRow {
  id: string
  lead_id: string
  applicant_id: string
  reason: string
  evidence_json: string
  status: LeadOwnershipAppealSummary['status']
  decision_by: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
}

interface CollaboratorRow {
  id: string
  user_id: string
  display_name: string
  role: LeadCollaboratorSummary['role']
  created_at: string
}

interface OwnershipEventRow {
  id: string
  sequence: number
  lead_id: string
  request_id: string | null
  actor_id: string
  type: LeadOwnershipEventSummary['type']
  summary: string
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

export interface CreateTransferRequestInput {
  leadId: string
  targetOwnerId: string
  reason: string
  evidence: string[]
  expectedLeadVersion: number
}

export interface DecideTransferRequestInput {
  requestId: string
  decision: LeadOwnershipDecision
  note: string
  expectedVersion: number
}

export interface DecideAppealInput {
  appealId: string
  decision: LeadOwnershipDecision
  note: string
  expectedLeadVersion: number
}

function now(): string {
  return new Date().toISOString()
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString()
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
          AND lc.lead_id = ${alias}.id
          AND lc.user_id = ?
      )
    )`,
    values: [principal.subject, principal.subject],
  }
}

function getLead(database: DatabaseSync, principal: Principal, leadId: string): LeadRow {
  const scope = leadScope(principal)
  const row = database.prepare(
    `SELECT leads.id, leads.tenant_id, leads.city_id, leads.name, leads.category,
            leads.source, leads.contact_name, leads.contact_phone_masked,
            leads.address, leads.owner_id, leads.stage, leads.protection_expires_at,
            leads.dispute_status, leads.health_score, leads.loss_reason,
            leads.next_action, leads.next_action_at, leads.version,
            leads.created_at, leads.updated_at
     FROM leads
     WHERE leads.id = ? AND leads.tenant_id = ?${scope.clause}`,
  ).get(leadId, principal.tenantId, ...scope.values) as unknown as LeadRow | undefined
  if (!row) throw new DomainError(404, 'lead_not_found', '线索不存在或不在当前数据范围内')
  return row
}

function getActorRows(database: DatabaseSync, tenantId: string): ActorRow[] {
  return database.prepare(
    `SELECT users.id AS user_id, users.display_name,
            GROUP_CONCAT(role_assignments.role, ',') AS roles,
            memberships.city_ids_json
     FROM users
     JOIN memberships
       ON memberships.user_id = users.id
      AND memberships.tenant_id = ?
      AND memberships.status = 'ACTIVE'
     JOIN role_assignments ON role_assignments.membership_id = memberships.id
     WHERE users.status = 'ACTIVE'
     GROUP BY users.id, users.display_name, memberships.city_ids_json`,
  ).all(tenantId) as unknown as ActorRow[]
}

function actorMap(database: DatabaseSync, tenantId: string): Map<string, LeadOwnershipActorSummary> {
  return new Map(getActorRows(database, tenantId).map((row) => [
    row.user_id,
    {
      userId: row.user_id,
      displayName: row.display_name,
      roles: row.roles.split(',').filter(Boolean) as SystemRole[],
    },
  ]))
}

function requiredActor(
  actors: Map<string, LeadOwnershipActorSummary>,
  userId: string,
): LeadOwnershipActorSummary {
  const actor = actors.get(userId)
  if (!actor) throw new DomainError(409, 'ownership_actor_missing', '归属相关人员已停用或不在当前租户')
  return actor
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

function availableCandidates(
  database: DatabaseSync,
  tenantId: string,
  cityId: string,
  ownerId: string,
): LeadOwnershipActorSummary[] {
  return getActorRows(database, tenantId)
    .filter((row) => {
      const roles = row.roles.split(',')
      const cityIds = JSON.parse(row.city_ids_json) as string[]
      return (
        row.user_id !== ownerId
        && cityIds.includes(cityId)
        && roles.some((role) => role === 'CITY_SALES' || role === 'CITY_MANAGER')
      )
    })
    .map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      roles: row.roles.split(',').filter(Boolean) as SystemRole[],
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'))
}

function availableCollaborationCandidates(
  database: DatabaseSync,
  tenantId: string,
  cityId: string,
  ownerId: string,
  existingCollaboratorIds: Set<string>,
): LeadOwnershipActorSummary[] {
  return getActorRows(database, tenantId)
    .filter((row) => {
      const roles = row.roles.split(',')
      const cityIds = JSON.parse(row.city_ids_json) as string[]
      return (
        row.user_id !== ownerId
        && !existingCollaboratorIds.has(row.user_id)
        && cityIds.includes(cityId)
        && roles.some((role) => (
          role === 'CITY_SALES'
          || role === 'CITY_MANAGER'
          || role === 'CITY_DELIVERY'
          || role === 'CITY_PROVIDER_ADMIN'
        ))
      )
    })
    .map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      roles: row.roles.split(',').filter(Boolean) as SystemRole[],
    }))
    .sort((left, right) => {
      const priority = (roles: readonly SystemRole[]): number => {
        if (roles.includes('CITY_MANAGER')) return 0
        if (roles.includes('CITY_PROVIDER_ADMIN') || roles.includes('CITY_DELIVERY')) return 1
        return 2
      }
      return priority(left.roles) - priority(right.roles)
        || left.displayName.localeCompare(right.displayName, 'zh-CN')
    })
}

function transferRows(database: DatabaseSync, tenantId: string, leadId: string): TransferRequestRow[] {
  return database.prepare(
    `SELECT id, lead_id, requested_by, current_owner_id, target_owner_id,
            reason, evidence_json, status, decision_by, decision_note,
            decided_at, lead_version_at_request, version, created_at, updated_at
     FROM lead_transfer_requests
     WHERE tenant_id = ? AND lead_id = ?
     ORDER BY created_at DESC, id DESC`,
  ).all(tenantId, leadId) as unknown as TransferRequestRow[]
}

function appealRows(database: DatabaseSync, tenantId: string, leadId: string): AppealRow[] {
  return database.prepare(
    `SELECT id, lead_id, applicant_id, reason, evidence_json, status,
            decision_by, decision_note, created_at, decided_at
     FROM lead_appeals
     WHERE tenant_id = ? AND lead_id = ?
     ORDER BY created_at DESC, id DESC`,
  ).all(tenantId, leadId) as unknown as AppealRow[]
}

function eventRows(database: DatabaseSync, tenantId: string, leadId: string): OwnershipEventRow[] {
  return database.prepare(
    `SELECT id, sequence, lead_id, request_id, actor_id, type, summary, created_at
     FROM lead_ownership_events
     WHERE tenant_id = ? AND lead_id = ?
     ORDER BY sequence DESC LIMIT 30`,
  ).all(tenantId, leadId) as unknown as OwnershipEventRow[]
}

function recordOwnershipEvent(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
  requestId: string | null,
  type: LeadOwnershipEventSummary['type'],
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO lead_ownership_events
     (id, tenant_id, lead_id, request_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, leadId, requestId, principal.subject,
    type, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO lead_activities
     (id, tenant_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, leadId, principal.subject, `OWNERSHIP_${type}`,
    summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'lead_ownership', ?, 'L2', ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, leadId, type.endsWith('REJECTED') ? 'REJECTED' : 'APPROVED',
    summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, `ownership_${type.toLowerCase()}`, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales.ownership.${type.toLowerCase()}.v1`, leadId, payloadJson, timestamp,
  )
}

export function getSalesOwnershipOverview(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
): SalesOwnershipOverview {
  const lead = getLead(database, principal, leadId)
  const actors = actorMap(database, principal.tenantId)
  const transfers = transferRows(database, principal.tenantId, leadId)
  const appeals = appealRows(database, principal.tenantId, leadId)
  const events = eventRows(database, principal.tenantId, leadId)
  const collaborators = database.prepare(
    `SELECT lead_collaborators.id, lead_collaborators.user_id, users.display_name,
            lead_collaborators.role, lead_collaborators.created_at
     FROM lead_collaborators
     JOIN users ON users.id = lead_collaborators.user_id
     WHERE lead_collaborators.tenant_id = ? AND lead_collaborators.lead_id = ?
     ORDER BY lead_collaborators.created_at, lead_collaborators.id`,
  ).all(principal.tenantId, leadId) as unknown as CollaboratorRow[]
  const timestamp = Date.now()
  const protectionDays = Math.max(
    0,
    Math.ceil((Date.parse(lead.protection_expires_at) - timestamp) / DAY_MS),
  )
  const pendingAppeal = appeals.some((item) => item.status === 'PENDING')
  const pendingTransfer = transfers.some((item) => item.status === 'PENDING')
  const canManageOwnership = hasPermission(principal, 'lead.transfer')
  const cycleStartedAt = new Date(Date.parse(lead.protection_expires_at) - 30 * DAY_MS).toISOString()

  return {
    lead: leadSummary(lead),
    owner: requiredActor(actors, lead.owner_id),
    protection: {
      status: pendingAppeal
        ? 'DISPUTED'
        : protectionDays === 0
          ? 'EXPIRED'
          : protectionDays <= 7
            ? 'EXPIRING'
            : 'ACTIVE',
      startedAt: cycleStartedAt > lead.created_at ? cycleStartedAt : lead.created_at,
      expiresAt: lead.protection_expires_at,
      daysRemaining: protectionDays,
      policyVersion: PROTECTION_POLICY_VERSION,
      transferFrozen: pendingAppeal,
    },
    collaborators: collaborators.map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
      createdAt: row.created_at,
    })),
    appeals: appeals.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      applicant: requiredActor(actors, row.applicant_id),
      reason: row.reason,
      evidence: JSON.parse(row.evidence_json) as string[],
      status: row.status,
      decisionBy: row.decision_by ? requiredActor(actors, row.decision_by) : null,
      decisionNote: row.decision_note,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
    })),
    transferRequests: transfers.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      requestedBy: requiredActor(actors, row.requested_by),
      currentOwner: requiredActor(actors, row.current_owner_id),
      targetOwner: requiredActor(actors, row.target_owner_id),
      reason: row.reason,
      evidence: JSON.parse(row.evidence_json) as string[],
      status: row.status,
      decisionBy: row.decision_by ? requiredActor(actors, row.decision_by) : null,
      decisionNote: row.decision_note,
      decidedAt: row.decided_at,
      leadVersionAtRequest: row.lead_version_at_request,
      version: row.version,
      createdAt: row.created_at,
    })),
    candidates: availableCandidates(database, principal.tenantId, lead.city_id, lead.owner_id),
    collaborationCandidates: availableCollaborationCandidates(
      database,
      principal.tenantId,
      lead.city_id,
      lead.owner_id,
      new Set(collaborators.map((item) => item.user_id)),
    ),
    events: events.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      leadId: row.lead_id,
      requestId: row.request_id,
      type: row.type,
      actor: requiredActor(actors, row.actor_id),
      summary: row.summary,
      createdAt: row.created_at,
    })),
    permissions: {
      canRequestTransfer: (
        !pendingAppeal
        && !pendingTransfer
        && (lead.owner_id === principal.subject || canManageOwnership)
      ),
      canSubmitAppeal: !pendingAppeal,
      canManageOwnership,
      canAddCollaborator: hasPermission(principal, 'lead.assign'),
    },
    updatedAt: [
      lead.updated_at,
      ...transfers.map((item) => item.updated_at),
      ...appeals.map((item) => item.decided_at ?? item.created_at),
      ...events.map((item) => item.created_at),
    ].sort().at(-1) ?? now(),
  }
}

function idempotentMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): SalesOwnershipOverview {
  const requestHash = hash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== requestHash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1
       WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as SalesOwnershipOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const leadId = operation()
    const overview = getSalesOwnershipOverview(database, principal, leadId)
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

export function createLeadTransferRequest(
  database: DatabaseSync,
  principal: Principal,
  input: CreateTransferRequestInput,
  idempotencyKey: string,
): SalesOwnershipOverview {
  const route = `/api/v1/sales/ownership/${input.leadId}/transfer-requests`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    if (lead.version !== input.expectedLeadVersion) {
      throw new DomainError(409, 'stale_entity_version', '线索已更新，请刷新归属信息后重试')
    }
    if (lead.owner_id !== principal.subject && !hasPermission(principal, 'lead.transfer')) {
      throw new DomainError(403, 'ownership_request_denied', '只有当前负责人或归属管理员可以发起转移申请')
    }
    if (lead.dispute_status === 'PENDING') {
      throw new DomainError(409, 'ownership_frozen_by_appeal', '归属申诉裁决前禁止发起转移')
    }
    const pending = database.prepare(
      `SELECT id FROM lead_transfer_requests
       WHERE tenant_id = ? AND lead_id = ? AND status = 'PENDING'`,
    ).get(principal.tenantId, lead.id)
    if (pending) throw new DomainError(409, 'transfer_request_pending', '当前线索已有待审批转移申请')
    const candidates = availableCandidates(database, principal.tenantId, lead.city_id, lead.owner_id)
    const target = candidates.find((item) => item.userId === input.targetOwnerId)
    if (!target) {
      throw new DomainError(404, 'target_owner_not_found', '目标负责人不是当前城市的有效销售或城市负责人')
    }
    const requestId = `ownership-transfer-${randomUUID()}`
    const timestamp = now()
    database.prepare(
      `INSERT INTO lead_transfer_requests
       (id, tenant_id, city_id, lead_id, requested_by, current_owner_id,
        target_owner_id, reason, evidence_json, status, lead_version_at_request,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    ).run(
      requestId, principal.tenantId, lead.city_id, lead.id, principal.subject,
      lead.owner_id, input.targetOwnerId, input.reason, JSON.stringify(input.evidence),
      lead.version, timestamp, timestamp,
    )
    recordOwnershipEvent(
      database,
      principal,
      lead.id,
      requestId,
      'TRANSFER_REQUESTED',
      `已申请将线索转移给 ${target.displayName}，等待城市负责人审批`,
      {
        targetOwnerId: input.targetOwnerId,
        reason: input.reason,
        evidenceCount: input.evidence.length,
        leadVersion: lead.version,
      },
      timestamp,
    )
    return lead.id
  })
}

export function decideLeadTransferRequest(
  database: DatabaseSync,
  principal: Principal,
  input: DecideTransferRequestInput,
  idempotencyKey: string,
): SalesOwnershipOverview {
  const route = `/api/v1/sales/ownership/transfer-requests/${input.requestId}/decision`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const request = database.prepare(
      `SELECT id, tenant_id, lead_id, current_owner_id, target_owner_id,
              status, lead_version_at_request, version
       FROM lead_transfer_requests
       WHERE id = ? AND tenant_id = ?`,
    ).get(input.requestId, principal.tenantId) as unknown as (
      Pick<
        TransferRequestRow,
        'id' | 'lead_id' | 'current_owner_id' | 'target_owner_id'
        | 'status' | 'lead_version_at_request' | 'version'
      > & { tenant_id: string }
    ) | undefined
    if (!request) throw new DomainError(404, 'transfer_request_not_found', '转移申请不存在')
    const lead = getLead(database, principal, request.lead_id)
    if (request.status !== 'PENDING') {
      throw new DomainError(409, 'transfer_request_already_decided', '转移申请已完成裁决')
    }
    if (request.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '转移申请已更新，请刷新后重试')
    }
    if (
      lead.version !== request.lead_version_at_request
      || lead.owner_id !== request.current_owner_id
    ) {
      throw new DomainError(409, 'ownership_context_changed', '负责人或线索版本已变化，需要重新发起转移申请')
    }
    if (lead.dispute_status === 'PENDING') {
      throw new DomainError(409, 'ownership_frozen_by_appeal', '归属申诉裁决前禁止批准转移')
    }
    const timestamp = now()
    const approved = input.decision === 'APPROVE'
    database.prepare(
      `UPDATE lead_transfer_requests
       SET status = ?, decision_by = ?, decision_note = ?, decided_at = ?,
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(
      approved ? 'APPROVED' : 'REJECTED',
      principal.subject,
      input.note,
      timestamp,
      timestamp,
      request.id,
    )
    if (approved) {
      database.prepare(
        `INSERT INTO lead_collaborators
         (id, tenant_id, lead_id, user_id, role, created_at)
         VALUES (?, ?, ?, ?, 'OBSERVER', ?)
         ON CONFLICT(lead_id, user_id) DO NOTHING`,
      ).run(
        randomUUID(), principal.tenantId, lead.id, request.current_owner_id, timestamp,
      )
      database.prepare(
        `UPDATE leads
         SET owner_id = ?, protection_expires_at = ?, dispute_status = 'NONE',
             version = version + 1, updated_at = ?
         WHERE id = ?`,
      ).run(request.target_owner_id, daysFromNow(30), timestamp, lead.id)
      database.prepare(
        `UPDATE sales_tasks
         SET owner_id = ?, updated_at = ?
         WHERE tenant_id = ? AND lead_id = ? AND status IN ('PENDING', 'SNOOZED')`,
      ).run(request.target_owner_id, timestamp, principal.tenantId, lead.id)
    }
    recordOwnershipEvent(
      database,
      principal,
      lead.id,
      request.id,
      approved ? 'TRANSFER_APPROVED' : 'TRANSFER_REJECTED',
      approved
        ? `转移申请已批准，负责人变更并重新计算 30 天保护期：${input.note}`
        : `转移申请已拒绝，原负责人和保护期保持不变：${input.note}`,
      {
        previousOwnerId: request.current_owner_id,
        targetOwnerId: request.target_owner_id,
        decision: input.decision,
        note: input.note,
      },
      timestamp,
    )
    return lead.id
  })
}

export function decideLeadAppeal(
  database: DatabaseSync,
  principal: Principal,
  input: DecideAppealInput,
  idempotencyKey: string,
): SalesOwnershipOverview {
  const route = `/api/v1/sales/ownership/appeals/${input.appealId}/decision`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const appeal = database.prepare(
      `SELECT id, lead_id, status FROM lead_appeals
       WHERE id = ? AND tenant_id = ?`,
    ).get(input.appealId, principal.tenantId) as unknown as (
      Pick<AppealRow, 'id' | 'lead_id' | 'status'>
    ) | undefined
    if (!appeal) throw new DomainError(404, 'appeal_not_found', '归属申诉不存在')
    const lead = getLead(database, principal, appeal.lead_id)
    if (appeal.status !== 'PENDING') {
      throw new DomainError(409, 'appeal_already_decided', '归属申诉已完成裁决')
    }
    if (lead.version !== input.expectedLeadVersion) {
      throw new DomainError(409, 'stale_entity_version', '线索已更新，请刷新申诉上下文后重试')
    }
    const timestamp = now()
    const approved = input.decision === 'APPROVE'
    database.prepare(
      `UPDATE lead_appeals
       SET status = ?, decision_by = ?, decision_note = ?, decided_at = ?
       WHERE id = ?`,
    ).run(
      approved ? 'APPROVED' : 'REJECTED', principal.subject, input.note, timestamp, appeal.id,
    )
    database.prepare(
      `UPDATE leads
       SET dispute_status = ?, protection_expires_at = CASE WHEN ? THEN ? ELSE protection_expires_at END,
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(
      approved ? 'APPROVED' : 'REJECTED',
      approved ? 1 : 0,
      daysFromNow(30),
      timestamp,
      lead.id,
    )
    recordOwnershipEvent(
      database,
      principal,
      lead.id,
      appeal.id,
      approved ? 'APPEAL_APPROVED' : 'APPEAL_REJECTED',
      approved
        ? `归属申诉已通过，保护期重新计算 30 天：${input.note}`
        : `归属申诉已驳回，原保护期保持不变：${input.note}`,
      { decision: input.decision, note: input.note },
      timestamp,
    )
    return lead.id
  })
}
