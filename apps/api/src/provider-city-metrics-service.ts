import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  ProviderCityMerchantMetricSummary,
  ProviderCityMetricComparison,
  ProviderCityMetricPeriod,
  ProviderCityMetricsOverview,
  ProviderRenewalCaseStatus,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const POLICY_VERSION = 'provider-city-metrics-v1' as const
const DAY_MS = 24 * 60 * 60 * 1000
const PERIOD_DAYS: Record<ProviderCityMetricPeriod, number> = {
  '30D': 30,
  '90D': 90,
  '365D': 365,
}
const PERIOD_LABELS: Record<ProviderCityMetricPeriod, string> = {
  '30D': '近 30 天',
  '90D': '近 90 天',
  '365D': '近 365 天',
}

interface TimeRange {
  from: string
  to: string
}

interface ManagedMerchantRow {
  lead_id: string
  merchant_name: string
  category: string
  owner_name: string
  health_score: number | null
  next_action: string
  lead_updated_at: string
}

interface RenewalRow {
  current_package_code: ProviderCityMerchantMetricSummary['packageCode']
  status: ProviderRenewalCaseStatus
  service_ends_at: string
  updated_at: string
}

interface RevenueRow {
  signing: number
  renewal: number
}

interface GmvRow {
  gmv: number
  orders: number
}

interface RenewalMetricRow {
  renewed: number
  closed: number
}

interface DeliveryMetricRow {
  lead_id: string
  duration_hours: number
}

interface SkillMetricRow {
  online: number
  total: number
}

interface VoucherMetricRow {
  voucher_merchants: number
  transacting_merchants: number
}

interface ActivityFact {
  occurred_at: string
  label: string
}

function rangeFor(period: ProviderCityMetricPeriod, timestamp = Date.now()): {
  current: TimeRange
  previous: TimeRange
} {
  const duration = PERIOD_DAYS[period] * DAY_MS
  return {
    current: {
      from: new Date(timestamp - duration).toISOString(),
      to: new Date(timestamp).toISOString(),
    },
    previous: {
      from: new Date(timestamp - duration * 2).toISOString(),
      to: new Date(timestamp - duration).toISOString(),
    },
  }
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

function round(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator * 100, 1)
}

function comparison(current: number, previous: number): ProviderCityMetricComparison {
  const delta = round(current - previous, Number.isInteger(current) && Number.isInteger(previous) ? 0 : 1)
  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'FLAT',
  }
}

function managedMerchants(database: DatabaseSync, principal: Principal): ManagedMerchantRow[] {
  const scope = cityScope(principal, 'leads')
  return database.prepare(
    `SELECT leads.id AS lead_id, leads.name AS merchant_name, leads.category,
            users.display_name AS owner_name, leads.health_score,
            leads.next_action, leads.updated_at AS lead_updated_at
     FROM leads
     JOIN users ON users.id = leads.owner_id
     WHERE leads.tenant_id = ?${scope.clause}
       AND (
         EXISTS (
           SELECT 1 FROM provider_delivery_cases delivery
           WHERE delivery.lead_id = leads.id
         )
         OR EXISTS (
           SELECT 1 FROM provider_renewal_cases renewals
           WHERE renewals.lead_id = leads.id
         )
         OR EXISTS (
           SELECT 1 FROM contract_drafts contracts
           WHERE contracts.lead_id = leads.id AND contracts.status = 'SIGNED'
         )
         OR EXISTS (
           SELECT 1 FROM skill_suites suites
           WHERE suites.lead_id = leads.id
         )
       )
     ORDER BY leads.updated_at DESC, leads.name`,
  ).all(principal.tenantId, ...scope.values) as unknown as ManagedMerchantRow[]
}

function activityFacts(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
  range: TimeRange,
): ActivityFact[] {
  return database.prepare(
    `SELECT occurred_at, label FROM (
       SELECT activities.created_at AS occurred_at, '客户跟进已留痕' AS label
       FROM lead_activities activities
       WHERE activities.tenant_id = ? AND activities.lead_id = ?
         AND activities.created_at >= ? AND activities.created_at < ?
       UNION ALL
       SELECT events.created_at AS occurred_at, '交付动作已留痕' AS label
       FROM provider_delivery_work_order_events events
       JOIN provider_delivery_work_orders work_orders ON work_orders.id = events.work_order_id
       WHERE events.tenant_id = ? AND work_orders.lead_id = ?
         AND events.created_at >= ? AND events.created_at < ?
       UNION ALL
       SELECT events.created_at AS occurred_at, '续费动作已留痕' AS label
       FROM provider_renewal_events events
       WHERE events.tenant_id = ? AND events.lead_id = ?
         AND events.created_at >= ? AND events.created_at < ?
       UNION ALL
       SELECT suites.updated_at AS occurred_at, 'Skill 服务状态更新' AS label
       FROM skill_suites suites
       WHERE suites.tenant_id = ? AND suites.lead_id = ?
         AND suites.updated_at >= ? AND suites.updated_at < ?
       UNION ALL
       SELECT ledger.occurred_at, '确认收入或交易事实' AS label
       FROM sales_commission_ledger ledger
       WHERE ledger.tenant_id = ? AND ledger.lead_id = ?
         AND ledger.kind IN ('RECOGNITION', 'REVERSAL')
         AND ledger.occurred_at >= ? AND ledger.occurred_at < ?
     )
     ORDER BY occurred_at DESC`,
  ).all(
    principal.tenantId, leadId, range.from, range.to,
    principal.tenantId, leadId, range.from, range.to,
    principal.tenantId, leadId, range.from, range.to,
    principal.tenantId, leadId, range.from, range.to,
    principal.tenantId, leadId, range.from, range.to,
  ) as unknown as ActivityFact[]
}

function latestActivityAt(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
  fallback: string,
): string {
  const row = database.prepare(
    `SELECT MAX(occurred_at) AS value FROM (
       SELECT created_at AS occurred_at FROM lead_activities
       WHERE tenant_id = ? AND lead_id = ?
       UNION ALL
       SELECT events.created_at AS occurred_at
       FROM provider_delivery_work_order_events events
       JOIN provider_delivery_work_orders work_orders ON work_orders.id = events.work_order_id
       WHERE events.tenant_id = ? AND work_orders.lead_id = ?
       UNION ALL
       SELECT created_at AS occurred_at FROM provider_renewal_events
       WHERE tenant_id = ? AND lead_id = ?
       UNION ALL
       SELECT updated_at AS occurred_at FROM skill_suites
       WHERE tenant_id = ? AND lead_id = ?
       UNION ALL
       SELECT occurred_at FROM sales_commission_ledger
       WHERE tenant_id = ? AND lead_id = ?
     )`,
  ).get(
    principal.tenantId, leadId,
    principal.tenantId, leadId,
    principal.tenantId, leadId,
    principal.tenantId, leadId,
    principal.tenantId, leadId,
  ) as { value: string | null }
  return row.value ?? fallback
}

function revenueForRange(
  database: DatabaseSync,
  principal: Principal,
  range: TimeRange,
  leadId?: string,
): RevenueRow {
  const scope = cityScope(principal, 'ledger')
  const row = database.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN ledger.category = 'SIGNING'
                         THEN ledger.performance_delta_fen ELSE 0 END), 0) AS signing,
       COALESCE(SUM(CASE WHEN ledger.category = 'RENEWAL'
                         THEN ledger.performance_delta_fen ELSE 0 END), 0) AS renewal
     FROM sales_commission_ledger ledger
     WHERE ledger.tenant_id = ?
       AND ledger.category IN ('SIGNING', 'RENEWAL')
       AND ledger.kind IN ('RECOGNITION', 'REVERSAL')
       AND ledger.occurred_at >= ? AND ledger.occurred_at < ?
       ${leadId ? 'AND ledger.lead_id = ?' : ''}${scope.clause}`,
  ).get(
    principal.tenantId,
    range.from,
    range.to,
    ...(leadId ? [leadId] : []),
    ...scope.values,
  ) as unknown as RevenueRow
  return row
}

function gmvForRange(
  database: DatabaseSync,
  principal: Principal,
  range: TimeRange,
  leadId?: string,
): GmvRow {
  const scope = cityScope(principal, 'ledger')
  return database.prepare(
    `SELECT
       COALESCE(SUM(ledger.performance_delta_fen), 0) AS gmv,
       COUNT(DISTINCT CASE WHEN ledger.performance_delta_fen > 0
                           THEN ledger.source_id END) AS orders
     FROM sales_commission_ledger ledger
     WHERE ledger.tenant_id = ?
       AND ledger.category = 'TRANSACTION_SHARE'
       AND ledger.kind IN ('RECOGNITION', 'REVERSAL')
       AND ledger.occurred_at >= ? AND ledger.occurred_at < ?
       ${leadId ? 'AND ledger.lead_id = ?' : ''}${scope.clause}`,
  ).get(
    principal.tenantId,
    range.from,
    range.to,
    ...(leadId ? [leadId] : []),
    ...scope.values,
  ) as unknown as GmvRow
}

function renewalForRange(
  database: DatabaseSync,
  principal: Principal,
  range: TimeRange,
): RenewalMetricRow {
  const scope = cityScope(principal, 'cases')
  return database.prepare(
    `SELECT
       COUNT(CASE WHEN cases.status = 'RENEWED' THEN 1 END) AS renewed,
       COUNT(*) AS closed
     FROM provider_renewal_cases cases
     WHERE cases.tenant_id = ?
       AND cases.status IN ('RENEWED', 'LOST')
       AND COALESCE(cases.renewed_at, cases.updated_at) >= ?
       AND COALESCE(cases.renewed_at, cases.updated_at) < ?${scope.clause}`,
  ).get(
    principal.tenantId,
    range.from,
    range.to,
    ...scope.values,
  ) as unknown as RenewalMetricRow
}

function deliveryForRange(
  database: DatabaseSync,
  principal: Principal,
  range: TimeRange,
): DeliveryMetricRow[] {
  const scope = cityScope(principal, 'cases')
  return database.prepare(
    `SELECT cases.lead_id,
            ROUND((julianday(MIN(completions.completed_at)) -
                   julianday(cases.created_at)) * 24, 1) AS duration_hours
     FROM provider_delivery_cases cases
     JOIN (
       SELECT suites.lead_id, suites.updated_at AS completed_at
       FROM skill_suites suites
       WHERE suites.status = 'ONLINE'
       UNION ALL
       SELECT work_orders.lead_id, work_orders.completed_at
       FROM provider_delivery_work_orders work_orders
       WHERE work_orders.stage = 'DELIVERED'
         AND work_orders.status = 'COMPLETED'
         AND work_orders.completed_at IS NOT NULL
     ) completions ON completions.lead_id = cases.lead_id
     WHERE cases.tenant_id = ?
       AND completions.completed_at >= ? AND completions.completed_at < ?${scope.clause}
     GROUP BY cases.id, cases.lead_id, cases.created_at
     HAVING duration_hours >= 0`,
  ).all(principal.tenantId, range.from, range.to, ...scope.values) as unknown as DeliveryMetricRow[]
}

function skillMetrics(database: DatabaseSync, principal: Principal): SkillMetricRow {
  const scope = cityScope(principal, 'suites')
  return database.prepare(
    `SELECT
       COUNT(CASE WHEN versions.status = 'ONLINE' THEN 1 END) AS online,
       COUNT(*) AS total
     FROM skill_network_versions versions
     JOIN skill_suites suites ON suites.id = versions.suite_id
     WHERE suites.tenant_id = ?${scope.clause}`,
  ).get(principal.tenantId, ...scope.values) as unknown as SkillMetricRow
}

function voucherMetrics(
  database: DatabaseSync,
  principal: Principal,
  range: TimeRange,
): VoucherMetricRow {
  const scope = cityScope(principal, 'stores')
  return database.prepare(
    `SELECT
       COUNT(DISTINCT CASE WHEN vouchers.entry_id IS NOT NULL
                            THEN stores.merchant_id END) AS voucher_merchants,
       COUNT(DISTINCT stores.merchant_id) AS transacting_merchants
     FROM merchant_orders orders
     JOIN merchant_stores stores ON stores.id = orders.store_id
     LEFT JOIN voucher_ledger vouchers
       ON vouchers.order_id = orders.id AND vouchers.direction = 'DEBIT'
     WHERE orders.tenant_id = ?
       AND orders.status IN ('VERIFIED', 'COMPLETED')
       AND orders.placed_at >= ? AND orders.placed_at < ?${scope.clause}`,
  ).get(
    principal.tenantId,
    range.from,
    range.to,
    ...scope.values,
  ) as unknown as VoucherMetricRow
}

function skillGmvShare(
  database: DatabaseSync,
  principal: Principal,
  range: TimeRange,
): number {
  const scope = cityScope(principal, 'stores')
  const row = database.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN orders.channel = 'SKILL'
                         THEN MAX(orders.paid_amount_fen - orders.refund_amount_fen, 0)
                         ELSE 0 END), 0) AS skill_gmv,
       COALESCE(SUM(MAX(orders.paid_amount_fen - orders.refund_amount_fen, 0)), 0) AS total_gmv
     FROM merchant_orders orders
     JOIN merchant_stores stores ON stores.id = orders.store_id
     WHERE orders.tenant_id = ?
       AND orders.status IN ('VERIFIED', 'COMPLETED')
       AND orders.placed_at >= ? AND orders.placed_at < ?${scope.clause}`,
  ).get(principal.tenantId, range.from, range.to, ...scope.values) as {
    skill_gmv: number
    total_gmv: number
  }
  return rate(row.skill_gmv, row.total_gmv)
}

function serviceStage(
  database: DatabaseSync,
  leadId: string,
  renewal: RenewalRow | undefined,
): ProviderCityMerchantMetricSummary['serviceStage'] {
  if (renewal?.status === 'LOST') return 'LOST'
  if (
    renewal
    && ['MONITORING', 'PROPOSAL_READY'].includes(renewal.status)
    && Date.parse(renewal.service_ends_at) - Date.now() <= 30 * DAY_MS
  ) return 'RENEWAL'
  const skill = database.prepare(
    `SELECT status FROM skill_suites WHERE lead_id = ?
     ORDER BY updated_at DESC LIMIT 1`,
  ).get(leadId) as { status: string } | undefined
  if (skill?.status === 'ONLINE') return 'SKILL_ONLINE'
  const miniapp = database.prepare(
    `SELECT status FROM miniapp_factory_projects WHERE lead_id = ?
     ORDER BY updated_at DESC LIMIT 1`,
  ).get(leadId) as { status: string } | undefined
  if (miniapp?.status === 'LIVE') return 'LIVE'
  return 'DELIVERING'
}

function healthScore(database: DatabaseSync, merchant: ManagedMerchantRow): number | null {
  const row = database.prepare(
    `SELECT COALESCE(
       (SELECT score FROM geo_workspaces WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1),
       (SELECT score FROM diagnosis_reports WHERE lead_id = ? ORDER BY generated_at DESC LIMIT 1),
       ?
     ) AS value`,
  ).get(merchant.lead_id, merchant.lead_id, merchant.health_score) as {
    value: number | null
  }
  return row.value
}

function merchantSummary(
  database: DatabaseSync,
  principal: Principal,
  merchant: ManagedMerchantRow,
  range: TimeRange,
): ProviderCityMerchantMetricSummary {
  const renewal = database.prepare(
    `SELECT current_package_code, status, service_ends_at, updated_at
     FROM provider_renewal_cases
     WHERE tenant_id = ? AND lead_id = ?
     ORDER BY service_ends_at DESC, updated_at DESC LIMIT 1`,
  ).get(principal.tenantId, merchant.lead_id) as RenewalRow | undefined
  const facts = activityFacts(database, principal, merchant.lead_id, range)
  const revenue = revenueForRange(database, principal, range, merchant.lead_id)
  const gmv = gmvForRange(database, principal, range, merchant.lead_id)
  const score = healthScore(database, merchant)
  const daysRemaining = renewal
    ? Math.ceil((Date.parse(renewal.service_ends_at) - Date.now()) / DAY_MS)
    : null
  const risk = renewal?.status === 'LOST' || (daysRemaining !== null && daysRemaining <= 7)
    ? 'RISK'
    : (daysRemaining !== null && daysRemaining <= 30) || (score !== null && score < 70)
      ? 'WATCH'
      : 'HEALTHY'
  return {
    leadId: merchant.lead_id,
    merchantName: merchant.merchant_name,
    category: merchant.category,
    ownerName: merchant.owner_name,
    packageCode: renewal?.current_package_code ?? null,
    serviceStage: serviceStage(database, merchant.lead_id, renewal),
    healthScore: score,
    active: facts.length > 0,
    activityEvidence: [...new Set(facts.map(({ label }) => label))].slice(0, 4),
    serviceRevenueFen: revenue.signing + revenue.renewal,
    transactionGmvFen: gmv.gmv,
    renewalStatus: renewal?.status ?? null,
    renewalDaysRemaining: daysRemaining,
    risk,
    nextAction: merchant.next_action,
    lastActivityAt: latestActivityAt(
      database,
      principal,
      merchant.lead_id,
      merchant.lead_updated_at,
    ),
  }
}

function averageDelivery(rows: DeliveryMetricRow[]): number | null {
  if (rows.length === 0) return null
  return round(rows.reduce((sum, row) => sum + row.duration_hours, 0) / rows.length, 1)
}

function formatBucketLabel(from: Date, to: Date): string {
  return `${from.getMonth() + 1}.${from.getDate()}–${to.getMonth() + 1}.${to.getDate()}`
}

function trends(
  database: DatabaseSync,
  principal: Principal,
  merchants: ManagedMerchantRow[],
  range: TimeRange,
): ProviderCityMetricsOverview['trends'] {
  const bucketCount = 6
  const duration = Date.parse(range.to) - Date.parse(range.from)
  const bucketDuration = duration / bucketCount
  return Array.from({ length: bucketCount }, (_, index) => {
    const from = new Date(Date.parse(range.from) + bucketDuration * index)
    const to = new Date(
      index === bucketCount - 1
        ? Date.parse(range.to)
        : Date.parse(range.from) + bucketDuration * (index + 1),
    )
    const bucket = { from: from.toISOString(), to: to.toISOString() }
    const revenue = revenueForRange(database, principal, bucket)
    const gmv = gmvForRange(database, principal, bucket)
    const delivery = deliveryForRange(database, principal, bucket)
    const activeMerchants = merchants.filter(
      ({ lead_id }) => activityFacts(database, principal, lead_id, bucket).length > 0,
    ).length
    return {
      label: formatBucketLabel(from, to),
      from: bucket.from,
      to: bucket.to,
      activeMerchants,
      serviceRevenueFen: revenue.signing + revenue.renewal,
      transactionGmvFen: gmv.gmv,
      deliveredCases: delivery.length,
    }
  })
}

function freshness(
  database: DatabaseSync,
  principal: Principal,
): ProviderCityMetricsOverview['freshness'] {
  const latest = (table: string, column: string, alias: string): string | null => {
    const resolvedScope = cityScope(principal, alias)
    const row = database.prepare(
      `SELECT MAX(${alias}.${column}) AS value FROM ${table} ${alias}
       WHERE ${alias}.tenant_id = ?${resolvedScope.clause}`,
    ).get(principal.tenantId, ...resolvedScope.values) as { value: string | null }
    return row.value
  }
  return [
    { source: 'CRM 商家主档', updatedAt: latest('leads', 'updated_at', 'leads') },
    {
      source: '交付工单',
      updatedAt: latest('provider_delivery_work_orders', 'updated_at', 'work_orders'),
    },
    {
      source: '续费周期',
      updatedAt: latest('provider_renewal_cases', 'updated_at', 'renewals'),
    },
    { source: 'Skill Network', updatedAt: latest('skill_suites', 'updated_at', 'suites') },
    {
      source: '确认收入与交易账本',
      updatedAt: latest('sales_commission_ledger', 'occurred_at', 'ledger'),
    },
    { source: '交易订单', updatedAt: latest('merchant_stores', 'updated_at', 'stores') },
  ]
}

export function getProviderCityMetricsOverview(
  database: DatabaseSync,
  principal: Principal,
  input: {
    period?: ProviderCityMetricPeriod | undefined
    focusLeadId?: string | undefined
  } = {},
): ProviderCityMetricsOverview {
  const period = input.period ?? '30D'
  const ranges = rangeFor(period)
  const rows = managedMerchants(database, principal)
  const merchants = rows.map((row) => merchantSummary(
    database,
    principal,
    row,
    ranges.current,
  ))
  const focusMerchant = input.focusLeadId
    ? merchants.find(({ leadId }) => leadId === input.focusLeadId)
    : merchants[0]
  if (input.focusLeadId && !focusMerchant) {
    throw new DomainError(404, 'city_metric_merchant_not_found', '商家不存在或不在当前城市范围内')
  }

  const currentRevenue = revenueForRange(database, principal, ranges.current)
  const previousRevenue = revenueForRange(database, principal, ranges.previous)
  const currentGmv = gmvForRange(database, principal, ranges.current)
  const previousGmv = gmvForRange(database, principal, ranges.previous)
  const currentRenewal = renewalForRange(database, principal, ranges.current)
  const previousRenewal = renewalForRange(database, principal, ranges.previous)
  const currentDelivery = deliveryForRange(database, principal, ranges.current)
  const previousDelivery = deliveryForRange(database, principal, ranges.previous)
  const currentDeliveryAverage = averageDelivery(currentDelivery)
  const previousDeliveryAverage = averageDelivery(previousDelivery)
  const skills = skillMetrics(database, principal)
  const vouchers = voucherMetrics(database, principal, ranges.current)
  const activeMerchants = merchants.filter(({ active }) => active).length
  const previousActive = rows.filter(
    ({ lead_id }) => activityFacts(database, principal, lead_id, ranges.previous).length > 0,
  ).length
  const currentRenewalRate = rate(currentRenewal.renewed, currentRenewal.closed)
  const previousRenewalRate = rate(previousRenewal.renewed, previousRenewal.closed)
  const serviceRevenueFen = currentRevenue.signing + currentRevenue.renewal
  const previousServiceRevenueFen = previousRevenue.signing + previousRevenue.renewal
  const cityId = principal.dataScope === 'PLATFORM'
    ? 'platform'
    : principal.cityIds[0] ?? 'unscoped'
  const city = cityId === 'platform'
    ? undefined
    : database.prepare(
      `SELECT name FROM organizations
       WHERE tenant_id = ? AND type = 'CITY' AND city_id = ?
       ORDER BY created_at LIMIT 1`,
    ).get(principal.tenantId, cityId) as { name: string } | undefined

  const categories = [...new Set(merchants.map(({ category }) => category))].map((category) => {
    const items = merchants.filter((merchant) => merchant.category === category)
    return {
      category,
      merchants: items.length,
      activeMerchants: items.filter(({ active }) => active).length,
      serviceRevenueFen: items.reduce((sum, item) => sum + item.serviceRevenueFen, 0),
      transactionGmvFen: items.reduce((sum, item) => sum + item.transactionGmvFen, 0),
    }
  }).sort((left, right) => right.merchants - left.merchants)

  const dueSoon = merchants.filter(
    ({ renewalDaysRemaining, renewalStatus }) =>
      renewalDaysRemaining !== null
      && renewalDaysRemaining <= 30
      && ['MONITORING', 'PROPOSAL_READY'].includes(renewalStatus ?? ''),
  ).length
  const skillShare = skillGmvShare(database, principal, ranges.current)
  const insights: ProviderCityMetricsOverview['insights'] = [
    {
      id: 'service-revenue',
      tone: serviceRevenueFen >= previousServiceRevenueFen ? 'POSITIVE' : 'NOTICE',
      title: serviceRevenueFen >= previousServiceRevenueFen ? '服务收入保持增长' : '服务收入需要回补',
      detail: `确认签约与续费净收入较上一周期${serviceRevenueFen >= previousServiceRevenueFen ? '增加' : '减少'} ¥${Math.abs(serviceRevenueFen - previousServiceRevenueFen) / 100}`,
      evidence: `当前 ¥${serviceRevenueFen / 100} · 上期 ¥${previousServiceRevenueFen / 100}`,
    },
    {
      id: 'renewal-window',
      tone: dueSoon > 0 ? 'RISK' : 'POSITIVE',
      title: dueSoon > 0 ? `${dueSoon} 家进入 30 天续费窗口` : '近期续费窗口平稳',
      detail: dueSoon > 0
        ? '建议优先完成价值证据复盘、套餐确认与决策链校准。'
        : '当前没有进入 30 天续费窗口且仍未关闭的商家。',
      evidence: `按 provider-renewal-policy-v1 服务到期日计算`,
    },
    {
      id: 'delivery-quality',
      tone: currentDeliveryAverage === null
        ? 'NOTICE'
        : currentDeliveryAverage <= 168 ? 'POSITIVE' : 'RISK',
      title: currentDeliveryAverage === null
        ? '等待形成可计量交付样本'
        : `平均交付 ${currentDeliveryAverage} 小时`,
      detail: currentDeliveryAverage === null
        ? '仅在 Skill 上线或“已交付”工单完成后计入交付时长，避免用进行中案件污染结果。'
        : currentDeliveryAverage <= 168
          ? '已完成案件平均时长处于 168 小时服务目标内。'
          : '已完成案件平均时长超过 168 小时，需要复盘瓶颈阶段。',
      evidence: `${currentDelivery.length} 个完整交付样本`,
    },
    {
      id: 'skill-commerce',
      tone: skillShare >= 20 ? 'POSITIVE' : 'NOTICE',
      title: `Skill 交易贡献 ${skillShare}%`,
      detail: '仅统计已核销或已完成订单的实付净额，不把调用量当作交易结果。',
      evidence: `${skills.online}/${skills.total} 项 Skill 当前可交易`,
    },
  ]

  const freshnessRows = freshness(database, principal)
  const updatedAt = freshnessRows
    .map(({ updatedAt: value }) => value)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? new Date(0).toISOString()

  return {
    city: { id: cityId, name: city?.name ?? '全国城市网络' },
    period: {
      key: period,
      label: PERIOD_LABELS[period],
      from: ranges.current.from,
      to: ranges.current.to,
      previousFrom: ranges.previous.from,
      previousTo: ranges.previous.to,
      timezone: 'Asia/Shanghai',
    },
    metrics: {
      totalMerchants: merchants.length,
      activeMerchants,
      activeMerchantRate: rate(activeMerchants, merchants.length),
      serviceRevenueFen,
      signingRevenueFen: currentRevenue.signing,
      renewalRevenueFen: currentRevenue.renewal,
      renewalRate: currentRenewalRate,
      renewedCases: currentRenewal.renewed,
      closedRenewalCases: currentRenewal.closed,
      averageDeliveryHours: currentDeliveryAverage,
      deliveredCases: currentDelivery.length,
      deliveryTargetHours: 168,
      skillTradableRate: rate(skills.online, skills.total),
      onlineSkills: skills.online,
      totalSkills: skills.total,
      transactionGmvFen: currentGmv.gmv,
      transactionOrders: currentGmv.orders,
      skillGmvShare: skillShare,
      voucherAdoptionRate: rate(vouchers.voucher_merchants, vouchers.transacting_merchants),
      voucherMerchants: vouchers.voucher_merchants,
      transactingMerchants: vouchers.transacting_merchants,
    },
    comparisons: {
      activeMerchants: comparison(activeMerchants, previousActive),
      serviceRevenueFen: comparison(serviceRevenueFen, previousServiceRevenueFen),
      renewalRate: comparison(currentRenewalRate, previousRenewalRate),
      averageDeliveryHours: currentDeliveryAverage === null || previousDeliveryAverage === null
        ? null
        : comparison(currentDeliveryAverage, previousDeliveryAverage),
      transactionGmvFen: comparison(currentGmv.gmv, previousGmv.gmv),
    },
    trends: trends(database, principal, rows, ranges.current),
    categories,
    merchants,
    focusMerchant: focusMerchant ?? null,
    insights,
    methodology: [
      {
        metric: '城市商家',
        definition: '已签约、已建立交付案件、续费周期或 Skill 套件的去重商家。',
        source: 'CRM / 合同 / 交付 / 续费 / Skill Network',
      },
      {
        metric: '活跃商家',
        definition: '周期内存在跟进、交付、续费、Skill 状态或确认账本事件的服务商家。',
        source: '只追加业务事件与确认账本',
      },
      {
        metric: '服务收入',
        definition: '周期内签约与续费确认金额的净额，不含预计金额和佣金。',
        source: 'sales_commission_ledger · SIGNING / RENEWAL',
      },
      {
        metric: '续费率',
        definition: '周期内确认续费数 ÷ 已关闭续费机会数；无关闭样本时显示 0 并保留样本数。',
        source: 'provider_renewal_cases',
      },
      {
        metric: '交付时长',
        definition: '交付案件建立至 Skill 上线或“已交付”工单完成的平均小时数。',
        source: 'provider_delivery_cases / work_orders / skill_suites',
      },
      {
        metric: 'Skill 可交易率',
        definition: 'ONLINE 版本数 ÷ 全部 Skill 版本数。',
        source: 'skill_network_versions',
      },
      {
        metric: '交易 GMV',
        definition: '结算域确认的交易分成基数净额，包含确认与冲正事实。',
        source: 'sales_commission_ledger · TRANSACTION_SHARE',
      },
      {
        metric: '代金券启用率',
        definition: '周期内完成交易且发生代金券扣减的商家数 ÷ 完成交易商家数。',
        source: 'merchant_orders / voucher_ledger',
      },
    ],
    freshness: freshnessRows,
    policy: {
      version: POLICY_VERSION,
      cityScopeEnforced: true,
      revenueRecognition: '仅 SIGNING / RENEWAL 确认与冲正事实',
      gmvRecognition: '仅 TRANSACTION_SHARE 确认与冲正事实',
      noEstimatedRevenue: true,
    },
    updatedAt,
  }
}
