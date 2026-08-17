import type {
  ProblemDetails,
  ProviderSettlementOverview,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-city-delivery-2026'

interface UniRequestResult<T> {
  statusCode: number
  data: T
}

function idempotencyKey(action: string): string {
  return `settlement:${action}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
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
        reject(new Error(problem.detail ?? '城市收益结算服务暂不可用'))
      },
      fail: () => reject(new Error('暂时无法连接城市收益结算服务')),
    })
  })
}

function write<T>(
  action: string,
  url: string,
  data: Record<string, unknown>,
): Promise<T> {
  return request<T>({
    url: `${API_BASE}${url}`,
    method: 'POST',
    data,
    header: { 'Idempotency-Key': idempotencyKey(action) },
  })
}

export function fetchProviderSettlements(
  focusStatementId?: string,
): Promise<ProviderSettlementOverview> {
  const query = focusStatementId
    ? `?focusStatementId=${encodeURIComponent(focusStatementId)}`
    : ''
  return request<ProviderSettlementOverview>({
    url: `${API_BASE}/provider/settlements${query}`,
    method: 'GET',
  })
}

export function generateProviderSettlement(input: {
  cityId: string
  period: string
}): Promise<ProviderSettlementOverview> {
  return write('generate', '/provider/settlements/generate', {
    ...input,
    confirmed: true,
  })
}

export function requestSettlementAdjustment(input: {
  statementId: string
  expectedVersion: number
  direction: 'CREDIT' | 'DEBIT'
  amountFen: number
  reason: string
  evidence: string[]
}): Promise<ProviderSettlementOverview> {
  return write(
    'adjustment',
    `/provider/settlements/${encodeURIComponent(input.statementId)}/adjustments`,
    {
      expectedVersion: input.expectedVersion,
      direction: input.direction,
      amountFen: input.amountFen,
      reason: input.reason,
      evidence: input.evidence,
      confirmed: true,
    },
  )
}

export function submitSettlementInvoice(input: {
  statementId: string
  expectedVersion: number
  invoiceNo: string
  sellerName: string
  sellerTaxIdMasked: string
  amountFen: number
  issuedAt: string
}): Promise<ProviderSettlementOverview> {
  return write(
    'invoice',
    `/provider/settlements/${encodeURIComponent(input.statementId)}/invoices`,
    {
      expectedVersion: input.expectedVersion,
      invoiceNo: input.invoiceNo,
      sellerName: input.sellerName,
      sellerTaxIdMasked: input.sellerTaxIdMasked,
      amountFen: input.amountFen,
      issuedAt: input.issuedAt,
      confirmed: true,
    },
  )
}
