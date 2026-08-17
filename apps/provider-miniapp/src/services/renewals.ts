import type {
  ProblemDetails,
  ProviderRenewalLossReason,
  ProviderRenewalOverview,
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
        reject(new Error(problem.detail ?? '续费经营操作失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接续费经营服务')),
    })
  })
}

export function fetchProviderRenewals(focusCaseId?: string): Promise<ProviderRenewalOverview> {
  const query = focusCaseId ? `?focusCaseId=${encodeURIComponent(focusCaseId)}` : ''
  return request<ProviderRenewalOverview>({
    url: `${API_BASE}/provider/renewals${query}`,
    method: 'GET',
  })
}

export function scanProviderRenewals(): Promise<ProviderRenewalOverview> {
  return request<ProviderRenewalOverview>({
    url: `${API_BASE}/provider/renewals/scan`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `provider:renewals:scan:${Date.now()}`,
    },
    data: {},
  })
}

export function generateProviderRenewalProposal(input: {
  caseId: string
  expectedVersion: number
}): Promise<ProviderRenewalOverview> {
  return request<ProviderRenewalOverview>({
    url: `${API_BASE}/provider/renewals/${input.caseId}/proposals`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `provider:renewals:proposal:${input.caseId}:v${input.expectedVersion}`,
    },
    data: {
      expectedVersion: input.expectedVersion,
      confirmed: true,
    },
  })
}

export function closeProviderRenewal(input: {
  caseId: string
  expectedVersion: number
  outcome: 'RENEWED' | 'LOST'
  acceptedPackageCode?: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN' | undefined
  lossReason?: ProviderRenewalLossReason | undefined
  lossDetail?: string | undefined
  recoverable?: boolean | undefined
  recoveryAction?: string | undefined
}): Promise<ProviderRenewalOverview> {
  return request<ProviderRenewalOverview>({
    url: `${API_BASE}/provider/renewals/${input.caseId}/outcome`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `provider:renewals:${input.outcome.toLowerCase()}:${input.caseId}:v${input.expectedVersion}`,
    },
    data: {
      ...input,
      confirmed: true,
    },
  })
}
