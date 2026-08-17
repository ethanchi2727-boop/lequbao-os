import type {
  ContractSummary,
  OnboardingAssetSummary,
  OnboardingLeadSummary,
  OnboardingOverview,
  ProblemDetails,
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

function mutation<T>(url: string, key: string, data: Record<string, unknown>): Promise<T> {
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

export function fetchOnboarding(focusLeadId?: string): Promise<OnboardingOverview> {
  const query = focusLeadId ? `?focusLeadId=${encodeURIComponent(focusLeadId)}` : ''
  return request<OnboardingOverview>({
    url: `${API_BASE}/onboarding/overview${query}`,
    method: 'GET',
  })
}

export function createLead(input: {
  name: string
  category: string
  source: string
  contactName: string
  contactPhoneMasked: string
  address: string
  cityId: string
}): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads`,
    `lead:create:${Date.now()}:${input.name}`,
    input,
  )
}

export function addFollowUp(
  lead: OnboardingLeadSummary,
  input: {
    channel: 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO'
    summary: string
    nextAction: string
    nextActionAt: string
  },
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${lead.id}/followups`,
    `followup:${lead.id}:v${lead.version}:${Date.now()}`,
    { expectedVersion: lead.version, ...input },
  )
}

export function markLost(
  lead: OnboardingLeadSummary,
  input: {
    reason: 'NO_BUDGET' | 'NO_DECISION' | 'COMPETITOR' | 'TIMING' | 'INVALID' | 'OTHER'
    note: string
  },
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${lead.id}/lost`,
    `lost:${lead.id}:v${lead.version}`,
    { expectedVersion: lead.version, ...input },
  )
}

export function submitAppeal(
  lead: OnboardingLeadSummary,
  reason: string,
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${lead.id}/appeals`,
    `appeal:${lead.id}:v${lead.version}:${Date.now()}`,
    { reason, evidence: [`销售宝提交 · ${new Date().toISOString()}`] },
  )
}

export function uploadAsset(
  lead: OnboardingLeadSummary,
  assetType: OnboardingAssetSummary['assetType'],
  file: { name: string; mimeType: string; bytes: ArrayBuffer },
): Promise<OnboardingOverview> {
  return request<OnboardingOverview>({
    url: `${API_BASE}/onboarding/leads/${lead.id}/assets/upload`,
    method: 'POST',
    header: {
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': `upload:${lead.id}:${assetType}:v${lead.version}:${file.bytes.byteLength}`,
      'X-Asset-Type': assetType,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Mime-Type': file.mimeType,
      'X-Expected-Version': String(lead.version),
    },
    data: file.bytes,
  })
}

export function runDiagnosis(lead: OnboardingLeadSummary): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${lead.id}/diagnosis`,
    `diagnosis:${lead.id}:v${lead.version}`,
    { expectedVersion: lead.version },
  )
}

export function createContract(
  lead: OnboardingLeadSummary,
  configuration: {
    packageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'
    discountBps: number
  } = { packageCode: 'PRO', discountBps: 300 },
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${lead.id}/contracts`,
    `contract:${lead.id}:v${lead.version}:${configuration.packageCode}-${configuration.discountBps}`,
    { expectedVersion: lead.version, ...configuration },
  )
}

export function signContract(
  leadId: string,
  contract: ContractSummary,
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/contracts/${contract.id}/sign`,
    `sign:${contract.id}:v${contract.version}`,
    { leadId, expectedVersion: contract.version },
  )
}

export function captureAssets(lead: OnboardingLeadSummary): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${lead.id}/assets/capture`,
    `capture:${lead.id}:v${lead.version}`,
    { expectedVersion: lead.version },
  )
}

export function confirmAsset(
  leadId: string,
  asset: OnboardingAssetSummary,
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/assets/${asset.id}/confirm`,
    `confirm:${asset.id}:v${asset.version}`,
    { leadId, expectedVersion: asset.version, corrected: asset.extracted },
  )
}
