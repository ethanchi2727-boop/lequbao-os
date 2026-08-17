<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  SalesNextBestActionSummary,
  SalesOpportunitySummary,
  SalesTaskPriority,
  SalesTaskSummary,
  SalesWorkbenchOverview,
} from '@lequ/contracts'
import {
  completeSalesTask,
  fetchSalesWorkbench,
  snoozeSalesTask,
} from '../../services/sales'

type TaskFilter = 'ALL' | 'OVERDUE' | 'TODAY' | 'SNOOZED'
type ActionMode = 'COMPLETE' | 'SNOOZE' | null
type SnoozePreset = 'TOMORROW' | 'THREE_DAYS' | 'NEXT_WEEK'

const overview = ref<SalesWorkbenchOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const activeFilter = ref<TaskFilter>('ALL')
const actionMode = ref<ActionMode>(null)
const selectedTask = ref<SalesTaskSummary | null>(null)
const completionNote = ref('')
const snoozeReason = ref('')
const snoozePreset = ref<SnoozePreset>('TOMORROW')

const filters: Array<{ key: TaskFilter; label: string }> = [
  { key: 'ALL', label: '全部待办' },
  { key: 'OVERDUE', label: '已逾期' },
  { key: 'TODAY', label: '今天' },
  { key: 'SNOOZED', label: '稍后提醒' },
]

const activeTasks = computed(() =>
  overview.value?.tasks.filter((task) => task.status !== 'DONE') ?? [],
)
const visibleTasks = computed(() => activeTasks.value.filter((task) => {
  if (activeFilter.value === 'ALL') return true
  if (activeFilter.value === 'SNOOZED') return task.status === 'SNOOZED'
  const due = Date.parse(task.dueAt)
  if (activeFilter.value === 'OVERDUE') return due < Date.now()
  const today = new Date()
  return new Date(task.dueAt).toDateString() === today.toDateString()
}))
const topSuggestion = computed<SalesNextBestActionSummary | null>(
  () => overview.value?.nextBestActions[0] ?? null,
)
const topOpportunity = computed<SalesOpportunitySummary | null>(() => {
  const suggestion = topSuggestion.value
  if (!suggestion) return null
  return overview.value?.focusOpportunities.find(
    (item) => item.lead.id === suggestion.leadId,
  ) ?? null
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchSalesWorkbench()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '销售工作台加载失败'
  } finally {
    loading.value = false
  }
}

onShow(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(fen / 100)
}

function priorityLabel(priority: SalesTaskPriority): string {
  if (priority === 'CRITICAL') return '紧急'
  if (priority === 'HIGH') return '高优先'
  if (priority === 'MEDIUM') return '常规'
  return '低优先'
}

function stageLabel(stage: SalesOpportunitySummary['lead']['stage']): string {
  const labels: Record<SalesOpportunitySummary['lead']['stage'], string> = {
    NEW: '新线索',
    DIAGNOSED: '已体检',
    CONTRACT_DRAFT: '待签约',
    SIGNED: '已签约',
    ASSET_REVIEW: '资料确认',
    READY_FOR_DELIVERY: '交付就绪',
    LOST: '已关闭',
  }
  return labels[stage]
}

function taskKindLabel(task: SalesTaskSummary): string {
  const labels: Record<SalesTaskSummary['kind'], string> = {
    FOLLOW_UP: '跟进',
    DIAGNOSIS: '体检',
    CONTRACT: '签约',
    ASSET: '资料',
    HANDOFF: '交付',
    REMINDER: '提醒',
  }
  return labels[task.kind]
}

function dueLabel(value: string): string {
  const due = new Date(value)
  const differenceMinutes = Math.round((due.getTime() - Date.now()) / 60000)
  if (differenceMinutes < -60) return `已逾期 ${Math.ceil(Math.abs(differenceMinutes) / 60)} 小时`
  if (differenceMinutes < 0) return `已逾期 ${Math.abs(differenceMinutes)} 分钟`
  if (differenceMinutes < 60) return `${differenceMinutes} 分钟后`
  if (due.toDateString() === new Date().toDateString()) {
    return `今天 ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
  }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (due.toDateString() === tomorrow.toDateString()) {
    return `明天 ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
  }
  return `${due.getMonth() + 1}月${due.getDate()}日 ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
}

function openLead(leadId: string): void {
  uni.navigateTo({ url: `/pages/onboarding/index?focusLeadId=${encodeURIComponent(leadId)}` })
}

function openCopilot(leadId: string): void {
  uni.navigateTo({ url: `/pages/copilot/index?focusLeadId=${encodeURIComponent(leadId)}` })
}

function openTaskAction(task: SalesTaskSummary, mode: Exclude<ActionMode, null>): void {
  selectedTask.value = task
  actionMode.value = mode
  completionNote.value = ''
  snoozeReason.value = ''
  snoozePreset.value = 'TOMORROW'
}

function closeSheet(): void {
  if (busy.value) return
  actionMode.value = null
  selectedTask.value = null
}

function snoozeAt(preset: SnoozePreset): string {
  const date = new Date()
  if (preset === 'TOMORROW') {
    date.setDate(date.getDate() + 1)
    date.setHours(10, 0, 0, 0)
  } else if (preset === 'THREE_DAYS') {
    date.setDate(date.getDate() + 3)
    date.setHours(10, 0, 0, 0)
  } else {
    date.setDate(date.getDate() + 7)
    date.setHours(10, 0, 0, 0)
  }
  return date.toISOString()
}

async function submitTaskAction(): Promise<void> {
  const task = selectedTask.value
  if (!task || !actionMode.value || busy.value) return
  if (actionMode.value === 'COMPLETE' && completionNote.value.trim().length < 3) {
    uni.showToast({ title: '请填写完成证据或结果', icon: 'none' })
    return
  }
  if (actionMode.value === 'SNOOZE' && snoozeReason.value.trim().length < 3) {
    uni.showToast({ title: '请填写稍后提醒原因', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = actionMode.value === 'COMPLETE'
      ? await completeSalesTask(task, completionNote.value.trim())
      : await snoozeSalesTask(task, snoozeAt(snoozePreset.value), snoozeReason.value.trim())
    const completed = actionMode.value === 'COMPLETE'
    closeSheet()
    uni.showToast({ title: completed ? '任务已完成并留痕' : '提醒时间已更新', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
    actionMode.value = null
    selectedTask.value = null
  }
}

function switchWorkspace(
  target: 'TODAY' | 'MERCHANTS' | 'COPILOT' | 'PERFORMANCE' | 'TEAM',
): void {
  if (target === 'TODAY') return
  if (target === 'MERCHANTS') {
    uni.navigateTo({ url: '/pages/crm/index' })
    return
  }
  if (target === 'COPILOT') {
    uni.navigateTo({ url: '/pages/copilot/index' })
    return
  }
  if (target === 'PERFORMANCE') {
    uni.navigateTo({ url: '/pages/performance/index' })
    return
  }
  uni.navigateTo({ url: '/pages/team/index' })
}
</script>

<template>
  <view class="sales-page">
    <view class="hero-shell">
      <view class="topbar">
        <view class="brand">
          <view class="brand-mark">S</view>
          <view><strong>销售宝</strong><text>LEQU SALES</text></view>
        </view>
        <view class="team-pill"><i /> 上海一队</view>
        <view class="avatar">林</view>
      </view>

      <view v-if="overview" class="greeting">
        <view><text>GOOD EVENING, YIFAN</text><strong>把今天，推进一步</strong></view>
        <view class="sync"><i /> 实时同步</view>
      </view>

      <view v-if="overview" class="command-card">
        <view class="command-copy">
          <text>TODAY COMMAND</text>
          <strong>{{ overview.metrics.overdue ? `${overview.metrics.overdue} 个任务需要优先处理` : '今天的推进节奏很稳' }}</strong>
          <span>{{ overview.metrics.activeLeads }} 条有效线索 · {{ overview.metrics.protectedLeads }} 条在保护期</span>
        </view>
        <view class="progress-orbit">
          <strong>{{ overview.metrics.completedToday }}</strong>
          <text>已完成</text>
        </view>
        <view class="metric-grid">
          <view><strong>{{ overview.metrics.dueToday }}</strong><text>今日任务</text></view>
          <view><strong class="danger">{{ overview.metrics.overdue }}</strong><text>已逾期</text></view>
          <view><strong>¥{{ money(overview.metrics.monthlySignedRevenueFen) }}</strong><text>本月签约</text></view>
          <view><strong>¥{{ money(overview.metrics.expectedCommissionFen) }}</strong><text>预计佣金</text></view>
        </view>
      </view>
    </view>

    <main v-if="overview" class="content">
      <button
        v-if="topSuggestion && topOpportunity"
        class="ai-card"
        hover-class="pressed"
        @click="openCopilot(topSuggestion.leadId)"
      >
        <view class="ai-head">
          <view class="ai-label"><i>✦</i><text>AI NEXT BEST ACTION</text></view>
          <view class="score">{{ topSuggestion.recommendationScore }}</view>
        </view>
        <view class="ai-body">
          <view class="merchant-line">
            <strong>{{ topSuggestion.leadName }}</strong>
            <text>{{ stageLabel(topOpportunity.lead.stage) }}</text>
          </view>
          <h2>{{ topSuggestion.title }}</h2>
          <view class="evidence-row">
            <text v-for="reason in topSuggestion.rationale.slice(0, 2)" :key="reason">{{ reason }}</text>
          </view>
          <view class="playbook">
            <text>建议打法</text><strong>{{ topOpportunity.recommendedPlay }}</strong><span>→</span>
          </view>
        </view>
        <view class="guardrail">{{ topSuggestion.guardrail }} · {{ topSuggestion.policyVersion }}</view>
      </button>

      <view class="section-head">
        <view><text>ACTION QUEUE</text><strong>今日行动</strong></view>
        <span>{{ activeTasks.length }} 项待处理</span>
      </view>

      <view class="filter-scroll">
        <button
          v-for="filter in filters"
          :key="filter.key"
          :class="{ active: activeFilter === filter.key }"
          @click="activeFilter = filter.key"
        >{{ filter.label }}</button>
      </view>

      <view v-if="visibleTasks.length" class="task-list">
        <view
          v-for="task in visibleTasks"
          :key="task.id"
          :class="['task-card', `priority-${task.priority.toLowerCase()}`]"
        >
          <button class="task-main" @click="openLead(task.leadId)">
            <view class="task-top">
              <view class="kind"><i>{{ taskKindLabel(task) }}</i><text>{{ priorityLabel(task.priority) }}</text></view>
              <span :class="{ overdue: Date.parse(task.dueAt) < Date.now() }">{{ dueLabel(task.dueAt) }}</span>
            </view>
            <strong>{{ task.title }}</strong>
            <view class="task-merchant"><i>{{ task.leadName.slice(0, 1) }}</i><text>{{ task.leadName }}</text><span>{{ task.status === 'SNOOZED' ? '已设置稍后提醒' : 'CRM 下一步动作' }}</span></view>
          </button>
          <view class="task-actions">
            <button @click="openTaskAction(task, 'SNOOZE')">稍后</button>
            <button class="complete" @click="openTaskAction(task, 'COMPLETE')"><i>✓</i> 完成并留痕</button>
          </view>
        </view>
      </view>
      <view v-else class="empty-card">
        <view>✓</view><strong>这个视图已经清空</strong><text>你可以切换筛选，或去商家工作台创建下一步动作。</text>
      </view>

      <view class="section-head opportunity-head">
        <view><text>OPPORTUNITY RADAR</text><strong>重点商机</strong></view>
        <span>规则排序 · 可解释</span>
      </view>
      <view class="opportunity-list">
        <button
          v-for="item in overview.focusOpportunities.slice(0, 3)"
          :key="item.lead.id"
          class="opportunity-card"
          @click="openLead(item.lead.id)"
        >
          <view class="opportunity-score">{{ item.opportunityScore }}</view>
          <view class="opportunity-copy">
            <view><strong>{{ item.lead.name }}</strong><text>{{ stageLabel(item.lead.stage) }}</text></view>
            <span>{{ item.lead.nextAction }}</span>
            <small>{{ item.signals[0] }} · 保护期 {{ item.signals[1]?.replace('销售保护期剩余 ', '') }}</small>
          </view>
          <view class="arrow">›</view>
        </button>
      </view>

      <view class="compliance-card">
        <view>盾</view>
        <text>AI 建议仅用于辅助判断；联系商家、承诺方案和修改 CRM 阶段始终由销售本人执行。</text>
      </view>
    </main>

    <view v-else-if="loading" class="state-card">
      <view>✦</view><text>正在编排今日任务与重点商机…</text>
    </view>
    <view v-else class="state-card">
      <strong>销售工作台暂时不可用</strong><text>{{ errorMessage }}</text><button @click="load">重新加载</button>
    </view>

    <nav class="bottom-nav">
      <button class="active" @click="switchWorkspace('TODAY')"><i>今</i><text>今日</text></button>
      <button @click="switchWorkspace('MERCHANTS')"><i>商</i><text>商家</text></button>
      <button @click="switchWorkspace('COPILOT')"><i>✦</i><text>AI</text></button>
      <button @click="switchWorkspace('PERFORMANCE')"><i>绩</i><text>业绩</text></button>
      <button @click="switchWorkspace('TEAM')"><i>队</i><text>团队</text></button>
    </nav>

    <view v-if="actionMode && selectedTask" class="sheet-layer" @click.self="closeSheet">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text>{{ actionMode === 'COMPLETE' ? 'TASK EVIDENCE' : 'REMINDER POLICY' }}</text>
            <strong>{{ actionMode === 'COMPLETE' ? '完成任务并留痕' : '设置稍后提醒' }}</strong>
          </view>
          <button @click="closeSheet">×</button>
        </view>
        <view class="sheet-task">
          <i>{{ taskKindLabel(selectedTask) }}</i>
          <view><strong>{{ selectedTask.title }}</strong><text>{{ selectedTask.leadName }} · {{ dueLabel(selectedTask.dueAt) }}</text></view>
        </view>

        <template v-if="actionMode === 'COMPLETE'">
          <label>
            <text>完成证据或结果</text>
            <textarea
              v-model="completionNote"
              maxlength="500"
              placeholder="例：已确认决策人、演示时间和下一步安排"
            />
          </label>
          <view class="integrity-note">
            <i>i</i><text>完成任务只记录行动结果，不会自动宣称签约、付款或修改商家阶段。</text>
          </view>
        </template>

        <template v-else>
          <view class="preset-grid">
            <button :class="{ active: snoozePreset === 'TOMORROW' }" @click="snoozePreset = 'TOMORROW'"><strong>明天</strong><text>10:00</text></button>
            <button :class="{ active: snoozePreset === 'THREE_DAYS' }" @click="snoozePreset = 'THREE_DAYS'"><strong>3 天后</strong><text>10:00</text></button>
            <button :class="{ active: snoozePreset === 'NEXT_WEEK' }" @click="snoozePreset = 'NEXT_WEEK'"><strong>下周</strong><text>10:00</text></button>
          </view>
          <label>
            <text>稍后提醒原因</text>
            <input v-model="snoozeReason" maxlength="300" placeholder="说明等待条件，避免无理由拖延">
          </label>
        </template>

        <button class="primary-action" :disabled="busy" @click="submitTaskAction">
          {{ busy ? '正在安全保存…' : actionMode === 'COMPLETE' ? '确认完成并写入时间线' : '保存新的提醒时间' }}
        </button>
        <text class="safe-note">数据范围 · 乐观版本 · 幂等处理 · 审计与 Outbox</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
page { background:#f4f5f8 } button { margin:0; padding:0; border:0; line-height:inherit } button::after { display:none }
.sales-page { min-height:100vh; padding-bottom:82px; background:#f4f5f8; color:#181a24; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
.hero-shell { position:relative; overflow:hidden; padding:calc(env(safe-area-inset-top) + 12px) 17px 30px; border-radius:0 0 36px 36px; background:radial-gradient(circle at 86% 7%,rgba(255,122,136,.27),transparent 31%),radial-gradient(circle at 5% 72%,rgba(142,117,255,.22),transparent 38%),linear-gradient(148deg,#111529,#20213d 64%,#552d46); color:#fff }
.hero-shell::after { position:absolute; right:-104px; bottom:-130px; width:280px; height:280px; border:1px solid rgba(255,255,255,.07); border-radius:50%; box-shadow:0 0 0 32px rgba(255,255,255,.025),0 0 0 68px rgba(255,255,255,.018); content:"" }
.topbar { position:relative; z-index:1; display:flex; min-height:46px; align-items:center }.brand { display:flex; min-width:0; flex:1; align-items:center }.brand-mark { display:flex; width:35px; height:35px; align-items:center; justify-content:center; border-radius:12px 12px 12px 4px; background:linear-gradient(145deg,#ff7a89,#df4c69); box-shadow:0 8px 19px rgba(239,82,111,.26); font-size:13px; font-weight:950 }.brand>view:last-child { margin-left:9px }.brand strong,.brand text { display:block }.brand strong { font-size:14px }.brand text { margin-top:2px; color:rgba(255,255,255,.42); font-size:6px; font-weight:900; letter-spacing:.16em }.team-pill { display:flex; align-items:center; gap:5px; margin-right:9px; padding:7px 9px; border:1px solid rgba(255,255,255,.08); border-radius:99px; background:rgba(255,255,255,.055); color:rgba(255,255,255,.7); font-size:7px }.team-pill i,.sync i { width:5px; height:5px; border-radius:50%; background:#74e5c4; box-shadow:0 0 0 4px rgba(116,229,196,.09) }.avatar { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border:2px solid rgba(255,255,255,.18); border-radius:50%; background:#fff; color:#2b2435; font-size:10px; font-weight:950 }
.greeting { position:relative; z-index:1; display:flex; align-items:flex-end; justify-content:space-between; margin-top:23px }.greeting text,.greeting strong { display:block }.greeting>view:first-child text { color:#ff93a0; font-size:6px; font-weight:900; letter-spacing:.15em }.greeting>view:first-child strong { margin-top:5px; font-size:25px; font-weight:950; letter-spacing:-.04em }.sync { display:flex; align-items:center; gap:6px; padding-bottom:3px; color:rgba(255,255,255,.45); font-size:7px }
.command-card { position:relative; z-index:1; margin-top:18px; padding:18px; border:1px solid rgba(255,255,255,.09); border-radius:25px; background:rgba(255,255,255,.065); box-shadow:0 20px 45px rgba(0,0,0,.16); backdrop-filter:blur(13px) }.command-copy { padding-right:73px }.command-copy text,.command-copy strong,.command-copy span { display:block }.command-copy text { color:#86e6cb; font-size:6px; font-weight:900; letter-spacing:.16em }.command-copy strong { margin-top:7px; font-size:14px }.command-copy span { margin-top:6px; color:rgba(255,255,255,.46); font-size:7px }.progress-orbit { position:absolute; top:15px; right:17px; display:flex; width:55px; height:55px; flex-direction:column; align-items:center; justify-content:center; border:3px solid rgba(255,255,255,.08); border-top-color:#ff8392; border-right-color:#7de5c9; border-radius:50%; transform:rotate(10deg) }.progress-orbit strong,.progress-orbit text { transform:rotate(-10deg) }.progress-orbit strong { font-size:16px }.progress-orbit text { margin-top:1px; color:rgba(255,255,255,.45); font-size:6px }.metric-grid { display:grid; grid-template-columns:repeat(4,1fr); margin-top:17px; padding-top:14px; border-top:1px solid rgba(255,255,255,.08) }.metric-grid view { border-right:1px solid rgba(255,255,255,.07); text-align:center }.metric-grid view:last-child { border:0 }.metric-grid strong,.metric-grid text { display:block }.metric-grid strong { overflow:hidden; font-size:13px; text-overflow:ellipsis; white-space:nowrap }.metric-grid strong.danger { color:#ff8b98 }.metric-grid text { margin-top:4px; color:rgba(255,255,255,.42); font-size:6px }
.content { padding:16px 17px 32px }.ai-card { display:block; width:100%; overflow:hidden; border-radius:24px; background:linear-gradient(140deg,#6a54dd,#4f3bb5 54%,#362f78); box-shadow:0 14px 32px rgba(78,59,174,.22); color:#fff; text-align:left }.ai-head { display:flex; align-items:center; justify-content:space-between; padding:14px 15px 0 }.ai-label { display:flex; align-items:center; gap:7px }.ai-label i { display:flex; width:26px; height:26px; align-items:center; justify-content:center; border-radius:9px; background:rgba(255,255,255,.13); color:#a9f3dc; font-size:11px; font-style:normal }.ai-label text { color:#c8c0ff; font-size:6px; font-weight:900; letter-spacing:.14em }.score { display:flex; width:31px; height:31px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.13); border-radius:10px; background:rgba(255,255,255,.08); font-size:11px; font-weight:950 }.ai-body { padding:10px 15px 13px }.merchant-line { display:flex; align-items:center; gap:7px }.merchant-line strong { font-size:10px }.merchant-line text { padding:3px 6px; border-radius:99px; background:rgba(126,231,202,.12); color:#8de9ce; font-size:6px }.ai-body h2 { margin:7px 0 0; font-size:18px; font-weight:950; line-height:1.35; letter-spacing:-.03em }.evidence-row { display:flex; flex-wrap:wrap; gap:5px; margin-top:9px }.evidence-row text { padding:5px 7px; border:1px solid rgba(255,255,255,.08); border-radius:7px; background:rgba(255,255,255,.055); color:rgba(255,255,255,.63); font-size:6px }.playbook { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:8px; margin-top:11px; padding:10px; border-radius:13px; background:rgba(9,8,38,.22) }.playbook text { color:#aaa2ef; font-size:6px }.playbook strong { font-size:7px; font-weight:700; line-height:1.5 }.playbook span { color:#a6f0da }.guardrail { padding:9px 15px; background:rgba(10,8,37,.24); color:rgba(255,255,255,.36); font-size:5px; line-height:1.5 }
.section-head { display:flex; align-items:flex-end; justify-content:space-between; margin:23px 2px 11px }.section-head text,.section-head strong { display:block }.section-head text { color:#e55670; font-size:6px; font-weight:900; letter-spacing:.14em }.section-head strong { margin-top:4px; font-size:19px; font-weight:950 }.section-head span { color:#999ba7; font-size:7px }.filter-scroll { display:flex; gap:6px; overflow-x:auto; margin:0 -17px; padding:0 17px 6px; scrollbar-width:none }.filter-scroll::-webkit-scrollbar { display:none }.filter-scroll button { flex:0 0 auto; padding:9px 12px; border:1px solid #e2e3e8; border-radius:99px; background:#fff; color:#797b86; font-size:7px; font-weight:800 }.filter-scroll button.active { border-color:#24263c; background:#24263c; box-shadow:0 8px 17px rgba(36,38,60,.17); color:#fff }
.task-list { display:grid; gap:9px; margin-top:7px }.task-card { overflow:hidden; border:1px solid rgba(30,32,46,.055); border-left:4px solid #aaa; border-radius:20px; background:#fff; box-shadow:0 8px 23px rgba(29,31,49,.055) }.task-card.priority-critical { border-left-color:#ee5369 }.task-card.priority-high { border-left-color:#f49b4d }.task-card.priority-medium { border-left-color:#6b67d8 }.task-card.priority-low { border-left-color:#8aa09b }.task-main { display:block; width:100%; padding:13px 14px 11px; color:#1d1f2a; text-align:left }.task-top { display:flex; align-items:center; justify-content:space-between }.kind { display:flex; align-items:center; gap:6px }.kind i { display:flex; width:29px; height:21px; align-items:center; justify-content:center; border-radius:7px; background:#f2f1f6; color:#5e5d6c; font-size:6px; font-style:normal; font-weight:900 }.kind text { color:#8d8e99; font-size:6px }.task-top>span { color:#777985; font-size:7px }.task-top>span.overdue { color:#dd4f64; font-weight:850 }.task-main>strong { display:block; margin-top:9px; font-size:13px; line-height:1.4 }.task-merchant { display:flex; align-items:center; margin-top:10px }.task-merchant i { display:flex; width:25px; height:25px; align-items:center; justify-content:center; border-radius:9px 9px 9px 3px; background:#25283f; color:#fff; font-size:7px; font-style:normal; font-weight:900 }.task-merchant text { margin-left:7px; color:#646671; font-size:8px; font-weight:800 }.task-merchant span { margin-left:auto; color:#a0a1aa; font-size:6px }.task-actions { display:grid; grid-template-columns:.7fr 1.3fr; gap:6px; padding:8px 10px 10px; border-top:1px solid #f1f1f4 }.task-actions button { height:34px; border-radius:10px; background:#f3f3f6; color:#70717d; font-size:7px; font-weight:850 }.task-actions button.complete { background:#24263d; color:#fff }.task-actions .complete i { margin-right:4px; color:#80e1c5; font-style:normal }
.empty-card { display:flex; min-height:155px; flex-direction:column; align-items:center; justify-content:center; margin-top:8px; border:1px dashed #dddde5; border-radius:21px; background:#fff; text-align:center }.empty-card view { display:flex; width:39px; height:39px; align-items:center; justify-content:center; border-radius:13px; background:#e9f7f2; color:#16866c; font-size:14px; font-weight:900 }.empty-card strong { margin-top:10px; font-size:11px }.empty-card text { max-width:220px; margin-top:5px; color:#999aa3; font-size:7px; line-height:1.5 }.opportunity-head { margin-top:25px }.opportunity-list { display:grid; gap:8px }.opportunity-card { display:flex; width:100%; align-items:center; padding:12px; border:1px solid rgba(31,32,46,.05); border-radius:18px; background:#fff; box-shadow:0 7px 20px rgba(31,32,49,.045); color:#20212d; text-align:left }.opportunity-score { display:flex; width:43px; height:43px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:14px 14px 14px 5px; background:linear-gradient(145deg,#312e52,#191b2d); color:#fff; font-size:14px; font-weight:950 }.opportunity-copy { min-width:0; flex:1; margin-left:10px }.opportunity-copy>view { display:flex; align-items:center; gap:6px }.opportunity-copy strong { font-size:10px }.opportunity-copy>view text { padding:3px 5px; border-radius:6px; background:#f1efff; color:#6658ce; font-size:6px }.opportunity-copy>span,.opportunity-copy>small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }.opportunity-copy>span { margin-top:5px; color:#62636f; font-size:7px }.opportunity-copy>small { margin-top:4px; color:#a0a0aa; font-size:6px }.arrow { margin-left:7px; color:#b1b2ba; font-size:19px }.compliance-card { display:flex; align-items:center; gap:9px; margin-top:13px; padding:12px; border:1px solid #dfe9e6; border-radius:15px; background:#edf7f4; color:#647972; font-size:7px; line-height:1.5 }.compliance-card view { display:flex; width:29px; height:29px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:9px; background:#16866a; color:#fff; font-size:7px; font-weight:900 }
.state-card { display:flex; min-height:72vh; flex-direction:column; align-items:center; justify-content:center; gap:11px; color:#858792; font-size:9px }.state-card>view { display:flex; width:53px; height:53px; align-items:center; justify-content:center; border-radius:18px; background:#e6536f; box-shadow:0 12px 25px rgba(230,83,111,.25); color:#fff; font-size:17px }.state-card strong { color:#2a2b38; font-size:14px }.state-card button { padding:10px 17px; border-radius:11px; background:#25273d; color:#fff; font-size:8px }
.bottom-nav { position:fixed; z-index:30; right:0; bottom:0; left:0; display:grid; grid-template-columns:repeat(5,1fr); padding:7px 11px calc(7px + env(safe-area-inset-bottom)); border-top:1px solid rgba(34,35,50,.07); background:rgba(255,255,255,.94); box-shadow:0 -10px 28px rgba(22,23,37,.07); backdrop-filter:blur(16px) }.bottom-nav button { display:flex; height:50px; flex-direction:column; align-items:center; justify-content:center; border-radius:14px; background:transparent; color:#9b9ca6 }.bottom-nav i,.bottom-nav text { display:block }.bottom-nav i { font-size:11px; font-style:normal; font-weight:950 }.bottom-nav text { margin-top:4px; font-size:6px; font-weight:850 }.bottom-nav button.active { background:#f0eefc; color:#5c50ca }
.sheet-layer { position:fixed; z-index:50; inset:0; display:flex; align-items:flex-end; background:rgba(8,9,22,.55) }.action-sheet { width:100%; max-height:88vh; overflow-y:auto; padding:9px 19px calc(22px + env(safe-area-inset-bottom)); border-radius:29px 29px 0 0; background:#fff }.sheet-handle { width:40px; height:4px; margin:0 auto 17px; border-radius:99px; background:#dddde4 }.sheet-head { display:flex; align-items:flex-start; justify-content:space-between }.sheet-head text,.sheet-head strong { display:block }.sheet-head text { color:#e45470; font-size:6px; font-weight:900; letter-spacing:.14em }.sheet-head strong { margin-top:4px; font-size:20px; font-weight:950 }.sheet-head button { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border-radius:11px; background:#f1f1f5; color:#696a75; font-size:19px }.sheet-task { display:flex; align-items:center; gap:10px; margin-top:17px; padding:13px; border-radius:16px; background:linear-gradient(135deg,#f4f2ff,#fff5f6) }.sheet-task>i { display:flex; width:39px; height:39px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:13px; background:#282a43; color:#fff; font-size:7px; font-style:normal; font-weight:900 }.sheet-task strong,.sheet-task text { display:block }.sheet-task strong { font-size:9px }.sheet-task text { margin-top:5px; color:#85858f; font-size:7px }.action-sheet label { display:block; margin-top:15px }.action-sheet label>text { display:block; margin:0 0 6px 2px; color:#63646e; font-size:8px; font-weight:850 }.action-sheet input,.action-sheet textarea { box-sizing:border-box; width:100%; border:1px solid #e0e1e7; border-radius:13px; background:#f9f9fb; font-size:9px }.action-sheet input { height:44px; padding:0 11px }.action-sheet textarea { height:96px; padding:10px; line-height:1.6 }.integrity-note { display:flex; align-items:flex-start; gap:8px; margin-top:10px; padding:11px; border-radius:12px; background:#f4f5f8; color:#777984; font-size:7px; line-height:1.5 }.integrity-note i { display:flex; width:18px; height:18px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:6px; background:#6560c7; color:#fff; font-size:7px; font-style:normal; font-weight:900 }.preset-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:15px }.preset-grid button { height:57px; border:1px solid #e3e3e9; border-radius:13px; background:#fafafd; color:#696a75 }.preset-grid strong,.preset-grid text { display:block }.preset-grid strong { font-size:9px }.preset-grid text { margin-top:4px; color:#9d9da7; font-size:7px }.preset-grid button.active { border-color:#5d52cc; background:#f1efff; color:#5147ba }.primary-action { width:100%; height:51px; margin-top:16px; border-radius:15px; background:linear-gradient(135deg,#ee5a73,#c53f63); box-shadow:0 13px 25px rgba(207,65,96,.2); color:#fff; font-size:10px; font-weight:900 }.primary-action[disabled] { opacity:.6 }.safe-note { display:block; margin-top:9px; color:#9b9ca5; font-size:6px; text-align:center }.pressed { opacity:.82; transform:scale(.987) }
@media (min-width:680px) { .hero-shell,.content { max-width:720px; margin:0 auto }.bottom-nav { right:50%; left:50%; width:520px; transform:translateX(-50%) }.action-sheet { max-width:520px; margin:0 auto } }
</style>
