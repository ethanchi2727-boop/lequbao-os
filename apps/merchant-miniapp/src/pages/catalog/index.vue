<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  MerchantCatalogImportSummary,
  MerchantCatalogOverview,
  MerchantSpuSummary,
  MerchantSpuType,
  MerchantStockMode,
} from '@lequ/contracts'
import {
  applyCatalogImport,
  createCatalogSpu,
  previewCatalogImport,
  type CatalogImportInputRow,
} from '../../services/catalog'

type CatalogFilter = 'ALL' | MerchantSpuType | 'DRAFT' | 'LOW_STOCK'

const overview = ref<MerchantCatalogOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const activeFilter = ref<CatalogFilter>('ALL')
const createVisible = ref(false)
const importVisible = ref(false)
const importTask = ref<MerchantCatalogImportSummary | null>(null)
const importBatchId = ref(String(Date.now()).slice(-6))

const createForm = ref({
  type: 'PRODUCT' as MerchantSpuType,
  name: '',
  category: '',
  description: '',
  mediaCompletion: '88',
  skuCode: '',
  skuName: '',
  priceYuan: '',
  stockMode: 'FINITE' as MerchantStockMode,
  stockQuantity: '20',
  lowStockThreshold: '5',
})

const filters: Array<{ key: CatalogFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PRODUCT', label: '商品' },
  { key: 'SERVICE', label: '服务' },
  { key: 'PACKAGE', label: '套餐' },
  { key: 'DRAFT', label: '草稿' },
  { key: 'LOW_STOCK', label: '低库存' },
]

const visibleSpus = computed(() => {
  const spus = overview.value?.spus ?? []
  if (activeFilter.value === 'ALL') return spus
  if (activeFilter.value === 'DRAFT') return spus.filter((spu) => spu.status === 'DRAFT')
  if (activeFilter.value === 'LOW_STOCK') {
    return spus.filter((spu) => spu.skus.some((sku) => (
      sku.stockMode === 'FINITE' && sku.stockQuantity <= sku.lowStockThreshold
    )))
  }
  return spus.filter((spu) => spu.type === activeFilter.value)
})
const draftCount = computed(() => overview.value?.spus.filter((spu) => spu.status === 'DRAFT').length ?? 0)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchOverview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '商品目录加载失败'
  } finally {
    loading.value = false
  }
}

async function fetchOverview(): Promise<MerchantCatalogOverview> {
  const { fetchCatalogOverview } = await import('../../services/catalog')
  return fetchCatalogOverview()
}

onShow(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: fen % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(fen / 100)
}

function typeLabel(type: MerchantSpuType): string {
  return type === 'PRODUCT' ? '实物商品' : type === 'SERVICE' ? '预约服务' : '组合套餐'
}

function statusLabel(status: MerchantSpuSummary['status']): string {
  return status === 'ACTIVE' ? '售卖中' : status === 'DRAFT' ? '待发布' : status === 'PAUSED' ? '已暂停' : '已归档'
}

function stockLabel(spu: MerchantSpuSummary): string {
  const sku = spu.skus[0]
  if (!sku) return '未配置'
  if (sku.stockMode === 'UNLIMITED') return '无限库存'
  if (sku.stockMode === 'SLOT') {
    const available = spu.slots.reduce((sum, slot) => sum + Math.max(0, slot.capacity - slot.reserved), 0)
    return `${available} 个可预约位`
  }
  return `库存 ${sku.stockQuantity}`
}

function openDetail(spu: MerchantSpuSummary): void {
  uni.navigateTo({ url: `/pages/catalog/detail?spuId=${encodeURIComponent(spu.id)}` })
}

function goBack(): void {
  uni.navigateBack()
}

function openCreate(): void {
  createForm.value = {
    type: 'PRODUCT',
    name: '',
    category: '',
    description: '',
    mediaCompletion: '88',
    skuCode: '',
    skuName: '',
    priceYuan: '',
    stockMode: 'FINITE',
    stockQuantity: '20',
    lowStockThreshold: '5',
  }
  createVisible.value = true
}

function validateCreate(): string | null {
  const form = createForm.value
  if (form.name.trim().length < 2) return '请填写至少 2 个字符的商品名称'
  if (form.category.trim().length < 2) return '请填写商品分类'
  if (form.description.trim().length < 5) return '请补充至少 5 个字符的商品介绍'
  if (!/^[A-Z0-9-]{3,80}$/.test(form.skuCode.trim())) return 'SKU 编码需使用大写字母、数字或连字符'
  if (form.skuName.trim().length < 2) return '请填写 SKU 名称'
  if (Number(form.priceYuan) <= 0) return '售价必须大于 0 元'
  return null
}

async function submitCreate(): Promise<void> {
  if (busy.value) return
  const validation = validateCreate()
  if (validation) {
    uni.showToast({ title: validation, icon: 'none' })
    return
  }
  const form = createForm.value
  busy.value = true
  try {
    overview.value = await createCatalogSpu({
      type: form.type,
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      mediaCompletion: Number(form.mediaCompletion),
      sku: {
        code: form.skuCode.trim(),
        name: form.skuName.trim(),
        priceFen: Math.round(Number(form.priceYuan) * 100),
        stockMode: form.stockMode,
        stockQuantity: form.stockMode === 'UNLIMITED' ? 0 : Number(form.stockQuantity),
        lowStockThreshold: Number(form.lowStockThreshold),
      },
    })
    createVisible.value = false
    uni.showToast({ title: '商品草稿已创建', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '创建失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

function buildImportRows(): CatalogImportInputRow[] {
  const suffix = importBatchId.value
  return [
    {
      type: 'PRODUCT',
      name: `山野冷萃礼盒 ${suffix}`,
      category: '零售礼盒',
      description: '标准模板导入的季节限定冷萃礼盒，适合到店自提。',
      mediaCompletion: 92,
      skuCode: `COLD-BREW-${suffix}`,
      skuName: '6 瓶装',
      priceFen: 16800,
      stockMode: 'FINITE',
      stockQuantity: 30,
      lowStockThreshold: 6,
    },
    {
      type: 'PACKAGE',
      name: `周末双人套餐 ${suffix}`,
      category: '门店套餐',
      description: '标准模板导入的双人体验套餐，创建后进入草稿区。',
      mediaCompletion: 86,
      skuCode: `WEEKEND-DUO-${suffix}`,
      skuName: '双人份',
      priceFen: 39800,
      stockMode: 'UNLIMITED',
      stockQuantity: 0,
      lowStockThreshold: 0,
    },
  ]
}

function openImport(): void {
  importTask.value = null
  importBatchId.value = String(Date.now()).slice(-6)
  importVisible.value = true
}

async function previewImport(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const before = new Set(overview.value?.imports.map((item) => item.id) ?? [])
    overview.value = await previewCatalogImport(`经营宝商品模板-${importBatchId.value}.xlsx`, buildImportRows())
    importTask.value = overview.value.imports.find((item) => !before.has(item.id)) ?? overview.value.imports[0] ?? null
    uni.showToast({
      title: importTask.value?.status === 'PREVIEWED' ? '预检通过' : '请修正模板错误',
      icon: importTask.value?.status === 'PREVIEWED' ? 'success' : 'none',
    })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '预检失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function confirmImport(): Promise<void> {
  if (!importTask.value || busy.value) return
  busy.value = true
  try {
    overview.value = await applyCatalogImport(importTask.value.id, importTask.value.version)
    importTask.value = overview.value.imports.find((item) => item.id === importTask.value?.id) ?? null
    uni.showToast({ title: '已导入 2 个商品草稿', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '导入失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view class="catalog-page">
    <view class="top-shell">
      <view class="topbar">
        <button class="back-button" aria-label="返回" @click="goBack">‹</button>
        <view><text class="eyebrow">CATALOG OS</text><text class="page-title">商品与服务</text></view>
        <button class="more-button" aria-label="更多">•••</button>
      </view>

      <view v-if="overview" class="command-card">
        <view class="command-head">
          <view>
            <text class="command-kicker">实时商品盘面</text>
            <text class="command-title">{{ overview.catalog.name }}</text>
          </view>
          <view class="live-chip"><i /> LIVE</view>
        </view>
        <view class="metric-row">
          <view><strong>{{ overview.metrics.activeSpus }}</strong><text>在售</text></view>
          <view><strong>{{ draftCount }}</strong><text>草稿</text></view>
          <view><strong>{{ overview.metrics.lowStockSkus }}</strong><text>低库存</text></view>
          <view><strong>{{ overview.metrics.slotUtilization }}%</strong><text>时段占用</text></view>
        </view>
        <view class="health-line">
          <view>
            <text>图文健康度</text>
            <strong>{{ overview.metrics.averageMediaCompletion }}%</strong>
          </view>
          <view class="progress"><i :style="{ width: `${overview.metrics.averageMediaCompletion}%` }" /></view>
        </view>
      </view>
    </view>

    <main v-if="overview" class="page-content">
      <view class="action-grid">
        <button class="create-action" hover-class="pressed" @click="openCreate">
          <view class="action-icon">＋</view>
          <view><strong>新建商品</strong><text>SPU + 首个 SKU</text></view>
          <i>→</i>
        </button>
        <button class="import-action" hover-class="pressed" @click="openImport">
          <view class="action-icon">⇩</view>
          <view><strong>批量导入</strong><text>先预检，再应用</text></view>
        </button>
      </view>

      <view class="filter-scroll">
        <button
          v-for="filter in filters"
          :key="filter.key"
          :class="['filter-pill', { active: activeFilter === filter.key }]"
          @click="activeFilter = filter.key"
        >{{ filter.label }}</button>
      </view>

      <view class="list-heading">
        <view><text>商品资产</text><strong>{{ visibleSpus.length }}</strong></view>
        <text>价格、库存与预约能力已同步</text>
      </view>

      <view class="product-list">
        <button
          v-for="spu in visibleSpus"
          :key="spu.id"
          class="product-card"
          hover-class="pressed"
          @click="openDetail(spu)"
        >
          <view :class="['product-cover', `cover-${spu.type.toLowerCase()}`]">
            <view class="cover-orbit" />
            <text>{{ spu.type === 'PRODUCT' ? '物' : spu.type === 'SERVICE' ? '约' : '套' }}</text>
            <small>{{ spu.mediaCompletion }}%</small>
          </view>
          <view class="product-copy">
            <view class="product-tags">
              <text>{{ typeLabel(spu.type) }}</text>
              <text :class="['status-tag', spu.status.toLowerCase()]">{{ statusLabel(spu.status) }}</text>
            </view>
            <text class="product-name">{{ spu.name }}</text>
            <text class="product-category">{{ spu.category }} · {{ spu.skus.length }} 个 SKU</text>
            <view class="product-bottom">
              <text class="product-price">¥{{ money(spu.skus[0]?.priceFen ?? 0) }}</text>
              <text :class="{ warning: spu.skus.some((sku) => sku.stockMode === 'FINITE' && sku.stockQuantity <= sku.lowStockThreshold) }">
                {{ stockLabel(spu) }}
              </text>
            </view>
          </view>
          <text class="card-arrow">›</text>
        </button>
      </view>

      <view v-if="visibleSpus.length === 0" class="empty-card">
        <view>⌁</view><strong>这个筛选下还没有商品</strong><text>可以新建商品，或切换到其他商品类型。</text>
      </view>

      <view class="governance-card">
        <view class="shield">✓</view>
        <view><strong>商品治理已开启</strong><text>发布门槛 · 改价强确认 · 乐观锁 · 幂等 · 审计留痕</text></view>
      </view>
    </main>

    <view v-else-if="loading" class="state-card">
      <view class="loading-mark">商</view><text>正在读取商品目录与库存信号…</text>
    </view>
    <view v-else class="state-card">
      <strong>商品目录暂时不可用</strong><text>{{ errorMessage }}</text><button @click="load">重新加载</button>
    </view>

    <view v-if="createVisible" class="sheet-layer" @click.self="createVisible = false">
      <view class="sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view><text>CREATE SPU</text><strong>新建商品草稿</strong></view>
          <button @click="createVisible = false">×</button>
        </view>
        <view class="type-switch">
          <button
            v-for="type in (['PRODUCT', 'SERVICE', 'PACKAGE'] as MerchantSpuType[])"
            :key="type"
            :class="{ active: createForm.type === type }"
            @click="createForm.type = type; createForm.stockMode = type === 'PRODUCT' ? 'FINITE' : 'UNLIMITED'"
          >{{ typeLabel(type) }}</button>
        </view>
        <view class="form-grid">
          <label><text>商品名称</text><input v-model="createForm.name" placeholder="例如：仲夏双人品鉴套餐"></label>
          <label><text>商品分类</text><input v-model="createForm.category" placeholder="例如：到店套餐"></label>
          <label class="full"><text>商品介绍</text><textarea v-model="createForm.description" maxlength="1000" placeholder="写清服务内容、适用人群和交付方式" /></label>
          <label><text>SKU 编码</text><input v-model="createForm.skuCode" placeholder="SUMMER-DUO-01"></label>
          <label><text>SKU 名称</text><input v-model="createForm.skuName" placeholder="双人份"></label>
          <label><text>售价（元）</text><input v-model="createForm.priceYuan" type="digit" placeholder="398"></label>
          <label><text>图文完整度</text><input v-model="createForm.mediaCompletion" type="number" placeholder="88"></label>
          <label v-if="createForm.stockMode === 'FINITE'"><text>初始库存</text><input v-model="createForm.stockQuantity" type="number"></label>
          <label v-if="createForm.stockMode === 'FINITE'"><text>低库存阈值</text><input v-model="createForm.lowStockThreshold" type="number"></label>
        </view>
        <view class="draft-note"><i>i</i><text>新建后先进入草稿。图文完整度达到 80%，且 SKU / 预约时段配置完整后才能发布。</text></view>
        <button class="primary-action" :disabled="busy" @click="submitCreate">{{ busy ? '正在安全创建…' : '创建商品草稿' }}</button>
      </view>
    </view>

    <view v-if="importVisible" class="sheet-layer" @click.self="importVisible = false">
      <view class="sheet import-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view><text>BATCH IMPORT</text><strong>批量导入商品</strong></view>
          <button @click="importVisible = false">×</button>
        </view>
        <view class="import-file">
          <view class="file-icon">X</view>
          <view><strong>经营宝商品模板-{{ importBatchId }}.xlsx</strong><text>2 行 · SPU / SKU 标准字段 · 本地预览</text></view>
          <text class="ready">READY</text>
        </view>
        <view class="import-flow">
          <view :class="{ done: importTask }"><i>1</i><text>模板读取</text></view>
          <span />
          <view :class="{ done: importTask?.status === 'PREVIEWED' || importTask?.status === 'APPLIED' }"><i>2</i><text>规则预检</text></view>
          <span />
          <view :class="{ done: importTask?.status === 'APPLIED' }"><i>3</i><text>确认应用</text></view>
        </view>
        <view v-if="!importTask" class="preview-table">
          <view class="table-row head"><text>商品</text><text>类型</text><text>售价</text></view>
          <view class="table-row"><text>山野冷萃礼盒</text><text>商品</text><text>¥168</text></view>
          <view class="table-row"><text>周末双人套餐</text><text>套餐</text><text>¥398</text></view>
        </view>
        <view v-else :class="['import-result', importTask.status.toLowerCase()]">
          <view class="result-icon">{{ importTask.status === 'FAILED' ? '!' : '✓' }}</view>
          <view>
            <strong>{{ importTask.status === 'APPLIED' ? '批量导入已完成' : importTask.status === 'PREVIEWED' ? '全部规则预检通过' : '模板存在待修正项' }}</strong>
            <text>{{ importTask.acceptedRows }}/{{ importTask.totalRows }} 行可导入 · {{ importTask.errors.length }} 个错误</text>
          </view>
        </view>
        <view v-if="importTask?.errors.length" class="error-list">
          <text v-for="item in importTask.errors" :key="`${item.row}-${item.field}`">第 {{ item.row }} 行 · {{ item.message }}</text>
        </view>
        <button
          v-if="!importTask"
          class="primary-action"
          :disabled="busy"
          @click="previewImport"
        >{{ busy ? '正在执行规则预检…' : '开始规则预检' }}</button>
        <button
          v-else-if="importTask.status === 'PREVIEWED'"
          class="primary-action"
          :disabled="busy"
          @click="confirmImport"
        >{{ busy ? '正在写入商品目录…' : `强确认并导入 ${importTask.acceptedRows} 行` }}</button>
        <button v-else class="secondary-action" @click="importVisible = false">完成</button>
        <text class="safe-caption">仅预检不会写入商品；确认应用后创建为草稿并保留导入证据。</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
page { background: #f2f6f4; }
button { margin: 0; padding: 0; border: 0; line-height: inherit; }
button::after { display: none; }
.catalog-page { min-height: 100vh; background: #f2f6f4; color: #12231f; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
.top-shell { padding: calc(env(safe-area-inset-top) + 10px) 18px 26px; border-radius: 0 0 34px 34px; background: radial-gradient(circle at 88% 4%, rgba(77,237,190,.25), transparent 35%), linear-gradient(155deg, #071c18, #0d3b32 72%, #0b5d4b); color: #fff; }
.topbar { display: grid; grid-template-columns: 42px 1fr 42px; align-items: center; min-height: 54px; }
.back-button, .more-button { display: flex; width: 38px; height: 38px; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.1); border-radius: 13px; background: rgba(255,255,255,.07); color: #fff; font-size: 26px; }
.more-button { justify-self: end; font-size: 12px; letter-spacing: 2px; }
.eyebrow, .page-title { display: block; text-align: center; }.eyebrow { color: #69ddbc; font-size: 7px; font-weight: 900; letter-spacing: .18em; }.page-title { margin-top: 3px; font-size: 17px; font-weight: 950; }
.command-card { margin-top: 15px; padding: 20px; border: 1px solid rgba(255,255,255,.09); border-radius: 25px; background: rgba(255,255,255,.075); box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 20px 50px rgba(0,0,0,.16); backdrop-filter: blur(10px); }
.command-head { display: flex; align-items: flex-start; justify-content: space-between; }.command-kicker,.command-title { display:block }.command-kicker { color:#70ddbe; font-size:8px; font-weight:850; letter-spacing:.12em }.command-title { margin-top:5px; font-size:17px; font-weight:900 }.live-chip { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:99px; background:rgba(93,232,192,.1); color:#78e7c7; font-size:7px; font-weight:900; letter-spacing:.1em }.live-chip i { width:5px; height:5px; border-radius:50%; background:#5de3ba; box-shadow:0 0 0 4px rgba(93,227,186,.12) }
.metric-row { display:grid; grid-template-columns:repeat(4,1fr); margin-top:22px }.metric-row view { border-right:1px solid rgba(255,255,255,.08); text-align:center }.metric-row view:last-child { border:0 }.metric-row strong,.metric-row text { display:block }.metric-row strong { font-size:20px; font-weight:950 }.metric-row text { margin-top:4px; color:rgba(255,255,255,.48); font-size:8px }
.health-line { margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,.08) }.health-line>view:first-child { display:flex; justify-content:space-between; color:rgba(255,255,255,.58); font-size:8px }.health-line strong { color:#82edcd }.progress { height:5px; margin-top:8px; overflow:hidden; border-radius:99px; background:rgba(255,255,255,.08) }.progress i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#30b991,#85edcf) }
.page-content { padding:16px 17px calc(44px + env(safe-area-inset-bottom)) }
.action-grid { display:grid; grid-template-columns:1.25fr .9fr; gap:10px }.action-grid button { display:flex; min-height:77px; align-items:center; border-radius:20px; text-align:left }.create-action { padding:13px; background:linear-gradient(135deg,#0aa47d,#08765d); box-shadow:0 12px 25px rgba(8,127,97,.18); color:#fff }.import-action { padding:13px; background:#fff; box-shadow:0 9px 22px rgba(20,57,47,.06); color:#19312b }.action-icon { display:flex; width:38px; height:38px; flex:0 0 auto; align-items:center; justify-content:center; margin-right:10px; border-radius:13px; background:rgba(255,255,255,.15); font-size:19px }.import-action .action-icon { background:#e7f6f1; color:#098065 }.action-grid strong,.action-grid text { display:block }.action-grid strong { font-size:11px; font-weight:900 }.action-grid text { margin-top:4px; color:rgba(255,255,255,.6); font-size:7px }.import-action text { color:#8b9995 }.create-action>i { margin-left:auto; font-style:normal; opacity:.7 }
.filter-scroll { display:flex; gap:7px; overflow-x:auto; margin:20px -17px 0; padding:0 17px 5px; scrollbar-width:none; -ms-overflow-style:none }.filter-scroll::-webkit-scrollbar { display:none }.filter-pill { flex:0 0 auto; padding:9px 14px; border:1px solid #e2eae7; border-radius:99px; background:#fff; color:#71817c; font-size:9px; font-weight:750 }.filter-pill.active { border-color:#0b9775; background:#0b9775; box-shadow:0 8px 16px rgba(11,151,117,.16); color:#fff }
.list-heading { display:flex; align-items:flex-end; justify-content:space-between; margin:20px 2px 11px }.list-heading>view { display:flex; align-items:center; gap:6px }.list-heading>view text { font-size:17px; font-weight:950 }.list-heading strong { padding:3px 6px; border-radius:7px; background:#dff4ed; color:#087b61; font-size:8px }.list-heading>text { color:#9aa6a2; font-size:7px }
.product-list { display:grid; gap:10px }.product-card { position:relative; display:flex; width:100%; min-height:132px; align-items:center; padding:13px; border:1px solid rgba(18,57,46,.045); border-radius:23px; background:#fff; box-shadow:0 10px 26px rgba(19,59,49,.055); color:#172a25; text-align:left }.product-cover { position:relative; display:flex; width:92px; height:104px; flex:0 0 auto; align-items:center; justify-content:center; overflow:hidden; border-radius:18px; color:#fff }.cover-product { background:linear-gradient(145deg,#e19c53,#805530) }.cover-service { background:linear-gradient(145deg,#738be7,#4a4b9d) }.cover-package { background:linear-gradient(145deg,#2aa989,#116958) }.cover-orbit { position:absolute; width:70px; height:70px; border:1px solid rgba(255,255,255,.18); border-radius:50%; box-shadow:0 0 0 15px rgba(255,255,255,.035),0 0 0 30px rgba(255,255,255,.018) }.product-cover>text { position:relative; font-size:27px; font-weight:950 }.product-cover small { position:absolute; right:7px; bottom:7px; padding:4px 5px; border-radius:7px; background:rgba(0,0,0,.2); font-size:7px; font-weight:850 }
.product-copy { min-width:0; flex:1; margin-left:13px }.product-tags { display:flex; align-items:center; gap:6px }.product-tags>text:first-child { color:#8b9894; font-size:7px }.status-tag { padding:3px 6px; border-radius:99px; font-size:7px; font-weight:850 }.status-tag.active { background:#e2f8f0; color:#087c62 }.status-tag.draft { background:#fff4d9; color:#a46d00 }.status-tag.paused { background:#f0f1f2; color:#6f7775 }.product-name,.product-category { display:block }.product-name { margin-top:8px; overflow:hidden; font-size:13px; font-weight:900; text-overflow:ellipsis; white-space:nowrap }.product-category { margin-top:5px; color:#929d99; font-size:8px }.product-bottom { display:flex; align-items:flex-end; justify-content:space-between; margin-top:13px }.product-price { color:#0a8568; font-size:15px; font-weight:950 }.product-bottom>text:last-child { color:#7d8c87; font-size:8px }.product-bottom .warning { color:#df6e39 !important; font-weight:850 }.card-arrow { margin-left:8px; color:#b7c0bd; font-size:23px }
.empty-card { display:flex; min-height:190px; flex-direction:column; align-items:center; justify-content:center; border:1px dashed #d9e4e0; border-radius:23px; background:rgba(255,255,255,.65); color:#87948f; text-align:center }.empty-card view { display:flex; width:43px; height:43px; align-items:center; justify-content:center; border-radius:15px; background:#e7f4ef; color:#0b9271; font-size:20px }.empty-card strong { margin-top:12px; color:#263934; font-size:11px }.empty-card text { margin-top:5px; font-size:8px }
.governance-card { display:flex; align-items:center; gap:11px; margin-top:15px; padding:14px; border:1px solid #dcebe6; border-radius:18px; background:#edf8f4 }.shield { display:flex; width:32px; height:32px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:11px 11px 11px 5px; background:#0a8d6d; color:#fff; font-size:12px; font-weight:900 }.governance-card strong,.governance-card text { display:block }.governance-card strong { font-size:9px }.governance-card text { margin-top:4px; color:#6d8980; font-size:7px }
.state-card { display:flex; min-height:70vh; flex-direction:column; align-items:center; justify-content:center; gap:11px; padding:30px; color:#84918d; font-size:9px; text-align:center }.loading-mark { display:flex; width:54px; height:54px; align-items:center; justify-content:center; border-radius:18px; background:#0b9271; box-shadow:0 14px 30px rgba(11,146,113,.22); color:#fff; font-size:16px; font-weight:950 }.state-card strong { color:#273934; font-size:14px }.state-card>button { padding:10px 18px; border-radius:12px; background:#17342c; color:#fff; font-size:9px }
.sheet-layer { position:fixed; z-index:50; inset:0; display:flex; align-items:flex-end; background:rgba(4,20,15,.5) }.sheet { width:100%; max-height:90vh; overflow-y:auto; padding:9px 19px calc(22px + env(safe-area-inset-bottom)); border-radius:29px 29px 0 0; background:#fff; box-shadow:0 -22px 55px rgba(4,20,15,.2) }.sheet-handle { width:41px; height:4px; margin:0 auto 17px; border-radius:99px; background:#dce2e0 }.sheet-head { display:flex; align-items:flex-start; justify-content:space-between }.sheet-head text,.sheet-head strong { display:block }.sheet-head text { color:#0a8f6e; font-size:7px; font-weight:900; letter-spacing:.14em }.sheet-head strong { margin-top:4px; font-size:21px; font-weight:950 }.sheet-head button { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border-radius:12px; background:#f1f4f3; color:#66746f; font-size:20px }
.type-switch { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:18px; padding:4px; border-radius:14px; background:#f0f4f2 }.type-switch button { height:37px; border-radius:11px; background:transparent; color:#788680; font-size:9px; font-weight:800 }.type-switch button.active { background:#fff; box-shadow:0 5px 14px rgba(23,57,48,.08); color:#087b60 }
.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 9px; margin-top:17px }.form-grid label.full { grid-column:1/-1 }.form-grid label>text { display:block; margin:0 0 6px 2px; color:#5f706b; font-size:8px; font-weight:800 }.form-grid input,.form-grid textarea { box-sizing:border-box; width:100%; border:1px solid #e1e8e5; border-radius:13px; background:#f8faf9; font-size:10px }.form-grid input { height:44px; padding:0 11px }.form-grid textarea { height:78px; padding:11px; line-height:1.5 }
.draft-note { display:flex; gap:9px; margin-top:15px; padding:12px; border-radius:14px; background:#eef8f4; color:#668078; font-size:8px; line-height:1.55 }.draft-note i { display:flex; width:19px; height:19px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:7px; background:#0a8d6d; color:#fff; font-style:normal; font-weight:900 }
.primary-action,.secondary-action { width:100%; height:52px; margin-top:17px; border-radius:16px; font-size:11px; font-weight:900 }.primary-action { background:linear-gradient(135deg,#0aa47d,#08765d); box-shadow:0 13px 24px rgba(8,127,97,.2); color:#fff }.primary-action[disabled] { opacity:.6 }.secondary-action { background:#edf2f0; color:#31453f }
.import-file { display:flex; align-items:center; gap:10px; margin-top:19px; padding:13px; border:1px solid #dfe8e5; border-radius:17px; background:#f8faf9 }.file-icon { display:flex; width:38px; height:38px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:12px; background:#168460; color:#fff; font-size:12px; font-weight:950 }.import-file>view:nth-child(2) { min-width:0; flex:1 }.import-file strong,.import-file text { display:block }.import-file strong { overflow:hidden; font-size:9px; text-overflow:ellipsis; white-space:nowrap }.import-file text { margin-top:4px; color:#899691; font-size:7px }.import-file .ready { color:#098164; font-size:7px; font-weight:900 }
.import-flow { display:flex; align-items:center; justify-content:center; margin:19px 2px }.import-flow view { display:flex; flex-direction:column; align-items:center; gap:5px; color:#9ba5a2; font-size:7px }.import-flow i { display:flex; width:24px; height:24px; align-items:center; justify-content:center; border:1px solid #d6dedb; border-radius:9px; background:#fff; font-style:normal; font-weight:900 }.import-flow span { width:46px; height:1px; margin:0 5px 12px; background:#dce4e1 }.import-flow view.done { color:#087e62 }.import-flow view.done i { border-color:#0b9875; background:#0b9875; color:#fff }.import-flow view.done+span { background:#55b99d }
.preview-table { overflow:hidden; border:1px solid #e1e8e5; border-radius:15px }.table-row { display:grid; grid-template-columns:1.6fr .7fr .6fr; min-height:39px; align-items:center; padding:0 11px; border-top:1px solid #edf1ef; color:#596a65; font-size:8px }.table-row.head { border:0; background:#f2f6f4; color:#8a9692; font-size:7px; font-weight:850 }
.import-result { display:flex; align-items:center; gap:11px; padding:15px; border-radius:16px; background:#edf9f5 }.import-result.failed { background:#fff3ee }.result-icon { display:flex; width:38px; height:38px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:13px; background:#0b9673; color:#fff; font-size:15px; font-weight:950 }.failed .result-icon { background:#e26b50 }.import-result strong,.import-result text { display:block }.import-result strong { font-size:10px }.import-result text { margin-top:5px; color:#758780; font-size:8px }.error-list { display:grid; gap:5px; margin-top:9px; padding:11px; border-radius:13px; background:#fff4f0; color:#b85d49; font-size:8px }.safe-caption { display:block; margin-top:10px; color:#99a4a0; font-size:7px; text-align:center }
.pressed { opacity:.8; transform:scale(.985) }
@media (min-width:680px) { .top-shell,.page-content { max-width:720px; margin:0 auto }.sheet { max-width:520px; margin:0 auto } }
</style>
