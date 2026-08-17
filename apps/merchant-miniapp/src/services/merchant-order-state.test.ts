import { describe, expect, it } from 'vitest'
import type { MerchantOrderSummary } from '@lequ/contracts'
import {
  merchantOrderAction,
  merchantOrderBlockedMessage,
  merchantOrderStatusLabel,
  merchantPaymentStatusLabel,
  merchantRefundStatusLabel,
  merchantTodoActionAllowed,
  merchantVerificationStatusLabel,
} from './merchant-order-state'

function order(
  overrides: Partial<MerchantOrderSummary> = {},
): MerchantOrderSummary {
  return {
    id: 'order-e8j',
    orderNo: 'LQD-E8J',
    type: 'GROUP_BUY',
    channel: 'MINIAPP',
    status: 'PENDING_CONFIRMATION',
    customerName: '测试顾客',
    customerPhoneMasked: '138****0000',
    itemSummary: '双人套餐',
    partySize: 2,
    serviceAt: null,
    grossAmountFen: 10_000,
    discountFen: 0,
    paidAmountFen: 10_000,
    refundAmountFen: 0,
    consumerDealPaymentStatus: 'SUCCEEDED',
    consumerDealRefundStatus: 'NONE',
    merchantConfirmationAllowed: true,
    verificationCodeMasked: null,
    verificationStatus: 'NOT_ISSUED',
    exceptionCode: null,
    version: 1,
    placedAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  }
}

describe('merchant E8J order state policy', () => {
  it.each([
    ['PENDING_PROVIDER', '待顾客支付 · 不可接单', '不会开放'],
    ['FAILED', '支付失败 · 不可接单', '不能接单'],
    ['CANCELLED', '支付已取消 · 不可接单', '不能接单'],
    ['LATE_SUCCEEDED', '迟到支付待处理 · 不可接单', '不能接单'],
  ] as const)('blocks %s from merchant confirmation', (paymentStatus, label, blockCopy) => {
    const subject = order({ consumerDealPaymentStatus: paymentStatus })

    expect(merchantOrderAction(subject)).toBeNull()
    expect(merchantTodoActionAllowed(subject, 'CONFIRM')).toBe(false)
    expect(merchantOrderStatusLabel(subject)).toBe(label)
    expect(merchantOrderBlockedMessage(subject)).toContain(blockCopy)
  })

  it.each(['SUCCEEDED', 'NOT_REQUIRED'] as const)(
    'allows eligible %s deal confirmation only with the server gate',
    (paymentStatus) => {
      expect(merchantOrderAction(order({ consumerDealPaymentStatus: paymentStatus }))).toBe('CONFIRM')
      expect(merchantOrderAction(order({
        consumerDealPaymentStatus: paymentStatus,
        merchantConfirmationAllowed: false,
      }))).toBeNull()
    },
  )

  it('only exposes verification for an issued eligible credential', () => {
    const issued = order({
      status: 'CONFIRMED',
      merchantConfirmationAllowed: false,
      verificationStatus: 'ISSUED',
      verificationCodeMasked: '12****',
    })

    expect(merchantOrderAction(issued)).toBe('VERIFY')
    expect(merchantTodoActionAllowed(issued, 'VERIFY')).toBe(true)
    expect(merchantOrderStatusLabel(issued)).toBe('待核销')
    expect(merchantOrderAction(order({
      ...issued,
      consumerDealPaymentStatus: 'FAILED',
    }))).toBeNull()
    expect(merchantOrderAction(order({
      ...issued,
      verificationStatus: 'EXPIRED',
    }))).toBeNull()
    expect(merchantOrderAction(order({
      ...issued,
      verificationStatus: 'REVOKED',
    }))).toBeNull()
  })

  it('does not expose verification when a confirmed deal is missing its credential', () => {
    const missing = order({ status: 'CONFIRMED', merchantConfirmationAllowed: false })

    expect(merchantOrderAction(missing)).toBeNull()
    expect(merchantTodoActionAllowed(missing, 'VERIFY')).toBe(false)
    expect(merchantOrderStatusLabel(missing)).toBe('核销凭证尚未签发')
    expect(merchantOrderAction(order({
      ...missing,
      consumerDealPaymentStatus: 'LATE_SUCCEEDED',
    }))).toBeNull()
  })

  it.each([
    ['REQUESTED', '待审核退款'],
    ['FAILED', '退款失败 · 可重试'],
  ] as const)('allows merchant refund action for %s', (refundStatus, label) => {
    const subject = order({
      status: 'REFUND_REQUESTED',
      consumerDealRefundStatus: refundStatus,
      refundAmountFen: 10_000,
      merchantConfirmationAllowed: false,
      verificationStatus: 'REVOKED',
    })

    expect(merchantOrderAction(subject)).toBe('APPROVE_REFUND')
    expect(merchantTodoActionAllowed(subject, 'APPROVE_REFUND')).toBe(true)
    expect(merchantOrderStatusLabel(subject)).toBe(label)
  })

  it('does not resubmit a refund while the provider result is pending', () => {
    const subject = order({
      status: 'REFUND_REQUESTED',
      consumerDealRefundStatus: 'APPROVED_PENDING_PROVIDER',
      refundAmountFen: 10_000,
      merchantConfirmationAllowed: false,
      verificationStatus: 'REVOKED',
    })

    expect(merchantOrderAction(subject)).toBeNull()
    expect(merchantTodoActionAllowed(subject, 'APPROVE_REFUND')).toBe(false)
    expect(merchantOrderStatusLabel(subject)).toBe('退款处理中 · 不可重复提交')
    expect(merchantOrderBlockedMessage(subject)).toContain('不可重复提交')
    expect(merchantPaymentStatusLabel(subject)).toBe('支付成功')
    expect(merchantRefundStatusLabel(subject)).toBe('已提交 · 等待资金结果')
    expect(merchantVerificationStatusLabel(subject)).toBe('已撤销')
  })

  it('keeps legacy non-deal confirmation and verification behavior', () => {
    expect(merchantOrderAction(order({
      consumerDealPaymentStatus: 'NOT_APPLICABLE',
      consumerDealRefundStatus: 'NOT_APPLICABLE',
      verificationStatus: 'NOT_APPLICABLE',
    }))).toBe('CONFIRM')
    expect(merchantOrderAction(order({
      status: 'READY_FOR_SERVICE',
      consumerDealPaymentStatus: 'NOT_APPLICABLE',
      consumerDealRefundStatus: 'NOT_APPLICABLE',
      verificationStatus: 'NOT_APPLICABLE',
      merchantConfirmationAllowed: false,
    }))).toBe('VERIFY')
  })
})
