<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import type {
  MerchantAiRecommendationSummary,
  MerchantOperationsOverview,
  MerchantOrderSummary,
  MerchantTodoSummary,
} from '@lequ/contracts'
import {
  approveRefund,
  confirmOrder,
  fetchMerchantOverview,
  verifyOrder,
} from '../../services/merchant'
import {
  merchantOrderStatusLabel,
  merchantPaymentStatusLabel,
  merchantRefundStatusLabel,
  merchantTodoActionAllowed,
  merchantVerificationStatusLabel,
} from '../../services/merchant-order-state'

const overview = ref<MerchantOperationsOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const selectedTodo = ref<MerchantTodoSummary | null>(null)
const verificationCode = ref('')
const refundConfirmed = ref(false)

const selectedOrder = computed<MerchantOrderSummary | null>(() => {
  if (!selectedTodo.value) return null
  return overview.value?.orders.find((order) => order.id === selectedTodo.value?.orderId) ?? null
})
const primaryRecommendation = computed(() => overview.value?.recommendations[0] ?? null)
const secondaryRecommendations = computed(() => overview.value?.recommendations.slice(1) ?? [])
const actionableTodos = computed(() => (overview.value?.todos ?? []).filter((todo) => {
  const order = overview.value?.orders.find((item) => item.id === todo.orderId)
  return order ? merchantTodoActionAllowed(order, todo.action) : false
}))
const actionableCount = computed(() => new Set([
  ...actionableTodos.value.map((item) => item.orderId),
  ...(overview.value?.exceptions.map((item) => item.orderId) ?? []),
]).size)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchMerchantOverview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '经营数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(fen / 100)
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function openTodo(todo: MerchantTodoSummary): void {
  if (todo.action === 'VIEW') {
    openOrders(todo.orderId)
    return
  }
  const order = overview.value?.orders.find((item) => item.id === todo.orderId)
  if (!order || !merchantTodoActionAllowed(order, todo.action)) {
    if (order) uni.showToast({ title: merchantOrderStatusLabel(order), icon: 'none' })
    openOrders(todo.orderId)
    return
  }
  verificationCode.value = ''
  refundConfirmed.value = false
  selectedTodo.value = todo
}

function closeAction(): void {
  if (busy.value) return
  selectedTodo.value = null
  verificationCode.value = ''
  refundConfirmed.value = false
}

async function executeAction(): Promise<void> {
  const todo = selectedTodo.value
  const order = selectedOrder.value
  if (!todo || !order || busy.value) return
  if (!merchantTodoActionAllowed(order, todo.action)) {
    uni.showToast({ title: merchantOrderStatusLabel(order), icon: 'none' })
    return
  }
  if (todo.action === 'VERIFY' && !/^\d{6}$/.test(verificationCode.value)) {
    uni.showToast({ title: '请输入顾客出示的 6 位核销码', icon: 'none' })
    return
  }
  if (todo.action === 'APPROVE_REFUND' && !refundConfirmed.value) {
    uni.showToast({ title: '请先确认退款金额与影响', icon: 'none' })
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    if (todo.action === 'CONFIRM') {
      overview.value = await confirmOrder(order)
    } else if (todo.action === 'VERIFY') {
      overview.value = await verifyOrder(order, verificationCode.value)
    } else if (todo.action === 'APPROVE_REFUND') {
      overview.value = await approveRefund(order, '顾客行程变更，商家审核同意')
    }
    selectedTodo.value = null
    uni.showToast({
      title: todo.action === 'APPROVE_REFUND' ? '已提交，等待资金结果' : '履约状态已更新',
      icon: 'success',
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    busy.value = false
  }
}

function actionLabel(todo: MerchantTodoSummary): string {
  if (busy.value) return '正在安全处理…'
  if (todo.action === 'CONFIRM') {
    return selectedOrder.value?.consumerDealPaymentStatus === 'NOT_APPLICABLE'
      ? '确认预约并锁定时段'
      : '确认接单并签发核销凭证'
  }
  if (todo.action === 'VERIFY') return '强确认核销并完成履约'
  if (todo.action === 'APPROVE_REFUND') {
    const prefix = selectedOrder.value?.consumerDealRefundStatus === 'FAILED' ? '重试退款 ¥' : '提交退款处理 ¥'
    return prefix + money(selectedOrder.value?.refundAmountFen ?? 0)
  }
  return '查看订单'
}

function openOrders(orderId?: string): void {
  const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''
  uni.navigateTo({ url: `/pages/orders/index${query}` })
}

function openAnalytics(): void {
  uni.navigateTo({ url: '/pages/analytics/index' })
}

function openRecommendation(item: MerchantAiRecommendationSummary): void {
  if (item.actionTarget === 'ORDERS') {
    openOrders()
  } else if (item.actionTarget === 'ANALYTICS') {
    openAnalytics()
  } else {
    uni.navigateTo({ url: '/pages/catalog/index' })
  }
}

function openModule(path: string): void {
  if (path === 'catalog') {
    uni.navigateTo({ url: '/pages/catalog/index' })
    return
  }
  if (path === 'members') {
    uni.navigateTo({ url: '/pages/members/index' })
    return
  }
  uni.navigateTo({ url: `/pages/module/index?path=${encodeURIComponent(path)}` })
}

</script>

<template>
  <view class="today-page">
    <view class="ambient ambient-one" />
    <view class="ambient ambient-two" />

    <header class="topbar">
      <view class="brand">
        <view class="logo"><text>趣</text></view>
        <view>
          <text class="brand-name">经营宝</text>
          <text class="brand-store">{{ overview?.store.name ?? '云和里·静安店' }}</text>
        </view>
      </view>
      <button class="message-button" aria-label="消息中心" @click="openModule('messages')">
        <text class="message-glyph">⌁</text><text class="message-dot" />
      </button>
    </header>

    <main v-if="overview" class="page-content">
      <view class="store-status-row">
        <view class="live-pill"><text class="live-dot" /> 营业中</view>
        <text class="business-hours">今日 {{ overview.store.businessHours }}</text>
      </view>

      <section class="hero">
        <view class="hero-glow" />
        <view class="hero-topline">
          <text>AI 今日经营结论</text>
          <view class="health-chip">健康分 {{ overview.metrics.aiHealthScore }}</view>
        </view>
        <text class="hero-title">{{ overview.headline.title }}</text>
        <text class="hero-narrative">{{ overview.headline.narrative }}</text>
        <view class="revenue-row">
          <view>
            <text class="revenue-label">今日实收</text>
            <text class="revenue-value"><text>¥</text>{{ money(overview.metrics.revenueFen) }}</text>
          </view>
          <view class="delta-pill">↑ {{ (overview.metrics.revenueDeltaBps / 100).toFixed(1) }}%</view>
        </view>
        <button
          v-if="primaryRecommendation"
          class="hero-action"
          hover-class="pressed"
          @click="openRecommendation(primaryRecommendation)"
        >
          <view>
            <text class="hero-action-kicker">最该先做</text>
            <text class="hero-action-title">{{ primaryRecommendation.title }}</text>
          </view>
          <view class="arrow-button">→</view>
        </button>
      </section>

      <section class="metrics-grid">
        <button class="metric-card" hover-class="pressed" @click="openOrders()">
          <view class="metric-head"><text>今日订单</text><text class="metric-icon mint">单</text></view>
          <text class="metric-value">{{ overview.metrics.orderCount }}</text>
          <text class="metric-foot">跨 4 个渠道实时聚合</text>
        </button>
        <button class="metric-card" hover-class="pressed" @click="openAnalytics">
          <view class="metric-head"><text>核销率</text><text class="metric-icon blue">核</text></view>
          <text class="metric-value">{{ overview.metrics.verificationRate }}<text>%</text></text>
          <text class="metric-foot good">高于近 7 日均值 1.8%</text>
        </button>
        <button class="metric-card compact" hover-class="pressed" @click="openModule('members')">
          <view><text class="compact-label">新增会员</text><text class="compact-value">+{{ overview.metrics.newMemberCount }}</text></view>
          <view class="tiny-spark"><i /><i /><i /><i /><i /></view>
        </button>
        <button class="metric-card compact" hover-class="pressed" @click="openAnalytics">
          <view><text class="compact-label">经营趋势</text><text class="compact-value good">稳步向上</text></view>
          <text class="compact-arrow">↗</text>
        </button>
      </section>

      <section class="section">
        <view class="section-heading">
          <view><text class="section-kicker">ACTION CENTER</text><text class="section-title">今日待办</text></view>
          <button class="text-button" @click="openOrders()">全部 {{ actionableCount }} 项</button>
        </view>
        <view class="todo-list">
          <button
            v-for="todo in actionableTodos"
            :key="todo.id"
            class="todo-card"
            hover-class="pressed"
            @click="openTodo(todo)"
          >
            <view :class="['todo-icon', `todo-${todo.kind.toLowerCase()}`]">
              <text>{{ todo.kind === 'ORDER_CONFIRMATION' ? '约' : todo.kind === 'REFUND_APPROVAL' ? '退' : todo.kind === 'ORDER_EXCEPTION' ? '异' : '核' }}</text>
            </view>
            <view class="todo-copy">
              <view class="todo-title-row">
                <text class="todo-title">{{ todo.title }}</text>
                <text v-if="todo.urgency === 'HIGH'" class="urgent-badge">优先</text>
              </view>
              <text class="todo-detail">{{ todo.detail }}</text>
            </view>
            <view class="todo-arrow">›</view>
          </button>
        </view>
      </section>

      <section v-if="overview.exceptions.length" class="exception-card">
        <view class="exception-head">
          <view class="exception-icon">!</view>
          <view><text class="exception-title">需要留意的异常</text><text class="exception-count">{{ overview.exceptions.length }} 项</text></view>
        </view>
        <view class="exception-lines">
          <view v-for="exception in overview.exceptions" :key="exception.id" class="exception-line">
            <text>{{ exception.title }}</text>
            <button @click="openTodo(exception)">处理</button>
          </view>
        </view>
      </section>

      <section v-if="secondaryRecommendations.length" class="section">
        <view class="section-heading">
          <view><text class="section-kicker violet">AI COPILOT</text><text class="section-title">AI 建议你再做</text></view>
          <text class="model-tag">可解释 · v2026.07</text>
        </view>
        <view class="suggestion-scroll">
          <button
            v-for="suggestion in secondaryRecommendations"
            :key="suggestion.id"
            class="suggestion-card"
            hover-class="pressed"
            @click="openRecommendation(suggestion)"
          >
            <view class="suggestion-top">
              <text class="suggestion-index">0{{ suggestion.priority }}</text>
              <text class="risk-chip">{{ suggestion.riskLevel }}</text>
            </view>
            <text class="suggestion-title">{{ suggestion.title }}</text>
            <text class="suggestion-reason">{{ suggestion.rationale }}</text>
            <view class="impact-line"><text>预计影响</text><strong>{{ suggestion.expectedImpact }}</strong></view>
            <view class="suggestion-action"><text>{{ suggestion.actionLabel }}</text><text>→</text></view>
          </button>
        </view>
      </section>

      <section class="recent-card">
        <view class="section-heading no-margin">
          <view><text class="section-kicker">LIVE ORDERS</text><text class="section-title">最新订单</text></view>
          <button class="text-button" @click="openOrders()">进入订单中心</button>
        </view>
        <button
          v-for="order in overview.orders.slice(0, 3)"
          :key="order.id"
          class="recent-order"
          hover-class="pressed"
          @click="openOrders(order.id)"
        >
          <view class="order-channel">{{ order.channel === 'SKILL' ? 'S' : order.channel === 'MINIAPP' ? '微' : '渠' }}</view>
          <view class="recent-copy">
            <text>{{ order.itemSummary }}</text>
            <text>{{ order.customerName }} · {{ shortDate(order.placedAt) }}</text>
          </view>
          <view class="recent-right">
            <text>¥{{ money(order.paidAmountFen) }}</text>
            <text>{{ merchantOrderStatusLabel(order) }}</text>
          </view>
        </button>
      </section>

      <text class="sync-note">数据更新于 {{ shortDate(overview.updatedAt) }} · 下拉可刷新</text>
    </main>

    <view v-else-if="loading" class="state-card">
      <view class="loading-orb">趣</view><text>正在汇总今日经营信号…</text>
    </view>
    <view v-else class="state-card error-state">
      <text class="state-title">暂时没有拿到经营数据</text>
      <text>{{ errorMessage }}</text>
      <button @click="load">重新加载</button>
    </view>

    <view v-if="errorMessage && overview" class="error-toast">{{ errorMessage }}</view>

    <view v-if="selectedTodo && selectedOrder" class="sheet-layer" @click.self="closeAction">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text class="sheet-kicker">{{ selectedTodo.kind.replaceAll('_', ' ') }}</text>
            <text class="sheet-title">{{ selectedTodo.title }}</text>
          </view>
          <button class="sheet-close" @click="closeAction">×</button>
        </view>
        <view class="order-proof">
          <view><text>订单</text><strong>{{ selectedOrder.orderNo }}</strong></view>
          <view><text>顾客</text><strong>{{ selectedOrder.customerName }} {{ selectedOrder.customerPhoneMasked }}</strong></view>
          <view><text>内容</text><strong>{{ selectedOrder.itemSummary }}</strong></view>
          <view><text>实付</text><strong>¥{{ money(selectedOrder.paidAmountFen) }}</strong></view>
          <view v-if="selectedOrder.consumerDealPaymentStatus !== 'NOT_APPLICABLE'"><text>支付</text><strong>{{ merchantPaymentStatusLabel(selectedOrder) }}</strong></view>
          <view v-if="selectedOrder.consumerDealRefundStatus !== 'NOT_APPLICABLE'"><text>退款</text><strong>{{ merchantRefundStatusLabel(selectedOrder) }}</strong></view>
          <view v-if="selectedOrder.verificationStatus !== 'NOT_APPLICABLE'"><text>核销凭证</text><strong>{{ merchantVerificationStatusLabel(selectedOrder) }}</strong></view>
        </view>
        <view v-if="selectedTodo.action === 'VERIFY'" class="form-field">
          <text class="field-label">完整核销码</text>
          <input
            v-model="verificationCode"
            class="code-input"
            type="number"
            maxlength="6"
            placeholder="请输入顾客出示的 6 位数字"
          >
          <text class="field-help">系统将校验订单、金额、状态与操作员，并保存不可篡改记录。</text>
        </view>
        <button
          v-if="selectedTodo.action === 'APPROVE_REFUND'"
          :class="['confirmation-box', { checked: refundConfirmed }]"
          @click="refundConfirmed = !refundConfirmed"
        >
          <view class="checkmark">{{ refundConfirmed ? '✓' : '' }}</view>
          <view>
            <text>我已核对退款 ¥{{ money(selectedOrder.refundAmountFen) }}</text>
            <text>退款将同步资金、售后与审计状态，操作后不可直接撤回。</text>
          </view>
        </button>
        <view v-if="selectedTodo.action === 'CONFIRM'" class="confirmation-note">
          <text v-if="selectedOrder.consumerDealPaymentStatus === 'SUCCEEDED'">支付成功事实已回写；接单后将签发一次性核销凭证，并通知顾客。</text>
          <text v-else-if="selectedOrder.consumerDealPaymentStatus === 'NOT_REQUIRED'">零元套餐无需扣款；接单后将签发一次性核销凭证，并通知顾客。</text>
          <text v-else>确认后将锁定 {{ selectedOrder.partySize }} 人桌位与预约时段，并通知顾客。</text>
        </view>
        <button class="primary-sheet-action" :disabled="busy" hover-class="pressed" @click="executeAction">
          {{ actionLabel(selectedTodo) }}
        </button>
        <text class="risk-note">安全确认 · 版本校验 · 幂等执行 · 全程留痕</text>
      </view>
    </view>

    <nav class="bottom-nav">
      <button class="nav-item active"><text class="nav-icon">⌂</text><text>今日</text></button>
      <button class="nav-item" @click="openAnalytics"><text class="nav-icon">↗</text><text>经营</text></button>
      <button class="nav-fab" @click="openModule('assistant')"><text>✦</text></button>
      <button class="nav-item" @click="openModule('messages')"><text class="nav-icon">◌</text><text>消息</text></button>
      <button class="nav-item" @click="openModule('finance')"><text class="nav-icon">◎</text><text>我的</text></button>
    </nav>
  </view>
</template>

<style scoped lang="scss">
page { background: #f3f6f5; }
button { margin: 0; padding: 0; border: 0; line-height: inherit; }
button::after { display: none; }
.today-page { position: relative; min-height: 100vh; overflow: hidden; background: #f3f6f5; color: #13231f; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
.ambient { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; }
.ambient-one { top: -120px; right: -90px; width: 280px; height: 280px; background: rgba(38, 210, 163, .19); }
.ambient-two { top: 670px; left: -160px; width: 300px; height: 300px; background: rgba(99, 91, 255, .08); }
.topbar { position: relative; z-index: 5; display: flex; height: 74px; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top) + 10px) 20px 8px; }
.brand { display: flex; align-items: center; gap: 11px; }
.logo { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 14px 14px 14px 5px; background: #0d9e7b; box-shadow: 0 10px 24px rgba(13,158,123,.25); color: #fff; font-size: 15px; font-weight: 900; }
.brand-name, .brand-store { display: block; }
.brand-name { font-size: 16px; font-weight: 900; letter-spacing: .06em; }
.brand-store { margin-top: 2px; color: #73817d; font-size: 10px; font-weight: 650; }
.message-button { position: relative; display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border: 1px solid rgba(19,35,31,.06); border-radius: 14px; background: rgba(255,255,255,.78); box-shadow: 0 8px 20px rgba(25,50,43,.07); }
.message-glyph { font-size: 20px; transform: rotate(15deg); }
.message-dot { position: absolute; top: 8px; right: 8px; width: 7px; height: 7px; border: 2px solid #fff; border-radius: 50%; background: #ff5d6c; }
.page-content { position: relative; z-index: 1; padding: 6px 18px calc(112px + env(safe-area-inset-bottom)); }
.store-status-row { display: flex; align-items: center; justify-content: space-between; margin: 3px 2px 12px; }
.live-pill { display: flex; align-items: center; gap: 6px; padding: 6px 9px; border-radius: 99px; background: #e2f7ef; color: #087b60; font-size: 10px; font-weight: 800; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #0eb68a; box-shadow: 0 0 0 4px rgba(14,182,138,.12); }
.business-hours { color: #7f8c88; font-size: 10px; }
.hero { position: relative; overflow: hidden; min-height: 330px; padding: 24px 22px 20px; border-radius: 30px; background: linear-gradient(145deg, #092a24 0%, #0e5547 62%, #129473 130%); box-shadow: 0 26px 54px rgba(9,54,45,.24); color: #fff; }
.hero::after { position: absolute; right: -74px; bottom: -104px; width: 230px; height: 230px; border: 1px solid rgba(255,255,255,.12); border-radius: 50%; box-shadow: 0 0 0 30px rgba(255,255,255,.025), 0 0 0 62px rgba(255,255,255,.016); content: ''; }
.hero-glow { position: absolute; top: -90px; right: -30px; width: 180px; height: 180px; border-radius: 50%; background: rgba(64,238,185,.26); filter: blur(48px); }
.hero-topline { position: relative; display: flex; align-items: center; justify-content: space-between; color: #81e5c8; font-size: 9px; font-weight: 850; letter-spacing: .12em; }
.health-chip { padding: 6px 9px; border: 1px solid rgba(255,255,255,.13); border-radius: 99px; background: rgba(255,255,255,.08); color: #fff; letter-spacing: 0; }
.hero-title, .hero-narrative { position: relative; display: block; max-width: 100%; white-space: normal; word-break: break-all; overflow-wrap: anywhere; }
.hero-title { margin-top: 18px; font-size: 25px; font-weight: 950; line-height: 1.22; letter-spacing: -.035em; }
.hero-narrative { margin-top: 9px; color: rgba(255,255,255,.66); font-size: 12px; line-height: 1.6; }
.revenue-row { position: relative; display: flex; align-items: flex-end; justify-content: space-between; margin-top: 21px; }
.revenue-label, .revenue-value { display: block; }
.revenue-label { color: rgba(255,255,255,.54); font-size: 10px; }
.revenue-value { margin-top: 3px; font-size: 37px; font-weight: 950; letter-spacing: -.04em; }
.revenue-value text { margin-right: 4px; color: #7bf0ce; font-size: 16px; }
.delta-pill { margin-bottom: 7px; padding: 7px 9px; border-radius: 10px; background: rgba(104,236,196,.13); color: #7bf0ce; font-size: 10px; font-weight: 850; }
.hero-action { position: relative; z-index: 2; display: flex; width: 100%; min-height: 64px; align-items: center; justify-content: space-between; margin-top: 18px; padding: 12px 13px 12px 15px; border-radius: 19px; background: #fff; color: #102d27; text-align: left; }
.hero-action-kicker, .hero-action-title { display: block; }
.hero-action-kicker { color: #0d9e7b; font-size: 9px; font-weight: 850; letter-spacing: .08em; }
.hero-action-title { max-width: 230px; margin-top: 4px; overflow: hidden; font-size: 13px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.arrow-button { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 12px; background: #e1f8f0; color: #078467; font-size: 18px; font-weight: 800; }
.metrics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
.metric-card { width: 100%; min-width: 0; min-height: 132px; padding: 16px; border: 1px solid rgba(18,54,45,.05); border-radius: 22px; background: rgba(255,255,255,.94); box-shadow: 0 10px 26px rgba(19,59,49,.06); color: #13231f; text-align: left; }
.metric-head { display: flex; align-items: center; justify-content: space-between; color: #687672; font-size: 10px; font-weight: 700; }
.metric-icon { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 10px; font-size: 10px; font-weight: 900; }
.mint { background: #e2f8f0; color: #078467; }
.blue { background: #e8f1ff; color: #3976dc; }
.metric-value { display: block; margin-top: 12px; font-size: 28px; font-weight: 950; letter-spacing: -.03em; }
.metric-value text { font-size: 13px; }
.metric-foot { display: block; margin-top: 6px; color: #97a19e; font-size: 9px; white-space: normal; word-break: break-all; }
.good { color: #079c77 !important; }
.metric-card.compact { display: flex; min-height: 76px; align-items: center; justify-content: space-between; padding: 14px 16px; }
.compact-label, .compact-value { display: block; }
.compact-label { color: #7c8985; font-size: 9px; }
.compact-value { margin-top: 5px; font-size: 16px; font-weight: 900; }
.tiny-spark { display: flex; height: 27px; align-items: flex-end; gap: 3px; }
.tiny-spark i { display: block; width: 4px; border-radius: 99px; background: #25bd95; }
.tiny-spark i:nth-child(1) { height: 8px; opacity: .35; }.tiny-spark i:nth-child(2) { height: 13px; opacity: .5; }.tiny-spark i:nth-child(3) { height: 11px; opacity: .62; }.tiny-spark i:nth-child(4) { height: 20px; opacity: .8; }.tiny-spark i:nth-child(5) { height: 26px; }
.compact-arrow { color: #0ba77f; font-size: 24px; font-weight: 300; }
.section { margin-top: 29px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; margin: 0 2px 13px; }
.section-heading.no-margin { margin: 0 0 11px; }
.section-kicker, .section-title { display: block; }
.section-kicker { color: #0b9c78; font-size: 8px; font-weight: 900; letter-spacing: .14em; }
.section-kicker.violet { color: #655cf4; }
.section-title { margin-top: 4px; font-size: 20px; font-weight: 950; letter-spacing: -.03em; }
.text-button { background: transparent; color: #7d8985; font-size: 10px; }
.todo-list { display: grid; gap: 9px; }
.todo-card { display: flex; width: 100%; min-height: 82px; align-items: center; padding: 13px; border: 1px solid rgba(18,54,45,.05); border-radius: 21px; background: rgba(255,255,255,.96); box-shadow: 0 8px 22px rgba(19,59,49,.045); color: #13231f; text-align: left; }
.todo-icon { display: flex; width: 45px; height: 45px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 15px; font-size: 13px; font-weight: 900; }
.todo-order_confirmation { background: #e1f8f0; color: #078467; }
.todo-refund_approval { background: #fff0ee; color: #e95757; }
.todo-order_verification { background: #edf1ff; color: #5c63e7; }
.todo-copy { min-width: 0; flex: 1; margin-left: 12px; }
.todo-title-row { display: flex; align-items: center; gap: 6px; }
.todo-title { max-width: 190px; overflow: hidden; font-size: 12px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.urgent-badge { padding: 3px 5px; border-radius: 5px; background: #fff0ee; color: #e95757; font-size: 7px; font-weight: 850; }
.todo-detail { display: block; max-width: 225px; margin-top: 6px; overflow: hidden; color: #89938f; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.todo-arrow { margin-left: 7px; color: #aeb7b4; font-size: 24px; font-weight: 300; }
.exception-card { margin-top: 14px; padding: 16px; border: 1px solid #f3d9d4; border-radius: 22px; background: linear-gradient(135deg, #fff8f5, #fff); box-shadow: 0 9px 24px rgba(177,67,44,.05); }
.exception-head { display: flex; align-items: center; gap: 10px; }
.exception-icon { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 11px; background: #ef6457; color: #fff; font-size: 15px; font-weight: 900; }
.exception-title, .exception-count { display: block; }
.exception-title { font-size: 12px; font-weight: 900; }
.exception-count { margin-top: 2px; color: #a27d76; font-size: 8px; }
.exception-lines { margin-top: 13px; padding-top: 4px; border-top: 1px solid #f7e7e3; }
.exception-line { display: flex; align-items: center; justify-content: space-between; min-height: 35px; color: #76534d; font-size: 10px; }
.exception-line button { padding: 5px 9px; border-radius: 8px; background: #fff0ec; color: #df5145; font-size: 9px; font-weight: 800; }
.model-tag { color: #9a9cae; font-size: 8px; }
.suggestion-scroll { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 3px; }
.suggestion-card { width: 270px; min-height: 246px; flex: 0 0 270px; padding: 18px; border: 1px solid rgba(99,91,255,.09); border-radius: 24px; background: linear-gradient(145deg, #fff, #f9f8ff); box-shadow: 0 12px 28px rgba(70,61,181,.07); color: #18172a; text-align: left; }
.suggestion-top { display: flex; align-items: center; justify-content: space-between; }
.suggestion-index { color: #655cf4; font-size: 10px; font-weight: 950; letter-spacing: .08em; }
.risk-chip { padding: 4px 7px; border-radius: 99px; background: #efedff; color: #655cf4; font-size: 8px; font-weight: 800; }
.suggestion-title, .suggestion-reason { display: block; }
.suggestion-title { margin-top: 17px; font-size: 16px; font-weight: 950; line-height: 1.4; }
.suggestion-reason { min-height: 54px; margin-top: 8px; color: #77768b; font-size: 10px; line-height: 1.65; }
.impact-line { margin-top: 13px; padding: 10px; border-radius: 12px; background: #f2f0ff; }
.impact-line text, .impact-line strong { display: block; }
.impact-line text { color: #9692b6; font-size: 8px; }.impact-line strong { margin-top: 3px; color: #5149d7; font-size: 10px; }
.suggestion-action { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; color: #5a51e5; font-size: 11px; font-weight: 850; }
.recent-card { margin-top: 28px; padding: 18px; border-radius: 25px; background: #fff; box-shadow: 0 12px 30px rgba(19,59,49,.055); }
.recent-order { display: flex; width: 100%; min-height: 63px; align-items: center; border-top: 1px solid #f0f3f2; background: transparent; color: #13231f; text-align: left; }
.order-channel { display: flex; width: 31px; height: 31px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 10px; background: #e6f7f1; color: #098367; font-size: 10px; font-weight: 900; }
.recent-copy { min-width: 0; flex: 1; margin-left: 10px; }
.recent-copy text, .recent-right text { display: block; }
.recent-copy text:first-child { overflow: hidden; font-size: 10px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.recent-copy text:last-child { margin-top: 4px; color: #929c98; font-size: 8px; }
.recent-right { flex: 0 0 auto; text-align: right; }
.recent-right text:first-child { font-size: 11px; font-weight: 900; }
.recent-right text:last-child { margin-top: 4px; color: #e05d50; font-size: 8px; }
.sync-note { display: block; margin: 22px 0 2px; color: #a1aaa7; font-size: 8px; text-align: center; }
.state-card { display: flex; min-height: 65vh; flex-direction: column; align-items: center; justify-content: center; gap: 13px; padding: 30px; color: #74817d; font-size: 11px; text-align: center; }
.loading-orb { display: flex; width: 56px; height: 56px; align-items: center; justify-content: center; border-radius: 20px; background: #0d9e7b; box-shadow: 0 16px 34px rgba(13,158,123,.25); color: #fff; font-weight: 900; }
.error-state button { margin-top: 5px; padding: 11px 20px; border-radius: 13px; background: #13231f; color: #fff; font-size: 11px; }
.state-title { color: #13231f; font-size: 16px; font-weight: 900; }
.error-toast { position: fixed; z-index: 30; right: 20px; bottom: 105px; left: 20px; padding: 12px 15px; border-radius: 14px; background: #4a2420; box-shadow: 0 14px 30px rgba(40,10,6,.2); color: #fff; font-size: 10px; text-align: center; }
.sheet-layer { position: fixed; z-index: 50; inset: 0; display: flex; align-items: flex-end; background: rgba(5,20,16,.44); }
.action-sheet { width: 100%; max-height: 86vh; overflow-y: auto; padding: 10px 20px calc(22px + env(safe-area-inset-bottom)); border-radius: 30px 30px 0 0; background: #fff; box-shadow: 0 -20px 50px rgba(5,20,16,.2); }
.sheet-handle { width: 42px; height: 4px; margin: 0 auto 17px; border-radius: 99px; background: #d9dfdd; }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; }
.sheet-kicker, .sheet-title { display: block; }
.sheet-kicker { color: #0a9573; font-size: 8px; font-weight: 900; letter-spacing: .1em; }
.sheet-title { margin-top: 5px; font-size: 21px; font-weight: 950; }
.sheet-close { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 12px; background: #f2f4f3; color: #62706c; font-size: 21px; }
.order-proof { display: grid; gap: 11px; margin-top: 19px; padding: 16px; border-radius: 18px; background: #f4f7f6; }
.order-proof view { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.order-proof text { color: #8a9592; font-size: 9px; }
.order-proof strong { max-width: 230px; color: #243631; font-size: 10px; text-align: right; }
.form-field { margin-top: 19px; }
.field-label, .field-help { display: block; }
.field-label { font-size: 11px; font-weight: 850; }
.code-input { height: 52px; margin-top: 9px; padding: 0 15px; border: 1px solid #dfe7e4; border-radius: 15px; background: #fafcfb; font-size: 17px; font-weight: 850; letter-spacing: .18em; }
.field-help { margin-top: 8px; color: #8c9693; font-size: 8px; line-height: 1.55; }
.confirmation-box { display: flex; width: 100%; align-items: flex-start; gap: 11px; margin-top: 18px; padding: 14px; border: 1px solid #eadeda; border-radius: 17px; background: #fff9f7; color: #33211e; text-align: left; }
.confirmation-box.checked { border-color: #0fa27d; background: #f0fbf7; }
.checkmark { display: flex; width: 21px; height: 21px; flex: 0 0 auto; align-items: center; justify-content: center; border: 1px solid #bdc9c5; border-radius: 7px; color: #fff; font-size: 11px; }
.checked .checkmark { border-color: #0b9c78; background: #0b9c78; }
.confirmation-box text { display: block; }
.confirmation-box text:first-child { font-size: 10px; font-weight: 850; }.confirmation-box text:last-child { margin-top: 5px; color: #8b7772; font-size: 8px; line-height: 1.5; }
.confirmation-note { margin-top: 18px; padding: 13px; border-left: 4px solid #0b9c78; border-radius: 4px 13px 13px 4px; background: #effaf6; color: #42645a; font-size: 9px; line-height: 1.6; }
.primary-sheet-action { width: 100%; height: 53px; margin-top: 19px; border-radius: 17px; background: #0b9c78; box-shadow: 0 14px 26px rgba(11,156,120,.22); color: #fff; font-size: 12px; font-weight: 900; }
.primary-sheet-action[disabled] { opacity: .6; }
.risk-note { display: block; margin-top: 10px; color: #9aa4a1; font-size: 8px; text-align: center; }
.bottom-nav { position: fixed; z-index: 20; right: 12px; bottom: calc(10px + env(safe-area-inset-bottom)); left: 12px; display: grid; height: 70px; grid-template-columns: 1fr 1fr 58px 1fr 1fr; align-items: center; padding: 0 7px; border: 1px solid rgba(255,255,255,.9); border-radius: 24px; background: rgba(255,255,255,.94); box-shadow: 0 18px 44px rgba(17,55,46,.17); }
.nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; background: transparent; color: #8a9592; font-size: 8px; }
.nav-item.active { color: #078467; font-weight: 850; }
.nav-icon { font-size: 17px; line-height: 1; }
.nav-fab { display: flex; width: 49px; height: 49px; align-items: center; justify-content: center; justify-self: center; border-radius: 17px; background: linear-gradient(145deg, #0fbb8d, #08785f); box-shadow: 0 12px 23px rgba(9,143,108,.3); color: #fff; font-size: 18px; transform: translateY(-12px); }
.pressed { opacity: .78; transform: scale(.985); }
@media (min-width: 680px) {
  .page-content { max-width: 760px; margin: 0 auto; }
  .bottom-nav { right: 50%; left: auto; width: 560px; transform: translateX(50%); }
  .action-sheet { max-width: 520px; margin: 0 auto; }
}
</style>
