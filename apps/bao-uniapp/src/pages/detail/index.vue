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
  >
    <view class="m-progress-hero"
      ><view><text>任务结构</text><text>04</text><text>服务端权限最终裁决</text></view
      ><view class="progress-ring" style="--progress: 360deg"><text>4步</text></view></view
    >
    <view class="m-section"><text>执行轨迹</text><text>正式任务路径</text></view>
    <view class="m-timeline">
      <view
        v-for="(step, index) in page.steps"
        :key="step"
        :class="['timeline-step', index === 0 ? 'active' : '']"
        ><text>{{ index + 1 }}</text
        ><view
          ><text>{{ step }}</text
          ><text>进入当前权限范围内的真实业务步骤</text></view
        ><text>{{ index === 0 ? '当前' : '' }}</text></view
      >
    </view>
    <view class="guardrail"
      ><text>执行边界</text><text>{{ page.guardrail }}</text></view
    >
    <button class="m-primary" @click="openAuthority">打开权威数据入口</button>
  </BaoSurface>
  <BaoSurface
    v-else
    eyebrow="安全关闭"
    title="页面不可用"
    detail="页面标识不存在或不属于当前移动端正式任务范围。"
    ><view class="m-agent"
      ><view class="m-agent-head"><text>!</text><text>页面不可用</text><text>安全关闭</text></view>
      <text class="agent-title">返回五栏工作台后重新进入</text>
      <text>未知页面不会读取或显示任何业务数据。</text></view
    ></BaoSurface
  >
</template>
