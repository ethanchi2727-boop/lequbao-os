<script setup>
import { computed } from 'vue';
import { readLifeChromeMetrics } from '../services/life-visual.js';

const props = defineProps({
  title: { type: String, required: true },
  tint: { type: String, default: '' },
});

const chrome = readLifeChromeMetrics();
const navStyle = computed(() => ({
  paddingTop: `${chrome.statusBarHeight}px`,
  height: `${chrome.statusBarHeight + chrome.navigationHeight}px`,
}));
const capsuleReserveStyle = computed(() => ({
  width: `${chrome.capsuleWidth}px`,
  height: `${chrome.capsuleHeight}px`,
}));

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.switchTab({ url: '/pages/me/index' });
}
</script>

<template>
  <view class="pnav" :style="navStyle">
    <view class="back" @click="goBack">
      <view class="back-chevron"></view>
    </view>
    <view class="ptitle">{{ props.title }}</view>
    <view class="capsule capsule-reserve" :style="capsuleReserveStyle"></view>
  </view>
</template>

<style scoped>
.pnav {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 14px;
  padding-right: 14px;
  padding-bottom: 12px;
  position: relative;
  z-index: 2;
  box-sizing: border-box;
}
.back {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  background: var(--card);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  box-shadow: 0 3px 10px rgba(22, 19, 15, 0.06);
}
.back-chevron {
  width: 10px;
  height: 10px;
  border-left: 2.8px solid var(--ink);
  border-bottom: 2.8px solid var(--ink);
  transform: rotate(45deg);
  margin-left: 3px;
}
.ptitle {
  flex: 1;
  min-width: 0;
  font-size: 16.5px;
  font-weight: 900;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.capsule-reserve {
  flex: none;
}
</style>
