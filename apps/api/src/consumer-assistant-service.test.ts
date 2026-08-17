import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`

describe('E8 第二批：消费者 AI 文本对话与订座确认', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    await app.close()
  })

  function sendMessage(
    key = 'e9:assistant:message:dinner',
    payload: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/messages',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': key,
      },
      payload: {
        prompt: '明晚三个人吃晚餐，想要安静靠窗的位置',
        cityId: 'city-shanghai',
        householdMemberId: 'household-member-chen-self',
        ...payload,
      },
    })
  }

  it('初始会话为空且明确声明文本与支付边界', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json()).toMatchObject({
      session: null,
      messages: [],
      recommendations: [],
      reservationDraft: null,
      policy: {
        version: 'consumer-assistant-policy-v1',
        modelVersion: 'consumer-intent-local-v1',
        textOnly: false,
        voiceInputEnabled: true,
        liveTranscriptionConnectorAvailable: false,
        explicitTranscriptConfirmationRequired: true,
        maximumRecommendations: 3,
        explicitConfirmationRequiredForReservation: true,
        paymentConnectorBoundary: true,
        livePaymentConnectorAvailable: false,
        providerCallbackSignatureRequired: true,
        refundRequiresMerchantApproval: true,
      },
    })
  })

  it('文本请求只推荐获授权商家并生成草稿，不会提前创建订单', async () => {
    const before = database.prepare(
      'SELECT COUNT(*) AS count FROM merchant_orders',
    ).get() as { count: number }
    const response = await sendMessage()
    expect(response.statusCode, response.body).toBe(200)
    const body = response.json()
    expect(body.messages).toHaveLength(2)
    expect(body.messages.map((message: any) => message.role)).toEqual(['USER', 'ASSISTANT'])
    expect(body.recommendations).toHaveLength(1)
    expect(body.recommendations[0]).toMatchObject({
      merchantName: '云和里·静安店',
      reservationSupported: true,
    })
    expect(body.reservationDraft).toMatchObject({
      status: 'WAITING_CONFIRMATION',
      partySize: 3,
      customerPhoneMasked: '138****2068',
      amountFen: 62800,
      orderId: null,
      orderStatus: null,
      canEdit: true,
      canCancel: false,
      version: 1,
    })
    const after = database.prepare(
      'SELECT COUNT(*) AS count FROM merchant_orders',
    ).get() as { count: number }
    expect(after.count).toBe(before.count)

    const audit = database.prepare(
      `SELECT payload_json FROM audit_events
       WHERE run_id = 'consumer-assistant-e8b'
         AND action = 'CONSUMER_ASSISTANT_MESSAGE_SENT'`,
    ).get() as { payload_json: string }
    expect(audit.payload_json).not.toContain('明晚')
    expect(audit.payload_json).toContain('promptHash')
  })

  it('确认前可幂等修改未来时间与人数，提交后禁止继续编辑', async () => {
    const sent = await sendMessage()
    const draft = sent.json().reservationDraft
    const reservationAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const updateRequest = {
      method: 'POST' as const,
      url: `/api/v1/consumer/reservations/${draft.id}/update`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e8c:reservation:${draft.id}:update:v1`,
      },
      payload: {
        expectedVersion: 1,
        partySize: 4,
        reservationAt,
      },
    }
    const updated = await app.inject(updateRequest)
    expect(updated.statusCode, updated.body).toBe(200)
    expect(updated.json().reservationDraft).toMatchObject({
      partySize: 4,
      reservationAt,
      version: 2,
      canEdit: true,
    })
    const replay = await app.inject(updateRequest)
    expect(replay.body).toBe(updated.body)

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${draft.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e8c:reservation:${draft.id}:confirm:v2`,
      },
      payload: { expectedVersion: 2, confirmed: true },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(confirmed.json().reservationDraft).toMatchObject({
      partySize: 4,
      reservationAt,
      version: 3,
      canEdit: false,
      orderStatus: 'PENDING_CONFIRMATION',
    })

    const staleEdit = await app.inject({
      ...updateRequest,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e8c:reservation:${draft.id}:update-after-submit`,
      },
      payload: {
        ...updateRequest.payload,
        expectedVersion: 3,
        partySize: 5,
      },
    })
    expect(staleEdit.statusCode).toBe(409)
  })

  it('明确确认后创建零支付待商家确认订单并支持幂等重放', async () => {
    const sent = await sendMessage()
    const draft = sent.json().reservationDraft
    const request = {
      method: 'POST' as const,
      url: `/api/v1/consumer/reservations/${draft.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e9:reservation:${draft.id}:confirm:v1`,
      },
      payload: { expectedVersion: 1, confirmed: true },
    }
    const confirmed = await app.inject(request)
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(confirmed.json().reservationDraft).toMatchObject({
      status: 'CONFIRMED',
      version: 2,
      orderStatus: 'PENDING_CONFIRMATION',
      canEdit: false,
      canCancel: true,
    })
    const orderId = confirmed.json().reservationDraft.orderId
    const order = database.prepare(
      `SELECT status, order_type, channel, paid_amount_fen, party_size
       FROM merchant_orders WHERE id = ?`,
    ).get(orderId)
    expect(order).toEqual({
      status: 'PENDING_CONFIRMATION',
      order_type: 'RESERVATION',
      channel: 'SKILL',
      paid_amount_fen: 0,
      party_size: 3,
    })
    const event = database.prepare(
      `SELECT type, to_status FROM merchant_order_events WHERE order_id = ?`,
    ).get(orderId)
    expect(event).toEqual({
      type: 'CONSUMER_RESERVATION_SUBMITTED',
      to_status: 'PENDING_CONFIRMATION',
    })
    const outbox = database.prepare(
      `SELECT topic FROM outbox_events
       WHERE aggregate_id = ? AND run_id = 'consumer-assistant-e8b'`,
    ).get(orderId)
    expect(outbox).toEqual({ topic: 'consumer.reservation.submitted.v1' })

    const replay = await app.inject(request)
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(confirmed.body)
    const orderCount = database.prepare(
      'SELECT COUNT(*) AS count FROM merchant_orders WHERE id = ?',
    ).get(orderId) as { count: number }
    expect(orderCount.count).toBe(1)
  })

  it('商家确认形成消费者回执，消费者可强确认取消零支付订座', async () => {
    const sent = await sendMessage()
    const draft = sent.json().reservationDraft
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${draft.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e8c:reservation:${draft.id}:submit`,
      },
      payload: { expectedVersion: 1, confirmed: true },
    })
    expect(submitted.statusCode, submitted.body).toBe(200)
    const orderId = submitted.json().reservationDraft.orderId

    const merchantConfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${orderId}/confirm`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': `e8c:merchant:${orderId}:confirm`,
      },
      payload: { expectedVersion: 1 },
    })
    expect(merchantConfirmed.statusCode, merchantConfirmed.body).toBe(200)

    const receipt = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    expect(receipt.statusCode, receipt.body).toBe(200)
    expect(receipt.json().reservationDraft).toMatchObject({
      version: 3,
      orderStatus: 'CONFIRMED',
      canEdit: false,
      canCancel: true,
      merchantReply: '商家已确认订座并锁定履约时段。',
    })
    const receiptMessage = database.prepare(
      `SELECT title FROM consumer_messages
       WHERE user_id = 'user-demo-consumer' AND title = '商家已确认订座'`,
    ).get()
    expect(receiptMessage).toEqual({ title: '商家已确认订座' })

    const cancelRequest = {
      method: 'POST' as const,
      url: `/api/v1/consumer/reservations/${draft.id}/cancel`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e8c:reservation:${draft.id}:cancel:v3`,
      },
      payload: {
        expectedVersion: 3,
        confirmed: true,
        reason: '家庭行程发生变化',
      },
    }
    const cancelled = await app.inject(cancelRequest)
    expect(cancelled.statusCode, cancelled.body).toBe(200)
    expect(cancelled.json().reservationDraft).toMatchObject({
      version: 4,
      orderStatus: 'CANCELLED',
      canCancel: false,
      merchantReply: '订座已取消，当前没有支付或退款事项。',
    })
    expect(database.prepare(
      'SELECT status, paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(orderId)).toEqual({ status: 'CANCELLED', paid_amount_fen: 0 })
    expect(database.prepare(
      `SELECT type, from_status, to_status FROM merchant_order_events
       WHERE order_id = ? AND type = 'CONSUMER_RESERVATION_CANCELLED'`,
    ).get(orderId)).toEqual({
      type: 'CONSUMER_RESERVATION_CANCELLED',
      from_status: 'CONFIRMED',
      to_status: 'CANCELLED',
    })
    expect(database.prepare(
      `SELECT topic FROM outbox_events
       WHERE aggregate_id = ? AND topic = 'consumer.reservation.cancelled.v1'`,
    ).get(orderId)).toEqual({ topic: 'consumer.reservation.cancelled.v1' })

    const replay = await app.inject(cancelRequest)
    expect(replay.body).toBe(cancelled.body)
  })

  it('拒绝未明确确认、过期上下文和越权身份', async () => {
    const sent = await sendMessage()
    const draft = sent.json().reservationDraft
    const notConfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${draft.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': `e9:reservation:${draft.id}:not-confirmed`,
      },
      payload: { expectedVersion: 1, confirmed: false },
    })
    expect(notConfirmed.statusCode).toBe(409)
    expect(notConfirmed.json().title).toBe('explicit_confirmation_required')

    const stale = await sendMessage('e9:assistant:message:stale', {
      cityId: 'city-hangzhou',
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('consumer_assistant_context_stale')

    const hq = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: hqAuthorization },
    })
    expect(hq.statusCode).toBe(403)
  })

  it('会话记录与风险事件保持追加写', async () => {
    const response = await sendMessage()
    expect(response.statusCode).toBe(200)
    expect(() => database.exec(
      "UPDATE consumer_assistant_messages SET content = 'tampered'",
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      "DELETE FROM consumer_assistant_events",
    )).toThrowError(/append-only/)
  })
})
