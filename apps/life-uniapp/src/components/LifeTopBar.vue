<script setup>
import { computed, onMounted, ref } from 'vue';
import { lifeBannerThemeStyle, readLifeChromeMetrics } from '../services/life-visual.js';

const props = defineProps({
  city: { type: String, default: '选择城市' },
  themeColor: { type: String, default: 'green' },
});

const chrome = ref(readLifeChromeMetrics());
const themeStyle = computed(() => lifeBannerThemeStyle(props.themeColor));
const chromeStyle = computed(() => ({
  '--life-status-height': `${chrome.value.statusBarHeight}px`,
  '--life-navigation-height': `${chrome.value.navigationHeight}px`,
  '--life-capsule-width': `${chrome.value.capsuleWidth}px`,
  '--life-capsule-height': `${chrome.value.capsuleHeight}px`,
}));

onMounted(() => {
  chrome.value = readLifeChromeMetrics();
});

function openCity() {
  uni.navigateTo({ url: '/pages/page-198/index' });
}

function openSearch() {
  uni.navigateTo({ url: '/pages/page-203/index' });
}
</script>

<template>
  <view class="life-ambient" :style="[themeStyle, chromeStyle]">
    <view class="status-safe" aria-hidden="true" />
    <view class="operation-row">
      <button class="city-trigger" aria-label="选择服务城市" @click="openCity">
        <text>{{ city }}</text
        ><text class="chevron">⌄</text>
      </button>
      <button class="search-trigger" aria-label="搜索商品和附近好店" @click="openSearch">
        <text class="search-icon">⌕</text><text>搜索商品、附近好店</text>
      </button>
      <!-- #ifdef MP-WEIXIN -->
      <view class="capsule-reserve" aria-hidden="true" />
      <!-- #endif -->
    </view>
    <slot />
  </view>
</template>

<style scoped>
.life-ambient {
  position: relative;
  padding-bottom: 20rpx;
  background: linear-gradient(
    180deg,
    var(--tone-top) 0%,
    var(--tone-mid) 72%,
    var(--tone-soft) 100%,
    var(--life-bg) 100%
  );
}
.status-safe {
  height: var(--life-status-height, env(safe-area-inset-top));
}
.operation-row {
  display: flex;
  height: var(--life-navigation-height, 44px);
  padding: 0 24rpx;
  align-items: center;
  gap: 14rpx;
  box-sizing: border-box;
}
.city-trigger,
.search-trigger {
  height: 64rpx;
  margin: 0;
  border: 0;
  line-height: 64rpx;
  box-sizing: border-box;
}
.city-trigger {
  display: flex;
  max-width: 152rpx;
  padding: 0;
  align-items: center;
  gap: 6rpx;
  overflow: hidden;
  color: var(--life-paper);
  background: transparent;
  font-size: 24rpx;
  font-weight: 700;
  white-space: nowrap;
}
.city-trigger text:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.chevron {
  flex: none;
}
.search-trigger {
  display: flex;
  min-width: 0;
  padding: 0 20rpx;
  border-radius: 34rpx;
  align-items: center;
  flex: 1;
  gap: 10rpx;
  overflow: hidden;
  color: #98a19d;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 6rpx 24rpx rgba(16, 72, 53, 0.09);
  font-size: 20rpx;
  text-align: left;
  white-space: nowrap;
}
.search-icon {
  color: var(--life-brand);
  font-size: 34rpx;
}
.capsule-reserve {
  width: var(--life-capsule-width);
  height: var(--life-capsule-height);
  flex: none;
}
</style>
