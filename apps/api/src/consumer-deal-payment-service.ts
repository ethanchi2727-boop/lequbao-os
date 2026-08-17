import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ConsumerDealConnectorCallbackReceipt } from '@lequ/contracts'
import { paymentConnectorWebhookSecret } from './consumer-payment-service.js'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-deal-payment-e8j'
const CALLBACK_SCOPE = 'CONSUMER_DEAL_PAYMENT_V1'

interface CallbackBase {
  providerEventId: string
  intentId: string
  providerRequestId: string
  amountFen: number
  currency: 'CNY'
  occurredAt: string
  providerTransactionId?: string | undefined
  failureCode?: string | undefined
  refundId?: string | undefined
  refundAttemptId?: string | undefined
  providerRefundId?: string | undefined
}

export type ConsumerDealPaymentCallbackInput =
  | (CallbackBase & {
      type: 'PAYMENT_SUCCEEDED'
      providerTransactionId: string
    })
  | (CallbackBase & {
      type: 'PAYMENT_FAILED'
      failureCode: string
    })
  | (CallbackBase & {
      type: 'REFUND_SUCCEEDED'
      refundId: string
      refundAttemptId: string
      providerRefundId: string
    })
  | (CallbackBase & {
      type: 'REFUND_FAILED'
      refundId: string
      refundAttemptId: string
      failureCode: string
    })

export type ConsumerDealPaymentCallbackAck = ConsumerDealConnectorCallbackReceipt

interface ReceiptRow {
  request_hash: string
  scope: string
  aggregate_id: string
  response_json: string
}

interface PaymentRow {
  intent_id: string
  tenant_id: string
  user_id: string
  draft_id: string
  order_id: string
  intent_provider: 'WECHAT_PAY'
  intent_currency: 'CNY'
  intent_amount_fen: number
  intent_status: 'PENDING_PROVIDER' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'LATE_SUCCEEDED'
  intent_provider_request_id: string
  intent_provider_transaction_id: string | null
  household_member_id: string
  title: string
  checkout_status: 'WAITING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED'
  checkout_version: number
  checkout_payment_intent_id: string | null
  hold_id: string
  hold_status: 'HELD' | 'CONSUMED' | 'RELEASED' | 'FULFILLED'
  hold_expires_at: string
  sku_id: string
  slot_id: string | null
  quantity: number
  stock_mode: 'FINITE' | 'UNLIMITED' | 'SLOT'
  merchant_id: string
  store_id: string
  order_status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'READY_FOR_SERVICE' | 'VERIFIED' | 'COMPLETED' | 'REFUND_REQUESTED' | 'REFUNDED' | 'CANCELLED' | 'EXCEPTION'
  order_version: number
  gross_amount_fen: number
  discount_fen: number
  paid_amount_fen: number
  refund_amount_fen: number
  snapshot_total_amount_fen: number | null
}

interface RefundRow {
  refund_id: string
  refund_status: 'REQUESTED' | 'APPROVED_PENDING_PROVIDER' | 'REFUNDED' | 'FAILED'
  refund_amount_fen: number
  request_provider_refund_id: string | null
  attempt_id: string
  attempt_status: 'PENDING_PROVIDER' | 'SUCCEEDED' | 'FAILED'
  attempt_provider_request_id: string
  attempt_amount_fen: number
  attempt_currency: 'CNY'
  attempt_provider_refund_id: string | null
}

function now(): string {
  return new Date().toISOString()
}

function canonicalCallback(input: ConsumerDealPaymentCallbackInput): string {
  return JSON.stringify({
    scope: CALLBACK_SCOPE,
    providerEventId: input.providerEventId,
    type: input.type,
    intentId: input.intentId,
    providerRequestId: input.providerRequestId,
    amountFen: input.amountFen,
    currency: input.currency,
    occurredAt: input.occurredAt,
    providerTransactionId: input.providerTransactionId ?? null,
    failureCode: input.failureCode ?? null,
    refundId: input.refundId ?? null,
    refundAttemptId: input.refundAttemptId ?? null,
    providerRefundId: input.providerRefundId ?? null,
  })
}

export function consumerDealPaymentCallbackSignature(
  input: ConsumerDealPaymentCallbackInput,
): string {
  return createHmac('sha256', paymentConnectorWebhookSecret())
    .update(canonicalCallback(input))
    .digest('hex')
}

function assertCallbackSignature(
  input: ConsumerDealPaymentCallbackInput,
  signature: string,
): void {
  const expected = Buffer.from(consumerDealPaymentCallbackSignature(input), 'hex')
  let received: Buffer
  try {
    received = Buffer.from(signature, 'hex')
  } catch {
    received = Buffer.alloc(0)
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new DomainError(401, 'payment_callback_signature_invalid', '支付连接器回调签名无效')
  }
}

function requestHash(input: ConsumerDealPaymentCallbackInput): string {
  return createHash('sha256').update(canonicalCallback(input)).digest('hex')
}

function aggregateId(input: ConsumerDealPaymentCallbackInput): string {
  return input.refundAttemptId ?? input.intentId
}

function providerEventConflict(): DomainError {
  return new DomainError(
    409,
    'payment_callback_event_conflict',
    '同一支付连接器事件号不能跨支付聚合重复使用',
  )
}

function assertLegacyProviderEventAvailable(
  database: DatabaseSync,
  providerEventId: string,
): void {
  const collision = database.prepare(
    `SELECT provider_event_id FROM consumer_payment_events
     WHERE provider_event_id = ?`,
  ).get(providerEventId)
  if (collision) throw providerEventConflict()
}

function assertNoOrphanDealProviderEvent(
  database: DatabaseSync,
  providerEventId: string,
): void {
  const collision = database.prepare(
    `SELECT provider_event_id FROM consumer_deal_payment_events
     WHERE provider_event_id = ?`,
  ).get(providerEventId)
  if (collision) throw providerEventConflict()
}

function assertProviderTransactionAvailable(
  database: DatabaseSync,
  row: PaymentRow,
  providerTransactionId: string,
): void {
  const collision = database.prepare(
    `SELECT id FROM consumer_deal_payment_intents
     WHERE provider_transaction_id = ? AND id <> ?
     UNION ALL
     SELECT id FROM consumer_payment_intents
     WHERE provider_transaction_id = ?
     LIMIT 1`,
  ).get(providerTransactionId, row.intent_id, providerTransactionId)
  if (collision) {
    throw new DomainError(
      409,
      'payment_callback_transaction_conflict',
      '支付连接器交易号已经绑定其他支付聚合',
    )
  }
}

function assertProviderRefundAvailable(
  database: DatabaseSync,
  input: Extract<ConsumerDealPaymentCallbackInput, { type: 'REFUND_SUCCEEDED' }>,
): void {
  const collision = database.prepare(
    `SELECT id FROM consumer_deal_refund_attempts
     WHERE provider_refund_id = ? AND id <> ?
     UNION ALL
     SELECT id FROM consumer_deal_refund_requests
     WHERE provider_refund_id = ? AND id <> ?
     UNION ALL
     SELECT id FROM consumer_refund_requests
     WHERE provider_refund_id = ?
     LIMIT 1`,
  ).get(
    input.providerRefundId, input.refundAttemptId,
    input.providerRefundId, input.refundId,
    input.providerRefundId,
  )
  if (collision) {
    throw new DomainError(
      409,
      'refund_callback_provider_id_conflict',
      '支付连接器退款号已经绑定其他退款聚合',
    )
  }
}

function replayReceipt(
  database: DatabaseSync,
  input: ConsumerDealPaymentCallbackInput,
  hash: string,
): ConsumerDealPaymentCallbackAck | undefined {
  const row = database.prepare(
    `SELECT request_hash, scope, aggregate_id, response_json
     FROM payment_connector_receipts WHERE provider_event_id = ?`,
  ).get(input.providerEventId) as ReceiptRow | undefined
  if (!row) return undefined
  if (
    row.request_hash !== hash
    || row.scope !== CALLBACK_SCOPE
    || row.aggregate_id !== aggregateId(input)
  ) {
    throw new DomainError(
      409,
      'payment_callback_event_conflict',
      '同一支付连接器事件号不能用于不同请求结果',
    )
  }
  const stored = JSON.parse(row.response_json) as ConsumerDealPaymentCallbackAck
  return { ...stored, replayed: true }
}

function paymentRow(database: DatabaseSync, intentId: string): PaymentRow {
  const row = database.prepare(
    `SELECT intents.id AS intent_id, intents.tenant_id, intents.user_id,
            intents.draft_id, intents.order_id, intents.provider AS intent_provider,
            intents.currency AS intent_currency, intents.amount_fen AS intent_amount_fen,
            intents.status AS intent_status,
            intents.provider_request_id AS intent_provider_request_id,
            intents.provider_transaction_id AS intent_provider_transaction_id,
            drafts.household_member_id, drafts.title,
            states.status AS checkout_status, states.version AS checkout_version,
            states.payment_intent_id AS checkout_payment_intent_id,
            holds.id AS hold_id, holds.status AS hold_status,
            holds.expires_at AS hold_expires_at, holds.sku_id, holds.slot_id,
            holds.quantity, skus.stock_mode,
            orders.merchant_id, orders.store_id, orders.status AS order_status,
            orders.version AS order_version, orders.gross_amount_fen,
            orders.discount_fen, orders.paid_amount_fen, orders.refund_amount_fen,
            snapshots.total_amount_fen AS snapshot_total_amount_fen
     FROM consumer_deal_payment_intents intents
     JOIN consumer_deal_drafts drafts ON drafts.id = intents.draft_id
     JOIN consumer_deal_checkout_states states ON states.draft_id = intents.draft_id
     JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = intents.draft_id
     JOIN merchant_skus skus ON skus.id = holds.sku_id
     JOIN merchant_orders orders ON orders.id = intents.order_id
     LEFT JOIN consumer_deal_order_snapshots snapshots ON snapshots.draft_id = intents.draft_id
     WHERE intents.id = ?`,
  ).get(intentId) as unknown as PaymentRow | undefined
  if (!row) throw new DomainError(404, 'consumer_deal_payment_intent_not_found', '套餐支付意图不存在')
  return row
}

function assertOccurredAt(input: ConsumerDealPaymentCallbackInput): number {
  const value = Date.parse(input.occurredAt)
  if (Number.isNaN(value)) {
    throw new DomainError(400, 'payment_callback_time_invalid', '支付连接器事件时间无效')
  }
  if (value > Date.now() + 5 * 60_000) {
    throw new DomainError(422, 'payment_callback_time_in_future', '支付连接器事件时间超出允许时钟偏差')
  }
  return value
}

function assertImmutablePaymentFacts(
  row: PaymentRow,
  input: ConsumerDealPaymentCallbackInput,
): void {
  const payable = row.gross_amount_fen - row.discount_fen
  if (
    row.intent_provider !== 'WECHAT_PAY'
    || row.intent_currency !== input.currency
    || row.intent_amount_fen !== input.amountFen
    || row.snapshot_total_amount_fen !== input.amountFen
    || payable !== input.amountFen
    || row.checkout_payment_intent_id !== row.intent_id
  ) {
    throw new DomainError(
      409,
      'consumer_deal_payment_fact_mismatch',
      '回调金额、币种或不可变订单事实与套餐支付意图不一致',
    )
  }
}

function releaseResource(
  database: DatabaseSync,
  row: PaymentRow,
  expectedStatus: 'HELD' | 'CONSUMED',
  timestamp: string,
): boolean {
  if (row.hold_status !== expectedStatus) return false
  if (row.slot_id) {
    const changed = database.prepare(
      `UPDATE merchant_service_slots
       SET reserved = reserved - ?, updated_at = ?
       WHERE id = ? AND reserved >= ?`,
    ).run(row.quantity, timestamp, row.slot_id, row.quantity)
    if (Number(changed.changes) !== 1) {
      throw new DomainError(409, 'deal_hold_resource_inconsistent', '预约容量与套餐占用事实不一致')
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
      throw new DomainError(409, 'deal_hold_resource_inconsistent', '有限库存与套餐占用事实不一致')
    }
  }
  const released = database.prepare(
    `UPDATE consumer_deal_fulfillment_holds
     SET status = 'RELEASED', released_at = ?, updated_at = ?
     WHERE id = ? AND status = ?`,
  ).run(timestamp, timestamp, row.hold_id, expectedStatus)
  if (Number(released.changes) !== 1) {
    throw new DomainError(409, 'deal_hold_state_changed', '套餐资源占用状态已变化')
  }
  return true
}

function callbackPayload(
  input: ConsumerDealPaymentCallbackInput,
  row: PaymentRow,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    providerEventId: input.providerEventId,
    type: input.type,
    intentId: row.intent_id,
    providerRequestId: input.providerRequestId,
    draftId: row.draft_id,
    orderId: row.order_id,
    amountFen: input.amountFen,
    currency: input.currency,
    occurredAt: input.occurredAt,
    providerTransactionId: input.providerTransactionId ?? null,
    providerRefundId: input.providerRefundId ?? null,
    failureCode: input.failureCode ?? null,
    ...extra,
  }
}

function recordCallbackEvidence(
  database: DatabaseSync,
  row: PaymentRow,
  input: ConsumerDealPaymentCallbackInput,
  hash: string,
  eventType: string,
  outcome: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
  fromStatus: string,
  toStatus: string,
  topics: string[],
): void {
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO consumer_deal_payment_events
     (id, tenant_id, user_id, intent_id, draft_id, order_id, provider_event_id,
      type, request_hash, outcome, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.intent_id, row.draft_id,
    row.order_id, input.providerEventId, eventType, hash, outcome, summary,
    payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO consumer_deal_events
     (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.draft_id,
    eventType, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO merchant_order_events
     (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
      summary, from_status, to_status, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'PAYMENT_CONNECTOR', ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.merchant_id, row.store_id, row.order_id,
    eventType, summary, fromStatus, toStatus, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, 'PAYMENT_CONNECTOR', ?, 'consumer_deal_payment_intent', ?,
             'L2', 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, row.tenant_id, `CONSUMER_DEAL_${eventType}`,
    row.intent_id, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, row.tenant_id,
    `consumer.deal.${eventType.toLowerCase().replaceAll('_', '.')}`,
    payloadJson, timestamp,
  )
  for (const topic of topics) {
    const refundAttemptId = payload.refundAttemptId
    const outboxAggregateId = topic.includes('.refund.') && typeof refundAttemptId === 'string'
      ? refundAttemptId
      : aggregateId(input)
    database.prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), RUN_ID, row.tenant_id, topic, outboxAggregateId, payloadJson, timestamp,
    )
  }
}

function insertConsumerMessage(
  database: DatabaseSync,
  row: PaymentRow,
  title: string,
  body: string,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO consumer_messages
     (id, tenant_id, user_id, household_member_id, category, title, body,
      action_label, action_target, read_at, version, created_at)
     VALUES (?, ?, ?, ?, 'TRANSACTION', ?, ?, '查看订单', ?, NULL, 1, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.household_member_id,
    title, body,
    `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(row.order_id)}`,
    timestamp,
  )
}

function refundStatus(
  database: DatabaseSync,
  intentId: string,
): ConsumerDealPaymentCallbackAck['refundStatus'] {
  const row = database.prepare(
    `SELECT status
     FROM consumer_deal_refund_requests
     WHERE payment_intent_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  ).get(intentId) as { status: ConsumerDealPaymentCallbackAck['refundStatus'] } | undefined
  return row?.status ?? 'NONE'
}

function callbackOutcome(
  row: PaymentRow,
  input: ConsumerDealPaymentCallbackInput,
): ConsumerDealPaymentCallbackAck['outcome'] {
  if (input.type === 'PAYMENT_SUCCEEDED') {
    return row.intent_status === 'LATE_SUCCEEDED'
      ? 'LATE_PAYMENT_COMPENSATION_STARTED'
      : 'PAYMENT_SUCCEEDED'
  }
  return input.type
}

function baseAck(
  database: DatabaseSync,
  row: PaymentRow,
  input: ConsumerDealPaymentCallbackInput,
  applied: boolean,
  outcome: ConsumerDealPaymentCallbackAck['outcome'],
  paymentStatus: ConsumerDealPaymentCallbackAck['paymentStatus'],
): ConsumerDealPaymentCallbackAck {
  return {
    accepted: true,
    replayed: false,
    applied,
    intentId: input.intentId,
    orderId: row.order_id,
    outcome,
    paymentStatus,
    refundStatus: refundStatus(database, row.intent_id),
  }
}

function persistReceipt(
  database: DatabaseSync,
  input: ConsumerDealPaymentCallbackInput,
  hash: string,
  response: ConsumerDealPaymentCallbackAck,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO payment_connector_receipts
     (provider_event_id, request_hash, scope, aggregate_id, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.providerEventId, hash, CALLBACK_SCOPE, aggregateId(input),
    JSON.stringify(response), timestamp,
  )
}

function recordSemanticDuplicate(
  database: DatabaseSync,
  row: PaymentRow,
  input: ConsumerDealPaymentCallbackInput,
  hash: string,
  outcome: string,
  timestamp: string,
): ConsumerDealPaymentCallbackAck {
  const payload = callbackPayload(input, row, { semanticDuplicate: true })
  database.prepare(
    `INSERT INTO consumer_deal_payment_events
     (id, tenant_id, user_id, intent_id, draft_id, order_id, provider_event_id,
      type, request_hash, outcome, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.intent_id, row.draft_id,
    row.order_id, input.providerEventId, input.type, hash, outcome,
    '支付连接器重复发送已收敛的语义事件', JSON.stringify(payload), timestamp,
  )
  return baseAck(database, row, input, false, callbackOutcome(row, input), row.intent_status)
}

function applyPaymentSucceeded(
  database: DatabaseSync,
  row: PaymentRow,
  input: Extract<ConsumerDealPaymentCallbackInput, { type: 'PAYMENT_SUCCEEDED' }>,
  hash: string,
  occurredAt: number,
  timestamp: string,
): ConsumerDealPaymentCallbackAck {
  assertProviderTransactionAvailable(database, row, input.providerTransactionId)
  if (row.intent_status === 'SUCCEEDED') {
    if (row.intent_provider_transaction_id !== input.providerTransactionId) {
      throw new DomainError(409, 'payment_callback_transaction_conflict', '支付意图已由另一连接器交易号完成')
    }
    return recordSemanticDuplicate(database, row, input, hash, 'PAYMENT_ALREADY_SUCCEEDED', timestamp)
  }
  if (row.intent_status === 'LATE_SUCCEEDED') {
    if (row.intent_provider_transaction_id !== input.providerTransactionId) {
      throw new DomainError(409, 'payment_callback_transaction_conflict', '迟到支付已绑定另一连接器交易号')
    }
    return recordSemanticDuplicate(database, row, input, hash, 'LATE_PAYMENT_ALREADY_RECORDED', timestamp)
  }

  const late = occurredAt > Date.parse(row.hold_expires_at)
    || row.hold_status === 'RELEASED'
    || row.checkout_status === 'EXPIRED'
    || row.order_status === 'CANCELLED'
    || row.intent_status === 'CANCELLED'
    || row.intent_status === 'FAILED'

  if (late) {
    if (row.hold_status === 'HELD') releaseResource(database, row, 'HELD', timestamp)
    const intentChanged = database.prepare(
      `UPDATE consumer_deal_payment_intents
       SET status = 'LATE_SUCCEEDED', provider_transaction_id = ?, late_success = 1,
           succeeded_at = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND status IN ('PENDING_PROVIDER', 'FAILED', 'CANCELLED')`,
    ).run(input.providerTransactionId, input.occurredAt, timestamp, row.intent_id)
    if (Number(intentChanged.changes) !== 1) {
      throw new DomainError(409, 'payment_callback_state_changed', '套餐支付状态已并发变化')
    }
    database.prepare(
      `UPDATE merchant_orders
       SET status = 'REFUND_REQUESTED', paid_amount_fen = ?,
           exception_code = 'LATE_PAYMENT_SUCCEEDED',
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.amountFen, timestamp, row.order_id)
    database.prepare(
      `UPDATE consumer_deal_checkout_states
       SET status = 'EXPIRED', version = version + 1,
           expired_at = COALESCE(expired_at, ?), updated_at = ?
       WHERE draft_id = ?`,
    ).run(timestamp, timestamp, row.draft_id)

    const refundId = randomUUID()
    const refundAttemptId = randomUUID()
    const refundProviderRequestId = `LQDEALREFUND-${randomUUID()}`
    database.prepare(
      `INSERT INTO consumer_deal_refund_requests
       (id, tenant_id, user_id, draft_id, order_id, payment_intent_id, kind,
        amount_fen, reason, status, provider_refund_id, failure_code,
        version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'LATE_PAYMENT_COMPENSATION', ?, ?,
               'APPROVED_PENDING_PROVIDER', NULL, NULL, 1, ?, ?)`,
    ).run(
      refundId, row.tenant_id, row.user_id, row.draft_id, row.order_id,
      row.intent_id, input.amountFen, '待支付占用结束后收到支付成功，自动发起全额补偿退款',
      timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_deal_refund_attempts
       (id, tenant_id, refund_id, provider_request_id, amount_fen, currency,
        status, provider_refund_id, failure_code, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'CNY', 'PENDING_PROVIDER', NULL, NULL, 1, ?, ?)`,
    ).run(
      refundAttemptId, row.tenant_id, refundId, refundProviderRequestId,
      input.amountFen, timestamp, timestamp,
    )
    const payload = callbackPayload(input, row, {
      lateSuccess: true,
      refundId,
      refundAttemptId,
      refundProviderRequestId,
      resourceReacquired: false,
    })
    recordCallbackEvidence(
      database, row, input, hash, 'PAYMENT_SUCCEEDED_LATE',
      'LATE_PAYMENT_COMPENSATION_STARTED',
      '占用结束后收到支付成功，订单进入异常并自动发起全额补偿退款',
      payload, timestamp, row.order_status, 'REFUND_REQUESTED',
      ['consumer.deal.payment.late-succeeded.v1', 'consumer.deal.refund.requested.v1'],
    )
    insertConsumerMessage(
      database, row, '检测到迟到支付，正在自动退款',
      `${row.title}的支付在占用结束后才确认成功，订单未恢复，系统已发起全额补偿退款。`,
      timestamp,
    )
    return baseAck(
      database, row, input, true, 'LATE_PAYMENT_COMPENSATION_STARTED', 'LATE_SUCCEEDED',
    )
  }

  if (
    row.intent_status !== 'PENDING_PROVIDER'
    || row.hold_status !== 'HELD'
    || row.checkout_status !== 'CONFIRMED'
    || !['PENDING_CONFIRMATION', 'CONFIRMED'].includes(row.order_status)
    || row.paid_amount_fen !== 0
    || row.refund_amount_fen !== 0
  ) {
    throw new DomainError(409, 'payment_callback_state_invalid', '当前套餐订单状态不能确认支付成功')
  }
  const intentChanged = database.prepare(
    `UPDATE consumer_deal_payment_intents
     SET status = 'SUCCEEDED', provider_transaction_id = ?, succeeded_at = ?,
         version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'PENDING_PROVIDER'`,
  ).run(input.providerTransactionId, input.occurredAt, timestamp, row.intent_id)
  const holdChanged = database.prepare(
    `UPDATE consumer_deal_fulfillment_holds
     SET status = 'CONSUMED', consumed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'HELD'`,
  ).run(input.occurredAt, timestamp, row.hold_id)
  const orderChanged = database.prepare(
    `UPDATE merchant_orders
     SET paid_amount_fen = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND version = ? AND paid_amount_fen = 0`,
  ).run(input.amountFen, timestamp, row.order_id, row.order_version)
  const checkoutChanged = database.prepare(
    `UPDATE consumer_deal_checkout_states
     SET version = version + 1, updated_at = ?
     WHERE draft_id = ? AND status = 'CONFIRMED' AND payment_intent_id = ?`,
  ).run(timestamp, row.draft_id, row.intent_id)
  if (
    Number(intentChanged.changes) !== 1
    || Number(holdChanged.changes) !== 1
    || Number(orderChanged.changes) !== 1
    || Number(checkoutChanged.changes) !== 1
  ) {
    throw new DomainError(409, 'payment_callback_state_changed', '套餐支付状态已并发变化')
  }
  const payload = callbackPayload(input, row, { holdStatus: 'CONSUMED' })
  recordCallbackEvidence(
    database, row, input, hash, 'PAYMENT_SUCCEEDED', 'PAYMENT_SUCCEEDED',
    '签名回调确认套餐支付成功，资源占用转入履约', payload, timestamp,
    row.order_status, row.order_status, ['consumer.deal.payment.succeeded.v1'],
  )
  insertConsumerMessage(
    database, row, '套餐支付成功',
    `${row.title}已支付 ¥${(input.amountFen / 100).toFixed(2)}，等待商家确认接单。`,
    timestamp,
  )
  return baseAck(database, row, input, true, 'PAYMENT_SUCCEEDED', 'SUCCEEDED')
}

function applyPaymentFailed(
  database: DatabaseSync,
  row: PaymentRow,
  input: Extract<ConsumerDealPaymentCallbackInput, { type: 'PAYMENT_FAILED' }>,
  hash: string,
  timestamp: string,
): ConsumerDealPaymentCallbackAck {
  if (row.intent_status !== 'PENDING_PROVIDER') {
    return recordSemanticDuplicate(database, row, input, hash, 'PAYMENT_FAILURE_IGNORED', timestamp)
  }
  if (row.hold_status === 'HELD') releaseResource(database, row, 'HELD', timestamp)
  const intentChanged = database.prepare(
    `UPDATE consumer_deal_payment_intents
     SET status = 'FAILED', failure_code = ?, failed_at = ?,
         version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'PENDING_PROVIDER'`,
  ).run(input.failureCode, input.occurredAt, timestamp, row.intent_id)
  if (Number(intentChanged.changes) !== 1) {
    throw new DomainError(409, 'payment_callback_state_changed', '套餐支付状态已并发变化')
  }
  database.prepare(
    `UPDATE merchant_orders
     SET status = 'CANCELLED', exception_code = ?, version = version + 1, updated_at = ?
     WHERE id = ?`,
  ).run(`PAYMENT_FAILED:${input.failureCode}`, timestamp, row.order_id)
  database.prepare(
    `UPDATE consumer_deal_checkout_states
     SET status = 'EXPIRED', version = version + 1,
         expired_at = COALESCE(expired_at, ?), updated_at = ?
     WHERE draft_id = ?`,
  ).run(timestamp, timestamp, row.draft_id)
  const payload = callbackPayload(input, row, { resourceReleased: true })
  recordCallbackEvidence(
    database, row, input, hash, 'PAYMENT_FAILED', 'PAYMENT_FAILED',
    '支付连接器确认套餐支付失败，订单取消并释放资源', payload, timestamp,
    row.order_status, 'CANCELLED', ['consumer.deal.payment.failed.v1'],
  )
  insertConsumerMessage(
    database, row, '套餐支付失败，订单已取消',
    `${row.title}未完成支付，订单已取消，库存或预约容量已经释放。`,
    timestamp,
  )
  return baseAck(database, row, input, true, 'PAYMENT_FAILED', 'FAILED')
}

function refundRow(
  database: DatabaseSync,
  input: Extract<ConsumerDealPaymentCallbackInput, { type: 'REFUND_SUCCEEDED' | 'REFUND_FAILED' }>,
): RefundRow {
  const row = database.prepare(
    `SELECT requests.id AS refund_id, requests.status AS refund_status,
            requests.amount_fen AS refund_amount_fen,
            requests.provider_refund_id AS request_provider_refund_id,
            attempts.id AS attempt_id, attempts.status AS attempt_status,
            attempts.provider_request_id AS attempt_provider_request_id,
            attempts.amount_fen AS attempt_amount_fen,
            attempts.currency AS attempt_currency,
            attempts.provider_refund_id AS attempt_provider_refund_id
     FROM consumer_deal_refund_requests requests
     JOIN consumer_deal_refund_attempts attempts ON attempts.refund_id = requests.id
     WHERE requests.id = ? AND attempts.id = ?
       AND requests.payment_intent_id = ?`,
  ).get(input.refundId, input.refundAttemptId, input.intentId) as unknown as RefundRow | undefined
  if (!row) throw new DomainError(404, 'consumer_deal_refund_attempt_not_found', '套餐退款尝试不存在')
  return row
}

function applyRefundCallback(
  database: DatabaseSync,
  row: PaymentRow,
  input: Extract<ConsumerDealPaymentCallbackInput, { type: 'REFUND_SUCCEEDED' | 'REFUND_FAILED' }>,
  hash: string,
  timestamp: string,
): ConsumerDealPaymentCallbackAck {
  const refund = refundRow(database, input)
  if (
    refund.refund_amount_fen !== input.amountFen
    || refund.attempt_amount_fen !== input.amountFen
    || refund.attempt_currency !== input.currency
    || refund.attempt_provider_request_id !== input.providerRequestId
  ) {
    throw new DomainError(409, 'refund_callback_fact_mismatch', '退款回调与批准的退款尝试事实不一致')
  }

  if (input.type === 'REFUND_SUCCEEDED') {
    assertProviderRefundAvailable(database, input)
    if (refund.attempt_status === 'SUCCEEDED') {
      if (
        refund.attempt_provider_refund_id !== input.providerRefundId
        || refund.request_provider_refund_id !== input.providerRefundId
      ) {
        throw new DomainError(
          409,
          'refund_callback_provider_id_conflict',
          '退款尝试已经由另一支付连接器退款号完成',
        )
      }
      return recordSemanticDuplicate(
        database, row, input, hash, 'REFUND_ALREADY_SUCCEEDED', timestamp,
      )
    }
    const canConverge = (
      refund.attempt_status === 'PENDING_PROVIDER'
      && refund.refund_status === 'APPROVED_PENDING_PROVIDER'
    ) || (
      refund.attempt_status === 'FAILED'
      && ['FAILED', 'APPROVED_PENDING_PROVIDER'].includes(refund.refund_status)
    )
    if (!canConverge) {
      return recordSemanticDuplicate(
        database, row, input, hash, 'REFUND_SUCCESS_IGNORED_AFTER_RESOLUTION', timestamp,
      )
    }
    const attemptChanged = database.prepare(
      `UPDATE consumer_deal_refund_attempts
       SET status = 'SUCCEEDED', provider_refund_id = ?, failure_code = NULL,
           version = version + 1, updated_at = ?
       WHERE id = ? AND status IN ('PENDING_PROVIDER', 'FAILED')`,
    ).run(input.providerRefundId, timestamp, refund.attempt_id)
    const requestChanged = database.prepare(
      `UPDATE consumer_deal_refund_requests
       SET status = 'REFUNDED', provider_refund_id = ?, failure_code = NULL,
           version = version + 1, updated_at = ?
       WHERE id = ? AND status IN ('APPROVED_PENDING_PROVIDER', 'FAILED')`,
    ).run(input.providerRefundId, timestamp, refund.refund_id)
    if (Number(attemptChanged.changes) !== 1 || Number(requestChanged.changes) !== 1) {
      throw new DomainError(409, 'refund_callback_state_changed', '套餐退款状态已并发变化')
    }
    if (row.hold_status === 'CONSUMED') releaseResource(database, row, 'CONSUMED', timestamp)
    const credentials = database.prepare(
      `SELECT id FROM consumer_deal_redemption_credentials
       WHERE order_id = ? AND status = 'ISSUED'`,
    ).all(row.order_id) as Array<{ id: string }>
    database.prepare(
      `UPDATE consumer_deal_redemption_credentials
       SET status = 'REVOKED', revoked_at = ?, version = version + 1, updated_at = ?
       WHERE order_id = ? AND status = 'ISSUED'`,
    ).run(timestamp, timestamp, row.order_id)
    for (const credential of credentials) {
      database.prepare(
        `INSERT INTO consumer_deal_redemption_events
         (id, tenant_id, credential_id, order_id, type, actor_id,
          summary, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'CREDENTIAL_REVOKED', 'PAYMENT_CONNECTOR', ?, ?, ?)`,
      ).run(
        randomUUID(), row.tenant_id, credential.id, row.order_id,
        '套餐退款成功，支付连接器回调撤销核销凭证',
        JSON.stringify({
          credentialId: credential.id,
          orderId: row.order_id,
          refundId: refund.refund_id,
          refundAttemptId: refund.attempt_id,
          providerRefundId: input.providerRefundId,
        }),
        timestamp,
      )
    }
    database.prepare(
      `UPDATE merchant_orders
       SET status = 'REFUNDED', refund_amount_fen = ?,
           verification_code_hash = NULL, verification_code_masked = NULL,
           exception_code = NULL, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.amountFen, timestamp, row.order_id)
    const payload = callbackPayload(input, row, {
      refundId: refund.refund_id,
      refundAttemptId: refund.attempt_id,
      resourceReleased: row.hold_status === 'CONSUMED',
      credentialRevoked: credentials.length > 0,
    })
    recordCallbackEvidence(
      database, row, input, hash, 'REFUND_SUCCEEDED', 'REFUND_SUCCEEDED',
      '支付连接器确认套餐退款成功，订单与履约资源完成收敛', payload, timestamp,
      row.order_status, 'REFUNDED', ['consumer.deal.refund.succeeded.v1'],
    )
    insertConsumerMessage(
      database, row, '套餐退款成功',
      `${row.title}已退款 ¥${(input.amountFen / 100).toFixed(2)}，相关履约凭证已撤销。`,
      timestamp,
    )
    return baseAck(database, row, input, true, 'REFUND_SUCCEEDED', row.intent_status)
  }

  if (refund.attempt_status !== 'PENDING_PROVIDER' || refund.refund_status !== 'APPROVED_PENDING_PROVIDER') {
    return recordSemanticDuplicate(database, row, input, hash, 'REFUND_FAILURE_IGNORED', timestamp)
  }

  const attemptChanged = database.prepare(
    `UPDATE consumer_deal_refund_attempts
     SET status = 'FAILED', failure_code = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'PENDING_PROVIDER'`,
  ).run(input.failureCode, timestamp, refund.attempt_id)
  const requestChanged = database.prepare(
    `UPDATE consumer_deal_refund_requests
     SET status = 'FAILED', failure_code = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'APPROVED_PENDING_PROVIDER'`,
  ).run(input.failureCode, timestamp, refund.refund_id)
  if (Number(attemptChanged.changes) !== 1 || Number(requestChanged.changes) !== 1) {
    throw new DomainError(409, 'refund_callback_state_changed', '套餐退款状态已经并发变化')
  }
  database.prepare(
    `UPDATE merchant_orders
     SET status = 'REFUND_REQUESTED', exception_code = ?,
         version = version + 1, updated_at = ?
     WHERE id = ?`,
  ).run(`REFUND_FAILED:${input.failureCode}`, timestamp, row.order_id)
  const payload = callbackPayload(input, row, {
    refundId: refund.refund_id,
    refundAttemptId: refund.attempt_id,
    retryRequiresNewAttempt: true,
  })
  recordCallbackEvidence(
    database, row, input, hash, 'REFUND_FAILED', 'REFUND_FAILED_RETRYABLE',
    '支付连接器返回套餐退款失败，订单进入异常并允许创建新退款尝试', payload,
    timestamp, row.order_status, 'REFUND_REQUESTED', ['consumer.deal.refund.failed.v1'],
  )
  insertConsumerMessage(
    database, row, '套餐退款暂未成功',
    `${row.title}的退款连接器处理失败，系统已保留支付事实，可继续发起退款重试。`,
    timestamp,
  )
  return baseAck(database, row, input, true, 'REFUND_FAILED', row.intent_status)
}

export function applyConsumerDealPaymentCallback(
  database: DatabaseSync,
  input: ConsumerDealPaymentCallbackInput,
  signature: string,
): ConsumerDealPaymentCallbackAck {
  assertCallbackSignature(input, signature)
  const hash = requestHash(input)
  const occurredAt = assertOccurredAt(input)

  database.exec('BEGIN IMMEDIATE;')
  try {
    assertLegacyProviderEventAvailable(database, input.providerEventId)
    const prior = replayReceipt(database, input, hash)
    if (prior) {
      database.exec('COMMIT;')
      return prior
    }
    assertNoOrphanDealProviderEvent(database, input.providerEventId)
    const row = paymentRow(database, input.intentId)
    assertImmutablePaymentFacts(row, input)
    if (input.type.startsWith('PAYMENT_') && row.intent_provider_request_id !== input.providerRequestId) {
      throw new DomainError(409, 'payment_callback_request_mismatch', '支付回调请求号与套餐支付意图不一致')
    }
    const timestamp = now()
    let response: ConsumerDealPaymentCallbackAck
    if (input.type === 'PAYMENT_SUCCEEDED') {
      response = applyPaymentSucceeded(database, row, input, hash, occurredAt, timestamp)
    } else if (input.type === 'PAYMENT_FAILED') {
      response = applyPaymentFailed(database, row, input, hash, timestamp)
    } else {
      response = applyRefundCallback(database, row, input, hash, timestamp)
    }
    persistReceipt(database, input, hash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
