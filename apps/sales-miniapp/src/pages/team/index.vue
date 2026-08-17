<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  SalesCapabilityKey,
  SalesCareerLevel,
  SalesCoachingPlanSummary,
  SalesLevelChangeSummary,
  SalesPerformanceRating,
  SalesTeamMemberSummary,
  SalesTeamOverview,
} from '@lequ/contracts'
import {
  checkInCoachingPlan,
  createCoachingPlan,
  decideLevelChange,
  fetchSalesTeam,
  requestLevelChange,
} from '../../services/team'

type SheetMode = 'LEVEL' | 'COACHING' | 'CHECK_IN' | null

const overview = ref<SalesTeamOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const sheetMode = ref<SheetMode>(null)
const selectedPlan = ref<SalesCoachingPlanSummary | null>(null)
const levelReason = ref('')
const levelEvidence = ref('')
const coachingTitle = ref('')
const coachingCapability = ref<SalesCapabilityKey>('DISCOVERY')
const coachingGoal = ref('')
const coachingActions = ref('')
const coachingSuccess = ref('')
const checkInNote = ref('')
const checkInEvidence = ref('')
const checkInComplete = ref(false)

const focusMember = computed(() => overview.value?.focusMember ?? null)
const focusPlans = computed(() => {
  const member = focusMember.value
  return member
    ? overview.value?.coachingPlans.filter((plan) => plan.memberId === member.id) ?? []
    : []
})
const focusLevelChanges = computed(() => {
  const member = focusMember.value
  return member
    ? overview.value?.levelChanges.filter((change) => change.memberId === member.id) ?? []
    : []
})
const pendingChange = computed(() =>
  focusLevelChanges.value.find((change) => change.status === 'PENDING') ?? null)
const strongestCapability = computed(() => {
  const capabilities = focusMember.value?.capabilities ?? []
  return [...capabilities].sort((left, right) => right.score - left.score)[0] ?? null
})
const growthCapability = computed(() => {
  const capabilities = focusMember.value?.capabilities ?? []
  return [...capabilities].sort((left, right) => left.score - right.score)[0] ?? null
})
const teamInsight = computed(() => {
  const value = overview.value
  if (!value) return ''
  if (value.metrics.pendingLevelChanges > 0) {
    return `${value.metrics.pendingLevelChanges} 个职级申请正在人才校准；团队平均绩效 ${value.metrics.averageScore} 分，建议优先完成证据复核。`
  }
  return `团队目标达成 ${value.metrics.targetAchievementRate.toFixed(1)}%，当前有 ${value.metrics.activeCoachingPlans} 个培养计划在推进。`
})

async function load(focusMemberId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchSalesTeam({
      period: overview.value?.period,
      focusMemberId,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '团队成长中心加载失败'
  } finally {
    loading.value = false
  }
}

onShow(() => {
  if (!overview.value) void load()
})

onPullDownRefresh(async () => {
  await load(focusMember.value?.id)
  uni.stopPullDownRefresh()
})

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(fen / 100)
}

function levelLabel(level: SalesCareerLevel): string {
  const labels: Record<SalesCareerLevel, string> = {
    ASSOCIATE: '初级顾问',
    CONSULTANT: '销售顾问',
    SENIOR: '高级顾问',
    EXPERT: '专家顾问',
    TEAM_LEAD: '团队负责人',
  }
  return labels[level]
}

function ratingLabel(rating: SalesPerformanceRating): string {
  const labels: Record<SalesPerformanceRating, string> = {
    OUTSTANDING: '卓越',
    EXCEEDS: '超预期',
    MEETS: '达标',
    DEVELOPING: '发展中',
    ATTENTION: '需关注',
  }
  return labels[rating]
}

function employmentLabel(status: SalesTeamMemberSummary['employmentStatus']): string {
  if (status === 'PROBATION') return '融入期'
  if (status === 'LEAVE') return '休假'
  return '在职'
}

function capabilityMark(key: SalesCapabilityKey): string {
  const marks: Record<SalesCapabilityKey, string> = {
    DISCOVERY: '洞',
    DIAGNOSIS: '诊',
    PROPOSAL: '案',
    NEGOTIATION: '谈',
    COMPLIANCE: '合',
  }
  return marks[key]
}

function statusLabel(status: SalesLevelChangeSummary['status']): string {
  if (status === 'PENDING') return '人才校准中'
  if (status === 'APPROVED') return '已生效'
  return '未通过'
}

function planStatusLabel(status: SalesCoachingPlanSummary['status']): string {
  if (status === 'ACTIVE') return '进行中'
  if (status === 'COMPLETED') return '已完成'
  return '已取消'
}

function shortDate(value: string | null): string {
  if (!value) return '待安排'
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function progressWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value))}%`
}

function careerIndex(level: SalesCareerLevel): number {
  return ['ASSOCIATE', 'CONSULTANT', 'SENIOR', 'EXPERT', 'TEAM_LEAD'].indexOf(level)
}

function selectMember(member: SalesTeamMemberSummary): void {
  const value = overview.value
  if (!value || busy.value) return
  if (!value.permissions.canViewTeamDetail && member.salesperson.userId !== value.viewer.userId) {
    uni.showToast({ title: '排行仅展示公开绩效，成员详情仅管理者可见', icon: 'none' })
    return
  }
  void load(member.id)
}

function backToTeam(): void {
  if (!overview.value?.permissions.canViewTeamDetail || busy.value) return
  void load(undefined)
}

function openLevelSheet(): void {
  const member = focusMember.value
  if (!member?.career.nextLevel || !overview.value?.permissions.canRequestLevelChange) return
  levelReason.value = member.career.eligible
    ? '结合本周期绩效、目标达成、能力成长与合规证据，申请进入下一职级人才校准'
    : ''
  levelEvidence.value = member.career.evidence.join('\n')
  sheetMode.value = 'LEVEL'
}

function openCoachingSheet(): void {
  const member = focusMember.value
  if (!member || !overview.value?.permissions.canManageCoaching) return
  const growth = growthCapability.value
  coachingCapability.value = growth?.key ?? 'DISCOVERY'
  coachingTitle.value = growth ? `${growth.label}专项提升` : '关键能力专项提升'
  coachingGoal.value = growth
    ? `在未来四周把${growth.label}从 ${growth.score} 分提升到 90 分`
    : ''
  coachingActions.value = '完成 2 次案例复盘\n进行 1 次情景演练\n安排 1 次经理陪访'
  coachingSuccess.value = '连续三次实践抽检平均质量分达到 90'
  sheetMode.value = 'COACHING'
}

function openCheckIn(plan: SalesCoachingPlanSummary): void {
  if (plan.status !== 'ACTIVE' || !overview.value?.permissions.canManageCoaching) return
  selectedPlan.value = plan
  checkInNote.value = ''
  checkInEvidence.value = ''
  checkInComplete.value = false
  sheetMode.value = 'CHECK_IN'
}

function closeSheet(): void {
  if (busy.value) return
  sheetMode.value = null
  selectedPlan.value = null
}

function futureIso(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

async function submitLevelChange(): Promise<void> {
  const member = focusMember.value
  const next = member?.career.nextLevel
  if (!member || !next || busy.value) return
  if (levelReason.value.trim().length < 5 || levelEvidence.value.trim().length < 2) {
    uni.showToast({ title: '请补齐申请理由和校准证据', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await requestLevelChange(member, {
      toLevel: next,
      reason: levelReason.value.trim(),
      evidence: levelEvidence.value.split('\n').map((line) => line.trim()).filter(Boolean),
    })
    closeSheet()
    uni.showToast({ title: '已提交总部人才校准', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '职级申请失败', icon: 'none' })
  } finally {
    busy.value = false
    sheetMode.value = null
  }
}

async function submitCoachingPlan(): Promise<void> {
  const member = focusMember.value
  if (!member || busy.value) return
  const actions = coachingActions.value.split('\n').map((line) => line.trim()).filter(Boolean)
  if (
    coachingTitle.value.trim().length < 3
    || coachingGoal.value.trim().length < 5
    || coachingSuccess.value.trim().length < 5
    || actions.length === 0
  ) {
    uni.showToast({ title: '请补齐培养目标、动作和成功标准', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await createCoachingPlan(member, {
      title: coachingTitle.value.trim(),
      focusCapability: coachingCapability.value,
      goal: coachingGoal.value.trim(),
      actions,
      successMetric: coachingSuccess.value.trim(),
      dueAt: futureIso(30),
      nextSessionAt: futureIso(7, 16),
    })
    closeSheet()
    uni.showToast({ title: '培养计划已创建', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '培养计划创建失败', icon: 'none' })
  } finally {
    busy.value = false
    sheetMode.value = null
  }
}

async function submitCheckIn(): Promise<void> {
  const plan = selectedPlan.value
  if (!plan || busy.value) return
  if (checkInNote.value.trim().length < 3 || checkInEvidence.value.trim().length < 2) {
    uni.showToast({ title: '请填写复盘结论和证据', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await checkInCoachingPlan(plan, {
      note: checkInNote.value.trim(),
      evidence: checkInEvidence.value.split('\n').map((line) => line.trim()).filter(Boolean),
      nextSessionAt: checkInComplete.value ? undefined : futureIso(7, 16),
      complete: checkInComplete.value,
    })
    closeSheet()
    uni.showToast({ title: checkInComplete.value ? '计划已完成归档' : '阶段复盘已留痕', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '培养签到失败', icon: 'none' })
  } finally {
    busy.value = false
    sheetMode.value = null
    selectedPlan.value = null
  }
}

function decide(change: SalesLevelChangeSummary, decision: 'APPROVE' | 'REJECT'): void {
  const member = focusMember.value
  if (!member || busy.value) return
  uni.showModal({
    title: decision === 'APPROVE' ? '确认职级生效' : '确认退回申请',
    content: decision === 'APPROVE'
      ? `${member.salesperson.displayName} 将从${levelLabel(change.fromLevel)}调整为${levelLabel(change.toLevel)}，操作全程留痕。`
      : '申请将退回城市负责人补充培养或绩效证据。',
    confirmText: decision === 'APPROVE' ? '确认生效' : '确认退回',
    success: async (result) => {
      if (!result.confirm) return
      busy.value = true
      try {
        overview.value = await decideLevelChange(
          change,
          member,
          decision,
          decision === 'APPROVE'
            ? '总部人才校准确认绩效、能力与合规证据达到目标职级标准'
            : '当前证据尚不足，退回补充培养成果与连续周期绩效',
        )
        uni.showToast({ title: decision === 'APPROVE' ? '新职级已生效' : '申请已退回', icon: 'success' })
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '审批失败', icon: 'none' })
      } finally {
        busy.value = false
      }
    },
  })
}

function switchWorkspace(
  target: 'TODAY' | 'MERCHANTS' | 'COPILOT' | 'PERFORMANCE' | 'TEAM',
): void {
  if (target === 'TEAM') return
  if (target === 'TODAY') {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  if (target === 'COPILOT') {
    uni.navigateTo({ url: '/pages/copilot/index' })
    return
  }
  uni.navigateTo({
    url: target === 'MERCHANTS' ? '/pages/crm/index' : '/pages/performance/index',
  })
}
</script>

<template>
  <view class="team-page" data-testid="sales-team-page">
    <view class="hero">
      <view class="aurora aurora-one" />
      <view class="aurora aurora-two" />
      <view class="topbar">
        <button class="back" @click="switchWorkspace('TODAY')">‹</button>
        <view class="brand">
          <text>PEOPLE & GROWTH</text>
          <strong>{{ overview?.viewMode === 'TEAM' ? '团队成长' : '我的成长' }}</strong>
        </view>
        <view class="verified"><i /> 绩效已校准</view>
      </view>

      <view v-if="overview" class="hero-main">
        <view class="hero-context">
          <button
            v-if="overview.viewMode === 'TEAM' && overview.focusMember"
            data-testid="back-to-team"
            @click="backToTeam"
          >‹ {{ overview.city.name }}团队 · {{ overview.focusMember.salesperson.displayName }}</button>
          <text v-else>{{ overview.city.name }}销售中心 · {{ overview.period }}</text>
          <span>{{ overview.rankingPolicy.version }}</span>
        </view>

        <view v-if="focusMember" class="person-hero">
          <view class="portrait">{{ focusMember.salesperson.displayName.slice(-1) }}</view>
          <view class="person-copy">
            <view><strong>{{ focusMember.salesperson.displayName }}</strong><i>{{ employmentLabel(focusMember.employmentStatus) }}</i></view>
            <text>{{ focusMember.teamUnitName }} · {{ levelLabel(focusMember.level) }}</text>
            <span>{{ ratingLabel(focusMember.performance.rating) }}绩效 · 团队第 {{ focusMember.performance.rank }} 名</span>
          </view>
          <view class="score-orbit">
            <strong>{{ focusMember.performance.overallScore }}</strong>
            <text>综合分</text>
          </view>
        </view>
        <view v-else class="team-hero">
          <view>
            <text>TEAM PERFORMANCE</text>
            <strong>{{ overview.metrics.averageScore }}<i>分</i></strong>
            <span>团队平均绩效 · {{ overview.metrics.activeMembers }} 位在岗成员</span>
          </view>
          <view class="team-orbit">
            <strong>{{ Math.round(overview.metrics.targetAchievementRate) }}</strong><text>%</text>
            <span>目标达成</span>
          </view>
        </view>

        <view class="hero-metrics">
          <view><strong>{{ overview.metrics.activeMembers }}</strong><text>在岗成员</text></view>
          <view><strong>{{ overview.metrics.activeCoachingPlans }}</strong><text>培养计划</text></view>
          <view><strong :class="{ hot: overview.metrics.pendingLevelChanges }">{{ overview.metrics.pendingLevelChanges }}</strong><text>待校准</text></view>
          <view><strong>{{ overview.metrics.targetAchievementRate.toFixed(1) }}%</strong><text>目标进度</text></view>
        </view>
      </view>
    </view>

    <main v-if="overview" class="content">
      <view class="insight-card">
        <view class="insight-mark">✦</view>
        <view>
          <text>PEOPLE COPILOT</text>
          <strong>{{ teamInsight }}</strong>
          <span>建议只提供校准线索；职级生效仍需人与人审批。</span>
        </view>
        <i>可解释</i>
      </view>

      <template v-if="overview.viewMode === 'TEAM' && !overview.focusMember">
        <view class="section-head">
          <view><text>ORGANIZATION</text><strong>组织脉络</strong></view>
          <span>{{ overview.units.length }} 个组织单元</span>
        </view>
        <view class="org-card">
          <view
            v-for="(unit, index) in overview.units"
            :key="unit.id"
            :class="['org-node', { child: unit.parentId }]"
          >
            <view class="org-rail"><i /><span v-if="index < overview.units.length - 1" /></view>
            <view class="org-mark">{{ unit.kind === 'CITY' ? '城' : '队' }}</view>
            <view class="org-copy">
              <strong>{{ unit.name }}</strong>
              <text>{{ unit.leader?.displayName ?? '待配置负责人' }} · {{ unit.activeMemberCount }} 位成员</text>
            </view>
            <i class="org-state">ACTIVE</i>
          </view>
        </view>

        <view class="section-head ranking-head">
          <view><text>FAIR RANKING</text><strong>团队排行</strong></view>
          <button class="policy-button">规则可解释</button>
        </view>
        <view class="ranking-list">
          <button
            v-for="member in overview.members"
            :key="member.id"
            :data-testid="`team-rank-${member.id}`"
            class="rank-card"
            @click="selectMember(member)"
          >
            <view :class="['rank-number', { champion: member.performance.rank === 1 }]">{{ member.performance.rank }}</view>
            <view class="rank-avatar">{{ member.salesperson.displayName.slice(-1) }}</view>
            <view class="rank-copy">
              <view><strong>{{ member.salesperson.displayName }}</strong><i>{{ levelLabel(member.level) }}</i></view>
              <text>绩效 {{ member.performance.overallScore }} · 合规 {{ member.performance.complianceScore }}</text>
              <view class="rank-progress"><i :style="{ width: progressWidth(member.performance.achievementRate) }" /></view>
            </view>
            <view class="rank-result">
              <strong>{{ member.performance.achievementRate.toFixed(1) }}%</strong>
              <text>¥{{ money(member.performance.performanceFen) }}</text>
            </view>
            <span>›</span>
          </button>
        </view>
        <view class="ranking-policy">
          <i>i</i>
          <view><strong>{{ overview.rankingPolicy.formula }}</strong><text>{{ overview.rankingPolicy.tieBreaker }}；{{ overview.rankingPolicy.complianceGuardrail }}</text></view>
        </view>
      </template>

      <template v-if="focusMember">
        <view class="section-head">
          <view><text>PERFORMANCE SCORECARD</text><strong>五维绩效卡</strong></view>
          <span>{{ ratingLabel(focusMember.performance.rating) }} · {{ overview.period }}</span>
        </view>
        <view class="score-grid">
          <view><i>果</i><strong>{{ focusMember.performance.resultScore }}</strong><text>结果达成</text></view>
          <view><i>机</i><strong>{{ focusMember.performance.pipelineScore }}</strong><text>商机健康</text></view>
          <view><i>程</i><strong>{{ focusMember.performance.processScore }}</strong><text>过程执行</text></view>
          <view><i>质</i><strong>{{ focusMember.performance.qualityScore }}</strong><text>交付质量</text></view>
          <view><i>合</i><strong>{{ focusMember.performance.complianceScore }}</strong><text>合规质量</text></view>
        </view>
        <view class="performance-bridge">
          <view><text>确认业绩</text><strong>¥{{ money(focusMember.performance.performanceFen) }}</strong></view>
          <view><text>目标进度</text><strong>{{ focusMember.performance.achievementRate.toFixed(1) }}%</strong></view>
          <button @click="switchWorkspace('PERFORMANCE')">查看账本 ›</button>
        </view>

        <view class="section-head">
          <view><text>CAPABILITY RADAR</text><strong>能力成长</strong></view>
          <span>{{ strongestCapability ? `${strongestCapability.label}领先` : '待生成' }}</span>
        </view>
        <view class="capability-card">
          <view
            v-for="capability in focusMember.capabilities"
            :key="capability.key"
            class="capability-row"
          >
            <view class="capability-mark">{{ capabilityMark(capability.key) }}</view>
            <view class="capability-copy">
              <view><strong>{{ capability.label }}</strong><text :class="{ up: capability.delta > 0 }">{{ capability.delta > 0 ? `+${capability.delta}` : capability.delta }}</text></view>
              <view class="capability-track"><i :style="{ width: `${capability.score}%` }" /></view>
            </view>
            <strong>{{ capability.score }}</strong>
          </view>
        </view>

        <view class="section-head career-head">
          <view><text>CAREER PATH</text><strong>职级发展</strong></view>
          <button
            v-if="overview.permissions.canRequestLevelChange && focusMember.career.nextLevel && !pendingChange"
            data-testid="request-level-change"
            @click="openLevelSheet"
          >发起校准</button>
        </view>
        <view class="career-card">
          <view class="career-ladder">
            <view
              v-for="level in (['ASSOCIATE','CONSULTANT','SENIOR','EXPERT','TEAM_LEAD'] as SalesCareerLevel[])"
              :key="level"
              :class="['career-step', {
                passed: careerIndex(level) < careerIndex(focusMember.level),
                active: level === focusMember.level,
              }]"
            >
              <i>{{ careerIndex(level) < careerIndex(focusMember.level) ? '✓' : careerIndex(level) + 1 }}</i>
              <text>{{ levelLabel(level) }}</text>
            </view>
          </view>
          <view class="career-decision">
            <view :class="['decision-mark', { ready: focusMember.career.eligible }]">{{ focusMember.career.eligible ? '↑' : '育' }}</view>
            <view>
              <text>{{ focusMember.career.eligible ? '已进入晋升建议线' : '建议继续完成培养闭环' }}</text>
              <strong>{{ focusMember.career.nextLevel ? `下一站 · ${levelLabel(focusMember.career.nextLevel)}` : '已到达当前职级顶端' }}</strong>
              <span>{{ focusMember.career.evidence.join(' · ') }}</span>
            </view>
          </view>
        </view>

        <view v-if="pendingChange" class="pending-card" data-testid="pending-level-change">
          <view class="pending-icon">校</view>
          <view>
            <text>{{ statusLabel(pendingChange.status) }} · {{ pendingChange.requestedBy.displayName }}</text>
            <strong>{{ levelLabel(pendingChange.fromLevel) }} → {{ levelLabel(pendingChange.toLevel) }}</strong>
            <span>{{ pendingChange.reason }}</span>
          </view>
          <view v-if="overview.permissions.canApproveLevelChange" class="decision-actions">
            <button @click="decide(pendingChange, 'REJECT')">退回</button>
            <button class="approve" @click="decide(pendingChange, 'APPROVE')">通过</button>
          </view>
          <i v-else>等待总部</i>
        </view>

        <view class="section-head">
          <view><text>COACHING LOOP</text><strong>培养计划</strong></view>
          <button
            v-if="overview.permissions.canManageCoaching"
            data-testid="create-coaching-plan"
            @click="openCoachingSheet"
          >＋ 新建计划</button>
        </view>
        <view v-if="focusPlans.length" class="plan-list">
          <button
            v-for="plan in focusPlans"
            :key="plan.id"
            :class="['plan-card', { completed: plan.status === 'COMPLETED' }]"
            @click="openCheckIn(plan)"
          >
            <view class="plan-top">
              <view class="plan-mark">{{ capabilityMark(plan.focusCapability) }}</view>
              <view><text>{{ planStatusLabel(plan.status) }} · {{ plan.coach.displayName }}</text><strong>{{ plan.title }}</strong></view>
              <i>{{ shortDate(plan.dueAt) }}</i>
            </view>
            <p>{{ plan.goal }}</p>
            <view class="action-chips"><text v-for="action in plan.actions" :key="action">{{ action }}</text></view>
            <view class="plan-foot">
              <view><text>最近复盘</text><strong>{{ plan.latestNote ?? '尚未签到' }}</strong></view>
              <span>{{ plan.status === 'ACTIVE' ? `${shortDate(plan.nextSessionAt)} 下次辅导` : '证据已归档' }}</span>
            </view>
          </button>
        </view>
        <view v-else class="empty-plan"><i>育</i><strong>还没有培养计划</strong><text>从能力短板创建一个可跟踪、可复盘的成长闭环。</text></view>

        <template v-if="focusLevelChanges.length">
          <view class="section-head">
            <view><text>CAREER EVIDENCE</text><strong>职级记录</strong></view>
            <span>只追加事件</span>
          </view>
          <view class="history-list">
            <view v-for="change in focusLevelChanges" :key="change.requestId" class="history-row">
              <view class="history-rail"><i /><span /></view>
              <view>
                <text>{{ statusLabel(change.status) }} · {{ shortDate(change.requestedAt) }}</text>
                <strong>{{ levelLabel(change.fromLevel) }} → {{ levelLabel(change.toLevel) }}</strong>
                <span>{{ change.decisionReason ?? change.reason }}</span>
              </view>
              <i :class="change.status.toLowerCase()">{{ change.status === 'APPROVED' ? '✓' : change.status === 'PENDING' ? '…' : '×' }}</i>
            </view>
          </view>
        </template>
      </template>
    </main>

    <view v-else-if="loading" class="state-card">
      <view>✦</view><text>正在校准组织、绩效与培养证据…</text>
    </view>
    <view v-else class="state-card">
      <strong>团队成长中心暂时不可用</strong><text>{{ errorMessage }}</text><button @click="load()">重新加载</button>
    </view>

    <nav class="bottom-nav">
      <button @click="switchWorkspace('TODAY')"><i>今</i><text>今日</text></button>
      <button @click="switchWorkspace('MERCHANTS')"><i>商</i><text>商家</text></button>
      <button @click="switchWorkspace('COPILOT')"><i>✦</i><text>AI</text></button>
      <button @click="switchWorkspace('PERFORMANCE')"><i>绩</i><text>业绩</text></button>
      <button class="active" @click="switchWorkspace('TEAM')"><i>队</i><text>团队</text></button>
    </nav>

    <view v-if="sheetMode" class="sheet-layer" @click.self="closeSheet">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text>{{
              sheetMode === 'LEVEL'
                ? 'TALENT CALIBRATION'
                : sheetMode === 'COACHING'
                  ? 'COACHING BLUEPRINT'
                  : 'COACHING CHECK-IN'
            }}</text>
            <strong>{{
              sheetMode === 'LEVEL'
                ? '发起职级人才校准'
                : sheetMode === 'COACHING'
                  ? '创建培养计划'
                  : '记录阶段复盘'
            }}</strong>
          </view>
          <button @click="closeSheet">×</button>
        </view>

        <template v-if="sheetMode === 'LEVEL' && focusMember?.career.nextLevel">
          <view class="transition-preview">
            <view><text>当前</text><strong>{{ levelLabel(focusMember.level) }}</strong></view>
            <i>→</i>
            <view><text>申请</text><strong>{{ levelLabel(focusMember.career.nextLevel) }}</strong></view>
          </view>
          <label><text>申请理由</text><textarea v-model="levelReason" maxlength="500" /></label>
          <label><text>人才校准证据 · 每行一条</text><textarea v-model="levelEvidence" maxlength="1000" /></label>
          <view class="integrity-note"><i>盾</i><text>提交只会追加申请事件，不会直接改变职级；总部人才校准通过后才生效。</text></view>
          <button class="primary-action" :disabled="busy" @click="submitLevelChange">{{ busy ? '提交中…' : '强确认并提交校准' }}</button>
        </template>

        <template v-else-if="sheetMode === 'COACHING'">
          <label><text>计划名称</text><input v-model="coachingTitle" maxlength="120" /></label>
          <view class="capability-picker">
            <button
              v-for="capability in focusMember?.capabilities ?? []"
              :key="capability.key"
              :class="{ active: coachingCapability === capability.key }"
              @click="coachingCapability = capability.key"
            ><i>{{ capabilityMark(capability.key) }}</i><text>{{ capability.label }}</text><strong>{{ capability.score }}</strong></button>
          </view>
          <label><text>培养目标</text><textarea v-model="coachingGoal" maxlength="500" /></label>
          <label><text>行动清单 · 每行一项</text><textarea v-model="coachingActions" maxlength="1000" /></label>
          <label><text>成功标准</text><input v-model="coachingSuccess" maxlength="300" /></label>
          <view class="integrity-note"><i>30</i><text>默认 30 天培养周期，7 天后安排第一次阶段复盘。</text></view>
          <button class="primary-action" :disabled="busy" @click="submitCoachingPlan">{{ busy ? '创建中…' : '创建可追踪培养计划' }}</button>
        </template>

        <template v-else-if="sheetMode === 'CHECK_IN' && selectedPlan">
          <view class="sheet-plan">
            <i>{{ capabilityMark(selectedPlan.focusCapability) }}</i>
            <view><text>{{ selectedPlan.coach.displayName }} · v{{ selectedPlan.version }}</text><strong>{{ selectedPlan.title }}</strong></view>
          </view>
          <label><text>阶段复盘结论</text><textarea v-model="checkInNote" maxlength="500" /></label>
          <label><text>证据 · 每行一条</text><textarea v-model="checkInEvidence" maxlength="1000" /></label>
          <button :class="['complete-toggle', { active: checkInComplete }]" @click="checkInComplete = !checkInComplete">
            <i>{{ checkInComplete ? '✓' : '' }}</i><view><strong>本次完成培养计划</strong><text>{{ checkInComplete ? '提交后归档，不再安排下次辅导' : '继续推进，自动安排 7 天后复盘' }}</text></view>
          </button>
          <button class="primary-action" :disabled="busy" @click="submitCheckIn">{{ busy ? '提交中…' : checkInComplete ? '完成并归档计划' : '保存阶段复盘' }}</button>
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped>
:global(page){background:#f2f3f7;color:#1d1f2b;font-family:"PingFang SC","Microsoft YaHei",sans-serif}:global(button){box-sizing:border-box;margin:0;padding:0;border:0;line-height:1.25}.team-page{min-height:100vh;padding-bottom:72px;background:linear-gradient(180deg,#eff0f5 0,#f6f6f8 430px,#f2f3f7 100%)}.hero{position:relative;overflow:hidden;padding:calc(env(safe-area-inset-top) + 11px) 16px 31px;border-radius:0 0 36px 36px;background:linear-gradient(145deg,#111729 0,#202846 58%,#3b3155 100%);color:#fff}.hero::after{position:absolute;right:-128px;bottom:-166px;width:320px;height:320px;border:1px solid rgba(255,255,255,.06);border-radius:50%;box-shadow:0 0 0 38px rgba(255,255,255,.02),0 0 0 82px rgba(255,255,255,.014);content:""}.aurora{position:absolute;border-radius:50%;filter:blur(3px)}.aurora-one{top:-90px;right:-50px;width:230px;height:230px;background:radial-gradient(circle,rgba(124,100,255,.31),transparent 68%)}.aurora-two{bottom:-80px;left:-75px;width:220px;height:220px;background:radial-gradient(circle,rgba(71,217,181,.17),transparent 68%)}.topbar{position:relative;z-index:2;display:flex;height:44px;align-items:center}.back{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.05);color:#fff;font-size:24px}.brand{min-width:0;flex:1;margin-left:10px}.brand text,.brand strong{display:block}.brand text{color:#8ee6d0;font-size:6px;font-weight:900;letter-spacing:.17em}.brand strong{margin-top:3px;font-size:15px}.verified{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid rgba(255,255,255,.08);border-radius:99px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.58);font-size:6px}.verified i{width:5px;height:5px;border-radius:50%;background:#6fe0bf;box-shadow:0 0 0 4px rgba(111,224,191,.08)}.hero-main{position:relative;z-index:2}.hero-context{display:flex;align-items:center;margin-top:18px}.hero-context>text,.hero-context>button{flex:1;background:transparent;color:rgba(255,255,255,.45);font-size:7px;text-align:left}.hero-context>button{color:#a9a0ff}.hero-context span{padding:5px 7px;border-radius:7px;background:rgba(255,255,255,.055);color:rgba(255,255,255,.36);font-size:5px}.person-hero{display:flex;align-items:center;margin-top:14px}.portrait{display:flex;width:57px;height:57px;flex:0 0 57px;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.14);border-radius:19px 19px 19px 7px;background:linear-gradient(145deg,#7b69e9,#d66d86);box-shadow:0 12px 25px rgba(13,16,35,.22);font-size:21px;font-weight:950}.person-copy{min-width:0;flex:1;margin-left:12px}.person-copy>view{display:flex;align-items:center;gap:7px}.person-copy strong{font-size:18px}.person-copy i{padding:4px 6px;border-radius:7px;background:rgba(117,226,193,.11);color:#83e3c7;font-size:6px;font-style:normal}.person-copy>text,.person-copy>span{display:block}.person-copy>text{margin-top:6px;color:rgba(255,255,255,.62);font-size:8px}.person-copy>span{margin-top:5px;color:rgba(255,255,255,.34);font-size:6px}.score-orbit{display:flex;width:58px;height:58px;flex:0 0 58px;flex-direction:column;align-items:center;justify-content:center;border:3px solid rgba(255,255,255,.08);border-top-color:#8ee5cf;border-right-color:#a28df6;border-radius:50%;transform:rotate(10deg)}.score-orbit strong,.score-orbit text{transform:rotate(-10deg)}.score-orbit strong{font-family:Georgia,serif;font-size:19px}.score-orbit text{margin-top:2px;color:rgba(255,255,255,.39);font-size:5px}.team-hero{display:flex;align-items:center;margin-top:16px}.team-hero>view:first-child{flex:1}.team-hero text,.team-hero strong,.team-hero span{display:block}.team-hero>view:first-child text{color:#9185f2;font-size:6px;font-weight:900;letter-spacing:.16em}.team-hero>view:first-child strong{margin-top:4px;font-family:Georgia,serif;font-size:38px}.team-hero>view:first-child strong i{margin-left:3px;color:rgba(255,255,255,.48);font-family:inherit;font-size:10px;font-style:normal}.team-hero>view:first-child span{margin-top:5px;color:rgba(255,255,255,.39);font-size:7px}.team-orbit{display:flex;width:76px;height:76px;flex-direction:column;align-items:center;justify-content:center;border:5px solid rgba(255,255,255,.07);border-top-color:#78dfc2;border-right-color:#9a88ef;border-radius:50%;transform:rotate(13deg)}.team-orbit strong,.team-orbit text,.team-orbit span{transform:rotate(-13deg)}.team-orbit strong{display:inline;font-size:20px}.team-orbit text{display:inline;margin:-18px 0 0 28px;color:#8fe3cb;font-size:7px}.team-orbit span{margin-top:7px;color:rgba(255,255,255,.36);font-size:5px}.hero-metrics{display:grid;grid-template-columns:repeat(4,1fr);margin-top:19px;padding-top:14px;border-top:1px solid rgba(255,255,255,.075)}.hero-metrics view{border-right:1px solid rgba(255,255,255,.06);text-align:center}.hero-metrics view:last-child{border:0}.hero-metrics strong,.hero-metrics text{display:block}.hero-metrics strong{font-size:13px}.hero-metrics strong.hot{color:#ff9d9f}.hero-metrics text{margin-top:4px;color:rgba(255,255,255,.38);font-size:6px}.content{padding:0 16px 28px}.insight-card{position:relative;z-index:3;display:flex;gap:10px;align-items:flex-start;margin-top:-13px;padding:14px;border:1px solid rgba(30,33,49,.05);border-radius:20px;background:#fff;box-shadow:0 13px 30px rgba(28,31,48,.075)}.insight-mark{display:flex;width:34px;height:34px;flex:0 0 34px;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(145deg,#7763dd,#e77891);box-shadow:0 8px 18px rgba(109,87,210,.2);color:#fff;font-size:12px}.insight-card>view:nth-child(2){min-width:0;flex:1}.insight-card text,.insight-card strong,.insight-card span{display:block}.insight-card text{color:#735ed7;font-size:6px;font-weight:900;letter-spacing:.13em}.insight-card strong{margin-top:5px;font-size:8px;line-height:1.65}.insight-card span{margin-top:4px;color:#a0a2ac;font-size:6px}.insight-card>i{padding:5px 7px;border-radius:7px;background:#eeebff;color:#6956c8;font-size:5px;font-style:normal}.section-head{display:flex;align-items:flex-end;margin:24px 2px 10px}.section-head>view{flex:1}.section-head text,.section-head strong{display:block}.section-head text{color:#a1a3ae;font-size:6px;font-weight:900;letter-spacing:.17em}.section-head strong{margin-top:3px;font-size:15px}.section-head>span,.section-head>button{color:#8f919c;font-size:7px}.section-head>button{padding:7px 9px;border:1px solid #e1e2e8;border-radius:9px;background:#fff;color:#6652c9;font-weight:850}.org-card{padding:9px 13px;border:1px solid rgba(31,34,50,.05);border-radius:20px;background:#fff;box-shadow:0 9px 25px rgba(34,37,54,.045)}.org-node{display:flex;min-height:58px;align-items:center}.org-node.child{padding-left:24px}.org-rail{position:relative;width:18px;align-self:stretch}.org-rail i{position:absolute;top:25px;left:5px;z-index:1;width:7px;height:7px;border:2px solid #f3f1ff;border-radius:50%;background:#7964dd}.org-rail span{position:absolute;top:31px;bottom:-27px;left:9px;width:1px;background:#ddd9f0}.org-mark{display:flex;width:33px;height:33px;align-items:center;justify-content:center;border-radius:11px;background:linear-gradient(145deg,#262b48,#4c4a75);color:#fff;font-size:8px;font-weight:900}.child .org-mark{background:linear-gradient(145deg,#7764db,#a18ceb)}.org-copy{flex:1;margin-left:10px}.org-copy strong,.org-copy text{display:block}.org-copy strong{font-size:9px}.org-copy text{margin-top:4px;color:#9a9ca6;font-size:6px}.org-state{padding:4px 5px;border-radius:6px;background:#eaf8f3;color:#168a6d;font-size:5px;font-style:normal}.ranking-head{margin-top:26px}.policy-button{border:0!important;background:#ece9ff!important}.ranking-list{display:grid;gap:9px}.rank-card{display:flex;width:100%;align-items:center;padding:12px;border:1px solid rgba(31,34,50,.05);border-radius:18px;background:#fff;box-shadow:0 8px 23px rgba(33,36,54,.045);color:#1d1f2b;text-align:left}.rank-number{width:20px;color:#b1b2ba;font-family:Georgia,serif;font-size:11px}.rank-number.champion{color:#e7a93a}.rank-avatar{display:flex;width:36px;height:36px;flex:0 0 36px;align-items:center;justify-content:center;border-radius:12px 12px 12px 4px;background:linear-gradient(145deg,#25283f,#656080);color:#fff;font-size:11px;font-weight:900}.rank-copy{min-width:0;flex:1;margin-left:9px}.rank-copy>view:first-child{display:flex;align-items:center;gap:6px}.rank-copy strong{font-size:9px}.rank-copy>view:first-child i{padding:3px 5px;border-radius:6px;background:#f1efff;color:#6755ca;font-size:5px;font-style:normal}.rank-copy>text{display:block;margin-top:4px;color:#999ba6;font-size:6px}.rank-progress{height:3px;margin-top:7px;overflow:hidden;border-radius:99px;background:#f0f0f4}.rank-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6f5bd5,#e58494)}.rank-result{margin-left:9px;text-align:right}.rank-result strong,.rank-result text{display:block}.rank-result strong{font-size:11px}.rank-result text{margin-top:4px;color:#989aa5;font-size:6px}.rank-card>span{margin-left:7px;color:#b4b5bd;font-size:17px}.ranking-policy{display:flex;gap:9px;margin-top:11px;padding:12px;border-radius:15px;background:#e9f3f0}.ranking-policy>i{display:flex;width:22px;height:22px;flex:0 0 22px;align-items:center;justify-content:center;border-radius:7px;background:#16886d;color:#fff;font-size:8px;font-style:normal;font-weight:900}.ranking-policy strong,.ranking-policy text{display:block}.ranking-policy strong{color:#436e63;font-size:7px;line-height:1.5}.ranking-policy text{margin-top:3px;color:#829a94;font-size:6px;line-height:1.55}.score-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.score-grid>view{padding:11px 3px;border:1px solid rgba(31,34,50,.05);border-radius:15px;background:#fff;text-align:center;box-shadow:0 7px 18px rgba(36,39,56,.035)}.score-grid i{display:flex;width:25px;height:25px;align-items:center;justify-content:center;margin:0 auto;border-radius:9px;background:#f0edff;color:#6752c8;font-size:7px;font-style:normal;font-weight:900}.score-grid strong,.score-grid text{display:block}.score-grid strong{margin-top:7px;font-family:Georgia,serif;font-size:15px}.score-grid text{margin-top:3px;color:#a1a3ad;font-size:5px}.performance-bridge{display:flex;align-items:center;margin-top:9px;padding:13px;border-radius:17px;background:linear-gradient(135deg,#1e2339,#302c4d);color:#fff}.performance-bridge>view{flex:1}.performance-bridge text,.performance-bridge strong{display:block}.performance-bridge text{color:rgba(255,255,255,.38);font-size:6px}.performance-bridge strong{margin-top:4px;font-size:12px}.performance-bridge button{padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.08);color:#a9e6d5;font-size:6px}.capability-card{display:grid;gap:12px;padding:16px;border:1px solid rgba(31,34,50,.05);border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(33,36,53,.04)}.capability-row{display:flex;align-items:center}.capability-mark{display:flex;width:29px;height:29px;flex:0 0 29px;align-items:center;justify-content:center;border-radius:10px;background:#f0edff;color:#6552c7;font-size:7px;font-weight:900}.capability-copy{min-width:0;flex:1;margin-left:9px}.capability-copy>view:first-child{display:flex;justify-content:space-between}.capability-copy strong{font-size:7px}.capability-copy text{color:#a5a6ae;font-size:6px}.capability-copy text.up{color:#159171}.capability-track{height:4px;margin-top:7px;overflow:hidden;border-radius:99px;background:#f0f0f4}.capability-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#725dda,#9f88ec)}.capability-row>strong{width:28px;margin-left:8px;font-family:Georgia,serif;font-size:13px;text-align:right}.career-card{overflow:hidden;border:1px solid rgba(31,34,50,.05);border-radius:21px;background:#fff;box-shadow:0 9px 25px rgba(33,36,53,.04)}.career-ladder{display:grid;grid-template-columns:repeat(5,1fr);padding:17px 8px 14px}.career-step{position:relative;text-align:center}.career-step::after{position:absolute;top:11px;left:61%;width:78%;height:1px;background:#e4e4e9;content:""}.career-step:last-child::after{display:none}.career-step i{position:relative;z-index:1;display:flex;width:22px;height:22px;align-items:center;justify-content:center;margin:0 auto;border:2px solid #e4e4e9;border-radius:50%;background:#fff;color:#b0b1ba;font-size:6px;font-style:normal;font-weight:900}.career-step text{display:block;margin-top:7px;color:#aaaab3;font-size:5px;white-space:nowrap}.career-step.passed i{border-color:#88d8c2;background:#e5f7f2;color:#15876a}.career-step.passed::after{background:#a7dfd0}.career-step.active i{border-color:#6f59d0;background:#6f59d0;box-shadow:0 0 0 5px #eeeaff;color:#fff}.career-step.active text{color:#5548aa;font-weight:900}.career-decision{display:flex;gap:10px;align-items:flex-start;padding:13px;border-top:1px solid #f0f0f3;background:linear-gradient(120deg,#faf9ff,#fff)}.decision-mark{display:flex;width:34px;height:34px;flex:0 0 34px;align-items:center;justify-content:center;border-radius:11px;background:#f0eff4;color:#777983;font-size:11px;font-weight:900}.decision-mark.ready{background:#e6f7f2;color:#14876a}.career-decision>view:last-child{min-width:0}.career-decision text,.career-decision strong,.career-decision span{display:block}.career-decision text{color:#6e59ce;font-size:6px;font-weight:900}.career-decision strong{margin-top:4px;font-size:9px}.career-decision span{margin-top:5px;color:#9a9ba6;font-size:6px;line-height:1.5}.pending-card{display:flex;gap:10px;align-items:center;margin-top:10px;padding:13px;border:1px solid #eee6c9;border-radius:17px;background:#fffaf0}.pending-icon{display:flex;width:34px;height:34px;flex:0 0 34px;align-items:center;justify-content:center;border-radius:11px;background:#f3cb70;color:#704c0c;font-size:7px;font-weight:900}.pending-card>view:nth-child(2){min-width:0;flex:1}.pending-card text,.pending-card strong,.pending-card span{display:block}.pending-card text{color:#aa7c22;font-size:6px}.pending-card strong{margin-top:4px;font-size:9px}.pending-card span{margin-top:4px;color:#a39272;font-size:6px;line-height:1.45}.pending-card>i{padding:5px 7px;border-radius:7px;background:#fff2cd;color:#9a6b14;font-size:5px;font-style:normal}.decision-actions{display:flex;gap:5px}.decision-actions button{padding:7px;border-radius:8px;background:#f3ead6;color:#8b6721;font-size:6px}.decision-actions button.approve{background:#217e68;color:#fff}.plan-list{display:grid;gap:10px}.plan-card{display:block;width:100%;padding:14px;border:1px solid rgba(31,34,50,.05);border-radius:20px;background:#fff;box-shadow:0 8px 23px rgba(33,36,53,.04);color:#1d1f2b;text-align:left}.plan-card.completed{opacity:.72}.plan-top{display:flex;align-items:center}.plan-mark{display:flex;width:35px;height:35px;flex:0 0 35px;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(145deg,#7661db,#a68fec);color:#fff;font-size:8px;font-weight:900}.plan-top>view:nth-child(2){min-width:0;flex:1;margin-left:9px}.plan-top text,.plan-top strong{display:block}.plan-top text{color:#725dce;font-size:6px}.plan-top strong{margin-top:4px;font-size:10px}.plan-top>i{padding:5px 6px;border-radius:7px;background:#f2f1f6;color:#868893;font-size:5px;font-style:normal}.plan-card>p{margin:11px 0 0;color:#60616c;font-size:7px;line-height:1.65}.action-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.action-chips text{padding:5px 6px;border-radius:7px;background:#f4f3f8;color:#757680;font-size:5px}.plan-foot{display:flex;align-items:flex-end;margin-top:11px;padding-top:10px;border-top:1px solid #f0f0f3}.plan-foot>view{min-width:0;flex:1}.plan-foot text,.plan-foot strong{display:block}.plan-foot text{color:#a0a1aa;font-size:5px}.plan-foot strong{overflow:hidden;margin-top:3px;color:#70717b;font-size:6px;text-overflow:ellipsis;white-space:nowrap}.plan-foot span{margin-left:8px;color:#16886d;font-size:5px}.empty-plan{display:flex;min-height:145px;flex-direction:column;align-items:center;justify-content:center;border:1px dashed #dddde5;border-radius:20px;background:#fff;text-align:center}.empty-plan i{display:flex;width:38px;height:38px;align-items:center;justify-content:center;border-radius:13px;background:#eeeaff;color:#6654c5;font-size:10px;font-style:normal;font-weight:900}.empty-plan strong{margin-top:9px;font-size:10px}.empty-plan text{max-width:230px;margin-top:5px;color:#9b9ca6;font-size:6px;line-height:1.5}.history-list{padding:5px 12px;border-radius:19px;background:#fff}.history-row{display:flex;min-height:78px;align-items:flex-start;padding-top:13px}.history-rail{position:relative;width:21px;align-self:stretch}.history-rail>i{position:absolute;top:5px;left:4px;z-index:1;width:8px;height:8px;border:3px solid #f0edff;border-radius:50%;background:#6d58cd}.history-rail span{position:absolute;top:15px;bottom:-5px;left:9px;width:1px;background:#e0ddeb}.history-row:last-child .history-rail span{display:none}.history-row>view:nth-child(2){min-width:0;flex:1}.history-row text,.history-row strong,.history-row span{display:block}.history-row text{color:#9b9da7;font-size:6px}.history-row strong{margin-top:4px;font-size:9px}.history-row span{margin-top:5px;color:#81838d;font-size:6px;line-height:1.45}.history-row>i{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:8px;background:#eeeaff;color:#6855c6;font-size:8px;font-style:normal;font-weight:900}.history-row>i.approved{background:#e6f7f2;color:#148469}.history-row>i.rejected{background:#fff0f0;color:#c6535b}.state-card{display:flex;min-height:72vh;flex-direction:column;align-items:center;justify-content:center;gap:11px;color:#858792;font-size:9px}.state-card>view{display:flex;width:53px;height:53px;align-items:center;justify-content:center;border-radius:18px;background:#6955cf;box-shadow:0 12px 25px rgba(91,74,192,.25);color:#fff;font-size:17px}.state-card strong{color:#2a2b38;font-size:14px}.state-card button{padding:10px 17px;border-radius:11px;background:#25273d;color:#fff;font-size:8px}.bottom-nav{position:fixed;z-index:30;right:0;bottom:0;left:0;display:grid;grid-template-columns:repeat(5,1fr);padding:7px 11px calc(7px + env(safe-area-inset-bottom));border-top:1px solid rgba(34,35,50,.07);background:rgba(255,255,255,.94);box-shadow:0 -10px 28px rgba(22,23,37,.07);backdrop-filter:blur(16px)}.bottom-nav button{display:flex;height:50px;flex-direction:column;align-items:center;justify-content:center;border-radius:14px;background:transparent;color:#9b9ca6}.bottom-nav i,.bottom-nav text{display:block}.bottom-nav i{font-size:11px;font-style:normal;font-weight:950}.bottom-nav text{margin-top:4px;font-size:6px;font-weight:850}.bottom-nav button.active{background:#f0eefc;color:#5c50ca}.sheet-layer{position:fixed;z-index:50;inset:0;display:flex;align-items:flex-end;background:rgba(8,9,22,.57)}.action-sheet{width:100%;max-height:88vh;overflow-y:auto;padding:9px 19px calc(22px + env(safe-area-inset-bottom));border-radius:29px 29px 0 0;background:#fff}.sheet-handle{width:40px;height:4px;margin:0 auto 17px;border-radius:99px;background:#dddde4}.sheet-head{display:flex;align-items:flex-start;justify-content:space-between}.sheet-head text,.sheet-head strong{display:block}.sheet-head text{color:#6651c8;font-size:6px;font-weight:900;letter-spacing:.14em}.sheet-head strong{margin-top:4px;font-size:20px;font-weight:950}.sheet-head>button{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:11px;background:#f1f1f5;color:#696a75;font-size:19px}.transition-preview{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin-top:16px;padding:14px;border-radius:17px;background:linear-gradient(135deg,#f1efff,#fff6f6)}.transition-preview view{text-align:center}.transition-preview text,.transition-preview strong{display:block}.transition-preview text{color:#9a96ad;font-size:6px}.transition-preview strong{margin-top:5px;font-size:10px}.transition-preview>i{color:#7661d6;font-size:17px;font-style:normal}.action-sheet label{display:block;margin-top:14px}.action-sheet label>text{display:block;margin:0 0 6px 2px;color:#62636e;font-size:8px;font-weight:850}.action-sheet input,.action-sheet textarea{box-sizing:border-box;width:100%;border:1px solid #e0e1e7;border-radius:13px;background:#f9f9fb;font-size:9px}.action-sheet input{height:44px;padding:0 11px}.action-sheet textarea{height:88px;padding:10px;line-height:1.6}.integrity-note{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:11px;border-radius:12px;background:#f3f4f7;color:#777984;font-size:7px;line-height:1.5}.integrity-note i{display:flex;width:23px;height:23px;flex:0 0 23px;align-items:center;justify-content:center;border-radius:7px;background:#6555bf;color:#fff;font-size:6px;font-style:normal;font-weight:900}.primary-action{width:100%;height:51px;margin-top:15px;border-radius:15px;background:linear-gradient(135deg,#705bd2,#4c3da4);box-shadow:0 13px 25px rgba(87,68,184,.2);color:#fff;font-size:10px;font-weight:900}.primary-action[disabled]{opacity:.6}.capability-picker{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:15px}.capability-picker button{padding:8px 2px;border:1px solid #e4e3e9;border-radius:11px;background:#fafafd;color:#777984}.capability-picker i,.capability-picker text,.capability-picker strong{display:block}.capability-picker i{display:flex;width:23px;height:23px;align-items:center;justify-content:center;margin:0 auto;border-radius:8px;background:#eeeafc;color:#6754c7;font-size:6px;font-style:normal;font-weight:900}.capability-picker text{margin-top:5px;font-size:5px}.capability-picker strong{margin-top:3px;font-size:8px}.capability-picker button.active{border-color:#6b56cc;background:#f0edff;color:#5545af}.sheet-plan{display:flex;align-items:center;margin-top:15px;padding:13px;border-radius:16px;background:linear-gradient(135deg,#f1efff,#fff)}.sheet-plan>i{display:flex;width:37px;height:37px;align-items:center;justify-content:center;border-radius:12px;background:#6854c7;color:#fff;font-size:8px;font-style:normal;font-weight:900}.sheet-plan>view{margin-left:9px}.sheet-plan text,.sheet-plan strong{display:block}.sheet-plan text{color:#8d88a1;font-size:6px}.sheet-plan strong{margin-top:4px;font-size:9px}.complete-toggle{display:flex;width:100%;gap:9px;align-items:center;margin-top:12px;padding:12px;border:1px solid #e2e2e8;border-radius:14px;background:#fafafd;color:#6f707a;text-align:left}.complete-toggle>i{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border:2px solid #d8d8df;border-radius:8px;background:#fff;color:#fff;font-size:8px;font-style:normal}.complete-toggle strong,.complete-toggle text{display:block}.complete-toggle strong{font-size:8px}.complete-toggle text{margin-top:4px;color:#9c9da6;font-size:6px}.complete-toggle.active{border-color:#85cdb9;background:#ecf8f4;color:#1a725d}.complete-toggle.active>i{border-color:#16886b;background:#16886b}@media (min-width:680px){.hero,.content{max-width:720px;margin:0 auto}.bottom-nav{right:50%;left:50%;width:520px;transform:translateX(-50%)}.action-sheet{max-width:520px;margin:0 auto}}
</style>
