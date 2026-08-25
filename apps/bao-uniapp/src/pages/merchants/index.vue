<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const profile = ref(null);
const stores = ref([]);
const revenue = ref(null);
const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
async function load() {
  loading.value = true;
  error.value = false;
  try {
    [profile.value, stores.value, revenue.value] = await Promise.all([
      baoSession.request('/api/v1/merchant-operations/profile'),
      baoSession.request('/api/v1/merchant-operations/stores'),
      baoSession
        .request(`/api/v1/revenue-operations/summary?periodStart=${monthStart}`)
        .catch(() => null),
    ]);
  } catch {
    error.value = true;
    profile.value = null;
    stores.value = [];
    revenue.value = null;
  } finally {
    loading.value = false;
  }
}
onShow(load);
</script>
<template>
  <BaoSurface
    eyebrow="商户与收益"
    title="商务中心"
    detail="把商户归属、服务状态、成本扣除和月结证据放进一部手机。"
    ><view v-if="loading" class="panel empty-state">正在读取权限范围内的商户资料…</view>
    <view v-else-if="error" class="panel empty-state" @click="load">登录后查看，或点此重试</view>
    <view v-if="revenue" class="income-hero"
      ><text>本月可分配净收入</text><text>¥{{ money(revenue.distributableCents) }}</text
      ><view
        ><text>实际到账 ¥{{ money(revenue.receiptCents) }}</text
        ><text>{{ revenue.attentionCount }} 项待确认</text></view
      ><view class="trend"
        ><text></text><text></text><text></text><text></text><text></text></view></view
    ><view v-if="profile" class="summary-grid"
      ><view
        ><text>持续门店</text><text>{{ stores.length }}</text
        ><text>当前权限范围</text></view
      ><view
        ><text>主体状态</text><text>{{ profile.status }}</text
        ><text>服务端已确认</text></view
      ></view
    ><view v-if="revenue" class="panel formula"
      ><view
        ><text>实际到账</text><text>¥{{ money(revenue.receiptCents) }}</text></view
      ><text>−</text
      ><view
        ><text>退款</text><text>¥{{ money(revenue.refundCents) }}</text></view
      ><text>−</text
      ><view
        ><text>直接成本</text><text>¥{{ money(revenue.directCostCents) }}</text></view
      ></view
    ><view v-if="profile" class="panel merchants-card"
      ><view class="panel-head"
        ><text>我的商户</text><text>{{ stores.length }} 家授权门店</text></view
      ><view class="search-box">搜索商户、行业或任务</view
      ><view class="task-list"
        ><view v-for="store in stores" :key="store.id" class="task"
          ><text class="merchant-avatar">{{ store.storeName.slice(0, 1) }}</text
          ><view
            ><text>{{ store.storeName }}</text
            ><text
              >{{ store.regionCodes.join(' / ') || '区域待完善' }} · 版本 {{ store.version }}</text
            ></view
          ><text :class="['merchant-state', store.status !== 'ACTIVE' ? 'warning' : '']"
            >{{ store.status }}　›</text
          ></view
        ><view v-if="stores.length === 0" class="empty-state">当前权限范围内没有门店</view> ></view
      ></view
    ><view v-if="profile && !revenue" class="safe-note"
      >当前身份没有收益报表权限；商户资料仍按服务端门店范围展示。</view
    ></BaoSurface
  >
</template>
<style scoped>
.empty-state {
  padding: 44rpx 22rpx;
  color: var(--bao-mobile-ink-500);
  text-align: center;
  font-size: 23rpx;
}
.income-hero {
  position: relative;
  min-height: 260rpx;
  padding: 30rpx;
  overflow: hidden;
  border-radius: 30rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
}
.income-hero > text,
.income-hero > view {
  display: flex;
}
.income-hero > text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 19rpx;
}
.income-hero > text:nth-child(2) {
  margin-top: 20rpx;
  font-size: 48rpx;
  font-weight: 900;
}
.income-hero > view:nth-child(3) {
  gap: 30rpx;
  margin-top: 12rpx;
  color: var(--bao-mobile-jade-200);
  font-size: 18rpx;
}
.trend {
  position: absolute;
  right: 20rpx;
  bottom: 24rpx;
  left: 20rpx;
  height: 72rpx;
  align-items: end;
  gap: 10rpx;
}
.trend text {
  flex: 1;
  border-radius: 999rpx 999rpx 0 0;
  background: var(--bao-mobile-jade-400);
}
.trend text:nth-child(1) {
  height: 18rpx;
}
.trend text:nth-child(2) {
  height: 34rpx;
}
.trend text:nth-child(3) {
  height: 27rpx;
}
.trend text:nth-child(4) {
  height: 50rpx;
}
.trend text:nth-child(5) {
  height: 66rpx;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14rpx;
  margin-top: 16rpx;
}
.summary-grid view {
  display: flex;
  padding: 22rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 22rpx;
  flex-direction: column;
  background: var(--bao-mobile-paper);
}
.summary-grid view text:first-child,
.summary-grid view text:last-child {
  color: var(--bao-mobile-ink-500);
  font-size: 18rpx;
}
.summary-grid view text:nth-child(2) {
  margin: 9rpx 0 5rpx;
  font-size: 32rpx;
  font-weight: 900;
}
.formula {
  display: flex;
  align-items: center;
  padding: 22rpx 10rpx;
}
.formula > view {
  display: flex;
  flex: 1;
  flex-direction: column;
  text-align: center;
}
.formula > view text:first-child {
  color: var(--bao-mobile-ink-500);
  font-size: 17rpx;
}
.formula > view text:last-child {
  margin-top: 7rpx;
  font-size: 20rpx;
  font-weight: 800;
}
.formula > text {
  color: var(--bao-mobile-ink-300);
}
.search-box {
  margin-bottom: 18rpx;
  padding: 20rpx 24rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 20rpx;
  color: var(--bao-mobile-ink-400);
  font-size: 20rpx;
}
.merchant-avatar {
  display: grid;
  place-items: center;
  width: 62rpx;
  height: 62rpx;
  margin-right: 16rpx;
  border-radius: 19rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-weight: 900;
}
.merchant-state {
  margin-left: 12rpx;
  color: var(--bao-mobile-jade-700);
  font-size: 19rpx;
}
.merchant-state.warning {
  color: var(--bao-mobile-warning-700);
}
.safe-note {
  margin-top: 18rpx;
  padding: 22rpx;
  border-radius: 20rpx;
  color: var(--bao-mobile-ink-600);
  background: var(--bao-mobile-warning-100);
  font-size: 20rpx;
  line-height: 1.55;
}
</style>
