import type {
  MiniAppFactoryOverview,
  MiniAppProjectSummary,
  MiniAppTemplateSummary,
  OnboardingLeadSummary,
  ProblemDetails,
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
      fail: () => reject(new Error('暂时无法连接 MiniApp Factory 服务')),
    })
  })
}

function mutate(
  url: string,
  key: string,
  data: Record<string, unknown>,
): Promise<MiniAppFactoryOverview> {
  return request<MiniAppFactoryOverview>({
    url, method: 'POST', data,
    header: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  })
}

export function fetchFactory(focusProjectId?: string): Promise<MiniAppFactoryOverview> {
  const query = focusProjectId ? `?focusProjectId=${encodeURIComponent(focusProjectId)}` : ''
  return request<MiniAppFactoryOverview>({
    url: `${API_BASE}/miniapp-factory/overview${query}`, method: 'GET',
  })
}

export function createProject(
  lead: OnboardingLeadSummary,
  template: MiniAppTemplateSummary,
): Promise<MiniAppFactoryOverview> {
  return mutate(`${API_BASE}/miniapp-factory/projects`, `factory:create:${lead.id}:v${lead.version}`, {
    leadId: lead.id,
    expectedLeadVersion: lead.version,
    deliveryType: 'STANDARD_MINIAPP',
    templateCode: template.code,
  })
}

export function advanceProject(
  project: MiniAppProjectSummary,
  templateCode: MiniAppTemplateSummary['code'],
): Promise<MiniAppFactoryOverview> {
  const base = `${API_BASE}/miniapp-factory/projects/${project.id}`
  switch (project.status) {
    case 'DRAFT':
      return mutate(`${base}/generate`, `factory:${project.id}:generate:v${project.version}`, {
        expectedVersion: project.version, templateCode,
      })
    case 'GENERATED':
      return mutate(`${base}/preview`, `factory:${project.id}:preview:v${project.version}`, {
        expectedVersion: project.version,
      })
    case 'PREVIEW':
      return mutate(`${base}/merchant-approve`, `factory:${project.id}:merchant:v${project.version}`, {
        expectedVersion: project.version, merchantApprover: '商户主理人（现场确认）',
      })
    case 'MERCHANT_APPROVAL':
      return mutate(`${base}/review`, `factory:${project.id}:review:v${project.version}`, {
        expectedVersion: project.version,
      })
    default:
      return Promise.reject(new Error('当前阶段需由总部发布权限继续推进'))
  }
}
