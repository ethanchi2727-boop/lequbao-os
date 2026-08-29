<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
import { baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const today = ref(null);

/* 概念稿 M1：分时段问候 */
const hour = new Date().getHours();
const greetWord = hour < 11 ? '早' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

const TODO_TICS = Object.freeze({
  MERCHANT_CONFIRM: '🛡️',
  REFUND: '💰',
  CUSTOMER_HANDOFF: '🎧',
  FULFILLMENT: '📦',
});
const TODO_HINTS = Object.freeze({
  MERCHANT_CONFIRM: '需要你本人确认后继续推进',
  REFUND: '退款待你确认，确认前不会执行',
  CUSTOMER_HANDOFF: '顾客等待人工接管，智能机器人已停发',
  FULFILLMENT: '履约环节待处理',
});

async function load() {
  if (!baoSession.load()) return;
  loading.value = true;
  error.value = false;
  try {
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

function openFirstTodo() {
  if (today.value?.todos.length) return openTodo(today.value.todos[0]);
  return uni.showToast({ title: '当前没有待确认事项', icon: 'none' });
}

function goDeep(pageId) {
  uni.navigateTo({ url: `/pages/detail/index?pageId=${pageId}` });
}

function goTab(url) {
  uni.switchTab({ url });
}

function openLogin() {
  uni.reLaunch({ url: '/pages/login/index' });
}

onShow(load);
</script>

<template>
  <BaoSurface
    eyebrow="在线 · 自动保存"
    title="乐趣宝"
    detail="通过对话推进经营、交付和确认事项。"
  >
    <!-- 问候 · 概念稿 M1 -->
    <view class="m-greet">
      <text>老板，{{ greetWord }}。</text>
      <text>今天想让我<text class="greet-hl">帮你干点啥</text>？</text>
    </view>

    <!-- 快捷意图 · 概念稿 chips -->
    <view class="m-chips">
      <text class="m-chip hot" @click="goDeep('page-180')">✦ 交付进度</text>
      <text class="m-chip" @click="goDeep('page-181')">确认协助</text>
      <text class="m-chip" @click="goTab('/pages/merchants/index')">看本月收益</text>
      <text class="m-chip" @click="goTab('/pages/service/index')">回复顾客</text>
    </view>

    <!-- 当前商户 · 概念稿深绿横幅 -->
    <view v-if="today" class="m-context">
      <text>当前商户</text><text>{{ today.storeScope }}</text
      ><text>{{ today.todos.length }} 项</text>
    </view>
    <view v-else class="m-context">
      <text>当前商户</text><text>{{ loading ? '正在安全连接…' : '等待员工身份确认' }}</text
      ><text>—</text>
    </view>

    <!-- 进行中 · 概念稿任务行 -->
    <view v-if="today?.todos.length" class="panel">
      <view class="panel-head"
        ><text>进行中 · {{ today.todos.length }}</text><text>全部 ›</text></view
      >
      <view class="task-list">
        <view
          v-for="(todo, index) in today.todos"
          :key="todo.title"
          class="task-row"
          @click="openTodo(todo)"
        >
          <text class="dir-tic">{{ TODO_TICS[todo.kind] ?? '📋' }}</text>
          <view
            ><text>{{ todo.title }}</text
            ><text>{{ TODO_HINTS[todo.kind] ?? '等你确认后继续推进' }}</text></view
          >
          <text :class="['dir-go', index === 0 ? 'solid' : '']">{{
            index === 0 ? '去处理' : '查看'
          }}</text>
        </view>
      </view>
    </view>

    <!-- 用户气泡 -->
    <view class="m-user">帮我把今天的经营与交付继续推进，需要我确认的单独列出来。</view>

    <!-- 小满 · 概念稿头像气泡 -->
    <view class="m-agent">
      <text class="m-avatar">小满</text>
      <view class="m-thread">
        <text class="m-who">小满 · {{ today ? '刚刚' : '待连接' }}</text>
        <view class="m-bubble">
          <text v-if="today" class="agent-title"
            >已整理今日经营，当前需要 {{ today.todos.length }} 项确认</text
          >
          <text v-else class="agent-title">{{
            loading ? '正在读取当前工作范围' : '登录后继续你的工作'
          }}</text>
          <text v-if="today">订单、履约和退款均来自服务端当前权限范围，关键动作仍需本人确认。</text>
          <text v-else>为了保护商户、金额和客户信息，本页不会在身份校验前展示经营数据。</text>
        </view>
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
        <button v-else-if="error" class="agent-action" @click="openLogin">手机一键登录　›</button>
        <button v-else class="agent-action" disabled>正在连接服务端…</button>
      </view>
    </view>

    <!-- 输入条 · 概念稿纸飞机发送钮 -->
    <view class="m-composer"
      ><text class="m-ph">说点什么，比如「整理今天要确认的事」</text><text class="m-send"></text
    ></view>

    <BaoTaskDirectory family="delivery" />
  </BaoSurface>
</template>
