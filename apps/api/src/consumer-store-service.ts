import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  ConsumerDealDraftSummary,
  ConsumerStoreDetailOverview,
  ConsumerStoreOfferSummary,
} from '@lequ/contracts'
import { deriveConsumerDealVerificationCode } from './consumer-deal-credential-service.js'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-store-e8h'
const DRAFT_ROUTE = '/api/v1/consumer/stores/:storeId/offers/:offerId/drafts'
export const CONSUMER_DEAL_EXPIRY_SCAN_INTERVAL_SECONDS = 60

interface ProfileRow {
  tenant_id: string
  preferred_city_id: string
  active_household_member_id: string
  display_name: string
  phone_masked: string
}

interface OfferRow {
  offer_id: string
  kind: 'GROUP_BUY' | 'RESERVATION'
  offer_version: number
  valid_from: string
  valid_until: string
  usable_weekdays_json: string
  daily_start_time: string
  daily_end_time: string
  refund_rule: string
  redemption_rule: string
  store_id: string
  merchant_id: string
  store_name: string
  city_id: string
  city_name: string
  address: string
  business_hours: string
  category: string
  rating: number
  review_count: number
  badges_json: string
  tags_json: string
  recommendation_reason: string
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  location_confidence: number | null
  spu_id: string
  spu_name: string
  spu_category: string
  description: string
  sku_id: string
  sku_name: string
  attributes_json: string
  price_fen: number
  compare_at_fen: number | null
  stock_mode: 'FINITE' | 'UNLIMITED' | 'SLOT'
  stock_quantity: number
  low_stock_threshold: number
  sku_status: 'ACTIVE' | 'OUT_OF_STOCK'
  pricing_rule_version: string
  available_slots: number
}

interface ReservationSlotRow {
  id: string
  weekday: number
  start_time: string
  end_time: string
  capacity: number
  reserved: number
  price_override_fen: number | null
  version: number
}

interface DraftRow {
  id: string
  status: 'WAITING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED'
  version: number
  kind: 'GROUP_BUY' | 'RESERVATION'
  store_id: string
  store_name: string
  offer_id: string
  title: string
  sku_name: string
  quantity: number
  service_at: string | null
  unit_price_fen: number
  total_amount_fen: number
  pricing_rule_version: string
  offer_version: number
  order_id: string | null
  order_status: ConsumerDealDraftSummary['orderStatus']
  payment_status: 'PENDING_PROVIDER' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'LATE_SUCCEEDED' | null
  refund_status: 'REQUESTED' | 'APPROVED_PENDING_PROVIDER' | 'REFUNDED' | 'FAILED' | null
  hold_status: 'HELD' | 'CONSUMED' | 'RELEASED' | 'FULFILLED' | null
  verification_status: 'ISSUED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED' | null
  verification_code_masked: string | null
  verification_nonce: string | null
  verification_expires_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface CreateConsumerDealDraftInput {
  storeId: string
  offerId: string
  cityId: string
  householdMemberId: string
  quantity: number
  serviceAt?: string | undefined
  acknowledgedTerms: boolean
}

export interface ConfirmConsumerDealDraftInput {
  draftId: string
  expectedVersion: number
  confirmed: boolean
}

function now(): string { return new Date().toISOString() }
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function serviceWeekday(value: string): number {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function scopedIdempotencyRoute(route: string, principal: Principal): string {
  return `${route}#tenant=${encodeURIComponent(principal.tenantId)}&user=${encodeURIComponent(principal.subject)}`
}

function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不是消费者本人')
  }
}

function profileRow(database: DatabaseSync, principal: Principal): ProfileRow {
  const row = database.prepare(
    `SELECT tenant_id, preferred_city_id, active_household_member_id,
            display_name, phone_masked
     FROM consumer_profiles WHERE user_id = ? AND tenant_id = ?`,
  ).get(principal.subject, principal.tenantId) as ProfileRow | undefined
  if (!row) throw new DomainError(404, 'consumer_profile_not_found', '消费者资料不存在')
  return row
}

function assertContext(profile: ProfileRow, cityId: string, householdMemberId: string): void {
  if (profile.preferred_city_id !== cityId || profile.active_household_member_id !== householdMemberId) {
    throw new DomainError(409, 'consumer_context_stale', '城市或家庭身份已变化，请刷新后重试')
  }
}

function offerRows(database: DatabaseSync, principal: Principal, storeId: string): OfferRow[] {
  const timestamp = now()
  const rows = database.prepare(
    `SELECT deals.id AS offer_id, deals.kind, deals.version AS offer_version,
            deals.valid_from, deals.valid_until, deals.usable_weekdays_json,
            deals.daily_start_time, deals.daily_end_time, deals.refund_rule,
            deals.redemption_rule, stores.id AS store_id, stores.merchant_id,
            stores.name AS store_name, stores.city_id, stores.city_name,
            stores.address, stores.business_hours, publications.category,
            publications.rating, publications.review_count,
            publications.badges_json, publications.tags_json,
            publications.recommendation_reason, locations.latitude,
            locations.longitude, locations.geocode_source,
            locations.confidence AS location_confidence,
            spus.id AS spu_id, spus.name AS spu_name, spus.category AS spu_category,
            spus.description, skus.id AS sku_id, skus.name AS sku_name,
            skus.attributes_json, skus.price_fen, skus.compare_at_fen,
            skus.stock_mode, skus.stock_quantity, skus.low_stock_threshold,
            skus.status AS sku_status, skus.pricing_rule_version,
            (SELECT COUNT(*) FROM merchant_service_slots slots
             WHERE slots.sku_id = skus.id AND slots.status = 'ACTIVE'
               AND slots.capacity > slots.reserved) AS available_slots
     FROM consumer_deal_publications deals
     JOIN consumer_store_publications publications ON publications.store_id = deals.store_id
     JOIN merchant_stores stores ON stores.id = deals.store_id
     JOIN merchant_catalogs catalogs ON catalogs.store_id = stores.id
     JOIN merchant_spus spus ON spus.id = deals.spu_id AND spus.catalog_id = catalogs.id
     JOIN merchant_skus skus ON skus.id = deals.sku_id AND skus.spu_id = spus.id
     LEFT JOIN consumer_store_locations locations ON locations.store_id = stores.id
     WHERE deals.tenant_id = ? AND deals.store_id = ?
       AND deals.status = 'PUBLISHED' AND deals.valid_from <= ? AND deals.valid_until >= ?
       AND publications.visibility_status = 'PUBLISHED'
       AND publications.authorization_scope = 'PLATFORM_DISPLAY'
       AND stores.operating_status = 'OPEN'
       AND catalogs.status = 'ACTIVE' AND spus.status = 'ACTIVE'
       AND skus.status IN ('ACTIVE', 'OUT_OF_STOCK')
     ORDER BY CASE deals.kind WHEN 'GROUP_BUY' THEN 0 ELSE 1 END, spus.sort_order, skus.price_fen`,
  ).all(principal.tenantId, storeId, timestamp, timestamp) as unknown as OfferRow[]
  return rows
}

function stockStatus(row: OfferRow): ConsumerStoreOfferSummary['stockStatus'] {
  if (row.sku_status === 'OUT_OF_STOCK') return 'SOLD_OUT'
  if (row.stock_mode === 'SLOT') return row.available_slots > 0 ? 'AVAILABLE' : 'SOLD_OUT'
  if (row.stock_mode === 'UNLIMITED') return 'AVAILABLE'
  if (row.stock_quantity <= 0) return 'SOLD_OUT'
  return row.stock_quantity <= row.low_stock_threshold ? 'LOW_STOCK' : 'AVAILABLE'
}

function reservationSlotRows(database: DatabaseSync, row: OfferRow): ReservationSlotRow[] {
  if (row.kind !== 'RESERVATION') return []
  const allowedWeekdays = JSON.parse(row.usable_weekdays_json) as number[]
  const rows = database.prepare(
    `SELECT id, weekday, start_time, end_time, capacity, reserved,
            price_override_fen, version
     FROM merchant_service_slots
     WHERE sku_id = ? AND status = 'ACTIVE' AND capacity > reserved
     ORDER BY weekday, start_time`,
  ).all(row.sku_id) as unknown as ReservationSlotRow[]
  return rows.filter((slot) =>
    allowedWeekdays.includes(slot.weekday)
    && slot.start_time >= row.daily_start_time
    && slot.start_time <= row.daily_end_time)
}

function toOffer(
  database: DatabaseSync,
  row: OfferRow,
): ConsumerStoreOfferSummary {
  const slots = reservationSlotRows(database, row)
  const status = row.stock_mode === 'SLOT'
    ? (slots.length > 0 ? 'AVAILABLE' : 'SOLD_OUT')
    : stockStatus(row)
  return {
    id: row.offer_id,
    spuId: row.spu_id,
    kind: row.kind,
    title: row.spu_name,
    skuName: row.sku_name,
    category: row.spu_category,
    description: row.description,
    attributes: JSON.parse(row.attributes_json) as Record<string, string>,
    priceFen: row.price_fen,
    compareAtFen: row.compare_at_fen,
    stockStatus: status,
    stockRemaining: row.stock_mode === 'FINITE' ? row.stock_quantity : null,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    usableWeekdays: JSON.parse(row.usable_weekdays_json) as number[],
    dailyUsableTime: `${row.daily_start_time}–${row.daily_end_time}`,
    refundRule: row.refund_rule,
    redemptionRule: row.redemption_rule,
    reservationSlots: slots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startTime: slot.start_time,
      endTime: slot.end_time,
      remainingCapacity: slot.capacity - slot.reserved,
      priceFen: slot.price_override_fen ?? row.price_fen,
      priceOverrideFen: slot.price_override_fen,
      version: slot.version,
    })),
    canCreateDraft: status !== 'SOLD_OUT',
    actionTarget: `/pages/store/index?storeId=${encodeURIComponent(row.store_id)}&offerId=${encodeURIComponent(row.offer_id)}`,
    version: row.offer_version,
  }
}

function toDraft(row: DraftRow): ConsumerDealDraftSummary {
  const paymentStatus = row.payment_status ?? 'NOT_REQUIRED'
  const refundStatus = row.refund_status ?? 'NONE'
  const holdStatus = row.hold_status ?? 'NONE'
  const verificationStatus = row.verification_status === 'ISSUED'
    && row.verification_expires_at !== null
    && Date.parse(row.verification_expires_at) <= Date.now()
    ? 'EXPIRED'
    : (row.verification_status ?? 'NOT_ISSUED')
  const serviceHasStarted = row.service_at !== null && Date.parse(row.service_at) <= Date.now()
  const orderCanChange = row.order_status !== 'VERIFIED'
    && row.order_status !== 'COMPLETED'
    && row.order_status !== 'REFUNDED'
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    kind: row.kind,
    storeId: row.store_id,
    storeName: row.store_name,
    offerId: row.offer_id,
    title: row.title,
    skuName: row.sku_name,
    quantity: row.quantity,
    serviceAt: row.service_at,
    unitPriceFen: row.unit_price_fen,
    totalAmountFen: row.total_amount_fen,
    pricingRuleVersion: row.pricing_rule_version,
    offerVersion: row.offer_version,
    orderId: row.order_id,
    orderStatus: row.order_status,
    paymentStatus,
    refundStatus,
    holdStatus,
    verificationStatus,
    verificationCode: verificationStatus === 'ISSUED' && row.verification_nonce
      ? deriveConsumerDealVerificationCode(row.verification_nonce)
      : null,
    verificationCodeMasked: row.verification_code_masked,
    canConfirm: row.status === 'WAITING_CONFIRMATION' && Date.parse(row.expires_at) > Date.now(),
    canCancel: row.status === 'WAITING_CONFIRMATION'
      || (row.status === 'CONFIRMED'
        && row.order_status !== 'CANCELLED'
        && orderCanChange
        && !serviceHasStarted
        && refundStatus === 'NONE'
        && ['NOT_REQUIRED', 'PENDING_PROVIDER', 'FAILED', 'CANCELLED'].includes(paymentStatus)),
    canRequestRefund: row.status === 'CONFIRMED'
      && orderCanChange
      && !serviceHasStarted
      && paymentStatus === 'SUCCEEDED'
      && refundStatus === 'NONE',
    expiresAt: row.expires_at,
    confirmationNotice: row.status === 'WAITING_CONFIRMATION'
      ? '这只是待确认草稿：尚未创建订单、未占用库存、未生成核销凭证，也未发起扣款。'
      : row.status === 'EXPIRED'
        ? '草稿或待支付占用已过期释放；订单已取消，未生成核销凭证。'
        : row.refund_status === 'REFUNDED'
          ? '支付连接器已确认退款成功，订单与资源补偿均已完成。'
          : row.refund_status === 'APPROVED_PENDING_PROVIDER'
            ? '退款已批准并提交支付连接器，资金结果仍待签名回调确认。'
            : row.refund_status === 'REQUESTED'
              ? '全额退款申请已提交，等待商家强确认；当前尚未宣称退款成功。'
              : row.payment_status === 'LATE_SUCCEEDED'
                ? '订单取消后收到迟到支付成功事实，系统已进入补偿退款，不会恢复订单或资源。'
                : row.payment_status === 'SUCCEEDED'
                  ? '支付连接器已确认付款成功，资源已转为履约占用，等待商家接单。'
                  : row.payment_status === 'FAILED'
                    ? '支付连接器确认失败，订单已取消且库存或预约容量已释放。'
                    : row.payment_status === 'PENDING_PROVIDER'
          ? '订单与库存占用已原子建立，当前仅等待支付连接器；不代表已经扣款。'
                      : '零支付订单已提交商家确认，库存或预约容量已原子占用。',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function latestDraft(
  database: DatabaseSync,
  principal: Principal,
  storeId: string,
): ConsumerDealDraftSummary | null {
  const row = database.prepare(
    `SELECT drafts.id, COALESCE(states.status, 'WAITING_CONFIRMATION') AS status,
            COALESCE(states.version, drafts.version) AS version, drafts.kind,
            drafts.store_id, stores.name AS store_name, drafts.offer_id,
            drafts.title, drafts.sku_name, drafts.quantity, drafts.service_at,
            drafts.unit_price_fen, drafts.total_amount_fen,
            drafts.pricing_rule_version, drafts.offer_version,
            states.order_id, orders.status AS order_status,
            payments.status AS payment_status, refunds.status AS refund_status,
            holds.status AS hold_status, credentials.status AS verification_status,
            credentials.code_masked AS verification_code_masked,
            credentials.derivation_nonce AS verification_nonce,
            credentials.expires_at AS verification_expires_at,
            COALESCE(holds.expires_at, drafts.expires_at) AS expires_at,
            drafts.created_at, states.updated_at
     FROM consumer_deal_drafts drafts
     JOIN merchant_stores stores ON stores.id = drafts.store_id
     LEFT JOIN consumer_deal_checkout_states states ON states.draft_id = drafts.id
     LEFT JOIN merchant_orders orders ON orders.id = states.order_id
     LEFT JOIN consumer_deal_payment_intents payments ON payments.id = states.payment_intent_id
     LEFT JOIN consumer_deal_refund_requests refunds ON refunds.id = (
       SELECT refund_rows.id FROM consumer_deal_refund_requests refund_rows
       WHERE refund_rows.draft_id = drafts.id
       ORDER BY refund_rows.updated_at DESC, refund_rows.created_at DESC LIMIT 1
     )
     LEFT JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = drafts.id
     LEFT JOIN consumer_deal_redemption_credentials credentials ON credentials.draft_id = drafts.id
     WHERE drafts.tenant_id = ? AND drafts.user_id = ? AND drafts.store_id = ?
     ORDER BY COALESCE(states.updated_at, drafts.updated_at) DESC LIMIT 1`,
  ).get(principal.tenantId, principal.subject, storeId) as DraftRow | undefined
  return row ? toDraft(row) : null
}

export function getConsumerStoreDetail(
  database: DatabaseSync,
  principal: Principal,
  storeId: string,
): ConsumerStoreDetailOverview {
  requireConsumer(principal)
  const profile = profileRow(database, principal)
  const rows = offerRows(database, principal, storeId)
  const store = database.prepare(
    `SELECT stores.id, stores.merchant_id, stores.name, stores.city_id,
            stores.city_name, stores.address, stores.business_hours,
            publications.category, publications.rating, publications.review_count,
            publications.badges_json, publications.tags_json,
            publications.recommendation_reason, locations.latitude,
            locations.longitude, locations.geocode_source, locations.confidence
     FROM consumer_store_publications publications
     JOIN merchant_stores stores ON stores.id = publications.store_id
     LEFT JOIN consumer_store_locations locations ON locations.store_id = stores.id
     WHERE publications.tenant_id = ? AND stores.id = ?
       AND publications.city_id = ? AND publications.visibility_status = 'PUBLISHED'
       AND publications.authorization_scope = 'PLATFORM_DISPLAY'
       AND stores.operating_status = 'OPEN'`,
  ).get(principal.tenantId, storeId, profile.preferred_city_id) as {
    id: string
    merchant_id: string
    name: string
    city_id: string
    city_name: string
    address: string
    business_hours: string
    category: string
    rating: number
    review_count: number
    badges_json: string
    tags_json: string
    recommendation_reason: string
    latitude: number | null
    longitude: number | null
    geocode_source: string | null
    confidence: number | null
  } | undefined
  if (!store) throw new DomainError(404, 'consumer_store_not_found', '门店不存在或当前不可展示')
  return {
    context: {
      cityId: profile.preferred_city_id,
      householdMemberId: profile.active_household_member_id,
    },
    store: {
      id: store.id,
      merchantId: store.merchant_id,
      name: store.name,
      category: store.category,
      cityId: store.city_id,
      cityName: store.city_name,
      address: store.address,
      businessHours: store.business_hours,
      rating: store.rating,
      reviewCount: store.review_count,
      badges: JSON.parse(store.badges_json) as string[],
      tags: JSON.parse(store.tags_json) as string[],
      recommendationReason: store.recommendation_reason,
      coordinates: store.latitude === null || store.longitude === null
        ? null
        : {
            latitude: store.latitude,
            longitude: store.longitude,
            source: store.geocode_source ?? 'UNKNOWN',
            confidence: store.confidence ?? 0,
          },
    },
    offers: rows.map((row) => toOffer(database, row)),
    latestDraft: latestDraft(database, principal, storeId),
    policy: {
      version: 'consumer-store-detail-policy-v1',
      selfScopeEnforced: true,
      publishedStoreRequired: true,
      platformDisplayAuthorizationRequired: true,
      activeCatalogRequired: true,
      livePriceAndStockRequired: true,
      explicitConfirmationRequired: true,
      draftDoesNotCreateOrder: true,
      draftDoesNotCharge: true,
    },
    updatedAt: now(),
  }
}

function replay(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
): ConsumerStoreDetailOverview | null {
  const row = database.prepare(
    'SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?',
  ).get(key, route) as { request_hash: string; response_json: string } | undefined
  if (!row) return null
  if (row.request_hash !== requestHash) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同的套餐草稿请求')
  }
  return JSON.parse(row.response_json) as ConsumerStoreDetailOverview
}

export function createConsumerDealDraft(
  database: DatabaseSync,
  principal: Principal,
  input: CreateConsumerDealDraftInput,
  idempotencyKey: string,
): ConsumerStoreDetailOverview {
  requireConsumer(principal)
  if (!input.acknowledgedTerms) {
    throw new DomainError(422, 'deal_terms_acknowledgement_required', '请先核对价格、有效期和使用规则')
  }
  const route = scopedIdempotencyRoute(DRAFT_ROUTE, principal)
  const requestHash = hash(input)
  const prior = replay(database, idempotencyKey, route, requestHash)
  if (prior) return prior
  const profile = profileRow(database, principal)
  assertContext(profile, input.cityId, input.householdMemberId)
  const row = offerRows(database, principal, input.storeId)
    .find((candidate) => candidate.offer_id === input.offerId)
  if (!row) throw new DomainError(404, 'consumer_offer_not_found', '套餐不存在或已经不可售')
  if (stockStatus(row) === 'SOLD_OUT') {
    throw new DomainError(409, 'consumer_offer_sold_out', '套餐当前不可售，无法建立草稿')
  }
  if (row.stock_mode === 'FINITE' && row.stock_quantity < input.quantity) {
    throw new DomainError(409, 'consumer_offer_stock_insufficient', '可售库存不足，无法建立草稿')
  }
  let serviceAt: string | null = null
  let selectedSlot: ReservationSlotRow | null = null
  if (row.kind === 'RESERVATION') {
    if (!input.serviceAt) throw new DomainError(422, 'deal_service_time_required', '预约套餐必须选择服务时间')
    const instant = new Date(input.serviceAt)
    if (Number.isNaN(instant.getTime()) || instant.getTime() <= Date.now()) {
      throw new DomainError(422, 'deal_service_time_invalid', '服务时间必须是未来有效时间')
    }
    if (
      instant.getTime() < new Date(row.valid_from).getTime()
      || instant.getTime() > new Date(row.valid_until).getTime()
    ) {
      throw new DomainError(422, 'deal_service_time_outside_validity', '服务时间不在套餐有效期内')
    }
    const weekday = serviceWeekday(input.serviceAt)
    const time = input.serviceAt.slice(11, 16)
    const allowed = JSON.parse(row.usable_weekdays_json) as number[]
    if (!allowed.includes(weekday) || time < row.daily_start_time || time > row.daily_end_time) {
      throw new DomainError(422, 'deal_service_time_outside_usage_window', '服务时间不在套餐可用时段内')
    }
    const candidate = database.prepare(
      `SELECT id, weekday, start_time, end_time, capacity, reserved,
              price_override_fen, version
       FROM merchant_service_slots
       WHERE sku_id = ? AND weekday = ? AND start_time = ?
         AND status = 'ACTIVE' AND capacity - reserved >= ?`,
    ).get(row.sku_id, weekday, time, input.quantity) as ReservationSlotRow | undefined
    selectedSlot = candidate ?? null
    if (!selectedSlot) throw new DomainError(409, 'deal_service_slot_unavailable', '所选预约时段当前无足够容量')
    serviceAt = input.serviceAt
  } else if (input.serviceAt) {
    throw new DomainError(422, 'deal_service_time_not_supported', '到店团购草稿不需要选择预约时间')
  }

  const timestamp = now()
  const draftId = randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
  const unitPriceFen = selectedSlot?.price_override_fen ?? row.price_fen
  const totalAmountFen = unitPriceFen * input.quantity
  database.exec('BEGIN IMMEDIATE;')
  try {
    const concurrentPrior = replay(database, idempotencyKey, route, requestHash)
    if (concurrentPrior) {
      database.exec('COMMIT;')
      return concurrentPrior
    }
    database.prepare(
      `INSERT INTO consumer_deal_drafts
       (id, tenant_id, user_id, city_id, household_member_id, store_id,
        offer_id, sku_id, kind, status, title, sku_name, quantity, service_at,
        unit_price_fen, total_amount_fen, pricing_rule_version, offer_version,
        expires_at, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING_CONFIRMATION', ?, ?, ?, ?,
               ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      draftId, principal.tenantId, principal.subject, input.cityId,
      input.householdMemberId, row.store_id, row.offer_id, row.sku_id, row.kind,
      row.spu_name, row.sku_name, input.quantity, serviceAt, unitPriceFen,
      totalAmountFen, row.pricing_rule_version, row.offer_version, expiresAt,
      timestamp, timestamp,
    )
    const payload = {
      offerId: row.offer_id,
      skuId: row.sku_id,
      kind: row.kind,
      quantity: input.quantity,
      unitPriceFen,
      totalAmountFen,
      pricingRuleVersion: row.pricing_rule_version,
      offerVersion: row.offer_version,
      serviceAt,
      status: 'WAITING_CONFIRMATION',
    }
    if (selectedSlot && serviceAt) {
      database.prepare(
        `INSERT INTO consumer_deal_draft_slot_snapshots
         (draft_id, tenant_id, slot_id, slot_version, price_override_fen,
          effective_unit_price_fen, service_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        draftId, principal.tenantId, selectedSlot.id, selectedSlot.version,
        selectedSlot.price_override_fen, unitPriceFen, serviceAt, timestamp,
      )
      Object.assign(payload, {
        slotId: selectedSlot.id,
        slotVersion: selectedSlot.version,
        priceOverrideFen: selectedSlot.price_override_fen,
      })
    }
    database.prepare(
      `INSERT INTO consumer_deal_events
       (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'DRAFT_CREATED', '消费者核对规则后建立待确认套餐草稿', ?, ?)`,
    ).run(randomUUID(), principal.tenantId, principal.subject, draftId, JSON.stringify(payload), timestamp)
    database.prepare(
      `INSERT INTO consumer_deal_checkout_states
       (draft_id, tenant_id, user_id, status, order_id, payment_intent_id,
        version, confirmed_at, expired_at, updated_at)
       VALUES (?, ?, ?, 'WAITING_CONFIRMATION', NULL, NULL, 1, NULL, NULL, ?)`,
    ).run(draftId, principal.tenantId, principal.subject, timestamp)
    database.prepare(
      `INSERT INTO audit_events
       (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
        risk_level, result, summary, payload_json, created_at)
       VALUES (?, ?, ?, 'CONSUMER', 'CONSUMER_DEAL_DRAFT_CREATED',
               'consumer_deal_draft', ?, 'L1', 'SUCCESS',
               '消费者建立待确认套餐草稿，未创建订单或扣款', ?, ?)`,
    ).run(randomUUID(), RUN_ID, principal.tenantId, draftId, JSON.stringify(payload), timestamp)
    database.prepare(
      `INSERT INTO tracking_events
       (id, run_id, tenant_id, name, properties_json, created_at)
       VALUES (?, ?, ?, 'consumer.deal.draft.created', ?, ?)`,
    ).run(randomUUID(), RUN_ID, principal.tenantId, JSON.stringify(payload), timestamp)
    const response = getConsumerStoreDetail(database, principal, input.storeId)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, requestHash, JSON.stringify(response), timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function releaseExpiredConsumerDealCheckouts(
  database: DatabaseSync,
  timestamp = now(),
): { expiredDrafts: number; releasedHolds: number } {
  const expiredAt = Date.parse(timestamp)
  if (Number.isNaN(expiredAt)) {
    throw new DomainError(400, 'deal_expiry_timestamp_invalid', '过期扫描时间无效')
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const waiting = database.prepare(
      `SELECT drafts.id, drafts.tenant_id, drafts.user_id
       FROM consumer_deal_drafts drafts
       JOIN consumer_deal_checkout_states states ON states.draft_id = drafts.id
       WHERE states.status = 'WAITING_CONFIRMATION' AND drafts.expires_at <= ?`,
    ).all(timestamp) as unknown as Array<{ id: string; tenant_id: string; user_id: string }>
    const held = database.prepare(
      `SELECT holds.id, holds.draft_id, holds.tenant_id, holds.user_id,
              holds.order_id, holds.sku_id, holds.slot_id, holds.quantity,
              drafts.household_member_id, payments.id AS payment_intent_id,
              payments.provider_request_id, orders.merchant_id, orders.store_id,
              orders.status AS order_status, skus.stock_mode
       FROM consumer_deal_fulfillment_holds holds
       JOIN consumer_deal_checkout_states states ON states.draft_id = holds.draft_id
       JOIN consumer_deal_drafts drafts ON drafts.id = holds.draft_id
       JOIN consumer_deal_payment_intents payments
         ON payments.draft_id = holds.draft_id AND payments.status = 'PENDING_PROVIDER'
       JOIN merchant_orders orders ON orders.id = holds.order_id
       JOIN merchant_skus skus ON skus.id = holds.sku_id
       WHERE holds.status = 'HELD' AND holds.expires_at <= ?
         AND states.status = 'CONFIRMED'
         AND orders.status IN ('PENDING_CONFIRMATION', 'CONFIRMED')`,
    ).all(timestamp) as unknown as Array<{
      id: string
      draft_id: string
      tenant_id: string
      user_id: string
      order_id: string
      sku_id: string
      slot_id: string | null
      quantity: number
      household_member_id: string
      payment_intent_id: string
      provider_request_id: string
      merchant_id: string
      store_id: string
      order_status: 'PENDING_CONFIRMATION' | 'CONFIRMED'
      stock_mode: 'FINITE' | 'UNLIMITED' | 'SLOT'
    }>
    if (!waiting.length && !held.length) {
      database.exec('COMMIT;')
      return { expiredDrafts: 0, releasedHolds: 0 }
    }
    for (const row of waiting) {
      database.prepare(
        `UPDATE consumer_deal_checkout_states
         SET status = 'EXPIRED', version = version + 1, expired_at = ?, updated_at = ?
         WHERE draft_id = ? AND status = 'WAITING_CONFIRMATION'`,
      ).run(timestamp, timestamp, row.id)
      database.prepare(
        `INSERT INTO consumer_deal_events
         (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'DRAFT_EXPIRED', '待确认套餐草稿已过期，未创建订单或占用资源', ?, ?)`,
      ).run(
        randomUUID(), row.tenant_id, row.user_id, row.id,
        JSON.stringify({ draftId: row.id, expiredAt: timestamp, resourceReleased: false }),
        timestamp,
      )
    }
    for (const row of held) {
      if (row.slot_id) {
        const changed = database.prepare(
          `UPDATE merchant_service_slots
           SET reserved = MAX(0, reserved - ?), updated_at = ?
           WHERE id = ? AND reserved >= ?`,
        ).run(row.quantity, timestamp, row.slot_id, row.quantity)
        if (Number(changed.changes) !== 1) {
          throw new DomainError(409, 'deal_hold_resource_inconsistent', '预约占用状态不一致，已停止自动释放')
        }
      } else if (row.stock_mode === 'FINITE') {
        const changed = database.prepare(
          `UPDATE merchant_skus
           SET stock_quantity = stock_quantity + ?,
               status = CASE WHEN status = 'OUT_OF_STOCK' THEN 'ACTIVE' ELSE status END,
               version = version + 1, updated_at = ?
           WHERE id = ?`,
        ).run(row.quantity, timestamp, row.sku_id)
        if (Number(changed.changes) !== 1) {
          throw new DomainError(409, 'deal_hold_resource_inconsistent', '库存占用状态不一致，已停止自动释放')
        }
      }
      const released = database.prepare(
        `UPDATE consumer_deal_fulfillment_holds
         SET status = 'RELEASED', released_at = ?, updated_at = ?
         WHERE id = ? AND status = 'HELD'`,
      ).run(timestamp, timestamp, row.id)
      if (Number(released.changes) !== 1) {
        throw new DomainError(409, 'deal_hold_state_changed', '占用状态已变化，已停止重复释放')
      }
      const paymentCancelled = database.prepare(
        `UPDATE consumer_deal_payment_intents
         SET status = 'CANCELLED', cancelled_at = ?, version = version + 1, updated_at = ?
         WHERE draft_id = ? AND status = 'PENDING_PROVIDER'`,
      ).run(timestamp, timestamp, row.draft_id)
      if (Number(paymentCancelled.changes) !== 1) {
        throw new DomainError(409, 'deal_payment_state_changed', '支付意图状态已变化，已停止重复释放')
      }
      const orderCancelled = database.prepare(
        `UPDATE merchant_orders
         SET status = 'CANCELLED', version = version + 1, updated_at = ?
         WHERE id = ? AND status = ?`,
      ).run(timestamp, row.order_id, row.order_status)
      if (Number(orderCancelled.changes) !== 1) {
        throw new DomainError(409, 'deal_order_state_changed', '订单状态已变化，已停止重复释放')
      }
      const checkoutExpired = database.prepare(
        `UPDATE consumer_deal_checkout_states
         SET status = 'EXPIRED', version = version + 1, expired_at = ?, updated_at = ?
         WHERE draft_id = ? AND status = 'CONFIRMED'`,
      ).run(timestamp, timestamp, row.draft_id)
      if (Number(checkoutExpired.changes) !== 1) {
        throw new DomainError(409, 'deal_checkout_state_changed', '结算状态已变化，已停止重复释放')
      }
      const payload = {
        draftId: row.draft_id,
        orderId: row.order_id,
        paymentIntentId: row.payment_intent_id,
        providerRequestId: row.provider_request_id,
        skuId: row.sku_id,
        slotId: row.slot_id,
        quantity: row.quantity,
        expiredAt: timestamp,
        reason: 'PAYMENT_HOLD_EXPIRED',
        resourceReleased: true,
      }
      database.prepare(
        `INSERT INTO consumer_deal_events
         (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'HOLD_RELEASED', '待支付占用过期，库存或预约容量已释放', ?, ?)`,
      ).run(
        randomUUID(), row.tenant_id, row.user_id, row.draft_id,
        JSON.stringify(payload), timestamp,
      )
      database.prepare(
        `INSERT INTO merchant_order_events
         (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
          summary, from_status, to_status, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_DEAL_PAYMENT_EXPIRED',
                 '待支付超时，订单取消并释放占用', ?,
                 'CANCELLED', ?, ?)`,
      ).run(
        randomUUID(), row.tenant_id, row.merchant_id, row.store_id,
        row.order_id, row.user_id, row.order_status, JSON.stringify(payload), timestamp,
      )
      database.prepare(
        `INSERT INTO consumer_messages
         (id, tenant_id, user_id, household_member_id, category, title, body,
          action_label, action_target, read_at, version, created_at)
         VALUES (?, ?, ?, ?, 'TRANSACTION', '套餐订单待支付超时已取消',
                 '待支付时限已到，订单已取消，库存或预约容量已经释放。',
                 '查看订单', ?, NULL, 1, ?)`,
      ).run(
        randomUUID(), row.tenant_id, row.user_id, row.household_member_id,
        `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(row.order_id)}`,
        timestamp,
      )
      database.prepare(
        `INSERT INTO audit_events
         (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
          risk_level, result, summary, payload_json, created_at)
         VALUES (?, ?, ?, 'SYSTEM', 'CONSUMER_DEAL_PAYMENT_EXPIRED',
                 'merchant_order', ?, 'L2', 'SUCCESS',
                 '待支付超时，订单取消并释放库存或预约容量', ?, ?)`,
      ).run(
        randomUUID(), RUN_ID, row.tenant_id, row.order_id,
        JSON.stringify(payload), timestamp,
      )
      database.prepare(
        `INSERT INTO tracking_events
         (id, run_id, tenant_id, name, properties_json, created_at)
         VALUES (?, ?, ?, 'consumer.deal.payment.expired', ?, ?)`,
      ).run(randomUUID(), RUN_ID, row.tenant_id, JSON.stringify(payload), timestamp)
      database.prepare(
        `INSERT INTO outbox_events
         (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
         VALUES (?, ?, ?, 'consumer.deal.payment.cancelled.v1', ?, ?, ?)`,
      ).run(
        randomUUID(), RUN_ID, row.tenant_id, row.payment_intent_id,
        JSON.stringify(payload), timestamp,
      )
      database.prepare(
        `INSERT INTO outbox_events
         (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
         VALUES (?, ?, ?, 'consumer.deal.order.cancelled.v1', ?, ?, ?)`,
      ).run(
        randomUUID(), RUN_ID, row.tenant_id, row.order_id,
        JSON.stringify(payload), timestamp,
      )
    }
    database.exec('COMMIT;')
    return { expiredDrafts: waiting.length + held.length, releasedHolds: held.length }
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function confirmConsumerDealDraft(
  database: DatabaseSync,
  principal: Principal,
  input: ConfirmConsumerDealDraftInput,
  idempotencyKey: string,
): ConsumerStoreDetailOverview {
  requireConsumer(principal)
  const route = scopedIdempotencyRoute(
    `/api/v1/consumer/deal-drafts/${input.draftId}/confirm`,
    principal,
  )
  const requestHash = hash(input)
  const stored = replay(database, idempotencyKey, route, requestHash)
  if (stored) return stored
  if (!input.confirmed) {
    throw new DomainError(422, 'explicit_confirmation_required', '下单前必须明确确认价格、规则和占用')
  }
  releaseExpiredConsumerDealCheckouts(database)
  database.exec('BEGIN IMMEDIATE;')
  try {
    const concurrentStored = replay(database, idempotencyKey, route, requestHash)
    if (concurrentStored) {
      database.exec('COMMIT;')
      return concurrentStored
    }
    const profile = profileRow(database, principal)
    const draft = database.prepare(
      `SELECT drafts.id, drafts.city_id, drafts.household_member_id,
              drafts.store_id, drafts.offer_id, drafts.sku_id, drafts.kind,
              drafts.title, drafts.sku_name, drafts.quantity, drafts.service_at,
              drafts.unit_price_fen, drafts.total_amount_fen,
              drafts.pricing_rule_version, drafts.offer_version, drafts.expires_at,
              states.status, states.version, stores.merchant_id,
              stores.operating_status, publications.visibility_status,
              publications.authorization_scope, catalogs.status AS catalog_status,
              spus.status AS spu_status,
              deals.version AS current_offer_version, deals.status AS offer_status,
              deals.valid_from, deals.valid_until, deals.usable_weekdays_json,
              deals.daily_start_time, deals.daily_end_time,
              deals.refund_rule, deals.redemption_rule,
              skus.price_fen AS current_price_fen,
              skus.compare_at_fen, skus.stock_mode, skus.stock_quantity,
              skus.status AS sku_status,
              skus.pricing_rule_version AS current_pricing_rule_version,
              slot_snapshots.slot_id AS snapshot_slot_id,
              slot_snapshots.slot_version AS snapshot_slot_version,
              slot_snapshots.price_override_fen AS snapshot_slot_price_override_fen,
              slot_snapshots.effective_unit_price_fen AS snapshot_slot_unit_price_fen,
              slot_snapshots.service_at AS snapshot_service_at,
              service_slots.sku_id AS current_slot_sku_id,
              service_slots.weekday AS current_slot_weekday,
              service_slots.start_time AS current_slot_start_time,
              service_slots.end_time AS current_slot_end_time,
              service_slots.capacity AS current_slot_capacity,
              service_slots.reserved AS current_slot_reserved,
              service_slots.price_override_fen AS current_slot_price_override_fen,
              service_slots.status AS current_slot_status,
              service_slots.version AS current_slot_version
       FROM consumer_deal_drafts drafts
       JOIN consumer_deal_checkout_states states ON states.draft_id = drafts.id
       JOIN merchant_stores stores ON stores.id = drafts.store_id
       JOIN consumer_store_publications publications ON publications.store_id = drafts.store_id
       JOIN consumer_deal_publications deals ON deals.id = drafts.offer_id
       JOIN merchant_skus skus ON skus.id = drafts.sku_id
       JOIN merchant_spus spus ON spus.id = deals.spu_id AND spus.id = skus.spu_id
       JOIN merchant_catalogs catalogs ON catalogs.id = spus.catalog_id
       LEFT JOIN consumer_deal_draft_slot_snapshots slot_snapshots
         ON slot_snapshots.draft_id = drafts.id
       LEFT JOIN merchant_service_slots service_slots
         ON service_slots.id = slot_snapshots.slot_id
       WHERE drafts.id = ? AND drafts.tenant_id = ? AND drafts.user_id = ?`,
    ).get(input.draftId, principal.tenantId, principal.subject) as {
      id: string
      city_id: string
      household_member_id: string
      store_id: string
      offer_id: string
      sku_id: string
      kind: 'GROUP_BUY' | 'RESERVATION'
      title: string
      sku_name: string
      quantity: number
      service_at: string | null
      unit_price_fen: number
      total_amount_fen: number
      pricing_rule_version: string
      offer_version: number
      expires_at: string
      status: 'WAITING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED'
      version: number
      merchant_id: string
      operating_status: 'OPEN' | 'CLOSED' | 'PAUSED'
      visibility_status: 'PUBLISHED' | 'PAUSED'
      authorization_scope: 'PLATFORM_DISPLAY' | 'SKILL_ONLY' | 'REVOKED'
      catalog_status: 'DRAFT' | 'ACTIVE' | 'PAUSED'
      spu_status: 'DRAFT' | 'ACTIVE' | 'PAUSED'
      current_offer_version: number
      offer_status: 'PUBLISHED' | 'PAUSED'
      valid_from: string
      valid_until: string
      usable_weekdays_json: string
      daily_start_time: string
      daily_end_time: string
      refund_rule: string
      redemption_rule: string
      current_price_fen: number
      compare_at_fen: number | null
      stock_mode: 'FINITE' | 'UNLIMITED' | 'SLOT'
      stock_quantity: number
      sku_status: 'ACTIVE' | 'OUT_OF_STOCK' | 'PAUSED'
      current_pricing_rule_version: string
      snapshot_slot_id: string | null
      snapshot_slot_version: number | null
      snapshot_slot_price_override_fen: number | null
      snapshot_slot_unit_price_fen: number | null
      snapshot_service_at: string | null
      current_slot_sku_id: string | null
      current_slot_weekday: number | null
      current_slot_start_time: string | null
      current_slot_end_time: string | null
      current_slot_capacity: number | null
      current_slot_reserved: number | null
      current_slot_price_override_fen: number | null
      current_slot_status: 'ACTIVE' | 'PAUSED' | null
      current_slot_version: number | null
    } | undefined
    if (!draft) throw new DomainError(404, 'consumer_deal_draft_not_found', '套餐草稿不存在')
    if (draft.status !== 'WAITING_CONFIRMATION' || draft.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '套餐草稿状态已变化，请刷新后重试')
    }
    assertContext(profile, draft.city_id, draft.household_member_id)
    const timestamp = now()
    if (
      draft.operating_status !== 'OPEN'
      || draft.visibility_status !== 'PUBLISHED'
      || draft.authorization_scope !== 'PLATFORM_DISPLAY'
      || draft.catalog_status !== 'ACTIVE'
      || draft.spu_status !== 'ACTIVE'
    ) {
      throw new DomainError(409, 'consumer_offer_unavailable', '门店授权或商品目录状态已变化，请重新建立草稿')
    }
    if (
      draft.offer_status !== 'PUBLISHED'
      || Date.parse(draft.valid_from) > Date.now()
      || Date.parse(draft.valid_until) < Date.now()
      || Date.parse(draft.expires_at) <= Date.now()
    ) {
      throw new DomainError(409, 'consumer_deal_draft_expired', '套餐草稿或发布规则已经过期')
    }
    if (
      draft.stock_mode === 'SLOT'
      && (!draft.snapshot_slot_id || draft.snapshot_slot_version === null)
    ) {
      throw new DomainError(
        409,
        'deal_draft_slot_snapshot_missing',
        '该预约草稿来自旧版本，缺少不可变时段快照，请重新建立草稿',
      )
    }
    const currentUnitPriceFen = draft.kind === 'RESERVATION'
      ? (draft.current_slot_price_override_fen ?? draft.current_price_fen)
      : draft.current_price_fen
    if (
      draft.current_offer_version !== draft.offer_version
      || currentUnitPriceFen !== draft.unit_price_fen
      || draft.current_pricing_rule_version !== draft.pricing_rule_version
    ) {
      throw new DomainError(409, 'consumer_deal_price_changed', '价格或规则已变化，请重新建立草稿')
    }
    if (draft.sku_status !== 'ACTIVE') {
      throw new DomainError(409, 'consumer_offer_sold_out', '套餐当前不可售')
    }
    let slotId: string | null = null
    if (draft.stock_mode === 'FINITE') {
      const changed = database.prepare(
        `UPDATE merchant_skus
         SET stock_quantity = stock_quantity - ?,
             status = CASE WHEN stock_quantity - ? = 0 THEN 'OUT_OF_STOCK' ELSE status END,
             version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'ACTIVE' AND stock_quantity >= ?`,
      ).run(
        draft.quantity, draft.quantity, timestamp, draft.sku_id, draft.quantity,
      )
      if (Number(changed.changes) !== 1) {
        throw new DomainError(409, 'consumer_offer_stock_insufficient', '库存已变化，请重新建立草稿')
      }
    } else if (draft.stock_mode === 'SLOT') {
      if (!draft.service_at) throw new DomainError(409, 'deal_service_time_required', '预约时间缺失')
      const instant = new Date(draft.service_at)
      const weekday = serviceWeekday(draft.service_at)
      const time = draft.service_at.slice(11, 16)
      const usableWeekdays = JSON.parse(draft.usable_weekdays_json) as number[]
      if (
        instant.getTime() <= Date.now()
        || !usableWeekdays.includes(weekday)
        || time < draft.daily_start_time
        || time > draft.daily_end_time
      ) {
        throw new DomainError(409, 'deal_service_time_outside_usage_window', '预约时段规则已变化，请重新选择')
      }
      if (
        draft.snapshot_slot_unit_price_fen !== draft.unit_price_fen
        || draft.snapshot_service_at !== draft.service_at
        || draft.current_slot_sku_id !== draft.sku_id
        || draft.current_slot_weekday !== weekday
        || draft.current_slot_start_time !== time
        || draft.current_slot_status !== 'ACTIVE'
        || draft.current_slot_version !== draft.snapshot_slot_version
        || draft.current_slot_price_override_fen !== draft.snapshot_slot_price_override_fen
        || draft.current_slot_capacity === null
        || draft.current_slot_reserved === null
        || draft.current_slot_capacity - draft.current_slot_reserved < draft.quantity
      ) {
        throw new DomainError(409, 'deal_service_slot_changed', '预约时段价格、规则或容量已变化，请重新建立草稿')
      }
      const changed = database.prepare(
        `UPDATE merchant_service_slots
         SET reserved = reserved + ?, updated_at = ?
         WHERE id = ? AND status = 'ACTIVE' AND version = ?
           AND capacity - reserved >= ?`,
      ).run(
        draft.quantity, timestamp, draft.snapshot_slot_id,
        draft.snapshot_slot_version, draft.quantity,
      )
      if (Number(changed.changes) !== 1) {
        throw new DomainError(409, 'deal_service_slot_unavailable', '预约容量已变化，请重新选择时段')
      }
      slotId = draft.snapshot_slot_id
    }
    const orderId = randomUUID()
    const orderNo = `LQD${timestamp.replace(/\D/g, '').slice(2, 14)}${randomUUID().slice(0, 4).toUpperCase()}`
    const compareTotal = Math.max(
      draft.compare_at_fen ?? draft.unit_price_fen,
      draft.unit_price_fen,
    ) * draft.quantity
    database.prepare(
      `INSERT INTO merchant_orders
       (id, tenant_id, merchant_id, store_id, order_no, order_type, channel, status,
        customer_name, customer_phone_masked, item_summary, party_size, service_at,
        gross_amount_fen, discount_fen, paid_amount_fen, refund_amount_fen,
        verification_code_hash, verification_code_masked, exception_code,
        placed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'MINIAPP', 'PENDING_CONFIRMATION',
               ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, NULL, ?, ?, ?)`,
    ).run(
      orderId, principal.tenantId, draft.merchant_id, draft.store_id, orderNo,
      draft.kind, profile.display_name, profile.phone_masked,
      `${draft.title} · ${draft.sku_name} × ${draft.quantity}`,
      draft.kind === 'RESERVATION' ? draft.quantity : null,
      draft.service_at, compareTotal,
      Math.max(0, compareTotal - draft.total_amount_fen),
      timestamp, timestamp, timestamp,
    )
    const terms = {
      validFrom: draft.valid_from,
      validUntil: draft.valid_until,
      usableWeekdays: JSON.parse(draft.usable_weekdays_json) as number[],
      dailyUsableTime: `${draft.daily_start_time}–${draft.daily_end_time}`,
      refundRule: draft.refund_rule,
      redemptionRule: draft.redemption_rule,
      serviceAt: draft.service_at,
      reservationSlot: slotId
        ? {
            id: slotId,
            version: draft.snapshot_slot_version,
            startTime: draft.current_slot_start_time,
            endTime: draft.current_slot_end_time,
            priceOverrideFen: draft.snapshot_slot_price_override_fen,
            effectiveUnitPriceFen: draft.unit_price_fen,
          }
        : null,
    }
    database.prepare(
      `INSERT INTO consumer_deal_order_snapshots
       (draft_id, tenant_id, order_id, offer_id, sku_id, unit_price_fen,
        quantity, total_amount_fen, pricing_rule_version, offer_version,
        terms_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      draft.id, principal.tenantId, orderId, draft.offer_id, draft.sku_id,
      draft.unit_price_fen, draft.quantity, draft.total_amount_fen,
      draft.pricing_rule_version, draft.offer_version, JSON.stringify(terms), timestamp,
    )
    const paymentRequired = draft.total_amount_fen > 0
    const holdId = randomUUID()
    const holdDeadline = Math.min(
      Date.now() + 15 * 60_000,
      Date.parse(draft.valid_until),
      draft.service_at ? Date.parse(draft.service_at) : Number.POSITIVE_INFINITY,
    )
    const holdExpiresAt = paymentRequired
      ? new Date(holdDeadline).toISOString()
      : new Date(Math.min(
          Date.parse(draft.valid_until),
          draft.service_at ? Date.parse(draft.service_at) : Number.POSITIVE_INFINITY,
        )).toISOString()
    database.prepare(
       `INSERT INTO consumer_deal_fulfillment_holds
        (id, tenant_id, user_id, draft_id, order_id, sku_id, slot_id, quantity,
         status, expires_at, consumed_at, released_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      holdId, principal.tenantId, principal.subject, draft.id, orderId,
      draft.sku_id, slotId, draft.quantity,
      paymentRequired ? 'HELD' : 'CONSUMED', holdExpiresAt,
      paymentRequired ? null : timestamp, timestamp, timestamp,
    )
    let paymentIntentId: string | null = null
    if (paymentRequired) {
      paymentIntentId = randomUUID()
      const providerRequestId = `LQDEALPAY-${randomUUID()}`
      database.prepare(
        `INSERT INTO consumer_deal_payment_intents
         (id, tenant_id, user_id, draft_id, order_id, provider, currency,
          amount_fen, status, provider_request_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'WECHAT_PAY', 'CNY', ?, 'PENDING_PROVIDER', ?, 1, ?, ?)`,
      ).run(
        paymentIntentId, principal.tenantId, principal.subject, draft.id,
        orderId, draft.total_amount_fen, providerRequestId, timestamp, timestamp,
      )
      database.prepare(
        `INSERT INTO outbox_events
         (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
         VALUES (?, ?, ?, 'consumer.deal.payment.requested.v1', ?, ?, ?)`,
      ).run(
        randomUUID(), RUN_ID, principal.tenantId, paymentIntentId,
        JSON.stringify({
          paymentIntentId,
          providerRequestId,
          draftId: draft.id,
          orderId,
          amountFen: draft.total_amount_fen,
          currency: 'CNY',
          connectorMode: 'OUTBOX_ONLY',
        }),
        timestamp,
      )
    }
    database.prepare(
      `UPDATE consumer_deal_checkout_states
       SET status = 'CONFIRMED', order_id = ?, payment_intent_id = ?,
           version = version + 1, confirmed_at = ?, updated_at = ?
       WHERE draft_id = ? AND version = ? AND status = 'WAITING_CONFIRMATION'`,
    ).run(
      orderId, paymentIntentId, timestamp, timestamp, draft.id, input.expectedVersion,
    )
    const payload = {
      draftId: draft.id,
      orderId,
      paymentIntentId,
      totalAmountFen: draft.total_amount_fen,
      paymentRequired,
      holdStatus: paymentRequired ? 'HELD' : 'CONSUMED',
      holdExpiresAt,
      pricingRuleVersion: draft.pricing_rule_version,
      offerVersion: draft.offer_version,
    }
    database.prepare(
      `INSERT INTO merchant_order_events
       (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
        summary, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_DEAL_CONFIRMED',
               '消费者强确认套餐订单并原子占用资源', NULL,
               'PENDING_CONFIRMATION', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, draft.merchant_id, draft.store_id,
      orderId, principal.subject, JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_deal_events
       (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'ORDER_CONFIRMED', '消费者强确认下单并原子占用库存或预约容量', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, draft.id,
      JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_messages
       (id, tenant_id, user_id, household_member_id, category, title, body,
        action_label, action_target, read_at, version, created_at)
       VALUES (?, ?, ?, ?, 'TRANSACTION', ?, ?, '查看订单', ?, NULL, 1, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, draft.household_member_id,
      paymentRequired ? '套餐订单等待支付连接器' : '零支付套餐订单已提交',
      paymentRequired
        ? `${draft.title}已占用库存，当前等待支付连接器，尚未扣款。`
        : `${draft.title}已提交商家确认，不需要发起支付。`,
      `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(orderId)}`,
      timestamp,
    )
    database.prepare(
      `INSERT INTO audit_events
       (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
        risk_level, result, summary, payload_json, created_at)
       VALUES (?, ?, ?, 'CONSUMER', 'CONSUMER_DEAL_ORDER_CONFIRMED',
               'consumer_deal_draft', ?, 'L2', 'SUCCESS',
               '消费者强确认套餐订单并原子占用资源', ?, ?)`,
    ).run(
      randomUUID(), RUN_ID, principal.tenantId, draft.id,
      JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO tracking_events
       (id, run_id, tenant_id, name, properties_json, created_at)
       VALUES (?, ?, ?, 'consumer.deal.order.confirmed', ?, ?)`,
    ).run(randomUUID(), RUN_ID, principal.tenantId, JSON.stringify(payload), timestamp)
    database.prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, 'consumer.deal.order.submitted.v1', ?, ?, ?)`,
    ).run(
      randomUUID(), RUN_ID, principal.tenantId, orderId,
      JSON.stringify(payload), timestamp,
    )
    const response = getConsumerStoreDetail(database, principal, draft.store_id)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, requestHash, JSON.stringify(response), timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
