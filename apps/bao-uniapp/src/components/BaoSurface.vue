<script setup>
import { baoRuntimeProfile } from '../services/bao-session.js';
defineProps({ eyebrow: String, title: String, detail: String });
</script>
<template>
  <view class="page">
    <view v-if="baoRuntimeProfile.previewData" class="preview-note"
      ><text>开发预览</text><text>模拟数据不可用于经营决策</text></view
    >
    <view class="mobile-top">
      <view class="app-grid"><text></text><text></text><text></text><text></text></view>
      <view class="top-copy"
        ><text class="title">{{ title }}</text
        ><text class="eyebrow">{{ eyebrow }}</text></view
      >
      <view class="new-action"></view>
    </view>
    <text class="sr-only">{{ detail }}</text>
    <view class="mobile-content"><slot></slot></view>
  </view>
</template>
<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: calc(132rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--bao-mobile-ink-50);
}
.preview-note {
  display: flex;
  padding: 10rpx 28rpx;
  align-items: center;
  justify-content: space-between;
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
  font-size: 20rpx;
  letter-spacing: 0.01em;
}
.preview-note text:first-child {
  font-weight: 700;
}
.mobile-top {
  display: flex;
  gap: 22rpx;
  align-items: center;
  min-height: 128rpx;
  padding: 0 28rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
  background: var(--bao-mobile-paper);
}
.app-grid {
  display: grid;
  width: 72rpx;
  height: 72rpx;
  place-items: center;
  flex: none;
  border-radius: 24rpx;
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 8rpx 20rpx rgba(0, 145, 70, 0.32);
  grid-template-columns: repeat(2, 14rpx);
  grid-template-rows: repeat(2, 14rpx);
  gap: 7rpx;
}
.app-grid text {
  width: 14rpx;
  height: 14rpx;
  border-radius: 5rpx;
  background: rgba(255, 255, 255, 0.92);
}
.app-grid text:last-child {
  background: rgba(255, 255, 255, 0.55);
}
.top-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.title {
  overflow: hidden;
  font-size: 31rpx;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.eyebrow {
  display: flex;
  margin-top: 5rpx;
  align-items: center;
  color: var(--bao-mobile-jade-600);
  font-size: 20rpx;
  font-weight: 700;
}
.eyebrow::before {
  width: 12rpx;
  height: 12rpx;
  margin-right: 10rpx;
  border-radius: 50%;
  background: var(--bao-mobile-jade-400);
  box-shadow: 0 0 0 5rpx rgba(110, 199, 38, 0.16);
  animation: bao-ping 2.4s ease-out infinite;
  content: '';
}
@keyframes bao-ping {
  0% {
    box-shadow: 0 0 0 0 rgba(110, 199, 38, 0.32);
  }
  70% {
    box-shadow: 0 0 0 12rpx rgba(110, 199, 38, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(110, 199, 38, 0);
  }
}
.new-action {
  position: relative;
  display: grid;
  width: 72rpx;
  height: 72rpx;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 8rpx 20rpx rgba(0, 145, 70, 0.32);
}
.new-action::before,
.new-action::after {
  position: absolute;
  border-radius: 999rpx;
  background: var(--bao-mobile-paper);
  content: '';
}
.new-action::before {
  width: 28rpx;
  height: 5rpx;
}
.new-action::after {
  width: 5rpx;
  height: 28rpx;
}
.mobile-content {
  position: relative;
  padding: 28rpx 28rpx 36rpx;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
