<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
import { baoSession } from '../../services/bao-session.js';
import { profileStatusLabel, storeStatusLabel } from '../../services/display-labels.js';

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
  <BaoSurface eyebrow="本月经营" title="商务中心" detail="商户归属、服务状态、成本扣除和月结证据。">
    <view class="income-hero">
      <text>本月预计商务收益</text>
      <text>{{ revenue ? `¥${money(revenue.distributableCents)}` : '—' }}</text>
      <view class="income-meta">
        <text>{{
          revenue
            ? `实际到账 ¥${money(revenue.receiptCents)}`
            : loading
              ? '正在读取权威数据'
              : '登录后查看'
        }}</text>
        <text>{{ revenue ? `${revenue.attentionCount} 项待确认` : '待财务锁定' }}</text>
      </view>
      <view class="income-bars"
        ><text></text><text></text><text></text><text></text><text></text
      ></view>
    </view>

    <view class="m-stats">
      <view
        ><text>持续商户</text><text>{{ profile ? stores.length : '—' }}</text
        ><text>当前权限范围</text></view
      >
      <view
        ><text>待跟进</text><text>{{ revenue ? revenue.attentionCount : '—' }}</text
        ><text>{{ profile ? profileStatusLabel(profile.status) : '服务端确认' }}</text></view
      >
    </view>

    <view class="m-section"><text>今天先做</text><text>全部</text></view>
    <view v-if="error" class="m-action-card" @click="load">
      <text>AI</text
      ><view><text>登录后查看经营提醒</text><text>商户和收益数据不会在身份校验前展示</text></view
      ><text>›</text>
    </view>
    <template v-else-if="revenue">
      <view class="m-action-card"
        ><text>AI</text
        ><view
          ><text>{{ revenue.attentionCount }} 项经营事项需要跟进</text
          ><text>AI 已按服务端事实整理优先级</text></view
        ><text>›</text></view
      >
      <view class="m-action-card"
        ><text class="warning">时</text
        ><view><text>月结证据等待核对</text><text>成本、退款和到账以锁定结果为准</text></view
        ><text>›</text></view
      >
    </template>
    <view v-else class="m-action-card"
      ><text>AI</text
      ><view><text>正在整理当前经营范围</text><text>只读取已授权商户和门店</text></view
      ><text>›</text></view
    >

    <view v-if="stores.length" class="panel">
      <view class="panel-head"
        ><text>我的商户</text><text>{{ stores.length }} 家已确权</text></view
      >
      <view class="task-list">
        <view v-for="store in stores.slice(0, 5)" :key="store.id" class="task-row">
          <view
            ><text>{{ store.storeName }}</text
            ><text
              >{{ store.regionCodes.join(' / ') || '区域待完善' }} · 版本 {{ store.version }}</text
            ></view
          >
          <text :class="['status-chip', store.status !== 'ACTIVE' ? 'warning' : '']">{{
            storeStatusLabel(store.status)
          }}</text>
        </view>
      </view>
    </view>

    <BaoTaskDirectory family="revenue" />
  </BaoSurface>
</template>
