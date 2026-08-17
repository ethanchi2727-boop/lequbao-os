import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  SalesCommissionLedgerEntrySummary,
  SalesPerformanceActorSummary,
  SalesPerformanceCategory,
  SalesPerformanceCategorySummary,
  SalesPerformanceOverview,
  SalesTargetSummary,
  SalesTeamMemberPerformanceSummary,
  SystemRole,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'sales-performance-e6'
const TARGET_RULE_VERSION = 'sales-target-revision-v1'
const SETTLEMENT_RULE_VERSION = 'sales-commission-ledger-v1'
const CATEGORIES: SalesPerformanceCategory[] = ['SIGNING', 'RENEWAL', 'TRANSACTION_SHARE']

interface ActorRow {
  user_id: string
  display_name: string
  roles: string
  city_ids_json: string
}

interface TargetRow {
  id: string
  city_id: string
  salesperson_id: string
  period: string
  signing_target_fen: number
  renewal_target_fen: number
  transaction_target_fen: number
  version: number
  reason: string
  set_by: string
  created_at: string
}

interface LedgerRow {
  id: string
  sequence: number
  city_id: string
  salesperson_id: string
  lead_id: string | null
  lead_name: string | null
  period: string
  category: SalesPerformanceCategory
  kind: SalesCommissionLedgerEntrySummary['kind']
  source_id: string
  source_label: string
  original_entry_id: string | null
  performance_delta_fen: number
  estimated_commission_delta_fen: number
  settled_commission_delta_fen: number
  rule_version: string
  rule_snapshot_json: string
  reason: string
  evidence_json: string
  actor_id: string
  occurred_at: string
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

export interface UpdateSalesTargetInput {
  salespersonId: string
  period: string
  signingTargetFen: number
  renewalTargetFen: number
  transactionTargetFen: number
  expectedVersion: number
  reason: string
}

export interface SettleSalesCommissionInput {
  entryId: string
  reason: string
  evidence: string[]
  confirmed: boolean
}

export interface ReverseSalesCommissionInput {
  entryId: string
  reason: string
  evidence: string[]
  confirmed: boolean
}

function now(): string {
  return new Date().toISOString()
}

function currentPeriod(offset = 0): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new DomainError(400, 'sales_period_invalid', '业绩周期必须使用 YYYY-MM 格式')
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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

function actorMap(
  database: DatabaseSync,
  tenantId: string,
): Map<string, SalesPerformanceActorSummary> {
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
  actors: Map<string, SalesPerformanceActorSummary>,
  userId: string,
): SalesPerformanceActorSummary {
  const actor = actors.get(userId)
  if (!actor) throw new DomainError(409, 'sales_actor_missing', '业绩相关人员已停用或不在当前租户')
  return actor
}

function salespersonRows(database: DatabaseSync, principal: Principal): ActorRow[] {
  return getActorRows(database, principal.tenantId).filter((row) => {
    const roles = row.roles.split(',')
    if (!roles.includes('CITY_SALES')) return false
    if (principal.dataScope === 'PLATFORM' || principal.roles.includes('FINANCE')) return true
    if (principal.dataScope === 'CITY') {
      const cityIds = JSON.parse(row.city_ids_json) as string[]
      return cityIds.some((cityId) => principal.cityIds.includes(cityId))
    }
    return row.user_id === principal.subject
  })
}

function resolveFocusSalespersonId(
  database: DatabaseSync,
  principal: Principal,
  requestedSalespersonId?: string,
): string | null {
  const available = salespersonRows(database, principal)
  if (requestedSalespersonId) {
    if (!available.some((row) => row.user_id === requestedSalespersonId)) {
      throw new DomainError(404, 'salesperson_not_found', '销售人员不存在或不在当前数据范围内')
    }
    return requestedSalespersonId
  }
  if (
    principal.roles.includes('CITY_SALES')
    && principal.dataScope !== 'PLATFORM'
    && principal.dataScope !== 'CITY'
  ) {
    return principal.subject
  }
  return null
}

function dataScope(
  principal: Principal,
  alias: string,
  focusSalespersonId: string | null,
): { clause: string; values: string[] } {
  if (focusSalespersonId) {
    return { clause: ` AND ${alias}.salesperson_id = ?`, values: [focusSalespersonId] }
  }
  if (principal.dataScope === 'PLATFORM' || principal.roles.includes('FINANCE')) {
    return { clause: '', values: [] }
  }
  if (principal.dataScope === 'CITY') {
    if (principal.cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
    return {
      clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
      values: [...principal.cityIds],
    }
  }
  return { clause: ` AND ${alias}.salesperson_id = ?`, values: [principal.subject] }
}

function latestTargetRows(
  database: DatabaseSync,
  principal: Principal,
  period: string,
  focusSalespersonId: string | null,
): TargetRow[] {
  const scope = dataScope(principal, 'target', focusSalespersonId)
  return database.prepare(
    `SELECT target.id, target.city_id, target.salesperson_id, target.period,
            target.signing_target_fen, target.renewal_target_fen,
            target.transaction_target_fen, target.version, target.reason,
            target.set_by, target.created_at
     FROM sales_target_revisions target
     WHERE target.tenant_id = ? AND target.period = ?${scope.clause}
       AND target.version = (
         SELECT MAX(latest.version)
         FROM sales_target_revisions latest
         WHERE latest.tenant_id = target.tenant_id
           AND latest.salesperson_id = target.salesperson_id
           AND latest.period = target.period
       )
     ORDER BY target.salesperson_id`,
  ).all(principal.tenantId, period, ...scope.values) as unknown as TargetRow[]
}

function ledgerRows(
  database: DatabaseSync,
  principal: Principal,
  period: string,
  focusSalespersonId: string | null,
): LedgerRow[] {
  const scope = dataScope(principal, 'ledger', focusSalespersonId)
  return database.prepare(
    `SELECT ledger.id, ledger.sequence, ledger.city_id, ledger.salesperson_id,
            ledger.lead_id, leads.name AS lead_name, ledger.period,
            ledger.category, ledger.kind, ledger.source_id, ledger.source_label,
            ledger.original_entry_id, ledger.performance_delta_fen,
            ledger.estimated_commission_delta_fen,
            ledger.settled_commission_delta_fen, ledger.rule_version,
            ledger.rule_snapshot_json, ledger.reason, ledger.evidence_json,
            ledger.actor_id, ledger.occurred_at, ledger.created_at
     FROM sales_commission_ledger ledger
     LEFT JOIN leads ON leads.id = ledger.lead_id
     WHERE ledger.tenant_id = ? AND ledger.period = ?${scope.clause}
     ORDER BY ledger.sequence DESC`,
  ).all(principal.tenantId, period, ...scope.values) as unknown as LedgerRow[]
}

function targetTotal(row: TargetRow): number {
  return row.signing_target_fen + row.renewal_target_fen + row.transaction_target_fen
}

function achievement(performanceFen: number, targetFen: number): number {
  if (targetFen <= 0) return 0
  return Math.round(performanceFen / targetFen * 1000) / 10
}

function targetSummary(
  row: TargetRow,
  actors: Map<string, SalesPerformanceActorSummary>,
): SalesTargetSummary {
  return {
    id: row.id,
    salesperson: requiredActor(actors, row.salesperson_id),
    period: row.period,
    signingTargetFen: row.signing_target_fen,
    renewalTargetFen: row.renewal_target_fen,
    transactionTargetFen: row.transaction_target_fen,
    totalTargetFen: targetTotal(row),
    version: row.version,
    reason: row.reason,
    setBy: requiredActor(actors, row.set_by),
    createdAt: row.created_at,
  }
}

function ruleExplanation(snapshotJson: string): string[] {
  const snapshot = JSON.parse(snapshotJson) as {
    basis?: string
    rateBps?: number
    formula?: string
    sourceBoundary?: string
  }
  return [
    snapshot.basis ? `计提基数：${snapshot.basis}` : '计提基数：以规则快照为准',
    typeof snapshot.rateBps === 'number'
      ? `佣金比例：${(snapshot.rateBps / 100).toFixed(2)}%`
      : '佣金比例：以规则快照为准',
    snapshot.formula ?? '所有佣金均由服务端计算',
    snapshot.sourceBoundary ?? '销售宝只读取核心业务事实',
  ]
}

function ledgerSummary(
  row: LedgerRow,
  actors: Map<string, SalesPerformanceActorSummary>,
): SalesCommissionLedgerEntrySummary {
  return {
    id: row.id,
    sequence: row.sequence,
    salesperson: requiredActor(actors, row.salesperson_id),
    leadId: row.lead_id,
    leadName: row.lead_name,
    category: row.category,
    kind: row.kind,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    originalEntryId: row.original_entry_id,
    performanceDeltaFen: row.performance_delta_fen,
    estimatedCommissionDeltaFen: row.estimated_commission_delta_fen,
    settledCommissionDeltaFen: row.settled_commission_delta_fen,
    ruleVersion: row.rule_version,
    ruleExplanation: ruleExplanation(row.rule_snapshot_json),
    reason: row.reason,
    evidence: JSON.parse(row.evidence_json) as string[],
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }
}

function categoryTarget(row: TargetRow | undefined, category: SalesPerformanceCategory): number {
  if (!row) return 0
  if (category === 'SIGNING') return row.signing_target_fen
  if (category === 'RENEWAL') return row.renewal_target_fen
  return row.transaction_target_fen
}

function sum(rows: LedgerRow[], field: keyof Pick<
  LedgerRow,
  'performance_delta_fen' | 'estimated_commission_delta_fen' | 'settled_commission_delta_fen'
>): number {
  return rows.reduce((total, row) => total + row[field], 0)
}

function teamSummary(
  rows: LedgerRow[],
  targets: TargetRow[],
  actors: Map<string, SalesPerformanceActorSummary>,
): SalesTeamMemberPerformanceSummary[] {
  const salespersonIds = new Set([
    ...rows.map((row) => row.salesperson_id),
    ...targets.map((row) => row.salesperson_id),
  ])
  return [...salespersonIds].map((salespersonId) => {
    const memberRows = rows.filter((row) => row.salesperson_id === salespersonId)
    const target = targets.find((row) => row.salesperson_id === salespersonId)
    const performanceFen = sum(memberRows, 'performance_delta_fen')
    const targetFen = target ? targetTotal(target) : 0
    return {
      salesperson: requiredActor(actors, salespersonId),
      performanceFen,
      targetFen,
      achievementRate: achievement(performanceFen, targetFen),
      estimatedCommissionFen: sum(memberRows, 'estimated_commission_delta_fen'),
      settledCommissionFen: sum(memberRows, 'settled_commission_delta_fen'),
      reversalFen: Math.abs(memberRows
        .filter((row) => row.kind === 'REVERSAL')
        .reduce((total, row) => total + row.performance_delta_fen, 0)),
      targetVersion: target?.version ?? 0,
    }
  }).sort((left, right) => (
    right.achievementRate - left.achievementRate
    || right.performanceFen - left.performanceFen
  ))
}

export function getSalesPerformanceOverview(
  database: DatabaseSync,
  principal: Principal,
  query: { period?: string | undefined; salespersonId?: string | undefined } = {},
): SalesPerformanceOverview {
  const period = query.period ?? currentPeriod()
  assertPeriod(period)
  const focusSalespersonId = resolveFocusSalespersonId(database, principal, query.salespersonId)
  const actors = actorMap(database, principal.tenantId)
  const rows = ledgerRows(database, principal, period, focusSalespersonId)
  const targets = latestTargetRows(database, principal, period, focusSalespersonId)
  const focusTarget = focusSalespersonId
    ? targets.find((row) => row.salesperson_id === focusSalespersonId)
    : undefined
  const performanceFen = sum(rows, 'performance_delta_fen')
  const targetFen = targets.reduce((total, row) => total + targetTotal(row), 0)
  const categories: SalesPerformanceCategorySummary[] = CATEGORIES.map((category) => {
    const categoryRows = rows.filter((row) => row.category === category)
    const targetForCategory = focusSalespersonId
      ? categoryTarget(focusTarget, category)
      : targets.reduce((total, row) => total + categoryTarget(row, category), 0)
    const categoryPerformance = sum(categoryRows, 'performance_delta_fen')
    return {
      category,
      performanceFen: categoryPerformance,
      targetFen: targetForCategory,
      achievementRate: achievement(categoryPerformance, targetForCategory),
      estimatedCommissionFen: sum(categoryRows, 'estimated_commission_delta_fen'),
      settledCommissionFen: sum(categoryRows, 'settled_commission_delta_fen'),
      reversalFen: Math.abs(categoryRows
        .filter((row) => row.kind === 'REVERSAL')
        .reduce((total, row) => total + row.performance_delta_fen, 0)),
    }
  })
  const createdTimes = [
    ...rows.map((row) => row.created_at),
    ...targets.map((row) => row.created_at),
  ].sort()

  return {
    period,
    availablePeriods: [currentPeriod(), currentPeriod(-1)],
    viewMode: focusSalespersonId ? 'INDIVIDUAL' : 'TEAM',
    viewer: requiredActor(actors, principal.subject),
    focusSalesperson: focusSalespersonId
      ? requiredActor(actors, focusSalespersonId)
      : null,
    metrics: {
      performanceFen,
      targetFen,
      achievementRate: achievement(performanceFen, targetFen),
      estimatedCommissionFen: sum(rows, 'estimated_commission_delta_fen'),
      settledCommissionFen: sum(rows, 'settled_commission_delta_fen'),
      reversalFen: Math.abs(rows
        .filter((row) => row.kind === 'REVERSAL')
        .reduce((total, row) => total + row.performance_delta_fen, 0)),
      recognizedCount: rows.filter((row) => row.kind === 'RECOGNITION').length,
    },
    target: focusTarget ? targetSummary(focusTarget, actors) : null,
    categories,
    team: teamSummary(rows, targets, actors),
    ledger: rows.map((row) => ledgerSummary(row, actors)),
    policy: {
      currency: 'CNY',
      amountUnit: 'FEN',
      targetRuleVersion: TARGET_RULE_VERSION,
      settlementRuleVersion: SETTLEMENT_RULE_VERSION,
      immutableLedger: true,
      guardrail: '前端不计算佣金、不修改支付/代金券/结算事实；所有数字来自服务端版本化规则与只追加账本。',
    },
    permissions: {
      canManageTarget: hasPermission(principal, 'sales.target.manage'),
      canSettleCommission: hasPermission(principal, 'sales.commission.settle'),
      canReverseCommission: hasPermission(principal, 'sales.commission.settle'),
    },
    updatedAt: createdTimes.at(-1) ?? now(),
  }
}

function recordEvent(
  database: DatabaseSync,
  principal: Principal,
  input: {
    action: string
    entityType: string
    entityId: string
    riskLevel: 'L1' | 'L2'
    summary: string
    payload: Record<string, unknown>
  },
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(input.payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    input.action, input.entityType, input.entityId, input.riskLevel,
    input.summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales_performance_${input.action.toLowerCase()}`, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales.performance.${input.action.toLowerCase()}.v1`,
    input.entityId, payloadJson, timestamp,
  )
}

function idempotentMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => { period: string; salespersonId: string },
): SalesPerformanceOverview {
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
    return JSON.parse(stored.response_json) as SalesPerformanceOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const result = operation()
    const overview = getSalesPerformanceOverview(database, principal, result)
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

function salespersonCityId(
  database: DatabaseSync,
  principal: Principal,
  salespersonId: string,
): string {
  const row = salespersonRows(database, principal).find((item) => item.user_id === salespersonId)
  if (!row) throw new DomainError(404, 'salesperson_not_found', '销售人员不存在或不在当前数据范围内')
  const cityIds = JSON.parse(row.city_ids_json) as string[]
  const cityId = cityIds[0]
  if (!cityId) throw new DomainError(409, 'salesperson_city_missing', '销售人员尚未配置城市范围')
  return cityId
}

export function updateSalesTarget(
  database: DatabaseSync,
  principal: Principal,
  input: UpdateSalesTargetInput,
  idempotencyKey: string,
): SalesPerformanceOverview {
  assertPeriod(input.period)
  const route = `/api/v1/sales/performance/targets/${input.salespersonId}`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const cityId = salespersonCityId(database, principal, input.salespersonId)
    const latest = database.prepare(
      `SELECT id, version FROM sales_target_revisions
       WHERE tenant_id = ? AND salesperson_id = ? AND period = ?
       ORDER BY version DESC LIMIT 1`,
    ).get(
      principal.tenantId, input.salespersonId, input.period,
    ) as { id: string; version: number } | undefined
    const currentVersion = latest?.version ?? 0
    if (currentVersion !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '目标已更新，请刷新后再提交')
    }
    const timestamp = now()
    const targetId = `sales-target-${randomUUID()}`
    database.prepare(
      `INSERT INTO sales_target_revisions
       (id, tenant_id, city_id, salesperson_id, period, signing_target_fen,
        renewal_target_fen, transaction_target_fen, version, previous_revision_id,
        reason, set_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      targetId, principal.tenantId, cityId, input.salespersonId, input.period,
      input.signingTargetFen, input.renewalTargetFen, input.transactionTargetFen,
      currentVersion + 1, latest?.id ?? null, input.reason, principal.subject, timestamp,
    )
    recordEvent(database, principal, {
      action: 'TARGET_REVISED',
      entityType: 'sales_target',
      entityId: targetId,
      riskLevel: 'L1',
      summary: `销售目标已修订为版本 ${currentVersion + 1}`,
      payload: {
        salespersonId: input.salespersonId,
        period: input.period,
        previousVersion: currentVersion,
        version: currentVersion + 1,
        signingTargetFen: input.signingTargetFen,
        renewalTargetFen: input.renewalTargetFen,
        transactionTargetFen: input.transactionTargetFen,
        reason: input.reason,
      },
    }, timestamp)
    return { period: input.period, salespersonId: input.salespersonId }
  })
}

function originalLedgerEntry(
  database: DatabaseSync,
  principal: Principal,
  entryId: string,
): LedgerRow {
  const row = database.prepare(
    `SELECT ledger.id, ledger.sequence, ledger.city_id, ledger.salesperson_id,
            ledger.lead_id, leads.name AS lead_name, ledger.period,
            ledger.category, ledger.kind, ledger.source_id, ledger.source_label,
            ledger.original_entry_id, ledger.performance_delta_fen,
            ledger.estimated_commission_delta_fen,
            ledger.settled_commission_delta_fen, ledger.rule_version,
            ledger.rule_snapshot_json, ledger.reason, ledger.evidence_json,
            ledger.actor_id, ledger.occurred_at, ledger.created_at
     FROM sales_commission_ledger ledger
     LEFT JOIN leads ON leads.id = ledger.lead_id
     WHERE ledger.id = ? AND ledger.tenant_id = ?`,
  ).get(entryId, principal.tenantId) as unknown as LedgerRow | undefined
  if (!row) throw new DomainError(404, 'commission_entry_not_found', '佣金流水不存在')
  if (row.kind !== 'RECOGNITION') {
    throw new DomainError(409, 'commission_source_required', '只能对原始确认流水执行结算或冲正')
  }
  return row
}

function entryBalance(
  database: DatabaseSync,
  original: LedgerRow,
): { performanceFen: number; estimatedFen: number; settledFen: number } {
  const children = database.prepare(
    `SELECT COALESCE(SUM(performance_delta_fen), 0) AS performance_fen,
            COALESCE(SUM(estimated_commission_delta_fen), 0) AS estimated_fen,
            COALESCE(SUM(settled_commission_delta_fen), 0) AS settled_fen
     FROM sales_commission_ledger WHERE original_entry_id = ?`,
  ).get(original.id) as {
    performance_fen: number
    estimated_fen: number
    settled_fen: number
  }
  return {
    performanceFen: original.performance_delta_fen + Number(children.performance_fen),
    estimatedFen: original.estimated_commission_delta_fen + Number(children.estimated_fen),
    settledFen: original.settled_commission_delta_fen + Number(children.settled_fen),
  }
}

function appendLedgerTransition(
  database: DatabaseSync,
  principal: Principal,
  original: LedgerRow,
  input: {
    kind: 'SETTLEMENT' | 'REVERSAL'
    performanceDeltaFen: number
    estimatedCommissionDeltaFen: number
    settledCommissionDeltaFen: number
    reason: string
    evidence: string[]
  },
): string {
  const timestamp = now()
  const entryId = `sales-ledger-${randomUUID()}`
  const sourceId = `${input.kind.toLowerCase()}:${original.source_id}:${randomUUID()}`
  const sourceLabel = input.kind === 'SETTLEMENT'
    ? `财务结算 · ${original.source_label}`
    : `退款/撤销冲正 · ${original.source_label}`
  database.prepare(
    `INSERT INTO sales_commission_ledger
     (id, tenant_id, city_id, salesperson_id, lead_id, period, category, kind,
      source_id, source_label, original_entry_id, performance_delta_fen,
      estimated_commission_delta_fen, settled_commission_delta_fen,
      rule_version, rule_snapshot_json, reason, evidence_json, actor_id,
      occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entryId, principal.tenantId, original.city_id, original.salesperson_id,
    original.lead_id, original.period, original.category, input.kind,
    sourceId, sourceLabel, original.id, input.performanceDeltaFen,
    input.estimatedCommissionDeltaFen, input.settledCommissionDeltaFen,
    original.rule_version, original.rule_snapshot_json, input.reason,
    JSON.stringify(input.evidence), principal.subject, timestamp, timestamp,
  )
  recordEvent(database, principal, {
    action: input.kind === 'SETTLEMENT' ? 'COMMISSION_SETTLED' : 'COMMISSION_REVERSED',
    entityType: 'sales_commission_ledger',
    entityId: entryId,
    riskLevel: 'L2',
    summary: input.kind === 'SETTLEMENT'
      ? '预计佣金已通过财务结算转入已结'
      : '退款或撤销事实已同步冲正业绩与佣金',
    payload: {
      originalEntryId: original.id,
      salespersonId: original.salesperson_id,
      period: original.period,
      performanceDeltaFen: input.performanceDeltaFen,
      estimatedCommissionDeltaFen: input.estimatedCommissionDeltaFen,
      settledCommissionDeltaFen: input.settledCommissionDeltaFen,
      reason: input.reason,
      evidenceCount: input.evidence.length,
    },
  }, timestamp)
  return entryId
}

export function settleSalesCommission(
  database: DatabaseSync,
  principal: Principal,
  input: SettleSalesCommissionInput,
  idempotencyKey: string,
): SalesPerformanceOverview {
  const route = `/api/v1/sales/performance/ledger/${input.entryId}/settle`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(409, 'strong_confirmation_required', '结算佣金需要财务强确认')
    }
    const original = originalLedgerEntry(database, principal, input.entryId)
    const balance = entryBalance(database, original)
    if (balance.performanceFen <= 0) {
      throw new DomainError(409, 'commission_entry_reversed', '该确认流水已完成冲正，不能再结算')
    }
    if (balance.estimatedFen <= 0) {
      throw new DomainError(409, 'commission_already_settled', '该确认流水没有待结算佣金')
    }
    appendLedgerTransition(database, principal, original, {
      kind: 'SETTLEMENT',
      performanceDeltaFen: 0,
      estimatedCommissionDeltaFen: -balance.estimatedFen,
      settledCommissionDeltaFen: balance.estimatedFen,
      reason: input.reason,
      evidence: input.evidence,
    })
    return { period: original.period, salespersonId: original.salesperson_id }
  })
}

export function reverseSalesCommission(
  database: DatabaseSync,
  principal: Principal,
  input: ReverseSalesCommissionInput,
  idempotencyKey: string,
): SalesPerformanceOverview {
  const route = `/api/v1/sales/performance/ledger/${input.entryId}/reverse`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(409, 'strong_confirmation_required', '佣金冲正需要财务强确认')
    }
    const original = originalLedgerEntry(database, principal, input.entryId)
    const balance = entryBalance(database, original)
    if (balance.performanceFen <= 0) {
      throw new DomainError(409, 'commission_already_reversed', '该确认流水已完成冲正')
    }
    appendLedgerTransition(database, principal, original, {
      kind: 'REVERSAL',
      performanceDeltaFen: -balance.performanceFen,
      estimatedCommissionDeltaFen: -Math.max(0, balance.estimatedFen),
      settledCommissionDeltaFen: -Math.max(0, balance.settledFen),
      reason: input.reason,
      evidence: input.evidence,
    })
    return { period: original.period, salespersonId: original.salesperson_id }
  })
}
