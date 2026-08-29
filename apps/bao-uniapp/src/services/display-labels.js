/*
 * 乐趣宝移动端 · 界面中文显示映射
 * 服务端枚举一律转换为中文展示，界面不直接显示英文状态码。
 * 未识别的值统一回退为中文兜底文案，绝不原样透出英文。
 */

const ORDER_STATUS_LABELS = Object.freeze({
  COMPLETED: '已完成',
  FULFILLED: '已履约',
  CONFIRMED: '已确认',
  CANCELLED: '已取消',
  PENDING_CONFIRM: '待确认',
  REFUNDING: '退款中',
});

const STORE_STATUS_LABELS = Object.freeze({
  ACTIVE: '营业中',
  PENDING: '待完善',
  SUSPENDED: '已停用',
});

const PROFILE_STATUS_LABELS = Object.freeze({
  ACTIVE: '已生效',
  PENDING: '待生效',
  SUSPENDED: '已停用',
});

const RISK_LEVEL_LABELS = Object.freeze({
  HIGH: '加急',
  NORMAL: '常规',
  LOW: '常规',
});

const PRIORITY_LABELS = Object.freeze({
  HIGH: '加急',
  NORMAL: '普通',
  LOW: '延后',
});

const TASK_TYPE_LABELS = Object.freeze({
  INVOICE: '发票事务',
  REFUND_FOLLOW: '退款跟进',
});

const ROLE_LABELS = Object.freeze({
  MERCHANT_OWNER: '商户负责人',
  STORE_MANAGER: '门店店长',
  CUSTOMER_SERVICE: '客服专员',
  MARKETER: '营销专员',
  VERIFIER: '核销专员',
  ADMIN: '管理员',
});

function translate(labels, value, fallback) {
  const key = String(value ?? '').toUpperCase();
  return labels[key] ?? fallback;
}

export const orderStatusLabel = (value) => translate(ORDER_STATUS_LABELS, value, '处理中');
export const storeStatusLabel = (value) => translate(STORE_STATUS_LABELS, value, '待同步');
export const profileStatusLabel = (value) => translate(PROFILE_STATUS_LABELS, value, '待确认');
export const riskLevelLabel = (value) => translate(RISK_LEVEL_LABELS, value, '常规');
export const priorityLabel = (value) => translate(PRIORITY_LABELS, value, '普通');
export const taskTypeLabel = (value) => translate(TASK_TYPE_LABELS, value, '客服任务');
export const roleLabel = (value) => translate(ROLE_LABELS, value, '员工');
