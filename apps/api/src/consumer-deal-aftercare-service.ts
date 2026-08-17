import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type { ConsumerDealActionReceipt } from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-deal-aftercare-e8j'

type DealPaymentStatus = Exclude<ConsumerDealActionReceipt['paymentStatus'], 'NOT_REQUIRED'>
type DealRefundStatus = Exclude<ConsumerDealActionReceipt['refundStatus'], 'NONE'>
type DealHoldStatus = Exclude<ConsumerDealActionReceipt['holdStatus'], 'NONE'>

interface DealAftercareRow {
  draft_id: string
  tenant_id: string
  user_id: string
  household_member_id: string
  store_id: string
  service_at: string | null
  total_amount_fen: number
  checkout_status: ConsumerDealActionReceipt['status']
  checkout_version: number
  order_id: string | null
  merchant_id: string | null
  order_store_id: string | null
  order_status: string | null
  order_version: number | null
  paid_amount_fen: number | null
  refund_amount_fen: number | null
  payment_intent_id: string | null
  payment_status: DealPaymentStatus | null
  payment_amount_fen: number | null
  provider_request_id: string | null
  hold_id: string | null
  hold_status: DealHoldStatus | null
  sku_id: string | null
  slot_id: string | null
  quantity: number | null
  stock_mode: 'FINITE' | 'UNLIMITED' | 'SLOT' | null
  credential_id: string | null
  credential_status: 'ISSUED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED' | null
  refund_id: string | null
  refund_status: DealRefundStatus | null
}

export interface ConsumerDealAftercareInput {
  draftId: string
  expectedVersion: number
  confirmed: boolean
  reason: string
}

function now(): string { return new Date().toISOString() }

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不能操作消费者套餐')
  }
}

function scopedRoute(route: string, principal: Principal): string {
  return `${route}#tenant=${encodeURIComponent(principal.tenantId)}&user=${encodeURIComponent(principal.subject)}`
}

function requestReplay(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
): ConsumerDealActionReceipt | null {
  const stored = database.prepare(
    `SELECT request_hash, response_json
     FROM idempotency_records WHERE key = ? AND route = ?`,
  ).get(key, route) as { request_hash: string; response_json: string } | undefined
  if (!stored) return null
  if (stored.request_hash !== requestHash) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同的套餐售后请求')
  }
  database.prepare(
    `UPDATE idempotency_records SET replay_count = replay_count + 1
     WHERE key = ? AND route = ?`,
  ).run(key, route)
  return JSON.parse(stored.response_json) as ConsumerDealActionReceipt
}

function persistReplay(
  database: DatabaseSync,
  key: string,
  route: string,
  requestHash: string,
  response: ConsumerDealActionReceipt,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO idempotency_records
     (key, route, run_id, request_hash, response_json, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(key, route, RUN_ID, requestHash, JSON.stringify(response), timestamp)
}

function aftercareRow(
  database: DatabaseSync,
  principal: Principal,
  draftId: string,
): DealAftercareRow {
  const row = database.prepare(
    `SELECT drafts.id AS draft_id, drafts.tenant_id, drafts.user_id,
            drafts.household_member_id, drafts.store_id, drafts.service_at,
            drafts.total_amount_fen, states.status AS checkout_status,
            states.version AS checkout_version, states.order_id,
            orders.merchant_id, orders.store_id AS order_store_id,
            orders.status AS order_status, orders.version AS order_version,
            orders.paid_amount_fen, orders.refund_amount_fen,
            payments.id AS payment_intent_id, payments.status AS payment_status,
            payments.amount_fen AS payment_amount_fen,
            payments.provider_request_id,
            holds.id AS hold_id, holds.status AS hold_status, holds.sku_id,
            holds.slot_id, holds.quantity, skus.stock_mode,
            credentials.id AS credential_id,
            credentials.status AS credential_status,
            refunds.id AS refund_id, refunds.status AS refund_status
     FROM consumer_deal_drafts drafts
     JOIN consumer_deal_checkout_states states ON states.draft_id = drafts.id
     LEFT JOIN merchant_orders orders ON orders.id = states.order_id
     LEFT JOIN consumer_deal_payment_intents payments
       ON payments.id = states.payment_intent_id
     LEFT JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = drafts.id
     LEFT JOIN merchant_skus skus ON skus.id = holds.sku_id
     LEFT JOIN consumer_deal_redemption_credentials credentials
       ON credentials.draft_id = drafts.id
     LEFT JOIN consumer_deal_refund_requests refunds ON refunds.id = (
       SELECT latest.id FROM consumer_deal_refund_requests latest
       WHERE latest.draft_id = drafts.id
       ORDER BY latest.updated_at DESC, latest.created_at DESC LIMIT 1
     )
     WHERE drafts.id = ? AND drafts.tenant_id = ? AND drafts.user_id = ?`,
  ).get(draftId, principal.tenantId, principal.subject) as DealAftercareRow | undefined
  if (!row) {
    throw new DomainError(404, 'consumer_deal_draft_not_found', '套餐草稿不存在')
  }
  return row
}

function actionReceipt(
  database: DatabaseSync,
  principal: Principal,
  draftId: string,
): ConsumerDealActionReceipt {
  const row = database.prepare(
    `SELECT states.draft_id, states.order_id, states.status, states.version,
            payments.status AS payment_status,
            holds.status AS hold_status,
            refunds.status AS refund_status
     FROM consumer_deal_checkout_states states
     JOIN consumer_deal_drafts drafts ON drafts.id = states.draft_id
     LEFT JOIN consumer_deal_payment_intents payments
       ON payments.id = states.payment_intent_id
     LEFT JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = states.draft_id
     LEFT JOIN consumer_deal_refund_requests refunds ON refunds.id = (
       SELECT latest.id FROM consumer_deal_refund_requests latest
       WHERE latest.draft_id = states.draft_id
       ORDER BY latest.updated_at DESC, latest.created_at DESC LIMIT 1
     )
     WHERE states.draft_id = ? AND drafts.tenant_id = ? AND drafts.user_id = ?`,
  ).get(draftId, principal.tenantId, principal.subject) as {
    draft_id: string
    order_id: string | null
    status: ConsumerDealActionReceipt['status']
    version: number
    payment_status: DealPaymentStatus | null
    refund_status: DealRefundStatus | null
    hold_status: DealHoldStatus | null
  } | undefined
  if (!row) {
    throw new DomainError(404, 'consumer_deal_draft_not_found', '套餐草稿不存在')
  }
  return {
    accepted: true,
    draftId: row.draft_id,
    orderId: row.order_id,
    status: row.status,
    paymentStatus: row.payment_status ?? 'NOT_REQUIRED',
    refundStatus: row.refund_status ?? 'NONE',
    holdStatus: row.hold_status ?? 'NONE',
    version: row.version,
  }
}

function recordAuditTracking(
  database: DatabaseSync,
  principal: Principal,
  input: {
    action: string
    trackingName: string
    entityType: string
    entityId: string
    summary: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  const payloadJson = JSON.stringify(input.payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, 'CONSUMER', ?, ?, ?, 'L2', 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, input.action, input.entityType,
    input.entityId, input.summary, payloadJson, input.timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, input.trackingName,
    payloadJson, input.timestamp,
  )
}

function recordOutbox(
  database: DatabaseSync,
  principal: Principal,
  topic: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, topic, aggregateId,
    JSON.stringify(payload), timestamp,
  )
}

function revokeCredential(
  database: DatabaseSync,
  principal: Principal,
  row: DealAftercareRow,
  reason: 'CONSUMER_CANCELLED' | 'CONSUMER_REFUND_REQUESTED',
  timestamp: string,
): boolean {
  if (!row.credential_id || row.credential_status === 'REVOKED') return false
  if (row.credential_status === 'REDEEMED') {
    throw new DomainError(409, 'consumer_deal_already_verified', '套餐已经核销，不能取消或申请退款')
  }
  const changed = database.prepare(
    `UPDATE consumer_deal_redemption_credentials
     SET status = 'REVOKED', revoked_at = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND status IN ('ISSUED', 'EXPIRED')`,
  ).run(timestamp, timestamp, row.credential_id)
  if (Number(changed.changes) !== 1) {
    throw new DomainError(409, 'deal_credential_state_changed', '核销凭证状态已经变化，请刷新后重试')
  }
  const payload = {
    credentialId: row.credential_id,
    draftId: row.draft_id,
    orderId: row.order_id,
    reason,
  }
  database.prepare(
    `INSERT INTO consumer_deal_redemption_events
     (id, tenant_id, credential_id, order_id, type, actor_id, summary,
      payload_json, created_at)
     VALUES (?, ?, ?, ?, 'CREDENTIAL_REVOKED', ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, row.credential_id, row.order_id,
    principal.subject, reason === 'CONSUMER_CANCELLED'
      ? '消费者取消套餐，核销凭证同步撤销'
      : '消费者申请全额退款，核销凭证同步撤销',
    JSON.stringify(payload), timestamp,
  )
  recordOutbox(
    database, principal, 'consumer.deal.credential.revoked.v1',
    row.credential_id, payload, timestamp,
  )
  return true
}

function releaseFulfillmentHold(
  database: DatabaseSync,
  row: DealAftercareRow,
  timestamp: string,
): boolean {
  if (!row.hold_id || !row.hold_status || !row.sku_id || row.quantity === null) {
    throw new DomainError(409, 'deal_hold_missing', '套餐资源占用记录缺失，已停止取消')
  }
  if (row.hold_status === 'RELEASED') return false
  if (row.hold_status === 'FULFILLED') {
    throw new DomainError(409, 'consumer_deal_already_fulfilled', '套餐已经履约，不能直接取消')
  }
  if (row.slot_id) {
    const changed = database.prepare(
      `UPDATE merchant_service_slots
       SET reserved = reserved - ?, updated_at = ?
       WHERE id = ? AND reserved >= ?`,
    ).run(row.quantity, timestamp, row.slot_id, row.quantity)
    if (Number(changed.changes) !== 1) {
      throw new DomainError(409, 'deal_hold_resource_inconsistent', '预约容量与占用记录不一致，已停止取消')
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
      throw new DomainError(409, 'deal_hold_resource_inconsistent', '有限库存与占用记录不一致，已停止取消')
    }
  }
  const released = database.prepare(
    `UPDATE consumer_deal_fulfillment_holds
     SET status = 'RELEASED', released_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('HELD', 'CONSUMED')`,
  ).run(timestamp, timestamp, row.hold_id)
  if (Number(released.changes) !== 1) {
    throw new DomainError(409, 'deal_hold_state_changed', '套餐资源占用状态已经变化，请刷新后重试')
  }
  return true
}

function recordConsumerMessage(
  database: DatabaseSync,
  principal: Principal,
  row: DealAftercareRow,
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
    randomUUID(), principal.tenantId, principal.subject,
    row.household_member_id, title, body,
    row.order_id
      ? `/pages/module/index?path=orders/all&orderId=${encodeURIComponent(row.order_id)}`
      : `/pages/store/index?storeId=${encodeURIComponent(row.store_id)}`,
    timestamp,
  )
}

export function cancelConsumerDeal(
  database: DatabaseSync,
  principal: Principal,
  input: ConsumerDealAftercareInput,
  idempotencyKey: string,
): ConsumerDealActionReceipt {
  requireConsumer(principal)
  const route = scopedRoute(
    `/api/v1/consumer/deal-drafts/${input.draftId}/cancel`, principal,
  )
  const requestHash = hash(input)
  const stored = requestReplay(database, idempotencyKey, route, requestHash)
  if (stored) return stored
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_confirmation_required', '取消套餐前必须明确确认')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const concurrentStored = requestReplay(database, idempotencyKey, route, requestHash)
    if (concurrentStored) {
      database.exec('COMMIT;')
      return concurrentStored
    }
    const row = aftercareRow(database, principal, input.draftId)
    if (row.checkout_version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '套餐状态已经变化，请刷新后重试')
    }
    const timestamp = now()
    const reason = input.reason.trim()

    if (row.checkout_status === 'WAITING_CONFIRMATION') {
      const changed = database.prepare(
        `UPDATE consumer_deal_checkout_states
         SET status = 'EXPIRED', version = version + 1,
             expired_at = ?, updated_at = ?
         WHERE draft_id = ? AND status = 'WAITING_CONFIRMATION' AND version = ?`,
      ).run(timestamp, timestamp, row.draft_id, input.expectedVersion)
      if (Number(changed.changes) !== 1) {
        throw new DomainError(409, 'stale_entity_version', '套餐状态已经变化，请刷新后重试')
      }
      const payload = {
        draftId: row.draft_id,
        orderId: null,
        reason,
        fromStatus: 'WAITING_CONFIRMATION',
        toStatus: 'EXPIRED',
        resourceReleased: false,
      }
      database.prepare(
        `INSERT INTO consumer_deal_events
         (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'DRAFT_CANCELLED', ?, ?, ?)`,
      ).run(
        randomUUID(), principal.tenantId, principal.subject, row.draft_id,
        '消费者取消待确认套餐草稿，未创建订单或占用资源',
        JSON.stringify(payload), timestamp,
      )
      recordConsumerMessage(
        database, principal, row, '套餐草稿已取消',
        '待确认套餐草稿已经取消；没有创建订单、扣款或占用资源。', timestamp,
      )
      recordAuditTracking(database, principal, {
        action: 'CONSUMER_DEAL_DRAFT_CANCELLED',
        trackingName: 'consumer.deal.draft.cancelled',
        entityType: 'consumer_deal_draft',
        entityId: row.draft_id,
        summary: '消费者取消待确认套餐草稿',
        payload,
        timestamp,
      })
      recordOutbox(
        database, principal, 'consumer.deal.draft.cancelled.v1',
        row.draft_id, payload, timestamp,
      )
      const response = actionReceipt(database, principal, row.draft_id)
      persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
      database.exec('COMMIT;')
      return response
    }

    if (row.checkout_status !== 'CONFIRMED' || !row.order_id || !row.order_status) {
      throw new DomainError(409, 'consumer_deal_cannot_cancel', '当前套餐状态不允许消费者取消')
    }
    if (
      row.paid_amount_fen !== 0
      || row.payment_status === 'SUCCEEDED'
      || row.payment_status === 'LATE_SUCCEEDED'
    ) {
      throw new DomainError(409, 'consumer_deal_refund_required', '已支付套餐必须进入退款流程')
    }
    if (row.refund_status === 'REQUESTED' || row.refund_status === 'APPROVED_PENDING_PROVIDER') {
      throw new DomainError(409, 'consumer_deal_refund_in_progress', '退款正在处理中，不能直接取消套餐')
    }
    if (row.service_at && Date.parse(row.service_at) <= Date.now()) {
      throw new DomainError(409, 'consumer_deal_service_started', '套餐服务时间已经开始，不能直接取消')
    }
    if (row.credential_status === 'REDEEMED' || ['VERIFIED', 'COMPLETED', 'REFUNDED'].includes(row.order_status)) {
      throw new DomainError(409, 'consumer_deal_already_verified', '套餐已经核销或完成，不能直接取消')
    }
    const zeroAmountOrder = row.total_amount_fen === 0 && row.payment_intent_id === null
    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(row.order_status)) {
      throw new DomainError(409, 'consumer_deal_cannot_cancel', '当前订单状态不允许消费者直接取消')
    }
    if (
      !zeroAmountOrder
      && !row.payment_status
    ) {
      throw new DomainError(409, 'deal_payment_state_inconsistent', '套餐支付状态缺失，已停止取消')
    }
    if (
      row.payment_status
      && !['PENDING_PROVIDER', 'CANCELLED', 'FAILED'].includes(row.payment_status)
    ) {
      throw new DomainError(409, 'consumer_deal_cannot_cancel', '当前支付状态不允许消费者直接取消')
    }

    const resourceReleased = releaseFulfillmentHold(database, row, timestamp)
    const credentialRevoked = revokeCredential(
      database, principal, row, 'CONSUMER_CANCELLED', timestamp,
    )
    const orderChanged = database.prepare(
      `UPDATE merchant_orders
       SET status = 'CANCELLED', version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status = ?
         AND paid_amount_fen = 0 AND refund_amount_fen = 0`,
    ).run(timestamp, row.order_id, row.order_version, row.order_status)
    if (Number(orderChanged.changes) !== 1) {
      throw new DomainError(409, 'stale_entity_version', '商户订单已经变化，请刷新后重试')
    }

    let paymentCancelled = false
    if (row.payment_intent_id && row.payment_status === 'PENDING_PROVIDER') {
      const changed = database.prepare(
        `UPDATE consumer_deal_payment_intents
         SET status = 'CANCELLED', cancelled_at = ?, version = version + 1,
             updated_at = ?
         WHERE id = ? AND status = 'PENDING_PROVIDER'`,
      ).run(timestamp, timestamp, row.payment_intent_id)
      if (Number(changed.changes) !== 1) {
        throw new DomainError(409, 'deal_payment_state_changed', '支付状态已经变化，请刷新后重试')
      }
      paymentCancelled = true
    }
    const checkoutChanged = database.prepare(
      `UPDATE consumer_deal_checkout_states
       SET status = 'EXPIRED', version = version + 1,
           expired_at = ?, updated_at = ?
       WHERE draft_id = ? AND status = 'CONFIRMED' AND version = ?`,
    ).run(timestamp, timestamp, row.draft_id, input.expectedVersion)
    if (Number(checkoutChanged.changes) !== 1) {
      throw new DomainError(409, 'stale_entity_version', '套餐状态已经变化，请刷新后重试')
    }

    const payload = {
      draftId: row.draft_id,
      orderId: row.order_id,
      paymentIntentId: row.payment_intent_id,
      providerRequestId: row.provider_request_id,
      reason,
      fromStatus: row.order_status,
      toStatus: 'CANCELLED',
      paymentCancelled,
      resourceReleased,
      credentialRevoked,
      skuId: row.sku_id,
      slotId: row.slot_id,
      quantity: row.quantity,
      paidAmountFen: 0,
    }
    if (paymentCancelled && row.payment_intent_id) {
      database.prepare(
        `INSERT INTO consumer_deal_payment_events
         (id, tenant_id, user_id, intent_id, draft_id, order_id,
          provider_event_id, type, request_hash, outcome, summary,
          payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'PAYMENT_CANCELLED', ?,
                 'PAYMENT_CANCELLED', ?, ?, ?)`,
      ).run(
        randomUUID(), principal.tenantId, principal.subject,
        row.payment_intent_id, row.draft_id, row.order_id, hash(payload),
        '消费者取消未支付套餐，待连接器支付意图同步关闭',
        JSON.stringify(payload), timestamp,
      )
      recordOutbox(
        database, principal, 'consumer.deal.payment.cancelled.v1',
        row.payment_intent_id, payload, timestamp,
      )
    }
    database.prepare(
      `INSERT INTO consumer_deal_events
       (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'ORDER_CANCELLED', ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, row.draft_id,
      '消费者取消未支付套餐，订单与资源已经原子补偿',
      JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO merchant_order_events
       (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
        summary, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_DEAL_CANCELLED', ?, ?,
               'CANCELLED', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, row.merchant_id, row.order_store_id,
      row.order_id, principal.subject, '消费者取消未支付套餐并释放占用资源',
      row.order_status, JSON.stringify(payload), timestamp,
    )
    recordConsumerMessage(
      database, principal, row, '套餐订单已取消',
      '套餐订单已经取消；未发生实付，库存或预约容量已经准确释放。', timestamp,
    )
    recordAuditTracking(database, principal, {
      action: 'CONSUMER_DEAL_CANCELLED',
      trackingName: 'consumer.deal.cancelled',
      entityType: 'merchant_order',
      entityId: row.order_id,
      summary: '消费者取消未支付套餐并完成资源补偿',
      payload,
      timestamp,
    })
    recordOutbox(
      database, principal, 'consumer.deal.order.cancelled.v1',
      row.order_id, payload, timestamp,
    )
    if (resourceReleased && row.hold_id) {
      recordOutbox(
        database, principal, 'consumer.deal.resource.released.v1',
        row.hold_id, payload, timestamp,
      )
    }

    const response = actionReceipt(database, principal, row.draft_id)
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function requestConsumerDealRefund(
  database: DatabaseSync,
  principal: Principal,
  input: ConsumerDealAftercareInput,
  idempotencyKey: string,
): ConsumerDealActionReceipt {
  requireConsumer(principal)
  const route = scopedRoute(
    `/api/v1/consumer/deal-drafts/${input.draftId}/refunds`, principal,
  )
  const requestHash = hash(input)
  const stored = requestReplay(database, idempotencyKey, route, requestHash)
  if (stored) return stored
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_confirmation_required', '申请全额退款前必须明确确认')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const concurrentStored = requestReplay(database, idempotencyKey, route, requestHash)
    if (concurrentStored) {
      database.exec('COMMIT;')
      return concurrentStored
    }
    const row = aftercareRow(database, principal, input.draftId)
    if (row.checkout_status !== 'CONFIRMED' || row.checkout_version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '套餐状态已经变化，请刷新后重试')
    }
    if (
      !row.order_id || !row.order_status || row.order_version === null
      || !row.payment_intent_id || row.payment_status !== 'SUCCEEDED'
      || row.payment_amount_fen === null || row.paid_amount_fen === null
    ) {
      throw new DomainError(409, 'consumer_deal_refund_not_available', '只有支付成功的套餐才能申请全额退款')
    }
    if (row.paid_amount_fen <= 0 || row.paid_amount_fen !== row.payment_amount_fen) {
      throw new DomainError(409, 'deal_payment_amount_inconsistent', '套餐实付金额与支付意图不一致，已停止退款申请')
    }
    if ((row.refund_amount_fen ?? 0) !== 0) {
      throw new DomainError(409, 'consumer_deal_already_refunded', '套餐已经存在实际退款，不能重复申请')
    }
    if (row.refund_status === 'REQUESTED' || row.refund_status === 'APPROVED_PENDING_PROVIDER') {
      throw new DomainError(409, 'consumer_deal_refund_in_progress', '套餐已经存在处理中退款')
    }
    if (row.refund_status === 'REFUNDED') {
      throw new DomainError(409, 'consumer_deal_already_refunded', '套餐已经退款成功')
    }
    if (row.service_at && Date.parse(row.service_at) <= Date.now()) {
      throw new DomainError(409, 'consumer_deal_service_started', '套餐服务时间已经开始，不能申请退款')
    }
    if (
      row.credential_status === 'REDEEMED'
      || ['VERIFIED', 'COMPLETED', 'REFUNDED'].includes(row.order_status)
    ) {
      throw new DomainError(409, 'consumer_deal_already_verified', '套餐已经核销或完成，不能申请退款')
    }
    const allowedOrderStatuses = ['PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_SERVICE']
    const retryAfterFailure = row.order_status === 'REFUND_REQUESTED' && row.refund_status === 'FAILED'
    if (!allowedOrderStatuses.includes(row.order_status) && !retryAfterFailure) {
      throw new DomainError(409, 'consumer_deal_refund_not_available', '当前订单状态不能申请退款')
    }
    if (!row.hold_id || row.hold_status !== 'CONSUMED') {
      throw new DomainError(409, 'deal_hold_state_inconsistent', '支付成功套餐的履约资源状态不一致，已停止退款申请')
    }

    const timestamp = now()
    const reason = input.reason.trim()
    const refundId = randomUUID()
    database.prepare(
      `INSERT INTO consumer_deal_refund_requests
       (id, tenant_id, user_id, draft_id, order_id, payment_intent_id,
        kind, amount_fen, reason, status, provider_refund_id, failure_code,
        version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_REQUESTED', ?, ?, 'REQUESTED',
               NULL, NULL, 1, ?, ?)`,
    ).run(
      refundId, principal.tenantId, principal.subject, row.draft_id,
      row.order_id, row.payment_intent_id, row.paid_amount_fen,
      reason, timestamp, timestamp,
    )
    const orderChanged = database.prepare(
      `UPDATE merchant_orders
       SET status = 'REFUND_REQUESTED', version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status = ?
         AND paid_amount_fen = ? AND refund_amount_fen = 0`,
    ).run(
      timestamp, row.order_id, row.order_version, row.order_status,
      row.paid_amount_fen,
    )
    if (Number(orderChanged.changes) !== 1) {
      throw new DomainError(409, 'stale_entity_version', '商户订单已经变化，请刷新后重试')
    }
    const checkoutChanged = database.prepare(
      `UPDATE consumer_deal_checkout_states
       SET version = version + 1, updated_at = ?
       WHERE draft_id = ? AND status = 'CONFIRMED' AND version = ?`,
    ).run(timestamp, row.draft_id, input.expectedVersion)
    if (Number(checkoutChanged.changes) !== 1) {
      throw new DomainError(409, 'stale_entity_version', '套餐状态已经变化，请刷新后重试')
    }
    const credentialRevoked = revokeCredential(
      database, principal, row, 'CONSUMER_REFUND_REQUESTED', timestamp,
    )

    const payload = {
      refundId,
      draftId: row.draft_id,
      orderId: row.order_id,
      paymentIntentId: row.payment_intent_id,
      amountFen: row.paid_amount_fen,
      currency: 'CNY',
      reason,
      kind: 'CONSUMER_REQUESTED',
      fromStatus: row.order_status,
      toStatus: 'REFUND_REQUESTED',
      refundStatus: 'REQUESTED',
      credentialRevoked,
      resourceReleased: false,
      holdStatus: 'CONSUMED',
    }
    database.prepare(
      `INSERT INTO consumer_deal_events
       (id, tenant_id, user_id, draft_id, type, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'REFUND_REQUESTED', ?, ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, principal.subject, row.draft_id,
      '消费者提交套餐全额退款申请，履约资源保持占用直至退款成功',
      JSON.stringify(payload), timestamp,
    )
    database.prepare(
      `INSERT INTO merchant_order_events
       (id, tenant_id, merchant_id, store_id, order_id, actor_id, type,
        summary, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CONSUMER_DEAL_REFUND_REQUESTED', ?, ?,
               'REFUND_REQUESTED', ?, ?)`,
    ).run(
      randomUUID(), principal.tenantId, row.merchant_id, row.order_store_id,
      row.order_id, principal.subject, '消费者提交套餐全额退款申请',
      row.order_status, JSON.stringify(payload), timestamp,
    )
    recordConsumerMessage(
      database, principal, row, '套餐退款申请已提交',
      '全额退款申请已经提交，等待商户处理；当前尚未宣称退款成功，履约资源也不会提前释放。',
      timestamp,
    )
    recordAuditTracking(database, principal, {
      action: 'CONSUMER_DEAL_REFUND_REQUESTED',
      trackingName: 'consumer.deal.refund.requested',
      entityType: 'consumer_deal_refund_request',
      entityId: refundId,
      summary: '消费者提交套餐全额退款申请',
      payload,
      timestamp,
    })
    recordOutbox(
      database, principal, 'consumer.deal.refund.requested.v1',
      refundId, payload, timestamp,
    )

    const response = actionReceipt(database, principal, row.draft_id)
    persistReplay(database, idempotencyKey, route, requestHash, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
