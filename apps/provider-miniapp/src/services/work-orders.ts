import type {
  ProblemDetails,
  ProviderWorkOrderAttachmentSummary,
  ProviderWorkOrderOverview,
  ProviderWorkOrderSummary,
  ProviderWorkOrderType,
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
        reject(new Error(problem.detail ?? '工单操作失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接城市交付工单服务')),
    })
  })
}

function mutation(
  url: string,
  key: string,
  data: Record<string, unknown>,
): Promise<ProviderWorkOrderOverview> {
  return request<ProviderWorkOrderOverview>({
    url,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    data,
  })
}

export function fetchProviderWorkOrders(input: {
  focusCaseId?: string | undefined
  focusWorkOrderId?: string | undefined
} = {}): Promise<ProviderWorkOrderOverview> {
  const params: string[] = []
  if (input.focusCaseId) params.push(`focusCaseId=${encodeURIComponent(input.focusCaseId)}`)
  if (input.focusWorkOrderId) {
    params.push(`focusWorkOrderId=${encodeURIComponent(input.focusWorkOrderId)}`)
  }
  return request<ProviderWorkOrderOverview>({
    url: `${API_BASE}/provider/delivery-work-orders${params.length ? `?${params.join('&')}` : ''}`,
    method: 'GET',
  })
}

export function createWorkOrder(input: {
  caseId: string
  type: ProviderWorkOrderType
  title: string
  description: string
  priority: ProviderWorkOrderSummary['priority']
  ownerId: string
  dueAt: string
  confirmationRequired?: boolean | undefined
}): Promise<ProviderWorkOrderOverview> {
  return mutation(
    `${API_BASE}/provider/delivery-work-orders`,
    `provider:work-order:create:${input.caseId}:${input.type}:${Date.now()}`,
    input as unknown as Record<string, unknown>,
  )
}

export function assignWorkOrder(input: {
  workOrderId: string
  expectedVersion: number
  targetOwnerId: string
  reason: string
}): Promise<ProviderWorkOrderOverview> {
  return mutation(
    `${API_BASE}/provider/delivery-work-orders/${input.workOrderId}/assign`,
    `provider:work-order:assign:${input.workOrderId}:v${input.expectedVersion}:${input.targetOwnerId}`,
    {
      expectedVersion: input.expectedVersion,
      targetOwnerId: input.targetOwnerId,
      reason: input.reason,
      confirmed: true,
    },
  )
}

export function startWorkOrder(
  order: ProviderWorkOrderSummary,
): Promise<ProviderWorkOrderOverview> {
  return mutation(
    `${API_BASE}/provider/delivery-work-orders/${order.id}/start`,
    `provider:work-order:start:${order.id}:v${order.version}`,
    { expectedVersion: order.version },
  )
}

export function submitWorkOrder(
  order: ProviderWorkOrderSummary,
  handoffNote: string,
): Promise<ProviderWorkOrderOverview> {
  return mutation(
    `${API_BASE}/provider/delivery-work-orders/${order.id}/submit`,
    `provider:work-order:submit:${order.id}:v${order.version}`,
    { expectedVersion: order.version, handoffNote, confirmed: true },
  )
}

export function confirmWorkOrder(input: {
  order: ProviderWorkOrderSummary
  decision: 'APPROVED' | 'CHANGES_REQUESTED'
  confirmerName: string
  confirmerRole: string
  comment: string
}): Promise<ProviderWorkOrderOverview> {
  return mutation(
    `${API_BASE}/provider/delivery-work-orders/${input.order.id}/merchant-confirmation`,
    `provider:work-order:confirm:${input.order.id}:v${input.order.version}:${input.decision}`,
    {
      expectedVersion: input.order.version,
      decision: input.decision,
      confirmerName: input.confirmerName,
      confirmerRole: input.confirmerRole,
      comment: input.comment,
      confirmed: true,
    },
  )
}

export function uploadWorkOrderAttachment(input: {
  order: ProviderWorkOrderSummary
  category: ProviderWorkOrderAttachmentSummary['category']
  fileName: string
  mimeType: string
  content: ArrayBuffer
}): Promise<ProviderWorkOrderOverview> {
  return request<ProviderWorkOrderOverview>({
    url: `${API_BASE}/provider/delivery-work-orders/${input.order.id}/attachments`,
    method: 'POST',
    header: {
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': `provider:work-order:attachment:${input.order.id}:v${input.order.version}:${Date.now()}`,
      'X-File-Name': encodeURIComponent(input.fileName),
      'X-Mime-Type': input.mimeType,
      'X-Attachment-Category': input.category,
      'X-Expected-Version': String(input.order.version),
    },
    data: input.content,
  })
}

export function attachmentDownloadUrl(
  attachmentId: string,
): string {
  return `${API_BASE}/provider/delivery-work-order-attachments/${encodeURIComponent(attachmentId)}`
}
