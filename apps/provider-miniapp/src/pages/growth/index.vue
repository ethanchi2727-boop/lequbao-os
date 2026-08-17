<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  LeadStage,
  ProviderLocalGrowthLeadSummary,
  ProviderLocalGrowthOverview,
  ProviderPackageSummary,
} from '@lequ/contracts'
import {
  approveLocalDiscount,
  assignLocalLead,
  createLocalContract,
  diagnoseLocalLead,
  fetchProviderLocalGrowth,
  signLocalContract,
} from '../../services/local-growth'

type SheetMode = 'ASSIGN' | 'CONTRACT' | 'SIGN' | 'DISCOUNT' | null

const overview = ref<ProviderLocalGrowthOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const searchKeyword = ref('')
const stageFilter = ref<'ALL' | LeadStage>('ALL')
const sheetMode = ref<SheetMode>(null)
const selectedSalespersonId = ref('')
const assignmentReason = ref('基于商圈归属和当前在手负载重新分配')
const selectedPackageCode = ref<ProviderPackageSummary['code']>('PRO')
const discountPercent = ref('3')
const confirmationChecked = ref(false)

const stageLabels: Record<LeadStage, string> = {
  NEW: '待体检',
  DIAGNOSED: '待方案',
  CONTRACT_DRAFT: '待签约',
  SIGNED: '已签约',
  ASSET_REVIEW: '资料确认',
  READY_FOR_DELIVERY: '交付就绪',
  LOST: '已关闭',
}

const stageFilters: Array<{ key: 'ALL' | LeadStage; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'NEW', label: '待体检' },
  { key: 'DIAGNOSED', label: '待方案' },
  { key: 'CONTRACT_DRAFT', label: '待签约' },
  { key: 'SIGNED', label: '已签约' },
  { key: 'READY_FOR_DELIVERY', label: '待交付' },
]

const focus = computed(() => overview.value?.focusLead ?? null)
const salespeople = computed(() => overview.value?.salespeople ?? [])
const packages = computed(() => overview.value?.packages ?? [])
const selectedPackage = computed(() =>
  overview.value?.packages.find(({ code }) => code === selectedPackageCode.value) ?? null,
)
const discountBps = computed(() => {
  const value = Number(discountPercent.value)
  return Number.isFinite(value) ? Math.max(0, Math.min(3_000, Math.round(value * 100))) : 0
})
const estimatedPrice = computed(() => {
  if (!selectedPackage.value) return 0
  return Math.round(selectedPackage.value.listPriceFen * (10_000 - discountBps.value) / 10_000)
})
const filteredLeads = computed(() => {
  const keyword = searchKeyword.value.trim().toLocaleLowerCase('zh-CN')
  return (overview.value?.leads ?? []).filter((item) => {
    const matchesStage = stageFilter.value === 'ALL' || item.lead.stage === stageFilter.value
    if (!matchesStage) return false
    if (!keyword) return true
    return [
      item.lead.name,
      item.lead.category,
      item.lead.source,
      item.ownerDisplayName,
      item.lead.address,
    ].join('\n').toLocaleLowerCase('zh-CN').includes(keyword)
  })
})
const primaryAction = computed(() => {
  if (!focus.value) return { label: '暂无线索', action: 'NONE' as const }
  const item = focus.value
  if (item.lead.stage === 'NEW') return { label: '运行免费 AI 体检', action: 'DIAGNOSE' as const }
  if (item.lead.stage === 'DIAGNOSED') return { label: '配置套餐与电子合同', action: 'CONTRACT' as const }
  if (item.lead.stage === 'CONTRACT_DRAFT' && item.contract?.discountStatus === 'PENDING') {
    return { label: '审批折扣申请', action: 'DISCOUNT' as const }
  }
  if (
    item.lead.stage === 'CONTRACT_DRAFT'
    && item.contract
    && ['AUTO_APPROVED', 'APPROVED'].includes(item.contract.discountStatus)
  ) {
    return { label: '强确认签约与六类授权', action: 'SIGN' as const }
  }
  if (item.lead.stage === 'SIGNED' || item.lead.stage === 'ASSET_REVIEW') {
    return { label: '转入九阶段交付', action: 'DELIVERY' as const }
  }
  if (item.lead.stage === 'READY_FOR_DELIVERY') {
    return { label: '查看交付看板', action: 'DELIVERY' as const }
  }
  return { label: '等待合同资料同步', action: 'NONE' as const }
})

function formatMoney(fen: number): string {
  return `¥${(fen / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function urgencyLabel(value: ProviderLocalGrowthLeadSummary['urgency']): string {
  return value === 'OVERDUE' ? '已逾期' : value === 'TODAY' ? '今日' : value === 'UPCOMING' ? '计划中' : '已收口'
}

function loadLabel(rate: number): string {
  return rate >= 100 ? '满载' : rate >= 70 ? '均衡' : '可接单'
}

function goBack(): void {
  uni.navigateBack()
}

async function load(focusLeadId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderLocalGrowth(focusLeadId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function selectLead(leadId: string): Promise<void> {
  if (focus.value?.lead.id === leadId || busy.value) return
  await load(leadId)
}

function openSheet(mode: Exclude<SheetMode, null>): void {
  const item = focus.value
  if (!item) return
  sheetMode.value = mode
  confirmationChecked.value = false
  if (mode === 'ASSIGN') {
    selectedSalespersonId.value = overview.value?.salespeople.find(
      ({ userId }) => userId !== item.lead.ownerId,
    )?.userId ?? ''
  }
  if (mode === 'CONTRACT') {
    selectedPackageCode.value = 'PRO'
    discountPercent.value = '3'
  }
}

function closeSheet(): void {
  if (busy.value) return
  sheetMode.value = null
}

async function refreshAfterCoreMutation(leadId: string): Promise<void> {
  overview.value = await fetchProviderLocalGrowth(leadId)
}

async function runPrimary(): Promise<void> {
  const item = focus.value
  if (!item || busy.value) return
  if (primaryAction.value.action === 'CONTRACT') {
    openSheet('CONTRACT')
    return
  }
  if (primaryAction.value.action === 'SIGN') {
    openSheet('SIGN')
    return
  }
  if (primaryAction.value.action === 'DISCOUNT') {
    openSheet('DISCOUNT')
    return
  }
  if (primaryAction.value.action === 'DELIVERY') {
    uni.navigateTo({ url: '/pages/delivery/index' })
    return
  }
  if (primaryAction.value.action !== 'DIAGNOSE') return
  busy.value = true
  errorMessage.value = ''
  try {
    await diagnoseLocalLead(item.lead.id, item.lead.version)
    await refreshAfterCoreMutation(item.lead.id)
    uni.showToast({ title: '体检报告已生成', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'AI 体检失败'
  } finally {
    busy.value = false
  }
}

async function submitSheet(): Promise<void> {
  const item = focus.value
  if (!item || !sheetMode.value || busy.value) return
  if (!confirmationChecked.value) {
    uni.showToast({ title: '请先完成强确认', icon: 'none' })
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    if (sheetMode.value === 'ASSIGN') {
      if (!selectedSalespersonId.value) throw new Error('请选择目标销售')
      if (assignmentReason.value.trim().length < 5) throw new Error('请填写清晰的分配原因')
      overview.value = await assignLocalLead({
        leadId: item.lead.id,
        expectedVersion: item.lead.version,
        targetOwnerId: selectedSalespersonId.value,
        reason: assignmentReason.value.trim(),
      })
    } else if (sheetMode.value === 'CONTRACT') {
      await createLocalContract({
        leadId: item.lead.id,
        expectedVersion: item.lead.version,
        packageCode: selectedPackageCode.value,
        discountBps: discountBps.value,
      })
      await refreshAfterCoreMutation(item.lead.id)
    } else if (sheetMode.value === 'DISCOUNT') {
      if (!item.contract) throw new Error('合同信息尚未同步')
      await approveLocalDiscount(item.lead.id, item.contract, '城市服务商管理员已核对套餐、价格和折扣边界')
      await refreshAfterCoreMutation(item.lead.id)
    } else if (sheetMode.value === 'SIGN') {
      if (!item.contract) throw new Error('合同信息尚未同步')
      await signLocalContract(item.lead.id, item.contract)
      await refreshAfterCoreMutation(item.lead.id)
    }
    sheetMode.value = null
    uni.showToast({ title: '已确认并完整留痕', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

onLoad((query) => {
  const focusLeadId = typeof query?.focusLeadId === 'string' ? query.focusLeadId : undefined
  void load(focusLeadId)
})
</script>

<template>
  <view class="growth-page">
    <view class="page-aura aura-one" />
    <view class="page-aura aura-two" />

    <header class="topbar">
      <button class="back-button" @click="goBack"><text>‹</text></button>
      <view class="brand-copy">
        <text>LEQU CITY OPS</text>
        <strong>本地增长中心</strong>
      </view>
      <view class="live-pill"><i /> 城市域在线</view>
    </header>

    <scroll-view scroll-y class="viewport">
      <main class="content">
        <view v-if="errorMessage" class="error-banner">
          <view><strong>操作没有完成</strong><text>{{ errorMessage }}</text></view>
          <button @click="load(focus?.lead.id)">重试</button>
        </view>

        <template v-if="loading && !overview">
          <view class="skeleton hero-skeleton" />
          <view class="skeleton metric-skeleton" />
          <view class="skeleton content-skeleton" />
        </template>

        <template v-else-if="overview">
          <section class="hero">
            <view class="hero-grid" />
            <view class="hero-head">
              <view>
                <text class="eyebrow">LOCAL GROWTH COMMAND</text>
                <strong>{{ overview.city.name }}</strong>
                <text>从线索分配到六类授权，一条规则、一份事实、一套交付入口。</text>
              </view>
              <view class="scope-seal"><span>沪</span><small>仅本城市</small></view>
            </view>
            <view class="hero-metrics">
              <view><strong>{{ overview.metrics.totalLeads }}</strong><text>本地线索</text></view>
              <view><strong>{{ overview.metrics.awaitingDiagnosis }}</strong><text>待体检</text></view>
              <view><strong>{{ overview.metrics.awaitingContract }}</strong><text>待签约</text></view>
              <view class="risk"><strong>{{ overview.metrics.overdue }}</strong><text>SLA 风险</text></view>
            </view>
            <view class="policy-bar">
              <span><i /> 城市数据隔离</span>
              <span>强确认</span>
              <span>事件只追加</span>
              <span>{{ overview.policy.packageRuleVersion }}</span>
            </view>
          </section>

          <section class="pipeline-strip">
            <view>
              <i class="blue" /><text>线索池</text><strong>{{ overview.metrics.totalLeads }}</strong>
            </view>
            <span>→</span>
            <view>
              <i class="violet" /><text>已体检</text><strong>{{ overview.metrics.totalLeads - overview.metrics.awaitingDiagnosis }}</strong>
            </view>
            <span>→</span>
            <view>
              <i class="orange" /><text>已签约</text><strong>{{ overview.metrics.signed }}</strong>
            </view>
            <span>→</span>
            <view>
              <i class="green" /><text>待交付</text><strong>{{ overview.metrics.readyForDelivery }}</strong>
            </view>
          </section>

          <section class="pool-panel panel">
            <view class="section-head">
              <view><text>LOCAL LEAD POOL</text><strong>城市线索池</strong></view>
              <span>{{ filteredLeads.length }} / {{ overview.leads.length }}</span>
            </view>
            <view class="search-box">
              <text>⌕</text>
              <input v-model="searchKeyword" placeholder="搜索商家、品类、来源或负责人" />
              <button v-if="searchKeyword" @click="searchKeyword = ''">×</button>
            </view>
            <scroll-view scroll-x class="filter-scroll">
              <view class="filter-row">
                <button
                  v-for="filter in stageFilters"
                  :key="filter.key"
                  :class="{ active: stageFilter === filter.key }"
                  @click="stageFilter = filter.key"
                >{{ filter.label }}</button>
              </view>
            </scroll-view>
            <scroll-view scroll-x class="lead-scroll">
              <view class="lead-row">
                <button
                  v-for="item in filteredLeads"
                  :key="item.lead.id"
                  class="lead-card"
                  :class="{ active: focus?.lead.id === item.lead.id }"
                  @click="selectLead(item.lead.id)"
                >
                  <view class="lead-card-top">
                    <span>{{ item.lead.name.slice(0, 1) }}</span>
                    <text :class="`urgency-${item.urgency.toLowerCase()}`">{{ urgencyLabel(item.urgency) }}</text>
                  </view>
                  <strong>{{ item.lead.name }}</strong>
                  <small>{{ item.lead.category }} · {{ item.lead.source }}</small>
                  <view class="lead-card-foot">
                    <text>{{ stageLabels[item.lead.stage] }}</text>
                    <span>{{ item.ownerDisplayName.replace('上海销售顾问', '销售') }}</span>
                  </view>
                </button>
                <view v-if="filteredLeads.length === 0" class="empty-leads">
                  <strong>没有匹配的线索</strong><text>换一个阶段或搜索词试试</text>
                </view>
              </view>
            </scroll-view>
          </section>

          <template v-if="focus">
            <section class="merchant-card">
              <view class="merchant-glow" />
              <view class="merchant-top">
                <view>
                  <view class="merchant-chips">
                    <span>{{ stageLabels[focus.lead.stage] }}</span>
                    <span>{{ focus.lead.source }}</span>
                    <span v-if="focus.lead.disputeStatus !== 'NONE'" class="alert">归属处理中</span>
                  </view>
                  <strong>{{ focus.lead.name }}</strong>
                  <text>{{ focus.lead.address }}</text>
                </view>
                <view class="health-score" :class="{ empty: focus.lead.healthScore === null }">
                  <strong>{{ focus.lead.healthScore ?? '—' }}</strong>
                  <small>健康分</small>
                </view>
              </view>
              <view class="merchant-facts">
                <view><text>商家联系人</text><strong>{{ focus.lead.contactName }}</strong><small>{{ focus.lead.contactPhoneMasked }}</small></view>
                <view><text>当前负责人</text><strong>{{ focus.ownerDisplayName }}</strong><small>调整 {{ focus.assignmentCount }} 次</small></view>
                <view><text>下一步动作</text><strong>{{ focus.lead.nextAction }}</strong><small>{{ shortDate(focus.lead.nextActionAt) }}</small></view>
              </view>
              <view class="merchant-actions">
                <button @click="openSheet('ASSIGN')"><span>⇄</span> 调整负责人</button>
                <button @click="load(focus.lead.id)"><span>↻</span> 刷新事实</button>
              </view>
            </section>

            <section class="journey-panel panel">
              <view class="section-head compact">
                <view><text>CONVERSION JOURNEY</text><strong>签约主链</strong></view>
                <span>v{{ focus.lead.version }}</span>
              </view>
              <view class="journey-track">
                <view :class="{ done: true }"><i>1</i><text>线索</text></view>
                <span />
                <view :class="{ done: focus.diagnosis }"><i>2</i><text>体检</text></view>
                <span />
                <view :class="{ done: focus.contract }"><i>3</i><text>合同</text></view>
                <span />
                <view :class="{ done: focus.contract?.status === 'SIGNED' }"><i>4</i><text>授权</text></view>
                <span />
                <view :class="{ done: focus.lead.stage === 'READY_FOR_DELIVERY' }"><i>5</i><text>交付</text></view>
              </view>
              <button
                class="primary-action"
                :class="{ disabled: primaryAction.action === 'NONE' || busy }"
                :disabled="primaryAction.action === 'NONE' || busy"
                @click="runPrimary"
              >
                <view><text>NEXT BEST ACTION</text><strong>{{ busy ? '正在安全处理…' : primaryAction.label }}</strong></view>
                <span>↗</span>
              </button>
              <view class="assurance"><text>✓ 权限校验</text><text>✓ 乐观锁</text><text>✓ 全量审计</text></view>
            </section>

            <section v-if="focus.diagnosis" class="diagnosis-panel panel">
              <view class="section-head compact">
                <view><text>AI DIAGNOSIS</text><strong>免费商家体检</strong></view>
                <view class="grade"><strong>{{ focus.diagnosis.grade }}</strong><small>{{ focus.diagnosis.score }} 分</small></view>
              </view>
              <view class="finding-list">
                <view v-for="finding in focus.diagnosis.findings" :key="finding.code">
                  <span :class="finding.severity.toLowerCase()">{{ finding.severity === 'HIGH' ? '优先' : finding.severity === 'MEDIUM' ? '关注' : '优化' }}</span>
                  <view><strong>{{ finding.title }}</strong><text>{{ finding.evidence }}</text></view>
                </view>
              </view>
              <view class="proposal-card">
                <view><text>推荐提案</text><strong>{{ focus.diagnosis.proposal.title }}</strong></view>
                <span>{{ focus.diagnosis.proposal.expectedDays }}<small>天</small></span>
              </view>
            </section>

            <section class="package-panel panel">
              <view class="section-head compact">
                <view><text>PACKAGE CATALOG</text><strong>套餐与合同</strong></view>
                <span>价格服务端计算</span>
              </view>
              <scroll-view scroll-x class="package-scroll">
                <view class="package-row">
                  <view
                    v-for="item in overview.packages"
                    :key="item.code"
                    class="package-card"
                    :class="{ recommended: item.recommended, active: focus.contract?.packageCode === item.code }"
                  >
                    <view class="package-head">
                      <span>{{ item.code }}</span><text v-if="item.recommended">推荐</text><text v-else-if="focus.contract?.packageCode === item.code">已选</text>
                    </view>
                    <strong>{{ item.name }}</strong>
                    <small>{{ item.tagline }}</small>
                    <view class="package-price"><strong>{{ formatMoney(item.listPriceFen) }}</strong><text>/ 年</text></view>
                    <view class="capability-list"><text v-for="capability in item.capabilities" :key="capability">✓ {{ capability }}</text></view>
                  </view>
                </view>
              </scroll-view>
              <view v-if="focus.contract" class="contract-summary">
                <view>
                  <text>电子合同</text>
                  <strong>{{ overview.packages.find(item => item.code === focus?.contract?.packageCode)?.name ?? focus.contract.packageCode }}</strong>
                  <small>{{ focus.contract.contractVersion }}</small>
                </view>
                <view>
                  <text>成交价</text>
                  <strong>{{ formatMoney(focus.contract.finalPriceFen) }}</strong>
                  <small>折扣 {{ (focus.contract.discountBps / 100).toFixed(0) }}%</small>
                </view>
                <view>
                  <text>合同状态</text>
                  <strong>{{ focus.contract.status === 'SIGNED' ? '已签署' : focus.contract.discountStatus === 'PENDING' ? '待折扣审批' : '可签署' }}</strong>
                  <small>版本 {{ focus.contract.version }}</small>
                </view>
              </view>
              <view v-if="focus.authorizationLabels.length" class="authorization-box">
                <view class="authorization-title"><strong>六类独立授权</strong><span>{{ focus.authorizationLabels.length }} / 6 已留痕</span></view>
                <view><text v-for="label in focus.authorizationLabels" :key="label">✓ {{ label }}</text></view>
              </view>
            </section>

            <section class="team-panel panel">
              <view class="section-head compact">
                <view><text>CITY SALES CAPACITY</text><strong>销售负载</strong></view>
                <span>{{ overview.salespeople.length }} 人在岗</span>
              </view>
              <view class="sales-list">
                <view v-for="person in overview.salespeople" :key="person.userId">
                  <span>{{ person.displayName.slice(-2) }}</span>
                  <view class="person-main">
                    <view><strong>{{ person.displayName }}</strong><text>{{ loadLabel(person.loadRate) }}</text></view>
                    <small>{{ person.activeLeadCount }} 条在手 · {{ person.diagnosedLeadCount }} 条已体检 · {{ person.signedLeadCount }} 条已签</small>
                    <view class="load-track"><i :style="{ width: `${person.loadRate}%` }" /></view>
                  </view>
                  <strong>{{ person.loadRate }}%</strong>
                </view>
              </view>
            </section>

            <section v-if="overview.assignmentEvents.length" class="history-panel panel">
              <view class="section-head compact">
                <view><text>IMMUTABLE HISTORY</text><strong>负责人调整记录</strong></view>
                <span>只追加</span>
              </view>
              <view class="history-list">
                <view v-for="event in overview.assignmentEvents" :key="event.id">
                  <i />
                  <view>
                    <strong>{{ event.previousOwnerName }} → {{ event.targetOwnerName }}</strong>
                    <text>{{ event.reason }}</text>
                    <small>{{ event.actorName }} · {{ shortDate(event.createdAt) }}</small>
                  </view>
                </view>
              </view>
            </section>
          </template>
        </template>
        <view class="safe-space" />
      </main>
    </scroll-view>

    <view v-if="sheetMode && focus" class="sheet-overlay" @click.self="closeSheet">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-header">
          <view>
            <text>{{ sheetMode === 'ASSIGN' ? 'STRONG ASSIGNMENT' : sheetMode === 'CONTRACT' ? 'CONTRACT BUILDER' : 'L2 CONFIRMATION' }}</text>
            <strong>{{ sheetMode === 'ASSIGN' ? '调整销售负责人' : sheetMode === 'CONTRACT' ? '配置套餐与合同' : sheetMode === 'DISCOUNT' ? '审批折扣申请' : '确认签约与六类授权' }}</strong>
          </view>
          <button @click="closeSheet">×</button>
        </view>

        <template v-if="sheetMode === 'ASSIGN'">
          <view class="sheet-context">
            <span>{{ focus.lead.name.slice(0, 1) }}</span>
            <view><text>当前负责人</text><strong>{{ focus.ownerDisplayName }}</strong><small>{{ focus.lead.name }} · v{{ focus.lead.version }}</small></view>
          </view>
          <text class="field-label">选择同城在岗销售</text>
          <view class="sales-choice">
            <button
              v-for="person in salespeople"
              :key="person.userId"
              :disabled="person.userId === focus.lead.ownerId"
              :class="{ active: selectedSalespersonId === person.userId }"
              @click="selectedSalespersonId = person.userId"
            >
              <view><strong>{{ person.displayName }}</strong><text>{{ person.activeLeadCount }}/{{ person.capacity }} 条在手</text></view>
              <span>{{ person.userId === focus.lead.ownerId ? '当前' : `${person.loadRate}%` }}</span>
            </button>
          </view>
          <text class="field-label">分配原因</text>
          <textarea v-model="assignmentReason" maxlength="500" />
          <view class="impact-note">未完成销售任务会同步迁移；归属事实、操作者和规则版本会永久留痕。</view>
        </template>

        <template v-else-if="sheetMode === 'CONTRACT'">
          <text class="field-label">选择标准套餐</text>
          <view class="package-choice">
            <button
              v-for="item in packages"
              :key="item.code"
              :class="{ active: selectedPackageCode === item.code }"
              @click="selectedPackageCode = item.code"
            >
              <span>{{ item.code }}</span><strong>{{ item.name }}</strong><text>{{ formatMoney(item.listPriceFen) }}/年</text>
            </button>
          </view>
          <view class="discount-field">
            <view><text class="field-label">申请折扣</text><small>≤5% 自动通过，以上进入审批</small></view>
            <view><input v-model="discountPercent" type="number" /><span>%</span></view>
          </view>
          <view v-if="selectedPackage" class="price-preview">
            <view><text>目录价</text><strong>{{ formatMoney(selectedPackage.listPriceFen) }}</strong></view>
            <span>−{{ (discountBps / 100).toFixed(0) }}%</span>
            <view><text>合同价</text><strong>{{ formatMoney(estimatedPrice) }}</strong></view>
          </view>
          <view class="impact-note">成交价只由服务端套餐规则计算，前端不保存、不推断财务事实。</view>
        </template>

        <template v-else>
          <view class="l2-card">
            <span>L2</span>
            <view>
              <strong>{{ sheetMode === 'DISCOUNT' ? '这是价格审批动作' : '这是签约与授权动作' }}</strong>
              <text>{{ sheetMode === 'DISCOUNT' ? '审批后合同才可继续签署，审批意见将进入审计链。' : '签署后生成六条独立授权记录，任一授权均可单独治理。' }}</text>
            </view>
          </view>
          <view v-if="focus.contract" class="confirm-contract">
            <view><text>商家</text><strong>{{ focus.lead.name }}</strong></view>
            <view><text>套餐</text><strong>{{ focus.contract.packageCode }}</strong></view>
            <view><text>成交价</text><strong>{{ formatMoney(focus.contract.finalPriceFen) }}</strong></view>
            <view><text>折扣</text><strong>{{ (focus.contract.discountBps / 100).toFixed(0) }}%</strong></view>
          </view>
          <view v-if="sheetMode === 'SIGN'" class="authorization-preview">
            <text v-for="label in ['数字建档与小程序', 'GEO 分发', 'Skill 生成与调用', '乐趣生活展示', '交易、支付与会员', '代金券抽佣联盟']" :key="label">✓ {{ label }}</text>
          </view>
        </template>

        <button class="confirmation-check" :class="{ checked: confirmationChecked }" @click="confirmationChecked = !confirmationChecked">
          <i>{{ confirmationChecked ? '✓' : '' }}</i>
          <view>
            <strong>我已核对身份、范围、金额与业务影响</strong>
            <text>系统将保存强确认人、实体版本、规则快照和完整审计证据。</text>
          </view>
        </button>
        <view class="sheet-footer">
          <button @click="closeSheet">取消</button>
          <button class="submit" :disabled="busy || !confirmationChecked" @click="submitSheet">{{ busy ? '正在安全提交…' : '确认并执行' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
*{box-sizing:border-box}.growth-page{position:relative;min-height:100vh;overflow:hidden;background:#f2f5f9;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.page-aura{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}.aura-one{top:-130px;right:-100px;width:300px;height:300px;background:rgba(52,120,246,.18)}.aura-two{top:520px;left:-180px;width:310px;height:310px;background:rgba(19,184,134,.10)}button{margin:0;padding:0;border:0;line-height:1.2;background:none}.topbar{position:relative;z-index:10;height:70px;padding:13px 16px;display:flex;align-items:center;border-bottom:1px solid rgba(15,23,42,.06);background:rgba(247,249,252,.86);backdrop-filter:blur(18px)}.back-button{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1px solid #e1e6ee;border-radius:13px;color:#172033;font-size:31px;background:white;box-shadow:0 6px 16px rgba(22,34,58,.05)}.brand-copy{flex:1;margin-left:11px}.brand-copy text,.brand-copy strong{display:block}.brand-copy text{color:#3478f6;font-size:7px;font-weight:900;letter-spacing:.17em}.brand-copy strong{margin-top:3px;font-size:16px;font-weight:900}.live-pill{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #dce4ed;border-radius:999px;color:#64748b;font-size:9px;background:rgba(255,255,255,.75)}.live-pill i{width:6px;height:6px;border-radius:50%;background:#16b98c;box-shadow:0 0 0 4px rgba(22,185,140,.1)}.viewport{height:calc(100vh - 70px)}.content{position:relative;z-index:1;width:min(100% - 22px,880px);margin:0 auto;padding:13px 0 32px}.error-banner{margin-bottom:11px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #ffd1d8;border-radius:16px;background:#fff0f2}.error-banner strong,.error-banner text{display:block}.error-banner strong{color:#ae2f43;font-size:11px}.error-banner text{margin-top:3px;color:#9b4a56;font-size:9px}.error-banner button{padding:8px 11px;border-radius:10px;color:white;font-size:9px;background:#d94c61}.skeleton{border-radius:24px;background:linear-gradient(100deg,#e5e9ef 20%,#f6f8fa 40%,#e5e9ef 60%);background-size:220% 100%;animation:shimmer 1.5s infinite}.hero-skeleton{height:270px}.metric-skeleton{height:90px;margin-top:11px}.content-skeleton{height:420px;margin-top:11px}@keyframes shimmer{to{background-position-x:-220%}}.hero{position:relative;overflow:hidden;padding:25px 21px 15px;border-radius:27px;color:white;background:linear-gradient(140deg,#07152c 0%,#0e2850 55%,#155c7a 120%);box-shadow:0 20px 42px rgba(6,23,50,.22)}.hero::after{position:absolute;right:-80px;top:-100px;width:280px;height:280px;border:1px solid rgba(255,255,255,.1);border-radius:50%;box-shadow:0 0 0 30px rgba(255,255,255,.025),0 0 0 61px rgba(255,255,255,.015);content:""}.hero-grid{position:absolute;inset:0;opacity:.15;background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(to bottom,black,transparent 80%)}.hero-head{position:relative;z-index:2;display:flex;justify-content:space-between;gap:18px}.hero-head>view:first-child{min-width:0;flex:1}.hero-head .eyebrow,.hero-head strong,.hero-head>view>text:last-child{display:block}.hero-head .eyebrow{color:#65e5c3;font-size:8px;font-weight:900;letter-spacing:.16em}.hero-head>view>strong{margin-top:11px;font-size:25px;font-weight:950;letter-spacing:-.04em}.hero-head>view>text:last-child{max-width:520px;margin-top:8px;color:#a7b8d1;font-size:11px;line-height:1.6}.scope-seal{position:relative;z-index:2;flex:0 0 60px;width:60px;height:69px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.15);border-radius:19px;background:rgba(255,255,255,.08);box-shadow:inset 0 1px rgba(255,255,255,.12)}.scope-seal span{font-size:22px;font-weight:900}.scope-seal small{margin-top:4px;color:#8ceace;font-size:7px}.hero-metrics{position:relative;z-index:2;margin-top:23px;display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(255,255,255,.1);border-radius:17px;background:rgba(255,255,255,.055)}.hero-metrics>view{padding:13px 8px;text-align:center}.hero-metrics>view+view{border-left:1px solid rgba(255,255,255,.09)}.hero-metrics strong,.hero-metrics text{display:block}.hero-metrics strong{font-size:23px;font-weight:900}.hero-metrics text{margin-top:3px;color:#9dafc8;font-size:8px}.hero-metrics .risk strong{color:#ff9ba6}.policy-bar{position:relative;z-index:2;margin-top:12px;padding-top:12px;display:flex;align-items:center;gap:8px;overflow:hidden;border-top:1px solid rgba(255,255,255,.08);color:#8fa3bd;font-size:7px;white-space:nowrap}.policy-bar span{padding-right:8px;border-right:1px solid rgba(255,255,255,.1)}.policy-bar span:last-child{overflow:hidden;border:0;text-overflow:ellipsis}.policy-bar i{display:inline-block;width:5px;height:5px;margin-right:4px;border-radius:50%;background:#5de0bb}.pipeline-strip{margin-top:11px;padding:13px 10px;display:flex;align-items:center;justify-content:space-between;border:1px solid #e2e7ee;border-radius:19px;background:rgba(255,255,255,.86);box-shadow:0 9px 25px rgba(31,45,67,.05)}.pipeline-strip>view{min-width:0;display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:5px}.pipeline-strip>view i{width:7px;height:7px;border-radius:50%}.pipeline-strip>view text{color:#7b8798;font-size:8px}.pipeline-strip>view strong{grid-column:2;font-size:15px}.pipeline-strip>span{color:#c4cbd5;font-size:10px}.blue{background:#3478f6}.violet{background:#7566ef}.orange{background:#f59b45}.green{background:#17b78c}.panel{margin-top:11px;border:1px solid #e1e6ed;border-radius:23px;background:rgba(255,255,255,.92);box-shadow:0 12px 32px rgba(25,39,60,.055)}.section-head{padding:18px 17px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head.compact{padding-bottom:15px}.section-head>view:first-child>text,.section-head>view:first-child>strong{display:block}.section-head>view:first-child>text{color:#3478f6;font-size:7px;font-weight:900;letter-spacing:.15em}.section-head>view:first-child>strong{margin-top:4px;font-size:17px;font-weight:900}.section-head>span{padding:6px 8px;border-radius:999px;color:#718096;font-size:8px;background:#f0f3f7}.search-box{height:42px;margin:0 13px;display:flex;align-items:center;padding:0 11px;border:1px solid #e3e8ee;border-radius:13px;background:#f7f9fb}.search-box>text{margin-right:7px;color:#7a8798;font-size:18px}.search-box input{min-width:0;flex:1;font-size:10px}.search-box button{width:25px;height:25px;border-radius:50%;color:#8390a2;background:#e7ebf0}.filter-scroll,.lead-scroll,.package-scroll{width:100%;white-space:nowrap}.filter-row{padding:10px 13px 6px;display:inline-flex;gap:7px}.filter-row button{padding:8px 11px;border:1px solid #e3e7ed;border-radius:999px;color:#718096;font-size:9px;background:white}.filter-row button.active{border-color:#3478f6;color:white;background:#3478f6;box-shadow:0 6px 16px rgba(52,120,246,.22)}.lead-row{padding:7px 13px 14px;display:inline-flex;gap:9px}.lead-card{width:218px;padding:14px;display:inline-flex;vertical-align:top;flex-direction:column;text-align:left;border:1px solid #e3e7ed;border-radius:18px;background:#fbfcfd}.lead-card.active{border-color:#7ca8f8;background:linear-gradient(145deg,#f1f6ff,#f8fffd);box-shadow:0 10px 25px rgba(52,120,246,.12)}.lead-card-top,.lead-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.lead-card-top>span{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:11px;color:white;font-size:12px;font-weight:900;background:linear-gradient(135deg,#3478f6,#19b494)}.lead-card-top>text{padding:5px 7px;border-radius:999px;font-size:7px}.urgency-overdue{color:#c73349;background:#ffe7eb}.urgency-today{color:#ad6a00;background:#fff0d0}.urgency-upcoming{color:#3478f6;background:#eaf2ff}.urgency-closed{color:#68768a;background:#edf0f3}.lead-card>strong{margin-top:11px;overflow:hidden;font-size:13px;font-weight:900;text-overflow:ellipsis}.lead-card>small{margin-top:5px;overflow:hidden;color:#7d899a;font-size:8px;text-overflow:ellipsis}.lead-card-foot{margin-top:12px;padding-top:10px;border-top:1px solid #e8ecf1}.lead-card-foot text{color:#3478f6;font-size:8px;font-weight:800}.lead-card-foot span{color:#7f8b9b;font-size:8px}.empty-leads{width:260px;padding:24px;text-align:center}.empty-leads strong,.empty-leads text{display:block}.empty-leads strong{font-size:12px}.empty-leads text{margin-top:5px;color:#8995a5;font-size:9px}.merchant-card{position:relative;overflow:hidden;margin-top:11px;padding:20px;border-radius:24px;color:white;background:linear-gradient(140deg,#0a162d 0%,#152947 58%,#194a5b 120%);box-shadow:0 18px 38px rgba(7,24,47,.2)}.merchant-glow{position:absolute;right:-70px;top:-80px;width:230px;height:230px;border-radius:50%;background:radial-gradient(circle,rgba(69,205,171,.3),transparent 68%)}.merchant-top{position:relative;display:flex;justify-content:space-between;gap:15px}.merchant-chips{display:flex;gap:5px;flex-wrap:wrap}.merchant-chips span{padding:5px 7px;border:1px solid rgba(255,255,255,.1);border-radius:999px;color:#b6c3d7;font-size:7px;background:rgba(255,255,255,.06)}.merchant-chips .alert{color:#ffadb7;border-color:rgba(255,137,153,.2)}.merchant-top>view:first-child>strong,.merchant-top>view:first-child>text{display:block}.merchant-top>view:first-child>strong{margin-top:12px;font-size:23px;font-weight:950;letter-spacing:-.03em}.merchant-top>view:first-child>text{max-width:540px;margin-top:6px;color:#9fb0c7;font-size:9px;line-height:1.5}.health-score{position:relative;flex:0 0 64px;width:64px;height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:5px solid rgba(63,224,179,.25);border-top-color:#51dcb6;border-radius:50%;background:rgba(255,255,255,.06)}.health-score.empty{border-color:rgba(255,255,255,.14)}.health-score strong{font-size:19px}.health-score small{margin-top:2px;color:#92a6be;font-size:7px}.merchant-facts{position:relative;margin-top:19px;padding-top:15px;display:grid;grid-template-columns:1fr 1.2fr 1.7fr;gap:10px;border-top:1px solid rgba(255,255,255,.09)}.merchant-facts text,.merchant-facts strong,.merchant-facts small{display:block}.merchant-facts text{color:#7f94ad;font-size:7px}.merchant-facts strong{margin-top:5px;overflow:hidden;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.merchant-facts small{margin-top:3px;overflow:hidden;color:#9daec2;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.merchant-actions{position:relative;margin-top:15px;display:flex;gap:7px}.merchant-actions button{padding:8px 10px;border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#c4cfdf;font-size:8px;background:rgba(255,255,255,.06)}.merchant-actions span{margin-right:4px;color:#61e0bd}.journey-track{padding:2px 20px 18px;display:flex;align-items:flex-start}.journey-track>view{flex:0 0 38px;text-align:center}.journey-track>view i{width:26px;height:26px;margin:0 auto;display:flex;align-items:center;justify-content:center;border:2px solid #e0e5eb;border-radius:50%;color:#9aa5b3;font-size:8px;font-style:normal;background:white}.journey-track>view.done i{border-color:#3478f6;color:white;background:#3478f6;box-shadow:0 0 0 5px #eaf2ff}.journey-track>view text{display:block;margin-top:7px;color:#8490a0;font-size:7px}.journey-track>view.done text{color:#334155;font-weight:800}.journey-track>span{flex:1;height:2px;margin-top:12px;background:#e3e8ee}.primary-action{width:calc(100% - 28px);min-height:64px;margin:0 14px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;text-align:left;border-radius:17px;color:white;background:linear-gradient(115deg,#3478f6,#286dd7 54%,#19a98b);box-shadow:0 13px 28px rgba(52,120,246,.23)}.primary-action.disabled{opacity:.48}.primary-action text,.primary-action strong{display:block}.primary-action text{color:#b9d2ff;font-size:7px;font-weight:900;letter-spacing:.12em}.primary-action strong{margin-top:5px;font-size:13px}.primary-action>span{font-size:23px}.assurance{padding:12px 14px 15px;display:flex;justify-content:center;gap:14px;color:#7b8797;font-size:7px}.grade{padding:7px 10px!important;display:flex;align-items:baseline;gap:4px;border-radius:12px!important;color:#3478f6!important;background:#edf4ff!important}.grade strong{font-size:16px}.grade small{font-size:7px}.finding-list{padding:0 14px;display:grid;gap:7px}.finding-list>view{padding:11px;display:flex;align-items:flex-start;gap:9px;border:1px solid #e9edf1;border-radius:13px;background:#fafbfc}.finding-list>view>span{flex:0 0 auto;padding:4px 6px;border-radius:999px;font-size:7px}.finding-list .high{color:#c83549;background:#ffe6e9}.finding-list .medium{color:#ad6d04;background:#fff1d4}.finding-list .low{color:#148363;background:#e2f7f0}.finding-list strong,.finding-list text{display:block}.finding-list strong{font-size:10px}.finding-list text{margin-top:4px;color:#7f8a99;font-size:8px;line-height:1.5}.proposal-card{margin:9px 14px 14px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:15px;color:white;background:linear-gradient(125deg,#0c1c36,#193858)}.proposal-card text,.proposal-card strong{display:block}.proposal-card text{color:#88a0bb;font-size:7px}.proposal-card strong{margin-top:4px;font-size:10px}.proposal-card>span{font-size:22px;font-weight:900}.proposal-card>span small{font-size:8px}.package-row{padding:0 14px 13px;display:inline-flex;gap:9px}.package-card{position:relative;width:222px;padding:14px;display:inline-block;vertical-align:top;border:1px solid #e3e8ee;border-radius:18px;background:#fbfcfd}.package-card.recommended{border-color:#80acf8;background:linear-gradient(150deg,#f0f6ff,#f7fffc)}.package-card.active::after{position:absolute;right:12px;bottom:12px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:white;font-size:9px;background:#19ae8d;content:"✓"}.package-head{display:flex;align-items:center;justify-content:space-between}.package-head span{color:#3478f6;font-size:8px;font-weight:900;letter-spacing:.1em}.package-head text{padding:4px 6px;border-radius:999px;color:#136f58;font-size:7px;background:#def6ee}.package-card>strong,.package-card>small{display:block}.package-card>strong{margin-top:12px;font-size:14px;font-weight:900}.package-card>small{height:33px;margin-top:5px;color:#788596;font-size:8px;line-height:1.5;white-space:normal}.package-price{margin-top:10px;display:flex;align-items:baseline;gap:3px}.package-price strong{font-size:19px}.package-price text{color:#8995a4;font-size:7px}.capability-list{margin-top:10px;padding-top:9px;border-top:1px solid #e7ebf0}.capability-list text{display:block;margin-top:4px;color:#657386;font-size:7px}.contract-summary{margin:0 14px 11px;padding:13px;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px;border-radius:15px;background:#f2f5f8}.contract-summary text,.contract-summary strong,.contract-summary small{display:block}.contract-summary text{color:#8592a2;font-size:7px}.contract-summary strong{margin-top:5px;font-size:10px}.contract-summary small{margin-top:3px;color:#778496;font-size:7px}.authorization-box{margin:0 14px 14px;padding:13px;border:1px solid #cdeee4;border-radius:15px;background:#f0fbf7}.authorization-title{display:flex;align-items:center;justify-content:space-between}.authorization-title strong{font-size:10px}.authorization-title span{color:#168568;font-size:8px}.authorization-box>view:last-child{margin-top:10px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.authorization-box>view:last-child text{color:#397667;font-size:7px}.sales-list{padding:0 14px 14px;display:grid;gap:8px}.sales-list>view{padding:11px;display:flex;align-items:center;gap:10px;border:1px solid #e7ebf0;border-radius:15px;background:#fbfcfd}.sales-list>view>span{flex:0 0 36px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:white;font-size:10px;font-weight:900;background:linear-gradient(135deg,#3478f6,#20b393)}.person-main{min-width:0;flex:1}.person-main>view:first-child{display:flex;align-items:center;gap:6px}.person-main>view:first-child strong{font-size:10px}.person-main>view:first-child text{padding:3px 5px;border-radius:999px;color:#138465;font-size:6px;background:#e2f7f0}.person-main small{display:block;margin-top:4px;color:#7f8c9c;font-size:7px}.load-track{height:4px;margin-top:7px;overflow:hidden;border-radius:99px;background:#e8edf2}.load-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#3478f6,#1ab393)}.sales-list>view>strong{color:#3478f6;font-size:11px}.history-list{padding:0 16px 14px}.history-list>view{min-height:65px;display:flex;gap:11px}.history-list>view>i{position:relative;flex:0 0 9px;width:9px;height:9px;margin-top:3px;border-radius:50%;background:#3478f6;box-shadow:0 0 0 5px #e9f2ff}.history-list>view>i::after{position:absolute;top:15px;bottom:-49px;left:4px;width:1px;background:#dfe5ec;content:""}.history-list>view:last-child>i::after{display:none}.history-list strong,.history-list text,.history-list small{display:block}.history-list strong{font-size:10px}.history-list text{margin-top:4px;color:#657386;font-size:8px}.history-list small{margin-top:4px;color:#9aa5b2;font-size:7px}.safe-space{height:calc(24px + env(safe-area-inset-bottom))}.sheet-overlay{position:fixed;z-index:40;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(4,14,29,.58);backdrop-filter:blur(8px)}.action-sheet{width:min(100%,720px);max-height:92vh;overflow-y:auto;padding:8px 17px calc(18px + env(safe-area-inset-bottom));border-radius:27px 27px 0 0;background:#fff;box-shadow:0 -20px 70px rgba(5,18,36,.3)}.sheet-handle{width:42px;height:4px;margin:0 auto 14px;border-radius:99px;background:#dce2e8}.sheet-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.sheet-header>view>text,.sheet-header>view>strong{display:block}.sheet-header>view>text{color:#3478f6;font-size:7px;font-weight:900;letter-spacing:.15em}.sheet-header>view>strong{margin-top:4px;font-size:19px;font-weight:900}.sheet-header>button{width:34px;height:34px;border-radius:11px;color:#728095;font-size:22px;background:#f0f3f6}.sheet-context{padding:12px;display:flex;align-items:center;gap:10px;border-radius:15px;background:#f2f6fb}.sheet-context>span{width:39px;height:39px;display:flex;align-items:center;justify-content:center;border-radius:13px;color:white;font-size:13px;font-weight:900;background:linear-gradient(135deg,#3478f6,#18b08a)}.sheet-context text,.sheet-context strong,.sheet-context small{display:block}.sheet-context text{color:#8793a3;font-size:7px}.sheet-context strong{margin-top:3px;font-size:11px}.sheet-context small{margin-top:2px;color:#788596;font-size:7px}.field-label{display:block;margin:15px 0 7px;color:#5f6d7e;font-size:8px;font-weight:800}.sales-choice{display:grid;gap:7px}.sales-choice button{padding:11px;display:flex;align-items:center;justify-content:space-between;text-align:left;border:1px solid #e2e7ed;border-radius:13px;background:#fafbfd}.sales-choice button.active{border-color:#6a9cf5;background:#f0f6ff}.sales-choice button:disabled{opacity:.5}.sales-choice strong,.sales-choice text{display:block}.sales-choice strong{font-size:10px}.sales-choice text{margin-top:3px;color:#7f8b9b;font-size:7px}.sales-choice>button>span{color:#3478f6;font-size:9px;font-weight:900}.action-sheet textarea{width:100%;height:78px;padding:11px;border:1px solid #e1e6ec;border-radius:13px;font-size:10px;line-height:1.5;background:#fafbfd}.impact-note{margin-top:10px;padding:10px 11px;border-radius:12px;color:#735e2d;font-size:8px;line-height:1.5;background:#fff6df}.package-choice{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.package-choice button{padding:11px;text-align:left;border:1px solid #e2e7ed;border-radius:13px;background:#fafbfd}.package-choice button.active{border-color:#6195f1;background:linear-gradient(140deg,#eef5ff,#f3fcf9)}.package-choice span,.package-choice strong,.package-choice text{display:block}.package-choice span{color:#3478f6;font-size:7px;font-weight:900}.package-choice strong{margin-top:6px;font-size:10px}.package-choice text{margin-top:4px;color:#778596;font-size:8px}.discount-field{margin-top:14px;display:flex;align-items:flex-end;justify-content:space-between;gap:15px}.discount-field .field-label{margin:0}.discount-field>view:first-child small{display:block;margin-top:4px;color:#8d98a7;font-size:7px}.discount-field>view:last-child{width:105px;display:flex;align-items:center;border:1px solid #dde3e9;border-radius:12px;background:#fafbfd}.discount-field input{width:76px;height:40px;padding-left:12px;font-size:12px;font-weight:800}.discount-field>view:last-child span{color:#3478f6;font-size:10px;font-weight:900}.price-preview{margin-top:10px;padding:13px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;border-radius:14px;color:white;background:linear-gradient(130deg,#0b1a32,#17425c)}.price-preview view:last-child{text-align:right}.price-preview text,.price-preview strong{display:block}.price-preview text{color:#93a9bf;font-size:7px}.price-preview strong{margin-top:4px;font-size:15px}.price-preview>span{color:#68e0c0;font-size:9px}.l2-card{padding:14px;display:flex;align-items:center;gap:11px;border:1px solid #ffddb0;border-radius:15px;background:#fff8e9}.l2-card>span{flex:0 0 38px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:#9b6300;font-size:12px;font-weight:900;background:#ffe8ba}.l2-card strong,.l2-card text{display:block}.l2-card strong{font-size:10px}.l2-card text{margin-top:4px;color:#806b45;font-size:8px;line-height:1.5}.confirm-contract{margin-top:10px;padding:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:9px;border-radius:14px;background:#f4f6f8}.confirm-contract text,.confirm-contract strong{display:block}.confirm-contract text{color:#8591a1;font-size:7px}.confirm-contract strong{margin-top:3px;font-size:10px}.authorization-preview{margin-top:9px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.authorization-preview text{padding:8px;border-radius:10px;color:#28745f;font-size:7px;background:#ecfaf5}.confirmation-check{width:100%;margin-top:14px;padding:12px;display:flex;align-items:flex-start;gap:10px;text-align:left;border:1px solid #dfe5ec;border-radius:15px;background:#fafbfd}.confirmation-check.checked{border-color:#51be9f;background:#effbf7}.confirmation-check>i{flex:0 0 21px;width:21px;height:21px;display:flex;align-items:center;justify-content:center;border:1px solid #cbd3dd;border-radius:7px;color:white;font-size:10px;font-style:normal}.confirmation-check.checked>i{border-color:#18aa82;background:#18aa82}.confirmation-check strong,.confirmation-check text{display:block}.confirmation-check strong{font-size:9px}.confirmation-check text{margin-top:4px;color:#7c8999;font-size:7px;line-height:1.5}.sheet-footer{margin-top:12px;display:grid;grid-template-columns:.45fr 1fr;gap:8px}.sheet-footer button{height:44px;border-radius:13px;color:#647286;font-size:10px;font-weight:800;background:#eef1f4}.sheet-footer .submit{color:white;background:linear-gradient(115deg,#3478f6,#1aa886);box-shadow:0 10px 24px rgba(52,120,246,.2)}.sheet-footer .submit:disabled{opacity:.45}
@media(min-width:700px){.hero{padding:30px}.content{padding-top:24px}.merchant-facts{grid-template-columns:1fr 1fr 2fr}.journey-track{max-width:620px;margin:0 auto}.lead-card{width:245px}.action-sheet{padding-left:28px;padding-right:28px}}
</style>
