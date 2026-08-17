import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ConsumerDealActionReceipt,
  ConsumerStoreDetailOverview,
} from '@lequ/contracts'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`

describe('E8J 消费者套餐取消与全额退款', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let context: { cityId: string; householdMemberId: string }
  let sequence: number

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE user_id = 'user-demo-consumer'`,
    ).get() as { preferred_city_id: string; active_household_member_id: string }
    context = {
      cityId: profile.preferred_city_id,
      householdMemberId: profile.active_household_member_id,
    }
    sequence = 0
  })

  afterEach(async () => {
    await app.close()
  })

  function nextKey(label: string): string {
    sequence += 1
    return `aftercare:${label}:${sequence}`
  }

  function createDraft(
    offerId = 'consumer-deal-yunheli-dinner',
    body: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/stores/store-demo-jingan/offers/${offerId}/drafts`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': nextKey('draft'),
      },
      payload: {
        ...context,
        quantity: 1,
        acknowledgedTerms: true,
        ...body,
      },
    })
  }

  function confirmDraft(draftId: string, expectedVersion = 1) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draftId}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': nextKey('confirm'),
      },
      payload: { expectedVersion, confirmed: true },
    })
  }

  function cancelDraft(
    draftId: string,
    expectedVersion: number,
    key = nextKey('cancel'),
    authorization = consumerAuthorization,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draftId}/cancel`,
      headers: {
        authorization,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: {
        expectedVersion,
        confirmed: true,
        reason: '消费者行程发生变化',
      },
    })
  }

  function requestRefund(
    draftId: string,
    expectedVersion: number,
    key = nextKey('refund'),
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draftId}/refunds`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: {
        expectedVersion,
        confirmed: true,
        reason: '服务开始前申请全额退款',
      },
    })
  }

  async function confirmedDeal(
    offerId = 'consumer-deal-yunheli-dinner',
    body: Record<string, unknown> = {},
  ): Promise<{ draftId: string; orderId: string; version: number }> {
    const created = await createDraft(offerId, body)
    expect(created.statusCode, created.body).toBe(200)
    const draft = created.json<ConsumerStoreDetailOverview>().latestDraft
    if (!draft) throw new Error('expected consumer deal draft')
    const confirmed = await confirmDraft(draft.id, draft.version)
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const latest = confirmed.json<ConsumerStoreDetailOverview>().latestDraft
    if (!latest?.orderId) throw new Error('expected confirmed consumer deal order')
    return { draftId: latest.id, orderId: latest.orderId, version: latest.version }
  }

  function markDealPaid(draftId: string): { orderId: string; amountFen: number; version: number } {
    const row = database.prepare(
      `SELECT states.order_id, states.payment_intent_id, states.version,
              payments.amount_fen
       FROM consumer_deal_checkout_states states
       JOIN consumer_deal_payment_intents payments
         ON payments.id = states.payment_intent_id
       WHERE states.draft_id = ?`,
    ).get(draftId) as {
      order_id: string
      payment_intent_id: string
      version: number
      amount_fen: number
    }
    const timestamp = new Date().toISOString()
    database.prepare(
      `UPDATE consumer_deal_payment_intents
       SET status = 'SUCCEEDED', provider_transaction_id = ?, succeeded_at = ?,
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(`wx-paid-${randomUUID()}`, timestamp, timestamp, row.payment_intent_id)
    database.prepare(
      `UPDATE merchant_orders
       SET paid_amount_fen = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(row.amount_fen, timestamp, row.order_id)
    database.prepare(
      `UPDATE consumer_deal_fulfillment_holds
       SET status = 'CONSUMED', consumed_at = ?, updated_at = ?
       WHERE draft_id = ?`,
    ).run(timestamp, timestamp, draftId)
    database.prepare(
      `UPDATE consumer_deal_checkout_states
       SET version = version + 1, updated_at = ? WHERE draft_id = ?`,
    ).run(timestamp, draftId)
    return {
      orderId: row.order_id,
      amountFen: row.amount_fen,
      version: row.version + 1,
    }
  }

  function issueCredential(
    draftId: string,
    orderId: string,
    status: 'ISSUED' | 'REDEEMED' = 'ISSUED',
  ): string {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    database.prepare(
      `INSERT INTO consumer_deal_redemption_credentials
       (id, tenant_id, user_id, draft_id, order_id, status, code_hash,
        code_masked, derivation_nonce, key_version, expires_at, issued_at,
        redeemed_at, revoked_at, version, updated_at)
       VALUES (?, 'tenant-lequ', 'user-demo-consumer', ?, ?, ?, ?, '***321', ?,
               'deal-credential-v1', ?, ?, ?, NULL, 1, ?)`,
    ).run(
      id, draftId, orderId, status, `hash-${id}`, `nonce-${id}`,
      new Date(Date.now() + 86_400_000).toISOString(), timestamp,
      status === 'REDEEMED' ? timestamp : null, timestamp,
    )
    return id
  }

  it('取消待确认草稿只推进结算版本，不创建订单或释放不存在的资源', async () => {
    const created = await createDraft()
    const draft = created.json<ConsumerStoreDetailOverview>().latestDraft
    if (!draft) throw new Error('expected draft')
    database.prepare(
      `UPDATE consumer_store_publications SET visibility_status = 'PAUSED'
       WHERE store_id = 'store-demo-jingan'`,
    ).run()

    const response = await cancelDraft(draft.id, draft.version)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealActionReceipt>()).toEqual({
      accepted: true,
      draftId: draft.id,
      orderId: null,
      status: 'EXPIRED',
      paymentStatus: 'NOT_REQUIRED',
      refundStatus: 'NONE',
      holdStatus: 'NONE',
      version: draft.version + 1,
    })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM merchant_orders WHERE id IN (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)',
    ).get(draft.id)).toEqual({ count: 0 })
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM consumer_deal_events WHERE draft_id = ? AND type = 'DRAFT_CANCELLED'",
    ).get(draft.id)).toEqual({ count: 1 })
  })

  it('有限库存取消原子恢复一次，门店下架不阻断动作且同键重放不重复释放', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: stockBefore.stock_quantity - 1 })
    database.prepare(
      `UPDATE consumer_store_publications SET visibility_status = 'PAUSED'
       WHERE store_id = 'store-demo-jingan'`,
    ).run()
    const key = nextKey('finite-replay')

    const first = await cancelDraft(deal.draftId, deal.version, key)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json<ConsumerDealActionReceipt>()).toMatchObject({
      accepted: true,
      draftId: deal.draftId,
      orderId: deal.orderId,
      status: 'EXPIRED',
      paymentStatus: 'CANCELLED',
      holdStatus: 'RELEASED',
      version: deal.version + 1,
    })
    const replay = await cancelDraft(deal.draftId, deal.version, key)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.json()).toEqual(first.json())
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
    expect(database.prepare(
      'SELECT status FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({ status: 'CANCELLED' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'RELEASED' })
    expect(database.prepare(
      'SELECT route, replay_count FROM idempotency_records WHERE key = ?',
    ).get(key)).toEqual({
      route: `/api/v1/consumer/deal-drafts/${deal.draftId}/cancel#tenant=tenant-lequ&user=user-demo-consumer`,
      replay_count: 1,
    })
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'consumer-deal-aftercare-e8j' AND aggregate_id = ?",
    ).get(deal.orderId)).toEqual({ count: 1 })
  })

  it('预约套餐取消只回退 reserved，不修改时段配置版本', async () => {
    const nextThursday = new Date()
    nextThursday.setUTCDate(
      nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7),
    )
    nextThursday.setUTCHours(18, 0, 0, 0)
    const slotBefore = database.prepare(
      "SELECT reserved, version FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get() as { reserved: number; version: number }
    const deal = await confirmedDeal(
      'consumer-deal-yunheli-tasting',
      { serviceAt: nextThursday.toISOString() },
    )
    expect(database.prepare(
      "SELECT reserved, version FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual({ reserved: slotBefore.reserved + 1, version: slotBefore.version })

    const response = await cancelDraft(deal.draftId, deal.version)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealActionReceipt>()).toMatchObject({
      paymentStatus: 'CANCELLED',
      holdStatus: 'RELEASED',
    })
    expect(database.prepare(
      "SELECT reserved, version FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual(slotBefore)
  })

  it('零元未接单取消释放 CONSUMED 有限库存且不伪造支付记录', async () => {
    database.prepare(
      `UPDATE merchant_skus SET price_fen = 0
       WHERE id = 'sku-e5-dinner-2'`,
    ).run()
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    expect(database.prepare(
      'SELECT payment_intent_id FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ payment_intent_id: null })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'CONSUMED' })

    const response = await cancelDraft(deal.draftId, deal.version)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealActionReceipt>()).toMatchObject({
      paymentStatus: 'NOT_REQUIRED',
      holdStatus: 'RELEASED',
    })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_payment_intents WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ count: 0 })
  })

  it('零元已接单套餐在服务开始前仍可取消并撤销核销凭证', async () => {
    database.prepare(
      `UPDATE merchant_skus SET price_fen = 0, compare_at_fen = 0
       WHERE id = 'sku-e5-dinner-2'`,
    ).run()
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    const order = database.prepare(
      'SELECT version FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId) as { version: number }
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${deal.orderId}/confirm`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': nextKey('merchant-confirm'),
      },
      payload: { expectedVersion: order.version },
    })
    expect(accepted.statusCode, accepted.body).toBe(200)
    expect(database.prepare(
      'SELECT status FROM consumer_deal_redemption_credentials WHERE order_id = ?',
    ).get(deal.orderId)).toEqual({ status: 'ISSUED' })

    const checkout = database.prepare(
      'SELECT version FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(deal.draftId) as { version: number }
    const response = await cancelDraft(deal.draftId, checkout.version)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealActionReceipt>()).toMatchObject({
      paymentStatus: 'NOT_REQUIRED',
      holdStatus: 'RELEASED',
    })
    expect(database.prepare(
      'SELECT status FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({ status: 'CANCELLED' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_redemption_credentials WHERE order_id = ?',
    ).get(deal.orderId)).toEqual({ status: 'REVOKED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
  })

  it('已支付套餐不能直接取消，状态与资源保持不变', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    const paid = markDealPaid(deal.draftId)

    const response = await cancelDraft(deal.draftId, paid.version)
    expect(response.statusCode, response.body).toBe(409)
    expect(response.json()).toMatchObject({ title: 'consumer_deal_refund_required' })
    expect(database.prepare(
      'SELECT status, paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({ status: 'PENDING_CONFIRMATION', paid_amount_fen: paid.amountFen })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'CONSUMED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: stockBefore.stock_quantity - 1 })
  })

  it('全额退款申请只建立 REQUESTED、撤销凭证，不提前退款或释放资源', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    const paid = markDealPaid(deal.draftId)
    const credentialId = issueCredential(deal.draftId, deal.orderId)
    database.prepare(
      `UPDATE consumer_store_publications SET visibility_status = 'PAUSED'
       WHERE store_id = 'store-demo-jingan'`,
    ).run()
    const key = nextKey('refund-replay')

    const first = await requestRefund(deal.draftId, paid.version, key)
    expect(first.statusCode, first.body).toBe(200)
    const receipt = first.json<ConsumerDealActionReceipt>()
    expect(receipt).toMatchObject({
      accepted: true,
      draftId: deal.draftId,
      orderId: deal.orderId,
      status: 'CONFIRMED',
      paymentStatus: 'SUCCEEDED',
      refundStatus: 'REQUESTED',
      holdStatus: 'CONSUMED',
      version: paid.version + 1,
    })
    const replay = await requestRefund(deal.draftId, paid.version, key)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.json()).toEqual(receipt)
    expect(database.prepare(
      `SELECT status, paid_amount_fen, refund_amount_fen
       FROM merchant_orders WHERE id = ?`,
    ).get(deal.orderId)).toEqual({
      status: 'REFUND_REQUESTED',
      paid_amount_fen: paid.amountFen,
      refund_amount_fen: 0,
    })
    expect(database.prepare(
      `SELECT kind, amount_fen, status FROM consumer_deal_refund_requests
       WHERE draft_id = ?`,
    ).get(deal.draftId)).toEqual({
      kind: 'CONSUMER_REQUESTED',
      amount_fen: paid.amountFen,
      status: 'REQUESTED',
    })
    expect(database.prepare(
      'SELECT status, released_at FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'CONSUMED', released_at: null })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_redemption_credentials WHERE id = ?',
    ).get(credentialId)).toEqual({ status: 'REVOKED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: stockBefore.stock_quantity - 1 })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_refund_requests WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ count: 1 })

    const duplicate = await requestRefund(deal.draftId, receipt.version)
    expect(duplicate.statusCode, duplicate.body).toBe(409)
    expect(duplicate.json()).toMatchObject({ title: 'consumer_deal_refund_in_progress' })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_refund_requests WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ count: 1 })
  })

  it('非 SELF 消费者身份、服务已开始和已核销状态均被拒绝且不写售后状态', async () => {
    const unauthorizedDeal = await confirmedDeal()
    const unauthorized = await cancelDraft(
      unauthorizedDeal.draftId,
      unauthorizedDeal.version,
      nextKey('unauthorized'),
      hqAuthorization,
    )
    expect(unauthorized.statusCode, unauthorized.body).toBe(403)
    expect(database.prepare(
      'SELECT status FROM merchant_orders WHERE id = ?',
    ).get(unauthorizedDeal.orderId)).toEqual({ status: 'PENDING_CONFIRMATION' })

    const expiredDeal = await confirmedDeal()
    database.prepare(
      `UPDATE consumer_deal_drafts SET service_at = ? WHERE id = ?`,
    ).run(new Date(Date.now() - 60_000).toISOString(), expiredDeal.draftId)
    const expired = await cancelDraft(expiredDeal.draftId, expiredDeal.version)
    expect(expired.statusCode, expired.body).toBe(409)
    expect(expired.json()).toMatchObject({ title: 'consumer_deal_service_started' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(expiredDeal.draftId)).toEqual({ status: 'HELD' })

    const verifiedDeal = await confirmedDeal()
    const paid = markDealPaid(verifiedDeal.draftId)
    issueCredential(verifiedDeal.draftId, verifiedDeal.orderId, 'REDEEMED')
    database.prepare(
      "UPDATE merchant_orders SET status = 'VERIFIED', version = version + 1 WHERE id = ?",
    ).run(verifiedDeal.orderId)
    const verified = await requestRefund(verifiedDeal.draftId, paid.version)
    expect(verified.statusCode, verified.body).toBe(409)
    expect(verified.json()).toMatchObject({ title: 'consumer_deal_already_verified' })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_refund_requests WHERE draft_id = ?',
    ).get(verifiedDeal.draftId)).toEqual({ count: 0 })
  })
})
