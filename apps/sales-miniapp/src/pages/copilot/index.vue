<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  SalesAiArtifactKind,
  SalesAiArtifactSummary,
  SalesAiCopilotOverview,
  SalesAiObjectionType,
  SalesAiRoleplaySessionSummary,
} from '@lequ/contracts'
import {
  confirmSalesArtifact,
  fetchSalesCopilot,
  generateSalesArtifact,
  replySalesRoleplay,
  startSalesRoleplay,
} from '../../services/copilot'

type WorkspaceMode =
  | SalesAiArtifactKind
  | 'ROLEPLAY'

const overview = ref<SalesAiCopilotOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const requestedLeadId = ref('')
const mode = ref<WorkspaceMode>('PRE_VISIT_BRIEF')
const objective = ref('')
const contextNotes = ref('')
const evidenceExpanded = ref(false)
const confirmTarget = ref<SalesAiArtifactSummary | null>(null)
const confirmSheetOpen = ref(false)
const meetingSummary = ref('')
const meetingNextAction = ref('')
const meetingNextActionAt = ref('')
const meetingChannel = ref<'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO'>('VISIT')
const objectionType = ref<SalesAiObjectionType>('PRICE')
const roleplayScenario = ref('商家认可方案方向，但对投入与实际回报仍有顾虑')
const roleplayResponse = ref('')

const workspaces: Array<{
  key: WorkspaceMode
  icon: string
  title: string
  short: string
  color: string
}> = [
  { key: 'PRE_VISIT_BRIEF', icon: '准', title: '拜访准备', short: '简报', color: '#7C6FF6' },
  { key: 'TALK_TRACK', icon: '话', title: '话术生成', short: '话术', color: '#E75E92' },
  { key: 'ROLEPLAY', icon: '练', title: '异议模拟', short: '模拟', color: '#F1A94B' },
  { key: 'MEETING_SUMMARY', icon: '记', title: '会议纪要', short: '纪要', color: '#42A5A2' },
  { key: 'NEXT_ACTION', icon: '行', title: '下一步', short: '行动', color: '#5E86E7' },
  { key: 'PROPOSAL', icon: '案', title: '提案生成', short: '提案', color: '#7A5AE2' },
]

const objectionOptions: Array<{
  key: SalesAiObjectionType
  label: string
}> = [
  { key: 'PRICE', label: '价格太高' },
  { key: 'ROI', label: '回报不清' },
  { key: 'TIMING', label: '时机不对' },
  { key: 'AUTHORITY', label: '无决策权' },
  { key: 'COMPETITOR', label: '竞品对比' },
]
const meetingChannels: Array<{
  key: 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO'
  label: string
}> = [
  { key: 'VISIT', label: '到店' },
  { key: 'PHONE', label: '电话' },
  { key: 'WECHAT', label: '微信' },
  { key: 'VIDEO', label: '视频' },
]

const activeWorkspace = computed(
  () => workspaces.find((item) => item.key === mode.value) ?? workspaces[0],
)
const activeArtifact = computed(() => {
  if (mode.value === 'ROLEPLAY') return null
  return overview.value?.artifacts.find((artifact) => artifact.kind === mode.value) ?? null
})
const latestRoleplay = computed<SalesAiRoleplaySessionSummary | null>(
  () => overview.value?.roleplaySessions[0] ?? null,
)
const evidence = computed(() => activeArtifact.value?.evidence ?? [])
const leadScrollTarget = computed(
  () => overview.value ? `copilot-lead-chip-${overview.value.focusLead.id}` : '',
)

function defaultObjective(data: SalesAiCopilotOverview): string {
  return data.recommendation.title
}

async function load(focusLeadId = requestedLeadId.value): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchSalesCopilot(focusLeadId || undefined)
    overview.value = data
    requestedLeadId.value = data.focusLead.id
    if (!objective.value.trim()) objective.value = defaultObjective(data)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'AI 销售助手加载失败'
  } finally {
    loading.value = false
  }
}

onLoad((query) => {
  requestedLeadId.value = typeof query?.focusLeadId === 'string'
    ? decodeURIComponent(query.focusLeadId)
    : ''
})
onShow(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

async function switchLead(leadId: string): Promise<void> {
  if (busy.value || overview.value?.focusLead.id === leadId) return
  requestedLeadId.value = leadId
  objective.value = ''
  contextNotes.value = ''
  roleplayResponse.value = ''
  await load(leadId)
}

function switchMode(target: WorkspaceMode): void {
  mode.value = target
  evidenceExpanded.value = false
  if (!overview.value) return
  if (target === 'MEETING_SUMMARY' && !contextNotes.value.trim()) {
    contextNotes.value = [
      '商家确认当前最需要解决的经营问题',
      '双方对验证范围和成功标准形成初步共识',
      '待确认决策人、负责人和下一次沟通时间',
    ].join('\n')
  }
  objective.value = defaultObjective(overview.value)
}

async function generateArtifact(): Promise<void> {
  const data = overview.value
  if (!data || mode.value === 'ROLEPLAY' || busy.value) return
  if (objective.value.trim().length < 3) {
    uni.showToast({ title: '请先写清本次目标', icon: 'none' })
    return
  }
  const notes = contextNotes.value.split('\n').map((item) => item.trim()).filter(Boolean)
  if (mode.value === 'MEETING_SUMMARY' && notes.length === 0) {
    uni.showToast({ title: '请粘贴或输入会谈原始记录', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await generateSalesArtifact(
      data.focusLead.id,
      mode.value,
      objective.value.trim(),
      notes,
    )
    uni.showToast({ title: '草稿已生成，等待你核对', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '生成失败',
      icon: 'none',
    })
  } finally {
    busy.value = false
  }
}

function localDateTime(value: string): string {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function openConfirmation(artifact: SalesAiArtifactSummary): void {
  confirmTarget.value = artifact
  confirmSheetOpen.value = true
  if (!overview.value) return
  meetingSummary.value = artifact.sections
    .find((section) => section.key === 'raw')?.items.join('；')
    ?? artifact.summary
  meetingNextAction.value = overview.value.focusLead.nextAction
  meetingNextActionAt.value = localDateTime(overview.value.focusLead.nextActionAt)
}

function closeConfirmation(): void {
  if (busy.value) return
  confirmSheetOpen.value = false
  confirmTarget.value = null
}

function selectMeetingChannel(
  channel: 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO',
): void {
  meetingChannel.value = channel
}

async function confirmArtifact(): Promise<void> {
  const data = overview.value
  const artifact = confirmTarget.value
  if (!data || !artifact || busy.value) return
  let writeback: Parameters<typeof confirmSalesArtifact>[2]
  if (artifact.kind === 'MEETING_SUMMARY') {
    if (
      meetingSummary.value.trim().length < 3
      || meetingNextAction.value.trim().length < 2
      || !Number.isFinite(Date.parse(meetingNextActionAt.value))
    ) {
      uni.showToast({ title: '请完整核对 CRM 跟进内容', icon: 'none' })
      return
    }
    writeback = {
      channel: meetingChannel.value,
      summary: meetingSummary.value.trim(),
      nextAction: meetingNextAction.value.trim(),
      nextActionAt: new Date(meetingNextActionAt.value).toISOString(),
    }
  }
  busy.value = true
  try {
    overview.value = await confirmSalesArtifact(
      artifact,
      data.focusLead.version,
      writeback,
    )
    closeConfirmation()
    uni.showToast({
      title: artifact.kind === 'MEETING_SUMMARY'
        ? '已确认并写入 CRM'
        : '草稿已由你确认',
      icon: 'success',
    })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '确认失败',
      icon: 'none',
    })
  } finally {
    busy.value = false
    confirmSheetOpen.value = false
    confirmTarget.value = null
  }
}

async function startRoleplay(): Promise<void> {
  const data = overview.value
  if (!data || busy.value) return
  if (roleplayScenario.value.trim().length < 3) {
    uni.showToast({ title: '请描述本次模拟场景', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await startSalesRoleplay(
      data.focusLead.id,
      objectionType.value,
      roleplayScenario.value.trim(),
    )
    roleplayResponse.value = ''
    uni.showToast({ title: '异议模拟已开始', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '模拟启动失败',
      icon: 'none',
    })
  } finally {
    busy.value = false
  }
}

async function sendRoleplayResponse(): Promise<void> {
  const session = latestRoleplay.value
  if (!session || busy.value) return
  if (roleplayResponse.value.trim().length < 3) {
    uni.showToast({ title: '请输入你的回应', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await replySalesRoleplay(session, roleplayResponse.value.trim())
    roleplayResponse.value = ''
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '回应提交失败',
      icon: 'none',
    })
  } finally {
    busy.value = false
  }
}

function artifactStatus(artifact: SalesAiArtifactSummary): string {
  return artifact.status === 'CONFIRMED' ? '已确认' : '待核对'
}

function actorLabel(actor: 'CUSTOMER' | 'SALES' | 'COACH'): string {
  if (actor === 'CUSTOMER') return '模拟客户'
  if (actor === 'SALES') return '我的回应'
  return 'AI 教练'
}

function goBack(): void {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: '/pages/index/index' }),
  })
}

function openCrm(): void {
  const leadId = overview.value?.focusLead.id
  if (!leadId) return
  uni.navigateTo({
    url: `/pages/onboarding/index?focusLeadId=${encodeURIComponent(leadId)}`,
  })
}

function switchWorkspace(
  target: 'TODAY' | 'MERCHANTS' | 'COPILOT' | 'PERFORMANCE' | 'TEAM',
): void {
  if (target === 'COPILOT') return
  if (target === 'TODAY') {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  const routes = {
    MERCHANTS: '/pages/crm/index',
    PERFORMANCE: '/pages/performance/index',
    TEAM: '/pages/team/index',
  } as const
  uni.navigateTo({ url: routes[target] })
}
</script>

<template>
  <view class="copilot-page" data-testid="sales-copilot-page">
    <view class="hero">
      <view class="hero-glow glow-a" />
      <view class="hero-glow glow-b" />
      <view class="topbar">
        <button class="back-button" hover-class="pressed" @click="goBack">‹</button>
        <view class="brand">
          <text>LEQU SALES INTELLIGENCE</text>
          <strong>AI 销售助手</strong>
        </view>
        <view class="safe-pill"><i /> 人控模式</view>
      </view>

      <template v-if="overview">
        <scroll-view
          class="lead-switcher"
          scroll-x
          :scroll-into-view="leadScrollTarget"
          :scroll-with-animation="true"
        >
          <button
            v-for="lead in overview.availableLeads"
            :key="lead.id"
            :id="`copilot-lead-chip-${lead.id}`"
            class="lead-chip"
            :class="{ active: lead.id === overview.focusLead.id }"
            :data-testid="`copilot-lead-${lead.id}`"
            @click="switchLead(lead.id)"
          >
            <text>{{ lead.name.slice(0, 1) }}</text>
            <view>
              <strong>{{ lead.name }}</strong>
              <span>{{ lead.category }} · v{{ lead.version }}</span>
            </view>
          </button>
        </scroll-view>

        <view class="command-card">
          <view class="command-copy">
            <text>NEXT BEST ACTION</text>
            <strong>{{ overview.recommendation.title }}</strong>
            <span>{{ overview.focusLead.nextAction }}</span>
          </view>
          <view class="evidence-orbit">
            <strong>{{ overview.metrics.evidenceCount }}</strong>
            <text>条证据</text>
          </view>
          <view class="command-metrics">
            <view><strong>{{ overview.metrics.draftCount }}</strong><text>待核对</text></view>
            <view><strong>{{ overview.metrics.confirmedCount }}</strong><text>已确认</text></view>
            <view><strong>{{ overview.metrics.roleplayCount }}</strong><text>次模拟</text></view>
          </view>
        </view>
      </template>
    </view>

    <main v-if="overview" class="content">
      <view class="substrate-card">
        <view class="substrate-mark">✦</view>
        <view class="substrate-copy">
          <text>VERIFIABLE AI SUBSTRATE</text>
          <strong>有据可查，确认后才生效</strong>
          <span>{{ overview.substrate.modelVersion }} · {{ overview.substrate.policyVersion }}</span>
        </view>
        <view class="live-dot"><i /> LIVE</view>
      </view>

      <view class="section-heading">
        <view><text>AI WORKSPACE</text><strong>六种工作模式</strong></view>
        <span>外勤优先</span>
      </view>

      <scroll-view class="mode-strip" scroll-x>
        <button
          v-for="item in workspaces"
          :key="item.key"
          class="mode-card"
          :class="{ active: mode === item.key }"
          :style="{ '--mode-color': item.color }"
          :data-testid="`copilot-mode-${item.key}`"
          @click="switchMode(item.key)"
        >
          <i>{{ item.icon }}</i>
          <strong>{{ item.title }}</strong>
          <text>{{ item.short }}</text>
        </button>
      </scroll-view>

      <section v-if="mode !== 'ROLEPLAY'" class="composer-card">
        <view class="composer-head">
          <view
            class="composer-icon"
            :style="{ background: activeWorkspace?.color ?? '#7C6FF6' }"
          >
            {{ activeWorkspace?.icon }}
          </view>
          <view>
            <text>DRAFT WITH EVIDENCE</text>
            <strong>{{ activeWorkspace?.title }}</strong>
          </view>
          <span v-if="activeArtifact">v{{ activeArtifact.revision }}</span>
        </view>

        <label class="field">
          <text>本次目标</text>
          <textarea
            v-model="objective"
            :maxlength="500"
            auto-height
            data-testid="copilot-objective"
          />
        </label>
        <label class="field">
          <text>
            {{ mode === 'MEETING_SUMMARY' ? '会谈原始记录 · 每行一条' : '补充上下文 · 可选' }}
          </text>
          <textarea
            v-model="contextNotes"
            class="notes-input"
            :placeholder="mode === 'MEETING_SUMMARY'
              ? '粘贴会议笔记、语音转写要点或现场记录'
              : '补充客户关注点、决策人、竞品或特殊约束'"
            :maxlength="2400"
            data-testid="copilot-context-notes"
          />
        </label>
        <button
          class="generate-button"
          :disabled="busy"
          data-testid="generate-copilot-artifact"
          @click="generateArtifact"
        >
          <text>✦</text>
          <view>
            <strong>{{ activeArtifact ? '基于最新证据重新生成' : '生成可核对草稿' }}</strong>
            <span>不发送 · 不承诺 · 不自动改 CRM</span>
          </view>
          <b>→</b>
        </button>
      </section>

      <section v-if="activeArtifact" class="artifact-card" data-testid="copilot-artifact">
        <view class="artifact-head">
          <view>
            <text>{{ activeArtifact.kind.replaceAll('_', ' ') }}</text>
            <strong>{{ activeArtifact.title }}</strong>
          </view>
          <span :class="{ confirmed: activeArtifact.status === 'CONFIRMED' }">
            {{ artifactStatus(activeArtifact) }} · v{{ activeArtifact.revision }}
          </span>
        </view>
        <p>{{ activeArtifact.summary }}</p>

        <view class="artifact-sections">
          <view
            v-for="(section, sectionIndex) in activeArtifact.sections"
            :key="section.key"
            class="artifact-section"
          >
            <view class="section-number">
              {{ String(sectionIndex + 1).padStart(2, '0') }}
            </view>
            <view class="section-body">
              <strong>{{ section.title }}</strong>
              <text v-for="item in section.items" :key="item">· {{ item }}</text>
            </view>
          </view>
        </view>

        <button class="evidence-toggle" @click="evidenceExpanded = !evidenceExpanded">
          <view><i>链</i><strong>{{ evidence.length }} 条事实证据</strong></view>
          <span>{{ evidenceExpanded ? '收起' : '查看来源' }} {{ evidenceExpanded ? '↑' : '↓' }}</span>
        </button>
        <view v-if="evidenceExpanded" class="evidence-list">
          <view v-for="item in evidence" :key="`${item.sourceType}-${item.sourceId}`">
            <i>{{ item.sourceType.slice(0, 1) }}</i>
            <view><strong>{{ item.label }}</strong><text>{{ item.value }}</text></view>
            <span>{{ item.sourceType }}</span>
          </view>
        </view>

        <view class="guardrail">
          <strong>安全边界</strong>
          <text v-for="item in activeArtifact.guardrails" :key="item">✓ {{ item }}</text>
        </view>

        <button
          v-if="activeArtifact.status === 'DRAFT'"
          class="confirm-button"
          data-testid="confirm-copilot-artifact"
          @click="openConfirmation(activeArtifact)"
        >
          我已核对，进入确认
        </button>
        <view v-else class="confirmed-banner">
          <i>✓</i>
          <view>
            <strong>已由 {{ activeArtifact.confirmedBy?.displayName }} 确认</strong>
            <text>模型、提示词、证据与确认人已进入不可变事件链</text>
          </view>
        </view>
      </section>

      <section v-if="mode === 'ROLEPLAY'" class="roleplay-card">
        <view class="roleplay-head">
          <view class="coach-avatar">练</view>
          <view><text>OBJECTION LAB</text><strong>异议模拟训练场</strong></view>
          <span>仅训练</span>
        </view>

        <template v-if="!latestRoleplay">
          <view class="objection-types">
            <button
              v-for="item in objectionOptions"
              :key="item.key"
              :class="{ active: objectionType === item.key }"
              @click="objectionType = item.key"
            >
              {{ item.label }}
            </button>
          </view>
          <label class="field">
            <text>模拟场景</text>
            <textarea v-model="roleplayScenario" auto-height :maxlength="500" />
          </label>
          <button
            class="start-roleplay"
            :disabled="busy"
            data-testid="start-copilot-roleplay"
            @click="startRoleplay"
          >
            开始三轮实战模拟 →
          </button>
        </template>

        <template v-if="latestRoleplay">
          <view class="simulation-meta">
            <view>
              <text>{{ latestRoleplay.objectionType }}</text>
              <strong>{{ latestRoleplay.scenario }}</strong>
            </view>
            <span :class="{ done: latestRoleplay.status === 'COMPLETED' }">
              {{ latestRoleplay.status === 'ACTIVE' ? '训练中' : '已完成' }}
            </span>
          </view>

          <view class="chat-list">
            <view
              v-for="turn in latestRoleplay.turns"
              :key="turn.id"
              class="chat-turn"
              :class="turn.actor.toLowerCase()"
            >
              <view class="chat-label">{{ actorLabel(turn.actor) }}</view>
              <view class="chat-bubble">
                <text>{{ turn.content }}</text>
                <view v-if="turn.evaluation" class="score-grid">
                  <view><strong>{{ turn.evaluation.overallScore }}</strong><text>综合</text></view>
                  <view><strong>{{ turn.evaluation.empathyScore }}</strong><text>共情</text></view>
                  <view><strong>{{ turn.evaluation.evidenceScore }}</strong><text>证据</text></view>
                  <view><strong>{{ turn.evaluation.complianceScore }}</strong><text>合规</text></view>
                  <view><strong>{{ turn.evaluation.nextStepScore }}</strong><text>收口</text></view>
                </view>
              </view>
            </view>
          </view>

          <view v-if="latestRoleplay.status === 'ACTIVE'" class="reply-box">
            <textarea
              v-model="roleplayResponse"
              placeholder="像真实会谈一样回应客户…"
              :maxlength="1200"
              data-testid="copilot-roleplay-response"
            />
            <button
              :disabled="busy"
              data-testid="send-copilot-roleplay-response"
              @click="sendRoleplayResponse"
            >
              发送并评分
            </button>
          </view>
          <button v-else class="restart-roleplay" @click="startRoleplay">
            重新训练这个场景
          </button>
        </template>
      </section>

      <section class="crm-context">
        <view class="crm-head">
          <view><text>LIVE CRM CONTEXT</text><strong>当前商机事实</strong></view>
          <button @click="openCrm">打开 CRM →</button>
        </view>
        <view class="fact-grid">
          <view><text>商家</text><strong>{{ overview.focusLead.name }}</strong></view>
          <view><text>联系人</text><strong>{{ overview.focusLead.contactName }}</strong></view>
          <view><text>健康度</text><strong>{{ overview.focusLead.healthScore ?? '—' }}</strong></view>
          <view><text>数据版本</text><strong>v{{ overview.focusLead.version }}</strong></view>
        </view>
        <view class="facts">
          <text v-for="fact in overview.focusLead.recentFacts" :key="fact">✓ {{ fact }}</text>
        </view>
      </section>
    </main>

    <view v-else-if="loading" class="state-card">
      <view class="loading-orbit">✦</view>
      <strong>正在装载商机事实与 AI 策略</strong>
      <text>校验证据来源、数据范围和模型版本</text>
    </view>

    <view v-else class="state-card error">
      <strong>暂时无法进入 AI 销售助手</strong>
      <text>{{ errorMessage }}</text>
      <button @click="load()">重新加载</button>
    </view>

    <nav class="bottom-nav">
      <button @click="switchWorkspace('TODAY')"><i>今</i><text>今日</text></button>
      <button @click="switchWorkspace('MERCHANTS')"><i>商</i><text>商家</text></button>
      <button class="active" @click="switchWorkspace('COPILOT')"><i>✦</i><text>AI</text></button>
      <button @click="switchWorkspace('PERFORMANCE')"><i>绩</i><text>业绩</text></button>
      <button @click="switchWorkspace('TEAM')"><i>队</i><text>团队</text></button>
    </nav>

    <view v-if="confirmSheetOpen && confirmTarget" class="sheet-mask" @click.self="closeConfirmation">
      <view class="confirm-sheet" data-testid="copilot-confirm-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text>HUMAN CONFIRMATION</text>
            <strong>确认前最后核对</strong>
          </view>
          <button @click="closeConfirmation">×</button>
        </view>

        <view class="confirm-warning">
          <i>!</i>
          <view>
            <strong>
              {{ confirmTarget.kind === 'MEETING_SUMMARY'
                ? '确认后将写入 CRM 跟进记录'
                : '确认只标记草稿，不会自动对外发送' }}
            </strong>
            <text>确认人、模型、提示词、证据与内容版本都会永久留痕。</text>
          </view>
        </view>

        <template v-if="confirmTarget.kind === 'MEETING_SUMMARY'">
          <label class="field">
            <text>确认后的跟进摘要</text>
            <textarea v-model="meetingSummary" :maxlength="1000" />
          </label>
          <label class="field">
            <text>下一步动作</text>
            <input v-model="meetingNextAction" :maxlength="160" />
          </label>
          <label class="field">
            <text>下一步时间</text>
            <input v-model="meetingNextActionAt" type="datetime-local" />
          </label>
          <view class="channel-row">
            <button
              v-for="item in meetingChannels"
              :key="item.key"
              :class="{ active: meetingChannel === item.key }"
              @click="selectMeetingChannel(item.key)"
            >
              {{ item.label }}
            </button>
          </view>
        </template>

        <button
          class="strong-confirm"
          :disabled="busy"
          data-testid="strong-confirm-copilot-artifact"
          @click="confirmArtifact"
        >
          {{ busy ? '正在确认…' : '我已核对并确认' }}
        </button>
        <text class="sheet-note">AI 无法代替你完成此确认</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.copilot-page {
  min-height: 100vh;
  padding-bottom: 92px;
  background: #f2f3f7;
  color: #17172c;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

button {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: inherit;

  &::after { display: none; }
}

.hero {
  position: relative;
  min-height: 338px;
  padding: 0 16px 28px;
  overflow: hidden;
  border-radius: 0 0 38px 38px;
  background:
    radial-gradient(circle at 82% 14%, rgba(126, 107, 255, .23), transparent 30%),
    linear-gradient(145deg, #101931, #1c1f43 54%, #302750);
  color: #fff;
}

.hero-glow {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, .035);
  border-radius: 50%;
}

.glow-a { top: 14px; right: -94px; width: 300px; height: 300px; }
.glow-b { top: 74px; right: -28px; width: 210px; height: 210px; }

.topbar {
  position: relative;
  z-index: 1;
  display: flex;
  height: 82px;
  align-items: center;
  gap: 10px;
  padding-top: env(safe-area-inset-top);
}

.back-button {
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 13px;
  background: rgba(255, 255, 255, .06);
  color: #fff;
  font-size: 25px;
}

.brand {
  min-width: 0;
  flex: 1;

  text, strong { display: block; }
  text { color: #74e8cc; font-size: 7px; font-weight: 900; letter-spacing: .16em; }
  strong { margin-top: 3px; font-size: 17px; font-weight: 950; letter-spacing: -.02em; }
}

.safe-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, .09);
  border-radius: 999px;
  background: rgba(255, 255, 255, .055);
  color: rgba(255, 255, 255, .66);
  font-size: 8px;
  font-weight: 800;

  i { width: 5px; height: 5px; border-radius: 50%; background: #67e8c7; box-shadow: 0 0 8px #67e8c7; }
}

.lead-switcher {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 2px 0 13px;
  white-space: nowrap;
}

.lead-chip {
  display: inline-flex;
  min-width: 166px;
  height: 53px;
  align-items: center;
  margin-right: 8px;
  padding: 7px 12px 7px 8px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 17px;
  background: rgba(255, 255, 255, .05);
  color: #fff;
  text-align: left;
  vertical-align: top;

  > text {
    display: flex;
    width: 37px;
    height: 37px;
    align-items: center;
    justify-content: center;
    flex: 0 0 37px;
    border-radius: 12px;
    background: rgba(255, 255, 255, .09);
    font-size: 15px;
    font-weight: 950;
  }

  view { min-width: 0; margin-left: 9px; }
  strong, span { display: block; max-width: 108px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-size: 11px; font-weight: 900; }
  span { margin-top: 4px; color: rgba(255, 255, 255, .44); font-size: 8px; }

  &.active {
    border-color: rgba(116, 232, 204, .5);
    background: rgba(116, 232, 204, .12);
    box-shadow: inset 0 0 0 1px rgba(116, 232, 204, .08);

    > text { background: linear-gradient(145deg, #795ff0, #d05aa4); }
  }
}

.command-card {
  position: relative;
  z-index: 1;
  min-height: 174px;
  padding: 20px 21px 57px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 25px;
  background: linear-gradient(145deg, rgba(255, 255, 255, .095), rgba(255, 255, 255, .035));
  box-shadow: 0 25px 54px rgba(5, 9, 28, .24);
}

.command-copy {
  padding-right: 80px;

  text, strong, span { display: block; }
  text { color: #9b8dfc; font-size: 8px; font-weight: 950; letter-spacing: .15em; }
  strong { margin-top: 8px; font-size: 18px; line-height: 1.34; font-weight: 950; letter-spacing: -.025em; }
  span { margin-top: 7px; overflow: hidden; color: rgba(255, 255, 255, .48); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
}

.evidence-orbit {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 5px solid rgba(255, 255, 255, .07);
  border-top-color: #70e1c5;
  border-right-color: #8b79fa;
  border-radius: 50%;

  strong { font-size: 21px; line-height: 1; font-weight: 950; }
  text { margin-top: 3px; color: rgba(255, 255, 255, .48); font-size: 7px; }
}

.command-metrics {
  position: absolute;
  right: 18px;
  bottom: 0;
  left: 18px;
  display: grid;
  height: 47px;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid rgba(255, 255, 255, .08);

  view { display: flex; align-items: center; justify-content: center; gap: 5px; }
  view + view { border-left: 1px solid rgba(255, 255, 255, .07); }
  strong { font-size: 13px; font-weight: 950; }
  text { color: rgba(255, 255, 255, .4); font-size: 8px; }
}

.content {
  position: relative;
  z-index: 3;
  margin-top: -17px;
  padding: 0 16px 40px;
}

.substrate-card {
  display: flex;
  min-height: 86px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba(24, 24, 50, .04);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 15px 38px rgba(24, 24, 50, .08);
}

.substrate-mark {
  display: flex;
  width: 47px;
  height: 47px;
  align-items: center;
  justify-content: center;
  flex: 0 0 47px;
  border-radius: 15px;
  background: linear-gradient(145deg, #6e62ef, #e05c9d);
  box-shadow: 0 10px 22px rgba(126, 83, 220, .28);
  color: #fff;
  font-size: 17px;
}

.substrate-copy {
  min-width: 0;
  flex: 1;
  margin-left: 12px;

  text, strong, span { display: block; }
  text { color: #725fe5; font-size: 7px; font-weight: 950; letter-spacing: .13em; }
  strong { margin-top: 5px; font-size: 13px; font-weight: 950; }
  span { margin-top: 5px; overflow: hidden; color: #9a9cab; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
}

.live-dot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 7px;
  border-radius: 999px;
  background: #f0fbf8;
  color: #2b9c81;
  font-size: 7px;
  font-weight: 900;

  i { width: 5px; height: 5px; border-radius: 50%; background: #42c8a7; }
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 27px 2px 12px;

  text, strong { display: block; }
  text { color: #9b9dab; font-size: 7px; font-weight: 950; letter-spacing: .15em; }
  strong { margin-top: 6px; font-size: 20px; font-weight: 950; letter-spacing: -.035em; }
  > span { color: #9b9dab; font-size: 9px; }
}

.mode-strip {
  width: calc(100% + 16px);
  margin-right: -16px;
  white-space: nowrap;
}

.mode-card {
  position: relative;
  display: inline-flex;
  width: 92px;
  height: 112px;
  align-items: flex-start;
  margin-right: 9px;
  padding: 13px;
  overflow: hidden;
  border: 1px solid rgba(24, 24, 50, .045);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(24, 24, 50, .045);
  flex-direction: column;
  text-align: left;
  vertical-align: top;

  i {
    display: flex;
    width: 35px;
    height: 35px;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: color-mix(in srgb, var(--mode-color) 12%, white);
    color: var(--mode-color);
    font-size: 13px;
    font-style: normal;
    font-weight: 950;
  }

  strong { margin-top: 10px; color: #24243a; font-size: 11px; font-weight: 900; }
  text { margin-top: 4px; color: #aaabba; font-size: 8px; }

  &.active {
    border-color: color-mix(in srgb, var(--mode-color) 35%, white);
    background: linear-gradient(150deg, color-mix(in srgb, var(--mode-color) 10%, white), #fff 74%);
    box-shadow: 0 12px 28px color-mix(in srgb, var(--mode-color) 16%, transparent);

    &::after {
      position: absolute;
      right: 12px;
      bottom: 10px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--mode-color);
      content: "";
    }
  }
}

.composer-card,
.artifact-card,
.roleplay-card,
.crm-context {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid rgba(24, 24, 50, .045);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(24, 24, 50, .055);
}

.composer-head,
.roleplay-head,
.artifact-head,
.crm-head,
.sheet-head {
  display: flex;
  align-items: center;
}

.composer-icon,
.coach-avatar {
  display: flex;
  width: 43px;
  height: 43px;
  align-items: center;
  justify-content: center;
  flex: 0 0 43px;
  border-radius: 14px;
  color: #fff;
  font-size: 14px;
  font-weight: 950;
}

.composer-head > view:nth-child(2),
.roleplay-head > view:nth-child(2) {
  min-width: 0;
  flex: 1;
  margin-left: 11px;

  text, strong { display: block; }
  text { color: #8d79ed; font-size: 7px; font-weight: 950; letter-spacing: .12em; }
  strong { margin-top: 5px; font-size: 16px; font-weight: 950; }
}

.composer-head > span,
.roleplay-head > span {
  padding: 5px 7px;
  border-radius: 999px;
  background: #f2efff;
  color: #7462db;
  font-size: 8px;
  font-weight: 900;
}

.field {
  display: block;
  margin-top: 16px;

  > text {
    display: block;
    margin-bottom: 7px;
    color: #656779;
    font-size: 9px;
    font-weight: 850;
  }

  textarea,
  input {
    box-sizing: border-box;
    width: 100%;
    min-height: 48px;
    padding: 13px 14px;
    border: 1px solid #ececf2;
    border-radius: 15px;
    background: #f8f8fb;
    color: #29293d;
    font-size: 11px;
    line-height: 1.6;
  }

  textarea { min-height: 64px; }
  .notes-input { min-height: 92px; }
}

.generate-button {
  display: flex;
  width: 100%;
  height: 63px;
  align-items: center;
  margin-top: 15px;
  padding: 0 15px;
  border-radius: 18px;
  background: linear-gradient(135deg, #6558df, #8a6bf1 58%, #b15ecb);
  box-shadow: 0 13px 28px rgba(106, 84, 218, .25);
  color: #fff;
  text-align: left;

  > text { font-size: 18px; }
  view { min-width: 0; flex: 1; margin-left: 11px; }
  strong, span { display: block; }
  strong { font-size: 12px; font-weight: 950; }
  span { margin-top: 4px; color: rgba(255, 255, 255, .62); font-size: 8px; }
  b { font-size: 18px; }
}

.artifact-card {
  padding: 0;
  overflow: hidden;
}

.artifact-head {
  padding: 19px 18px 14px;

  > view { min-width: 0; flex: 1; }
  text, strong { display: block; }
  text { color: #8273db; font-size: 7px; font-weight: 950; letter-spacing: .13em; }
  strong { margin-top: 6px; overflow: hidden; font-size: 15px; font-weight: 950; text-overflow: ellipsis; white-space: nowrap; }
  > span { padding: 6px 8px; border-radius: 999px; background: #fff5e7; color: #c98527; font-size: 8px; font-weight: 900; }
  > span.confirmed { background: #edf9f5; color: #279779; }
}

.artifact-card > p {
  margin: 0;
  padding: 0 18px 16px;
  color: #747687;
  font-size: 10px;
  line-height: 1.65;
}

.artifact-sections {
  margin: 0 12px;
  padding: 4px 0;
  border-radius: 19px;
  background: #f7f7fa;
}

.artifact-section {
  display: flex;
  gap: 12px;
  padding: 13px 14px;
}

.artifact-section + .artifact-section { border-top: 1px solid #e9e9ef; }
.section-number { color: #a395eb; font-size: 9px; font-weight: 950; }
.section-body {
  min-width: 0;
  flex: 1;

  strong, text { display: block; }
  strong { margin-bottom: 7px; font-size: 11px; font-weight: 950; }
  text { margin-top: 4px; color: #656779; font-size: 9px; line-height: 1.55; }
}

.evidence-toggle {
  display: flex;
  width: calc(100% - 24px);
  height: 47px;
  align-items: center;
  justify-content: space-between;
  margin: 12px;
  padding: 0 12px;
  border-radius: 15px;
  background: #f1effc;
  color: #6255b9;

  view { display: flex; align-items: center; gap: 7px; }
  i { display: flex; width: 25px; height: 25px; align-items: center; justify-content: center; border-radius: 8px; background: #fff; font-size: 9px; font-style: normal; }
  strong { font-size: 10px; font-weight: 900; }
  span { font-size: 8px; }
}

.evidence-list {
  margin: -3px 12px 12px;

  > view { display: flex; align-items: center; gap: 9px; padding: 10px 4px; border-bottom: 1px solid #efeff3; }
  i { display: flex; width: 29px; height: 29px; align-items: center; justify-content: center; flex: 0 0 29px; border-radius: 9px; background: #eff8f5; color: #2e9a80; font-size: 9px; font-style: normal; font-weight: 950; }
  view { min-width: 0; flex: 1; }
  strong, text { display: block; }
  strong { font-size: 9px; }
  text { margin-top: 3px; overflow: hidden; color: #8a8b99; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
  span { color: #aaaab5; font-size: 7px; }
}

.guardrail {
  margin: 12px;
  padding: 13px;
  border: 1px solid #efeaf9;
  border-radius: 16px;
  background: #fcfaff;

  strong, text { display: block; }
  strong { margin-bottom: 8px; color: #6f5bb8; font-size: 9px; }
  text { margin-top: 5px; color: #777487; font-size: 8px; line-height: 1.5; }
}

.confirm-button {
  width: calc(100% - 24px);
  height: 51px;
  margin: 0 12px 12px;
  border-radius: 16px;
  background: #1e1d37;
  color: #fff;
  font-size: 11px;
  font-weight: 950;
}

.confirmed-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 12px 12px;
  padding: 13px;
  border-radius: 16px;
  background: #edf9f5;

  i { display: flex; width: 31px; height: 31px; align-items: center; justify-content: center; border-radius: 50%; background: #3db592; color: #fff; font-style: normal; font-weight: 950; }
  strong, text { display: block; }
  strong { color: #287d68; font-size: 10px; }
  text { margin-top: 4px; color: #6c9c8f; font-size: 8px; }
}

.coach-avatar { background: linear-gradient(145deg, #e59a3b, #e76374); }

.objection-types {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 17px;

  button { padding: 8px 10px; border: 1px solid #e9e9ef; border-radius: 999px; background: #f8f8fa; color: #777887; font-size: 9px; }
  button.active { border-color: #efb55f; background: #fff6e8; color: #b86b0d; font-weight: 900; }
}

.start-roleplay,
.restart-roleplay {
  width: 100%;
  height: 51px;
  margin-top: 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #e29431, #e65d76);
  color: #fff;
  font-size: 11px;
  font-weight: 950;
}

.simulation-meta {
  display: flex;
  align-items: flex-start;
  margin-top: 17px;
  padding: 13px;
  border-radius: 15px;
  background: #fff8ed;

  > view { min-width: 0; flex: 1; }
  text, strong { display: block; }
  text { color: #c27b1e; font-size: 7px; font-weight: 950; }
  strong { margin-top: 5px; font-size: 10px; line-height: 1.5; }
  > span { padding: 5px 7px; border-radius: 999px; background: #ffe5bc; color: #b66b12; font-size: 7px; font-weight: 900; }
  > span.done { background: #eaf8f3; color: #298f73; }
}

.chat-list { margin-top: 15px; }
.chat-turn { margin-top: 12px; }
.chat-label { margin: 0 4px 5px; color: #aaaab5; font-size: 7px; }
.chat-bubble {
  max-width: 88%;
  padding: 12px 13px;
  border-radius: 16px;
  background: #f4f4f7;

  > text { display: block; font-size: 10px; line-height: 1.6; }
}

.chat-turn.sales {
  .chat-label { text-align: right; }
  .chat-bubble { margin-left: auto; background: #6d60de; color: #fff; border-radius: 16px 16px 4px 16px; }
}

.chat-turn.customer .chat-bubble { border-radius: 16px 16px 16px 4px; }
.chat-turn.coach .chat-bubble { max-width: 100%; border: 1px solid #f0e5d5; background: #fffaf2; color: #544536; }

.score-grid {
  display: grid;
  margin-top: 11px;
  padding-top: 10px;
  border-top: 1px solid rgba(174, 129, 64, .16);
  grid-template-columns: repeat(5, 1fr);

  view { text-align: center; }
  strong, text { display: block; }
  strong { font-size: 12px; font-weight: 950; }
  text { margin-top: 3px; color: #9d8768; font-size: 7px; }
}

.reply-box {
  margin-top: 14px;
  padding: 10px;
  border: 1px solid #e8e8ef;
  border-radius: 17px;
  background: #f8f8fa;

  textarea { box-sizing: border-box; width: 100%; min-height: 74px; padding: 4px; color: #2a2a3e; font-size: 10px; line-height: 1.6; }
  button { width: 100%; height: 42px; border-radius: 13px; background: #25243e; color: #fff; font-size: 10px; font-weight: 900; }
}

.crm-head {
  justify-content: space-between;

  text, strong { display: block; }
  text { color: #8b7be3; font-size: 7px; font-weight: 950; letter-spacing: .13em; }
  strong { margin-top: 5px; font-size: 16px; font-weight: 950; }
  button { padding: 7px 9px; border-radius: 999px; background: #f0eefb; color: #6757be; font-size: 8px; font-weight: 900; }
}

.fact-grid {
  display: grid;
  gap: 7px;
  margin-top: 15px;
  grid-template-columns: 1fr 1fr;

  view { padding: 11px; border-radius: 14px; background: #f7f7fa; }
  text, strong { display: block; }
  text { color: #a2a3af; font-size: 7px; }
  strong { margin-top: 5px; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
}

.facts {
  margin-top: 11px;
  padding: 12px;
  border-radius: 14px;
  background: #f0f9f6;

  text { display: block; margin: 5px 0; color: #397e6d; font-size: 8px; line-height: 1.45; }
}

.state-card {
  margin: 130px 24px 0;
  padding: 35px 24px;
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(24, 24, 50, .08);
  text-align: center;

  strong, text { display: block; }
  strong { margin-top: 18px; font-size: 15px; }
  text { margin-top: 8px; color: #8d8e9e; font-size: 10px; line-height: 1.6; }
  button { width: 100%; height: 46px; margin-top: 18px; border-radius: 15px; background: #6e60e2; color: #fff; font-size: 11px; font-weight: 900; }
}

.loading-orbit {
  display: flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  border: 5px solid #eeeafa;
  border-top-color: #7768e9;
  border-radius: 50%;
  color: #7768e9;
}

.sheet-mask {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgba(9, 12, 28, .58);
  backdrop-filter: blur(5px);
}

.bottom-nav {
  position: fixed;
  z-index: 30;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  padding: 7px 11px calc(7px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(34, 35, 50, .07);
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 -10px 28px rgba(22, 23, 37, .07);
  backdrop-filter: blur(16px);
  grid-template-columns: repeat(5, 1fr);

  button {
    display: flex;
    height: 50px;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: transparent;
    color: #9b9ca6;
    flex-direction: column;
  }

  i, text { display: block; }
  i { font-size: 11px; font-style: normal; font-weight: 950; }
  text { margin-top: 4px; font-size: 6px; font-weight: 850; }
  button.active { background: #f0eefc; color: #5c50ca; }
}

.confirm-sheet {
  box-sizing: border-box;
  width: 100%;
  max-height: 88vh;
  padding: 9px 18px calc(20px + env(safe-area-inset-bottom));
  overflow-y: auto;
  border-radius: 28px 28px 0 0;
  background: #fff;
  box-shadow: 0 -20px 60px rgba(9, 12, 28, .25);
}

.sheet-handle { width: 38px; height: 4px; margin: 0 auto 18px; border-radius: 99px; background: #d8d8df; }
.sheet-head {
  > view { min-width: 0; flex: 1; }
  text, strong { display: block; }
  text { color: #7b6ce1; font-size: 7px; font-weight: 950; letter-spacing: .13em; }
  strong { margin-top: 6px; font-size: 20px; font-weight: 950; }
  button { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 50%; background: #f2f2f5; color: #777887; font-size: 20px; }
}

.confirm-warning {
  display: flex;
  gap: 10px;
  margin-top: 17px;
  padding: 13px;
  border: 1px solid #f4dfbb;
  border-radius: 16px;
  background: #fff8ec;

  i { display: flex; width: 29px; height: 29px; align-items: center; justify-content: center; flex: 0 0 29px; border-radius: 9px; background: #efaa3d; color: #fff; font-style: normal; font-weight: 950; }
  strong, text { display: block; }
  strong { color: #80551c; font-size: 10px; line-height: 1.45; }
  text { margin-top: 5px; color: #a48760; font-size: 8px; line-height: 1.45; }
}

.channel-row {
  display: grid;
  gap: 7px;
  margin-top: 13px;
  grid-template-columns: repeat(4, 1fr);

  button { height: 38px; border: 1px solid #e6e6ec; border-radius: 12px; background: #f8f8fa; color: #777887; font-size: 9px; }
  button.active { border-color: #7465dd; background: #f0edff; color: #6152c2; font-weight: 900; }
}

.strong-confirm {
  width: 100%;
  height: 54px;
  margin-top: 18px;
  border-radius: 17px;
  background: #211f3c;
  box-shadow: 0 12px 26px rgba(33, 31, 60, .2);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
}

.sheet-note { display: block; margin-top: 10px; color: #aaaab5; font-size: 8px; text-align: center; }
.pressed { opacity: .75; transform: scale(.98); }

@media (min-width: 680px) {
  .hero { padding-right: calc((100% - 620px) / 2); padding-left: calc((100% - 620px) / 2); }
  .content { max-width: 620px; margin-right: auto; margin-left: auto; }
  .confirm-sheet { max-width: 620px; margin: 0 auto; }
  .bottom-nav { right: 50%; left: 50%; width: 520px; transform: translateX(-50%); }
}
</style>
