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
  '--life-capsule-right': `${chrome.value.capsuleRight}px`,
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

function openNotify() {
  uni.showToast({ title: '暂无新消息', icon: 'none' });
}
</script>

<template>
  <view class="life-ambient" :style="[themeStyle, chromeStyle]">
    <view class="status-safe" aria-hidden="true" />
    <view class="operation-row">
      <!-- 城市选择（concept-f V10 玻璃态 loc pill） -->
      <button class="city-trigger fu" aria-label="选择服务城市" @click="openCity">
        <text class="loc-dot" />
        <text class="city-tx">{{ city }}</text>
        <text class="chevron">⌄</text>
      </button>
      <!-- 搜索输入条（白色圆胶囊，半透明阴影） -->
      <button class="search-trigger fu" aria-label="搜索商品和附近好店" @click="openSearch">
        <text class="search-icon">⌕</text>
        <text class="search-placeholder">搜索商品、附近好店</text>
      </button>
      <!-- 通知铃铛（concept-f V10 新） -->
      <button class="bell-trigger fu" aria-label="消息通知" @click="openNotify">
        <text class="bell-ic">🔔</text>
        <text class="bell-dot" />
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
  padding-bottom: 16rpx;
  /* concept-f V10 透明顶部：banner tint + 底部玻璃渐变 */
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0) 46%,
    var(--tone-top) 76%,
    var(--tone-mid) 92%,
    var(--tone-soft) 100%
  );
  transition: background 520ms ease;
}
.status-safe {
  height: var(--life-status-height, env(safe-area-inset-top));
}
.operation-row {
  display: flex;
  height: var(--life-navigation-height, 44px);
  padding: 0 20rpx;
  align-items: center;
  gap: 14rpx;
  box-sizing: border-box;
}
.city-trigger,
.search-trigger,
.bell-trigger {
  min-height: 72rpx;
  margin: 0;
  padding: 0 16rpx;
  border: 0;
  line-height: 72rpx;
  box-sizing: border-box;
  background: transparent;
}
.city-trigger {
  display: inline-flex;
  max-width: 220rpx;
  min-height: 72rpx;
  padding: 0 18rpx 0 14rpx;
  border-radius: 999rpx;
  align-items: center;
  gap: 8rpx;
  overflow: hidden;
  color: var(--ink, #16130f);
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(12rpx);
  -webkit-backdrop-filter: blur(12rpx);
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.08);
  font-size: 26rpx;
  font-weight: 900;
  letter-spacing: 0.3rpx;
  white-space: nowrap;
}
.loc-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffcf6b, #ff6d3a 70%);
  box-shadow: 0 0 0 4rpx rgba(255, 176, 75, 0.22);
  flex: none;
}
.city-tx {
  max-width: 136rpx;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chevron {
  flex: none;
  font-size: 26rpx;
  color: var(--mut, #857c6d);
  font-weight: 700;
}
.search-trigger {
  display: flex;
  min-width: 0;
  padding: 0 28rpx;
  border-radius: 999rpx;
  align-items: center;
  flex: 1;
  gap: 12rpx;
  overflow: hidden;
  color: var(--mut, #857c6d);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, 0.08);
  font-size: 26rpx;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}
.search-icon {
  color: var(--accent, #009146);
  font-size: 38rpx;
  line-height: 1;
}
.search-placeholder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--mut, #857c6d);
}
.bell-trigger {
  position: relative;
  display: inline-flex;
  width: 72rpx;
  height: 72rpx;
  min-height: 72rpx;
  padding: 0;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(12rpx);
  -webkit-backdrop-filter: blur(12rpx);
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.08);
  flex: none;
}
.bell-ic {
  font-size: 34rpx;
  line-height: 1;
}
.bell-dot {
  position: absolute;
  top: 16rpx;
  right: 18rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--promo, #f03749);
  box-shadow: 0 0 0 3rpx rgba(255, 255, 255, 0.9);
}
.capsule-reserve {
  width: var(--life-capsule-width);
  height: var(--life-capsule-height);
  flex: none;
}
</style>
