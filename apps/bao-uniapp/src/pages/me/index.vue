<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoRuntimeProfile, baoSession } from '../../services/bao-session.js';

const session = ref(null);
const context = ref(null);
const busy = ref(false);
const message = ref('');
const targetTenantId = ref('');
async function loadContext() {
  session.value = baoSession.load();
  if (!session.value) {
    context.value = null;
    return;
  }
  try {
    context.value = await baoSession.request('/api/v1/context');
  } catch {
    context.value = null;
  }
}
onShow(loadContext);
async function login() {
  busy.value = true;
  message.value = '';
  try {
    session.value = baoRuntimeProfile.developmentMocks
      ? await baoSession.exchange('development-preview-bao-employee-v1')
      : await baoSession.loginWithWecom();
    await loadContext();
    message.value = '员工身份登录成功';
  } catch {
    message.value = '企业身份登录失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}
async function logout() {
  busy.value = true;
  try {
    await baoSession.logout();
    message.value = '工作会话已安全退出';
  } catch {
    message.value = '服务端注销失败，本机凭证已清除';
  } finally {
    session.value = null;
    context.value = null;
    busy.value = false;
  }
}
async function switchTenant() {
  if (!/^[0-9a-f-]{36}$/iu.test(targetTenantId.value)) {
    message.value = '请输入邀请链接或管理员提供的组织 ID';
    return;
  }
  busy.value = true;
  message.value = '正在验证目标组织成员关系…';
  try {
    session.value = await baoSession.switchTenant(targetTenantId.value);
    targetTenantId.value = '';
    await loadContext();
    message.value = '已按新组织权限重新加载';
  } catch {
    message.value = '切换失败，当前工作会话保持不变';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BaoSurface
    eyebrow="员工身份"
    title="我的工作空间"
    detail="租户、门店、角色和数据范围由服务端最终裁决。"
    ><view class="panel"
      ><view class="panel-head"
        ><text>当前身份</text><text>{{ context ? '服务端已确认' : '未登录' }}</text></view
      ><view class="task-list"
        ><view v-if="context" class="task"
          ><view
            ><text>员工 {{ context.userId.slice(0, 8) }}…</text
            ><text
              >{{ context.roleCodes.join(' · ') }} /
              {{ context.storeIds.length || '租户级' }} 门店范围</text
            ></view
          ><text class="status">在线</text></view
        ><button v-if="context" class="session-button secondary" :loading="busy" @click="logout">
          退出工作会话</button
        ><button v-else class="session-button" :loading="busy" @click="login">
          企业微信安全登录
        </button>
        <text v-if="message" class="session-message">{{ message }}</text>
        ></view
      ></view
    ><view v-if="context" class="panel"
      ><view class="panel-head"><text>切换工作空间</text><text>服务端重新授权</text></view
      ><view class="tenant-switch"
        ><text>输入管理员或邀请链接提供的组织 ID；本页不会枚举其他租户。</text
        ><input v-model.trim="targetTenantId" type="text" placeholder="目标组织 ID" />
        <button class="session-button" :loading="busy" @click="switchTenant">
          验证并切换
        </button></view
      ></view
    ><view class="panel"
      ><view class="panel-head"><text>安全与设置</text><text>审计记录</text></view
      ><view class="task-list"
        ><view class="task"
          ><view><text>数据范围</text><text>仅显示当前租户与授权门店</text></view></view
        ><view class="task"
          ><view><text>关键操作确认</text><text>金额、退款、发布需再次确认</text></view></view
        ></view
      ></view
    ></BaoSurface
  >
</template>
<style scoped>
.session-button {
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  border-radius: 999rpx;
  font-size: 25rpx;
  font-weight: 800;
}
.session-button.secondary {
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
}
.session-message {
  color: var(--bao-mobile-ink-500);
  text-align: center;
  font-size: 21rpx;
}
.tenant-switch {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 22rpx;
}
.tenant-switch input {
  height: 76rpx;
  padding: 0 24rpx;
  border: 2rpx solid var(--bao-mobile-line);
  border-radius: 18rpx;
  color: var(--bao-mobile-ink-900);
  background: var(--bao-mobile-paper);
}
</style>
