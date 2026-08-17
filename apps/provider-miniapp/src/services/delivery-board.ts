import type { ProblemDetails, ProviderDeliveryBoardOverview } from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-city-delivery-2026'

interface UniRequestResult<T> {
  statusCode: number
  data: T
}

export function fetchProviderDeliveryBoard(
  focusCaseId?: string,
): Promise<ProviderDeliveryBoardOverview> {
  const query = focusCaseId ? `?focusCaseId=${encodeURIComponent(focusCaseId)}` : ''
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE}/provider/delivery-board${query}`,
      method: 'GET',
      header: { Authorization: `Bearer ${AUTH_TOKEN}` },
      success: (response) => {
        const result = response as unknown as UniRequestResult<
          ProviderDeliveryBoardOverview | ProblemDetails
        >
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as ProviderDeliveryBoardOverview)
          return
        }
        const problem = result.data as ProblemDetails
        reject(new Error(problem.detail ?? '交付看板加载失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接城市交付中枢')),
    })
  })
}
