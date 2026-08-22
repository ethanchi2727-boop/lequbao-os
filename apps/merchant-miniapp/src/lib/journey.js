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

export function aiDisclosure({ identityBound, requestedHuman }) {
  return {
    label: 'AI 店员',
    mayQueryOrder: identityBound,
    route: requestedHuman ? 'HUMAN_QUEUE' : 'AI_ACTIVE',
    notice: '回答由 AI 提供；你可以随时转人工，查询订单前需要完成身份绑定。',
  };
}

export function paymentPresentation(providerAccepted, serverStatus) {
  if (!providerAccepted) return '可恢复失败';
  return serverStatus === 'SUCCEEDED' ? '成功' : '加载中';
}

export function refundAction(status) {
  if (['REQUESTED', 'APPROVAL_REQUIRED', 'SUBMITTING', 'PROCESSING'].includes(status))
    return '查看进度';
  return status === 'FAILED' ? '安全重试' : '申请售后';
}
