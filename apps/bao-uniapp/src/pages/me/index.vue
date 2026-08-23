<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoRuntimeProfile, baoSession } from '../../services/bao-session.js';

const session = ref(null);
const context = ref(null);
const busy = ref(false);
const message = ref('');
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
  color: #fff;
  background: #5b50ed;
  border-radius: 999rpx;
  font-size: 25rpx;
  font-weight: 800;
}
.session-button.secondary {
  color: #5145cd;
  background: #ebe9ff;
}
.session-message {
  color: #737789;
  text-align: center;
  font-size: 21rpx;
}
</style>
