<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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
  showMaiFab: { type: Boolean, default: true },
});

const themeStyle = computed(() => lifeBannerThemeStyle(props.themeColor));
const surfaceEl = ref(null);
const inst = getCurrentInstance();

const timers = [];
function clearTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers.length = 0;
}

// Concept-f 统一入场：跨端按顺序把 .fu 节点标记为 .in，兼容 H5 + mp-weixin
function markFuAnimate() {
  clearTimers();
  const t1 = setTimeout(() => {
    // #ifdef H5
    try {
      const root = surfaceEl.value && surfaceEl.value.$el ? surfaceEl.value.$el : null;
      if (root && typeof IntersectionObserver !== 'undefined') {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add('in');
                io.unobserve(e.target);
              }
            });
          },
          { root: null, threshold: 0.1 },
        );
        const nodes = root.querySelectorAll('.fu');
        nodes.forEach((n) => io.observe(n));
        // 兜底：2s 后所有未进入的都标 in 并断连
        const tfallback = setTimeout(() => {
          root.querySelectorAll('.fu:not(.in)').forEach((n) => n.classList.add('in'));
          io.disconnect();
        }, 2400);
        timers.push(tfallback);
        return;
      }
      if (root) {
        root.querySelectorAll('.fu').forEach((n, i) => {
          const tt = setTimeout(() => n.classList.add('in'), 120 + i * 60);
          timers.push(tt);
        });
      }
    } catch {
      /* noop */
    }
    // #endif
    // #ifndef H5
    // 小程序无 classList；使用通用分时过渡样式 + createSelectorQuery 兜底，
    // 由于小程序 scoped slot 内节点 class 切换需 setData，故这里只按视觉顺序为父容器增加 anim-ready
    // 具体小程序入场由子组件/全局 CSS :nth-child 阶梯延迟兜底完成
    try {
      if (inst && inst.proxy) {
        const q = uni.createSelectorQuery().in(inst.proxy);
        q.selectAll('.fu').boundingClientRect((rects) => {
          // 小程序端此处不能直接 classList.add('in') → 交给全局 CSS nth-of-type 动画完成视觉
          void rects;
        }).exec();
      }
    } catch {
      /* noop */
    }
    // #endif
  }, 100);
  timers.push(t1);
}

onMounted(() => {
  nextTick(markFuAnimate);
});
onUnmounted(clearTimers);

watch(
  () => [props.primary, props.eyebrow, props.title, props.detail, props.showAssurance],
  () => nextTick(markFuAnimate),
);

function openMai() {
  uni.showToast({ title: '小满 AI 即将上线', icon: 'none' });
}

defineExpose({ markFuAnimate });
</script>

<template>
  <view ref="surfaceEl" class="surface" :style="themeStyle">
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
    <button v-if="showMaiFab" class="maifab" aria-label="小满 AI 助手" @click="openMai">
      <text class="mai-ava">满</text>
      <text class="mai-lab">小满 AI</text>
    </button>
  </view>
</template>

<style scoped>
.surface {
  position: relative;
  min-height: 100vh;
  /* Concept-f tint 渐变色背景机制 —— V10: 顶部 --tint 逐渐过渡到页面 bg */
  background: linear-gradient(
    180deg,
    var(--tint, #e7f4ef) 0%,
    var(--tint, #e7f4ef) 36%,
    var(--bg, #f6f1e6) 60%,
    var(--bg, #f6f1e6) 100%
  );
  transition: background 620ms ease;
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
  color: var(--life-yellow-ink);
  background: var(--life-yellow-soft);
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
