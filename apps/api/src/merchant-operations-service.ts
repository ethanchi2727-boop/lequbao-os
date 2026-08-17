import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { canAccessResource, type Principal } from '@lequ/auth'
import type {
  MerchantAiRecommendationSummary,
  MerchantAnalyticsSummary,
  MerchantOperationsOverview,
  MerchantOrderChannel,
  MerchantOrderStatus,
  MerchantOrderSummary,
  MerchantStoreSummary,
  MerchantTodoSummary,
  RiskLevel,
} from '@lequ/contracts'
import {
  approveConsumerDealRefundForMerchant,
  ensureConsumerDealRedemptionCredentialForConfirmedOrder,
  getConsumerDealMerchantEligibility,
  issueConsumerDealRedemptionCredential,
  redeemConsumerDealRedemptionCredential,
} from './consumer-deal-credential-service.js'
import { DomainError } from './errors.js'

const RUN_ID = 'merchant-operations-e5'

interface StoreRow {
  id: string
  tenant_id: string
  merchant_id: string
  city_id: string
  name: string
  city_name: string
  address: string
  business_hours: string
  operating_status: MerchantStoreSummary['operatingStatus']
  manager_name: string
  updated_at: string
}

interface MetricRow {
  business_date: string
  revenue_fen: number
  previous_revenue_fen: number
  order_count: number
  new_member_count: number
  issued_verification_count: number
  verified_count: number
  visitor_count: number
  ai_health_score: number
  updated_at: string
}

interface OrderRow {
  id: string
  tenant_id: string
  merchant_id: string
  store_id: string
  order_no: string
  order_type: MerchantOrderSummary['type']
  channel: MerchantOrderSummary['channel']
  status: MerchantOrderStatus
  customer_name: string
  customer_phone_masked: string
  item_summary: string
  party_size: number | null
  service_at: string | null
  gross_amount_fen: number
  discount_fen: number
  paid_amount_fen: number
  refund_amount_fen: number
  consumer_deal_payment_status: Exclude<MerchantOrderSummary['consumerDealPaymentStatus'], 'NOT_APPLICABLE'> | null
  verification_code_hash: string | null
  verification_code_masked: string | null
  exception_code: string | null
  version: number
  placed_at: string
  updated_at: string
}

interface RecommendationRow {
  id: string
  priority: number
  title: string
  rationale: string
  expected_impact: string
  evidence_json: string
  action_label: string
  action_target: MerchantAiRecommendationSummary['actionTarget']
  risk_level: RiskLevel
  model_version: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function storeSummary(row: StoreRow): MerchantStoreSummary {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    cityName: row.city_name,
    address: row.address,
    businessHours: row.business_hours,
    operatingStatus: row.operating_status,
    managerName: row.manager_name,
  }
}

function orderSummary(database: DatabaseSync, row: OrderRow): MerchantOrderSummary {
  const deal = getConsumerDealMerchantEligibility(database, row.id)
  const consumerDealPaymentStatus: MerchantOrderSummary['consumerDealPaymentStatus'] = deal.isDeal
    ? (deal.paymentStatus ?? 'NOT_REQUIRED')
    : 'NOT_APPLICABLE'
  return {
    id: row.id,
    orderNo: row.order_no,
    type: row.order_type,
    channel: row.channel,
    status: row.status,
    customerName: row.customer_name,
    customerPhoneMasked: row.customer_phone_masked,
    itemSummary: row.item_summary,
    partySize: row.party_size,
    serviceAt: row.service_at,
    grossAmountFen: row.gross_amount_fen,
    discountFen: row.discount_fen,
    paidAmountFen: row.paid_amount_fen,
    refundAmountFen: deal.isDeal && deal.refundAmountFen !== null
      ? deal.refundAmountFen
      : row.refund_amount_fen,
    consumerDealPaymentStatus,
    consumerDealRefundStatus: deal.isDeal
      ? (deal.refundStatus ?? 'NONE')
      : 'NOT_APPLICABLE',
    merchantConfirmationAllowed: deal.isDeal
      ? deal.merchantConfirmationAllowed
      : row.status === 'PENDING_CONFIRMATION',
    verificationCodeMasked: row.verification_code_masked,
    verificationStatus: deal.isDeal
      ? (deal.credentialStatus ?? 'NOT_ISSUED')
      : 'NOT_APPLICABLE',
    exceptionCode: row.exception_code,
    version: row.version,
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
  }
}

function canReadStore(principal: Principal, row: StoreRow): boolean {
  return canAccessResource(principal, {
    tenantId: row.tenant_id,
    cityId: row.city_id,
    merchantId: row.merchant_id,
    storeId: row.id,
  })
}

function getStore(database: DatabaseSync, principal: Principal): StoreRow {
  const rows = database.prepare(
    `SELECT id, tenant_id, merchant_id, city_id, name, city_name, address,
            business_hours, operating_status, manager_name, updated_at
     FROM merchant_stores
     WHERE tenant_id = ?
     ORDER BY EXISTS (
       SELECT 1 FROM merchant_daily_metrics
       WHERE merchant_daily_metrics.store_id = merchant_stores.id
     ) DESC, updated_at DESC`,
  ).all(principal.tenantId) as unknown as StoreRow[]
  const row = rows.find((item) => canReadStore(principal, item))
  if (!row) {
    throw new DomainError(404, 'merchant_store_not_found', '当前数据范围内没有可访问的经营门店')
  }
  return row
}

function getOrder(
  database: DatabaseSync,
  principal: Principal,
  orderId: string,
): OrderRow {
  const row = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, order_no, order_type, channel,
            status, customer_name, customer_phone_masked, item_summary, party_size,
            service_at, gross_amount_fen, discount_fen, paid_amount_fen,
            refund_amount_fen,
            (SELECT status FROM consumer_deal_payment_intents
             WHERE consumer_deal_payment_intents.order_id = merchant_orders.id)
              AS consumer_deal_payment_status,
            verification_code_hash, verification_code_masked,
            exception_code, version, placed_at, updated_at
     FROM merchant_orders WHERE id = ? AND tenant_id = ?`,
  ).get(orderId, principal.tenantId) as unknown as OrderRow | undefined
  if (!row || !canAccessResource(principal, {
    tenantId: row.tenant_id,
    merchantId: row.merchant_id,
    storeId: row.store_id,
  })) {
    throw new DomainError(404, 'merchant_order_not_found', '订单不存在或不在当前门店数据范围')
  }
  return row
}

function assertVersion(row: OrderRow, expectedVersion: number): void {
  if (row.version !== expectedVersion) {
    throw new DomainError(409, 'stale_entity_version', '订单已被其他操作更新，请刷新后重试')
  }
}

function todoFromOrder(order: MerchantOrderSummary): MerchantTodoSummary | null {
  if (order.status === 'PENDING_CONFIRMATION' && order.merchantConfirmationAllowed) {
    return {
      id: `todo:${order.id}:confirm`,
      kind: 'ORDER_CONFIRMATION',
      title: `确认 ${order.customerName} 的预约`,
      detail: `${order.itemSummary} · ${order.serviceAt ? formatServiceTime(order.serviceAt) : '待约定时间'}`,
      urgency: 'HIGH',
      orderId: order.id,
      action: 'CONFIRM',
    }
  }
  if (
    order.status === 'REFUND_REQUESTED'
    && ['NOT_APPLICABLE', 'REQUESTED', 'FAILED'].includes(order.consumerDealRefundStatus)
  ) {
    const retry = order.consumerDealRefundStatus === 'FAILED'
    return {
      id: `todo:${order.id}:refund`,
      kind: 'REFUND_APPROVAL',
      title: `${retry ? '重试' : '审核'} ¥${(order.refundAmountFen / 100).toFixed(0)} 退款`,
      detail: `${order.customerName} · ${order.itemSummary}`,
      urgency: 'HIGH',
      orderId: order.id,
      action: 'APPROVE_REFUND',
    }
  }
  if (
    ['CONFIRMED', 'READY_FOR_SERVICE'].includes(order.status)
    && ['NOT_APPLICABLE', 'ISSUED'].includes(order.verificationStatus)
  ) {
    return {
      id: `todo:${order.id}:verify`,
      kind: 'ORDER_VERIFICATION',
      title: `${order.customerName} 已到店，等待核销`,
      detail: `${order.itemSummary} · 核销码 ${order.verificationCodeMasked ?? '待出示'}`,
      urgency: 'MEDIUM',
      orderId: order.id,
      action: 'VERIFY',
    }
  }
  if (order.status === 'EXCEPTION') {
    return {
      id: `todo:${order.id}:exception`,
      kind: 'ORDER_EXCEPTION',
      title: '库存锁定异常',
      detail: `${order.orderNo} · ${order.itemSummary}`,
      urgency: 'HIGH',
      orderId: order.id,
      action: 'VIEW',
    }
  }
  return null
}

function formatServiceTime(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function channelMix(orders: readonly MerchantOrderSummary[]): MerchantAnalyticsSummary['channelMix'] {
  const eligible = orders.filter((order) => ['CONFIRMED', 'READY_FOR_SERVICE', 'VERIFIED', 'COMPLETED'].includes(order.status))
  const channels: MerchantOrderChannel[] = ['MINIAPP', 'SKILL', 'POS', 'MARKETPLACE']
  const total = eligible.reduce((sum, order) => sum + order.paidAmountFen, 0)
  return channels.map((channel) => {
    const matching = eligible.filter((order) => order.channel === channel)
    const revenueFen = matching.reduce((sum, order) => sum + order.paidAmountFen, 0)
    return {
      channel,
      revenueFen,
      orderCount: matching.length,
      share: total ? Math.round(revenueFen / total * 1000) / 10 : 0,
    }
  }).sort((left, right) => right.revenueFen - left.revenueFen)
}

export function getMerchantOperationsOverview(
  database: DatabaseSync,
  principal: Principal,
  focusOrderId?: string,
): MerchantOperationsOverview {
  const store = getStore(database, principal)
  const metricRows = database.prepare(
    `SELECT business_date, revenue_fen, previous_revenue_fen, order_count,
            new_member_count, issued_verification_count, verified_count,
            visitor_count, ai_health_score, updated_at
     FROM merchant_daily_metrics WHERE store_id = ?
     ORDER BY business_date DESC LIMIT 7`,
  ).all(store.id) as unknown as MetricRow[]
  const metric = metricRows[0]
  if (!metric) {
    throw new DomainError(409, 'merchant_metrics_unavailable', '门店经营指标尚未完成初始化')
  }
  const orderRows = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, order_no, order_type, channel,
            status, customer_name, customer_phone_masked, item_summary, party_size,
            service_at, gross_amount_fen, discount_fen, paid_amount_fen,
            refund_amount_fen,
            (SELECT status FROM consumer_deal_payment_intents
             WHERE consumer_deal_payment_intents.order_id = merchant_orders.id)
              AS consumer_deal_payment_status,
            verification_code_hash, verification_code_masked,
            exception_code, version, placed_at, updated_at
     FROM merchant_orders WHERE store_id = ? ORDER BY updated_at DESC, order_no DESC LIMIT 100`,
  ).all(store.id) as unknown as OrderRow[]
  const orders = orderRows.map((row) => orderSummary(database, row))
  const focusOrder = focusOrderId ? orders.find((order) => order.id === focusOrderId) ?? null : null
  if (focusOrderId && !focusOrder) {
    throw new DomainError(404, 'merchant_order_not_found', '订单不存在或不在当前门店数据范围')
  }
  const recommendationRows = database.prepare(
    `SELECT id, priority, title, rationale, expected_impact, evidence_json,
            action_label, action_target, risk_level, model_version
     FROM merchant_ai_recommendations
     WHERE store_id = ? AND business_date = ? AND status = 'OPEN'
     ORDER BY priority LIMIT 3`,
  ).all(store.id, metric.business_date) as unknown as RecommendationRow[]
  const activeRecommendationRows = recommendationRows.filter((row) => {
    if (row.priority === 1) {
      return orders.some((order) => order.merchantConfirmationAllowed)
    }
    if (row.priority === 2) {
      return orders.some((order) => order.status === 'REFUND_REQUESTED')
    }
    return true
  })
  const allTodos = orders
    .map(todoFromOrder)
    .filter((item): item is MerchantTodoSummary => item !== null)
    .sort((left, right) => {
      const priority: Record<MerchantTodoSummary['action'], number> = {
        CONFIRM: 0,
        APPROVE_REFUND: 1,
        VERIFY: 2,
        VIEW: 3,
      }
      return priority[left.action] - priority[right.action]
    })
  const todos = allTodos.slice(0, 3)
  const exceptions = allTodos.filter(
    (item) => item.kind === 'ORDER_EXCEPTION' || item.kind === 'REFUND_APPROVAL',
  )
  const verificationRate = metric.issued_verification_count
    ? Math.round(metric.verified_count / metric.issued_verification_count * 1000) / 10
    : 100
  const conversionRate = metric.visitor_count
    ? Math.round(metric.order_count / metric.visitor_count * 1000) / 10
    : 0
  const revenueDeltaBps = metric.previous_revenue_fen
    ? Math.round((metric.revenue_fen - metric.previous_revenue_fen) / metric.previous_revenue_fen * 10000)
    : 0
  const status = exceptions.length > 1 ? 'ATTENTION' : metric.ai_health_score >= 85 ? 'GOOD' : 'ATTENTION'
  return {
    businessDate: metric.business_date,
    store: storeSummary(store),
    headline: {
      status,
      title: status === 'GOOD' ? '今天经营状态整体良好' : '经营平稳，但有事项需马上处理',
      narrative: exceptions.length
        ? `AI 发现 ${allTodos.length} 项待办，其中 ${exceptions.length} 项异常需要优先处理。`
        : `收入较昨日增长 ${(revenueDeltaBps / 100).toFixed(1)}%，高峰履约保持稳定。`,
    },
    metrics: {
      revenueFen: metric.revenue_fen,
      revenueDeltaBps,
      orderCount: metric.order_count,
      newMemberCount: metric.new_member_count,
      verificationRate,
      aiHealthScore: metric.ai_health_score,
    },
    recommendations: activeRecommendationRows.map((row) => ({
      id: row.id,
      priority: row.priority,
      title: row.title,
      rationale: row.rationale,
      expectedImpact: row.expected_impact,
      evidence: JSON.parse(row.evidence_json) as string[],
      actionLabel: row.action_label,
      actionTarget: row.action_target,
      riskLevel: row.risk_level,
      modelVersion: row.model_version,
    })),
    todos,
    exceptions,
    orders,
    focusOrder,
    analytics: {
      revenueTrend: metricRows.slice().reverse().map((row) => ({
        date: row.business_date,
        revenueFen: row.revenue_fen,
        orderCount: row.order_count,
      })),
      channelMix: channelMix(orders),
      hourlyRevenue: [
        { hour: '11:00', revenueFen: 108000 },
        { hour: '12:00', revenueFen: 286000 },
        { hour: '13:00', revenueFen: 174000 },
        { hour: '17:00', revenueFen: 128000 },
        { hour: '18:00', revenueFen: 246000 },
        { hour: '19:00', revenueFen: 326000 },
      ],
      funnel: {
        visitors: metric.visitor_count,
        orderCount: metric.order_count,
        verifiedCount: Math.round(metric.order_count * verificationRate / 100),
        conversionRate,
        verificationRate,
      },
    },
    updatedAt: [metric.updated_at, store.updated_at, ...orderRows.map((row) => row.updated_at)].sort().at(-1) ?? metric.updated_at,
  }
}

function recordOrderEvent(
  database: DatabaseSync,
  principal: Principal,
  row: OrderRow,
  type: string,
  summary: string,
  fromStatus: MerchantOrderStatus,
  toStatus: MerchantOrderStatus,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  const riskLevel = typeof payload.riskLevel === 'string' ? payload.riskLevel : 'L1'
  database.prepare(
    `INSERT INTO merchant_order_events
     (id, tenant_id, merchant_id, store_id, order_id, actor_id, type, summary,
      from_status, to_status, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, row.merchant_id, row.store_id, row.id,
    principal.subject, type, summary, fromStatus, toStatus, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'merchant_order', ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, row.id, riskLevel, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, type, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `merchant.order.${type.toLowerCase()}.v1`, row.id, payloadJson, timestamp,
  )
}

function idempotentOrderMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): MerchantOperationsOverview {
  const requestHash = hash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== requestHash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1 WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as MerchantOperationsOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const focusOrderId = operation()
    const overview = getMerchantOperationsOverview(database, principal, focusOrderId)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, requestHash, JSON.stringify(overview), now())
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function confirmMerchantOrder(
  database: DatabaseSync,
  principal: Principal,
  input: { orderId: string; expectedVersion: number },
  idempotencyKey: string,
): MerchantOperationsOverview {
  const route = `/api/v1/merchant/orders/${input.orderId}/confirm`
  return idempotentOrderMutation(database, principal, idempotencyKey, route, input, () => {
    const row = getOrder(database, principal, input.orderId)
    assertVersion(row, input.expectedVersion)
    const deal = getConsumerDealMerchantEligibility(database, row.id)
    if (deal.isDeal && row.status === 'CONFIRMED') {
      if (!deal.fundsEligible || deal.holdStatus !== 'CONSUMED' || deal.refundBlocked) {
        throw new DomainError(
          409,
          deal.paymentStatus === 'PENDING_PROVIDER'
            ? 'consumer_deal_payment_pending'
            : 'consumer_deal_fulfillment_not_ready',
          '套餐资金、占用或退款状态尚不允许补签核销凭证',
        )
      }
      const timestamp = now()
      const supplemented = ensureConsumerDealRedemptionCredentialForConfirmedOrder(
        database,
        { orderId: row.id, actorId: principal.subject, timestamp },
      )
      if (!supplemented?.issued) {
        throw new DomainError(409, 'order_status_invalid', '该订单已经完成商家确认')
      }
      recordOrderEvent(
        database, principal, row, 'DEAL_CREDENTIAL_BACKFILLED',
        '为升级前已确认且已支付的套餐订单补签核销凭证',
        row.status, row.status,
        {
          orderNo: row.order_no,
          credentialId: supplemented.credentialId,
          credentialCodeMasked: supplemented.codeMasked,
          riskLevel: 'L2',
        },
        timestamp,
      )
      return row.id
    }
    if (deal.isDeal && !deal.merchantConfirmationAllowed) {
      throw new DomainError(
        409,
        deal.paymentStatus === 'PENDING_PROVIDER'
          ? 'consumer_deal_payment_pending'
          : 'consumer_deal_fulfillment_not_ready',
        deal.paymentStatus === 'PENDING_PROVIDER'
          ? '消费者套餐订单仍在等待支付连接器结果，商家暂不可接单'
          : '套餐资金、占用或退款状态不允许商家接单',
      )
    }
    if (row.status !== 'PENDING_CONFIRMATION') {
      throw new DomainError(409, 'order_status_invalid', '只有待确认预约可以接单')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE merchant_orders SET status = 'CONFIRMED', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(timestamp, row.id)
    const dealCredential = deal.isDeal
      ? issueConsumerDealRedemptionCredential(
          database,
          { orderId: row.id, actorId: principal.subject, timestamp },
        )
      : null
    database.prepare(
      `UPDATE merchant_ai_recommendations SET status = 'COMPLETED', updated_at = ?
       WHERE store_id = ? AND priority = 1 AND status = 'OPEN'`,
    ).run(timestamp, row.store_id)
    recordOrderEvent(
      database, principal, row, 'ORDER_CONFIRMED', '商家已确认预约并锁定履约时段',
      row.status, 'CONFIRMED',
      {
        orderNo: row.order_no,
        serviceAt: row.service_at,
        credentialId: dealCredential?.credentialId ?? null,
        credentialCodeMasked: dealCredential?.codeMasked ?? null,
        riskLevel: dealCredential ? 'L2' : 'L1',
      },
      timestamp,
    )
    const consumerDraft = database.prepare(
      `SELECT id, user_id, session_id, household_member_id, item_summary
       FROM consumer_reservation_drafts
       WHERE tenant_id = ? AND order_id = ?`,
    ).get(principal.tenantId, row.id) as {
      id: string
      user_id: string
      session_id: string
      household_member_id: string
      item_summary: string
    } | undefined
    if (consumerDraft) {
      const payload = {
        draftId: consumerDraft.id,
        orderId: row.id,
        orderNo: row.order_no,
        serviceAt: row.service_at,
        fromStatus: row.status,
        toStatus: 'CONFIRMED',
      }
      database.prepare(
        `UPDATE consumer_reservation_drafts
         SET version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(timestamp, consumerDraft.id)
      database.prepare(
        `UPDATE consumer_assistant_sessions
         SET version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(timestamp, consumerDraft.session_id)
      database.prepare(
        `INSERT INTO consumer_assistant_events
         (id, tenant_id, user_id, session_id, draft_id, type, risk_level,
          actor_id, summary, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'MERCHANT_RESERVATION_CONFIRMED', 'L1',
                 ?, ?, ?, ?)`,
      ).run(
        randomUUID(), principal.tenantId, consumerDraft.user_id,
        consumerDraft.session_id, consumerDraft.id, principal.subject,
        '商家已确认消费者订座并锁定履约时段',
        JSON.stringify(payload), timestamp,
      )
      database.prepare(
        `INSERT INTO consumer_messages
         (id, tenant_id, user_id, household_member_id, category, title, body,
          action_label, action_target, read_at, version, created_at)
         VALUES (?, ?, ?, ?, 'TRANSACTION', '商家已确认订座',
                 ?, '查看订座', ?, NULL, 1, ?)`,
      ).run(
        randomUUID(), principal.tenantId, consumerDraft.user_id,
        consumerDraft.household_member_id,
        `${consumerDraft.item_summary}已由商家确认，请按约定时间到店。`,
        `/pages/assistant/index`,
        timestamp,
      )
    }
    return row.id
  })
}

export function verifyMerchantOrder(
  database: DatabaseSync,
  principal: Principal,
  input: {
    orderId: string
    expectedVersion: number
    verificationCode: string
    confirmed: boolean
  },
  idempotencyKey: string,
): MerchantOperationsOverview {
  const route = `/api/v1/merchant/orders/${input.orderId}/verify`
  return idempotentOrderMutation(database, principal, idempotencyKey, route, input, () => {
    const row = getOrder(database, principal, input.orderId)
    assertVersion(row, input.expectedVersion)
    const deal = getConsumerDealMerchantEligibility(database, row.id)
    if (deal.isDeal && deal.paymentStatus === 'PENDING_PROVIDER') {
      throw new DomainError(
        409,
        'consumer_deal_payment_pending',
        '消费者套餐订单仍在等待支付连接器结果，商家暂不可核销',
      )
    }
    if (!['CONFIRMED', 'READY_FOR_SERVICE'].includes(row.status)) {
      throw new DomainError(409, 'order_status_invalid', '只有已确认或待服务订单可以核销')
    }
    if (!input.confirmed) {
      throw new DomainError(409, 'merchant_confirmation_required', '核销会完成履约，请先确认订单、金额与顾客信息')
    }
    const timestamp = now()
    const dealRedemption = deal.isDeal
      ? redeemConsumerDealRedemptionCredential(database, {
          orderId: row.id,
          verificationCode: input.verificationCode,
          actorId: principal.subject,
          timestamp,
        })
      : null
    if (
      !deal.isDeal
      && (!row.verification_code_hash
        || hashText(input.verificationCode) !== row.verification_code_hash)
    ) {
      throw new DomainError(409, 'verification_code_invalid', '核销码不正确，请核对顾客出示的完整号码')
    }
    const orderChanged = database.prepare(
      `UPDATE merchant_orders SET status = 'VERIFIED', version = version + 1,
       updated_at = ? WHERE id = ? AND version = ? AND status = ?`,
    ).run(timestamp, row.id, row.version, row.status)
    if (Number(orderChanged.changes) !== 1) {
      throw new DomainError(409, 'merchant_order_state_changed', '订单状态已变化，请刷新后重试')
    }
    database.prepare(
      `UPDATE merchant_daily_metrics SET verified_count = MIN(issued_verification_count, verified_count + 1),
       updated_at = ? WHERE store_id = ? AND business_date = (
         SELECT MAX(business_date) FROM merchant_daily_metrics WHERE store_id = ?
       )`,
    ).run(timestamp, row.store_id, row.store_id)
    recordOrderEvent(
      database, principal, row, 'ORDER_VERIFIED', '门店核对完整核销码并完成履约确认',
      row.status, 'VERIFIED',
      {
        orderNo: row.order_no,
        amountFen: row.paid_amount_fen,
        credentialId: dealRedemption?.credentialId ?? null,
        dealDraftId: dealRedemption?.draftId ?? null,
        slotId: dealRedemption?.slotId ?? null,
        confirmationCaptured: true,
        operatorId: principal.subject,
        riskLevel: 'L2',
      },
      timestamp,
    )
    return row.id
  })
}

function routeConsumerRefundToConnector(
  database: DatabaseSync,
  principal: Principal,
  row: OrderRow,
  input: { refundAmountFen: number; reason: string },
  timestamp: string,
): boolean {
  const refund = database.prepare(
    `SELECT refunds.id, refunds.payment_intent_id, refunds.user_id,
            refunds.draft_id, drafts.session_id, drafts.household_member_id,
            drafts.item_summary
     FROM consumer_refund_requests refunds
     JOIN consumer_reservation_drafts drafts ON drafts.id = refunds.draft_id
     WHERE refunds.order_id = ? AND refunds.status = 'REQUESTED'
     ORDER BY refunds.created_at DESC LIMIT 1`,
  ).get(row.id) as {
    id: string
    payment_intent_id: string
    user_id: string
    draft_id: string
    session_id: string
    household_member_id: string
    item_summary: string
  } | undefined
  if (!refund) return false
  database.prepare(
    `UPDATE consumer_refund_requests
     SET status = 'APPROVED_PENDING_PROVIDER', version = version + 1, updated_at = ?
     WHERE id = ? AND status = 'REQUESTED'`,
  ).run(timestamp, refund.id)
  database.prepare(
    'UPDATE merchant_orders SET version = version + 1, updated_at = ? WHERE id = ?',
  ).run(timestamp, row.id)
  const payload = {
    orderNo: row.order_no,
    refundId: refund.id,
    paymentIntentId: refund.payment_intent_id,
    refundAmountFen: input.refundAmountFen,
    reason: input.reason,
    confirmationCaptured: true,
    connectorResultPending: true,
    riskLevel: 'L2',
  }
  recordOrderEvent(
    database, principal, row, 'REFUND_CONNECTOR_REQUESTED',
    '商家强确认退款，已提交支付连接器处理但尚未宣称退款成功',
    row.status, 'REFUND_REQUESTED', payload, timestamp,
  )
  database.prepare(
    `INSERT INTO consumer_payment_events
     (id, tenant_id, user_id, intent_id, order_id, provider_event_id,
      type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'REFUND_APPROVED_PENDING_PROVIDER', ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, refund.user_id, refund.payment_intent_id,
    row.id, '商家已审核退款，等待支付连接器结果', JSON.stringify(payload), timestamp,
  )
  database.prepare(
    'UPDATE consumer_reservation_drafts SET version = version + 1, updated_at = ? WHERE id = ?',
  ).run(timestamp, refund.draft_id)
  database.prepare(
    'UPDATE consumer_assistant_sessions SET version = version + 1, updated_at = ? WHERE id = ?',
  ).run(timestamp, refund.session_id)
  database.prepare(
    `INSERT INTO consumer_messages
     (id, tenant_id, user_id, household_member_id, category, title, body,
      action_label, action_target, read_at, version, created_at)
     VALUES (?, ?, ?, ?, 'TRANSACTION', '退款已通过商家审核', ?,
             '查看进度', '/pages/assistant/index', NULL, 1, ?)`,
  ).run(
    randomUUID(), principal.tenantId, refund.user_id, refund.household_member_id,
    `${refund.item_summary}退款已提交支付连接器，资金结果以后续回调为准。`, timestamp,
  )
  return true
}

export function approveMerchantRefund(
  database: DatabaseSync,
  principal: Principal,
  input: {
    orderId: string
    expectedVersion: number
    refundAmountFen: number
    reason: string
    confirmed: boolean
  },
  idempotencyKey: string,
): MerchantOperationsOverview {
  const route = `/api/v1/merchant/orders/${input.orderId}/approve-refund`
  return idempotentOrderMutation(database, principal, idempotencyKey, route, input, () => {
    const row = getOrder(database, principal, input.orderId)
    assertVersion(row, input.expectedVersion)
    if (row.status !== 'REFUND_REQUESTED') {
      throw new DomainError(409, 'order_status_invalid', '只有待审核退款单可以执行退款')
    }
    if (!input.confirmed) {
      throw new DomainError(409, 'merchant_confirmation_required', '退款会产生资金变动，请先强确认金额、原因与影响')
    }
    if (input.refundAmountFen > row.paid_amount_fen) {
      throw new DomainError(409, 'refund_amount_invalid', '退款金额不能超过原支付成功金额')
    }
    const timestamp = now()
    const dealRefund = approveConsumerDealRefundForMerchant(database, {
      orderId: row.id,
      refundAmountFen: input.refundAmountFen,
      reason: input.reason,
      actorId: principal.subject,
      timestamp,
    })
    if (dealRefund) {
      recordOrderEvent(
        database, principal, row,
        dealRefund.wasRetry ? 'DEAL_REFUND_CONNECTOR_RETRIED' : 'DEAL_REFUND_CONNECTOR_REQUESTED',
        dealRefund.wasRetry
          ? '商家再次强确认套餐退款，已建立新的支付连接器尝试'
          : '商家强确认套餐退款，已提交支付连接器但尚未宣称退款成功',
        row.status, 'REFUND_REQUESTED',
        {
          orderNo: row.order_no,
          refundId: dealRefund.refundId,
          refundAttemptId: dealRefund.attemptId,
          paymentIntentId: dealRefund.paymentIntentId,
          providerRequestId: dealRefund.providerRequestId,
          refundAmountFen: dealRefund.amountFen,
          reason: input.reason,
          wasRetry: dealRefund.wasRetry,
          confirmationCaptured: true,
          connectorResultPending: true,
          riskLevel: 'L2',
        },
        timestamp,
      )
      return row.id
    }
    if (input.refundAmountFen !== row.refund_amount_fen) {
      throw new DomainError(409, 'refund_amount_invalid', '退款金额必须与顾客申请及原支付金额一致')
    }
    if (routeConsumerRefundToConnector(database, principal, row, input, timestamp)) {
      return row.id
    }
    database.prepare(
      `UPDATE merchant_orders SET status = 'REFUNDED', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(timestamp, row.id)
    database.prepare(
      `UPDATE merchant_ai_recommendations SET status = 'COMPLETED', updated_at = ?
       WHERE store_id = ? AND priority = 2 AND status = 'OPEN'`,
    ).run(timestamp, row.store_id)
    recordOrderEvent(
      database, principal, row, 'REFUND_APPROVED', '主理人强确认退款，资金与售后状态已同步',
      row.status, 'REFUNDED',
      {
        orderNo: row.order_no,
        refundAmountFen: input.refundAmountFen,
        reason: input.reason,
        confirmationCaptured: true,
        approvalRole: principal.roles[0] ?? 'unknown',
        riskLevel: 'L2',
      },
      timestamp,
    )
    return row.id
  })
}
