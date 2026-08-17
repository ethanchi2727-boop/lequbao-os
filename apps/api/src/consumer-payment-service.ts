import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type { ConsumerAssistantOverview } from '@lequ/contracts'
import { getConsumerAssistantOverview } from './consumer-assistant-service.js'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-payment-e8e'
const DEVELOPMENT_CONNECTOR_SECRET = 'development-payment-webhook-secret'

export function paymentConnectorWebhookSecret(): string {
  const configured = process.env.PAYMENT_CONNECTOR_WEBHOOK_SECRET?.trim()
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new DomainError(
      503,
      'payment_connector_secret_unavailable',
      '生产环境未配置支付连接器回调密钥',
    )
  }
  return DEVELOPMENT_CONNECTOR_SECRET
}

interface ReplayRow { request_hash: string; response_json: string }

interface PaymentContextRow {
  draft_id: string
  draft_version: number
  session_id: string
  household_member_id: string
  reservation_at: string
  item_summary: string
  amount_fen: number
  order_id: string
  order_version: number
  order_status: string
  merchant_id: string
  store_id: string
  paid_amount_fen: number
  refund_amount_fen: number
}

export interface PaymentConnectorCallbackInput {
  providerEventId: string
  type: 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED' | 'REFUND_SUCCEEDED' | 'REFUND_FAILED'
  intentId: string
  amountFen: number
  currency: 'CNY'
  providerTransactionId?: string | undefined
  providerRefundId?: string | undefined
  failureCode?: string | undefined
}

function now(): string { return new Date().toISOString() }
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不是消费者本人')
  }
}

function replay<T>(database: DatabaseSync, key: string, route: string, input: unknown): T | undefined {
  const requestHash = hash(input)
  const stored = database.prepare(
    'SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?',
  ).get(key, route) as unknown as ReplayRow | undefined
  if (!stored) return undefined
  if (stored.request_hash !== requestHash) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
  }
  database.prepare(
    'UPDATE idempotency_records SET replay_count = replay_count + 1 WHERE key = ? AND route = ?',
  ).run(key, route)
  return JSON.parse(stored.response_json) as T
}

function persistReplay(
  database: DatabaseSync,
  key: string,
  route: string,
  input: unknown,
  response: unknown,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO idempotency_records
     (key, route, run_id, request_hash, response_json, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(key, route, RUN_ID, hash(input), JSON.stringify(response), timestamp)
}

function paymentContext(
  database: DatabaseSync,
  principal: Principal,
  draftId: string,
): PaymentContextRow {
  requireConsumer(principal)
  const row = database.prepare(
    `SELECT drafts.id AS draft_id, drafts.version AS draft_version,
            drafts.session_id, drafts.household_member_id, drafts.reservation_at,
            drafts.item_summary, drafts.amount_fen, drafts.order_id,
            orders.version AS order_version, orders.status AS order_status,
            orders.merchant_id, orders.store_id, orders.paid_amount_fen,
            orders.refund_amount_fen
     FROM consumer_reservation_drafts drafts
     JOIN merchant_orders orders ON orders.id = drafts.order_id
     JOIN consumer_profiles profiles ON profiles.user_id = drafts.user_id
       AND profiles.tenant_id = drafts.tenant_id
     WHERE drafts.id = ? AND drafts.tenant_id = ? AND drafts.user_id = ?
       AND drafts.city_id = profiles.preferred_city_id
       AND drafts.household_member_id = profiles.active_household_member_id`,
  ).get(draftId, principal.tenantId, principal.subject) as unknown as PaymentContextRow | undefined
  if (!row) {
    throw new DomainError(404, 'consumer_reservation_not_found', '当前身份下没有可支付的订座')
  }
  return row
}

function appendPaymentEvent(
  database: DatabaseSync,
  row: PaymentContextRow,
  intentId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
  providerEventId?: string,
): void {
  database.prepare(
    `INSERT INTO consumer_payment_events
     (id, tenant_id, user_id, intent_id, order_id, provider_event_id,
      type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), rowTenant(database, row.order_id), rowUser(database, row.draft_id),
    intentId, row.order_id, providerEventId ?? null, type, summary,
    JSON.stringify(payload), timestamp,
  )
}

function rowTenant(database: DatabaseSync, orderId: string): string {
  return (database.prepare('SELECT tenant_id FROM merchant_orders WHERE id = ?').get(orderId) as { tenant_id: string }).tenant_id
}

function rowUser(database: DatabaseSync, draftId: string): string {
  return (database.prepare('SELECT user_id FROM consumer_reservation_drafts WHERE id = ?').get(draftId) as { user_id: string }).user_id
}

function recordEvidence(
  database: DatabaseSync,
  tenantId: string,
  actorRole: string,
  action: string,
  entityType: string,
  entityId: string,
  riskLevel: 'L1' | 'L2',
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
  outboxTopic?: string,
): void {
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, tenantId, actorRole, action, entityType, entityId,
    riskLevel, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, tenantId, action.toLowerCase(), payloadJson, timestamp)
  if (outboxTopic) {
    database.prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), RUN_ID, tenantId, outboxTopic, entityId, payloadJson, timestamp)
  }
}

function touchConsumerProjection(
  database: DatabaseSync,
  row: PaymentContextRow,
  timestamp: string,
): void {
  database.prepare(
    'UPDATE consumer_reservation_drafts SET version = version + 1, updated_at = ? WHERE id = ?',
  ).run(timestamp, row.draft_id)
  database.prepare(
    'UPDATE consumer_assistant_sessions SET version = version + 1, updated_at = ? WHERE id = ?',
  ).run(timestamp, row.session_id)
}

export function prepareConsumerReservationPayment(
  database: DatabaseSync,
  principal: Principal,
  input: { draftId: string; expectedVersion: number; confirmed: boolean },
  idempotencyKey: string,
): ConsumerAssistantOverview {
  const route = `/api/v1/consumer/reservations/${input.draftId}/payment/prepare`
  const stored = replay<ConsumerAssistantOverview>(database, idempotencyKey, route, input)
  if (stored) return stored
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_confirmation_required', '生成支付请求前必须核对订单与金额')
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = paymentContext(database, principal, input.draftId)
    if (row.draft_version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '订座状态已更新，请刷新后重试')
    }
    if (row.order_status !== 'CONFIRMED') {
      throw new DomainError(409, 'payment_order_not_ready', '只有商家已确认的订座可以生成支付请求')
    }
    if (row.amount_fen <= 0 || row.paid_amount_fen !== 0 || row.refund_amount_fen !== 0) {
      throw new DomainError(409, 'payment_amount_invalid', '当前订单金额或支付状态不允许生成支付请求')
    }
    if (Date.parse(row.reservation_at) <= Date.now()) {
      throw new DomainError(409, 'consumer_reservation_started', '服务时间已开始，不能发起支付')
    }
    const existing = database.prepare(
      `SELECT id FROM consumer_payment_intents
       WHERE draft_id = ? AND status IN ('PENDING_PROVIDER', 'SUCCEEDED')
       ORDER BY created_at DESC LIMIT 1`,
    ).get(row.draft_id)
    if (existing) {
      throw new DomainError(409, 'payment_intent_exists', '已有待处理或已成功的支付请求')
    }
    const timestamp = now()
    const intentId = randomUUID()
    const providerRequestId = `LQPAY-${randomUUID()}`
    database.prepare(
      `INSERT INTO consumer_payment_intents
       (id, tenant_id, user_id, draft_id, order_id, provider, currency,
        amount_fen, status, provider_request_id, provider_transaction_id,
        failure_code, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'WECHAT_PAY', 'CNY', ?, 'PENDING_PROVIDER',
               ?, NULL, NULL, 1, ?, ?)`,
    ).run(
      intentId, principal.tenantId, principal.subject, row.draft_id, row.order_id,
      row.amount_fen, providerRequestId, timestamp, timestamp,
    )
    const payload = {
      intentId, providerRequestId, draftId: row.draft_id, orderId: row.order_id,
      amountFen: row.amount_fen, currency: 'CNY', connectorMode: 'OUTBOX_ONLY',
    }
    appendPaymentEvent(database, row, intentId, 'PAYMENT_REQUESTED', '消费者核对金额后生成支付连接器请求', payload, timestamp)
    touchConsumerProjection(database, row, timestamp)
    recordEvidence(
      database, principal.tenantId, 'CONSUMER', 'CONSUMER_PAYMENT_REQUESTED',
      'consumer_payment_intent', intentId, 'L2',
      '消费者明确确认后生成待连接器处理的支付请求', payload, timestamp,
      'consumer.payment.requested.v1',
    )
    const response = getConsumerAssistantOverview(database, principal)
    persistReplay(database, idempotencyKey, route, input, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function requestConsumerReservationRefund(
  database: DatabaseSync,
  principal: Principal,
  input: { draftId: string; expectedVersion: number; confirmed: boolean; reason: string },
  idempotencyKey: string,
): ConsumerAssistantOverview {
  const route = `/api/v1/consumer/reservations/${input.draftId}/refund`
  const stored = replay<ConsumerAssistantOverview>(database, idempotencyKey, route, input)
  if (stored) return stored
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_confirmation_required', '申请退款前必须核对金额与影响')
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = paymentContext(database, principal, input.draftId)
    if (row.draft_version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '订座状态已更新，请刷新后重试')
    }
    if (row.order_status !== 'CONFIRMED' || row.paid_amount_fen <= row.refund_amount_fen) {
      throw new DomainError(409, 'consumer_refund_not_available', '当前订座没有可申请退款的已支付金额')
    }
    if (Date.parse(row.reservation_at) <= Date.now()) {
      throw new DomainError(409, 'consumer_reservation_started', '服务时间已开始，请联系商家进入售后流程')
    }
    const intent = database.prepare(
      `SELECT id FROM consumer_payment_intents
       WHERE order_id = ? AND status = 'SUCCEEDED'
       ORDER BY created_at DESC LIMIT 1`,
    ).get(row.order_id) as { id: string } | undefined
    if (!intent) {
      throw new DomainError(409, 'payment_fact_missing', '缺少可验证的支付成功事实，不能申请退款')
    }
    const timestamp = now()
    const refundId = randomUUID()
    database.prepare(
      `INSERT INTO consumer_refund_requests
       (id, tenant_id, user_id, draft_id, order_id, payment_intent_id,
        amount_fen, reason, status, provider_refund_id, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', NULL, 1, ?, ?)`,
    ).run(
      refundId, principal.tenantId, principal.subject, row.draft_id, row.order_id,
      intent.id, row.paid_amount_fen, input.reason, timestamp, timestamp,
    )
    database.prepare(
      `UPDATE merchant_orders SET status = 'REFUND_REQUESTED', refund_amount_fen = ?,
       version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
    ).run(row.paid_amount_fen, timestamp, row.order_id, row.order_version)
    const payload = {
      refundId, intentId: intent.id, orderId: row.order_id,
      amountFen: row.paid_amount_fen, reason: input.reason,
      merchantApprovalRequired: true,
    }
    appendPaymentEvent(database, row, intent.id, 'REFUND_REQUESTED', '消费者明确确认并提交退款申请', payload, timestamp)
    database.prepare(
      `INSERT INTO merchant_order_events
       (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
        summary, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_REFUND_REQUESTED', ?, 'CONFIRMED',
               'REFUND_REQUESTED', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, row.merchant_id, row.store_id, row.order_id,
      principal.subject, '消费者申请退款，等待商家审核', JSON.stringify(payload), timestamp,
    )
    touchConsumerProjection(database, row, timestamp)
    recordEvidence(
      database, principal.tenantId, 'CONSUMER', 'CONSUMER_REFUND_REQUESTED',
      'consumer_refund_request', refundId, 'L2', '消费者提交全额退款申请',
      payload, timestamp, 'consumer.refund.requested.v1',
    )
    const response = getConsumerAssistantOverview(database, principal)
    persistReplay(database, idempotencyKey, route, input, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function paymentCallbackSignature(input: PaymentConnectorCallbackInput): string {
  const canonical = [
    input.providerEventId, input.type, input.intentId, String(input.amountFen),
    input.currency, input.providerTransactionId ?? '', input.providerRefundId ?? '',
    input.failureCode ?? '',
  ].join('|')
  return createHmac('sha256', paymentConnectorWebhookSecret()).update(canonical).digest('hex')
}

function assertCallbackSignature(input: PaymentConnectorCallbackInput, signature: string): void {
  const expected = Buffer.from(paymentCallbackSignature(input), 'hex')
  let received: Buffer
  try { received = Buffer.from(signature, 'hex') } catch { received = Buffer.alloc(0) }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new DomainError(401, 'payment_callback_signature_invalid', '支付连接器回调签名无效')
  }
}

function callbackPrincipal(tenantId: string, userId: string): Principal {
  return {
    subject: userId,
    displayName: '支付连接器回调',
    tenantId,
    roles: ['CONSUMER'],
    dataScope: 'SELF',
    cityIds: [], merchantIds: [], storeIds: [],
  }
}

export function applyConsumerPaymentCallback(
  database: DatabaseSync,
  input: PaymentConnectorCallbackInput,
  signature: string,
): ConsumerAssistantOverview {
  assertCallbackSignature(input, signature)
  const existingEvent = database.prepare(
    'SELECT intent_id FROM consumer_payment_events WHERE provider_event_id = ?',
  ).get(input.providerEventId) as { intent_id: string } | undefined
  const principalRow = database.prepare(
    `SELECT tenant_id, user_id FROM consumer_payment_intents WHERE id = ?`,
  ).get(input.intentId) as { tenant_id: string; user_id: string } | undefined
  if (!principalRow) throw new DomainError(404, 'payment_intent_not_found', '支付意图不存在')
  const principal = callbackPrincipal(principalRow.tenant_id, principalRow.user_id)
  if (existingEvent) return getConsumerAssistantOverview(database, principal)

  database.exec('BEGIN IMMEDIATE;')
  try {
    const joined = database.prepare(
      `SELECT intents.id AS intent_id, intents.status AS intent_status,
              intents.amount_fen AS intent_amount_fen, intents.currency,
              drafts.id AS draft_id, drafts.version AS draft_version,
              drafts.session_id, drafts.household_member_id, drafts.reservation_at,
              drafts.item_summary, drafts.amount_fen, drafts.order_id,
              orders.version AS order_version, orders.status AS order_status,
              orders.merchant_id, orders.store_id, orders.paid_amount_fen,
              orders.refund_amount_fen
       FROM consumer_payment_intents intents
       JOIN consumer_reservation_drafts drafts ON drafts.id = intents.draft_id
       JOIN merchant_orders orders ON orders.id = intents.order_id
       WHERE intents.id = ?`,
    ).get(input.intentId) as unknown as (PaymentContextRow & {
      intent_id: string
      intent_status: string
      intent_amount_fen: number
      currency: string
    })
    if (joined.intent_amount_fen !== input.amountFen || joined.currency !== input.currency) {
      throw new DomainError(409, 'payment_callback_amount_mismatch', '回调金额或币种与支付意图不一致')
    }
    const timestamp = now()
    if (input.type === 'PAYMENT_SUCCEEDED') {
      if (joined.intent_status !== 'PENDING_PROVIDER' || joined.order_status !== 'CONFIRMED' || joined.paid_amount_fen !== 0) {
        throw new DomainError(409, 'payment_callback_state_invalid', '当前状态不能确认支付成功')
      }
      if (!input.providerTransactionId) {
        throw new DomainError(400, 'provider_transaction_required', '支付成功回调必须包含连接器交易号')
      }
      database.prepare(
        `UPDATE consumer_payment_intents SET status = 'SUCCEEDED', provider_transaction_id = ?,
         version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(input.providerTransactionId, timestamp, input.intentId)
      database.prepare(
        `UPDATE merchant_orders SET paid_amount_fen = ?, version = version + 1,
         updated_at = ? WHERE id = ? AND version = ?`,
      ).run(input.amountFen, timestamp, joined.order_id, joined.order_version)
      const payload = {
        intentId: input.intentId, orderId: joined.order_id, amountFen: input.amountFen,
        currency: input.currency, providerTransactionId: input.providerTransactionId,
      }
      appendPaymentEvent(database, joined, input.intentId, 'PAYMENT_SUCCEEDED', '支付连接器确认扣款成功', payload, timestamp, input.providerEventId)
      database.prepare(
        `INSERT INTO merchant_order_events
         (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
          summary, from_status, to_status, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_PAYMENT_SUCCEEDED', ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(), principal.tenantId, joined.merchant_id, joined.store_id,
        joined.order_id, principal.subject, '支付连接器确认消费者支付成功',
        joined.order_status, joined.order_status, JSON.stringify(payload), timestamp,
      )
      database.prepare(
        `INSERT INTO consumer_messages
         (id, tenant_id, user_id, household_member_id, category, title, body,
          action_label, action_target, read_at, version, created_at)
         VALUES (?, ?, ?, ?, 'TRANSACTION', '支付成功', ?, '查看订座',
                 '/pages/assistant/index', NULL, 1, ?)`,
      ).run(
        randomUUID(), principal.tenantId, principal.subject, joined.household_member_id,
        `${joined.item_summary}已支付 ¥${(input.amountFen / 100).toFixed(2)}。`, timestamp,
      )
      touchConsumerProjection(database, joined, timestamp)
      recordEvidence(
        database, principal.tenantId, 'PAYMENT_CONNECTOR', 'CONSUMER_PAYMENT_SUCCEEDED',
        'consumer_payment_intent', input.intentId, 'L2', '签名回调确认支付成功',
        payload, timestamp, 'consumer.payment.succeeded.v1',
      )
    } else if (input.type === 'PAYMENT_FAILED') {
      if (joined.intent_status !== 'PENDING_PROVIDER') {
        throw new DomainError(409, 'payment_callback_state_invalid', '当前状态不能确认支付失败')
      }
      const payload = { intentId: input.intentId, orderId: joined.order_id, failureCode: input.failureCode ?? 'UNKNOWN' }
      database.prepare(
        `UPDATE consumer_payment_intents SET status = 'FAILED', failure_code = ?,
         version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(payload.failureCode, timestamp, input.intentId)
      appendPaymentEvent(database, joined, input.intentId, 'PAYMENT_FAILED', '支付连接器返回失败', payload, timestamp, input.providerEventId)
      touchConsumerProjection(database, joined, timestamp)
      recordEvidence(database, principal.tenantId, 'PAYMENT_CONNECTOR', 'CONSUMER_PAYMENT_FAILED', 'consumer_payment_intent', input.intentId, 'L1', '签名回调确认支付失败', payload, timestamp)
    } else {
      const refund = database.prepare(
        `SELECT id, status, amount_fen FROM consumer_refund_requests
         WHERE payment_intent_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).get(input.intentId) as { id: string; status: string; amount_fen: number } | undefined
      if (!refund || refund.amount_fen !== input.amountFen || refund.status !== 'APPROVED_PENDING_PROVIDER') {
        throw new DomainError(409, 'refund_callback_state_invalid', '当前退款状态或金额不允许处理该回调')
      }
      const succeeded = input.type === 'REFUND_SUCCEEDED'
      if (succeeded && !input.providerRefundId) {
        throw new DomainError(400, 'provider_refund_required', '退款成功回调必须包含连接器退款号')
      }
      const payload = {
        refundId: refund.id, intentId: input.intentId, orderId: joined.order_id,
        amountFen: input.amountFen, providerRefundId: input.providerRefundId ?? null,
        failureCode: input.failureCode ?? null,
      }
      database.prepare(
        `UPDATE consumer_refund_requests SET status = ?, provider_refund_id = ?,
         version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(succeeded ? 'REFUNDED' : 'FAILED', input.providerRefundId ?? null, timestamp, refund.id)
      database.prepare(
        `UPDATE merchant_orders SET status = ?, version = version + 1,
         updated_at = ? WHERE id = ? AND version = ?`,
      ).run(succeeded ? 'REFUNDED' : 'REFUND_REQUESTED', timestamp, joined.order_id, joined.order_version)
      appendPaymentEvent(
        database, joined, input.intentId, succeeded ? 'REFUND_SUCCEEDED' : 'REFUND_FAILED',
        succeeded ? '支付连接器确认退款成功' : '支付连接器返回退款失败',
        payload, timestamp, input.providerEventId,
      )
      touchConsumerProjection(database, joined, timestamp)
      recordEvidence(
        database, principal.tenantId, 'PAYMENT_CONNECTOR',
        succeeded ? 'CONSUMER_REFUND_SUCCEEDED' : 'CONSUMER_REFUND_FAILED',
        'consumer_refund_request', refund.id, 'L2',
        succeeded ? '签名回调确认退款成功' : '签名回调确认退款失败',
        payload, timestamp, succeeded ? 'consumer.refund.succeeded.v1' : undefined,
      )
    }
    const response = getConsumerAssistantOverview(database, principal)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
