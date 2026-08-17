import type {
  MerchantMemberBenefitSummary,
  MerchantMemberOverview,
  MerchantMemberSummary,
  MerchantRecallTaskSummary,
  ProblemDetails,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-merchant-owner-2026'

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
      fail: () => reject(new Error('暂时无法连接经营宝会员服务')),
    })
  })
}

function write(
  path: string,
  data: Record<string, unknown>,
  operation: string,
): Promise<MerchantMemberOverview> {
  return request<MerchantMemberOverview>({
    url: `${API_BASE}${path}`,
    method: 'POST',
    data,
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `member:${operation}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
    },
  })
}

export function fetchMemberOverview(focusMemberId?: string): Promise<MerchantMemberOverview> {
  const query = focusMemberId ? `?focusMemberId=${encodeURIComponent(focusMemberId)}` : ''
  return request<MerchantMemberOverview>({
    url: `${API_BASE}/merchant/members/overview${query}`,
    method: 'GET',
  })
}

export function saveMemberTags(
  member: MerchantMemberSummary,
  tags: string[],
): Promise<MerchantMemberOverview> {
  return write(
    `/merchant/members/${member.id}/tags`,
    { expectedVersion: member.version, tags },
    `tags:${member.id}:v${member.version}`,
  )
}

export function grantBenefit(
  member: MerchantMemberSummary,
  input: {
    kind: MerchantMemberBenefitSummary['kind']
    title: string
    valueFen: number
    expiresAt: string
  },
): Promise<MerchantMemberOverview> {
  return write(
    `/merchant/members/${member.id}/benefits`,
    { expectedVersion: member.version, ...input, confirmed: true },
    `benefit:${member.id}:v${member.version}`,
  )
}

export function createRecallTask(input: {
  name: string
  memberIds: string[]
  channel: MerchantRecallTaskSummary['channel']
  content: string
  reason: string
  scheduledAt: string
}): Promise<MerchantMemberOverview> {
  return write(
    '/merchant/members/recall-tasks',
    { ...input, confirmed: true },
    `recall:${input.channel}:${input.scheduledAt}`,
  )
}
