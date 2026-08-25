<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
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

function openLogin() {
  uni.switchTab({ url: '/pages/me/index' });
}

onShow(load);
</script>

<template>
  <BaoSurface
    eyebrow="在线 · 自动保存"
    title="乐趣宝 AI"
    detail="通过对话推进经营、交付和确认事项。"
  >
    <view v-if="today" class="m-context">
      <text>当前商户</text><text>{{ today.storeScope }}</text
      ><text>{{ today.todos.length }} 项</text>
    </view>
    <view v-else class="m-context">
      <text>当前商户</text><text>{{ loading ? '正在安全连接…' : '等待员工身份确认' }}</text
      ><text>—</text>
    </view>

    <view class="m-user">帮我把今天的经营与交付继续推进，需要我确认的单独列出来。</view>

    <view class="m-agent">
      <view class="m-agent-head"
        ><text>AI</text><text>乐趣宝 AI</text><text>{{ today ? '刚刚' : '待连接' }}</text></view
      >
      <text v-if="today" class="agent-title"
        >已整理今日经营，当前需要 {{ today.todos.length }} 项确认</text
      >
      <text v-else class="agent-title">{{
        loading ? '正在读取当前工作范围' : '登录后继续你的工作'
      }}</text>
      <text v-if="today">订单、履约和退款均来自服务端当前权限范围，关键动作仍需本人确认。</text>
      <text v-else>为了保护商户、金额和客户信息，本页不会在身份校验前展示经营数据。</text>
      <view class="m-result">
        <view
          ><text>自动完成</text><text>{{ today ? today.metrics.ordersCreated : '—' }}</text></view
        >
        <view
          ><text>等待确认</text><text>{{ today ? today.todos.length : '—' }}</text></view
        >
      </view>
      <button v-if="today?.todos.length" class="agent-action" @click="openTodo(today.todos[0])">
        打开第一项确认　›
      </button>
      <button v-else-if="error" class="agent-action" @click="openLogin">员工身份安全登录　›</button>
      <button v-else class="agent-action" disabled>正在连接服务端…</button>
    </view>

    <view class="m-composer"><text>＋</text><text>继续说或发资料…</text><text>↑</text></view>
    <BaoTaskDirectory family="delivery" />
  </BaoSurface>
</template>
