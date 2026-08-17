<!-- Generated from packages/mobile-ui. Do not edit this mirror directly. -->
<script setup lang="ts">
import { computed } from 'vue'
import { breadcrumbs, findNode, getProduct, type ProductId, type ProductNavNode } from './product-catalog'

const props = defineProps<{ product: ProductId; routePath: string[] }>()
const catalog = computed(() => getProduct(props.product))
const node = computed(() => findNode(props.product, props.routePath))
const crumbs = computed(() => breadcrumbs(props.product, props.routePath))
const level = computed(() => props.routePath.length)

function openChild(child: ProductNavNode): void {
  const path = [...props.routePath, child.id].join('/')
  uni.navigateTo({ url: `/pages/module/index?path=${encodeURIComponent(path)}` })
}

function goHome(): void {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<template>
  <view class="module-page" :style="{ '--accent': catalog.accent }">
    <header class="module-header">
      <button class="back" hover-class="pressed" @click="goHome">⌂</button>
      <view class="header-brand"><text>{{ catalog.name }}</text><text>{{ catalog.englishName }}</text></view>
      <text class="level">L{{ level }}</text>
    </header>

    <main v-if="node" class="module-content">
      <scroll-view class="breadcrumbs" scroll-x>
        <text class="crumb-home" @click="goHome">首页</text>
        <template v-for="crumb in crumbs" :key="crumb.id">
          <text class="separator">/</text><text class="crumb">{{ crumb.title }}</text>
        </template>
      </scroll-view>

      <view class="title-block">
        <view class="large-icon">{{ node.icon }}</view>
        <text class="kicker">LEVEL {{ level }} · {{ catalog.identity }}</text>
        <text class="title">{{ node.title }}</text>
        <text class="summary">{{ node.summary }}</text>
        <view v-if="node.badge" class="badge">{{ node.badge }}</view>
      </view>

      <view v-if="node.children?.length" class="children-section">
        <view class="section-label"><text>下一层工作空间</text><text>{{ node.children.length }} 项</text></view>
        <button
          v-for="(child, index) in node.children"
          :key="child.id"
          class="child-card"
          hover-class="pressed"
          @click="openChild(child)"
        >
          <view class="child-icon">{{ child.icon }}</view>
          <view class="child-copy">
            <view class="child-title-line"><text class="child-title">{{ child.title }}</text><text v-if="child.badge" class="child-badge">{{ child.badge }}</text></view>
            <text class="child-summary">{{ child.summary }}</text>
            <text class="child-meta">L{{ level + 1 }} · {{ child.children?.length ?? 0 }} 个下级功能</text>
          </view>
          <text class="chevron">›</text>
        </button>
      </view>

      <view v-else class="action-panel">
        <text class="action-kicker">READY FOR ACTION</text>
        <text class="action-title">信息已核对，可以继续</text>
        <view class="evidence-list">
          <view><text>✓</text><text>身份与数据范围已校验</text></view>
          <view><text>✓</text><text>业务规则将随操作写入快照</text></view>
          <view><text>✓</text><text>结果进入审计与事件链路</text></view>
        </view>
        <button class="primary-action" hover-class="pressed">确认并继续</button>
        <text class="action-note">最终业务操作将在对应领域页面接入真实 API；当前为信息架构入口。</text>
      </view>
    </main>

    <main v-else class="not-found">
      <text class="not-found-code">404</text><text class="not-found-title">工作空间不存在</text>
      <button class="primary-action" @click="goHome">返回首页</button>
    </main>
  </view>
</template>

<style scoped lang="scss">
.module-page { min-height: 100vh; background: linear-gradient(180deg, #090e21 0, #111933 305px, #f5f7fb 306px); color: #101828; }
.module-header { display: flex; height: 74px; align-items: center; padding: 12px 20px; color: #fff; }
.back { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(255,255,255,.06); color: #fff; font-size: 18px; }
.header-brand { flex: 1; margin-left: 12px; }
.header-brand text { display: block; font-size: 14px; font-weight: 850; }
.header-brand text:last-child { margin-top: 2px; color: rgba(255,255,255,.4); font-size: 7px; letter-spacing: .14em; }
.level { padding: 7px 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 99px; color: #8ef1d5; font-size: 10px; font-weight: 900; }
.module-content { padding: 0 20px 46px; }
.breadcrumbs { width: 100%; padding: 10px 0 18px; white-space: nowrap; color: rgba(255,255,255,.46); font-size: 10px; }
.crumb-home { color: #8ef1d5; }
.separator { margin: 0 8px; opacity: .45; }
.crumb:last-child { color: #fff; }
.title-block { position: relative; min-height: 205px; padding: 28px 24px; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 28px; background: linear-gradient(145deg, rgba(255,255,255,.1), rgba(255,255,255,.035)); box-shadow: 0 24px 50px rgba(0,0,0,.18); color: #fff; }
.large-icon { position: absolute; top: 24px; right: 24px; display: flex; width: 58px; height: 58px; align-items: center; justify-content: center; border-radius: 19px; background: color-mix(in srgb, var(--accent) 26%, rgba(255,255,255,.08)); color: #fff; font-size: 22px; font-weight: 900; }
.kicker, .title, .summary { display: block; max-width: 78%; }
.kicker { color: #8ef1d5; font-size: 9px; font-weight: 900; letter-spacing: .12em; }
.title { margin-top: 14px; font-size: 30px; font-weight: 950; letter-spacing: -.04em; }
.summary { margin-top: 10px; color: rgba(255,255,255,.6); font-size: 13px; line-height: 1.65; }
.badge { display: inline-block; margin-top: 17px; padding: 7px 10px; border-radius: 99px; background: rgba(255,255,255,.09); color: #fff; font-size: 10px; font-weight: 800; }
.children-section, .action-panel { margin-top: 22px; }
.section-label { display: flex; align-items: center; justify-content: space-between; margin: 0 3px 11px; color: #667085; font-size: 11px; font-weight: 750; }
.section-label text:first-child { color: #101828; font-size: 17px; font-weight: 900; }
.child-card { display: flex; width: 100%; min-height: 106px; align-items: center; margin-bottom: 11px; padding: 16px; border: 1px solid rgba(16,24,40,.055); border-radius: 21px; background: #fff; box-shadow: 0 8px 24px rgba(16,24,40,.05); text-align: left; }
.child-icon { display: flex; width: 44px; height: 44px; flex: 0 0 44px; align-items: center; justify-content: center; border-radius: 15px; background: color-mix(in srgb, var(--accent) 11%, white); color: var(--accent); font-size: 17px; font-weight: 900; }
.child-copy { min-width: 0; flex: 1; margin-left: 13px; }
.child-title-line { display: flex; align-items: center; gap: 7px; }
.child-title, .child-summary, .child-meta { display: block; }
.child-title { font-size: 16px; font-weight: 900; }
.child-badge { padding: 3px 6px; border-radius: 99px; background: #fff1f2; color: #e84b5e; font-size: 8px; font-weight: 850; }
.child-summary { margin-top: 5px; overflow: hidden; color: #667085; font-size: 11px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.child-meta { margin-top: 7px; color: #98a2b3; font-size: 9px; }
.chevron { margin-left: 8px; color: #c3c8d0; font-size: 24px; }
.action-panel { padding: 25px; border-radius: 25px; background: #fff; box-shadow: 0 12px 35px rgba(16,24,40,.07); }
.action-kicker, .action-title, .action-note { display: block; }
.action-kicker { color: var(--accent); font-size: 9px; font-weight: 900; letter-spacing: .15em; }
.action-title { margin-top: 9px; font-size: 22px; font-weight: 950; }
.evidence-list { margin-top: 19px; padding: 15px; border-radius: 16px; background: #f7f9fc; }
.evidence-list view { display: flex; gap: 9px; margin: 8px 0; color: #475467; font-size: 11px; }
.evidence-list view text:first-child { color: #16b98c; font-weight: 900; }
.primary-action { width: 100%; height: 54px; margin-top: 19px; border-radius: 17px; background: var(--accent); box-shadow: 0 12px 25px color-mix(in srgb, var(--accent) 26%, transparent); color: #fff; font-size: 14px; font-weight: 900; }
.action-note { margin-top: 12px; color: #98a2b3; font-size: 9px; line-height: 1.6; text-align: center; }
.not-found { padding: 100px 25px; text-align: center; }
.not-found-code, .not-found-title { display: block; }
.not-found-code { color: var(--accent); font-size: 60px; font-weight: 950; }.not-found-title { font-size: 20px; font-weight: 900; }
.pressed { opacity: .75; transform: scale(.985); }
@media (min-width: 680px) { .module-content { max-width: 760px; margin: 0 auto; } }
</style>
