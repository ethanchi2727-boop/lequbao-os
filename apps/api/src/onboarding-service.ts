import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  ContractSummary,
  DiagnosisReportSummary,
  LeadCollaboratorSummary,
  LeadActivitySummary,
  LeadStage,
  OnboardingAssetSummary,
  OnboardingLeadSummary,
  OnboardingOverview,
} from '@lequ/contracts'
import { DomainError } from './errors.js'
import { ensureProviderDeliveryCase } from './provider-delivery-case-repository.js'

const TENANT_ID = 'tenant-lequ'
const RUN_ID = 'onboarding-e1'

const authorizationScopes = [
  ['DIGITAL_PROFILE', '数字建档与小程序'],
  ['GEO_DISTRIBUTION', 'GEO 分发'],
  ['SKILL_RUNTIME', 'Skill 生成与调用'],
  ['PLATFORM_DISPLAY', '乐趣生活展示'],
  ['TRANSACTION', '交易、支付与会员'],
  ['VOUCHER_ALLIANCE', '代金券抽佣联盟'],
] as const

const packageListPrices: Readonly<Record<string, number>> = {
  BASIC: 49_800,
  PRO: 99_800,
  AGENT: 169_800,
  CHAIN: 299_800,
}

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
  updated_at: string
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
  signed_at: string | null
  version: number
  authorization_count: number
}

interface AssetRow {
  id: string
  lead_id: string
  asset_type: OnboardingAssetSummary['assetType']
  file_name: string
  confidence: number
  ocr_json: string
  corrected_json: string | null
  status: OnboardingAssetSummary['status']
  source: OnboardingAssetSummary['source']
  byte_size: number | null
  sha256: string | null
  version: number
}

interface CollaboratorRow {
  id: string
  user_id: string
  display_name: string
  role: LeadCollaboratorSummary['role']
  created_at: string
}

interface ActivityRow {
  id: string
  sequence: number
  type: string
  summary: string
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

export interface CreateLeadInput {
  name: string
  category: string
  source: string
  contactName: string
  contactPhoneMasked: string
  address: string
  cityId: string
}

export interface AddFollowUpInput {
  leadId: string
  expectedVersion: number
  channel: 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO'
  summary: string
  nextAction: string
  nextActionAt: string
}

export interface UploadAssetInput {
  leadId: string
  expectedVersion: number
  assetType: OnboardingAssetSummary['assetType']
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

function now(): string {
  return new Date().toISOString()
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function canReadLead(database: DatabaseSync, principal: Principal, lead: LeadRow): boolean {
  if (principal.tenantId !== lead.tenant_id) return false
  if (principal.dataScope === 'PLATFORM') return true
  if (principal.dataScope === 'CITY') return principal.cityIds.includes(lead.city_id)
  if (lead.owner_id === principal.subject) return true
  return Boolean(database.prepare(
    `SELECT 1 FROM lead_collaborators
     WHERE tenant_id = ? AND lead_id = ? AND user_id = ?`,
  ).get(principal.tenantId, lead.id, principal.subject))
}

function leadScope(principal: Principal): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope === 'CITY') {
    if (principal.cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
    return {
      clause: ` AND city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
      values: [...principal.cityIds],
    }
  }
  return {
    clause: ` AND (
      owner_id = ? OR EXISTS (
        SELECT 1 FROM lead_collaborators lc
        WHERE lc.tenant_id = leads.tenant_id
          AND lc.lead_id = leads.id AND lc.user_id = ?
      )
    )`,
    values: [principal.subject, principal.subject],
  }
}

function getLead(database: DatabaseSync, principal: Principal, leadId: string): LeadRow {
  const scope = leadScope(principal)
  const lead = database.prepare(
    `SELECT id, tenant_id, city_id, name, category, source, contact_name,
            contact_phone_masked, address, owner_id, stage, protection_expires_at,
            dispute_status, health_score, loss_reason, next_action, next_action_at,
            version, updated_at
     FROM leads WHERE id = ? AND tenant_id = ?${scope.clause}`,
  ).get(leadId, principal.tenantId, ...scope.values) as unknown as LeadRow | undefined
  if (!lead || !canReadLead(database, principal, lead)) {
    throw new DomainError(404, 'lead_not_found', '线索不存在或不在当前数据范围内')
  }
  return lead
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError(409, 'stale_entity_version', '数据已被更新，请刷新后重试')
  }
}

function assertStage(lead: LeadRow, expected: readonly LeadStage[]): void {
  if (!expected.includes(lead.stage)) {
    throw new DomainError(409, 'invalid_lead_stage', `当前线索阶段 ${lead.stage} 不允许执行此操作`)
  }
}

function recordActivity(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  const riskLevel = typeof payload.riskLevel === 'string' ? payload.riskLevel : 'L1'
  const result = typeof payload.result === 'string' ? payload.result : 'SUCCESS'
  database.prepare(
    `INSERT INTO lead_activities
     (id, tenant_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), principal.tenantId, leadId, principal.subject, type, summary, payloadJson, timestamp)

  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, leadId, riskLevel, result,
    summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, type, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, `onboarding.${type.toLowerCase()}.v1`, leadId, payloadJson, timestamp)
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

function assetSummary(row: AssetRow): OnboardingAssetSummary {
  return {
    id: row.id,
    leadId: row.lead_id,
    assetType: row.asset_type,
    fileName: row.file_name,
    confidence: row.confidence,
    extracted: JSON.parse(row.ocr_json) as Record<string, unknown>,
    corrected: row.corrected_json
      ? JSON.parse(row.corrected_json) as Record<string, unknown>
      : null,
    status: row.status,
    source: row.source,
    byteSize: row.byte_size,
    sha256: row.sha256,
    version: row.version,
  }
}

export function getOnboardingOverview(
  database: DatabaseSync,
  principal: Principal,
  focusLeadId?: string,
): OnboardingOverview {
  const scope = leadScope(principal)
  const rows = database.prepare(
    `SELECT id, tenant_id, city_id, name, category, source, contact_name,
            contact_phone_masked, address, owner_id, stage, protection_expires_at,
            dispute_status, health_score, loss_reason, next_action, next_action_at,
            version, updated_at
     FROM leads WHERE tenant_id = ?${scope.clause}
     ORDER BY CASE WHEN id = 'lead-yunheli' THEN 0 ELSE 1 END, updated_at DESC, id`,
  ).all(principal.tenantId, ...scope.values) as unknown as LeadRow[]
  const accessible = rows
  const focus = focusLeadId
    ? accessible.find((lead) => lead.id === focusLeadId)
    : accessible[0]
  if (focusLeadId && !focus) {
    throw new DomainError(404, 'lead_not_found', '线索不存在或不在当前数据范围内')
  }

  const diagnosis = focus
    ? database.prepare(
        `SELECT id, lead_id, score, grade, findings_json, proposal_json,
                model_version, generated_at
         FROM diagnosis_reports WHERE lead_id = ?`,
      ).get(focus.id) as unknown as DiagnosisRow | undefined
    : undefined
  const contract = focus
    ? database.prepare(
        `SELECT c.id, c.lead_id, c.package_code, c.billing_cycle,
                c.list_price_fen, c.discount_bps, c.final_price_fen,
                c.discount_status, c.status, c.contract_version, c.signed_at,
                c.version, COUNT(a.id) AS authorization_count
         FROM contract_drafts c
         LEFT JOIN contract_authorizations a ON a.contract_id = c.id AND a.status = 'GRANTED'
         WHERE c.lead_id = ? GROUP BY c.id`,
      ).get(focus.id) as unknown as ContractRow | undefined
    : undefined
  const assets = focus
    ? database.prepare(
        `SELECT a.id, a.lead_id, a.asset_type, a.file_name, a.confidence,
                a.ocr_json, a.corrected_json, a.status, a.version,
                CASE WHEN b.id IS NULL THEN 'DEMO_CAPTURE' ELSE 'USER_UPLOAD' END AS source,
                b.byte_size, b.sha256
         FROM onboarding_assets a
         LEFT JOIN onboarding_asset_blobs b ON b.id = (
           SELECT latest.id FROM onboarding_asset_blobs latest
           WHERE latest.asset_id = a.id
           ORDER BY latest.upload_version DESC LIMIT 1
         )
         WHERE a.lead_id = ? ORDER BY a.asset_type`,
      ).all(focus.id) as unknown as AssetRow[]
    : []
  const collaborators = focus
    ? database.prepare(
        `SELECT c.id, c.user_id, u.display_name, c.role, c.created_at
         FROM lead_collaborators c JOIN users u ON u.id = c.user_id
         WHERE c.lead_id = ? ORDER BY c.created_at, c.id`,
      ).all(focus.id) as unknown as CollaboratorRow[]
    : []
  const activities = focus
    ? database.prepare(
        `SELECT id, sequence, type, summary, created_at
         FROM lead_activities WHERE lead_id = ? ORDER BY sequence DESC LIMIT 20`,
      ).all(focus.id) as unknown as ActivityRow[]
    : []
  const timestamp = accessible.reduce(
    (latest, lead) => lead.updated_at > latest ? lead.updated_at : latest,
    new Date(0).toISOString(),
  )
  const currentTime = Date.now()

  return {
    counts: {
      total: accessible.length,
      protected: accessible.filter((lead) => Date.parse(lead.protection_expires_at) > currentTime).length,
      pendingAction: accessible.filter((lead) => lead.stage !== 'READY_FOR_DELIVERY' && lead.stage !== 'LOST').length,
      readyForDelivery: accessible.filter((lead) => lead.stage === 'READY_FOR_DELIVERY').length,
      lost: accessible.filter((lead) => lead.stage === 'LOST').length,
    },
    leads: accessible.map(leadSummary),
    focusLead: focus ? leadSummary(focus) : null,
    diagnosis: diagnosisSummary(diagnosis),
    contract: contractSummary(contract),
    assets: assets.map(assetSummary),
    collaborators: collaborators.map((collaborator) => ({
      id: collaborator.id,
      userId: collaborator.user_id,
      displayName: collaborator.display_name,
      role: collaborator.role,
      createdAt: collaborator.created_at,
    })),
    activities: activities.map((activity) => ({
      id: activity.id,
      sequence: activity.sequence,
      type: activity.type,
      summary: activity.summary,
      createdAt: activity.created_at,
    } satisfies LeadActivitySummary)),
    updatedAt: timestamp,
  }
}

function idempotentMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): OnboardingOverview {
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
    return JSON.parse(stored.response_json) as OnboardingOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const focusLeadId = operation()
    const overview = getOnboardingOverview(database, principal, focusLeadId)
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

export function createLead(
  database: DatabaseSync,
  principal: Principal,
  input: CreateLeadInput,
  idempotencyKey: string,
): OnboardingOverview {
  return idempotentMutation(database, principal, idempotencyKey, '/api/v1/onboarding/leads', input, () => {
    if (principal.dataScope !== 'PLATFORM' && !principal.cityIds.includes(input.cityId)) {
      throw new DomainError(403, 'city_scope_denied', '不能在当前城市范围外创建线索')
    }
    const timestamp = now()
    const leadId = `lead-${randomUUID()}`
    database.prepare(
      `INSERT INTO leads
       (id, tenant_id, city_id, name, category, source, contact_name,
        contact_phone_masked, address, owner_id, stage, protection_expires_at,
        next_action, next_action_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
    ).run(
      leadId, principal.tenantId, input.cityId, input.name, input.category,
      input.source, input.contactName, input.contactPhoneMasked, input.address,
      principal.subject, daysFromNow(30), '运行免费 AI 体检', daysFromNow(1), timestamp, timestamp,
    )
    recordActivity(database, principal, leadId, 'LEAD_CREATED', '线索已创建并进入 30 天销售保护期', {
      source: input.source, riskLevel: 'L0', result: 'SUCCESS',
    }, timestamp)
    return leadId
  })
}

export function addLeadFollowUp(
  database: DatabaseSync,
  principal: Principal,
  input: AddFollowUpInput,
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/followups`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    if (lead.stage === 'LOST') {
      throw new DomainError(409, 'lost_lead_followup_denied', '失单线索需先重新激活后才能新增跟进')
    }
    const timestamp = now()
    database.prepare(
      `INSERT INTO lead_followups
       (id, tenant_id, lead_id, actor_id, channel, summary, next_action,
        next_action_at, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, lead.id, principal.subject, input.channel,
      input.summary, input.nextAction, input.nextActionAt, timestamp, timestamp,
    )
    database.prepare(
      `UPDATE leads SET next_action = ?, next_action_at = ?, version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(input.nextAction, input.nextActionAt, timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'LEAD_FOLLOWUP_ADDED', `已记录${input.channel}跟进：${input.summary}`, {
      channel: input.channel, nextAction: input.nextAction, nextActionAt: input.nextActionAt,
      riskLevel: 'L0', result: 'SUCCESS',
    }, timestamp)
    return lead.id
  })
}

export function markLeadLost(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; expectedVersion: number; reason: string; note: string },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/lost`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    if (['READY_FOR_DELIVERY', 'LOST'].includes(lead.stage)) {
      throw new DomainError(409, 'lead_cannot_be_lost', '当前阶段不能标记为失单')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE leads SET stage = 'LOST', loss_reason = ?, next_action = '等待重新激活',
       next_action_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(input.reason, daysFromNow(90), timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'LEAD_MARKED_LOST', `线索已失单：${input.reason}`, {
      reason: input.reason, note: input.note, riskLevel: 'L1', result: 'APPROVED',
    }, timestamp)
    return lead.id
  })
}

export function addLeadCollaborator(
  database: DatabaseSync,
  principal: Principal,
  input: {
    leadId: string
    expectedVersion: number
    userId: string
    role: LeadCollaboratorSummary['role']
  },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/collaborators`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    const target = database.prepare(
      `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
       WHERE u.id = ? AND u.status = 'ACTIVE' AND m.tenant_id = ? AND m.status = 'ACTIVE'`,
    ).get(input.userId, principal.tenantId)
    if (!target) throw new DomainError(404, 'collaborator_not_found', '协作人不存在或不属于当前租户')
    if (input.userId === lead.owner_id) {
      throw new DomainError(409, 'owner_already_assigned', '线索负责人无需重复添加为协作人')
    }
    const timestamp = now()
    database.prepare(
      `INSERT INTO lead_collaborators
       (id, tenant_id, lead_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(lead_id, user_id) DO UPDATE SET role = excluded.role`,
    ).run(randomUUID(), principal.tenantId, lead.id, input.userId, input.role, timestamp)
    database.prepare(
      `UPDATE leads SET version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'LEAD_COLLABORATOR_ADDED', '已添加跨角色协作人', {
      userId: input.userId, role: input.role, riskLevel: 'L1', result: 'APPROVED',
    }, timestamp)
    return lead.id
  })
}

export function runDiagnosis(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; expectedVersion: number },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/diagnosis`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    assertStage(lead, ['NEW'])
    const timestamp = now()
    const findings: DiagnosisReportSummary['findings'] = [
      { code: 'CHANNEL_PROFILE_GAP', title: '渠道资料完整度不足', severity: 'HIGH', evidence: '3/7 个核心渠道缺少结构化菜单' },
      { code: 'POI_INCONSISTENT', title: '门店地址存在差异', severity: 'MEDIUM', evidence: '地图渠道楼层字段不一致' },
      { code: 'BOOKING_OFFLINE', title: '预约能力未结构化', severity: 'HIGH', evidence: '当前只能通过电话人工确认桌位' },
      { code: 'CONTENT_STALE', title: '内容新鲜度偏低', severity: 'LOW', evidence: '最近一次菜单更新为 68 天前' },
    ]
    const proposal: DiagnosisReportSummary['proposal'] = {
      title: '30 天 AI 原生数字化提升计划',
      priorities: ['统一商家事实', '上线品牌小程序', '发布订座 Skill', '建立 GEO 观测'],
      expectedDays: 30,
    }
    database.prepare(
      `INSERT INTO diagnosis_reports
       (id, tenant_id, lead_id, score, grade, findings_json, proposal_json,
        model_version, status, generated_at)
       VALUES (?, ?, ?, 82, 'B+', ?, ?, 'merchant-diagnosis-2026.07', 'FINAL', ?)`,
    ).run(randomUUID(), principal.tenantId, lead.id, JSON.stringify(findings), JSON.stringify(proposal), timestamp)
    database.prepare(
      `UPDATE leads SET stage = 'DIAGNOSED', health_score = 82,
       next_action = '创建专业版年度合同', next_action_at = ?,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(daysFromNow(1), timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'DIAGNOSIS_COMPLETED', 'AI 商家体检完成：数字健康分 82，识别 4 项关键问题', {
      score: 82, findingCount: findings.length, modelVersion: 'merchant-diagnosis-2026.07',
      riskLevel: 'L0', result: 'SUCCESS',
    }, timestamp)
    return lead.id
  })
}

export function createContractDraft(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; expectedVersion: number; packageCode: string; discountBps: number },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/contracts`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    assertStage(lead, ['DIAGNOSED'])
    const timestamp = now()
    const listPriceFen = packageListPrices[input.packageCode]
    if (listPriceFen === undefined) {
      throw new DomainError(400, 'package_not_found', '所选套餐不存在或已停止销售')
    }
    const finalPriceFen = Math.round(listPriceFen * (10000 - input.discountBps) / 10000)
    const discountStatus: ContractSummary['discountStatus'] =
      input.discountBps <= 500 ? 'AUTO_APPROVED' : 'PENDING'
    database.prepare(
      `INSERT INTO contract_drafts
       (id, tenant_id, lead_id, package_code, billing_cycle, list_price_fen,
        discount_bps, final_price_fen, discount_status, status,
        contract_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'YEAR', ?, ?, ?, ?, 'DRAFT',
               'merchant-agent-pro-2026.07', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, lead.id, input.packageCode,
      listPriceFen, input.discountBps, finalPriceFen, discountStatus, timestamp, timestamp,
    )
    database.prepare(
      `UPDATE leads SET stage = 'CONTRACT_DRAFT',
       next_action = ?, next_action_at = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(
      discountStatus === 'PENDING' ? '等待折扣审批' : '确认合同与六层授权',
      daysFromNow(1), timestamp, lead.id,
    )
    recordActivity(database, principal, lead.id, 'CONTRACT_DRAFTED', `专业版年度合同已创建，成交价 ¥${(finalPriceFen / 100).toFixed(2)}`, {
      packageCode: input.packageCode, discountBps: input.discountBps,
      finalPriceFen, discountStatus, riskLevel: 'L1', result: 'SUCCESS',
    }, timestamp)
    return lead.id
  })
}

export function decideContractDiscount(
  database: DatabaseSync,
  principal: Principal,
  input: {
    leadId: string
    contractId: string
    expectedVersion: number
    decision: 'APPROVE' | 'REJECT'
    note: string
  },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/contracts/${input.contractId}/discount-decision`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertStage(lead, ['CONTRACT_DRAFT'])
    const contract = database.prepare(
      `SELECT id, lead_id, package_code, billing_cycle, list_price_fen,
              discount_bps, final_price_fen, discount_status, status,
              contract_version, signed_at, version, 0 AS authorization_count
       FROM contract_drafts WHERE id = ? AND lead_id = ?`,
    ).get(input.contractId, lead.id) as unknown as ContractRow | undefined
    if (!contract) throw new DomainError(404, 'contract_not_found', '合同不存在')
    assertVersion(contract.version, input.expectedVersion)
    if (contract.status !== 'DRAFT' || contract.discount_status !== 'PENDING') {
      throw new DomainError(409, 'discount_decision_not_pending', '当前合同没有待处理的折扣审批')
    }
    const timestamp = now()
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    database.prepare(
      `UPDATE contract_drafts SET discount_status = ?, version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(status, timestamp, contract.id)
    database.prepare(
      `UPDATE leads SET next_action = ?, next_action_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      input.decision === 'APPROVE' ? '确认合同与六层授权' : '调整套餐或折扣后重新提交',
      daysFromNow(1), timestamp, lead.id,
    )
    recordActivity(
      database,
      principal,
      lead.id,
      input.decision === 'APPROVE' ? 'CONTRACT_DISCOUNT_APPROVED' : 'CONTRACT_DISCOUNT_REJECTED',
      input.decision === 'APPROVE' ? '合同折扣审批已通过' : '合同折扣审批已驳回',
      {
        contractId: contract.id, discountBps: contract.discount_bps, note: input.note,
        riskLevel: 'L2', result: 'APPROVED',
      },
      timestamp,
    )
    return lead.id
  })
}

export function signContract(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; contractId: string; expectedVersion: number },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/contracts/${input.contractId}/sign`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertStage(lead, ['CONTRACT_DRAFT'])
    const contract = database.prepare(
      `SELECT id, lead_id, package_code, billing_cycle, list_price_fen,
              discount_bps, final_price_fen, discount_status, status,
              contract_version, signed_at, version, 0 AS authorization_count
       FROM contract_drafts WHERE id = ? AND lead_id = ?`,
    ).get(input.contractId, lead.id) as unknown as ContractRow | undefined
    if (!contract) throw new DomainError(404, 'contract_not_found', '合同不存在')
    assertVersion(contract.version, input.expectedVersion)
    if (!['AUTO_APPROVED', 'APPROVED'].includes(contract.discount_status)) {
      throw new DomainError(409, 'discount_approval_required', '折扣尚未审批，不能签署合同')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE contract_drafts SET status = 'SIGNED', signed_at = ?,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, timestamp, contract.id)
    const insertAuthorization = database.prepare(
      `INSERT INTO contract_authorizations
       (id, tenant_id, contract_id, scope, label, status, granted_at)
       VALUES (?, ?, ?, ?, ?, 'GRANTED', ?)`,
    )
    for (const [scope, label] of authorizationScopes) {
      insertAuthorization.run(randomUUID(), principal.tenantId, contract.id, scope, label, timestamp)
    }
    database.prepare(
      `UPDATE leads SET stage = 'SIGNED', next_action = '采集执照、门头与菜单',
       next_action_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(daysFromNow(1), timestamp, lead.id)
    ensureProviderDeliveryCase(database, {
      tenantId: principal.tenantId,
      cityId: lead.city_id,
      leadId: lead.id,
      merchantName: lead.name,
      actorId: principal.subject,
      timestamp,
    })
    recordActivity(database, principal, lead.id, 'CONTRACT_SIGNED', '电子合同已签署，六类授权已分别留痕并支持独立撤回', {
      contractId: contract.id, authorizationCount: authorizationScopes.length,
      riskLevel: 'L2', result: 'APPROVED',
    }, timestamp)
    return lead.id
  })
}

export function captureAssets(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; expectedVersion: number },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/assets/capture`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    assertStage(lead, ['SIGNED'])
    const timestamp = now()
    const assets = [
      ['BUSINESS_LICENSE', 'business-license.jpg', 0.99, { companyName: '上海云和里餐饮管理有限公司', creditCode: '91310106MA1FY8****', legalRepresentative: '周云岚' }],
      ['STOREFRONT', 'storefront-jingan.jpg', 0.96, { brandName: '云和里', storeName: '静安店', address: lead.address }],
      ['MENU', 'seasonal-menu.pdf', 0.94, { itemCount: 36, categories: ['时令前菜', '江南主菜', '手作点心', '茶饮'] }],
    ] as const
    const insert = database.prepare(
      `INSERT INTO onboarding_assets
       (id, tenant_id, lead_id, asset_type, file_name, confidence, ocr_json,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'NEEDS_REVIEW', ?, ?)`,
    )
    for (const [type, fileName, confidence, extracted] of assets) {
      insert.run(randomUUID(), principal.tenantId, lead.id, type, fileName, confidence, JSON.stringify(extracted), timestamp, timestamp)
    }
    database.prepare(
      `UPDATE leads SET stage = 'ASSET_REVIEW', next_action = '人工确认 3 项识别资产',
       next_action_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(daysFromNow(1), timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'ASSETS_CAPTURED', '执照、门头与 36 项菜单已完成 OCR/视觉识别，等待人工确认', {
      assetCount: assets.length, riskLevel: 'L1', result: 'SUCCESS',
    }, timestamp)
    return lead.id
  })
}

function recognizeUploadedAsset(
  lead: LeadRow,
  assetType: OnboardingAssetSummary['assetType'],
): { confidence: number; extracted: Record<string, unknown> } {
  switch (assetType) {
    case 'BUSINESS_LICENSE':
      return {
        confidence: 0.97,
        extracted: {
          companyName: `${lead.name.replace(/·.*$/, '')}餐饮管理有限公司`,
          creditCode: '91310106MA1FY8****',
          legalRepresentative: lead.contact_name,
        },
      }
    case 'STOREFRONT':
      return {
        confidence: 0.95,
        extracted: { brandName: lead.name, address: lead.address, visibleSignage: true },
      }
    case 'MENU':
      return {
        confidence: 0.93,
        extracted: { itemCount: 36, currency: 'CNY', categories: ['招牌推荐', '时令菜品', '主食点心', '饮品'] },
      }
  }
}

const assetTypeLabels: Readonly<Record<OnboardingAssetSummary['assetType'], string>> = {
  BUSINESS_LICENSE: '营业执照',
  STOREFRONT: '门头照片',
  MENU: '菜单',
}

export function uploadOnboardingAsset(
  database: DatabaseSync,
  principal: Principal,
  input: UploadAssetInput,
  idempotencyKey: string,
): OnboardingOverview {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > 8 * 1024 * 1024) {
    throw new DomainError(413, 'asset_size_invalid', '资料文件必须大于 0 且不超过 8MB')
  }
  const contentHash = createHash('sha256').update(input.bytes).digest('hex')
  const requestDescriptor = {
    leadId: input.leadId,
    expectedVersion: input.expectedVersion,
    assetType: input.assetType,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    contentHash,
  }
  const route = `/api/v1/onboarding/leads/${input.leadId}/assets/upload`
  return idempotentMutation(database, principal, idempotencyKey, route, requestDescriptor, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    assertStage(lead, ['SIGNED', 'ASSET_REVIEW'])
    const timestamp = now()
    const recognition = recognizeUploadedAsset(lead, input.assetType)
    const existing = database.prepare(
      `SELECT id, status, version FROM onboarding_assets
       WHERE lead_id = ? AND asset_type = ?`,
    ).get(lead.id, input.assetType) as unknown as {
      id: string
      status: OnboardingAssetSummary['status']
      version: number
    } | undefined
    if (existing?.status === 'CONFIRMED') {
      throw new DomainError(409, 'confirmed_asset_replace_denied', '已确认资料需先创建新的资产版本，不能直接覆盖')
    }
    const assetId = existing?.id ?? randomUUID()
    if (existing) {
      database.prepare(
        `UPDATE onboarding_assets SET file_name = ?, confidence = ?, ocr_json = ?,
         corrected_json = NULL, status = 'NEEDS_REVIEW', version = version + 1,
         updated_at = ? WHERE id = ?`,
      ).run(input.fileName, recognition.confidence, JSON.stringify(recognition.extracted), timestamp, assetId)
    } else {
      database.prepare(
        `INSERT INTO onboarding_assets
         (id, tenant_id, lead_id, asset_type, file_name, confidence, ocr_json,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'NEEDS_REVIEW', ?, ?)`,
      ).run(
        assetId, principal.tenantId, lead.id, input.assetType, input.fileName,
        recognition.confidence, JSON.stringify(recognition.extracted), timestamp, timestamp,
      )
    }
    const latestUpload = database.prepare(
      `SELECT COALESCE(MAX(upload_version), 0) AS version
       FROM onboarding_asset_blobs WHERE asset_id = ?`,
    ).get(assetId) as unknown as { version: number }
    database.prepare(
      `INSERT INTO onboarding_asset_blobs
       (id, tenant_id, asset_id, upload_version, mime_type, byte_size,
        sha256, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, assetId, latestUpload.version + 1,
      input.mimeType, input.bytes.byteLength, contentHash, Buffer.from(input.bytes), timestamp,
    )
    const presentRows = database.prepare(
      `SELECT asset_type FROM onboarding_assets WHERE lead_id = ?`,
    ).all(lead.id) as unknown as Array<{ asset_type: OnboardingAssetSummary['assetType'] }>
    const present = new Set(presentRows.map((row) => row.asset_type))
    const missing = (['BUSINESS_LICENSE', 'STOREFRONT', 'MENU'] as const)
      .find((type) => !present.has(type))
    const pending = database.prepare(
      `SELECT COUNT(*) AS count FROM onboarding_assets
       WHERE lead_id = ? AND status != 'CONFIRMED'`,
    ).get(lead.id) as unknown as { count: number }
    const nextAction = missing
      ? `继续上传${assetTypeLabels[missing]}`
      : `人工确认 ${pending.count} 项识别资产`
    database.prepare(
      `UPDATE leads SET stage = 'ASSET_REVIEW', next_action = ?, next_action_at = ?,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(nextAction, daysFromNow(1), timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'ASSET_UPLOADED', `${assetTypeLabels[input.assetType]}已上传并完成识别，等待人工确认`, {
      assetId, assetType: input.assetType, byteSize: input.bytes.byteLength,
      sha256: contentHash, confidence: recognition.confidence,
      riskLevel: 'L1', result: 'SUCCESS',
    }, timestamp)
    return lead.id
  })
}

export function confirmAsset(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; assetId: string; expectedVersion: number; corrected: Record<string, unknown> },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/assets/${input.assetId}/confirm`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertStage(lead, ['ASSET_REVIEW'])
    const asset = database.prepare(
      `SELECT id, lead_id, asset_type, file_name, confidence, ocr_json,
              corrected_json, status, version
       FROM onboarding_assets WHERE id = ? AND lead_id = ?`,
    ).get(input.assetId, lead.id) as unknown as AssetRow | undefined
    if (!asset) throw new DomainError(404, 'asset_not_found', '识别资产不存在')
    assertVersion(asset.version, input.expectedVersion)
    const timestamp = now()
    database.prepare(
      `UPDATE onboarding_assets SET corrected_json = ?, status = 'CONFIRMED',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(input.corrected), timestamp, asset.id)
    const assetCounts = database.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status != 'CONFIRMED' THEN 1 ELSE 0 END) AS remaining
       FROM onboarding_assets WHERE lead_id = ?`,
    ).get(lead.id) as unknown as { total: number; remaining: number }
    if (assetCounts.total === 3 && assetCounts.remaining === 0) {
      database.prepare(
        `UPDATE leads SET stage = 'READY_FOR_DELIVERY',
         next_action = '移交城市服务商启动 MiniApp 交付', next_action_at = ?,
         version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(daysFromNow(1), timestamp, lead.id)
    } else if (assetCounts.total < 3) {
      const presentRows = database.prepare(
        `SELECT asset_type FROM onboarding_assets WHERE lead_id = ?`,
      ).all(lead.id) as unknown as Array<{ asset_type: OnboardingAssetSummary['assetType'] }>
      const present = new Set(presentRows.map((row) => row.asset_type))
      const missing = (['BUSINESS_LICENSE', 'STOREFRONT', 'MENU'] as const)
        .find((type) => !present.has(type))
      database.prepare(
        `UPDATE leads SET next_action = ?, updated_at = ? WHERE id = ?`,
      ).run(missing ? `继续上传${assetTypeLabels[missing]}` : '继续上传资料', timestamp, lead.id)
    } else {
      database.prepare(
        `UPDATE leads SET next_action = ?, updated_at = ? WHERE id = ?`,
      ).run(`继续确认 ${assetCounts.remaining} 项识别资产`, timestamp, lead.id)
    }
    recordActivity(database, principal, lead.id, 'ASSET_CONFIRMED', `${asset.asset_type} 识别结果已人工确认`, {
      assetId: asset.id, remaining: assetCounts.remaining, riskLevel: 'L1', result: 'APPROVED',
    }, timestamp)
    return lead.id
  })
}

export function transferLead(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; targetOwnerId: string; reason: string; expectedVersion: number },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/transfer`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    assertVersion(lead.version, input.expectedVersion)
    const target = database.prepare(
      `SELECT id FROM users WHERE id = ? AND status = 'ACTIVE'`,
    ).get(input.targetOwnerId)
    if (!target) throw new DomainError(404, 'target_owner_not_found', '目标销售不存在')
    const timestamp = now()
    database.prepare(
      `UPDATE leads SET owner_id = ?, protection_expires_at = ?,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(input.targetOwnerId, daysFromNow(30), timestamp, lead.id)
    recordActivity(database, principal, lead.id, 'LEAD_TRANSFERRED', `线索已转移并重新计算 30 天保护期：${input.reason}`, {
      previousOwnerId: lead.owner_id, targetOwnerId: input.targetOwnerId,
      reason: input.reason, riskLevel: 'L2', result: 'APPROVED',
    }, timestamp)
    return lead.id
  })
}

export function submitLeadAppeal(
  database: DatabaseSync,
  principal: Principal,
  input: { leadId: string; reason: string; evidence: string[] },
  idempotencyKey: string,
): OnboardingOverview {
  const route = `/api/v1/onboarding/leads/${input.leadId}/appeals`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    const pendingAppeal = database.prepare(
      `SELECT id FROM lead_appeals
       WHERE tenant_id = ? AND lead_id = ? AND status = 'PENDING'`,
    ).get(principal.tenantId, lead.id)
    if (pendingAppeal) {
      throw new DomainError(409, 'appeal_pending', '当前线索已有待裁决归属申诉')
    }
    const pendingTransfer = database.prepare(
      `SELECT id FROM lead_transfer_requests
       WHERE tenant_id = ? AND lead_id = ? AND status = 'PENDING'`,
    ).get(principal.tenantId, lead.id)
    if (pendingTransfer) {
      throw new DomainError(409, 'transfer_request_pending', '待审批转移申请处理完成前不能提交归属申诉')
    }
    const timestamp = now()
    const appealId = `ownership-appeal-${randomUUID()}`
    database.prepare(
      `INSERT INTO lead_appeals
       (id, tenant_id, lead_id, applicant_id, reason, evidence_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    ).run(appealId, principal.tenantId, lead.id, principal.subject, input.reason, JSON.stringify(input.evidence), timestamp)
    database.prepare(
      `UPDATE leads SET dispute_status = 'PENDING', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(timestamp, lead.id)
    database.prepare(
      `INSERT INTO lead_ownership_events
       (id, tenant_id, lead_id, request_id, actor_id, type, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'APPEAL_SUBMITTED', ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, lead.id, appealId, principal.subject,
      '归属申诉已提交，保护期与转移操作暂时冻结',
      JSON.stringify({ reason: input.reason, evidenceCount: input.evidence.length }),
      timestamp,
    )
    recordActivity(database, principal, lead.id, 'LEAD_APPEAL_SUBMITTED', '线索归属申诉已提交，等待城市经理裁决', {
      reason: input.reason, evidenceCount: input.evidence.length,
      riskLevel: 'L2', result: 'APPROVED',
    }, timestamp)
    return lead.id
  })
}
