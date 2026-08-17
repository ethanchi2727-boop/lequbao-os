import type { MerchantOrderSummary, MerchantTodoSummary } from '@lequ/contracts'

export type MerchantOrderUiAction =
  | 'CONFIRM'
  | 'VERIFY'
  | 'APPROVE_REFUND'

const normalStatusLabels: Record<MerchantOrderSummary['status'], string> = {
  PENDING_CONFIRMATION: '待确认',
  CONFIRMED: '已确认',
  READY_FOR_SERVICE: '待服务',
  VERIFIED: '已核销',
  COMPLETED: '已完成',
  REFUND_REQUESTED: '待审核退款',
  REFUNDED: '已退款',
  CANCELLED: '已取消',
  EXCEPTION: '异常',
}

function isConsumerDeal(order: MerchantOrderSummary): boolean {
  return order.consumerDealPaymentStatus !== 'NOT_APPLICABLE'
}

function hasEligibleFunds(order: MerchantOrderSummary): boolean {
  return order.consumerDealPaymentStatus === 'NOT_APPLICABLE'
    || order.consumerDealPaymentStatus === 'NOT_REQUIRED'
    || order.consumerDealPaymentStatus === 'SUCCEEDED'
}

function hasNoRefundBlocker(order: MerchantOrderSummary): boolean {
  return order.consumerDealRefundStatus === 'NOT_APPLICABLE'
    || order.consumerDealRefundStatus === 'NONE'
}

export function merchantOrderAction(order: MerchantOrderSummary): MerchantOrderUiAction | null {
  if (
    order.status === 'REFUND_REQUESTED'
    && (
      order.consumerDealRefundStatus === 'NOT_APPLICABLE'
      || order.consumerDealRefundStatus === 'REQUESTED'
      || order.consumerDealRefundStatus === 'FAILED'
    )
  ) {
    return 'APPROVE_REFUND'
  }

  if (
    order.status === 'PENDING_CONFIRMATION'
    && order.merchantConfirmationAllowed
    && hasEligibleFunds(order)
    && hasNoRefundBlocker(order)
  ) {
    return 'CONFIRM'
  }

  if (
    (order.status === 'CONFIRMED' || order.status === 'READY_FOR_SERVICE')
    && hasEligibleFunds(order)
    && hasNoRefundBlocker(order)
    && (
      order.verificationStatus === 'NOT_APPLICABLE'
      || order.verificationStatus === 'ISSUED'
    )
  ) {
    return 'VERIFY'
  }

  return null
}

export function merchantTodoActionAllowed(
  order: MerchantOrderSummary,
  action: MerchantTodoSummary['action'],
): boolean {
  if (action === 'VIEW') return true
  return merchantOrderAction(order) === action
}

export function merchantPaymentStatusLabel(order: MerchantOrderSummary): string {
  const labels: Record<MerchantOrderSummary['consumerDealPaymentStatus'], string> = {
    NOT_APPLICABLE: '非套餐订单',
    NOT_REQUIRED: '零元订单 · 无需支付',
    PENDING_PROVIDER: '等待支付结果',
    SUCCEEDED: '支付成功',
    FAILED: '支付失败',
    CANCELLED: '支付已取消',
    LATE_SUCCEEDED: '迟到支付待处理',
  }
  return labels[order.consumerDealPaymentStatus]
}

export function merchantRefundStatusLabel(order: MerchantOrderSummary): string {
  const labels: Record<MerchantOrderSummary['consumerDealRefundStatus'], string> = {
    NOT_APPLICABLE: '非套餐订单',
    NONE: '无退款',
    REQUESTED: '待商家审核',
    APPROVED_PENDING_PROVIDER: '已提交 · 等待资金结果',
    REFUNDED: '退款成功',
    FAILED: '退款失败 · 可重试',
  }
  return labels[order.consumerDealRefundStatus]
}

export function merchantVerificationStatusLabel(order: MerchantOrderSummary): string {
  const labels: Record<MerchantOrderSummary['verificationStatus'], string> = {
    NOT_APPLICABLE: '沿用订单核销',
    NOT_ISSUED: '尚未签发',
    ISSUED: '已签发 · 待核销',
    REDEEMED: '已核销',
    REVOKED: '已撤销',
    EXPIRED: '已过期',
  }
  return labels[order.verificationStatus]
}

export function merchantOrderStatusLabel(order: MerchantOrderSummary): string {
  if (order.consumerDealRefundStatus === 'APPROVED_PENDING_PROVIDER') {
    return '退款处理中 · 不可重复提交'
  }
  if (order.consumerDealRefundStatus === 'FAILED') return '退款失败 · 可重试'
  if (order.consumerDealRefundStatus === 'REQUESTED') return '待审核退款'
  if (order.consumerDealRefundStatus === 'REFUNDED') return '退款成功'

  if (order.consumerDealPaymentStatus === 'PENDING_PROVIDER') {
    return '待顾客支付 · 不可接单'
  }
  if (order.consumerDealPaymentStatus === 'FAILED') return '支付失败 · 不可接单'
  if (order.consumerDealPaymentStatus === 'CANCELLED') return '支付已取消 · 不可接单'
  if (order.consumerDealPaymentStatus === 'LATE_SUCCEEDED') {
    return '迟到支付待处理 · 不可接单'
  }

  if (order.verificationStatus === 'REVOKED') return '核销凭证已撤销'
  if (order.verificationStatus === 'EXPIRED') return '核销凭证已过期'
  if (order.verificationStatus === 'REDEEMED') return '已核销'
  if (
    isConsumerDeal(order)
    && order.verificationStatus === 'NOT_ISSUED'
    && order.status === 'CONFIRMED'
  ) {
    return '核销凭证尚未签发'
  }
  if (
    order.verificationStatus === 'ISSUED'
    && (order.status === 'CONFIRMED' || order.status === 'READY_FOR_SERVICE')
  ) {
    return '待核销'
  }

  return normalStatusLabels[order.status]
}

export function merchantOrderBlockedMessage(order: MerchantOrderSummary): string {
  if (order.consumerDealRefundStatus === 'APPROVED_PENDING_PROVIDER') {
    return '退款已提交支付连接器，请等待资金结果，当前不可重复提交。'
  }
  if (order.consumerDealRefundStatus === 'REFUNDED') return '退款资金结果已成功回写。'
  if (order.consumerDealPaymentStatus === 'PENDING_PROVIDER') {
    return '支付连接器尚未返回成功结果，当前不会开放商家确认或核销。'
  }
  if (order.consumerDealPaymentStatus === 'FAILED') {
    return '本次支付已经失败，不能接单或核销。'
  }
  if (order.consumerDealPaymentStatus === 'CANCELLED') {
    return '本次支付已经取消，不能接单或核销。'
  }
  if (order.consumerDealPaymentStatus === 'LATE_SUCCEEDED') {
    return '支付在订单关闭后迟到成功，需等待异常补偿完成，不能接单或核销。'
  }
  if (order.verificationStatus === 'REVOKED') return '核销凭证已撤销，当前不可核销。'
  if (order.verificationStatus === 'EXPIRED') return '核销凭证已过期，当前不可核销。'
  if (order.verificationStatus === 'REDEEMED') return '核销凭证已使用，本单无需重复处理。'
  if (order.verificationStatus === 'NOT_ISSUED' && isConsumerDeal(order)) {
    return '核销凭证尚未签发，当前不可核销，请刷新订单状态后再处理。'
  }
  return '当前订单无需人工处理，状态变化与资金结果会继续同步。'
}
