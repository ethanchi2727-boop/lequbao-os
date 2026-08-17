<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  SalesCommissionLedgerEntryKind,
  SalesCommissionLedgerEntrySummary,
  SalesPerformanceCategory,
  SalesPerformanceOverview,
  SalesTeamMemberPerformanceSummary,
} from '@lequ/contracts'
import {
  fetchSalesPerformance,
  reviseSalesTarget,
} from '../../services/performance'

type LedgerFilter = 'ALL' | SalesCommissionLedgerEntryKind

const overview = ref<SalesPerformanceOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const activeLedgerFilter = ref<LedgerFilter>('ALL')
const selectedEntry = ref<SalesCommissionLedgerEntrySummary | null>(null)
const targetSheetOpen = ref(false)
const signingTargetYuan = ref('')
const renewalTargetYuan = ref('')
const transactionTargetYuan = ref('')
const targetReason = ref('')
const activeSalespersonId = ref<string | undefined>(undefined)

const ledgerFilters: Array<{ key: LedgerFilter; label: string }> = [
  { key: 'ALL', label: '全部流水' },
  { key: 'RECOGNITION', label: '业绩确认' },
  { key: 'SETTLEMENT', label: '佣金已结' },
  { key: 'REVERSAL', label: '冲正' },
]

const visibleLedger = computed(() => {
  const rows = overview.value?.ledger ?? []
  return activeLedgerFilter.value === 'ALL'
    ? rows
    : rows.filter((entry) => entry.kind === activeLedgerFilter.value)
})

const insight = computed(() => {
  const value = overview.value
  if (!value) return ''
  const remaining = Math.max(0, value.metrics.targetFen - value.metrics.performanceFen)
  if (value.metrics.achievementRate >= 100) {
    return `目标已达成 ${value.metrics.achievementRate.toFixed(1)}%，新增确认仍会按规则快照继续进入账本。`
  }
  const strongest = [...value.categories].sort((a, b) =>
    b.achievementRate - a.achievementRate)[0]
  return `距离目标还差 ¥${money(remaining)}；${strongest ? categoryLabel(strongest.category) : '当前'}完成度领先，建议优先推进已有确认条件的商机。`
})

async function load(
  period?: string,
  salespersonId: string | undefined = activeSalespersonId.value,
): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const next = await fetchSalesPerformance({ period, salespersonId })
    overview.value = next
    activeSalespersonId.value = next.focusSalesperson?.userId
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '业绩中心加载失败'
  } finally {
    loading.value = false
  }
}

onShow(() => {
  if (!overview.value) void load()
})

onPullDownRefresh(async () => {
  await load(overview.value?.period, activeSalespersonId.value)
  uni.stopPullDownRefresh()
})

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(fen / 100)
}

function commissionMoney(fen: number): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: fen % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(fen / 100)
}

function signedMoney(fen: number): string {
  if (fen === 0) return '¥0'
  return `${fen > 0 ? '+' : '−'}¥${money(Math.abs(fen))}`
}

function signedCommission(fen: number): string {
  if (fen === 0) return '¥0'
  return `${fen > 0 ? '+' : '−'}¥${commissionMoney(Math.abs(fen))}`
}

function percentage(value: number): string {
  return `${value.toFixed(1)}%`
}

function progressWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value))}%`
}

function monthLabel(period: string): string {
  const [year, month] = period.split('-')
  return `${year}年${Number(month)}月`
}

function categoryLabel(category: SalesPerformanceCategory): string {
  const labels: Record<SalesPerformanceCategory, string> = {
    SIGNING: '签约收入',
    RENEWAL: '续费收入',
    TRANSACTION_SHARE: '交易分成',
  }
  return labels[category]
}

function categoryMark(category: SalesPerformanceCategory): string {
  if (category === 'SIGNING') return '签'
  if (category === 'RENEWAL') return '续'
  return '分'
}

function kindLabel(kind: SalesCommissionLedgerEntryKind): string {
  if (kind === 'RECOGNITION') return '业绩确认'
  if (kind === 'SETTLEMENT') return '佣金已结'
  return '冲正'
}

function dateLabel(value: string): string {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function changePeriod(period: string): void {
  if (period === overview.value?.period || busy.value) return
  void load(period, activeSalespersonId.value)
}

function openTeamMember(member: SalesTeamMemberPerformanceSummary): void {
  if (busy.value) return
  void load(overview.value?.period, member.salesperson.userId)
}

function backToTeam(): void {
  if (!overview.value?.permissions.canManageTarget || busy.value) return
  activeSalespersonId.value = undefined
  void load(overview.value.period, undefined)
}

function openEntry(entry: SalesCommissionLedgerEntrySummary): void {
  selectedEntry.value = entry
}

function closeEntry(): void {
  selectedEntry.value = null
}

function openTargetSheet(): void {
  const value = overview.value
  if (!value?.permissions.canManageTarget || !value.focusSalesperson) return
  signingTargetYuan.value = String((value.target?.signingTargetFen ?? 0) / 100)
  renewalTargetYuan.value = String((value.target?.renewalTargetFen ?? 0) / 100)
  transactionTargetYuan.value = String((value.target?.transactionTargetFen ?? 0) / 100)
  targetReason.value = ''
  targetSheetOpen.value = true
}

function closeTargetSheet(): void {
  if (busy.value) return
  targetSheetOpen.value = false
}

function toFen(value: string): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1
}

async function submitTarget(): Promise<void> {
  const value = overview.value
  const salesperson = value?.focusSalesperson
  if (!value || !salesperson || busy.value) return
  const signingTargetFen = toFen(signingTargetYuan.value)
  const renewalTargetFen = toFen(renewalTargetYuan.value)
  const transactionTargetFen = toFen(transactionTargetYuan.value)
  if (
    signingTargetFen < 0
    || renewalTargetFen < 0
    || transactionTargetFen < 0
    || signingTargetFen + renewalTargetFen + transactionTargetFen <= 0
  ) {
    uni.showToast({ title: '请填写有效的目标金额', icon: 'none' })
    return
  }
  if (targetReason.value.trim().length < 5) {
    uni.showToast({ title: '请填写至少 5 个字的修订原因', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await reviseSalesTarget(value, value.target, {
      salespersonId: salesperson.userId,
      signingTargetFen,
      renewalTargetFen,
      transactionTargetFen,
      reason: targetReason.value.trim(),
    })
    targetSheetOpen.value = false
    uni.showToast({ title: '新目标版本已生效', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '目标修订失败',
      icon: 'none',
    })
  } finally {
    busy.value = false
  }
}

function switchWorkspace(
  target: 'TODAY' | 'MERCHANTS' | 'COPILOT' | 'PERFORMANCE' | 'TEAM',
): void {
  if (target === 'PERFORMANCE') return
  if (target === 'TODAY') {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  if (target === 'MERCHANTS') {
    uni.navigateTo({ url: '/pages/crm/index' })
    return
  }
  if (target === 'COPILOT') {
    uni.navigateTo({ url: '/pages/copilot/index' })
    return
  }
  uni.navigateTo({ url: '/pages/team/index' })
}
</script>

<template>
  <view class="performance-page" data-testid="performance-page">
    <view class="hero">
      <view class="ambient ambient-a" />
      <view class="ambient ambient-b" />
      <view class="topbar">
        <button class="back" @click="switchWorkspace('TODAY')">‹</button>
        <view class="brand">
          <text>PERFORMANCE LEDGER</text>
          <strong>{{
            overview?.viewMode === 'TEAM'
              ? '团队业绩'
              : overview?.focusSalesperson?.userId === overview?.viewer.userId
                ? '我的业绩'
                : '销售业绩'
          }}</strong>
        </view>
        <view class="secure"><i /> 已核验</view>
      </view>

      <view v-if="overview" class="period-switch" data-testid="period-switch">
        <button
          v-for="period in overview.availablePeriods"
          :key="period"
          :class="{ active: period === overview.period }"
          @click="changePeriod(period)"
        >{{ monthLabel(period) }}</button>
      </view>

      <view v-if="overview" class="hero-main">
        <view class="hero-kicker">
          <button
            v-if="overview.viewMode === 'INDIVIDUAL' && overview.permissions.canManageTarget"
            class="team-back"
            @click="backToTeam"
          >‹ 团队 · {{ overview.focusSalesperson?.displayName }}</button>
          <text v-else>{{ overview.viewMode === 'TEAM' ? 'SHANGHAI TEAM' : overview.focusSalesperson?.displayName }}</text>
          <span>规则已锁定</span>
        </view>
        <view class="hero-value">
          <view>
            <text>{{ overview.viewMode === 'TEAM' ? '团队确认业绩' : '本月确认业绩' }}</text>
            <strong><i>¥</i>{{ money(overview.metrics.performanceFen) }}</strong>
            <span>目标 ¥{{ money(overview.metrics.targetFen) }} · {{ overview.metrics.recognizedCount }} 笔确认事实</span>
          </view>
          <view class="orbit" :style="{ '--progress': `${Math.min(100, overview.metrics.achievementRate) * 3.6}deg` }">
            <view><strong>{{ Math.round(overview.metrics.achievementRate) }}</strong><text>%</text></view>
          </view>
        </view>
        <view class="hero-progress">
          <view><i :style="{ width: progressWidth(overview.metrics.achievementRate) }" /></view>
          <span>{{ overview.metrics.achievementRate >= 100 ? '目标已达成' : `还差 ¥${money(Math.max(0, overview.metrics.targetFen - overview.metrics.performanceFen))}` }}</span>
        </view>
      </view>
    </view>

    <view v-if="overview" class="content">
      <view class="commission-deck">
        <view class="commission-card expected">
          <view class="card-icon">预</view>
          <view><text>预计佣金</text><strong>¥{{ commissionMoney(overview.metrics.estimatedCommissionFen) }}</strong></view>
          <span>待财务月结</span>
        </view>
        <view class="commission-card settled">
          <view class="card-icon">结</view>
          <view><text>已结佣金</text><strong>¥{{ commissionMoney(overview.metrics.settledCommissionFen) }}</strong></view>
          <span>财务已确认</span>
        </view>
      </view>

      <view v-if="overview.metrics.reversalFen > 0" class="reversal-banner">
        <view>↺</view>
        <view><strong>本月冲正 ¥{{ money(overview.metrics.reversalFen) }}</strong><text>退款或撤销以负向流水同步抵销，不删除历史记录</text></view>
        <span>可解释</span>
      </view>

      <view class="section-head">
        <view><text>GOAL COMPOSITION</text><strong>目标构成</strong></view>
        <button
          v-if="overview.permissions.canManageTarget && overview.focusSalesperson"
          data-testid="target-manage"
          @click="openTargetSheet"
        >修订目标 · v{{ overview.target?.version ?? 0 }}</button>
        <span v-else>{{ overview.target ? `目标 v${overview.target.version}` : '团队汇总' }}</span>
      </view>

      <view class="category-grid">
        <view
          v-for="item in overview.categories"
          :key="item.category"
          :class="['category-card', `category-${item.category.toLowerCase()}`]"
        >
          <view class="category-head">
            <i>{{ categoryMark(item.category) }}</i>
            <view><strong>{{ categoryLabel(item.category) }}</strong><text>目标 ¥{{ money(item.targetFen) }}</text></view>
            <span>{{ percentage(item.achievementRate) }}</span>
          </view>
          <view class="category-amount">¥{{ money(item.performanceFen) }}</view>
          <view class="mini-progress"><i :style="{ width: progressWidth(item.achievementRate) }" /></view>
          <view class="category-foot">
            <text>预计 ¥{{ commissionMoney(item.estimatedCommissionFen) }}</text>
            <text>已结 ¥{{ commissionMoney(item.settledCommissionFen) }}</text>
          </view>
        </view>
      </view>

      <view class="insight-card">
        <view class="insight-mark">✦</view>
        <view>
          <text>PERFORMANCE COPILOT</text>
          <strong>{{ insight }}</strong>
          <span>只做经营提示，不修改目标、收入或结算账本。</span>
        </view>
      </view>

      <template v-if="overview.viewMode === 'TEAM'">
        <view class="section-head team-head">
          <view><text>TEAM PULSE</text><strong>团队进度</strong></view>
          <span>{{ overview.team.length }} 位销售</span>
        </view>
        <view class="team-list">
          <button
            v-for="(member, index) in overview.team"
            :key="member.salesperson.userId"
            class="team-card"
            :data-testid="`team-member-${member.salesperson.userId}`"
            @click="openTeamMember(member)"
          >
            <view class="rank">{{ String(index + 1).padStart(2, '0') }}</view>
            <view class="member-avatar">{{ member.salesperson.displayName.slice(-1) }}</view>
            <view class="member-copy">
              <view><strong>{{ member.salesperson.displayName }}</strong><span>目标 v{{ member.targetVersion }}</span></view>
              <text>¥{{ money(member.performanceFen) }} / ¥{{ money(member.targetFen) }}</text>
              <view class="member-progress"><i :style="{ width: progressWidth(member.achievementRate) }" /></view>
            </view>
            <view class="member-rate"><strong>{{ Math.round(member.achievementRate) }}%</strong><text>查看 ›</text></view>
          </button>
        </view>
      </template>

      <view class="section-head ledger-head">
        <view><text>IMMUTABLE EVIDENCE</text><strong>业绩与佣金流水</strong></view>
        <span>{{ overview.ledger.length }} 条证据</span>
      </view>
      <view class="ledger-filters">
        <button
          v-for="filter in ledgerFilters"
          :key="filter.key"
          :class="{ active: activeLedgerFilter === filter.key }"
          @click="activeLedgerFilter = filter.key"
        >{{ filter.label }}</button>
      </view>

      <view v-if="visibleLedger.length" class="ledger-list">
        <button
          v-for="entry in visibleLedger"
          :key="entry.id"
          :class="['ledger-entry', `kind-${entry.kind.toLowerCase()}`]"
          data-testid="ledger-entry"
          @click="openEntry(entry)"
        >
          <view class="timeline-rail"><i /><span /></view>
          <view class="entry-main">
            <view class="entry-top">
              <view><i>{{ kindLabel(entry.kind) }}</i><text>#{{ entry.sequence }}</text></view>
              <span>{{ dateLabel(entry.occurredAt) }}</span>
            </view>
            <strong>{{ entry.sourceLabel }}</strong>
            <text class="entry-reason">{{ entry.reason }}</text>
            <view class="entry-deltas">
              <span v-if="entry.performanceDeltaFen" :class="{ negative: entry.performanceDeltaFen < 0 }">
                业绩 {{ signedMoney(entry.performanceDeltaFen) }}
              </span>
              <span v-if="entry.estimatedCommissionDeltaFen" :class="{ negative: entry.estimatedCommissionDeltaFen < 0 }">
                预计 {{ signedCommission(entry.estimatedCommissionDeltaFen) }}
              </span>
              <span v-if="entry.settledCommissionDeltaFen" :class="{ negative: entry.settledCommissionDeltaFen < 0 }">
                已结 {{ signedCommission(entry.settledCommissionDeltaFen) }}
              </span>
            </view>
            <view class="entry-meta">
              <text>{{ entry.ruleVersion }}</text><span>{{ entry.evidence.length }} 项证据</span><i>查看解释 ›</i>
            </view>
          </view>
        </button>
      </view>
      <view v-else class="empty-ledger">
        <view>◇</view><strong>当前筛选暂无流水</strong><text>切换其他类型查看已确认的业务证据。</text>
      </view>

      <view class="guardrail-card">
        <view>盾</view>
        <view><strong>账本由服务端守护</strong><text>{{ overview.policy.guardrail }}</text></view>
      </view>
    </view>

    <view v-else-if="loading" class="state-card">
      <view>✦</view><text>正在核对目标、业绩与佣金账本…</text>
    </view>
    <view v-else class="state-card">
      <strong>业绩中心暂时不可用</strong><text>{{ errorMessage }}</text><button @click="load()">重新加载</button>
    </view>

    <nav class="bottom-nav">
      <button @click="switchWorkspace('TODAY')"><i>今</i><text>今日</text></button>
      <button @click="switchWorkspace('MERCHANTS')"><i>商</i><text>商家</text></button>
      <button @click="switchWorkspace('COPILOT')"><i>✦</i><text>AI</text></button>
      <button class="active" @click="switchWorkspace('PERFORMANCE')"><i>绩</i><text>业绩</text></button>
      <button @click="switchWorkspace('TEAM')"><i>队</i><text>团队</text></button>
    </nav>

    <view v-if="selectedEntry" class="sheet-layer" @click.self="closeEntry">
      <view class="detail-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text>LEDGER EXPLANATION · #{{ selectedEntry.sequence }}</text>
            <strong>{{ kindLabel(selectedEntry.kind) }}解释</strong>
          </view>
          <button @click="closeEntry">×</button>
        </view>
        <view :class="['sheet-summary', `kind-${selectedEntry.kind.toLowerCase()}`]">
          <i>{{ categoryMark(selectedEntry.category) }}</i>
          <view><text>{{ categoryLabel(selectedEntry.category) }}</text><strong>{{ selectedEntry.sourceLabel }}</strong></view>
          <span>{{ kindLabel(selectedEntry.kind) }}</span>
        </view>
        <view class="delta-grid">
          <view><text>业绩变化</text><strong :class="{ negative: selectedEntry.performanceDeltaFen < 0 }">{{ signedMoney(selectedEntry.performanceDeltaFen) }}</strong></view>
          <view><text>预计佣金</text><strong :class="{ negative: selectedEntry.estimatedCommissionDeltaFen < 0 }">{{ signedCommission(selectedEntry.estimatedCommissionDeltaFen) }}</strong></view>
          <view><text>已结佣金</text><strong :class="{ negative: selectedEntry.settledCommissionDeltaFen < 0 }">{{ signedCommission(selectedEntry.settledCommissionDeltaFen) }}</strong></view>
        </view>
        <view class="explain-block">
          <text>为什么发生</text>
          <strong>{{ selectedEntry.reason }}</strong>
        </view>
        <view class="explain-block">
          <text>规则快照</text>
          <view v-for="line in selectedEntry.ruleExplanation" :key="line"><i>✓</i><span>{{ line }}</span></view>
        </view>
        <view class="explain-block">
          <text>证据链</text>
          <view v-for="evidence in selectedEntry.evidence" :key="evidence"><i>↳</i><span>{{ evidence }}</span></view>
        </view>
        <view class="source-row">
          <text>来源 {{ selectedEntry.sourceId }}</text>
          <span>{{ selectedEntry.originalEntryId ? `原流水 ${selectedEntry.originalEntryId}` : '原始确认事实' }}</span>
        </view>
        <button class="sheet-primary" @click="closeEntry">我已了解这笔流水</button>
        <text class="safe-note">不可修改 · 不可删除 · 规则快照 · 审计留痕</text>
      </view>
    </view>

    <view v-if="targetSheetOpen && overview?.focusSalesperson" class="sheet-layer" @click.self="closeTargetSheet">
      <view class="target-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view><text>TARGET REVISION</text><strong>修订月度目标</strong></view>
          <button @click="closeTargetSheet">×</button>
        </view>
        <view class="target-person">
          <i>{{ overview.focusSalesperson.displayName.slice(-1) }}</i>
          <view><strong>{{ overview.focusSalesperson.displayName }}</strong><text>{{ monthLabel(overview.period) }} · 当前目标 v{{ overview.target?.version ?? 0 }}</text></view>
          <span>追加新版本</span>
        </view>
        <view class="target-fields">
          <label><text>签约收入目标</text><view><i>¥</i><input v-model="signingTargetYuan" type="digit" placeholder="0"></view></label>
          <label><text>续费收入目标</text><view><i>¥</i><input v-model="renewalTargetYuan" type="digit" placeholder="0"></view></label>
          <label><text>交易分成目标</text><view><i>¥</i><input v-model="transactionTargetYuan" type="digit" placeholder="0"></view></label>
        </view>
        <label class="reason-field">
          <text>修订原因</text>
          <textarea v-model="targetReason" maxlength="500" placeholder="说明业务依据，历史版本会永久保留" />
        </label>
        <view class="integrity-note"><i>i</i><text>目标修订只追加新版本，不会覆盖旧目标，也不会修改任何佣金账本。</text></view>
        <button data-testid="target-submit" class="sheet-primary" :disabled="busy" @click="submitTarget">
          {{ busy ? '正在安全写入…' : '确认并生成新目标版本' }}
        </button>
        <text class="safe-note">乐观版本 · 幂等处理 · 审计与 Outbox</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
page { background:#f2f3f7 } button { margin:0; padding:0; border:0; line-height:inherit } button::after { display:none }
.performance-page { min-height:100vh; padding-bottom:88px; background:#f2f3f7; color:#171925; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
.hero { position:relative; overflow:hidden; padding:calc(env(safe-area-inset-top) + 12px) 18px 31px; border-radius:0 0 38px 38px; background:linear-gradient(148deg,#0b1022 0%,#191b35 58%,#35243b 100%); color:#fff; box-shadow:0 20px 38px rgba(18,21,43,.13) }
.ambient { position:absolute; border-radius:50%; filter:blur(2px); pointer-events:none }.ambient-a { top:-90px; right:-55px; width:220px; height:220px; background:radial-gradient(circle,rgba(255,177,98,.22),transparent 67%) }.ambient-b { bottom:-135px; left:-90px; width:290px; height:290px; background:radial-gradient(circle,rgba(116,93,255,.24),transparent 68%) }
.topbar { position:relative; z-index:1; display:flex; height:42px; align-items:center }.back { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:rgba(255,255,255,.06); color:#fff; font-size:24px }.brand { flex:1; margin-left:11px }.brand text,.brand strong { display:block }.brand text { color:rgba(255,255,255,.4); font-size:6px; font-weight:900; letter-spacing:.19em }.brand strong { margin-top:2px; font-size:14px; letter-spacing:.02em }.secure { display:flex; align-items:center; gap:6px; padding:7px 9px; border:1px solid rgba(255,255,255,.08); border-radius:99px; background:rgba(255,255,255,.045); color:rgba(255,255,255,.68); font-size:7px }.secure i { width:6px; height:6px; border-radius:50%; background:#6ce1bc; box-shadow:0 0 0 4px rgba(108,225,188,.1) }
.period-switch { position:relative; z-index:1; display:flex; width:max-content; margin:21px auto 2px; padding:3px; border:1px solid rgba(255,255,255,.08); border-radius:99px; background:rgba(4,7,17,.28) }.period-switch button { padding:8px 16px; border-radius:99px; background:transparent; color:rgba(255,255,255,.46); font-size:8px; font-weight:800 }.period-switch button.active { background:#fff; color:#15182a; box-shadow:0 6px 16px rgba(0,0,0,.18) }
.hero-main { position:relative; z-index:1; margin-top:17px }.hero-kicker { display:flex; align-items:center; gap:8px }.hero-kicker>text,.team-back { color:rgba(255,255,255,.52); font-size:7px; font-weight:850; letter-spacing:.08em }.team-back { padding:5px 8px; border-radius:8px; background:rgba(255,255,255,.08); color:#fff }.hero-kicker span { margin-left:auto; padding:4px 7px; border:1px solid rgba(255,198,124,.18); border-radius:99px; color:#f5c581; font-size:6px }
.hero-value { display:flex; align-items:center; margin-top:11px }.hero-value>view:first-child { min-width:0; flex:1 }.hero-value text,.hero-value strong,.hero-value span { display:block }.hero-value>view:first-child>text { color:rgba(255,255,255,.62); font-size:9px }.hero-value>view:first-child>strong { margin-top:3px; font-family:Georgia,serif; font-size:37px; line-height:1.05; letter-spacing:-.04em }.hero-value>view:first-child>strong i { margin-right:3px; color:#f3b66f; font-family:inherit; font-size:16px; font-style:normal }.hero-value>view:first-child>span { margin-top:8px; color:rgba(255,255,255,.4); font-size:7px }
.orbit { display:flex; width:72px; height:72px; align-items:center; justify-content:center; margin-left:12px; border-radius:50%; background:conic-gradient(#f5b96d var(--progress),rgba(255,255,255,.09) 0); box-shadow:0 0 30px rgba(245,185,109,.08) }.orbit::before { position:absolute; width:60px; height:60px; border-radius:50%; background:#1e1c32; content:"" }.orbit view { position:relative; z-index:1; display:flex; align-items:baseline }.orbit strong { font-size:22px }.orbit text { margin-left:1px; color:#f5c581; font-size:8px }
.hero-progress { display:flex; align-items:center; gap:10px; margin-top:18px }.hero-progress>view { height:4px; flex:1; overflow:hidden; border-radius:99px; background:rgba(255,255,255,.09) }.hero-progress i { display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#ff8f75,#f6c87c); box-shadow:0 0 10px rgba(246,200,124,.3) }.hero-progress span { color:rgba(255,255,255,.46); font-size:7px }
.content { padding:0 15px 28px }.commission-deck { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:-14px; position:relative; z-index:2 }.commission-card { position:relative; display:grid; grid-template-columns:36px 1fr; align-items:center; min-height:82px; padding:14px 12px; overflow:hidden; border:1px solid rgba(26,28,45,.05); border-radius:20px; background:#fff; box-shadow:0 12px 30px rgba(33,37,58,.07) }.commission-card::after { position:absolute; right:-20px; bottom:-28px; width:78px; height:78px; border-radius:50%; content:"" }.commission-card.expected::after { background:rgba(113,91,238,.07) }.commission-card.settled::after { background:rgba(34,173,139,.08) }.card-icon { display:flex; width:31px; height:31px; align-items:center; justify-content:center; border-radius:11px; background:#f0edff; color:#6d56db; font-size:9px; font-weight:900 }.settled .card-icon { background:#e8faf4; color:#168f70 }.commission-card text,.commission-card strong { display:block }.commission-card text { color:#818493; font-size:7px }.commission-card strong { margin-top:3px; font-family:Georgia,serif; font-size:18px }.commission-card>span { grid-column:2; margin-top:-5px; color:#aaaeba; font-size:6px }
.reversal-banner { display:flex; align-items:center; gap:10px; margin-top:12px; padding:12px; border:1px solid rgba(226,92,96,.09); border-radius:17px; background:linear-gradient(120deg,#fff7f5,#fff); box-shadow:0 8px 22px rgba(50,37,43,.035) }.reversal-banner>view:first-child { display:flex; width:31px; height:31px; align-items:center; justify-content:center; border-radius:10px; background:#ffe4df; color:#da5b5f; font-size:15px }.reversal-banner>view:nth-child(2) { min-width:0; flex:1 }.reversal-banner strong,.reversal-banner text { display:block }.reversal-banner strong { color:#8d343b; font-size:9px }.reversal-banner text { margin-top:3px; color:#a98083; font-size:6px; line-height:1.5 }.reversal-banner>span { padding:5px 7px; border-radius:99px; background:#fff0ed; color:#cf5d60; font-size:6px }
.section-head { display:flex; align-items:end; margin:24px 2px 11px }.section-head>view { flex:1 }.section-head text,.section-head strong { display:block }.section-head text { color:#a0a3ae; font-size:6px; font-weight:900; letter-spacing:.18em }.section-head strong { margin-top:3px; font-size:15px }.section-head>span,.section-head>button { color:#8d909d; font-size:7px }.section-head>button { padding:7px 10px; border:1px solid #e3e4eb; border-radius:10px; background:#fff; color:#6652c7; font-weight:850 }
.category-grid { display:grid; gap:9px }.category-card { padding:15px; border:1px solid rgba(30,33,50,.05); border-radius:20px; background:#fff; box-shadow:0 9px 26px rgba(34,38,58,.045) }.category-head { display:flex; align-items:center }.category-head>i { display:flex; width:32px; height:32px; align-items:center; justify-content:center; border-radius:11px; background:#fff0e6; color:#e47545; font-size:9px; font-style:normal; font-weight:900 }.category-renewal .category-head>i { background:#eeeaff; color:#7259d8 }.category-transaction_share .category-head>i { background:#e7f8f3; color:#168d70 }.category-head>view { flex:1; margin-left:9px }.category-head strong,.category-head text { display:block }.category-head strong { font-size:10px }.category-head text { margin-top:2px; color:#aaadb8; font-size:6px }.category-head>span { color:#555a6a; font-size:10px; font-weight:900 }.category-amount { margin-top:13px; font-family:Georgia,serif; font-size:21px; font-weight:800 }.mini-progress { height:4px; margin-top:10px; overflow:hidden; border-radius:99px; background:#f0f1f5 }.mini-progress i { display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#f18c61,#f2bd70) }.category-renewal .mini-progress i { background:linear-gradient(90deg,#7259d8,#ae94ff) }.category-transaction_share .mini-progress i { background:linear-gradient(90deg,#148c6e,#65cbb0) }.category-foot { display:flex; justify-content:space-between; margin-top:9px; color:#979aa7; font-size:6px }
.insight-card { display:flex; gap:11px; margin-top:13px; padding:15px; border-radius:20px; background:linear-gradient(135deg,#171a31,#272440); color:#fff; box-shadow:0 13px 28px rgba(24,26,50,.13) }.insight-mark { display:flex; width:34px; height:34px; flex:0 0 34px; align-items:center; justify-content:center; border-radius:12px; background:linear-gradient(145deg,#8269ed,#f27e89); box-shadow:0 7px 18px rgba(130,105,237,.25) }.insight-card text,.insight-card strong,.insight-card span { display:block }.insight-card text { color:#a996ff; font-size:6px; font-weight:900; letter-spacing:.13em }.insight-card strong { margin-top:5px; font-size:9px; line-height:1.65 }.insight-card span { margin-top:5px; color:rgba(255,255,255,.38); font-size:6px }
.team-list { display:grid; gap:9px }.team-card { display:flex; align-items:center; width:100%; padding:13px; border:1px solid rgba(31,34,50,.05); border-radius:18px; background:#fff; text-align:left; box-shadow:0 8px 22px rgba(35,38,56,.04) }.rank { width:22px; color:#b4b6c0; font-family:Georgia,serif; font-size:9px }.member-avatar { display:flex; width:34px; height:34px; flex:0 0 34px; align-items:center; justify-content:center; border-radius:12px; background:linear-gradient(145deg,#282b47,#6e5b83); color:#fff; font-size:10px; font-weight:900 }.member-copy { min-width:0; flex:1; margin-left:10px }.member-copy>view:first-child { display:flex; align-items:center }.member-copy strong { font-size:9px }.member-copy span { margin-left:6px; padding:3px 5px; border-radius:6px; background:#f1efff; color:#705bd2; font-size:5px }.member-copy>text { display:block; margin-top:4px; color:#999ca8; font-size:7px }.member-progress { height:3px; margin-top:7px; overflow:hidden; border-radius:99px; background:#eff0f4 }.member-progress i { display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#725cdb,#f09a84) }.member-rate { margin-left:10px; text-align:right }.member-rate strong,.member-rate text { display:block }.member-rate strong { font-size:13px }.member-rate text { margin-top:4px; color:#9b9eaa; font-size:6px }
.ledger-filters { display:flex; gap:7px; overflow-x:auto; padding-bottom:2px }.ledger-filters button { flex:0 0 auto; padding:8px 11px; border:1px solid #e3e4e9; border-radius:99px; background:#fff; color:#858894; font-size:7px }.ledger-filters button.active { border-color:#24283f; background:#24283f; color:#fff; box-shadow:0 6px 14px rgba(36,40,63,.13) }
.ledger-list { margin-top:12px }.ledger-entry { display:flex; width:100%; text-align:left; background:transparent }.timeline-rail { position:relative; width:22px; flex:0 0 22px }.timeline-rail i { position:absolute; top:18px; left:5px; z-index:1; width:8px; height:8px; border:3px solid #f2f3f7; border-radius:50%; background:#6f5bd8; box-shadow:0 0 0 2px #c9c2ef }.timeline-rail span { position:absolute; top:26px; bottom:-5px; left:10px; width:1px; background:#dbdce4 }.ledger-entry:last-child .timeline-rail span { display:none }.kind-settlement .timeline-rail i { background:#169477; box-shadow:0 0 0 2px #b7e4d8 }.kind-reversal .timeline-rail i { background:#d85d61; box-shadow:0 0 0 2px #f1c3c4 }
.entry-main { min-width:0; flex:1; margin-bottom:9px; padding:13px 13px 12px; border:1px solid rgba(31,34,50,.05); border-radius:17px; background:#fff; box-shadow:0 7px 20px rgba(35,38,56,.035) }.entry-top { display:flex; align-items:center }.entry-top>view { display:flex; align-items:center; gap:5px }.entry-top i { padding:4px 6px; border-radius:6px; background:#efecff; color:#6b54d0; font-size:6px; font-style:normal; font-weight:850 }.kind-settlement .entry-top i { background:#e5f8f2; color:#15886d }.kind-reversal .entry-top i { background:#ffebe8; color:#ca5359 }.entry-top text { color:#b0b2bc; font-size:6px }.entry-top>span { margin-left:auto; color:#b0b2bc; font-size:6px }.entry-main>strong { display:block; margin-top:8px; overflow:hidden; font-size:9px; text-overflow:ellipsis; white-space:nowrap }.entry-reason { display:block; margin-top:4px; color:#8d909b; font-size:7px; line-height:1.55 }.entry-deltas { display:flex; flex-wrap:wrap; gap:5px; margin-top:9px }.entry-deltas span { padding:5px 7px; border-radius:7px; background:#edf8f4; color:#147a64; font-size:6px; font-weight:800 }.entry-deltas span.negative { background:#fff0ed; color:#c54e56 }.entry-meta { display:flex; align-items:center; margin-top:9px; padding-top:9px; border-top:1px solid #f0f1f4; color:#a2a5af; font-size:5.5px }.entry-meta span { margin-left:8px }.entry-meta i { margin-left:auto; color:#6955c6; font-style:normal; font-weight:800 }
.empty-ledger,.state-card { display:flex; min-height:180px; flex-direction:column; align-items:center; justify-content:center; margin-top:12px; border-radius:20px; background:#fff; color:#9699a5; text-align:center }.empty-ledger view,.state-card view { display:flex; width:40px; height:40px; align-items:center; justify-content:center; border-radius:14px; background:#f0eeff; color:#6e58d4 }.empty-ledger strong,.state-card strong { margin-top:9px; color:#343744; font-size:10px }.empty-ledger text,.state-card text { margin-top:5px; font-size:7px }.state-card { margin:130px 16px 0 }.state-card button { margin-top:12px; padding:8px 14px; border-radius:10px; background:#25293f; color:#fff; font-size:7px }
.guardrail-card { display:flex; gap:10px; margin-top:16px; padding:14px; border:1px solid #e3e4ea; border-radius:18px; background:rgba(255,255,255,.65) }.guardrail-card>view:first-child { display:flex; width:30px; height:30px; flex:0 0 30px; align-items:center; justify-content:center; border-radius:10px; background:#e8f6f2; color:#168b70; font-size:8px; font-weight:900 }.guardrail-card strong,.guardrail-card text { display:block }.guardrail-card strong { font-size:8px }.guardrail-card text { margin-top:3px; color:#888b97; font-size:6px; line-height:1.6 }
.bottom-nav { position:fixed; z-index:20; right:10px; bottom:calc(env(safe-area-inset-bottom) + 8px); left:10px; display:grid; grid-template-columns:repeat(5,1fr); height:61px; padding:4px; border:1px solid rgba(255,255,255,.72); border-radius:22px; background:rgba(255,255,255,.92); box-shadow:0 13px 34px rgba(31,35,57,.16); backdrop-filter:blur(20px) }.bottom-nav button { display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:17px; background:transparent; color:#a0a2ac }.bottom-nav i { display:flex; width:23px; height:23px; align-items:center; justify-content:center; border-radius:8px; background:#f1f2f5; font-size:7px; font-style:normal; font-weight:900 }.bottom-nav text { margin-top:3px; font-size:6px; font-weight:800 }.bottom-nav button.active { background:#22263d; color:#fff; box-shadow:0 7px 17px rgba(34,38,61,.18) }.bottom-nav button.active i { background:rgba(255,255,255,.12); color:#f4bc78 }
.sheet-layer { position:fixed; z-index:80; inset:0; display:flex; align-items:flex-end; background:rgba(7,10,21,.58); backdrop-filter:blur(7px) }.detail-sheet,.target-sheet { width:100%; max-height:86vh; overflow-y:auto; padding:10px 17px calc(env(safe-area-inset-bottom) + 18px); border-radius:28px 28px 0 0; background:#f7f7fa; box-shadow:0 -20px 60px rgba(5,8,18,.22) }.sheet-handle { width:36px; height:4px; margin:0 auto 13px; border-radius:99px; background:#d0d1d8 }.sheet-head { display:flex; align-items:center }.sheet-head>view { flex:1 }.sheet-head text,.sheet-head strong { display:block }.sheet-head text { color:#9281e7; font-size:6px; font-weight:900; letter-spacing:.16em }.sheet-head strong { margin-top:3px; font-size:16px }.sheet-head>button { display:flex; width:31px; height:31px; align-items:center; justify-content:center; border-radius:10px; background:#e9eaf0; color:#6c6f7c; font-size:18px }
.sheet-summary,.target-person { display:flex; align-items:center; margin-top:16px; padding:13px; border-radius:17px; background:#fff; box-shadow:0 8px 20px rgba(34,37,57,.05) }.sheet-summary>i,.target-person>i { display:flex; width:36px; height:36px; flex:0 0 36px; align-items:center; justify-content:center; border-radius:12px; background:#efecff; color:#6e57d4; font-size:10px; font-style:normal; font-weight:900 }.sheet-summary>view,.target-person>view { min-width:0; flex:1; margin-left:10px }.sheet-summary text,.sheet-summary strong,.target-person text,.target-person strong { display:block }.sheet-summary text,.target-person text { color:#9b9eaa; font-size:6px }.sheet-summary strong,.target-person strong { margin-top:3px; overflow:hidden; font-size:9px; text-overflow:ellipsis; white-space:nowrap }.sheet-summary>span,.target-person>span { padding:5px 7px; border-radius:8px; background:#efecff; color:#6d56d1; font-size:6px; font-weight:850 }.sheet-summary.kind-settlement>i,.sheet-summary.kind-settlement>span { background:#e4f8f1; color:#15876d }.sheet-summary.kind-reversal>i,.sheet-summary.kind-reversal>span { background:#ffebe8; color:#c94f57 }
.delta-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:10px }.delta-grid>view { padding:11px 8px; border-radius:14px; background:#fff; text-align:center }.delta-grid text,.delta-grid strong { display:block }.delta-grid text { color:#9b9eaa; font-size:6px }.delta-grid strong { margin-top:5px; color:#18866d; font-size:9px }.delta-grid strong.negative { color:#c84f57 }.explain-block { margin-top:10px; padding:13px; border-radius:16px; background:#fff }.explain-block>text { display:block; margin-bottom:8px; color:#9a9da8; font-size:6px; font-weight:850; letter-spacing:.08em }.explain-block>strong { font-size:8px; line-height:1.65 }.explain-block>view { display:flex; gap:7px; margin-top:7px; color:#626572; font-size:7px; line-height:1.55 }.explain-block>view i { color:#6c58cd; font-style:normal }.source-row { margin-top:10px; padding:10px 12px; border:1px dashed #d8d9e0; border-radius:13px; color:#9b9da7; font-size:5.5px }.source-row text,.source-row span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }.source-row span { margin-top:4px }
.sheet-primary { width:100%; height:45px; margin-top:14px; border-radius:14px; background:linear-gradient(120deg,#252940,#3c385d); color:#fff; font-size:9px; font-weight:900; box-shadow:0 10px 22px rgba(37,41,64,.18) }.sheet-primary[disabled] { opacity:.55 }.safe-note { display:block; margin-top:9px; color:#a2a4ae; font-size:5.5px; text-align:center }
.target-fields { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px }.target-fields label:last-child { grid-column:1 / -1 }.target-fields label,.reason-field { display:block; padding:11px 12px; border-radius:15px; background:#fff }.target-fields label>text,.reason-field>text { display:block; color:#8f929e; font-size:6px }.target-fields label>view { display:flex; align-items:center; margin-top:6px }.target-fields label i { color:#d38a4f; font-size:8px; font-style:normal; font-weight:900 }.target-fields input { height:25px; min-width:0; flex:1; margin-left:4px; color:#222535; font-family:Georgia,serif; font-size:15px; font-weight:800 }.reason-field { margin-top:8px }.reason-field textarea { box-sizing:border-box; width:100%; height:74px; margin-top:8px; color:#313441; font-size:8px; line-height:1.6 }.integrity-note { display:flex; gap:8px; margin-top:9px; padding:10px 11px; border-radius:13px; background:#efedff; color:#6c5ab6; font-size:6px; line-height:1.55 }.integrity-note i { font-style:normal; font-weight:900 }
@media (min-width:700px) { .performance-page { max-width:430px; margin:0 auto; box-shadow:0 0 80px rgba(30,33,52,.1) }.bottom-nav { right:calc(50% - 205px); left:calc(50% - 205px) }.detail-sheet,.target-sheet { max-width:430px; margin:0 auto } }
</style>
