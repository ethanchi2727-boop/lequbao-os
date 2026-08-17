<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ProviderCityMerchantMetricSummary,
  ProviderCityMetricPeriod,
  ProviderCityMetricsOverview,
} from '@lequ/contracts'
import { fetchProviderCityMetrics } from '../../services/city-metrics'

type ViewMode = 'COMMAND' | 'NETWORK' | 'DEFINITION'

const overview = ref<ProviderCityMetricsOverview | null>(null)
const loading = ref(true)
const switching = ref(false)
const errorMessage = ref('')
const period = ref<ProviderCityMetricPeriod>('30D')
const viewMode = ref<ViewMode>('COMMAND')

const focus = computed(() => overview.value?.focusMerchant ?? null)
const chartCeiling = computed(() => Math.max(
  1,
  ...(overview.value?.trends ?? []).flatMap((item) => [
    item.serviceRevenueFen,
    item.transactionGmvFen,
  ]),
))
const merchantsByRisk = computed(() => [...(overview.value?.merchants ?? [])].sort((left, right) => {
  const order = { RISK: 0, WATCH: 1, HEALTHY: 2 }
  return order[left.risk] - order[right.risk]
}))

const stageLabels: Record<ProviderCityMerchantMetricSummary['serviceStage'], string> = {
  DELIVERING: '交付中',
  LIVE: '已上线',
  SKILL_ONLINE: 'Skill 在线',
  RENEWAL: '续费窗口',
  LOST: '已流失',
}

const riskLabels: Record<ProviderCityMerchantMetricSummary['risk'], string> = {
  HEALTHY: '健康',
  WATCH: '关注',
  RISK: '风险',
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

function openSettlement(): void {
  uni.navigateTo({ url: '/pages/settlements/index' })
}

function formatMoney(fen: number | null | undefined, compact = false): string {
  if (fen === null || fen === undefined) return '—'
  const yuan = fen / 100
  if (compact && Math.abs(yuan) >= 10000) {
    return `¥${(yuan / 10000).toFixed(yuan % 10000 === 0 ? 0 : 1)}万`
  }
  return `¥${yuan.toLocaleString('zh-CN', {
    maximumFractionDigits: yuan % 1 === 0 ? 0 : 2,
  })}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '暂无'
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function comparisonText(key: keyof ProviderCityMetricsOverview['comparisons'], unit = ''): string {
  const item = overview.value?.comparisons[key]
  if (!item) return '等待上期样本'
  if (item.direction === 'FLAT') return `较上期持平${unit}`
  return `较上期 ${item.delta > 0 ? '+' : ''}${item.delta}${unit}`
}

function comparisonTone(
  key: keyof ProviderCityMetricsOverview['comparisons'],
  lowerIsBetter = false,
): string {
  const item = overview.value?.comparisons[key]
  if (!item || item.direction === 'FLAT') return 'neutral'
  const positive = lowerIsBetter ? item.direction === 'DOWN' : item.direction === 'UP'
  return positive ? 'positive' : 'negative'
}

function barHeight(value: number): string {
  return `${Math.max(value > 0 ? 8 : 2, Math.round(value / chartCeiling.value * 100))}%`
}

async function load(focusLeadId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderCityMetrics({
      period: period.value,
      focusLeadId,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '城市经营数据加载失败'
  } finally {
    loading.value = false
  }
}

async function selectPeriod(next: ProviderCityMetricPeriod): Promise<void> {
  if (switching.value || period.value === next) return
  switching.value = true
  period.value = next
  try {
    overview.value = await fetchProviderCityMetrics({
      period: next,
      focusLeadId: focus.value?.leadId,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '经营周期切换失败'
  } finally {
    switching.value = false
  }
}

async function selectMerchant(leadId: string): Promise<void> {
  if (switching.value || focus.value?.leadId === leadId) return
  switching.value = true
  try {
    overview.value = await fetchProviderCityMetrics({
      period: period.value,
      focusLeadId: leadId,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '商家经营视图加载失败'
  } finally {
    switching.value = false
  }
}

onLoad((query) => {
  const requestedPeriod = typeof query?.period === 'string' ? query.period : ''
  if (requestedPeriod === '30D' || requestedPeriod === '90D' || requestedPeriod === '365D') {
    period.value = requestedPeriod
  }
  const focusLeadId = typeof query?.focusLeadId === 'string' ? query.focusLeadId : undefined
  void load(focusLeadId)
})
</script>

<template>
  <view class="metrics-shell">
    <view class="aurora aurora-one" /><view class="aurora aurora-two" />

    <header class="topbar">
      <button class="back" @click="goBack">‹</button>
      <view class="identity">
        <view class="logo"><i /><b>O</b></view>
        <view><text>City Operating Intelligence</text><small>城市经营驾驶舱</small></view>
      </view>
      <view class="live"><i /> LIVE</view>
    </header>

    <scroll-view scroll-y class="viewport">
      <main class="content">
        <view v-if="errorMessage" class="error-banner">
          <view><b>数据暂未完成同步</b><text>{{ errorMessage }}</text></view>
          <button @click="load(focus?.leadId)">重试</button>
        </view>

        <section class="hero">
          <view class="hero-grid" />
          <view class="hero-copy">
            <view class="hero-kicker"><i /> {{ overview?.city.name ?? '城市中心' }} · VERIFIED FACTS</view>
            <text class="hero-title">一座城市的增长，<br /><em>必须能被事实解释</em></text>
            <text class="hero-desc">签约、交付、续费、Skill 与交易共同构成一张经营真相图。这里不展示预计收入，也不把调用量冒充 GMV。</text>
            <view class="periods">
              <button
                v-for="item in (['30D', '90D', '365D'] as ProviderCityMetricPeriod[])"
                :key="item"
                :class="{ active: period === item }"
                @click="selectPeriod(item)"
              >
                {{ item === '30D' ? '近 30 天' : item === '90D' ? '近 90 天' : '近一年' }}
              </button>
            </view>
          </view>
          <view class="hero-score">
            <view class="score-orbit">
              <view class="ring ring-a" /><view class="ring ring-b" />
              <view class="score-core">
                <small>ACTIVE RATE</small>
                <text>{{ overview?.metrics.activeMerchantRate ?? '—' }}<i>%</i></text>
                <b>城市商家活跃率</b>
              </view>
              <view class="satellite sat-a"><b>{{ overview?.metrics.totalMerchants ?? '—' }}</b><small>服务商家</small></view>
              <view class="satellite sat-b"><b>{{ overview?.metrics.onlineSkills ?? '—' }}</b><small>在线 Skill</small></view>
            </view>
            <text class="verified"><i>✓</i> 仅计确认业务事实</text>
          </view>
        </section>

        <nav class="view-tabs">
          <button :class="{ active: viewMode === 'COMMAND' }" @click="viewMode = 'COMMAND'"><i>01</i>经营总览</button>
          <button :class="{ active: viewMode === 'NETWORK' }" @click="viewMode = 'NETWORK'"><i>02</i>商家网络</button>
          <button :class="{ active: viewMode === 'DEFINITION' }" @click="viewMode = 'DEFINITION'"><i>03</i>指标口径</button>
          <button class="settlement-link" @click="openSettlement"><i>¥</i>收益结算 <b>↗</b></button>
        </nav>

        <view v-if="loading" class="loading-state">
          <view class="loading-orb" /><b>正在合并六个权威业务域</b><text>CRM · 交付 · 续费 · Skill · 交易 · 代金券</text>
        </view>

        <template v-else-if="overview && viewMode === 'COMMAND'">
          <section class="metric-grid">
            <article class="metric-card primary">
              <view class="metric-head"><span>CONFIRMED REVENUE</span><i>¥</i></view>
              <text class="metric-value">{{ formatMoney(overview.metrics.serviceRevenueFen, true) }}</text>
              <b>确认服务收入</b>
              <view class="metric-foot">
                <text :class="comparisonTone('serviceRevenueFen')">{{ comparisonText('serviceRevenueFen', ' 分') }}</text>
                <small>签约 {{ formatMoney(overview.metrics.signingRevenueFen, true) }} · 续费 {{ formatMoney(overview.metrics.renewalRevenueFen, true) }}</small>
              </view>
            </article>
            <article class="metric-card">
              <view class="metric-head"><span>RENEWAL</span><i>↻</i></view>
              <text class="metric-value">{{ overview.metrics.renewalRate }}<em>%</em></text>
              <b>周期续费率</b>
              <view class="metric-foot">
                <text :class="comparisonTone('renewalRate')">{{ comparisonText('renewalRate', 'pp') }}</text>
                <small>{{ overview.metrics.renewedCases }} 个续费 / {{ overview.metrics.closedRenewalCases }} 个关闭样本</small>
              </view>
            </article>
            <article class="metric-card">
              <view class="metric-head"><span>DELIVERY VELOCITY</span><i>⏱</i></view>
              <text class="metric-value">{{ overview.metrics.averageDeliveryHours ?? '—' }}<em v-if="overview.metrics.averageDeliveryHours !== null">h</em></text>
              <b>平均交付时长</b>
              <view class="metric-foot">
                <text :class="comparisonTone('averageDeliveryHours', true)">{{ comparisonText('averageDeliveryHours', 'h') }}</text>
                <small>{{ overview.metrics.deliveredCases }} 个完整样本 · 目标 {{ overview.metrics.deliveryTargetHours }}h</small>
              </view>
            </article>
            <article class="metric-card">
              <view class="metric-head"><span>TRANSACTION GMV</span><i>↗</i></view>
              <text class="metric-value">{{ formatMoney(overview.metrics.transactionGmvFen, true) }}</text>
              <b>确认交易 GMV</b>
              <view class="metric-foot">
                <text :class="comparisonTone('transactionGmvFen')">{{ comparisonText('transactionGmvFen', ' 分') }}</text>
                <small>{{ overview.metrics.transactionOrders }} 笔确认事实 · Skill 占 {{ overview.metrics.skillGmvShare }}%</small>
              </view>
            </article>
          </section>

          <section class="operating-grid">
            <article class="panel trend-panel">
              <view class="panel-head">
                <view><small>OPERATING PULSE</small><h2>城市增长脉冲</h2></view>
                <view class="legend"><span><i class="revenue" />服务收入</span><span><i class="gmv" />交易 GMV</span></view>
              </view>
              <view class="chart">
                <view v-for="item in overview.trends" :key="item.from" class="chart-column">
                  <view class="bars">
                    <i class="bar revenue" :style="{ height: barHeight(item.serviceRevenueFen) }"><b>{{ formatMoney(item.serviceRevenueFen, true) }}</b></i>
                    <i class="bar gmv" :style="{ height: barHeight(item.transactionGmvFen) }"><b>{{ formatMoney(item.transactionGmvFen, true) }}</b></i>
                  </view>
                  <text>{{ item.label }}</text>
                  <small>{{ item.activeMerchants }} 活跃</small>
                </view>
              </view>
              <view class="chart-baseline"><i /><text>数据周期：{{ formatDate(overview.period.from) }} 至 {{ formatDate(overview.period.to) }}</text></view>
            </article>

            <article class="panel signals-panel">
              <view class="panel-head">
                <view><small>AI EXPLAINED SIGNALS</small><h2>经营信号</h2></view>
                <span class="fact-badge">事实驱动</span>
              </view>
              <view class="signal-list">
                <view v-for="item in overview.insights" :key="item.id" class="signal" :class="item.tone.toLowerCase()">
                  <i>{{ item.tone === 'POSITIVE' ? '↗' : item.tone === 'RISK' ? '!' : '·' }}</i>
                  <view><b>{{ item.title }}</b><text>{{ item.detail }}</text><small>{{ item.evidence }}</small></view>
                </view>
              </view>
            </article>
          </section>

          <section class="quality-strip">
            <article>
              <view class="quality-icon skill">S</view>
              <view><small>SKILL TRADABLE</small><b>{{ overview.metrics.skillTradableRate }}%</b><text>{{ overview.metrics.onlineSkills }} / {{ overview.metrics.totalSkills }} 项能力在线</text></view>
              <i class="quality-ring" :style="{ '--value': `${overview.metrics.skillTradableRate}%` }" />
            </article>
            <article>
              <view class="quality-icon voucher">券</view>
              <view><small>VOUCHER ADOPTION</small><b>{{ overview.metrics.voucherAdoptionRate }}%</b><text>{{ overview.metrics.voucherMerchants }} / {{ overview.metrics.transactingMerchants }} 家交易商家启用</text></view>
              <i class="quality-ring voucher-ring" :style="{ '--value': `${overview.metrics.voucherAdoptionRate}%` }" />
            </article>
            <article>
              <view class="quality-icon active">活</view>
              <view><small>MERCHANT ACTIVITY</small><b>{{ overview.metrics.activeMerchants }}</b><text>{{ overview.metrics.totalMerchants }} 家服务商家中的活跃数</text></view>
              <i class="quality-ring active-ring" :style="{ '--value': `${overview.metrics.activeMerchantRate}%` }" />
            </article>
          </section>

          <section class="panel merchant-preview">
            <view class="panel-head">
              <view><small>MERCHANT NETWORK</small><h2>经营风险优先队列</h2></view>
              <button @click="viewMode = 'NETWORK'">查看全部 →</button>
            </view>
            <view class="merchant-table">
              <view class="merchant-row row-head"><span>商家 / 负责人</span><span>服务状态</span><span>健康分</span><span>服务收入</span><span>交易 GMV</span><span>下一动作</span></view>
              <button
                v-for="merchant in merchantsByRisk.slice(0, 5)"
                :key="merchant.leadId"
                class="merchant-row"
                @click="selectMerchant(merchant.leadId)"
              >
                <span class="merchant-name"><i :class="merchant.risk">{{ merchant.merchantName.slice(0, 1) }}</i><b>{{ merchant.merchantName }}<small>{{ merchant.ownerName }}</small></b></span>
                <span><em class="stage">{{ stageLabels[merchant.serviceStage] }}</em><small :class="`risk ${merchant.risk}`">{{ riskLabels[merchant.risk] }}</small></span>
                <span class="score">{{ merchant.healthScore ?? '—' }}</span>
                <span>{{ formatMoney(merchant.serviceRevenueFen, true) }}</span>
                <span>{{ formatMoney(merchant.transactionGmvFen, true) }}</span>
                <span class="next">{{ merchant.nextAction }}<i>→</i></span>
              </button>
            </view>
          </section>
        </template>

        <template v-else-if="overview && viewMode === 'NETWORK'">
          <section class="network-layout">
            <article class="panel network-list">
              <view class="panel-head">
                <view><small>CITY MERCHANT GRAPH</small><h2>{{ overview.metrics.totalMerchants }} 家服务商家</h2></view>
                <span class="scope-lock">⌾ 城市范围已锁定</span>
              </view>
              <button
                v-for="merchant in merchantsByRisk"
                :key="merchant.leadId"
                class="network-card"
                :class="{ selected: focus?.leadId === merchant.leadId }"
                @click="selectMerchant(merchant.leadId)"
              >
                <view class="network-avatar" :class="merchant.risk">{{ merchant.merchantName.slice(0, 1) }}</view>
                <view class="network-main">
                  <view><b>{{ merchant.merchantName }}</b><span :class="merchant.risk">{{ riskLabels[merchant.risk] }}</span></view>
                  <text>{{ merchant.category }} · {{ merchant.ownerName }}</text>
                  <small>{{ stageLabels[merchant.serviceStage] }} · 最近活动 {{ formatDate(merchant.lastActivityAt) }}</small>
                </view>
                <view class="network-score"><small>HEALTH</small><b>{{ merchant.healthScore ?? '—' }}</b><i>›</i></view>
              </button>
            </article>

            <article v-if="focus" class="panel focus-panel">
              <view class="focus-hero" :class="focus.risk.toLowerCase()">
                <small>MERCHANT OPERATING PROFILE</small>
                <h2>{{ focus.merchantName }}</h2>
                <text>{{ focus.category }} · {{ focus.ownerName }}</text>
                <view><span>{{ stageLabels[focus.serviceStage] }}</span><span>{{ focus.packageCode ?? '未定套餐' }}</span><span>{{ riskLabels[focus.risk] }}</span></view>
              </view>
              <view class="focus-metrics">
                <view><small>服务收入</small><b>{{ formatMoney(focus.serviceRevenueFen, true) }}</b></view>
                <view><small>交易 GMV</small><b>{{ formatMoney(focus.transactionGmvFen, true) }}</b></view>
                <view><small>健康分</small><b>{{ focus.healthScore ?? '—' }}</b></view>
              </view>
              <view class="focus-section">
                <small>VERIFIED ACTIVITY</small><h3>活跃证据</h3>
                <view v-if="focus.activityEvidence.length" class="evidence-list">
                  <view v-for="fact in focus.activityEvidence" :key="fact"><i>✓</i><text>{{ fact }}</text></view>
                </view>
                <view v-else class="empty-evidence">当前周期还没有形成新的业务事件</view>
              </view>
              <view class="focus-next">
                <small>NEXT BEST ACTION</small><b>{{ focus.nextAction }}</b>
                <text v-if="focus.renewalDaysRemaining !== null">服务周期剩余 {{ focus.renewalDaysRemaining }} 天</text>
                <text v-else>当前没有续费周期数据</text>
              </view>
            </article>
          </section>

          <section class="panel category-panel">
            <view class="panel-head">
              <view><small>CATEGORY MIX</small><h2>行业结构与经营贡献</h2></view>
              <span>服务收入 / 交易基数均为确认净额</span>
            </view>
            <view class="category-grid">
              <view v-for="item in overview.categories" :key="item.category" class="category-card">
                <view><b>{{ item.category }}</b><span>{{ item.activeMerchants }}/{{ item.merchants }} 活跃</span></view>
                <i><em :style="{ width: `${item.merchants / Math.max(overview.metrics.totalMerchants, 1) * 100}%` }" /></i>
                <text>服务 {{ formatMoney(item.serviceRevenueFen, true) }}</text>
                <text>交易 {{ formatMoney(item.transactionGmvFen, true) }}</text>
              </view>
            </view>
          </section>
        </template>

        <template v-else-if="overview && viewMode === 'DEFINITION'">
          <section class="definition-hero">
            <view><small>METRIC GOVERNANCE</small><h2>每个数字，都能回到它的来源</h2><text>冻结口径 {{ overview.policy.version }} · 不计预计收入 · 城市范围在 SQL 层生效</text></view>
            <view class="policy-seal"><i>✓</i><b>8</b><small>VERIFIED<br />DEFINITIONS</small></view>
          </section>
          <section class="definition-grid">
            <article v-for="(item, index) in overview.methodology" :key="item.metric" class="definition-card">
              <span>0{{ index + 1 }}</span>
              <view><small>{{ item.source }}</small><h3>{{ item.metric }}</h3><text>{{ item.definition }}</text></view>
            </article>
          </section>
          <section class="governance-grid">
            <article class="panel recognition-panel">
              <view class="panel-head"><view><small>RECOGNITION POLICY</small><h2>确认边界</h2></view></view>
              <view><span>服务收入</span><b>{{ overview.policy.revenueRecognition }}</b></view>
              <view><span>交易 GMV</span><b>{{ overview.policy.gmvRecognition }}</b></view>
              <view><span>预计收入</span><b class="denied">明确排除</b></view>
            </article>
            <article class="panel freshness-panel">
              <view class="panel-head"><view><small>DATA FRESHNESS</small><h2>权威域新鲜度</h2></view><span>更新 {{ formatDate(overview.updatedAt) }}</span></view>
              <view v-for="source in overview.freshness" :key="source.source" class="freshness-row">
                <i :class="{ stale: !source.updatedAt }" /><b>{{ source.source }}</b><text>{{ formatDate(source.updatedAt) }}</text>
              </view>
            </article>
          </section>
        </template>

        <footer v-if="overview" class="footer-note">
          <view class="footer-mark">C</view>
          <view><b>CITY OPERATING INTELLIGENCE</b><text>{{ overview.city.name }} · {{ overview.period.label }} · Asia/Shanghai</text></view>
          <span>Policy {{ overview.policy.version }}</span>
        </footer>
      </main>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
* { box-sizing: border-box; }
button { margin: 0; padding: 0; border: 0; background: none; line-height: 1.2; }
button::after { border: 0; }
.metrics-shell { position: relative; min-height: 100vh; overflow: hidden; background: #edf2f0; color: #13211d; font-family: Inter, "PingFang SC", sans-serif; }
.aurora { position: fixed; z-index: 0; border-radius: 50%; filter: blur(90px); opacity: .42; pointer-events: none; }
.aurora-one { top: 100px; right: -160px; width: 380px; height: 380px; background: #78d8b0; }
.aurora-two { bottom: 40px; left: -200px; width: 420px; height: 420px; background: #bdd8ff; }
.topbar { position: relative; z-index: 5; display: flex; height: 76px; align-items: center; padding: 0 20px; border-bottom: 1px solid rgba(19,33,29,.08); background: rgba(247,250,248,.86); backdrop-filter: blur(20px); }
.back { display: flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 13px; background: #fff; box-shadow: 0 7px 18px rgba(21,45,37,.08); color: #15372d; font-size: 27px; }
.identity { display: flex; flex: 1; align-items: center; margin-left: 12px; }
.identity text, .identity small { display: block; }
.identity text { font-size: 13px; font-weight: 900; letter-spacing: -.01em; }
.identity small { margin-top: 3px; color: #83928d; font-size: 8px; font-weight: 750; letter-spacing: .13em; }
.logo { position: relative; display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; margin-right: 10px; border-radius: 13px; background: #0d3428; color: #fff; }
.logo i { position: absolute; inset: 5px; border: 1px solid #72e0b9; border-radius: 50%; }
.logo b { font-size: 10px; }
.live { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid #d8e4df; border-radius: 99px; background: rgba(255,255,255,.7); color: #4a6159; font-size: 8px; font-weight: 900; letter-spacing: .1em; }
.live i { width: 6px; height: 6px; border-radius: 50%; background: #28be84; box-shadow: 0 0 0 4px rgba(40,190,132,.12); }
.viewport { position: relative; z-index: 1; height: calc(100vh - 76px); }
.content { width: min(1320px, calc(100% - 32px)); margin: 0 auto; padding: 18px 0 44px; }
.error-banner { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding: 14px 16px; border: 1px solid #f0c8bd; border-radius: 16px; background: #fff7f4; color: #8b3824; }
.error-banner b, .error-banner text { display: block; }
.error-banner b { font-size: 12px; }.error-banner text { margin-top: 3px; font-size: 10px; }
.error-banner button { padding: 8px 12px; border-radius: 10px; background: #8b3824; color: #fff; font-size: 10px; font-weight: 800; }
.hero { position: relative; display: grid; min-height: 354px; overflow: hidden; grid-template-columns: 1.3fr .7fr; padding: 48px 52px; border-radius: 30px; background: linear-gradient(138deg, #071d18 0%, #10362c 58%, #165344 110%); box-shadow: 0 28px 70px rgba(7,29,24,.23); color: #fff; }
.hero::before { position: absolute; top: -80px; right: 10%; width: 330px; height: 330px; border-radius: 50%; background: radial-gradient(circle, rgba(77,237,183,.19), transparent 68%); content: ''; }
.hero-grid { position: absolute; inset: 0; opacity: .08; background-image: linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px); background-size: 42px 42px; mask-image: linear-gradient(90deg, black, transparent 70%); }
.hero-copy { position: relative; z-index: 1; max-width: 700px; }
.hero-kicker { display: flex; align-items: center; gap: 9px; color: #81e7c0; font-size: 9px; font-weight: 900; letter-spacing: .18em; }
.hero-kicker i { width: 19px; height: 1px; background: #81e7c0; }
.hero-title { display: block; margin-top: 22px; font-size: clamp(32px, 4.2vw, 55px); font-weight: 950; line-height: 1.08; letter-spacing: -.065em; }
.hero-title em { color: #8ff0cb; font-style: normal; }
.hero-desc { display: block; max-width: 650px; margin-top: 18px; color: rgba(255,255,255,.61); font-size: 13px; line-height: 1.75; }
.periods { display: flex; width: max-content; margin-top: 27px; padding: 4px; border: 1px solid rgba(255,255,255,.11); border-radius: 13px; background: rgba(0,0,0,.17); }
.periods button { padding: 10px 15px; border-radius: 9px; color: rgba(255,255,255,.46); font-size: 10px; font-weight: 800; }
.periods button.active { background: #8cebc7; box-shadow: 0 8px 20px rgba(56,207,153,.18); color: #08251c; }
.hero-score { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.score-orbit { position: relative; width: 245px; height: 245px; }
.ring { position: absolute; border: 1px solid rgba(143,240,203,.2); border-radius: 50%; }
.ring-a { inset: 7px; }.ring-b { inset: 34px; border-style: dashed; }
.score-core { position: absolute; inset: 62px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.13); border-radius: 50%; background: rgba(255,255,255,.07); box-shadow: inset 0 0 40px rgba(94,233,181,.05); backdrop-filter: blur(10px); }
.score-core small { color: #79dcb6; font-size: 7px; font-weight: 900; letter-spacing: .14em; }
.score-core text { margin-top: 4px; font-size: 37px; font-weight: 950; letter-spacing: -.06em; }
.score-core text i { margin-left: 2px; color: #8be7c4; font-size: 13px; font-style: normal; }
.score-core b { margin-top: 2px; color: rgba(255,255,255,.52); font-size: 8px; font-weight: 700; }
.satellite { position: absolute; min-width: 65px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 12px; background: rgba(5,29,22,.8); box-shadow: 0 12px 30px rgba(0,0,0,.18); text-align: center; }
.satellite b, .satellite small { display: block; }.satellite b { color: #fff; font-size: 15px; }.satellite small { margin-top: 2px; color: #7ddcba; font-size: 7px; }
.sat-a { top: 20px; right: 1px; }.sat-b { bottom: 22px; left: -2px; }
.verified { display: flex; align-items: center; gap: 6px; margin-top: -2px; color: rgba(255,255,255,.5); font-size: 8px; }
.verified i { display: flex; width: 15px; height: 15px; align-items: center; justify-content: center; border-radius: 50%; background: #3ac492; color: #06281e; font-size: 8px; font-style: normal; }
.view-tabs { display: flex; gap: 5px; width: max-content; margin: 18px auto 22px; padding: 5px; border: 1px solid rgba(16,51,41,.08); border-radius: 16px; background: rgba(255,255,255,.76); box-shadow: 0 8px 22px rgba(28,57,48,.06); }
.view-tabs button { display: flex; align-items: center; gap: 7px; padding: 11px 17px; border-radius: 11px; color: #7b8e87; font-size: 11px; font-weight: 850; }
.view-tabs button i { color: #b1bdb9; font-size: 7px; font-style: normal; }
.view-tabs button.active { background: #12382d; color: #fff; }.view-tabs button.active i { color: #8be4c3; }
.loading-state { display: flex; min-height: 330px; flex-direction: column; align-items: center; justify-content: center; border-radius: 24px; background: rgba(255,255,255,.7); }
.loading-orb { width: 48px; height: 48px; border: 3px solid #d6e9e2; border-top-color: #1fb783; border-radius: 50%; animation: spin 1s linear infinite; }
.loading-state b { margin-top: 18px; font-size: 15px; }.loading-state text { margin-top: 8px; color: #8a9994; font-size: 9px; letter-spacing: .09em; }
@keyframes spin { to { transform: rotate(360deg); } }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric-card { position: relative; overflow: hidden; min-height: 208px; padding: 22px; border: 1px solid rgba(16,52,42,.075); border-radius: 21px; background: rgba(255,255,255,.9); box-shadow: 0 10px 30px rgba(28,60,50,.055); }
.metric-card.primary { background: linear-gradient(150deg, #f5fffb, #fff); }
.metric-card.primary::after { position: absolute; right: -28px; bottom: -44px; width: 130px; height: 130px; border-radius: 50%; background: radial-gradient(circle, rgba(64,210,158,.14), transparent 70%); content: ''; }
.metric-head { display: flex; align-items: center; justify-content: space-between; color: #91a19b; font-size: 8px; font-weight: 900; letter-spacing: .12em; }
.metric-head i { display: flex; width: 29px; height: 29px; align-items: center; justify-content: center; border-radius: 10px; background: #e9f5f0; color: #168661; font-size: 12px; font-style: normal; }
.metric-value { display: block; margin-top: 22px; color: #113a2e; font-size: 32px; font-weight: 950; letter-spacing: -.05em; }
.metric-value em { margin-left: 3px; color: #548077; font-size: 15px; font-style: normal; }
.metric-card > b { display: block; margin-top: 4px; font-size: 12px; }
.metric-foot { position: absolute; right: 22px; bottom: 19px; left: 22px; padding-top: 13px; border-top: 1px solid #edf1ef; }
.metric-foot text, .metric-foot small { display: block; }.metric-foot text { font-size: 9px; font-weight: 800; }.metric-foot small { overflow: hidden; margin-top: 5px; color: #95a09c; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.positive { color: #149468 !important; }.negative { color: #d5523c !important; }.neutral { color: #87938f !important; }
.operating-grid { display: grid; grid-template-columns: minmax(0, 1.62fr) minmax(310px, .78fr); gap: 12px; margin-top: 12px; }
.panel { border: 1px solid rgba(16,52,42,.075); border-radius: 22px; background: rgba(255,255,255,.9); box-shadow: 0 10px 32px rgba(28,60,50,.05); }
.trend-panel, .signals-panel, .merchant-preview, .network-list, .focus-panel, .category-panel, .recognition-panel, .freshness-panel { padding: 23px; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; }
.panel-head small, .panel-head h2 { display: block; }.panel-head small { color: #24a477; font-size: 7px; font-weight: 900; letter-spacing: .14em; }.panel-head h2 { margin: 5px 0 0; font-size: 17px; font-weight: 950; letter-spacing: -.03em; }
.legend { display: flex; gap: 14px; color: #899791; font-size: 8px; }.legend span { display: flex; align-items: center; gap: 5px; }.legend i { width: 7px; height: 7px; border-radius: 2px; }.legend .revenue { background: #244f43; }.legend .gmv { background: #66d5ad; }
.chart { display: flex; height: 235px; align-items: flex-end; gap: 10px; margin-top: 20px; padding: 12px 5px 0; border-bottom: 1px solid #dfe7e4; background: repeating-linear-gradient(to bottom, transparent 0, transparent 49px, #edf2f0 50px); }
.chart-column { display: flex; min-width: 0; height: 100%; flex: 1; flex-direction: column; justify-content: flex-end; text-align: center; }
.bars { display: flex; height: 174px; align-items: flex-end; justify-content: center; gap: 4px; }
.bar { position: relative; width: min(21px, 35%); min-height: 2px; border-radius: 5px 5px 2px 2px; transition: height .35s ease; }
.bar.revenue { background: linear-gradient(#2e6b5a, #173f34); }.bar.gmv { background: linear-gradient(#74ddb7, #42bd91); }
.bar b { display: none; position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); padding: 3px 5px; border-radius: 5px; background: #132e26; color: #fff; font-size: 6px; white-space: nowrap; }
.chart-column text { display: block; margin-top: 7px; color: #64756f; font-size: 7px; }.chart-column small { margin-top: 2px; color: #a0aca8; font-size: 6px; }
.chart-baseline { display: flex; align-items: center; gap: 7px; margin-top: 12px; color: #9aa8a3; font-size: 7px; }.chart-baseline i { width: 5px; height: 5px; border-radius: 50%; background: #42c697; }
.fact-badge { padding: 6px 8px; border-radius: 8px; background: #ecf8f3; color: #178461; font-size: 7px; font-weight: 850; }
.signal-list { display: grid; gap: 9px; margin-top: 17px; }
.signal { display: flex; gap: 10px; padding: 12px; border-radius: 14px; background: #f4f7f6; }
.signal > i { display: flex; width: 25px; height: 25px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 9px; background: #e4eeea; color: #48665c; font-size: 11px; font-style: normal; font-weight: 900; }
.signal.positive > i { background: #dff6ed; color: #158962; }.signal.risk > i { background: #ffeae5; color: #c44b36; }.signal.notice > i { background: #fff3d8; color: #a57111; }
.signal b, .signal text, .signal small { display: block; }.signal b { font-size: 10px; }.signal text { margin-top: 4px; color: #687972; font-size: 8px; line-height: 1.5; }.signal small { margin-top: 5px; color: #9ba7a3; font-size: 7px; }
.quality-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
.quality-strip article { display: grid; min-height: 110px; grid-template-columns: auto 1fr auto; align-items: center; gap: 13px; padding: 17px 19px; border: 1px solid rgba(16,52,42,.07); border-radius: 19px; background: rgba(255,255,255,.88); }
.quality-icon { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 14px; background: #def5ec; color: #137a59; font-size: 13px; font-weight: 950; }
.quality-icon.voucher { background: #fff0d4; color: #a66b0a; }.quality-icon.active { background: #e4edff; color: #496dab; }
.quality-strip small, .quality-strip b, .quality-strip text { display: block; }.quality-strip small { color: #92a19b; font-size: 7px; font-weight: 900; letter-spacing: .11em; }.quality-strip b { margin-top: 5px; font-size: 22px; }.quality-strip text { margin-top: 3px; color: #7c8b86; font-size: 7px; }
.quality-ring { --value: 0%; width: 41px; height: 41px; border-radius: 50%; background: conic-gradient(#38bd8d var(--value), #e6efeb 0); mask: radial-gradient(transparent 56%, #000 58%); }
.voucher-ring { background: conic-gradient(#e5a234 var(--value), #f0ebe1 0); }.active-ring { background: conic-gradient(#6489ce var(--value), #e7ebf3 0); }
.merchant-preview { margin-top: 12px; overflow: hidden; }.merchant-preview .panel-head button { color: #1b8c66; font-size: 9px; font-weight: 850; }
.merchant-table { margin-top: 16px; overflow-x: auto; }
.merchant-row { display: grid; min-width: 900px; width: 100%; grid-template-columns: 1.45fr .8fr .5fr .75fr .75fr 1.2fr; align-items: center; gap: 12px; min-height: 67px; border-top: 1px solid #edf1ef; color: #364a43; text-align: left; }
.merchant-row.row-head { min-height: 31px; border-top: 0; color: #9aa6a2; font-size: 7px; font-weight: 850; letter-spacing: .06em; }
.merchant-row:not(.row-head):active { background: #f7faf9; }
.merchant-name { display: flex; align-items: center; gap: 10px; }.merchant-name > i { display: flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 11px; background: #e7f4ef; color: #207a5e; font-size: 11px; font-style: normal; font-weight: 900; }.merchant-name > i.RISK { background: #ffebe6; color: #be4c36; }.merchant-name > i.WATCH { background: #fff2d7; color: #aa7416; }
.merchant-name b, .merchant-name small { display: block; }.merchant-name b { font-size: 10px; }.merchant-name small { margin-top: 4px; color: #98a49f; font-size: 7px; font-weight: 500; }
.merchant-row span { font-size: 9px; }.merchant-row span > small { display: block; margin-top: 4px; font-size: 7px; }.stage { color: #445952; font-size: 9px; font-style: normal; font-weight: 750; }
.risk.HEALTHY, .network-main span.HEALTHY { color: #17835f; }.risk.WATCH, .network-main span.WATCH { color: #b27a14; }.risk.RISK, .network-main span.RISK { color: #c7513b; }
.score { color: #174e3f; font-size: 15px !important; font-weight: 950; }.next { display: flex; align-items: center; justify-content: space-between; color: #60716b; }.next i { color: #24a477; font-style: normal; font-size: 15px; }
.network-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, .65fr); gap: 12px; }
.scope-lock { padding: 7px 10px; border-radius: 9px; background: #edf7f3; color: #268166; font-size: 7px; font-weight: 850; }
.network-card { display: grid; width: 100%; min-height: 85px; grid-template-columns: auto 1fr auto; align-items: center; gap: 13px; margin-top: 9px; padding: 12px; border: 1px solid #e8eeeb; border-radius: 16px; background: #fafcfb; text-align: left; transition: .2s ease; }
.network-card.selected { border-color: #8fd5bc; background: #f1faf7; box-shadow: 0 8px 20px rgba(31,137,100,.08); }
.network-avatar { display: flex; width: 46px; height: 46px; align-items: center; justify-content: center; border-radius: 15px; background: #e2f3ed; color: #1b765a; font-size: 15px; font-weight: 950; }.network-avatar.RISK { background: #ffe8e2; color: #b94330; }.network-avatar.WATCH { background: #fff0d1; color: #a66d09; }
.network-main > view { display: flex; align-items: center; gap: 8px; }.network-main b { font-size: 11px; }.network-main span { padding: 4px 6px; border-radius: 99px; background: #eef4f2; font-size: 6px; font-weight: 850; }.network-main text, .network-main small { display: block; }.network-main text { margin-top: 5px; color: #71817b; font-size: 8px; }.network-main small { margin-top: 4px; color: #9ba7a3; font-size: 7px; }
.network-score { min-width: 58px; padding-left: 12px; border-left: 1px solid #e5ece9; text-align: center; }.network-score small, .network-score b { display: block; }.network-score small { color: #a0aaa6; font-size: 6px; }.network-score b { margin-top: 4px; color: #1a5a46; font-size: 19px; }.network-score i { color: #9ba8a3; font-style: normal; }
.focus-panel { padding: 0; overflow: hidden; }.focus-hero { padding: 27px 24px 23px; background: linear-gradient(140deg, #0d352a, #1a5a46); color: #fff; }.focus-hero.watch { background: linear-gradient(140deg, #423514, #816426); }.focus-hero.risk { background: linear-gradient(140deg, #3d1e18, #7c392c); }
.focus-hero small { color: rgba(255,255,255,.5); font-size: 7px; font-weight: 900; letter-spacing: .13em; }.focus-hero h2 { margin: 12px 0 0; font-size: 22px; }.focus-hero > text { display: block; margin-top: 7px; color: rgba(255,255,255,.6); font-size: 9px; }.focus-hero > view { display: flex; gap: 5px; margin-top: 15px; }.focus-hero span { padding: 6px 8px; border: 1px solid rgba(255,255,255,.13); border-radius: 8px; background: rgba(255,255,255,.08); font-size: 7px; }
.focus-metrics { display: grid; grid-template-columns: repeat(3, 1fr); padding: 18px 16px; border-bottom: 1px solid #edf1ef; }.focus-metrics view { padding: 0 8px; border-right: 1px solid #edf1ef; }.focus-metrics view:last-child { border: 0; }.focus-metrics small, .focus-metrics b { display: block; }.focus-metrics small { color: #95a19d; font-size: 7px; }.focus-metrics b { margin-top: 6px; color: #163f33; font-size: 15px; }
.focus-section { padding: 20px 23px; }.focus-section > small, .focus-next small { color: #28a57a; font-size: 7px; font-weight: 900; letter-spacing: .12em; }.focus-section h3 { margin: 5px 0 12px; font-size: 14px; }.evidence-list { display: grid; gap: 7px; }.evidence-list view { display: flex; align-items: center; gap: 8px; padding: 9px; border-radius: 10px; background: #f2f7f5; color: #50655e; font-size: 8px; }.evidence-list i { display: flex; width: 17px; height: 17px; align-items: center; justify-content: center; border-radius: 50%; background: #d7f1e7; color: #17825f; font-size: 7px; font-style: normal; }.empty-evidence { padding: 13px; border-radius: 11px; background: #f6f7f7; color: #8d9995; font-size: 8px; }
.focus-next { margin: 0 15px 15px; padding: 16px; border-radius: 15px; background: #102f27; color: #fff; }.focus-next b, .focus-next text { display: block; }.focus-next b { margin-top: 7px; font-size: 11px; }.focus-next text { margin-top: 5px; color: rgba(255,255,255,.5); font-size: 7px; }
.category-panel { margin-top: 12px; }.category-panel .panel-head > span { color: #98a49f; font-size: 7px; }.category-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 17px; }.category-card { padding: 15px; border: 1px solid #e6ece9; border-radius: 15px; background: #fafcfb; }.category-card > view { display: flex; align-items: center; justify-content: space-between; }.category-card b { font-size: 10px; }.category-card span { color: #798a84; font-size: 7px; }.category-card > i { display: block; height: 5px; margin: 12px 0; overflow: hidden; border-radius: 99px; background: #e5ece9; }.category-card > i em { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #1f7e60, #64d6ae); }.category-card > text { display: inline-block; margin-right: 12px; color: #60716b; font-size: 8px; }
.definition-hero { display: flex; min-height: 210px; align-items: center; justify-content: space-between; padding: 32px 40px; border-radius: 24px; background: linear-gradient(140deg, #fafffd, #e8f5f0); border: 1px solid #d6e8e1; }.definition-hero small { color: #1d9470; font-size: 8px; font-weight: 900; letter-spacing: .15em; }.definition-hero h2 { margin: 12px 0 0; color: #153d31; font-size: 29px; letter-spacing: -.04em; }.definition-hero text { display: block; margin-top: 10px; color: #71827c; font-size: 10px; }.policy-seal { display: grid; width: 126px; height: 126px; grid-template-columns: auto auto; align-content: center; justify-content: center; gap: 0 8px; border: 1px solid #acd7c7; border-radius: 50%; background: rgba(255,255,255,.65); box-shadow: inset 0 0 0 8px rgba(58,177,134,.05); }.policy-seal i { grid-row: span 2; align-self: center; color: #25a477; font-size: 20px; font-style: normal; }.policy-seal b { font-size: 27px; line-height: 1; }.policy-seal small { margin-top: 3px; color: #6f827b; font-size: 6px; line-height: 1.3; }
.definition-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }.definition-card { position: relative; min-height: 175px; overflow: hidden; padding: 20px; border: 1px solid rgba(16,52,42,.075); border-radius: 19px; background: rgba(255,255,255,.9); }.definition-card > span { position: absolute; top: 12px; right: 15px; color: #e0e8e5; font-size: 32px; font-weight: 950; }.definition-card view { position: relative; z-index: 1; }.definition-card small { display: block; max-width: 80%; overflow: hidden; color: #2a9a75; font-size: 6px; font-weight: 850; line-height: 1.4; letter-spacing: .06em; text-overflow: ellipsis; white-space: nowrap; }.definition-card h3 { margin: 26px 0 0; font-size: 16px; }.definition-card text { display: block; margin-top: 10px; color: #71817b; font-size: 8px; line-height: 1.65; }
.governance-grid { display: grid; grid-template-columns: .8fr 1.2fr; gap: 12px; margin-top: 12px; }.recognition-panel > view:not(.panel-head) { display: flex; align-items: center; justify-content: space-between; min-height: 48px; border-top: 1px solid #edf1ef; font-size: 8px; }.recognition-panel > view:nth-child(2) { margin-top: 14px; }.recognition-panel span { color: #81908b; }.recognition-panel b { max-width: 70%; color: #365048; text-align: right; }.recognition-panel b.denied { padding: 5px 8px; border-radius: 7px; background: #ffece7; color: #bc4a34; }
.freshness-panel .panel-head > span { color: #95a19d; font-size: 7px; }.freshness-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 9px; min-height: 39px; border-top: 1px solid #edf1ef; }.freshness-row:nth-child(2) { margin-top: 12px; }.freshness-row i { width: 6px; height: 6px; border-radius: 50%; background: #2bc28c; box-shadow: 0 0 0 4px rgba(43,194,140,.1); }.freshness-row i.stale { background: #d7a23a; }.freshness-row b { font-size: 8px; }.freshness-row text { color: #8c9994; font-size: 7px; }
.footer-note { display: flex; align-items: center; margin-top: 15px; padding: 16px 4px 0; color: #7e8d87; }.footer-mark { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 11px; background: #173b30; color: #8be4c3; font-size: 10px; font-weight: 900; }.footer-note > view:nth-child(2) { flex: 1; margin-left: 10px; }.footer-note b, .footer-note text { display: block; }.footer-note b { color: #52665e; font-size: 7px; letter-spacing: .11em; }.footer-note text { margin-top: 3px; font-size: 7px; }.footer-note > span { font-size: 7px; }
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr .72fr; padding: 37px 34px; }
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
  .operating-grid, .network-layout { grid-template-columns: 1fr; }
  .definition-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .topbar { height: 66px; padding: 0 14px; }.viewport { height: calc(100vh - 66px); }.content { width: calc(100% - 20px); padding-top: 10px; }
  .identity text { font-size: 11px; }.identity small { font-size: 6px; }.logo { width: 31px; height: 31px; border-radius: 10px; }.live { padding: 7px 8px; font-size: 6px; }
  .hero { display: block; min-height: 520px; padding: 30px 24px; border-radius: 24px; }.hero-title { margin-top: 18px; font-size: 35px; }.hero-desc { font-size: 11px; }.hero-score { margin-top: 4px; }.score-orbit { width: 215px; height: 215px; }.score-core { inset: 55px; }.score-core text { font-size: 32px; }.satellite { min-width: 58px; }.sat-a { right: 3px; }.sat-b { left: 1px; }
  .periods { margin-top: 20px; }.periods button { padding: 9px 12px; font-size: 8px; }
  .view-tabs { width: 100%; margin: 12px 0 15px; }.view-tabs button { flex: 1; justify-content: center; padding: 10px 5px; font-size: 9px; }
  .metric-grid { gap: 8px; }.metric-card { min-height: 187px; padding: 17px; border-radius: 18px; }.metric-value { margin-top: 18px; font-size: 25px; }.metric-foot { right: 17px; bottom: 15px; left: 17px; }.metric-foot small { font-size: 6px; }
  .trend-panel, .signals-panel, .merchant-preview, .network-list, .focus-panel, .category-panel, .recognition-panel, .freshness-panel { padding: 17px; }.focus-panel { padding: 0; }
  .panel-head h2 { font-size: 15px; }.legend { display: none; }.chart { height: 210px; gap: 4px; padding-inline: 0; }.bars { height: 153px; gap: 2px; }.bar { width: 12px; }.chart-column text { font-size: 5px; }
  .quality-strip { grid-template-columns: 1fr; gap: 8px; }.quality-strip article { min-height: 92px; }
  .merchant-preview { overflow: hidden; }.merchant-table { margin-right: -17px; padding-right: 17px; }
  .network-layout { gap: 8px; }.network-list .panel-head { align-items: center; }.network-card { grid-template-columns: auto 1fr; }.network-score { display: none; }.focus-hero { padding: 23px 20px; }
  .category-grid { grid-template-columns: 1fr; }.category-panel .panel-head > span { display: none; }
  .definition-hero { min-height: 245px; padding: 25px; }.definition-hero h2 { font-size: 25px; }.policy-seal { width: 90px; height: 90px; flex: 0 0 auto; margin-left: 10px; }.policy-seal b { font-size: 21px; }
  .definition-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }.definition-card { min-height: 185px; padding: 16px; }.definition-card h3 { margin-top: 24px; font-size: 14px; }.definition-card > span { font-size: 25px; }
  .governance-grid { grid-template-columns: 1fr; }.footer-note > span { display: none; }
}
</style>
