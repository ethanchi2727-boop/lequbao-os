<!-- Generated from packages/mobile-ui. Do not edit this mirror directly. -->
<script setup lang="ts">
import { computed } from 'vue'
import { getProduct, type ProductId, type ProductNavNode } from './product-catalog'

const props = defineProps<{ product: ProductId }>()
const catalog = computed(() => getProduct(props.product))

function openModule(node: ProductNavNode): void {
  if (props.product === 'sales' && node.id === 'leads') {
    uni.navigateTo({ url: '/pages/onboarding/index' })
    return
  }
  if (props.product === 'sales' && node.id === 'performance') {
    uni.navigateTo({ url: '/pages/performance/index' })
    return
  }
  if (props.product === 'sales' && node.id === 'team') {
    uni.navigateTo({ url: '/pages/team/index' })
    return
  }
  if (props.product === 'sales' && node.id === 'copilot') {
    uni.navigateTo({ url: '/pages/copilot/index' })
    return
  }
  if (props.product === 'provider' && node.id === 'delivery') {
    uni.navigateTo({ url: '/pages/delivery/index' })
    return
  }
  if (props.product === 'provider' && node.id === 'local-sales') {
    uni.navigateTo({ url: '/pages/growth/index' })
    return
  }
  if (props.product === 'provider' && node.id === 'geo') {
    uni.navigateTo({ url: '/pages/geo/index' })
    return
  }
  if (props.product === 'provider' && node.id === 'skills') {
    uni.navigateTo({ url: '/pages/skills/index' })
    return
  }
  if (props.product === 'provider' && node.id === 'renewals') {
    uni.navigateTo({ url: '/pages/renewals/index' })
    return
  }
  if (props.product === 'provider' && (node.id === 'network' || node.id === 'metrics')) {
    uni.navigateTo({ url: '/pages/city-metrics/index' })
    return
  }
  uni.navigateTo({ url: `/pages/module/index?path=${encodeURIComponent(node.id)}` })
}

function runPrimaryAction(): void {
  if (props.product === 'sales') {
    uni.navigateTo({ url: '/pages/onboarding/index' })
    return
  }
  if (props.product === 'provider') {
    uni.navigateTo({ url: '/pages/delivery/index' })
  }
}
</script>

<template>
  <view class="product-home" :style="{ '--accent': catalog.accent }">
    <view class="aurora aura-a" />
    <view class="aurora aura-b" />
    <header class="topbar">
      <view class="brand-mark">◦</view>
      <view class="brand-copy">
        <text class="brand-name">{{ catalog.name }}</text>
        <text class="brand-en">{{ catalog.englishName }}</text>
      </view>
      <view class="avatar">{{ catalog.identity.slice(0, 1) }}</view>
    </header>

    <main class="content">
      <view class="identity-row">
        <text class="identity">{{ catalog.identity }}</text>
        <text class="status"><text class="status-dot" /> 实时同步</text>
      </view>
      <text class="greeting">{{ catalog.greeting }}</text>

      <view class="hero-card">
        <view class="hero-orb"><text>✦</text></view>
        <text class="hero-kicker">AI NATIVE WORKSPACE</text>
        <text class="hero-title">{{ catalog.heroTitle }}</text>
        <text class="hero-summary">{{ catalog.heroSummary }}</text>
        <button class="hero-action" hover-class="button-pressed" @click="runPrimaryAction">
          <text>{{ catalog.primaryAction }}</text><text>↗</text>
        </button>
      </view>

      <view class="section-heading">
        <view><text class="eyebrow">WORKSPACE</text><text class="section-title">全部工作空间</text></view>
        <text class="module-count">{{ catalog.modules.length }} 个模块</text>
      </view>

      <view class="module-grid">
        <button
          v-for="(module, index) in catalog.modules"
          :key="module.id"
          class="module-card"
          hover-class="card-pressed"
          @click="openModule(module)"
        >
          <view class="module-top">
            <text class="module-icon">{{ module.icon }}</text>
            <text v-if="module.badge" class="module-badge">{{ module.badge }}</text>
            <text v-else class="module-index">0{{ index + 1 }}</text>
          </view>
          <text class="module-title">{{ module.title }}</text>
          <text class="module-summary">{{ module.summary }}</text>
          <view class="module-foot">
            <text>{{ module.children?.length ?? 0 }} 个功能域</text><text class="arrow">→</text>
          </view>
        </button>
      </view>
    </main>
  </view>
</template>

<style scoped lang="scss">
.product-home { position: relative; min-height: 100vh; overflow: hidden; background: #f5f7fb; color: #101828; }
.aurora { position: absolute; border-radius: 50%; filter: blur(65px); pointer-events: none; }
.aura-a { top: -120px; right: -80px; width: 280px; height: 280px; background: color-mix(in srgb, var(--accent) 24%, transparent); }
.aura-b { top: 420px; left: -150px; width: 250px; height: 250px; background: rgba(31, 199, 161, 0.12); }
.topbar { position: relative; z-index: 2; display: flex; height: 78px; align-items: center; padding: 16px 20px; }
.brand-mark { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border: 5px solid var(--accent); border-top-color: #30d1ab; border-radius: 50%; color: #101828; font-size: 14px; font-weight: 900; transform: rotate(-22deg); }
.brand-copy { flex: 1; margin-left: 11px; }
.brand-name, .brand-en { display: block; }
.brand-name { font-size: 17px; font-weight: 900; letter-spacing: .04em; }
.brand-en { margin-top: 2px; color: #98a2b3; font-size: 8px; font-weight: 800; letter-spacing: .16em; }
.avatar { display: flex; width: 38px; height: 38px; align-items: center; justify-content: center; border: 3px solid #fff; border-radius: 50%; background: #101828; box-shadow: 0 8px 20px rgba(16, 24, 40, .16); color: #fff; font-size: 14px; font-weight: 800; }
.content { position: relative; z-index: 1; padding: 10px 20px 44px; }
.identity-row { display: flex; align-items: center; justify-content: space-between; }
.identity { color: #667085; font-size: 13px; font-weight: 700; }
.status { color: #667085; font-size: 11px; }
.status-dot { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #16b98c; box-shadow: 0 0 0 4px rgba(22,185,140,.1); }
.greeting { display: block; margin: 7px 0 18px; font-size: 28px; font-weight: 950; letter-spacing: -.04em; }
.hero-card { position: relative; overflow: hidden; padding: 28px 24px 23px; border-radius: 28px; background: linear-gradient(145deg, #0c1229 0%, #151c39 55%, color-mix(in srgb, var(--accent) 50%, #111934) 150%); box-shadow: 0 24px 50px rgba(9, 15, 35, .22); color: #fff; }
.hero-card::after { position: absolute; right: -70px; bottom: -100px; width: 230px; height: 230px; border: 1px solid rgba(255,255,255,.12); border-radius: 50%; box-shadow: 0 0 0 28px rgba(255,255,255,.025), 0 0 0 58px rgba(255,255,255,.018); content: ''; }
.hero-orb { position: absolute; top: 25px; right: 24px; display: flex; width: 52px; height: 52px; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.18); border-radius: 18px; background: rgba(255,255,255,.09); box-shadow: inset 0 1px rgba(255,255,255,.2), 0 16px 30px rgba(0,0,0,.16); color: #77f0d0; font-size: 21px; }
.hero-kicker, .hero-title, .hero-summary { display: block; max-width: 82%; }
.hero-kicker { color: #8ef1d5; font-size: 9px; font-weight: 900; letter-spacing: .16em; }
.hero-title { margin-top: 14px; font-size: 27px; font-weight: 950; line-height: 1.24; letter-spacing: -.04em; }
.hero-summary { margin-top: 10px; color: rgba(255,255,255,.65); font-size: 13px; line-height: 1.65; }
.hero-action { position: relative; z-index: 1; display: flex; width: 100%; height: 52px; align-items: center; justify-content: space-between; margin-top: 22px; padding: 0 18px; border-radius: 16px; background: #fff; color: #101828; font-size: 14px; font-weight: 850; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; margin: 30px 2px 15px; }
.eyebrow, .section-title { display: block; }
.eyebrow { color: var(--accent); font-size: 9px; font-weight: 900; letter-spacing: .15em; }
.section-title { margin-top: 5px; font-size: 22px; font-weight: 950; letter-spacing: -.03em; }
.module-count { color: #98a2b3; font-size: 11px; }
.module-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.module-card { min-height: 185px; padding: 17px; border: 1px solid rgba(16,24,40,.055); border-radius: 22px; background: rgba(255,255,255,.9); box-shadow: 0 9px 26px rgba(16,24,40,.055); text-align: left; }
.module-top, .module-foot { display: flex; align-items: center; justify-content: space-between; }
.module-icon { display: flex; width: 37px; height: 37px; align-items: center; justify-content: center; border-radius: 13px; background: color-mix(in srgb, var(--accent) 11%, white); color: var(--accent); font-size: 16px; font-weight: 900; }
.module-badge { padding: 5px 7px; border-radius: 99px; background: #fff1f2; color: #e84b5e; font-size: 8px; font-weight: 850; }
.module-index { color: #d0d5dd; font-size: 9px; font-weight: 800; }
.module-title, .module-summary { display: block; }
.module-title { margin-top: 16px; font-size: 17px; font-weight: 900; }
.module-summary { min-height: 52px; margin-top: 7px; color: #667085; font-size: 11px; line-height: 1.55; }
.module-foot { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f2f5; color: #98a2b3; font-size: 9px; }
.arrow { color: var(--accent); font-size: 16px; }
.button-pressed, .card-pressed { opacity: .78; transform: scale(.985); }
@media (min-width: 680px) { .content { max-width: 820px; margin: 0 auto; } .module-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
