<script setup>
import { computed } from 'vue';
import LifeTopBar from './LifeTopBar.vue';
import { lifeRuntimeProfile } from '../services/life-session.js';
import { lifeBannerThemeStyle } from '../services/life-visual.js';

const props = defineProps({
  eyebrow: String,
  title: String,
  detail: String,
  city: { type: String, default: '选择城市' },
  primary: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showAssurance: { type: Boolean, default: true },
  themeColor: { type: String, default: 'green' },
});

const themeStyle = computed(() => lifeBannerThemeStyle(props.themeColor));
</script>

<template>
  <view class="surface" :style="themeStyle">
    <LifeTopBar v-if="primary" :city="city" :theme-color="themeColor">
      <slot name="ambient">
        <view class="primary-intro">
          <text>{{ eyebrow }}</text>
          <text class="primary-title">{{ title }}</text>
          <text>{{ detail }}</text>
        </view>
      </slot>
    </LifeTopBar>
    <view class="surface-content">
      <view v-if="lifeRuntimeProfile.previewData" class="preview-note"
        ><text>开发预览数据</text><text>正式交易接入前不会产生订单或资金变动</text></view
      >
      <view v-if="!primary" class="hero" :class="{ 'hero-compact': compact }"
        ><text>{{ eyebrow }}</text
        ><text class="title">{{ title }}</text
        ><text>{{ detail }}</text></view
      >
      <view v-if="showAssurance" class="assurance"
        ><text>来源可查</text><text>规则透明</text><text>售后有门</text></view
      >
      <slot />
    </view>
  </view>
</template>

<style scoped>
.surface {
  min-height: 100vh;
  background: var(--life-bg);
}
.surface-content {
  padding: 20rpx;
}
.primary-intro {
  display: flex;
  padding: 24rpx 28rpx 28rpx;
  flex-direction: column;
  color: var(--life-paper);
  text-shadow: 0 2rpx 10rpx rgba(7, 68, 49, 0.18);
}
.primary-intro > text:first-child {
  font-size: 20rpx;
  font-weight: 700;
  opacity: 0.9;
}
.primary-title {
  margin: 10rpx 0 8rpx;
  font-size: 42rpx;
  line-height: 1.16;
  font-weight: 900;
}
.primary-intro > text:last-child {
  font-size: 21rpx;
  opacity: 0.88;
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
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--tone-top), var(--tone-mid));
  box-shadow: var(--life-shadow);
}
.hero-compact {
  min-height: 168rpx;
  padding: 28rpx 30rpx;
  border-radius: var(--life-radius-md);
}
.hero-compact .title {
  margin: 8rpx 0 6rpx;
  font-size: 36rpx;
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
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 22rpx;
  font-weight: 700;
}
</style>
