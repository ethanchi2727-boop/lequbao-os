<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
import { baoSession } from '../../services/bao-session.js';
import { roleLabel } from '../../services/display-labels.js';

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

function gotoPhoneLogin() {
  uni.reLaunch({ url: '/pages/login/index' });
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
    message.value = '请输入邀请链接或管理员提供的组织编号';
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

onShow(loadContext);
</script>

<template>
  <BaoSurface
    eyebrow="员工身份 · 安全会话"
    title="我的"
    detail="租户、门店、角色和数据范围由服务端裁决。"
  >
    <view class="m-context"
      ><text>当前工作空间</text
      ><text>{{ context ? `${roleLabel(context.roleCodes[0])} · 身份已核验` : '尚未登录' }}</text
      ><text>{{ context ? '在线' : '—' }}</text></view
    >

    <view class="panel">
      <view class="panel-head"
        ><text>当前身份</text><text>{{ context ? '服务端已确认' : '未登录' }}</text></view
      >
      <view class="task-list">
        <view v-if="context" class="task-row"
          ><view
            ><text>{{ context.roleCodes.map(roleLabel).join(' · ') }}</text
            ><text>{{ context.storeIds.length ? `${context.storeIds.length} 家门店在授权范围` : '租户级范围' }}</text></view
          ><text class="status-chip">在线</text></view
        >
        <button v-if="context" class="m-primary" :loading="busy" @click="logout">
          退出工作会话
        </button>
        <button v-else class="m-primary" :loading="busy" @click="gotoPhoneLogin">
          手机一键登录
        </button>
        <text v-if="message" class="session-note">{{ message }}</text>
      </view>
    </view>

    <view v-if="context" class="panel">
      <view class="panel-head"><text>切换工作空间</text><text>服务端重新授权</text></view>
      <view class="form-stack"
        ><text>输入管理员或邀请链接提供的组织编号；本页不会枚举其他租户。</text
        ><input
          v-model.trim="targetTenantId"
          class="form-input"
          type="text"
          placeholder="目标组织编号"
        /><button class="m-primary" :loading="busy" @click="switchTenant">验证并切换</button></view
      >
    </view>

    <view class="panel">
      <view class="panel-head"><text>安全与设置</text><text>审计记录</text></view>
      <view class="task-list"
        ><view class="task-row"
          ><view><text>数据范围</text><text>仅显示当前租户与授权门店</text></view
          ><text>›</text></view
        ><view class="task-row"
          ><view><text>关键操作确认</text><text>金额、退款、发布需再次确认</text></view
          ><text>›</text></view
        ></view
      >
    </view>

    <BaoTaskDirectory family="identity" />
  </BaoSurface>
</template>
