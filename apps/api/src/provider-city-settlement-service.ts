import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  ProviderSettlementAdjustmentSummary,
  ProviderSettlementEventSummary,
  ProviderSettlementInvoiceSummary,
  ProviderSettlementLedgerEntrySummary,
  ProviderSettlementOverview,
  ProviderSettlementStatementSummary,
  ProviderSettlementStatus,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'provider-city-settlement-e7'
const POLICY_VERSION = 'provider-city-settlement-policy-v1' as const
const SETTLEMENT_EVENT = 'settlement.completed.v1' as const

interface RuleRow {
  version: string
  signing_share_bps: number
  renewal_share_bps: number
  transaction_share_bps: number
  effective_from: string
}

interface StatementRow {
  id: string
  tenant_id: string
  city_id: string
  period: string
  status: ProviderSettlementStatus
  currency: 'CNY'
  signing_revenue_fen: number
  renewal_revenue_fen: number
  transaction_gmv_fen: number
  subscription_share_fen: number
  renewal_share_fen: number
  transaction_service_share_fen: number
  approved_adjustment_fen: number
  payable_fen: number
  rule_version: string
  version: number
  generated_at: string
  settled_at: string | null
  updated_at: string
}

interface AdjustmentRow {
  id: string
  direction: ProviderSettlementAdjustmentSummary['direction']
  amount_fen: number
  status: ProviderSettlementAdjustmentSummary['status']
  reason: string
  evidence_json: string
  requested_by_name: string
  requested_at: string
  decided_by_name: string | null
  decision_note: string | null
  decided_at: string | null
}

interface InvoiceRow {
  id: string
  invoice_no: string
  seller_name: string
  seller_tax_id_masked: string
  amount_fen: number
  issued_at: string
  status: ProviderSettlementInvoiceSummary['status']
  submitted_by_name: string
  submitted_at: string
  decided_by_name: string | null
  decision_note: string | null
  decided_at: string | null
}

interface LedgerRow {
  id: string
  sequence: number
  category: ProviderSettlementLedgerEntrySummary['category']
  direction: ProviderSettlementLedgerEntrySummary['direction']
  amount_fen: number
  source_id: string
  source_label: string
  rule_version: string
  posted_at: string
}

interface EventRow {
  id: string
  sequence: number
  type: ProviderSettlementEventSummary['type']
  summary: string
  actor_name: string
  payload_json: string
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

interface SourceFacts {
  signingRevenueFen: number
  renewalRevenueFen: number
  transactionGmvFen: number
}

function now(): string {
  return new Date().toISOString()
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function cityScope(principal: Principal, alias = 'statements'): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope !== 'CITY' || principal.cityIds.length === 0) {
    return { clause: ' AND 0 = 1', values: [] }
  }
  return {
    clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
    values: [...principal.cityIds],
  }
}

function requireConfirmation(confirmed: boolean, code: string, detail: string): void {
  if (!confirmed) throw new DomainError(422, code, detail)
}

function assertVersion(statement: StatementRow, expectedVersion: number): void {
  if (statement.version !== expectedVersion) {
    throw new DomainError(409, 'stale_entity_version', '结算单已更新，请刷新后重试')
  }
}

function calculateShare(sourceFen: number, rateBps: number): number {
  return Math.round(sourceFen * rateBps / 10_000)
}

function activeRule(database: DatabaseSync, tenantId: string): RuleRow {
  const rule = database.prepare(
    `SELECT version, signing_share_bps, renewal_share_bps,
            transaction_share_bps, effective_from
     FROM provider_city_settlement_rules
     WHERE tenant_id = ? AND status = 'ACTIVE'
     ORDER BY effective_from DESC, created_at DESC
     LIMIT 1`,
  ).get(tenantId) as unknown as RuleRow | undefined
  if (!rule) {
    throw new DomainError(409, 'settlement_rule_missing', '当前租户尚未配置生效的城市分成规则')
  }
  return rule
}

function ruleByVersion(database: DatabaseSync, tenantId: string, version: string): RuleRow {
  const rule = database.prepare(
    `SELECT version, signing_share_bps, renewal_share_bps,
            transaction_share_bps, effective_from
     FROM provider_city_settlement_rules
     WHERE tenant_id = ? AND version = ?
     LIMIT 1`,
  ).get(tenantId, version) as unknown as RuleRow | undefined
  if (!rule) {
    throw new DomainError(500, 'settlement_rule_snapshot_missing', '结算单引用的分成规则快照不存在')
  }
  return rule
}

function requireCityAccess(database: DatabaseSync, principal: Principal, cityId: string): void {
  if (principal.dataScope === 'CITY' && !principal.cityIds.includes(cityId)) {
    throw new DomainError(404, 'settlement_city_not_found', '城市不存在或不在当前数据范围内')
  }
  if (principal.dataScope !== 'PLATFORM' && principal.dataScope !== 'CITY') {
    throw new DomainError(404, 'settlement_city_not_found', '城市不存在或不在当前数据范围内')
  }
  const city = database.prepare(
    `SELECT 1 FROM organizations
     WHERE tenant_id = ? AND type = 'CITY' AND city_id = ?
     LIMIT 1`,
  ).get(principal.tenantId, cityId)
  if (!city) throw new DomainError(404, 'settlement_city_not_found', '结算城市不存在')
}

function sourceFacts(
  database: DatabaseSync,
  tenantId: string,
  cityId: string,
  period: string,
): SourceFacts {
  const row = database.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN category = 'SIGNING'
                         THEN performance_delta_fen ELSE 0 END), 0) AS signing,
       COALESCE(SUM(CASE WHEN category = 'RENEWAL'
                         THEN performance_delta_fen ELSE 0 END), 0) AS renewal,
       COALESCE(SUM(CASE WHEN category = 'TRANSACTION_SHARE'
                         THEN performance_delta_fen ELSE 0 END), 0) AS transaction_gmv
     FROM sales_commission_ledger
     WHERE tenant_id = ? AND city_id = ? AND period = ?
       AND kind IN ('RECOGNITION', 'REVERSAL')`,
  ).get(tenantId, cityId, period) as unknown as {
    signing: number
    renewal: number
    transaction_gmv: number
  }
  return {
    signingRevenueFen: Math.max(0, row.signing),
    renewalRevenueFen: Math.max(0, row.renewal),
    transactionGmvFen: Math.max(0, row.transaction_gmv),
  }
}

function listStatementRows(database: DatabaseSync, principal: Principal): StatementRow[] {
  const scope = cityScope(principal)
  return database.prepare(
    `SELECT statements.id, statements.tenant_id, statements.city_id,
            statements.period, statements.status, statements.currency,
            statements.signing_revenue_fen, statements.renewal_revenue_fen,
            statements.transaction_gmv_fen, statements.subscription_share_fen,
            statements.renewal_share_fen,
            statements.transaction_service_share_fen,
            statements.approved_adjustment_fen, statements.payable_fen,
            statements.rule_version, statements.version,
            statements.generated_at, statements.settled_at,
            statements.updated_at
     FROM provider_city_settlement_statements statements
     WHERE statements.tenant_id = ?${scope.clause}
     ORDER BY statements.period DESC, statements.updated_at DESC`,
  ).all(principal.tenantId, ...scope.values) as unknown as StatementRow[]
}

function getMutableStatement(
  database: DatabaseSync,
  principal: Principal,
  statementId: string,
): StatementRow {
  const scope = cityScope(principal)
  const row = database.prepare(
    `SELECT statements.id, statements.tenant_id, statements.city_id,
            statements.period, statements.status, statements.currency,
            statements.signing_revenue_fen, statements.renewal_revenue_fen,
            statements.transaction_gmv_fen, statements.subscription_share_fen,
            statements.renewal_share_fen,
            statements.transaction_service_share_fen,
            statements.approved_adjustment_fen, statements.payable_fen,
            statements.rule_version, statements.version,
            statements.generated_at, statements.settled_at,
            statements.updated_at
     FROM provider_city_settlement_statements statements
     WHERE statements.id = ? AND statements.tenant_id = ?${scope.clause}`,
  ).get(statementId, principal.tenantId, ...scope.values) as unknown as StatementRow | undefined
  if (!row) {
    throw new DomainError(404, 'settlement_statement_not_found', '结算单不存在或不在当前城市范围内')
  }
  return row
}

function listAdjustments(
  database: DatabaseSync,
  statementId: string,
): ProviderSettlementAdjustmentSummary[] {
  const rows = database.prepare(
    `SELECT adjustments.id, adjustments.direction, adjustments.amount_fen,
            adjustments.status, adjustments.reason, adjustments.evidence_json,
            requested.display_name AS requested_by_name,
            adjustments.requested_at,
            decided.display_name AS decided_by_name,
            adjustments.decision_note, adjustments.decided_at
     FROM provider_city_settlement_adjustments adjustments
     JOIN users requested ON requested.id = adjustments.requested_by
     LEFT JOIN users decided ON decided.id = adjustments.decided_by
     WHERE adjustments.statement_id = ?
     ORDER BY adjustments.requested_at DESC, adjustments.id DESC`,
  ).all(statementId) as unknown as AdjustmentRow[]
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    amountFen: row.amount_fen,
    status: row.status,
    reason: row.reason,
    evidence: JSON.parse(row.evidence_json) as string[],
    requestedBy: row.requested_by_name,
    requestedAt: row.requested_at,
    decidedBy: row.decided_by_name,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
  }))
}

function latestInvoice(
  database: DatabaseSync,
  statementId: string,
): ProviderSettlementInvoiceSummary | null {
  const row = database.prepare(
    `SELECT invoices.id, invoices.invoice_no, invoices.seller_name,
            invoices.seller_tax_id_masked, invoices.amount_fen,
            invoices.issued_at, invoices.status,
            submitted.display_name AS submitted_by_name,
            invoices.submitted_at, decided.display_name AS decided_by_name,
            invoices.decision_note, invoices.decided_at
     FROM provider_city_settlement_invoices invoices
     JOIN users submitted ON submitted.id = invoices.submitted_by
     LEFT JOIN users decided ON decided.id = invoices.decided_by
     WHERE invoices.statement_id = ?
     ORDER BY invoices.submitted_at DESC, invoices.id DESC
     LIMIT 1`,
  ).get(statementId) as unknown as InvoiceRow | undefined
  if (!row) return null
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    sellerName: row.seller_name,
    sellerTaxIdMasked: row.seller_tax_id_masked,
    amountFen: row.amount_fen,
    issuedAt: row.issued_at,
    status: row.status,
    submittedBy: row.submitted_by_name,
    submittedAt: row.submitted_at,
    decidedBy: row.decided_by_name,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
  }
}

function listLedger(
  database: DatabaseSync,
  statementId: string,
): ProviderSettlementLedgerEntrySummary[] {
  const rows = database.prepare(
    `SELECT id, sequence, category, direction, amount_fen, source_id,
            source_label, rule_version, posted_at
     FROM provider_city_settlement_ledger
     WHERE statement_id = ?
     ORDER BY sequence DESC`,
  ).all(statementId) as unknown as LedgerRow[]
  return rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    category: row.category,
    direction: row.direction,
    amountFen: row.amount_fen,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    ruleVersion: row.rule_version,
    postedAt: row.posted_at,
  }))
}

function statementSummary(
  database: DatabaseSync,
  row: StatementRow,
): ProviderSettlementStatementSummary {
  return {
    id: row.id,
    cityId: row.city_id,
    period: row.period,
    status: row.status,
    currency: row.currency,
    source: {
      signingRevenueFen: row.signing_revenue_fen,
      renewalRevenueFen: row.renewal_revenue_fen,
      transactionGmvFen: row.transaction_gmv_fen,
    },
    shares: {
      subscriptionShareFen: row.subscription_share_fen,
      renewalShareFen: row.renewal_share_fen,
      transactionServiceShareFen: row.transaction_service_share_fen,
      approvedAdjustmentFen: row.approved_adjustment_fen,
      payableFen: row.payable_fen,
    },
    adjustments: listAdjustments(database, row.id),
    invoice: latestInvoice(database, row.id),
    ledgerEntries: listLedger(database, row.id),
    ruleVersion: row.rule_version,
    version: row.version,
    generatedAt: row.generated_at,
    settledAt: row.settled_at,
    updatedAt: row.updated_at,
  }
}

function listEvents(
  database: DatabaseSync,
  principal: Principal,
  statementId: string | null,
): ProviderSettlementEventSummary[] {
  if (!statementId) return []
  const scope = cityScope(principal)
  const rows = database.prepare(
    `SELECT events.id, events.sequence, events.type, events.summary,
            users.display_name AS actor_name, events.payload_json,
            events.created_at
     FROM provider_city_settlement_events events
     JOIN provider_city_settlement_statements statements
       ON statements.id = events.statement_id
     JOIN users ON users.id = events.actor_id
     WHERE events.tenant_id = ? AND events.statement_id = ?${scope.clause}
     ORDER BY events.sequence DESC`,
  ).all(principal.tenantId, statementId, ...scope.values) as unknown as EventRow[]
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

export function getProviderSettlementOverview(
  database: DatabaseSync,
  principal: Principal,
  focusStatementId?: string,
): ProviderSettlementOverview {
  const rows = listStatementRows(database, principal)
  const focusRow = focusStatementId
    ? rows.find(({ id }) => id === focusStatementId)
    : rows.find(({ status }) => status !== 'SETTLED') ?? rows[0]
  if (focusStatementId && !focusRow) {
    throw new DomainError(404, 'settlement_statement_not_found', '结算单不存在或不在当前城市范围内')
  }
  const statements = rows.map((row) => statementSummary(database, row))
  const focusStatement = focusRow
    ? statements.find(({ id }) => id === focusRow.id) ?? null
    : null
  const cityId = focusRow?.city_id ?? principal.cityIds[0] ?? 'platform'
  const city = database.prepare(
    `SELECT name FROM organizations
     WHERE tenant_id = ? AND type = 'CITY' AND city_id = ?
     ORDER BY created_at LIMIT 1`,
  ).get(principal.tenantId, cityId) as { name: string } | undefined
  const year = new Date().getUTCFullYear().toString()
  const yearRows = rows.filter(({ period }) => period.startsWith(year))
  const rule = focusRow
    ? ruleByVersion(database, principal.tenantId, focusRow.rule_version)
    : activeRule(database, principal.tenantId)
  const pendingApprovalCount = statements.reduce(
    (sum, statement) => sum
      + statement.adjustments.filter(({ status }) => status === 'PENDING').length,
    0,
  )
  return {
    city: {
      id: cityId,
      name: city?.name ?? (principal.dataScope === 'PLATFORM' ? '全国城市网络' : '城市服务中心'),
    },
    metrics: {
      currentReceivableFen: rows
        .filter(({ status }) => status !== 'SETTLED')
        .reduce((sum, row) => sum + row.payable_fen, 0),
      yearToDatePayableFen: yearRows.reduce((sum, row) => sum + row.payable_fen, 0),
      yearToDateSettledFen: yearRows
        .filter(({ status }) => status === 'SETTLED')
        .reduce((sum, row) => sum + row.payable_fen, 0),
      pendingInvoiceCount: rows.filter(({ status }) => status === 'PENDING_INVOICE').length,
      pendingApprovalCount,
      readyCount: rows.filter(({ status }) => status === 'READY_FOR_SETTLEMENT').length,
      settledCount: rows.filter(({ status }) => status === 'SETTLED').length,
    },
    rules: {
      version: rule.version,
      signingShareBps: rule.signing_share_bps,
      renewalShareBps: rule.renewal_share_bps,
      transactionShareBps: rule.transaction_share_bps,
      effectiveFrom: rule.effective_from,
      formula: '已确认业务净额 × 对应分成基点 ÷ 10000；总部批准调账后计入应付',
    },
    statements,
    focusStatement,
    events: listEvents(database, principal, focusRow?.id ?? null),
    periods: [...new Set(rows.map(({ period }) => period))],
    permissions: {
      canManage: hasPermission(principal, 'provider.settlement.manage'),
      canApprove: hasPermission(principal, 'provider.settlement.approve'),
      canSettle: hasPermission(principal, 'provider.settlement.settle'),
    },
    policy: {
      version: POLICY_VERSION,
      appendOnlyLedger: true,
      cityScopeEnforced: true,
      invoiceAmountMustMatch: true,
      adjustmentRequiresHqApproval: true,
      settlementEvent: SETTLEMENT_EVENT,
    },
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
    cityId: string
    statementId: string
    actorId: string
    type: ProviderSettlementEventSummary['type']
    dedupeKey: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  database.prepare(
    `INSERT INTO provider_city_settlement_events
     (id, tenant_id, city_id, statement_id, actor_id, type, dedupe_key,
      summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.tenantId,
    input.cityId,
    input.statementId,
    input.actorId,
    input.type,
    input.dedupeKey,
    input.summary,
    JSON.stringify(input.payload),
    input.timestamp,
  )
}

function recordOperation(
  database: DatabaseSync,
  principal: Principal,
  statement: Pick<StatementRow, 'id' | 'city_id' | 'period'>,
  input: {
    action: string
    eventName: string
    topic: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
    riskLevel?: 'L1' | 'L2' | 'L3'
  },
): void {
  const payload = {
    statementId: statement.id,
    cityId: statement.city_id,
    period: statement.period,
    policyVersion: POLICY_VERSION,
    ...input.payload,
  }
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'provider_city_settlement', ?, ?, 'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    principal.roles[0] ?? 'system',
    input.action,
    statement.id,
    input.riskLevel ?? 'L2',
    input.summary,
    payloadJson,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, input.eventName, payloadJson, input.timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    RUN_ID,
    principal.tenantId,
    input.topic,
    statement.id,
    payloadJson,
    input.timestamp,
  )
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

function persistIdempotency(
  database: DatabaseSync,
  key: string,
  route: string,
  hash: string,
  response: ProviderSettlementOverview,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO idempotency_records
     (key, route, run_id, request_hash, response_json, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(key, route, RUN_ID, hash, JSON.stringify(response), timestamp)
}

function approvedAdjustment(database: DatabaseSync, statementId: string): number {
  const row = database.prepare(
    `SELECT COALESCE(SUM(
       CASE WHEN direction = 'CREDIT' THEN amount_fen ELSE -amount_fen END
     ), 0) AS value
     FROM provider_city_settlement_adjustments
     WHERE statement_id = ? AND status = 'APPROVED'`,
  ).get(statementId) as { value: number }
  return row.value
}

export function generateProviderSettlement(
  database: DatabaseSync,
  principal: Principal,
  input: {
    cityId: string
    period: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSettlementOverview {
  const route = '/api/v1/provider/settlements/generate'
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderSettlementOverview>(
    database, idempotencyKey, route, hash,
  )
  if (replay) return replay
  requireConfirmation(
    input.confirmed,
    'settlement_generation_confirmation_required',
    '生成或刷新结算单前必须完成强确认',
  )
  requireCityAccess(database, principal, input.cityId)
  const currentPeriod = now().slice(0, 7)
  if (input.period > currentPeriod) {
    throw new DomainError(422, 'settlement_future_period', '不能生成未来账期的结算单')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const rule = activeRule(database, principal.tenantId)
    const source = sourceFacts(database, principal.tenantId, input.cityId, input.period)
    const subscriptionShare = calculateShare(source.signingRevenueFen, rule.signing_share_bps)
    const renewalShare = calculateShare(source.renewalRevenueFen, rule.renewal_share_bps)
    const transactionShare = calculateShare(
      source.transactionGmvFen,
      rule.transaction_share_bps,
    )
    const existing = database.prepare(
      `SELECT statements.id, statements.tenant_id, statements.city_id,
              statements.period, statements.status, statements.currency,
              statements.signing_revenue_fen, statements.renewal_revenue_fen,
              statements.transaction_gmv_fen, statements.subscription_share_fen,
              statements.renewal_share_fen,
              statements.transaction_service_share_fen,
              statements.approved_adjustment_fen, statements.payable_fen,
              statements.rule_version, statements.version,
              statements.generated_at, statements.settled_at,
              statements.updated_at
       FROM provider_city_settlement_statements statements
       WHERE statements.tenant_id = ? AND statements.city_id = ?
         AND statements.period = ?`,
    ).get(principal.tenantId, input.cityId, input.period) as unknown as StatementRow | undefined
    const timestamp = now()
    let statementId: string
    let eventType: ProviderSettlementEventSummary['type']
    let summary: string
    if (existing) {
      if (existing.status !== 'PENDING_INVOICE') {
        throw new DomainError(
          409,
          'settlement_statement_locked',
          '结算单已进入交票或结算流程，不能刷新业务事实',
        )
      }
      const invoice = latestInvoice(database, existing.id)
      if (invoice && invoice.status !== 'REJECTED') {
        throw new DomainError(409, 'settlement_invoice_exists', '已有有效发票的结算单不能刷新')
      }
      const adjustment = approvedAdjustment(database, existing.id)
      const payable = subscriptionShare + renewalShare + transactionShare + adjustment
      if (payable < 0) {
        throw new DomainError(409, 'settlement_negative_payable', '调账后应付金额不能小于零')
      }
      database.prepare(
        `UPDATE provider_city_settlement_statements
         SET signing_revenue_fen = ?, renewal_revenue_fen = ?,
             transaction_gmv_fen = ?, subscription_share_fen = ?,
             renewal_share_fen = ?, transaction_service_share_fen = ?,
             approved_adjustment_fen = ?, payable_fen = ?, rule_version = ?,
             version = version + 1, updated_at = ?
         WHERE id = ?`,
      ).run(
        source.signingRevenueFen,
        source.renewalRevenueFen,
        source.transactionGmvFen,
        subscriptionShare,
        renewalShare,
        transactionShare,
        adjustment,
        payable,
        rule.version,
        timestamp,
        existing.id,
      )
      statementId = existing.id
      eventType = 'STATEMENT_REFRESHED'
      summary = '结算单已按最新确认业务事实刷新'
    } else {
      statementId = `provider-city-settlement-${randomUUID()}`
      const payable = subscriptionShare + renewalShare + transactionShare
      database.prepare(
        `INSERT INTO provider_city_settlement_statements
         (id, tenant_id, city_id, period, status, currency,
          signing_revenue_fen, renewal_revenue_fen, transaction_gmv_fen,
          subscription_share_fen, renewal_share_fen,
          transaction_service_share_fen, approved_adjustment_fen,
          payable_fen, rule_version, version, generated_by, generated_at,
          updated_at)
         VALUES (?, ?, ?, ?, 'PENDING_INVOICE', 'CNY', ?, ?, ?, ?, ?, ?, 0,
                 ?, ?, 1, ?, ?, ?)`,
      ).run(
        statementId,
        principal.tenantId,
        input.cityId,
        input.period,
        source.signingRevenueFen,
        source.renewalRevenueFen,
        source.transactionGmvFen,
        subscriptionShare,
        renewalShare,
        transactionShare,
        payable,
        rule.version,
        principal.subject,
        timestamp,
        timestamp,
      )
      eventType = 'STATEMENT_GENERATED'
      summary = '月度城市收益结算单已生成'
    }
    const current = getMutableStatement(database, principal, statementId)
    const payload = {
      period: current.period,
      source,
      shares: {
        subscriptionShareFen: current.subscription_share_fen,
        renewalShareFen: current.renewal_share_fen,
        transactionServiceShareFen: current.transaction_service_share_fen,
        approvedAdjustmentFen: current.approved_adjustment_fen,
        payableFen: current.payable_fen,
      },
      ruleVersion: rule.version,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      cityId: current.city_id,
      statementId,
      actorId: principal.subject,
      type: eventType,
      dedupeKey: `${statementId}:${eventType}:${current.version}`,
      summary,
      payload,
      timestamp,
    })
    recordOperation(database, principal, current, {
      action: eventType === 'STATEMENT_GENERATED'
        ? 'PROVIDER_SETTLEMENT_GENERATED'
        : 'PROVIDER_SETTLEMENT_REFRESHED',
      eventName: eventType === 'STATEMENT_GENERATED'
        ? 'provider_settlement_generated'
        : 'provider_settlement_refreshed',
      topic: eventType === 'STATEMENT_GENERATED'
        ? 'provider.settlement.generated.v1'
        : 'provider.settlement.refreshed.v1',
      summary,
      payload,
      timestamp,
    })
    const overview = getProviderSettlementOverview(database, principal, statementId)
    persistIdempotency(database, idempotencyKey, route, hash, overview, timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function requestProviderSettlementAdjustment(
  database: DatabaseSync,
  principal: Principal,
  input: {
    statementId: string
    expectedVersion: number
    direction: 'CREDIT' | 'DEBIT'
    amountFen: number
    reason: string
    evidence: string[]
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSettlementOverview {
  const route = `/api/v1/provider/settlements/${input.statementId}/adjustments`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderSettlementOverview>(
    database, idempotencyKey, route, hash,
  )
  if (replay) return replay
  requireConfirmation(
    input.confirmed,
    'settlement_adjustment_confirmation_required',
    '提交调账申请前必须完成强确认',
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    const statement = getMutableStatement(database, principal, input.statementId)
    assertVersion(statement, input.expectedVersion)
    if (statement.status !== 'PENDING_INVOICE') {
      throw new DomainError(409, 'settlement_adjustment_locked', '仅待开票结算单可申请调账')
    }
    const timestamp = now()
    const adjustmentId = `provider-city-adjustment-${randomUUID()}`
    database.prepare(
      `INSERT INTO provider_city_settlement_adjustments
       (id, tenant_id, city_id, statement_id, direction, amount_fen, status,
        reason, evidence_json, requested_by, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    ).run(
      adjustmentId,
      principal.tenantId,
      statement.city_id,
      statement.id,
      input.direction,
      input.amountFen,
      input.reason,
      JSON.stringify(input.evidence),
      principal.subject,
      timestamp,
    )
    database.prepare(
      `UPDATE provider_city_settlement_statements
       SET version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(timestamp, statement.id, input.expectedVersion)
    const payload = {
      adjustmentId,
      direction: input.direction,
      amountFen: input.amountFen,
      reason: input.reason,
      evidence: input.evidence,
      approvalRequired: true,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      cityId: statement.city_id,
      statementId: statement.id,
      actorId: principal.subject,
      type: 'ADJUSTMENT_REQUESTED',
      dedupeKey: `${statement.id}:ADJUSTMENT_REQUESTED:${adjustmentId}`,
      summary: '城市服务商已提交收益调账申请',
      payload,
      timestamp,
    })
    recordOperation(database, principal, statement, {
      action: 'PROVIDER_SETTLEMENT_ADJUSTMENT_REQUESTED',
      eventName: 'provider_settlement_adjustment_requested',
      topic: 'provider.settlement.adjustment.approval.requested.v1',
      summary: '城市收益调账申请已提交总部审批',
      payload,
      timestamp,
      riskLevel: 'L2',
    })
    const overview = getProviderSettlementOverview(database, principal, statement.id)
    persistIdempotency(database, idempotencyKey, route, hash, overview, timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function decideProviderSettlementAdjustment(
  database: DatabaseSync,
  principal: Principal,
  input: {
    statementId: string
    adjustmentId: string
    expectedVersion: number
    decision: 'APPROVE' | 'REJECT'
    note: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSettlementOverview {
  const route = `/api/v1/provider/settlements/${input.statementId}/adjustments/${input.adjustmentId}/decision`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderSettlementOverview>(
    database, idempotencyKey, route, hash,
  )
  if (replay) return replay
  requireConfirmation(
    input.confirmed,
    'settlement_adjustment_decision_confirmation_required',
    '审批调账申请前必须完成强确认',
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    const statement = getMutableStatement(database, principal, input.statementId)
    assertVersion(statement, input.expectedVersion)
    if (statement.status !== 'PENDING_INVOICE') {
      throw new DomainError(409, 'settlement_adjustment_locked', '结算单已进入开票流程，不能审批调账')
    }
    const adjustment = database.prepare(
      `SELECT id, direction, amount_fen, status
       FROM provider_city_settlement_adjustments
       WHERE id = ? AND statement_id = ? AND tenant_id = ?`,
    ).get(input.adjustmentId, statement.id, principal.tenantId) as unknown as {
      id: string
      direction: 'CREDIT' | 'DEBIT'
      amount_fen: number
      status: ProviderSettlementAdjustmentSummary['status']
    } | undefined
    if (!adjustment) {
      throw new DomainError(404, 'settlement_adjustment_not_found', '调账申请不存在')
    }
    if (adjustment.status !== 'PENDING') {
      throw new DomainError(409, 'settlement_adjustment_decided', '调账申请已完成审批')
    }
    const timestamp = now()
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    database.prepare(
      `UPDATE provider_city_settlement_adjustments
       SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?
       WHERE id = ? AND status = 'PENDING'`,
    ).run(status, principal.subject, input.note, timestamp, adjustment.id)
    const adjustmentTotal = approvedAdjustment(database, statement.id)
    const basePayable = statement.subscription_share_fen
      + statement.renewal_share_fen
      + statement.transaction_service_share_fen
    const payable = basePayable + adjustmentTotal
    if (payable < 0) {
      throw new DomainError(
        422,
        'settlement_negative_payable',
        '批准该调账会使应付金额小于零，请驳回或调整金额',
      )
    }
    database.prepare(
      `UPDATE provider_city_settlement_statements
       SET approved_adjustment_fen = ?, payable_fen = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(adjustmentTotal, payable, timestamp, statement.id, input.expectedVersion)
    const eventType = input.decision === 'APPROVE'
      ? 'ADJUSTMENT_APPROVED'
      : 'ADJUSTMENT_REJECTED'
    const payload = {
      adjustmentId: adjustment.id,
      decision: input.decision,
      note: input.note,
      direction: adjustment.direction,
      amountFen: adjustment.amount_fen,
      approvedAdjustmentFen: adjustmentTotal,
      payableFen: payable,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      cityId: statement.city_id,
      statementId: statement.id,
      actorId: principal.subject,
      type: eventType,
      dedupeKey: `${statement.id}:${eventType}:${adjustment.id}`,
      summary: input.decision === 'APPROVE' ? '总部已批准收益调账' : '总部已驳回收益调账',
      payload,
      timestamp,
    })
    recordOperation(database, principal, statement, {
      action: `PROVIDER_SETTLEMENT_${eventType}`,
      eventName: `provider_settlement_${eventType.toLowerCase()}`,
      topic: `provider.settlement.adjustment.${status.toLowerCase()}.v1`,
      summary: input.decision === 'APPROVE' ? '城市收益调账已批准' : '城市收益调账已驳回',
      payload,
      timestamp,
      riskLevel: 'L2',
    })
    const overview = getProviderSettlementOverview(database, principal, statement.id)
    persistIdempotency(database, idempotencyKey, route, hash, overview, timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function submitProviderSettlementInvoice(
  database: DatabaseSync,
  principal: Principal,
  input: {
    statementId: string
    expectedVersion: number
    invoiceNo: string
    sellerName: string
    sellerTaxIdMasked: string
    amountFen: number
    issuedAt: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSettlementOverview {
  const route = `/api/v1/provider/settlements/${input.statementId}/invoices`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderSettlementOverview>(
    database, idempotencyKey, route, hash,
  )
  if (replay) return replay
  requireConfirmation(
    input.confirmed,
    'settlement_invoice_confirmation_required',
    '提交结算发票前必须完成强确认',
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    const statement = getMutableStatement(database, principal, input.statementId)
    assertVersion(statement, input.expectedVersion)
    if (statement.status !== 'PENDING_INVOICE') {
      throw new DomainError(409, 'settlement_invoice_locked', '当前结算单不可提交发票')
    }
    const pending = database.prepare(
      `SELECT COUNT(*) AS count
       FROM provider_city_settlement_adjustments
       WHERE statement_id = ? AND status = 'PENDING'`,
    ).get(statement.id) as { count: number }
    if (pending.count > 0) {
      throw new DomainError(409, 'settlement_adjustment_pending', '存在待审批调账，请完成审批后再开票')
    }
    if (input.amountFen !== statement.payable_fen) {
      throw new DomainError(
        422,
        'settlement_invoice_amount_mismatch',
        '发票金额必须与结算单应付金额完全一致',
      )
    }
    if (input.amountFen <= 0) {
      throw new DomainError(422, 'settlement_zero_invoice', '应付金额为零时无需提交发票')
    }
    const timestamp = now()
    const invoiceId = `provider-city-invoice-${randomUUID()}`
    database.prepare(
      `INSERT INTO provider_city_settlement_invoices
       (id, tenant_id, city_id, statement_id, invoice_no, seller_name,
        seller_tax_id_masked, amount_fen, issued_at, status, submitted_by,
        submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)`,
    ).run(
      invoiceId,
      principal.tenantId,
      statement.city_id,
      statement.id,
      input.invoiceNo,
      input.sellerName,
      input.sellerTaxIdMasked,
      input.amountFen,
      input.issuedAt,
      principal.subject,
      timestamp,
    )
    database.prepare(
      `UPDATE provider_city_settlement_statements
       SET status = 'INVOICE_SUBMITTED', version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(timestamp, statement.id, input.expectedVersion)
    const payload = {
      invoiceId,
      invoiceNo: input.invoiceNo,
      amountFen: input.amountFen,
      issuedAt: input.issuedAt,
      sellerTaxIdMasked: input.sellerTaxIdMasked,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      cityId: statement.city_id,
      statementId: statement.id,
      actorId: principal.subject,
      type: 'INVOICE_SUBMITTED',
      dedupeKey: `${statement.id}:INVOICE_SUBMITTED:${invoiceId}`,
      summary: '城市服务商已提交结算发票',
      payload,
      timestamp,
    })
    recordOperation(database, principal, statement, {
      action: 'PROVIDER_SETTLEMENT_INVOICE_SUBMITTED',
      eventName: 'provider_settlement_invoice_submitted',
      topic: 'provider.settlement.invoice.verification.requested.v1',
      summary: '城市收益结算发票已提交总部核验',
      payload,
      timestamp,
      riskLevel: 'L2',
    })
    const overview = getProviderSettlementOverview(database, principal, statement.id)
    persistIdempotency(database, idempotencyKey, route, hash, overview, timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function decideProviderSettlementInvoice(
  database: DatabaseSync,
  principal: Principal,
  input: {
    statementId: string
    expectedVersion: number
    decision: 'VERIFY' | 'REJECT'
    note: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSettlementOverview {
  const route = `/api/v1/provider/settlements/${input.statementId}/invoice-decision`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderSettlementOverview>(
    database, idempotencyKey, route, hash,
  )
  if (replay) return replay
  requireConfirmation(
    input.confirmed,
    'settlement_invoice_decision_confirmation_required',
    '核验结算发票前必须完成强确认',
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    const statement = getMutableStatement(database, principal, input.statementId)
    assertVersion(statement, input.expectedVersion)
    if (statement.status !== 'INVOICE_SUBMITTED') {
      throw new DomainError(409, 'settlement_invoice_not_submitted', '当前没有待核验发票')
    }
    const invoice = latestInvoice(database, statement.id)
    if (!invoice || invoice.status !== 'SUBMITTED') {
      throw new DomainError(409, 'settlement_invoice_not_submitted', '当前没有待核验发票')
    }
    if (input.decision === 'VERIFY' && invoice.amountFen !== statement.payable_fen) {
      throw new DomainError(409, 'settlement_invoice_amount_changed', '结算金额已变化，请驳回并重新开票')
    }
    const timestamp = now()
    const invoiceStatus = input.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED'
    const statementStatus = input.decision === 'VERIFY'
      ? 'READY_FOR_SETTLEMENT'
      : 'PENDING_INVOICE'
    database.prepare(
      `UPDATE provider_city_settlement_invoices
       SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?
       WHERE id = ? AND status = 'SUBMITTED'`,
    ).run(invoiceStatus, principal.subject, input.note, timestamp, invoice.id)
    database.prepare(
      `UPDATE provider_city_settlement_statements
       SET status = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(statementStatus, timestamp, statement.id, input.expectedVersion)
    const eventType = input.decision === 'VERIFY' ? 'INVOICE_VERIFIED' : 'INVOICE_REJECTED'
    const payload = {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      amountFen: invoice.amountFen,
      decision: input.decision,
      note: input.note,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      cityId: statement.city_id,
      statementId: statement.id,
      actorId: principal.subject,
      type: eventType,
      dedupeKey: `${statement.id}:${eventType}:${invoice.id}`,
      summary: input.decision === 'VERIFY' ? '总部已核验结算发票' : '总部已驳回结算发票',
      payload,
      timestamp,
    })
    recordOperation(database, principal, statement, {
      action: `PROVIDER_SETTLEMENT_${eventType}`,
      eventName: `provider_settlement_${eventType.toLowerCase()}`,
      topic: `provider.settlement.invoice.${invoiceStatus.toLowerCase()}.v1`,
      summary: input.decision === 'VERIFY' ? '城市收益结算发票核验通过' : '城市收益结算发票已驳回',
      payload,
      timestamp,
      riskLevel: 'L2',
    })
    const overview = getProviderSettlementOverview(database, principal, statement.id)
    persistIdempotency(database, idempotencyKey, route, hash, overview, timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function postSettlementLedger(
  database: DatabaseSync,
  principal: Principal,
  statement: StatementRow,
  invoice: ProviderSettlementInvoiceSummary,
  rule: RuleRow,
  timestamp: string,
): void {
  const ruleSnapshot = JSON.stringify({
    version: rule.version,
    signingShareBps: rule.signing_share_bps,
    renewalShareBps: rule.renewal_share_bps,
    transactionShareBps: rule.transaction_share_bps,
    formula: '确认业务净额 × 对应分成基点 / 10000',
    policyVersion: POLICY_VERSION,
  })
  const evidence = JSON.stringify([
    `账期 ${statement.period}`,
    `发票 ${invoice.invoiceNo}`,
    `总部核验 ${invoice.decidedAt ?? timestamp}`,
  ])
  const rows: Array<{
    category: ProviderSettlementLedgerEntrySummary['category']
    direction: ProviderSettlementLedgerEntrySummary['direction']
    amountFen: number
    sourceId: string
    sourceLabel: string
  }> = [
    {
      category: 'SUBSCRIPTION_SHARE',
      direction: 'CREDIT',
      amountFen: statement.subscription_share_fen,
      sourceId: `${statement.period}:SIGNING`,
      sourceLabel: '签约订阅分成',
    },
    {
      category: 'RENEWAL_SHARE',
      direction: 'CREDIT',
      amountFen: statement.renewal_share_fen,
      sourceId: `${statement.period}:RENEWAL`,
      sourceLabel: '续费服务分成',
    },
    {
      category: 'TRANSACTION_SERVICE_SHARE',
      direction: 'CREDIT',
      amountFen: statement.transaction_service_share_fen,
      sourceId: `${statement.period}:TRANSACTION`,
      sourceLabel: '交易服务分成',
    },
  ]
  const adjustments = database.prepare(
    `SELECT id, direction, amount_fen, reason, evidence_json
     FROM provider_city_settlement_adjustments
     WHERE statement_id = ? AND status = 'APPROVED'
     ORDER BY requested_at, id`,
  ).all(statement.id) as unknown as Array<{
    id: string
    direction: 'CREDIT' | 'DEBIT'
    amount_fen: number
    reason: string
    evidence_json: string
  }>
  rows.push(...adjustments.map((adjustment) => ({
    category: 'ADJUSTMENT' as const,
    direction: adjustment.direction,
    amountFen: adjustment.amount_fen,
    sourceId: adjustment.id,
    sourceLabel: adjustment.reason,
  })))
  const insert = database.prepare(
    `INSERT INTO provider_city_settlement_ledger
     (id, tenant_id, city_id, statement_id, category, direction, amount_fen,
      source_id, source_label, rule_version, rule_snapshot_json,
      evidence_json, posted_by, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of rows) {
    if (row.amountFen === 0) continue
    insert.run(
      randomUUID(),
      principal.tenantId,
      statement.city_id,
      statement.id,
      row.category,
      row.direction,
      row.amountFen,
      row.sourceId,
      row.sourceLabel,
      rule.version,
      ruleSnapshot,
      evidence,
      principal.subject,
      timestamp,
    )
  }
}

export function settleProviderStatement(
  database: DatabaseSync,
  principal: Principal,
  input: {
    statementId: string
    expectedVersion: number
    confirmed: boolean
  },
  idempotencyKey: string,
): ProviderSettlementOverview {
  const route = `/api/v1/provider/settlements/${input.statementId}/settle`
  const hash = requestHash(input)
  const replay = idempotencyReplay<ProviderSettlementOverview>(
    database, idempotencyKey, route, hash,
  )
  if (replay) return replay
  requireConfirmation(
    input.confirmed,
    'settlement_confirmation_required',
    '执行城市收益结算前必须完成强确认',
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    const statement = getMutableStatement(database, principal, input.statementId)
    assertVersion(statement, input.expectedVersion)
    if (statement.status !== 'READY_FOR_SETTLEMENT') {
      throw new DomainError(409, 'settlement_not_ready', '结算单尚未通过发票核验')
    }
    const invoice = latestInvoice(database, statement.id)
    if (
      !invoice
      || invoice.status !== 'VERIFIED'
      || invoice.amountFen !== statement.payable_fen
    ) {
      throw new DomainError(409, 'settlement_invoice_invalid', '结算发票未通过金额一致性核验')
    }
    const pending = database.prepare(
      `SELECT COUNT(*) AS count
       FROM provider_city_settlement_adjustments
       WHERE statement_id = ? AND status = 'PENDING'`,
    ).get(statement.id) as { count: number }
    if (pending.count > 0) {
      throw new DomainError(409, 'settlement_adjustment_pending', '存在待审批调账，不能执行结算')
    }
    const timestamp = now()
    const rule = ruleByVersion(database, principal.tenantId, statement.rule_version)
    postSettlementLedger(database, principal, statement, invoice, rule, timestamp)
    const ledgerNet = database.prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN direction = 'CREDIT' THEN amount_fen ELSE -amount_fen END
       ), 0) AS value
       FROM provider_city_settlement_ledger
       WHERE statement_id = ?`,
    ).get(statement.id) as { value: number }
    if (ledgerNet.value !== statement.payable_fen) {
      throw new DomainError(500, 'settlement_ledger_mismatch', '结算账本净额与应付金额不一致')
    }
    database.prepare(
      `UPDATE provider_city_settlement_statements
       SET status = 'SETTLED', settled_by = ?, settled_at = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(principal.subject, timestamp, timestamp, statement.id, input.expectedVersion)
    const payload = {
      event: SETTLEMENT_EVENT,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      payableFen: statement.payable_fen,
      ledgerNetFen: ledgerNet.value,
      ruleVersion: statement.rule_version,
      settledAt: timestamp,
    }
    appendEvent(database, {
      tenantId: principal.tenantId,
      cityId: statement.city_id,
      statementId: statement.id,
      actorId: principal.subject,
      type: 'SETTLED',
      dedupeKey: `${statement.id}:SETTLED`,
      summary: '城市收益已完成结算并写入只追加账本',
      payload,
      timestamp,
    })
    recordOperation(database, principal, statement, {
      action: 'PROVIDER_SETTLEMENT_COMPLETED',
      eventName: 'provider_settlement_completed',
      topic: SETTLEMENT_EVENT,
      summary: '城市收益结算已完成',
      payload,
      timestamp,
      riskLevel: 'L3',
    })
    const overview = getProviderSettlementOverview(database, principal, statement.id)
    persistIdempotency(database, idempotencyKey, route, hash, overview, timestamp)
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
