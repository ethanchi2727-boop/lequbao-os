<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  LeadStage,
  OnboardingAssetSummary,
  OnboardingLeadSummary,
  OnboardingOverview,
} from '@lequ/contracts'
import {
  addFollowUp,
  captureAssets,
  confirmAsset,
  createContract,
  createLead,
  fetchOnboarding,
  markLost,
  runDiagnosis,
  signContract,
  submitAppeal,
  uploadAsset as uploadAssetRequest,
} from '../../services/onboarding'

const overview = ref<OnboardingOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const sheetMode = ref<'create' | 'followup' | 'contract' | 'appeal' | 'lost' | null>(null)
const createForm = ref({
  name: '', category: '特色餐饮', source: '销售外拓', contactName: '',
  contactPhoneMasked: '', address: '', cityId: 'city-shanghai',
})
const followUpForm = ref({
  channel: 'VISIT' as 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO',
  summary: '', nextAction: '',
})
const appealReason = ref('')
const lostForm = ref({
  reason: 'TIMING' as 'NO_BUDGET' | 'NO_DECISION' | 'COMPETITOR' | 'TIMING' | 'INVALID' | 'OTHER',
  note: '',
})
const contractForm = ref({
  packageCode: 'PRO' as 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN',
  discountPercent: '3',
})
const packageOptions = [
  { key: 'BASIC', name: '基础版', description: '数字建档与基础展示' },
  { key: 'PRO', name: '专业版', description: 'MiniApp、GEO 与经营工具' },
  { key: 'AGENT', name: 'Agent 版', description: '完整 Skill 与 AI Agent 能力' },
  { key: 'CHAIN', name: '连锁版', description: '多品牌、多门店统一治理' },
] as const

const stages: Array<{ key: LeadStage; label: string; short: string }> = [
  { key: 'NEW', label: '线索建档', short: '线索' },
  { key: 'DIAGNOSED', label: 'AI 体检', short: '体检' },
  { key: 'CONTRACT_DRAFT', label: '方案合同', short: '合同' },
  { key: 'SIGNED', label: '六重授权', short: '授权' },
  { key: 'ASSET_REVIEW', label: '资料识别', short: '识别' },
  { key: 'READY_FOR_DELIVERY', label: '交付就绪', short: '就绪' },
]

const stageLabels: Record<LeadStage, string> = {
  NEW: '新线索',
  DIAGNOSED: '已体检',
  CONTRACT_DRAFT: '待签约',
  SIGNED: '已签约',
  ASSET_REVIEW: '资料确认',
  READY_FOR_DELIVERY: '交付就绪',
  LOST: '已关闭',
}

const assetLabels: Record<string, string> = {
  BUSINESS_LICENSE: '营业执照',
  STOREFRONT: '门头照片',
  MENU: '结构化菜单',
}
const assetTypes = ['BUSINESS_LICENSE', 'STOREFRONT', 'MENU'] as const
const lostReasons = [
  { key: 'TIMING', label: '时机不成熟' },
  { key: 'NO_BUDGET', label: '暂无预算' },
  { key: 'NO_DECISION', label: '决策未达成' },
  { key: 'COMPETITOR', label: '选择竞品' },
  { key: 'INVALID', label: '无效线索' },
  { key: 'OTHER', label: '其他原因' },
] as const

const focusLead = computed(() => overview.value?.focusLead ?? null)
const currentStageIndex = computed(() => {
  const stage = focusLead.value?.stage
  if (!stage) return 0
  if (stage === 'LOST') return 0
  return Math.max(0, stages.findIndex((item) => item.key === stage))
})
const pendingAsset = computed(() => overview.value?.assets.find((asset) => asset.status === 'NEEDS_REVIEW') ?? null)
const missingAssetType = computed(() => assetTypes.find((type) =>
  !overview.value?.assets.some((asset) => asset.assetType === type),
) ?? null)
const assetSlots = computed(() => assetTypes.map((type) => ({
  type,
  asset: overview.value?.assets.find((asset) => asset.assetType === type) ?? null,
})))
const primaryLabel = computed(() => {
  const lead = focusLead.value
  if (!lead) return '请选择商家'
  if (busy.value) return '正在安全处理…'
  switch (lead.stage) {
    case 'NEW': return '运行 AI 商家体检'
    case 'DIAGNOSED': return '配置套餐与电子合同'
    case 'CONTRACT_DRAFT': return overview.value?.contract ? '确认合同与六重授权' : '合同资料待补充'
    case 'SIGNED': return `上传${assetLabels[missingAssetType.value ?? 'BUSINESS_LICENSE']}`
    case 'ASSET_REVIEW': return missingAssetType.value
      ? `上传${assetLabels[missingAssetType.value]}`
      : pendingAsset.value ? `确认${assetLabels[pendingAsset.value.assetType]}` : '资料确认完成'
    case 'READY_FOR_DELIVERY': return '已就绪 · 等待服务商接单'
    default: return '当前线索不可继续'
  }
})
const canAdvance = computed(() => Boolean(
  focusLead.value &&
  !busy.value &&
  !['READY_FOR_DELIVERY', 'LOST'].includes(focusLead.value.stage) &&
  !(focusLead.value.stage === 'CONTRACT_DRAFT' && !overview.value?.contract),
))

function protectionDays(lead: OnboardingLeadSummary): number {
  const remaining = new Date(lead.protectionExpiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(remaining / 86_400_000))
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatMoney(fen: number): string {
  return `¥${(fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
}

function severityLabel(severity: string): string {
  return severity === 'HIGH' ? '优先' : severity === 'MEDIUM' ? '关注' : '优化'
}

function mimeTypeFor(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'pdf') return 'application/pdf'
  return 'image/jpeg'
}

function readFile(path: string): Promise<ArrayBuffer> {
  if (/^(blob:|data:|https?:)/.test(path) && typeof fetch === 'function') {
    return fetch(path).then((response) => response.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    const runtime = uni as unknown as {
      getFileSystemManager: () => {
        readFile: (options: {
          filePath: string
          success: (result: { data: ArrayBuffer | string }) => void
          fail: () => void
        }) => void
      }
    }
    try {
      runtime.getFileSystemManager().readFile({
        filePath: path,
        success: ({ data }) => {
          if (data instanceof ArrayBuffer) resolve(data)
          else reject(new Error('当前文件格式无法读取'))
        },
        fail: () => reject(new Error('未能读取所选资料')),
      })
    } catch {
      reject(new Error('当前环境不支持读取所选资料'))
    }
  })
}

async function chooseAndUpload(assetType: OnboardingAssetSummary['assetType']): Promise<void> {
  const lead = focusLead.value
  if (!lead) return
  const selection = await new Promise<{ path: string; name: string }>((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: (result) => {
        const path = result.tempFilePaths[0]
        if (!path) {
          reject(new Error('未选择资料'))
          return
        }
        const files = result.tempFiles as unknown as Array<{ name?: string }>
        const file = files[0]
        resolve({ path, name: file?.name ?? path.split('/').pop() ?? `${assetType}.jpg` })
      },
      fail: () => reject(new Error('已取消选择资料')),
    })
  })
  const bytes = await readFile(selection.path)
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('单个资料不能超过 8MB')
  overview.value = await uploadAssetRequest(lead, assetType, {
    name: selection.name,
    mimeType: mimeTypeFor(selection.name),
    bytes,
  })
}

async function load(focusId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchOnboarding(focusId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function selectLead(leadId: string): Promise<void> {
  if (focusLead.value?.id === leadId || busy.value) return
  await load(leadId)
}

async function advance(): Promise<void> {
  const lead = focusLead.value
  if (!lead || !canAdvance.value) return
  if (lead.stage === 'DIAGNOSED') {
    openSheet('contract')
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    let next: OnboardingOverview
    switch (lead.stage) {
      case 'NEW':
        next = await runDiagnosis(lead)
        break
      case 'CONTRACT_DRAFT':
        if (!overview.value?.contract) throw new Error('合同资料尚未生成')
        next = await signContract(lead.id, overview.value.contract)
        break
      case 'SIGNED':
        await chooseAndUpload(missingAssetType.value ?? 'BUSINESS_LICENSE')
        next = overview.value as OnboardingOverview
        break
      case 'ASSET_REVIEW':
        if (missingAssetType.value) {
          await chooseAndUpload(missingAssetType.value)
          next = overview.value as OnboardingOverview
        } else {
          if (!pendingAsset.value) throw new Error('所有资料均已确认')
          next = await confirmAsset(lead.id, pendingAsset.value)
        }
        break
      default:
        return
    }
    overview.value = next
    uni.showToast({ title: '已完成并留痕', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
    uni.showToast({ title: errorMessage.value, icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function useDemoCapture(): Promise<void> {
  const lead = focusLead.value
  if (!lead || lead.stage !== 'SIGNED' || busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await captureAssets(lead)
    uni.showToast({ title: '演示资料已载入', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '载入失败'
  } finally {
    busy.value = false
  }
}

function openSheet(mode: NonNullable<typeof sheetMode.value>): void {
  if (busy.value) return
  if (mode === 'followup' && focusLead.value) {
    followUpForm.value = {
      channel: 'VISIT', summary: '', nextAction: focusLead.value.nextAction,
    }
  }
  if (mode === 'contract' && focusLead.value) {
    const key = `sales-contract-draft:${focusLead.value.id}`
    const stored = uni.getStorageSync(key) as string | undefined
    if (stored) {
      try {
        contractForm.value = JSON.parse(stored) as typeof contractForm.value
      } catch {
        uni.removeStorageSync(key)
      }
    }
  }
  sheetMode.value = mode
}

function openOwnership(leadId: string): void {
  uni.navigateTo({ url: `/pages/ownership/index?leadId=${encodeURIComponent(leadId)}` })
}

function saveContractDraft(): void {
  if (!focusLead.value) return
  uni.setStorageSync(
    `sales-contract-draft:${focusLead.value.id}`,
    JSON.stringify(contractForm.value),
  )
}

function closeSheet(): void {
  if (!busy.value) sheetMode.value = null
}

async function submitSheet(): Promise<void> {
  const lead = focusLead.value
  busy.value = true
  errorMessage.value = ''
  try {
    if (sheetMode.value === 'create') {
      const form = createForm.value
      if ([form.name, form.contactName, form.contactPhoneMasked, form.address].some((item) => !item.trim())) {
        throw new Error('请完整填写商家与联系人资料')
      }
      overview.value = await createLead(form)
      createForm.value = {
        name: '', category: '特色餐饮', source: '销售外拓', contactName: '',
        contactPhoneMasked: '', address: '', cityId: 'city-shanghai',
      }
    } else if (sheetMode.value === 'followup' && lead) {
      if (followUpForm.value.summary.trim().length < 3 || followUpForm.value.nextAction.trim().length < 2) {
        throw new Error('请填写本次结果和下一步动作')
      }
      overview.value = await addFollowUp(lead, {
        ...followUpForm.value,
        nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
    } else if (sheetMode.value === 'contract' && lead) {
      const discountPercent = Number(contractForm.value.discountPercent)
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 30) {
        throw new Error('折扣比例必须在 0% 至 30% 之间')
      }
      overview.value = await createContract(lead, {
        packageCode: contractForm.value.packageCode,
        discountBps: Math.round(discountPercent * 100),
      })
      uni.removeStorageSync(`sales-contract-draft:${lead.id}`)
    } else if (sheetMode.value === 'appeal' && lead) {
      if (appealReason.value.trim().length < 5) throw new Error('请写明申诉原因与关键证据')
      overview.value = await submitAppeal(lead, appealReason.value.trim())
      appealReason.value = ''
    } else if (sheetMode.value === 'lost' && lead) {
      if (lostForm.value.note.trim().length < 3) throw new Error('请补充失单说明')
      overview.value = await markLost(lead, lostForm.value)
      lostForm.value = { reason: 'TIMING', note: '' }
    }
    sheetMode.value = null
    uni.showToast({ title: '已保存并留痕', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败'
    uni.showToast({ title: errorMessage.value, icon: 'none' })
  } finally {
    busy.value = false
  }
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

onLoad((options) => {
  const focusLeadId = typeof options?.focusLeadId === 'string' ? options.focusLeadId : undefined
  void load(focusLeadId)
})
</script>

<template>
  <view class="page-shell">
    <view class="ambient ambient-one" />
    <view class="ambient ambient-two" />

    <view class="topbar">
      <button class="icon-button" aria-label="返回" @click="goBack">‹</button>
      <view class="brand">
        <view class="brand-mark">LQ</view>
        <view>
          <text class="brand-name">销售宝</text>
          <text class="brand-subtitle">MERCHANT ONBOARDING</text>
        </view>
      </view>
      <view class="secure-badge"><view class="pulse" /> 全程留痕</view>
    </view>

    <scroll-view scroll-y class="viewport">
      <view class="content">
        <view class="heading-row">
          <view>
            <text class="eyebrow">E1 · 商家入网</text>
            <text class="page-title">把一条线索，变成可交付的生意</text>
            <text class="page-description">归属保护、AI 体检、合同授权与资料识别，在一个工作台里连续完成。</text>
          </view>
          <view class="heading-actions">
            <view class="date-pill">上海 · 今日作战台</view>
            <button class="create-lead-button" @click="openSheet('create')">＋ 新建线索</button>
          </view>
        </view>

        <view v-if="errorMessage" class="error-banner">
          <view>
            <text class="error-title">暂时没能完成</text>
            <text class="error-copy">{{ errorMessage }}</text>
          </view>
          <button class="retry-button" @click="load(focusLead?.id)">重试</button>
        </view>

        <view v-if="loading && !overview" class="skeleton-grid">
          <view v-for="index in 4" :key="index" class="skeleton-card" />
        </view>

        <template v-else-if="overview">
          <view class="metric-grid">
            <view class="metric-card metric-total">
              <view class="metric-icon">⌁</view>
              <text class="metric-value">{{ overview.counts.total }}</text>
              <text class="metric-label">我的入网商家</text>
              <text class="metric-trend">本月持续增长</text>
            </view>
            <view class="metric-card">
              <view class="metric-icon coral">◈</view>
              <text class="metric-value">{{ overview.counts.protected }}</text>
              <text class="metric-label">保护期内</text>
              <text class="metric-trend">30 天归属保护</text>
            </view>
            <view class="metric-card">
              <view class="metric-icon amber">↗</view>
              <text class="metric-value">{{ overview.counts.pendingAction }}</text>
              <text class="metric-label">今天需推进</text>
              <text class="metric-trend">按下一动作排序</text>
            </view>
            <view class="metric-card">
              <view class="metric-icon mint">✓</view>
              <text class="metric-value">{{ overview.counts.readyForDelivery }}</text>
              <text class="metric-label">交付就绪</text>
              <text class="metric-trend">可移交服务商</text>
            </view>
          </view>

          <view class="workspace-grid">
            <view class="lead-panel panel">
              <view class="panel-header">
                <view>
                  <text class="panel-kicker">PIPELINE</text>
                  <text class="panel-title">我的商家</text>
                </view>
                <text class="lead-count">{{ overview.leads.length }} 条</text>
              </view>
              <view class="lead-list">
                <button
                  v-for="lead in overview.leads"
                  :key="lead.id"
                  class="lead-card"
                  :class="{ active: focusLead?.id === lead.id }"
                  @click="selectLead(lead.id)"
                >
                  <view class="lead-avatar">{{ lead.name.slice(0, 1) }}</view>
                  <view class="lead-main">
                    <view class="lead-name-row">
                      <text class="lead-name">{{ lead.name }}</text>
                      <text class="stage-chip" :class="`stage-${lead.stage.toLowerCase()}`">{{ stageLabels[lead.stage] }}</text>
                    </view>
                    <text class="lead-meta">{{ lead.category }} · {{ lead.source }}</text>
                    <view class="lead-bottom">
                      <text class="lead-action">{{ lead.nextAction }}</text>
                      <text class="protection">{{ protectionDays(lead) }} 天</text>
                    </view>
                  </view>
                </button>
              </view>
            </view>

            <view v-if="focusLead" class="detail-column">
              <view class="merchant-hero">
                <view class="hero-mesh" />
                <view class="merchant-top">
                  <view>
                    <view class="merchant-tags">
                      <text class="light-chip">{{ stageLabels[focusLead.stage] }}</text>
                      <text class="light-chip">保护期 {{ protectionDays(focusLead) }} 天</text>
                    </view>
                    <text class="merchant-name">{{ focusLead.name }}</text>
                    <text class="merchant-address">{{ focusLead.category }} · {{ focusLead.address }}</text>
                  </view>
                  <view class="score-ring">
                    <text class="score-value">{{ focusLead.healthScore ?? '—' }}</text>
                    <text class="score-label">健康分</text>
                  </view>
                </view>
                <view class="merchant-facts">
                  <view class="fact"><text class="fact-label">联系人</text><text class="fact-value">{{ focusLead.contactName }} · {{ focusLead.contactPhoneMasked }}</text></view>
                  <view class="fact"><text class="fact-label">来源</text><text class="fact-value">{{ focusLead.source }}</text></view>
                  <view class="fact"><text class="fact-label">下一动作</text><text class="fact-value">{{ focusLead.nextAction }}</text></view>
                </view>
                <view class="merchant-actions">
                  <button @click="openSheet('followup')">＋ 记录跟进</button>
                  <button @click="openOwnership(focusLead.id)">归属中心</button>
                  <button @click="openSheet('appeal')">归属申诉</button>
                  <button v-if="!['READY_FOR_DELIVERY', 'LOST'].includes(focusLead.stage)" class="danger" @click="openSheet('lost')">标记失单</button>
                </view>
              </view>

              <view class="journey-panel panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-kicker">ONBOARDING JOURNEY</text>
                    <text class="panel-title">入网进度</text>
                  </view>
                  <text class="version-tag">数据版本 v{{ focusLead.version }}</text>
                </view>
                <view class="step-track">
                  <view
                    v-for="(stage, index) in stages"
                    :key="stage.key"
                    class="step-item"
                    :class="{ done: index < currentStageIndex, current: index === currentStageIndex }"
                  >
                    <view class="step-dot">{{ index < currentStageIndex ? '✓' : index + 1 }}</view>
                    <text class="step-label">{{ stage.short }}</text>
                  </view>
                </view>
                <button class="primary-action" :class="{ disabled: !canAdvance }" :disabled="!canAdvance" @click="advance">
                  <view class="action-copy">
                    <text class="action-overline">NEXT BEST ACTION</text>
                    <text class="action-title">{{ primaryLabel }}</text>
                  </view>
                  <text class="action-arrow">→</text>
                </button>
                <view class="assurance-row">
                  <text>✓ 幂等防重</text><text>✓ 版本冲突保护</text><text>✓ 审计与 Outbox 同事务</text>
                </view>
                <button v-if="focusLead.stage === 'SIGNED'" class="demo-capture" @click="useDemoCapture">无相机环境？载入一组演示识别资料</button>
              </view>

              <view v-if="overview.diagnosis" class="insight-panel panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-kicker">AI DIAGNOSIS · {{ overview.diagnosis.modelVersion }}</text>
                    <text class="panel-title">经营数字体检</text>
                  </view>
                  <view class="grade-badge"><text>{{ overview.diagnosis.grade }}</text><small>{{ overview.diagnosis.score }} 分</small></view>
                </view>
                <view class="finding-grid">
                  <view v-for="finding in overview.diagnosis.findings" :key="finding.code" class="finding-card">
                    <text class="severity" :class="finding.severity.toLowerCase()">{{ severityLabel(finding.severity) }}</text>
                    <text class="finding-title">{{ finding.title }}</text>
                    <text class="finding-evidence">{{ finding.evidence }}</text>
                  </view>
                </view>
                <view class="proposal-strip">
                  <view><text class="proposal-label">推荐方案</text><text class="proposal-title">{{ overview.diagnosis.proposal.title }}</text></view>
                  <view class="priority-list"><text v-for="item in overview.diagnosis.proposal.priorities" :key="item">{{ item }}</text></view>
                  <view class="days-badge">{{ overview.diagnosis.proposal.expectedDays }}<small>天</small></view>
                </view>
              </view>

              <view v-if="overview.contract" class="contract-panel panel">
                <view class="contract-glow" />
                <view class="panel-header compact">
                  <view>
                    <text class="panel-kicker">DIGITAL CONTRACT</text>
                    <text class="panel-title">专业版年度合同</text>
                  </view>
                  <text class="contract-status" :class="overview.contract.status.toLowerCase()">{{ overview.contract.status === 'SIGNED' ? '已签署' : '待签署' }}</text>
                </view>
                <view class="contract-numbers">
                  <view><text class="number-label">成交金额</text><text class="price">{{ formatMoney(overview.contract.finalPriceFen) }}</text></view>
                  <view><text class="number-label">优惠</text><text class="number-value">{{ overview.contract.discountBps / 100 }}%</text></view>
                  <view><text class="number-label">独立授权</text><text class="number-value">{{ overview.contract.authorizationCount }} / 6</text></view>
                  <view><text class="number-label">合同版本</text><text class="number-value small">{{ overview.contract.contractVersion }}</text></view>
                </view>
                <view class="auth-list">
                  <text v-for="label in ['数字建档与小程序', 'GEO 分发', 'Skill 生成与调用', '乐趣生活展示', '交易、支付与会员', '代金券抽佣联盟']" :key="label" :class="{ granted: overview.contract.authorizationCount === 6 }">{{ overview.contract.authorizationCount === 6 ? '✓' : '○' }} {{ label }}</text>
                </view>
                <view v-if="overview.collaborators.length" class="collaborator-row">
                  <text class="collaborator-label">协作成员</text>
                  <text v-for="collaborator in overview.collaborators" :key="collaborator.id" class="collaborator-chip">{{ collaborator.displayName }} · {{ collaborator.role === 'DELIVERY_PARTNER' ? '交付协作' : collaborator.role }}</text>
                </view>
              </view>

              <view v-if="['SIGNED', 'ASSET_REVIEW', 'READY_FOR_DELIVERY'].includes(focusLead.stage)" class="asset-panel panel">
                <view class="panel-header compact">
                  <view><text class="panel-kicker">HUMAN IN THE LOOP</text><text class="panel-title">资料识别与人工确认</text></view>
                  <text class="confirmed-count">{{ overview.assets.filter((item) => item.status === 'CONFIRMED').length }}/3 已确认</text>
                </view>
                <view class="asset-grid">
                  <view v-for="slot in assetSlots" :key="slot.type" class="asset-card" :class="{ confirmed: slot.asset?.status === 'CONFIRMED', missing: !slot.asset }">
                    <view class="asset-preview"><text>{{ slot.type === 'MENU' ? '☷' : slot.type === 'STOREFRONT' ? '▣' : '▤' }}</text></view>
                    <view v-if="slot.asset" class="asset-copy">
                      <view class="asset-title-row"><text class="asset-title">{{ assetLabels[slot.type] }}</text><text class="confidence">{{ Math.round(slot.asset.confidence * 100) }}%</text></view>
                      <text class="asset-file">{{ slot.asset.fileName }}</text>
                      <text class="asset-status">{{ slot.asset.status === 'CONFIRMED' ? '已由销售人工确认' : slot.asset.source === 'USER_UPLOAD' ? '原件已加密留存 · 等待核对' : '演示适配器 · 等待核对' }}</text>
                    </view>
                    <button v-else class="asset-upload" @click="chooseAndUpload(slot.type)">
                      <text>{{ assetLabels[slot.type] }}</text>
                      <small>拍照或从相册选择</small>
                    </button>
                  </view>
                </view>
              </view>

              <view class="timeline-panel panel">
                <view class="panel-header compact"><view><text class="panel-kicker">IMMUTABLE ACTIVITY</text><text class="panel-title">商家入网时间线</text></view><text class="lead-count">{{ overview.activities.length }} 条证据</text></view>
                <view class="timeline">
                  <view v-for="(activity, index) in overview.activities" :key="activity.id" class="timeline-item">
                    <view class="timeline-marker"><view class="timeline-dot" /><view v-if="index < overview.activities.length - 1" class="timeline-line" /></view>
                    <view class="timeline-copy"><text class="timeline-summary">{{ activity.summary }}</text><text class="timeline-meta">#{{ activity.sequence }} · {{ activity.type }} · {{ shortDate(activity.createdAt) }}</text></view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </template>
      </view>
      <view class="safe-bottom" />
    </scroll-view>

    <view v-if="sheetMode" class="sheet-overlay" @click.self="closeSheet">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-header">
          <view>
            <text class="panel-kicker">{{ sheetMode === 'create' ? 'NEW MERCHANT LEAD' : sheetMode === 'followup' ? 'CRM ACTIVITY' : sheetMode === 'contract' ? 'CONTRACT WIZARD' : sheetMode === 'appeal' ? 'OWNERSHIP APPEAL' : 'CLOSE OPPORTUNITY' }}</text>
            <text class="sheet-title">{{ sheetMode === 'create' ? '新建商家线索' : sheetMode === 'followup' ? '记录本次跟进' : sheetMode === 'contract' ? '选择套餐与折扣' : sheetMode === 'appeal' ? '提交归属申诉' : '标记为失单' }}</text>
          </view>
          <button class="sheet-close" @click="closeSheet">×</button>
        </view>

        <view v-if="sheetMode === 'create'" class="form-grid">
          <label class="form-field"><text>商家名称 *</text><input v-model="createForm.name" placeholder="例如：青岚小院" maxlength="120" /></label>
          <label class="form-field"><text>经营品类</text><input v-model="createForm.category" placeholder="特色餐饮" maxlength="80" /></label>
          <label class="form-field"><text>线索来源</text><input v-model="createForm.source" placeholder="销售外拓" maxlength="80" /></label>
          <label class="form-field"><text>联系人 *</text><input v-model="createForm.contactName" placeholder="姓名" maxlength="60" /></label>
          <label class="form-field"><text>联系电话 *</text><input v-model="createForm.contactPhoneMasked" type="text" placeholder="138****0000" maxlength="30" /></label>
          <label class="form-field wide"><text>门店地址 *</text><input v-model="createForm.address" placeholder="城市、区、街道和门牌号" maxlength="240" /></label>
        </view>

        <view v-else-if="sheetMode === 'followup'" class="sheet-body">
          <text class="field-caption">跟进方式</text>
          <view class="choice-row">
            <button v-for="channel in [{key:'VISIT',label:'到店'}, {key:'PHONE',label:'电话'}, {key:'WECHAT',label:'微信'}, {key:'VIDEO',label:'视频'}]" :key="channel.key" :class="{ active: followUpForm.channel === channel.key }" @click="followUpForm.channel = channel.key as typeof followUpForm.channel">{{ channel.label }}</button>
          </view>
          <label class="form-field"><text>本次结果 *</text><textarea v-model="followUpForm.summary" placeholder="记录商家关注点、关键异议和已经确认的事项" maxlength="500" /></label>
          <label class="form-field"><text>下一步动作 *</text><input v-model="followUpForm.nextAction" placeholder="例如：邀请合伙人参加方案会" maxlength="160" /></label>
          <text class="form-help">默认安排在 24 小时后，可在任务中心继续调整时间。</text>
        </view>

        <view v-else-if="sheetMode === 'contract'" class="sheet-body">
          <view class="contract-step"><text>01</text><view><text class="step-copy-title">选择业务套餐</text><text class="step-copy-help">草稿会自动保存在本机，退出后仍可恢复</text></view></view>
          <view class="package-grid">
            <button v-for="item in packageOptions" :key="item.key" :class="{ active: contractForm.packageCode === item.key }" @click="contractForm.packageCode = item.key; saveContractDraft()">
              <view class="package-radio">{{ contractForm.packageCode === item.key ? '✓' : '' }}</view>
              <text>{{ item.name }}</text><small>{{ item.description }}</small>
            </button>
          </view>
          <view class="contract-step"><text>02</text><view><text class="step-copy-title">设置成交折扣</text><text class="step-copy-help">销售自动权限不高于 5%，超出后必须等待审批</text></view></view>
          <label class="form-field discount-field"><text>折扣比例（%）</text><input v-model="contractForm.discountPercent" type="digit" placeholder="0" maxlength="5" @input="saveContractDraft" /><text class="discount-suffix">%</text></label>
          <view class="authorization-preview">
            <text class="field-caption">签约时分别授权</text>
            <view><text v-for="label in ['数字建档与小程序','GEO 分发','Skill 生成与调用','乐趣生活展示','交易、支付与会员','代金券抽佣联盟']" :key="label">○ {{ label }}</text></view>
          </view>
        </view>

        <view v-else-if="sheetMode === 'appeal'" class="sheet-body">
          <view class="sheet-notice">申诉不会直接改变归属，将进入城市经理审批并保留全部证据。</view>
          <label class="form-field"><text>申诉理由与证据 *</text><textarea v-model="appealReason" placeholder="例如：首次有效拜访时间、签到记录、商家确认信息" maxlength="500" /></label>
        </view>

        <view v-else class="sheet-body">
          <text class="field-caption">失单原因</text>
          <view class="reason-grid">
            <button v-for="reason in lostReasons" :key="reason.key" :class="{ active: lostForm.reason === reason.key }" @click="lostForm.reason = reason.key">{{ reason.label }}</button>
          </view>
          <label class="form-field"><text>补充说明 *</text><textarea v-model="lostForm.note" placeholder="说明决策背景和未来重新激活的可能性" maxlength="500" /></label>
        </view>

        <view class="sheet-footer">
          <button class="sheet-cancel" @click="closeSheet">取消</button>
          <button class="sheet-submit" :disabled="busy" @click="submitSheet">{{ busy ? '正在安全保存…' : sheetMode === 'appeal' ? '提交审批' : sheetMode === 'contract' ? '生成合同草稿' : '保存并留痕' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-shell { position: relative; min-height: 100vh; overflow: hidden; background: #f4f6fb; color: #111827; }
.ambient { position: fixed; width: 520px; height: 520px; border-radius: 50%; filter: blur(20px); pointer-events: none; opacity: .32; }
.ambient-one { top: -260px; right: -180px; background: radial-gradient(circle, rgba(111, 83, 255, .45), transparent 68%); }
.ambient-two { bottom: -300px; left: -240px; background: radial-gradient(circle, rgba(255, 107, 122, .25), transparent 68%); }
.topbar { position: relative; z-index: 4; height: 76px; padding: env(safe-area-inset-top) 28px 0; display: flex; align-items: center; gap: 14px; color: white; background: rgba(8, 12, 32, .96); box-shadow: 0 12px 36px rgba(12, 18, 46, .18); }
.icon-button { width: 38px; height: 38px; border-radius: 13px; color: white; font-size: 30px; background: rgba(255,255,255,.08); }
.brand { display: flex; align-items: center; gap: 11px; flex: 1; }
.brand-mark { width: 38px; height: 38px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; letter-spacing: -.5px; background: linear-gradient(135deg,#ff6b7a,#7657ff); box-shadow: 0 8px 24px rgba(255,107,122,.32); }
.brand-name,.brand-subtitle { display: block; }.brand-name { font-size: 17px; font-weight: 760; }.brand-subtitle { margin-top: 2px; color: #9099b8; font-size: 8px; letter-spacing: 1.8px; }
.secure-badge { display: flex; align-items: center; gap: 7px; padding: 8px 12px; border: 1px solid rgba(255,255,255,.11); border-radius: 999px; color: #cbd2e9; font-size: 11px; background: rgba(255,255,255,.05); }
.pulse { width: 7px; height: 7px; border-radius: 50%; background: #35d4a1; box-shadow: 0 0 0 5px rgba(53,212,161,.12); }
.viewport { height: calc(100vh - 76px); }.content { position: relative; z-index: 2; width: min(1440px, calc(100% - 48px)); margin: 0 auto; padding: 34px 0 60px; }
.heading-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }.eyebrow,.page-title,.page-description { display: block; }.eyebrow { color: #6955ef; font-size: 11px; font-weight: 800; letter-spacing: 1.6px; }.page-title { margin-top: 9px; font-size: 30px; line-height: 1.25; font-weight: 780; letter-spacing: -1px; }.page-description { margin-top: 9px; color: #727b91; font-size: 13px; }
.date-pill { padding: 10px 14px; border: 1px solid #e5e7ef; border-radius: 999px; color: #667085; font-size: 11px; background: rgba(255,255,255,.75); }
.heading-actions{display:flex;align-items:center;gap:9px}.create-lead-button{padding:11px 15px;border-radius:13px;color:white;font-size:11px;font-weight:700;background:linear-gradient(135deg,#6755ec,#e76183);box-shadow:0 10px 24px rgba(104,83,235,.2)}
.error-banner { margin-bottom: 18px; padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border: 1px solid #ffd6da; border-radius: 16px; background: #fff2f3; }.error-title,.error-copy { display:block; }.error-title { color:#b42335;font-size:13px;font-weight:700; }.error-copy { margin-top:4px;color:#8f3542;font-size:11px; }.retry-button { padding:9px 14px;border-radius:10px;color:white;font-size:11px;background:#d8465c; }
.skeleton-grid,.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }.skeleton-card { height: 132px; border-radius: 22px; background: linear-gradient(100deg,#eaedf3 20%,#f7f8fa 40%,#eaedf3 60%); background-size: 220% 100%; animation: shimmer 1.5s infinite; } @keyframes shimmer { to { background-position-x: -220%; } }
.metric-grid { margin-bottom: 16px; }.metric-card { min-height: 126px; padding: 18px; position: relative; display:flex; flex-direction:column; border:1px solid rgba(220,224,235,.8); border-radius:22px; background:rgba(255,255,255,.88); box-shadow:0 12px 34px rgba(39,46,73,.055); }.metric-total { color:white; border:0; background:linear-gradient(145deg,#121934,#28204f); box-shadow:0 18px 38px rgba(27,25,64,.18); }.metric-icon { position:absolute; top:17px; right:17px; width:33px;height:33px;display:flex;align-items:center;justify-content:center;border-radius:11px;color:#8b79ff;background:rgba(118,87,255,.1); }.metric-icon.coral{color:#ff6477;background:#fff0f2}.metric-icon.amber{color:#e99a16;background:#fff6df}.metric-icon.mint{color:#11a97c;background:#e5fbf4}.metric-value { font-size:31px;font-weight:800;letter-spacing:-1.2px; }.metric-label { margin-top:3px;font-size:12px;font-weight:700; }.metric-trend { margin-top:auto;color:#8b93a7;font-size:10px; }.metric-total .metric-trend{color:#9da6c6}.metric-total .metric-icon{color:white;background:rgba(255,255,255,.1)}
.workspace-grid { display:grid; grid-template-columns:340px minmax(0,1fr); gap:16px; align-items:start; }.panel { border:1px solid rgba(222,225,235,.9);border-radius:24px;background:rgba(255,255,255,.9);box-shadow:0 14px 44px rgba(30,40,70,.06); }.panel-header { padding:20px 20px 15px;display:flex;align-items:center;justify-content:space-between;gap:14px; }.panel-header.compact{padding-bottom:17px}.panel-kicker,.panel-title { display:block; }.panel-kicker{color:#8a91a6;font-size:8px;font-weight:800;letter-spacing:1.5px}.panel-title{margin-top:4px;font-size:17px;font-weight:760}.lead-count,.version-tag,.confirmed-count{padding:6px 9px;border-radius:999px;color:#6a7186;font-size:9px;background:#f0f2f7}.lead-panel{position:sticky;top:16px;overflow:hidden}.lead-list{padding:0 10px 12px}.lead-card{width:100%;padding:13px 11px;display:flex;gap:11px;text-align:left;border:1px solid transparent;border-radius:16px;background:transparent}.lead-card+.lead-card{margin-top:5px}.lead-card.active{border-color:#ded8ff;background:linear-gradient(135deg,#f7f5ff,#fff7f8)}.lead-avatar{flex:0 0 40px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:13px;color:white;font-size:15px;font-weight:780;background:linear-gradient(135deg,#7564f2,#ff7180);box-shadow:0 8px 20px rgba(107,88,239,.2)}.lead-main{min-width:0;flex:1}.lead-name-row,.lead-bottom,.asset-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.lead-name{font-size:13px;font-weight:730;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stage-chip{padding:4px 7px;border-radius:999px;color:#6555df;font-size:8px;background:#eeeaff;white-space:nowrap}.stage-ready_for_delivery{color:#078b66;background:#dff8ef}.stage-asset_review{color:#c57b00;background:#fff2d5}.stage-contract_draft{color:#d4475a;background:#ffe8eb}.lead-meta{display:block;margin-top:4px;color:#8b93a6;font-size:9px}.lead-bottom{margin-top:8px}.lead-action{color:#60697f;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.protection{color:#e85568;font-size:9px;font-weight:700}.detail-column{min-width:0;display:grid;gap:16px}
.merchant-hero{position:relative;overflow:hidden;min-height:234px;padding:25px;border-radius:26px;color:white;background:linear-gradient(135deg,#101730 0%,#25204e 55%,#592e63 100%);box-shadow:0 22px 50px rgba(29,25,73,.22)}.hero-mesh{position:absolute;right:-70px;top:-110px;width:330px;height:330px;border-radius:50%;background:radial-gradient(circle,rgba(255,103,122,.47),rgba(109,82,248,.13) 48%,transparent 69%)}.merchant-top{position:relative;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.merchant-tags{display:flex;gap:7px;margin-bottom:13px}.light-chip{padding:6px 9px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:#d8ddf1;font-size:9px;background:rgba(255,255,255,.07)}.merchant-name,.merchant-address{display:block}.merchant-name{font-size:27px;font-weight:790;letter-spacing:-.8px}.merchant-address{max-width:640px;margin-top:8px;color:#afb7d2;font-size:11px}.score-ring{flex:0 0 76px;width:76px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 6px rgba(255,255,255,.025)}.score-value{font-size:24px;font-weight:800}.score-label{color:#aeb7d1;font-size:8px}.merchant-facts{position:relative;margin-top:28px;padding-top:18px;display:grid;grid-template-columns:1.2fr .7fr 1.6fr;gap:16px;border-top:1px solid rgba(255,255,255,.1)}.fact-label,.fact-value{display:block}.fact-label{color:#868fab;font-size:8px;letter-spacing:1px}.fact-value{margin-top:5px;color:#eef1fb;font-size:10px}
.merchant-actions{position:relative;margin-top:17px;display:flex;gap:8px}.merchant-actions button{padding:8px 11px;border:1px solid rgba(255,255,255,.11);border-radius:10px;color:#dbe0f1;font-size:9px;background:rgba(255,255,255,.07)}.merchant-actions button.danger{color:#ffb8c1}
.journey-panel{padding-bottom:18px}.step-track{padding:3px 21px 21px;display:flex;align-items:flex-start}.step-item{position:relative;flex:1;text-align:center}.step-item:not(:last-child)::after{content:"";position:absolute;top:13px;left:calc(50% + 14px);right:calc(-50% + 14px);height:2px;background:#e8eaf0}.step-item.done:not(:last-child)::after{background:linear-gradient(90deg,#6a58ef,#c15cc8)}.step-dot{position:relative;z-index:2;width:28px;height:28px;margin:0 auto;display:flex;align-items:center;justify-content:center;border:2px solid #e4e6ee;border-radius:50%;color:#a3a8b5;font-size:9px;font-weight:800;background:white}.step-item.done .step-dot{border-color:#6b58ef;color:white;background:#6b58ef}.step-item.current .step-dot{border-color:#ff6879;color:#e94f63;background:#fff0f2;box-shadow:0 0 0 6px #fff2f4}.step-label{display:block;margin-top:8px;color:#9a9faf;font-size:8px}.step-item.done .step-label,.step-item.current .step-label{color:#4e5363;font-weight:700}.primary-action{width:calc(100% - 40px);min-height:72px;margin:0 20px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;text-align:left;border-radius:18px;color:white;background:linear-gradient(115deg,#6955ed,#7b57ec 55%,#e66088);box-shadow:0 15px 34px rgba(104,83,235,.25)}.primary-action.disabled{opacity:.55}.action-overline,.action-title{display:block}.action-overline{color:#d9d3ff;font-size:8px;font-weight:800;letter-spacing:1.4px}.action-title{margin-top:6px;font-size:15px;font-weight:750}.action-arrow{font-size:25px}.assurance-row{padding:13px 24px 0;display:flex;justify-content:center;gap:18px;color:#858c9d;font-size:8px}
.demo-capture{margin:12px auto 0;color:#7163c8;font-size:9px;background:transparent;text-decoration:underline;text-underline-offset:3px}
.finding-grid{padding:0 20px 17px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.finding-card{padding:14px;border:1px solid #eceef3;border-radius:15px;background:#fbfbfd}.severity{display:inline-block;padding:4px 7px;border-radius:999px;color:#48806f;font-size:8px;background:#e8f8f2}.severity.high{color:#c23e51;background:#ffe8eb}.severity.medium{color:#a56900;background:#fff2d6}.finding-title,.finding-evidence{display:block}.finding-title{margin-top:9px;font-size:12px;font-weight:730}.finding-evidence{margin-top:5px;color:#7c8497;font-size:9px;line-height:1.55}.grade-badge{width:48px;height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:15px;color:#604edf;background:#eeeaff}.grade-badge text{font-size:16px;font-weight:800}.grade-badge small{font-size:7px}.proposal-strip{margin:0 20px 20px;padding:15px;display:grid;grid-template-columns:1.2fr 1.5fr auto;align-items:center;gap:16px;border-radius:17px;color:white;background:linear-gradient(120deg,#151c3a,#25204d)}.proposal-label,.proposal-title{display:block}.proposal-label{color:#9fa8c6;font-size:8px}.proposal-title{margin-top:5px;font-size:11px;font-weight:700}.priority-list{display:flex;flex-wrap:wrap;gap:5px}.priority-list text{padding:5px 7px;border-radius:7px;color:#cfd5ea;font-size:8px;background:rgba(255,255,255,.07)}.days-badge{font-size:22px;font-weight:800}.days-badge small{font-size:8px;font-weight:500}
.contract-panel{position:relative;overflow:hidden}.contract-glow{position:absolute;right:-90px;top:-100px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(110,84,244,.13),transparent 67%)}.contract-status{position:relative;padding:6px 10px;border-radius:999px;color:#c68100;font-size:9px;background:#fff1d2}.contract-status.signed{color:#078a65;background:#dff8ef}.contract-numbers{position:relative;padding:3px 20px 18px;display:grid;grid-template-columns:1.2fr .6fr .7fr 1fr;gap:12px}.number-label,.number-value,.price{display:block}.number-label{color:#9298a8;font-size:8px}.price{margin-top:5px;font-size:24px;font-weight:800;letter-spacing:-.6px}.number-value{margin-top:8px;font-size:15px;font-weight:750}.number-value.small{font-size:10px;line-height:1.35}.auth-list{position:relative;padding:14px 20px 19px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid #eff0f4}.auth-list text{padding:8px;border-radius:9px;color:#7e8596;font-size:8px;background:#f5f6f9}.auth-list text.granted{color:#087c5e;background:#e8f8f2}
.collaborator-row{position:relative;padding:0 20px 18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.collaborator-label{color:#8c93a5;font-size:8px}.collaborator-chip{padding:6px 8px;border-radius:8px;color:#5f51c8;font-size:8px;background:#f0edff}
.asset-grid{padding:0 20px 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.asset-card{padding:12px;display:flex;align-items:center;gap:11px;border:1px solid #eceef3;border-radius:16px;background:#fbfbfc}.asset-card.confirmed{border-color:#d6f2e8;background:#f4fcf9}.asset-preview{flex:0 0 42px;width:42px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:11px;color:#6b58e9;font-size:20px;background:linear-gradient(145deg,#ece8ff,#f8f6ff)}.asset-card.confirmed .asset-preview{color:#09916c;background:#e0f8ef}.asset-copy{min-width:0;flex:1}.asset-title{font-size:10px;font-weight:730}.confidence{color:#6553df;font-size:9px;font-weight:750}.asset-file,.asset-status{display:block;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.asset-file{color:#8a91a2;font-size:8px}.asset-status{color:#666e80;font-size:8px}
.asset-card.missing{border-style:dashed;background:#fafaff}.asset-upload{min-width:0;flex:1;text-align:left;background:transparent}.asset-upload text,.asset-upload small{display:block}.asset-upload text{color:#4d5262;font-size:10px;font-weight:700}.asset-upload small{margin-top:5px;color:#8b7ee1;font-size:8px}
.timeline{padding:0 20px 20px}.timeline-item{display:flex;gap:12px;min-height:51px}.timeline-marker{position:relative;flex:0 0 12px}.timeline-dot{position:absolute;top:3px;left:2px;width:8px;height:8px;border-radius:50%;background:#735deb;box-shadow:0 0 0 4px #eeeaff}.timeline-line{position:absolute;top:16px;bottom:0;left:5px;width:2px;background:#e9e8f3}.timeline-copy{padding-bottom:13px}.timeline-summary,.timeline-meta{display:block}.timeline-summary{font-size:10px;font-weight:650}.timeline-meta{margin-top:5px;color:#9399a8;font-size:8px}.safe-bottom{height:env(safe-area-inset-bottom)}
.sheet-overlay{position:fixed;z-index:20;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:24px;background:rgba(8,12,31,.55);backdrop-filter:blur(8px)}.action-sheet{width:min(720px,100%);max-height:calc(100vh - 48px);overflow-y:auto;padding:10px 24px 24px;border:1px solid rgba(255,255,255,.7);border-radius:28px;background:#fff;box-shadow:0 30px 90px rgba(8,12,31,.32)}.sheet-handle{width:42px;height:4px;margin:0 auto 15px;border-radius:99px;background:#dfe2e9}.sheet-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}.sheet-title{display:block;margin-top:5px;font-size:21px;font-weight:780}.sheet-close{width:34px;height:34px;border-radius:11px;color:#697086;font-size:23px;background:#f1f2f6}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.form-field{display:block}.form-field.wide{grid-column:1/-1}.form-field>text,.field-caption{display:block;margin-bottom:7px;color:#697184;font-size:9px;font-weight:700}.form-field input,.form-field textarea{width:100%;padding:12px 13px;border:1px solid #e3e6ed;border-radius:13px;color:#151a29;font-size:11px;background:#f9fafc}.form-field textarea{height:104px;line-height:1.55}.sheet-body{display:grid;gap:15px}.choice-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.choice-row button,.reason-grid button{padding:10px 8px;border:1px solid #e4e6ed;border-radius:11px;color:#6b7284;font-size:9px;background:#fafbfc}.choice-row button.active,.reason-grid button.active{border-color:#7864ed;color:#5e4bd4;background:#f0edff}.form-help{color:#9299aa;font-size:8px}.sheet-notice{padding:12px 13px;border-radius:12px;color:#7b5b1c;font-size:9px;line-height:1.5;background:#fff6df}.reason-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sheet-footer{margin-top:22px;display:grid;grid-template-columns:.45fr 1fr;gap:10px}.sheet-cancel,.sheet-submit{height:46px;border-radius:13px;font-size:11px;font-weight:700}.sheet-cancel{color:#626a7d;background:#f0f2f6}.sheet-submit{color:white;background:linear-gradient(120deg,#6956ec,#df5f86);box-shadow:0 12px 28px rgba(104,84,235,.22)}
.contract-step{display:flex;align-items:center;gap:11px}.contract-step>text{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#6755dc;font-size:9px;font-weight:800;background:#eeeaff}.step-copy-title,.step-copy-help{display:block}.step-copy-title{font-size:11px;font-weight:750}.step-copy-help{margin-top:3px;color:#8b92a3;font-size:8px}.package-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.package-grid button{position:relative;padding:13px 12px;text-align:left;border:1px solid #e5e7ee;border-radius:14px;background:#fafbfc}.package-grid button.active{border-color:#7864ec;background:linear-gradient(135deg,#f1eeff,#fff6f8);box-shadow:0 8px 22px rgba(104,84,235,.1)}.package-radio{position:absolute;right:10px;top:10px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:1px solid #dfe1e9;border-radius:50%;color:white;font-size:8px}.package-grid button.active .package-radio{border-color:#715ce8;background:#715ce8}.package-grid button>text,.package-grid button>small{display:block}.package-grid button>text{font-size:11px;font-weight:750}.package-grid button>small{max-width:85%;margin-top:5px;color:#858d9f;font-size:8px;line-height:1.45}.discount-field{position:relative}.discount-field input{padding-right:42px}.discount-suffix{position:absolute;right:15px;bottom:12px;color:#6a58de;font-size:12px;font-weight:800}.authorization-preview{padding:13px;border-radius:14px;background:#f6f7fa}.authorization-preview>view{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.authorization-preview>view text{color:#697184;font-size:8px}
@media (max-width: 900px){.content{width:min(100% - 28px,760px);padding-top:24px}.heading-row{align-items:flex-start}.date-pill{display:none}.page-title{font-size:25px}.metric-grid{grid-template-columns:repeat(2,1fr)}.workspace-grid{grid-template-columns:1fr}.lead-panel{position:static}.lead-list{display:flex;overflow-x:auto;padding-bottom:12px}.lead-card{min-width:278px}.merchant-facts{grid-template-columns:1fr 1fr}.merchant-facts .fact:last-child{grid-column:1/-1}.finding-grid{grid-template-columns:1fr}.asset-grid{grid-template-columns:1fr}.contract-numbers{grid-template-columns:1fr 1fr}.auth-list{grid-template-columns:repeat(2,1fr)}}
@media (max-width: 520px){.topbar{height:68px;padding-left:14px;padding-right:14px}.viewport{height:calc(100vh - 68px)}.secure-badge{padding:7px 9px;font-size:9px}.content{width:calc(100% - 22px);padding-top:20px}.heading-row{display:block}.heading-actions{margin-top:15px}.create-lead-button{width:100%}.page-title{font-size:22px}.page-description{line-height:1.55}.metric-grid{gap:9px}.metric-card{min-height:112px;padding:15px;border-radius:18px}.metric-value{font-size:27px}.workspace-grid,.detail-column{gap:11px}.panel{border-radius:20px}.merchant-hero{min-height:252px;padding:20px;border-radius:21px}.merchant-name{font-size:23px}.score-ring{width:64px;height:64px;flex-basis:64px}.merchant-facts{margin-top:22px;gap:13px}.merchant-actions{flex-wrap:wrap}.step-track{padding-left:12px;padding-right:12px}.step-label{font-size:7px}.step-dot{width:25px;height:25px}.step-item:not(:last-child)::after{top:12px;left:calc(50% + 12px);right:calc(-50% + 12px)}.primary-action{width:calc(100% - 24px);margin:0 12px;padding:0 16px}.assurance-row{padding-left:14px;padding-right:14px;gap:8px;flex-wrap:wrap}.proposal-strip{grid-template-columns:1fr auto}.priority-list{grid-column:1/-1;grid-row:2}.asset-grid,.finding-grid{padding-left:12px;padding-right:12px}.contract-numbers{padding-left:14px;padding-right:14px}.auth-list{padding-left:14px;padding-right:14px}.panel-header{padding-left:15px;padding-right:15px}.lead-panel .panel-header{padding-bottom:10px}.sheet-overlay{padding:0}.action-sheet{max-height:92vh;padding:9px 16px 18px;border-radius:24px 24px 0 0}.form-grid{grid-template-columns:1fr}.form-field.wide{grid-column:auto}.reason-grid{grid-template-columns:repeat(2,1fr)}}
</style>
