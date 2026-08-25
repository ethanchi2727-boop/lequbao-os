<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
import { baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const orders = ref([]);
const refunds = ref([]);

const completedCount = computed(
  () =>
    orders.value.filter((order) => ['COMPLETED', 'FULFILLED', 'CANCELLED'].includes(order.status))
      .length,
);
const progress = computed(() =>
  orders.value.length ? Math.round((completedCount.value / orders.value.length) * 100) : 0,
);
const progressStyle = computed(() => `--progress:${progress.value * 3.6}deg`);

async function load() {
  loading.value = true;
  error.value = false;
  try {
    [orders.value, refunds.value] = await Promise.all([
      baoSession.request('/api/v1/merchant-operations/orders?limit=30'),
      baoSession.request('/api/v1/merchant-operations/refunds?limit=30'),
    ]);
  } catch {
    error.value = true;
    orders.value = [];
    refunds.value = [];
  } finally {
    loading.value = false;
  }
}

onShow(load);
</script>

<template>
  <BaoSurface
    eyebrow="服务端任务同步"
    title="交付任务"
    detail="订单、履约、退款和核销任务按权限推进。"
  >
    <view class="m-progress-hero">
      <view
        ><text>总体进度</text><text>{{ orders.length ? `${progress}%` : '—' }}</text
        ><text>{{
          loading ? '正在同步任务' : `${orders.length + refunds.length} 项业务任务`
        }}</text></view
      >
      <view class="progress-ring" :style="progressStyle"
        ><text>{{ orders.length ? `${progress}%` : '—' }}</text></view
      >
    </view>

    <view class="m-section"
      ><text>执行轨迹</text><text>{{ orders.length + refunds.length }} 个任务</text></view
    >
    <view class="m-timeline">
      <view v-if="error" class="timeline-step active" @click="load"
        ><text>!</text
        ><view><text>等待员工身份确认</text><text>登录后读取当前门店的真实任务</text></view
        ><text>重试</text></view
      >
      <view v-else-if="!orders.length && !loading" class="timeline-step done"
        ><text>✓</text><view><text>当前没有待处理订单</text><text>服务端队列已同步</text></view
        ><text>完成</text></view
      >
      <view
        v-for="(order, index) in orders.slice(0, 4)"
        :key="order.id"
        :class="[
          'timeline-step',
          index < completedCount ? 'done' : index === completedCount ? 'active' : '',
        ]"
      >
        <text>{{ index < completedCount ? '✓' : index + 1 }}</text>
        <view
          ><text>{{ order.orderNo }}</text
          ><text
            >¥{{ (order.payableAmountCents / 100).toFixed(2) }} · {{ order.status }}</text
          ></view
        >
        <text>{{ index < completedCount ? '完成' : '处理中' }}</text>
      </view>
    </view>

    <view class="m-notice">✓ 关键动作需要人工确认，其他步骤由服务端任务继续推进。</view>
    <BaoTaskDirectory family="orders" />
  </BaoSurface>
</template>
