<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeVoucherNav from '../../../components/LifeVoucherNav.vue';
import { lifeRuntimeProfile, lifeSession } from '../../../services/life-session.js';
import {
  VOUCHER_EMPTY_TEXT,
  VOUCHER_TAB_LABELS,
  fetchLifeVouchers,
  formatCents,
  groupVouchers,
  summarizeVouchers,
} from '../../../services/life-vouchers.js';

const loading = ref(false);
const error = ref(null);
const rewards = ref([]);
const activeTab = ref('active');

const grouped = computed(() => groupVouchers(rewards.value));
const summary = computed(() => summarizeVouchers(rewards.value));
const tabKeys = Object.freeze(['active', 'frozen', 'void']);
const visibleVouchers = computed(() => grouped.value[activeTab.value] ?? []);

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

function switchTab(key) {
  activeTab.value = key;
}

onShow(load);
</script>

<template>
  <view class="voucher-wallet">
    <scroll-view scroll-y class="scroll" enhanced :show-scrollbar="false">
      <LifeVoucherNav title="我的代金券" />

      <view class="vhero">
        <view class="vhero-head">
          <view class="vhero-coin"></view>
          <view class="vhero-main">
            <text class="vhero-label">已到账金额</text>
            <text class="vhero-amount">¥{{ formatCents(summary.activeCents) }}</text>
          </view>
          <navigator class="vhero-rule" url="/pages/voucher/rule/index" hover-class="none"
            >规则说明 ›</navigator
          >
        </view>
        <view class="vhero-subs">
          <view class="vhero-sub">
            <text class="vhero-sub-label">待到账</text>
            <text class="vhero-sub-amount">¥{{ formatCents(summary.frozenCents) }}</text>
          </view>
          <view class="vhero-sub">
            <text class="vhero-sub-label">已失效</text>
            <text class="vhero-sub-amount">¥{{ formatCents(summary.voidCents) }}</text>
          </view>
        </view>
      </view>

      <view class="vtabs">
        <view
          v-for="key in tabKeys"
          :key="key"
          class="vtab"
          :class="{ on: activeTab === key }"
          :data-v="key"
          @click="switchTab(key)"
          >{{ VOUCHER_TAB_LABELS[key] }}</view
        >
      </view>

      <view v-if="loading" class="vempty"><text class="vempty-text">代金券加载中…</text></view>
      <view v-else-if="error" class="vempty" @click="load">
        <text class="vempty-text">加载失败，点击重试</text>
      </view>

      <template v-else>
        <view v-if="!visibleVouchers.length" class="vempty">
          <view class="vempty-ticket"></view>
          <text class="vempty-text">{{ VOUCHER_EMPTY_TEXT[activeTab] }}</text>
          <navigator class="vempty-go" url="/pages/life/index" open-type="switchTab" hover-class="none"
            >去逛逛 →</navigator
          >
        </view>
        <navigator
          v-for="voucher in visibleVouchers"
          :key="voucher.id"
          class="cpn"
          :class="{ 'cpn-frozen': voucher.statusKey === 'frozen', 'cpn-void': voucher.statusKey === 'void' }"
          :url="
            voucher.statusKey === 'frozen'
              ? '/pages/voucher/detail/index'
              : '/pages/mall/index'
          "
          :open-type="voucher.statusKey === 'frozen' ? 'navigate' : 'switchTab'"
          hover-class="none"
        >
          <view class="cl">
            <text class="cl-amount"><text class="cl-currency">¥</text>{{ formatCents(voucher.amountCents) }}</text>
            <text class="cl-cond">{{ voucher.statusKey === 'frozen' ? '分期发放' : '无门槛' }}</text>
          </view>
          <view class="cr">
            <text class="cr-title">通用代金券</text>
            <text class="cr-desc">{{ voucher.descLine }}</text>
            <text class="cuse" :class="{ 'cuse-gray': voucher.statusKey !== 'active' }">{{
              voucher.statusKey === 'frozen' ? '待到账' : voucher.statusKey === 'void' ? '已失效' : '去使用'
            }}</text>
          </view>
        </navigator>
      </template>

      <text class="vfootnote">代金券与人民币 1:1 等值 · 不可提现 · 可抵扣订单</text>
      <view class="vbottom-safe"></view>
    </scroll-view>
  </view>
</template>

<style scoped>
.voucher-wallet {
  --bg: #f6f1e6;
  --card: #ffffff;
  --ink: #16130f;
  --mut: #857c6d;
  --accent: #009146;
  --promo: #f03749;
  --line: rgba(22, 19, 15, 0.08);
  --notice-bg: #e6f3ea;
  --notice-tx: #0b6b3d;
  --shadow: 0 10px 26px rgba(22, 19, 15, 0.09);
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  display: flex;
  flex-direction: column;
}
.scroll {
  flex: 1;
  height: 100vh;
  background: linear-gradient(180deg, #ffe9c2 0px, var(--bg) 430px);
  box-sizing: border-box;
}
/* 绿色渐变头卡 */
.vhero {
  margin: 14px 14px 0;
  border-radius: 20px;
  padding: 20px 18px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: var(--shadow);
}
.vhero-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.vhero-coin {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  flex: none;
  position: relative;
}
.vhero-coin::after {
  content: '';
  position: absolute;
  left: 12px;
  top: 12px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2.2px solid #fff;
  box-sizing: border-box;
}
.vhero-main {
  display: flex;
  flex-direction: column;
}
.vhero-label {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.85;
}
.vhero-amount {
  font-size: 27px;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.vhero-rule {
  margin-left: auto;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  opacity: 0.9;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  padding: 5px 10px;
}
.vhero-subs {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.vhero-sub {
  flex: 1;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
}
.vhero-sub-label {
  font-size: 10px;
  font-weight: 700;
  opacity: 0.85;
}
.vhero-sub-amount {
  font-size: 15px;
  font-weight: 900;
}
/* 三栏切换 */
.vtabs {
  display: flex;
  margin: 12px 14px 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 4px;
}
.vtab {
  flex: 1;
  text-align: center;
  font-size: 12.5px;
  font-weight: 900;
  color: var(--mut);
  padding: 9px 0;
  border-radius: 11px;
  transition: 0.25s;
}
.vtab.on {
  color: var(--accent);
  background: var(--notice-bg);
}
/* 代金券卡 */
.cpn {
  display: flex;
  margin: 12px 14px 0;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.cpn-frozen,
.cpn-void {
  opacity: 0.55;
}
.cl {
  width: 104px;
  flex: none;
  background: linear-gradient(140deg, #ff8a5c, #f03749);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 6px;
}
.cpn-frozen .cl {
  background: linear-gradient(140deg, #f7b733, #d48806);
}
.cl-amount {
  font-size: 24px;
  font-weight: 900;
}
.cl-currency {
  font-size: 12px;
}
.cl-cond {
  font-size: 9px;
  font-weight: 800;
  opacity: 0.9;
  margin-top: 2px;
}
.cr {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--line);
  border-left: none;
  padding: 11px 12px;
  padding-right: 66px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.cr-title {
  font-size: 12.5px;
  font-weight: 900;
}
.cr-desc {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 3px;
}
.cuse {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 900;
  color: var(--promo);
  border: 1px solid var(--promo);
  border-radius: 999px;
  padding: 5px 11px;
}
.cuse-gray {
  color: var(--mut);
  border-color: var(--line);
}
/* 空态 */
.vempty {
  margin: 12px 14px 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 36px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.vempty-ticket {
  width: 44px;
  height: 32px;
  border-radius: 6px;
  border: 1.6px solid var(--mut);
  opacity: 0.4;
  position: relative;
}
.vempty-ticket::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 4px;
  bottom: 4px;
  border-left: 1.6px dashed var(--mut);
}
.vempty-text {
  font-size: 12px;
  font-weight: 800;
  color: var(--mut);
  margin-top: 10px;
}
.vempty-go {
  margin-top: 10px;
  font-size: 11.5px;
  font-weight: 900;
  color: var(--accent);
}
.vfootnote {
  display: block;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 16px;
}
.vbottom-safe {
  height: 26px;
}
</style>
