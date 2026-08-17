import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-deal-lifecycle-e8j'
const CREDENTIAL_KEY_VERSION = 'consumer-deal-verification-v1'
const DEVELOPMENT_CREDENTIAL_SECRET = 'development-consumer-deal-credential-secret'

type DealPaymentStatus =
  | 'PENDING_PROVIDER'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'LATE_SUCCEEDED'
type DealHoldStatus = 'HELD' | 'CONSUMED' | 'RELEASED' | 'FULFILLED'
type DealCredentialStatus = 'ISSUED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED'
type DealRefundStatus = 'REQUESTED' | 'APPROVED_PENDING_PROVIDER' | 'REFUNDED' | 'FAILED'

interface DealLifecycleRow {
  draft_id: string
  tenant_id: string
  user_id: string
  household_member_id: string
  draft_title: string
  order_id: string
  checkout_status: 'WAITING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED'
  checkout_version: number
  total_amount_fen: number
  terms_json: string
  order_status: string
  paid_amount_fen: number
  hold_id: string
  hold_status: DealHoldStatus
  hold_quantity: number
  slot_id: string | null
  payment_intent_id: string | null
  payment_status: DealPaymentStatus | null
  refund_status: DealRefundStatus | null
  refund_amount_fen: number | null
  credential_id: string | null
  credential_status: DealCredentialStatus | null
  credential_code_hash: string | null
  credential_code_masked: string | null
  credential_expires_at: string | null
}

export interface ConsumerDealMerchantEligibility {
  isDeal: boolean
  merchantConfirmationAllowed: boolean
  fundsEligible: boolean
  refundBlocked: boolean
  checkoutStatus: DealLifecycleRow['checkout_status'] | null
  holdStatus: DealHoldStatus | null
  paymentStatus: DealPaymentStatus | 'NOT_REQUIRED' | null
  refundStatus: DealRefundStatus | 'NONE' | null
  refundAmountFen: number | null
  credentialStatus: DealCredentialStatus | null
}

export interface IssuedConsumerDealCredential {
  credentialId: string
  draftId: string
  orderId: string
  codeHash: string
  codeMasked: string
  expiresAt: string
  issued: boolean
}

export interface RedeemedConsumerDealCredential {
  credentialId: string
  draftId: string
  orderId: string
  slotId: string | null
  quantity: number
}

export interface ApprovedConsumerDealRefund {
  refundId: string
  attemptId: string
  paymentIntentId: string
  providerRequestId: string
  amountFen: number
  userId: string
  householdMemberId: string
  draftId: string
  wasRetry: boolean
}

function credentialSecret(): string {
  const configured = process.env.CONSUMER_DEAL_CREDENTIAL_SECRET?.trim()
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new DomainError(
      503,
      'consumer_deal_credential_secret_unavailable',
      '生产环境未配置套餐核销凭证密钥，已停止签发或派生凭证',
    )
  }
  return DEVELOPMENT_CREDENTIAL_SECRET
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function deriveConsumerDealVerificationCode(nonce: string): string {
  if (!nonce) {
    throw new DomainError(409, 'consumer_deal_credential_nonce_missing', '套餐核销凭证随机因子缺失')
  }
  const digest = createHmac('sha256', credentialSecret())
    .update(`${CREDENTIAL_KEY_VERSION}|${nonce}`)
    .digest()
  return String(Number(digest.readBigUInt64BE(0) % 1_000_000n)).padStart(6, '0')
}

function lifecycleRow(database: DatabaseSync, orderId: string): DealLifecycleRow | null {
  const row = database.prepare(
    `SELECT drafts.id AS draft_id, drafts.tenant_id, drafts.user_id,
            drafts.household_member_id, drafts.title AS draft_title, states.order_id,
            states.status AS checkout_status, states.version AS checkout_version,
            snapshots.total_amount_fen, snapshots.terms_json,
            orders.status AS order_status, orders.paid_amount_fen,
            holds.id AS hold_id, holds.status AS hold_status,
            holds.quantity AS hold_quantity, holds.slot_id,
            states.payment_intent_id, payments.status AS payment_status,
            (SELECT status FROM consumer_deal_refund_requests refunds
             WHERE refunds.order_id = orders.id
             ORDER BY refunds.updated_at DESC, refunds.created_at DESC LIMIT 1)
              AS refund_status,
            (SELECT amount_fen FROM consumer_deal_refund_requests refunds
             WHERE refunds.order_id = orders.id
             ORDER BY refunds.updated_at DESC, refunds.created_at DESC LIMIT 1)
              AS refund_amount_fen,
            credentials.id AS credential_id,
            credentials.status AS credential_status,
            credentials.code_hash AS credential_code_hash,
            credentials.code_masked AS credential_code_masked,
            credentials.expires_at AS credential_expires_at
     FROM consumer_deal_checkout_states states
     JOIN consumer_deal_drafts drafts ON drafts.id = states.draft_id
     JOIN consumer_deal_order_snapshots snapshots ON snapshots.draft_id = drafts.id
     JOIN merchant_orders orders ON orders.id = states.order_id
     JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = drafts.id
     LEFT JOIN consumer_deal_payment_intents payments ON payments.id = states.payment_intent_id
     LEFT JOIN consumer_deal_redemption_credentials credentials
       ON credentials.order_id = orders.id
     WHERE states.order_id = ?`,
  ).get(orderId) as unknown as DealLifecycleRow | undefined
  if (row) return row
  const marker = database.prepare(
    'SELECT 1 AS present FROM consumer_deal_checkout_states WHERE order_id = ?',
  ).get(orderId)
  if (marker) {
    throw new DomainError(
      409,
      'consumer_deal_lifecycle_inconsistent',
      '套餐订单缺少结算快照或资源占用，已停止履约操作',
    )
  }
  return null
}

function fundsEligible(row: DealLifecycleRow): boolean {
  if (row.total_amount_fen === 0) {
    return row.payment_intent_id === null
      && row.payment_status === null
      && row.paid_amount_fen === 0
  }
  return row.payment_status === 'SUCCEEDED'
    && row.paid_amount_fen === row.total_amount_fen
}

function refundBlocked(row: DealLifecycleRow): boolean {
  return row.refund_status === 'REQUESTED'
    || row.refund_status === 'APPROVED_PENDING_PROVIDER'
    || row.refund_status === 'FAILED'
}

export function getConsumerDealMerchantEligibility(
  database: DatabaseSync,
  orderId: string,
): ConsumerDealMerchantEligibility {
  const row = lifecycleRow(database, orderId)
  if (!row) {
    return {
      isDeal: false,
      merchantConfirmationAllowed: false,
      fundsEligible: false,
      refundBlocked: false,
      checkoutStatus: null,
      holdStatus: null,
      paymentStatus: null,
      refundStatus: null,
      refundAmountFen: null,
      credentialStatus: null,
    }
  }
  const eligibleFunds = fundsEligible(row)
  const blocked = refundBlocked(row)
  const credentialStatus = row.credential_status === 'ISSUED'
    && row.credential_expires_at !== null
    && Date.parse(row.credential_expires_at) <= Date.now()
    ? 'EXPIRED'
    : row.credential_status
  return {
    isDeal: true,
    merchantConfirmationAllowed: row.order_status === 'PENDING_CONFIRMATION'
      && row.checkout_status === 'CONFIRMED'
      && row.hold_status === 'CONSUMED'
      && eligibleFunds
      && !blocked,
    fundsEligible: eligibleFunds,
    refundBlocked: blocked,
    checkoutStatus: row.checkout_status,
    holdStatus: row.hold_status,
    paymentStatus: row.payment_status ?? 'NOT_REQUIRED',
    refundStatus: row.refund_status ?? 'NONE',
    refundAmountFen: row.refund_amount_fen,
    credentialStatus,
  }
}

function assertIssuanceEligible(row: DealLifecycleRow): void {
  if (
    row.checkout_status !== 'CONFIRMED'
    || row.hold_status !== 'CONSUMED'
    || !fundsEligible(row)
    || refundBlocked(row)
    || !['CONFIRMED', 'READY_FOR_SERVICE'].includes(row.order_status)
  ) {
    throw new DomainError(
      409,
      'consumer_deal_credential_not_issuable',
      '套餐订单尚未满足已支付、已接单且资源可履约的凭证签发条件',
    )
  }
}

function credentialExpiry(termsJson: string): string {
  let terms: {
    validUntil?: unknown
    serviceAt?: unknown
    reservationSlot?: { endTime?: unknown } | null
  }
  try {
    terms = JSON.parse(termsJson) as typeof terms
  } catch {
    throw new DomainError(409, 'consumer_deal_terms_snapshot_invalid', '套餐订单规则快照无法解析')
  }
  if (typeof terms.validUntil !== 'string' || !Number.isFinite(Date.parse(terms.validUntil))) {
    throw new DomainError(409, 'consumer_deal_terms_snapshot_invalid', '套餐订单规则快照缺少有效期')
  }
  let expiresAt = Date.parse(terms.validUntil)
  if (
    typeof terms.serviceAt === 'string'
    && typeof terms.reservationSlot?.endTime === 'string'
  ) {
    const offset = terms.serviceAt.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] ?? 'Z'
    const endTime = terms.reservationSlot.endTime.length === 5
      ? `${terms.reservationSlot.endTime}:00`
      : terms.reservationSlot.endTime
    const serviceEnd = Date.parse(`${terms.serviceAt.slice(0, 10)}T${endTime}${offset}`)
    if (Number.isFinite(serviceEnd)) expiresAt = Math.min(expiresAt, serviceEnd)
  }
  return new Date(expiresAt).toISOString()
}

function appendCredentialEvent(
  database: DatabaseSync,
  input: {
    row: DealLifecycleRow
    credentialId: string
    actorId: string
    type: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  database.prepare(
    `INSERT INTO consumer_deal_redemption_events
     (id, tenant_id, credential_id, order_id, type, actor_id,
      summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), input.row.tenant_id, input.credentialId, input.row.order_id,
    input.type, input.actorId, input.summary, JSON.stringify(input.payload), input.timestamp,
  )
}

export function issueConsumerDealRedemptionCredential(
  database: DatabaseSync,
  input: { orderId: string; actorId: string; timestamp: string },
): IssuedConsumerDealCredential | null {
  const row = lifecycleRow(database, input.orderId)
  if (!row) return null
  assertIssuanceEligible(row)
  if (row.credential_id) {
    if (!row.credential_code_hash || !row.credential_code_masked || !row.credential_expires_at) {
      throw new DomainError(409, 'consumer_deal_credential_inconsistent', '套餐核销凭证字段不完整')
    }
    return {
      credentialId: row.credential_id,
      draftId: row.draft_id,
      orderId: row.order_id,
      codeHash: row.credential_code_hash,
      codeMasked: row.credential_code_masked,
      expiresAt: row.credential_expires_at,
      issued: false,
    }
  }
  const expiresAt = credentialExpiry(row.terms_json)
  if (Date.parse(expiresAt) <= Date.parse(input.timestamp)) {
    throw new DomainError(409, 'consumer_deal_credential_expired', '套餐使用期限已结束，不能签发核销凭证')
  }
  const credentialId = randomUUID()
  const nonce = randomUUID()
  const code = deriveConsumerDealVerificationCode(nonce)
  const codeHash = sha256(code)
  const codeMasked = `•• ${code.slice(-4)}`
  database.prepare(
    `INSERT INTO consumer_deal_redemption_credentials
     (id, tenant_id, user_id, draft_id, order_id, status, code_hash,
      code_masked, derivation_nonce, key_version, expires_at, issued_at,
      redeemed_at, revoked_at, version, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?)`,
  ).run(
    credentialId, row.tenant_id, row.user_id, row.draft_id, row.order_id,
    codeHash, codeMasked, nonce, CREDENTIAL_KEY_VERSION, expiresAt,
    input.timestamp, input.timestamp,
  )
  database.prepare(
    `UPDATE merchant_orders
     SET verification_code_hash = ?, verification_code_masked = ?, updated_at = ?
     WHERE id = ?`,
  ).run(codeHash, codeMasked, input.timestamp, row.order_id)
  appendCredentialEvent(database, {
    row,
    credentialId,
    actorId: input.actorId,
    type: 'CREDENTIAL_ISSUED',
    summary: '商家接单后签发一次性套餐核销凭证',
    payload: {
      credentialId,
      draftId: row.draft_id,
      orderId: row.order_id,
      codeMasked,
      expiresAt,
      keyVersion: CREDENTIAL_KEY_VERSION,
    },
    timestamp: input.timestamp,
  })
  const lifecyclePayload = {
    credentialId,
    draftId: row.draft_id,
    orderId: row.order_id,
    codeMasked,
    expiresAt,
  }
  database.prepare(
    `INSERT INTO consumer_deal_events
     (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'CREDENTIAL_ISSUED', ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.draft_id,
    '商家接单后签发套餐核销凭证', JSON.stringify(lifecyclePayload), input.timestamp,
  )
  database.prepare(
    `INSERT INTO consumer_messages
     (id, tenant_id, user_id, household_member_id, category, title, body,
      action_label, action_target, read_at, version, created_at)
     VALUES (?, ?, ?, ?, 'TRANSACTION', '商家已接单并签发核销凭证', ?,
             '查看凭证', ?, NULL, 1, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.household_member_id,
    `${row.draft_title}已由商家确认，核销凭证 ${codeMasked} 已签发。`,
    `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(row.order_id)}`,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, 'consumer.deal.credential.issued.v1', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, row.tenant_id, credentialId,
    JSON.stringify(lifecyclePayload), input.timestamp,
  )
  return {
    credentialId,
    draftId: row.draft_id,
    orderId: row.order_id,
    codeHash,
    codeMasked,
    expiresAt,
    issued: true,
  }
}

export function ensureConsumerDealRedemptionCredentialForConfirmedOrder(
  database: DatabaseSync,
  input: { orderId: string; actorId: string; timestamp: string },
): IssuedConsumerDealCredential | null {
  const issued = issueConsumerDealRedemptionCredential(database, input)
  if (issued?.issued) {
    database.prepare(
      'UPDATE merchant_orders SET version = version + 1, updated_at = ? WHERE id = ?',
    ).run(input.timestamp, input.orderId)
  }
  return issued
}

export function revokeConsumerDealRedemptionCredential(
  database: DatabaseSync,
  input: { orderId: string; actorId: string; reason: string; timestamp: string },
): { credentialId: string; revoked: boolean } | null {
  const row = lifecycleRow(database, input.orderId)
  if (!row || !row.credential_id || !row.credential_status) return null
  if (row.credential_status === 'REDEEMED') {
    throw new DomainError(409, 'consumer_deal_already_redeemed', '套餐已经核销，不能进入普通撤销或退款流程')
  }
  if (row.credential_status !== 'ISSUED') {
    return { credentialId: row.credential_id, revoked: false }
  }
  const changed = database.prepare(
    `UPDATE consumer_deal_redemption_credentials
     SET status = 'REVOKED', revoked_at = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'ISSUED'`,
  ).run(input.timestamp, input.timestamp, row.credential_id)
  if (Number(changed.changes) !== 1) {
    throw new DomainError(409, 'consumer_deal_credential_state_changed', '核销凭证状态已变化，请刷新后重试')
  }
  appendCredentialEvent(database, {
    row,
    credentialId: row.credential_id,
    actorId: input.actorId,
    type: 'CREDENTIAL_REVOKED',
    summary: '套餐进入退款流程，核销凭证已撤销',
    payload: { orderId: row.order_id, reason: input.reason },
    timestamp: input.timestamp,
  })
  const lifecyclePayload = {
    credentialId: row.credential_id,
    draftId: row.draft_id,
    orderId: row.order_id,
    reason: input.reason,
  }
  database.prepare(
    `INSERT INTO consumer_deal_events
     (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'CREDENTIAL_REVOKED', ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.draft_id,
    '套餐进入退款流程，核销凭证已撤销', JSON.stringify(lifecyclePayload), input.timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, 'consumer.deal.credential.revoked.v1', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, row.tenant_id, row.credential_id,
    JSON.stringify(lifecyclePayload), input.timestamp,
  )
  return { credentialId: row.credential_id, revoked: true }
}

export function redeemConsumerDealRedemptionCredential(
  database: DatabaseSync,
  input: {
    orderId: string
    verificationCode: string
    actorId: string
    timestamp: string
  },
): RedeemedConsumerDealCredential | null {
  const row = lifecycleRow(database, input.orderId)
  if (!row) return null
  if (
    row.checkout_status !== 'CONFIRMED'
    || row.hold_status !== 'CONSUMED'
    || !fundsEligible(row)
    || refundBlocked(row)
  ) {
    throw new DomainError(409, 'consumer_deal_redemption_not_available', '套餐资金、占用或退款状态不允许核销')
  }
  if (!['CONFIRMED', 'READY_FOR_SERVICE'].includes(row.order_status)) {
    throw new DomainError(409, 'order_status_invalid', '只有已确认或待服务套餐订单可以核销')
  }
  if (!row.credential_id || !row.credential_code_hash || !row.credential_expires_at) {
    throw new DomainError(409, 'consumer_deal_credential_missing', '套餐订单尚未签发核销凭证')
  }
  if (row.credential_status !== 'ISSUED') {
    throw new DomainError(
      409,
      row.credential_status === 'REDEEMED'
        ? 'consumer_deal_credential_already_redeemed'
        : 'consumer_deal_credential_inactive',
      row.credential_status === 'REDEEMED' ? '套餐核销凭证已经使用' : '套餐核销凭证已失效',
    )
  }
  if (Date.parse(row.credential_expires_at) <= Date.parse(input.timestamp)) {
    throw new DomainError(409, 'consumer_deal_credential_expired', '套餐核销凭证已过使用期限')
  }
  if (!safeHashEquals(sha256(input.verificationCode), row.credential_code_hash)) {
    throw new DomainError(409, 'verification_code_invalid', '核销码不正确，请核对顾客出示的完整号码')
  }
  if (row.slot_id) {
    const slotChanged = database.prepare(
      `UPDATE merchant_service_slots
       SET reserved = reserved - ?, updated_at = ?
       WHERE id = ? AND reserved >= ?`,
    ).run(row.hold_quantity, input.timestamp, row.slot_id, row.hold_quantity)
    if (Number(slotChanged.changes) !== 1) {
      throw new DomainError(409, 'consumer_deal_slot_fulfillment_inconsistent', '预约容量占用状态不一致，已停止核销')
    }
  }
  const credentialChanged = database.prepare(
    `UPDATE consumer_deal_redemption_credentials
     SET status = 'REDEEMED', redeemed_at = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'ISSUED'`,
  ).run(input.timestamp, input.timestamp, row.credential_id)
  const holdChanged = database.prepare(
    `UPDATE consumer_deal_fulfillment_holds
     SET status = 'FULFILLED', fulfilled_at = ?, updated_at = ?
     WHERE id = ? AND status = 'CONSUMED'`,
  ).run(input.timestamp, input.timestamp, row.hold_id)
  if (Number(credentialChanged.changes) !== 1 || Number(holdChanged.changes) !== 1) {
    throw new DomainError(409, 'consumer_deal_redemption_state_changed', '套餐凭证或占用状态已变化，请刷新后重试')
  }
  appendCredentialEvent(database, {
    row,
    credentialId: row.credential_id,
    actorId: input.actorId,
    type: 'CREDENTIAL_REDEEMED',
    summary: '门店核对完整核销码并完成套餐履约',
    payload: {
      orderId: row.order_id,
      draftId: row.draft_id,
      slotId: row.slot_id,
      quantity: row.hold_quantity,
    },
    timestamp: input.timestamp,
  })
  const lifecyclePayload = {
    credentialId: row.credential_id,
    draftId: row.draft_id,
    orderId: row.order_id,
    slotId: row.slot_id,
    quantity: row.hold_quantity,
  }
  database.prepare(
    `INSERT INTO consumer_deal_events
     (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'CREDENTIAL_REDEEMED', ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.draft_id,
    '门店核对完整凭证并完成套餐核销', JSON.stringify(lifecyclePayload), input.timestamp,
  )
  database.prepare(
    `INSERT INTO consumer_messages
     (id, tenant_id, user_id, household_member_id, category, title, body,
      action_label, action_target, read_at, version, created_at)
     VALUES (?, ?, ?, ?, 'TRANSACTION', '套餐核销成功', ?,
             '查看订单', ?, NULL, 1, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.household_member_id,
    `${row.draft_title}已完成核销，凭证不能再次使用。`,
    `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(row.order_id)}`,
    input.timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, 'consumer.deal.credential.redeemed.v1', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, row.tenant_id, row.credential_id,
    JSON.stringify(lifecyclePayload), input.timestamp,
  )
  return {
    credentialId: row.credential_id,
    draftId: row.draft_id,
    orderId: row.order_id,
    slotId: row.slot_id,
    quantity: row.hold_quantity,
  }
}

export function approveConsumerDealRefundForMerchant(
  database: DatabaseSync,
  input: {
    orderId: string
    refundAmountFen: number
    reason: string
    actorId: string
    timestamp: string
  },
): ApprovedConsumerDealRefund | null {
  const lifecycle = lifecycleRow(database, input.orderId)
  if (!lifecycle) return null
  const refund = database.prepare(
    `SELECT refunds.id, refunds.user_id, refunds.draft_id,
            refunds.payment_intent_id, refunds.amount_fen, refunds.status,
            drafts.household_member_id
     FROM consumer_deal_refund_requests refunds
     JOIN consumer_deal_drafts drafts ON drafts.id = refunds.draft_id
     WHERE refunds.order_id = ? AND refunds.status IN ('REQUESTED', 'FAILED')
     ORDER BY refunds.updated_at DESC, refunds.created_at DESC LIMIT 1`,
  ).get(input.orderId) as {
    id: string
    user_id: string
    draft_id: string
    payment_intent_id: string
    amount_fen: number
    status: 'REQUESTED' | 'FAILED'
    household_member_id: string
  } | undefined
  if (!refund) {
    throw new DomainError(409, 'consumer_deal_refund_state_invalid', '套餐退款不在待审核或可重试状态')
  }
  if (
    refund.amount_fen !== input.refundAmountFen
    || input.refundAmountFen !== lifecycle.paid_amount_fen
  ) {
    throw new DomainError(409, 'refund_amount_invalid', '退款金额必须与套餐申请及支付成功金额一致')
  }
  revokeConsumerDealRedemptionCredential(database, {
    orderId: input.orderId,
    actorId: input.actorId,
    reason: input.reason,
    timestamp: input.timestamp,
  })
  const updated = database.prepare(
    `UPDATE consumer_deal_refund_requests
     SET status = 'APPROVED_PENDING_PROVIDER', failure_code = NULL,
         version = version + 1, updated_at = ?
     WHERE id = ? AND status = ?`,
  ).run(input.timestamp, refund.id, refund.status)
  if (Number(updated.changes) !== 1) {
    throw new DomainError(409, 'consumer_deal_refund_state_changed', '套餐退款状态已变化，请刷新后重试')
  }
  const attemptId = randomUUID()
  const providerRequestId = `LQDEALREFUND-${randomUUID()}`
  database.prepare(
    `INSERT INTO consumer_deal_refund_attempts
     (id, tenant_id, refund_id, provider_request_id, amount_fen, currency,
      status, provider_refund_id, failure_code, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'CNY', 'PENDING_PROVIDER', NULL, NULL, 1, ?, ?)`,
  ).run(
    attemptId, lifecycle.tenant_id, refund.id, providerRequestId,
    input.refundAmountFen, input.timestamp, input.timestamp,
  )
  const orderChanged = database.prepare(
    `UPDATE merchant_orders
     SET version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'REFUND_REQUESTED'`,
  ).run(input.timestamp, input.orderId)
  if (Number(orderChanged.changes) !== 1) {
    throw new DomainError(409, 'consumer_deal_refund_order_state_changed', '套餐退款订单状态已变化，请刷新后重试')
  }
  const payload = {
    refundId: refund.id,
    refundAttemptId: attemptId,
    paymentIntentId: refund.payment_intent_id,
    providerRequestId,
    orderId: input.orderId,
    amountFen: input.refundAmountFen,
    currency: 'CNY',
    reason: input.reason,
    wasRetry: refund.status === 'FAILED',
    connectorResultPending: true,
  }
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, 'consumer.deal.refund.requested.v1', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, lifecycle.tenant_id, attemptId,
    JSON.stringify(payload), input.timestamp,
  )
  database.prepare(
    `INSERT INTO consumer_messages
     (id, tenant_id, user_id, household_member_id, category, title, body,
      action_label, action_target, read_at, version, created_at)
     VALUES (?, ?, ?, ?, 'TRANSACTION', '套餐退款已通过商家审核',
             '退款已重新提交支付连接器，资金结果以后续签名回调为准。',
             '查看订单', ?, NULL, 1, ?)`,
  ).run(
    randomUUID(), lifecycle.tenant_id, refund.user_id, refund.household_member_id,
    `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(input.orderId)}`,
    input.timestamp,
  )
  return {
    refundId: refund.id,
    attemptId,
    paymentIntentId: refund.payment_intent_id,
    providerRequestId,
    amountFen: input.refundAmountFen,
    userId: refund.user_id,
    householdMemberId: refund.household_member_id,
    draftId: refund.draft_id,
    wasRetry: refund.status === 'FAILED',
  }
}
