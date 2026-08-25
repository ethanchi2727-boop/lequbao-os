<script setup>
import { baoRuntimeProfile } from '../services/bao-session.js';

defineProps({ eyebrow: String, title: String, detail: String });
</script>
<template>
  <view class="page"
    ><view v-if="baoRuntimeProfile.previewData" class="preview-note"
      ><text>开发预览</text><text>模拟数据不可用于经营决策</text></view
    ><view class="mobile-top"
      ><view class="app-grid"><text></text><text></text><text></text><text></text></view
      ><view class="top-copy"
        ><text class="title">{{ title }}</text
        ><text class="eyebrow">{{ eyebrow }}</text></view
      ><view class="new-action">＋</view></view
    ><view class="page-intro"
      ><text>{{ detail }}</text></view
    ><slot></slot
  ></view>
</template>
<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx 36rpx;
  box-sizing: border-box;
}
.preview-note {
  display: flex;
  margin: 4rpx 0 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  align-items: center;
  justify-content: space-between;
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
  font-size: 18rpx;
}
.preview-note text:first-child {
  font-weight: 900;
}
.mobile-top {
  display: flex;
  align-items: center;
  min-height: 84rpx;
  gap: 18rpx;
}
.app-grid,
.new-action {
  display: grid;
  place-items: center;
  width: 68rpx;
  height: 68rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 22rpx;
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
.eyebrow {
  margin-top: 4rpx;
  color: var(--bao-mobile-jade-600);
  font-size: 18rpx;
}
.title {
  font-size: 28rpx;
  font-weight: 900;
}
.new-action {
  border-color: var(--bao-mobile-ink-900);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-ink-900);
  font-size: 34rpx;
}
.page-intro {
  padding: 4rpx 12rpx 10rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 20rpx;
  line-height: 1.55;
}
</style>
