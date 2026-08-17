<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import type { MerchantOperationsOverview, MerchantOrderChannel } from '@lequ/contracts'
import { fetchMerchantOverview } from '../../services/merchant'

const overview = ref<MerchantOperationsOverview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const selectedRange = ref<'7D' | 'TODAY'>('7D')
const selectedDimension = ref<'REVENUE' | 'ORDERS'>('REVENUE')

const maxTrend = computed(() => Math.max(
  1,
  ...(overview.value?.analytics.revenueTrend.map((item) => (
    selectedDimension.value === 'REVENUE' ? item.revenueFen : item.orderCount
  )) ?? [1]),
))
const maxHourly = computed(() => Math.max(
  1,
  ...(overview.value?.analytics.hourlyRevenue.map((item) => item.revenueFen) ?? [1]),
))
const channelLabels: Record<MerchantOrderChannel, string> = {
  MINIAPP: '商家小程序',
  SKILL: 'AI Skill',
  POS: '线下 POS',
  MARKETPLACE: '三方平台',
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchMerchantOverview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '经营分析加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(fen / 100)
}

function shortDay(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function trendHeight(revenueFen: number, orderCount: number): string {
  const value = selectedDimension.value === 'REVENUE' ? revenueFen : orderCount
  return `${Math.max(12, Math.round(value / maxTrend.value * 100))}%`
}

function openOrders(): void {
  uni.navigateTo({ url: '/pages/orders/index' })
}
</script>

<template>
  <view class="analytics-page">
    <header class="page-header">
      <button class="back" @click="goBack">‹</button>
      <view><text class="header-kicker">BUSINESS INTELLIGENCE</text><text class="header-title">经营分析</text></view>
      <button class="calendar">{{ selectedRange === '7D' ? '7日' : '今日' }}</button>
    </header>

    <main v-if="overview" class="content">
      <section class="hero">
        <view class="hero-top">
          <view><text class="hero-label">近 7 日累计实收</text><text class="hero-value">¥{{ money(overview.analytics.revenueTrend.reduce((sum, item) => sum + item.revenueFen, 0)) }}</text></view>
          <view class="growth"><text>↗</text><view><strong>+8.7%</strong><small>环比前 7 日</small></view></view>
        </view>
        <view class="hero-insight">
          <view class="ai-mark">✦</view>
          <text>晚餐时段贡献最高，18:00–20:00 占已观测收入的 45.1%。</text>
        </view>
      </section>

      <section class="chart-card">
        <view class="card-head">
          <view><text class="card-kicker">PERFORMANCE</text><text class="card-title">经营趋势</text></view>
          <view class="segment">
            <button :class="{ active: selectedDimension === 'REVENUE' }" @click="selectedDimension = 'REVENUE'">收入</button>
            <button :class="{ active: selectedDimension === 'ORDERS' }" @click="selectedDimension = 'ORDERS'">订单</button>
          </view>
        </view>
        <view class="trend-summary">
          <text>{{ selectedDimension === 'REVENUE' ? '今日实收' : '今日订单' }}</text>
          <strong>{{ selectedDimension === 'REVENUE' ? `¥${money(overview.metrics.revenueFen)}` : overview.metrics.orderCount }}</strong>
          <text>较昨日 +{{ (overview.metrics.revenueDeltaBps / 100).toFixed(1) }}%</text>
        </view>
        <view class="chart-area">
          <view
            v-for="item in overview.analytics.revenueTrend"
            :key="item.date"
            class="bar-column"
          >
            <view class="bar-value">{{ selectedDimension === 'REVENUE' ? `${Math.round(item.revenueFen / 10000) / 10}k` : item.orderCount }}</view>
            <view class="bar-track"><view class="bar-fill" :style="{ height: trendHeight(item.revenueFen, item.orderCount) }" /></view>
            <text>{{ shortDay(item.date) }}</text>
          </view>
        </view>
      </section>

      <section class="funnel-card">
        <view class="card-head">
          <view><text class="card-kicker violet">CUSTOMER JOURNEY</text><text class="card-title">今日转化漏斗</text></view>
          <text class="rule-tag">last-touch v1</text>
        </view>
        <view class="funnel-steps">
          <view class="funnel-step wide">
            <view><text>到访</text><strong>{{ overview.analytics.funnel.visitors }}</strong></view>
            <text>100%</text>
          </view>
          <view class="funnel-arrow">↓ <text>{{ overview.analytics.funnel.conversionRate }}%</text></view>
          <view class="funnel-step middle">
            <view><text>下单</text><strong>{{ overview.analytics.funnel.orderCount }}</strong></view>
            <text>{{ overview.analytics.funnel.conversionRate }}%</text>
          </view>
          <view class="funnel-arrow">↓ <text>{{ overview.analytics.funnel.verificationRate }}%</text></view>
          <view class="funnel-step narrow">
            <view><text>完成核销</text><strong>{{ overview.analytics.funnel.verifiedCount }}</strong></view>
            <text>{{ overview.analytics.funnel.verificationRate }}%</text>
          </view>
        </view>
        <button class="drill-button" @click="openOrders">钻取核销订单明细 <text>→</text></button>
      </section>

      <section class="channel-card">
        <view class="card-head">
          <view><text class="card-kicker blue">ATTRIBUTION</text><text class="card-title">渠道贡献</text></view>
          <text class="rule-tag">最近订单样本</text>
        </view>
        <view class="channel-list">
          <view v-for="(channel, index) in overview.analytics.channelMix" :key="channel.channel" class="channel-row">
            <view :class="['channel-icon', `tone-${index}`]">{{ channel.channel === 'MINIAPP' ? '微' : channel.channel === 'SKILL' ? 'S' : channel.channel === 'POS' ? 'P' : '渠' }}</view>
            <view class="channel-copy">
              <view><text>{{ channelLabels[channel.channel] }}</text><strong>{{ channel.share }}%</strong></view>
              <view class="progress"><i :style="{ width: `${channel.share}%` }" /></view>
              <text>{{ channel.orderCount }} 笔 · ¥{{ money(channel.revenueFen) }}</text>
            </view>
          </view>
        </view>
      </section>

      <section class="hour-card">
        <view class="card-head">
          <view><text class="card-kicker orange">TIME SLOT</text><text class="card-title">时段表现</text></view>
          <text class="rule-tag">今日</text>
        </view>
        <view class="hour-chart">
          <view v-for="item in overview.analytics.hourlyRevenue" :key="item.hour" class="hour-column">
            <text>¥{{ money(item.revenueFen) }}</text>
            <view><i :style="{ height: `${Math.max(12, item.revenueFen / maxHourly * 100)}%` }" /></view>
            <small>{{ item.hour }}</small>
          </view>
        </view>
      </section>

      <section class="ai-card">
        <view class="ai-orb">✦</view>
        <view class="ai-copy">
          <text>AI 经营解读</text>
          <strong>午餐转化仍有提升空间</strong>
          <small>12:00 访问充足，但套餐详情到下单低于晚餐 2.1 个百分点。建议先补齐 3 个高浏览套餐的场景主图。</small>
          <view><text>依据：访问 328 次 · 下单 21 笔</text><text>风险 L1</text></view>
        </view>
      </section>

      <text class="footnote">指标口径：实收按支付完成时间；渠道采用 last-touch v1；趋势不构成收益承诺。</text>
    </main>

    <view v-else-if="loading" class="state"><view class="spinner">↗</view><text>正在计算经营趋势与归因…</text></view>
    <view v-else class="state"><text class="state-title">经营分析暂不可用</text><text>{{ errorMessage }}</text><button @click="load">重试</button></view>
  </view>
</template>

<style scoped lang="scss">
button { margin: 0; padding: 0; border: 0; line-height: inherit; } button::after { display: none; }
.analytics-page { min-height: 100vh; background: #f3f6f5; color: #13231f; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
.page-header { display: grid; height: 76px; grid-template-columns: 42px 1fr 42px; align-items: center; padding: calc(env(safe-area-inset-top) + 10px) 18px 8px; }
.back, .calendar { display: flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 13px; background: #fff; box-shadow: 0 8px 20px rgba(20,58,49,.07); color: #203a34; }
.back { font-size: 28px; }.calendar { justify-self: end; background: #193d35; color: #fff; font-size: 9px; font-weight: 850; }
.header-kicker, .header-title { display: block; text-align: center; }.header-kicker { color: #159b7b; font-size: 7px; font-weight: 900; letter-spacing: .14em; }.header-title { margin-top: 3px; font-size: 18px; font-weight: 950; }
.content { padding: 10px 18px calc(35px + env(safe-area-inset-bottom)); }
.hero { position: relative; overflow: hidden; padding: 22px; border-radius: 27px; background: linear-gradient(145deg, #092a24, #0c745b); box-shadow: 0 22px 46px rgba(9,70,55,.21); color: #fff; }
.hero::after { position: absolute; top: -80px; right: -45px; width: 180px; height: 180px; border-radius: 50%; background: rgba(66,238,187,.25); filter: blur(43px); content: ''; }
.hero-top { position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: space-between; }
.hero-label, .hero-value { display: block; }.hero-label { color: rgba(255,255,255,.58); font-size: 9px; }.hero-value { margin-top: 7px; font-size: 31px; font-weight: 950; letter-spacing: -.035em; }
.growth { display: flex; align-items: center; gap: 7px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.11); border-radius: 13px; background: rgba(255,255,255,.08); }.growth > text { color: #6ae3c0; font-size: 17px; }.growth strong, .growth small { display: block; }.growth strong { color: #79ebca; font-size: 10px; }.growth small { margin-top: 2px; color: rgba(255,255,255,.46); font-size: 7px; }
.hero-insight { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; margin-top: 20px; padding: 12px; border-radius: 15px; background: rgba(0,0,0,.13); color: rgba(255,255,255,.74); font-size: 9px; line-height: 1.5; }
.ai-mark { display: flex; width: 29px; height: 29px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 10px; background: #5bd9b5; color: #09392e; font-size: 12px; }
.chart-card, .funnel-card, .channel-card, .hour-card { margin-top: 13px; padding: 18px; border: 1px solid rgba(22,58,49,.045); border-radius: 24px; background: #fff; box-shadow: 0 10px 26px rgba(19,59,49,.05); }
.card-head { display: flex; align-items: flex-end; justify-content: space-between; }.card-kicker, .card-title { display: block; }.card-kicker { color: #0b9c78; font-size: 7px; font-weight: 900; letter-spacing: .13em; }.card-kicker.violet { color: #665ce8; }.card-kicker.blue { color: #3976dc; }.card-kicker.orange { color: #d87022; }.card-title { margin-top: 4px; font-size: 17px; font-weight: 950; }
.segment { display: flex; padding: 3px; border-radius: 10px; background: #eef2f0; }.segment button { padding: 6px 9px; border-radius: 8px; background: transparent; color: #84908c; font-size: 8px; }.segment button.active { background: #fff; box-shadow: 0 4px 10px rgba(30,60,52,.08); color: #173c33; font-weight: 850; }
.trend-summary { display: flex; align-items: baseline; gap: 7px; margin-top: 18px; }.trend-summary text:first-child { color: #85908c; font-size: 8px; }.trend-summary strong { font-size: 22px; }.trend-summary text:last-child { color: #079c77; font-size: 8px; font-weight: 800; }
.chart-area { display: flex; height: 170px; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 12px; padding-top: 18px; border-bottom: 1px solid #e8eeeb; background: repeating-linear-gradient(to bottom, transparent 0, transparent 41px, #f0f4f2 42px); }
.bar-column { display: flex; height: 100%; flex: 1; flex-direction: column; align-items: center; justify-content: flex-end; }.bar-value { margin-bottom: 5px; color: #79908a; font-size: 6px; }.bar-track { display: flex; width: 68%; min-width: 15px; height: 115px; align-items: flex-end; }.bar-fill { width: 100%; min-height: 9px; border-radius: 7px 7px 2px 2px; background: linear-gradient(to top, #0c9472, #50d0aa); box-shadow: 0 6px 11px rgba(12,148,114,.13); }.bar-column > text { margin-top: 7px; color: #8b9692; font-size: 7px; }
.rule-tag { color: #929d99; font-size: 7px; }
.funnel-steps { display: flex; flex-direction: column; align-items: center; margin-top: 18px; }
.funnel-step { display: flex; align-items: center; justify-content: space-between; height: 46px; padding: 0 14px; border-radius: 13px; color: #fff; }.funnel-step.wide { width: 100%; background: #176e5a; }.funnel-step.middle { width: 82%; background: #399c82; }.funnel-step.narrow { width: 67%; background: #74c7ad; color: #103f33; }
.funnel-step view { display: flex; align-items: baseline; gap: 8px; }.funnel-step text { font-size: 8px; }.funnel-step strong { font-size: 16px; }.funnel-arrow { height: 29px; color: #a5afac; font-size: 11px; line-height: 29px; }.funnel-arrow text { margin-left: 6px; color: #6d7c77; font-size: 7px; }
.drill-button { display: flex; width: 100%; height: 39px; align-items: center; justify-content: space-between; margin-top: 14px; padding: 0 13px; border-radius: 12px; background: #edf8f4; color: #087d61; font-size: 9px; font-weight: 850; }
.channel-list { display: grid; gap: 16px; margin-top: 20px; }.channel-row { display: flex; align-items: center; gap: 11px; }.channel-icon { display: flex; width: 36px; height: 36px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 12px; background: #e2f8f0; color: #078467; font-size: 10px; font-weight: 900; }.tone-1 { background: #efedff; color: #655cf4; }.tone-2 { background: #fff1e6; color: #d87022; }.tone-3 { background: #e8f1ff; color: #3976dc; }
.channel-copy { min-width: 0; flex: 1; }.channel-copy > view:first-child { display: flex; align-items: center; justify-content: space-between; }.channel-copy > view:first-child text { font-size: 9px; font-weight: 800; }.channel-copy > view:first-child strong { font-size: 9px; }.progress { height: 5px; margin-top: 7px; overflow: hidden; border-radius: 99px; background: #edf1ef; }.progress i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #0c9472, #5bd4b2); }.channel-copy > text { display: block; margin-top: 5px; color: #929d99; font-size: 7px; }
.hour-chart { display: flex; height: 156px; align-items: flex-end; justify-content: space-between; gap: 7px; margin-top: 18px; }.hour-column { display: flex; height: 100%; flex: 1; flex-direction: column; align-items: center; justify-content: flex-end; }.hour-column > text { margin-bottom: 5px; color: #87928e; font-size: 6px; }.hour-column > view { display: flex; width: 62%; height: 104px; align-items: flex-end; }.hour-column i { display: block; width: 100%; border-radius: 7px 7px 2px 2px; background: linear-gradient(to top, #ff9b50, #ffc18e); }.hour-column small { margin-top: 7px; color: #87928e; font-size: 7px; }
.ai-card { display: flex; gap: 13px; margin-top: 13px; padding: 18px; border-radius: 24px; background: linear-gradient(145deg, #302e75, #5a53c9); box-shadow: 0 15px 32px rgba(67,61,157,.19); color: #fff; }.ai-orb { display: flex; width: 39px; height: 39px; flex: 0 0 auto; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(255,255,255,.11); color: #bdb9ff; }.ai-copy { min-width: 0; }.ai-copy > text, .ai-copy > strong, .ai-copy > small { display: block; }.ai-copy > text { color: #bdb9ff; font-size: 7px; font-weight: 850; letter-spacing: .1em; }.ai-copy > strong { margin-top: 7px; font-size: 14px; }.ai-copy > small { margin-top: 7px; color: rgba(255,255,255,.64); font-size: 8px; line-height: 1.65; }.ai-copy > view { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.48); font-size: 7px; }
.footnote { display: block; margin: 18px 6px 0; color: #929d99; font-size: 7px; line-height: 1.6; text-align: center; }
.state { display: flex; min-height: 70vh; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 30px; color: #7b8883; font-size: 10px; text-align: center; }.spinner { display: flex; width: 54px; height: 54px; align-items: center; justify-content: center; border-radius: 18px; background: #0c9674; box-shadow: 0 15px 30px rgba(12,150,116,.24); color: #fff; font-size: 20px; }.state-title { color: #19342d; font-size: 16px; font-weight: 900; }.state button { padding: 10px 18px; border-radius: 12px; background: #19342d; color: #fff; font-size: 10px; }
@media (min-width: 680px) { .content { max-width: 760px; margin: 0 auto; } }
</style>
