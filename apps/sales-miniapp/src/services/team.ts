import type {
  ProblemDetails,
  SalesCapabilityKey,
  SalesCareerLevel,
  SalesCoachingPlanSummary,
  SalesLevelChangeSummary,
  SalesTeamMemberSummary,
  SalesTeamOverview,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-city-sales-2026'

interface UniRequestResult<T> {
  statusCode: number
  data: T
}

function request<T>(options: UniApp.RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      header: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        ...options.header,
      },
      success: (response) => {
        const result = response as unknown as UniRequestResult<T | ProblemDetails>
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T)
          return
        }
        const problem = result.data as ProblemDetails
        reject(new Error(problem.detail ?? '请求失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接服务，请确认 API 已启动')),
    })
  })
}

function mutation(
  url: string,
  idempotencyKey: string,
  data: Record<string, unknown>,
): Promise<SalesTeamOverview> {
  return request<SalesTeamOverview>({
    url,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    data,
  })
}

export function fetchSalesTeam(query: {
  period?: string | undefined
  focusMemberId?: string | undefined
} = {}): Promise<SalesTeamOverview> {
  const params: string[] = []
  if (query.period) params.push(`period=${encodeURIComponent(query.period)}`)
  if (query.focusMemberId) {
    params.push(`focusMemberId=${encodeURIComponent(query.focusMemberId)}`)
  }
  return request<SalesTeamOverview>({
    url: `${API_BASE}/sales/team${params.length ? `?${params.join('&')}` : ''}`,
    method: 'GET',
  })
}

export function requestLevelChange(
  member: SalesTeamMemberSummary,
  input: {
    toLevel: SalesCareerLevel
    reason: string
    evidence: string[]
  },
): Promise<SalesTeamOverview> {
  return mutation(
    `${API_BASE}/sales/team/members/${encodeURIComponent(member.id)}/level-changes`,
    `sales-team:level:${member.id}:v${member.version}:${input.toLevel}`,
    {
      toLevel: input.toLevel,
      expectedVersion: member.version,
      reason: input.reason,
      evidence: input.evidence,
      confirmed: true,
    },
  )
}

export function decideLevelChange(
  change: SalesLevelChangeSummary,
  member: SalesTeamMemberSummary,
  decision: 'APPROVE' | 'REJECT',
  reason: string,
): Promise<SalesTeamOverview> {
  return mutation(
    `${API_BASE}/sales/team/level-changes/${encodeURIComponent(change.requestId)}/decision`,
    `sales-team:level:${change.requestId}:${decision}:v${member.version}`,
    {
      decision,
      expectedMemberVersion: member.version,
      reason,
      evidence: ['销售宝人才校准操作留痕'],
      confirmed: true,
    },
  )
}

export function createCoachingPlan(
  member: SalesTeamMemberSummary,
  input: {
    title: string
    focusCapability: SalesCapabilityKey
    goal: string
    actions: string[]
    successMetric: string
    dueAt: string
    nextSessionAt?: string | undefined
  },
): Promise<SalesTeamOverview> {
  return mutation(
    `${API_BASE}/sales/team/members/${encodeURIComponent(member.id)}/coaching-plans`,
    `sales-team:coaching:${member.id}:v${member.version}:${Date.now()}`,
    {
      expectedMemberVersion: member.version,
      ...input,
    },
  )
}

export function checkInCoachingPlan(
  plan: SalesCoachingPlanSummary,
  input: {
    note: string
    evidence: string[]
    nextSessionAt?: string | undefined
    complete: boolean
  },
): Promise<SalesTeamOverview> {
  return mutation(
    `${API_BASE}/sales/team/coaching-plans/${encodeURIComponent(plan.id)}/check-ins`,
    `sales-team:coaching:${plan.id}:v${plan.version}:${input.complete ? 'complete' : 'checkin'}`,
    {
      expectedVersion: plan.version,
      ...input,
    },
  )
}
