import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { hasPermission, type Principal } from '@lequ/auth'
import type {
  SalesCapabilitySummary,
  SalesCareerLevel,
  SalesCoachingPlanSummary,
  SalesLevelChangeSummary,
  SalesPerformanceActorSummary,
  SalesPerformanceRating,
  SalesTeamMemberSummary,
  SalesTeamOverview,
  SalesTeamUnitSummary,
  SystemRole,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'sales-team-e6'
const RANKING_POLICY_VERSION = 'sales-team-ranking-v1'
const SCORECARD_MODEL_VERSION = 'sales-scorecard-v1'
const CAREER_LEVELS: SalesCareerLevel[] = [
  'ASSOCIATE',
  'CONSULTANT',
  'SENIOR',
  'EXPERT',
  'TEAM_LEAD',
]

interface ActorRow {
  user_id: string
  display_name: string
  roles: string
}

interface UnitRow {
  id: string
  parent_id: string | null
  kind: 'CITY' | 'SQUAD'
  name: string
  leader_id: string | null
  sort_order: number
  updated_at: string
}

interface MemberRow {
  id: string
  city_id: string
  team_unit_id: string
  team_unit_name: string
  salesperson_id: string
  career_level: SalesCareerLevel
  employment_status: SalesTeamMemberSummary['employmentStatus']
  mentor_id: string | null
  joined_at: string
  version: number
  updated_at: string
}

interface ScorecardRow {
  salesperson_id: string
  result_score: number
  pipeline_score: number
  process_score: number
  quality_score: number
  compliance_score: number
  overall_score: number
  rating: SalesPerformanceRating
  capability_snapshot_json: string
  created_at: string
}

interface PerformanceRow {
  salesperson_id: string
  performance_fen: number
  target_fen: number
}

interface CoachingRow {
  id: string
  city_id: string
  member_id: string
  coach_id: string
  title: string
  focus_capability: SalesCoachingPlanSummary['focusCapability']
  goal: string
  actions_json: string
  success_metric: string
  due_at: string
  next_session_at: string | null
  status: SalesCoachingPlanSummary['status']
  version: number
  created_at: string
  updated_at: string
  latest_note: string | null
  evidence_json: string | null
}

interface LevelEventRow {
  sequence: number
  request_id: string
  member_id: string
  kind: 'REQUESTED' | 'APPROVED' | 'REJECTED'
  from_level: SalesCareerLevel
  to_level: SalesCareerLevel
  direction: 'PROMOTION' | 'DEMOTION'
  reason: string
  evidence_json: string
  metrics_snapshot_json: string
  actor_id: string
  occurred_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

export interface SalesTeamQuery {
  period?: string | undefined
  focusMemberId?: string | undefined
}

export interface RequestSalesLevelChangeInput {
  memberId: string
  toLevel: SalesCareerLevel
  expectedVersion: number
  reason: string
  evidence: string[]
  confirmed: boolean
}

export interface DecideSalesLevelChangeInput {
  requestId: string
  decision: 'APPROVE' | 'REJECT'
  expectedMemberVersion: number
  reason: string
  evidence: string[]
  confirmed: boolean
}

export interface CreateSalesCoachingPlanInput {
  memberId: string
  expectedMemberVersion: number
  title: string
  focusCapability: SalesCoachingPlanSummary['focusCapability']
  goal: string
  actions: string[]
  successMetric: string
  dueAt: string
  nextSessionAt?: string | undefined
}

export interface CheckInSalesCoachingPlanInput {
  planId: string
  expectedVersion: number
  note: string
  evidence: string[]
  nextSessionAt?: string | undefined
  complete: boolean
}

function now(): string {
  return new Date().toISOString()
}

function currentPeriod(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new DomainError(400, 'sales_team_period_invalid', '团队绩效周期必须使用 YYYY-MM 格式')
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function actorMap(
  database: DatabaseSync,
  tenantId: string,
): Map<string, SalesPerformanceActorSummary> {
  const rows = database.prepare(
    `SELECT users.id AS user_id, users.display_name,
            GROUP_CONCAT(role_assignments.role, ',') AS roles
     FROM users
     JOIN memberships
       ON memberships.user_id = users.id
      AND memberships.tenant_id = ?
      AND memberships.status = 'ACTIVE'
     JOIN role_assignments ON role_assignments.membership_id = memberships.id
     WHERE users.status = 'ACTIVE'
     GROUP BY users.id, users.display_name`,
  ).all(tenantId) as unknown as ActorRow[]
  return new Map(rows.map((row) => [
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
  if (!actor) throw new DomainError(409, 'sales_team_actor_missing', '团队成员关联人员已停用')
  return actor
}

function availableCityIds(principal: Principal): string[] | null {
  if (principal.dataScope === 'PLATFORM') return null
  if (principal.cityIds.length > 0) return [...principal.cityIds]
  return []
}

function cityClause(
  principal: Principal,
  alias: string,
): { clause: string; values: string[] } {
  const cityIds = availableCityIds(principal)
  if (cityIds === null) return { clause: '', values: [] }
  if (cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
  return {
    clause: ` AND ${alias}.city_id IN (${cityIds.map(() => '?').join(', ')})`,
    values: cityIds,
  }
}

function readMemberRows(database: DatabaseSync, principal: Principal): MemberRow[] {
  const scope = cityClause(principal, 'member')
  return database.prepare(
    `SELECT member.id, member.city_id, member.team_unit_id,
            unit.name AS team_unit_name, member.salesperson_id,
            member.career_level, member.employment_status, member.mentor_id,
            member.joined_at, member.version, member.updated_at
     FROM sales_team_members member
     JOIN sales_team_units unit ON unit.id = member.team_unit_id
     WHERE member.tenant_id = ?${scope.clause}
     ORDER BY unit.sort_order, member.joined_at`,
  ).all(principal.tenantId, ...scope.values) as unknown as MemberRow[]
}

function visibleFocusMember(
  principal: Principal,
  members: MemberRow[],
  requestedMemberId?: string,
): MemberRow | null {
  const canViewTeam = hasPermission(principal, 'sales.team.manage')
    || hasPermission(principal, 'sales.team.level.approve')
    || principal.dataScope === 'PLATFORM'
    || principal.dataScope === 'CITY'
  if (requestedMemberId) {
    const requested = members.find((member) => member.id === requestedMemberId)
    if (!requested || (!canViewTeam && requested.salesperson_id !== principal.subject)) {
      throw new DomainError(404, 'sales_team_member_not_found', '团队成员不存在或不在当前数据范围内')
    }
    return requested
  }
  if (!canViewTeam) {
    return members.find((member) => member.salesperson_id === principal.subject) ?? null
  }
  return null
}

function scorecardRows(
  database: DatabaseSync,
  principal: Principal,
  period: string,
): ScorecardRow[] {
  const scope = cityClause(principal, 'scorecard')
  return database.prepare(
    `SELECT scorecard.salesperson_id, scorecard.result_score,
            scorecard.pipeline_score, scorecard.process_score,
            scorecard.quality_score, scorecard.compliance_score,
            scorecard.overall_score, scorecard.rating,
            scorecard.capability_snapshot_json, scorecard.created_at
     FROM sales_performance_scorecards scorecard
     WHERE scorecard.tenant_id = ? AND scorecard.period = ?${scope.clause}
       AND NOT EXISTS (
         SELECT 1 FROM sales_performance_scorecards newer
         WHERE newer.tenant_id = scorecard.tenant_id
           AND newer.salesperson_id = scorecard.salesperson_id
           AND newer.period = scorecard.period
           AND newer.version > scorecard.version
       )`,
  ).all(principal.tenantId, period, ...scope.values) as unknown as ScorecardRow[]
}

function performanceRows(
  database: DatabaseSync,
  principal: Principal,
  period: string,
): PerformanceRow[] {
  const scope = cityClause(principal, 'ledger')
  const targetScope = cityClause(principal, 'target')
  const ledgerRows = database.prepare(
    `SELECT ledger.salesperson_id,
            COALESCE(SUM(ledger.performance_delta_fen), 0) AS performance_fen
     FROM sales_commission_ledger ledger
     WHERE ledger.tenant_id = ? AND ledger.period = ?${scope.clause}
     GROUP BY ledger.salesperson_id`,
  ).all(principal.tenantId, period, ...scope.values) as unknown as Array<{
    salesperson_id: string
    performance_fen: number
  }>
  const targetRows = database.prepare(
    `SELECT target.salesperson_id,
            target.signing_target_fen + target.renewal_target_fen
              + target.transaction_target_fen AS target_fen
     FROM sales_target_revisions target
     WHERE target.tenant_id = ? AND target.period = ?${targetScope.clause}
       AND NOT EXISTS (
         SELECT 1 FROM sales_target_revisions newer
         WHERE newer.tenant_id = target.tenant_id
           AND newer.salesperson_id = target.salesperson_id
           AND newer.period = target.period
           AND newer.version > target.version
       )`,
  ).all(principal.tenantId, period, ...targetScope.values) as unknown as Array<{
    salesperson_id: string
    target_fen: number
  }>
  const targets = new Map(targetRows.map((row) => [row.salesperson_id, Number(row.target_fen)]))
  return ledgerRows.map((row) => ({
    salesperson_id: row.salesperson_id,
    performance_fen: Number(row.performance_fen),
    target_fen: targets.get(row.salesperson_id) ?? 0,
  }))
}

function coachingRows(database: DatabaseSync, principal: Principal): CoachingRow[] {
  const scope = cityClause(principal, 'plan')
  return database.prepare(
    `SELECT plan.id, plan.city_id, plan.member_id, plan.coach_id, plan.title,
            plan.focus_capability, plan.goal, plan.actions_json,
            plan.success_metric, plan.due_at, plan.next_session_at, plan.status,
            plan.version, plan.created_at, plan.updated_at,
            (
              SELECT event.note FROM sales_coaching_events event
              WHERE event.plan_id = plan.id ORDER BY event.sequence DESC LIMIT 1
            ) AS latest_note,
            (
              SELECT event.evidence_json FROM sales_coaching_events event
              WHERE event.plan_id = plan.id ORDER BY event.sequence DESC LIMIT 1
            ) AS evidence_json
     FROM sales_coaching_plans plan
     WHERE plan.tenant_id = ?${scope.clause}
     ORDER BY CASE plan.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
              plan.next_session_at, plan.updated_at DESC`,
  ).all(principal.tenantId, ...scope.values) as unknown as CoachingRow[]
}

function levelEventRows(database: DatabaseSync, principal: Principal): LevelEventRow[] {
  const scope = cityClause(principal, 'event')
  return database.prepare(
    `SELECT event.sequence, event.request_id, event.member_id, event.kind,
            event.from_level, event.to_level, event.direction, event.reason,
            event.evidence_json, event.metrics_snapshot_json, event.actor_id,
            event.occurred_at
     FROM sales_level_change_events event
     WHERE event.tenant_id = ?${scope.clause}
     ORDER BY event.sequence`,
  ).all(principal.tenantId, ...scope.values) as unknown as LevelEventRow[]
}

function coachingSummary(
  row: CoachingRow,
  actors: Map<string, SalesPerformanceActorSummary>,
): SalesCoachingPlanSummary {
  return {
    id: row.id,
    memberId: row.member_id,
    coach: requiredActor(actors, row.coach_id),
    title: row.title,
    focusCapability: row.focus_capability,
    goal: row.goal,
    actions: parseJson<string[]>(row.actions_json, []),
    successMetric: row.success_metric,
    dueAt: row.due_at,
    nextSessionAt: row.next_session_at,
    status: row.status,
    version: row.version,
    latestNote: row.latest_note,
    evidence: parseJson<string[]>(row.evidence_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function levelChangeSummaries(
  rows: LevelEventRow[],
  actors: Map<string, SalesPerformanceActorSummary>,
): SalesLevelChangeSummary[] {
  const groups = new Map<string, LevelEventRow[]>()
  for (const row of rows) {
    const group = groups.get(row.request_id) ?? []
    group.push(row)
    groups.set(row.request_id, group)
  }
  return [...groups.entries()].map(([requestId, events]) => {
    const requested = events.find((event) => event.kind === 'REQUESTED')
    if (!requested) throw new DomainError(500, 'level_request_corrupt', '职级申请缺少发起事件')
    const decision = [...events].reverse().find((event) => event.kind !== 'REQUESTED')
    const status: SalesLevelChangeSummary['status'] = decision?.kind === 'APPROVED'
      ? 'APPROVED'
      : decision?.kind === 'REJECTED' ? 'REJECTED' : 'PENDING'
    return {
      requestId,
      memberId: requested.member_id,
      fromLevel: requested.from_level,
      toLevel: requested.to_level,
      direction: requested.direction,
      status,
      reason: requested.reason,
      evidence: parseJson<string[]>(requested.evidence_json, []),
      metricsSnapshot: parseJson<Record<string, number | string | boolean>>(
        requested.metrics_snapshot_json,
        {},
      ),
      requestedBy: requiredActor(actors, requested.actor_id),
      requestedAt: requested.occurred_at,
      decidedBy: decision ? requiredActor(actors, decision.actor_id) : null,
      decisionReason: decision?.reason ?? null,
      decidedAt: decision?.occurred_at ?? null,
    }
  }).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
}

function nextLevel(level: SalesCareerLevel): SalesCareerLevel | null {
  return CAREER_LEVELS[CAREER_LEVELS.indexOf(level) + 1] ?? null
}

function rankingScore(overallScore: number, achievementRate: number): number {
  return overallScore * 0.7 + Math.min(120, achievementRate) * 0.3
}

export function getSalesTeamOverview(
  database: DatabaseSync,
  principal: Principal,
  query: SalesTeamQuery = {},
): SalesTeamOverview {
  const period = query.period ?? currentPeriod()
  assertPeriod(period)
  const actors = actorMap(database, principal.tenantId)
  const members = readMemberRows(database, principal)
  const focus = visibleFocusMember(principal, members, query.focusMemberId)
  const scorecards = new Map(scorecardRows(database, principal, period).map((row) => [
    row.salesperson_id,
    row,
  ]))
  const performances = new Map(performanceRows(database, principal, period).map((row) => [
    row.salesperson_id,
    row,
  ]))
  const coaching = coachingRows(database, principal)
  const levelChanges = levelChangeSummaries(levelEventRows(database, principal), actors)

  const ranked = members.map((member) => {
    const scorecard = scorecards.get(member.salesperson_id)
    const performance = performances.get(member.salesperson_id)
    const performanceFen = performance?.performance_fen ?? 0
    const targetFen = performance?.target_fen ?? 0
    const achievementRate = targetFen > 0
      ? Math.round((performanceFen / targetFen) * 1000) / 10
      : 0
    return {
      member,
      scorecard,
      performanceFen,
      targetFen,
      achievementRate,
      rankValue: rankingScore(scorecard?.overall_score ?? 0, achievementRate),
    }
  }).sort((left, right) =>
    right.rankValue - left.rankValue
    || (right.scorecard?.compliance_score ?? 0) - (left.scorecard?.compliance_score ?? 0)
    || right.performanceFen - left.performanceFen)

  const memberSummaries = ranked.map((item, index): SalesTeamMemberSummary => {
    const scorecard = item.scorecard
    const capabilities = parseJson<SalesCapabilitySummary[]>(
      scorecard?.capability_snapshot_json ?? null,
      [],
    )
    const planRows = coaching.filter((plan) =>
      plan.member_id === item.member.id && plan.status === 'ACTIVE')
    const candidateNextLevel = nextLevel(item.member.career_level)
    const eligible = Boolean(
      candidateNextLevel
      && (scorecard?.overall_score ?? 0) >= 85
      && (scorecard?.compliance_score ?? 0) >= 90
      && item.achievementRate >= 50
      && item.member.employment_status !== 'LEAVE',
    )
    return {
      id: item.member.id,
      salesperson: requiredActor(actors, item.member.salesperson_id),
      teamUnitId: item.member.team_unit_id,
      teamUnitName: item.member.team_unit_name,
      level: item.member.career_level,
      employmentStatus: item.member.employment_status,
      mentor: item.member.mentor_id ? requiredActor(actors, item.member.mentor_id) : null,
      joinedAt: item.member.joined_at,
      version: item.member.version,
      performance: {
        performanceFen: item.performanceFen,
        targetFen: item.targetFen,
        achievementRate: item.achievementRate,
        overallScore: scorecard?.overall_score ?? 0,
        rating: scorecard?.rating ?? 'ATTENTION',
        rank: index + 1,
        resultScore: scorecard?.result_score ?? 0,
        pipelineScore: scorecard?.pipeline_score ?? 0,
        processScore: scorecard?.process_score ?? 0,
        qualityScore: scorecard?.quality_score ?? 0,
        complianceScore: scorecard?.compliance_score ?? 0,
      },
      capabilities,
      career: {
        nextLevel: candidateNextLevel,
        eligible,
        recommendedAction: eligible
          ? 'PROMOTION'
          : planRows.length > 0 ? 'DEVELOPMENT' : 'MAINTAIN',
        evidence: [
          `综合绩效 ${scorecard?.overall_score ?? 0} 分`,
          `目标达成 ${item.achievementRate.toFixed(1)}%`,
          `合规质量 ${scorecard?.compliance_score ?? 0} 分`,
          `评分模型 ${SCORECARD_MODEL_VERSION}`,
        ],
      },
      activeCoachingPlanCount: planRows.length,
      nextCoachingAt: planRows
        .map((plan) => plan.next_session_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null,
    }
  })

  const canViewTeamDetail = hasPermission(principal, 'sales.team.manage')
    || hasPermission(principal, 'sales.team.level.approve')
    || principal.dataScope === 'PLATFORM'
    || principal.dataScope === 'CITY'
  const visibleMemberIds = canViewTeamDetail
    ? new Set(memberSummaries.map((member) => member.id))
    : new Set(memberSummaries
      .filter((member) => member.salesperson.userId === principal.subject)
      .map((member) => member.id))
  const visiblePlans = coaching
    .filter((plan) => visibleMemberIds.has(plan.member_id))
    .map((plan) => coachingSummary(plan, actors))
  const visibleLevelChanges = levelChanges.filter((change) => visibleMemberIds.has(change.memberId))
  const focusSummary = focus
    ? memberSummaries.find((member) => member.id === focus.id) ?? null
    : null

  const unitScope = cityClause(principal, 'unit')
  const unitRows = database.prepare(
    `SELECT unit.id, unit.parent_id, unit.kind, unit.name, unit.leader_id,
            unit.sort_order, unit.updated_at
     FROM sales_team_units unit
     WHERE unit.tenant_id = ? AND unit.status = 'ACTIVE'${unitScope.clause}
     ORDER BY unit.sort_order`,
  ).all(principal.tenantId, ...unitScope.values) as unknown as UnitRow[]
  const units: SalesTeamUnitSummary[] = unitRows.map((unit) => ({
    id: unit.id,
    parentId: unit.parent_id,
    kind: unit.kind,
    name: unit.name,
    leader: unit.leader_id ? requiredActor(actors, unit.leader_id) : null,
    activeMemberCount: members.filter((member) =>
      member.team_unit_id === unit.id && member.employment_status !== 'LEAVE').length,
    childUnitIds: unitRows.filter((candidate) => candidate.parent_id === unit.id)
      .map((candidate) => candidate.id),
  }))
  const cityId = focus?.city_id ?? members[0]?.city_id ?? principal.cityIds[0] ?? 'platform'
  const cityName = cityId === 'city-shanghai' ? '上海' : cityId
  const updatedCandidates = [
    ...members.map((member) => member.updated_at),
    ...[...scorecards.values()].map((scorecard) => scorecard.created_at),
    ...coaching.map((plan) => plan.updated_at),
    ...unitRows.map((unit) => unit.updated_at),
  ].sort()
  const metricMembers = canViewTeamDetail
    ? memberSummaries
    : focusSummary ? [focusSummary] : []
  const metricPlans = canViewTeamDetail
    ? coaching
    : coaching.filter((plan) => visibleMemberIds.has(plan.member_id))
  const metricLevelChanges = canViewTeamDetail
    ? levelChanges
    : visibleLevelChanges
  const metricPerformance = metricMembers.reduce(
    (sum, member) => sum + member.performance.performanceFen,
    0,
  )
  const metricTarget = metricMembers.reduce(
    (sum, member) => sum + member.performance.targetFen,
    0,
  )
  const metricScoreValues = metricMembers
    .map((member) => member.performance.overallScore)
    .filter((score) => score > 0)

  return {
    period,
    city: { id: cityId, name: cityName },
    viewer: requiredActor(actors, principal.subject),
    viewMode: canViewTeamDetail ? 'TEAM' : 'PERSONAL',
    focusMember: focusSummary,
    units,
    members: memberSummaries,
    levelChanges: visibleLevelChanges,
    coachingPlans: visiblePlans,
    metrics: {
      activeMembers: metricMembers.filter((member) =>
        member.employmentStatus !== 'LEAVE').length,
      averageScore: metricScoreValues.length
        ? Math.round((
          metricScoreValues.reduce((sum, score) => sum + score, 0)
          / metricScoreValues.length
        ) * 10) / 10
        : 0,
      targetAchievementRate: metricTarget > 0
        ? Math.round((metricPerformance / metricTarget) * 1000) / 10
        : 0,
      activeCoachingPlans: metricPlans.filter((plan) => plan.status === 'ACTIVE').length,
      pendingLevelChanges: metricLevelChanges.filter(
        (change) => change.status === 'PENDING',
      ).length,
    },
    rankingPolicy: {
      version: RANKING_POLICY_VERSION,
      formula: '综合绩效 70% + 目标达成 30%，目标达成上限按 120% 计入',
      tieBreaker: '同分时依次比较合规质量与确认业绩',
      complianceGuardrail: '合规低于 90 分不可进入晋升建议，排行不替代人才校准审批。',
    },
    permissions: {
      canViewTeamDetail,
      canManageCoaching: hasPermission(principal, 'sales.team.manage'),
      canRequestLevelChange: hasPermission(principal, 'sales.team.manage'),
      canApproveLevelChange: hasPermission(principal, 'sales.team.level.approve'),
    },
    updatedAt: updatedCandidates.at(-1) ?? now(),
  }
}

function memberInScope(
  database: DatabaseSync,
  principal: Principal,
  memberId: string,
): MemberRow {
  const member = readMemberRows(database, principal).find((candidate) => candidate.id === memberId)
  if (!member) throw new DomainError(404, 'sales_team_member_not_found', '团队成员不存在或不在当前数据范围内')
  return member
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
    `sales_team_${input.action.toLowerCase()}`, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales.team.${input.action.toLowerCase()}.v1`,
    input.entityId, payloadJson, timestamp,
  )
}

function idempotentMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => { period: string; focusMemberId?: string },
): SalesTeamOverview {
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
    return JSON.parse(stored.response_json) as SalesTeamOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const query = operation()
    const overview = getSalesTeamOverview(database, principal, query)
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

function latestScorecard(
  database: DatabaseSync,
  principal: Principal,
  salespersonId: string,
  period: string,
): ScorecardRow {
  const scorecard = scorecardRows(database, principal, period)
    .find((candidate) => candidate.salesperson_id === salespersonId)
  if (!scorecard) throw new DomainError(409, 'scorecard_missing', '当前周期尚未生成绩效卡')
  return scorecard
}

function pendingRequest(
  database: DatabaseSync,
  memberId: string,
): { request_id: string } | undefined {
  return database.prepare(
    `SELECT requested.request_id
     FROM sales_level_change_events requested
     WHERE requested.member_id = ? AND requested.kind = 'REQUESTED'
       AND NOT EXISTS (
         SELECT 1 FROM sales_level_change_events decision
         WHERE decision.request_id = requested.request_id
           AND decision.kind IN ('APPROVED', 'REJECTED')
       )
     ORDER BY requested.sequence DESC LIMIT 1`,
  ).get(memberId) as { request_id: string } | undefined
}

export function requestSalesLevelChange(
  database: DatabaseSync,
  principal: Principal,
  input: RequestSalesLevelChangeInput,
  idempotencyKey: string,
): SalesTeamOverview {
  const route = `/api/v1/sales/team/members/${input.memberId}/level-changes`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(409, 'strong_confirmation_required', '职级变更申请需要强确认')
    }
    const member = memberInScope(database, principal, input.memberId)
    if (member.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '成员信息已更新，请刷新后再提交')
    }
    const fromIndex = CAREER_LEVELS.indexOf(member.career_level)
    const toIndex = CAREER_LEVELS.indexOf(input.toLevel)
    if (Math.abs(toIndex - fromIndex) !== 1) {
      throw new DomainError(409, 'career_level_not_adjacent', '职级变更每次只能上调或下调一级')
    }
    if (pendingRequest(database, member.id)) {
      throw new DomainError(409, 'level_change_pending', '该成员已有待审批职级申请')
    }
    const period = currentPeriod()
    const scorecard = latestScorecard(
      database,
      principal,
      member.salesperson_id,
      period,
    )
    const performance = performanceRows(database, principal, period)
      .find((row) => row.salesperson_id === member.salesperson_id)
    const achievementRate = performance?.target_fen
      ? Math.round((performance.performance_fen / performance.target_fen) * 1000) / 10
      : 0
    const direction = toIndex > fromIndex ? 'PROMOTION' : 'DEMOTION'
    const timestamp = now()
    const requestId = `sales-level-${randomUUID()}`
    const eventId = `sales-level-event-${randomUUID()}`
    const snapshot = {
      period,
      overallScore: scorecard.overall_score,
      complianceScore: scorecard.compliance_score,
      achievementRate,
      memberVersion: member.version,
      scorecardModelVersion: SCORECARD_MODEL_VERSION,
    }
    database.prepare(
      `INSERT INTO sales_level_change_events
       (id, tenant_id, city_id, request_id, member_id, kind, from_level, to_level,
        direction, reason, evidence_json, metrics_snapshot_json, actor_id,
        occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      eventId, principal.tenantId, member.city_id, requestId, member.id,
      member.career_level, input.toLevel, direction, input.reason,
      JSON.stringify(input.evidence), JSON.stringify(snapshot),
      principal.subject, timestamp, timestamp,
    )
    recordEvent(database, principal, {
      action: 'LEVEL_CHANGE_REQUESTED',
      entityType: 'sales_level_change',
      entityId: requestId,
      riskLevel: 'L2',
      summary: `已发起${direction === 'PROMOTION' ? '晋升' : '降级'}申请，等待总部人才校准`,
      payload: {
        memberId: member.id,
        fromLevel: member.career_level,
        toLevel: input.toLevel,
        direction,
        reason: input.reason,
        metricsSnapshot: snapshot,
      },
    }, timestamp)
    return { period, focusMemberId: member.id }
  })
}

function requestedLevelChange(
  database: DatabaseSync,
  principal: Principal,
  requestId: string,
): LevelEventRow {
  const scope = cityClause(principal, 'event')
  const requested = database.prepare(
    `SELECT event.sequence, event.request_id, event.member_id, event.kind,
            event.from_level, event.to_level, event.direction, event.reason,
            event.evidence_json, event.metrics_snapshot_json, event.actor_id,
            event.occurred_at
     FROM sales_level_change_events event
     WHERE event.tenant_id = ? AND event.request_id = ?
       AND event.kind = 'REQUESTED'${scope.clause}
     ORDER BY event.sequence LIMIT 1`,
  ).get(
    principal.tenantId,
    requestId,
    ...scope.values,
  ) as unknown as LevelEventRow | undefined
  if (!requested) {
    throw new DomainError(404, 'level_change_not_found', '职级变更申请不存在或不在当前数据范围内')
  }
  const decided = database.prepare(
    `SELECT id FROM sales_level_change_events
     WHERE request_id = ? AND kind IN ('APPROVED', 'REJECTED') LIMIT 1`,
  ).get(requestId)
  if (decided) throw new DomainError(409, 'level_change_decided', '该职级申请已完成审批')
  return requested
}

export function decideSalesLevelChange(
  database: DatabaseSync,
  principal: Principal,
  input: DecideSalesLevelChangeInput,
  idempotencyKey: string,
): SalesTeamOverview {
  const route = `/api/v1/sales/team/level-changes/${input.requestId}/decision`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(409, 'strong_confirmation_required', '职级审批需要强确认')
    }
    const requested = requestedLevelChange(database, principal, input.requestId)
    const member = memberInScope(database, principal, requested.member_id)
    if (member.version !== input.expectedMemberVersion) {
      throw new DomainError(409, 'stale_entity_version', '成员职级已更新，请刷新后再审批')
    }
    if (member.career_level !== requested.from_level) {
      throw new DomainError(409, 'career_level_changed', '成员当前职级与申请发起时不一致')
    }
    const timestamp = now()
    if (input.decision === 'APPROVE') {
      database.prepare(
        `UPDATE sales_team_members
         SET career_level = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
      ).run(requested.to_level, timestamp, member.id, member.version)
    }
    const kind = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    database.prepare(
      `INSERT INTO sales_level_change_events
       (id, tenant_id, city_id, request_id, member_id, kind, from_level, to_level,
        direction, reason, evidence_json, metrics_snapshot_json, actor_id,
        occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `sales-level-event-${randomUUID()}`, principal.tenantId, member.city_id,
      requested.request_id, member.id, kind, requested.from_level,
      requested.to_level, requested.direction, input.reason,
      JSON.stringify(input.evidence), requested.metrics_snapshot_json,
      principal.subject, timestamp, timestamp,
    )
    recordEvent(database, principal, {
      action: `LEVEL_CHANGE_${kind}`,
      entityType: 'sales_level_change',
      entityId: requested.request_id,
      riskLevel: 'L2',
      summary: input.decision === 'APPROVE'
        ? '总部人才校准审批通过，成员职级已生效'
        : '总部人才校准未通过，成员职级保持不变',
      payload: {
        memberId: member.id,
        fromLevel: requested.from_level,
        toLevel: requested.to_level,
        decision: input.decision,
        reason: input.reason,
      },
    }, timestamp)
    return { period: currentPeriod(), focusMemberId: member.id }
  })
}

export function createSalesCoachingPlan(
  database: DatabaseSync,
  principal: Principal,
  input: CreateSalesCoachingPlanInput,
  idempotencyKey: string,
): SalesTeamOverview {
  const route = `/api/v1/sales/team/members/${input.memberId}/coaching-plans`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const member = memberInScope(database, principal, input.memberId)
    if (member.version !== input.expectedMemberVersion) {
      throw new DomainError(409, 'stale_entity_version', '成员信息已更新，请刷新后再创建培养计划')
    }
    const timestamp = now()
    const planId = `sales-coaching-${randomUUID()}`
    database.prepare(
      `INSERT INTO sales_coaching_plans
       (id, tenant_id, city_id, member_id, coach_id, title, focus_capability,
        goal, actions_json, success_metric, due_at, next_session_at, status,
        version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
    ).run(
      planId, principal.tenantId, member.city_id, member.id, principal.subject,
      input.title, input.focusCapability, input.goal, JSON.stringify(input.actions),
      input.successMetric, input.dueAt, input.nextSessionAt ?? null, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO sales_coaching_events
       (id, tenant_id, city_id, plan_id, kind, note, evidence_json,
        actor_id, occurred_at, created_at)
       VALUES (?, ?, ?, ?, 'CREATED', ?, ?, ?, ?, ?)`,
    ).run(
      `sales-coaching-event-${randomUUID()}`, principal.tenantId, member.city_id,
      planId, '基于绩效卡与能力雷达创建培养计划',
      JSON.stringify([`绩效周期 ${currentPeriod()}`, `评分模型 ${SCORECARD_MODEL_VERSION}`]),
      principal.subject, timestamp, timestamp,
    )
    recordEvent(database, principal, {
      action: 'COACHING_PLAN_CREATED',
      entityType: 'sales_coaching_plan',
      entityId: planId,
      riskLevel: 'L1',
      summary: '成员培养计划已创建并留痕',
      payload: {
        memberId: member.id,
        focusCapability: input.focusCapability,
        dueAt: input.dueAt,
        actionCount: input.actions.length,
      },
    }, timestamp)
    return { period: currentPeriod(), focusMemberId: member.id }
  })
}

export function checkInSalesCoachingPlan(
  database: DatabaseSync,
  principal: Principal,
  input: CheckInSalesCoachingPlanInput,
  idempotencyKey: string,
): SalesTeamOverview {
  const route = `/api/v1/sales/team/coaching-plans/${input.planId}/check-ins`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const scope = cityClause(principal, 'plan')
    const plan = database.prepare(
      `SELECT plan.id, plan.member_id, plan.city_id, plan.status, plan.version
       FROM sales_coaching_plans plan
       WHERE plan.id = ? AND plan.tenant_id = ?${scope.clause}`,
    ).get(
      input.planId,
      principal.tenantId,
      ...scope.values,
    ) as {
      id: string
      member_id: string
      city_id: string
      status: string
      version: number
    } | undefined
    if (!plan) throw new DomainError(404, 'coaching_plan_not_found', '培养计划不存在或不在当前数据范围内')
    if (plan.status !== 'ACTIVE') {
      throw new DomainError(409, 'coaching_plan_closed', '培养计划已结束，不能继续签到')
    }
    if (plan.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '培养计划已更新，请刷新后再提交')
    }
    const timestamp = now()
    const kind = input.complete ? 'COMPLETED' : 'CHECK_IN'
    database.prepare(
      `UPDATE sales_coaching_plans
       SET status = ?, next_session_at = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(
      input.complete ? 'COMPLETED' : 'ACTIVE',
      input.complete ? null : input.nextSessionAt ?? null,
      timestamp,
      plan.id,
      plan.version,
    )
    database.prepare(
      `INSERT INTO sales_coaching_events
       (id, tenant_id, city_id, plan_id, kind, note, evidence_json,
        actor_id, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `sales-coaching-event-${randomUUID()}`, principal.tenantId, plan.city_id,
      plan.id, kind, input.note, JSON.stringify(input.evidence),
      principal.subject, timestamp, timestamp,
    )
    recordEvent(database, principal, {
      action: input.complete ? 'COACHING_PLAN_COMPLETED' : 'COACHING_CHECKED_IN',
      entityType: 'sales_coaching_plan',
      entityId: plan.id,
      riskLevel: 'L1',
      summary: input.complete ? '培养计划已完成并归档' : '培养计划已记录阶段复盘',
      payload: {
        memberId: plan.member_id,
        complete: input.complete,
        nextSessionAt: input.nextSessionAt ?? null,
        evidenceCount: input.evidence.length,
      },
    }, timestamp)
    return { period: currentPeriod(), focusMemberId: plan.member_id }
  })
}
