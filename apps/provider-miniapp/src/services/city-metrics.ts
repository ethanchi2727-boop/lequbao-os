import type {
  ProblemDetails,
  ProviderCityMetricPeriod,
  ProviderCityMetricsOverview,
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
        reject(new Error(problem.detail ?? '城市经营数据加载失败'))
      },
      fail: () => reject(new Error('暂时无法连接城市经营服务')),
    })
  })
}

export function fetchProviderCityMetrics(input: {
  period: ProviderCityMetricPeriod
  focusLeadId?: string | undefined
}): Promise<ProviderCityMetricsOverview> {
  const parameters = [`period=${encodeURIComponent(input.period)}`]
  if (input.focusLeadId) {
    parameters.push(`focusLeadId=${encodeURIComponent(input.focusLeadId)}`)
  }
  return request<ProviderCityMetricsOverview>({
    url: `${API_BASE}/provider/city-metrics?${parameters.join('&')}`,
    method: 'GET',
  })
}
