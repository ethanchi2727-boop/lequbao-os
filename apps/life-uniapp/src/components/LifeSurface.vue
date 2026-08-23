<script setup>
import { lifeRuntimeProfile } from '../services/life-session.js';

defineProps({
  eyebrow: String,
  title: String,
  detail: String,
  tone: { type: String, default: 'green' },
});
</script>

<template>
  <view class="surface">
    <view v-if="lifeRuntimeProfile.previewData" class="preview-note"
      ><text>开发预览数据</text><text>正式交易接入前不会产生订单或资金变动</text></view
    >
    <view :class="['hero', tone]"
      ><text>{{ eyebrow }}</text
      ><text class="title">{{ title }}</text
      ><text>{{ detail }}</text></view
    >
    <view class="assurance"><text>来源可查</text><text>规则透明</text><text>售后有门</text></view>
    <slot />
  </view>
</template>

<style scoped>
.surface {
  padding: 28rpx;
}
.preview-note {
  display: flex;
  margin: 4rpx 0 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  align-items: center;
  justify-content: space-between;
  color: #7b4f00;
  background: #fff5d6;
  font-size: 18rpx;
}
.preview-note text:first-child {
  font-weight: 900;
}
.hero {
  display: flex;
  min-height: 260rpx;
  padding: 44rpx 34rpx;
  border-radius: 34rpx;
  box-sizing: border-box;
  flex-direction: column;
  color: #fff;
  background: linear-gradient(135deg, #076c50, #0f9d72);
  box-shadow: 0 20rpx 48rpx rgba(22, 57, 43, 0.14);
}
.hero.orange {
  background: linear-gradient(135deg, #9b3f20, #ff6038);
}
.hero.blue {
  background: linear-gradient(135deg, #155e75, #0f9d72);
}
.title {
  margin: 18rpx 0 12rpx;
  font-size: 48rpx;
  line-height: 1.18;
  font-weight: 900;
}
.assurance {
  display: flex;
  justify-content: space-around;
  margin: 24rpx 0;
  padding: 22rpx;
  border-radius: 24rpx;
  color: #076c50;
  background: #e8f7f0;
  font-size: 22rpx;
  font-weight: 700;
}
</style>
