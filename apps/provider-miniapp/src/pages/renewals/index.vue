<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ProviderRenewalCaseSummary,
  ProviderRenewalLossReason,
  ProviderRenewalOverview,
  ProviderRenewalRiskBand,
} from '@lequ/contracts'
import {
  closeProviderRenewal,
  fetchProviderRenewals,
  generateProviderRenewalProposal,
  scanProviderRenewals,
} from '../../services/renewals'

type SheetMode = 'PROPOSAL' | 'RENEWED' | 'LOST'

const overview = ref<ProviderRenewalOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const sheetMode = ref<SheetMode | null>(null)
const confirmationChecked = ref(false)
const acceptedPackageCode = ref<'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'>('PRO')
const lossReason = ref<ProviderRenewalLossReason>('PRICE')
const lossDetail = ref('商家当前预算安排无法覆盖年度服务费用，已确认本周期不续费。')
const recoverable = ref(true)
const recoveryAction = ref('两周后由原负责人带基础连续服务方案再次拜访，并记录预算决策结果。')

const focus = computed(() => overview.value?.focusCase ?? null)
const activeCases = computed(() =>
  (overview.value?.cases ?? []).filter(({ status }) =>
    status === 'MONITORING' || status === 'PROPOSAL_READY'),
)
const closedCases = computed(() =>
  (overview.value?.cases ?? []).filter(({ status }) =>
    status === 'RENEWED' || status === 'LOST'),
)

const riskMeta: Record<ProviderRenewalRiskBand, { label: string; tone: string }> = {
  HEALTHY: { label: '节奏健康', tone: 'healthy' },
  WATCH: { label: '需要跟进', tone: 'watch' },
  AT_RISK: { label: '重点推进', tone: 'risk' },
  CRITICAL: { label: '今日确认', tone: 'critical' },
  EXPIRED: { label: '已经到期', tone: 'expired' },
}

const eventLabels: Record<string, string> = {
  CASE_CREATED: '周期建立',
  REMINDER_30: '30 天提醒',
  REMINDER_15: '15 天提醒',
  REMINDER_7: '7 天提醒',
  REMINDER_1: '1 天提醒',
  PROPOSAL_GENERATED: '提案生成',
  RENEWED: '确认续费',
  LOST: '流失归档',
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

function formatMoney(fen: number | null | undefined): string {
  if (fen === null || fen === undefined) return '—'
  return `¥${(fen / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: fen % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function statusLabel(item: ProviderRenewalCaseSummary): string {
  if (item.status === 'PROPOSAL_READY') return '提案已就绪'
  if (item.status === 'RENEWED') return '已续费'
  if (item.status === 'LOST') return '已流失'
  return '经营中'
}

function lossReasonLabel(reason: ProviderRenewalLossReason | null): string {
  return overview.value?.lossReasons.find((item) => item.code === reason)?.label ?? '其他原因'
}

async function load(focusCaseId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderRenewals(focusCaseId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '续费经营中心加载失败'
  } finally {
    loading.value = false
  }
}

async function selectCase(caseId: string): Promise<void> {
  if (busy.value || focus.value?.id === caseId) return
  busy.value = true
  try {
    overview.value = await fetchProviderRenewals(caseId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '续费机会切换失败'
  } finally {
    busy.value = false
  }
}

async function scanNow(): Promise<void> {
  if (busy.value || !overview.value?.permissions.canScan) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await scanProviderRenewals()
    uni.showToast({ title: '续费节点已校准', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '续费节点扫描失败'
  } finally {
    busy.value = false
  }
}

function openSheet(mode: SheetMode): void {
  if (!focus.value || focus.value.status === 'RENEWED' || focus.value.status === 'LOST') return
  confirmationChecked.value = false
  sheetMode.value = mode
  if (mode === 'RENEWED') {
    acceptedPackageCode.value = focus.value.proposal?.recommendedPackageCode
      ?? focus.value.currentPackageCode
  }
}

function closeSheet(): void {
  if (!busy.value) sheetMode.value = null
}

async function submitSheet(): Promise<void> {
  const item = focus.value
  if (!item || !sheetMode.value || busy.value) return
  if (!confirmationChecked.value) {
    uni.showToast({ title: '请先完成强确认', icon: 'none' })
    return
  }
  if (sheetMode.value === 'LOST') {
    if (lossDetail.value.trim().length < 5) {
      uni.showToast({ title: '请补充流失事实', icon: 'none' })
      return
    }
    if (recoverable.value && recoveryAction.value.trim().length < 5) {
      uni.showToast({ title: '请填写可挽回动作', icon: 'none' })
      return
    }
  }
  busy.value = true
  errorMessage.value = ''
  try {
    if (sheetMode.value === 'PROPOSAL') {
      overview.value = await generateProviderRenewalProposal({
        caseId: item.id,
        expectedVersion: item.version,
      })
      uni.showToast({ title: '证据化提案已生成', icon: 'success' })
    } else if (sheetMode.value === 'RENEWED') {
      overview.value = await closeProviderRenewal({
        caseId: item.id,
        expectedVersion: item.version,
        outcome: 'RENEWED',
        acceptedPackageCode: acceptedPackageCode.value,
      })
      uni.showToast({ title: '续费与佣金已入账', icon: 'success' })
    } else {
      overview.value = await closeProviderRenewal({
        caseId: item.id,
        expectedVersion: item.version,
        outcome: 'LOST',
        lossReason: lossReason.value,
        lossDetail: lossDetail.value.trim(),
        recoverable: recoverable.value,
        recoveryAction: recoverable.value ? recoveryAction.value.trim() : undefined,
      })
      uni.showToast({ title: '流失事实已归档', icon: 'success' })
    }
    sheetMode.value = null
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '续费经营操作失败'
  } finally {
    busy.value = false
  }
}

onLoad((query) => {
  const focusCaseId = typeof query?.focusCaseId === 'string'
    ? query.focusCaseId
    : undefined
  void load(focusCaseId)
})
</script>

<template>
  <view class="renewal-shell">
    <view class="topbar">
      <button class="back" @click="goBack">‹</button>
      <view class="brand">
        <view class="brand-mark">R</view>
        <view><text>Renewal Revenue OS</text><small>城市续费经营中心</small></view>
      </view>
      <view class="sync"><i /> 自动监测</view>
    </view>

    <scroll-view scroll-y class="viewport">
      <main class="content">
        <view v-if="errorMessage" class="error-bar">
          <text>{{ errorMessage }}</text><button @click="load(focus?.id)">刷新</button>
        </view>

        <section class="hero">
          <view class="hero-noise" />
          <view class="hero-copy">
            <view class="eyebrow"><b>REVENUE CONTINUITY</b><text>{{ overview?.city.name ?? '城市服务中心' }}</text></view>
            <text class="hero-title">把到期日，变成<br /><em>价值被再次确认</em>的时刻</text>
            <text class="hero-desc">30 / 15 / 7 / 1 天主动经营，用真实交付证据生成提案；续费进入佣金账本，流失进入可复盘事实。</text>
            <view class="hero-actions">
              <button :class="{ disabled: busy || !overview?.permissions.canScan }" @click="scanNow">
                {{ busy ? '正在校准…' : '校准续费节点' }} <text>↻</text>
              </button>
              <small>上次扫描 {{ formatDate(overview?.lastScanAt) }}</small>
            </view>
          </view>
          <view class="hero-orbit">
            <view class="orbit-ring ring-a" /><view class="orbit-ring ring-b" />
            <view class="orbit-core"><small>RENEWAL</small><text>{{ overview?.metrics.renewalRate ?? '—' }}<i>%</i></text><b>历史续费率</b></view>
            <view class="orbit-chip chip-a"><b>{{ overview?.metrics.active ?? '—' }}</b><small>活跃机会</small></view>
            <view class="orbit-chip chip-b"><b>{{ formatMoney(overview?.metrics.renewalRevenueFen) }}</b><small>已确认收入</small></view>
          </view>
        </section>

        <section class="metric-strip">
          <view><small>DUE ≤ 30D</small><text>{{ overview?.metrics.dueWithin30Days ?? '—' }}</text><b>即将到期</b></view>
          <view class="alert"><small>CRITICAL</small><text>{{ overview?.metrics.critical ?? '—' }}</text><b>7 天内</b></view>
          <view><small>PROPOSAL</small><text>{{ overview?.metrics.proposalReady ?? '—' }}</text><b>提案已就绪</b></view>
          <view><small>COMMISSION</small><text>{{ formatMoney(overview?.metrics.estimatedCommissionFen) }}</text><b>预计续费佣金</b></view>
        </section>

        <section class="reminder-rail">
          <view class="rail-head">
            <view><small>LIFECYCLE PLAYBOOK</small><text>四段续费节奏</text></view>
            <b>只追加提醒 · 不伪造触达</b>
          </view>
          <view class="rail-track">
            <view v-for="(bucket, index) in overview?.reminderBuckets" :key="bucket.type" class="rail-step">
              <view class="step-day"><small>D−</small><text>{{ bucket.days }}</text></view>
              <span><b>{{ bucket.label }}</b><small>{{ bucket.meaning }}</small></span>
              <i>{{ bucket.caseCount }}</i><em v-if="index < 3">→</em>
            </view>
          </view>
        </section>

        <view v-if="loading" class="loading-card"><i /><text>正在重建城市续费资产与价值证据…</text></view>

        <template v-else>
          <view class="workspace">
            <aside class="case-panel">
              <view class="panel-head">
                <view><small>RENEWAL PIPELINE</small><text>到期机会</text></view><b>{{ activeCases.length }}</b>
              </view>
              <scroll-view scroll-y class="case-list">
                <button
                  v-for="item in activeCases"
                  :key="item.id"
                  :class="['case-card', riskMeta[item.riskBand].tone, { active: focus?.id === item.id }]"
                  @click="selectCase(item.id)"
                >
                  <view class="case-top"><text>{{ riskMeta[item.riskBand].label }}</text><b>{{ item.daysRemaining < 0 ? `逾期 ${Math.abs(item.daysRemaining)}d` : `D−${item.daysRemaining}` }}</b></view>
                  <strong>{{ item.merchantName }}</strong>
                  <small>{{ item.currentPackageName }} · {{ item.owner.displayName }}</small>
                  <view class="case-foot"><text>{{ statusLabel(item) }}</text><b>{{ formatMoney(item.currentPriceFen) }}</b></view>
                </button>
                <view v-if="activeCases.length === 0" class="empty-active"><b>✓</b><text>当前没有待处理续费机会</text></view>
              </scroll-view>
              <view class="history-line">历史结果 {{ closedCases.length }} 项 <text>{{ overview?.metrics.renewed }} 续费 / {{ overview?.metrics.lost }} 流失</text></view>
            </aside>

            <section v-if="focus" class="focus-area">
              <view class="account-card">
                <view :class="['account-band', riskMeta[focus.riskBand].tone]" />
                <view class="account-head">
                  <view class="account-copy">
                    <view class="tag-row"><text>{{ riskMeta[focus.riskBand].label }}</text><text>{{ statusLabel(focus) }}</text><text>v{{ focus.version }}</text></view>
                    <strong>{{ focus.merchantName }}</strong>
                    <small>{{ focus.currentPackageName }} · 服务至 {{ formatDate(focus.serviceEndsAt) }}</small>
                  </view>
                  <view :class="['day-orb', riskMeta[focus.riskBand].tone]">
                    <small>{{ focus.daysRemaining < 0 ? 'OVERDUE' : 'DAYS LEFT' }}</small>
                    <text>{{ Math.abs(focus.daysRemaining) }}</text>
                    <b>{{ focus.daysRemaining < 0 ? '天已逾期' : '天后到期' }}</b>
                  </view>
                </view>
                <view class="account-facts">
                  <view><small>当前套餐</small><text>{{ focus.currentPackageCode }}</text><b>{{ formatMoney(focus.currentPriceFen) }}/年</b></view>
                  <view><small>续费负责人</small><text>{{ focus.owner.displayName }}</text><b>{{ focus.source === 'SIGNED_CONTRACT' ? '签约合同同步' : '历史周期导入' }}</b></view>
                  <view><small>最新提醒</small><text>{{ focus.latestReminder?.replace('DAY_', 'D−') ?? '尚未进入节点' }}</text><b>{{ overview?.policy.notificationDelivery === 'OUTBOX_PENDING_CONNECTOR' ? '待连接器投递' : '' }}</b></view>
                  <view><small>服务周期</small><text>{{ formatDate(focus.serviceStartedAt) }}</text><b>至 {{ formatDate(focus.serviceEndsAt) }}</b></view>
                </view>
              </view>

              <view class="decision-grid">
                <section class="evidence-card">
                  <view class="section-head"><view><small>VALUE EVIDENCE</small><text>价值证据账本</text></view><b>{{ focus.evidence.evidence.length }}</b></view>
                  <view class="evidence-score">
                    <view><small>WORK ORDERS</small><text>{{ focus.evidence.completedWorkOrders }}</text><b>已完成工单</b></view>
                    <view><small>GEO SCORE</small><text>{{ focus.evidence.geoScore ?? '—' }}</text><b>最新健康分</b></view>
                    <view><small>ONLINE SKILLS</small><text>{{ focus.evidence.onlineSkills }}</text><b>在线能力</b></view>
                    <view><small>CONFIRMED GMV</small><text>{{ formatMoney(focus.evidence.completedGmvFen) }}</text><b>确认交易事实</b></view>
                  </view>
                  <view class="evidence-list">
                    <view v-for="line in focus.evidence.evidence" :key="line"><i>✓</i><text>{{ line }}</text></view>
                  </view>
                  <small class="measured">证据采样 {{ formatDate(focus.evidence.measuredAt) }} · {{ overview?.policy.recommendationGuardrail }}</small>
                </section>

                <section class="proposal-card">
                  <template v-if="focus.proposal">
                    <view class="proposal-kicker"><text>{{ focus.proposal.upgradeRecommended ? 'UPGRADE SIGNAL' : 'RENEW SIGNAL' }}</text><b>提案 v{{ focus.proposal.version }}</b></view>
                    <strong>{{ focus.proposal.recommendation }}</strong>
                    <p>{{ focus.proposal.valueNarrative }}</p>
                    <view class="package-shift">
                      <span><small>CURRENT</small><b>{{ focus.proposal.currentPackageCode }}</b></span><i>→</i>
                      <span class="target"><small>RECOMMENDED</small><b>{{ focus.proposal.recommendedPackageCode }}</b></span>
                    </view>
                    <view class="proposal-price"><span><small>年度提案</small><text>{{ formatMoney(focus.proposal.offerPriceFen) }}</text></span><b>{{ focus.proposal.createdBy }}<small>{{ formatDate(focus.proposal.createdAt) }}</small></b></view>
                  </template>
                  <template v-else>
                    <view class="proposal-empty"><b>✦</b><small>EVIDENCE FIRST</small><text>尚未生成续费提案</text><p>系统会冻结当前服务证据，再给出保持套餐或升级建议。</p></view>
                  </template>
                  <view v-if="focus.status === 'MONITORING' || focus.status === 'PROPOSAL_READY'" class="proposal-actions">
                    <button class="ghost" @click="openSheet('LOST')">记录流失</button>
                    <button v-if="!focus.proposal" class="primary" @click="openSheet('PROPOSAL')">生成证据化提案 <text>→</text></button>
                    <button v-else class="primary success" @click="openSheet('RENEWED')">确认续费并计佣 <text>→</text></button>
                  </view>
                  <view v-else-if="focus.status === 'RENEWED'" class="closed-result renewed">
                    <b>续费已确认</b><text>{{ focus.renewedPackageCode }} · {{ formatMoney(focus.renewedPriceFen) }}</text>
                    <small v-if="focus.commission">预计佣金 {{ formatMoney(focus.commission.estimatedFen) }} · {{ focus.commission.rateBps / 100 }}%</small>
                  </view>
                  <view v-else class="closed-result lost">
                    <b>流失事实已归档</b><text>{{ lossReasonLabel(focus.lossReason) }}</text><small>{{ focus.lossDetail }}</small>
                  </view>
                </section>
              </view>

              <view class="lower-grid">
                <section class="timeline-card">
                  <view class="section-head"><view><small>APPEND-ONLY TRAIL</small><text>续费证据链</text></view><b>{{ overview?.events.length ?? 0 }}</b></view>
                  <view class="timeline">
                    <view v-for="event in overview?.events" :key="event.id">
                      <i>{{ event.sequence }}</i>
                      <span><b>{{ eventLabels[event.type] ?? event.type }}</b><text>{{ event.summary }}</text><small>{{ event.actorName }} · {{ formatDate(event.createdAt) }}</small></span>
                    </view>
                  </view>
                </section>
                <section class="loss-card">
                  <small>CHURN INTELLIGENCE</small><text>流失原因不是备注，是经营输入</text>
                  <view v-for="item in overview?.lossReasons.filter(({ count }) => count > 0)" :key="item.code">
                    <span><b>{{ item.label }}</b><small>{{ item.code }}</small></span><i>{{ item.count }}</i>
                  </view>
                  <p>可挽回机会必须带负责人和下一动作；不可挽回原因也会进入城市复盘，而不是从漏斗消失。</p>
                </section>
              </view>
            </section>
          </view>
        </template>
      </main>
    </scroll-view>

    <view v-if="sheetMode" class="sheet-mask" @click="closeSheet">
      <view class="sheet" @click.stop>
        <view class="sheet-head">
          <view><small>STRONG CONFIRMATION</small><text>{{ sheetMode === 'PROPOSAL' ? '生成客户提案' : sheetMode === 'RENEWED' ? '确认续费结果' : '归档流失原因' }}</text></view>
          <button @click="closeSheet">×</button>
        </view>
        <view class="sheet-account"><b>{{ focus?.merchantName }}</b><text>{{ focus?.currentPackageName }} · v{{ focus?.version }}</text><small>操作人、规则版本、证据与结果将进入不可变事件链。</small></view>

        <template v-if="sheetMode === 'PROPOSAL'">
          <view class="proposal-confirm">
            <b>系统将冻结以下事实</b>
            <view v-for="line in focus?.evidence.evidence" :key="line"><i>✓</i><text>{{ line }}</text></view>
            <small>输出只是建议，不会自动发送给商家，也不承诺收益或排名。</small>
          </view>
        </template>

        <template v-else-if="sheetMode === 'RENEWED'">
          <text class="field-label">商家确认接受的套餐</text>
          <view class="package-options">
            <button
              v-for="item in overview?.packages"
              :key="item.code"
              :class="{ active: acceptedPackageCode === item.code }"
              @click="acceptedPackageCode = item.code as typeof acceptedPackageCode"
            >
              <span><b>{{ item.code }}</b><small>{{ item.name }}</small></span><text>{{ formatMoney(item.listPriceFen) }}</text>
            </button>
          </view>
          <view class="commission-note"><b>佣金自动联动</b><text>确认后按当前续费规则写入预计佣金；财务结算仍通过独立追加流水完成。</text></view>
        </template>

        <template v-else>
          <text class="field-label">标准流失原因</text>
          <scroll-view scroll-x class="reason-scroll">
            <button
              v-for="item in overview?.lossReasons"
              :key="item.code"
              :class="{ active: lossReason === item.code }"
              @click="lossReason = item.code"
            >{{ item.label }}</button>
          </scroll-view>
          <text class="field-label">事实说明</text>
          <textarea v-model="lossDetail" maxlength="1200" placeholder="记录商家原话、决策背景和已确认事实" />
          <button class="recover-row" :class="{ active: recoverable }" @click="recoverable = !recoverable">
            <i>{{ recoverable ? '✓' : '' }}</i><span><b>这是可挽回机会</b><small>开启后必须留下可执行的下一动作。</small></span>
          </button>
          <template v-if="recoverable">
            <text class="field-label">可挽回动作</text>
            <textarea v-model="recoveryAction" class="short" maxlength="600" placeholder="负责人、时间点、方案与判断标准" />
          </template>
        </template>

        <button class="confirm-row" :class="{ checked: confirmationChecked }" @click="confirmationChecked = !confirmationChecked">
          <i>{{ confirmationChecked ? '✓' : '' }}</i>
          <span><b>我已核对商家、版本和当前服务事实</b><small>{{ sheetMode === 'PROPOSAL' ? '生成后仍需人工审核与发送。' : '该结果会影响续费收入、佣金或流失分析。' }}</small></span>
        </button>
        <button class="sheet-submit" :class="{ disabled: !confirmationChecked || busy }" @click="submitSheet">
          {{ busy ? '正在写入经营证据…' : sheetMode === 'PROPOSAL' ? '强确认并生成提案' : sheetMode === 'RENEWED' ? '强确认续费并写入佣金' : '强确认并归档流失' }} <text>→</text>
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
button{margin:0;padding:0;border:0;line-height:inherit;background:transparent}button::after{display:none}.renewal-shell{min-height:100vh;color:#13201f;background:radial-gradient(circle at 7% 18%,rgba(53,174,136,.09),transparent 27%),linear-gradient(135deg,#f0f4f2,#f8f8f5 52%,#edf2ef);font-family:Inter,"PingFang SC",sans-serif}.topbar{height:78px;padding:0 28px;display:flex;align-items:center;gap:14px;color:#fff;background:#071a18}.back{width:40px;height:40px;border:1px solid #24413d;border-radius:13px;color:#fff;font-size:23px}.brand{display:flex;align-items:center;gap:11px}.brand-mark{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:13px;color:#08201c;background:linear-gradient(140deg,#78edbd,#d8f67d);font-size:13px;font-weight:950}.brand text,.brand small{display:block}.brand text{font-size:13px;font-weight:850}.brand small{margin-top:3px;color:#718b86;font-size:6px}.sync{margin-left:auto;padding:9px 12px;border:1px solid #24413d;border-radius:99px;color:#8aa49e;font-size:7px}.sync i{display:inline-block;width:6px;height:6px;margin-right:7px;border-radius:50%;background:#6ee3b1;box-shadow:0 0 0 5px rgba(110,227,177,.1)}.viewport{height:calc(100vh - 78px)}.content{width:min(1392px,calc(100% - 48px));margin:auto;padding:26px 0 80px}.error-bar{margin-bottom:12px;padding:12px 15px;display:flex;justify-content:space-between;border:1px solid #ffd1d6;border-radius:12px;color:#a92e43;background:#fff1f3;font-size:8px}.hero{position:relative;min-height:290px;padding:38px 42px;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 470px;align-items:center;border-radius:31px;color:#fff;background:linear-gradient(118deg,#0a211e,#123a32 59%,#615c24);box-shadow:0 26px 58px rgba(17,51,44,.2)}.hero-noise{position:absolute;inset:0;opacity:.16;background-image:radial-gradient(rgba(255,255,255,.38) .6px,transparent .6px);background-size:8px 8px}.hero-copy,.hero-orbit{position:relative}.eyebrow{display:flex;align-items:center;gap:9px}.eyebrow b{padding:5px 7px;border-radius:99px;color:#0b241f;background:#83eabb;font-size:6px;letter-spacing:1px}.eyebrow text{color:#809c95;font-size:7px}.hero-title{display:block;margin-top:18px;font-size:34px;line-height:1.22;font-weight:900;letter-spacing:-1.5px}.hero-title em{color:#d8ef78;font-style:normal}.hero-desc{display:block;max-width:650px;margin-top:12px;color:#9bb0ab;font-size:9px;line-height:1.75}.hero-actions{margin-top:21px;display:flex;align-items:center;gap:14px}.hero-actions button{min-width:190px;padding:13px 16px;display:flex;justify-content:space-between;border-radius:13px;color:#12201e;background:#fff;font-size:9px;font-weight:850}.disabled{opacity:.45}.hero-actions small{color:#809a94;font-size:7px}.hero-orbit{height:235px}.orbit-ring{position:absolute;left:50%;top:50%;border:1px solid rgba(255,255,255,.11);border-radius:50%;transform:translate(-50%,-50%)}.ring-a{width:220px;height:220px}.ring-b{width:155px;height:155px}.orbit-core{position:absolute;left:50%;top:50%;width:122px;height:122px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;color:#11241f;background:linear-gradient(145deg,#dff484,#76e9b8);box-shadow:0 20px 45px rgba(37,139,110,.28);transform:translate(-50%,-50%)}.orbit-core small,.orbit-core b{font-size:6px}.orbit-core text{margin:4px 0;font-size:28px;font-weight:950}.orbit-core text i{font-size:10px;font-style:normal}.orbit-chip{position:absolute;padding:11px 13px;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:rgba(255,255,255,.07);backdrop-filter:blur(8px)}.orbit-chip b,.orbit-chip small{display:block}.orbit-chip b{font-size:12px}.orbit-chip small{margin-top:3px;color:#91aaa4;font-size:6px}.chip-a{left:7px;top:24px}.chip-b{right:0;bottom:26px}.metric-strip{margin-top:15px;padding:9px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;border:1px solid #dfe7e3;border-radius:19px;background:rgba(255,255,255,.88);box-shadow:0 12px 28px rgba(25,61,52,.06)}.metric-strip>view{padding:14px 16px;border-radius:13px;background:#f4f7f5}.metric-strip>view.alert{background:#fff2e8}.metric-strip small,.metric-strip b{display:block}.metric-strip small{color:#8a9995;font-size:6px;font-weight:850;letter-spacing:1px}.metric-strip text{display:block;margin-top:6px;font-size:21px;font-weight:950}.metric-strip b{margin-top:3px;color:#8a9995;font-size:7px;font-weight:500}.reminder-rail{margin-top:15px;padding:18px;border:1px solid #dfe7e3;border-radius:21px;background:rgba(255,255,255,.91);box-shadow:0 12px 28px rgba(25,61,52,.055)}.rail-head,.section-head,.panel-head{display:flex;align-items:center;justify-content:space-between}.rail-head small,.rail-head text,.section-head small,.section-head text,.panel-head small,.panel-head text{display:block}.rail-head small,.section-head small,.panel-head small{color:#2ca87e;font-size:6px;font-weight:900;letter-spacing:1.1px}.rail-head text,.section-head text,.panel-head text{margin-top:5px;font-size:15px;font-weight:900}.rail-head>b{color:#91a09c;font-size:6px}.rail-track{margin-top:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.rail-step{position:relative;padding:12px;display:flex;align-items:center;gap:10px;border-radius:14px;background:#f2f6f4}.step-day{width:42px;height:42px;flex:0 0 42px;display:flex;align-items:baseline;justify-content:center;border-radius:13px;color:#fff;background:#183b34}.step-day small{font-size:5px}.step-day text{font-size:16px;font-weight:950}.rail-step span{min-width:0}.rail-step span b,.rail-step span small{display:block}.rail-step span b{font-size:8px}.rail-step span small{margin-top:4px;overflow:hidden;color:#8d9a97;font-size:6px;white-space:nowrap;text-overflow:ellipsis}.rail-step>i{margin-left:auto;width:25px;height:25px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#246f59;background:#dff3ea;font-size:7px;font-style:normal;font-weight:900}.rail-step>em{position:absolute;right:-17px;color:#a9b8b3;font-size:11px;font-style:normal}.loading-card{margin-top:15px;min-height:260px;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:22px;background:#fff}.loading-card i{width:9px;height:9px;border-radius:50%;background:#35b98e;box-shadow:0 0 0 8px rgba(53,185,142,.12)}.loading-card text{color:#82908c;font-size:9px}.workspace{margin-top:15px;display:grid;grid-template-columns:330px minmax(0,1fr);gap:15px}.case-panel,.account-card,.evidence-card,.proposal-card,.timeline-card,.loss-card{border:1px solid #dfe7e3;border-radius:22px;background:rgba(255,255,255,.93);box-shadow:0 15px 35px rgba(25,61,52,.065)}.case-panel{padding:18px}.panel-head>b,.section-head>b{width:27px;height:27px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#61716c;background:#edf2f0;font-size:7px}.case-list{height:635px;margin-top:15px}.case-card{width:100%;margin-bottom:8px;padding:13px;border:1px solid #e0e7e4;border-left:4px solid #5cbd9d;border-radius:15px;text-align:left;background:#fafcfb}.case-card.watch{border-left-color:#d7a43a}.case-card.risk{border-left-color:#e47b37}.case-card.critical,.case-card.expired{border-left-color:#de4d55}.case-card.active{border-color:#72c8ac;box-shadow:0 8px 20px rgba(40,151,116,.11);background:#f0faf6}.case-top{display:flex;justify-content:space-between}.case-top text{padding:4px 6px;border-radius:7px;color:#27775e;background:#dcf3ea;font-size:6px;font-weight:850}.case-card.risk .case-top text,.case-card.watch .case-top text{color:#a15f1c;background:#fff0dc}.case-card.critical .case-top text,.case-card.expired .case-top text{color:#ae3342;background:#ffe8eb}.case-top b{font-size:9px}.case-card strong,.case-card>small{display:block}.case-card strong{margin-top:11px;font-size:10px}.case-card>small{margin-top:5px;color:#7e8b87;font-size:7px}.case-foot{margin-top:11px;padding-top:9px;display:flex;justify-content:space-between;border-top:1px solid #e8eeeb}.case-foot text{color:#7b8985;font-size:7px}.case-foot b{font-size:8px}.empty-active{padding:60px 10px;text-align:center}.empty-active b{width:46px;height:46px;margin:auto;display:flex;align-items:center;justify-content:center;border-radius:17px;color:#fff;background:#28aa82}.empty-active text{display:block;margin-top:12px;font-size:8px}.history-line{padding:10px;border-radius:11px;color:#66756f;background:#f1f5f3;font-size:7px}.history-line text{float:right;color:#96a39f}.focus-area{min-width:0}.account-card{overflow:hidden}.account-band{height:5px;background:#43bb93}.account-band.watch{background:#dcaa3f}.account-band.risk{background:#eb7e3a}.account-band.critical,.account-band.expired{background:#df4b55}.account-head{padding:23px;display:flex;align-items:center;gap:18px;color:#fff;background:linear-gradient(118deg,#0d2925,#1b4b40 68%,#666126)}.account-copy{min-width:0}.tag-row{display:flex;gap:6px}.tag-row text{padding:4px 6px;border:1px solid rgba(255,255,255,.14);border-radius:99px;color:#a3b8b2;font-size:6px}.account-copy strong,.account-copy>small{display:block}.account-copy strong{margin-top:12px;font-size:19px}.account-copy>small{margin-top:6px;color:#9db2ac;font-size:8px}.day-orb{width:91px;height:91px;margin-left:auto;flex:0 0 91px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;color:#103027;background:linear-gradient(145deg,#dcf180,#71e5b4)}.day-orb.risk,.day-orb.watch{background:linear-gradient(145deg,#ffe28a,#f5a85f)}.day-orb.critical,.day-orb.expired{color:#fff;background:linear-gradient(145deg,#f17865,#ce3d59)}.day-orb small,.day-orb b{font-size:5px}.day-orb text{margin:3px 0;font-size:25px;font-weight:950}.account-facts{padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.account-facts view{padding:12px;border-radius:12px;background:#f2f6f4}.account-facts small,.account-facts text,.account-facts b{display:block}.account-facts small{color:#8d9a96;font-size:6px}.account-facts text{margin-top:5px;font-size:9px;font-weight:850}.account-facts b{margin-top:3px;overflow:hidden;color:#85928e;font-size:6px;white-space:nowrap;text-overflow:ellipsis}.decision-grid{margin-top:15px;display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:15px}.evidence-card,.proposal-card,.timeline-card,.loss-card{padding:19px}.evidence-score{margin-top:15px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.evidence-score>view{padding:11px;border-radius:12px;background:#f2f6f4}.evidence-score small,.evidence-score text,.evidence-score b{display:block}.evidence-score small{color:#8f9c98;font-size:5px;font-weight:850}.evidence-score text{margin-top:5px;font-size:15px;font-weight:950}.evidence-score b{margin-top:3px;color:#899692;font-size:6px;font-weight:500}.evidence-list{margin-top:12px}.evidence-list>view{margin-top:6px;padding:9px;display:flex;align-items:center;gap:8px;border-radius:10px;background:#f8faf9}.evidence-list i{width:19px;height:19px;display:flex;align-items:center;justify-content:center;border-radius:7px;color:#fff;background:#32ad85;font-size:6px;font-style:normal}.evidence-list text{font-size:7px}.measured{display:block;margin-top:10px;color:#8a9793;font-size:6px;line-height:1.6}.proposal-card{display:flex;flex-direction:column;background:linear-gradient(145deg,#fff,#f3f9f6)}.proposal-kicker{display:flex;justify-content:space-between}.proposal-kicker text{padding:5px 7px;border-radius:99px;color:#113229;background:#d9f3e8;font-size:6px;font-weight:900;letter-spacing:.8px}.proposal-kicker b{color:#8a9793;font-size:6px}.proposal-card>strong{margin-top:14px;font-size:16px;line-height:1.35}.proposal-card>p{margin:8px 0 0;color:#75837f;font-size:7px;line-height:1.7}.package-shift{margin-top:15px;padding:12px;display:flex;align-items:center;justify-content:space-between;border-radius:13px;color:#fff;background:#102b26}.package-shift span small,.package-shift span b{display:block}.package-shift span small{color:#79938c;font-size:5px}.package-shift span b{margin-top:4px;font-size:12px}.package-shift i{color:#829a94;font-style:normal}.package-shift .target{text-align:right}.package-shift .target b{color:#d9ee79}.proposal-price{margin-top:11px;padding:10px;display:flex;align-items:center;justify-content:space-between;border-radius:11px;background:#edf4f1}.proposal-price span small,.proposal-price span text,.proposal-price>b small{display:block}.proposal-price span small{color:#879490;font-size:5px}.proposal-price span text{margin-top:3px;font-size:14px;font-weight:950}.proposal-price>b{font-size:6px;text-align:right}.proposal-price>b small{margin-top:3px;color:#889591;font-size:5px}.proposal-empty{margin:auto;padding:25px 5px;text-align:center}.proposal-empty>b{width:52px;height:52px;margin:auto;display:flex;align-items:center;justify-content:center;border-radius:18px;color:#17382f;background:#dff2eb;font-size:20px}.proposal-empty small,.proposal-empty text{display:block}.proposal-empty small{margin-top:13px;color:#2da77d;font-size:6px;font-weight:900;letter-spacing:1px}.proposal-empty text{margin-top:7px;font-size:14px;font-weight:900}.proposal-empty p{color:#84918d;font-size:7px;line-height:1.6}.proposal-actions{margin-top:auto;padding-top:14px;display:flex;gap:8px}.proposal-actions button{min-height:43px;display:flex;align-items:center;justify-content:center;border-radius:12px;font-size:8px;font-weight:850}.proposal-actions .ghost{width:105px;border:1px solid #dbe4e0;color:#687670}.proposal-actions .primary{flex:1;justify-content:space-between;padding:0 14px;color:#fff;background:#183f36}.proposal-actions .success{background:linear-gradient(100deg,#2ead81,#18775c)}.closed-result{margin-top:auto;padding:13px;border-radius:13px}.closed-result b,.closed-result text,.closed-result small{display:block}.closed-result b{font-size:9px}.closed-result text{margin-top:5px;font-size:8px}.closed-result small{margin-top:5px;color:#668078;font-size:6px;line-height:1.5}.closed-result.renewed{color:#176b52;background:#e5f6ef}.closed-result.lost{color:#984052;background:#fff0f2}.lower-grid{margin-top:15px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:15px}.timeline{margin-top:17px}.timeline>view{position:relative;padding:0 0 17px 37px}.timeline>view:not(:last-child)::before{content:"";position:absolute;left:13px;top:25px;bottom:0;width:1px;background:#dce5e1}.timeline i{position:absolute;left:0;top:0;width:27px;height:27px;display:flex;align-items:center;justify-content:center;border-radius:9px;color:#fff;background:#2faa82;font-size:6px;font-style:normal;font-weight:900}.timeline span b,.timeline span text,.timeline span small{display:block}.timeline span b{font-size:8px}.timeline span text{margin-top:3px;color:#65736f;font-size:7px}.timeline span small{margin-top:4px;color:#929e9a;font-size:6px}.loss-card>small{color:#cf7550;font-size:6px;font-weight:900;letter-spacing:1px}.loss-card>text{display:block;margin:7px 0 14px;font-size:13px;font-weight:900}.loss-card>view{margin-top:7px;padding:10px;display:flex;align-items:center;justify-content:space-between;border-radius:11px;background:#f5f6f3}.loss-card span b,.loss-card span small{display:block}.loss-card span b{font-size:7px}.loss-card span small{margin-top:3px;color:#969e9a;font-size:5px}.loss-card>view i{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#a76043;background:#ffeadf;font-size:7px;font-style:normal;font-weight:900}.loss-card p{margin:12px 0 0;color:#87938f;font-size:7px;line-height:1.65}.sheet-mask{position:fixed;z-index:30;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(3,17,14,.66);backdrop-filter:blur(9px)}.sheet{width:min(680px,100%);max-height:88vh;padding:21px;overflow-y:auto;border-radius:25px;background:#fff;box-shadow:0 28px 80px rgba(7,28,23,.3)}.sheet-head{display:flex;align-items:center;justify-content:space-between}.sheet-head small,.sheet-head text{display:block}.sheet-head small{color:#269f78;font-size:6px;font-weight:900;letter-spacing:1px}.sheet-head text{margin-top:5px;font-size:16px;font-weight:900}.sheet-head button{width:34px;height:34px;border-radius:11px;color:#747f7c;font-size:20px;background:#f0f4f2}.sheet-account{margin-top:15px;padding:13px;border-radius:13px;background:#edf7f3}.sheet-account b,.sheet-account text,.sheet-account small{display:block}.sheet-account b{font-size:9px}.sheet-account text{margin-top:4px;font-size:7px}.sheet-account small{margin-top:6px;color:#6c817a;font-size:6px}.proposal-confirm{margin-top:14px;padding:13px;border-radius:13px;background:#f6f8f7}.proposal-confirm>b{display:block;margin-bottom:9px;font-size:8px}.proposal-confirm>view{margin-top:6px;display:flex;gap:8px;font-size:7px}.proposal-confirm i{color:#24a277;font-style:normal;font-weight:900}.proposal-confirm>small{display:block;margin-top:10px;color:#899591;font-size:6px}.field-label{display:block;margin:14px 0 7px;color:#74817d;font-size:7px;font-weight:850}.package-options{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.package-options button{padding:11px;display:flex;align-items:center;justify-content:space-between;border:1px solid #dfe6e3;border-radius:12px;text-align:left}.package-options button.active{border-color:#45b78f;background:#edfaf5}.package-options span b,.package-options span small{display:block}.package-options span b{font-size:9px}.package-options span small{margin-top:3px;color:#899591;font-size:6px}.package-options button>text{font-size:8px;font-weight:900}.commission-note{margin-top:11px;padding:11px;border-radius:11px;color:#276b56;background:#e6f6f0}.commission-note b,.commission-note text{display:block}.commission-note b{font-size:7px}.commission-note text{margin-top:4px;font-size:6px;line-height:1.5}.reason-scroll{width:100%;white-space:nowrap}.reason-scroll button{margin-right:6px;padding:8px 10px;border:1px solid #dfe6e3;border-radius:99px;color:#6b7974;font-size:7px}.reason-scroll button.active{border-color:#d95a5f;color:#a32f3b;background:#fff0f1}.sheet textarea{width:100%;height:92px;padding:11px;box-sizing:border-box;border:1px solid #dfe6e3;border-radius:12px;font-size:8px;background:#f8faf9}.sheet textarea.short{height:70px}.recover-row,.confirm-row{width:100%;margin-top:11px;padding:11px;display:flex;align-items:center;gap:10px;border-radius:12px;text-align:left;background:#f1f5f3}.recover-row>i,.confirm-row>i{width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:2px solid #cbd6d1;border-radius:7px;color:#fff;font-size:8px;font-style:normal}.recover-row.active>i{border-color:#e07b52;background:#e07b52}.confirm-row.checked>i{border-color:#269f78;background:#269f78}.recover-row span b,.recover-row span small,.confirm-row span b,.confirm-row span small{display:block}.recover-row span b,.confirm-row span b{font-size:7px}.recover-row span small,.confirm-row span small{margin-top:3px;color:#87938f;font-size:6px}.sheet-submit{width:100%;margin-top:10px;padding:14px 16px;display:flex;justify-content:space-between;border-radius:13px;color:#fff;background:linear-gradient(100deg,#2bad80,#176d55);font-size:9px;font-weight:900}.sheet-submit.disabled{opacity:.45}
@media(max-width:760px){.topbar{height:70px;padding:0 14px}.sync{font-size:0}.viewport{height:calc(100vh - 70px)}.content{width:calc(100% - 24px);padding-top:13px}.hero{min-height:440px;padding:23px 19px;display:block}.hero-title{font-size:25px}.hero-orbit{height:180px;margin-top:16px}.ring-a{width:170px;height:170px}.ring-b{width:120px;height:120px}.orbit-core{width:95px;height:95px}.orbit-core text{font-size:22px}.chip-a{left:0;top:10px}.chip-b{right:0;bottom:14px}.metric-strip{grid-template-columns:repeat(2,1fr)}.reminder-rail{padding:14px}.rail-head>b{display:none}.rail-track{overflow-x:auto;display:flex;padding-bottom:3px}.rail-step{min-width:210px}.workspace{grid-template-columns:1fr}.case-list{height:auto;max-height:430px}.account-head{padding:18px 14px}.account-copy strong{font-size:15px}.day-orb{width:72px;height:72px;flex-basis:72px}.day-orb text{font-size:20px}.account-facts{grid-template-columns:repeat(2,1fr)}.decision-grid,.lower-grid{grid-template-columns:1fr}.evidence-score{grid-template-columns:repeat(2,1fr)}.package-options{grid-template-columns:1fr}.sheet-mask{padding:8px}.sheet{padding:17px;border-radius:23px}.proposal-actions{flex-wrap:wrap}.proposal-actions .ghost{width:100%;order:2}}
</style>
