import type {
  ProblemDetails,
  SalesCrmOverview,
  SalesCrmTimingFilter,
  SalesTaskSummary,
  SalesWorkbenchOverview,
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

function mutation<T>(
  url: string,
  idempotencyKey: string,
  data: Record<string, unknown>,
): Promise<T> {
  return request<T>({
    url,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    data,
  })
}

export function fetchSalesWorkbench(): Promise<SalesWorkbenchOverview> {
  return request<SalesWorkbenchOverview>({
    url: `${API_BASE}/sales/workbench`,
    method: 'GET',
  })
}

export function fetchSalesCrm(query: {
  keyword?: string
  stage?: SalesCrmOverview['query']['stage']
  source?: string
  timing?: SalesCrmTimingFilter
} = {}): Promise<SalesCrmOverview> {
  const params: string[] = []
  if (query.keyword?.trim()) params.push(`keyword=${encodeURIComponent(query.keyword.trim())}`)
  if (query.stage) params.push(`stage=${encodeURIComponent(query.stage)}`)
  if (query.source) params.push(`source=${encodeURIComponent(query.source)}`)
  if (query.timing && query.timing !== 'ALL') {
    params.push(`timing=${encodeURIComponent(query.timing)}`)
  }
  const search = params.length ? `?${params.join('&')}` : ''
  return request<SalesCrmOverview>({
    url: `${API_BASE}/sales/crm${search}`,
    method: 'GET',
  })
}

export function completeSalesTask(
  task: SalesTaskSummary,
  completionNote: string,
): Promise<SalesWorkbenchOverview> {
  return mutation(
    `${API_BASE}/sales/tasks/${task.id}/complete`,
    `sales-task:complete:${task.id}:v${task.version}`,
    { expectedVersion: task.version, completionNote },
  )
}

export function snoozeSalesTask(
  task: SalesTaskSummary,
  snoozeUntil: string,
  reason: string,
): Promise<SalesWorkbenchOverview> {
  return mutation(
    `${API_BASE}/sales/tasks/${task.id}/snooze`,
    `sales-task:snooze:${task.id}:v${task.version}:${Date.parse(snoozeUntil)}`,
    { expectedVersion: task.version, snoozeUntil, reason },
  )
}
