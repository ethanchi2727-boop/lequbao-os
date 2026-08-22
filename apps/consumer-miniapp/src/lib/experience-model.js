export const UI_STATES = [
  '默认',
  '加载中',
  '空数据',
  '局部错误',
  '无权限',
  '停用',
  '成功',
  '可恢复失败',
];

export function paymentOutcome({ providerAccepted, serverPaymentStatus }) {
  if (!providerAccepted) return { state: '可恢复失败', message: '支付未完成，可重新发起' };
  if (serverPaymentStatus === 'SUCCEEDED') return { state: '成功', message: '支付成功' };
  return { state: '加载中', message: '正在向服务端确认到账，请勿重复支付' };
}

export function cartSummary(groups) {
  return groups.reduce(
    (summary, group) => ({
      itemCount: summary.itemCount + group.items.reduce((count, item) => count + item.quantity, 0),
      payableCents:
        summary.payableCents +
        group.items.reduce((amount, item) => amount + item.priceCents * item.quantity, 0),
    }),
    { itemCount: 0, payableCents: 0 },
  );
}

export function canRetry(state) {
  return ['局部错误', '可恢复失败'].includes(state);
}
