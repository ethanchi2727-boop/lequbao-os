import { lifeSession } from './life-session.js';

export const VOUCHER_STATUS_KEYS = Object.freeze(['active', 'frozen', 'void']);

export const VOUCHER_TAB_LABELS = Object.freeze({
  active: '已到账',
  frozen: '待到账',
  void: '已失效',
});

export const VOUCHER_EMPTY_TEXT = Object.freeze({
  active: '暂无已到账代金券',
  frozen: '暂无待到账代金券',
  void: '暂无已失效代金券',
});

const FUNDING_SOURCE_LABELS = Object.freeze({
  MERCHANT: '商家让利',
  PLATFORM_CAMPAIGN: '平台活动',
  PARTNER_CAMPAIGN: '合作活动',
});

function asCents(value) {
  const cents = Number(value);
  return Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0;
}

function parseTime(value) {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function formatCents(cents) {
  return (asCents(cents) / 100).toFixed(2);
}

export function formatMonthDay(value) {
  const time = parseTime(value);
  if (time === null) return '';
  const date = new Date(time);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function voucherStatusKey(reward, now = Date.now()) {
  const status = String(reward?.status ?? '').toUpperCase();
  const availableCents = asCents(reward?.availableAmountCents);
  const availableAt = parseTime(reward?.availableAt);
  if (status === 'EXPIRED' || status === 'REVERSED' || status === 'REDEEMED') return 'void';
  if (status === 'PENDING') return 'frozen';
  if (status === 'AVAILABLE') {
    if (availableCents < 1) return 'void';
    if (availableAt !== null && availableAt > now) return 'frozen';
    return 'active';
  }
  return 'void';
}

export function shapeVoucher(reward, now = Date.now()) {
  const statusKey = voucherStatusKey(reward, now);
  const orderId = typeof reward?.orderId === 'string' && reward.orderId ? reward.orderId : null;
  const availableDay = formatMonthDay(reward?.availableAt);
  const sourceLabel =
    FUNDING_SOURCE_LABELS[String(reward?.fundingSource ?? '')] ?? '消费奖励';
  const descParts = [];
  if (orderId) descParts.push(`订单#${orderId.slice(0, 12)}`);
  if (statusKey === 'active' && availableDay) descParts.push(`${availableDay} 到账`);
  if (statusKey === 'frozen') descParts.push('发放中 · 确认收货后按期自动到账');
  if (statusKey === 'void') descParts.push('已失效 · 按规则从资金池扣回');
  if (!descParts.length) descParts.push(sourceLabel);
  return {
    id: String(reward?.id ?? ''),
    statusKey,
    amountCents:
      statusKey === 'active'
        ? asCents(reward?.availableAmountCents)
        : asCents(reward?.grantedAmountCents),
    grantedAmountCents: asCents(reward?.grantedAmountCents),
    redeemedAmountCents: asCents(reward?.redeemedAmountCents),
    reversedAmountCents: asCents(reward?.reversedAmountCents),
    orderId,
    ruleVersion: typeof reward?.ruleVersion === 'string' ? reward.ruleVersion : '',
    fundingSourceLabel: sourceLabel,
    descLine: descParts.join(' · '),
    availableAt: reward?.availableAt ?? null,
    expiresAt: reward?.expiresAt ?? null,
    createdAt: reward?.createdAt ?? null,
  };
}

export function groupVouchers(rewards, now = Date.now()) {
  const grouped = { active: [], frozen: [], void: [] };
  for (const reward of Array.isArray(rewards) ? rewards : []) {
    const voucher = shapeVoucher(reward, now);
    grouped[voucher.statusKey].push(voucher);
  }
  return grouped;
}

export function summarizeVouchers(rewards, now = Date.now()) {
  const summary = { activeCents: 0, frozenCents: 0, voidCents: 0, totalCents: 0 };
  for (const reward of Array.isArray(rewards) ? rewards : []) {
    const voucher = shapeVoucher(reward, now);
    if (voucher.statusKey === 'active') summary.activeCents += voucher.amountCents;
    else if (voucher.statusKey === 'frozen') summary.frozenCents += voucher.amountCents;
    else summary.voidCents += voucher.redeemedAmountCents + voucher.reversedAmountCents;
    summary.totalCents += voucher.grantedAmountCents;
  }
  return summary;
}

export async function fetchLifeVouchers(session = lifeSession, limit = 100) {
  const rewards = await session.request(`/api/v1/life/rewards?limit=${limit}`);
  return Array.isArray(rewards) ? rewards : [];
}
