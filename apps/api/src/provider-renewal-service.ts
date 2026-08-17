import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  ProviderRenewalCaseStatus,
  ProviderRenewalCaseSummary,
  ProviderRenewalEventSummary,
  ProviderRenewalEvidenceSummary,
  ProviderRenewalLossReason,
  ProviderRenewalOverview,
  ProviderRenewalProposalSummary,
  ProviderRenewalReminderType,
  ProviderRenewalRiskBand,
} from '@lequ/contracts'
import { DomainError } from './errors.js'
import { PROVIDER_PACKAGES } from './provider-local-growth-service.js'

const RUN_ID = 'provider-renewal-e7'
const POLICY_VERSION = 'provider-renewal-policy-v1'
const PROPOSAL_VERSION = 'provider-renewal-proposal-v1'
export const PROVIDER_RENEWAL_SCAN_INTERVAL_SECONDS = 15 * 60
const DAY_MS = 24 * 60 * 60 * 1000
const REMINDERS = [
  { type: 'DAY_30', eventType: 'REMINDER_30', days: 30, label: '价值回顾', meaning: '先用服务证据建立续费共识' },
  { type: 'DAY_15', eventType: 'REMINDER_15', days: 15, label: '提案确认', meaning: '确认套餐、预算与决策链' },
  { type: 'DAY_7', eventType: 'REMINDER_7', days: 7, label: '签约推进', meaning: '锁定异议、合同与开票动作' },
  { type: 'DAY_1', eventType: 'REMINDER_1', days: 1, label: '到期守护', meaning: '确认连续服务或流失结论' },
] as const
const LOSS_REASON_LABELS: Record<ProviderRenewalLossReason, string> = {
  PRICE: '价格与预算',
  LOW_USAGE: '使用深度不足',
  SERVICE_GAP: '服务体验缺口',
  BUSINESS_CLOSED: '停业或闭店',
  COMPETITOR: '选择竞品',
  CASH_FLOW: '现金流压力',
  TIMING: '当前时机不合适',
  OTHER: '其他原因',
}

type PackageCode = 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'

interface CaseRow {
  id: string
  tenant_id: string
  city_id: string
  lead_id: string
  merchant_name: string
  source: ProviderRenewalCaseSummary['source']
  source_contract_id: string | null
  current_package_code: PackageCode
  current_price_fen: number
  service_started_at: string
  service_ends_at: string
  status: ProviderRenewalCaseStatus
  owner_id: string
  owner_name: string
  loss_reason: ProviderRenewalLossReason | null
  loss_detail: string | null
  recoverable: number | null
  recovery_action: string | null
  renewed_package_code: PackageCode | null
  renewed_price_fen: number | null
  renewed_at: string | null
  version: number
  updated_at: string
}

interface ProposalRow {
  id: string
  version: number
  current_package_code: PackageCode
  recommended_package_code: PackageCode
  list_price_fen: number
  offer_price_fen: number
  discount_bps: number
  recommendation: string
  value_narrative: string
  evidence_json: string
  policy_version: string
  created_by_name: string
  created_at: string
}

interface EventRow {
  id: string
  sequence: number
  type: ProviderRenewalEventSummary['type']
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

function cityScope(principal: Principal, alias = 'cases'): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope !== 'CITY' || principal.cityIds.length === 0) {
    return { clause: ' AND 0 = 1', values: [] }
  }
  return {
    clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
    values: [...principal.cityIds],
  }
}

function daysRemaining(serviceEndsAt: string, timestamp = Date.now()): number {
  return Math.ceil((Date.parse(serviceEndsAt) - timestamp) / DAY_MS)
}

function riskBand(days: number): ProviderRenewalRiskBand {
  if (days < 0) return 'EXPIRED'
  if (days <= 1) return 'CRITICAL'
  if (days <= 7) return 'AT_RISK'
  if (days <= 15) return 'WATCH'
  return 'HEALTHY'
}

function packageOf(code: PackageCode) {
  const item = PROVIDER_PACKAGES.find((candidate) => candidate.code === code)
  if (!item) throw new DomainError(500, 'renewal_package_missing', '续费套餐目录配置缺失')
  return item
}

function loadEvidence(
  database: DatabaseSync,
  tenantId: string,
  leadId: string,
): ProviderRenewalEvidenceSummary {
  const delivery = database.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
     FROM provider_delivery_work_orders
     WHERE tenant_id = ? AND lead_id = ?`,
  ).get(tenantId, leadId) as { total: number; completed: number | null }
  const geo = database.prepare(
    `SELECT score FROM geo_workspaces
     WHERE tenant_id = ? AND lead_id = ?`,
  ).get(tenantId, leadId) as { score: number | null } | undefined
  const skills = database.prepare(
    `SELECT COUNT(*) AS count
     FROM skill_network_versions versions
     JOIN skill_suites suites ON suites.id = versions.suite_id
     WHERE suites.tenant_id = ? AND suites.lead_id = ?
       AND versions.status = 'ONLINE'`,
  ).get(tenantId, leadId) as { count: number }
  const transactions = database.prepare(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(performance_delta_fen), 0) AS gmv
     FROM sales_commission_ledger
     WHERE tenant_id = ? AND lead_id = ?
       AND category = 'TRANSACTION_SHARE'
       AND kind = 'RECOGNITION'
       AND performance_delta_fen > 0`,
  ).get(tenantId, leadId) as { count: number; gmv: number }
  const completedWorkOrders = delivery.completed ?? 0
  const onlineSkills = skills.count
  const evidence: string[] = []
  if (completedWorkOrders > 0) evidence.push(`${completedWorkOrders} 个交付工单已完成`)
  if (geo?.score !== null && geo?.score !== undefined) evidence.push(`GEO 最新健康分 ${geo.score}`)
  if (onlineSkills > 0) evidence.push(`${onlineSkills} 项 Skill 已在线`)
  if (transactions.count > 0) {
    evidence.push(`${transactions.count} 笔已确认交易事实，累计 ¥${(transactions.gmv / 100).toFixed(0)}`)
  }
  if (evidence.length === 0) evidence.push('当前仅有合同与服务周期事实，建议先补齐效果复盘')
  return {
    deliveryCompleted: completedWorkOrders > 0,
    completedWorkOrders,
    geoScore: geo?.score ?? null,
    onlineSkills,
    completedOrders: transactions.count,
    completedGmvFen: transactions.gmv,
    evidence,
    measuredAt: now(),
  }
}

function proposalSummary(row: ProposalRow | undefined): ProviderRenewalProposalSummary | null {
  if (!row) return null
  const recommended = packageOf(row.recommended_package_code)
  return {
    id: row.id,
    version: row.version,
    currentPackageCode: row.current_package_code,
    recommendedPackageCode: row.recommended_package_code,
    recommendedPackageName: recommended.name,
    upgradeRecommended: row.current_package_code !== row.recommended_package_code,
    listPriceFen: row.list_price_fen,
    offerPriceFen: row.offer_price_fen,
    discountBps: row.discount_bps,
    recommendation: row.recommendation,
    valueNarrative: row.value_narrative,
    evidence: JSON.parse(row.evidence_json) as string[],
    policyVersion: row.policy_version,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
  }
}

function latestReminder(
  database: DatabaseSync,
  caseId: string,
): ProviderRenewalReminderType | null {
  const event = database.prepare(
    `SELECT type FROM provider_renewal_events
     WHERE case_id = ? AND type LIKE 'REMINDER_%'
     ORDER BY CASE type
       WHEN 'REMINDER_1' THEN 1
       WHEN 'REMINDER_7' THEN 2
       WHEN 'REMINDER_15' THEN 3
       WHEN 'REMINDER_30' THEN 4
       ELSE 5 END
     LIMIT 1`,
  ).get(caseId) as { type: string } | undefined
  if (!event) return null
  return `DAY_${event.type.replace('REMINDER_', '')}` as ProviderRenewalReminderType
}

function commissionForCase(
  database: DatabaseSync,
  caseId: string,
): ProviderRenewalCaseSummary['commission'] {
  const row = database.prepare(
    `SELECT id, estimated_commission_delta_fen, rule_snapshot_json
     FROM sales_commission_ledger
     WHERE source_id = ? AND category = 'RENEWAL' AND kind = 'RECOGNITION'
     ORDER BY sequence DESC LIMIT 1`,
  ).get(caseId) as {
    id: string
    estimated_commission_delta_fen: number
    rule_snapshot_json: string
  } | undefined
  if (!row) return null
  const snapshot = JSON.parse(row.rule_snapshot_json) as { rateBps?: unknown }
  return {
    ledgerEntryId: row.id,
    rateBps: typeof snapshot.rateBps === 'number' ? snapshot.rateBps : 0,
    estimatedFen: row.estimated_commission_delta_fen,
  }
}

function listCaseRows(database: DatabaseSync, principal: Principal): CaseRow[] {
  const scope = cityScope(principal)
  return database.prepare(
    `SELECT cases.id, cases.tenant_id, cases.city_id, cases.lead_id,
            leads.name AS merchant_name, cases.source, cases.source_contract_id,
            cases.current_package_code, cases.current_price_fen,
            cases.service_started_at, cases.service_ends_at, cases.status,
            cases.owner_id, users.display_name AS owner_name,
            cases.loss_reason, cases.loss_detail, cases.recoverable,
            cases.recovery_action, cases.renewed_package_code,
            cases.renewed_price_fen, cases.renewed_at, cases.version,
            cases.updated_at
     FROM provider_renewal_cases cases
     JOIN leads ON leads.id = cases.lead_id
     JOIN users ON users.id = cases.owner_id
     WHERE cases.tenant_id = ?${scope.clause}
     ORDER BY
       CASE cases.status
         WHEN 'PROPOSAL_READY' THEN 0
         WHEN 'MONITORING' THEN 1
         WHEN 'RENEWED' THEN 2
         ELSE 3 END,
       cases.service_ends_at,
       cases.updated_at DESC`,
  ).all(principal.tenantId, ...scope.values) as unknown as CaseRow[]
}

function caseSummary(database: DatabaseSync, row: CaseRow): ProviderRenewalCaseSummary {
  const proposal = database.prepare(
    `SELECT proposals.id, proposals.version, proposals.current_package_code,
            proposals.recommended_package_code, proposals.list_price_fen,
            proposals.offer_price_fen, proposals.discount_bps,
            proposals.recommendation, proposals.value_narrative,
            proposals.evidence_json, proposals.policy_version,
            users.display_name AS created_by_name, proposals.created_at
     FROM provider_renewal_proposals proposals
     JOIN users ON users.id = proposals.created_by
     WHERE proposals.case_id = ?
     ORDER BY proposals.version DESC LIMIT 1`,
  ).get(row.id) as unknown as ProposalRow | undefined
  const days = daysRemaining(row.service_ends_at)
  return {
    id: row.id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    cityId: row.city_id,
    owner: { userId: row.owner_id, displayName: row.owner_name },
    source: row.source,
    sourceContractId: row.source_contract_id,
    currentPackageCode: row.current_package_code,
    currentPackageName: packageOf(row.current_package_code).name,
    currentPriceFen: row.current_price_fen,
    serviceStartedAt: row.service_started_at,
    serviceEndsAt: row.service_ends_at,
    daysRemaining: days,
    riskBand: riskBand(days),
    status: row.status,
    latestReminder: latestReminder(database, row.id),
    proposal: proposalSummary(proposal),
    lossReason: row.loss_reason,
    lossDetail: row.loss_detail,
    recoverable: row.recoverable === null ? null : row.recoverable === 1,
    recoveryAction: row.recovery_action,
    renewedPackageCode: row.renewed_package_code,
    renewedPriceFen: row.renewed_price_fen,
    renewedAt: row.renewed_at,
    commission: commissionForCase(database, row.id),
    evidence: loadEvidence(database, row.tenant_id, row.lead_id),
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function listEvents(
  database: DatabaseSync,
  principal: Principal,
  caseId: string | null,
): ProviderRenewalEventSummary[] {
  if (!caseId) return []
  const scope = cityScope(principal, 'cases')
  const rows = database.prepare(
    `SELECT events.id, events.sequence, events.type, events.summary,
            users.display_name AS actor_name, events.payload_json,
            events.created_at
     FROM provider_renewal_events events
     JOIN provider_renewal_cases cases ON cases.id = events.case_id
     JOIN users ON users.id = events.actor_id
     WHERE events.tenant_id = ? AND events.case_id = ?${scope.clause}
     ORDER BY events.sequence DESC`,
  ).all(principal.tenantId, caseId, ...scope.values) as unknown as EventRow[]
  return rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    type: row.type,
    summary: row.summary,
    actorName: row.actor_name,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
  }))
}

export function getProviderRenewalOverview(
  database: DatabaseSync,
  principal: Principal,
  focusCaseId?: string,
): ProviderRenewalOverview {
  const rows = listCaseRows(database, principal)
  const activeRows = rows.filter(({ status }) => ['MONITORING', 'PROPOSAL_READY'].includes(status))
  const focusRow = focusCaseId
    ? rows.find(({ id }) => id === focusCaseId)
    : activeRows[0] ?? rows[0]
  if (focusCaseId && !focusRow) {
    throw new DomainError(404, 'renewal_case_not_found', '续费机会不存在或不在当前城市范围内')
  }
  const cases = rows.map((row) => caseSummary(database, row))
  const focusCase = focusRow
    ? cases.find(({ id }) => id === focusRow.id) ?? null
    : null
  const cityId = focusRow?.city_id ?? principal.cityIds[0] ?? 'platform'
  const city = database.prepare(
    `SELECT name FROM organizations
     WHERE tenant_id = ? AND type = 'CITY' AND city_id = ?
     ORDER BY created_at LIMIT 1`,
  ).get(principal.tenantId, cityId) as { name: string } | undefined
  const closed = rows.filter(({ status }) => ['RENEWED', 'LOST'].includes(status))
  const renewed = rows.filter(({ status }) => status === 'RENEWED')
  const lossReasons = (Object.entries(LOSS_REASON_LABELS) as Array<[
    ProviderRenewalLossReason,
    string,
  ]>).map(([code, label]) => ({
    code,
    label,
    count: rows.filter(({ loss_reason }) => loss_reason === code).length,
  }))
  const lastScan = database.prepare(
    `SELECT MAX(created_at) AS scanned_at FROM audit_events
     WHERE run_id = ? AND tenant_id = ? AND action = 'PROVIDER_RENEWAL_SCANNED'`,
  ).get(RUN_ID, principal.tenantId) as { scanned_at: string | null }
  return {
    city: { id: cityId, name: city?.name ?? '全国城市网络' },
    metrics: {
      active: activeRows.length,
      dueWithin30Days: activeRows.filter((row) => daysRemaining(row.service_ends_at) <= 30).length,
      critical: activeRows.filter((row) => daysRemaining(row.service_ends_at) <= 7).length,
      proposalReady: rows.filter(({ status }) => status === 'PROPOSAL_READY').length,
      renewed: renewed.length,
      lost: rows.filter(({ status }) => status === 'LOST').length,
      renewalRate: closed.length === 0 ? 0 : Math.round(renewed.length / closed.length * 100),
      renewalRevenueFen: renewed.reduce((sum, row) => sum + (row.renewed_price_fen ?? 0), 0),
      estimatedCommissionFen: cases.reduce(
        (sum, item) => sum + (item.commission?.estimatedFen ?? 0),
        0,
      ),
    },
    reminderBuckets: REMINDERS.map((reminder) => ({
      type: reminder.type,
      days: reminder.days,
      label: reminder.label,
      caseCount: activeRows.filter((row) => {
        const remaining = daysRemaining(row.service_ends_at)
        const previous = REMINDERS.find((candidate) => candidate.days < reminder.days)?.days ?? 0
        return remaining <= reminder.days && remaining > previous
      }).length,
      meaning: reminder.meaning,
    })),
    cases,
    focusCase,
    events: listEvents(database, principal, focusRow?.id ?? null),
    lossReasons,
    packages: [...PROVIDER_PACKAGES],
    policy: {
      version: POLICY_VERSION,
      proposalVersion: PROPOSAL_VERSION,
      reminderDays: [30, 15, 7, 1],
      notificationDelivery: 'OUTBOX_PENDING_CONNECTOR',
      recommendationGuardrail: '建议仅基于已确认服务事实，不承诺收益、排名或续费结果',
      appendOnlyEvidence: true,
    },
    permissions: {
      canManage: hasPermission(principal, 'delivery.renewal.manage'),
      canScan: hasPermission(principal, 'delivery.renewal.scan'),
    },
    lastScanAt: lastScan.scanned_at,
    updatedAt: rows.reduce(
      (latest, row) => row.updated_at > latest ? row.updated_at : latest,
      new Date(0).toISOString(),
    ),
  }
}

function appendEvent(
  database: DatabaseSync,
  input: {
    tenantId: string
    caseId: string
    leadId: string
    actorId: string
    type: ProviderRenewalEventSummary['type']
    dedupeKey: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): boolean {
  const result = database.prepare(
    `INSERT OR IGNORE INTO provider_renewal_events
     (id, tenant_id, case_id, lead_id, actor_id, type, dedupe_key,
      summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.tenantId,
    input.caseId,
    input.leadId,
    input.actorId,
    input.type,
    input.dedupeKey,
    input.summary,
    JSON.stringify(input.payload),
    input.timestamp,
  )
  return result.changes === 1
}

function bootstrapSignedContracts(
  database: DatabaseSync,
  principal: Principal,
  timestamp: string,
): void {
  const scope = cityScope(principal, 'leads')
  const rows = database.prepare(
    `SELECT contracts.id, contracts.lead_id, contracts.package_code,
            contracts.final_price_fen, contracts.signed_at,
            leads.city_id, leads.owner_id
     FROM contract_drafts contracts
     JOIN leads ON leads.id = contracts.lead_id
     WHERE contracts.tenant_id = ? AND contracts.status = 'SIGNED'
       AND contracts.signed_at IS NOT NULL${scope.clause}
       AND NOT EXISTS (
         SELECT 1 FROM provider_renewal_cases cases
         WHERE cases.source_contract_id = contracts.id
       )`,
  ).all(principal.tenantId, ...scope.values) as unknown as Array<{
    id: string
    lead_id: string
    package_code: PackageCode
    final_price_fen: number
    signed_at: string
    city_id: string
    owner_id: string
  }>
  for (const row of rows) {
    const serviceEnd = new Date(row.signed_at)
    serviceEnd.setUTCFullYear(serviceEnd.getUTCFullYear() + 1)
    const caseId = `renewal-${row.id}`
    database.prepare(
      `INSERT INTO provider_renewal_cases
       (id, tenant_id, city_id, lead_id, source, source_contract_id,
        current_package_code, current_price_fen, service_started_at,
        service_ends_at, status, owner_id, version, policy_version,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SIGNED_CONTRACT', ?, ?, ?, ?, ?, 'MONITORING',
               ?, 1, ?, ?, ?)`,
    ).run(
      caseId,
      principal.tenantId,
      row.city_id,
      row.lead_id,
      row.id,
      row.package_code,
      row.final_price_fen,
      row.signed_at,
      serviceEnd.toISOString(),
      row.owner_id,
      POLICY_VERSION,
      timestamp,
      timestamp,
    )
    appendEvent(database, {
      tenantId: principal.tenantId,
      caseId,
      leadId: row.lead_id,
      actorId: principal.subject,
      type: 'CASE_CREATED',
      dedupeKey: `${caseId}:CASE_CREATED`,
      summary: '已签合同自动建立续费服务周期',
      payload: {
        sourceContractId: row.id,
        currentPackageCode: row.package_code,
        serviceEndsAt: serviceEnd.toISOString(),
        policyVersion: POLICY_VERSION,
      },
      timestamp,
    })
  }
}

export function runProviderRenewalScan(
  database: DatabaseSync,
  principal: Principal,
): ProviderRenewalOverview {
  const timestamp = now()
  database.exec('BEGIN IMMEDIATE;')
  try {
    bootstrapSignedContracts(database, principal, timestamp)
    const scope = cityScope(principal)
    const cases = database.prepare(
      `SELECT cases.id, cases.lead_id, cases.service_ends_at, leads.name
       FROM provider_renewal_cases cases
       JOIN leads ON leads.id = cases.lead_id
       WHERE cases.tenant_id = ?
         AND cases.status IN ('MONITORING', 'PROPOSAL_READY')${scope.clause}`,
    ).all(principal.tenantId, ...scope.values) as unknown as Array<{
      id: string
      lead_id: string
      service_ends_at: string
      name: string
    }>
    let createdReminderCount = 0
    for (const renewalCase of cases) {
      const remaining = daysRemaining(renewalCase.service_ends_at, Date.parse(timestamp))
      for (const reminder of REMINDERS) {
        if (remaining > reminder.days) continue
        const payload = {
          reminderType: reminder.type,
          thresholdDays: reminder.days,
          daysRemaining: remaining,
          serviceEndsAt: renewalCase.service_ends_at,
          deliveryMode: 'OUTBOX_PENDING_CONNECTOR',
          policyVersion: POLICY_VERSION,
        }
        const inserted = appendEvent(database, {
          tenantId: principal.tenantId,
          caseId: renewalCase.id,
          leadId: renewalCase.lead_id,
          actorId: principal.subject,
          type: reminder.eventType,
          dedupeKey: `${renewalCase.id}:${reminder.eventType}`,
          summary: `${renewalCase.name} 已进入到期 ${reminder.days} 天续费节点`,
          payload,
          timestamp,
        })
        if (!inserted) continue
        createdReminderCount += 1
        database.prepare(
          `INSERT INTO outbox_events
           (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
           VALUES (?, ?, ?, 'provider.renewal.reminder.pending.v1', ?, ?, ?)`,
        ).run(
          randomUUID(),
          RUN_ID,
          principal.tenantId,
          renewalCase.id,
          JSON.stringify(payload),
          timestamp,
        )
      }
      database.prepare(
        `UPDATE provider_renewal_cases SET updated_at = ?
         WHERE id = ? AND updated_at < ?`,
      ).run(timestamp, renewalCase.id, timestamp)
    }
    const auditPayload = JSON.stringify({
      scannedCases: cases.length,
      createdReminderCount,
      reminderDays: REMINDERS.map(({ days }) => days),
      deliveryMode: 'OUTBOX_PENDING_CONNECTOR',
      policyVersion: POLICY_VERSION,
    })
    database.prepare(
      `INSERT INTO audit_events
       (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
        risk_level, result, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'PROVIDER_RENEWAL_SCANNED', 'renewal_portfolio',
               ?, 'L1', 'APPROVED', '续费到期节点扫描完成', ?, ?)`,
    ).run(
      randomUUID(),
      RUN_ID,
      principal.tenantId,
      principal.roles[0] ?? 'system',
      principal.tenantId,
      auditPayload,
      timestamp,
    )
    database.prepare(
      `INSERT INTO tracking_events
       (id, run_id, tenant_id, name, properties_json, created_at)
       VALUES (?, ?, ?, 'provider_renewal_scanned', ?, ?)`,
    ).run(randomUUID(), RUN_ID, principal.tenantId, auditPayload, timestamp)
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
  return getProviderRenewalOverview(database, principal)
}

function getMutableCase(
  database: DatabaseSync,
  principal: Principal,
  caseId: string,
): CaseRow {
  const scope = cityScope(principal)
  const row = database.prepare(
    `SELECT cases.id, cases.tenant_id, cases.city_id, cases.lead_id,
            leads.name AS merchant_name, cases.source, cases.source_contract_id,
            cases.current_package_code, cases.current_price_fen,
            cases.service_started_at, cases.service_ends_at, cases.status,
            cases.owner_id, users.display_name AS owner_name,
            cases.loss_reason, cases.loss_detail, cases.recoverable,
            cases.recovery_action, cases.renewed_package_code,
            cases.renewed_price_fen, cases.renewed_at, cases.version,
            cases.updated_at
     FROM provider_renewal_cases cases
     JOIN leads ON leads.id = cases.lead_id
     JOIN users ON users.id = cases.owner_id
     WHERE cases.id = ? AND cases.tenant_id = ?${scope.clause}`,
  ).get(caseId, principal.tenantId, ...scope.values) as unknown as CaseRow | undefined
  if (!row) {
    throw new DomainError(404, 'renewal_case_not_found', '续费机会不存在或不在当前城市范围内')
  }
  return row
}

function recommendPackage(
  currentCode: PackageCode,
  evidence: ProviderRenewalEvidenceSummary,
): {
  code: PackageCode
  recommendation: string
  valueNarrative: string
} {
  if (
    currentCode === 'BASIC'
    && ((evidence.geoScore ?? 0) >= 70 || evidence.completedWorkOrders >= 2)
  ) {
    return {
      code: 'PRO',
      recommendation: '建议从数字建档版升级为增长专业版',
      valueNarrative: '现有服务事实已具备持续经营基础，专业版可把小程序、GEO 与经营看板纳入同一服务周期。',
    }
  }
  if (
    currentCode === 'PRO'
    && (evidence.onlineSkills >= 3 || evidence.completedGmvFen >= 100_000)
  ) {
    return {
      code: 'AGENT',
      recommendation: '建议从增长专业版升级为 AI Agent 版',
      valueNarrative: '已确认的在线 Skill 或交易事实表明能力调用已进入经营环节，Agent 版可增加调用治理和质量监控。',
    }
  }
  return {
    code: currentCode,
    recommendation: `建议续订${packageOf(currentCode).name}`,
    valueNarrative: '当前证据不足以支持升级，先保持服务连续性，并在下一周期补齐使用深度和效果复盘。',
  }
}

function idempotencyReplay<T>(
  database: DatabaseSync,
  key: string,
  route: string,
  hash: string,
): T | null {
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(key, route) as unknown as IdempotencyRow | undefined
  if (!stored) return null
  if (stored.request_hash !== hash) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
  }
  database.prepare(
    `UPDATE idempotency_records SET replay_count = replay_count + 1
     WHERE key = ? AND route = ?`,
  ).run(key, route)
  return JSON.parse(stored.response_json) as T
}

export function generateProviderRenewalProposal(
  database: DatabaseSync,
  principal: Principal,
  input: {
    caseId: string
    expectedVersion: number
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderRenewalOverview {
  const route = `/api/v1/provider/renewals/${input.caseId}/proposals`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderRenewalOverview>(
    database,
    idempotencyKey,
    route,
    hash,
  )
  if (replay) return replay
  if (!input.confirmed) {
    throw new DomainError(422, 'renewal_proposal_confirmation_required', '生成客户提案前必须完成强确认')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const renewalCase = getMutableCase(database, principal, input.caseId)
    if (renewalCase.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '续费机会已更新，请刷新后重试')
    }
    if (!['MONITORING', 'PROPOSAL_READY'].includes(renewalCase.status)) {
      throw new DomainError(409, 'renewal_case_closed', '已关闭的续费机会不能重新生成提案')
    }
    const evidence = loadEvidence(database, renewalCase.tenant_id, renewalCase.lead_id)
    const recommendation = recommendPackage(renewalCase.current_package_code, evidence)
    const recommendedPackage = packageOf(recommendation.code)
    const versionRow = database.prepare(
      `SELECT COALESCE(MAX(version), 0) + 1 AS version
       FROM provider_renewal_proposals WHERE case_id = ?`,
    ).get(renewalCase.id) as { version: number }
    const proposalId = `renewal-proposal-${randomUUID()}`
    const timestamp = now()
    database.prepare(
      `INSERT INTO provider_renewal_proposals
       (id, tenant_id, case_id, version, current_package_code,
        recommended_package_code, list_price_fen, offer_price_fen,
        discount_bps, recommendation, value_narrative, evidence_json,
        evidence_snapshot_json, policy_version, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      proposalId,
      principal.tenantId,
      renewalCase.id,
      versionRow.version,
      renewalCase.current_package_code,
      recommendation.code,
      recommendedPackage.listPriceFen,
      recommendedPackage.listPriceFen,
      recommendation.recommendation,
      recommendation.valueNarrative,
      JSON.stringify(evidence.evidence),
      JSON.stringify(evidence),
      PROPOSAL_VERSION,
      principal.subject,
      timestamp,
    )
    const updated = database.prepare(
      `UPDATE provider_renewal_cases
       SET status = 'PROPOSAL_READY', version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(timestamp, renewalCase.id, input.expectedVersion)
    if (updated.changes !== 1) {
      throw new DomainError(409, 'stale_entity_version', '续费机会已更新，请刷新后重试')
    }
    const payload = {
      proposalId,
      proposalVersion: versionRow.version,
      currentPackageCode: renewalCase.current_package_code,
      recommendedPackageCode: recommendation.code,
      upgradeRecommended: renewalCase.current_package_code !== recommendation.code,
      evidence: evidence.evidence,
      guardrail: '不承诺收益、排名或续费结果',
      policyVersion: PROPOSAL_VERSION,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      caseId: renewalCase.id,
      leadId: renewalCase.lead_id,
      actorId: principal.subject,
      type: 'PROPOSAL_GENERATED',
      dedupeKey: `${renewalCase.id}:PROPOSAL:${versionRow.version}`,
      summary: `续费提案 v${versionRow.version} 已生成并冻结证据`,
      payload,
      timestamp,
    })
    recordOperation(database, principal, renewalCase, {
      action: 'PROVIDER_RENEWAL_PROPOSAL_GENERATED',
      eventName: 'provider_renewal_proposal_generated',
      topic: 'provider.renewal.proposal.generated.v1',
      summary: '续费提案已生成',
      payload,
      timestamp,
    })
    const overview = getProviderRenewalOverview(database, principal, renewalCase.id)
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

function recordOperation(
  database: DatabaseSync,
  principal: Principal,
  renewalCase: CaseRow,
  input: {
    action: string
    eventName: string
    topic: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
    riskLevel?: 'L1' | 'L2'
  },
): void {
  const payloadJson = JSON.stringify(input.payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'renewal_case', ?, ?, 'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    principal.roles[0] ?? 'system',
    input.action,
    renewalCase.id,
    input.riskLevel ?? 'L1',
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
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    input.topic,
    renewalCase.id,
    payloadJson,
    input.timestamp,
  )
}

function createRenewalCommission(
  database: DatabaseSync,
  principal: Principal,
  renewalCase: CaseRow,
  priceFen: number,
  packageCode: PackageCode,
  timestamp: string,
): void {
  const existing = database.prepare(
    `SELECT id FROM sales_commission_ledger
     WHERE source_id = ? AND category = 'RENEWAL' AND kind = 'RECOGNITION'
     LIMIT 1`,
  ).get(renewalCase.id)
  if (existing) return
  const rule = database.prepare(
    `SELECT version, basis, rate_bps
     FROM sales_compensation_rules
     WHERE tenant_id = ? AND category = 'RENEWAL' AND status = 'ACTIVE'
       AND effective_from <= ?
     ORDER BY effective_from DESC LIMIT 1`,
  ).get(principal.tenantId, timestamp) as {
    version: string
    basis: string
    rate_bps: number
  } | undefined
  if (!rule) return
  const estimatedFen = Math.round(priceFen * rule.rate_bps / 10_000)
  const period = timestamp.slice(0, 7)
  const snapshot = {
    category: 'RENEWAL',
    basis: rule.basis,
    rateBps: rule.rate_bps,
    formula: `服务端确认续费金额 × ${rule.rate_bps} / 10000`,
    sourceBoundary: '续费经营域只写已强确认结果；结算仍由财务域追加流水',
  }
  database.prepare(
    `INSERT INTO sales_commission_ledger
     (id, tenant_id, city_id, salesperson_id, lead_id, period, category, kind,
      source_id, source_label, original_entry_id, performance_delta_fen,
      estimated_commission_delta_fen, settled_commission_delta_fen,
      rule_version, rule_snapshot_json, reason, evidence_json, actor_id,
      occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'RENEWAL', 'RECOGNITION', ?, ?, NULL, ?, ?, 0,
             ?, ?, '续费经营中心强确认续费结果', ?, ?, ?, ?)`,
  ).run(
    `renewal-ledger-${randomUUID()}`,
    principal.tenantId,
    renewalCase.city_id,
    renewalCase.owner_id,
    renewalCase.lead_id,
    period,
    renewalCase.id,
    `${renewalCase.merchant_name} · ${packageOf(packageCode).name}续费`,
    priceFen,
    estimatedFen,
    rule.version,
    JSON.stringify(snapshot),
    JSON.stringify([
      `续费机会 ${renewalCase.id}`,
      `套餐 ${packageCode}`,
      `确认金额 ${priceFen} 分`,
    ]),
    principal.subject,
    timestamp,
    timestamp,
  )
}

export function closeProviderRenewalCase(
  database: DatabaseSync,
  principal: Principal,
  input: {
    caseId: string
    expectedVersion: number
    outcome: 'RENEWED' | 'LOST'
    confirmed: boolean
    acceptedPackageCode?: PackageCode | undefined
    lossReason?: ProviderRenewalLossReason | undefined
    lossDetail?: string | undefined
    recoverable?: boolean | undefined
    recoveryAction?: string | undefined
  },
  idempotencyKey: string,
): ProviderRenewalOverview {
  const route = `/api/v1/provider/renewals/${input.caseId}/outcome`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderRenewalOverview>(
    database,
    idempotencyKey,
    route,
    hash,
  )
  if (replay) return replay
  if (!input.confirmed) {
    throw new DomainError(422, 'renewal_outcome_confirmation_required', '确认续费结果前必须完成强确认')
  }
  if (input.outcome === 'LOST' && (!input.lossReason || !input.lossDetail)) {
    throw new DomainError(422, 'renewal_loss_reason_required', '流失结论必须包含标准原因与事实说明')
  }
  if (input.outcome === 'LOST' && input.recoverable && !input.recoveryAction) {
    throw new DomainError(422, 'renewal_recovery_action_required', '可挽回机会必须填写下一步动作')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const renewalCase = getMutableCase(database, principal, input.caseId)
    if (renewalCase.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '续费机会已更新，请刷新后重试')
    }
    if (!['MONITORING', 'PROPOSAL_READY'].includes(renewalCase.status)) {
      throw new DomainError(409, 'renewal_case_closed', '续费机会已经关闭')
    }
    const timestamp = now()
    let payload: Record<string, unknown>
    if (input.outcome === 'RENEWED') {
      const proposal = database.prepare(
        `SELECT recommended_package_code, offer_price_fen
         FROM provider_renewal_proposals
         WHERE case_id = ? ORDER BY version DESC LIMIT 1`,
      ).get(renewalCase.id) as {
        recommended_package_code: PackageCode
        offer_price_fen: number
      } | undefined
      if (!proposal) {
        throw new DomainError(409, 'renewal_proposal_required', '确认续费前必须先生成证据化提案')
      }
      const acceptedPackageCode = input.acceptedPackageCode ?? proposal.recommended_package_code
      const acceptedPackage = packageOf(acceptedPackageCode)
      const renewedPriceFen = acceptedPackageCode === proposal.recommended_package_code
        ? proposal.offer_price_fen
        : acceptedPackage.listPriceFen
      database.prepare(
        `UPDATE provider_renewal_cases
         SET status = 'RENEWED', renewed_package_code = ?,
             renewed_price_fen = ?, renewed_at = ?, version = version + 1,
             updated_at = ?
         WHERE id = ? AND version = ?`,
      ).run(
        acceptedPackageCode,
        renewedPriceFen,
        timestamp,
        timestamp,
        renewalCase.id,
        input.expectedVersion,
      )
      createRenewalCommission(
        database,
        principal,
        renewalCase,
        renewedPriceFen,
        acceptedPackageCode,
        timestamp,
      )
      payload = {
        outcome: 'RENEWED',
        acceptedPackageCode,
        renewedPriceFen,
        commissionRule: 'ACTIVE_RENEWAL_RULE',
        nextStep: 'PENDING_CONTRACT_AND_BILLING_CONNECTOR',
      }
      appendEvent(database, {
        tenantId: principal.tenantId,
        caseId: renewalCase.id,
        leadId: renewalCase.lead_id,
        actorId: principal.subject,
        type: 'RENEWED',
        dedupeKey: `${renewalCase.id}:RENEWED`,
        summary: `${renewalCase.merchant_name} 已强确认续费`,
        payload,
        timestamp,
      })
    } else {
      const lossReason = input.lossReason as ProviderRenewalLossReason
      const lossDetail = input.lossDetail as string
      const recoveryAction = input.recoverable ? input.recoveryAction as string : null
      database.prepare(
        `UPDATE provider_renewal_cases
         SET status = 'LOST', loss_reason = ?, loss_detail = ?,
             recoverable = ?, recovery_action = ?, version = version + 1,
             updated_at = ?
         WHERE id = ? AND version = ?`,
      ).run(
        lossReason,
        lossDetail,
        input.recoverable ? 1 : 0,
        recoveryAction,
        timestamp,
        renewalCase.id,
        input.expectedVersion,
      )
      payload = {
        outcome: 'LOST',
        lossReason,
        lossReasonLabel: LOSS_REASON_LABELS[lossReason],
        lossDetail,
        recoverable: input.recoverable ?? false,
        recoveryAction,
      }
      appendEvent(database, {
        tenantId: principal.tenantId,
        caseId: renewalCase.id,
        leadId: renewalCase.lead_id,
        actorId: principal.subject,
        type: 'LOST',
        dedupeKey: `${renewalCase.id}:LOST`,
        summary: `${renewalCase.merchant_name} 流失原因已结构化归档`,
        payload,
        timestamp,
      })
    }
    recordOperation(database, principal, renewalCase, {
      action: input.outcome === 'RENEWED'
        ? 'PROVIDER_RENEWAL_CONFIRMED'
        : 'PROVIDER_RENEWAL_LOST',
      eventName: input.outcome === 'RENEWED'
        ? 'provider_renewal_confirmed'
        : 'provider_renewal_lost',
      topic: input.outcome === 'RENEWED'
        ? 'provider.renewal.confirmed.v1'
        : 'provider.renewal.lost.v1',
      summary: input.outcome === 'RENEWED' ? '续费结果已强确认' : '续费流失原因已归档',
      payload,
      timestamp,
      riskLevel: 'L2',
    })
    const overview = getProviderRenewalOverview(database, principal, renewalCase.id)
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
