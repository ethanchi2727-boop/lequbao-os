import type {
  MerchantOperationsOverview,
  MerchantOrderSummary,
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
      fail: () => reject(new Error('暂时无法连接经营宝服务')),
    })
  })
}

function mutate(
  order: MerchantOrderSummary,
  action: string,
  data: Record<string, unknown>,
): Promise<MerchantOperationsOverview> {
  return request<MerchantOperationsOverview>({
    url: `${API_BASE}/merchant/orders/${order.id}/${action}`,
    method: 'POST',
    data: { expectedVersion: order.version, ...data },
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `merchant:${order.id}:${action}:v${order.version}:${Date.now()}`,
    },
  })
}

export function fetchMerchantOverview(focusOrderId?: string): Promise<MerchantOperationsOverview> {
  const query = focusOrderId ? `?focusOrderId=${encodeURIComponent(focusOrderId)}` : ''
  return request<MerchantOperationsOverview>({
    url: `${API_BASE}/merchant/overview${query}`,
    method: 'GET',
  })
}

export function confirmOrder(order: MerchantOrderSummary): Promise<MerchantOperationsOverview> {
  return mutate(order, 'confirm', {})
}

export function verifyOrder(
  order: MerchantOrderSummary,
  verificationCode: string,
): Promise<MerchantOperationsOverview> {
  return mutate(order, 'verify', { verificationCode, confirmed: true })
}

export function approveRefund(
  order: MerchantOrderSummary,
  reason: string,
): Promise<MerchantOperationsOverview> {
  return mutate(order, 'approve-refund', {
    refundAmountFen: order.refundAmountFen,
    reason,
    confirmed: true,
  })
}
