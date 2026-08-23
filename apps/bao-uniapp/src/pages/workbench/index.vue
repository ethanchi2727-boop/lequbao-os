<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoRuntimeProfile, baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const today = ref(null);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    if (!baoSession.load() && baoRuntimeProfile.developmentMocks)
      await baoSession.exchange('development-preview-bao-employee-v1');
    today.value = await baoSession.request('/api/v1/operational-home/today');
  } catch {
    error.value = true;
    today.value = null;
  } finally {
    loading.value = false;
  }
}
function openTodo(todo) {
  const destination =
    todo.kind === 'CUSTOMER_HANDOFF'
      ? '/pages/service/index'
      : ['REFUND', 'FULFILLMENT'].includes(todo.kind)
        ? '/pages/orders/index'
        : '';
  if (destination) return uni.switchTab({ url: destination });
  return uni.showToast({ title: '请在 PC 经营中心处理', icon: 'none' });
}
onShow(load);
</script>
<template>
  <BaoSurface
    eyebrow="今日经营"
    title="晚上好，开始今天的工作"
    detail="PC 是完整经营中心，移动端聚焦随时处理、确认和接管。"
    ><view v-if="loading" class="panel empty-state">正在读取服务端经营数据…</view>
    <view v-else-if="error" class="panel empty-state" @click="load">登录后查看，或点此重试</view>
    <view v-if="today" class="panel"
      ><view class="panel-head"
        ><text>今日经营</text><text>{{ today.timezone }} · {{ today.storeScope }}</text></view
      ><view class="metrics"
        ><view class="metric"
          ><text>今日实收</text
          ><text>¥{{ (today.metrics.paidAmountCents / 100).toFixed(2) }}</text></view
        ><view class="metric"
          ><text>订单</text><text>{{ today.metrics.ordersCreated }}</text></view
        ><view class="metric"
          ><text>待履约</text><text>{{ today.metrics.fulfillment }}</text></view
        ><view class="metric"
          ><text>退款中</text><text>{{ today.metrics.refunds }}</text></view
        ></view
      ></view
    ><view v-if="today" class="panel"
      ><view class="panel-head"
        ><text>需要你处理</text><text>{{ today.todos.length }} 类待办</text></view
      ><view class="task-list"
        ><view v-for="todo in today.todos" :key="todo.kind" class="task" @click="openTodo(todo)"
          ><view
            ><text>{{ todo.label }}</text
            ><text>服务端权限范围内 {{ todo.count }} 项</text></view
          ><text
            :class="[
              'status',
              todo.priority === 'URGENT' || todo.priority === 'HIGH' ? 'warning' : '',
            ]"
            >{{ todo.priority }}</text
          ></view
        ><view v-if="today.todos.length === 0" class="empty-state"
          >当前没有需要处理的异常</view
        ></view
      ></view
    ></BaoSurface
  >
</template>
<style scoped>
.empty-state {
  padding: 44rpx 22rpx;
  color: #737789;
  text-align: center;
  font-size: 23rpx;
}
</style>
