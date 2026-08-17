import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  GeoWorkspaceStatus,
  LeadStage,
  MiniAppProjectStatus,
  ProviderDeliveryBoardOverview,
  ProviderDeliveryCaseSummary,
  ProviderDeliveryEvidenceSummary,
  ProviderDeliveryStage,
  ProviderDeliveryStageDefinition,
  SkillSuiteStatus,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const PROJECTION_VERSION = 'provider-delivery-projection-v1'
const OVERALL_SLA_HOURS = 7 * 24
const HOUR_MS = 60 * 60 * 1000

export const providerDeliveryStages: readonly ProviderDeliveryStageDefinition[] = [
  {
    key: 'WAITING_CAPTURE',
    index: 1,
    label: '待采集',
    shortLabel: '待采集',
    description: '合同与授权完成，等待启动商家资料采集。',
    targetHours: 4,
  },
  {
    key: 'CAPTURING',
    index: 2,
    label: '资料采集中',
    shortLabel: '采集中',
    description: '营业执照、门头和菜单正在识别与人工确认。',
    targetHours: 12,
  },
  {
    key: 'MINIAPP_GENERATING',
    index: 3,
    label: '小程序生成中',
    shortLabel: '生成中',
    description: '基于白名单区块生成页面、内容和可分享预览。',
    targetHours: 24,
  },
  {
    key: 'MERCHANT_CONFIRMATION',
    index: 4,
    label: '商家确认',
    shortLabel: '商家确认',
    description: '商家核对页面内容、版本和展示范围。',
    targetHours: 36,
  },
  {
    key: 'REVIEWING',
    index: 5,
    label: '审核中',
    shortLabel: '审核中',
    description: '平台审核、灰度观察与发布门禁正在执行。',
    targetHours: 48,
  },
  {
    key: 'LIVE',
    index: 6,
    label: '已上线',
    shortLabel: '已上线',
    description: '小程序已经正式发布，等待建立 GEO 服务。',
    targetHours: 60,
  },
  {
    key: 'GEO_SERVICING',
    index: 7,
    label: 'GEO 服务中',
    shortLabel: 'GEO',
    description: '实体、渠道一致性、内容计划和可见性正在优化。',
    targetHours: 108,
  },
  {
    key: 'SKILL_GENERATING',
    index: 8,
    label: 'Skill 生成中',
    shortLabel: 'Skill',
    description: '标准能力正在生成、测试、认证和灰度。',
    targetHours: 156,
  },
  {
    key: 'DELIVERED',
    index: 9,
    label: '已交付',
    shortLabel: '已交付',
    description: 'MiniApp、GEO 与 Skill 已形成可运行交付结果。',
    targetHours: OVERALL_SLA_HOURS,
  },
] as const

interface DeliveryRow {
  case_id: string
  tenant_id: string
  city_id: string
  owner_id: string
  owner_display_name: string
  priority: ProviderDeliveryCaseSummary['priority']
  target_due_at: string
  case_version: number
  case_created_at: string
  case_updated_at: string
  lead_id: string
  merchant_name: string
  category: string
  lead_stage: LeadStage
  health_score: number | null
  lead_next_action: string
  lead_updated_at: string
  project_id: string | null
  miniapp_status: MiniAppProjectStatus | null
  miniapp_next_action: string | null
  project_updated_at: string | null
  geo_workspace_id: string | null
  geo_status: GeoWorkspaceStatus | null
  geo_next_action: string | null
  geo_updated_at: string | null
  skill_suite_id: string | null
  skill_status: SkillSuiteStatus | null
  skill_next_action: string | null
  skill_updated_at: string | null
}

interface EvidenceRow {
  id: string
  source: ProviderDeliveryEvidenceSummary['source']
  type: string
  summary: string
  actor_name: string | null
  created_at: string
}

function scopedRows(database: DatabaseSync, principal: Principal): DeliveryRow[] {
  const cityClause = principal.dataScope === 'PLATFORM'
    ? ''
    : principal.dataScope === 'CITY' && principal.cityIds.length > 0
      ? ` AND delivery.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`
      : ' AND 0 = 1'
  const cityValues = principal.dataScope === 'CITY' ? [...principal.cityIds] : []
  return database.prepare(
    `SELECT delivery.id AS case_id, delivery.tenant_id, delivery.city_id,
            delivery.owner_id, owners.display_name AS owner_display_name,
            delivery.priority, delivery.target_due_at,
            delivery.version AS case_version,
            delivery.created_at AS case_created_at,
            delivery.updated_at AS case_updated_at,
            leads.id AS lead_id, leads.name AS merchant_name, leads.category,
            leads.stage AS lead_stage, leads.health_score,
            leads.next_action AS lead_next_action,
            leads.updated_at AS lead_updated_at,
            projects.id AS project_id, projects.status AS miniapp_status,
            projects.next_action AS miniapp_next_action,
            projects.updated_at AS project_updated_at,
            geo.id AS geo_workspace_id, geo.status AS geo_status,
            geo.next_action AS geo_next_action,
            geo.updated_at AS geo_updated_at,
            skills.id AS skill_suite_id, skills.status AS skill_status,
            skills.next_action AS skill_next_action,
            skills.updated_at AS skill_updated_at
     FROM provider_delivery_cases delivery
     JOIN leads
       ON leads.id = delivery.lead_id
      AND leads.tenant_id = delivery.tenant_id
     JOIN users owners ON owners.id = delivery.owner_id
     LEFT JOIN miniapp_factory_projects projects
       ON projects.lead_id = delivery.lead_id
      AND projects.tenant_id = delivery.tenant_id
     LEFT JOIN geo_workspaces geo
       ON geo.lead_id = delivery.lead_id
      AND geo.tenant_id = delivery.tenant_id
     LEFT JOIN skill_suites skills
       ON skills.lead_id = delivery.lead_id
      AND skills.tenant_id = delivery.tenant_id
     WHERE delivery.tenant_id = ?${cityClause}
     ORDER BY
       CASE delivery.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
       delivery.target_due_at,
       delivery.updated_at DESC`,
  ).all(principal.tenantId, ...cityValues) as unknown as DeliveryRow[]
}

function deriveStage(row: DeliveryRow): ProviderDeliveryStageDefinition {
  let stage: ProviderDeliveryStage
  if (row.skill_status === 'ONLINE') stage = 'DELIVERED'
  else if (row.skill_suite_id) stage = 'SKILL_GENERATING'
  else if (row.geo_workspace_id) stage = 'GEO_SERVICING'
  else if (row.miniapp_status === 'LIVE') stage = 'LIVE'
  else if (row.project_id && ['MERCHANT_APPROVAL', 'REVIEW', 'GRAY'].includes(row.miniapp_status ?? '')) {
    stage = 'REVIEWING'
  } else if (row.miniapp_status === 'PREVIEW') stage = 'MERCHANT_CONFIRMATION'
  else if (row.project_id || row.lead_stage === 'READY_FOR_DELIVERY') stage = 'MINIAPP_GENERATING'
  else if (row.lead_stage === 'ASSET_REVIEW') stage = 'CAPTURING'
  else stage = 'WAITING_CAPTURE'
  return providerDeliveryStages.find(({ key }) => key === stage) as ProviderDeliveryStageDefinition
}

function stageStartedAt(row: DeliveryRow, stage: ProviderDeliveryStage): string {
  if (stage === 'DELIVERED' || stage === 'SKILL_GENERATING') {
    return row.skill_updated_at ?? row.case_updated_at
  }
  if (stage === 'GEO_SERVICING') return row.geo_updated_at ?? row.case_updated_at
  if (['LIVE', 'REVIEWING', 'MERCHANT_CONFIRMATION', 'MINIAPP_GENERATING'].includes(stage)) {
    return row.project_updated_at ?? row.lead_updated_at
  }
  return row.lead_updated_at
}

function nextAction(row: DeliveryRow, stage: ProviderDeliveryStage): string {
  if (stage === 'DELIVERED') return '完成交付验收并安排首次运营复盘'
  if (stage === 'SKILL_GENERATING') return row.skill_next_action ?? '推进 Skill 生成与认证'
  if (stage === 'GEO_SERVICING') return row.geo_next_action ?? '推进 GEO 扫描与优化'
  if (['LIVE', 'REVIEWING', 'MERCHANT_CONFIRMATION', 'MINIAPP_GENERATING'].includes(stage)) {
    return row.miniapp_next_action ?? row.lead_next_action
  }
  return row.lead_next_action
}

function toCase(row: DeliveryRow, timestamp: number): ProviderDeliveryCaseSummary {
  const stage = deriveStage(row)
  const startedAt = stageStartedAt(row, stage.key)
  const hoursRemaining = Math.ceil((Date.parse(row.target_due_at) - timestamp) / HOUR_MS)
  const slaStatus: ProviderDeliveryCaseSummary['slaStatus'] = stage.key === 'DELIVERED'
    ? 'COMPLETED'
    : hoursRemaining < 0
      ? 'OVERDUE'
      : hoursRemaining <= 24
        ? 'DUE_SOON'
        : 'ON_TRACK'
  return {
    id: row.case_id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    category: row.category,
    stage: stage.key,
    stageIndex: stage.index,
    progressRate: Math.round(stage.index / providerDeliveryStages.length * 100),
    owner: {
      userId: row.owner_id,
      displayName: row.owner_display_name,
    },
    priority: row.priority,
    nextAction: nextAction(row, stage.key),
    targetDueAt: row.target_due_at,
    slaStatus,
    hoursRemaining,
    stageStartedAt: startedAt,
    stageAgeHours: Math.max(0, Math.floor((timestamp - Date.parse(startedAt)) / HOUR_MS)),
    healthScore: row.health_score,
    projectId: row.project_id,
    geoWorkspaceId: row.geo_workspace_id,
    skillSuiteId: row.skill_suite_id,
    sourceStatuses: {
      lead: row.lead_stage,
      miniapp: row.miniapp_status,
      geo: row.geo_status,
      skill: row.skill_status,
    },
    version: row.case_version,
  }
}

function evidenceForCase(
  database: DatabaseSync,
  principal: Principal,
  row: DeliveryRow | undefined,
): ProviderDeliveryEvidenceSummary[] {
  if (!row) return []
  const common = [principal.tenantId]
  const queries: Array<{ sql: string; values: string[] }> = [
    {
      sql: `SELECT events.id, 'DELIVERY' AS source, events.type, events.summary,
                   users.display_name AS actor_name, events.created_at
            FROM provider_delivery_case_events events
            LEFT JOIN users ON users.id = events.actor_id
            WHERE events.tenant_id = ? AND events.case_id = ?`,
      values: [...common, row.case_id],
    },
    {
      sql: `SELECT events.id, 'ONBOARDING' AS source, events.type, events.summary,
                   users.display_name AS actor_name, events.created_at
            FROM lead_activities events
            LEFT JOIN users ON users.id = events.actor_id
            WHERE events.tenant_id = ? AND events.lead_id = ?`,
      values: [...common, row.lead_id],
    },
  ]
  if (row.project_id) {
    queries.push({
      sql: `SELECT events.id, 'MINIAPP' AS source, events.type, events.summary,
                   users.display_name AS actor_name, events.created_at
            FROM miniapp_factory_events events
            LEFT JOIN users ON users.id = events.actor_id
            WHERE events.tenant_id = ? AND events.project_id = ?`,
      values: [...common, row.project_id],
    })
  }
  if (row.geo_workspace_id) {
    queries.push({
      sql: `SELECT events.id, 'GEO' AS source, events.type, events.summary,
                   users.display_name AS actor_name, events.created_at
            FROM geo_events events
            LEFT JOIN users ON users.id = events.actor_id
            WHERE events.tenant_id = ? AND events.workspace_id = ?`,
      values: [...common, row.geo_workspace_id],
    })
  }
  if (row.skill_suite_id) {
    queries.push({
      sql: `SELECT events.id, 'SKILL' AS source, events.type, events.summary,
                   users.display_name AS actor_name, events.created_at
            FROM skill_network_events events
            LEFT JOIN users ON users.id = events.actor_id
            WHERE events.tenant_id = ? AND events.suite_id = ?`,
      values: [...common, row.skill_suite_id],
    })
  }
  const rows = queries.flatMap(({ sql, values }) =>
    database.prepare(sql).all(...values) as unknown as EvidenceRow[])
  return rows
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 40)
    .map((item) => ({
      id: item.id,
      source: item.source,
      type: item.type,
      summary: item.summary,
      actorName: item.actor_name ?? '系统',
      createdAt: item.created_at,
    }))
}

export function getProviderDeliveryBoardOverview(
  database: DatabaseSync,
  principal: Principal,
  focusCaseId?: string,
): ProviderDeliveryBoardOverview {
  const timestamp = Date.now()
  const rows = scopedRows(database, principal)
  const cases = rows.map((row) => toCase(row, timestamp))
  const focus = focusCaseId ? cases.find(({ id }) => id === focusCaseId) : cases[0]
  if (focusCaseId && !focus) {
    throw new DomainError(404, 'provider_delivery_case_not_found', '交付案件不存在或不在当前城市范围内')
  }
  const focusRow = focus ? rows.find(({ case_id }) => case_id === focus.id) : undefined
  const cityId = focusRow?.city_id ?? principal.cityIds[0] ?? 'platform'
  const city = database.prepare(
    `SELECT name FROM organizations
     WHERE tenant_id = ? AND type = 'CITY' AND city_id = ?
     ORDER BY created_at LIMIT 1`,
  ).get(principal.tenantId, cityId) as { name: string } | undefined
  const deliveredRows = rows.filter((row) => deriveStage(row).key === 'DELIVERED')

  return {
    city: { id: cityId, name: city?.name ?? '全国城市网络' },
    metrics: {
      total: cases.length,
      active: cases.filter(({ stage }) => stage !== 'DELIVERED').length,
      atRisk: cases.filter(({ slaStatus }) => ['DUE_SOON', 'OVERDUE'].includes(slaStatus)).length,
      overdue: cases.filter(({ slaStatus }) => slaStatus === 'OVERDUE').length,
      delivered: cases.filter(({ stage }) => stage === 'DELIVERED').length,
      averageProgressRate: cases.length
        ? Math.round(cases.reduce((sum, item) => sum + item.progressRate, 0) / cases.length)
        : 0,
      averageCycleHours: deliveredRows.length
        ? Math.round(deliveredRows.reduce((sum, row) =>
            sum + Math.max(0, (Date.parse(row.skill_updated_at ?? row.case_updated_at)
              - Date.parse(row.case_created_at)) / HOUR_MS), 0) / deliveredRows.length)
        : 0,
    },
    stages: providerDeliveryStages.map((stage) => {
      const stageCases = cases.filter((item) => item.stage === stage.key)
      return { ...stage, count: stageCases.length, cases: stageCases }
    }),
    cases,
    focusCase: focus ?? null,
    evidence: evidenceForCase(database, principal, focusRow),
    policy: {
      projectionVersion: PROJECTION_VERSION,
      overallSlaHours: OVERALL_SLA_HOURS,
      cityScopeEnforced: true,
      sourceOfTruth: ['ONBOARDING', 'MINIAPP_FACTORY', 'GEO_OS', 'SKILL_NETWORK'],
    },
    permissions: {
      canView: hasPermission(principal, 'lead.assign'),
      canOperateFactory: hasPermission(principal, 'miniapp.build'),
      canOperateGeo: hasPermission(principal, 'geo.manage'),
      canOperateSkill: hasPermission(principal, 'skill.manage'),
    },
    updatedAt: rows.reduce((latest, row) => {
      const candidates = [
        row.case_updated_at,
        row.lead_updated_at,
        row.project_updated_at,
        row.geo_updated_at,
        row.skill_updated_at,
      ].filter((value): value is string => Boolean(value))
      const rowLatest = candidates.sort().at(-1) ?? latest
      return rowLatest > latest ? rowLatest : latest
    }, new Date(0).toISOString()),
  }
}
