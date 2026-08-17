<script setup lang="ts">
import { computed } from 'vue'
import type { ExperienceSnapshot } from '@lequ/contracts'
import ActionButton from '../components/ActionButton.vue'

const props = defineProps<{
  snapshot: ExperienceSnapshot
  busy: boolean
}>()

defineEmits<{ advance: [] }>()

const ownsNextStep = computed(() => props.snapshot.nextStep?.role === 'sales')
const ctaLabel = computed(() => {
  if (ownsNextStep.value) return props.snapshot.nextStep?.actionLabel ?? '继续'
  return props.snapshot.completedSteps >= 3 ? '销售阶段已完成' : '等待销售阶段'
})
const healthScore = computed(() => props.snapshot.merchant?.healthScore ?? 0)
</script>

<template>
  <view class="screen sales-screen">
    <view class="status-bar"><text>09:41</text><text>5G · 100%</text></view>
    <view class="screen-body">
      <view class="topbar">
        <view>
          <text class="product-name">销售宝</text>
          <text class="location">上海直营一组 · 林一凡</text>
        </view>
        <view class="avatar">林</view>
      </view>

      <view class="heading-row">
        <view>
          <text class="eyebrow">TODAY · WED</text>
          <text class="page-title">把一家好店，<br />带进 AI 时代</text>
        </view>
        <view class="target-ring">
          <text class="target-value">72%</text>
          <text class="target-label">月目标</text>
        </view>
      </view>

      <view class="focus-card">
        <view class="focus-glow" />
        <view class="focus-header">
          <text class="focus-kicker">当前重点商机</text>
          <text class="stage-badge">{{ snapshot.nextStep?.shortTitle ?? '已交付' }}</text>
        </view>
        <text class="merchant-name">{{ snapshot.merchant?.name ?? '云和里·时令餐厅' }}</text>
        <text class="merchant-meta">江浙融合菜 · 静安区愚园路 · 客单 ¥168</text>
        <view class="contact-row">
          <view class="contact-avatar">周</view>
          <view class="contact-copy">
            <text class="contact-name">周云岚 · 创始人</text>
            <text class="contact-note">上次沟通 18 分钟前</text>
          </view>
          <view class="call-button">联系</view>
        </view>
      </view>

      <view class="metric-grid">
        <view class="metric-card">
          <text class="metric-label">预计签约</text>
          <text class="metric-value">¥12,800</text>
          <text class="metric-trend">高意向 · 86%</text>
        </view>
        <view class="metric-card">
          <text class="metric-label">AI 健康分</text>
          <text class="metric-value">{{ healthScore || '—' }}</text>
          <text class="metric-trend">{{ healthScore ? '同业前 18%' : '等待体检' }}</text>
        </view>
      </view>

      <view class="detail-card">
        <view class="card-title-row">
          <view>
            <text class="card-eyebrow">SMART NEXT STEP</text>
            <text class="card-title">AI 建议的下一步</text>
          </view>
          <view class="spark">✦</view>
        </view>
        <text class="advice-copy">
          {{ snapshot.nextStep?.description ?? '销售资料、合同与授权均已完整移交城市交付团队。' }}
        </text>
        <view class="check-list">
          <view class="check-item" :class="{ checked: snapshot.completedSteps >= 1 }">
            <text class="check-mark">✓</text><text>商家主数据与归属</text>
          </view>
          <view class="check-item" :class="{ checked: snapshot.completedSteps >= 2 }">
            <text class="check-mark">✓</text><text>AI 体检报告</text>
          </view>
          <view class="check-item" :class="{ checked: snapshot.completedSteps >= 3 }">
            <text class="check-mark">✓</text><text>合同与分层授权</text>
          </view>
        </view>
        <ActionButton
          :label="ctaLabel"
          :busy="busy"
          :disabled="!ownsNextStep"
          @click="$emit('advance')"
        />
        <text class="audit-hint">每次操作自动写入不可变审计记录</text>
      </view>
    </view>

    <view class="bottom-nav">
      <view class="nav-item active"><text class="nav-icon">⌂</text><text>今日</text></view>
      <view class="nav-item"><text class="nav-icon">◎</text><text>商家</text></view>
      <view class="nav-item"><text class="nav-icon">◇</text><text>业绩</text></view>
      <view class="nav-item"><text class="nav-icon">○</text><text>我的</text></view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.screen {
  position: relative;
  min-height: 820px;
  padding-bottom: 88px;
  background:
    linear-gradient(180deg, #f3f1ff 0, #f7f8fc 240px, #f7f8fc 100%);
}

.status-bar,
.topbar,
.heading-row,
.focus-header,
.contact-row,
.card-title-row,
.check-item,
.bottom-nav,
.nav-item {
  display: flex;
  align-items: center;
}

.status-bar {
  height: 32px;
  justify-content: space-between;
  padding: 8px 22px 0;
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
}

.screen-body { padding: 0 20px 26px; }
.topbar { height: 62px; justify-content: space-between; }
.product-name, .location, .eyebrow, .page-title, .target-value, .target-label,
.focus-kicker, .merchant-name, .merchant-meta, .contact-name, .contact-note,
.metric-label, .metric-value, .metric-trend, .card-eyebrow, .card-title,
.advice-copy, .audit-hint { display: block; }
.product-name { font-size: 18px; font-weight: 900; }
.location { margin-top: 3px; color: var(--muted); font-size: 12px; }
.avatar {
  display: flex; width: 40px; height: 40px; align-items: center; justify-content: center;
  border-radius: 14px; background: linear-gradient(135deg, #ff8b95, #675cf6); color: #fff; font-weight: 900;
  box-shadow: 0 8px 20px rgba(103, 92, 246, 0.22);
}
.heading-row { justify-content: space-between; margin: 12px 2px 20px; }
.eyebrow, .card-eyebrow { color: var(--indigo); font-size: 10px; font-weight: 900; letter-spacing: .14em; }
.page-title { margin-top: 8px; font-size: 31px; line-height: 1.2; font-weight: 950; letter-spacing: -.035em; }
.target-ring {
  display: flex; width: 72px; height: 72px; flex-direction: column; align-items: center; justify-content: center;
  border-radius: 50%; background: conic-gradient(var(--indigo) 72%, #e7e4ff 0); position: relative;
}
.target-ring::after { content: ''; position: absolute; inset: 7px; border-radius: 50%; background: #f7f6ff; }
.target-value, .target-label { position: relative; z-index: 1; }
.target-value { font-size: 16px; font-weight: 950; }
.target-label { margin-top: 2px; color: var(--muted); font-size: 9px; }
.focus-card {
  position: relative; overflow: hidden; padding: 22px; border-radius: 28px;
  background: linear-gradient(145deg, #171b3c, #39306e 70%, #5448d7); color: #fff;
  box-shadow: 0 24px 50px rgba(50, 39, 123, 0.28);
}
.focus-glow { position: absolute; width: 170px; height: 170px; right: -50px; top: -80px; border-radius: 50%; background: rgba(115, 205, 255, .22); filter: blur(4px); }
.focus-header { position: relative; justify-content: space-between; }
.focus-kicker { color: rgba(255,255,255,.58); font-size: 12px; font-weight: 750; }
.stage-badge { padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.12); color: #dcd9ff; font-size: 11px; font-weight: 850; }
.merchant-name { position: relative; margin-top: 18px; font-size: 25px; font-weight: 950; }
.merchant-meta { position: relative; margin-top: 8px; color: rgba(255,255,255,.64); font-size: 13px; }
.contact-row { position: relative; margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.12); }
.contact-avatar { display:flex;width:38px;height:38px;align-items:center;justify-content:center;border-radius:13px;background:rgba(255,255,255,.12);font-weight:900; }
.contact-copy { flex:1; margin-left:11px; }
.contact-name { font-size:13px;font-weight:800; }.contact-note { margin-top:3px;color:rgba(255,255,255,.45);font-size:10px; }
.call-button { padding:9px 12px;border-radius:11px;background:#fff;color:#39306e;font-size:12px;font-weight:900; }
.metric-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px; }
.metric-card, .detail-card { border:1px solid rgba(16,24,40,.05);background:#fff;box-shadow:var(--shadow-sm); }
.metric-card { padding:16px;border-radius:20px; }.metric-label{color:var(--muted);font-size:11px;font-weight:700}.metric-value{margin-top:7px;font-size:24px;font-weight:950;letter-spacing:-.03em}.metric-trend{margin-top:5px;color:var(--indigo);font-size:10px;font-weight:800}
.detail-card { margin-top:14px;padding:20px;border-radius:24px; }.card-title-row{justify-content:space-between}.card-title{margin-top:5px;font-size:19px;font-weight:900}.spark{display:flex;width:38px;height:38px;align-items:center;justify-content:center;border-radius:13px;background:#f0eeff;color:var(--indigo);font-size:20px}.advice-copy{margin:13px 0 15px;color:var(--muted);font-size:14px;line-height:1.55}.check-list{display:flex;gap:8px;margin-bottom:17px;flex-wrap:wrap}.check-item{gap:5px;padding:7px 9px;border-radius:10px;background:#f6f7fa;color:var(--muted);font-size:10px;font-weight:750}.check-item.checked{background:#e8f8f2;color:#128161}.check-mark{font-weight:950}.audit-hint{margin-top:10px;text-align:center;color:var(--muted-light);font-size:10px}
.bottom-nav { position:absolute;left:14px;right:14px;bottom:12px;height:66px;justify-content:space-around;border:1px solid rgba(16,24,40,.06);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 16px 40px rgba(16,24,40,.13);backdrop-filter:blur(16px)}.nav-item{min-width:56px;flex-direction:column;gap:4px;color:#98a2b3;font-size:10px}.nav-icon{font-size:19px;font-weight:800}.nav-item.active{color:var(--indigo);font-weight:850}
</style>
