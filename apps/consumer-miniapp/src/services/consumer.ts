import type {
  ConsumerAssistantOverview,
  ConsumerDealActionReceipt,
  ConsumerHomeOverview,
  ConsumerImageInputSummary,
  ConsumerHouseholdMemberSummary,
  ConsumerMessageCategory,
  ConsumerMessageOverview,
  ConsumerMessageSummary,
  ConsumerNearbyOverview,
  ConsumerSearchOverview,
  ConsumerStoreDetailOverview,
  ConsumerVoiceInputSummary,
  ProblemDetails,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-consumer-2026'

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
      fail: () => reject(new Error('暂时无法连接乐趣生活服务，请确认 API 已启动')),
    })
  })
}

function mutation<T>(
  path: string,
  idempotencyKey: string,
  data: Record<string, unknown>,
): Promise<T> {
  return request<T>({
    url: `${API_BASE}${path}`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    data,
  })
}

function createMutationKey(scope: string): string {
  return `${scope}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
}

export function fetchConsumerHome(): Promise<ConsumerHomeOverview> {
  return request<ConsumerHomeOverview>({
    url: `${API_BASE}/consumer/home`,
    method: 'GET',
  })
}

export function changeConsumerContext(input: {
  expectedVersion: number
  cityId: string
  householdMemberId: string
}): Promise<ConsumerHomeOverview> {
  return mutation(
    '/consumer/context',
    `consumer:context:v${input.expectedVersion}:${input.cityId}:${input.householdMemberId}`,
    input,
  )
}

export function fetchConsumerMessages(query: {
  category?: ConsumerMessageCategory
  unreadOnly?: boolean
} = {}): Promise<ConsumerMessageOverview> {
  const params: string[] = []
  if (query.category) params.push(`category=${query.category}`)
  if (query.unreadOnly !== undefined) params.push(`unreadOnly=${String(query.unreadOnly)}`)
  const suffix = params.length ? `?${params.join('&')}` : ''
  return request<ConsumerMessageOverview>({
    url: `${API_BASE}/consumer/messages${suffix}`,
    method: 'GET',
  })
}

export function readConsumerMessage(
  message: ConsumerMessageSummary,
): Promise<ConsumerMessageOverview> {
  return mutation(
    `/consumer/messages/${encodeURIComponent(message.id)}/read`,
    `consumer:message:${message.id}:read:v${message.version}`,
    { expectedVersion: message.version },
  )
}

export function searchConsumerServices(input: {
  query: string
  cityId: string
  householdMemberId: string
  limit?: number
}): Promise<ConsumerSearchOverview> {
  const normalized = input.query.trim().toLocaleLowerCase('zh-CN')
  return mutation(
    '/consumer/search',
    createMutationKey(
      `consumer:search:${input.cityId}:${input.householdMemberId}:${encodeURIComponent(normalized)}`,
    ),
    { ...input, limit: input.limit ?? 20 },
  )
}

export function fetchConsumerNearby(input: {
  cityId?: string
  householdMemberId?: string
  location?: {
    latitude: number
    longitude: number
    accuracyMeters?: number
  }
  limit?: number
} = {}): Promise<ConsumerNearbyOverview> {
  return request<ConsumerNearbyOverview>({
    url: `${API_BASE}/consumer/nearby`,
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: { ...input, limit: input.limit ?? 20 },
  })
}

export function fetchConsumerStoreDetail(storeId: string): Promise<ConsumerStoreDetailOverview> {
  return request<ConsumerStoreDetailOverview>({
    url: `${API_BASE}/consumer/stores/${encodeURIComponent(storeId)}`,
    method: 'GET',
  })
}

export function createConsumerDealDraft(input: {
  storeId: string
  offerId: string
  cityId: string
  householdMemberId: string
  quantity: number
  serviceAt?: string
  acknowledgedTerms: true
}): Promise<ConsumerStoreDetailOverview> {
  return mutation(
    `/consumer/stores/${encodeURIComponent(input.storeId)}/offers/${encodeURIComponent(input.offerId)}/drafts`,
    createMutationKey(`consumer:deal:${input.storeId}:${input.offerId}:draft`),
    {
      cityId: input.cityId,
      householdMemberId: input.householdMemberId,
      quantity: input.quantity,
      ...(input.serviceAt ? { serviceAt: input.serviceAt } : {}),
      acknowledgedTerms: input.acknowledgedTerms,
    },
  )
}

export function confirmConsumerDealDraft(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
}): Promise<ConsumerStoreDetailOverview> {
  return mutation(
    `/consumer/deal-drafts/${encodeURIComponent(input.draftId)}/confirm`,
    createMutationKey(`consumer:deal:${input.draftId}:confirm:v${input.expectedVersion}`),
    {
      expectedVersion: input.expectedVersion,
      confirmed: input.confirmed,
    },
  )
}

export function cancelConsumerDealDraft(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
  reason: string
}): Promise<ConsumerDealActionReceipt> {
  return mutation(
    `/consumer/deal-drafts/${encodeURIComponent(input.draftId)}/cancel`,
    createMutationKey(`consumer:deal:${input.draftId}:cancel:v${input.expectedVersion}`),
    {
      expectedVersion: input.expectedVersion,
      confirmed: input.confirmed,
      reason: input.reason,
    },
  )
}

export function requestConsumerDealRefund(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
  reason: string
}): Promise<ConsumerDealActionReceipt> {
  return mutation(
    `/consumer/deal-drafts/${encodeURIComponent(input.draftId)}/refunds`,
    createMutationKey(`consumer:deal:${input.draftId}:refund:v${input.expectedVersion}`),
    {
      expectedVersion: input.expectedVersion,
      confirmed: input.confirmed,
      reason: input.reason,
    },
  )
}

export function fetchConsumerAssistant(): Promise<ConsumerAssistantOverview> {
  return request<ConsumerAssistantOverview>({
    url: `${API_BASE}/consumer/assistant`,
    method: 'GET',
  })
}

export function sendConsumerAssistantMessage(input: {
  prompt: string
  cityId: string
  householdMemberId: string
  sessionId?: string
  sourceVoiceInputId?: string
  sourceImageInputId?: string
}): Promise<ConsumerAssistantOverview> {
  return mutation(
    '/consumer/assistant/messages',
    createMutationKey(`consumer:assistant:${input.cityId}:${input.householdMemberId}`),
    input,
  )
}

export function uploadConsumerVoiceInput(input: {
  fileName: string
  mimeType: string
  durationMs: number
  cityId: string
  householdMemberId: string
  content: ArrayBuffer
}): Promise<ConsumerVoiceInputSummary> {
  return request<ConsumerVoiceInputSummary>({
    url: `${API_BASE}/consumer/assistant/voice-inputs`,
    method: 'POST',
    header: {
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': createMutationKey('consumer:voice:upload'),
      'X-File-Name': encodeURIComponent(input.fileName),
      'X-Mime-Type': input.mimeType,
      'X-Duration-Ms': String(input.durationMs),
      'X-City-Id': input.cityId,
      'X-Household-Member-Id': input.householdMemberId,
    },
    data: input.content,
  })
}

export function confirmConsumerVoiceTranscript(input: {
  voiceInputId: string
  expectedVersion: number
  transcript: string
  confirmed: true
}): Promise<ConsumerVoiceInputSummary> {
  return mutation(
    `/consumer/assistant/voice-inputs/${encodeURIComponent(input.voiceInputId)}/confirm`,
    `consumer:voice:${input.voiceInputId}:confirm:v${input.expectedVersion}`,
    {
      expectedVersion: input.expectedVersion,
      transcript: input.transcript,
      confirmed: input.confirmed,
    },
  )
}

export function uploadConsumerImageInput(input: {
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  cityId: string
  householdMemberId: string
  content: ArrayBuffer
}): Promise<ConsumerImageInputSummary> {
  return request<ConsumerImageInputSummary>({
    url: `${API_BASE}/consumer/assistant/image-inputs`,
    method: 'POST',
    header: {
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': createMutationKey('consumer:image:upload'),
      'X-File-Name': encodeURIComponent(input.fileName),
      'X-Mime-Type': input.mimeType,
      'X-City-Id': input.cityId,
      'X-Household-Member-Id': input.householdMemberId,
    },
    data: input.content,
  })
}

export function confirmConsumerImageDescription(input: {
  imageInputId: string
  expectedVersion: number
  description: string
  confirmed: true
}): Promise<ConsumerImageInputSummary> {
  return mutation(
    `/consumer/assistant/image-inputs/${encodeURIComponent(input.imageInputId)}/confirm`,
    `consumer:image:${input.imageInputId}:confirm:v${input.expectedVersion}`,
    {
      expectedVersion: input.expectedVersion,
      description: input.description,
      confirmed: input.confirmed,
    },
  )
}

export function confirmConsumerReservation(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
}): Promise<ConsumerAssistantOverview> {
  return mutation(
    `/consumer/reservations/${encodeURIComponent(input.draftId)}/confirm`,
    `consumer:reservation:${input.draftId}:confirm:v${input.expectedVersion}`,
    {
      expectedVersion: input.expectedVersion,
      confirmed: input.confirmed,
    },
  )
}

export function updateConsumerReservationDraft(input: {
  draftId: string
  expectedVersion: number
  partySize: number
  reservationAt: string
}): Promise<ConsumerAssistantOverview> {
  return mutation(
    `/consumer/reservations/${encodeURIComponent(input.draftId)}/update`,
    `consumer:reservation:${input.draftId}:update:v${input.expectedVersion}`,
    {
      expectedVersion: input.expectedVersion,
      partySize: input.partySize,
      reservationAt: input.reservationAt,
    },
  )
}

export function cancelConsumerReservation(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
  reason: string
}): Promise<ConsumerAssistantOverview> {
  return mutation(
    `/consumer/reservations/${encodeURIComponent(input.draftId)}/cancel`,
    `consumer:reservation:${input.draftId}:cancel:v${input.expectedVersion}`,
    {
      expectedVersion: input.expectedVersion,
      confirmed: input.confirmed,
      reason: input.reason,
    },
  )
}

export function prepareConsumerReservationPayment(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
}): Promise<ConsumerAssistantOverview> {
  return mutation(
    `/consumer/reservations/${encodeURIComponent(input.draftId)}/payment/prepare`,
    `consumer:payment:${input.draftId}:prepare:v${input.expectedVersion}`,
    { expectedVersion: input.expectedVersion, confirmed: input.confirmed },
  )
}

export function requestConsumerReservationRefund(input: {
  draftId: string
  expectedVersion: number
  confirmed: true
  reason: string
}): Promise<ConsumerAssistantOverview> {
  return mutation(
    `/consumer/reservations/${encodeURIComponent(input.draftId)}/refund`,
    `consumer:payment:${input.draftId}:refund:v${input.expectedVersion}`,
    {
      expectedVersion: input.expectedVersion,
      confirmed: input.confirmed,
      reason: input.reason,
    },
  )
}

export type {
  ConsumerAssistantOverview,
  ConsumerVoiceInputSummary,
  ConsumerImageInputSummary,
  ConsumerHomeOverview,
  ConsumerHouseholdMemberSummary,
  ConsumerMessageCategory,
  ConsumerMessageOverview,
  ConsumerMessageSummary,
  ConsumerNearbyOverview,
  ConsumerSearchOverview,
  ConsumerStoreDetailOverview,
}
