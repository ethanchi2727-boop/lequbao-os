import type {
  ContractSummary,
  OnboardingOverview,
  ProblemDetails,
  ProviderLocalGrowthOverview,
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
        reject(new Error(problem.detail ?? '请求失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接城市服务商工作台')),
    })
  })
}

function mutation<T>(
  url: string,
  key: string,
  data: Record<string, unknown>,
): Promise<T> {
  return request<T>({
    url,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    data,
  })
}

export function fetchProviderLocalGrowth(
  focusLeadId?: string,
): Promise<ProviderLocalGrowthOverview> {
  const query = focusLeadId ? `?focusLeadId=${encodeURIComponent(focusLeadId)}` : ''
  return request<ProviderLocalGrowthOverview>({
    url: `${API_BASE}/provider/local-growth${query}`,
    method: 'GET',
  })
}

export function assignLocalLead(input: {
  leadId: string
  expectedVersion: number
  targetOwnerId: string
  reason: string
}): Promise<ProviderLocalGrowthOverview> {
  return mutation(
    `${API_BASE}/provider/local-growth/leads/${input.leadId}/assign`,
    `provider:assign:${input.leadId}:v${input.expectedVersion}:${input.targetOwnerId}`,
    {
      expectedVersion: input.expectedVersion,
      targetOwnerId: input.targetOwnerId,
      reason: input.reason,
      confirmed: true,
    },
  )
}

export function diagnoseLocalLead(
  leadId: string,
  expectedVersion: number,
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${leadId}/diagnosis`,
    `provider:diagnosis:${leadId}:v${expectedVersion}`,
    { expectedVersion },
  )
}

export function createLocalContract(input: {
  leadId: string
  expectedVersion: number
  packageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'
  discountBps: number
}): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${input.leadId}/contracts`,
    `provider:contract:${input.leadId}:v${input.expectedVersion}:${input.packageCode}:${input.discountBps}`,
    {
      expectedVersion: input.expectedVersion,
      packageCode: input.packageCode,
      discountBps: input.discountBps,
    },
  )
}

export function approveLocalDiscount(
  leadId: string,
  contract: ContractSummary,
  note: string,
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/contracts/${contract.id}/discount-decision`,
    `provider:discount:${contract.id}:v${contract.version}:approve`,
    {
      leadId,
      expectedVersion: contract.version,
      decision: 'APPROVE',
      note,
    },
  )
}

export function signLocalContract(
  leadId: string,
  contract: ContractSummary,
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/contracts/${contract.id}/sign`,
    `provider:sign:${contract.id}:v${contract.version}`,
    {
      leadId,
      expectedVersion: contract.version,
    },
  )
}
