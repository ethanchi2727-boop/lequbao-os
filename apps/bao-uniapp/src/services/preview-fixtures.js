/*
 * 乐趣宝移动端 · 开发预览数据（VITE_LEQU_PREVIEW_DATA=1 时启用）
 * 仅在预览构建中替代网络请求返回，正式构建不打包生效。
 * 所有数据均为虚构演示数据，不可用于经营决策。
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

const PREVIEW_GET_FIXTURES = Object.freeze({
  '/api/v1/operational-home/today': {
    scopeType: 'ASSIGNED',
    storeScope: '拾味小馆 · 新街口店',
    todos: [
      {
        kind: 'MERCHANT_CONFIRM',
        label: '商家关键确认 · 支付账户授权',
        title: '商家关键确认 · 支付账户授权',
      },
      {
        kind: 'REFUND',
        label: '退款待确认 · 订单 20260828007',
        title: '退款待确认 · 订单 20260828007',
      },
      {
        kind: 'CUSTOMER_HANDOFF',
        label: '客户转人工 · 发票开具咨询',
        title: '客户转人工 · 发票开具咨询',
      },
    ],
    metrics: { ordersCreated: 7 },
  },
  '/api/v1/merchant-operations/profile': {
    status: 'ACTIVE',
    legalSubjectName: '南京拾味餐饮管理有限公司',
    merchantName: '南京拾味餐饮管理有限公司',
  },
  '/api/v1/merchant-operations/stores': [
    {
      id: 'store-sw-001',
      storeName: '拾味小馆 · 新街口店',
      regionCodes: ['320102'],
      version: 3,
      status: 'ACTIVE',
    },
    {
      id: 'store-yf-002',
      storeName: '云峰会所 · 河西店',
      regionCodes: ['320105'],
      version: 1,
      status: 'ACTIVE',
    },
    {
      id: 'store-jn-003',
      storeName: '江南小馆 · 夫子庙店',
      regionCodes: ['320104'],
      version: 2,
      status: 'ACTIVE',
    },
    {
      id: 'store-yz-004',
      storeName: '叶子花店 · 仙林店',
      regionCodes: [],
      version: 1,
      status: 'PENDING',
    },
    {
      id: 'store-qy-005',
      storeName: '七月茶饮 · 江宁店',
      regionCodes: ['320115'],
      version: 4,
      status: 'ACTIVE',
    },
  ],
  '/api/v1/revenue-operations/summary': {
    distributableCents: 4373600,
    attentionCount: 2,
    periodLabel: '2026 年 8 月',
  },
  '/api/v1/merchant-operations/orders': [
    { orderNo: 'LQ20260828001', payableAmountCents: 12800, status: 'COMPLETED' },
    { orderNo: 'LQ20260828002', payableAmountCents: 9600, status: 'COMPLETED' },
    { orderNo: 'LQ20260828003', payableAmountCents: 21500, status: 'FULFILLED' },
    { orderNo: 'LQ20260828004', payableAmountCents: 7600, status: 'CONFIRMED' },
  ],
  '/api/v1/merchant-operations/refunds': [
    { refundNo: 'RF20260828007', amountCents: 3200, status: 'PENDING_CONFIRM' },
  ],
  '/api/v1/customer-service/conversations': [
    {
      id: 'conv-8f2a11c9e001',
      storeId: 'store-sw-001',
      riskLevel: 'NORMAL',
      status: 'HUMAN_QUEUED',
    },
    { id: 'conv-8f2a11c9e002', storeId: 'store-yf-002', riskLevel: 'HIGH', status: 'HUMAN_QUEUED' },
  ],
  '/api/v1/customer-service-operations/tasks': [
    {
      id: 'task-cs-1001',
      summary: '发票开具咨询回复',
      taskType: 'INVOICE',
      storeName: '拾味小馆 · 新街口店',
      storeId: 'store-sw-001',
      priority: 'HIGH',
      status: 'OPEN',
      version: 1,
    },
    {
      id: 'task-cs-1002',
      summary: '会员退款进度跟进',
      taskType: 'REFUND_FOLLOW',
      storeName: '云峰会所 · 河西店',
      storeId: 'store-yf-002',
      priority: 'NORMAL',
      status: 'ASSIGNED',
      version: 2,
    },
  ],
  '/api/v1/context': {
    tenantId: '10000000-0000-4000-8000-000000000001',
    userId: '10000000-0000-4000-8000-000000000002',
    roleCodes: ['MERCHANT_OWNER'],
    storeIds: ['store-sw-001', 'store-yf-002', 'store-jn-003'],
  },
});

export function previewFixtureFor(url, method = 'GET') {
  const path = String(url).split('?')[0];
  if (String(method).toUpperCase() === 'GET' && path in PREVIEW_GET_FIXTURES) {
    return clone(PREVIEW_GET_FIXTURES[path]);
  }
  if (/\/actions\/(accept|complete)$/u.test(path)) {
    return { ok: true, status: 'ACCEPTED', traceId: `preview-${Date.now().toString(36)}` };
  }
  return {};
}
