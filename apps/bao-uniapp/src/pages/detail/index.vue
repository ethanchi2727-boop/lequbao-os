<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoMobilePageById } from '../../mobile-page-registry.js';

const pageId = ref('');
const page = computed(() => baoMobilePageById.get(pageId.value) ?? null);
const tabRoutes = {
  workbench: '/pages/workbench/index',
  merchants: '/pages/merchants/index',
  orders: '/pages/orders/index',
  service: '/pages/service/index',
  me: '/pages/me/index',
};
onLoad((query) => {
  pageId.value = typeof query?.pageId === 'string' ? query.pageId.toLowerCase() : '';
});
function openAuthority() {
  const target = page.value ? tabRoutes[page.value.tab] : '';
  if (target) uni.switchTab({ url: target });
}
</script>
<template>
  <BaoSurface
    v-if="page"
    :eyebrow="`${page.kicker} · ${page.id.toUpperCase()}`"
    :title="page.title"
    :detail="page.detail"
    ><view class="task-hero"
      ><text>04</text><view><text>移动正式任务</text><text>权威数据模式</text></view></view
    ><view class="panel task-path"
      ><view class="panel-head"><text>任务路径</text><text>服务端权限最终裁决</text></view
      ><view v-for="(step, index) in page.steps" :key="step" class="task-step"
        ><text>{{ String(index + 1).padStart(2, '0') }}</text
        ><view
          ><text>{{ step }}</text
          ><text>进入当前权限范围内的真实业务步骤</text></view
        ></view
      ></view
    ><view class="guardrail"
      ><text>执行边界</text><text>{{ page.guardrail }}</text></view
    ><button class="authority-action" @click="openAuthority">打开权威数据入口</button></BaoSurface
  ><BaoSurface
    v-else
    eyebrow="安全关闭"
    title="页面不可用"
    detail="页面标识不存在或不属于当前移动端正式任务范围。"
    ><view class="panel missing">返回五栏工作台后重新进入。</view></BaoSurface
  >
</template>
<style scoped>
.task-hero {
  display: flex;
  align-items: center;
  padding: 26rpx;
  border-radius: var(--bao-mobile-radius-card);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
}
.task-hero > text {
  display: grid;
  place-items: center;
  width: 64rpx;
  height: 64rpx;
  margin-right: 18rpx;
  border-radius: var(--bao-mobile-radius-control);
  background: var(--bao-mobile-gradient-brand);
  font-size: 22rpx;
  font-weight: 900;
}
.task-hero view,
.task-step view {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.task-hero view text:first-child {
  font-size: 26rpx;
  font-weight: 900;
}
.task-hero view text:last-child {
  margin-top: 6rpx;
  color: var(--bao-mobile-jade-300);
  font-size: 18rpx;
}
.task-path {
  padding: 8rpx 24rpx;
}
.task-step {
  display: flex;
  align-items: center;
  min-height: 108rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.task-step:last-child {
  border-bottom: 0;
}
.task-step > text {
  display: grid;
  place-items: center;
  width: 54rpx;
  height: 54rpx;
  margin-right: 18rpx;
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 18rpx;
  font-weight: 900;
}
.task-step view text:first-child {
  font-size: 22rpx;
  font-weight: 800;
}
.task-step view text:last-child {
  margin-top: 5rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 18rpx;
}
.guardrail {
  display: flex;
  margin-top: 18rpx;
  padding: 22rpx;
  border-radius: var(--bao-mobile-radius-control);
  flex-direction: column;
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
.guardrail text:first-child {
  font-size: 18rpx;
  font-weight: 900;
}
.guardrail text:last-child {
  margin-top: 7rpx;
  color: var(--bao-mobile-ink-700);
  font-size: 20rpx;
  line-height: 1.55;
}
.authority-action {
  margin-top: 18rpx;
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  font-size: 22rpx;
  font-weight: 900;
}
.missing {
  padding: 50rpx 24rpx;
  color: var(--bao-mobile-ink-500);
  text-align: center;
}
</style>
