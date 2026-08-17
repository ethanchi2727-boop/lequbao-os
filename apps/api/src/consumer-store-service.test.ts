import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConsumerStoreDetailOverview } from '@lequ/contracts'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { releaseExpiredConsumerDealCheckouts } from './consumer-store-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`

describe('E8 第八批：门店详情、团购规则与受控草稿', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let context: { cityId: string; householdMemberId: string }

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
  })

  afterEach(async () => {
    await app.close()
  })

  function detail(storeId = 'store-demo-jingan', authorization = consumerAuthorization) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/consumer/stores/${storeId}`,
      headers: { authorization },
    })
  }

  function draft(
    offerId = 'consumer-deal-yunheli-dinner',
    body: Record<string, unknown> = {},
    key = 'consumer:deal:draft:001',
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/stores/store-demo-jingan/offers/${offerId}/drafts`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: {
        ...context,
        quantity: 1,
        acknowledgedTerms: true,
        ...body,
      },
    })
  }

  function confirm(
    draftId: string,
    body: Record<string, unknown> = {},
    key = 'consumer:deal:confirm:001',
    authorization = consumerAuthorization,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draftId}/confirm`,
      headers: {
        authorization,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: {
        expectedVersion: 1,
        confirmed: true,
        ...body,
      },
    })
  }

  it('只展示已发布授权门店、有效套餐、实时价格库存和完整规则', async () => {
    database.prepare(
      `UPDATE merchant_service_slots
       SET weekday = 1, start_time = '12:00', end_time = '13:30'
       WHERE id = 'slot-e5-fri-1800'`,
    ).run()
    const response = await detail()
    expect(response.statusCode, response.body).toBe(200)
    const overview = response.json<ConsumerStoreDetailOverview>()
    expect(overview.store).toMatchObject({
      id: 'store-demo-jingan',
      name: '云和里·静安店',
      category: '江浙融合菜',
      rating: 4.8,
    })
    expect(overview.offers).toHaveLength(2)
    expect(overview.offers[0]).toMatchObject({
      id: 'consumer-deal-yunheli-dinner',
      spuId: 'spu-e5-dinner',
      kind: 'GROUP_BUY',
      title: '春江时令双人晚餐',
      skuName: '双人标准版',
      priceFen: 62800,
      compareAtFen: 68800,
      stockStatus: 'AVAILABLE',
      stockRemaining: 18,
      canCreateDraft: true,
    })
    expect(overview.offers[0]?.validUntil).toBeTruthy()
    expect(overview.offers[0]?.refundRule).toContain('未使用')
    const reservationOffer = overview.offers.find(
      (offer) => offer.id === 'consumer-deal-yunheli-tasting',
    )
    expect(reservationOffer?.reservationSlots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'slot-e5-thu-2000',
        weekday: 4,
        startTime: '20:00',
        endTime: '21:30',
        remainingCapacity: 5,
        priceFen: 108800,
        priceOverrideFen: 108800,
        version: 1,
      }),
    ]))
    expect(reservationOffer?.reservationSlots.some(
      (slot) => slot.id === 'slot-e5-fri-1800',
    )).toBe(false)
    expect(overview.policy).toMatchObject({
      publishedStoreRequired: true,
      platformDisplayAuthorizationRequired: true,
      livePriceAndStockRequired: true,
      explicitConfirmationRequired: true,
      draftDoesNotCreateOrder: true,
      draftDoesNotCharge: true,
    })
  })

  it('暂停发布、跨城市和非消费者身份都不能探测门店详情', async () => {
    database.prepare(
      "UPDATE consumer_store_publications SET visibility_status = 'PAUSED' WHERE store_id = 'store-demo-jingan'",
    ).run()
    expect((await detail()).statusCode).toBe(404)
    database.prepare(
      "UPDATE consumer_store_publications SET visibility_status = 'PUBLISHED' WHERE store_id = 'store-demo-jingan'",
    ).run()
    database.prepare(
      "UPDATE consumer_profiles SET preferred_city_id = 'city-hangzhou' WHERE user_id = 'user-demo-consumer'",
    ).run()
    expect((await detail()).statusCode).toBe(404)
    expect((await detail('store-demo-jingan', hqAuthorization)).statusCode).toBe(403)
  })

  it('核对规则后只建立价格快照草稿，幂等重放不创建订单或扣款', async () => {
    const ordersBefore = database.prepare('SELECT COUNT(*) AS count FROM merchant_orders').get()
    const first = await draft()
    expect(first.statusCode, first.body).toBe(200)
    const overview = first.json<ConsumerStoreDetailOverview>()
    expect(overview.latestDraft).toMatchObject({
      status: 'WAITING_CONFIRMATION',
      kind: 'GROUP_BUY',
      quantity: 1,
      unitPriceFen: 62800,
      totalAmountFen: 62800,
      pricingRuleVersion: 'price-rule-v1',
      offerVersion: 1,
    })
    expect(overview.latestDraft?.confirmationNotice).toContain('尚未创建订单')
    const replay = await draft()
    expect(replay.statusCode).toBe(200)
    expect(replay.json<ConsumerStoreDetailOverview>().latestDraft?.id).toBe(overview.latestDraft?.id)
    expect(database.prepare('SELECT COUNT(*) AS count FROM consumer_deal_drafts').get()).toEqual({ count: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM merchant_orders').get()).toEqual(ordersBefore)
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'consumer-store-e8h'",
    ).get()).toEqual({ count: 0 })
    expect(database.prepare(
      'SELECT route FROM idempotency_records WHERE key = ?',
    ).get('consumer:deal:draft:001')).toEqual({
      route: '/api/v1/consumer/stores/:storeId/offers/:offerId/drafts#tenant=tenant-lequ&user=user-demo-consumer',
    })
  })

  it('拒绝未核对规则、过期上下文、超量库存和售罄套餐', async () => {
    expect((await draft(undefined, { acknowledgedTerms: false }, 'deal:no-ack')).statusCode).toBe(422)
    expect((await draft(undefined, { cityId: 'city-hangzhou' }, 'deal:stale')).statusCode).toBe(409)
    database.prepare(
      "UPDATE merchant_skus SET stock_quantity = 2 WHERE id = 'sku-e5-dinner-2'",
    ).run()
    expect((await draft(undefined, { quantity: 3 }, 'deal:stock')).statusCode).toBe(409)
    database.prepare(
      "UPDATE merchant_skus SET stock_quantity = 0, status = 'OUT_OF_STOCK' WHERE id = 'sku-e5-dinner-2'",
    ).run()
    const soldOut = await detail()
    expect(soldOut.json<ConsumerStoreDetailOverview>().offers[0]).toMatchObject({
      stockStatus: 'SOLD_OUT',
      canCreateDraft: false,
    })
    expect((await draft(undefined, {}, 'deal:sold-out')).statusCode).toBe(409)
  })

  it('预约套餐必须选择真实可用时段，草稿仍不占用时段容量', async () => {
    const nextThursday = new Date()
    nextThursday.setUTCDate(nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7))
    nextThursday.setUTCHours(18, 0, 0, 0)
    const serviceAt = nextThursday.toISOString()
    expect((await draft('consumer-deal-yunheli-tasting', {}, 'deal:no-time')).statusCode).toBe(422)
    const before = database.prepare(
      "SELECT reserved FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()
    const response = await draft(
      'consumer-deal-yunheli-tasting',
      { serviceAt },
      'deal:reservation',
    )
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerStoreDetailOverview>().latestDraft).toMatchObject({
      kind: 'RESERVATION',
      serviceAt,
      unitPriceFen: 98800,
    })
    expect(database.prepare(
      "SELECT reserved FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual(before)
  })

  it('套餐草稿事件保持只追加且审计不保存支付成功假象', async () => {
    const response = await draft()
    const draftId = response.json<ConsumerStoreDetailOverview>().latestDraft?.id
    expect(draftId).toBeTruthy()
    if (!draftId) throw new Error('expected deal draft id')
    expect(() => database.prepare(
      "UPDATE consumer_deal_events SET summary = '篡改' WHERE draft_id = ?",
    ).run(draftId)).toThrow(/append-only/)
    expect(() => database.prepare(
      'DELETE FROM consumer_deal_events WHERE draft_id = ?',
    ).run(draftId)).toThrow(/append-only/)
    const audit = database.prepare(
      `SELECT result, summary FROM audit_events
       WHERE entity_type = 'consumer_deal_draft' AND entity_id = ?`,
    ).get(draftId) as { result: string; summary: string }
    expect(audit.result).toBe('SUCCESS')
    expect(audit.summary).toContain('未创建订单或扣款')
  })

  it('强确认原子扣减有限库存、固化规则快照并只进入待支付连接器状态', async () => {
    const created = await draft()
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected deal draft id')
    const ordersBefore = database.prepare('SELECT COUNT(*) AS count FROM merchant_orders').get() as {
      count: number
    }
    const confirmed = await confirm(draftId)
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(confirmed.json<ConsumerStoreDetailOverview>().latestDraft).toMatchObject({
      id: draftId,
      status: 'CONFIRMED',
      version: 2,
      orderStatus: 'PENDING_CONFIRMATION',
      paymentStatus: 'PENDING_PROVIDER',
      holdStatus: 'HELD',
      canConfirm: false,
    })
    expect(confirmed.json<ConsumerStoreDetailOverview>().latestDraft?.confirmationNotice)
      .toContain('不代表已经扣款')
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: 17 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM merchant_orders').get())
      .toEqual({ count: ordersBefore.count + 1 })
    expect(database.prepare(
      'SELECT amount_fen, status FROM consumer_deal_payment_intents WHERE draft_id = ?',
    ).get(draftId)).toEqual({ amount_fen: 62800, status: 'PENDING_PROVIDER' })
    expect(database.prepare(
      'SELECT quantity, status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(draftId)).toEqual({ quantity: 1, status: 'HELD' })
    expect(database.prepare(
      `SELECT unit_price_fen, total_amount_fen, pricing_rule_version, offer_version
       FROM consumer_deal_order_snapshots WHERE draft_id = ?`,
    ).get(draftId)).toEqual({
      unit_price_fen: 62800,
      total_amount_fen: 62800,
      pricing_rule_version: 'price-rule-v1',
      offer_version: 1,
    })
    expect(database.prepare(
      `SELECT gross_amount_fen, discount_fen, paid_amount_fen
       FROM merchant_orders
       WHERE id = (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)`,
    ).get(draftId)).toEqual({
      gross_amount_fen: 68800,
      discount_fen: 6000,
      paid_amount_fen: 0,
    })
    const replay = await confirm(draftId)
    expect(replay.statusCode).toBe(200)
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_payment_intents WHERE draft_id = ?',
    ).get(draftId)).toEqual({ count: 1 })
    expect(() => database.prepare(
      'UPDATE consumer_deal_order_snapshots SET unit_price_fen = 1 WHERE draft_id = ?',
    ).run(draftId)).toThrow(/append-only/)
  })

  it('确认前价格或规则版本漂移会整体回滚，不扣库存也不创建订单', async () => {
    const created = await draft()
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected deal draft id')
    const ordersBefore = database.prepare('SELECT COUNT(*) AS count FROM merchant_orders').get()
    database.prepare(
      `UPDATE merchant_skus
       SET price_fen = price_fen + 100, pricing_rule_version = 'price-rule-v2'
       WHERE id = 'sku-e5-dinner-2'`,
    ).run()
    const response = await confirm(draftId, {}, 'deal:confirm:price-drift')
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ title: 'consumer_deal_price_changed' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: 18 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM merchant_orders').get()).toEqual(ordersBefore)
    expect(database.prepare(
      'SELECT status, version FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(draftId)).toEqual({ status: 'WAITING_CONFIRMATION', version: 1 })
  })

  it('预约套餐确认只原子占用匹配时段容量，仍不伪造支付成功', async () => {
    const nextThursday = new Date()
    nextThursday.setUTCDate(nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7))
    nextThursday.setUTCHours(20, 0, 0, 0)
    const serviceAt = nextThursday.toISOString()
    const created = await draft(
      'consumer-deal-yunheli-tasting',
      { serviceAt },
      'deal:reservation:confirm-draft',
    )
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected reservation draft id')
    const before = database.prepare(
      "SELECT reserved, version FROM merchant_service_slots WHERE id = 'slot-e5-thu-2000'",
    ).get() as { reserved: number; version: number }
    const response = await confirm(draftId, {}, 'deal:reservation:confirm')
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerStoreDetailOverview>().latestDraft).toMatchObject({
      kind: 'RESERVATION',
      unitPriceFen: 108800,
      totalAmountFen: 108800,
      paymentStatus: 'PENDING_PROVIDER',
      holdStatus: 'HELD',
    })
    expect(database.prepare(
      "SELECT reserved, version FROM merchant_service_slots WHERE id = 'slot-e5-thu-2000'",
    ).get()).toEqual({ reserved: before.reserved + 1, version: before.version })
    expect(database.prepare(
      'SELECT slot_id, status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(draftId)).toEqual({ slot_id: 'slot-e5-thu-2000', status: 'HELD' })
    expect(database.prepare(
      `SELECT slot_id, slot_version, price_override_fen, effective_unit_price_fen, service_at
       FROM consumer_deal_draft_slot_snapshots WHERE draft_id = ?`,
    ).get(draftId)).toEqual({
      slot_id: 'slot-e5-thu-2000',
      slot_version: before.version,
      price_override_fen: 108800,
      effective_unit_price_fen: 108800,
      service_at: serviceAt,
    })
    expect(database.prepare(
      'SELECT amount_fen, status FROM consumer_deal_payment_intents WHERE draft_id = ?',
    ).get(draftId)).toEqual({ amount_fen: 108800, status: 'PENDING_PROVIDER' })
    expect(database.prepare(
      `SELECT gross_amount_fen, discount_fen, paid_amount_fen
       FROM merchant_orders
       WHERE id = (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)`,
    ).get(draftId)).toEqual({
      gross_amount_fen: 108800,
      discount_fen: 0,
      paid_amount_fen: 0,
    })
  })

  it('预约时段配置版本漂移会整体回滚，旧版本草稿缺快照时给出专用重建提示', async () => {
    const nextThursday = new Date()
    nextThursday.setUTCDate(nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7))
    nextThursday.setUTCHours(18, 0, 0, 0)
    const serviceAt = nextThursday.toISOString()
    const drifted = await draft(
      'consumer-deal-yunheli-tasting',
      { serviceAt },
      'deal:reservation:slot-drift-draft',
    )
    const driftedId = drifted.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!driftedId) throw new Error('expected drifted reservation draft id')
    database.prepare(
      "UPDATE merchant_service_slots SET version = version + 1 WHERE id = 'slot-e5-thu-1800'",
    ).run()
    const driftResponse = await confirm(
      driftedId,
      {},
      'deal:reservation:slot-drift-confirm',
    )
    expect(driftResponse.statusCode).toBe(409)
    expect(driftResponse.json()).toMatchObject({ title: 'deal_service_slot_changed' })
    expect(database.prepare(
      "SELECT reserved FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual({ reserved: 6 })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM merchant_orders WHERE id = (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)',
    ).get(driftedId)).toEqual({ count: 0 })

    database.prepare(
      "UPDATE merchant_service_slots SET version = 1 WHERE id = 'slot-e5-thu-1800'",
    ).run()
    const legacyDate = new Date(nextThursday)
    legacyDate.setUTCHours(20, 0, 0, 0)
    const legacyServiceAt = legacyDate.toISOString()
    const legacy = await draft(
      'consumer-deal-yunheli-tasting',
      { serviceAt: legacyServiceAt },
      'deal:reservation:legacy-draft',
    )
    const legacyId = legacy.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!legacyId) throw new Error('expected legacy reservation draft id')
    database.exec('DROP TRIGGER consumer_deal_draft_slot_snapshots_no_delete;')
    database.prepare(
      'DELETE FROM consumer_deal_draft_slot_snapshots WHERE draft_id = ?',
    ).run(legacyId)
    const legacyResponse = await confirm(
      legacyId,
      {},
      'deal:reservation:legacy-confirm',
    )
    expect(legacyResponse.statusCode).toBe(409)
    expect(legacyResponse.json()).toMatchObject({ title: 'deal_draft_slot_snapshot_missing' })
  })

  it('零支付套餐确认后直接消费资源占用且不生成支付意图', async () => {
    database.prepare(
      "UPDATE merchant_skus SET price_fen = 0, compare_at_fen = 0 WHERE id = 'sku-e5-dinner-2'",
    ).run()
    const created = await draft(undefined, {}, 'deal:zero:draft')
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected zero-payment draft id')
    const response = await confirm(draftId, {}, 'deal:zero:confirm')
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerStoreDetailOverview>().latestDraft).toMatchObject({
      totalAmountFen: 0,
      status: 'CONFIRMED',
      paymentStatus: 'NOT_REQUIRED',
      holdStatus: 'CONSUMED',
    })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_payment_intents WHERE draft_id = ?',
    ).get(draftId)).toEqual({ count: 0 })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(draftId)).toEqual({ status: 'CONSUMED' })
  })

  it('过期待确认草稿只改变状态，不创建或释放不存在的资源', async () => {
    const created = await draft(undefined, {}, 'deal:expire:waiting')
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected expiring draft id')
    database.prepare(
      "UPDATE consumer_deal_drafts SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
    ).run(draftId)
    expect(releaseExpiredConsumerDealCheckouts(database)).toEqual({
      expiredDrafts: 1,
      releasedHolds: 0,
    })
    expect(database.prepare(
      'SELECT status, version FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(draftId)).toEqual({ status: 'EXPIRED', version: 2 })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM merchant_orders WHERE id = (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)',
    ).get(draftId)).toEqual({ count: 0 })
  })

  it('待支付占用过期会幂等释放库存并取消支付意图和订单', async () => {
    const created = await draft(undefined, {}, 'deal:expire:held-draft')
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected held draft id')
    const confirmed = await confirm(draftId, {}, 'deal:expire:held-confirm')
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: 17 })
    database.prepare(
      `UPDATE merchant_orders SET status = 'CONFIRMED'
       WHERE id = (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)`,
    ).run(draftId)
    database.prepare(
      "UPDATE consumer_deal_fulfillment_holds SET expires_at = '2020-01-01T00:00:00.000Z' WHERE draft_id = ?",
    ).run(draftId)
    expect(releaseExpiredConsumerDealCheckouts(database)).toEqual({
      expiredDrafts: 1,
      releasedHolds: 1,
    })
    expect(releaseExpiredConsumerDealCheckouts(database)).toEqual({
      expiredDrafts: 0,
      releasedHolds: 0,
    })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: 18 })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_payment_intents WHERE draft_id = ?',
    ).get(draftId)).toEqual({ status: 'CANCELLED' })
    expect(database.prepare(
      `SELECT states.status, orders.status AS order_status, holds.status AS hold_status
       FROM consumer_deal_checkout_states states
       JOIN merchant_orders orders ON orders.id = states.order_id
       JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = states.draft_id
       WHERE states.draft_id = ?`,
    ).get(draftId)).toEqual({
      status: 'EXPIRED',
      order_status: 'CANCELLED',
      hold_status: 'RELEASED',
    })
    expect(database.prepare(
      `SELECT from_status, to_status FROM merchant_order_events
       WHERE order_id = (SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?)
         AND type = 'CONSUMER_DEAL_PAYMENT_EXPIRED'`,
    ).get(draftId)).toEqual({ from_status: 'CONFIRMED', to_status: 'CANCELLED' })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM consumer_messages
       WHERE user_id = 'user-demo-consumer' AND title = '套餐订单待支付超时已取消'`,
    ).get()).toEqual({ count: 1 })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE action = 'CONSUMER_DEAL_PAYMENT_EXPIRED' AND entity_id = (
         SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?
       )`,
    ).get(draftId)).toEqual({ count: 1 })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM tracking_events
       WHERE name = 'consumer.deal.payment.expired' AND properties_json LIKE ?`,
    ).get(`%${draftId}%`)).toEqual({ count: 1 })
    expect(database.prepare(
      `SELECT topic FROM outbox_events
       WHERE aggregate_id IN (
         SELECT payment_intent_id FROM consumer_deal_checkout_states WHERE draft_id = ?
         UNION ALL
         SELECT order_id FROM consumer_deal_checkout_states WHERE draft_id = ?
       ) AND topic IN (
         'consumer.deal.payment.cancelled.v1',
         'consumer.deal.order.cancelled.v1'
       ) ORDER BY topic`,
    ).all(draftId, draftId)).toEqual([
      { topic: 'consumer.deal.order.cancelled.v1' },
      { topic: 'consumer.deal.payment.cancelled.v1' },
    ])
  })

  it('同一预约槽位的一笔占用过期后不会污染另一笔草稿的配置版本', async () => {
    const nextThursday = new Date()
    nextThursday.setUTCDate(nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7))
    nextThursday.setUTCHours(18, 0, 0, 0)
    const serviceAt = nextThursday.toISOString()
    const first = await draft(
      'consumer-deal-yunheli-tasting',
      { serviceAt },
      'deal:reservation:expiry-a-draft',
    )
    const firstId = first.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!firstId) throw new Error('expected first reservation draft id')
    expect((await confirm(firstId, {}, 'deal:reservation:expiry-a-confirm')).statusCode).toBe(200)
    const second = await draft(
      'consumer-deal-yunheli-tasting',
      { serviceAt },
      'deal:reservation:expiry-b-draft',
    )
    const secondId = second.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!secondId) throw new Error('expected second reservation draft id')
    const versionBefore = database.prepare(
      "SELECT version FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()
    database.prepare(
      "UPDATE consumer_deal_fulfillment_holds SET expires_at = '2020-01-01T00:00:00.000Z' WHERE draft_id = ?",
    ).run(firstId)
    expect(releaseExpiredConsumerDealCheckouts(database)).toEqual({
      expiredDrafts: 1,
      releasedHolds: 1,
    })
    expect(database.prepare(
      "SELECT version FROM merchant_service_slots WHERE id = 'slot-e5-thu-1800'",
    ).get()).toEqual(versionBefore)
    const secondConfirmation = await confirm(
      secondId,
      {},
      'deal:reservation:expiry-b-confirm',
    )
    expect(secondConfirmation.statusCode, secondConfirmation.body).toBe(200)
  })

  it('强确认要求消费者本人、明确确认和最新版本', async () => {
    const created = await draft(undefined, {}, 'deal:confirm:guards-draft')
    const draftId = created.json<ConsumerStoreDetailOverview>().latestDraft?.id
    if (!draftId) throw new Error('expected guarded draft id')
    expect((await confirm(
      draftId,
      { confirmed: false },
      'deal:confirm:not-explicit',
    )).statusCode).toBe(422)
    expect((await confirm(
      draftId,
      {},
      'deal:confirm:hq',
      hqAuthorization,
    )).statusCode).toBe(403)
    expect((await confirm(
      draftId,
      { expectedVersion: 2 },
      'deal:confirm:stale',
    )).statusCode).toBe(409)
  })
})
