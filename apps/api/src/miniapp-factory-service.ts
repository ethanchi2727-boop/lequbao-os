import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  MiniAppFactoryEventSummary,
  MiniAppFactoryOverview,
  MiniAppPageVersionSummary,
  MiniAppProjectStatus,
  MiniAppProjectSummary,
  MiniAppTemplateSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'
import { getOnboardingOverview } from './onboarding-service.js'

const RUN_ID = 'miniapp-factory-e2'

export const miniAppTemplates: readonly MiniAppTemplateSummary[] = [
  {
    code: 'DINING_AURORA', name: '餐饮·极光叙事', industry: '餐饮',
    description: '以招牌菜、预约和 Skill 为核心的沉浸式品牌首页', accent: '#6F5AF4',
    blocks: ['Hero', 'Store', 'Product', 'Deal', 'Reservation', 'FAQ', 'Review', 'Skill'],
  },
  {
    code: 'CAFE_EDITORIAL', name: '咖啡·编辑画报', industry: '咖啡茶饮',
    description: '留白与大图驱动的新品、空间和会员内容模板', accent: '#D45F72',
    blocks: ['Hero', 'Store', 'Product', 'Service', 'FAQ', 'Review', 'Skill'],
  },
  {
    code: 'RETAIL_GALLERY', name: '零售·精选画廊', industry: '本地零售',
    description: '适合商品陈列、到店自提和会员服务的高密度模板', accent: '#168F73',
    blocks: ['Hero', 'Store', 'Product', 'Deal', 'Service', 'FAQ', 'Skill'],
  },
] as const

interface ProjectRow {
  id: string
  tenant_id: string
  city_id: string
  lead_id: string
  merchant_name: string
  delivery_type: MiniAppProjectSummary['deliveryType']
  status: MiniAppProjectStatus
  template_code: MiniAppTemplateSummary['code']
  current_draft_version: number
  current_release_version: number | null
  next_action: string
  sla_due_at: string
  version: number
  updated_at: string
}

interface VersionRow {
  id: string
  version: number
  status: MiniAppPageVersionSummary['status']
  template_code: MiniAppTemplateSummary['code']
  schema_json: string
  content_json: string
  theme_json: string
  preview_path: string
  merchant_approved_by: string | null
  merchant_approved_at: string | null
  published_at: string | null
  created_at: string
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

function now(): string {
  return new Date().toISOString()
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError(409, 'stale_entity_version', '项目已被更新，请刷新后重试')
  }
}

function canReadProject(principal: Principal, project: ProjectRow): boolean {
  if (principal.tenantId !== project.tenant_id) return false
  if (principal.dataScope === 'PLATFORM') return true
  return principal.cityIds.includes(project.city_id)
}

function getProject(
  database: DatabaseSync,
  principal: Principal,
  projectId: string,
): ProjectRow {
  const row = database.prepare(
    `SELECT id, tenant_id, city_id, lead_id, merchant_name, delivery_type,
            status, template_code, current_draft_version, current_release_version,
            next_action, sla_due_at, version, updated_at
     FROM miniapp_factory_projects WHERE id = ? AND tenant_id = ?`,
  ).get(projectId, principal.tenantId) as unknown as ProjectRow | undefined
  if (!row || !canReadProject(principal, row)) {
    throw new DomainError(404, 'miniapp_project_not_found', 'MiniApp 项目不存在或不在当前城市范围')
  }
  return row
}

function projectSummary(row: ProjectRow): MiniAppProjectSummary {
  return {
    id: row.id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    deliveryType: row.delivery_type,
    status: row.status,
    templateCode: row.template_code,
    currentDraftVersion: row.current_draft_version,
    currentReleaseVersion: row.current_release_version,
    nextAction: row.next_action,
    slaDueAt: row.sla_due_at,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function versionSummary(row: VersionRow): MiniAppPageVersionSummary {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    templateCode: row.template_code,
    schema: JSON.parse(row.schema_json) as MiniAppPageVersionSummary['schema'],
    content: JSON.parse(row.content_json) as Record<string, unknown>,
    theme: JSON.parse(row.theme_json) as MiniAppPageVersionSummary['theme'],
    previewPath: row.preview_path,
    merchantApprovedBy: row.merchant_approved_by,
    merchantApprovedAt: row.merchant_approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }
}

function listProjects(database: DatabaseSync, principal: Principal): ProjectRow[] {
  const rows = database.prepare(
    `SELECT id, tenant_id, city_id, lead_id, merchant_name, delivery_type,
            status, template_code, current_draft_version, current_release_version,
            next_action, sla_due_at, version, updated_at
     FROM miniapp_factory_projects WHERE tenant_id = ? ORDER BY updated_at DESC, id`,
  ).all(principal.tenantId) as unknown as ProjectRow[]
  return rows.filter((row) => canReadProject(principal, row))
}

export function getMiniAppFactoryOverview(
  database: DatabaseSync,
  principal: Principal,
  focusProjectId?: string,
): MiniAppFactoryOverview {
  const projects = listProjects(database, principal)
  const focus = focusProjectId
    ? projects.find((project) => project.id === focusProjectId)
    : projects[0]
  if (focusProjectId && !focus) {
    throw new DomainError(404, 'miniapp_project_not_found', 'MiniApp 项目不存在或不在当前城市范围')
  }
  const versionRows = focus
    ? database.prepare(
        `SELECT id, version, status, template_code, schema_json, content_json,
                theme_json, preview_path, merchant_approved_by, merchant_approved_at,
                published_at, created_at
         FROM miniapp_factory_versions WHERE project_id = ? ORDER BY version DESC`,
      ).all(focus.id) as unknown as VersionRow[]
    : []
  const eventRows = focus
    ? database.prepare(
        `SELECT id, sequence, type, summary, created_at
         FROM miniapp_factory_events WHERE project_id = ? ORDER BY sequence DESC LIMIT 30`,
      ).all(focus.id) as unknown as EventRow[]
    : []
  const onboarding = getOnboardingOverview(database, principal)
  const projectLeadIds = new Set(projects.map((project) => project.lead_id))
  const eligibleLeads = onboarding.leads.filter(
    (lead) => lead.stage === 'READY_FOR_DELIVERY' && !projectLeadIds.has(lead.id),
  )
  const currentTime = Date.now()
  const activeVersion = focus
    ? versionRows.find((version) => version.version === (
        focus.status === 'LIVE' ? focus.current_release_version : focus.current_draft_version
      ))
    : undefined
  const updatedAt = projects.reduce(
    (latest, project) => project.updated_at > latest ? project.updated_at : latest,
    new Date(0).toISOString(),
  )
  return {
    counts: {
      total: projects.length,
      awaitingMerchant: projects.filter((project) => project.status === 'PREVIEW').length,
      inReview: projects.filter((project) => ['MERCHANT_APPROVAL', 'REVIEW', 'GRAY'].includes(project.status)).length,
      live: projects.filter((project) => project.status === 'LIVE').length,
      slaRisk: projects.filter((project) => project.status !== 'LIVE' && Date.parse(project.sla_due_at) < currentTime + 4 * 60 * 60 * 1000).length,
    },
    eligibleLeads,
    projects: projects.map(projectSummary),
    focusProject: focus ? projectSummary(focus) : null,
    currentVersion: activeVersion ? versionSummary(activeVersion) : null,
    versions: versionRows.map(versionSummary),
    templates: [...miniAppTemplates],
    events: eventRows.map((event) => ({
      id: event.id, sequence: event.sequence, type: event.type,
      summary: event.summary, createdAt: event.created_at,
    } satisfies MiniAppFactoryEventSummary)),
    updatedAt,
  }
}

function recordFactoryEvent(
  database: DatabaseSync,
  principal: Principal,
  projectId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  const riskLevel = typeof payload.riskLevel === 'string' ? payload.riskLevel : 'L1'
  database.prepare(
    `INSERT INTO miniapp_factory_events
     (id, tenant_id, project_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), principal.tenantId, projectId, principal.subject, type, summary, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'miniapp_project', ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, projectId, riskLevel, summary, payloadJson, timestamp,
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
  ).run(randomUUID(), RUN_ID, principal.tenantId, `miniapp.${type.toLowerCase()}.v1`, projectId, payloadJson, timestamp)
}

function idempotentFactoryMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): MiniAppFactoryOverview {
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
      `UPDATE idempotency_records SET replay_count = replay_count + 1 WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as MiniAppFactoryOverview
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const projectId = operation()
    const overview = getMiniAppFactoryOverview(database, principal, projectId)
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

export function createMiniAppProject(
  database: DatabaseSync,
  principal: Principal,
  input: {
    leadId: string
    expectedLeadVersion: number
    deliveryType: MiniAppProjectSummary['deliveryType']
    templateCode: MiniAppTemplateSummary['code']
  },
  idempotencyKey: string,
): MiniAppFactoryOverview {
  return idempotentFactoryMutation(database, principal, idempotencyKey, '/api/v1/miniapp-factory/projects', input, () => {
    const onboarding = getOnboardingOverview(database, principal, input.leadId)
    const lead = onboarding.focusLead
    if (!lead || lead.stage !== 'READY_FOR_DELIVERY') {
      throw new DomainError(409, 'lead_not_ready_for_factory', '商家资料尚未全部确认，不能创建 MiniApp 项目')
    }
    assertVersion(lead.version, input.expectedLeadVersion)
    if (!miniAppTemplates.some((template) => template.code === input.templateCode)) {
      throw new DomainError(400, 'template_not_found', '所选行业模板不存在')
    }
    const leadRow = database.prepare(
      'SELECT city_id FROM leads WHERE id = ? AND tenant_id = ?',
    ).get(lead.id, principal.tenantId) as unknown as { city_id: string }
    const timestamp = now()
    const projectId = randomUUID()
    database.prepare(
      `INSERT INTO miniapp_factory_projects
       (id, tenant_id, city_id, lead_id, merchant_name, delivery_type, status,
        template_code, next_action, sla_due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, '生成 AI 页面草稿', ?, ?, ?)`,
    ).run(
      projectId, principal.tenantId, leadRow.city_id, lead.id, lead.name,
      input.deliveryType, input.templateCode, hoursFromNow(24), timestamp, timestamp,
    )
    database.prepare(
      `UPDATE leads SET next_action = '城市服务商生成 MiniApp 预览',
       next_action_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(hoursFromNow(4), timestamp, lead.id)
    recordFactoryEvent(database, principal, projectId, 'PROJECT_CREATED', 'MiniApp 项目已创建并进入 24 小时交付 SLA', {
      leadId: lead.id, deliveryType: input.deliveryType, templateCode: input.templateCode,
      riskLevel: 'L0',
    }, timestamp)
    return projectId
  })
}

function buildPageVersion(
  project: ProjectRow,
  template: MiniAppTemplateSummary,
  version: number,
): Pick<MiniAppPageVersionSummary, 'schema' | 'content' | 'theme'> {
  return {
    schema: {
      page: 'home',
      blocks: template.blocks.map((type, index) => ({
        id: `${type.toLowerCase()}-${index + 1}`, type, enabled: true, order: index + 1,
      })),
    },
    content: {
      heroTitle: project.merchant_name,
      heroSubtitle: '把当季风味与真诚服务，带到每一次到店体验',
      cta: 'AI 帮我订座',
      faqCount: 8,
      generatedBy: 'miniapp-content-agent-2026.07',
    },
    theme: { primary: template.accent, accent: '#FF6B7A', radius: 24 },
  }
}

export function generateMiniAppDraft(
  database: DatabaseSync,
  principal: Principal,
  input: { projectId: string; expectedVersion: number; templateCode: MiniAppTemplateSummary['code'] },
  idempotencyKey: string,
): MiniAppFactoryOverview {
  const route = `/api/v1/miniapp-factory/projects/${input.projectId}/generate`
  return idempotentFactoryMutation(database, principal, idempotencyKey, route, input, () => {
    const project = getProject(database, principal, input.projectId)
    assertVersion(project.version, input.expectedVersion)
    if (project.status !== 'DRAFT') {
      throw new DomainError(409, 'factory_stage_invalid', '只有草稿项目可以生成页面')
    }
    const template = miniAppTemplates.find((item) => item.code === input.templateCode)
    if (!template) throw new DomainError(400, 'template_not_found', '所选行业模板不存在')
    const timestamp = now()
    const nextVersion = project.current_draft_version + 1
    const generated = buildPageVersion(project, template, nextVersion)
    database.prepare(
      `INSERT INTO miniapp_factory_versions
       (id, tenant_id, project_id, version, status, template_code, schema_json,
        content_json, theme_json, preview_path, created_by, created_at)
       VALUES (?, ?, ?, ?, 'GENERATED', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, project.id, nextVersion, template.code,
      JSON.stringify(generated.schema), JSON.stringify(generated.content),
      JSON.stringify(generated.theme), `/miniapp/${project.id}/preview/v${nextVersion}`,
      principal.subject, timestamp,
    )
    database.prepare(
      `UPDATE miniapp_factory_projects SET status = 'GENERATED', template_code = ?,
       current_draft_version = ?, next_action = '生成可分享预览', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(template.code, nextVersion, timestamp, project.id)
    recordFactoryEvent(database, principal, project.id, 'PAGE_GENERATED', `AI 已生成 v${nextVersion} 页面草稿与 ${template.blocks.length} 个白名单区块`, {
      version: nextVersion, templateCode: template.code, blockCount: template.blocks.length,
      modelVersion: 'miniapp-content-agent-2026.07', riskLevel: 'L1',
    }, timestamp)
    return project.id
  })
}

const transitions: Readonly<Record<string, {
  from: MiniAppProjectStatus
  to: MiniAppProjectStatus
  versionStatus: MiniAppPageVersionSummary['status']
  nextAction: string
  event: string
  summary: string
}>> = {
  preview: { from: 'GENERATED', to: 'PREVIEW', versionStatus: 'PREVIEW', nextAction: '邀请商家确认预览', event: 'PREVIEW_CREATED', summary: '可分享预览已生成' },
  merchantApprove: { from: 'PREVIEW', to: 'MERCHANT_APPROVAL', versionStatus: 'APPROVED', nextAction: '提交平台审核', event: 'MERCHANT_APPROVED', summary: '商家已确认页面版本与内容快照' },
  review: { from: 'MERCHANT_APPROVAL', to: 'REVIEW', versionStatus: 'REVIEW', nextAction: '等待审核结果', event: 'REVIEW_SUBMITTED', summary: '版本已提交平台审核' },
  gray: { from: 'REVIEW', to: 'GRAY', versionStatus: 'GRAY', nextAction: '观察灰度指标并正式发布', event: 'GRAY_STARTED', summary: '版本已进入 10% 灰度发布' },
  publish: { from: 'GRAY', to: 'LIVE', versionStatus: 'LIVE', nextAction: '启动 GEO 扫描', event: 'RELEASE_PUBLISHED', summary: 'MiniApp 版本已正式发布' },
}

export function advanceMiniAppProject(
  database: DatabaseSync,
  principal: Principal,
  input: {
    projectId: string
    expectedVersion: number
    action: keyof typeof transitions
    merchantApprover?: string
  },
  idempotencyKey: string,
): MiniAppFactoryOverview {
  const route = `/api/v1/miniapp-factory/projects/${input.projectId}/${input.action}`
  return idempotentFactoryMutation(database, principal, idempotencyKey, route, input, () => {
    const project = getProject(database, principal, input.projectId)
    assertVersion(project.version, input.expectedVersion)
    const transition = transitions[input.action]
    if (!transition || project.status !== transition.from) {
      throw new DomainError(409, 'factory_stage_invalid', `当前项目阶段 ${project.status} 不允许执行此操作`)
    }
    if (input.action === 'merchantApprove' && (!input.merchantApprover || input.merchantApprover.trim().length < 2)) {
      throw new DomainError(400, 'merchant_approver_required', '必须记录商家确认人')
    }
    const timestamp = now()
    const version = database.prepare(
      `SELECT id FROM miniapp_factory_versions WHERE project_id = ? AND version = ?`,
    ).get(project.id, project.current_draft_version) as unknown as { id: string } | undefined
    if (!version) throw new DomainError(409, 'factory_version_missing', '项目缺少当前页面版本')
    database.prepare(
      `UPDATE miniapp_factory_versions SET status = ?,
       merchant_approved_by = CASE WHEN ? = 'merchantApprove' THEN ? ELSE merchant_approved_by END,
       merchant_approved_at = CASE WHEN ? = 'merchantApprove' THEN ? ELSE merchant_approved_at END,
       reviewed_at = CASE WHEN ? = 'review' THEN ? ELSE reviewed_at END,
       gray_at = CASE WHEN ? = 'gray' THEN ? ELSE gray_at END,
       published_at = CASE WHEN ? = 'publish' THEN ? ELSE published_at END
       WHERE id = ?`,
    ).run(
      transition.versionStatus,
      input.action, input.merchantApprover ?? null,
      input.action, timestamp,
      input.action, timestamp,
      input.action, timestamp,
      input.action, timestamp,
      version.id,
    )
    database.prepare(
      `UPDATE miniapp_factory_projects SET status = ?, next_action = ?,
       current_release_version = CASE WHEN ? = 'publish' THEN current_draft_version ELSE current_release_version END,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(transition.to, transition.nextAction, input.action, timestamp, project.id)
    recordFactoryEvent(database, principal, project.id, transition.event, transition.summary, {
      version: project.current_draft_version,
      merchantApprover: input.merchantApprover ?? null,
      riskLevel: ['merchantApprove', 'publish'].includes(input.action) ? 'L2' : 'L1',
    }, timestamp)
    return project.id
  })
}

export function reviseMiniAppProject(
  database: DatabaseSync,
  principal: Principal,
  input: { projectId: string; expectedVersion: number },
  idempotencyKey: string,
): MiniAppFactoryOverview {
  const route = `/api/v1/miniapp-factory/projects/${input.projectId}/revise`
  return idempotentFactoryMutation(database, principal, idempotencyKey, route, input, () => {
    const project = getProject(database, principal, input.projectId)
    assertVersion(project.version, input.expectedVersion)
    if (project.status !== 'LIVE') throw new DomainError(409, 'factory_stage_invalid', '只有已上线项目可以创建新版本')
    const timestamp = now()
    database.prepare(
      `UPDATE miniapp_factory_projects SET status = 'DRAFT', next_action = '生成下一版本页面草稿',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, project.id)
    recordFactoryEvent(database, principal, project.id, 'REVISION_STARTED', '已从线上版本创建新的配置草稿', {
      basedOnVersion: project.current_release_version, riskLevel: 'L0',
    }, timestamp)
    return project.id
  })
}

export function rollbackMiniAppProject(
  database: DatabaseSync,
  principal: Principal,
  input: { projectId: string; expectedVersion: number; targetVersion: number; reason: string },
  idempotencyKey: string,
): MiniAppFactoryOverview {
  const route = `/api/v1/miniapp-factory/projects/${input.projectId}/rollback`
  return idempotentFactoryMutation(database, principal, idempotencyKey, route, input, () => {
    const project = getProject(database, principal, input.projectId)
    assertVersion(project.version, input.expectedVersion)
    if (project.status !== 'LIVE' || project.current_release_version === input.targetVersion) {
      throw new DomainError(409, 'rollback_target_invalid', '只能从当前线上版本回滚到其他已发布版本')
    }
    const target = database.prepare(
      `SELECT id FROM miniapp_factory_versions
       WHERE project_id = ? AND version = ? AND published_at IS NOT NULL`,
    ).get(project.id, input.targetVersion) as unknown as { id: string } | undefined
    if (!target) throw new DomainError(404, 'rollback_version_not_found', '目标版本不存在或从未发布')
    const timestamp = now()
    database.prepare(
      `UPDATE miniapp_factory_versions SET status = 'ROLLED_BACK'
       WHERE project_id = ? AND version = ?`,
    ).run(project.id, project.current_release_version)
    database.prepare(
      `UPDATE miniapp_factory_versions SET status = 'LIVE' WHERE id = ?`,
    ).run(target.id)
    database.prepare(
      `UPDATE miniapp_factory_projects SET current_release_version = ?,
       next_action = '回滚完成，监测核心指标', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(input.targetVersion, timestamp, project.id)
    recordFactoryEvent(database, principal, project.id, 'RELEASE_ROLLED_BACK', `已回滚到 v${input.targetVersion}，线上配置即时生效`, {
      fromVersion: project.current_release_version, targetVersion: input.targetVersion,
      reason: input.reason, rollbackTargetMinutes: 10, riskLevel: 'L2',
    }, timestamp)
    return project.id
  })
}
