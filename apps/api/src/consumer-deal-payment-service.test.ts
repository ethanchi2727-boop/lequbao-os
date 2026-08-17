import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ConsumerAssistantOverview,
  ConsumerDealConnectorCallbackReceipt,
  ConsumerStoreDetailOverview,
} from '@lequ/contracts'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import {
  consumerDealPaymentCallbackSignature,
  type ConsumerDealPaymentCallbackInput,
} from './consumer-deal-payment-service.js'
import { releaseExpiredConsumerDealCheckouts } from './consumer-store-service.js'
import { createDatabase } from './database.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`

interface DealContext {
  draftId: string
  orderId: string
  intentId: string
  providerRequestId: string
  amountFen: number
  checkoutVersion: number
  orderVersion: number
  orderStatus: string
}

interface RefundContext {
  refundId: string
  attemptId: string
  providerRequestId: string
}

describe('E8J consumer deal payment connector callbacks', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let context: { cityId: string; householdMemberId: string }
  let sequence: number

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.PAYMENT_CONNECTOR_WEBHOOK_SECRET
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
    process.env.NODE_ENV = 'test'
    delete process.env.PAYMENT_CONNECTOR_WEBHOOK_SECRET
    await app.close()
  })

  function nextKey(label: string): string {
    sequence += 1
    return `deal-payment:${label}:${sequence}`
  }

  async function confirmedDeal(): Promise<DealContext> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/stores/store-demo-jingan/offers/consumer-deal-yunheli-dinner/drafts',
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': nextKey('draft'),
      },
      payload: {
        ...context,
        quantity: 1,
        acknowledgedTerms: true,
      },
    })
    expect(created.statusCode, created.body).toBe(200)
    const draft = created.json<ConsumerStoreDetailOverview>().latestDraft
    if (!draft) throw new Error('expected consumer deal draft')
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${draft.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': nextKey('confirm'),
      },
      payload: { expectedVersion: draft.version, confirmed: true },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const row = database.prepare(
      `SELECT states.draft_id, states.order_id, states.version AS checkout_version,
              intents.id AS intent_id, intents.provider_request_id, intents.amount_fen,
              orders.version AS order_version, orders.status AS order_status
       FROM consumer_deal_checkout_states states
       JOIN consumer_deal_payment_intents intents
         ON intents.id = states.payment_intent_id
       JOIN merchant_orders orders ON orders.id = states.order_id
       WHERE states.draft_id = ?`,
    ).get(draft.id) as {
      draft_id: string
      order_id: string
      checkout_version: number
      intent_id: string
      provider_request_id: string
      amount_fen: number
      order_version: number
      order_status: string
    }
    return {
      draftId: row.draft_id,
      orderId: row.order_id,
      intentId: row.intent_id,
      providerRequestId: row.provider_request_id,
      amountFen: row.amount_fen,
      checkoutVersion: row.checkout_version,
      orderVersion: row.order_version,
      orderStatus: row.order_status,
    }
  }

  function paymentSucceededInput(
    deal: DealContext,
  ): Extract<ConsumerDealPaymentCallbackInput, { type: 'PAYMENT_SUCCEEDED' }> {
    return {
      providerEventId: `wx-deal-event-${randomUUID()}`,
      type: 'PAYMENT_SUCCEEDED',
      intentId: deal.intentId,
      providerRequestId: deal.providerRequestId,
      amountFen: deal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      providerTransactionId: `wx-deal-transaction-${randomUUID()}`,
    }
  }

  function postCallback(
    input: ConsumerDealPaymentCallbackInput,
    signature: string | null = consumerDealPaymentCallbackSignature(input),
  ) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (signature !== null) headers['x-payment-signature'] = signature
    return app.inject({
      method: 'POST',
      url: '/api/v1/payment-connectors/wechat/deals/callback',
      headers,
      payload: input,
    })
  }

  async function requestRefund(deal: DealContext): Promise<void> {
    const state = database.prepare(
      'SELECT version FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(deal.draftId) as { version: number }
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/deal-drafts/${deal.draftId}/refunds`,
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/json',
        'idempotency-key': nextKey('refund-request'),
      },
      payload: {
        expectedVersion: state.version,
        confirmed: true,
        reason: 'consumer requested a full refund',
      },
    })
    expect(response.statusCode, response.body).toBe(200)
  }

  async function approveRefund(deal: DealContext): Promise<RefundContext> {
    const order = database.prepare(
      'SELECT version FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId) as { version: number }
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${deal.orderId}/approve-refund`,
      headers: {
        authorization: merchantAuthorization,
        'content-type': 'application/json',
        'idempotency-key': nextKey('refund-approve'),
      },
      payload: {
        expectedVersion: order.version,
        refundAmountFen: deal.amountFen,
        reason: 'merchant confirmed the full refund',
        confirmed: true,
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    const row = database.prepare(
      `SELECT requests.id AS refund_id, attempts.id AS attempt_id,
              attempts.provider_request_id
       FROM consumer_deal_refund_requests requests
       JOIN consumer_deal_refund_attempts attempts ON attempts.refund_id = requests.id
       WHERE requests.payment_intent_id = ?
       ORDER BY attempts.created_at DESC, attempts.id DESC
       LIMIT 1`,
    ).get(deal.intentId) as {
      refund_id: string
      attempt_id: string
      provider_request_id: string
    }
    return {
      refundId: row.refund_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
    }
  }

  async function requestAndApproveRefund(deal: DealContext): Promise<RefundContext> {
    await requestRefund(deal)
    return approveRefund(deal)
  }

  function issueCredential(deal: DealContext): string {
    const credentialId = randomUUID()
    const timestamp = new Date().toISOString()
    database.prepare(
      `INSERT INTO consumer_deal_redemption_credentials
       (id, tenant_id, user_id, draft_id, order_id, status, code_hash,
        code_masked, derivation_nonce, key_version, expires_at, issued_at,
        redeemed_at, revoked_at, version, updated_at)
       VALUES (?, 'tenant-lequ', 'user-demo-consumer', ?, ?, 'ISSUED', ?,
               '***321', ?, 'deal-credential-v1', ?, ?, NULL, NULL, 1, ?)`,
    ).run(
      credentialId, deal.draftId, deal.orderId, `hash-${credentialId}`,
      `nonce-${credentialId}`, new Date(Date.now() + 86_400_000).toISOString(),
      timestamp, timestamp,
    )
    database.prepare(
      `UPDATE merchant_orders
       SET verification_code_hash = ?, verification_code_masked = '***321'
       WHERE id = ?`,
    ).run(`hash-${credentialId}`, deal.orderId)
    return credentialId
  }

  async function seedLegacyProviderEvent(providerEventId: string): Promise<void> {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/messages',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': nextKey('legacy-message'),
      },
      payload: {
        prompt: '明晚三个人吃晚餐，想要安静靠窗的位置',
        cityId: context.cityId,
        householdMemberId: context.householdMemberId,
      },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    const draft = sent.json<ConsumerAssistantOverview>().reservationDraft
    if (!draft) throw new Error('expected legacy reservation draft')
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${draft.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': nextKey('legacy-submit'),
      },
      payload: { expectedVersion: draft.version, confirmed: true },
    })
    expect(submitted.statusCode, submitted.body).toBe(200)
    const submittedDraft = submitted.json<ConsumerAssistantOverview>().reservationDraft
    if (!submittedDraft?.orderId) throw new Error('expected legacy reservation order')
    const merchant = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/orders/${submittedDraft.orderId}/confirm`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': nextKey('legacy-merchant-confirm'),
      },
      payload: { expectedVersion: 1 },
    })
    expect(merchant.statusCode, merchant.body).toBe(200)
    const overview = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    const confirmedDraft = overview.json<ConsumerAssistantOverview>().reservationDraft
    if (!confirmedDraft) throw new Error('expected confirmed legacy reservation draft')
    const prepared = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/reservations/${confirmedDraft.id}/payment/prepare`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': nextKey('legacy-payment-prepare'),
      },
      payload: { expectedVersion: confirmedDraft.version, confirmed: true },
    })
    expect(prepared.statusCode, prepared.body).toBe(200)
    const intentId = prepared.json<ConsumerAssistantOverview>().reservationDraft?.payment.intentId
    if (!intentId) throw new Error('expected legacy payment intent')
    const intent = database.prepare(
      `SELECT tenant_id, user_id, order_id
       FROM consumer_payment_intents WHERE id = ?`,
    ).get(intentId) as { tenant_id: string; user_id: string; order_id: string }
    const timestamp = new Date().toISOString()
    database.prepare(
      `INSERT INTO consumer_payment_events
       (id, tenant_id, user_id, intent_id, order_id, provider_event_id,
        type, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PAYMENT_FAILED', ?, '{}', ?)`,
    ).run(
      randomUUID(), intent.tenant_id, intent.user_id, intentId, intent.order_id,
      providerEventId, 'legacy connector event reserved this provider event id', timestamp,
    )
  }

  it('converges a normal signed payment without changing merchant order status', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    const input = paymentSucceededInput(deal)
    const response = await postCallback(input)

    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealConnectorCallbackReceipt>()).toEqual({
      accepted: true,
      replayed: false,
      applied: true,
      outcome: 'PAYMENT_SUCCEEDED',
      intentId: deal.intentId,
      orderId: deal.orderId,
      paymentStatus: 'SUCCEEDED',
      refundStatus: 'NONE',
    })
    expect(database.prepare(
      `SELECT status, provider_transaction_id, late_success
       FROM consumer_deal_payment_intents WHERE id = ?`,
    ).get(deal.intentId)).toEqual({
      status: 'SUCCEEDED',
      provider_transaction_id: input.providerTransactionId,
      late_success: 0,
    })
    expect(database.prepare(
      'SELECT status, consumed_at FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toMatchObject({ status: 'CONSUMED' })
    expect(database.prepare(
      `SELECT status, paid_amount_fen, refund_amount_fen, version
       FROM merchant_orders WHERE id = ?`,
    ).get(deal.orderId)).toEqual({
      status: deal.orderStatus,
      paid_amount_fen: deal.amountFen,
      refund_amount_fen: 0,
      version: deal.orderVersion + 1,
    })
    expect(database.prepare(
      'SELECT status, version FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({
      status: 'CONFIRMED',
      version: deal.checkoutVersion + 1,
    })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: stockBefore.stock_quantity - 1 })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE topic = 'consumer.deal.payment.succeeded.v1' AND aggregate_id = ?`,
    ).get(deal.intentId)).toEqual({ count: 1 })
  })

  it('validates signature before lookup, fails closed in production, and rejects amount drift', async () => {
    const deal = await confirmedDeal()
    const input = paymentSucceededInput(deal)
    expect((await postCallback(input, null)).statusCode).toBe(401)

    const unknownIntent = { ...input, intentId: randomUUID() }
    const invalid = await postCallback(unknownIntent, '0'.repeat(64))
    expect(invalid.statusCode).toBe(401)
    expect(invalid.json()).toMatchObject({ title: 'payment_callback_signature_invalid' })

    process.env.NODE_ENV = 'production'
    const unavailable = await postCallback(input, '0'.repeat(64))
    expect(unavailable.statusCode).toBe(503)
    expect(unavailable.json()).toMatchObject({ title: 'payment_connector_secret_unavailable' })
    process.env.NODE_ENV = 'test'

    const amountDrift: ConsumerDealPaymentCallbackInput = {
      ...input,
      providerEventId: `wx-deal-event-${randomUUID()}`,
      amountFen: input.amountFen + 1,
    }
    const mismatch = await postCallback(amountDrift)
    expect(mismatch.statusCode).toBe(409)
    expect(mismatch.json()).toMatchObject({ title: 'consumer_deal_payment_fact_mismatch' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_payment_intents WHERE id = ?',
    ).get(deal.intentId)).toEqual({ status: 'PENDING_PROVIDER' })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM payment_connector_receipts',
    ).get()).toEqual({ count: 0 })
  })

  it('replays the exact provider event once and rejects a changed payload under the same event id', async () => {
    const deal = await confirmedDeal()
    const input = paymentSucceededInput(deal)
    const first = await postCallback(input)
    const replay = await postCallback(input)
    expect(first.statusCode, first.body).toBe(200)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      replayed: true,
      applied: true,
      outcome: 'PAYMENT_SUCCEEDED',
    })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM payment_connector_receipts WHERE provider_event_id = ?',
    ).get(input.providerEventId)).toEqual({ count: 1 })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_deal_payment_events WHERE provider_event_id = ?',
    ).get(input.providerEventId)).toEqual({ count: 1 })

    const conflict: ConsumerDealPaymentCallbackInput = {
      ...input,
      providerTransactionId: `wx-deal-transaction-${randomUUID()}`,
    }
    const rejected = await postCallback(conflict)
    expect(rejected.statusCode).toBe(409)
    expect(rejected.json()).toMatchObject({ title: 'payment_callback_event_conflict' })
  })

  it('rejects a provider event id already committed by the legacy reservation connector', async () => {
    const deal = await confirmedDeal()
    const input = paymentSucceededInput(deal)
    await seedLegacyProviderEvent(input.providerEventId)

    const response = await postCallback(input)
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ title: 'payment_callback_event_conflict' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_payment_intents WHERE id = ?',
    ).get(deal.intentId)).toEqual({ status: 'PENDING_PROVIDER' })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM payment_connector_receipts WHERE provider_event_id = ?',
    ).get(input.providerEventId)).toEqual({ count: 0 })
  })

  it('atomically releases stock and cancels the checkout when payment fails', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    const input: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-event-${randomUUID()}`,
      type: 'PAYMENT_FAILED',
      intentId: deal.intentId,
      providerRequestId: deal.providerRequestId,
      amountFen: deal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      failureCode: 'PAYMENT_DECLINED',
    }
    const response = await postCallback(input)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      applied: true,
      outcome: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
      refundStatus: 'NONE',
    })
    expect(database.prepare(
      'SELECT status, failure_code FROM consumer_deal_payment_intents WHERE id = ?',
    ).get(deal.intentId)).toEqual({ status: 'FAILED', failure_code: 'PAYMENT_DECLINED' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'RELEASED' })
    expect(database.prepare(
      'SELECT status, paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({ status: 'CANCELLED', paid_amount_fen: 0 })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_checkout_states WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'EXPIRED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
  })

  it('starts compensation without reacquiring resources when success arrives after expiry before scanning', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    database.prepare(
      "UPDATE consumer_deal_fulfillment_holds SET expires_at = '2020-01-01T00:00:00.000Z' WHERE draft_id = ?",
    ).run(deal.draftId)
    const input = paymentSucceededInput(deal)
    const response = await postCallback(input)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      outcome: 'LATE_PAYMENT_COMPENSATION_STARTED',
      paymentStatus: 'LATE_SUCCEEDED',
      refundStatus: 'APPROVED_PENDING_PROVIDER',
    })
    expect(database.prepare(
      'SELECT status, late_success FROM consumer_deal_payment_intents WHERE id = ?',
    ).get(deal.intentId)).toEqual({ status: 'LATE_SUCCEEDED', late_success: 1 })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'RELEASED' })
    expect(database.prepare(
      'SELECT status, paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({
      status: 'REFUND_REQUESTED',
      paid_amount_fen: deal.amountFen,
    })
    const compensation = database.prepare(
      `SELECT requests.status AS request_status, requests.kind,
              attempts.status AS attempt_status, attempts.id AS attempt_id
       FROM consumer_deal_refund_requests requests
       JOIN consumer_deal_refund_attempts attempts ON attempts.refund_id = requests.id
       WHERE requests.payment_intent_id = ?`,
    ).get(deal.intentId) as {
      request_status: string
      kind: string
      attempt_status: string
      attempt_id: string
    }
    expect(compensation).toMatchObject({
      request_status: 'APPROVED_PENDING_PROVIDER',
      kind: 'LATE_PAYMENT_COMPENSATION',
      attempt_status: 'PENDING_PROVIDER',
    })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE topic = 'consumer.deal.refund.requested.v1' AND aggregate_id = ?`,
    ).get(compensation.attempt_id)).toEqual({ count: 1 })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
  })

  it('converges late success after the expiry scanner without double restoring stock', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    database.prepare(
      "UPDATE consumer_deal_fulfillment_holds SET expires_at = '2020-01-01T00:00:00.000Z' WHERE draft_id = ?",
    ).run(deal.draftId)
    expect(releaseExpiredConsumerDealCheckouts(database)).toEqual({
      expiredDrafts: 1,
      releasedHolds: 1,
    })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)

    const response = await postCallback(paymentSucceededInput(deal))
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      outcome: 'LATE_PAYMENT_COMPENSATION_STARTED',
      paymentStatus: 'LATE_SUCCEEDED',
      refundStatus: 'APPROVED_PENDING_PROVIDER',
    })
    expect(database.prepare(
      `SELECT intents.status, holds.status AS hold_status, orders.status AS order_status
       FROM consumer_deal_payment_intents intents
       JOIN consumer_deal_fulfillment_holds holds ON holds.draft_id = intents.draft_id
       JOIN merchant_orders orders ON orders.id = intents.order_id
       WHERE intents.id = ?`,
    ).get(deal.intentId)).toEqual({
      status: 'LATE_SUCCEEDED',
      hold_status: 'RELEASED',
      order_status: 'REFUND_REQUESTED',
    })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
  })

  it('converges an exact refund attempt, releases consumed resources, and revokes credentials', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    expect((await postCallback(paymentSucceededInput(deal))).statusCode).toBe(200)
    const refund = await requestAndApproveRefund(deal)
    const credentialId = issueCredential(deal)
    const input: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-refund-event-${randomUUID()}`,
      type: 'REFUND_SUCCEEDED',
      intentId: deal.intentId,
      providerRequestId: refund.providerRequestId,
      amountFen: deal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      refundId: refund.refundId,
      refundAttemptId: refund.attemptId,
      providerRefundId: `wx-deal-refund-${randomUUID()}`,
    }
    const response = await postCallback(input)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      outcome: 'REFUND_SUCCEEDED',
      paymentStatus: 'SUCCEEDED',
      refundStatus: 'REFUNDED',
    })
    expect(database.prepare(
      `SELECT requests.status AS request_status,
              requests.provider_refund_id AS request_provider_refund_id,
              attempts.status AS attempt_status,
              attempts.provider_refund_id AS attempt_provider_refund_id
       FROM consumer_deal_refund_requests requests
       JOIN consumer_deal_refund_attempts attempts ON attempts.refund_id = requests.id
       WHERE requests.id = ? AND attempts.id = ?`,
    ).get(refund.refundId, refund.attemptId)).toEqual({
      request_status: 'REFUNDED',
      request_provider_refund_id: input.providerRefundId,
      attempt_status: 'SUCCEEDED',
      attempt_provider_refund_id: input.providerRefundId,
    })
    expect(database.prepare(
      `SELECT status, paid_amount_fen, refund_amount_fen,
              verification_code_hash, verification_code_masked
       FROM merchant_orders WHERE id = ?`,
    ).get(deal.orderId)).toEqual({
      status: 'REFUNDED',
      paid_amount_fen: deal.amountFen,
      refund_amount_fen: deal.amountFen,
      verification_code_hash: null,
      verification_code_masked: null,
    })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'RELEASED' })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_redemption_credentials WHERE id = ?',
    ).get(credentialId)).toEqual({ status: 'REVOKED' })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM consumer_deal_redemption_events
       WHERE credential_id = ? AND type = 'CREDENTIAL_REVOKED'`,
    ).get(credentialId)).toEqual({ count: 1 })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
  })

  it('returns domain conflicts when provider transaction or refund ids cross deal aggregates', async () => {
    const firstDeal = await confirmedDeal()
    const firstPayment = paymentSucceededInput(firstDeal)
    expect((await postCallback(firstPayment)).statusCode).toBe(200)

    const secondDeal = await confirmedDeal()
    const reusedTransaction: ConsumerDealPaymentCallbackInput = {
      ...paymentSucceededInput(secondDeal),
      providerTransactionId: firstPayment.providerTransactionId,
    }
    const transactionConflict = await postCallback(reusedTransaction)
    expect(transactionConflict.statusCode).toBe(409)
    expect(transactionConflict.json()).toMatchObject({
      title: 'payment_callback_transaction_conflict',
    })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_payment_intents WHERE id = ?',
    ).get(secondDeal.intentId)).toEqual({ status: 'PENDING_PROVIDER' })

    expect((await postCallback(paymentSucceededInput(secondDeal))).statusCode).toBe(200)
    const firstRefund = await requestAndApproveRefund(firstDeal)
    const providerRefundId = `wx-deal-refund-${randomUUID()}`
    const firstRefundCallback: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-refund-event-${randomUUID()}`,
      type: 'REFUND_SUCCEEDED',
      intentId: firstDeal.intentId,
      providerRequestId: firstRefund.providerRequestId,
      amountFen: firstDeal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      refundId: firstRefund.refundId,
      refundAttemptId: firstRefund.attemptId,
      providerRefundId,
    }
    expect((await postCallback(firstRefundCallback)).statusCode).toBe(200)

    const secondRefund = await requestAndApproveRefund(secondDeal)
    const reusedRefund: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-refund-event-${randomUUID()}`,
      type: 'REFUND_SUCCEEDED',
      intentId: secondDeal.intentId,
      providerRequestId: secondRefund.providerRequestId,
      amountFen: secondDeal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      refundId: secondRefund.refundId,
      refundAttemptId: secondRefund.attemptId,
      providerRefundId,
    }
    const refundConflict = await postCallback(reusedRefund)
    expect(refundConflict.statusCode).toBe(409)
    expect(refundConflict.json()).toMatchObject({
      title: 'refund_callback_provider_id_conflict',
    })
    expect(database.prepare(
      `SELECT requests.status AS request_status, attempts.status AS attempt_status
       FROM consumer_deal_refund_requests requests
       JOIN consumer_deal_refund_attempts attempts ON attempts.refund_id = requests.id
       WHERE requests.id = ? AND attempts.id = ?`,
    ).get(secondRefund.refundId, secondRefund.attemptId)).toEqual({
      request_status: 'APPROVED_PENDING_PROVIDER',
      attempt_status: 'PENDING_PROVIDER',
    })
  })

  it('keeps failed refunds retryable and creates a new exact provider attempt', async () => {
    const stockBefore = database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get() as { stock_quantity: number }
    const deal = await confirmedDeal()
    expect((await postCallback(paymentSucceededInput(deal))).statusCode).toBe(200)
    const firstAttempt = await requestAndApproveRefund(deal)
    const input: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-refund-event-${randomUUID()}`,
      type: 'REFUND_FAILED',
      intentId: deal.intentId,
      providerRequestId: firstAttempt.providerRequestId,
      amountFen: deal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      refundId: firstAttempt.refundId,
      refundAttemptId: firstAttempt.attemptId,
      failureCode: 'PROVIDER_TEMPORARY_FAILURE',
    }
    const response = await postCallback(input)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      outcome: 'REFUND_FAILED',
      paymentStatus: 'SUCCEEDED',
      refundStatus: 'FAILED',
    })
    expect(database.prepare(
      `SELECT requests.status AS request_status, attempts.status AS attempt_status,
              requests.failure_code AS request_failure_code,
              attempts.failure_code AS attempt_failure_code
       FROM consumer_deal_refund_requests requests
       JOIN consumer_deal_refund_attempts attempts ON attempts.refund_id = requests.id
       WHERE requests.id = ? AND attempts.id = ?`,
    ).get(firstAttempt.refundId, firstAttempt.attemptId)).toEqual({
      request_status: 'FAILED',
      attempt_status: 'FAILED',
      request_failure_code: 'PROVIDER_TEMPORARY_FAILURE',
      attempt_failure_code: 'PROVIDER_TEMPORARY_FAILURE',
    })
    expect(database.prepare(
      'SELECT status, exception_code, paid_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({
      status: 'REFUND_REQUESTED',
      exception_code: 'REFUND_FAILED:PROVIDER_TEMPORARY_FAILURE',
      paid_amount_fen: deal.amountFen,
    })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'CONSUMED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual({ stock_quantity: stockBefore.stock_quantity - 1 })

    const retry = await approveRefund(deal)
    expect(retry.refundId).toBe(firstAttempt.refundId)
    expect(retry.attemptId).not.toBe(firstAttempt.attemptId)
    expect(retry.providerRequestId).not.toBe(firstAttempt.providerRequestId)
    expect(database.prepare(
      'SELECT status, failure_code FROM consumer_deal_refund_requests WHERE id = ?',
    ).get(retry.refundId)).toEqual({
      status: 'APPROVED_PENDING_PROVIDER',
      failure_code: null,
    })
    expect(database.prepare(
      `SELECT status FROM consumer_deal_refund_attempts
       WHERE id = ?`,
    ).get(retry.attemptId)).toEqual({ status: 'PENDING_PROVIDER' })

    const providerRefundId = `wx-deal-refund-${randomUUID()}`
    const lateSuccess: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-refund-event-${randomUUID()}`,
      type: 'REFUND_SUCCEEDED',
      intentId: deal.intentId,
      providerRequestId: firstAttempt.providerRequestId,
      amountFen: deal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      refundId: firstAttempt.refundId,
      refundAttemptId: firstAttempt.attemptId,
      providerRefundId,
    }
    const converged = await postCallback(lateSuccess)
    expect(converged.statusCode, converged.body).toBe(200)
    expect(converged.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      applied: true,
      outcome: 'REFUND_SUCCEEDED',
      refundStatus: 'REFUNDED',
    })
    expect(database.prepare(
      `SELECT requests.status AS request_status,
              requests.provider_refund_id AS request_provider_refund_id,
              attempts.status AS first_attempt_status,
              attempts.provider_refund_id AS first_attempt_provider_refund_id
       FROM consumer_deal_refund_requests requests
       JOIN consumer_deal_refund_attempts attempts ON attempts.id = ?
       WHERE requests.id = ?`,
    ).get(firstAttempt.attemptId, firstAttempt.refundId)).toEqual({
      request_status: 'REFUNDED',
      request_provider_refund_id: providerRefundId,
      first_attempt_status: 'SUCCEEDED',
      first_attempt_provider_refund_id: providerRefundId,
    })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_refund_attempts WHERE id = ?',
    ).get(retry.attemptId)).toEqual({ status: 'PENDING_PROVIDER' })
    expect(database.prepare(
      'SELECT status, refund_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({
      status: 'REFUNDED',
      refund_amount_fen: deal.amountFen,
    })
    expect(database.prepare(
      'SELECT status FROM consumer_deal_fulfillment_holds WHERE draft_id = ?',
    ).get(deal.draftId)).toEqual({ status: 'RELEASED' })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)

    const reverseFailure: ConsumerDealPaymentCallbackInput = {
      providerEventId: `wx-deal-refund-event-${randomUUID()}`,
      type: 'REFUND_FAILED',
      intentId: deal.intentId,
      providerRequestId: retry.providerRequestId,
      amountFen: deal.amountFen,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      refundId: retry.refundId,
      refundAttemptId: retry.attemptId,
      failureCode: 'RETRY_REPORTED_FAILED_AFTER_REFUND',
    }
    const ignored = await postCallback(reverseFailure)
    expect(ignored.statusCode, ignored.body).toBe(200)
    expect(ignored.json<ConsumerDealConnectorCallbackReceipt>()).toMatchObject({
      applied: false,
      outcome: 'REFUND_FAILED',
      refundStatus: 'REFUNDED',
    })
    expect(database.prepare(
      'SELECT status, refund_amount_fen FROM merchant_orders WHERE id = ?',
    ).get(deal.orderId)).toEqual({
      status: 'REFUNDED',
      refund_amount_fen: deal.amountFen,
    })
    expect(database.prepare(
      "SELECT stock_quantity FROM merchant_skus WHERE id = 'sku-e5-dinner-2'",
    ).get()).toEqual(stockBefore)
  })
})
