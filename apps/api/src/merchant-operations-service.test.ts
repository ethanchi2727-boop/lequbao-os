import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { deriveConsumerDealVerificationCode } from './consumer-deal-credential-service.js'
import {
  applyConsumerDealPaymentCallback,
  consumerDealPaymentCallbackSignature,
  type ConsumerDealPaymentCallbackInput,
} from './consumer-deal-payment-service.js'
import { createDatabase } from './database.js'

const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`
const clerkAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.clerk}`
const providerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`
const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`

describe('E5 经营宝今日页与订单履约', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    if (app) await app.close()
  })

  async function overview(orderId?: string) {
    const query = orderId ? `?focusOrderId=${encodeURIComponent(orderId)}` : ''
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/overview${query}`,
      headers: { authorization: merchantAuthorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  async function createDealCheckout(input: {
    key: string
    offerId?: string
    serviceAt?: string
  }) {
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE user_id = 'user-demo-consumer'`,
    ).get() as { preferred_city_id: string; active_household_member_id: string }
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/stores/store-demo-jingan/offers/${input.offerId ?? 'consumer-deal-yunheli-dinner'}/drafts`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': `${input.key}:draft`,
      },
      payload: {
        cityId: profile.preferred_city_id,
        householdMemberId: profile.active_household_member_id,
        quantity: 1,
        acknowledgedTerms: true,
        ...(input.serviceAt ? { serviceAt: input.serviceAt } : {}),
      },
    })
    expect(created.statusCode, created.body).toBe(200)
    const draftId = created.json().latestDraft?.id as string | undefined
    if (!draftId) throw new Error('expected consumer deal draft id')
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draftId}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': `${input.key}:strong-confirm`,
      },
      payload: { expectedVersion: 1, confirmed: true },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const latestDraft = confirmed.json().latestDraft as Record<string, any>
    const orderId = latestDraft?.orderId as string | undefined
    if (!orderId) throw new Error('expected consumer deal order id')
    return {
      draftId,
      orderId,
      totalAmountFen: latestDraft.totalAmountFen as number,
      checkoutVersion: latestDraft.version as number,
    }
  }

  function succeedDealPayment(
    checkout: { draftId: string; orderId: string },
    key: string,
  ): void {
    const intent = database.prepare(
      `SELECT id, provider_request_id, amount_fen
       FROM consumer_deal_payment_intents WHERE draft_id = ?`,
    ).get(checkout.draftId) as {
      id: string
      provider_request_id: string
      amount_fen: number
    }
    const input: ConsumerDealPaymentCallbackInput = {
      providerEventId: `${key}:payment-succeeded`,
      type: 'PAYMENT_SUCCEEDED',
      intentId: intent.id,
      providerRequestId: intent.provider_request_id,
      amountFen: intent.amount_fen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      providerTransactionId: `${key}:wx-transaction`,
    }
    const result = applyConsumerDealPaymentCallback(
      database,
      input,
      consumerDealPaymentCallbackSignature(input),
    )
    expect(result).toMatchObject({ accepted: true, applied: true, outcome: 'PAYMENT_SUCCEEDED' })
  }

  async function merchantConfirmDeal(orderId: string, key: string) {
    const order = database.prepare(
      'SELECT version FROM merchant_orders WHERE id = ?',
    ).get(orderId) as { version: number }
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${orderId}/confirm`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': `${key}:merchant-confirm`,
      },
      payload: { expectedVersion: order.version },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  it('返回可钻取的今日指标、AI 建议、待办、异常与七日经营分析', async () => {
    const result = await overview()
    expect(result.store).toMatchObject({
      id: 'store-demo-jingan',
      merchantId: 'merchant-demo',
      name: '云和里·静安店',
      operatingStatus: 'OPEN',
    })
    expect(result.metrics).toMatchObject({
      revenueFen: 1268000,
      revenueDeltaBps: 1260,
      orderCount: 156,
      newMemberCount: 18,
      verificationRate: 96.4,
      aiHealthScore: 88,
    })
    expect(result.recommendations).toHaveLength(3)
    expect(result.todos).toHaveLength(3)
    expect(result.exceptions).toHaveLength(2)
    expect(result.analytics.revenueTrend).toHaveLength(7)
    expect(result.analytics.funnel).toMatchObject({ visitors: 2418, orderCount: 156 })
  })

  it('以幂等、乐观锁和审计证据完成预约确认与强确认核销', async () => {
    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-pending/confirm',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:order:pending:confirm',
      },
      payload: { expectedVersion: 1 },
    })
    expect(response.statusCode, response.body).toBe(200)
    let result = response.json() as Record<string, any>
    expect(result.focusOrder).toMatchObject({ status: 'CONFIRMED', version: 2 })

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-pending/confirm',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:order:pending:confirm',
      },
      payload: { expectedVersion: 1 },
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(response.body)

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-pending/verify',
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:order:pending:verify',
      },
      payload: { expectedVersion: 2, verificationCode: '682941', confirmed: true },
    })
    expect(response.statusCode, response.body).toBe(200)
    result = response.json() as Record<string, any>
    expect(result.focusOrder).toMatchObject({ status: 'VERIFIED', version: 3 })
    expect(result.metrics.verificationRate).toBe(97)

    const events = database.prepare(
      'SELECT type, from_status, to_status FROM merchant_order_events WHERE order_id = ? ORDER BY sequence',
    ).all('order-e5-pending') as Array<Record<string, unknown>>
    expect(events).toEqual([
      { type: 'ORDER_CONFIRMED', from_status: 'PENDING_CONFIRMATION', to_status: 'CONFIRMED' },
      { type: 'ORDER_VERIFIED', from_status: 'CONFIRMED', to_status: 'VERIFIED' },
    ])
    const audit = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'merchant-operations-e5'`,
    ).get() as { count: number }
    expect(audit.count).toBe(2)
    expect(() => database.exec("UPDATE merchant_order_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
  })

  it('退款必须由有权限角色强确认金额与原因，门店员工不可越权', async () => {
    const noConfirmation = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-refund/approve-refund',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:refund:no-confirmation',
      },
      payload: {
        expectedVersion: 1,
        refundAmountFen: 32800,
        reason: '顾客行程变更',
        confirmed: false,
      },
    })
    expect(noConfirmation.statusCode).toBe(409)
    expect(noConfirmation.json().title).toBe('merchant_confirmation_required')

    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-refund/approve-refund',
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:refund:clerk-denied',
      },
      payload: {
        expectedVersion: 1,
        refundAmountFen: 32800,
        reason: '顾客行程变更',
        confirmed: true,
      },
    })
    expect(denied.statusCode).toBe(403)

    const approved = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-refund/approve-refund',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:refund:owner-approved',
      },
      payload: {
        expectedVersion: 1,
        refundAmountFen: 32800,
        reason: '顾客行程变更',
        confirmed: true,
      },
    })
    expect(approved.statusCode, approved.body).toBe(200)
    expect(approved.json().focusOrder).toMatchObject({ status: 'REFUNDED', version: 2 })
  })

  it('拒绝错误核销码、缺失强确认和过期订单版本', async () => {
    const wrongCode = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-confirmed/verify',
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:verify:wrong-code',
      },
      payload: { expectedVersion: 1, verificationCode: '111111', confirmed: true },
    })
    expect(wrongCode.statusCode).toBe(409)
    expect(wrongCode.json().title).toBe('verification_code_invalid')

    const noConfirmation = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-confirmed/verify',
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:verify:no-confirmation',
      },
      payload: { expectedVersion: 1, verificationCode: '682941', confirmed: false },
    })
    expect(noConfirmation.statusCode).toBe(409)
    expect(noConfirmation.json().title).toBe('merchant_confirmation_required')

    database.prepare(
      `UPDATE merchant_orders SET version = 2 WHERE id = 'order-e5-confirmed'`,
    ).run()
    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-confirmed/verify',
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:verify:stale',
      },
      payload: { expectedVersion: 1, verificationCode: '682941', confirmed: true },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
  })

  it('城市交付仅可只读门店经营数据，不能代商家履约，未知订单不会泄露', async () => {
    const readable = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/overview',
      headers: { authorization: providerAuthorization },
    })
    expect(readable.statusCode).toBe(200)
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/orders/order-e5-pending/confirm',
      headers: {
        authorization: providerAuthorization,
        'idempotency-key': 'e5:provider:confirm-denied',
      },
      payload: { expectedVersion: 1 },
    })
    expect(denied.statusCode).toBe(403)

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/overview?focusOrderId=order-not-found',
      headers: { authorization: merchantAuthorization },
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().title).toBe('merchant_order_not_found')
  })

  it('等待支付连接器结果的消费者团购订单不进入商家待办且不可确认', async () => {
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE user_id = 'user-demo-consumer'`,
    ).get() as { preferred_city_id: string; active_household_member_id: string }
    const draftResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/stores/store-demo-jingan/offers/consumer-deal-yunheli-dinner/drafts',
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': 'merchant-guard:consumer-deal:draft',
      },
      payload: {
        cityId: profile.preferred_city_id,
        householdMemberId: profile.active_household_member_id,
        quantity: 1,
        acknowledgedTerms: true,
      },
    })
    expect(draftResponse.statusCode, draftResponse.body).toBe(200)
    const draftId = draftResponse.json().latestDraft?.id as string | undefined
    expect(draftId).toBeTruthy()
    if (!draftId) throw new Error('expected consumer deal draft id')

    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draftId}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': 'merchant-guard:consumer-deal:confirm',
      },
      payload: { expectedVersion: 1, confirmed: true },
    })
    expect(confirmResponse.statusCode, confirmResponse.body).toBe(200)
    const orderId = confirmResponse.json().latestDraft?.orderId as string | undefined
    expect(orderId).toBeTruthy()
    if (!orderId) throw new Error('expected pending-payment merchant order id')

    const result = await overview(orderId)
    expect(result.focusOrder).toMatchObject({
      id: orderId,
      status: 'PENDING_CONFIRMATION',
      paidAmountFen: 0,
      consumerDealPaymentStatus: 'PENDING_PROVIDER',
      merchantConfirmationAllowed: false,
    })
    expect(result.todos).not.toContainEqual(expect.objectContaining({ orderId }))

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${orderId}/confirm`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'merchant-guard:pending-payment:confirm',
      },
      payload: { expectedVersion: 1 },
    })
    expect(blocked.statusCode, blocked.body).toBe(409)
    expect(blocked.json().title).toBe('consumer_deal_payment_pending')
    expect(database.prepare(
      'SELECT status, version FROM merchant_orders WHERE id = ?',
    ).get(orderId)).toEqual({ status: 'PENDING_CONFIRMATION', version: 1 })

    database.prepare(
      "UPDATE merchant_orders SET status = 'CONFIRMED', version = 2 WHERE id = ?",
    ).run(orderId)
    const legacyVerifyBlocked = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${orderId}/verify`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'merchant-guard:pending-payment:legacy-verify',
      },
      payload: { expectedVersion: 2, verificationCode: '682941', confirmed: true },
    })
    expect(legacyVerifyBlocked.statusCode, legacyVerifyBlocked.body).toBe(409)
    expect(legacyVerifyBlocked.json().title).toBe('consumer_deal_payment_pending')
    expect(database.prepare(
      'SELECT status, version FROM merchant_orders WHERE id = ?',
    ).get(orderId)).toEqual({ status: 'CONFIRMED', version: 2 })
  })

  it('支付成功后才解锁接单，商家确认只签发一次凭证且核销只消费一次', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const checkout = await createDealCheckout({ key: 'e8j:paid-group' })
    expect((await overview(checkout.orderId)).focusOrder).toMatchObject({
      consumerDealPaymentStatus: 'PENDING_PROVIDER',
      merchantConfirmationAllowed: false,
      verificationStatus: 'NOT_ISSUED',
    })

    succeedDealPayment(checkout, 'e8j-paid-group')
    expect((await overview(checkout.orderId)).focusOrder).toMatchObject({
      status: 'PENDING_CONFIRMATION',
      paidAmountFen: 62800,
      consumerDealPaymentStatus: 'SUCCEEDED',
      merchantConfirmationAllowed: true,
      verificationStatus: 'NOT_ISSUED',
    })

    const accepted = await merchantConfirmDeal(checkout.orderId, 'e8j:paid-group')
    expect(accepted.focusOrder).toMatchObject({
      status: 'CONFIRMED',
      paidAmountFen: 62800,
      merchantConfirmationAllowed: false,
      verificationStatus: 'ISSUED',
    })
    const credential = database.prepare(
      `SELECT id, status, derivation_nonce, code_hash, code_masked, expires_at
       FROM consumer_deal_redemption_credentials WHERE order_id = ?`,
    ).get(checkout.orderId) as {
      id: string
      status: string
      derivation_nonce: string
      code_hash: string
      code_masked: string
      expires_at: string
    }
    const code = deriveConsumerDealVerificationCode(credential.derivation_nonce)
    expect(code).toMatch(/^\d{6}$/)
    expect(accepted.focusOrder.verificationCodeMasked).toBe(credential.code_masked)
    expect(JSON.stringify(accepted.focusOrder)).not.toContain(code)

    database.prepare(
      "UPDATE consumer_deal_redemption_credentials SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
    ).run(credential.id)
    const expiredOverview = await overview(checkout.orderId)
    expect(expiredOverview.focusOrder).toMatchObject({
      verificationStatus: 'EXPIRED',
    })
    expect(expiredOverview.todos).not.toContainEqual(expect.objectContaining({
      orderId: checkout.orderId,
      action: 'VERIFY',
    }))
    const expiredVerify = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/verify`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:paid-group:expired-code',
      },
      payload: {
        expectedVersion: accepted.focusOrder.version,
        verificationCode: code,
        confirmed: true,
      },
    })
    expect(expiredVerify.statusCode).toBe(409)
    expect(expiredVerify.json().title).toBe('consumer_deal_credential_expired')
    database.prepare(
      'UPDATE consumer_deal_redemption_credentials SET expires_at = ? WHERE id = ?',
    ).run(credential.expires_at, credential.id)

    const duplicateConfirm = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/confirm`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:paid-group:ordinary-duplicate-confirm',
      },
      payload: { expectedVersion: accepted.focusOrder.version },
    })
    expect(duplicateConfirm.statusCode).toBe(409)
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_redemption_credentials WHERE order_id = ?',
    ).get(checkout.orderId)).toEqual({ count: 1 })

    const wrongCode = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/verify`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:paid-group:wrong-code',
      },
      payload: {
        expectedVersion: accepted.focusOrder.version,
        verificationCode: code === '000000' ? '000001' : '000000',
        confirmed: true,
      },
    })
    expect(wrongCode.statusCode).toBe(409)
    expect(wrongCode.json().title).toBe('verification_code_invalid')

    const verified = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/verify`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:paid-group:verify',
      },
      payload: {
        expectedVersion: accepted.focusOrder.version,
        verificationCode: code,
        confirmed: true,
      },
    })
    expect(verified.statusCode, verified.body).toBe(200)
    expect(verified.json().focusOrder).toMatchObject({
      status: 'VERIFIED',
      verificationStatus: 'REDEEMED',
    })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE order_id = ?',
    ).get(checkout.orderId)).toEqual({ status: 'FULFILLED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: stockBefore.stock_quantity - 1 })

    const secondVerify = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/verify`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:paid-group:verify-again',
      },
      payload: {
        expectedVersion: verified.json().focusOrder.version,
        verificationCode: code,
        confirmed: true,
      },
    })
    expect(secondVerify.statusCode).toBe(409)
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM consumer_deal_redemption_events
       WHERE order_id = ? AND type = 'CREDENTIAL_REDEEMED'`,
    ).get(checkout.orderId)).toEqual({ count: 1 })
  })

  it('零支付套餐可直接接单，而失败、取消和迟到成功支付永不解锁', async () => {
    database.prepare(
      `UPDATE merchant_skus SET price_fen = 0, compare_at_fen = 0
       WHERE id = 'sku-e5-dinner-2'`,
    ).run()
    const zero = await createDealCheckout({ key: 'e8j:zero-group' })
    expect(zero.totalAmountFen).toBe(0)
    expect((await overview(zero.orderId)).focusOrder).toMatchObject({
      consumerDealPaymentStatus: 'NOT_REQUIRED',
      merchantConfirmationAllowed: true,
    })
    const zeroAccepted = await merchantConfirmDeal(zero.orderId, 'e8j:zero-group')
    expect(zeroAccepted.focusOrder).toMatchObject({
      status: 'CONFIRMED',
      verificationStatus: 'ISSUED',
    })

    database.prepare(
      `UPDATE merchant_skus SET price_fen = 62800, compare_at_fen = 68800
       WHERE id = 'sku-e5-dinner-2'`,
    ).run()
    for (const status of ['FAILED', 'CANCELLED', 'LATE_SUCCEEDED'] as const) {
      const checkout = await createDealCheckout({ key: `e8j:blocked:${status}` })
      database.prepare(
        `UPDATE consumer_deal_payment_intents SET status = ?, updated_at = ?
         WHERE draft_id = ?`,
      ).run(status, new Date().toISOString(), checkout.draftId)
      database.prepare(
        `UPDATE consumer_deal_fulfillment_holds
         SET status = 'CONSUMED', consumed_at = ?, updated_at = ? WHERE draft_id = ?`,
      ).run(new Date().toISOString(), new Date().toISOString(), checkout.draftId)
      database.prepare(
        'UPDATE merchant_orders SET paid_amount_fen = ? WHERE id = ?',
      ).run(status === 'LATE_SUCCEEDED' ? checkout.totalAmountFen : 0, checkout.orderId)
      const focused = (await overview(checkout.orderId)).focusOrder
      expect(focused).toMatchObject({
        consumerDealPaymentStatus: status,
        merchantConfirmationAllowed: false,
      })
      const blocked = await app.inject({
        method: 'POST',
        url: `/api/v1/merchant/orders/${checkout.orderId}/confirm`,
        headers: {
          authorization: merchantAuthorization,
          'idempotency-key': `e8j:blocked:${status}:confirm`,
        },
        payload: { expectedVersion: focused.version },
      })
      expect(blocked.statusCode).toBe(409)
      expect(blocked.json().title).toBe('consumer_deal_fulfillment_not_ready')
    }
  })

  it('预约套餐核销后释放时段占用并把 hold 收敛为 FULFILLED', async () => {
    const nextThursday = new Date()
    nextThursday.setUTCDate(nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7))
    nextThursday.setUTCHours(18, 0, 0, 0)
    const serviceAt = nextThursday.toISOString()
    const slotBefore = database.prepare(
      "SELECT reserved FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get() as { reserved: number }
    const checkout = await createDealCheckout({
      key: 'e8j:reservation',
      offerId: 'consumer-deal-yunheli-tasting',
      serviceAt,
    })
    expect(database.prepare(
      "SELECT reserved FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual({ reserved: slotBefore.reserved + 1 })
    succeedDealPayment(checkout, 'e8j-reservation')
    const accepted = await merchantConfirmDeal(checkout.orderId, 'e8j:reservation')
    const credential = database.prepare(
      `SELECT derivation_nonce FROM consumer_deal_redemption_credentials
       WHERE order_id = ?`,
    ).get(checkout.orderId) as { derivation_nonce: string }
    const verified = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/verify`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:reservation:verify',
      },
      payload: {
        expectedVersion: accepted.focusOrder.version,
        verificationCode: deriveConsumerDealVerificationCode(credential.derivation_nonce),
        confirmed: true,
      },
    })
    expect(verified.statusCode, verified.body).toBe(200)
    expect(database.prepare(
      "SELECT reserved FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual({ reserved: slotBefore.reserved })
    expect(database.prepare(
      'SELECT status, fulfilled_at FROM consumer_deal_fulfillment_holds WHERE order_id = ?',
    ).get(checkout.orderId)).toMatchObject({ status: 'FULFILLED' })
  })

  it('套餐退款批准只创建待连接器尝试，失败后同一强确认动作可安全重试', async () => {
    const checkout = await createDealCheckout({ key: 'e8j:deal-refund' })
    succeedDealPayment(checkout, 'e8j-deal-refund')
    await merchantConfirmDeal(checkout.orderId, 'e8j:deal-refund')
    const checkoutState = database.prepare(
      'SELECT version FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(checkout.draftId) as { version: number }
    const requested = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${checkout.draftId}/refunds`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': 'e8j:deal-refund:request',
      },
      payload: {
        expectedVersion: checkoutState.version,
        confirmed: true,
        reason: '家庭行程变化，申请套餐全额退款',
      },
    })
    expect(requested.statusCode, requested.body).toBe(200)
    expect(database.prepare(
      'SELECT status FROM consumer_deal_redemption_credentials WHERE order_id = ?',
    ).get(checkout.orderId)).toEqual({ status: 'REVOKED' })

    let order = database.prepare(
      'SELECT status, version, paid_amount_fen, refund_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(checkout.orderId) as {
      status: string
      version: number
      paid_amount_fen: number
      refund_amount_fen: number
    }
    expect(order).toMatchObject({
      status: 'REFUND_REQUESTED',
      paid_amount_fen: 62800,
      refund_amount_fen: 0,
    })
    expect((await overview(checkout.orderId)).focusOrder).toMatchObject({
      status: 'REFUND_REQUESTED',
      refundAmountFen: 62800,
      consumerDealRefundStatus: 'REQUESTED',
    })
    const firstApproval = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/approve-refund`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:deal-refund:approve-1',
      },
      payload: {
        expectedVersion: order.version,
        refundAmountFen: 62800,
        reason: '核对消费者申请并同意全额退款',
        confirmed: true,
      },
    })
    expect(firstApproval.statusCode, firstApproval.body).toBe(200)
    expect(firstApproval.json().focusOrder).toMatchObject({
      status: 'REFUND_REQUESTED',
      refundAmountFen: 62800,
      consumerDealRefundStatus: 'APPROVED_PENDING_PROVIDER',
    })
    expect(firstApproval.json().todos).not.toContainEqual(expect.objectContaining({
      orderId: checkout.orderId,
      action: 'APPROVE_REFUND',
    }))
    expect(database.prepare(
      'SELECT status FROM consumer_deal_refund_requests WHERE order_id = ?',
    ).get(checkout.orderId)).toEqual({ status: 'APPROVED_PENDING_PROVIDER' })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_refund_attempts',
    ).get()).toEqual({ count: 1 })
    expect(database.prepare(
      'SELECT status, refund_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(checkout.orderId)).toEqual({ status: 'REFUND_REQUESTED', refund_amount_fen: 0 })

    const refund = database.prepare(
      `SELECT id, payment_intent_id
       FROM consumer_deal_refund_requests WHERE order_id = ?`,
    ).get(checkout.orderId) as { id: string; payment_intent_id: string }
    const firstAttempt = database.prepare(
      `SELECT id, provider_request_id
       FROM consumer_deal_refund_attempts WHERE refund_id = ?`,
    ).get(refund.id) as { id: string; provider_request_id: string }
    const failedInput: ConsumerDealPaymentCallbackInput = {
      providerEventId: 'e8j:deal-refund:failed-callback',
      type: 'REFUND_FAILED',
      intentId: refund.payment_intent_id,
      providerRequestId: firstAttempt.provider_request_id,
      refundId: refund.id,
      refundAttemptId: firstAttempt.id,
      amountFen: 62800,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      failureCode: 'PROVIDER_TEMPORARY',
    }
    expect(applyConsumerDealPaymentCallback(
      database,
      failedInput,
      consumerDealPaymentCallbackSignature(failedInput),
    )).toMatchObject({ applied: true, outcome: 'REFUND_FAILED' })
    const failedOverview = await overview(checkout.orderId)
    expect(failedOverview.focusOrder).toMatchObject({
      status: 'REFUND_REQUESTED',
      refundAmountFen: 62800,
      consumerDealRefundStatus: 'FAILED',
    })
    expect(failedOverview.todos).toContainEqual(expect.objectContaining({
      orderId: checkout.orderId,
      action: 'APPROVE_REFUND',
      title: '重试 ¥628 退款',
    }))

    order = database.prepare(
      'SELECT status, version, paid_amount_fen, refund_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(checkout.orderId) as typeof order
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${checkout.orderId}/approve-refund`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e8j:deal-refund:approve-retry',
      },
      payload: {
        expectedVersion: order.version,
        refundAmountFen: 62800,
        reason: '连接器临时失败，重新确认提交全额退款',
        confirmed: true,
      },
    })
    expect(retry.statusCode, retry.body).toBe(200)
    expect(retry.json().focusOrder).toMatchObject({
      status: 'REFUND_REQUESTED',
      refundAmountFen: 62800,
      consumerDealRefundStatus: 'APPROVED_PENDING_PROVIDER',
    })
    expect(retry.json().todos).not.toContainEqual(expect.objectContaining({
      orderId: checkout.orderId,
      action: 'APPROVE_REFUND',
    }))
    expect(database.prepare(
      'SELECT status, failure_code FROM consumer_deal_refund_requests WHERE id = ?',
    ).get(refund.id)).toEqual({ status: 'APPROVED_PENDING_PROVIDER', failure_code: null })
    expect(database.prepare(
      `SELECT status, COUNT(*) AS count FROM consumer_deal_refund_attempts
       WHERE refund_id = ? GROUP BY status ORDER BY status`,
    ).all(refund.id)).toEqual([
      { status: 'FAILED', count: 1 },
      { status: 'PENDING_PROVIDER', count: 1 },
    ])
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE topic = 'consumer.deal.refund.requested.v1'`,
    ).get()).toEqual({ count: 3 })
  })
})
