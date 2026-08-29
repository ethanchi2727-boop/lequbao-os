<script setup>
import { computed, ref } from 'vue';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoRuntimeProfile, baoSession } from '../../services/bao-session.js';

const MOCK_ASSERTION = 'development-mock-assertion-for-local-workspace';
const PHONE_PATTERN = /^1[3-9]\d{9}$/u;

const phone = ref('');
const agreed = ref(false);
const busy = ref(false);
const message = ref('');
const failed = ref(false);

const phoneValid = computed(() => PHONE_PATTERN.test(phone.value.trim()));
const canSubmit = computed(() => phoneValid.value && agreed.value && !busy.value);

function toast(text) {
  if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
    uni.showToast({ title: text, icon: 'none' });
  }
}

async function oneTapLogin() {
  message.value = '';
  failed.value = false;
  if (!phoneValid.value) {
    message.value = '请输入有效的手机号';
    failed.value = true;
    return;
  }
  if (!agreed.value) {
    message.value = '请先阅读并同意服务条款与隐私政策';
    failed.value = true;
    return;
  }
  busy.value = true;
  try {
    const assertion = baoRuntimeProfile.developmentMocks ? MOCK_ASSERTION : '';
    if (!assertion) {
      message.value = '运营商一键认证未对接，请在开发预览模式下使用';
      failed.value = true;
      return;
    }
    await baoSession.loginWithPhone(assertion);
    toast('手机一键登录成功');
    uni.reLaunch({ url: '/pages/workbench/index' });
  } catch (error) {
    failed.value = true;
    message.value =
      error?.code === 'PHONE_OTP_ASSERTION_REQUIRED'
        ? '登录凭证缺失，请重试'
        : '一键登录失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

function toggleAgreement() {
  agreed.value = !agreed.value;
}
</script>

<template>
  <BaoSurface
    eyebrow="员工身份 · 手机一键登录"
    title="乐趣宝"
    detail="使用本机手机号安全登录，仅用于员工工作会话。"
  >
    <view class="login-hero">
      <text class="login-hero-eyebrow">乐趣宝 AI · 工作台</text>
      <text class="login-hero-title">手机一键登录</text>
      <text class="login-hero-detail"
        >使用本机手机号完成员工身份核验，验证码未对接前先使用开发模拟凭证。</text
      >
    </view>

    <view class="panel">
      <view class="panel-head"><text>手机号</text><text>运营商一键认证</text></view>
      <view class="login-form">
        <input
          v-model="phone"
          class="form-input"
          type="number"
          maxlength="11"
          placeholder="请输入手机号"
          :adjust-position="false"
        />
        <text class="login-meta">{{
          phoneValid ? '已识别为有效手机号' : '请输入 11 位手机号'
        }}</text>
        <button class="m-primary" :loading="busy" :disabled="!canSubmit" @click="oneTapLogin">
          {{ busy ? '正在安全连接…' : '一键登录' }}
        </button>
        <view class="login-agreement" @click="toggleAgreement">
          <text class="login-checkbox" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</text>
          <text class="login-agreement-text"
            >我已阅读并同意《员工服务条款》《隐私政策》《数据范围与审计说明》</text
          >
        </view>
        <text v-if="message" class="session-note" :class="{ failed }">{{ message }}</text>
      </view>
    </view>

    <view class="panel">
      <view class="panel-head"><text>安全说明</text><text>员工会话</text></view>
      <view class="guardrail">
        <text>仅限被授权的员工使用</text>
        <text
          >本机手机号仅用于身份核验，关键操作仍需二次确认；金额、退款、发布等敏感动作不会自动执行。</text
        >
      </view>
    </view>
  </BaoSurface>
</template>

<style scoped>
.login-hero {
  position: relative;
  display: flex;
  padding: 48rpx 32rpx 44rpx;
  overflow: hidden;
  flex-direction: column;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-hero);
}
.login-hero-eyebrow {
  color: var(--bao-mobile-jade-200);
  font-size: 20rpx;
  font-weight: 700;
}
.login-hero-title {
  margin-top: 14rpx;
  font-size: 44rpx;
  font-weight: 900;
  letter-spacing: 0.015em;
}
.login-hero-detail {
  margin-top: 14rpx;
  color: var(--bao-mobile-jade-100);
  font-size: 20rpx;
  line-height: 1.65;
}
.login-form {
  display: flex;
  gap: 20rpx;
  padding: 26rpx 28rpx 30rpx;
  flex-direction: column;
}
.login-meta {
  color: var(--bao-mobile-ink-500);
  font-size: 20rpx;
}
.login-agreement {
  display: flex;
  gap: 14rpx;
  margin-top: 8rpx;
  align-items: flex-start;
}
.login-agreement-text {
  flex: 1;
  color: var(--bao-mobile-ink-600);
  font-size: 20rpx;
  line-height: 1.65;
}
.session-note.failed {
  color: var(--bao-mobile-danger-500);
}
</style>
