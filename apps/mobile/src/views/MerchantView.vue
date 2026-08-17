<script setup lang="ts">
import { computed } from 'vue'
import type { ExperienceSnapshot } from '@lequ/contracts'
import ActionButton from '../components/ActionButton.vue'

const props = defineProps<{ snapshot: ExperienceSnapshot; busy: boolean }>()
defineEmits<{ advance: [] }>()

const ownsNextStep = computed(() => props.snapshot.nextStep?.role === 'merchant')
const ctaLabel = computed(() => ownsNextStep.value ? props.snapshot.nextStep?.actionLabel ?? '确认' : props.snapshot.completedSteps >= 11 ? '预约已进入履约队列' : '等待消费者确认')
const dateLabel = computed(() => {
  const value = props.snapshot.reservation?.reservationAt
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})
</script>

<template>
  <view class="screen merchant-screen">
    <view class="status-bar"><text>09:41</text><text>5G · 100%</text></view>
    <view class="screen-body">
      <view class="topbar">
        <view>
          <text class="product-name">经营宝</text>
          <text class="location">{{ snapshot.merchant?.name ?? '云和里·静安店' }}</text>
        </view>
        <view class="avatar">云</view>
      </view>

      <view class="greeting-row">
        <view>
          <text class="eyebrow">WEDNESDAY · LIVE</text>
          <text class="page-title">早上好，<br />今天状态很稳</text>
        </view>
        <view class="open-pill"><text /> 营业中</view>
      </view>

      <view class="revenue-card">
        <view class="revenue-glow" />
        <view class="revenue-top"><text>今日实收</text><text class="trend">↗ 12.6%</text></view>
        <text class="revenue-value">¥18,762<small>.00</small></text>
        <view class="revenue-metrics">
          <view><b>128</b><span>订单</span></view>
          <view><b>96.4%</b><span>核销率</span></view>
          <view><b>23</b><span>新会员</span></view>
        </view>
      </view>

      <view class="ai-advice">
        <view class="ai-symbol">✦</view>
        <view class="ai-copy">
          <text class="card-kicker">AI 今日结论</text>
          <text class="advice-title">晚餐时段还有 2 桌高价值空档</text>
          <text class="advice-sub">新预约与门店空档高度匹配，建议优先确认。</text>
        </view>
      </view>

      <view class="section-head">
        <view><text class="section-kicker">TODAY'S PRIORITY</text><text class="section-title">最该处理的事</text></view>
        <text class="count-badge">1 项</text>
      </view>

      <view v-if="snapshot.reservation" class="order-card">
        <view class="order-status-row">
          <view class="status-mark"><text class="pulse" /></view>
          <text class="new-label">AI 新预约</text>
          <text class="received-time">刚刚</text>
        </view>
        <text class="customer-name">{{ snapshot.reservation.customerName }} · 4 位</text>
        <view class="order-details">
          <view><text class="detail-label">到店时间</text><text class="detail-value">{{ dateLabel }}</text></view>
          <view><text class="detail-label">偏好备注</text><text class="detail-value">临窗安静座位</text></view>
        </view>
        <view class="allergy-note"><text class="alert-icon">!</text><view><b>饮食禁忌</b><span>一位客人不食花生，请后厨留意。</span></view></view>
        <ActionButton :label="ctaLabel" :busy="busy" :disabled="!ownsNextStep" tone="mint" @click="$emit('advance')" />
      </view>

      <view v-else class="empty-order">
        <view class="empty-orb">◎</view>
        <text class="empty-title">等待一份真实预约</text>
        <text class="empty-copy">消费者确认后，订单会带着完整偏好与审计证据出现在这里。</text>
        <ActionButton :label="ctaLabel" disabled tone="mint" />
      </view>
    </view>

    <view class="bottom-nav">
      <view class="nav-item active"><text class="nav-icon">⌂</text><text>今日</text></view>
      <view class="nav-item"><text class="nav-icon">▤</text><text>经营</text></view>
      <view class="nav-item"><text class="nav-icon">◇</text><text>消息</text></view>
      <view class="nav-item"><text class="nav-icon">○</text><text>我的</text></view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.screen{position:relative;min-height:820px;padding-bottom:88px;background:linear-gradient(180deg,#edfaf6 0,#f5f8f7 260px,#f6f8fb 100%)}
.status-bar,.topbar,.greeting-row,.open-pill,.revenue-top,.revenue-metrics,.ai-advice,.ai-symbol,.section-head,.order-status-row,.order-details,.allergy-note,.empty-order,.empty-orb,.bottom-nav,.nav-item{display:flex;align-items:center}.status-bar{height:32px;justify-content:space-between;padding:8px 22px 0;color:var(--ink);font-size:11px;font-weight:800}.screen-body{padding:0 20px 26px}.topbar{height:62px;justify-content:space-between}.product-name,.location,.eyebrow,.page-title,.revenue-value,.card-kicker,.advice-title,.advice-sub,.section-kicker,.section-title,.customer-name,.detail-label,.detail-value,.empty-title,.empty-copy{display:block}.product-name{font-size:18px;font-weight:900}.location{margin-top:3px;color:var(--muted);font-size:12px}.avatar{display:flex;width:40px;height:40px;align-items:center;justify-content:center;border-radius:14px;background:linear-gradient(135deg,#4ed2b0,#0f8e72);color:#fff;font-weight:900;box-shadow:0 8px 20px rgba(22,185,140,.2)}
.greeting-row{justify-content:space-between;margin:12px 2px 20px;align-items:flex-end}.eyebrow,.card-kicker,.section-kicker{color:var(--mint);font-size:10px;font-weight:900;letter-spacing:.14em}.page-title{margin-top:8px;font-size:31px;line-height:1.18;font-weight:950;letter-spacing:-.04em}.open-pill{gap:6px;padding:9px 10px;border-radius:12px;background:#fff;color:#147b61;font-size:10px;font-weight:850;box-shadow:var(--shadow-sm)}.open-pill text{width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgba(22,185,140,.1)}
.revenue-card{position:relative;overflow:hidden;padding:22px;border-radius:28px;background:linear-gradient(145deg,#075746,#0a8c6e 58%,#18b98b);color:#fff;box-shadow:0 22px 48px rgba(10,119,93,.26)}.revenue-glow{position:absolute;width:210px;height:210px;right:-80px;top:-100px;border-radius:50%;background:rgba(100,238,202,.22)}.revenue-top{position:relative;justify-content:space-between;color:rgba(255,255,255,.65);font-size:12px}.trend{padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.12);color:#a6f6df;font-size:10px;font-weight:850}.revenue-value{position:relative;margin-top:10px;font-size:37px;font-weight:950;letter-spacing:-.04em}.revenue-value small{font-size:18px}.revenue-metrics{position:relative;justify-content:space-between;margin-top:20px;padding-top:17px;border-top:1px solid rgba(255,255,255,.13)}.revenue-metrics view{width:30%}.revenue-metrics b,.revenue-metrics span{display:block}.revenue-metrics b{font-size:16px}.revenue-metrics span{margin-top:3px;color:rgba(255,255,255,.5);font-size:9px}
.ai-advice{gap:12px;margin-top:14px;padding:15px;border:1px solid rgba(16,185,140,.12);border-radius:21px;background:#fff;box-shadow:var(--shadow-sm)}.ai-symbol{width:42px;height:42px;flex:0 0 42px;justify-content:center;border-radius:14px;background:#e5f8f2;color:var(--mint);font-size:19px}.ai-copy{min-width:0}.advice-title{margin-top:4px;font-size:13px;font-weight:900}.advice-sub{margin-top:4px;color:var(--muted);font-size:10px;line-height:1.4}
.section-head{justify-content:space-between;margin:20px 2px 10px}.section-title{margin-top:4px;font-size:19px;font-weight:900}.count-badge{padding:7px 9px;border-radius:9px;background:#e6f8f2;color:#138061;font-size:9px;font-weight:850}.order-card,.empty-order{padding:18px;border:1px solid rgba(16,24,40,.05);border-radius:24px;background:#fff;box-shadow:var(--shadow-sm)}.order-status-row{font-size:10px}.status-mark{display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:8px;background:#e7f8f2}.pulse{width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgba(22,185,140,.1)}.new-label{margin-left:7px;color:var(--mint);font-weight:900}.received-time{margin-left:auto;color:var(--muted-light)}.customer-name{margin-top:14px;font-size:22px;font-weight:950}.order-details{gap:10px;margin-top:13px}.order-details>view{flex:1;padding:11px;border-radius:13px;background:#f7f8fa}.detail-label{color:var(--muted);font-size:8px}.detail-value{margin-top:5px;font-size:11px;font-weight:850}.allergy-note{gap:9px;margin:11px 0 15px;padding:10px;border-radius:13px;background:#fff6e8;color:#83530c}.alert-icon{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:8px;background:#f6a723;color:#fff;font-size:11px;font-weight:950}.allergy-note b,.allergy-note span{display:block}.allergy-note b{font-size:10px}.allergy-note span{margin-top:3px;font-size:9px}.empty-order{flex-direction:column;text-align:center}.empty-orb{width:56px;height:56px;justify-content:center;border-radius:18px;background:#e5f8f2;color:var(--mint);font-size:24px}.empty-title{margin-top:14px;font-size:18px;font-weight:900}.empty-copy{margin:8px 0 17px;color:var(--muted);font-size:12px;line-height:1.55}
.bottom-nav{position:absolute;left:14px;right:14px;bottom:12px;height:66px;justify-content:space-around;border:1px solid rgba(16,24,40,.06);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 16px 40px rgba(16,24,40,.13);backdrop-filter:blur(16px)}.nav-item{min-width:56px;flex-direction:column;gap:4px;color:#98a2b3;font-size:10px}.nav-icon{font-size:19px;font-weight:800}.nav-item.active{color:var(--mint);font-weight:850}
</style>
