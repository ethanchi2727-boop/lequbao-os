import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  salesPeer: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.salesPeer}`,
  cityManager: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.cityManager}`,
  hq: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`,
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
}

describe('E6 销售宝团队组织、晋降级、绩效、培养与排行', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    await app.close()
  })

  async function getTeam(
    token = authorization.sales,
    query = '',
  ) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/team${query}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('销售查看个人绩效卡、能力雷达、培养计划与可解释同城排行', async () => {
    const overview = await getTeam()
    expect(overview).toMatchObject({
      city: { id: 'city-shanghai', name: '上海' },
      viewMode: 'PERSONAL',
      focusMember: {
        id: 'sales-member-yifan',
        salesperson: { userId: 'user-demo-sales' },
        teamUnitName: '上海一队',
        level: 'SENIOR',
        performance: {
          performanceFen: 617600,
          targetFen: 830000,
          achievementRate: 74.4,
          overallScore: 91,
          rating: 'OUTSTANDING',
          rank: 1,
          complianceScore: 98,
        },
        career: {
          nextLevel: 'EXPERT',
          eligible: true,
          recommendedAction: 'PROMOTION',
        },
        activeCoachingPlanCount: 1,
      },
      metrics: {
        activeMembers: 1,
        averageScore: 91,
        targetAchievementRate: 74.4,
        activeCoachingPlans: 1,
        pendingLevelChanges: 0,
      },
      rankingPolicy: {
        version: 'sales-team-ranking-v1',
      },
      permissions: {
        canViewTeamDetail: false,
        canManageCoaching: false,
        canRequestLevelChange: false,
        canApproveLevelChange: false,
      },
    })
    expect(overview.members).toHaveLength(2)
    expect(overview.members.map((member: { performance: { rank: number } }) =>
      member.performance.rank)).toEqual([1, 2])
    expect(overview.focusMember.capabilities).toHaveLength(5)
    expect(overview.coachingPlans).toHaveLength(1)
    expect(new Set(overview.coachingPlans.map((plan: { memberId: string }) =>
      plan.memberId))).toEqual(new Set(['sales-member-yifan']))
    expect(new Set(overview.levelChanges.map((change: { memberId: string }) =>
      change.memberId))).toEqual(new Set(['sales-member-yifan']))
  })

  it('城市负责人查看组织树、团队排行并钻取成员培养与晋升状态', async () => {
    const overview = await getTeam(authorization.cityManager)
    expect(overview).toMatchObject({
      viewMode: 'TEAM',
      focusMember: null,
      permissions: {
        canViewTeamDetail: true,
        canManageCoaching: true,
        canRequestLevelChange: true,
        canApproveLevelChange: false,
      },
    })
    expect(overview.units).toEqual([
      expect.objectContaining({
        id: 'sales-team-shanghai',
        parentId: null,
        childUnitIds: ['sales-team-shanghai-one'],
      }),
      expect.objectContaining({
        id: 'sales-team-shanghai-one',
        parentId: 'sales-team-shanghai',
        activeMemberCount: 2,
      }),
    ])
    expect(overview.levelChanges[0]).toMatchObject({
      requestId: 'level-request-ningan-senior',
      memberId: 'sales-member-ningan',
      status: 'PENDING',
      fromLevel: 'CONSULTANT',
      toLevel: 'SENIOR',
    })

    const detail = await getTeam(
      authorization.cityManager,
      '?focusMemberId=sales-member-ningan',
    )
    expect(detail.focusMember).toMatchObject({
      id: 'sales-member-ningan',
      salesperson: { userId: 'user-demo-sales-peer' },
      career: { nextLevel: 'SENIOR', eligible: true },
    })
    expect(detail.coachingPlans.some((plan: { memberId: string }) =>
      plan.memberId === 'sales-member-ningan')).toBe(true)
  })

  it('城市负责人发起相邻职级变更，要求强确认且不能自行审批', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/sales/team/members/sales-member-yifan/level-changes',
      headers: {
        authorization: authorization.cityManager,
        'idempotency-key': 'sales-team:level:yifan:expert',
      },
      payload: {
        toLevel: 'EXPERT',
        expectedVersion: 1,
        reason: '连续周期高绩效且复杂商机能力达到专家顾问校准线',
        evidence: ['本月绩效卡 91 分', '合规质量 98 分', '培养计划阶段复盘'],
        confirmed: false,
      },
    }
    const unconfirmed = await app.inject(request)
    expect(unconfirmed.statusCode).toBe(409)
    expect(unconfirmed.json().title).toBe('strong_confirmation_required')

    const created = await app.inject({
      ...request,
      payload: { ...request.payload, confirmed: true },
    })
    expect(created.statusCode, created.body).toBe(200)
    expect(created.json().focusMember).toMatchObject({
      id: 'sales-member-yifan',
      level: 'SENIOR',
      version: 1,
    })
    const pending = created.json().levelChanges.find((change: { status: string }) =>
      change.status === 'PENDING')
    expect(pending).toMatchObject({
      fromLevel: 'SENIOR',
      toLevel: 'EXPERT',
      direction: 'PROMOTION',
      requestedBy: { userId: 'user-demo-city-manager' },
    })

    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/team/level-changes/${pending.requestId}/decision`,
      headers: {
        authorization: authorization.cityManager,
        'idempotency-key': 'sales-team:level:self-approve-denied',
      },
      payload: {
        decision: 'APPROVE',
        expectedMemberVersion: 1,
        reason: '城市负责人不得自提自批',
        evidence: ['权限隔离测试'],
        confirmed: true,
      },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('总部人才校准审批通过后职级生效，事件只追加且请求可幂等重放', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/sales/team/level-changes/level-request-ningan-senior/decision',
      headers: {
        authorization: authorization.hq,
        'idempotency-key': 'sales-team:level:ningan:approve',
      },
      payload: {
        decision: 'APPROVE',
        expectedMemberVersion: 1,
        reason: '总部人才校准确认能力、绩效与合规证据均达到高级顾问标准',
        evidence: ['人才校准会纪要 #TC-2607', '绩效卡复核完成'],
        confirmed: true,
      },
    }
    const approved = await app.inject(request)
    const replay = await app.inject(request)
    expect(approved.statusCode, approved.body).toBe(200)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.body).toBe(approved.body)
    expect(approved.json().focusMember).toMatchObject({
      id: 'sales-member-ningan',
      level: 'SENIOR',
      version: 2,
    })
    expect(approved.json().levelChanges.find(
      (change: { requestId: string }) =>
        change.requestId === 'level-request-ningan-senior',
    )).toMatchObject({
      status: 'APPROVED',
      decidedBy: { userId: 'user-demo-hq' },
    })
    expect(database.prepare(
      `SELECT kind FROM sales_level_change_events
       WHERE request_id = 'level-request-ningan-senior' ORDER BY sequence`,
    ).all()).toEqual([{ kind: 'REQUESTED' }, { kind: 'APPROVED' }])
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE run_id = 'sales-team-e6' AND action = 'LEVEL_CHANGE_APPROVED'`,
    ).get()).toEqual({ count: 1 })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE run_id = 'sales-team-e6'
         AND topic = 'sales.team.level_change_approved.v1'`,
    ).get()).toEqual({ count: 1 })
  })

  it('培养计划可创建、阶段签到和完成归档，过程证据完整保留', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/team/members/sales-member-yifan/coaching-plans',
      headers: {
        authorization: authorization.cityManager,
        'idempotency-key': 'sales-team:coaching:create',
      },
      payload: {
        expectedMemberVersion: 1,
        title: '专家级价值呈现训练',
        focusCapability: 'PROPOSAL',
        goal: '在复杂决策链中形成可复用的价值呈现结构',
        actions: ['复盘两份高质量提案', '完成一次经理陪访'],
        successMetric: '三次提案抽检平均质量分达到 92',
        dueAt: '2026-09-30T10:00:00.000Z',
        nextSessionAt: '2026-08-01T10:00:00.000Z',
      },
    })
    expect(created.statusCode, created.body).toBe(200)
    const plan = created.json().coachingPlans.find((candidate: { title: string }) =>
      candidate.title === '专家级价值呈现训练')
    expect(plan).toMatchObject({
      focusCapability: 'PROPOSAL',
      status: 'ACTIVE',
      version: 1,
      actions: ['复盘两份高质量提案', '完成一次经理陪访'],
    })

    const checkedIn = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/team/coaching-plans/${plan.id}/check-ins`,
      headers: {
        authorization: authorization.cityManager,
        'idempotency-key': 'sales-team:coaching:checkin',
      },
      payload: {
        expectedVersion: 1,
        note: '首轮提案复盘已完成，价值证据结构清晰度显著提升',
        evidence: ['复盘纪要 #COACH-TEST-1'],
        nextSessionAt: '2026-08-08T10:00:00.000Z',
        complete: false,
      },
    })
    expect(checkedIn.statusCode, checkedIn.body).toBe(200)
    expect(checkedIn.json().coachingPlans.find(
      (candidate: { id: string }) => candidate.id === plan.id,
    )).toMatchObject({
      status: 'ACTIVE',
      version: 2,
      latestNote: '首轮提案复盘已完成，价值证据结构清晰度显著提升',
    })

    const completed = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/team/coaching-plans/${plan.id}/check-ins`,
      headers: {
        authorization: authorization.cityManager,
        'idempotency-key': 'sales-team:coaching:complete',
      },
      payload: {
        expectedVersion: 2,
        note: '三次提案抽检均达到目标，培养计划完成归档',
        evidence: ['质量抽检 #QA-1', '质量抽检 #QA-2', '质量抽检 #QA-3'],
        complete: true,
      },
    })
    expect(completed.statusCode, completed.body).toBe(200)
    expect(completed.json().coachingPlans.find(
      (candidate: { id: string }) => candidate.id === plan.id,
    )).toMatchObject({ status: 'COMPLETED', version: 3 })
    expect(database.prepare(
      'SELECT kind FROM sales_coaching_events WHERE plan_id = ? ORDER BY sequence',
    ).all(plan.id)).toEqual([
      { kind: 'CREATED' },
      { kind: 'CHECK_IN' },
      { kind: 'COMPLETED' },
    ])
  })

  it('销售只能钻取自己且不能管理团队，交付角色没有团队权限', async () => {
    const peerDetail = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/team?focusMemberId=sales-member-ningan',
      headers: { authorization: authorization.sales },
    })
    expect(peerDetail.statusCode).toBe(404)

    const manageDenied = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/team/members/sales-member-yifan/coaching-plans',
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-team:sales-manage-denied',
      },
      payload: {
        expectedMemberVersion: 1,
        title: '销售不得自建培养计划',
        focusCapability: 'DISCOVERY',
        goal: '权限测试目标说明',
        actions: ['权限测试动作'],
        successMetric: '权限测试不会落库',
        dueAt: '2026-09-30T10:00:00.000Z',
      },
    })
    expect(manageDenied.statusCode).toBe(403)

    const provider = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/team',
      headers: { authorization: authorization.provider },
    })
    expect(provider.statusCode).toBe(403)
  })

  it('绩效卡、职级事件和培养事件由数据库禁止更新与删除', () => {
    expect(() => database.exec(
      "UPDATE sales_performance_scorecards SET overall_score = 1",
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      "DELETE FROM sales_level_change_events",
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      "UPDATE sales_coaching_events SET note = 'tampered'",
    )).toThrowError(/append-only/)
  })
})
