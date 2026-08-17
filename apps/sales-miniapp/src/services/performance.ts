import type {
  ProblemDetails,
  SalesPerformanceOverview,
  SalesTargetSummary,
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

export function fetchSalesPerformance(query: {
  period?: string | undefined
  salespersonId?: string | undefined
} = {}): Promise<SalesPerformanceOverview> {
  const params: string[] = []
  if (query.period) params.push(`period=${encodeURIComponent(query.period)}`)
  if (query.salespersonId) {
    params.push(`salespersonId=${encodeURIComponent(query.salespersonId)}`)
  }
  return request<SalesPerformanceOverview>({
    url: `${API_BASE}/sales/performance${params.length ? `?${params.join('&')}` : ''}`,
    method: 'GET',
  })
}

export function reviseSalesTarget(
  overview: SalesPerformanceOverview,
  target: SalesTargetSummary | null,
  input: {
    salespersonId: string
    signingTargetFen: number
    renewalTargetFen: number
    transactionTargetFen: number
    reason: string
  },
): Promise<SalesPerformanceOverview> {
  return request<SalesPerformanceOverview>({
    url: `${API_BASE}/sales/performance/targets/${encodeURIComponent(input.salespersonId)}`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': [
        'sales-target',
        input.salespersonId,
        overview.period,
        `v${target?.version ?? 0}`,
        input.signingTargetFen,
        input.renewalTargetFen,
        input.transactionTargetFen,
      ].join(':'),
    },
    data: {
      period: overview.period,
      signingTargetFen: input.signingTargetFen,
      renewalTargetFen: input.renewalTargetFen,
      transactionTargetFen: input.transactionTargetFen,
      expectedVersion: target?.version ?? 0,
      reason: input.reason,
    },
  })
}
