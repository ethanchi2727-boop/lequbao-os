import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  ConsumerAssistantOverview,
  ConsumerAssistantRecommendationSummary,
  ConsumerCitySummary,
  ConsumerHouseholdMemberSummary,
  ConsumerReservationDraftSummary,
} from '@lequ/contracts'
import {
  consumeConfirmedVoiceInput,
  latestConsumerVoiceInput,
} from './consumer-voice-service.js'
import {
  consumeConfirmedImageInput,
  latestConsumerImageInput,
} from './consumer-image-service.js'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-assistant-e8b'
const POLICY_VERSION = 'consumer-assistant-policy-v1' as const
const MODEL_VERSION = 'consumer-intent-local-v1' as const

interface ProfileRow {
  user_id: string
  tenant_id: string
  display_name: string
  phone_masked: string
  preferred_city_id: string
  active_household_id: string
  active_household_member_id: string
}

interface SessionRow {
  id: string
  city_id: string
  household_member_id: string
  version: number
  created_at: string
  updated_at: string
}

interface DraftRow {
  id: string
  merchant_id: string
  store_id: string
  merchant_name: string
  item_summary: string
  party_size: number
  reservation_at: string
  customer_name: string
  customer_phone_masked: string
  amount_fen: number
  status: 'WAITING_CONFIRMATION' | 'CONFIRMED'
  order_id: string | null
  order_status: ConsumerReservationDraftSummary['orderStatus']
  paid_amount_fen: number | null
  refund_amount_fen: number | null
  payment_intent_id: string | null
  payment_status: 'PENDING_PROVIDER' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | null
  payment_version: number | null
  version: number
  created_at: string
  updated_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

interface CandidateRow {
  merchant_id: string
  store_id: string
  merchant_name: string
  category: string
  distance_meters: number
  recommendation_reason: string
  address: string
  tags_json: string
  item_summary: string | null
  price_fen: number | null
}

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不是消费者本人')
  }
}

function profileFor(database: DatabaseSync, principal: Principal): ProfileRow {
  requireConsumer(principal)
  const profile = database.prepare(
    `SELECT user_id, tenant_id, display_name, phone_masked, preferred_city_id,
            active_household_id, active_household_member_id
     FROM consumer_profiles
     WHERE user_id = ? AND tenant_id = ?`,
  ).get(principal.subject, principal.tenantId) as unknown as ProfileRow | undefined
  if (!profile) {
    throw new DomainError(404, 'consumer_profile_not_found', '消费者档案不存在')
  }
  return profile
}

function contextFor(
  database: DatabaseSync,
  profile: ProfileRow,
): { city: ConsumerCitySummary; member: ConsumerHouseholdMemberSummary } {
  const city = database.prepare(
    `SELECT id, name, code, service_level
     FROM consumer_cities
     WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'`,
  ).get(profile.preferred_city_id, profile.tenant_id) as {
    id: string
    name: string
    code: string
    service_level: ConsumerCitySummary['serviceLevel']
  } | undefined
  const member = database.prepare(
    `SELECT members.id, members.name, members.relation, members.mode,
            members.avatar_key, members.subtitle, members.dietary_notes_json,
            members.permissions_json
     FROM consumer_household_members members
     JOIN consumer_households households ON households.id = members.household_id
     WHERE members.id = ? AND members.tenant_id = ? AND members.status = 'ACTIVE'
       AND households.id = ? AND households.owner_user_id = ?`,
  ).get(
    profile.active_household_member_id,
    profile.tenant_id,
    profile.active_household_id,
    profile.user_id,
  ) as {
    id: string
    name: string
    relation: string
    mode: ConsumerHouseholdMemberSummary['mode']
    avatar_key: string
    subtitle: string
    dietary_notes_json: string
    permissions_json: string
  } | undefined
  if (!city || !member) {
    throw new DomainError(409, 'consumer_assistant_context_invalid', '当前城市或家庭身份已失效')
  }
  return {
    city: {
      id: city.id,
      name: city.name,
      code: city.code,
      serviceLevel: city.service_level,
      available: true,
      isCurrent: true,
    },
    member: {
      id: member.id,
      name: member.name,
      relation: member.relation,
      mode: member.mode,
      avatarKey: member.avatar_key,
      subtitle: member.subtitle,
      dietaryNotes: JSON.parse(member.dietary_notes_json) as string[],
      permissions: JSON.parse(member.permissions_json) as string[],
      isCurrent: true,
    },
  }
}

function activeSession(
  database: DatabaseSync,
  principal: Principal,
  profile: ProfileRow,
): SessionRow | undefined {
  return database.prepare(
    `SELECT id, city_id, household_member_id, version, created_at, updated_at
     FROM consumer_assistant_sessions
     WHERE tenant_id = ? AND user_id = ? AND city_id = ?
       AND household_member_id = ? AND status = 'ACTIVE'
     ORDER BY updated_at DESC LIMIT 1`,
  ).get(
    principal.tenantId,
    principal.subject,
    profile.preferred_city_id,
    profile.active_household_member_id,
  ) as unknown as SessionRow | undefined
}

function requestReplay<T>(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
): T | null {
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(key, route) as unknown as IdempotencyRow | undefined
  if (!stored) return null
  if (stored.request_hash !== requestHash) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
  }
  database.prepare(
    `UPDATE idempotency_records SET replay_count = replay_count + 1
     WHERE key = ? AND route = ?`,
  ).run(key, route)
  return JSON.parse(stored.response_json) as T
}

function persistReplay(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
  response: unknown,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO idempotency_records
     (key, route, run_id, request_hash, response_json, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(key, route, RUN_ID, requestHash, JSON.stringify(response), timestamp)
}

function recordAction(
  database: DatabaseSync,
  principal: Principal,
  input: {
    action: string
    eventName: string
    entityType: string
    entityId: string
    riskLevel: 'L0' | 'L1' | 'L2'
    summary: string
    payload: Record<string, unknown>
    timestamp: string
    outboxTopic?: string
  },
): void {
  const payloadJson = JSON.stringify(input.payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, 'consumer', ?, ?, ?, ?, 'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, input.action, input.entityType,
    input.entityId, input.riskLevel, input.summary, payloadJson, input.timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, input.eventName, payloadJson,
    input.timestamp,
  )
  if (input.outboxTopic) {
    database.prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), RUN_ID, principal.tenantId, input.outboxTopic,
      input.entityId, payloadJson, input.timestamp,
    )
  }
}

function recommendationRows(
  database: DatabaseSync,
  profile: ProfileRow,
  prompt: string,
): CandidateRow[] {
  const rows = database.prepare(
    `SELECT publications.merchant_id, publications.store_id,
            stores.name AS merchant_name, publications.category,
            publications.distance_meters, publications.recommendation_reason,
            stores.address, publications.tags_json,
            (
              SELECT spus.name
              FROM merchant_catalogs catalogs
              JOIN merchant_spus spus ON spus.catalog_id = catalogs.id
              WHERE catalogs.store_id = publications.store_id
                AND catalogs.status = 'ACTIVE' AND spus.status = 'ACTIVE'
                AND spus.spu_type IN ('SERVICE', 'PACKAGE')
              ORDER BY spus.sort_order, spus.id LIMIT 1
            ) AS item_summary,
            (
              SELECT MIN(skus.price_fen)
              FROM merchant_catalogs catalogs
              JOIN merchant_spus spus ON spus.catalog_id = catalogs.id
              JOIN merchant_skus skus ON skus.spu_id = spus.id
              WHERE catalogs.store_id = publications.store_id
                AND catalogs.status = 'ACTIVE' AND spus.status = 'ACTIVE'
                AND spus.spu_type IN ('SERVICE', 'PACKAGE')
                AND skus.status = 'ACTIVE'
            ) AS price_fen
     FROM consumer_store_publications publications
     JOIN merchant_stores stores ON stores.id = publications.store_id
     WHERE publications.tenant_id = ? AND publications.city_id = ?
       AND publications.visibility_status = 'PUBLISHED'
       AND publications.authorization_scope = 'PLATFORM_DISPLAY'
       AND stores.operating_status = 'OPEN'
       AND EXISTS (
         SELECT 1
         FROM merchant_catalogs eligible_catalogs
         JOIN merchant_spus eligible_spus
           ON eligible_spus.catalog_id = eligible_catalogs.id
          AND eligible_spus.status = 'ACTIVE'
          AND eligible_spus.spu_type IN ('SERVICE', 'PACKAGE')
         JOIN merchant_skus eligible_skus
           ON eligible_skus.spu_id = eligible_spus.id
          AND eligible_skus.status = 'ACTIVE'
         WHERE eligible_catalogs.store_id = publications.store_id
           AND eligible_catalogs.status = 'ACTIVE'
       )
     ORDER BY publications.rating DESC, publications.review_count DESC
     LIMIT 20`,
  ).all(profile.tenant_id, profile.preferred_city_id) as unknown as CandidateRow[]
  const normalized = prompt.trim().toLocaleLowerCase('zh-CN')
  return rows
    .map((row) => {
      const text = [
        row.merchant_name, row.category, row.recommendation_reason,
        row.item_summary ?? '', ...(JSON.parse(row.tags_json) as string[]),
      ].join(' ').toLocaleLowerCase('zh-CN')
      const tokens = normalized.split(/\s+/).filter(Boolean)
      const score = tokens.reduce((total, token) => total + (text.includes(token) ? 10 : 0), 0)
      return { row, score }
    })
    .sort((left, right) => right.score - left.score || left.row.distance_meters - right.row.distance_meters)
    .slice(0, 3)
    .map(({ row }) => row)
}

function recommendationSummary(row: CandidateRow): ConsumerAssistantRecommendationSummary {
  return {
    storeId: row.store_id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    category: row.category,
    distanceMeters: row.distance_meters,
    reason: row.recommendation_reason,
    priceFen: row.price_fen,
    address: row.address,
    actionTarget: `/pages/store/index?storeId=${encodeURIComponent(row.store_id)}`,
    reservationSupported: row.item_summary !== null,
  }
}

function partySizeFrom(prompt: string): number {
  const arabic = prompt.match(/(\d{1,2})\s*个?人/)
  if (arabic) return Math.min(20, Math.max(1, Number(arabic[1])))
  const chinese = prompt.match(/([一二两三四五六七八九十])\s*个?人/)
  if (!chinese) return 2
  const values: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  }
  return values[chinese[1]!] ?? 2
}

function nextReservationAt(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setHours(18, 30, 0, 0)
  return date.toISOString()
}

function wantsReservation(prompt: string): boolean {
  return /订座|预约|晚餐|吃饭|餐厅|靠窗|聚餐/.test(prompt)
}

function draftSummary(row: DraftRow): ConsumerReservationDraftSummary {
  const paidAmountFen = row.paid_amount_fen ?? 0
  const refundAmountFen = row.refund_amount_fen ?? 0
  const paymentStatus = row.order_status === 'REFUNDED'
    ? 'REFUNDED'
    : row.order_status === 'REFUND_REQUESTED'
      ? 'REFUND_REQUESTED'
      : row.payment_status === 'SUCCEEDED' || paidAmountFen > 0
        ? 'SUCCEEDED'
        : row.payment_status === 'PENDING_PROVIDER'
          ? 'PENDING_PROVIDER'
          : row.payment_status === 'FAILED'
            ? 'FAILED'
            : 'NOT_STARTED'
  const merchantReply = row.order_status === 'REFUNDED'
    ? '退款已经完成，支付与退款证据均已保留。'
    : row.order_status === 'REFUND_REQUESTED'
      ? '退款申请已提交，正在等待商家审核。'
      : row.order_status === 'CONFIRMED'
    ? '商家已确认订座并锁定履约时段。'
    : row.order_status === 'CANCELLED'
      ? '订座已取消，当前没有支付或退款事项。'
      : row.order_status === 'PENDING_CONFIRMATION'
        ? '订座请求已送达，正在等待商家确认。'
        : null
  const confirmationNotice = row.status === 'WAITING_CONFIRMATION'
    ? '确认后将向商家提交订座请求，不会扣款；座位以商家最终确认为准。'
    : paymentStatus === 'PENDING_PROVIDER'
      ? '已生成支付请求，但尚未收到连接器成功回调；当前不会显示已支付。'
      : paymentStatus === 'SUCCEEDED'
        ? '支付连接器已回调成功；如需取消，将进入退款申请与商家审核流程。'
        : paymentStatus === 'REFUND_REQUESTED'
          ? '退款申请已提交，资金结果以支付连接器后续回调为准。'
          : paymentStatus === 'REFUNDED'
            ? '支付连接器已确认退款完成。'
    : row.order_status === 'CONFIRMED'
      ? '商家已确认；你可以核对金额后生成支付请求，生成请求本身不会代表扣款成功。'
      : row.order_status === 'CANCELLED'
        ? '订座已经取消，原请求及双方处理记录会继续保留。'
        : '订座请求已提交商家，当前未扣款，请留意商家确认消息。'
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    storeId: row.store_id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    itemSummary: row.item_summary,
    partySize: row.party_size,
    reservationAt: row.reservation_at,
    customerName: row.customer_name,
    customerPhoneMasked: row.customer_phone_masked,
    amountFen: row.amount_fen,
    orderId: row.order_id,
    orderStatus: row.order_status,
    payment: {
      intentId: row.payment_intent_id,
      provider: 'WECHAT_PAY',
      currency: 'CNY',
      status: paymentStatus,
      version: row.payment_version,
      totalAmountFen: row.amount_fen,
      paidAmountFen,
      refundAmountFen,
      canPrepare: row.order_status === 'CONFIRMED'
        && paidAmountFen === 0
        && row.amount_fen > 0
        && !['PENDING_PROVIDER', 'SUCCEEDED'].includes(paymentStatus)
        && Date.parse(row.reservation_at) > Date.now(),
      canRequestRefund: row.order_status === 'CONFIRMED'
        && paidAmountFen > refundAmountFen
        && Date.parse(row.reservation_at) > Date.now(),
      liveConnectorAvailable: false,
      disclosure: '当前仅完成支付连接器契约与签名回调边界；生成支付请求不等于扣款成功。',
    },
    canEdit: row.status === 'WAITING_CONFIRMATION' && row.order_id === null,
    canCancel: row.status === 'CONFIRMED'
      && ['PENDING_CONFIRMATION', 'CONFIRMED'].includes(row.order_status ?? '')
      && paidAmountFen === 0
      && Date.parse(row.reservation_at) > Date.now(),
    merchantReply,
    confirmationNotice,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function overviewFor(
  database: DatabaseSync,
  principal: Principal,
  profile: ProfileRow,
  session: SessionRow | undefined,
): ConsumerAssistantOverview {
  const { city, member } = contextFor(database, profile)
  if (!session) {
    return {
      session: null,
      messages: [],
      recommendations: [],
      voiceInput: latestConsumerVoiceInput(
        database, principal, profile.preferred_city_id, profile.active_household_member_id,
      ),
      imageInput: latestConsumerImageInput(
        database, principal, profile.preferred_city_id, profile.active_household_member_id,
      ),
      reservationDraft: null,
      policy: {
        version: POLICY_VERSION,
        modelVersion: MODEL_VERSION,
        textOnly: false,
        voiceInputEnabled: true,
        liveTranscriptionConnectorAvailable: false,
        transcriptionCallbackSignatureRequired: true,
        explicitTranscriptConfirmationRequired: true,
        rawAudioDeletedAfterCallback: true,
        imageInputEnabled: true,
        liveImageRecognitionConnectorAvailable: false,
        imageRecognitionCallbackSignatureRequired: true,
        explicitImageDescriptionConfirmationRequired: true,
        rawImageDeletedAfterCallback: true,
        imageMagicAndDimensionValidation: true,
        maximumRecommendations: 3,
        selfScopeEnforced: true,
        publishedStoresOnly: true,
        explicitConfirmationRequiredForReservation: true,
        draftEditableBeforeSubmission: true,
        merchantConfirmationReceipt: true,
        zeroPaymentCancellationBeforeService: true,
        paymentConnectorBoundary: true,
        livePaymentConnectorAvailable: false,
        providerCallbackSignatureRequired: true,
        refundRequiresMerchantApproval: true,
      },
      updatedAt: now(),
    }
  }
  const messages = database.prepare(
    `SELECT id, role, content, created_at
     FROM consumer_assistant_messages
     WHERE tenant_id = ? AND user_id = ? AND session_id = ?
     ORDER BY sequence`,
  ).all(principal.tenantId, principal.subject, session.id) as unknown as Array<{
    id: string
    role: 'USER' | 'ASSISTANT'
    content: string
    created_at: string
  }>
  const lastPrompt = [...messages].reverse().find(({ role }) => role === 'USER')?.content ?? ''
  const draft = database.prepare(
    `SELECT drafts.id, drafts.merchant_id, drafts.store_id,
            stores.name AS merchant_name, drafts.item_summary, drafts.party_size,
            drafts.reservation_at, drafts.customer_name,
            drafts.customer_phone_masked, drafts.amount_fen, drafts.status,
            drafts.order_id, orders.status AS order_status,
            orders.paid_amount_fen, orders.refund_amount_fen,
            payments.id AS payment_intent_id, payments.status AS payment_status,
            payments.version AS payment_version, drafts.version,
            drafts.created_at, drafts.updated_at
     FROM consumer_reservation_drafts drafts
     JOIN merchant_stores stores ON stores.id = drafts.store_id
     LEFT JOIN merchant_orders orders ON orders.id = drafts.order_id
     LEFT JOIN consumer_payment_intents payments ON payments.id = (
       SELECT id FROM consumer_payment_intents latest
       WHERE latest.draft_id = drafts.id
       ORDER BY latest.created_at DESC LIMIT 1
     )
     WHERE drafts.tenant_id = ? AND drafts.user_id = ? AND drafts.session_id = ?
     ORDER BY drafts.updated_at DESC LIMIT 1`,
  ).get(principal.tenantId, principal.subject, session.id) as unknown as DraftRow | undefined
  return {
    session: {
      id: session.id,
      version: session.version,
      city,
      activeMember: member,
    },
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    })),
    recommendations: lastPrompt
      ? recommendationRows(database, profile, lastPrompt).map(recommendationSummary)
      : [],
    voiceInput: latestConsumerVoiceInput(
      database, principal, profile.preferred_city_id, profile.active_household_member_id,
    ),
    imageInput: latestConsumerImageInput(
      database, principal, profile.preferred_city_id, profile.active_household_member_id,
    ),
    reservationDraft: draft ? draftSummary(draft) : null,
    policy: {
      version: POLICY_VERSION,
      modelVersion: MODEL_VERSION,
      textOnly: false,
      voiceInputEnabled: true,
      liveTranscriptionConnectorAvailable: false,
      transcriptionCallbackSignatureRequired: true,
      explicitTranscriptConfirmationRequired: true,
      rawAudioDeletedAfterCallback: true,
      imageInputEnabled: true,
      liveImageRecognitionConnectorAvailable: false,
      imageRecognitionCallbackSignatureRequired: true,
      explicitImageDescriptionConfirmationRequired: true,
      rawImageDeletedAfterCallback: true,
      imageMagicAndDimensionValidation: true,
      maximumRecommendations: 3,
      selfScopeEnforced: true,
      publishedStoresOnly: true,
      explicitConfirmationRequiredForReservation: true,
      draftEditableBeforeSubmission: true,
      merchantConfirmationReceipt: true,
      zeroPaymentCancellationBeforeService: true,
      paymentConnectorBoundary: true,
      livePaymentConnectorAvailable: false,
      providerCallbackSignatureRequired: true,
      refundRequiresMerchantApproval: true,
    },
    updatedAt: session.updated_at,
  }
}

export function getConsumerAssistantOverview(
  database: DatabaseSync,
  principal: Principal,
): ConsumerAssistantOverview {
  const profile = profileFor(database, principal)
  return overviewFor(database, principal, profile, activeSession(database, principal, profile))
}

export function sendConsumerAssistantMessage(
  database: DatabaseSync,
  principal: Principal,
  input: {
    prompt: string
    cityId: string
    householdMemberId: string
    sessionId?: string | undefined
    sourceVoiceInputId?: string | undefined
    sourceImageInputId?: string | undefined
  },
  idempotencyKey: string,
): ConsumerAssistantOverview {
  const route = '/api/v1/consumer/assistant/messages'
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerAssistantOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay

  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = profileFor(database, principal)
    if (
      input.cityId !== profile.preferred_city_id
      || input.householdMemberId !== profile.active_household_member_id
    ) {
      throw new DomainError(
        409,
        'consumer_assistant_context_stale',
        '城市或家庭身份已变化，请刷新后重试',
      )
    }
    let session = activeSession(database, principal, profile)
    if (input.sessionId && session?.id !== input.sessionId) {
      throw new DomainError(404, 'consumer_assistant_session_not_found', '当前会话不存在')
    }
    const timestamp = now()
    if (!session) {
      session = {
        id: randomUUID(),
        city_id: profile.preferred_city_id,
        household_member_id: profile.active_household_member_id,
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
      }
      database.prepare(
        `INSERT INTO consumer_assistant_sessions
         (id, tenant_id, user_id, city_id, household_member_id, status,
          version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
      ).run(
        session.id, principal.tenantId, principal.subject, session.city_id,
        session.household_member_id, timestamp, timestamp,
      )
    }
    const candidates = recommendationRows(database, profile, input.prompt)
    const shouldDraft = wantsReservation(input.prompt) && candidates.length > 0
    const assistantContent = candidates.length === 0
      ? '当前城市暂时没有找到已发布且获授权的合适服务。你可以换个说法，或切换城市后再试。'
      : shouldDraft
        ? `我找到 ${candidates.length} 个真实可选项，并为你准备了订座草稿。提交前请核对时间、人数和联系方式。`
        : `我找到 ${candidates.length} 个真实可选项，先按距离与匹配度整理给你。`
    database.prepare(
      `INSERT INTO consumer_assistant_messages
       (id, tenant_id, user_id, session_id, role, content, prompt_hash,
        model_version, created_at)
       VALUES (?, ?, ?, ?, 'USER', ?, ?, NULL, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, session.id,
      input.prompt, hash(input.prompt.trim()), timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_assistant_messages
       (id, tenant_id, user_id, session_id, role, content, prompt_hash,
        model_version, created_at)
       VALUES (?, ?, ?, ?, 'ASSISTANT', ?, NULL, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, session.id,
      assistantContent, MODEL_VERSION, timestamp,
    )
    if (input.sourceVoiceInputId) {
      consumeConfirmedVoiceInput(database, principal, {
        voiceInputId: input.sourceVoiceInputId,
        transcript: input.prompt,
        sessionId: session.id,
        cityId: input.cityId,
        householdMemberId: input.householdMemberId,
        timestamp,
      })
    }
    if (input.sourceImageInputId) {
      consumeConfirmedImageInput(database, principal, {
        imageInputId: input.sourceImageInputId,
        description: input.prompt,
        sessionId: session.id,
        cityId: input.cityId,
        householdMemberId: input.householdMemberId,
        timestamp,
      })
    }
    let draftId: string | null = null
    if (shouldDraft) {
      const candidate = candidates[0]!
      draftId = randomUUID()
      database.prepare(
        `INSERT INTO consumer_reservation_drafts
         (id, tenant_id, user_id, session_id, city_id, household_member_id,
          merchant_id, store_id, item_summary, party_size, reservation_at,
          customer_name, customer_phone_masked, amount_fen, status, order_id,
          version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING_CONFIRMATION',
                 NULL, 1, ?, ?)`,
      ).run(
        draftId, principal.tenantId, principal.subject, session.id,
        profile.preferred_city_id, profile.active_household_member_id,
        candidate.merchant_id, candidate.store_id,
        candidate.item_summary ?? `${candidate.merchant_name}订座`,
        partySizeFrom(input.prompt), nextReservationAt(), profile.display_name,
        profile.phone_masked, candidate.price_fen ?? 0, timestamp, timestamp,
      )
    }
    database.prepare(
      `UPDATE consumer_assistant_sessions
       SET version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, session.id)
    session = { ...session, version: session.version + 1, updated_at: timestamp }
    const payload = {
      sessionId: session.id,
      promptHash: hash(input.prompt.trim()),
      recommendationCount: candidates.length,
      reservationDraftCreated: draftId !== null,
      cityId: profile.preferred_city_id,
      householdMemberId: profile.active_household_member_id,
      modelVersion: MODEL_VERSION,
      policyVersion: POLICY_VERSION,
    }
    database.prepare(
      `INSERT INTO consumer_assistant_events
       (id, tenant_id, user_id, session_id, draft_id, type, risk_level,
        actor_id, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'TEXT_RESPONSE_GENERATED', 'L0', ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, session.id, draftId,
      principal.subject, 'AI 文本回复与推荐已生成', JSON.stringify(payload), timestamp,
    )
    recordAction(database, principal, {
      action: 'CONSUMER_ASSISTANT_MESSAGE_SENT',
      eventName: 'consumer_assistant_message_sent',
      entityType: 'consumer_assistant_session',
      entityId: session.id,
      riskLevel: 'L0',
      summary: '消费者 AI 文本请求已处理',
      payload,
      timestamp,
    })
    const response = overviewFor(database, principal, profile, session)
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function updateConsumerReservationDraft(
  database: DatabaseSync,
  principal: Principal,
  input: {
    draftId: string
    expectedVersion: number
    partySize: number
    reservationAt: string
  },
  idempotencyKey: string,
): ConsumerAssistantOverview {
  const route = `/api/v1/consumer/reservations/${input.draftId}/update`
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerAssistantOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay

  const reservationTime = Date.parse(input.reservationAt)
  if (
    !Number.isFinite(reservationTime)
    || reservationTime <= Date.now()
    || reservationTime > Date.now() + 90 * 24 * 60 * 60 * 1000
  ) {
    throw new DomainError(
      409,
      'consumer_reservation_time_invalid',
      '订座时间必须在未来 90 天内',
    )
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = profileFor(database, principal)
    const draft = database.prepare(
      `SELECT id, session_id, city_id, household_member_id, status, order_id,
              version, party_size, reservation_at
       FROM consumer_reservation_drafts
       WHERE id = ? AND tenant_id = ? AND user_id = ?`,
    ).get(input.draftId, principal.tenantId, principal.subject) as {
      id: string
      session_id: string
      city_id: string
      household_member_id: string
      status: 'WAITING_CONFIRMATION' | 'CONFIRMED'
      order_id: string | null
      version: number
      party_size: number
      reservation_at: string
    } | undefined
    if (!draft) {
      throw new DomainError(404, 'consumer_reservation_draft_not_found', '订座草稿不存在')
    }
    if (
      draft.version !== input.expectedVersion
      || draft.status !== 'WAITING_CONFIRMATION'
      || draft.order_id !== null
    ) {
      throw new DomainError(409, 'stale_entity_version', '草稿已提交或状态已更新，请刷新后重试')
    }
    if (
      draft.city_id !== profile.preferred_city_id
      || draft.household_member_id !== profile.active_household_member_id
    ) {
      throw new DomainError(409, 'consumer_reservation_context_stale', '城市或家庭身份已变化，请重新发起订座')
    }
    const timestamp = now()
    const updated = database.prepare(
      `UPDATE consumer_reservation_drafts
       SET party_size = ?, reservation_at = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status = 'WAITING_CONFIRMATION'
         AND order_id IS NULL`,
    ).run(
      input.partySize,
      input.reservationAt,
      timestamp,
      draft.id,
      input.expectedVersion,
    )
    if (updated.changes !== 1) {
      throw new DomainError(409, 'stale_entity_version', '草稿已被其他操作更新，请刷新后重试')
    }
    database.prepare(
      `UPDATE consumer_assistant_sessions
       SET version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, draft.session_id)
    const payload = {
      draftId: draft.id,
      fromPartySize: draft.party_size,
      toPartySize: input.partySize,
      fromReservationAt: draft.reservation_at,
      toReservationAt: input.reservationAt,
      draftVersion: draft.version + 1,
      policyVersion: POLICY_VERSION,
    }
    database.prepare(
      `INSERT INTO consumer_assistant_events
       (id, tenant_id, user_id, session_id, draft_id, type, risk_level,
        actor_id, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'RESERVATION_DRAFT_UPDATED', 'L1', ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, draft.session_id,
      draft.id, principal.subject, '消费者更新订座草稿人数与时间',
      JSON.stringify(payload), timestamp,
    )
    recordAction(database, principal, {
      action: 'CONSUMER_RESERVATION_DRAFT_UPDATED',
      eventName: 'consumer_reservation_draft_updated',
      entityType: 'consumer_reservation_draft',
      entityId: draft.id,
      riskLevel: 'L1',
      summary: '消费者保存订座草稿人数与时间',
      payload,
      timestamp,
    })
    const response = overviewFor(
      database,
      principal,
      profile,
      activeSession(database, principal, profile),
    )
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function confirmConsumerReservation(
  database: DatabaseSync,
  principal: Principal,
  input: {
    draftId: string
    expectedVersion: number
    confirmed: boolean
  },
  idempotencyKey: string,
): ConsumerAssistantOverview {
  const route = `/api/v1/consumer/reservations/${input.draftId}/confirm`
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerAssistantOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_confirmation_required', '提交订座前必须明确确认')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = profileFor(database, principal)
    const draft = database.prepare(
      `SELECT id, session_id, city_id, household_member_id, merchant_id, store_id,
              item_summary, party_size, reservation_at, customer_name,
              customer_phone_masked, amount_fen, status, order_id, version
       FROM consumer_reservation_drafts
       WHERE id = ? AND tenant_id = ? AND user_id = ?`,
    ).get(input.draftId, principal.tenantId, principal.subject) as {
      id: string
      session_id: string
      city_id: string
      household_member_id: string
      merchant_id: string
      store_id: string
      item_summary: string
      party_size: number
      reservation_at: string
      customer_name: string
      customer_phone_masked: string
      amount_fen: number
      status: 'WAITING_CONFIRMATION' | 'CONFIRMED'
      order_id: string | null
      version: number
    } | undefined
    if (!draft) {
      throw new DomainError(404, 'consumer_reservation_draft_not_found', '订座草稿不存在')
    }
    if (draft.version !== input.expectedVersion || draft.status !== 'WAITING_CONFIRMATION') {
      throw new DomainError(409, 'stale_entity_version', '订座草稿状态已更新，请刷新后重试')
    }
    if (
      draft.city_id !== profile.preferred_city_id
      || draft.household_member_id !== profile.active_household_member_id
    ) {
      throw new DomainError(409, 'consumer_reservation_context_stale', '城市或家庭身份已变化，请重新发起订座')
    }
    if (Date.parse(draft.reservation_at) <= Date.now()) {
      throw new DomainError(409, 'consumer_reservation_time_expired', '订座时间已过，请重新发起')
    }
    const timestamp = now()
    const orderId = randomUUID()
    const orderNo = `LQ${timestamp.replace(/\D/g, '').slice(2, 14)}${randomUUID().slice(0, 4).toUpperCase()}`
    database.prepare(
      `INSERT INTO merchant_orders
       (id, tenant_id, merchant_id, store_id, order_no, order_type, channel, status,
        customer_name, customer_phone_masked, item_summary, party_size, service_at,
        gross_amount_fen, discount_fen, paid_amount_fen, refund_amount_fen,
        verification_code_hash, verification_code_masked, exception_code,
        placed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'RESERVATION', 'SKILL', 'PENDING_CONFIRMATION',
               ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, NULL, ?, ?, ?)`,
    ).run(
      orderId, principal.tenantId, draft.merchant_id, draft.store_id, orderNo,
      draft.customer_name, draft.customer_phone_masked, draft.item_summary,
      draft.party_size, draft.reservation_at, draft.amount_fen,
      timestamp, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO merchant_order_events
       (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
        summary, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_RESERVATION_SUBMITTED',
               ?, NULL, 'PENDING_CONFIRMATION', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, draft.merchant_id, draft.store_id,
      orderId, principal.subject, '消费者明确确认并提交订座请求',
      JSON.stringify({
        draftId: draft.id,
        paidAmountFen: 0,
        policyVersion: POLICY_VERSION,
      }),
      timestamp,
    )
    database.prepare(
      `UPDATE consumer_reservation_drafts
       SET status = 'CONFIRMED', order_id = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status = 'WAITING_CONFIRMATION'`,
    ).run(orderId, timestamp, draft.id, input.expectedVersion)
    database.prepare(
      `UPDATE consumer_assistant_sessions
       SET version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, draft.session_id)
    database.prepare(
      `INSERT INTO consumer_messages
       (id, tenant_id, user_id, household_member_id, category, title, body,
        action_label, action_target, read_at, version, created_at)
       VALUES (?, ?, ?, ?, 'TRANSACTION', '订座请求已提交',
               ?, '查看进度', ?, NULL, 1, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject,
      draft.household_member_id,
      `${draft.item_summary}已提交商家确认，当前未扣款。`,
      `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(orderId)}`,
      timestamp,
    )
    const payload = {
      draftId: draft.id,
      orderId,
      storeId: draft.store_id,
      partySize: draft.party_size,
      reservationAt: draft.reservation_at,
      paidAmountFen: 0,
      policyVersion: POLICY_VERSION,
    }
    database.prepare(
      `INSERT INTO consumer_assistant_events
       (id, tenant_id, user_id, session_id, draft_id, type, risk_level,
        actor_id, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'RESERVATION_CONFIRMED', 'L2', ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, draft.session_id,
      draft.id, principal.subject, '消费者明确确认订座草稿',
      JSON.stringify(payload), timestamp,
    )
    recordAction(database, principal, {
      action: 'CONSUMER_RESERVATION_CONFIRMED',
      eventName: 'consumer_reservation_confirmed',
      entityType: 'merchant_order',
      entityId: orderId,
      riskLevel: 'L2',
      summary: '消费者明确确认后提交待商家确认的订座请求',
      payload,
      timestamp,
      outboxTopic: 'consumer.reservation.submitted.v1',
    })
    const session = activeSession(database, principal, profile)
    const response = overviewFor(database, principal, profile, session)
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function cancelConsumerReservation(
  database: DatabaseSync,
  principal: Principal,
  input: {
    draftId: string
    expectedVersion: number
    confirmed: boolean
    reason: string
  },
  idempotencyKey: string,
): ConsumerAssistantOverview {
  const route = `/api/v1/consumer/reservations/${input.draftId}/cancel`
  const requestHash = hash(input)
  const replay = requestReplay<ConsumerAssistantOverview>(
    database, idempotencyKey, route, requestHash,
  )
  if (replay) return replay
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_confirmation_required', '取消订座前必须明确确认')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = profileFor(database, principal)
    const row = database.prepare(
      `SELECT drafts.id, drafts.session_id, drafts.city_id,
              drafts.household_member_id, drafts.status AS draft_status,
              drafts.order_id, drafts.version AS draft_version,
              drafts.item_summary, drafts.reservation_at,
              orders.merchant_id, orders.store_id, orders.status AS order_status,
              orders.version AS order_version, orders.paid_amount_fen,
              payments.id AS payment_intent_id, payments.status AS payment_status
       FROM consumer_reservation_drafts drafts
       JOIN merchant_orders orders ON orders.id = drafts.order_id
       LEFT JOIN consumer_payment_intents payments ON payments.id = (
         SELECT id FROM consumer_payment_intents latest
         WHERE latest.draft_id = drafts.id
         ORDER BY latest.created_at DESC LIMIT 1
       )
       WHERE drafts.id = ? AND drafts.tenant_id = ? AND drafts.user_id = ?`,
    ).get(input.draftId, principal.tenantId, principal.subject) as {
      id: string
      session_id: string
      city_id: string
      household_member_id: string
      draft_status: 'WAITING_CONFIRMATION' | 'CONFIRMED'
      order_id: string
      draft_version: number
      item_summary: string
      reservation_at: string
      merchant_id: string
      store_id: string
      order_status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'CANCELLED' | string
      order_version: number
      paid_amount_fen: number
      payment_intent_id: string | null
      payment_status: string | null
    } | undefined
    if (!row) {
      throw new DomainError(404, 'consumer_reservation_not_found', '已提交的订座不存在')
    }
    if (row.draft_version !== input.expectedVersion || row.draft_status !== 'CONFIRMED') {
      throw new DomainError(409, 'stale_entity_version', '订座状态已更新，请刷新后重试')
    }
    if (
      row.city_id !== profile.preferred_city_id
      || row.household_member_id !== profile.active_household_member_id
    ) {
      throw new DomainError(409, 'consumer_reservation_context_stale', '城市或家庭身份已变化，请切回原身份后操作')
    }
    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(row.order_status)) {
      throw new DomainError(409, 'consumer_reservation_cannot_cancel', '当前订座状态不允许消费者取消')
    }
    if (row.paid_amount_fen !== 0) {
      throw new DomainError(409, 'consumer_reservation_refund_required', '已支付订座必须进入退款流程')
    }
    if (Date.parse(row.reservation_at) <= Date.now()) {
      throw new DomainError(409, 'consumer_reservation_started', '服务时间已开始，不能直接取消')
    }
    const timestamp = now()
    const updatedOrder = database.prepare(
      `UPDATE merchant_orders
       SET status = 'CANCELLED', version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status IN ('PENDING_CONFIRMATION', 'CONFIRMED')
         AND paid_amount_fen = 0`,
    ).run(timestamp, row.order_id, row.order_version)
    if (updatedOrder.changes !== 1) {
      throw new DomainError(409, 'stale_entity_version', '商户订单已更新，请刷新后重试')
    }
    if (row.payment_intent_id && row.payment_status === 'PENDING_PROVIDER') {
      database.prepare(
        `UPDATE consumer_payment_intents
         SET status = 'CANCELLED', version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'PENDING_PROVIDER'`,
      ).run(timestamp, row.payment_intent_id)
      const paymentPayload = {
        intentId: row.payment_intent_id,
        orderId: row.order_id,
        reason: input.reason,
        paidAmountFen: 0,
      }
      database.prepare(
        `INSERT INTO consumer_payment_events
         (id, tenant_id, user_id, intent_id, order_id, provider_event_id,
          type, summary, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'PAYMENT_CANCELLED', ?, ?, ?)`,
      ).run(
        randomUUID(), principal.tenantId, principal.subject,
        row.payment_intent_id, row.order_id,
        '零支付订座取消时同步关闭待连接器支付意图',
        JSON.stringify(paymentPayload), timestamp,
      )
      database.prepare(
        `INSERT INTO outbox_events
         (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
         VALUES (?, 'consumer-payment-e8e', ?, 'consumer.payment.cancelled.v1', ?, ?, ?)`,
      ).run(
        randomUUID(), principal.tenantId, row.payment_intent_id,
        JSON.stringify(paymentPayload), timestamp,
      )
    }
    database.prepare(
      `UPDATE consumer_reservation_drafts
       SET version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).run(timestamp, row.id, input.expectedVersion)
    database.prepare(
      `UPDATE consumer_assistant_sessions
       SET version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(timestamp, row.session_id)
    const payload = {
      draftId: row.id,
      orderId: row.order_id,
      reason: input.reason,
      fromStatus: row.order_status,
      toStatus: 'CANCELLED',
      paidAmountFen: row.paid_amount_fen,
      policyVersion: POLICY_VERSION,
    }
    database.prepare(
      `INSERT INTO merchant_order_events
       (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
        summary, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_RESERVATION_CANCELLED',
               ?, ?, 'CANCELLED', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, row.merchant_id, row.store_id,
      row.order_id, principal.subject, '消费者明确确认取消零支付订座',
      row.order_status, JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_assistant_events
       (id, tenant_id, user_id, session_id, draft_id, type, risk_level,
        actor_id, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'RESERVATION_CANCELLED', 'L2', ?, ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, row.session_id,
      row.id, principal.subject, '消费者明确确认取消订座',
      JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_messages
       (id, tenant_id, user_id, household_member_id, category, title, body,
        action_label, action_target, read_at, version, created_at)
       VALUES (?, ?, ?, ?, 'TRANSACTION', '订座已取消',
               ?, NULL, NULL, NULL, 1, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject,
      row.household_member_id,
      `${row.item_summary}已取消，当前没有支付或退款事项。`,
      timestamp,
    )
    recordAction(database, principal, {
      action: 'CONSUMER_RESERVATION_CANCELLED',
      eventName: 'consumer_reservation_cancelled',
      entityType: 'merchant_order',
      entityId: row.order_id,
      riskLevel: 'L2',
      summary: '消费者明确确认取消零支付订座',
      payload,
      timestamp,
      outboxTopic: 'consumer.reservation.cancelled.v1',
    })
    const response = overviewFor(
      database,
      principal,
      profile,
      activeSession(database, principal, profile),
    )
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
