<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ConsumerStoreOfferSummary,
  ConsumerStoreReservationSlotSummary,
} from '@lequ/contracts'
import {
  cancelConsumerDealDraft,
  confirmConsumerDealDraft,
  createConsumerDealDraft,
  fetchConsumerStoreDetail,
  requestConsumerDealRefund,
  type ConsumerStoreDetailOverview,
} from '../../services/consumer'

const overview = ref<ConsumerStoreDetailOverview | null>(null)
const loading = ref(true)
const submitting = ref(false)
const confirming = ref(false)
const aftercareBusy = ref(false)
const errorMessage = ref('')
const storeId = ref('')
const requestedOfferId = ref('')
const requestedSpuId = ref('')
const selectedOfferId = ref('')
const quantity = ref(1)
const serviceDate = ref('')
const selectedReservationSlotId = ref('')

const selectedOffer = computed(() =>
  overview.value?.offers.find((offer) => offer.id === selectedOfferId.value)
  ?? overview.value?.offers[0]
  ?? null)

const reservationDateStart = computed(() => {
  const offer = selectedOffer.value
  return offer?.kind === 'RESERVATION' ? reservationStartDate(offer) : ''
})

const reservationDateEnd = computed(() => {
  const offer = selectedOffer.value
  return offer?.kind === 'RESERVATION' ? chinaDateValue(offer.validUntil) : ''
})

const reservationSlotsForDate = computed<ConsumerStoreReservationSlotSummary[]>(() => {
  const offer = selectedOffer.value
  const weekday = calendarWeekday(serviceDate.value)
  if (offer?.kind !== 'RESERVATION' || weekday === null) return []
  return offer.reservationSlots.filter(
    (slot) => slot.weekday === weekday
      && slot.remainingCapacity >= quantity.value
      && slotWithinOfferValidity(offer, serviceDate.value, slot),
  )
})

const selectedReservationSlot = computed(() =>
  reservationSlotsForDate.value.find((slot) => slot.id === selectedReservationSlotId.value)
  ?? null)

const reservationSlotLabels = computed(() =>
  reservationSlotsForDate.value.map((slot) => [
    `${slotTime(slot.startTime)}–${slotTime(slot.endTime)}`,
    `${slot.priceOverrideFen === null ? '标准价' : '时段价'} ${money(slot.priceFen)}`,
    `剩余 ${slot.remainingCapacity}`,
  ].join(' · ')))

const selectedReservationSlotIndex = computed(() => {
  const index = reservationSlotsForDate.value.findIndex(
    (slot) => slot.id === selectedReservationSlotId.value,
  )
  return index < 0 ? 0 : index
})

const selectedUnitPriceFen = computed<number | null>(() =>
  selectedOffer.value?.kind === 'RESERVATION'
    ? (selectedReservationSlot.value?.priceFen ?? null)
    : (selectedOffer.value?.priceFen ?? null))

const canCreateSelectedDraft = computed(() => {
  const offer = selectedOffer.value
  if (!offer?.canCreateDraft) return false
  return offer.kind !== 'RESERVATION' || selectedReservationSlot.value !== null
})

function money(value: number): string {
  return `¥${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}`
}

function dateLabel(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function calendarWeekday(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const weekday = date.getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function slotTime(value: string): string {
  return value.slice(0, 5)
}

function serviceTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value
}

function localDateValue(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function chinaDateValue(value: string): string {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return value.slice(0, 10)
  const china = new Date(instant.getTime() + 8 * 60 * 60 * 1000)
  return [
    china.getUTCFullYear(),
    String(china.getUTCMonth() + 1).padStart(2, '0'),
    String(china.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function reservationStartDate(offer: ConsumerStoreOfferSummary): string {
  const tomorrow = new Date()
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowValue = localDateValue(tomorrow)
  const validFromDate = chinaDateValue(offer.validFrom)
  return validFromDate > tomorrowValue ? validFromDate : tomorrowValue
}

function slotWithinOfferValidity(
  offer: ConsumerStoreOfferSummary,
  date: string,
  slot: ConsumerStoreReservationSlotSummary,
): boolean {
  const serviceAt = Date.parse(`${date}T${serviceTime(slot.startTime)}+08:00`)
  return Number.isFinite(serviceAt)
    && serviceAt >= Date.parse(offer.validFrom)
    && serviceAt <= Date.parse(offer.validUntil)
}

function nextAllowedDate(offer: ConsumerStoreOfferSummary): string {
  const weekdays = [...new Set(
    offer.reservationSlots
      .filter((slot) => slot.remainingCapacity > 0)
      .map((slot) => slot.weekday),
  )]
  const start = reservationStartDate(offer)
  const end = chinaDateValue(offer.validUntil)
  if (start > end) return ''
  const date = new Date(`${start}T00:00:00`)
  for (let offset = 0; offset <= 366; offset += 1) {
    const candidate = new Date(date)
    candidate.setDate(candidate.getDate() + offset)
    const candidateValue = localDateValue(candidate)
    if (candidateValue > end) return ''
    const weekday = calendarWeekday(candidateValue)
    if (
      weekday !== null
      && weekdays.includes(weekday)
      && offer.reservationSlots.some((slot) =>
        slot.weekday === weekday
        && slot.remainingCapacity > 0
        && slotWithinOfferValidity(offer, candidateValue, slot))
    ) {
      return candidateValue
    }
  }
  return ''
}

function syncSelectedReservationSlot(): void {
  const current = reservationSlotsForDate.value.find(
    (slot) => slot.id === selectedReservationSlotId.value,
  )
  selectedReservationSlotId.value = current?.id ?? reservationSlotsForDate.value[0]?.id ?? ''
}

function selectOffer(offerId: string): void {
  selectedOfferId.value = offerId
  quantity.value = 1
  const offer = overview.value?.offers.find((item) => item.id === offerId)
  if (offer?.kind === 'RESERVATION') {
    serviceDate.value = nextAllowedDate(offer)
    selectedReservationSlotId.value = ''
    syncSelectedReservationSlot()
  } else {
    serviceDate.value = ''
    selectedReservationSlotId.value = ''
  }
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchConsumerStoreDetail(storeId.value)
    const initial = overview.value.offers.find((offer) => offer.id === requestedOfferId.value)?.id
      ?? overview.value.offers.find((offer) => offer.spuId === requestedSpuId.value)?.id
      ?? overview.value.offers[0]?.id
      ?? ''
    if (initial) selectOffer(initial)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '门店详情加载失败'
  } finally {
    loading.value = false
  }
}

function changeQuantity(delta: number): void {
  quantity.value = Math.max(1, Math.min(10, quantity.value + delta))
  if (selectedOffer.value?.kind === 'RESERVATION') syncSelectedReservationSlot()
}

function dateChanged(event: { detail: { value: string } }): void {
  serviceDate.value = event.detail.value
  selectedReservationSlotId.value = ''
  syncSelectedReservationSlot()
}

function slotChanged(event: { detail: { value: string | number } }): void {
  const slot = reservationSlotsForDate.value[Number(event.detail.value)]
  selectedReservationSlotId.value = slot?.id ?? ''
}

async function createDraft(): Promise<void> {
  const offer = selectedOffer.value
  const current = overview.value
  const slot = selectedReservationSlot.value
  if (
    !offer
    || !current
    || submitting.value
    || !canCreateSelectedDraft.value
    || (offer.kind === 'RESERVATION' && !slot)
  ) return
  submitting.value = true
  errorMessage.value = ''
  try {
    overview.value = await createConsumerDealDraft({
      storeId: current.store.id,
      offerId: offer.id,
      cityId: current.context.cityId,
      householdMemberId: current.context.householdMemberId,
      quantity: quantity.value,
      ...(offer.kind === 'RESERVATION'
        ? { serviceAt: `${serviceDate.value}T${serviceTime(slot?.startTime ?? '')}+08:00` }
        : {}),
      acknowledgedTerms: true,
    })
    uni.showToast({ title: '已建立待确认草稿', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '草稿建立失败'
  } finally {
    submitting.value = false
  }
}

async function confirmDraft(): Promise<void> {
  const draft = overview.value?.latestDraft
  if (!draft || !draft.canConfirm || confirming.value) return
  confirming.value = true
  errorMessage.value = ''
  try {
    overview.value = await confirmConsumerDealDraft({
      draftId: draft.id,
      expectedVersion: draft.version,
      confirmed: true,
    })
    const paymentRequired = overview.value.latestDraft?.paymentStatus === 'PENDING_PROVIDER'
    uni.showToast({
      title: paymentRequired ? '已占用，等待支付连接器' : '订单已提交',
      icon: 'success',
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '订单确认失败'
  } finally {
    confirming.value = false
  }
}

function draftHeading(status: string): string {
  if (status === 'CONFIRMED') return '订单已建立'
  if (status === 'EXPIRED') return '草稿或占用已过期'
  return '待确认套餐草稿'
}

function orderStatusLabel(status: string | null): string {
  if (status === null) return '未创建订单'
  return {
    PENDING_CONFIRMATION: '等待商家确认',
    CONFIRMED: '商家已确认',
    READY_FOR_SERVICE: '待到店履约',
    VERIFIED: '已核销',
    COMPLETED: '已完成',
    REFUND_REQUESTED: '退款申请中',
    REFUNDED: '已退款',
    CANCELLED: '已取消',
    EXCEPTION: '履约异常',
  }[status] ?? status
}

function paymentStatusLabel(status: string): string {
  if (status === 'PENDING_PROVIDER') return '等待支付连接器（未扣款）'
  if (status === 'SUCCEEDED') return '支付成功'
  if (status === 'FAILED') return '支付失败'
  if (status === 'CANCELLED') return '支付已取消'
  if (status === 'LATE_SUCCEEDED') return '迟到支付 · 补偿退款中'
  return '无需支付'
}

function refundStatusLabel(status: string): string {
  if (status === 'REQUESTED') return '退款待商家审核'
  if (status === 'APPROVED_PENDING_PROVIDER') return '退款处理中'
  if (status === 'REFUNDED') return '退款成功'
  if (status === 'FAILED') return '退款失败 · 待重试'
  return '无退款'
}

function holdStatusLabel(status: string): string {
  return {
    NONE: '未占用',
    HELD: '支付前暂时占用',
    CONSUMED: '已转履约占用',
    RELEASED: '已释放',
    FULFILLED: '已履约完成',
  }[status] ?? status
}

function verificationStatusLabel(status: string): string {
  return {
    NOT_ISSUED: '待商家接单后签发',
    ISSUED: '可出示核销',
    REDEEMED: '已核销',
    REVOKED: '已撤销',
    EXPIRED: '已过期',
  }[status] ?? status
}

function askForConfirmation(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText: '确认',
      cancelText: '返回',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}

async function cancelDraft(): Promise<void> {
  const draft = overview.value?.latestDraft
  if (!draft?.canCancel || aftercareBusy.value) return
  const confirmed = await askForConfirmation(
    '确认取消套餐订单？',
    '未支付订单会同时释放库存或预约容量；已支付订单不能直接取消。',
  )
  if (!confirmed) return
  aftercareBusy.value = true
  errorMessage.value = ''
  try {
    await cancelConsumerDealDraft({
      draftId: draft.id,
      expectedVersion: draft.version,
      confirmed: true,
      reason: '消费者核对状态后主动取消套餐订单',
    })
    await load()
    uni.showToast({ title: '订单已取消，资源已补偿', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '订单取消失败'
  } finally {
    aftercareBusy.value = false
  }
}

async function requestRefund(): Promise<void> {
  const draft = overview.value?.latestDraft
  if (!draft?.canRequestRefund || aftercareBusy.value) return
  const confirmed = await askForConfirmation(
    '申请全额退款？',
    `将申请退回 ${money(draft.totalAmountFen)}。商家批准后仍以支付连接器签名回调为最终资金事实。`,
  )
  if (!confirmed) return
  aftercareBusy.value = true
  errorMessage.value = ''
  try {
    await requestConsumerDealRefund({
      draftId: draft.id,
      expectedVersion: draft.version,
      confirmed: true,
      reason: '消费者核对金额与影响后申请全额退款',
    })
    await load()
    uni.showToast({ title: '退款申请已提交', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '退款申请失败'
  } finally {
    aftercareBusy.value = false
  }
}

function goBack(): void {
  uni.navigateBack()
}

onLoad((query) => {
  storeId.value = typeof query?.storeId === 'string' ? query.storeId : ''
  requestedOfferId.value = typeof query?.offerId === 'string' ? query.offerId : ''
  requestedSpuId.value = typeof query?.spuId === 'string' ? query.spuId : ''
  if (!storeId.value) {
    errorMessage.value = '缺少门店标识'
    loading.value = false
    return
  }
  void load()
})
</script>

<template>
  <view class="store-page">
    <header class="store-header">
      <button class="back-button" aria-label="返回" @click="goBack">←</button>
      <view>
        <text class="header-kicker">VERIFIED LOCAL LIFE</text>
        <text class="header-title">门店详情</text>
      </view>
      <view class="header-shield">验</view>
    </header>

    <main class="store-main">
      <view v-if="loading" class="state-card">正在核对门店发布、授权和实时目录…</view>
      <view v-else-if="errorMessage && !overview" class="state-card error-card">
        <text>{{ errorMessage }}</text>
        <button @click="load">重新加载</button>
      </view>

      <template v-else-if="overview">
        <section class="hero-card">
          <view class="hero-topline">
            <text class="category-chip">{{ overview.store.category }}</text>
            <text class="rating">★ {{ overview.store.rating }} · {{ overview.store.reviewCount }} 条</text>
          </view>
          <text class="store-name">{{ overview.store.name }}</text>
          <text class="store-reason">{{ overview.store.recommendationReason }}</text>
          <view class="badge-row">
            <text v-for="badge in overview.store.badges" :key="badge" class="badge">{{ badge }}</text>
          </view>
          <view class="fact-grid">
            <view>
              <text class="fact-label">地址</text>
              <text class="fact-value">{{ overview.store.address }}</text>
            </view>
            <view>
              <text class="fact-label">营业时间</text>
              <text class="fact-value">{{ overview.store.businessHours }}</text>
            </view>
          </view>
          <text class="map-boundary">位置来自商家确认事实；当前不提供导航或实时路程。</text>
        </section>

        <section class="offer-section">
          <view class="section-head">
            <view>
              <text class="section-kicker">PUBLISHED OFFERS</text>
              <text class="section-title">在售团购与预约</text>
            </view>
            <text class="section-count">{{ overview.offers.length }} 个</text>
          </view>

          <view v-if="!overview.offers.length" class="state-card">
            当前没有已发布且有效的套餐，页面不会伪造价格或库存。
          </view>
          <button
            v-for="offer in overview.offers"
            :key="offer.id"
            class="offer-card"
            :class="{ selected: selectedOffer?.id === offer.id, sold: !offer.canCreateDraft }"
            @click="selectOffer(offer.id)"
          >
            <view class="offer-topline">
              <text class="offer-kind">{{ offer.kind === 'GROUP_BUY' ? '到店团购' : '预约服务' }}</text>
              <text class="stock" :class="offer.stockStatus.toLowerCase()">
                {{ offer.stockStatus === 'AVAILABLE' ? '可建立草稿' : offer.stockStatus === 'LOW_STOCK' ? '库存紧张' : '暂不可售' }}
              </text>
            </view>
            <text class="offer-title">{{ offer.title }}</text>
            <text class="offer-description">{{ offer.description }}</text>
            <view class="price-row">
              <text class="price">{{ money(offer.priceFen) }}</text>
              <text v-if="offer.compareAtFen" class="compare-price">{{ money(offer.compareAtFen) }}</text>
              <text class="sku-name">{{ offer.skuName }}</text>
            </view>
          </button>
        </section>

        <section v-if="selectedOffer" class="rules-card">
          <view class="section-head">
            <view>
              <text class="section-kicker">TERMS SNAPSHOT</text>
              <text class="section-title">价格与使用规则</text>
            </view>
            <text class="version-chip">V{{ selectedOffer.version }}</text>
          </view>
          <view class="rule-row">
            <text>有效期</text>
            <text>{{ dateLabel(selectedOffer.validFrom) }}–{{ dateLabel(selectedOffer.validUntil) }}</text>
          </view>
          <view class="rule-row">
            <text>每日可用</text>
            <text>{{ selectedOffer.dailyUsableTime }}</text>
          </view>
          <view class="rule-copy">
            <text class="rule-label">使用说明</text>
            <text>{{ selectedOffer.redemptionRule }}</text>
          </view>
          <view class="rule-copy">
            <text class="rule-label">退款规则</text>
            <text>{{ selectedOffer.refundRule }}</text>
          </view>

          <view class="quantity-row">
            <text>数量</text>
            <view class="stepper">
              <button @click="changeQuantity(-1)">−</button>
              <text>{{ quantity }}</text>
              <button @click="changeQuantity(1)">＋</button>
            </view>
          </view>
          <view v-if="selectedOffer.kind === 'RESERVATION'" class="booking-row">
            <picker
              mode="date"
              :value="serviceDate"
              :start="reservationDateStart"
              :end="reservationDateEnd"
              @change="dateChanged"
            >
              <view class="picker-field">日期 {{ serviceDate || '请选择' }}</view>
            </picker>
            <picker
              mode="selector"
              :range="reservationSlotLabels"
              :value="selectedReservationSlotIndex"
              :disabled="reservationSlotLabels.length === 0"
              @change="slotChanged"
            >
              <view class="picker-field">
                {{ reservationSlotLabels[selectedReservationSlotIndex] ?? '该日期暂无可用时段' }}
              </view>
            </picker>
          </view>
          <text
            v-if="selectedOffer.kind === 'RESERVATION' && selectedReservationSlot"
            class="slot-evidence"
          >
            已选真实时段：{{ slotTime(selectedReservationSlot.startTime) }}–{{ slotTime(selectedReservationSlot.endTime) }}，
            {{ selectedReservationSlot.priceOverrideFen === null ? '使用套餐标准价' : '使用该时段覆盖价' }}，
            当前剩余 {{ selectedReservationSlot.remainingCapacity }} 个名额。
          </text>
          <text
            v-else-if="selectedOffer.kind === 'RESERVATION'"
            class="slot-unavailable"
          >
            所选日期没有满足当前数量的真实可用时段，请更换日期或减少数量。
          </text>
          <view class="total-row">
            <text>草稿金额</text>
            <text>
              {{ selectedUnitPriceFen === null ? '待选择时段' : money(selectedUnitPriceFen * quantity) }}
            </text>
          </view>
          <text class="draft-boundary">
            点击后只冻结当前价格、规则和选择，尚不创建订单、不占库存、不生成核销凭证，也不会扣款。
          </text>
          <text v-if="errorMessage" class="inline-error">{{ errorMessage }}</text>
          <button
            class="draft-button"
            :disabled="submitting || !canCreateSelectedDraft"
            @click="createDraft"
          >
            {{ submitting ? '正在建立草稿…' : '我已核对规则，建立待确认草稿' }}
          </button>
        </section>

        <section v-if="overview.latestDraft" class="draft-card">
          <view class="draft-head">
            <view>
              <text class="section-kicker">CONTROLLED CHECKOUT</text>
              <text class="section-title">{{ draftHeading(overview.latestDraft.status) }}</text>
            </view>
            <text class="draft-status">{{ overview.latestDraft.status }}</text>
          </view>
          <text class="draft-title">{{ overview.latestDraft.title }} · {{ overview.latestDraft.skuName }}</text>
          <view class="draft-summary">
            <text>{{ overview.latestDraft.quantity }} 份</text>
            <text>{{ money(overview.latestDraft.totalAmountFen) }}</text>
          </view>
          <text>{{ overview.latestDraft.confirmationNotice }}</text>
          <view v-if="overview.latestDraft.orderId" class="checkout-state">
            <view>
              <text class="state-label">订单状态</text>
              <text class="state-value">{{ orderStatusLabel(overview.latestDraft.orderStatus) }}</text>
            </view>
            <view>
              <text class="state-label">支付状态</text>
              <text class="state-value">{{ paymentStatusLabel(overview.latestDraft.paymentStatus) }}</text>
            </view>
            <view>
              <text class="state-label">资源占用</text>
              <text class="state-value">{{ holdStatusLabel(overview.latestDraft.holdStatus) }}</text>
            </view>
            <view>
              <text class="state-label">退款状态</text>
              <text class="state-value">{{ refundStatusLabel(overview.latestDraft.refundStatus) }}</text>
            </view>
            <view>
              <text class="state-label">核销凭证</text>
              <text class="state-value">{{ verificationStatusLabel(overview.latestDraft.verificationStatus) }}</text>
            </view>
          </view>
          <view
            v-if="overview.latestDraft.verificationStatus === 'ISSUED' && overview.latestDraft.verificationCode"
            class="verification-card"
          >
            <text>到店核销码</text>
            <strong>{{ overview.latestDraft.verificationCode }}</strong>
            <small>仅向门店出示完整 6 位数字；商家侧只显示 {{ overview.latestDraft.verificationCodeMasked }}。</small>
          </view>
          <template v-if="overview.latestDraft.canConfirm">
            <text class="confirm-boundary">
              强确认会重新核对当前价格、规则和库存，并原子创建订单及占用资源。金额大于零时只进入“等待支付连接器”，此按钮本身不会完成扣款。
            </text>
            <text v-if="errorMessage" class="inline-error">{{ errorMessage }}</text>
            <button
              class="confirm-button"
              :disabled="confirming"
              @click="confirmDraft"
            >
              {{ confirming ? '正在原子确认…' : '确认价格与规则，提交订单' }}
            </button>
          </template>
          <view
            v-if="overview.latestDraft.canCancel || overview.latestDraft.canRequestRefund"
            class="aftercare-actions"
          >
            <button
              v-if="overview.latestDraft.canCancel"
              class="secondary-action"
              :disabled="aftercareBusy"
              @click="cancelDraft"
            >
              {{ aftercareBusy ? '正在校验…' : '取消订单并释放资源' }}
            </button>
            <button
              v-if="overview.latestDraft.canRequestRefund"
              class="refund-action"
              :disabled="aftercareBusy"
              @click="requestRefund"
            >
              {{ aftercareBusy ? '正在校验…' : `申请全额退款 ${money(overview.latestDraft.totalAmountFen)}` }}
            </button>
          </view>
        </section>
      </template>
    </main>
  </view>
</template>

<style scoped>
page { background: #f2f6f3; color: #14231c; }
.store-page { min-height: 100vh; padding-bottom: 48px; background: radial-gradient(circle at 85% 0, #d9f8e7 0, transparent 26%), #f2f6f3; }
.store-header { position: sticky; top: 0; z-index: 10; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; width: min(100%, 640px); margin: 0 auto; padding: 18px; background: rgba(247, 251, 248, .94); backdrop-filter: blur(16px); border-bottom: 1px solid #dbe8df; }
.back-button, .header-shield { display: grid; place-items: center; width: 42px; height: 42px; padding: 0; border: 0; border-radius: 15px; background: white; box-shadow: 0 8px 24px rgba(26, 67, 46, .08); }
.header-kicker, .section-kicker { display: block; color: #55806a; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; }
.header-title { display: block; margin-top: 3px; font-size: 20px; font-weight: 850; }
.header-shield { color: #0d6542; font-weight: 900; background: #dff7e9; }
.store-main { box-sizing: border-box; width: min(calc(100% - 28px), 604px); margin: 18px auto 0; }
.state-card, .hero-card, .rules-card, .draft-card { box-sizing: border-box; padding: 20px; border: 1px solid #dbe8df; border-radius: 24px; background: rgba(255, 255, 255, .92); box-shadow: 0 16px 44px rgba(31, 73, 52, .07); }
.error-card { color: #a83c3c; }
.hero-topline, .offer-topline, .price-row, .section-head, .quantity-row, .total-row, .draft-head, .draft-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.category-chip, .badge, .offer-kind, .stock, .version-chip, .draft-status { border-radius: 999px; padding: 5px 9px; font-size: 11px; font-weight: 750; }
.category-chip, .badge { color: #176143; background: #e1f5e9; }
.rating { color: #b46b18; font-size: 12px; }
.store-name { display: block; margin-top: 16px; font-size: 28px; font-weight: 900; letter-spacing: -.8px; }
.store-reason, .map-boundary, .offer-description, .rule-copy, .draft-boundary { display: block; color: #5f7468; font-size: 13px; line-height: 1.65; }
.store-reason { margin-top: 10px; }
.badge-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.fact-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; margin-top: 18px; }
.fact-grid > view { padding: 13px; border-radius: 16px; background: #f5f8f5; }
.fact-label, .rule-label { display: block; color: #75877d; font-size: 11px; }
.fact-value { display: block; margin-top: 5px; font-size: 13px; font-weight: 700; }
.map-boundary { margin-top: 14px; }
.offer-section { margin-top: 24px; }
.section-title { display: block; margin-top: 4px; font-size: 20px; font-weight: 850; }
.section-count { color: #688075; }
.offer-card { box-sizing: border-box; display: block; width: 100%; margin-top: 12px; padding: 17px; text-align: left; border: 1px solid #dbe8df; border-radius: 20px; background: white; }
.offer-card.selected { border-color: #1b7a50; box-shadow: 0 0 0 2px rgba(27, 122, 80, .09); }
.offer-card.sold { opacity: .64; }
.offer-kind { color: #5a477f; background: #f0eafa; }
.stock.available { color: #176143; background: #e1f5e9; }
.stock.low_stock { color: #8a5a0d; background: #fff0cd; }
.stock.sold_out { color: #8f4343; background: #f9dddd; }
.offer-title { display: block; margin-top: 13px; font-size: 18px; font-weight: 850; }
.offer-description { margin-top: 7px; }
.price-row { justify-content: flex-start; margin-top: 14px; }
.price { color: #0c6c46; font-size: 23px; font-weight: 900; }
.compare-price { color: #95a29b; text-decoration: line-through; }
.sku-name { margin-left: auto; color: #5f7468; font-size: 12px; }
.rules-card, .draft-card { margin-top: 18px; }
.rule-row, .quantity-row, .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 14px 0; border-bottom: 1px solid #edf1ee; font-size: 13px; }
.rule-row text:last-child { text-align: right; font-weight: 700; }
.rule-copy { margin-top: 14px; padding: 14px; border-radius: 16px; background: #f6f8f6; }
.rule-copy .rule-label { margin-bottom: 5px; font-weight: 750; }
.stepper { display: flex; align-items: center; gap: 12px; }
.stepper button { width: 34px; height: 34px; padding: 0; border: 0; border-radius: 11px; background: #edf5f0; }
.booking-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.picker-field { padding: 13px; border-radius: 14px; background: #f2f6f3; font-size: 13px; }
.slot-evidence, .slot-unavailable { display: block; margin-top: 10px; font-size: 12px; line-height: 1.6; }
.slot-evidence { color: #35614c; }
.slot-unavailable { color: #a83c3c; }
.total-row { color: #0d6542; font-size: 18px; font-weight: 900; }
.draft-boundary { margin-top: 14px; padding: 13px; border-left: 3px solid #dd9b39; background: #fff8eb; }
.inline-error { display: block; margin-top: 12px; color: #a83c3c; font-size: 13px; }
.draft-button { margin-top: 14px; width: 100%; padding: 14px; border: 0; border-radius: 16px; color: white; background: #124f38; font-weight: 850; }
.draft-card { border-color: #dacff1; background: #fbf9ff; }
.draft-status { color: #5a477f; background: #eee7fa; }
.draft-title { display: block; margin-top: 15px; font-weight: 800; }
.draft-summary { margin: 12px 0; color: #0d6542; font-size: 18px; font-weight: 900; }
  .checkout-state { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
.checkout-state > view { min-width: 0; padding: 11px; border-radius: 14px; background: rgba(255, 255, 255, .72); }
.state-label, .state-value { display: block; overflow-wrap: anywhere; }
.state-label { color: #7a7188; font-size: 10px; }
.state-value { margin-top: 5px; color: #332843; font-size: 12px; font-weight: 800; line-height: 1.45; }
.confirm-boundary { display: block; margin-top: 14px; padding: 13px; color: #6f4a0b; border-left: 3px solid #dd9b39; background: #fff8eb; font-size: 13px; line-height: 1.65; }
  .confirm-button { width: 100%; margin-top: 14px; padding: 14px; color: white; border: 0; border-radius: 16px; background: #5a477f; font-weight: 850; }
  .verification-card { margin-top: 14px; padding: 16px; border: 1px solid #b8dfc7; border-radius: 18px; background: #effaf3; text-align: center; }
  .verification-card text, .verification-card small { display: block; color: #4c6c5a; font-size: 12px; }
  .verification-card strong { display: block; margin: 8px 0; color: #0c6c46; font-size: 32px; letter-spacing: 8px; }
  .aftercare-actions { display: grid; gap: 10px; margin-top: 14px; }
  .secondary-action, .refund-action { width: 100%; padding: 13px; border-radius: 15px; font-weight: 800; }
  .secondary-action { color: #42594d; border: 1px solid #cddbd2; background: white; }
  .refund-action { color: #8d3c32; border: 1px solid #efc5bd; background: #fff3f0; }
@media (max-width: 420px) {
  .fact-grid { grid-template-columns: 1fr; }
  .store-name { font-size: 24px; }
  .booking-row { grid-template-columns: 1fr; }
  .checkout-state { grid-template-columns: 1fr; }
}
</style>
