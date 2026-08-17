<script setup lang="ts">
import { computed } from 'vue'
import type { ExperienceSnapshot } from '@lequ/contracts'
import ActionButton from '../components/ActionButton.vue'

const props = defineProps<{ snapshot: ExperienceSnapshot; busy: boolean }>()
defineEmits<{ advance: [] }>()

const ownsNextStep = computed(() => props.snapshot.nextStep?.role === 'consumer')
const ctaLabel = computed(() => {
  if (ownsNextStep.value) return props.snapshot.nextStep?.actionLabel ?? '继续'
  if (props.snapshot.reservation?.status === 'MERCHANT_RECEIVED') return '商家已收到预约'
  if (props.snapshot.reservation) return '订座已确认'
  return '等待商家能力上线'
})
const dateLabel = computed(() => {
  if (!props.snapshot.reservation) return '明天 18:30'
  const date = new Date(props.snapshot.reservation.reservationAt)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})
</script>

<template>
  <view class="screen consumer-screen">
    <view class="status-bar"><text>09:41</text><text>5G · 100%</text></view>
    <view class="screen-body">
      <view class="topbar">
        <view class="location-pill"><text class="location-dot" /> 上海·静安 <text class="chevron">⌄</text></view>
        <view class="top-actions"><view class="round-action">↗</view><view class="avatar">夏</view></view>
      </view>

      <view class="greeting">
        <text class="eyebrow">GOOD EVENING, 知夏</text>
        <text class="page-title">今晚，想吃点<br /><text class="gradient-text">真正合心意的</text></text>
        <text class="page-subtitle">告诉我你的时间、口味和同行的人，剩下的交给我。</text>
      </view>

      <view class="ai-input">
        <view class="ai-orb"><text>✦</text></view>
        <view class="input-copy">
          <text class="input-placeholder">四个人，明晚想吃安静一点的江浙菜</text>
          <text class="input-hint">可继续补充预算、位置或忌口</text>
        </view>
        <view class="voice-button">◉</view>
      </view>

      <view class="intent-row">
        <view class="intent active">今晚聚餐</view>
        <view class="intent">附近好店</view>
        <view class="intent">帮我省一点</view>
      </view>

      <view class="recommendation-card">
        <view class="recommendation-visual">
          <view class="visual-gradient" />
          <view class="dish dish-main"><view class="food" /></view>
          <view class="dish dish-side"><view class="food warm" /></view>
          <view class="match-badge"><text>96%</text><small>合拍度</small></view>
        </view>
        <view class="recommendation-body">
          <view class="recommendation-top">
            <view>
              <text class="card-kicker">AI 首选 · 安静聚餐</text>
              <text class="merchant-name">{{ snapshot.merchant?.name ?? '云和里·时令餐厅' }}</text>
            </view>
            <text class="price">¥168<small>/人</small></text>
          </view>
          <text class="reason">离你 1.8km · 有临窗安静座 · 江浙时令菜单 · 花生忌口可标注</text>
          <view class="proof-row">
            <view><b>4.9</b><span>口味评分</span></view>
            <view><b>{{ snapshot.merchant?.geoScore ?? 94 }}</b><span>信息可信</span></view>
            <view><b>{{ snapshot.skills.length || 3 }}</b><span>可用能力</span></view>
          </view>
        </view>
      </view>

      <view v-if="snapshot.reservation" class="reservation-card">
        <view class="reservation-head">
          <view class="reservation-icon">✓</view>
          <view>
            <text class="reservation-kicker">RESERVATION DRAFT</text>
            <text class="reservation-title">请确认这份订座</text>
          </view>
          <text class="risk-badge">L2 确认</text>
        </view>
        <view class="reservation-grid">
          <view><text class="detail-label">时间</text><text class="detail-value">{{ dateLabel }}</text></view>
          <view><text class="detail-label">人数</text><text class="detail-value">4 位</text></view>
          <view><text class="detail-label">联系人</text><text class="detail-value">陈知夏</text></view>
          <view><text class="detail-label">费用</text><text class="detail-value">无需订金</text></view>
        </view>
        <view class="note-line"><text>已为你备注</text><b>临窗安静座位 · 一位不食花生</b></view>
      </view>

      <ActionButton
        class="consumer-action"
        :label="ctaLabel"
        :busy="busy"
        :disabled="!ownsNextStep"
        @click="$emit('advance')"
      />
      <text class="safety-note">AI 只创建草稿；确认、支付和退款永远由你决定</text>
    </view>

    <view class="bottom-nav">
      <view class="nav-item active"><text class="nav-icon">⌂</text><text>首页</text></view>
      <view class="nav-item"><text class="nav-icon">✦</text><text>AI 管家</text></view>
      <view class="nav-item"><text class="nav-icon">▤</text><text>订单</text></view>
      <view class="nav-item"><text class="nav-icon">◇</text><text>卡包</text></view>
      <view class="nav-item"><text class="nav-icon">○</text><text>我的</text></view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.screen{position:relative;min-height:820px;padding-bottom:88px;background:linear-gradient(180deg,#f4f2ff 0,#fbfbfe 245px,#f7f8fb 100%)}
.status-bar,.topbar,.location-pill,.top-actions,.round-action,.greeting,.ai-input,.ai-orb,.voice-button,.intent-row,.recommendation-top,.proof-row,.reservation-head,.reservation-icon,.bottom-nav,.nav-item{display:flex;align-items:center}
.status-bar{height:32px;justify-content:space-between;padding:8px 22px 0;color:var(--ink);font-size:11px;font-weight:800}.screen-body{padding:0 20px 26px}.topbar{height:62px;justify-content:space-between}.location-pill{gap:6px;font-size:14px;font-weight:850}.location-dot{width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 5px rgba(22,185,140,.1)}.chevron{color:var(--muted)}.top-actions{gap:9px}.round-action,.avatar{display:flex;width:38px;height:38px;align-items:center;justify-content:center;border-radius:14px}.round-action{border:1px solid var(--line);background:#fff;color:var(--muted);font-weight:900}.avatar{background:linear-gradient(145deg,#ffc2b9,#675cf6);color:#fff;font-weight:900;box-shadow:0 8px 18px rgba(103,92,246,.18)}
.greeting{align-items:flex-start;flex-direction:column;margin:11px 1px 18px}.eyebrow,.page-title,.page-subtitle,.input-placeholder,.input-hint,.card-kicker,.merchant-name,.price,.reason,.reservation-kicker,.reservation-title,.detail-label,.detail-value,.safety-note{display:block}.eyebrow,.card-kicker,.reservation-kicker{color:var(--indigo);font-size:10px;font-weight:900;letter-spacing:.14em}.page-title{margin-top:8px;font-size:32px;line-height:1.16;font-weight:950;letter-spacing:-.045em}.gradient-text{background:linear-gradient(100deg,#5549e8,#3478f6 58%,#16b98c);background-clip:text;color:transparent}.page-subtitle{margin-top:10px;color:var(--muted);font-size:13px;line-height:1.5}
.ai-input{min-height:80px;gap:12px;padding:13px;border:1px solid rgba(103,92,246,.16);border-radius:24px;background:rgba(255,255,255,.94);box-shadow:0 16px 38px rgba(78,66,178,.1)}.ai-orb{width:46px;height:46px;flex:0 0 46px;justify-content:center;border-radius:16px;background:linear-gradient(145deg,#675cf6,#3478f6);color:#fff;font-size:18px;box-shadow:0 8px 18px rgba(103,92,246,.22)}.input-copy{min-width:0;flex:1}.input-placeholder{overflow:hidden;font-size:13px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.input-hint{margin-top:5px;color:var(--muted-light);font-size:9px}.voice-button{width:35px;height:35px;justify-content:center;border-radius:12px;background:#f1efff;color:var(--indigo);font-weight:900}.intent-row{gap:8px;margin:12px 0 15px;overflow:hidden}.intent{padding:9px 11px;border:1px solid var(--line);border-radius:99px;background:#fff;color:var(--muted);font-size:10px;font-weight:800;white-space:nowrap}.intent.active{border-color:#d9d4ff;background:#eeecff;color:var(--indigo)}
.recommendation-card{overflow:hidden;border:1px solid rgba(16,24,40,.06);border-radius:26px;background:#fff;box-shadow:var(--shadow-sm)}.recommendation-visual{position:relative;height:138px;overflow:hidden;background:#d8c0a8}.visual-gradient{position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,rgba(255,244,209,.8),transparent 38%),linear-gradient(145deg,#3d4b3e,#b27a50)}.dish{position:absolute;border-radius:50%;background:#f8f0df;box-shadow:0 12px 30px rgba(0,0,0,.24)}.dish-main{width:106px;height:106px;left:53px;top:17px}.dish-side{width:72px;height:72px;right:56px;bottom:-6px}.food{position:absolute;inset:14px;border-radius:50%;background:radial-gradient(circle at 40% 40%,#d98b49 0 12%,#7d301e 14% 28%,#3f682f 30% 42%,#a34e24 44% 100%);box-shadow:inset 0 0 0 3px rgba(255,255,255,.18)}.food.warm{background:radial-gradient(circle,#f1b95b,#ad512e 62%,#5d321e 65%)}.match-badge{position:absolute;right:14px;top:13px;display:flex;flex-direction:column;align-items:center;padding:8px 10px;border:1px solid rgba(255,255,255,.2);border-radius:13px;background:rgba(10,18,31,.72);color:#fff;backdrop-filter:blur(10px)}.match-badge text{font-size:15px;font-weight:950}.match-badge small{margin-top:2px;color:rgba(255,255,255,.55);font-size:8px}.recommendation-body{padding:17px}.recommendation-top{justify-content:space-between;align-items:flex-start}.merchant-name{margin-top:4px;font-size:19px;font-weight:950}.price{color:var(--ink);font-size:18px;font-weight:950}.price small{color:var(--muted);font-size:9px;font-weight:700}.reason{margin-top:9px;color:var(--muted);font-size:11px;line-height:1.55}.proof-row{gap:8px;margin-top:13px}.proof-row view{flex:1;padding:8px;border-radius:11px;background:#f7f8fb}.proof-row b,.proof-row span{display:block}.proof-row b{font-size:13px;font-weight:950}.proof-row span{margin-top:2px;color:var(--muted);font-size:8px}
.reservation-card{margin-top:13px;padding:17px;border:1px solid #dfdcff;border-radius:23px;background:linear-gradient(145deg,#f7f5ff,#fff);box-shadow:0 10px 24px rgba(103,92,246,.08)}.reservation-head{gap:10px}.reservation-icon{width:36px;height:36px;justify-content:center;border-radius:12px;background:#e7f8f2;color:var(--mint);font-weight:950}.reservation-title{margin-top:3px;font-size:16px;font-weight:900}.risk-badge{margin-left:auto;padding:6px 8px;border-radius:8px;background:#eceaff;color:var(--indigo);font-size:9px;font-weight:900}.reservation-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px}.reservation-grid>view{padding:9px;border-radius:12px;background:#fff}.detail-label{color:var(--muted);font-size:8px}.detail-value{margin-top:4px;font-size:11px;font-weight:850}.note-line{margin-top:10px;padding:10px 11px;border-radius:11px;background:#fff7e8;color:#8a5a11;font-size:9px}.note-line text,.note-line b{display:block}.note-line b{margin-top:3px}.consumer-action{margin-top:14px}.safety-note{margin-top:9px;text-align:center;color:var(--muted-light);font-size:9px}
.bottom-nav{position:absolute;left:14px;right:14px;bottom:12px;height:66px;justify-content:space-around;border:1px solid rgba(16,24,40,.06);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 16px 40px rgba(16,24,40,.13);backdrop-filter:blur(16px)}.nav-item{min-width:48px;flex-direction:column;gap:4px;color:#98a2b3;font-size:9px}.nav-icon{font-size:18px;font-weight:800}.nav-item.active{color:var(--indigo);font-weight:850}
</style>
