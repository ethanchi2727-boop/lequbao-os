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
    eyebrow="在线 · 自动保存"
    title="乐趣宝 AI"
    detail="随手发一句话，AI 就把经营、交付和待确认事项继续往前推进。"
    ><view v-if="loading" class="panel empty-state">正在读取服务端经营数据…</view>
    <view v-else-if="error" class="panel empty-state" @click="load">登录后查看，或点此重试</view>
    <view v-if="today" class="current-context"
      ><view
        ><text>当前工作范围</text><text>{{ today.storeScope }}</text></view
      ><text>{{ today.todos.length }} 项待办</text></view
    ><view v-if="today" class="user-message"
      >先把今天需要处理的经营事项继续推进，关键动作再让我确认。</view
    >
    <view v-if="today" class="ai-card"
      ><view class="ai-head"
        ><text>AI</text><view><text>乐趣宝 AI</text><text>刚刚</text></view></view
      ><text class="ai-title">已整理今日经营，当前需要 {{ today.todos.length }} 类确认</text
      ><text class="ai-detail"
        >订单、履约和退款数据来自服务端当前权限范围；涉及金额、发布和退款的动作不会自动越过确认。</text
      ><view class="result-grid"
        ><view
          ><text>今日实收</text
          ><text>¥{{ (today.metrics.paidAmountCents / 100).toFixed(2) }}</text></view
        ><view
          ><text>今日订单</text><text>{{ today.metrics.ordersCreated }} 笔</text></view
        ><view
          ><text>待履约</text><text>{{ today.metrics.fulfillment }} 项</text></view
        ><view
          ><text>退款中</text><text>{{ today.metrics.refunds }} 项</text></view
        ></view
      ><button v-if="today.todos.length" @click="openTodo(today.todos[0])">
        打开第一项待办　›
      </button></view
    ><view v-if="today" class="panel trajectory"
      ><view class="panel-head"
        ><text>执行轨迹</text><text>{{ today.timezone }}</text></view
      ><view class="task-list"
        ><view
          v-for="(todo, index) in today.todos"
          :key="todo.kind"
          class="task"
          @click="openTodo(todo)"
          ><text :class="['step', index === 0 ? 'active' : '']">{{ index + 1 }}</text
          ><view
            ><text>{{ todo.label }}</text
            ><text>服务端权限范围内 {{ todo.count }} 项</text></view
          ><text :class="['status', ['URGENT', 'HIGH'].includes(todo.priority) ? 'warning' : '']">{{
            todo.priority
          }}</text></view
        ><view v-if="today.todos.length === 0" class="empty-state"
          >当前没有需要处理的异常</view
        ></view
      ></view
    ><view v-if="today" class="composer"
      ><text>继续说或发资料…</text><text>↑</text></view
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
.current-context {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  border-radius: 24rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
}
.current-context view {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.current-context view text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 18rpx;
}
.current-context view text:last-child {
  margin-top: 8rpx;
  font-size: 24rpx;
  font-weight: 800;
}
.current-context > text {
  color: var(--bao-mobile-jade-300);
  font-size: 22rpx;
  font-weight: 800;
}
.user-message {
  max-width: 78%;
  margin: 26rpx 0 22rpx auto;
  padding: 24rpx;
  border-radius: 28rpx 28rpx 8rpx 28rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-ink-900);
  font-size: 22rpx;
  line-height: 1.6;
}
.ai-card {
  padding: 24rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 28rpx;
  background: var(--bao-mobile-paper);
  box-shadow: 0 12rpx 32rpx rgba(17, 27, 25, 0.06);
}
.ai-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.ai-head > text {
  display: grid;
  place-items: center;
  width: 54rpx;
  height: 54rpx;
  border-radius: 18rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-ai);
  font-size: 21rpx;
  font-weight: 900;
}
.ai-head view {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.ai-head view text:first-child {
  font-size: 23rpx;
  font-weight: 800;
}
.ai-head view text:last-child {
  margin-top: 3rpx;
  color: var(--bao-mobile-ink-400);
  font-size: 17rpx;
}
.ai-title,
.ai-detail {
  display: block;
}
.ai-title {
  margin-top: 22rpx;
  font-size: 27rpx;
  font-weight: 900;
}
.ai-detail {
  margin-top: 10rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 20rpx;
  line-height: 1.6;
}
.result-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
  margin-top: 22rpx;
}
.result-grid view {
  display: flex;
  padding: 20rpx;
  border-radius: 18rpx;
  flex-direction: column;
  background: var(--bao-mobile-ink-50);
}
.result-grid view text:first-child {
  color: var(--bao-mobile-ink-500);
  font-size: 18rpx;
}
.result-grid view text:last-child {
  margin-top: 7rpx;
  font-size: 27rpx;
  font-weight: 900;
}
.ai-card button {
  width: 100%;
  margin-top: 20rpx;
  border-radius: 18rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 22rpx;
  font-weight: 800;
}
.trajectory {
  padding-bottom: 12rpx;
}
.step {
  display: grid;
  place-items: center;
  width: 52rpx;
  height: 52rpx;
  margin-right: 16rpx;
  border: 1rpx solid var(--bao-mobile-ink-200);
  border-radius: 17rpx;
  color: var(--bao-mobile-ink-500);
  background: var(--bao-mobile-paper);
  font-weight: 900;
}
.step.active {
  border: 0;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-ai);
}
.composer {
  display: flex;
  align-items: center;
  margin-top: 20rpx;
  padding: 12rpx 12rpx 12rpx 24rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 24rpx;
  color: var(--bao-mobile-ink-400);
  background: var(--bao-mobile-paper);
}
.composer text:first-child {
  flex: 1;
  font-size: 21rpx;
}
.composer text:last-child {
  display: grid;
  place-items: center;
  width: 62rpx;
  height: 62rpx;
  border-radius: 20rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  font-size: 30rpx;
  font-weight: 900;
}
</style>
