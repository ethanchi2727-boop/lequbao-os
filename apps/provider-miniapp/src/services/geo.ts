import type { GeoOverview, GeoWorkspaceSummary, MiniAppProjectSummary, ProblemDetails } from '@lequ/contracts'

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
      fail: () => reject(new Error('暂时无法连接 GEO OS 服务')),
    })
  })
}

function mutate(url: string, key: string, data: Record<string, unknown>): Promise<GeoOverview> {
  return request<GeoOverview>({
    url,
    method: 'POST',
    data,
    header: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  })
}

export function fetchGeoOverview(focusWorkspaceId?: string): Promise<GeoOverview> {
  const query = focusWorkspaceId ? `?focusWorkspaceId=${encodeURIComponent(focusWorkspaceId)}` : ''
  return request<GeoOverview>({ url: `${API_BASE}/geo/overview${query}`, method: 'GET' })
}

export function createGeoProject(project: MiniAppProjectSummary): Promise<GeoOverview> {
  return mutate(`${API_BASE}/geo/workspaces`, `geo:create:${project.id}:v${project.version}`, {
    projectId: project.id,
    expectedProjectVersion: project.version,
  })
}

export function advanceGeoWorkspace(workspace: GeoWorkspaceSummary): Promise<GeoOverview> {
  const base = `${API_BASE}/geo/workspaces/${workspace.id}`
  const payload: Record<string, unknown> = { expectedVersion: workspace.version }
  let action: string
  switch (workspace.status) {
    case 'PENDING': action = 'scan'; break
    case 'ISSUE_FOUND': action = 'propose'; break
    case 'FIX_PROPOSED':
      action = 'merchant-approve'
      payload.merchantApprover = '商户主理人（现场确认）'
      break
    case 'MERCHANT_APPROVAL': action = 'publish'; break
    case 'PUBLISHED': action = 'monitor'; break
    default: return Promise.reject(new Error('当前阶段无需人工推进，系统正在持续观测'))
  }
  return mutate(`${base}/${action}`, `geo:${workspace.id}:${action}:v${workspace.version}`, payload)
}
