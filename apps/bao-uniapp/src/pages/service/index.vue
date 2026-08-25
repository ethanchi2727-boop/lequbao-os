<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const conversations = ref([]);
const tasks = ref([]);
const acceptingId = ref('');
const completingTaskId = ref('');
async function load() {
  loading.value = true;
  error.value = false;
  try {
    [conversations.value, tasks.value] = await Promise.all([
      baoSession.request('/api/v1/customer-service/conversations?status=HUMAN_QUEUED'),
      baoSession
        .request('/api/v1/customer-service-operations/tasks')
        .then((items) => items.filter((item) => ['OPEN', 'ASSIGNED'].includes(item.status))),
    ]);
  } catch {
    error.value = true;
    conversations.value = [];
    tasks.value = [];
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
        header: {
          'Idempotency-Key': `bao-accept-${conversation.id}-${Date.now().toString(36)}`,
        },
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
        header: {
          'Idempotency-Key': `bao-task-complete-${task.id}-${task.version}`,
        },
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
onShow(load);
</script>
<template>
  <BaoSurface
    eyebrow="AI 客服"
    title="需要人工接管的会话"
    detail="AI 先处理，风险和复杂问题及时交给员工。"
    ><view v-if="loading" class="panel empty-state">正在读取人工队列…</view>
    <view v-else-if="error" class="panel empty-state" @click="load">登录后查看，或点此重试</view>
    <view v-if="!error" class="panel"
      ><view class="panel-head"
        ><text>人工接管队列</text><text>{{ conversations.length }} 个</text></view
      ><view class="task-list"
        ><view v-for="conversation in conversations" :key="conversation.id" class="task"
          ><view
            ><text>会话 {{ conversation.id.slice(0, 8) }}…</text
            ><text
              >门店 {{ conversation.storeId.slice(0, 8) }}… ·
              {{ conversation.riskLevel || 'NORMAL' }}</text
            ></view
          ><button
            class="takeover-button"
            :loading="acceptingId === conversation.id"
            :disabled="Boolean(acceptingId)"
            @click="acceptConversation(conversation)"
          >
            接管
          </button></view
        ><view v-if="conversations.length === 0" class="empty-state">当前没有待接管会话</view>
        ></view
      ></view
    ><view v-if="tasks.length" class="panel"
      ><view class="panel-head"
        ><text>客户服务任务</text><text>{{ tasks.length }} 项</text></view
      ><view class="task-list"
        ><view v-for="task in tasks" :key="task.id" class="task"
          ><view
            ><text>{{ task.summary || task.taskType || '客户服务任务' }}</text
            ><text
              >{{ task.storeName || task.storeId }} · {{ task.priority || 'NORMAL' }}</text
            ></view
          ><button
            class="complete-button"
            :loading="completingTaskId === task.id"
            :disabled="Boolean(completingTaskId)"
            @click="confirmTaskCompletion(task)"
          >
            完成
          </button></view
        ></view
      ></view
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
.takeover-button {
  min-width: 112rpx;
  margin: 0 0 0 18rpx;
  padding: 2rpx 20rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 52rpx;
}
.complete-button {
  min-width: 112rpx;
  margin: 0 0 0 18rpx;
  padding: 2rpx 20rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 52rpx;
}
.takeover-button[disabled],
.complete-button[disabled] {
  opacity: 0.55;
}
</style>
