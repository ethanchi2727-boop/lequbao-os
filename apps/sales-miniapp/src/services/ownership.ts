import type {
  LeadCollaboratorSummary,
  LeadOwnershipAppealSummary,
  LeadOwnershipDecision,
  LeadTransferRequestSummary,
  OnboardingOverview,
  ProblemDetails,
  SalesOwnershipOverview,
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

export function fetchSalesOwnership(leadId: string): Promise<SalesOwnershipOverview> {
  return request<SalesOwnershipOverview>({
    url: `${API_BASE}/sales/ownership/${encodeURIComponent(leadId)}`,
    method: 'GET',
  })
}

export function createTransferRequest(
  overview: SalesOwnershipOverview,
  input: {
    targetOwnerId: string
    reason: string
    evidence: string[]
  },
): Promise<SalesOwnershipOverview> {
  return mutation(
    `${API_BASE}/sales/ownership/${overview.lead.id}/transfer-requests`,
    `ownership:transfer-request:${overview.lead.id}:v${overview.lead.version}:${Date.now()}`,
    {
      ...input,
      expectedLeadVersion: overview.lead.version,
    },
  )
}

export function decideTransferRequest(
  requestSummary: LeadTransferRequestSummary,
  decision: LeadOwnershipDecision,
  note: string,
): Promise<SalesOwnershipOverview> {
  return mutation(
    `${API_BASE}/sales/ownership/transfer-requests/${requestSummary.id}/decision`,
    `ownership:transfer-decision:${requestSummary.id}:v${requestSummary.version}:${decision}`,
    {
      decision,
      note,
      expectedVersion: requestSummary.version,
    },
  )
}

export function submitOwnershipAppeal(
  overview: SalesOwnershipOverview,
  reason: string,
  evidence: string[],
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${overview.lead.id}/appeals`,
    `ownership:appeal:${overview.lead.id}:v${overview.lead.version}:${Date.now()}`,
    { reason, evidence },
  )
}

export function decideOwnershipAppeal(
  overview: SalesOwnershipOverview,
  appeal: LeadOwnershipAppealSummary,
  decision: LeadOwnershipDecision,
  note: string,
): Promise<SalesOwnershipOverview> {
  return mutation(
    `${API_BASE}/sales/ownership/appeals/${appeal.id}/decision`,
    `ownership:appeal-decision:${appeal.id}:v${overview.lead.version}:${decision}`,
    {
      decision,
      note,
      expectedLeadVersion: overview.lead.version,
    },
  )
}

export function addOwnershipCollaborator(
  overview: SalesOwnershipOverview,
  userId: string,
  role: LeadCollaboratorSummary['role'],
): Promise<OnboardingOverview> {
  return mutation(
    `${API_BASE}/onboarding/leads/${overview.lead.id}/collaborators`,
    `ownership:collaborator:${overview.lead.id}:v${overview.lead.version}:${userId}:${role}`,
    {
      expectedVersion: overview.lead.version,
      userId,
      role,
    },
  )
}
