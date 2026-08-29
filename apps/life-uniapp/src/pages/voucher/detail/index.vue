<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeVoucherNav from '../../../components/LifeVoucherNav.vue';
import { lifeRuntimeProfile, lifeSession } from '../../../services/life-session.js';
import {
  fetchLifeVouchers,
  formatCents,
  shapeVoucher,
  summarizeVouchers,
} from '../../../services/life-vouchers.js';

const loading = ref(false);
const error = ref(null);
const rewards = ref([]);

const summary = computed(() => summarizeVouchers(rewards.value));
const records = computed(() =>
  (Array.isArray(rewards.value) ? rewards.value : []).map((reward) => shapeVoucher(reward)),
);

const STATUS_TONES = Object.freeze({
  active: Object.freeze({ bg: '#e6f3ea', fg: '#0b6b3d' }),
  frozen: Object.freeze({ bg: '#ffe9e6', fg: '#f03749' }),
  void: Object.freeze({ bg: '#eee', fg: '#857c6d' }),
});

function toneOf(statusKey) {
  return STATUS_TONES[statusKey] ?? STATUS_TONES.void;
}

function recordTitle(voucher) {
  return voucher.orderId ? `订单#${voucher.orderId.slice(0, 12)}` : voucher.fundingSourceLabel;
}

function recordDesc(voucher) {
  if (voucher.statusKey === 'frozen')
    return `获得代金券 ¥${formatCents(voucher.grantedAmountCents)} · 分期发放中`;
  if (voucher.statusKey === 'active')
    return `已到账 ¥${formatCents(voucher.amountCents)} · 下单可直接抵扣`;
  return '已失效 · 按规则从资金池扣回';
}

async function ensurePreviewSession() {
  if (lifeSession.load() || !lifeRuntimeProfile.developmentMocks) return;
  await lifeSession.exchange('WECHAT', 'development-preview-life-user-v1');
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    await ensurePreviewSession();
    rewards.value = await fetchLifeVouchers(lifeSession, 100);
  } catch (caught) {
    error.value = caught;
    rewards.value = [];
  } finally {
    loading.value = false;
  }
}

onShow(load);
</script>

<template>
  <view class="voucher-detail">
    <scroll-view scroll-y class="scroll" enhanced :show-scrollbar="false">
      <LifeVoucherNav title="代金券明细" />

      <view class="card vsum">
        <text class="vsum-label">累计获得代金券</text>
        <text class="vsum-total">¥{{ formatCents(summary.totalCents) }}</text>
        <view class="vsum-grid">
          <view class="vsum-cell">
            <text class="vsum-num vsum-active">¥{{ formatCents(summary.activeCents) }}</text>
            <text class="vsum-tag">已到账</text>
          </view>
          <view class="vsum-cell vsum-divided">
            <text class="vsum-num vsum-frozen">¥{{ formatCents(summary.frozenCents) }}</text>
            <text class="vsum-tag">待到账</text>
          </view>
          <view class="vsum-cell vsum-divided">
            <text class="vsum-num vsum-void">¥{{ formatCents(summary.voidCents) }}</text>
            <text class="vsum-tag">已使用/失效</text>
          </view>
        </view>
      </view>

      <view class="sec">
        <text class="sec-title">获得记录</text>
        <navigator class="sec-link" url="/pages/voucher/rule/index" hover-class="none"
          >规则说明 ›</navigator
        >
      </view>

      <view v-if="loading" class="card vrec-empty"><text class="vrec-empty-text">明细加载中…</text></view>
      <view v-else-if="error" class="card vrec-empty" @click="load">
        <text class="vrec-empty-text">加载失败，点击重试</text>
      </view>
      <view v-else-if="!records.length" class="card vrec-empty">
        <text class="vrec-empty-text">暂无代金券获得记录</text>
      </view>

      <view v-else class="card vrec-list">
        <view v-for="voucher in records" :key="voucher.id" class="vr">
          <view class="vic" :style="{ background: toneOf(voucher.statusKey).bg }">
            <view
              class="vic-dot"
              :style="{ borderColor: toneOf(voucher.statusKey).fg }"
            ></view>
          </view>
          <view class="vr-copy">
            <text class="vr-title">{{ recordTitle(voucher) }}</text>
            <text class="vr-desc">{{ recordDesc(voucher) }}</text>
          </view>
          <text class="vr-amount" :style="{ color: toneOf(voucher.statusKey).fg }"
            >¥{{ formatCents(voucher.grantedAmountCents) }}</text
          >
        </view>
      </view>

      <text class="vfootnote">代金券与人民币 1:1 等值 · 不可提现 · 可抵扣订单</text>
      <view class="vbottom-safe"></view>
    </scroll-view>
  </view>
</template>

<style scoped>
.voucher-detail {
  --bg: #f6f1e6;
  --card: #ffffff;
  --ink: #16130f;
  --mut: #857c6d;
  --accent: #009146;
  --promo: #f03749;
  --line: rgba(22, 19, 15, 0.08);
  --shadow: 0 10px 26px rgba(22, 19, 15, 0.09);
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}
.scroll {
  height: 100vh;
  background: linear-gradient(180deg, #dff0d4 0px, var(--bg) 430px);
  box-sizing: border-box;
}
.card {
  margin: 12px 14px 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 14px;
}
/* 汇总卡 */
.vsum {
  text-align: center;
  padding: 20px 14px;
}
.vsum-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--mut);
}
.vsum-total {
  font-size: 30px;
  font-weight: 900;
  color: var(--promo);
  display: block;
  margin-top: 4px;
}
.vsum-grid {
  display: flex;
  margin-top: 16px;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.vsum-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.vsum-divided {
  border-left: 1px solid var(--line);
}
.vsum-num {
  font-size: 16px;
  font-weight: 900;
}
.vsum-active {
  color: var(--accent);
}
.vsum-frozen {
  color: #d48806;
}
.vsum-void {
  color: var(--mut);
}
.vsum-tag {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 2px;
}
/* 小节标题 */
.sec {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 18px 18px 10px;
}
.sec-title {
  font-size: 15.5px;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.sec-link {
  font-size: 11px;
  font-weight: 800;
  color: var(--accent);
}
/* 记录列表 */
.vrec-list {
  padding-top: 4px;
  padding-bottom: 4px;
}
.vr {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
}
.vr:first-child {
  border-top: none;
}
.vic {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex: none;
}
.vic-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.2px solid;
  box-sizing: border-box;
}
.vr-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.vr-title {
  font-size: 13px;
  font-weight: 900;
}
.vr-desc {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 2px;
}
.vr-amount {
  font-size: 13px;
  font-weight: 900;
  flex: none;
}
.vrec-empty {
  padding: 30px 14px;
  text-align: center;
}
.vrec-empty-text {
  font-size: 12px;
  font-weight: 800;
  color: var(--mut);
}
.vfootnote {
  display: block;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 18px;
}
.vbottom-safe {
  height: 26px;
}
</style>
