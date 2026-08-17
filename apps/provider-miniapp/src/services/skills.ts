import type {
  GeoWorkspaceSummary,
  ProblemDetails,
  SkillNetworkOverview,
  SkillNetworkVersionSummary,
  SkillSuiteSummary,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-city-delivery-2026'

interface UniRequestResult<T> {
  statusCode: number
  data: T
}

function request<T>(options: UniApp.RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      header: { Authorization: `Bearer ${AUTH_TOKEN}`, ...options.header },
      success: (response) => {
        const result = response as unknown as UniRequestResult<T | ProblemDetails>
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T)
          return
        }
        const problem = result.data as ProblemDetails
        reject(new Error(problem.detail ?? '请求失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接 Skill Network 服务')),
    })
  })
}

function mutate(url: string, key: string, data: Record<string, unknown>): Promise<SkillNetworkOverview> {
  return request<SkillNetworkOverview>({
    url,
    method: 'POST',
    data,
    header: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  })
}

export function fetchSkillNetwork(focusSuiteId?: string): Promise<SkillNetworkOverview> {
  const query = focusSuiteId ? `?focusSuiteId=${encodeURIComponent(focusSuiteId)}` : ''
  return request<SkillNetworkOverview>({ url: `${API_BASE}/skills/overview${query}`, method: 'GET' })
}

export function createSkillProject(workspace: GeoWorkspaceSummary): Promise<SkillNetworkOverview> {
  return mutate(`${API_BASE}/skills/suites`, `skills:create:${workspace.id}:v${workspace.version}`, {
    geoWorkspaceId: workspace.id,
    expectedGeoVersion: workspace.version,
  })
}

export function advanceSkillProject(suite: SkillSuiteSummary): Promise<SkillNetworkOverview> {
  const base = `${API_BASE}/skills/suites/${suite.id}`
  let action: string
  switch (suite.status) {
    case 'DRAFT': action = 'generate'; break
    case 'GENERATED': action = 'test'; break
    case 'TESTED': action = 'submit'; break
    default: return Promise.reject(new Error('当前阶段需由总部认证与发布权限继续推进'))
  }
  return mutate(`${base}/${action}`, `skills:${suite.id}:${action}:v${suite.version}`, {
    expectedVersion: suite.version,
  })
}

export function invokeDemoSkill(
  suite: SkillSuiteSummary,
  skill: SkillNetworkVersionSummary,
): Promise<SkillNetworkOverview> {
  const reservation = skill.name === 'reserve_table'
  const payload = skill.name === 'get_menu'
    ? { locale: 'zh-CN' }
    : { partySize: 2, reservationAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), ...(reservation ? { contactToken: 'confirmed-contact-token' } : {}) }
  return mutate(
    `${API_BASE}/skills/suites/${suite.id}/invoke/${skill.id}`,
    `skills:${suite.id}:invoke:${skill.name}:${Date.now()}`,
    {
      intent: reservation ? '用户确认后创建明晚双人订座草稿' : `验证 ${skill.name} 在线能力`,
      payload,
      approvalConfirmed: reservation,
    },
  )
}
