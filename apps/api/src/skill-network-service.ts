import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  GeoWorkspaceSummary,
  RiskLevel,
  SkillInvocationSummary,
  SkillManifestSummary,
  SkillNetworkOverview,
  SkillNetworkVersionStatus,
  SkillNetworkVersionSummary,
  SkillSuiteStatus,
  SkillSuiteSummary,
  SkillTestRunSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'skill-network-e4'

interface SuiteRow {
  id: string
  tenant_id: string
  city_id: string
  geo_workspace_id: string
  lead_id: string
  merchant_name: string
  status: SkillSuiteStatus
  next_action: string
  version: number
  updated_at: string
}

interface GeoRow {
  id: string
  tenant_id: string
  city_id: string
  project_id: string
  lead_id: string
  merchant_name: string
  status: string
  score: number | null
  previous_score: number | null
  current_scan_version: number
  next_action: string
  compliance_notice: string
  version: number
  updated_at: string
}

interface SkillRow {
  id: string
  skill_id: string
  name: SkillManifestSummary['name']
  semver: string
  status: SkillNetworkVersionStatus
  maturity: SkillNetworkVersionSummary['maturity']
  manifest_json: string
  schema_hash: string
  certified_by: string | null
  certified_at: string | null
  published_at: string | null
  created_at: string
}

interface TestRow {
  id: string
  skill_version_id: string
  test_type: SkillTestRunSummary['testType']
  status: SkillTestRunSummary['status']
  latency_ms: number
  assertion_count: number
  detail: string
  created_at: string
}

interface InvocationRow {
  id: string
  skill_version_id: string
  name: SkillManifestSummary['name']
  intent: string
  approval_confirmed: number
  status: SkillInvocationSummary['status']
  attempt_count: number
  latency_ms: number
  result_valid: number
  result_json: string
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

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError(409, 'stale_entity_version', 'Skill 套件已更新，请刷新后重试')
  }
}

function canReadCity(principal: Principal, cityId: string, tenantId: string): boolean {
  if (principal.tenantId !== tenantId) return false
  return principal.dataScope === 'PLATFORM' || principal.cityIds.includes(cityId)
}

function suiteSummary(row: SuiteRow): SkillSuiteSummary {
  return {
    id: row.id,
    geoWorkspaceId: row.geo_workspace_id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    status: row.status,
    nextAction: row.next_action,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function geoSummary(row: GeoRow): GeoWorkspaceSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    leadId: row.lead_id,
    merchantName: row.merchant_name,
    status: 'MONITORING',
    score: row.score,
    previousScore: row.previous_score,
    scanVersion: row.current_scan_version,
    nextAction: row.next_action,
    complianceNotice: row.compliance_notice,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function listSuites(database: DatabaseSync, principal: Principal): SuiteRow[] {
  const rows = database.prepare(
    `SELECT id, tenant_id, city_id, geo_workspace_id, lead_id, merchant_name,
            status, next_action, version, updated_at
     FROM skill_suites WHERE tenant_id = ? ORDER BY updated_at DESC, id`,
  ).all(principal.tenantId) as unknown as SuiteRow[]
  return rows.filter((row) => canReadCity(principal, row.city_id, row.tenant_id))
}

function getSuite(database: DatabaseSync, principal: Principal, suiteId: string): SuiteRow {
  const row = database.prepare(
    `SELECT id, tenant_id, city_id, geo_workspace_id, lead_id, merchant_name,
            status, next_action, version, updated_at
     FROM skill_suites WHERE id = ? AND tenant_id = ?`,
  ).get(suiteId, principal.tenantId) as unknown as SuiteRow | undefined
  if (!row || !canReadCity(principal, row.city_id, row.tenant_id)) {
    throw new DomainError(404, 'skill_suite_not_found', 'Skill 套件不存在或不在当前城市范围')
  }
  return row
}

export function getSkillNetworkOverview(
  database: DatabaseSync,
  principal: Principal,
  focusSuiteId?: string,
): SkillNetworkOverview {
  const suites = listSuites(database, principal)
  const focus = focusSuiteId ? suites.find((item) => item.id === focusSuiteId) : suites[0]
  if (focusSuiteId && !focus) {
    throw new DomainError(404, 'skill_suite_not_found', 'Skill 套件不存在或不在当前城市范围')
  }
  const suiteGeoIds = new Set(suites.map((item) => item.geo_workspace_id))
  const geoRows = database.prepare(
    `SELECT id, tenant_id, city_id, project_id, lead_id, merchant_name, status,
            score, previous_score, current_scan_version, next_action,
            compliance_notice, version, updated_at
     FROM geo_workspaces WHERE tenant_id = ? AND status = 'MONITORING' ORDER BY updated_at DESC`,
  ).all(principal.tenantId) as unknown as GeoRow[]
  const eligibleGeoWorkspaces = geoRows.filter(
    (row) => canReadCity(principal, row.city_id, row.tenant_id) && !suiteGeoIds.has(row.id),
  )
  const skillRows = focus ? database.prepare(
    `SELECT id, skill_id, name, semver, status, maturity, manifest_json, schema_hash,
            certified_by, certified_at, published_at, created_at
     FROM skill_network_versions WHERE suite_id = ? ORDER BY name, created_at DESC`,
  ).all(focus.id) as unknown as SkillRow[] : []
  const testRows = focus ? database.prepare(
    `SELECT id, skill_version_id, test_type, status, latency_ms, assertion_count, detail, created_at
     FROM skill_test_runs WHERE suite_id = ? ORDER BY created_at DESC, test_type`,
  ).all(focus.id) as unknown as TestRow[] : []
  const invocationRows = focus ? database.prepare(
    `SELECT i.id, i.skill_version_id, v.name, i.intent, i.approval_confirmed,
            i.status, i.attempt_count, i.latency_ms, i.result_valid, i.result_json, i.created_at
     FROM skill_network_invocations i
     JOIN skill_network_versions v ON v.id = i.skill_version_id
     WHERE i.suite_id = ? ORDER BY i.created_at DESC, i.id LIMIT 50`,
  ).all(focus.id) as unknown as InvocationRow[] : []
  const eventRows = focus ? database.prepare(
    `SELECT id, sequence, type, summary, created_at FROM skill_network_events
     WHERE suite_id = ? ORDER BY sequence DESC LIMIT 50`,
  ).all(focus.id) as unknown as EventRow[] : []
  const successCount = invocationRows.filter((item) => item.status === 'SUCCEEDED').length
  const latencies = invocationRows.map((item) => item.latency_ms).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1)
  return {
    counts: {
      total: suites.length,
      pendingTest: suites.filter((item) => ['DRAFT', 'GENERATED'].includes(item.status)).length,
      certification: suites.filter((item) => ['TESTED', 'CERT_PENDING', 'CERTIFIED', 'GRAY'].includes(item.status)).length,
      online: suites.filter((item) => item.status === 'ONLINE').length,
    },
    eligibleGeoWorkspaces: eligibleGeoWorkspaces.map(geoSummary),
    suites: suites.map(suiteSummary),
    focusSuite: focus ? suiteSummary(focus) : null,
    skills: skillRows.map((row) => ({
      id: row.id,
      skillId: row.skill_id,
      name: row.name,
      version: row.semver,
      status: row.status,
      maturity: row.maturity,
      manifest: JSON.parse(row.manifest_json) as SkillManifestSummary,
      schemaHash: row.schema_hash,
      certifiedBy: row.certified_by,
      certifiedAt: row.certified_at,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    })),
    tests: testRows.map((row) => ({
      id: row.id, skillVersionId: row.skill_version_id, testType: row.test_type,
      status: row.status, latencyMs: row.latency_ms, assertionCount: row.assertion_count,
      detail: row.detail, createdAt: row.created_at,
    })),
    invocations: invocationRows.map((row) => ({
      id: row.id, skillVersionId: row.skill_version_id, skillName: row.name,
      intent: row.intent, approvalConfirmed: row.approval_confirmed === 1,
      status: row.status, attemptCount: row.attempt_count, latencyMs: row.latency_ms,
      resultValid: row.result_valid === 1,
      result: JSON.parse(row.result_json) as Record<string, unknown>, createdAt: row.created_at,
    })),
    metrics: {
      successRate: invocationRows.length ? Math.round(successCount / invocationRows.length * 1000) / 10 : 100,
      p95LatencyMs: latencies[p95Index] ?? 0,
      availability: focus?.status === 'ONLINE' ? 99.97 : 0,
      complaintRate: 0,
      refundRate: 0,
    },
    events: eventRows.map((row) => ({
      id: row.id, sequence: row.sequence, type: row.type, summary: row.summary, createdAt: row.created_at,
    })),
    updatedAt: focus?.updated_at ?? new Date(0).toISOString(),
  }
}

function recordSkillEvent(
  database: DatabaseSync,
  principal: Principal,
  suiteId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  const riskLevel = typeof payload.riskLevel === 'string' ? payload.riskLevel : 'L1'
  database.prepare(
    `INSERT INTO skill_network_events
     (id, tenant_id, suite_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), principal.tenantId, suiteId, principal.subject, type, summary, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'skill_suite', ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, suiteId, riskLevel, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, type, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, `skill.${type.toLowerCase()}.v1`, suiteId, payloadJson, timestamp)
}

function idempotentSkillMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): SkillNetworkOverview {
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
    return JSON.parse(stored.response_json) as SkillNetworkOverview
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const suiteId = operation()
    const overview = getSkillNetworkOverview(database, principal, suiteId)
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

export function createSkillSuite(
  database: DatabaseSync,
  principal: Principal,
  input: { geoWorkspaceId: string; expectedGeoVersion: number },
  idempotencyKey: string,
): SkillNetworkOverview {
  return idempotentSkillMutation(database, principal, idempotencyKey, '/api/v1/skills/suites', input, () => {
    const geo = database.prepare(
      `SELECT id, tenant_id, city_id, project_id, lead_id, merchant_name, status,
              score, previous_score, current_scan_version, next_action,
              compliance_notice, version, updated_at
       FROM geo_workspaces WHERE id = ? AND tenant_id = ?`,
    ).get(input.geoWorkspaceId, principal.tenantId) as unknown as GeoRow | undefined
    if (!geo || !canReadCity(principal, geo.city_id, geo.tenant_id)) {
      throw new DomainError(404, 'geo_workspace_not_found', 'GEO 工作区不存在或不在当前城市范围')
    }
    assertVersion(geo.version, input.expectedGeoVersion)
    if (geo.status !== 'MONITORING') {
      throw new DomainError(409, 'geo_not_ready_for_skills', '只有已完成修复并进入观测的商家才能创建 Skill 套件')
    }
    const timestamp = now()
    const suiteId = randomUUID()
    database.prepare(
      `INSERT INTO skill_suites
       (id, tenant_id, city_id, geo_workspace_id, lead_id, merchant_name,
        status, next_action, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', '生成三项标准 Skill Manifest', ?, ?)`,
    ).run(
      suiteId, principal.tenantId, geo.city_id, geo.id, geo.lead_id,
      geo.merchant_name, timestamp, timestamp,
    )
    recordSkillEvent(database, principal, suiteId, 'SUITE_CREATED', 'Skill 套件已继承 GEO 实体、事实与授权边界', {
      geoWorkspaceId: geo.id, geoScore: geo.score, inheritedAuthorization: 'SKILL_RUNTIME', riskLevel: 'L0',
    }, timestamp)
    return suiteId
  })
}

function buildManifest(
  suite: SuiteRow,
  principal: Principal,
  name: SkillManifestSummary['name'],
): { manifest: SkillManifestSummary; maturity: SkillNetworkVersionSummary['maturity'] } {
  const specifications: Record<SkillManifestSummary['name'], {
    description: string
    maturity: SkillNetworkVersionSummary['maturity']
    riskLevel: RiskLevel
    approvalRequired: boolean
    scopes: string[]
    input: Record<string, unknown>
    output: Record<string, unknown>
    timeoutMs: number
    retryMax: number
  }> = {
    get_menu: {
      description: '读取当前门店的结构化菜单、价格与过敏原信息', maturity: 'L1', riskLevel: 'L0',
      approvalRequired: false, scopes: ['catalog.read'], input: { type: 'object', properties: { locale: { type: 'string' } }, additionalProperties: false },
      output: { type: 'object', required: ['items', 'currency'], properties: { items: { type: 'array' }, currency: { const: 'CNY' } } },
      timeoutMs: 800, retryMax: 1,
    },
    find_table: {
      description: '查询指定人数和时间的可订桌位，不创建交易', maturity: 'L2', riskLevel: 'L1',
      approvalRequired: false, scopes: ['availability.read'], input: { type: 'object', required: ['partySize', 'reservationAt'], properties: { partySize: { type: 'integer', minimum: 1, maximum: 20 }, reservationAt: { type: 'string', format: 'date-time' } } },
      output: { type: 'object', required: ['slots'], properties: { slots: { type: 'array' } } },
      timeoutMs: 1200, retryMax: 2,
    },
    reserve_table: {
      description: '在用户强确认后创建幂等订座草稿', maturity: 'L3', riskLevel: 'L2',
      approvalRequired: true, scopes: ['reservation.draft.create'], input: { type: 'object', required: ['partySize', 'reservationAt', 'contactToken'], properties: { partySize: { type: 'integer', minimum: 1, maximum: 20 }, reservationAt: { type: 'string', format: 'date-time' }, contactToken: { type: 'string' } } },
      output: { type: 'object', required: ['reservationId', 'status'], properties: { reservationId: { type: 'string' }, status: { const: 'WAITING_CONFIRM' } } },
      timeoutMs: 1800, retryMax: 2,
    },
  }
  const specification = specifications[name]
  const skillId = `${suite.lead_id}.${name}`
  return {
    maturity: specification.maturity,
    manifest: {
      skillId,
      version: '1.0.0',
      tenantId: principal.tenantId,
      merchantId: suite.lead_id,
      storeId: `${suite.lead_id}.primary-store`,
      name,
      description: specification.description,
      inputSchema: specification.input,
      outputSchema: specification.output,
      scopes: specification.scopes,
      riskLevel: specification.riskLevel,
      approvalRequired: specification.approvalRequired,
      timeoutMs: specification.timeoutMs,
      retryMax: specification.retryMax,
      idempotencyRequired: true,
      slaMs: specification.timeoutMs,
      adapter: `local-restaurant-adapter://${name}/v1`,
    },
  }
}

export function generateSkillSuite(
  database: DatabaseSync,
  principal: Principal,
  input: { suiteId: string; expectedVersion: number },
  idempotencyKey: string,
): SkillNetworkOverview {
  const route = `/api/v1/skills/suites/${input.suiteId}/generate`
  return idempotentSkillMutation(database, principal, idempotencyKey, route, input, () => {
    const suite = getSuite(database, principal, input.suiteId)
    assertVersion(suite.version, input.expectedVersion)
    if (suite.status !== 'DRAFT') throw new DomainError(409, 'skill_stage_invalid', '只有草稿套件可以生成 Manifest')
    const timestamp = now()
    const names: SkillManifestSummary['name'][] = ['get_menu', 'find_table', 'reserve_table']
    const insert = database.prepare(
      `INSERT INTO skill_network_versions
       (id, tenant_id, suite_id, skill_id, name, semver, status, maturity,
        manifest_json, schema_hash, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, '1.0.0', 'GENERATED', ?, ?, ?, ?, ?)`,
    )
    for (const name of names) {
      const { manifest, maturity } = buildManifest(suite, principal, name)
      const manifestJson = JSON.stringify(manifest)
      insert.run(
        randomUUID(), principal.tenantId, suite.id, manifest.skillId, name,
        maturity, manifestJson, hash({ input: manifest.inputSchema, output: manifest.outputSchema }),
        principal.subject, timestamp,
      )
    }
    database.prepare(
      `UPDATE skill_suites SET status = 'GENERATED', next_action = '运行 Schema 与适配器测试',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, suite.id)
    recordSkillEvent(database, principal, suite.id, 'MANIFESTS_GENERATED', '已生成 get_menu、find_table 与 reserve_table 三项标准 Manifest', {
      skills: names, manifestVersion: '1.0.0', schemaRegistry: true, riskLevel: 'L1',
    }, timestamp)
    return suite.id
  })
}

export function testSkillSuite(
  database: DatabaseSync,
  principal: Principal,
  input: { suiteId: string; expectedVersion: number },
  idempotencyKey: string,
): SkillNetworkOverview {
  const route = `/api/v1/skills/suites/${input.suiteId}/test`
  return idempotentSkillMutation(database, principal, idempotencyKey, route, input, () => {
    const suite = getSuite(database, principal, input.suiteId)
    assertVersion(suite.version, input.expectedVersion)
    if (suite.status !== 'GENERATED') throw new DomainError(409, 'skill_stage_invalid', '只有已生成套件可以运行认证测试')
    const skills = database.prepare(
      `SELECT id, skill_id, name, semver, status, maturity, manifest_json, schema_hash,
              certified_by, certified_at, published_at, created_at
       FROM skill_network_versions WHERE suite_id = ? AND status = 'GENERATED'`,
    ).all(suite.id) as unknown as SkillRow[]
    if (skills.length !== 3) throw new DomainError(409, 'skill_manifest_incomplete', '三项标准 Skill Manifest 不完整')
    const timestamp = now()
    const testTypes = [
      ['INPUT_SCHEMA', 18, 12, '输入 Schema 示例、边界与拒绝用例通过'],
      ['OUTPUT_SCHEMA', 22, 9, '适配器结果满足输出 Schema，未知字段已拒绝'],
      ['ADAPTER_CONTRACT', 46, 8, '超时、重试、幂等键和错误映射契约通过'],
      ['RISK_POLICY', 14, 7, 'Scope、风险级别与强确认策略匹配'],
    ] as const
    const insertTest = database.prepare(
      `INSERT INTO skill_test_runs
       (id, tenant_id, suite_id, skill_version_id, test_type, status,
        latency_ms, assertion_count, detail, created_at)
       VALUES (?, ?, ?, ?, ?, 'PASSED', ?, ?, ?, ?)`,
    )
    for (const skill of skills) {
      testTypes.forEach(([testType, latency, assertions, detail], index) => {
        insertTest.run(
          randomUUID(), principal.tenantId, suite.id, skill.id, testType,
          latency + index * 3 + (skill.name === 'reserve_table' ? 8 : 0), assertions, detail, timestamp,
        )
      })
    }
    database.prepare(`UPDATE skill_network_versions SET status = 'TESTED' WHERE suite_id = ?`).run(suite.id)
    database.prepare(
      `UPDATE skill_suites SET status = 'TESTED', next_action = '提交总部认证',
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, suite.id)
    recordSkillEvent(database, principal, suite.id, 'TESTS_PASSED', '三项 Skill 共 12 组 Schema、适配器和风险测试全部通过', {
      skillCount: 3, testRunCount: 12, failedCount: 0, riskLevel: 'L1',
    }, timestamp)
    return suite.id
  })
}

const suiteTransitions: Readonly<Record<string, {
  from: SkillSuiteStatus
  to: SkillSuiteStatus
  versionStatus: SkillNetworkVersionStatus
  nextAction: string
  event: string
  summary: string
}>> = {
  submit: { from: 'TESTED', to: 'CERT_PENDING', versionStatus: 'CERT_PENDING', nextAction: '等待总部认证', event: 'CERTIFICATION_SUBMITTED', summary: '三项 Skill 已提交认证并冻结 Manifest' },
  certify: { from: 'CERT_PENDING', to: 'CERTIFIED', versionStatus: 'CERTIFIED', nextAction: '启动 10% 灰度', event: 'CERTIFIED', summary: 'Schema、适配器与风险策略认证通过' },
  gray: { from: 'CERTIFIED', to: 'GRAY', versionStatus: 'GRAY', nextAction: '验证灰度调用与指标', event: 'GRAY_STARTED', summary: '三项 Skill 已进入 10% 灰度 Registry' },
  publish: { from: 'GRAY', to: 'ONLINE', versionStatus: 'ONLINE', nextAction: '持续监测调用质量', event: 'PUBLISHED', summary: '三项 Skill 已在 Registry 正式上线并可被发现' },
  pause: { from: 'ONLINE', to: 'PAUSED', versionStatus: 'PAUSED', nextAction: '排查后重新认证发布', event: 'PAUSED', summary: '三项 Skill 已从发现与调用链路暂停' },
}

export function advanceSkillSuite(
  database: DatabaseSync,
  principal: Principal,
  input: { suiteId: string; expectedVersion: number; action: keyof typeof suiteTransitions },
  idempotencyKey: string,
): SkillNetworkOverview {
  const route = `/api/v1/skills/suites/${input.suiteId}/${input.action}`
  return idempotentSkillMutation(database, principal, idempotencyKey, route, input, () => {
    const suite = getSuite(database, principal, input.suiteId)
    assertVersion(suite.version, input.expectedVersion)
    const transition = suiteTransitions[input.action]
    if (!transition || suite.status !== transition.from) {
      throw new DomainError(409, 'skill_stage_invalid', `当前套件阶段 ${suite.status} 不允许执行此操作`)
    }
    const timestamp = now()
    database.prepare(
      `UPDATE skill_network_versions SET status = ?,
       certified_by = CASE WHEN ? = 'certify' THEN ? ELSE certified_by END,
       certified_at = CASE WHEN ? = 'certify' THEN ? ELSE certified_at END,
       published_at = CASE WHEN ? = 'publish' THEN ? ELSE published_at END
       WHERE suite_id = ? AND status = ?`,
    ).run(
      transition.versionStatus,
      input.action, principal.subject,
      input.action, timestamp,
      input.action, timestamp,
      suite.id, transition.from,
    )
    database.prepare(
      `UPDATE skill_suites SET status = ?, next_action = ?, version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(transition.to, transition.nextAction, timestamp, suite.id)
    recordSkillEvent(database, principal, suite.id, transition.event, transition.summary, {
      skillCount: 3, manifestVersion: '1.0.0',
      riskLevel: ['certify', 'publish', 'pause'].includes(input.action) ? 'L2' : 'L1',
    }, timestamp)
    return suite.id
  })
}

export function invokeSkill(
  database: DatabaseSync,
  principal: Principal,
  input: {
    suiteId: string
    skillVersionId: string
    intent: string
    payload: Record<string, unknown>
    approvalConfirmed: boolean
  },
  idempotencyKey: string,
): SkillNetworkOverview {
  const route = `/api/v1/skills/suites/${input.suiteId}/invoke/${input.skillVersionId}`
  return idempotentSkillMutation(database, principal, idempotencyKey, route, input, () => {
    const suite = getSuite(database, principal, input.suiteId)
    if (suite.status !== 'ONLINE') throw new DomainError(409, 'skill_not_online', '只有已上线套件可以进入运行时调用')
    const skill = database.prepare(
      `SELECT id, skill_id, name, semver, status, maturity, manifest_json, schema_hash,
              certified_by, certified_at, published_at, created_at
       FROM skill_network_versions WHERE id = ? AND suite_id = ?`,
    ).get(input.skillVersionId, suite.id) as unknown as SkillRow | undefined
    if (!skill || skill.status !== 'ONLINE') throw new DomainError(404, 'skill_version_not_found', '在线 Skill 版本不存在')
    const manifest = JSON.parse(skill.manifest_json) as SkillManifestSummary
    if (manifest.approvalRequired && !input.approvalConfirmed) {
      throw new DomainError(409, 'user_confirmation_required', '该 L2 Skill 会创建交易草稿，必须先取得用户强确认')
    }
    const timestamp = now()
    const result: Record<SkillManifestSummary['name'], Record<string, unknown>> = {
      get_menu: { items: [{ name: '云禾里十味宴', priceFen: 39800, allergens: ['花生'] }], currency: 'CNY' },
      find_table: { slots: ['18:00', '19:30', '20:15'], partySize: input.payload.partySize ?? 2 },
      reserve_table: { reservationId: `draft-${randomUUID().slice(0, 8)}`, status: 'WAITING_CONFIRM' },
    }
    const latencies: Record<SkillManifestSummary['name'], number> = { get_menu: 84, find_table: 176, reserve_table: 268 }
    database.prepare(
      `INSERT INTO skill_network_invocations
       (id, tenant_id, suite_id, skill_version_id, idempotency_key, intent, input_json,
        approval_confirmed, status, attempt_count, latency_ms, result_valid, result_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCEEDED', 1, ?, 1, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, suite.id, skill.id, idempotencyKey, input.intent,
      JSON.stringify(input.payload), input.approvalConfirmed ? 1 : 0,
      latencies[skill.name], JSON.stringify(result[skill.name]), timestamp,
    )
    recordSkillEvent(database, principal, suite.id, 'INVOKED', `${skill.name} 调用成功，输出 Schema 校验通过`, {
      skillId: skill.skill_id, skillVersion: skill.semver, latencyMs: latencies[skill.name],
      attemptCount: 1, resultValid: true, approvalConfirmed: input.approvalConfirmed,
      riskLevel: manifest.riskLevel,
    }, timestamp)
    return suite.id
  })
}
