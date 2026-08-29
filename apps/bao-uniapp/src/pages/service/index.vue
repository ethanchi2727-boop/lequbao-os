<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
import { baoSession } from '../../services/bao-session.js';
import {
  priorityLabel,
  riskLevelLabel,
  taskTypeLabel,
} from '../../services/display-labels.js';

const loading = ref(false);
const error = ref(false);
const conversations = ref([]);
const tasks = ref([]);
const stores = ref([]);
const acceptingId = ref('');
const completingTaskId = ref('');

async function load() {
  loading.value = true;
  error.value = false;
  try {
    [conversations.value, tasks.value, stores.value] = await Promise.all([
      baoSession.request('/api/v1/customer-service/conversations?status=HUMAN_QUEUED'),
      baoSession
        .request('/api/v1/customer-service-operations/tasks')
        .then((items) => items.filter((item) => ['OPEN', 'ASSIGNED'].includes(item.status))),
      baoSession.request('/api/v1/merchant-operations/stores').catch(() => []),
    ]);
  } catch {
    error.value = true;
    conversations.value = [];
    tasks.value = [];
    stores.value = [];
  } finally {
    loading.value = false;
  }
}

async function acceptConversation(conversation) {
  if (acceptingId.value) return;
  acceptingId.value = conversation.id;
  try {
    await baoSession.request(
      `/api/v1/customer-service/conversations/${conversation.id}/actions/accept`,
      {
        method: 'POST',
        data: {},
        header: { 'Idempotency-Key': `bao-accept-${conversation.id}-${Date.now().toString(36)}` },
      },
    );
    uni.showToast({ title: '已接管会话', icon: 'success' });
    await load();
  } catch (actionError) {
    uni.showToast({
      title: actionError?.code === 'CONCURRENT_UPDATE' ? '已被其他员工接管' : '接管失败，请重试',
      icon: 'none',
    });
    await load();
  } finally {
    acceptingId.value = '';
  }
}

async function confirmTaskCompletion(task) {
  if (completingTaskId.value) return;
  const confirmation = await uni.showModal({
    title: '确认完成任务',
    content: '确认已完成实际处理并关闭该任务？此操作会写入审计记录。',
    confirmText: '确认完成',
  });
  if (!confirmation.confirm) return;
  completingTaskId.value = task.id;
  try {
    await baoSession.request(
      `/api/v1/customer-service-operations/tasks/${task.id}/actions/complete`,
      {
        method: 'POST',
        data: { expectedVersion: task.version, resolutionCode: 'COMPLETED_IN_MOBILE_WORKBENCH' },
        header: { 'Idempotency-Key': `bao-task-complete-${task.id}-${task.version}` },
      },
    );
    uni.showToast({ title: '任务已完成', icon: 'success' });
    await load();
  } catch {
    uni.showToast({ title: '状态已变化，请刷新重试', icon: 'none' });
    await load();
  } finally {
    completingTaskId.value = '';
  }
}

function storeNameOf(storeId) {
  return stores.value.find((store) => store.id === storeId)?.storeName ?? '授权门店';
}

onShow(load);
</script>

<template>
  <BaoSurface eyebrow="AI 客服 · 人工接管" title="消息中心" detail="风险和复杂问题及时交给员工。">
    <view class="m-context"
      ><text>待处理消息</text
      ><text>{{
        error ? '等待员工身份确认' : `${conversations.length} 个会话 · ${tasks.length} 项任务`
      }}</text
      ><text>{{ loading ? '…' : conversations.length + tasks.length }}</text></view
    >

    <view class="panel">
      <view class="panel-head"
        ><text>人工接管队列</text><text>{{ conversations.length }} 个</text></view
      >
      <view class="task-list">
        <view v-if="error" class="empty-state" @click="load">登录后查看，或点此重试</view>
        <view v-else-if="!conversations.length && !loading" class="empty-state"
          >当前没有待接管会话</view
        >
        <view v-for="conversation in conversations" :key="conversation.id" class="task-row">
          <text class="dir-tic">🎧</text>
          <view
            ><text>{{ storeNameOf(conversation.storeId) }} · 顾客待人工</text
            ><text
              >{{ riskLevelLabel(conversation.riskLevel) }}风险 · 智能机器人已停发，等待接管</text
            ></view
          >
          <button
            class="row-action"
            :loading="acceptingId === conversation.id"
            :disabled="Boolean(acceptingId)"
            @click="acceptConversation(conversation)"
          >
            接管
          </button>
        </view>
      </view>
    </view>

    <view v-if="tasks.length" class="panel">
      <view class="panel-head"
        ><text>客户服务任务</text><text>{{ tasks.length }} 项</text></view
      >
      <view class="task-list">
        <view v-for="task in tasks" :key="task.id" class="task-row">
          <view
            ><text>{{ task.summary || taskTypeLabel(task.taskType) }}</text
            ><text
              >{{ task.storeName || storeNameOf(task.storeId) }} · {{ priorityLabel(task.priority) }}优先级</text
            ></view
          >
          <button
            class="row-action secondary"
            :loading="completingTaskId === task.id"
            :disabled="Boolean(completingTaskId)"
            @click="confirmTaskCompletion(task)"
          >
            完成
          </button>
        </view>
      </view>
    </view>

    <BaoTaskDirectory family="service" />
  </BaoSurface>
</template>
