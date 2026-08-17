import type {
  ProblemDetails,
  ProviderSlaOverview,
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
        reject(new Error(problem.detail ?? 'SLA 操作失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接 SLA 自动升级服务')),
    })
  })
}

export function fetchProviderSla(
  focusIncidentId?: string | undefined,
): Promise<ProviderSlaOverview> {
  const query = focusIncidentId
    ? `?focusIncidentId=${encodeURIComponent(focusIncidentId)}`
    : ''
  return request<ProviderSlaOverview>({
    url: `${API_BASE}/provider/delivery-sla${query}`,
    method: 'GET',
  })
}

export function scanProviderSla(): Promise<ProviderSlaOverview> {
  return request<ProviderSlaOverview>({
    url: `${API_BASE}/provider/delivery-sla/scan`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `provider:sla:scan:${Date.now()}`,
    },
    data: {},
  })
}

export function acknowledgeProviderSla(input: {
  incidentId: string
  expectedVersion: number
  responsePlan: string
}): Promise<ProviderSlaOverview> {
  return request<ProviderSlaOverview>({
    url: `${API_BASE}/provider/delivery-sla/incidents/${input.incidentId}/acknowledge`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `provider:sla:ack:${input.incidentId}:v${input.expectedVersion}`,
    },
    data: {
      expectedVersion: input.expectedVersion,
      responsePlan: input.responsePlan,
      confirmed: true,
    },
  })
}

