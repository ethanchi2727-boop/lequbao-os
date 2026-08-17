<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  MerchantCatalogOverview,
  MerchantServiceSlotSummary,
  MerchantSkuSummary,
  MerchantSpuSummary,
} from '@lequ/contracts'
import {
  adjustCatalogSkuStock,
  changeCatalogSkuPrice,
  fetchCatalogOverview,
  publishCatalogSpu,
  updateCatalogServiceSlot,
} from '../../services/catalog'

type ActionMode = 'PRICE' | 'STOCK' | 'SLOT' | null

const overview = ref<MerchantCatalogOverview | null>(null)
const spuId = ref('')
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const actionMode = ref<ActionMode>(null)
const selectedSku = ref<MerchantSkuSummary | null>(null)
const selectedSlot = ref<MerchantServiceSlotSummary | null>(null)
const confirmed = ref(false)
const priceYuan = ref('')
const compareAtYuan = ref('')
const priceReason = ref('门店经营策略调整')
const stockDelta = ref('')
const stockReason = ref('门店盘点修正')
const slotCapacity = ref('')
const slotPriceYuan = ref('')

const spu = computed<MerchantSpuSummary | null>(() => overview.value?.focusSpu ?? null)

onLoad((options) => {
  spuId.value = typeof options?.spuId === 'string' ? options.spuId : ''
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchCatalogOverview(spuId.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '商品详情加载失败'
  } finally {
    loading.value = false
  }
}

function money(fen: number | null): string {
  if (fen === null) return '—'
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: fen % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(fen / 100)
}

function weekday(value: number): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value] ?? `周${value}`
}

function statusLabel(status: MerchantSpuSummary['status']): string {
  return status === 'ACTIVE' ? '售卖中' : status === 'DRAFT' ? '草稿' : status === 'PAUSED' ? '已暂停' : '已归档'
}

function goBack(): void {
  uni.navigateBack()
}

function openPrice(sku: MerchantSkuSummary): void {
  selectedSku.value = sku
  priceYuan.value = String(sku.priceFen / 100)
  compareAtYuan.value = sku.compareAtFen === null ? '' : String(sku.compareAtFen / 100)
  priceReason.value = '门店经营策略调整'
  confirmed.value = false
  actionMode.value = 'PRICE'
}

function openStock(sku: MerchantSkuSummary): void {
  selectedSku.value = sku
  stockDelta.value = ''
  stockReason.value = '门店盘点修正'
  actionMode.value = 'STOCK'
}

function openSlot(slot: MerchantServiceSlotSummary): void {
  selectedSlot.value = slot
  slotCapacity.value = String(slot.capacity)
  slotPriceYuan.value = slot.priceOverrideFen === null ? '' : String(slot.priceOverrideFen / 100)
  confirmed.value = false
  actionMode.value = 'SLOT'
}

function resetActionState(): void {
  actionMode.value = null
  selectedSku.value = null
  selectedSlot.value = null
  confirmed.value = false
}

function closeAction(): void {
  if (busy.value) return
  resetActionState()
}

async function submitAction(): Promise<void> {
  if (busy.value || !actionMode.value) return
  if ((actionMode.value === 'PRICE' || actionMode.value === 'SLOT') && !confirmed.value) {
    uni.showToast({ title: '请先完成影响确认', icon: 'none' })
    return
  }
  busy.value = true
  try {
    if (actionMode.value === 'PRICE' && selectedSku.value) {
      if (Number(priceYuan.value) <= 0 || priceReason.value.trim().length < 3) {
        throw new Error('请填写有效价格与改价原因')
      }
      overview.value = await changeCatalogSkuPrice(
        selectedSku.value,
        Math.round(Number(priceYuan.value) * 100),
        compareAtYuan.value ? Math.round(Number(compareAtYuan.value) * 100) : null,
        priceReason.value.trim(),
      )
      uni.showToast({ title: '新价格规则已生效', icon: 'success' })
    } else if (actionMode.value === 'STOCK' && selectedSku.value) {
      const delta = Number(stockDelta.value)
      if (!Number.isInteger(delta) || delta === 0 || stockReason.value.trim().length < 3) {
        throw new Error('请输入非 0 的整数库存变化量')
      }
      overview.value = await adjustCatalogSkuStock(selectedSku.value, delta, stockReason.value.trim())
      uni.showToast({ title: '库存已更新', icon: 'success' })
    } else if (actionMode.value === 'SLOT' && selectedSlot.value) {
      const capacity = Number(slotCapacity.value)
      if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('请输入有效时段容量')
      overview.value = await updateCatalogServiceSlot(
        selectedSlot.value,
        capacity,
        slotPriceYuan.value ? Math.round(Number(slotPriceYuan.value) * 100) : null,
      )
      uni.showToast({ title: '预约时段已更新', icon: 'success' })
    }
    resetActionState()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function publish(): Promise<void> {
  if (!spu.value || busy.value) return
  const accepted = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '确认发布商品',
      content: `将校验图文完整度、SKU 与预约时段，并把「${spu.value?.name}」同步到在售目录。`,
      confirmText: '校验并发布',
      confirmColor: '#078568',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
  if (!accepted) return
  busy.value = true
  try {
    overview.value = await publishCatalogSpu(spu.value)
    uni.showToast({ title: '商品已发布', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '发布失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view v-if="spu" class="detail-page">
    <view class="hero">
      <view class="hero-top">
        <button @click="goBack">‹</button>
        <text>商品详情</text>
        <button>•••</button>
      </view>
      <view :class="['hero-art', `art-${spu.type.toLowerCase()}`]">
        <view class="art-ring" />
        <text>{{ spu.type === 'PRODUCT' ? '物' : spu.type === 'SERVICE' ? '约' : '套' }}</text>
        <view class="completion"><i :style="{ width: `${spu.mediaCompletion}%` }" /><span>图文 {{ spu.mediaCompletion }}%</span></view>
      </view>
    </view>

    <main class="content">
      <view class="title-block">
        <view class="tag-row">
          <text>{{ spu.category }}</text><text :class="spu.status.toLowerCase()">{{ statusLabel(spu.status) }}</text>
        </view>
        <text class="product-title">{{ spu.name }}</text>
        <text class="description">{{ spu.description }}</text>
        <view class="meta-row">
          <view><strong>{{ spu.skus.length }}</strong><text>SKU</text></view>
          <view><strong>{{ spu.slots.length }}</strong><text>预约时段</text></view>
          <view><strong>v{{ spu.version }}</strong><text>商品版本</text></view>
        </view>
      </view>

      <section>
        <view class="section-head"><view><text>SELLING UNITS</text><strong>规格与价格</strong></view><span>价格规则版本化</span></view>
        <view class="sku-list">
          <view v-for="sku in spu.skus" :key="sku.id" class="sku-card">
            <view class="sku-top">
              <view><text class="sku-code">{{ sku.code }}</text><strong>{{ sku.name }}</strong></view>
              <view class="price"><text>¥</text>{{ money(sku.priceFen) }}</view>
            </view>
            <view class="sku-signals">
              <text>{{ sku.pricingRuleVersion }}</text>
              <text>{{ sku.stockMode === 'FINITE' ? `库存 ${sku.stockQuantity} / 预警 ${sku.lowStockThreshold}` : sku.stockMode === 'SLOT' ? '按预约时段售卖' : '无限库存' }}</text>
              <text :class="sku.status.toLowerCase()">{{ sku.status === 'ACTIVE' ? '可售' : sku.status === 'OUT_OF_STOCK' ? '售罄' : '暂停' }}</text>
            </view>
            <view class="sku-actions">
              <button @click="openPrice(sku)">调整价格</button>
              <button v-if="sku.stockMode === 'FINITE'" @click="openStock(sku)">盘点库存</button>
            </view>
          </view>
        </view>
      </section>

      <section v-if="spu.slots.length">
        <view class="section-head"><view><text>RESERVATION CAPACITY</text><strong>预约时段</strong></view><span>容量不可低于已预约</span></view>
        <view class="slot-list">
          <button v-for="slot in spu.slots" :key="slot.id" class="slot-card" @click="openSlot(slot)">
            <view class="slot-date"><strong>{{ weekday(slot.weekday) }}</strong><text>{{ slot.startTime }}–{{ slot.endTime }}</text></view>
            <view class="slot-meter">
              <view><i :style="{ width: `${Math.min(100, Math.round(slot.reserved / slot.capacity * 100))}%` }" /></view>
              <text>已约 {{ slot.reserved }} / {{ slot.capacity }}</text>
            </view>
            <view class="slot-price"><text>{{ slot.priceOverrideFen === null ? '基础价' : `¥${money(slot.priceOverrideFen)} 时段价` }}</text><strong>›</strong></view>
          </button>
        </view>
      </section>

      <view class="evidence-card">
        <view class="evidence-icon">⌁</view>
        <view><strong>商品变更全程留痕</strong><text>版本校验、权限边界、强确认与审计证据均已启用。</text></view>
      </view>

      <button
        v-if="spu.status === 'DRAFT' || spu.status === 'PAUSED'"
        class="publish-button"
        :disabled="busy"
        @click="publish"
      >{{ busy ? '正在校验发布条件…' : '校验并发布商品' }}</button>
    </main>

    <view v-if="actionMode" class="sheet-layer" @click.self="closeAction">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text>{{ actionMode === 'PRICE' ? 'PRICING RULE' : actionMode === 'STOCK' ? 'STOCK LEDGER' : 'SLOT CAPACITY' }}</text>
            <strong>{{ actionMode === 'PRICE' ? '调整价格' : actionMode === 'STOCK' ? '盘点库存' : '调整预约时段' }}</strong>
          </view>
          <button @click="closeAction">×</button>
        </view>

        <view v-if="actionMode === 'PRICE' && selectedSku" class="action-body">
          <view class="change-summary"><text>当前售价</text><strong>¥{{ money(selectedSku.priceFen) }}</strong><span>{{ selectedSku.pricingRuleVersion }}</span></view>
          <view class="two-fields">
            <label><text>新售价（元）</text><input v-model="priceYuan" type="digit"></label>
            <label><text>划线价（元，可选）</text><input v-model="compareAtYuan" type="digit" placeholder="留空"></label>
          </view>
          <label class="field"><text>改价原因</text><input v-model="priceReason"></label>
        </view>

        <view v-if="actionMode === 'STOCK' && selectedSku" class="action-body">
          <view class="change-summary"><text>当前可用库存</text><strong>{{ selectedSku.stockQuantity }}</strong><span>低库存阈值 {{ selectedSku.lowStockThreshold }}</span></view>
          <view class="quick-delta">
            <button @click="stockDelta = '-1'">−1</button><button @click="stockDelta = '-5'">−5</button>
            <button @click="stockDelta = '5'">＋5</button><button @click="stockDelta = '10'">＋10</button>
          </view>
          <label class="field"><text>库存变化量（减少请填负数）</text><input v-model="stockDelta" type="number" placeholder="例如：-2"></label>
          <label class="field"><text>盘点原因</text><input v-model="stockReason"></label>
        </view>

        <view v-if="actionMode === 'SLOT' && selectedSlot" class="action-body">
          <view class="change-summary"><text>{{ weekday(selectedSlot.weekday) }} {{ selectedSlot.startTime }}–{{ selectedSlot.endTime }}</text><strong>{{ selectedSlot.capacity }}</strong><span>已预约 {{ selectedSlot.reserved }} 位</span></view>
          <view class="two-fields">
            <label><text>新容量</text><input v-model="slotCapacity" type="number"></label>
            <label><text>时段价格（元）</text><input v-model="slotPriceYuan" type="digit" placeholder="留空沿用基础价"></label>
          </view>
        </view>

        <button
          v-if="actionMode === 'PRICE' || actionMode === 'SLOT'"
          :class="['confirmation', { checked: confirmed }]"
          @click="confirmed = !confirmed"
        >
          <i>{{ confirmed ? '✓' : '' }}</i>
          <view><strong>我已核对变更与渠道影响</strong><text>{{ actionMode === 'PRICE' ? '新价格将形成独立规则版本并同步在售渠道。' : '容量和时段价格会改变顾客可预约结果。' }}</text></view>
        </button>
        <button class="submit-action" :disabled="busy" @click="submitAction">{{ busy ? '正在安全执行…' : '确认变更' }}</button>
        <text class="safe-note">权限校验 · 乐观锁 · 幂等执行 · 不可变证据</text>
      </view>
    </view>
  </view>

  <view v-else-if="loading" class="page-state"><view>商</view><text>正在装载商品详情…</text></view>
  <view v-else class="page-state"><strong>商品详情不可用</strong><text>{{ errorMessage }}</text><button @click="load">重新加载</button></view>
</template>

<style scoped lang="scss">
page { background:#f2f6f4 }
button { margin:0; padding:0; border:0; line-height:inherit } button::after { display:none }
.detail-page { min-height:100vh; background:#f2f6f4; color:#142620; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
.hero { padding:calc(env(safe-area-inset-top) + 10px) 17px 0; background:radial-gradient(circle at 85% 0,rgba(73,228,184,.27),transparent 32%),linear-gradient(155deg,#071b17,#0d3d33); color:#fff }
.hero-top { display:grid; grid-template-columns:40px 1fr 40px; min-height:49px; align-items:center }.hero-top button { display:flex; width:36px; height:36px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:rgba(255,255,255,.07); color:#fff; font-size:25px }.hero-top button:last-child { font-size:10px; letter-spacing:2px }.hero-top>text { font-size:14px; font-weight:900; text-align:center }
.hero-art { position:relative; display:flex; height:214px; align-items:center; justify-content:center; overflow:hidden; margin-top:8px; border-radius:27px 27px 0 0 }.art-product { background:linear-gradient(145deg,#d99a5c,#65472f) }.art-service { background:linear-gradient(145deg,#7187df,#41448f) }.art-package { background:linear-gradient(145deg,#27aa87,#0e5c4c) }.art-ring { position:absolute; width:135px; height:135px; border:1px solid rgba(255,255,255,.18); border-radius:50%; box-shadow:0 0 0 30px rgba(255,255,255,.04),0 0 0 63px rgba(255,255,255,.02) }.hero-art>text { position:relative; font-size:53px; font-weight:950; text-shadow:0 14px 28px rgba(0,0,0,.18) }.completion { position:absolute; right:15px; bottom:15px; left:15px; height:25px; overflow:hidden; border-radius:9px; background:rgba(0,0,0,.22) }.completion i { position:absolute; top:0; bottom:0; left:0; background:rgba(106,237,199,.28) }.completion span { position:relative; display:block; padding:7px 9px; font-size:8px; font-weight:850 }
.content { position:relative; padding:0 17px calc(40px + env(safe-area-inset-bottom)) }.title-block { margin-top:-1px; padding:21px 18px; border-radius:0 0 24px 24px; background:#fff; box-shadow:0 13px 29px rgba(17,56,46,.07) }.tag-row { display:flex; align-items:center; gap:7px }.tag-row text { padding:4px 7px; border-radius:99px; background:#eff3f1; color:#75837f; font-size:7px; font-weight:800 }.tag-row text:last-child.active { background:#e1f7ef; color:#087c61 }.tag-row text:last-child.draft { background:#fff2d5; color:#9b6803 }.product-title,.description { display:block }.product-title { margin-top:11px; font-size:23px; font-weight:950; letter-spacing:-.035em }.description { margin-top:8px; color:#788681; font-size:9px; line-height:1.65 }.meta-row { display:grid; grid-template-columns:repeat(3,1fr); margin-top:17px; padding-top:15px; border-top:1px solid #edf1ef }.meta-row view { border-right:1px solid #edf1ef; text-align:center }.meta-row view:last-child { border:0 }.meta-row strong,.meta-row text { display:block }.meta-row strong { font-size:13px }.meta-row text { margin-top:4px; color:#9ba5a2; font-size:7px }
section { margin-top:25px }.section-head { display:flex; align-items:flex-end; justify-content:space-between; margin:0 2px 11px }.section-head view text,.section-head view strong { display:block }.section-head view text { color:#0a8e6d; font-size:7px; font-weight:900; letter-spacing:.13em }.section-head view strong { margin-top:4px; font-size:17px; font-weight:950 }.section-head>span { color:#9da7a3; font-size:7px }
.sku-list { display:grid; gap:9px }.sku-card { padding:16px; border:1px solid rgba(18,57,46,.05); border-radius:21px; background:#fff; box-shadow:0 9px 23px rgba(20,57,47,.05) }.sku-top { display:flex; align-items:flex-start; justify-content:space-between }.sku-code,.sku-top strong { display:block }.sku-code { color:#899590; font-size:7px; letter-spacing:.07em }.sku-top strong { margin-top:4px; font-size:12px }.price { color:#078366; font-size:21px; font-weight:950 }.price text { margin-right:2px; font-size:10px }.sku-signals { display:flex; gap:5px; margin-top:13px }.sku-signals text { padding:5px 7px; border-radius:8px; background:#f1f4f3; color:#77847f; font-size:7px }.sku-signals text.active { background:#e3f8f0; color:#087d62 }.sku-signals text.out_of_stock { background:#fff0e9; color:#d56a3c }.sku-actions { display:grid; grid-template-columns:repeat(2,1fr); gap:7px; margin-top:12px }.sku-actions button { height:36px; border-radius:11px; background:#edf7f3; color:#087c61; font-size:8px; font-weight:850 }
.slot-list { display:grid; gap:8px }.slot-card { display:grid; width:100%; min-height:70px; grid-template-columns:1.1fr 1fr .65fr; align-items:center; padding:11px 13px; border:1px solid rgba(18,57,46,.05); border-radius:18px; background:#fff; color:#172b25; text-align:left }.slot-date strong,.slot-date text { display:block }.slot-date strong { font-size:10px }.slot-date text { margin-top:4px; color:#7f8d88; font-size:8px }.slot-meter>view { height:5px; overflow:hidden; border-radius:99px; background:#e6ecea }.slot-meter i { display:block; height:100%; border-radius:inherit; background:#12a17b }.slot-meter>text { display:block; margin-top:5px; color:#7f8c88; font-size:7px }.slot-price { display:flex; align-items:center; justify-content:flex-end; gap:7px; color:#6f7f7a; font-size:8px }.slot-price strong { color:#aeb8b4; font-size:20px }
.evidence-card { display:flex; align-items:center; gap:11px; margin-top:18px; padding:14px; border:1px solid #dce9e5; border-radius:18px; background:#edf8f4 }.evidence-icon { display:flex; width:33px; height:33px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:11px; background:#0a8b6c; color:#fff; font-size:16px }.evidence-card strong,.evidence-card text { display:block }.evidence-card strong { font-size:9px }.evidence-card text { margin-top:4px; color:#6f847d; font-size:7px }
.publish-button { width:100%; height:53px; margin-top:16px; border-radius:17px; background:linear-gradient(135deg,#0aa37c,#08755c); box-shadow:0 14px 25px rgba(8,127,97,.2); color:#fff; font-size:11px; font-weight:900 }.publish-button[disabled] { opacity:.6 }
.sheet-layer { position:fixed; z-index:50; inset:0; display:flex; align-items:flex-end; background:rgba(4,20,15,.5) }.action-sheet { width:100%; max-height:88vh; overflow-y:auto; padding:9px 19px calc(22px + env(safe-area-inset-bottom)); border-radius:29px 29px 0 0; background:#fff }.sheet-handle { width:41px; height:4px; margin:0 auto 17px; border-radius:99px; background:#dce2e0 }.sheet-head { display:flex; align-items:flex-start; justify-content:space-between }.sheet-head text,.sheet-head strong { display:block }.sheet-head text { color:#0a8f6e; font-size:7px; font-weight:900; letter-spacing:.13em }.sheet-head strong { margin-top:4px; font-size:21px; font-weight:950 }.sheet-head button { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border-radius:12px; background:#f1f4f3; color:#66746f; font-size:20px }
.action-body { margin-top:18px }.change-summary { padding:14px; border-radius:16px; background:#f2f6f4 }.change-summary text,.change-summary strong,.change-summary span { display:block }.change-summary text { color:#788680; font-size:8px }.change-summary strong { margin-top:5px; font-size:22px }.change-summary span { margin-top:4px; color:#0a8d6d; font-size:7px }.two-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:14px }.field { display:block; margin-top:12px }.two-fields label>text,.field>text { display:block; margin:0 0 6px 2px; color:#5f706b; font-size:8px; font-weight:800 }.two-fields input,.field input { box-sizing:border-box; width:100%; height:45px; padding:0 11px; border:1px solid #e0e8e5; border-radius:13px; background:#f9fbfa; font-size:11px }.quick-delta { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:13px }.quick-delta button { height:36px; border-radius:10px; background:#e9f5f1; color:#087f63; font-size:10px; font-weight:850 }
.confirmation { display:flex; width:100%; align-items:flex-start; gap:10px; margin-top:16px; padding:13px; border:1px solid #e5dfd8; border-radius:16px; background:#fff9f4; color:#382d27; text-align:left }.confirmation.checked { border-color:#0b9976; background:#eef9f5 }.confirmation i { display:flex; width:21px; height:21px; flex:0 0 auto; align-items:center; justify-content:center; border:1px solid #bdc7c3; border-radius:7px; color:#fff; font-size:10px; font-style:normal }.confirmation.checked i { border-color:#0b9976; background:#0b9976 }.confirmation strong,.confirmation text { display:block }.confirmation strong { font-size:9px }.confirmation text { margin-top:4px; color:#84766f; font-size:7px; line-height:1.5 }
.submit-action { width:100%; height:52px; margin-top:16px; border-radius:16px; background:#0a8e6d; box-shadow:0 12px 23px rgba(10,142,109,.19); color:#fff; font-size:11px; font-weight:900 }.submit-action[disabled] { opacity:.6 }.safe-note { display:block; margin-top:9px; color:#9ba5a2; font-size:7px; text-align:center }
.page-state { display:flex; min-height:100vh; flex-direction:column; align-items:center; justify-content:center; gap:11px; background:#f2f6f4; color:#83918c; font-size:9px; text-align:center }.page-state>view { display:flex; width:54px; height:54px; align-items:center; justify-content:center; border-radius:18px; background:#0a8e6d; color:#fff; font-size:16px; font-weight:950 }.page-state strong { color:#223630; font-size:14px }.page-state button { padding:10px 18px; border-radius:12px; background:#17342c; color:#fff; font-size:9px }
@media (min-width:680px) { .hero,.content { max-width:720px; margin:0 auto }.action-sheet { max-width:520px; margin:0 auto } }
</style>
