import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  ContractSummary,
  DiagnosisReportSummary,
  LeadStage,
  OnboardingLeadSummary,
  ProviderLeadAssignmentEventSummary,
  ProviderLocalGrowthLeadSummary,
  ProviderLocalGrowthOverview,
  ProviderPackageSummary,
  ProviderSalespersonSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'provider-local-growth-e7'
const ASSIGNMENT_RULE_VERSION = 'provider-lead-assignment-v1'
const PACKAGE_RULE_VERSION = 'provider-package-catalog-2026.07'
const ACTIVE_STAGES: readonly LeadStage[] = [
  'NEW',
  'DIAGNOSED',
  'CONTRACT_DRAFT',
  'SIGNED',
  'ASSET_REVIEW',
]

export const PROVIDER_PACKAGES: readonly ProviderPackageSummary[] = [
  {
    code: 'BASIC',
    name: '数字建档版',
    tagline: '先把商家事实变成机器可读资产',
    listPriceFen: 49_800,
    billingCycle: 'YEAR',
    recommended: false,
    capabilities: ['商家数字建档', '基础展示页', '资料结构化'],
    policyVersion: PACKAGE_RULE_VERSION,
  },
  {
    code: 'PRO',
    name: '增长专业版',
    tagline: '小程序、GEO 与经营工具一体交付',
    listPriceFen: 99_800,
    billingCycle: 'YEAR',
    recommended: true,
    capabilities: ['品牌小程序', 'GEO 九维优化', '经营数据看板', '六类独立授权'],
    policyVersion: PACKAGE_RULE_VERSION,
  },
  {
    code: 'AGENT',
    name: 'AI Agent 版',
    tagline: '让商家能力可被 AI 发现、调用与交易',
    listPriceFen: 169_800,
    billingCycle: 'YEAR',
    recommended: false,
    capabilities: ['专业版全部能力', 'Skill Network', 'AI Agent 接入', '质量监控'],
    policyVersion: PACKAGE_RULE_VERSION,
  },
  {
    code: 'CHAIN',
    name: '连锁企业版',
    tagline: '多品牌、多门店和区域经营统一治理',
    listPriceFen: 299_800,
    billingCycle: 'YEAR',
    recommended: false,
    capabilities: ['Agent 版全部能力', '多门店治理', '总部策略中心', '区域经营分析'],
    policyVersion: PACKAGE_RULE_VERSION,
  },
] as const

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
  owner_display_name: string
  stage: LeadStage
  protection_expires_at: string
  dispute_status: OnboardingLeadSummary['disputeStatus']
  health_score: number | null
  loss_reason: string | null
  next_action: string
  next_action_at: string
  version: number
  updated_at: string
  assignment_count: number
}

interface DiagnosisRow {
  id: string
  lead_id: string
  score: number
  grade: string
  findings_json: string
  proposal_json: string
  model_version: string
  generated_at: string
}

interface ContractRow {
  id: string
  lead_id: string
  package_code: string
  billing_cycle: ContractSummary['billingCycle']
  list_price_fen: number
  discount_bps: number
  final_price_fen: number
  discount_status: ContractSummary['discountStatus']
  status: ContractSummary['status']
  contract_version: string
  authorization_count: number
  signed_at: string | null
  version: number
}

interface AssignmentEventRow {
  id: string
  sequence: number
  previous_owner_id: string
  previous_owner_name: string
  target_owner_id: string
  target_owner_name: string
  actor_name: string
  reason: string
  created_at: string
}

interface MembershipRow {
  user_id: string
  display_name: string
  city_ids_json: string
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

function cityScope(principal: Principal, alias = 'leads'): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope !== 'CITY' || principal.cityIds.length === 0) {
    return { clause: ' AND 0 = 1', values: [] }
  }
  return {
    clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
    values: [...principal.cityIds],
  }
}

function listLeadRows(database: DatabaseSync, principal: Principal): LeadRow[] {
  const scope = cityScope(principal)
  return database.prepare(
    `SELECT leads.id, leads.tenant_id, leads.city_id, leads.name, leads.category,
            leads.source, leads.contact_name, leads.contact_phone_masked,
            leads.address, leads.owner_id, users.display_name AS owner_display_name,
            leads.stage, leads.protection_expires_at, leads.dispute_status,
            leads.health_score, leads.loss_reason, leads.next_action,
            leads.next_action_at, leads.version, leads.updated_at,
            (SELECT COUNT(*) FROM provider_lead_assignment_events events
             WHERE events.lead_id = leads.id) AS assignment_count
     FROM leads
     JOIN users ON users.id = leads.owner_id
     WHERE leads.tenant_id = ?${scope.clause}
     ORDER BY
       CASE WHEN leads.stage = 'LOST' THEN 1 ELSE 0 END,
       CASE WHEN leads.next_action_at < ? THEN 0 ELSE 1 END,
       leads.next_action_at,
       CASE leads.stage
         WHEN 'NEW' THEN 0
         WHEN 'DIAGNOSED' THEN 1
         WHEN 'CONTRACT_DRAFT' THEN 2
         WHEN 'SIGNED' THEN 3
         WHEN 'ASSET_REVIEW' THEN 4
         WHEN 'READY_FOR_DELIVERY' THEN 5
         ELSE 6
       END,
       leads.updated_at DESC`,
  ).all(principal.tenantId, ...scope.values, now()) as unknown as LeadRow[]
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

function diagnosisSummary(row: DiagnosisRow | undefined): DiagnosisReportSummary | null {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    score: row.score,
    grade: row.grade,
    findings: JSON.parse(row.findings_json) as DiagnosisReportSummary['findings'],
    proposal: JSON.parse(row.proposal_json) as DiagnosisReportSummary['proposal'],
    modelVersion: row.model_version,
    generatedAt: row.generated_at,
  }
}

function contractSummary(row: ContractRow | undefined): ContractSummary | null {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    packageCode: row.package_code,
    billingCycle: row.billing_cycle,
    listPriceFen: row.list_price_fen,
    discountBps: row.discount_bps,
    finalPriceFen: row.final_price_fen,
    discountStatus: row.discount_status,
    status: row.status,
    contractVersion: row.contract_version,
    authorizationCount: row.authorization_count,
    signedAt: row.signed_at,
    version: row.version,
  }
}

function urgency(row: LeadRow, timestamp: number): ProviderLocalGrowthLeadSummary['urgency'] {
  if (row.stage === 'LOST' || row.stage === 'READY_FOR_DELIVERY') return 'CLOSED'
  const actionAt = Date.parse(row.next_action_at)
  if (actionAt < timestamp) return 'OVERDUE'
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(actionAt) === formatter.format(timestamp) ? 'TODAY' : 'UPCOMING'
}

function loadLeadDetail(
  database: DatabaseSync,
  row: LeadRow,
  timestamp: number,
): ProviderLocalGrowthLeadSummary {
  const diagnosis = database.prepare(
    `SELECT id, lead_id, score, grade, findings_json, proposal_json,
            model_version, generated_at
     FROM diagnosis_reports WHERE lead_id = ?`,
  ).get(row.id) as unknown as DiagnosisRow | undefined
  const contract = database.prepare(
    `SELECT contract_drafts.id, contract_drafts.lead_id,
            contract_drafts.package_code, contract_drafts.billing_cycle,
            contract_drafts.list_price_fen, contract_drafts.discount_bps,
            contract_drafts.final_price_fen, contract_drafts.discount_status,
            contract_drafts.status, contract_drafts.contract_version,
            contract_drafts.signed_at, contract_drafts.version,
            COUNT(contract_authorizations.id) AS authorization_count
     FROM contract_drafts
     LEFT JOIN contract_authorizations
       ON contract_authorizations.contract_id = contract_drafts.id
      AND contract_authorizations.status = 'GRANTED'
     WHERE contract_drafts.lead_id = ?
     GROUP BY contract_drafts.id`,
  ).get(row.id) as unknown as ContractRow | undefined
  const authorizations = contract
    ? database.prepare(
        `SELECT label FROM contract_authorizations
         WHERE contract_id = ? AND status = 'GRANTED'
         ORDER BY CASE scope
           WHEN 'DIGITAL_PROFILE' THEN 1
           WHEN 'GEO_DISTRIBUTION' THEN 2
           WHEN 'SKILL_RUNTIME' THEN 3
           WHEN 'PLATFORM_DISPLAY' THEN 4
           WHEN 'TRANSACTION' THEN 5
           WHEN 'VOUCHER_ALLIANCE' THEN 6
           ELSE 7
         END`,
      ).all(contract.id) as unknown as Array<{ label: string }>
    : []
  return {
    lead: leadSummary(row),
    ownerDisplayName: row.owner_display_name,
    diagnosis: diagnosisSummary(diagnosis),
    contract: contractSummary(contract),
    authorizationLabels: authorizations.map(({ label }) => label),
    assignmentCount: row.assignment_count,
    urgency: urgency(row, timestamp),
  }
}

function listSalespeople(
  database: DatabaseSync,
  principal: Principal,
  leadRows: readonly LeadRow[],
): ProviderSalespersonSummary[] {
  const members = database.prepare(
    `SELECT memberships.user_id, users.display_name, memberships.city_ids_json
     FROM memberships
     JOIN users ON users.id = memberships.user_id AND users.status = 'ACTIVE'
     JOIN role_assignments ON role_assignments.membership_id = memberships.id
     WHERE memberships.tenant_id = ?
       AND memberships.status = 'ACTIVE'
       AND role_assignments.role = 'CITY_SALES'
     ORDER BY users.display_name`,
  ).all(principal.tenantId) as unknown as MembershipRow[]
  const allowedCities = new Set(principal.dataScope === 'PLATFORM' ? leadRows.map(({ city_id }) => city_id) : principal.cityIds)
  return members
    .filter((member) => {
      const cities = JSON.parse(member.city_ids_json) as unknown
      return Array.isArray(cities) && cities.some((city) => typeof city === 'string' && allowedCities.has(city))
    })
    .map((member) => {
      const owned = leadRows.filter(({ owner_id }) => owner_id === member.user_id)
      const activeLeadCount = owned.filter(({ stage }) => ACTIVE_STAGES.includes(stage)).length
      const capacity = 8
      const loadRate = Math.min(100, Math.round(activeLeadCount / capacity * 100))
      return {
        userId: member.user_id,
        displayName: member.display_name,
        activeLeadCount,
        diagnosedLeadCount: owned.filter(({ health_score }) => health_score !== null).length,
        signedLeadCount: owned.filter(({ stage }) =>
          ['SIGNED', 'ASSET_REVIEW', 'READY_FOR_DELIVERY'].includes(stage)).length,
        capacity,
        loadRate,
        availability: loadRate >= 100 ? 'FULL' : loadRate >= 70 ? 'BALANCED' : 'AVAILABLE',
      }
    })
}

function listAssignmentEvents(
  database: DatabaseSync,
  principal: Principal,
  focusLeadId: string | null,
): ProviderLeadAssignmentEventSummary[] {
  if (!focusLeadId) return []
  const scope = cityScope(principal, 'events')
  const rows = database.prepare(
    `SELECT events.id, events.sequence, events.previous_owner_id,
            previous.display_name AS previous_owner_name,
            events.target_owner_id, target.display_name AS target_owner_name,
            actor.display_name AS actor_name, events.reason, events.created_at
     FROM provider_lead_assignment_events events
     JOIN users previous ON previous.id = events.previous_owner_id
     JOIN users target ON target.id = events.target_owner_id
     JOIN users actor ON actor.id = events.actor_id
     WHERE events.tenant_id = ? AND events.lead_id = ?${scope.clause}
     ORDER BY events.sequence DESC
     LIMIT 20`,
  ).all(principal.tenantId, focusLeadId, ...scope.values) as unknown as AssignmentEventRow[]
  return rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    previousOwnerId: row.previous_owner_id,
    previousOwnerName: row.previous_owner_name,
    targetOwnerId: row.target_owner_id,
    targetOwnerName: row.target_owner_name,
    actorName: row.actor_name,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

export function getProviderLocalGrowthOverview(
  database: DatabaseSync,
  principal: Principal,
  focusLeadId?: string,
): ProviderLocalGrowthOverview {
  const timestamp = Date.now()
  const rows = listLeadRows(database, principal)
  const focusRow = focusLeadId ? rows.find(({ id }) => id === focusLeadId) : rows[0]
  if (focusLeadId && !focusRow) {
    throw new DomainError(404, 'provider_lead_not_found', '线索不存在或不在当前城市范围内')
  }
  const leadDetails = rows.map((row) => loadLeadDetail(database, row, timestamp))
  const focusLead = focusRow
    ? leadDetails.find(({ lead }) => lead.id === focusRow.id) ?? null
    : null
  const cityId = focusRow?.city_id ?? principal.cityIds[0] ?? 'platform'
  const city = database.prepare(
    `SELECT name FROM organizations
     WHERE tenant_id = ? AND type = 'CITY' AND city_id = ?
     ORDER BY created_at LIMIT 1`,
  ).get(principal.tenantId, cityId) as { name: string } | undefined

  return {
    city: { id: cityId, name: city?.name ?? '全国城市网络' },
    metrics: {
      totalLeads: rows.length,
      awaitingDiagnosis: rows.filter(({ stage }) => stage === 'NEW').length,
      awaitingContract: rows.filter(({ stage }) => ['DIAGNOSED', 'CONTRACT_DRAFT'].includes(stage)).length,
      signed: rows.filter(({ stage }) => ['SIGNED', 'ASSET_REVIEW', 'READY_FOR_DELIVERY'].includes(stage)).length,
      readyForDelivery: rows.filter(({ stage }) => stage === 'READY_FOR_DELIVERY').length,
      overdue: rows.filter((row) => urgency(row, timestamp) === 'OVERDUE').length,
    },
    leads: leadDetails,
    focusLead,
    salespeople: listSalespeople(database, principal, rows),
    packages: [...PROVIDER_PACKAGES],
    assignmentEvents: listAssignmentEvents(database, principal, focusRow?.id ?? null),
    policy: {
      assignmentRuleVersion: ASSIGNMENT_RULE_VERSION,
      packageRuleVersion: PACKAGE_RULE_VERSION,
      cityScopeEnforced: true,
      strongConfirmationRequired: true,
    },
    permissions: {
      canAssign: hasPermission(principal, 'lead.assign'),
      canDiagnose: hasPermission(principal, 'lead.write') && hasPermission(principal, 'ai.use'),
      canCreateContract: hasPermission(principal, 'contract.create'),
      canApproveDiscount: hasPermission(principal, 'contract.discount.approve'),
    },
    updatedAt: rows.reduce(
      (latest, row) => row.updated_at > latest ? row.updated_at : latest,
      new Date(0).toISOString(),
    ),
  }
}

function validateTargetSalesperson(
  database: DatabaseSync,
  principal: Principal,
  targetOwnerId: string,
  cityId: string,
): void {
  const member = database.prepare(
    `SELECT memberships.city_ids_json
     FROM memberships
     JOIN role_assignments ON role_assignments.membership_id = memberships.id
     JOIN users ON users.id = memberships.user_id AND users.status = 'ACTIVE'
     WHERE memberships.tenant_id = ? AND memberships.user_id = ?
       AND memberships.status = 'ACTIVE' AND role_assignments.role = 'CITY_SALES'`,
  ).get(principal.tenantId, targetOwnerId) as { city_ids_json: string } | undefined
  if (!member) {
    throw new DomainError(422, 'provider_salesperson_invalid', '目标人员不是当前租户的在岗销售')
  }
  const cityIds = JSON.parse(member.city_ids_json) as unknown
  if (!Array.isArray(cityIds) || !cityIds.includes(cityId)) {
    throw new DomainError(422, 'provider_salesperson_city_mismatch', '目标销售不属于该线索所在城市')
  }
}

function recordAssignmentEvidence(
  database: DatabaseSync,
  principal: Principal,
  lead: LeadRow,
  targetOwnerId: string,
  reason: string,
  version: number,
  timestamp: string,
): void {
  const payload = {
    previousOwnerId: lead.owner_id,
    targetOwnerId,
    reason,
    leadVersion: version,
    assignmentRuleVersion: ASSIGNMENT_RULE_VERSION,
    cityScopeEnforced: true,
    strongConfirmation: true,
  }
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO provider_lead_assignment_events
     (id, tenant_id, city_id, lead_id, previous_owner_id, target_owner_id,
      actor_id, reason, lead_version, rule_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, lead.city_id, lead.id, lead.owner_id,
    targetOwnerId, principal.subject, reason, version, ASSIGNMENT_RULE_VERSION, timestamp,
  )
  database.prepare(
    `INSERT INTO lead_activities
     (id, tenant_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'PROVIDER_LEAD_ASSIGNED', ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, lead.id, principal.subject,
    '城市线索负责人已强确认调整', payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'PROVIDER_LEAD_ASSIGNED', 'lead', ?, 'L2',
             'APPROVED', '城市线索负责人已强确认调整', ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    lead.id, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, 'provider_lead_assigned', ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, 'provider.lead.assigned.v1', ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, lead.id, payloadJson, timestamp)
}

export function assignProviderLead(
  database: DatabaseSync,
  principal: Principal,
  input: {
    leadId: string
    expectedVersion: number
    targetOwnerId: string
    reason: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderLocalGrowthOverview {
  const route = `/api/v1/provider/local-growth/leads/${input.leadId}/assign`
  const hash = requestHash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== hash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1
       WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as ProviderLocalGrowthOverview
  }
  if (!input.confirmed) {
    throw new DomainError(422, 'provider_assignment_confirmation_required', '调整负责人前必须完成强确认')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const scope = cityScope(principal)
    const lead = database.prepare(
      `SELECT leads.id, leads.tenant_id, leads.city_id, leads.name, leads.category,
              leads.source, leads.contact_name, leads.contact_phone_masked,
              leads.address, leads.owner_id, users.display_name AS owner_display_name,
              leads.stage, leads.protection_expires_at, leads.dispute_status,
              leads.health_score, leads.loss_reason, leads.next_action,
              leads.next_action_at, leads.version, leads.updated_at,
              0 AS assignment_count
       FROM leads JOIN users ON users.id = leads.owner_id
       WHERE leads.id = ? AND leads.tenant_id = ?${scope.clause}`,
    ).get(input.leadId, principal.tenantId, ...scope.values) as unknown as LeadRow | undefined
    if (!lead) {
      throw new DomainError(404, 'provider_lead_not_found', '线索不存在或不在当前城市范围内')
    }
    if (lead.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '线索已被更新，请刷新后重试')
    }
    if (lead.owner_id === input.targetOwnerId) {
      throw new DomainError(409, 'provider_assignment_unchanged', '目标销售已经是当前负责人')
    }
    validateTargetSalesperson(database, principal, input.targetOwnerId, lead.city_id)
    const timestamp = now()
    const nextVersion = lead.version + 1
    const updated = database.prepare(
      `UPDATE leads
       SET owner_id = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND version = ?`,
    ).run(
      input.targetOwnerId, timestamp, lead.id, principal.tenantId, input.expectedVersion,
    )
    if (updated.changes !== 1) {
      throw new DomainError(409, 'stale_entity_version', '线索已被更新，请刷新后重试')
    }
    database.prepare(
      `UPDATE sales_tasks
       SET owner_id = ?, version = version + 1, updated_at = ?
       WHERE tenant_id = ? AND lead_id = ? AND status IN ('PENDING', 'SNOOZED')`,
    ).run(input.targetOwnerId, timestamp, principal.tenantId, lead.id)
    recordAssignmentEvidence(
      database, principal, lead, input.targetOwnerId, input.reason, nextVersion, timestamp,
    )
    const overview = getProviderLocalGrowthOverview(database, principal, lead.id)
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
