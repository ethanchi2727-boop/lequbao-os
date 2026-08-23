<script setup>
import { baoRuntimeProfile } from '../services/bao-session.js';

defineProps({ eyebrow: String, title: String, detail: String });
</script>
<template>
  <view class="page"
    ><view v-if="baoRuntimeProfile.previewData" class="preview-note"
      ><text>开发预览</text><text>模拟数据不可用于经营决策</text></view
    ><view class="brand"
      ><text class="mark">乐</text
      ><view><text>乐趣宝</text><text class="small">AI 经营工作台</text></view></view
    ><view class="hero"
      ><text class="eyebrow">{{ eyebrow }}</text
      ><text class="title">{{ title }}</text
      ><text class="detail">{{ detail }}</text></view
    ><view class="actions"
      ><view><text>AI 任务</text><text>自然语言发起工作</text></view
      ><view><text>待办事项</text><text>需要你确认的关键动作</text></view
      ><view><text>经营异常</text><text>订单、退款与交付提醒</text></view></view
    ></view
  >
</template>
<style scoped>
.page {
  padding: 28rpx;
}
.preview-note {
  display: flex;
  margin: 4rpx 0 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  align-items: center;
  justify-content: space-between;
  color: #744210;
  background: #fff3df;
  font-size: 18rpx;
}
.preview-note text:first-child {
  font-weight: 900;
}
.brand {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 12rpx 0 28rpx;
  font-weight: 900;
}
.brand view,
.brand text {
  display: flex;
  flex-direction: column;
}
.mark {
  display: grid !important;
  place-items: center;
  width: 70rpx;
  height: 70rpx;
  border-radius: 24rpx;
  color: #fff;
  background: #5b50ed;
}
.small {
  color: #737789;
  font-size: 20rpx;
  font-weight: 500;
}
.hero {
  display: flex;
  min-height: 280rpx;
  padding: 42rpx;
  border-radius: 34rpx;
  box-sizing: border-box;
  flex-direction: column;
  color: #fff;
  background: linear-gradient(135deg, #3d3479, #5b50ed);
  box-shadow: 0 22rpx 52rpx rgba(36, 32, 70, 0.16);
}
.eyebrow {
  color: #dcd8ff;
  font-size: 22rpx;
}
.title {
  margin: 18rpx 0 12rpx;
  font-size: 48rpx;
  font-weight: 900;
}
.detail {
  font-size: 24rpx;
  line-height: 1.6;
}
.actions {
  display: grid;
  gap: 18rpx;
  margin-top: 26rpx;
}
.actions view {
  display: flex;
  padding: 28rpx;
  border-radius: 24rpx;
  flex-direction: column;
  background: #fff;
  box-shadow: 0 12rpx 30rpx rgba(36, 32, 70, 0.07);
}
.actions view text:first-child {
  font-weight: 800;
}
.actions view text:last-child {
  margin-top: 8rpx;
  color: #737789;
  font-size: 22rpx;
}
</style>
