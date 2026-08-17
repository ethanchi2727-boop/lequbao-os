import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { paymentCallbackSignature, type PaymentConnectorCallbackInput } from './consumer-payment-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`

describe('E8 第五批：支付确认、连接器回调与退款边界', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => { await app.close() })

  async function confirmedReservation() {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/messages',
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:message' },
      payload: {
        prompt: '明晚三个人吃晚餐，想要安静靠窗的位置',
        cityId: 'city-shanghai',
        householdMemberId: 'household-member-chen-self',
      },
    })
    const draft = sent.json().reservationDraft
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${draft.id}/confirm`,
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:submit' },
      payload: { expectedVersion: draft.version, confirmed: true },
    })
    const submittedDraft = submitted.json().reservationDraft
    const merchant = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${submittedDraft.orderId}/confirm`,
      headers: { authorization: merchantAuthorization, 'idempotency-key': 'e8e:merchant-confirm' },
      payload: { expectedVersion: 1 },
    })
    expect(merchant.statusCode, merchant.body).toBe(200)
    const overview = await app.inject({
      method: 'GET', url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    return overview.json().reservationDraft
  }

  async function preparePayment(draft: any, key = 'e8e:prepare') {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${draft.id}/payment/prepare`,
      headers: { authorization: consumerAuthorization, 'idempotency-key': key },
      payload: { expectedVersion: draft.version, confirmed: true },
    })
  }

  async function callback(input: PaymentConnectorCallbackInput, signature = paymentCallbackSignature(input)) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/payment-connectors/wechat/callback',
      headers: { 'x-payment-signature': signature },
      payload: input,
    })
  }

  it('商家确认前禁止支付，且必须明确核对金额', async () => {
    const sent = await app.inject({
      method: 'POST', url: '/api/v1/consumer/assistant/messages',
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:not-ready:message' },
      payload: {
        prompt: '明晚三个人吃晚餐', cityId: 'city-shanghai',
        householdMemberId: 'household-member-chen-self',
      },
    })
    const draft = sent.json().reservationDraft
    expect(draft.payment).toMatchObject({
      status: 'NOT_STARTED', totalAmountFen: 62800, paidAmountFen: 0,
      canPrepare: false, liveConnectorAvailable: false,
    })
    const denied = await app.inject({
      method: 'POST', url: `/api/v1/consumer/reservations/${draft.id}/payment/prepare`,
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:not-confirmed' },
      payload: { expectedVersion: draft.version, confirmed: false },
    })
    expect(denied.statusCode).toBe(409)
    expect(denied.json().title).toBe('explicit_confirmation_required')
  })

  it('只生成待连接器支付意图，幂等重放不会重复创建或伪造扣款', async () => {
    const draft = await confirmedReservation()
    expect(draft.payment).toMatchObject({ status: 'NOT_STARTED', canPrepare: true })
    const prepared = await preparePayment(draft)
    expect(prepared.statusCode, prepared.body).toBe(200)
    expect(prepared.json().reservationDraft).toMatchObject({
      version: draft.version + 1,
      payment: {
        status: 'PENDING_PROVIDER', totalAmountFen: 62800, paidAmountFen: 0,
        canPrepare: false, liveConnectorAvailable: false,
      },
    })
    const intentId = prepared.json().reservationDraft.payment.intentId
    expect(database.prepare(
      'SELECT status, amount_fen FROM consumer_payment_intents WHERE id = ?',
    ).get(intentId)).toEqual({ status: 'PENDING_PROVIDER', amount_fen: 62800 })
    expect(database.prepare(
      'SELECT paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(draft.orderId)).toEqual({ paid_amount_fen: 0 })
    expect(database.prepare(
      `SELECT topic FROM outbox_events WHERE aggregate_id = ?
       AND topic = 'consumer.payment.requested.v1'`,
    ).get(intentId)).toEqual({ topic: 'consumer.payment.requested.v1' })
    const replay = await preparePayment(draft)
    expect(replay.body).toBe(prepared.body)
    expect((database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_payment_intents WHERE draft_id = ?',
    ).get(draft.id) as { count: number }).count).toBe(1)
  })

  it('拒绝缺失签名、错误签名和金额不一致的连接器回调', async () => {
    const draft = await confirmedReservation()
    const prepared = await preparePayment(draft)
    const intentId = prepared.json().reservationDraft.payment.intentId
    const input: PaymentConnectorCallbackInput = {
      providerEventId: 'pay-event-invalid-001', type: 'PAYMENT_SUCCEEDED',
      intentId, amountFen: 62800, currency: 'CNY', providerTransactionId: 'wx-tx-invalid-001',
    }
    const missing = await app.inject({
      method: 'POST', url: '/api/v1/payment-connectors/wechat/callback', payload: input,
    })
    expect(missing.statusCode).toBe(401)
    const badSignature = await callback(input, '00'.repeat(32))
    expect(badSignature.statusCode).toBe(401)
    const mismatch = { ...input, providerEventId: 'pay-event-invalid-002', amountFen: 62799 }
    const badAmount = await callback(mismatch)
    expect(badAmount.statusCode).toBe(409)
    expect(database.prepare(
      'SELECT status FROM consumer_payment_intents WHERE id = ?',
    ).get(intentId)).toEqual({ status: 'PENDING_PROVIDER' })
  })

  it('签名成功回调才写入已支付事实，并支持回调幂等重放', async () => {
    const draft = await confirmedReservation()
    const prepared = await preparePayment(draft)
    const intentId = prepared.json().reservationDraft.payment.intentId
    const input: PaymentConnectorCallbackInput = {
      providerEventId: 'pay-event-success-001', type: 'PAYMENT_SUCCEEDED',
      intentId, amountFen: 62800, currency: 'CNY', providerTransactionId: 'wx-tx-success-001',
    }
    const paid = await callback(input)
    expect(paid.statusCode, paid.body).toBe(200)
    expect(paid.json().reservationDraft).toMatchObject({
      orderStatus: 'CONFIRMED', canCancel: false,
      payment: { status: 'SUCCEEDED', paidAmountFen: 62800, canRequestRefund: true },
    })
    expect(database.prepare(
      'SELECT paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(draft.orderId)).toEqual({ paid_amount_fen: 62800 })
    const replay = await callback(input)
    expect(replay.statusCode).toBe(200)
    expect((database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_payment_events WHERE provider_event_id = ?',
    ).get(input.providerEventId) as { count: number }).count).toBe(1)
  })

  it('零支付取消会原子关闭待连接器意图并拒绝迟到成功回调', async () => {
    const draft = await confirmedReservation()
    const prepared = await preparePayment(draft)
    const preparedDraft = prepared.json().reservationDraft
    const intentId = preparedDraft.payment.intentId
    const cancelled = await app.inject({
      method: 'POST', url: `/api/v1/consumer/reservations/${draft.id}/cancel`,
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:pending-payment-cancel' },
      payload: {
        expectedVersion: preparedDraft.version, confirmed: true,
        reason: '支付前家庭行程发生变化',
      },
    })
    expect(cancelled.statusCode, cancelled.body).toBe(200)
    expect(database.prepare(
      'SELECT status FROM consumer_payment_intents WHERE id = ?',
    ).get(intentId)).toEqual({ status: 'CANCELLED' })
    expect(database.prepare(
      `SELECT topic FROM outbox_events WHERE aggregate_id = ?
       AND topic = 'consumer.payment.cancelled.v1'`,
    ).get(intentId)).toEqual({ topic: 'consumer.payment.cancelled.v1' })
    const lateInput: PaymentConnectorCallbackInput = {
      providerEventId: 'pay-event-late-after-cancel', type: 'PAYMENT_SUCCEEDED',
      intentId, amountFen: 62800, currency: 'CNY', providerTransactionId: 'wx-tx-too-late',
    }
    const late = await callback(lateInput)
    expect(late.statusCode).toBe(409)
    expect(database.prepare(
      'SELECT paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(draft.orderId)).toEqual({ paid_amount_fen: 0 })
  })

  it('已支付订座必须申请退款，商家审批后仍等待连接器回调', async () => {
    const draft = await confirmedReservation()
    const prepared = await preparePayment(draft)
    const intentId = prepared.json().reservationDraft.payment.intentId
    const payInput: PaymentConnectorCallbackInput = {
      providerEventId: 'pay-event-refund-flow', type: 'PAYMENT_SUCCEEDED',
      intentId, amountFen: 62800, currency: 'CNY', providerTransactionId: 'wx-tx-refund-flow',
    }
    const paid = await callback(payInput)
    const paidDraft = paid.json().reservationDraft
    const directCancel = await app.inject({
      method: 'POST', url: `/api/v1/consumer/reservations/${draft.id}/cancel`,
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:paid-cancel' },
      payload: { expectedVersion: paidDraft.version, confirmed: true, reason: '家庭行程发生变化' },
    })
    expect(directCancel.statusCode).toBe(409)
    expect(directCancel.json().title).toBe('consumer_reservation_refund_required')

    const refund = await app.inject({
      method: 'POST', url: `/api/v1/consumer/reservations/${draft.id}/refund`,
      headers: { authorization: consumerAuthorization, 'idempotency-key': 'e8e:refund-request' },
      payload: { expectedVersion: paidDraft.version, confirmed: true, reason: '家庭行程变化申请退款' },
    })
    expect(refund.statusCode, refund.body).toBe(200)
    expect(refund.json().reservationDraft).toMatchObject({
      orderStatus: 'REFUND_REQUESTED',
      payment: { status: 'REFUND_REQUESTED', refundAmountFen: 62800 },
    })
    const order = database.prepare(
      'SELECT version FROM merchant_orders WHERE id = ?',
    ).get(draft.orderId) as { version: number }
    const approved = await app.inject({
      method: 'POST', url: `/api/v1/merchant/orders/${draft.orderId}/approve-refund`,
      headers: { authorization: merchantAuthorization, 'idempotency-key': 'e8e:refund-approve' },
      payload: {
        expectedVersion: order.version, refundAmountFen: 62800,
        reason: '核对消费者申请并同意退款', confirmed: true,
      },
    })
    expect(approved.statusCode, approved.body).toBe(200)
    expect(database.prepare(
      'SELECT status FROM merchant_orders WHERE id = ?',
    ).get(draft.orderId)).toEqual({ status: 'REFUND_REQUESTED' })
    expect(database.prepare(
      'SELECT status FROM consumer_refund_requests WHERE order_id = ?',
    ).get(draft.orderId)).toEqual({ status: 'APPROVED_PENDING_PROVIDER' })

    const refundInput: PaymentConnectorCallbackInput = {
      providerEventId: 'refund-event-success-001', type: 'REFUND_SUCCEEDED',
      intentId, amountFen: 62800, currency: 'CNY', providerRefundId: 'wx-rf-success-001',
    }
    const refunded = await callback(refundInput)
    expect(refunded.statusCode, refunded.body).toBe(200)
    expect(refunded.json().reservationDraft).toMatchObject({
      orderStatus: 'REFUNDED', payment: { status: 'REFUNDED', refundAmountFen: 62800 },
    })
  })

  it('支付能力仅允许 SELF 消费者使用', async () => {
    const draft = await confirmedReservation()
    const denied = await app.inject({
      method: 'POST', url: `/api/v1/consumer/reservations/${draft.id}/payment/prepare`,
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e8e:hq-denied' },
      payload: { expectedVersion: draft.version, confirmed: true },
    })
    expect(denied.statusCode).toBe(403)
  })
})
