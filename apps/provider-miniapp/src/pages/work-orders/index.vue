<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ProviderWorkOrderOverview,
  ProviderWorkOrderStatus,
  ProviderWorkOrderType,
} from '@lequ/contracts'
import {
  assignWorkOrder,
  confirmWorkOrder,
  createWorkOrder,
  fetchProviderWorkOrders,
  startWorkOrder,
  submitWorkOrder,
  uploadWorkOrderAttachment,
} from '../../services/work-orders'

type StatusFilter = 'ALL' | ProviderWorkOrderStatus | 'OVERDUE'
type SheetMode = 'CREATE' | 'ASSIGN' | 'SUBMIT' | 'CONFIRM' | null

const overview = ref<ProviderWorkOrderOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const focusCaseId = ref('')
const sheetMode = ref<SheetMode>(null)

const createType = ref<ProviderWorkOrderType>('ASSET_COLLECTION')
const createTitle = ref('采集并核验三类经营资料')
const createDescription = ref('完成营业执照、门头照片和菜单原件采集，并核对识别结果。')
const createPriority = ref<'CRITICAL' | 'HIGH' | 'NORMAL'>('HIGH')
const createOwnerId = ref('')
const createDueHours = ref(12)
const createConfirmationRequired = ref(true)
const assignOwnerId = ref('')
const assignReason = ref('根据专业能力与当前负载调整交付负责人')
const handoffNote = ref('交付附件已经核验完整，请商家确认本次工作成果。')
const confirmationDecision = ref<'APPROVED' | 'CHANGES_REQUESTED'>('APPROVED')
const confirmerName = ref('')
const confirmerRole = ref('商户主理人')
const confirmationComment = ref('交付内容与现场实际一致，同意进入下一环节。')
const confirmationChecked = ref(false)

const focus = computed(() => overview.value?.focusWorkOrder ?? null)
const filteredOrders = computed(() => (overview.value?.workOrders ?? []).filter((item) => {
  if (focusCaseId.value && item.caseId !== focusCaseId.value) return false
  if (statusFilter.value === 'ALL') return true
  if (statusFilter.value === 'OVERDUE') return item.slaStatus === 'OVERDUE'
  return item.status === statusFilter.value
}))
const selectedType = computed(() =>
  overview.value?.typeCatalog.find(({ key }) => key === createType.value) ?? null,
)
const focusTypeIcon = computed(() =>
  overview.value?.typeCatalog.find(({ key }) => key === focus.value?.type)?.icon ?? 'W',
)
const primaryAction = computed(() => {
  if (!focus.value) return { label: '选择或创建工单', action: 'NONE' as const }
  if (focus.value.status === 'OPEN') return { label: '开始处理工单', action: 'START' as const }
  if (focus.value.status === 'CHANGES_REQUESTED') {
    return { label: '根据商家反馈恢复处理', action: 'START' as const }
  }
  if (focus.value.status === 'IN_PROGRESS' && focus.value.attachmentCount === 0) {
    return { label: '上传首项交付附件', action: 'UPLOAD' as const }
  }
  if (focus.value.status === 'IN_PROGRESS') {
    return {
      label: focus.value.confirmationRequired ? '提交商家确认' : '强确认完成工单',
      action: 'SUBMIT' as const,
    }
  }
  if (focus.value.status === 'WAITING_MERCHANT') {
    return { label: '记录商家确认结果', action: 'CONFIRM' as const }
  }
  return { label: '工单已经完成并留痕', action: 'NONE' as const }
})

const statusLabels: Record<ProviderWorkOrderStatus, string> = {
  OPEN: '待开始',
  IN_PROGRESS: '处理中',
  WAITING_MERCHANT: '待商家确认',
  CHANGES_REQUESTED: '商家要求修改',
  COMPLETED: '已完成',
}
const statusFilters: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'OPEN', label: '待开始' },
  { key: 'IN_PROGRESS', label: '处理中' },
  { key: 'WAITING_MERCHANT', label: '待确认' },
  { key: 'CHANGES_REQUESTED', label: '需修改' },
  { key: 'OVERDUE', label: '已逾期' },
  { key: 'COMPLETED', label: '已完成' },
]

function formatDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function slaLabel(): string {
  const item = focus.value
  if (!item) return ''
  if (item.slaStatus === 'COMPLETED') return '按证据完成'
  if (item.slaStatus === 'OVERDUE') return `已超时 ${Math.abs(item.hoursRemaining)}h`
  return `剩余 ${item.hoursRemaining}h`
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/delivery/index' }) })
}

function openSlaCenter(): void {
  uni.navigateTo({ url: '/pages/sla/index' })
}

async function load(input: {
  focusCaseId?: string | undefined
  focusWorkOrderId?: string | undefined
} = {}): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderWorkOrders(input)
    if (!focusCaseId.value && input.focusCaseId) focusCaseId.value = input.focusCaseId
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工单中心加载失败'
  } finally {
    loading.value = false
  }
}

async function selectOrder(workOrderId: string): Promise<void> {
  if (focus.value?.id === workOrderId || busy.value) return
  busy.value = true
  try {
    overview.value = await fetchProviderWorkOrders({ focusWorkOrderId: workOrderId })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工单切换失败'
  } finally {
    busy.value = false
  }
}

function selectCase(caseId: string): void {
  focusCaseId.value = focusCaseId.value === caseId ? '' : caseId
}

function selectCreateCase(caseId: string): void {
  focusCaseId.value = caseId
  const definition = overview.value?.typeCatalog.find(({ key }) => key === createType.value)
  const merchantName = overview.value?.cases.find(({ id }) => id === caseId)?.merchantName
  if (definition && merchantName) createTitle.value = `${definition.label} · ${merchantName}`
}

function setCreateType(type: ProviderWorkOrderType): void {
  createType.value = type
  const definition = overview.value?.typeCatalog.find(({ key }) => key === type)
  if (!definition) return
  createTitle.value = `${definition.label} · ${overview.value?.cases.find(({ id }) => id === focusCaseId.value)?.merchantName ?? '交付任务'}`
  createDescription.value = definition.description
  createDueHours.value = definition.defaultHours
  createConfirmationRequired.value = definition.confirmationRequired
}

function openSheet(mode: Exclude<SheetMode, null>): void {
  if (mode === 'CREATE') {
    const defaultCase = focusCaseId.value || overview.value?.cases[0]?.id || ''
    focusCaseId.value = defaultCase
    createOwnerId.value = overview.value?.operators[0]?.userId ?? ''
    setCreateType('ASSET_COLLECTION')
  }
  if (mode === 'ASSIGN') {
    assignOwnerId.value = overview.value?.operators.find(
      ({ userId }) => userId !== focus.value?.owner.userId,
    )?.userId ?? ''
  }
  confirmationChecked.value = false
  sheetMode.value = mode
}

function closeSheet(): void {
  if (!busy.value) sheetMode.value = null
}

async function runPrimary(): Promise<void> {
  const order = focus.value
  if (!order || busy.value) return
  if (primaryAction.value.action === 'UPLOAD') {
    chooseAttachment()
    return
  }
  if (primaryAction.value.action === 'SUBMIT') {
    openSheet('SUBMIT')
    return
  }
  if (primaryAction.value.action === 'CONFIRM') {
    openSheet('CONFIRM')
    return
  }
  if (primaryAction.value.action !== 'START') return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await startWorkOrder(order)
    uni.showToast({ title: '工单已进入处理', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '开始处理失败'
  } finally {
    busy.value = false
  }
}

function mimeFromFile(name: string, provided?: string): string {
  if (provided && overview.value?.policy.allowedMimeTypes.includes(provided)) return provided
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'pdf') return 'application/pdf'
  return 'text/plain'
}

async function readFile(path: string): Promise<ArrayBuffer> {
  if (/^(blob:|https?:)/.test(path)) {
    return (await fetch(path)).arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: path,
      success: (result) => resolve(result.data as ArrayBuffer),
      fail: () => reject(new Error('附件读取失败，请重新选择')),
    })
  })
}

function chooseAttachment(): void {
  const order = focus.value
  if (!order || busy.value) return
  const activeOrder = order

  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.jpg,.jpeg,.png,.webp,.pdf,.txt'
  input.style.display = 'none'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    busy.value = true
    errorMessage.value = ''
    try {
      overview.value = await uploadWorkOrderAttachment({
        order: activeOrder,
        category: 'DELIVERABLE',
        fileName: file.name,
        mimeType: mimeFromFile(file.name, file.type),
        content: await file.arrayBuffer(),
      })
      uni.showToast({ title: '原件已加密留存', icon: 'success' })
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '附件上传失败'
    } finally {
      busy.value = false
    }
  }, { once: true })
  document.body.appendChild(input)
  input.click()
  return
  // #endif

  // #ifndef H5
  uni.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt'],
    success: async (result) => {
      const file = result.tempFiles[0]
      if (!file) return
      busy.value = true
      errorMessage.value = ''
      try {
        const content = await readFile(file.path)
        overview.value = await uploadWorkOrderAttachment({
          order: activeOrder,
          category: 'DELIVERABLE',
          fileName: file.name,
          mimeType: mimeFromFile(file.name, 'type' in file ? file.type : undefined),
          content,
        })
        uni.showToast({ title: '原件已加密留存', icon: 'success' })
      } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '附件上传失败'
      } finally {
        busy.value = false
      }
    },
  })
  // #endif
}

async function submitSheet(): Promise<void> {
  if (!confirmationChecked.value || busy.value) {
    if (!confirmationChecked.value) uni.showToast({ title: '请先完成强确认', icon: 'none' })
    return
  }
  const order = focus.value
  busy.value = true
  errorMessage.value = ''
  try {
    if (sheetMode.value === 'CREATE') {
      if (!focusCaseId.value || !createOwnerId.value) throw new Error('请选择交付案件和负责人')
      overview.value = await createWorkOrder({
        caseId: focusCaseId.value,
        type: createType.value,
        title: createTitle.value.trim(),
        description: createDescription.value.trim(),
        priority: createPriority.value,
        ownerId: createOwnerId.value,
        dueAt: new Date(Date.now() + createDueHours.value * 3_600_000).toISOString(),
        confirmationRequired: createConfirmationRequired.value,
      })
      uni.showToast({ title: '工单已创建', icon: 'success' })
    } else if (sheetMode.value === 'ASSIGN' && order) {
      overview.value = await assignWorkOrder({
        workOrderId: order.id,
        expectedVersion: order.version,
        targetOwnerId: assignOwnerId.value,
        reason: assignReason.value.trim(),
      })
      uni.showToast({ title: '负责人已调整', icon: 'success' })
    } else if (sheetMode.value === 'SUBMIT' && order) {
      overview.value = await submitWorkOrder(order, handoffNote.value.trim())
      uni.showToast({ title: order.confirmationRequired ? '已提交商家确认' : '工单已完成', icon: 'success' })
    } else if (sheetMode.value === 'CONFIRM' && order) {
      overview.value = await confirmWorkOrder({
        order,
        decision: confirmationDecision.value,
        confirmerName: confirmerName.value.trim(),
        confirmerRole: confirmerRole.value.trim(),
        comment: confirmationComment.value.trim(),
      })
      uni.showToast({ title: confirmationDecision.value === 'APPROVED' ? '商家已确认' : '已退回修改', icon: 'success' })
    }
    sheetMode.value = null
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工单操作失败'
  } finally {
    busy.value = false
  }
}

onLoad((query) => {
  const caseId = typeof query?.focusCaseId === 'string' ? query.focusCaseId : undefined
  const workOrderId = typeof query?.focusWorkOrderId === 'string' ? query.focusWorkOrderId : undefined
  if (caseId) focusCaseId.value = caseId
  void load({ focusCaseId: caseId, focusWorkOrderId: workOrderId })
})
</script>

<template>
  <view class="work-order-shell">
    <view class="ambient ambient-a" /><view class="ambient ambient-b" />
    <header class="topbar">
      <button class="back" @click="goBack">‹</button>
      <view class="brand"><view class="brand-mark">W</view><view><text>Work Order OS</text><small>城市交付执行中心</small></view></view>
      <view class="secure-pill"><view /> 原件留存 · 事件只追加</view>
    </header>

    <scroll-view scroll-y class="viewport">
      <main class="content">
        <view v-if="errorMessage" class="error-bar"><text>{{ errorMessage }}</text><button @click="load({ focusWorkOrderId: focus?.id })">刷新</button></view>

        <view class="hero">
          <view class="hero-grid" /><view class="hero-glow" />
          <view class="hero-copy">
            <view class="hero-kicker"><text>EXECUTION</text> {{ overview?.city.name ?? '城市交付网络' }}</view>
            <text class="hero-title">每一项交付，都有负责人、有时限、有证据</text>
            <text class="hero-summary">工单把九阶段拆成可执行动作；附件保存原件哈希，商家确认保存身份与版本快照。</text>
            <button class="create-button" @click="openSheet('CREATE')"><text>＋ 创建交付工单</text><small>8 类标准模板</small></button>
          </view>
          <view class="hero-metrics">
            <view><text>{{ overview?.metrics.total ?? '—' }}</text><small>全部工单</small></view>
            <view><text>{{ overview?.metrics.inProgress ?? '—' }}</text><small>处理中</small></view>
            <view><text>{{ overview?.metrics.waitingMerchant ?? '—' }}</text><small>待商家</small></view>
            <view class="risk" @click="openSlaCenter"><text>{{ overview?.metrics.overdue ?? '—' }}</text><small>SLA 风险 ↗</small></view>
          </view>
        </view>

        <view v-if="loading" class="loading"><view /><text>正在加载城市工单与不可变证据…</text></view>

        <template v-else-if="overview">
          <view class="status-strip panel">
            <button
              v-for="item in statusFilters"
              :key="item.key"
              :class="{ active: statusFilter === item.key }"
              @click="statusFilter = item.key"
            >
              <text>{{ item.label }}</text>
              <small v-if="item.key === 'ALL'">{{ overview.metrics.total }}</small>
              <small v-else-if="item.key === 'OPEN'">{{ overview.metrics.open }}</small>
              <small v-else-if="item.key === 'IN_PROGRESS'">{{ overview.metrics.inProgress }}</small>
              <small v-else-if="item.key === 'WAITING_MERCHANT'">{{ overview.metrics.waitingMerchant }}</small>
              <small v-else-if="item.key === 'CHANGES_REQUESTED'">{{ overview.metrics.changesRequested }}</small>
              <small v-else-if="item.key === 'OVERDUE'">{{ overview.metrics.overdue }}</small>
              <small v-else>{{ overview.metrics.completed }}</small>
            </button>
          </view>

          <view class="workspace">
            <aside class="sidebar">
              <view class="case-panel panel">
                <view class="panel-head"><view><small>DELIVERY CASES</small><text>交付案件</text></view><b>{{ overview.cases.length }}</b></view>
                <view class="case-list">
                  <button
                    v-for="item in overview.cases"
                    :key="item.id"
                    :class="{ active: focusCaseId === item.id }"
                    @click="selectCase(item.id)"
                  >
                    <view class="case-avatar">{{ item.merchantName.slice(0, 1) }}</view>
                    <view><text>{{ item.merchantName }}</text><small>阶段 {{ item.stageIndex }}/9 · {{ item.progressRate }}%</small></view>
                    <b>{{ overview.workOrders.filter(({ caseId }) => caseId === item.id).length }}</b>
                  </button>
                </view>
              </view>

              <view class="queue-panel panel">
                <view class="panel-head"><view><small>WORK QUEUE</small><text>工单队列</text></view><b>{{ filteredOrders.length }}</b></view>
                <scroll-view scroll-y class="order-list">
                  <button
                    v-for="item in filteredOrders"
                    :key="item.id"
                    :class="{ active: focus?.id === item.id }"
                    @click="selectOrder(item.id)"
                  >
                    <view class="order-top"><text>{{ item.typeLabel }}</text><small :class="`status-${item.status.toLowerCase()}`">{{ statusLabels[item.status] }}</small></view>
                    <text class="order-title">{{ item.title }}</text>
                    <view class="order-foot"><text>{{ item.owner.displayName }}</text><small :class="{ overdue: item.slaStatus === 'OVERDUE' }">{{ item.slaStatus === 'OVERDUE' ? `超时 ${Math.abs(item.hoursRemaining)}h` : `${item.hoursRemaining}h` }}</small></view>
                  </button>
                  <view v-if="filteredOrders.length === 0" class="empty compact"><text>当前筛选暂无工单</text><small>可从上方创建标准交付工单</small></view>
                </scroll-view>
              </view>
            </aside>

            <section v-if="focus" class="main-column">
              <view class="focus-card">
                <view class="focus-top">
                  <view class="type-orb">{{ focusTypeIcon }}</view>
                  <view class="focus-copy">
                    <view class="badges"><text>{{ focus.typeLabel }}</text><text :class="`status-${focus.status.toLowerCase()}`">{{ statusLabels[focus.status] }}</text><text :class="{ overdue: focus.slaStatus === 'OVERDUE' }">{{ slaLabel() }}</text></view>
                    <text class="focus-title">{{ focus.title }}</text>
                    <text class="focus-description">{{ focus.description }}</text>
                  </view>
                  <view class="version-orb"><small>VERSION</small><text>v{{ focus.version }}</text></view>
                </view>
                <view class="focus-info">
                  <view><small>关联商家</small><text>{{ focus.merchantName }}</text></view>
                  <view><small>交付负责人</small><text>{{ focus.owner.displayName }}</text></view>
                  <view><small>截止时间</small><text>{{ formatDate(focus.dueAt) }}</text></view>
                  <view><small>商家确认</small><text>{{ focus.confirmationRequired ? '必需' : '无需' }}</text></view>
                </view>
                <view class="action-row">
                  <button class="secondary" :disabled="focus.status === 'COMPLETED'" @click="openSheet('ASSIGN')">⇄ 调整负责人</button>
                  <button v-if="focus.status === 'IN_PROGRESS'" class="secondary" @click="chooseAttachment">＋ 添加附件</button>
                  <button class="primary" :class="{ disabled: primaryAction.action === 'NONE' }" @click="runPrimary"><text>{{ busy ? '正在安全执行…' : primaryAction.label }}</text><b>→</b></button>
                </view>
              </view>

              <view class="evidence-grid">
                <view class="attachment-panel panel">
                  <view class="panel-head"><view><small>IMMUTABLE FILES</small><text>交付附件</text></view><b>{{ overview.attachments.length }}</b></view>
                  <view class="attachment-list">
                    <view v-for="item in overview.attachments" :key="item.id">
                      <view class="file-icon">{{ item.mimeType.includes('image') ? 'IMG' : item.mimeType.includes('pdf') ? 'PDF' : 'TXT' }}</view>
                      <view><text>{{ item.fileName }}</text><small>{{ formatBytes(item.byteSize) }} · {{ item.uploadedBy }}</small><small>SHA-256 · {{ item.sha256.slice(0, 14) }}…</small></view>
                      <text class="file-state">原件</text>
                    </view>
                    <view v-if="overview.attachments.length === 0" class="empty"><view>⌁</view><text>尚未上传交付附件</text><small>开始处理后可上传 JPG、PNG、WebP、PDF 或 TXT，单个不超过 8MB。</small></view>
                  </view>
                </view>

                <view class="confirmation-panel panel">
                  <view class="panel-head"><view><small>MERCHANT SIGN-OFF</small><text>商家确认</text></view><b>{{ overview.confirmations.length }}</b></view>
                  <view v-if="focus.latestConfirmation" class="confirmation-card" :class="{ rejected: focus.latestConfirmation.decision === 'CHANGES_REQUESTED' }">
                    <view class="confirm-symbol">{{ focus.latestConfirmation.decision === 'APPROVED' ? '✓' : '↺' }}</view>
                    <view><text>{{ focus.latestConfirmation.decision === 'APPROVED' ? '商家已确认交付' : '商家要求修改' }}</text><small>{{ focus.latestConfirmation.confirmerName }} · {{ focus.latestConfirmation.confirmerRole }}</small></view>
                    <text class="confirm-comment">{{ focus.latestConfirmation.comment }}</text>
                    <small>{{ formatDate(focus.latestConfirmation.createdAt) }} · {{ focus.latestConfirmation.actorName }} 留痕 · v{{ focus.latestConfirmation.workOrderVersion }}</small>
                  </view>
                  <view v-else class="empty"><view>签</view><text>{{ focus.confirmationRequired ? '等待交付结果提交' : '该类型无需商家确认' }}</text><small>确认时将固化商家确认人、角色、意见、工单版本与平台操作者。</small></view>
                </view>
              </view>

              <view class="timeline-panel panel">
                <view class="panel-head"><view><small>AUDIT TRAIL</small><text>工单证据时间线</text></view><b>{{ overview.events.length }}</b></view>
                <scroll-view scroll-x class="timeline-scroll">
                  <view class="timeline">
                    <view v-for="event in [...overview.events].reverse()" :key="event.id">
                      <view class="timeline-dot" />
                      <text>{{ event.summary }}</text>
                      <small>{{ event.actorName }}</small>
                      <small>{{ formatDate(event.createdAt) }}</small>
                    </view>
                  </view>
                </scroll-view>
              </view>
            </section>

            <view v-else class="no-focus panel">
              <view>W</view><text>把交付阶段拆成可验收工单</text><small>选择案件并创建工单，负责人、截止时间、附件与商家确认会进入统一证据链。</small><button @click="openSheet('CREATE')">创建第一张工单 →</button>
            </view>
          </view>
        </template>
      </main>
    </scroll-view>

    <view v-if="sheetMode" class="sheet-mask" @click="closeSheet">
      <view class="sheet" @click.stop>
        <view class="sheet-head"><view><small>STRONG CONFIRMATION</small><text>{{ sheetMode === 'CREATE' ? '创建交付工单' : sheetMode === 'ASSIGN' ? '调整负责人' : sheetMode === 'SUBMIT' ? '提交交付结果' : '记录商家确认' }}</text></view><button @click="closeSheet">×</button></view>

        <scroll-view v-if="sheetMode === 'CREATE'" scroll-y class="sheet-body">
          <text class="field-label">01 · 选择交付案件</text>
          <view class="choice-grid cases">
            <button v-for="item in overview?.cases" :key="item.id" :class="{ active: focusCaseId === item.id }" @click="selectCreateCase(item.id)"><text>{{ item.merchantName }}</text><small>阶段 {{ item.stageIndex }}/9</small></button>
          </view>
          <text class="field-label">02 · 工单类型</text>
          <view class="type-grid">
            <button v-for="item in overview?.typeCatalog" :key="item.key" :class="{ active: createType === item.key }" @click="setCreateType(item.key)"><text>{{ item.icon }}</text><small>{{ item.label }}</small></button>
          </view>
          <text class="field-label">03 · 标题与交付说明</text>
          <input v-model="createTitle" maxlength="120" placeholder="工单标题" />
          <textarea v-model="createDescription" maxlength="800" placeholder="明确工作范围与验收标准" />
          <text class="field-label">04 · 负责人</text>
          <view class="choice-grid">
            <button v-for="item in overview?.operators" :key="item.userId" :class="{ active: createOwnerId === item.userId }" @click="createOwnerId = item.userId"><text>{{ item.displayName }}</text><small>{{ item.activeWorkOrderCount }} 项进行中</small></button>
          </view>
          <text class="field-label">05 · 优先级与截止时间</text>
          <view class="option-row"><button v-for="item in ['NORMAL','HIGH','CRITICAL'] as const" :key="item" :class="{ active: createPriority === item }" @click="createPriority = item">{{ item === 'NORMAL' ? '普通' : item === 'HIGH' ? '高优先' : '紧急' }}</button></view>
          <view class="option-row"><button v-for="hours in [4,12,24,48]" :key="hours" :class="{ active: createDueHours === hours }" @click="createDueHours = hours">{{ hours }} 小时</button></view>
          <view class="policy-note"><text>{{ selectedType?.confirmationRequired ? '需要商家确认' : '默认无需商家确认' }}</text><small>{{ selectedType?.description }}</small></view>
        </scroll-view>

        <view v-else-if="sheetMode === 'ASSIGN'" class="sheet-body">
          <text class="field-label">选择同城在岗负责人</text>
          <view class="choice-grid"><button v-for="item in overview?.operators" :key="item.userId" :class="{ active: assignOwnerId === item.userId }" @click="assignOwnerId = item.userId"><text>{{ item.displayName }}</text><small>{{ item.activeWorkOrderCount }} 项进行中</small></button></view>
          <text class="field-label">调整原因</text>
          <textarea v-model="assignReason" maxlength="500" />
        </view>

        <view v-else-if="sheetMode === 'SUBMIT'" class="sheet-body">
          <view class="summary-box"><text>{{ focus?.attachmentCount }} 项附件已固化</text><small>{{ focus?.confirmationRequired ? '提交后进入商家确认，不能绕过确认直接完成。' : '该类型无需商家确认，提交后直接完成。' }}</small></view>
          <text class="field-label">交付说明</text><textarea v-model="handoffNote" maxlength="800" />
        </view>

        <view v-else class="sheet-body">
          <text class="field-label">确认结论</text>
          <view class="decision-row"><button :class="{ active: confirmationDecision === 'APPROVED' }" @click="confirmationDecision = 'APPROVED'">✓ 确认通过</button><button class="danger" :class="{ active: confirmationDecision === 'CHANGES_REQUESTED' }" @click="confirmationDecision = 'CHANGES_REQUESTED'">↺ 要求修改</button></view>
          <text class="field-label">商家确认人</text><input v-model="confirmerName" maxlength="80" placeholder="真实姓名" />
          <text class="field-label">商家身份</text><input v-model="confirmerRole" maxlength="80" placeholder="例如：商户主理人" />
          <text class="field-label">确认意见</text><textarea v-model="confirmationComment" maxlength="800" />
        </view>

        <button class="check-row" :class="{ checked: confirmationChecked }" @click="confirmationChecked = !confirmationChecked"><text>{{ confirmationChecked ? '✓' : '' }}</text><view><b>我已核对关键内容并确认本次操作</b><small>操作将写入审计、埋点、Outbox 和不可变工单事件。</small></view></button>
        <button class="sheet-submit" :class="{ disabled: !confirmationChecked || busy }" @click="submitSheet">{{ busy ? '正在提交并留痕…' : '强确认并执行' }} <text>→</text></button>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
button{margin:0;padding:0;border:0;line-height:inherit;background:transparent}button::after{display:none}
.work-order-shell{position:relative;min-height:100vh;overflow:hidden;color:#111827;background:#f1f4f8}.ambient{position:fixed;border-radius:50%;filter:blur(75px);pointer-events:none}.ambient-a{width:400px;height:400px;right:-210px;top:90px;background:rgba(111,86,232,.14)}.ambient-b{width:380px;height:380px;left:-230px;bottom:-100px;background:rgba(16,184,142,.1)}
.topbar{position:relative;z-index:5;height:78px;padding:env(safe-area-inset-top) 28px 0;display:flex;align-items:center;gap:13px;color:#fff;background:#091024}.back{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;font-size:28px;background:rgba(255,255,255,.05)}.brand{display:flex;align-items:center;gap:10px;flex:1}.brand-mark{width:39px;height:39px;display:flex;align-items:center;justify-content:center;border-radius:13px;font-size:14px;font-weight:900;background:linear-gradient(145deg,#755ce8,#19b58b)}.brand text,.brand small{display:block}.brand text{font-size:15px;font-weight:820}.brand small{margin-top:3px;color:#8995b0;font-size:7px;letter-spacing:1.2px}.secure-pill{padding:8px 11px;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.1);border-radius:99px;color:#bcc5d8;font-size:7px}.secure-pill view{width:6px;height:6px;border-radius:50%;background:#26d29f;box-shadow:0 0 0 5px rgba(38,210,159,.12)}
.viewport{height:calc(100vh - 78px)}.content{position:relative;z-index:1;width:min(1430px,calc(100% - 48px));margin:auto;padding:27px 0 55px}.error-bar{margin-bottom:12px;padding:12px 14px;display:flex;justify-content:space-between;border:1px solid #ffd1d8;border-radius:13px;color:#a52e42;font-size:9px;background:#fff0f3}.error-bar button{color:#9f2d42;font-size:8px;font-weight:750}
.hero{position:relative;min-height:220px;padding:29px 32px;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 480px;gap:30px;align-items:center;border-radius:28px;color:#fff;background:linear-gradient(125deg,#101831,#22234a 58%,#15474b);box-shadow:0 23px 50px rgba(20,29,58,.2)}.hero-grid{position:absolute;inset:0;opacity:.12;background-image:linear-gradient(rgba(255,255,255,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.22) 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(90deg,#000,transparent 70%)}.hero-glow{position:absolute;right:-50px;top:-180px;width:430px;height:430px;border-radius:50%;background:radial-gradient(circle,rgba(37,217,166,.3),rgba(105,82,230,.09) 55%,transparent 70%)}.hero-copy,.hero-metrics{position:relative}.hero-kicker{display:flex;align-items:center;gap:7px;color:#a2adc5;font-size:7px;font-weight:800;letter-spacing:1.2px}.hero-kicker text{padding:4px 6px;border-radius:99px;color:#07231c;background:#29d8a5}.hero-title{display:block;margin-top:14px;font-size:28px;font-weight:850;letter-spacing:-1px}.hero-summary{display:block;max-width:650px;margin-top:8px;color:#aab4ca;font-size:9px;line-height:1.65}.create-button{min-width:194px;margin-top:18px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:13px;color:#151a2b;background:#fff}.create-button text{font-size:10px;font-weight:800}.create-button small{color:#8e95a3;font-size:6px}.hero-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.hero-metrics view{min-height:90px;padding:16px 12px;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.09);border-radius:17px;background:rgba(255,255,255,.055)}.hero-metrics view.risk{background:rgba(234,73,95,.1)}.hero-metrics text{font-size:25px;font-weight:850}.hero-metrics small{margin-top:auto;color:#939eb6;font-size:7px}
.loading{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#7f8899;font-size:9px}.loading view{width:32px;height:32px;margin-bottom:13px;border:3px solid #dfe3e8;border-top-color:#6d57dd;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.panel{border:1px solid #dfe4e9;border-radius:22px;background:rgba(255,255,255,.93);box-shadow:0 14px 38px rgba(28,42,58,.055)}
.status-strip{margin-top:14px;padding:8px;display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.status-strip button{padding:10px;display:flex;justify-content:center;gap:7px;border-radius:13px;color:#727b8d;font-size:8px}.status-strip button small{min-width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:99px;color:#9097a5;font-size:6px;background:#e9ecf0}.status-strip button.active{color:#fff;background:linear-gradient(120deg,#6652d4,#4f56cf)}.status-strip button.active small{color:#5444be;background:#fff}
.workspace{margin-top:14px;display:grid;grid-template-columns:315px minmax(0,1fr);gap:14px;align-items:start}.sidebar,.main-column{display:grid;gap:14px}.panel-head{padding:17px 18px 12px;display:flex;align-items:center;justify-content:space-between}.panel-head small,.panel-head text{display:block}.panel-head small{color:#8975e9;font-size:6px;font-weight:850;letter-spacing:1.3px}.panel-head text{margin-top:4px;font-size:13px;font-weight:790}.panel-head>b{padding:5px 8px;border-radius:99px;color:#70798b;font-size:7px;background:#f0f2f5}
.case-list{padding:0 8px 9px}.case-list button{width:100%;margin-bottom:6px;padding:10px;display:flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:14px;text-align:left;background:#f8f9fb}.case-list button.active{border-color:#d9d2ff;background:linear-gradient(135deg,#f2efff,#effaf7)}.case-avatar{width:35px;height:35px;flex:0 0 35px;display:flex;align-items:center;justify-content:center;border-radius:11px;color:#fff;font-size:11px;font-weight:800;background:linear-gradient(140deg,#715be2,#20b88f)}.case-list button>view:nth-child(2){min-width:0;flex:1}.case-list text,.case-list small{display:block}.case-list text{overflow:hidden;font-size:9px;font-weight:730;text-overflow:ellipsis;white-space:nowrap}.case-list small{margin-top:4px;color:#9097a5;font-size:6px}.case-list b{width:21px;height:21px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#6754d1;font-size:7px;background:#ebe8ff}
.queue-panel{overflow:hidden}.order-list{height:470px;padding:0 8px 9px;box-sizing:border-box}.order-list>button{width:100%;margin-bottom:7px;padding:12px 10px;border:1px solid transparent;border-radius:15px;text-align:left;background:#f8f9fb}.order-list>button.active{border-color:#d9d1ff;background:linear-gradient(135deg,#f3f0ff,#effaf7);box-shadow:0 8px 20px rgba(92,74,202,.07)}.order-top,.order-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.order-top>text{color:#725fde;font-size:7px;font-weight:780}.order-top small{padding:4px 6px;border-radius:99px;font-size:6px;background:#ece9ff}.order-title{display:block;margin-top:8px;font-size:10px;font-weight:750;line-height:1.4}.order-foot{margin-top:9px;color:#8c94a2;font-size:6px}.order-foot .overdue,.overdue{color:#d34258!important}
.focus-card{overflow:hidden;border-radius:23px;background:#fff;box-shadow:0 15px 40px rgba(28,41,57,.07)}.focus-top{position:relative;min-height:135px;padding:22px 23px;display:flex;align-items:center;gap:14px;color:#fff;background:linear-gradient(120deg,#111a35,#23234a 58%,#17494c)}.type-orb{width:54px;height:54px;flex:0 0 54px;display:flex;align-items:center;justify-content:center;border-radius:18px;font-size:18px;font-weight:850;background:linear-gradient(140deg,#725ae0,#20bc90)}.focus-copy{min-width:0;flex:1}.badges{display:flex;gap:6px}.badges text{padding:4px 7px;border:1px solid rgba(255,255,255,.1);border-radius:99px;color:#c7cfe1;font-size:6px;background:rgba(255,255,255,.06)}.focus-title,.focus-description{display:block}.focus-title{margin-top:10px;font-size:19px;font-weight:830}.focus-description{max-width:680px;margin-top:6px;color:#9da9c0;font-size:7px;line-height:1.55}.version-orb{width:58px;height:58px;flex:0 0 58px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:rgba(255,255,255,.05)}.version-orb small{color:#8d99b1;font-size:5px}.version-orb text{margin-top:4px;font-size:15px;font-weight:850}.focus-info{padding:13px 17px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.focus-info view{padding:10px;border-radius:12px;background:#f7f8fa}.focus-info small,.focus-info text{display:block}.focus-info small{color:#959ca9;font-size:6px}.focus-info text{margin-top:4px;overflow:hidden;font-size:8px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.action-row{padding:0 17px 17px;display:flex;gap:7px}.action-row button{min-height:47px;padding:0 13px;display:flex;align-items:center;justify-content:center;border-radius:13px;font-size:8px;font-weight:720}.action-row .secondary{border:1px solid #e0e4e9;color:#687185}.action-row .primary{flex:1;justify-content:space-between;color:#fff;background:linear-gradient(110deg,#6d56db,#5d57d9 50%,#12a87e);box-shadow:0 11px 25px rgba(93,77,202,.18)}.action-row .primary b{font-size:17px}.action-row .disabled{opacity:.5}
.evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.attachment-panel,.confirmation-panel{min-height:255px;overflow:hidden}.attachment-list{padding:0 12px 13px}.attachment-list>view:not(.empty){padding:10px;display:flex;align-items:center;gap:9px;border-radius:13px;background:#f8f9fb}.attachment-list>view+view{margin-top:6px}.file-icon{width:37px;height:37px;flex:0 0 37px;display:flex;align-items:center;justify-content:center;border-radius:11px;color:#6653d1;font-size:7px;font-weight:850;background:#eae7ff}.attachment-list>view>view:nth-child(2){min-width:0;flex:1}.attachment-list text,.attachment-list small{display:block}.attachment-list>view>view:nth-child(2)>text{overflow:hidden;font-size:8px;font-weight:730;text-overflow:ellipsis;white-space:nowrap}.attachment-list small{margin-top:3px;color:#969daa;font-size:6px}.file-state{padding:4px 6px;border-radius:99px;color:#07815f;font-size:6px;background:#ddf7ed}.confirmation-card{margin:0 13px 13px;padding:14px;display:grid;grid-template-columns:38px 1fr;gap:10px;border:1px solid #cbeee2;border-radius:16px;background:#effaf6}.confirmation-card.rejected{border-color:#ffd2d8;background:#fff2f4}.confirm-symbol{grid-row:span 2;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:#fff;font-size:14px;background:#15a87f}.confirmation-card.rejected .confirm-symbol{background:#db4d60}.confirmation-card text,.confirmation-card small{display:block}.confirmation-card>view:nth-child(2)>text{font-size:10px;font-weight:760}.confirmation-card>view:nth-child(2)>small{margin-top:4px;color:#7e8b88;font-size:6px}.confirm-comment{grid-column:1/-1;padding:9px;border-radius:10px;font-size:8px;line-height:1.5;background:rgba(255,255,255,.65)}.confirmation-card>small{grid-column:1/-1;color:#8c9693;font-size:6px}
.empty{padding:26px 15px;text-align:center}.empty>view{width:40px;height:40px;margin:auto;display:flex;align-items:center;justify-content:center;border-radius:13px;color:#6a56d6;font-size:11px;font-weight:800;background:#ece9ff}.empty>text,.empty>small{display:block}.empty>text{margin-top:9px;font-size:9px;font-weight:730}.empty>small{margin:5px auto 0;max-width:310px;color:#939aa7;font-size:6px;line-height:1.55}.empty.compact{padding:20px 10px}.timeline-panel{overflow:hidden}.timeline-scroll{width:100%;white-space:nowrap}.timeline{min-width:max-content;padding:2px 20px 18px;display:flex}.timeline>view{position:relative;width:180px;padding-right:18px;white-space:normal}.timeline>view:not(:last-child)::after{content:"";position:absolute;left:9px;right:-9px;top:5px;height:1px;background:#e0e3e8}.timeline-dot{position:relative;z-index:1;width:10px;height:10px;border:3px solid #fff;border-radius:50%;background:#6d58dc;box-shadow:0 0 0 2px #dcd6fa}.timeline text,.timeline small{display:block}.timeline text{margin-top:10px;font-size:8px;font-weight:730;line-height:1.4}.timeline small{margin-top:4px;color:#969daa;font-size:6px}.no-focus{min-height:500px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.no-focus>view{width:55px;height:55px;display:flex;align-items:center;justify-content:center;border-radius:18px;color:#fff;font-size:18px;font-weight:900;background:linear-gradient(140deg,#6f58dc,#18ad85)}.no-focus>text{margin-top:13px;font-size:15px;font-weight:800}.no-focus>small{max-width:410px;margin-top:7px;color:#8c94a3;font-size:8px;line-height:1.6}.no-focus button{margin-top:15px;padding:10px 15px;border-radius:11px;color:#fff;font-size:8px;background:#6452cf}
.sheet-mask{position:fixed;z-index:20;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(5,10,24,.58);backdrop-filter:blur(8px)}.sheet{width:min(720px,100%);max-height:90vh;padding:20px;border:1px solid rgba(255,255,255,.55);border-radius:25px;background:#fff;box-shadow:0 28px 80px rgba(8,14,33,.28)}.sheet-head{display:flex;align-items:center;justify-content:space-between}.sheet-head small,.sheet-head text{display:block}.sheet-head small{color:#7b66df;font-size:6px;font-weight:850;letter-spacing:1.2px}.sheet-head text{margin-top:5px;font-size:16px;font-weight:820}.sheet-head button{width:34px;height:34px;border-radius:11px;color:#747c8c;font-size:20px;background:#f1f3f6}.sheet-body{max-height:58vh;margin-top:16px}.field-label{display:block;margin:14px 0 7px;color:#808898;font-size:7px;font-weight:800;letter-spacing:.5px}.choice-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.choice-grid.cases{grid-template-columns:repeat(2,1fr)}.choice-grid button,.option-row button{padding:10px;border:1px solid #e1e4e9;border-radius:12px;text-align:left}.choice-grid button.active,.option-row button.active{color:#5e49cc;border-color:#cfc5ff;background:#f2efff}.choice-grid text,.choice-grid small{display:block}.choice-grid text{font-size:8px;font-weight:720}.choice-grid small{margin-top:4px;color:#9299a6;font-size:6px}.type-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.type-grid button{padding:10px 4px;border:1px solid #e0e4e8;border-radius:12px}.type-grid button.active{color:#fff;border-color:#6954d7;background:linear-gradient(140deg,#6c57db,#20ad89)}.type-grid text,.type-grid small{display:block}.type-grid text{font-size:14px}.type-grid small{margin-top:4px;font-size:6px}.sheet input,.sheet textarea{width:100%;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:12px;font-size:9px;background:#f8f9fb}.sheet input{height:43px;padding:0 12px}.sheet textarea{height:82px;padding:11px}.sheet textarea+textarea{margin-top:7px}.option-row{display:flex;gap:7px;margin-top:7px}.option-row button{flex:1;text-align:center;font-size:8px}.policy-note,.summary-box{margin-top:11px;padding:12px;border-radius:13px;background:#eef9f5}.policy-note text,.policy-note small,.summary-box text,.summary-box small{display:block}.policy-note text,.summary-box text{color:#087a5d;font-size:8px;font-weight:750}.policy-note small,.summary-box small{margin-top:5px;color:#74847f;font-size:7px;line-height:1.5}.decision-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.decision-row button{padding:12px;border:1px solid #dfe3e8;border-radius:12px;color:#697283;font-size:9px}.decision-row button.active{color:#087e5f;border-color:#9ce0c9;background:#eaf9f4}.decision-row button.danger.active{color:#ba3348;border-color:#f3b9c2;background:#fff0f2}.check-row{width:100%;margin-top:14px;padding:12px;display:flex;align-items:center;gap:10px;border-radius:14px;text-align:left;background:#f4f6f8}.check-row>text{width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:2px solid #cdd2da;border-radius:7px;color:#fff;font-size:9px}.check-row.checked>text{border-color:#6551cf;background:#6551cf}.check-row b,.check-row small{display:block}.check-row b{font-size:8px}.check-row small{margin-top:4px;color:#8b93a1;font-size:6px}.sheet-submit{width:100%;margin-top:10px;padding:14px;display:flex;justify-content:space-between;border-radius:14px;color:#fff;font-size:10px;font-weight:780;background:linear-gradient(110deg,#6a54d8,#5d56d6 50%,#11a67d);box-shadow:0 12px 26px rgba(92,75,197,.2)}.sheet-submit.disabled{opacity:.5}
.status-open{color:#6a56d5!important}.status-in_progress{color:#187dce!important}.status-waiting_merchant{color:#b87711!important}.status-changes_requested{color:#cf4057!important}.status-completed{color:#078160!important}
@media(max-width:760px){.topbar{height:70px;padding-left:14px;padding-right:14px}.secure-pill{font-size:0}.secure-pill view{margin:0}.viewport{height:calc(100vh - 70px)}.content{width:calc(100% - 24px);padding-top:13px}.hero{min-height:300px;padding:22px 19px;display:block}.hero-title{font-size:23px}.hero-summary{font-size:8px}.create-button{width:100%;box-sizing:border-box}.hero-metrics{margin-top:17px}.hero-metrics view{min-height:73px;padding:12px 9px}.hero-metrics text{font-size:20px}.status-strip{overflow-x:auto;display:flex}.status-strip button{min-width:86px}.workspace{grid-template-columns:1fr}.order-list{height:auto;max-height:390px}.focus-top{padding:18px 15px}.type-orb{width:45px;height:45px;flex-basis:45px;border-radius:15px}.focus-title{font-size:15px}.version-orb{width:49px;height:49px;flex-basis:49px}.focus-info{grid-template-columns:repeat(2,1fr)}.action-row{flex-wrap:wrap}.action-row .primary{flex-basis:100%;order:-1}.evidence-grid{grid-template-columns:1fr}.timeline>view{width:150px}.sheet-mask{padding:8px}.sheet{padding:17px;border-radius:23px}.choice-grid{grid-template-columns:repeat(2,1fr)}.type-grid{grid-template-columns:repeat(4,1fr)}}
</style>
