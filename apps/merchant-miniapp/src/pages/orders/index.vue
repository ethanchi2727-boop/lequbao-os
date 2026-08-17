<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import type {
  MerchantOperationsOverview,
  MerchantOrderSummary,
} from '@lequ/contracts'
import {
  approveRefund,
  confirmOrder,
  fetchMerchantOverview,
  verifyOrder,
} from '../../services/merchant'
import {
  merchantOrderAction,
  merchantOrderBlockedMessage,
  merchantOrderStatusLabel,
  merchantPaymentStatusLabel,
  merchantRefundStatusLabel,
  merchantVerificationStatusLabel,
} from '../../services/merchant-order-state'

type FilterKey = 'ALL' | 'TODO' | 'SERVING' | 'DONE' | 'EXCEPTION'

const overview = ref<MerchantOperationsOverview | null>(null)
const activeFilter = ref<FilterKey>('ALL')
const selectedOrder = ref<MerchantOrderSummary | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const verificationCode = ref('')
const refundConfirmed = ref(false)

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'TODO', label: '待处理' },
  { key: 'SERVING', label: '履约中' },
  { key: 'DONE', label: '已完成' },
  { key: 'EXCEPTION', label: '退款/异常' },
]
const typeLabels: Record<MerchantOrderSummary['type'], string> = {
  RESERVATION: '到店预约',
  GROUP_BUY: '团购订单',
  ECOMMERCE: '电商订单',
}

const filteredOrders = computed(() => {
  const orders = overview.value?.orders ?? []
  if (activeFilter.value === 'TODO') {
    return orders.filter((order) => merchantOrderAction(order) !== null)
  }
  if (activeFilter.value === 'SERVING') {
    return orders.filter((order) => ['CONFIRMED', 'READY_FOR_SERVICE'].includes(order.status))
  }
  if (activeFilter.value === 'DONE') {
    return orders.filter((order) => ['VERIFIED', 'COMPLETED'].includes(order.status))
  }
  if (activeFilter.value === 'EXCEPTION') {
    return orders.filter((order) => ['REFUND_REQUESTED', 'REFUNDED', 'EXCEPTION'].includes(order.status))
  }
  return orders
})
const actionableCount = computed(() => new Set([
  ...(overview.value?.todos.map((item) => item.orderId) ?? []),
  ...(overview.value?.exceptions.map((item) => item.orderId) ?? []),
]).size)

const selectedAction = computed(() => selectedOrder.value
  ? merchantOrderAction(selectedOrder.value)
  : null)
const selectedBlockedMessage = computed(() => selectedOrder.value
  ? merchantOrderBlockedMessage(selectedOrder.value)
  : '')

async function load(focusOrderId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchMerchantOverview(focusOrderId)
    if (focusOrderId) selectedOrder.value = overview.value.focusOrder
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '订单加载失败'
  } finally {
    loading.value = false
  }
}

onLoad((query) => void load(typeof query?.orderId === 'string' ? query.orderId : undefined))
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

function dateTime(value: string | null): string {
  if (!value) return '无需预约时段'
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function openOrder(order: MerchantOrderSummary): void {
  selectedOrder.value = order
  verificationCode.value = ''
  refundConfirmed.value = false
}

function closeOrder(): void {
  if (busy.value) return
  selectedOrder.value = null
}

function actionLabel(order: MerchantOrderSummary): string {
  if (busy.value) return '正在校验并保存证据…'
  const action = merchantOrderAction(order)
  if (action === 'CONFIRM') {
    return order.consumerDealPaymentStatus === 'NOT_APPLICABLE'
      ? '确认预约并锁定时段'
      : '确认接单并签发核销凭证'
  }
  if (action === 'APPROVE_REFUND') {
    return order.consumerDealRefundStatus === 'FAILED'
      ? `重试退款 ¥${money(order.refundAmountFen)}`
      : `提交退款处理 ¥${money(order.refundAmountFen)}`
  }
  if (action === 'VERIFY') return '核销并完成本次履约'
  return '当前状态不可操作'
}

async function execute(): Promise<void> {
  const order = selectedOrder.value
  if (!order || busy.value) return
  const action = merchantOrderAction(order)
  if (!action) {
    uni.showToast({ title: merchantOrderStatusLabel(order), icon: 'none' })
    return
  }
  if (action === 'VERIFY' && !/^\d{6}$/.test(verificationCode.value)) {
    uni.showToast({ title: '请输入 6 位核销码', icon: 'none' })
    return
  }
  if (action === 'APPROVE_REFUND' && !refundConfirmed.value) {
    uni.showToast({ title: '请先确认退款金额和影响', icon: 'none' })
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    if (action === 'CONFIRM') {
      overview.value = await confirmOrder(order)
    } else if (action === 'APPROVE_REFUND') {
      overview.value = await approveRefund(order, '顾客行程变更，商家审核同意')
    } else {
      overview.value = await verifyOrder(order, verificationCode.value)
    }
    selectedOrder.value = overview.value.focusOrder
    uni.showToast({
      title: action === 'APPROVE_REFUND' ? '已提交，等待资金结果' : '订单状态已更新',
      icon: 'success',
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '订单操作失败'
  } finally {
    busy.value = false
  }
}

function statusClass(order: MerchantOrderSummary): string {
  if (
    ['FAILED', 'CANCELLED', 'LATE_SUCCEEDED'].includes(order.consumerDealPaymentStatus)
    || order.consumerDealRefundStatus === 'FAILED'
    || ['REFUND_REQUESTED', 'EXCEPTION'].includes(order.status)
  ) return 'danger'
  if (
    order.consumerDealPaymentStatus === 'PENDING_PROVIDER'
    || order.consumerDealRefundStatus === 'APPROVED_PENDING_PROVIDER'
    || order.status === 'PENDING_CONFIRMATION'
  ) return 'warning'
  if (['VERIFIED', 'COMPLETED'].includes(order.status)) return 'success'
  return 'info'
}
</script>

<template>
  <view class="orders-page">
    <header class="page-header">
      <button class="back" @click="goBack">‹</button>
      <view>
        <text class="header-kicker">FULFILLMENT OS</text>
        <text class="header-title">聚合订单</text>
      </view>
      <button class="scan" @click="activeFilter = 'SERVING'"><text>扫</text></button>
    </header>

    <main v-if="overview" class="content">
      <section class="summary">
        <view class="summary-glow" />
        <view>
          <text class="summary-label">今日订单</text>
          <text class="summary-value">{{ overview.metrics.orderCount }}</text>
        </view>
        <view class="summary-divider" />
        <view>
          <text class="summary-label">待处理</text>
          <text class="summary-value small">{{ actionableCount }}</text>
        </view>
        <view class="summary-divider" />
        <view>
          <text class="summary-label">核销率</text>
          <text class="summary-value small">{{ overview.metrics.verificationRate }}%</text>
        </view>
      </section>

      <scroll-view class="filter-scroll" scroll-x :show-scrollbar="false">
        <view class="filter-row">
          <button
            v-for="filter in filters"
            :key="filter.key"
            :class="['filter', { active: activeFilter === filter.key }]"
            @click="activeFilter = filter.key"
          >
            {{ filter.label }}
          </button>
        </view>
      </scroll-view>

      <view class="list-heading">
        <text>{{ filters.find((item) => item.key === activeFilter)?.label }}订单</text>
        <text>{{ filteredOrders.length }} 条最近记录</text>
      </view>

      <view class="order-list">
        <button
          v-for="order in filteredOrders"
          :key="order.id"
          class="order-card"
          hover-class="pressed"
          @click="openOrder(order)"
        >
          <view class="order-head">
            <view class="order-type">
              <view :class="['channel', order.channel.toLowerCase()]">{{ order.channel === 'SKILL' ? 'S' : order.channel === 'MINIAPP' ? '微' : order.channel === 'POS' ? 'P' : '渠' }}</view>
              <view><text>{{ typeLabels[order.type] }}</text><text>{{ order.orderNo }}</text></view>
            </view>
            <text :class="['status', statusClass(order)]">{{ merchantOrderStatusLabel(order) }}</text>
          </view>
          <view class="order-product">
            <text>{{ order.itemSummary }}</text>
            <text>¥{{ money(order.paidAmountFen) }}</text>
          </view>
          <view class="order-meta">
            <view><text>顾客</text><strong>{{ order.customerName }} · {{ order.customerPhoneMasked }}</strong></view>
            <view><text>履约</text><strong>{{ dateTime(order.serviceAt) }}</strong></view>
          </view>
          <view class="order-foot">
            <text>{{ order.channel }} · {{ order.partySize ? `${order.partySize} 人` : '实物履约' }}</text>
            <text>查看详情 ›</text>
          </view>
        </button>
      </view>

      <view v-if="filteredOrders.length === 0" class="empty">
        <view>✓</view><text>这个队列已经清空</text><text>新的订单状态会实时同步到这里</text>
      </view>
    </main>

    <view v-else-if="loading" class="state"><view class="spinner">单</view><text>正在同步跨渠道订单…</text></view>
    <view v-else class="state"><text class="state-title">订单中心暂不可用</text><text>{{ errorMessage }}</text><button @click="load()">重试</button></view>

    <view v-if="errorMessage && overview" class="error-toast">{{ errorMessage }}</view>

    <view v-if="selectedOrder" class="drawer-layer" @click.self="closeOrder">
      <view class="drawer">
        <view class="handle" />
        <view class="drawer-head">
          <view>
            <view class="drawer-status-row">
              <text :class="['status', statusClass(selectedOrder)]">{{ merchantOrderStatusLabel(selectedOrder) }}</text>
              <text>{{ typeLabels[selectedOrder.type] }} · {{ selectedOrder.channel }}</text>
            </view>
            <text class="drawer-title">{{ selectedOrder.itemSummary }}</text>
            <text class="drawer-no">{{ selectedOrder.orderNo }}</text>
          </view>
          <button class="close" @click="closeOrder">×</button>
        </view>

        <view class="amount-card">
          <view><text>订单实付</text><strong>¥{{ money(selectedOrder.paidAmountFen) }}</strong></view>
          <view><text>优惠</text><strong>-¥{{ money(selectedOrder.discountFen) }}</strong></view>
          <view v-if="selectedOrder.refundAmountFen"><text>申请退款</text><strong class="refund">¥{{ money(selectedOrder.refundAmountFen) }}</strong></view>
        </view>
        <view class="detail-list">
          <view><text>顾客</text><strong>{{ selectedOrder.customerName }} · {{ selectedOrder.customerPhoneMasked }}</strong></view>
          <view><text>履约时段</text><strong>{{ dateTime(selectedOrder.serviceAt) }}</strong></view>
          <view><text>人数/类型</text><strong>{{ selectedOrder.partySize ? `${selectedOrder.partySize} 人到店` : '实物商品' }}</strong></view>
          <view v-if="selectedOrder.consumerDealPaymentStatus !== 'NOT_APPLICABLE'"><text>支付状态</text><strong>{{ merchantPaymentStatusLabel(selectedOrder) }}</strong></view>
          <view v-if="selectedOrder.consumerDealRefundStatus !== 'NOT_APPLICABLE'"><text>退款状态</text><strong>{{ merchantRefundStatusLabel(selectedOrder) }}</strong></view>
          <view v-if="selectedOrder.verificationStatus !== 'NOT_APPLICABLE'"><text>核销凭证</text><strong>{{ merchantVerificationStatusLabel(selectedOrder) }}</strong></view>
          <view><text>版本证据</text><strong>v{{ selectedOrder.version }} · 状态实时校验</strong></view>
        </view>

        <view v-if="selectedAction === 'VERIFY'" class="code-field">
          <text>顾客核销码</text>
          <input v-model="verificationCode" type="number" maxlength="6" placeholder="请输入完整 6 位数字">
          <text>已脱敏提示：{{ selectedOrder.verificationCodeMasked }}</text>
        </view>
        <button
          v-if="selectedAction === 'APPROVE_REFUND'"
          :class="['confirm-refund', { checked: refundConfirmed }]"
          @click="refundConfirmed = !refundConfirmed"
        >
          <view>{{ refundConfirmed ? '✓' : '' }}</view>
          <text>我已确认退款金额、顾客原因与资金影响</text>
        </button>

        <button v-if="selectedAction" class="main-action" :disabled="busy" hover-class="pressed" @click="execute">
          {{ actionLabel(selectedOrder) }}
        </button>
        <view v-else class="complete-proof">
          <text>✓</text>
          <view><strong>{{ merchantOrderStatusLabel(selectedOrder) }}</strong><small>{{ selectedBlockedMessage }}</small></view>
        </view>
        <text class="safety">权限校验 · 乐观锁 · 幂等写入 · 事件留痕</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
button { margin: 0; padding: 0; border: 0; line-height: inherit; } button::after { display: none; }
.orders-page { min-height: 100vh; background: #f3f6f5; color: #13231f; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
.page-header { display: grid; height: 76px; grid-template-columns: 42px 1fr 42px; align-items: center; padding: calc(env(safe-area-inset-top) + 10px) 18px 8px; }
.back, .scan { display: flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 13px; background: #fff; box-shadow: 0 8px 20px rgba(20,58,49,.07); color: #203a34; }
.back { font-size: 28px; }.scan { justify-self: end; background: #0c9674; color: #fff; font-size: 11px; font-weight: 900; }
.header-kicker, .header-title { display: block; text-align: center; }
.header-kicker { color: #159b7b; font-size: 7px; font-weight: 900; letter-spacing: .14em; }
.header-title { margin-top: 3px; font-size: 18px; font-weight: 950; }
.content { padding: 10px 18px calc(35px + env(safe-area-inset-bottom)); }
.summary { position: relative; display: grid; overflow: hidden; grid-template-columns: 1.25fr 1px 1fr 1px 1fr; align-items: center; padding: 19px; border-radius: 25px; background: linear-gradient(145deg, #092a24, #0c6d56); box-shadow: 0 20px 42px rgba(9,70,55,.2); color: #fff; }
.summary-glow { position: absolute; top: -80px; right: -10px; width: 150px; height: 150px; border-radius: 50%; background: rgba(64,238,185,.24); filter: blur(40px); }
.summary view:not(.summary-glow):not(.summary-divider) { position: relative; text-align: center; }
.summary-label, .summary-value { display: block; }.summary-label { color: rgba(255,255,255,.55); font-size: 9px; }.summary-value { margin-top: 5px; font-size: 27px; font-weight: 950; }.summary-value.small { font-size: 19px; }
.summary-divider { width: 1px; height: 32px; background: rgba(255,255,255,.14); }
.filter-scroll { width: 100%; margin-top: 17px; white-space: nowrap; }
.filter-row { display: flex; gap: 8px; padding-right: 15px; }
.filter { flex: 0 0 auto; padding: 9px 14px; border-radius: 12px; background: #e8edeb; color: #76827e; font-size: 10px; font-weight: 750; }
.filter.active { background: #153d34; box-shadow: 0 8px 16px rgba(21,61,52,.15); color: #fff; }
.list-heading { display: flex; align-items: center; justify-content: space-between; margin: 25px 2px 11px; }
.list-heading text:first-child { font-size: 17px; font-weight: 950; }.list-heading text:last-child { color: #919b98; font-size: 8px; }
.order-list { display: grid; gap: 11px; }
.order-card { width: 100%; padding: 15px; border: 1px solid rgba(22,58,49,.05); border-radius: 22px; background: #fff; box-shadow: 0 9px 25px rgba(19,59,49,.05); color: #13231f; text-align: left; }
.order-head, .order-type, .order-product, .order-foot { display: flex; align-items: center; justify-content: space-between; }
.order-type { justify-content: flex-start; gap: 9px; }
.channel { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 10px; background: #e2f8f0; color: #078467; font-size: 10px; font-weight: 900; }
.channel.skill { background: #efedff; color: #655cf4; }.channel.pos { background: #fff1e6; color: #d87022; }.channel.marketplace { background: #e8f1ff; color: #3976dc; }
.order-type text { display: block; }.order-type text:first-child { font-size: 10px; font-weight: 850; }.order-type text:last-child { margin-top: 3px; color: #9aa3a0; font-size: 7px; }
.status { padding: 5px 7px; border-radius: 8px; font-size: 8px; font-weight: 850; }
.status.warning { background: #fff3de; color: #c37810; }.status.danger { background: #fff0ee; color: #df5145; }.status.success { background: #e5f8f1; color: #078467; }.status.info { background: #eaf0ff; color: #4b68cd; }
.order-product { margin-top: 16px; }.order-product text:first-child { max-width: 230px; overflow: hidden; font-size: 13px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }.order-product text:last-child { font-size: 14px; font-weight: 950; }
.order-meta { display: grid; gap: 7px; margin-top: 13px; padding: 11px; border-radius: 13px; background: #f6f8f7; }
.order-meta view { display: flex; align-items: center; justify-content: space-between; }.order-meta text { color: #929c99; font-size: 8px; }.order-meta strong { font-size: 8px; font-weight: 750; }
.order-foot { margin-top: 12px; color: #8c9693; font-size: 8px; }.order-foot text:last-child { color: #098267; font-weight: 800; }
.empty { display: flex; min-height: 280px; flex-direction: column; align-items: center; justify-content: center; color: #87928e; }
.empty view { display: flex; width: 50px; height: 50px; align-items: center; justify-content: center; border-radius: 18px; background: #e4f7f0; color: #098267; font-size: 18px; }.empty text:nth-child(2) { margin-top: 14px; color: #253b35; font-size: 13px; font-weight: 850; }.empty text:last-child { margin-top: 5px; font-size: 9px; }
.state { display: flex; min-height: 68vh; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 30px; color: #7b8883; font-size: 10px; text-align: center; }
.spinner { display: flex; width: 54px; height: 54px; align-items: center; justify-content: center; border-radius: 18px; background: #0c9674; box-shadow: 0 15px 30px rgba(12,150,116,.24); color: #fff; font-weight: 900; }.state-title { color: #19342d; font-size: 16px; font-weight: 900; }.state button { padding: 10px 18px; border-radius: 12px; background: #19342d; color: #fff; font-size: 10px; }
.error-toast { position: fixed; z-index: 30; right: 18px; bottom: 18px; left: 18px; padding: 12px; border-radius: 13px; background: #4a2420; color: #fff; font-size: 9px; text-align: center; }
.drawer-layer { position: fixed; z-index: 40; inset: 0; display: flex; align-items: flex-end; background: rgba(5,20,16,.46); }
.drawer { width: 100%; max-height: 88vh; overflow-y: auto; padding: 10px 20px calc(23px + env(safe-area-inset-bottom)); border-radius: 30px 30px 0 0; background: #fff; box-shadow: 0 -20px 50px rgba(5,20,16,.2); }
.handle { width: 42px; height: 4px; margin: 0 auto 18px; border-radius: 99px; background: #d9dfdd; }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; }.drawer-status-row { display: flex; align-items: center; gap: 8px; color: #87928e; font-size: 8px; }.drawer-title, .drawer-no { display: block; }.drawer-title { max-width: 290px; margin-top: 10px; font-size: 20px; font-weight: 950; line-height: 1.3; }.drawer-no { margin-top: 4px; color: #9aa3a0; font-size: 8px; }
.close { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 12px; background: #f1f4f3; color: #697672; font-size: 20px; }
.amount-card { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 18px; padding: 15px; border-radius: 18px; background: linear-gradient(145deg, #f2f8f6, #f8faf9); }
.amount-card view { text-align: center; }.amount-card text, .amount-card strong { display: block; }.amount-card text { color: #8a9591; font-size: 8px; }.amount-card strong { margin-top: 5px; font-size: 14px; }.amount-card .refund { color: #df5145; }
.detail-list { display: grid; gap: 12px; margin-top: 16px; padding: 16px 2px; border-bottom: 1px solid #edf1ef; }
.detail-list view { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }.detail-list text { color: #8c9693; font-size: 9px; }.detail-list strong { max-width: 240px; font-size: 9px; text-align: right; }
.code-field { margin-top: 16px; }.code-field > text { display: block; }.code-field > text:first-child { font-size: 10px; font-weight: 850; }.code-field > text:last-child { margin-top: 7px; color: #8e9995; font-size: 8px; }.code-field input { height: 49px; margin-top: 8px; padding: 0 14px; border: 1px solid #dfe7e4; border-radius: 14px; background: #fafcfb; font-size: 16px; font-weight: 850; letter-spacing: .16em; }
.confirm-refund { display: flex; width: 100%; align-items: center; gap: 10px; margin-top: 17px; padding: 13px; border: 1px solid #eadeda; border-radius: 15px; background: #fff8f6; color: #543832; text-align: left; }.confirm-refund view { display: flex; width: 21px; height: 21px; align-items: center; justify-content: center; border: 1px solid #c5cfcc; border-radius: 7px; color: #fff; }.confirm-refund.checked { border-color: #0c9674; background: #f0fbf7; }.confirm-refund.checked view { border-color: #0c9674; background: #0c9674; }.confirm-refund text { font-size: 9px; font-weight: 750; }
.main-action { width: 100%; height: 53px; margin-top: 18px; border-radius: 17px; background: #0c9674; box-shadow: 0 14px 26px rgba(12,150,116,.22); color: #fff; font-size: 12px; font-weight: 900; }.main-action[disabled] { opacity: .6; }
.payment-pending-proof { margin-top: 18px; padding: 15px; border: 1px solid #f2d8a8; border-radius: 16px; background: #fff8e8; color: #9a6410; }.payment-pending-proof strong, .payment-pending-proof small { display: block; }.payment-pending-proof strong { font-size: 11px; }.payment-pending-proof small { margin-top: 5px; color: #98784a; font-size: 8px; }
.complete-proof { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 14px; border-radius: 16px; background: #eef9f5; color: #087d61; }.complete-proof > text { display: flex; width: 29px; height: 29px; align-items: center; justify-content: center; border-radius: 10px; background: #0c9674; color: #fff; }.complete-proof strong, .complete-proof small { display: block; }.complete-proof strong { font-size: 10px; }.complete-proof small { margin-top: 4px; color: #6d8b82; font-size: 8px; }
.safety { display: block; margin-top: 10px; color: #9aa3a0; font-size: 8px; text-align: center; }.pressed { opacity: .78; transform: scale(.987); }
@media (min-width: 680px) { .content { max-width: 760px; margin: 0 auto; }.drawer { max-width: 520px; margin: 0 auto; } }
</style>
