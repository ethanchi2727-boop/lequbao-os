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
      <view class="new-action">＋</view>
    </view>
    <text class="sr-only">{{ detail }}</text>
    <view class="mobile-content"><slot></slot></view>
  </view>
</template>
<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: calc(122rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--bao-mobile-ink-50);
}
.preview-note {
  display: flex;
  padding: 12rpx 24rpx;
  align-items: center;
  justify-content: space-between;
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
  font-size: 17rpx;
}
.preview-note text:first-child {
  font-weight: 900;
}
.mobile-top {
  display: flex;
  align-items: center;
  min-height: 116rpx;
  padding: 0 24rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
  background: var(--bao-mobile-paper);
}
.app-grid,
.new-action {
  display: grid;
  width: 68rpx;
  height: 68rpx;
  place-items: center;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-control);
  background: var(--bao-mobile-paper);
}
.app-grid {
  grid-template-columns: repeat(2, 10rpx);
  grid-template-rows: repeat(2, 10rpx);
  gap: 6rpx;
}
.app-grid text {
  width: 10rpx;
  height: 10rpx;
  border: 2rpx solid var(--bao-mobile-ink-700);
  border-radius: 3rpx;
}
.top-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  text-align: center;
}
.title {
  font-size: 24rpx;
  font-weight: 900;
}
.eyebrow {
  margin-top: 4rpx;
  color: var(--bao-mobile-jade-600);
  font-size: 15rpx;
}
.new-action {
  border: 0;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-ink-900);
  font-size: 30rpx;
}
.mobile-content {
  position: relative;
  padding: 26rpx 24rpx 30rpx;
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
