import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  GeoChannelComparisonSummary,
  GeoContentPlanSummary,
  GeoDimensionScore,
  GeoEventSummary,
  GeoFactSummary,
  GeoIdentitySummary,
  GeoIssueSummary,
  GeoObservationSummary,
  GeoOverview,
  GeoWorkspaceStatus,
  GeoWorkspaceSummary,
  MiniAppProjectSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'geo-os-e3'
const COMPLIANCE_NOTICE = '提升资料完整性、一致性与机器可读性；不承诺任何第三方 AI 排名、推荐或增长结果。'

interface WorkspaceRow {
  id: string
  tenant_id: string
  city_id: string
  project_id: string
  lead_id: string
  merchant_name: string
  status: GeoWorkspaceStatus
  score: number | null
  previous_score: number | null
  current_scan_version: number
  next_action: string
  compliance_notice: string
  version: number
  updated_at: string
}

interface ProjectRow {
  id: string
  tenant_id: string
  city_id: string
  lead_id: string
  merchant_name: string
  delivery_type: MiniAppProjectSummary['deliveryType']
  status: string
  template_code: MiniAppProjectSummary['templateCode']
  current_draft_version: number
  current_release_version: number | null
  next_action: string
  sla_due_at: string
  version: number
  updated_at: string
}

interface IdentityRow {
  brand_name: string
  store_name: string
  canonical_poi_id: string
  aliases_json: string
  address: string
  latitude: number
  longitude: number
  match_status: GeoIdentitySummary['matchStatus']
  source: string
  confidence: number
  version: number
}

interface FactRow {
  id: string
  field_key: string
  field_label: string
  value_text: string
  source_type: string
  source_ref: string
  confidence: number
  verification_status: GeoFactSummary['verificationStatus']
  version: number
}

interface ChannelRow {
  channel: GeoChannelComparisonSummary['channels'][number]['channel']
  field_key: string
  field_label: string
  canonical_value: string
  observed_value: string
  consistency_status: GeoChannelComparisonSummary['channels'][number]['status']
}

interface IssueRow {
  id: string
  dimension_key: string
  code: string
  title: string
  severity: GeoIssueSummary['severity']
  channel: string
  field_key: string
  current_value: string
  recommended_value: string
  status: GeoIssueSummary['status']
}

interface ContentPlanRow {
  id: string
  version: number
  question_terms_json: string
  scenario_terms_json: string
  items_json: string
  status: GeoContentPlanSummary['status']
  model_version: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

interface ObservationRow {
  observation_date: string
  channel: string
  mentions: number
  visits: number
  inquiries: number
  orders: number
  attribution_model: string
}

interface ScoreRow {
  dimensions_json: string
}

interface EventRow {
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

const dimensionBlueprint = [
  ['identityPoi', '身份与 POI', 15],
  ['basicProfile', '基础资料', 15],
  ['channelConsistency', '多渠道一致性', 15],
  ['structuredOfferings', '商品服务结构化', 15],
  ['faqContent', 'FAQ 内容', 10],
  ['reviewEvidence', '评价证据', 10],
  ['transactionCapability', '可交易能力', 10],
  ['freshness', '更新时效', 5],
  ['authorizationCompliance', '授权合规', 5],
] as const

const baselineScores = [13, 13, 10, 12, 6, 7, 8, 4, 5] as const
const improvedScores = [15, 15, 14, 14, 9, 8, 10, 4, 5] as const

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError(409, 'stale_entity_version', 'GEO 工作区已更新，请刷新后重试')
  }
}

function canReadCity(principal: Principal, cityId: string, tenantId: string): boolean {
  if (principal.tenantId !== tenantId) return false
  return principal.dataScope === 'PLATFORM' || principal.cityIds.includes(cityId)
}

function workspaceSummary(row: WorkspaceRow): GeoWorkspaceSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    status: row.status,
    score: row.score,
    previousScore: row.previous_score,
    scanVersion: row.current_scan_version,
    nextAction: row.next_action,
    complianceNotice: row.compliance_notice,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function projectSummary(row: ProjectRow): MiniAppProjectSummary {
  return {
    id: row.id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    deliveryType: row.delivery_type,
    status: 'LIVE',
    templateCode: row.template_code,
    currentDraftVersion: row.current_draft_version,
    currentReleaseVersion: row.current_release_version,
    nextAction: row.next_action,
    slaDueAt: row.sla_due_at,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function listWorkspaces(database: DatabaseSync, principal: Principal): WorkspaceRow[] {
  const rows = database.prepare(
    `SELECT id, tenant_id, city_id, project_id, lead_id, merchant_name, status,
            score, previous_score, current_scan_version, next_action,
            compliance_notice, version, updated_at
     FROM geo_workspaces WHERE tenant_id = ? ORDER BY updated_at DESC, id`,
  ).all(principal.tenantId) as unknown as WorkspaceRow[]
  return rows.filter((row) => canReadCity(principal, row.city_id, row.tenant_id))
}

function listEligibleProjects(database: DatabaseSync, principal: Principal, existingProjectIds: Set<string>): ProjectRow[] {
  const rows = database.prepare(
    `SELECT id, tenant_id, city_id, lead_id, merchant_name, delivery_type, status,
            template_code, current_draft_version, current_release_version, next_action,
            sla_due_at, version, updated_at
     FROM miniapp_factory_projects
     WHERE tenant_id = ? AND status = 'LIVE' ORDER BY updated_at DESC`,
  ).all(principal.tenantId) as unknown as ProjectRow[]
  return rows.filter((row) => canReadCity(principal, row.city_id, row.tenant_id) && !existingProjectIds.has(row.id))
}

function dimensionsFromScores(scores: readonly number[], previous: readonly number[] = scores): GeoDimensionScore[] {
  return dimensionBlueprint.map(([key, label, maxScore], index) => {
    const score = scores[index] ?? 0
    const ratio = score / maxScore
    return {
      key,
      label,
      score,
      maxScore,
      delta: score - (previous[index] ?? score),
      status: ratio >= 0.9 ? 'EXCELLENT' : ratio >= 0.72 ? 'GOOD' : 'ATTENTION',
    }
  })
}

function getWorkspace(database: DatabaseSync, principal: Principal, workspaceId: string): WorkspaceRow {
  const row = database.prepare(
    `SELECT id, tenant_id, city_id, project_id, lead_id, merchant_name, status,
            score, previous_score, current_scan_version, next_action,
            compliance_notice, version, updated_at
     FROM geo_workspaces WHERE id = ? AND tenant_id = ?`,
  ).get(workspaceId, principal.tenantId) as unknown as WorkspaceRow | undefined
  if (!row || !canReadCity(principal, row.city_id, row.tenant_id)) {
    throw new DomainError(404, 'geo_workspace_not_found', 'GEO 工作区不存在或不在当前城市范围')
  }
  return row
}

export function getGeoOverview(database: DatabaseSync, principal: Principal, focusWorkspaceId?: string): GeoOverview {
  const workspaces = listWorkspaces(database, principal)
  const focus = focusWorkspaceId ? workspaces.find((item) => item.id === focusWorkspaceId) : workspaces[0]
  if (focusWorkspaceId && !focus) {
    throw new DomainError(404, 'geo_workspace_not_found', 'GEO 工作区不存在或不在当前城市范围')
  }
  const existingProjectIds = new Set(workspaces.map((item) => item.project_id))
  const eligibleProjects = listEligibleProjects(database, principal, existingProjectIds)

  const identityRow = focus ? database.prepare(
    `SELECT brand_name, store_name, canonical_poi_id, aliases_json, address,
            latitude, longitude, match_status, source, confidence, version
     FROM geo_identities WHERE workspace_id = ?`,
  ).get(focus.id) as unknown as IdentityRow | undefined : undefined
  const factRows = focus ? database.prepare(
    `SELECT id, field_key, field_label, value_text, source_type, source_ref,
            confidence, verification_status, version
     FROM geo_facts WHERE workspace_id = ? ORDER BY confidence DESC, field_key`,
  ).all(focus.id) as unknown as FactRow[] : []
  const channelRows = focus ? database.prepare(
    `SELECT channel, field_key, field_label, canonical_value, observed_value, consistency_status
     FROM geo_channel_snapshots
     WHERE workspace_id = ? AND scan_version = (
       SELECT MAX(scan_version) FROM geo_channel_snapshots WHERE workspace_id = ?
     )
     ORDER BY field_key,
       CASE channel WHEN 'MERCHANT_PROFILE' THEN 1 WHEN 'MINIAPP' THEN 2 WHEN 'MAP_A' THEN 3 ELSE 4 END`,
  ).all(focus.id, focus.id) as unknown as ChannelRow[] : []
  const issueRows = focus ? database.prepare(
    `SELECT id, dimension_key, code, title, severity, channel, field_key,
            current_value, recommended_value, status
     FROM geo_issues WHERE workspace_id = ? AND scan_version = ?
     ORDER BY CASE severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, code`,
  ).all(focus.id, Math.max(1, focus.current_scan_version === 2 ? 1 : focus.current_scan_version)) as unknown as IssueRow[] : []
  const contentRow = focus ? database.prepare(
    `SELECT id, version, question_terms_json, scenario_terms_json, items_json, status,
            model_version, approved_by, approved_at, created_at
     FROM geo_content_plans WHERE workspace_id = ? ORDER BY version DESC LIMIT 1`,
  ).get(focus.id) as unknown as ContentPlanRow | undefined : undefined
  const observationRows = focus ? database.prepare(
    `SELECT observation_date, channel, mentions, visits, inquiries, orders, attribution_model
     FROM geo_observations WHERE workspace_id = ? ORDER BY observation_date DESC, channel`,
  ).all(focus.id) as unknown as ObservationRow[] : []
  const scoreRow = focus ? database.prepare(
    `SELECT dimensions_json FROM geo_score_snapshots
     WHERE workspace_id = ? ORDER BY scan_version DESC LIMIT 1`,
  ).get(focus.id) as unknown as ScoreRow | undefined : undefined
  const eventRows = focus ? database.prepare(
    `SELECT id, sequence, type, summary, created_at FROM geo_events
     WHERE workspace_id = ? ORDER BY sequence DESC LIMIT 40`,
  ).all(focus.id) as unknown as EventRow[] : []

  const comparisonMap = new Map<string, GeoChannelComparisonSummary>()
  for (const row of channelRows) {
    const comparison = comparisonMap.get(row.field_key) ?? {
      fieldKey: row.field_key,
      fieldLabel: row.field_label,
      canonicalValue: row.canonical_value,
      channels: [],
      consistencyRate: 0,
    }
    comparison.channels.push({ channel: row.channel, value: row.observed_value, status: row.consistency_status })
    comparisonMap.set(row.field_key, comparison)
  }
  for (const comparison of comparisonMap.values()) {
    comparison.consistencyRate = Math.round(
      comparison.channels.filter((item) => item.status === 'CONSISTENT').length / Math.max(1, comparison.channels.length) * 100,
    )
  }

  const dimensions = scoreRow
    ? JSON.parse(scoreRow.dimensions_json) as GeoDimensionScore[]
    : dimensionsFromScores(new Array(9).fill(0) as number[])
  const openIssueCount = workspaces.reduce((sum, workspace) => {
    const result = database.prepare(
      `SELECT COUNT(*) AS count FROM geo_issues WHERE workspace_id = ? AND status IN ('OPEN', 'FIX_PROPOSED', 'APPROVED')`,
    ).get(workspace.id) as unknown as { count: number }
    return sum + result.count
  }, 0)

  return {
    counts: {
      total: workspaces.length,
      scanning: workspaces.filter((item) => ['PENDING', 'SCANNING'].includes(item.status)).length,
      issues: openIssueCount,
      awaitingMerchant: workspaces.filter((item) => item.status === 'FIX_PROPOSED').length,
      monitoring: workspaces.filter((item) => item.status === 'MONITORING').length,
    },
    eligibleProjects: eligibleProjects.map(projectSummary),
    workspaces: workspaces.map(workspaceSummary),
    focusWorkspace: focus ? workspaceSummary(focus) : null,
    dimensions,
    identity: identityRow ? {
      brandName: identityRow.brand_name,
      storeName: identityRow.store_name,
      canonicalPoiId: identityRow.canonical_poi_id,
      aliases: JSON.parse(identityRow.aliases_json) as string[],
      address: identityRow.address,
      coordinates: { latitude: identityRow.latitude, longitude: identityRow.longitude },
      matchStatus: identityRow.match_status,
      source: identityRow.source,
      confidence: identityRow.confidence,
      version: identityRow.version,
    } : null,
    facts: factRows.map((row) => ({
      id: row.id, fieldKey: row.field_key, fieldLabel: row.field_label, value: row.value_text,
      sourceType: row.source_type, sourceRef: row.source_ref, confidence: row.confidence,
      verificationStatus: row.verification_status, version: row.version,
    })),
    channelComparisons: [...comparisonMap.values()],
    issues: issueRows.map((row) => ({
      id: row.id, dimensionKey: row.dimension_key, code: row.code, title: row.title,
      severity: row.severity, channel: row.channel, fieldKey: row.field_key,
      currentValue: row.current_value, recommendedValue: row.recommended_value, status: row.status,
    })),
    contentPlan: contentRow ? {
      id: contentRow.id, version: contentRow.version,
      questionTerms: JSON.parse(contentRow.question_terms_json) as string[],
      scenarioTerms: JSON.parse(contentRow.scenario_terms_json) as string[],
      items: JSON.parse(contentRow.items_json) as GeoContentPlanSummary['items'],
      status: contentRow.status, modelVersion: contentRow.model_version,
      approvedBy: contentRow.approved_by, approvedAt: contentRow.approved_at,
      createdAt: contentRow.created_at,
    } : null,
    observations: observationRows.map((row) => ({
      date: row.observation_date, channel: row.channel, mentions: row.mentions,
      visits: row.visits, inquiries: row.inquiries, orders: row.orders,
      attributionModel: row.attribution_model,
    } satisfies GeoObservationSummary)),
    cityBenchmark: { cityName: '上海', merchantPercentile: focus?.score ? 82 : 0, cityAverage: 81, industryAverage: 76 },
    events: eventRows.map((row) => ({
      id: row.id, sequence: row.sequence, type: row.type, summary: row.summary, createdAt: row.created_at,
    } satisfies GeoEventSummary)),
    updatedAt: focus?.updated_at ?? new Date(0).toISOString(),
  }
}

function recordGeoEvent(
  database: DatabaseSync,
  principal: Principal,
  workspaceId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  const riskLevel = typeof payload.riskLevel === 'string' ? payload.riskLevel : 'L1'
  database.prepare(
    `INSERT INTO geo_events
     (id, tenant_id, workspace_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), principal.tenantId, workspaceId, principal.subject, type, summary, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'geo_workspace', ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, workspaceId, riskLevel, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, type, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, `geo.${type.toLowerCase()}.v1`, workspaceId, payloadJson, timestamp)
}

function idempotentGeoMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): GeoOverview {
  const requestHash = hash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== requestHash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1 WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as GeoOverview
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const workspaceId = operation()
    const overview = getGeoOverview(database, principal, workspaceId)
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

export function createGeoWorkspace(
  database: DatabaseSync,
  principal: Principal,
  input: { projectId: string; expectedProjectVersion: number },
  idempotencyKey: string,
): GeoOverview {
  return idempotentGeoMutation(database, principal, idempotencyKey, '/api/v1/geo/workspaces', input, () => {
    const project = database.prepare(
      `SELECT id, tenant_id, city_id, lead_id, merchant_name, delivery_type, status,
              template_code, current_draft_version, current_release_version, next_action,
              sla_due_at, version, updated_at
       FROM miniapp_factory_projects WHERE id = ? AND tenant_id = ?`,
    ).get(input.projectId, principal.tenantId) as unknown as ProjectRow | undefined
    if (!project || !canReadCity(principal, project.city_id, project.tenant_id)) {
      throw new DomainError(404, 'miniapp_project_not_found', 'MiniApp 项目不存在或不在当前城市范围')
    }
    assertVersion(project.version, input.expectedProjectVersion)
    if (project.status !== 'LIVE' || project.current_release_version === null) {
      throw new DomainError(409, 'miniapp_not_live', '只有正式上线且已保存发布版本的 MiniApp 才能进入 GEO 扫描')
    }
    const lead = database.prepare(
      `SELECT address, category FROM leads WHERE id = ? AND tenant_id = ?`,
    ).get(project.lead_id, principal.tenantId) as unknown as { address: string; category: string }
    const timestamp = now()
    const workspaceId = randomUUID()
    database.prepare(
      `INSERT INTO geo_workspaces
       (id, tenant_id, city_id, project_id, lead_id, merchant_name, status, next_action,
        compliance_notice, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', '运行首次九维健康扫描', ?, ?, ?)`,
    ).run(
      workspaceId, principal.tenantId, project.city_id, project.id, project.lead_id,
      project.merchant_name, COMPLIANCE_NOTICE, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO geo_identities
       (id, tenant_id, workspace_id, brand_name, store_name, canonical_poi_id,
        aliases_json, address, latitude, longitude, match_status, source, confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 31.230416, 121.473701, 'MATCHED', 'E1_VERIFIED_PROFILE', 0.97, ?)`,
    ).run(
      randomUUID(), principal.tenantId, workspaceId, project.merchant_name,
      `${project.merchant_name}·人民广场店`, `POI-SH-${project.lead_id.slice(-8).toUpperCase()}`,
      JSON.stringify([project.merchant_name.replace('餐厅', ''), `${project.merchant_name}上海店`]),
      lead.address, timestamp,
    )
    const facts = [
      ['category', '经营品类', lead.category, 'BUSINESS_LICENSE', 'confirmed-asset:license', 0.99, 'VERIFIED'],
      ['address', '门店地址', lead.address, 'BUSINESS_LICENSE', 'confirmed-asset:license', 0.98, 'VERIFIED'],
      ['business_hours', '营业时间', '11:00-22:00', 'MERCHANT_CONFIRMATION', 'contract-authorization', 0.96, 'VERIFIED'],
      ['reservation_phone', '预约电话', '021-5555-8899', 'MINIAPP_RELEASE', `miniapp:v${project.current_release_version}`, 0.92, 'VERIFIED'],
      ['signature_product', '招牌产品', '云禾里十味宴', 'MENU_OCR', 'confirmed-asset:menu', 0.88, 'INFERRED'],
    ] as const
    const insertFact = database.prepare(
      `INSERT INTO geo_facts
       (id, tenant_id, workspace_id, field_key, field_label, value_text, source_type,
        source_ref, confidence, verification_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const fact of facts) {
      insertFact.run(randomUUID(), principal.tenantId, workspaceId, ...fact, timestamp)
    }
    recordGeoEvent(database, principal, workspaceId, 'WORKSPACE_CREATED', 'GEO 工作区已关联上线 MiniApp、可信资料与门店 POI', {
      projectId: project.id, releaseVersion: project.current_release_version,
      factCount: facts.length, identityConfidence: 0.97, riskLevel: 'L0',
    }, timestamp)
    return workspaceId
  })
}

const channelInputs = [
  ['store_name', '门店名称', '云禾里餐厅·人民广场店', ['云禾里餐厅·人民广场店', '云禾里餐厅·人民广场店', '云禾里餐厅', '云禾里·人民广场店']],
  ['address', '门店地址', '上海市黄浦区西藏中路268号', ['上海市黄浦区西藏中路268号', '上海市黄浦区西藏中路268号', '上海市黄浦区西藏中路268号', '']],
  ['business_hours', '营业时间', '11:00-22:00', ['11:00-22:00', '11:00-22:00', '10:30-21:30', '11:00-22:00']],
  ['reservation_phone', '预约电话', '021-5555-8899', ['021-5555-8899', '021-5555-8899', '021-5555-8899', '']],
] as const
const channels = ['MERCHANT_PROFILE', 'MINIAPP', 'MAP_A', 'MAP_B'] as const

export function scanGeoWorkspace(
  database: DatabaseSync,
  principal: Principal,
  input: { workspaceId: string; expectedVersion: number },
  idempotencyKey: string,
): GeoOverview {
  const route = `/api/v1/geo/workspaces/${input.workspaceId}/scan`
  return idempotentGeoMutation(database, principal, idempotencyKey, route, input, () => {
    const workspace = getWorkspace(database, principal, input.workspaceId)
    assertVersion(workspace.version, input.expectedVersion)
    if (workspace.status !== 'PENDING') {
      throw new DomainError(409, 'geo_stage_invalid', '只有待扫描工作区可以运行首次健康扫描')
    }
    const timestamp = now()
    const scanVersion = workspace.current_scan_version + 1
    const dimensions = dimensionsFromScores(baselineScores)
    database.prepare(
      `INSERT INTO geo_score_snapshots
       (id, tenant_id, workspace_id, scan_version, total_score, dimensions_json, rule_version, created_at)
       VALUES (?, ?, ?, ?, 78, ?, 'geo-health-weights-v5.0', ?)`,
    ).run(randomUUID(), principal.tenantId, workspace.id, scanVersion, JSON.stringify(dimensions), timestamp)
    const insertChannel = database.prepare(
      `INSERT INTO geo_channel_snapshots
       (id, tenant_id, workspace_id, scan_version, channel, field_key, field_label,
        canonical_value, observed_value, consistency_status, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const [fieldKey, fieldLabel, canonicalValue, values] of channelInputs) {
      values.forEach((observedValue, index) => {
        const status = observedValue === '' ? 'MISSING' : observedValue === canonicalValue ? 'CONSISTENT' : 'DIFF'
        insertChannel.run(
          randomUUID(), principal.tenantId, workspace.id, scanVersion, channels[index] ?? 'MERCHANT_PROFILE',
          fieldKey, fieldLabel, canonicalValue, observedValue, status, timestamp,
        )
      })
    }
    const issues = [
      ['channelConsistency', 'STORE_NAME_ALIAS', '地图渠道门店名称与标准实体不一致', 'HIGH', 'MAP_A', 'store_name', '云禾里餐厅', '云禾里餐厅·人民广场店'],
      ['channelConsistency', 'MAP_B_ADDRESS_MISSING', '地图 B 缺少门店地址', 'HIGH', 'MAP_B', 'address', '未填写', '上海市黄浦区西藏中路268号'],
      ['channelConsistency', 'BUSINESS_HOURS_DIFF', '地图 A 营业时间与商家确认值不同', 'MEDIUM', 'MAP_A', 'business_hours', '10:30-21:30', '11:00-22:00'],
      ['faqContent', 'FAQ_COVERAGE_LOW', '高意图问题词缺少可引用回答', 'MEDIUM', 'MINIAPP', 'faq', '3 条', '补充至 8 条并绑定事实来源'],
    ] as const
    const insertIssue = database.prepare(
      `INSERT INTO geo_issues
       (id, tenant_id, workspace_id, scan_version, dimension_key, code, title,
        severity, channel, field_key, current_value, recommended_value, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    )
    for (const issue of issues) {
      insertIssue.run(randomUUID(), principal.tenantId, workspace.id, scanVersion, ...issue, timestamp, timestamp)
    }
    database.prepare(
      `UPDATE geo_workspaces SET status = 'ISSUE_FOUND', score = 78,
       current_scan_version = ?, next_action = '生成可解释修复方案与内容计划',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(scanVersion, timestamp, workspace.id)
    recordGeoEvent(database, principal, workspace.id, 'SCAN_COMPLETED', '九维健康扫描完成：78 分，发现 4 项可验证问题', {
      scanVersion, score: 78, issueCount: issues.length, ruleVersion: 'geo-health-weights-v5.0',
      rankingPromise: false, riskLevel: 'L0',
    }, timestamp)
    return workspace.id
  })
}

export function proposeGeoFixes(
  database: DatabaseSync,
  principal: Principal,
  input: { workspaceId: string; expectedVersion: number },
  idempotencyKey: string,
): GeoOverview {
  const route = `/api/v1/geo/workspaces/${input.workspaceId}/propose`
  return idempotentGeoMutation(database, principal, idempotencyKey, route, input, () => {
    const workspace = getWorkspace(database, principal, input.workspaceId)
    assertVersion(workspace.version, input.expectedVersion)
    if (workspace.status !== 'ISSUE_FOUND') {
      throw new DomainError(409, 'geo_stage_invalid', '只有完成扫描并发现问题后才能生成修复方案')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE geo_issues SET status = 'FIX_PROPOSED', updated_at = ?
       WHERE workspace_id = ? AND scan_version = ? AND status = 'OPEN'`,
    ).run(timestamp, workspace.id, workspace.current_scan_version)
    const items = [
      { title: '第一次来云禾里，适合点什么？', format: 'FAQ + 招牌菜证据卡', channel: 'MiniApp / AI 搜索', evidenceFactKeys: ['signature_product', 'category'] },
      { title: '人民广场两人纪念日晚餐方案', format: '场景指南', channel: '内容分发', evidenceFactKeys: ['address', 'business_hours'] },
      { title: '到店前如何预约与确认营业时间', format: '交易型问答', channel: 'MiniApp / Skill', evidenceFactKeys: ['reservation_phone', 'business_hours'] },
    ]
    database.prepare(
      `INSERT INTO geo_content_plans
       (id, tenant_id, workspace_id, version, question_terms_json, scenario_terms_json,
        items_json, status, model_version, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, 'GENERATED', 'geo-content-planner-2026.07', ?)`,
    ).run(
      randomUUID(), principal.tenantId, workspace.id,
      JSON.stringify(['适合约会吗', '招牌菜是什么', '需要预约吗', '几点营业']),
      JSON.stringify(['人民广场约会', '两人晚餐', '家庭聚餐', '周末到店']),
      JSON.stringify(items), timestamp,
    )
    database.prepare(
      `UPDATE geo_workspaces SET status = 'FIX_PROPOSED',
       next_action = '邀请商家确认 4 项修复与 3 条内容计划',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, workspace.id)
    recordGeoEvent(database, principal, workspace.id, 'FIXES_PROPOSED', 'AI 已生成 4 项差异修复与 3 条有事实引用的内容计划', {
      issueCount: 4, contentCount: items.length, modelVersion: 'geo-content-planner-2026.07',
      evidenceRequired: true, rankingPromise: false, riskLevel: 'L1',
    }, timestamp)
    return workspace.id
  })
}

export function approveGeoPlan(
  database: DatabaseSync,
  principal: Principal,
  input: { workspaceId: string; expectedVersion: number; merchantApprover: string },
  idempotencyKey: string,
): GeoOverview {
  const route = `/api/v1/geo/workspaces/${input.workspaceId}/merchant-approve`
  return idempotentGeoMutation(database, principal, idempotencyKey, route, input, () => {
    const workspace = getWorkspace(database, principal, input.workspaceId)
    assertVersion(workspace.version, input.expectedVersion)
    if (workspace.status !== 'FIX_PROPOSED') {
      throw new DomainError(409, 'geo_stage_invalid', '只有已生成的修复方案可以提交商家确认')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE geo_issues SET status = 'APPROVED', updated_at = ?
       WHERE workspace_id = ? AND status = 'FIX_PROPOSED'`,
    ).run(timestamp, workspace.id)
    database.prepare(
      `UPDATE geo_content_plans SET status = 'APPROVED', approved_by = ?, approved_at = ?
       WHERE workspace_id = ? AND version = 1`,
    ).run(input.merchantApprover, timestamp, workspace.id)
    database.prepare(
      `UPDATE geo_workspaces SET status = 'MERCHANT_APPROVAL', next_action = '发布渠道修复与内容计划',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, workspace.id)
    recordGeoEvent(database, principal, workspace.id, 'MERCHANT_APPROVED', '商家已确认修复范围、事实引用与内容计划', {
      merchantApprover: input.merchantApprover, issueCount: 4, contentPlanVersion: 1, riskLevel: 'L2',
    }, timestamp)
    return workspace.id
  })
}

export function publishGeoPlan(
  database: DatabaseSync,
  principal: Principal,
  input: { workspaceId: string; expectedVersion: number },
  idempotencyKey: string,
): GeoOverview {
  const route = `/api/v1/geo/workspaces/${input.workspaceId}/publish`
  return idempotentGeoMutation(database, principal, idempotencyKey, route, input, () => {
    const workspace = getWorkspace(database, principal, input.workspaceId)
    assertVersion(workspace.version, input.expectedVersion)
    if (workspace.status !== 'MERCHANT_APPROVAL') {
      throw new DomainError(409, 'geo_stage_invalid', '必须先保存商家确认，才能发布 GEO 修复')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE geo_issues SET status = 'PUBLISHED', updated_at = ?
       WHERE workspace_id = ? AND status = 'APPROVED'`,
    ).run(timestamp, workspace.id)
    database.prepare(
      `UPDATE geo_content_plans SET status = 'PUBLISHED'
       WHERE workspace_id = ? AND status = 'APPROVED'`,
    ).run(workspace.id)
    database.prepare(
      `UPDATE geo_workspaces SET status = 'PUBLISHED', next_action = '启动可见性与转化观测',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, workspace.id)
    recordGeoEvent(database, principal, workspace.id, 'FIXES_PUBLISHED', '渠道修复与内容计划已发布，原始扫描快照保持不可变', {
      publishedIssueCount: 4, contentPlanVersion: 1, immutableScanVersion: workspace.current_scan_version,
      riskLevel: 'L2',
    }, timestamp)
    return workspace.id
  })
}

export function startGeoMonitoring(
  database: DatabaseSync,
  principal: Principal,
  input: { workspaceId: string; expectedVersion: number },
  idempotencyKey: string,
): GeoOverview {
  const route = `/api/v1/geo/workspaces/${input.workspaceId}/monitor`
  return idempotentGeoMutation(database, principal, idempotencyKey, route, input, () => {
    const workspace = getWorkspace(database, principal, input.workspaceId)
    assertVersion(workspace.version, input.expectedVersion)
    if (workspace.status !== 'PUBLISHED') {
      throw new DomainError(409, 'geo_stage_invalid', '只有已发布修复的工作区可以启动观测')
    }
    const timestamp = now()
    const date = timestamp.slice(0, 10)
    const observations = [
      ['AI_SEARCH', 186, 92, 21, 8],
      ['MINIAPP', 0, 328, 46, 19],
      ['MAP_CHANNELS', 74, 141, 18, 6],
    ] as const
    const insertObservation = database.prepare(
      `INSERT INTO geo_observations
       (id, tenant_id, workspace_id, observation_date, channel, mentions, visits,
        inquiries, orders, attribution_model, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'last-touch-v1', 'DEMO_CONNECTOR_AGGREGATE', ?)`,
    )
    for (const observation of observations) {
      insertObservation.run(randomUUID(), principal.tenantId, workspace.id, date, ...observation, timestamp)
    }
    const scanVersion = workspace.current_scan_version + 1
    const dimensions = dimensionsFromScores(improvedScores, baselineScores)
    database.prepare(
      `INSERT INTO geo_score_snapshots
       (id, tenant_id, workspace_id, scan_version, total_score, dimensions_json, rule_version, created_at)
       VALUES (?, ?, ?, ?, 94, ?, 'geo-health-weights-v5.0', ?)`,
    ).run(randomUUID(), principal.tenantId, workspace.id, scanVersion, JSON.stringify(dimensions), timestamp)
    const insertRescanChannel = database.prepare(
      `INSERT INTO geo_channel_snapshots
       (id, tenant_id, workspace_id, scan_version, channel, field_key, field_label,
        canonical_value, observed_value, consistency_status, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const [fieldKey, fieldLabel, canonicalValue] of channelInputs) {
      channels.forEach((channel) => {
        const acceptedAlias = fieldKey === 'store_name' && channel === 'MAP_B'
        insertRescanChannel.run(
          randomUUID(), principal.tenantId, workspace.id, scanVersion, channel,
          fieldKey, fieldLabel, canonicalValue,
          acceptedAlias ? '云禾里·人民广场店' : canonicalValue,
          acceptedAlias ? 'DIFF' : 'CONSISTENT', timestamp,
        )
      })
    }
    database.prepare(
      `UPDATE geo_workspaces SET status = 'MONITORING', previous_score = score, score = 94,
       current_scan_version = ?, next_action = '持续观测提及、访问、咨询与订单归因',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(scanVersion, timestamp, workspace.id)
    recordGeoEvent(database, principal, workspace.id, 'MONITORING_STARTED', '修复复扫提升至 94 分，已建立提及到订单的可观测漏斗', {
      previousScore: 78, score: 94, scoreDelta: 16, channels: observations.length,
      attributionModel: 'last-touch-v1', causalClaim: false, riskLevel: 'L1',
    }, timestamp)
    return workspace.id
  })
}
