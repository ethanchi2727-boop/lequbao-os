<script setup lang="ts">
import { computed } from 'vue'
import type { ExperienceSnapshot } from '@lequ/contracts'
import ActionButton from '../components/ActionButton.vue'

const props = defineProps<{ snapshot: ExperienceSnapshot; busy: boolean }>()
defineEmits<{ advance: [] }>()

const ownsNextStep = computed(() => props.snapshot.nextStep?.role === 'provider')
const ctaLabel = computed(() => {
  if (ownsNextStep.value) return props.snapshot.nextStep?.actionLabel ?? '继续交付'
  return props.snapshot.completedSteps >= 8 ? '交付链路已完成' : '等待签约移交'
})
const assetProgress = computed(() => props.snapshot.merchant?.profileCompletion ?? 18)
const geoScore = computed(() => props.snapshot.merchant?.geoScore ?? 0)
</script>

<template>
  <view class="screen provider-screen">
    <view class="status-bar"><text>09:41</text><text>5G · 100%</text></view>
    <view class="screen-body">
      <view class="topbar">
        <view>
          <text class="product-name">上海服务中心</text>
          <text class="location">交付组 · 今日在线 8 人</text>
        </view>
        <view class="avatar">沪</view>
      </view>

      <view class="headline-row">
        <view>
          <text class="eyebrow">DELIVERY FOCUS</text>
          <text class="page-title">把复杂交付，<br />变成确定结果</text>
        </view>
        <view class="sla-pill"><text class="sla-dot" /> SLA 正常</view>
      </view>

      <view class="priority-card">
        <view class="priority-top">
          <text class="priority-label">本刻最优先</text>
          <text class="priority-time">剩余 06:42:18</text>
        </view>
        <text class="merchant-name">{{ snapshot.merchant?.name ?? '等待销售移交' }}</text>
        <text class="priority-copy">{{ snapshot.nextStep?.description ?? '建档、预览、GEO 与 Skill 均已完成交付。' }}</text>
        <view class="delivery-progress">
          <view class="delivery-progress-fill" :style="{ width: `${Math.max(8, snapshot.completionRate)}%` }" />
        </view>
        <view class="progress-meta">
          <text>全链路进度</text><text>{{ snapshot.completedSteps }} / 12</text>
        </view>
      </view>

      <view class="module-grid">
        <view class="module-card asset-card">
          <view class="module-icon">采</view>
          <text class="module-label">资料资产</text>
          <text class="module-value">{{ assetProgress }}%</text>
          <view class="mini-track"><view :style="{ width: `${assetProgress}%` }" /></view>
        </view>
        <view class="module-card geo-card">
          <view class="score-ring" :style="{ '--score': `${geoScore * 3.6}deg` }">
            <text>{{ geoScore || '—' }}</text>
          </view>
          <view>
            <text class="module-label">GEO 健康</text>
            <text class="module-note">{{ geoScore ? '优秀' : '待扫描' }}</text>
          </view>
        </view>
      </view>

      <view class="preview-card">
        <view class="preview-head">
          <view>
            <text class="card-kicker">MINIAPP FACTORY</text>
            <text class="card-title">品牌轻应用预览</text>
          </view>
          <text class="version">v{{ snapshot.miniApp?.version ?? '—' }}</text>
        </view>
        <view class="preview-content">
          <view class="mini-phone">
            <view class="mini-top"><text>云和里</text><text>•••</text></view>
            <view class="dish-visual"><view class="plate" /><view class="leaf leaf-one" /><view class="leaf leaf-two" /></view>
            <text class="mini-title">顺时而食，知味而来</text>
            <view class="mini-button">预约雅座</view>
          </view>
          <view class="capability-list">
            <view class="capability-row" :class="{ done: snapshot.completedSteps >= 4 }"><text>01</text><view><b>智能采集</b><small>执照 · 门头 · 菜单</small></view><i>✓</i></view>
            <view class="capability-row" :class="{ done: snapshot.completedSteps >= 6 }"><text>02</text><view><b>商家确认</b><small>版本与事实快照</small></view><i>✓</i></view>
            <view class="capability-row" :class="{ done: snapshot.completedSteps >= 8 }"><text>03</text><view><b>能力上线</b><small>GEO · 3 Skills</small></view><i>✓</i></view>
          </view>
        </view>
        <ActionButton
          :label="ctaLabel"
          :busy="busy"
          :disabled="!ownsNextStep"
          @click="$emit('advance')"
        />
      </view>
    </view>

    <view class="bottom-nav">
      <view class="nav-item active"><text class="nav-icon">⌂</text><text>今日</text></view>
      <view class="nav-item"><text class="nav-icon">◎</text><text>商家</text></view>
      <view class="nav-item"><text class="nav-icon">▤</text><text>交付</text></view>
      <view class="nav-item"><text class="nav-icon">○</text><text>我的</text></view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.screen{position:relative;min-height:820px;padding-bottom:88px;background:linear-gradient(180deg,#edf5ff 0,#f5f8fc 255px,#f5f8fc 100%)}
.status-bar,.topbar,.headline-row,.priority-top,.progress-meta,.module-grid,.module-card,.preview-head,.preview-content,.capability-row,.bottom-nav,.nav-item{display:flex;align-items:center}
.status-bar{height:32px;justify-content:space-between;padding:8px 22px 0;color:var(--ink);font-size:11px;font-weight:800}.screen-body{padding:0 20px 26px}.topbar{height:62px;justify-content:space-between}.product-name,.location,.eyebrow,.page-title,.priority-label,.merchant-name,.priority-copy,.module-label,.module-value,.module-note,.card-kicker,.card-title,.mini-title{display:block}.product-name{font-size:18px;font-weight:900}.location{margin-top:3px;color:var(--muted);font-size:12px}.avatar{display:flex;width:40px;height:40px;align-items:center;justify-content:center;border-radius:14px;background:linear-gradient(135deg,#38c8d4,#3478f6);color:#fff;font-weight:900;box-shadow:0 8px 20px rgba(52,120,246,.2)}
.headline-row{justify-content:space-between;margin:12px 2px 20px}.eyebrow,.card-kicker{color:var(--blue);font-size:10px;font-weight:900;letter-spacing:.14em}.page-title{margin-top:8px;font-size:30px;line-height:1.19;font-weight:950;letter-spacing:-.035em}.sla-pill{padding:9px 10px;border-radius:12px;background:#e6f8f2;color:#147b61;font-size:10px;font-weight:850}.sla-dot{display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#16b98c;box-shadow:0 0 0 4px rgba(22,185,140,.1)}
.priority-card{position:relative;overflow:hidden;padding:21px;border-radius:27px;background:linear-gradient(145deg,#07142e,#102f64 68%,#275bb8);color:#fff;box-shadow:0 22px 48px rgba(17,56,117,.26)}.priority-card::after{content:'';position:absolute;width:180px;height:180px;right:-60px;top:-80px;border-radius:50%;background:rgba(70,208,222,.16)}.priority-top{position:relative;z-index:1;justify-content:space-between}.priority-label{color:#62e3cd;font-size:11px;font-weight:850}.priority-time{color:rgba(255,255,255,.5);font-size:10px;font-variant-numeric:tabular-nums}.merchant-name{position:relative;z-index:1;margin-top:18px;font-size:24px;font-weight:950}.priority-copy{position:relative;z-index:1;margin-top:7px;color:rgba(255,255,255,.63);font-size:13px;line-height:1.45}.delivery-progress{position:relative;z-index:1;height:6px;margin-top:20px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.12)}.delivery-progress-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#45e0bd,#64b5ff);transition:width .4s ease}.progress-meta{position:relative;z-index:1;justify-content:space-between;margin-top:7px;color:rgba(255,255,255,.42);font-size:9px}
.module-grid{gap:12px;margin-top:14px}.module-card{flex:1;min-height:103px;padding:15px;border:1px solid rgba(16,24,40,.05);border-radius:21px;background:#fff;box-shadow:var(--shadow-sm)}.asset-card{display:block}.module-icon{display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:10px;background:#e9f2ff;color:var(--blue);font-size:11px;font-weight:900}.module-label{margin-top:8px;color:var(--muted);font-size:10px;font-weight:750}.module-value{margin-top:2px;font-size:22px;font-weight:950}.mini-track{height:4px;margin-top:7px;border-radius:99px;background:#edf0f5;overflow:hidden}.mini-track view{height:100%;background:linear-gradient(90deg,#3478f6,#21c5ae)}.geo-card{gap:12px}.score-ring{display:flex;width:62px;height:62px;align-items:center;justify-content:center;border-radius:50%;background:conic-gradient(#16b98c var(--score),#e8edf2 0);position:relative}.score-ring::after{content:'';position:absolute;inset:6px;border-radius:50%;background:#fff}.score-ring text{position:relative;z-index:1;font-size:18px;font-weight:950}.module-note{margin-top:5px;color:var(--mint);font-size:11px;font-weight:850}
.preview-card{margin-top:14px;padding:19px;border:1px solid rgba(16,24,40,.05);border-radius:25px;background:#fff;box-shadow:var(--shadow-sm)}.preview-head{justify-content:space-between}.card-title{margin-top:4px;font-size:18px;font-weight:900}.version{padding:7px 9px;border-radius:9px;background:#f2f4f7;color:var(--muted);font-size:10px;font-weight:800}.preview-content{gap:16px;margin:16px 0}.mini-phone{width:118px;flex:0 0 118px;padding:10px;border:3px solid #151a2f;border-radius:20px;background:#fff;box-shadow:0 12px 26px rgba(16,24,40,.15)}.mini-top{display:flex;justify-content:space-between;font-size:7px;font-weight:900}.dish-visual{position:relative;height:58px;margin-top:8px;overflow:hidden;border-radius:12px;background:linear-gradient(145deg,#f4ddd0,#efb87e)}.plate{position:absolute;width:47px;height:47px;left:25px;top:6px;border:7px solid #fff8eb;border-radius:50%;background:#9c4f2e;box-shadow:0 3px 8px rgba(0,0,0,.16)}.leaf{position:absolute;width:15px;height:7px;border-radius:100% 0 100% 0;background:#4c8f57}.leaf-one{left:35px;top:22px;transform:rotate(25deg)}.leaf-two{left:52px;top:34px;transform:rotate(-20deg)}.mini-title{margin-top:8px;font-size:8px;font-weight:900}.mini-button{margin-top:7px;padding:7px 4px;border-radius:8px;background:#121a34;color:#fff;text-align:center;font-size:7px;font-weight:850}.capability-list{display:flex;min-width:0;flex:1;flex-direction:column;gap:5px}.capability-row{display:grid;grid-template-columns:24px 1fr 18px;gap:7px;min-height:45px;padding:7px;border-radius:13px;background:#f7f8fa;color:var(--muted-light)}.capability-row>text{font-size:9px;font-weight:900}.capability-row b,.capability-row small{display:block}.capability-row b{color:var(--ink-soft);font-size:11px}.capability-row small{margin-top:3px;font-size:8px}.capability-row i{display:flex;width:17px;height:17px;align-items:center;justify-content:center;border-radius:6px;background:#e7eaf0;color:#fff;font-size:9px;font-style:normal}.capability-row.done i{background:#16b98c}.capability-row.done>text{color:var(--blue)}
.bottom-nav{position:absolute;left:14px;right:14px;bottom:12px;height:66px;justify-content:space-around;border:1px solid rgba(16,24,40,.06);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 16px 40px rgba(16,24,40,.13);backdrop-filter:blur(16px)}.nav-item{min-width:56px;flex-direction:column;gap:4px;color:#98a2b3;font-size:10px}.nav-icon{font-size:19px;font-weight:800}.nav-item.active{color:var(--blue);font-weight:850}
</style>
