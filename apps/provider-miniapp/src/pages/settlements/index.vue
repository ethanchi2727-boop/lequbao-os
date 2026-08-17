<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ProviderSettlementEventSummary,
  ProviderSettlementOverview,
  ProviderSettlementStatementSummary,
  ProviderSettlementStatus,
} from '@lequ/contracts'
import {
  fetchProviderSettlements,
  generateProviderSettlement,
  requestSettlementAdjustment,
  submitSettlementInvoice,
} from '../../services/settlements'

type Sheet = 'ADJUSTMENT' | 'INVOICE' | null

const overview = ref<ProviderSettlementOverview | null>(null)
const loading = ref(true)
const acting = ref(false)
const errorMessage = ref('')
const sheet = ref<Sheet>(null)
const adjustmentDirection = ref<'CREDIT' | 'DEBIT'>('CREDIT')
const adjustmentAmount = ref('')
const adjustmentReason = ref('')
const adjustmentEvidence = ref('')
const invoiceNo = ref('')
const sellerName = ref('上海乐趣城市服务有限公司')
const sellerTaxId = ref('9131**********6X')

const focus = computed(() => overview.value?.focusStatement ?? null)
const canEdit = computed(() =>
  overview.value?.permissions.canManage
  && focus.value?.status === 'PENDING_INVOICE',
)
const hasPendingAdjustment = computed(() =>
  focus.value?.adjustments.some(({ status }) => status === 'PENDING') ?? false,
)
const composition = computed(() => {
  const item = focus.value
  if (!item) return []
  return [
    {
      key: 'subscription',
      eyebrow: 'SUBSCRIPTION',
      label: '签约订阅分成',
      source: item.source.signingRevenueFen,
      rate: overview.value?.rules.signingShareBps ?? 0,
      value: item.shares.subscriptionShareFen,
      tone: 'mint',
    },
    {
      key: 'renewal',
      eyebrow: 'RETENTION',
      label: '续费服务分成',
      source: item.source.renewalRevenueFen,
      rate: overview.value?.rules.renewalShareBps ?? 0,
      value: item.shares.renewalShareFen,
      tone: 'violet',
    },
    {
      key: 'transaction',
      eyebrow: 'TRANSACTION',
      label: '交易服务分成',
      source: item.source.transactionGmvFen,
      rate: overview.value?.rules.transactionShareBps ?? 0,
      value: item.shares.transactionServiceShareFen,
      tone: 'amber',
    },
  ]
})
const maxComposition = computed(() => Math.max(
  1,
  ...composition.value.map(({ value }) => value),
))

const statusMeta: Record<ProviderSettlementStatus, {
  label: string
  short: string
  tone: string
  index: number
}> = {
  PENDING_INVOICE: { label: '待申请开票', short: '待开票', tone: 'amber', index: 1 },
  INVOICE_SUBMITTED: { label: '总部验票中', short: '验票中', tone: 'violet', index: 2 },
  READY_FOR_SETTLEMENT: { label: '待财务结算', short: '待结算', tone: 'mint', index: 3 },
  SETTLED: { label: '已完成结算', short: '已结算', tone: 'slate', index: 4 },
}

const eventIcons: Record<ProviderSettlementEventSummary['type'], string> = {
  STATEMENT_GENERATED: '生',
  STATEMENT_REFRESHED: '新',
  ADJUSTMENT_REQUESTED: '调',
  ADJUSTMENT_APPROVED: '准',
  ADJUSTMENT_REJECTED: '退',
  INVOICE_SUBMITTED: '票',
  INVOICE_VERIFIED: '验',
  INVOICE_REJECTED: '驳',
  SETTLED: '结',
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

function formatMoney(fen: number | null | undefined, compact = false): string {
  if (fen === null || fen === undefined) return '—'
  const yuan = fen / 100
  if (compact && Math.abs(yuan) >= 10000) {
    return `¥${(yuan / 10000).toFixed(yuan % 10000 === 0 ? 0 : 1)}万`
  }
  return `¥${yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return '—'
  const date = new Date(value)
  const day = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  if (!includeTime) return day
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function rateText(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
}

function barWidth(value: number): string {
  return `${Math.max(value > 0 ? 8 : 0, Math.round(value / maxComposition.value * 100))}%`
}

function workflowClass(index: number): string {
  const current = focus.value ? statusMeta[focus.value.status].index : 0
  if (index < current || focus.value?.status === 'SETTLED') return 'done'
  if (index === current) return 'active'
  return 'waiting'
}

async function load(focusStatementId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderSettlements(focusStatementId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '城市收益结算数据加载失败'
  } finally {
    loading.value = false
  }
}

async function selectStatement(statement: ProviderSettlementStatementSummary): Promise<void> {
  if (acting.value || focus.value?.id === statement.id) return
  acting.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderSettlements(statement.id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '结算单加载失败'
  } finally {
    acting.value = false
  }
}

function confirmAction(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText: '确认执行',
      confirmColor: '#087F62',
      success: ({ confirm }) => resolve(confirm),
      fail: () => resolve(false),
    })
  })
}

async function refreshStatement(): Promise<void> {
  if (!overview.value || !focus.value || acting.value) return
  const confirmed = await confirmAction(
    '刷新结算事实？',
    `将按当前有效规则重新计算 ${focus.value.period} 账期，已批准调账会保留。`,
  )
  if (!confirmed) return
  acting.value = true
  errorMessage.value = ''
  try {
    overview.value = await generateProviderSettlement({
      cityId: focus.value.cityId,
      period: focus.value.period,
    })
    uni.showToast({ title: '业务事实已刷新', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '结算单刷新失败'
  } finally {
    acting.value = false
  }
}

function openAdjustment(): void {
  adjustmentDirection.value = 'CREDIT'
  adjustmentAmount.value = ''
  adjustmentReason.value = ''
  adjustmentEvidence.value = ''
  sheet.value = 'ADJUSTMENT'
}

function openInvoice(): void {
  if (!focus.value) return
  invoiceNo.value = ''
  sellerName.value = '上海乐趣城市服务有限公司'
  sellerTaxId.value = '9131**********6X'
  sheet.value = 'INVOICE'
}

async function submitAdjustment(): Promise<void> {
  if (!focus.value || acting.value) return
  const amountFen = Math.round(Number(adjustmentAmount.value) * 100)
  if (!Number.isFinite(amountFen) || amountFen <= 0) {
    uni.showToast({ title: '请输入有效调账金额', icon: 'none' })
    return
  }
  if (adjustmentReason.value.trim().length < 5 || adjustmentEvidence.value.trim().length < 2) {
    uni.showToast({ title: '请补充原因与事实凭证', icon: 'none' })
    return
  }
  const confirmed = await confirmAction(
    '提交总部审批？',
    `${adjustmentDirection.value === 'CREDIT' ? '调增' : '调减'} ${formatMoney(amountFen)}。提交后不会直接改变应付，须经总部批准。`,
  )
  if (!confirmed) return
  acting.value = true
  errorMessage.value = ''
  try {
    overview.value = await requestSettlementAdjustment({
      statementId: focus.value.id,
      expectedVersion: focus.value.version,
      direction: adjustmentDirection.value,
      amountFen,
      reason: adjustmentReason.value.trim(),
      evidence: adjustmentEvidence.value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    })
    sheet.value = null
    uni.showToast({ title: '调账申请已提交', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '调账申请提交失败'
  } finally {
    acting.value = false
  }
}

async function submitInvoice(): Promise<void> {
  if (!focus.value || acting.value) return
  if (invoiceNo.value.trim().length < 5 || sellerName.value.trim().length < 4) {
    uni.showToast({ title: '请填写完整发票信息', icon: 'none' })
    return
  }
  const confirmed = await confirmAction(
    '确认提交发票？',
    `系统将校验发票金额 ${formatMoney(focus.value.shares.payableFen)} 与结算单完全一致。`,
  )
  if (!confirmed) return
  acting.value = true
  errorMessage.value = ''
  try {
    overview.value = await submitSettlementInvoice({
      statementId: focus.value.id,
      expectedVersion: focus.value.version,
      invoiceNo: invoiceNo.value.trim(),
      sellerName: sellerName.value.trim(),
      sellerTaxIdMasked: sellerTaxId.value.trim(),
      amountFen: focus.value.shares.payableFen,
      issuedAt: new Date().toISOString(),
    })
    sheet.value = null
    uni.showToast({ title: '发票已提交核验', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '结算发票提交失败'
  } finally {
    acting.value = false
  }
}

onLoad((query) => {
  const statementId = typeof query?.statementId === 'string' ? query.statementId : undefined
  void load(statementId)
})
</script>

<template>
  <view class="page-shell">
    <view class="glow glow-a" /><view class="glow glow-b" />

    <view class="topbar">
      <button class="back" @click="goBack">‹</button>
      <view class="brand">
        <view class="brand-mark"><i /><b>R</b></view>
        <view><text>Revenue Settlement</text><small>城市收益结算中心</small></view>
      </view>
      <view class="secure"><i /> FINANCE SAFE</view>
    </view>

    <scroll-view scroll-y class="viewport">
      <view class="content">
        <view v-if="errorMessage" class="error-banner">
          <view><b>操作尚未完成</b><text>{{ errorMessage }}</text></view>
          <button @click="load(focus?.id)">重新加载</button>
        </view>

        <view v-if="loading" class="loading-state">
          <view class="loading-ring"><i /></view>
          <b>正在校验结算账本</b>
          <text>业务事实 · 规则快照 · 发票 · 审批链</text>
        </view>

        <template v-else-if="overview && focus">
          <view class="hero">
            <view class="hero-grid" />
            <view class="hero-main">
              <view class="eyebrow"><i /> {{ overview.city.name }} · {{ focus.period }}</view>
              <text class="hero-title">把每一笔城市收益，<br /><em>结得清清楚楚</em></text>
              <text class="hero-desc">只取已确认业务事实，冻结分成规则，调账经总部审批，验票通过后才进入财务结算。</text>
              <view class="hero-actions">
                <button
                  v-if="canEdit"
                  class="primary-action"
                  :disabled="acting"
                  @click="openInvoice"
                >提交结算发票</button>
                <button
                  v-if="canEdit"
                  class="ghost-action"
                  :disabled="acting"
                  @click="refreshStatement"
                >刷新业务事实</button>
                <view class="policy-badge"><i>✓</i> 城市范围已隔离</view>
              </view>
            </view>
            <view class="hero-amount">
              <view class="amount-caption">
                <span>CURRENT RECEIVABLE</span>
                <i :class="statusMeta[focus.status].tone">{{ statusMeta[focus.status].short }}</i>
              </view>
              <text>{{ formatMoney(focus.shares.payableFen) }}</text>
              <view class="amount-meta">
                <span><small>规则版本</small><b>{{ focus.ruleVersion }}</b></span>
                <span><small>结算单版本</small><b>V{{ focus.version }}</b></span>
              </view>
              <view class="seal"><i>✓</i><text>FACT<br />LOCKED</text></view>
            </view>
          </view>

          <view class="workflow">
            <view
              v-for="(item, index) in [
                ['01', '结算单生成', '确认业务事实'],
                ['02', '总部调账审批', '冻结应付金额'],
                ['03', '发票核验', '金额抬头一致'],
                ['04', '财务结算', '只追加账本'],
              ]"
              :key="item[0]"
              class="workflow-step"
              :class="workflowClass(index + 1)"
            >
              <view class="step-no">{{ item[0] }}<i>✓</i></view>
              <view><b>{{ item[1] }}</b><text>{{ item[2] }}</text></view>
              <span v-if="index < 3" />
            </view>
          </view>

          <view class="metric-grid">
            <view class="metric-card">
              <view class="metric-icon mint">¥</view>
              <view><small>本期应收</small><b>{{ formatMoney(overview.metrics.currentReceivableFen, true) }}</b></view>
              <text>{{ overview.metrics.pendingInvoiceCount }} 个账期待开票</text>
            </view>
            <view class="metric-card">
              <view class="metric-icon violet">↗</view>
              <view><small>年度应付</small><b>{{ formatMoney(overview.metrics.yearToDatePayableFen, true) }}</b></view>
              <text>按确认事实累计</text>
            </view>
            <view class="metric-card">
              <view class="metric-icon amber">✓</view>
              <view><small>年度已结</small><b>{{ formatMoney(overview.metrics.yearToDateSettledFen, true) }}</b></view>
              <text>{{ overview.metrics.settledCount }} 个账期归档</text>
            </view>
            <view class="metric-card">
              <view class="metric-icon coral">!</view>
              <view><small>待办事项</small><b>{{ overview.metrics.pendingApprovalCount + overview.metrics.readyCount }}</b></view>
              <text>{{ overview.metrics.pendingApprovalCount }} 审批 · {{ overview.metrics.readyCount }} 待结</text>
            </view>
          </view>

          <view class="main-grid">
            <view class="left-column">
              <view class="panel composition-panel">
                <view class="panel-head">
                  <view><small>REVENUE COMPOSITION</small><b>本期收益构成</b></view>
                  <view class="verified-chip"><i>✓</i> CONFIRMED ONLY</view>
                </view>
                <view class="composition-list">
                  <view v-for="item in composition" :key="item.key" class="composition-row">
                    <view class="composition-copy">
                      <view>
                        <small>{{ item.eyebrow }}</small>
                        <b>{{ item.label }}</b>
                      </view>
                      <view class="formula">
                        <span>{{ formatMoney(item.source, true) }}</span>
                        <i>× {{ rateText(item.rate) }}</i>
                        <b>{{ formatMoney(item.value) }}</b>
                      </view>
                    </view>
                    <view class="bar-track"><i :class="item.tone" :style="{ width: barWidth(item.value) }" /></view>
                  </view>
                </view>
                <view class="adjustment-line">
                  <view><i>±</i><span><small>HQ APPROVED ADJUSTMENT</small><b>总部已批准调账</b></span></view>
                  <text :class="{ negative: focus.shares.approvedAdjustmentFen < 0 }">
                    {{ focus.shares.approvedAdjustmentFen >= 0 ? '+' : '' }}{{ formatMoney(focus.shares.approvedAdjustmentFen) }}
                  </text>
                </view>
                <view class="payable-total">
                  <view><small>PAYABLE AFTER VERIFIED ADJUSTMENT</small><b>本期最终应付</b></view>
                  <text>{{ formatMoney(focus.shares.payableFen) }}</text>
                </view>
              </view>

              <view class="panel history-panel">
                <view class="panel-head">
                  <view><small>SETTLEMENT HISTORY</small><b>月度结算单</b></view>
                  <text>共 {{ overview.statements.length }} 期</text>
                </view>
                <scroll-view scroll-x class="statement-strip">
                  <view class="statement-row">
                    <button
                      v-for="item in overview.statements"
                      :key="item.id"
                      class="statement-card"
                      :class="{ active: item.id === focus.id }"
                      @click="selectStatement(item)"
                    >
                      <view>
                        <span>{{ item.period }}</span>
                        <i :class="statusMeta[item.status].tone">{{ statusMeta[item.status].short }}</i>
                      </view>
                      <b>{{ formatMoney(item.shares.payableFen) }}</b>
                      <text>{{ item.ledgerEntries.length > 0 ? `${item.ledgerEntries.length} 条账本流水` : '等待财务入账' }}</text>
                    </button>
                  </view>
                </scroll-view>
              </view>

              <view class="panel ledger-panel">
                <view class="panel-head">
                  <view><small>APPEND-ONLY LEDGER</small><b>结算账本</b></view>
                  <view class="lock-chip">⌁ 不可改写</view>
                </view>
                <view v-if="focus.ledgerEntries.length" class="ledger-list">
                  <view v-for="entry in focus.ledgerEntries" :key="entry.id" class="ledger-row">
                    <view class="ledger-sequence">#{{ String(entry.sequence).padStart(4, '0') }}</view>
                    <view class="ledger-copy"><b>{{ entry.sourceLabel }}</b><text>{{ entry.ruleVersion }} · {{ formatDate(entry.postedAt, true) }}</text></view>
                    <strong :class="{ debit: entry.direction === 'DEBIT' }">{{ entry.direction === 'DEBIT' ? '−' : '+' }}{{ formatMoney(entry.amountFen) }}</strong>
                  </view>
                </view>
                <view v-else class="empty-ledger">
                  <view>⌁</view><b>账本等待财务结算</b><text>验票通过且财务强确认后，系统一次性追加不可改写流水。</text>
                </view>
              </view>
            </view>

            <view class="right-column">
              <view class="panel rule-panel">
                <view class="rule-orbit"><i /><b>R</b></view>
                <small>ACTIVE SHARE RULE</small>
                <b class="rule-title">城市分成规则</b>
                <text class="rule-version">{{ overview.rules.version }}</text>
                <view class="rule-grid">
                  <view><small>签约订阅</small><b>{{ rateText(overview.rules.signingShareBps) }}</b></view>
                  <view><small>续费服务</small><b>{{ rateText(overview.rules.renewalShareBps) }}</b></view>
                  <view><small>交易服务</small><b>{{ rateText(overview.rules.transactionShareBps) }}</b></view>
                </view>
                <view class="formula-note"><i>ƒ</i><text>{{ overview.rules.formula }}</text></view>
                <view class="rule-foot"><span>生效于 {{ formatDate(overview.rules.effectiveFrom) }}</span><b>SNAPSHOT LOCKED</b></view>
              </view>

              <view class="panel invoice-panel">
                <view class="panel-head">
                  <view><small>INVOICE CONTROL</small><b>发票核验</b></view>
                  <i class="invoice-status" :class="focus.invoice?.status.toLowerCase()">
                    {{ focus.invoice?.status === 'VERIFIED' ? '已核验' : focus.invoice?.status === 'SUBMITTED' ? '核验中' : focus.invoice?.status === 'REJECTED' ? '已驳回' : '待提交' }}
                  </i>
                </view>
                <template v-if="focus.invoice">
                  <view class="invoice-paper">
                    <view class="paper-edge" />
                    <small>INVOICE NO.</small>
                    <b>{{ focus.invoice.invoiceNo }}</b>
                    <view><span>开票主体</span><text>{{ focus.invoice.sellerName }}</text></view>
                    <view><span>税号</span><text>{{ focus.invoice.sellerTaxIdMasked }}</text></view>
                    <view><span>开票金额</span><strong>{{ formatMoney(focus.invoice.amountFen) }}</strong></view>
                  </view>
                  <text v-if="focus.invoice.decisionNote" class="decision-note">总部意见：{{ focus.invoice.decisionNote }}</text>
                </template>
                <view v-else class="invoice-empty">
                  <view>票</view><b>等待城市方提交</b><text>发票金额必须与最终应付完全一致</text>
                </view>
                <button
                  v-if="canEdit"
                  class="wide-action"
                  :disabled="hasPendingAdjustment || acting"
                  @click="openInvoice"
                >{{ hasPendingAdjustment ? '请先等待调账审批' : '提交结算发票' }}</button>
              </view>

              <view class="panel adjustment-panel">
                <view class="panel-head">
                  <view><small>ADJUSTMENT CONTROL</small><b>调账审批</b></view>
                  <button v-if="canEdit" @click="openAdjustment">＋ 申请</button>
                </view>
                <view v-if="focus.adjustments.length" class="adjustment-list">
                  <view v-for="item in focus.adjustments" :key="item.id" class="adjustment-item">
                    <view class="adjustment-top">
                      <i :class="item.status.toLowerCase()">{{ item.status === 'PENDING' ? '待审批' : item.status === 'APPROVED' ? '已批准' : '已驳回' }}</i>
                      <b :class="{ debit: item.direction === 'DEBIT' }">{{ item.direction === 'DEBIT' ? '−' : '+' }}{{ formatMoney(item.amountFen) }}</b>
                    </view>
                    <text>{{ item.reason }}</text>
                    <small>{{ item.requestedBy }} · {{ formatDate(item.requestedAt, true) }}</small>
                  </view>
                </view>
                <view v-else class="mini-empty"><i>✓</i><text>本期暂无调账申请</text></view>
              </view>

              <view class="panel timeline-panel">
                <view class="panel-head">
                  <view><small>AUDIT TIMELINE</small><b>全程留痕</b></view>
                  <text>{{ overview.events.length }} EVENTS</text>
                </view>
                <view class="timeline">
                  <view v-for="event in overview.events" :key="event.id" class="event-row">
                    <view class="event-icon">{{ eventIcons[event.type] }}</view>
                    <view><b>{{ event.summary }}</b><text>{{ event.actorName }} · {{ formatDate(event.createdAt, true) }}</text></view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </template>

        <view v-else-if="!loading" class="no-data">
          <view>¥</view><b>暂无可见结算单</b><text>请确认当前账号的城市数据范围和结算账期。</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="sheet" class="sheet-mask" @click.self="sheet = null">
      <view class="sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <small>{{ sheet === 'ADJUSTMENT' ? 'ADJUSTMENT REQUEST' : 'INVOICE SUBMISSION' }}</small>
            <b>{{ sheet === 'ADJUSTMENT' ? '申请收益调账' : '提交结算发票' }}</b>
          </view>
          <button @click="sheet = null">×</button>
        </view>

        <template v-if="sheet === 'ADJUSTMENT'">
          <view class="direction-tabs">
            <button :class="{ active: adjustmentDirection === 'CREDIT' }" @click="adjustmentDirection = 'CREDIT'">调增应付</button>
            <button :class="{ active: adjustmentDirection === 'DEBIT' }" @click="adjustmentDirection = 'DEBIT'">调减应付</button>
          </view>
          <label><span>调账金额（元）</span><input v-model="adjustmentAmount" type="digit" placeholder="0.00" /></label>
          <label><span>调账原因</span><textarea v-model="adjustmentReason" maxlength="500" placeholder="说明产生差异的业务事实与计算依据" /></label>
          <label><span>事实凭证（每行一条）</span><textarea v-model="adjustmentEvidence" maxlength="800" placeholder="合同补充协议&#10;业务确认单编号" /></label>
          <view class="sheet-notice"><i>!</i><text>调账申请不会直接改变应付金额，必须经总部独立审批。</text></view>
          <button class="submit-button" :disabled="acting" @click="submitAdjustment">{{ acting ? '正在提交…' : '强确认并提交审批' }}</button>
        </template>

        <template v-else>
          <view class="invoice-amount">
            <small>本次必须开票金额</small>
            <b>{{ formatMoney(focus?.shares.payableFen) }}</b>
            <text>系统执行分级金额一致性校验</text>
          </view>
          <label><span>发票号码</span><input v-model="invoiceNo" placeholder="例如 SH-LQ-202607-008" /></label>
          <label><span>开票主体</span><input v-model="sellerName" /></label>
          <label><span>纳税人识别号（脱敏）</span><input v-model="sellerTaxId" /></label>
          <view class="sheet-notice safe"><i>✓</i><text>发票提交后由总部核验抬头、税号与金额，核验通过才可结算。</text></view>
          <button class="submit-button" :disabled="acting" @click="submitInvoice">{{ acting ? '正在提交…' : '强确认并提交发票' }}</button>
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped>
:global(page) {
  background: #edf2f0;
  color: #14231f;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
}

button {
  margin: 0;
  padding: 0;
  border: 0;
  line-height: 1;
}

button::after { border: 0; }

.page-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 4%, rgba(23, 145, 112, .11), transparent 28rem),
    radial-gradient(circle at 93% 30%, rgba(117, 88, 196, .08), transparent 30rem),
    #edf2f0;
}

.glow {
  position: fixed;
  width: 34rem;
  height: 34rem;
  border-radius: 50%;
  filter: blur(90px);
  opacity: .12;
  pointer-events: none;
}

.glow-a { left: -18rem; top: 14rem; background: #10a37f; }
.glow-b { right: -19rem; top: 38rem; background: #7452c8; }

.topbar {
  position: relative;
  z-index: 10;
  box-sizing: border-box;
  height: calc(64px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 3.5vw 0;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #d9eee8;
  background: rgba(8, 24, 20, .96);
  border-bottom: 1px solid rgba(255, 255, 255, .08);
}

.back {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: #fff;
  font-size: 30px;
  background: rgba(255, 255, 255, .08);
}

.brand { display: flex; align-items: center; gap: 11px; }
.brand-mark {
  position: relative;
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(88, 230, 190, .45);
  border-radius: 11px;
  background: linear-gradient(145deg, rgba(66, 222, 179, .2), rgba(255, 255, 255, .03));
}
.brand-mark i {
  position: absolute;
  inset: 5px;
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 8px;
  transform: rotate(45deg);
}
.brand-mark b { position: relative; color: #65e2bf; font-size: 14px; }
.brand text, .brand small { display: block; }
.brand text { color: #fff; font-size: 13px; font-weight: 750; letter-spacing: .08em; }
.brand small { margin-top: 4px; color: #78958d; font-size: 9px; letter-spacing: .18em; }
.secure {
  margin-left: auto;
  padding: 8px 11px;
  border: 1px solid rgba(86, 224, 184, .24);
  border-radius: 999px;
  color: #7ee3c5;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .12em;
  background: rgba(21, 141, 109, .1);
}
.secure i { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #4be0b5; box-shadow: 0 0 10px #4be0b5; }

.viewport { height: calc(100vh - 64px - env(safe-area-inset-top)); }
.content { position: relative; z-index: 1; width: min(1180px, 93vw); margin: 28px auto 80px; }

.error-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
  padding: 13px 16px;
  border: 1px solid rgba(192, 74, 61, .2);
  border-radius: 15px;
  background: #fff2ef;
  box-shadow: 0 10px 30px rgba(91, 45, 36, .07);
}
.error-banner view { min-width: 0; }
.error-banner b, .error-banner text { display: block; }
.error-banner b { color: #a63d32; font-size: 12px; }
.error-banner text { margin-top: 4px; color: #80554e; font-size: 11px; }
.error-banner button { margin-left: auto; flex: 0 0 auto; padding: 9px 14px; border-radius: 10px; color: #fff; font-size: 11px; background: #a63d32; }

.hero {
  position: relative;
  min-height: 294px;
  display: grid;
  grid-template-columns: 1.25fr .75fr;
  overflow: hidden;
  border-radius: 26px;
  color: #fff;
  background:
    radial-gradient(circle at 83% 25%, rgba(59, 222, 174, .2), transparent 24rem),
    linear-gradient(125deg, #081b17 0%, #0a2c24 58%, #0b3429 100%);
  box-shadow: 0 26px 60px rgba(10, 43, 35, .2);
}
.hero-grid {
  position: absolute;
  inset: 0;
  opacity: .065;
  background-image:
    linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px);
  background-size: 38px 38px;
  mask-image: linear-gradient(90deg, #000, transparent);
}
.hero-main { position: relative; z-index: 1; padding: 38px 42px; }
.eyebrow { display: flex; align-items: center; gap: 8px; color: #76d7bb; font-size: 10px; font-weight: 800; letter-spacing: .15em; }
.eyebrow i { width: 18px; height: 1px; background: #65d7b6; }
.hero-title { display: block; margin-top: 20px; font-size: clamp(28px, 3.2vw, 46px); font-weight: 820; line-height: 1.16; letter-spacing: -.04em; }
.hero-title em { color: #70e0c0; font-style: normal; }
.hero-desc { display: block; max-width: 590px; margin-top: 15px; color: #93ada6; font-size: 12px; line-height: 1.8; }
.hero-actions { display: flex; align-items: center; gap: 10px; margin-top: 22px; }
.hero-actions button { height: 38px; padding: 0 17px; border-radius: 11px; font-size: 11px; font-weight: 750; }
.primary-action { color: #09241d; background: #67ddbd; box-shadow: 0 8px 20px rgba(59, 211, 170, .15); }
.ghost-action { color: #d8eee8; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); }
.policy-badge { color: #77988f; font-size: 10px; }
.policy-badge i { margin-right: 5px; color: #68d8b8; font-style: normal; }
.hero-amount {
  position: relative;
  z-index: 1;
  align-self: stretch;
  padding: 42px 40px 34px;
  border-left: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.01));
}
.amount-caption { display: flex; align-items: center; justify-content: space-between; }
.amount-caption span { color: #809f96; font-size: 9px; font-weight: 800; letter-spacing: .16em; }
.amount-caption i, .statement-card i {
  padding: 6px 9px;
  border-radius: 999px;
  font-size: 9px;
  font-style: normal;
  font-weight: 750;
}
.amount-caption i.amber, .statement-card i.amber { color: #f0bd67; background: rgba(222, 160, 56, .12); }
.amount-caption i.violet, .statement-card i.violet { color: #baa7f5; background: rgba(121, 91, 201, .15); }
.amount-caption i.mint, .statement-card i.mint { color: #73dfbf; background: rgba(45, 178, 141, .14); }
.amount-caption i.slate, .statement-card i.slate { color: #a5bbb5; background: rgba(152, 175, 169, .12); }
.hero-amount > text { display: block; margin-top: 32px; font-family: "DIN Alternate", "Arial", sans-serif; font-size: clamp(31px, 4vw, 52px); font-weight: 800; letter-spacing: -.05em; }
.amount-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 30px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.09); }
.amount-meta small, .amount-meta b { display: block; }
.amount-meta small { color: #718e86; font-size: 9px; }
.amount-meta b { max-width: 160px; margin-top: 6px; overflow: hidden; color: #c4d9d3; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.seal { position: absolute; right: 28px; bottom: 24px; display: flex; align-items: center; gap: 6px; opacity: .35; transform: rotate(-7deg); }
.seal i { width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid #6ee0c0; border-radius: 50%; color: #6ee0c0; font-style: normal; }
.seal text { color: #6ee0c0; font-size: 7px; font-weight: 900; line-height: 1.2; letter-spacing: .14em; }

.workflow {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 18px 0;
  padding: 17px 20px;
  border: 1px solid rgba(18, 58, 48, .08);
  border-radius: 18px;
  background: rgba(255,255,255,.84);
  box-shadow: 0 10px 30px rgba(18, 47, 40, .04);
  backdrop-filter: blur(16px);
}
.workflow-step { position: relative; display: flex; align-items: center; gap: 10px; }
.workflow-step > span { position: absolute; top: 17px; right: 12px; width: calc(100% - 126px); height: 1px; background: #dce6e2; }
.step-no { width: 33px; height: 33px; display: grid; flex: 0 0 auto; place-items: center; border-radius: 11px; color: #9aaca7; font-size: 9px; font-weight: 850; background: #eff4f2; }
.step-no i { display: none; font-style: normal; }
.workflow-step b, .workflow-step text { display: block; }
.workflow-step b { color: #52645f; font-size: 11px; }
.workflow-step text { margin-top: 4px; color: #9aaba6; font-size: 9px; }
.workflow-step.done .step-no { color: transparent; background: #dff3ed; }
.workflow-step.done .step-no i { display: block; color: #168d6c; }
.workflow-step.done b { color: #1c594a; }
.workflow-step.done > span { background: #9edac9; }
.workflow-step.active .step-no { color: #fff; background: #128466; box-shadow: 0 6px 15px rgba(18,132,102,.2); }
.workflow-step.active b { color: #142d27; }

.metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; margin-bottom: 18px; }
.metric-card {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 11px;
  padding: 18px;
  border: 1px solid rgba(18, 58, 48, .07);
  border-radius: 17px;
  background: rgba(255,255,255,.9);
  box-shadow: 0 10px 28px rgba(23, 50, 43, .045);
}
.metric-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 13px; font-size: 15px; font-weight: 850; }
.metric-icon.mint { color: #087f62; background: #e1f4ee; }
.metric-icon.violet { color: #7654c1; background: #eee9fa; }
.metric-icon.amber { color: #b97815; background: #fbf0dc; }
.metric-icon.coral { color: #ba554a; background: #f9e8e5; }
.metric-card small, .metric-card b { display: block; }
.metric-card small { color: #879994; font-size: 9px; letter-spacing: .08em; }
.metric-card b { margin-top: 6px; color: #162a25; font-size: 19px; }
.metric-card > text { grid-column: 2; margin-top: -4px; color: #91a09c; font-size: 9px; }

.main-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(310px, .75fr); gap: 18px; }
.left-column, .right-column { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.panel {
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(18, 58, 48, .075);
  border-radius: 20px;
  background: rgba(255,255,255,.92);
  box-shadow: 0 15px 36px rgba(22, 52, 44, .055);
}
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 22px 16px; }
.panel-head small, .panel-head b { display: block; }
.panel-head small { color: #8a9d97; font-size: 8px; font-weight: 800; letter-spacing: .16em; }
.panel-head b { margin-top: 5px; color: #162c26; font-size: 15px; }
.panel-head > text { color: #92a39e; font-size: 9px; }
.verified-chip, .lock-chip { padding: 7px 9px; border-radius: 999px; color: #248369; font-size: 8px; font-weight: 800; background: #e7f4f0; }
.verified-chip i { margin-right: 4px; font-style: normal; }

.composition-list { padding: 2px 22px 10px; }
.composition-row { padding: 14px 0; border-bottom: 1px solid #edf1ef; }
.composition-copy { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.composition-copy small, .composition-copy b { display: block; }
.composition-copy small { color: #97a8a3; font-size: 8px; font-weight: 750; letter-spacing: .13em; }
.composition-copy b { margin-top: 5px; color: #324a43; font-size: 11px; }
.formula { display: flex; align-items: center; gap: 9px; color: #81928d; font-size: 10px; }
.formula i { font-style: normal; }
.formula b { min-width: 92px; margin: 0; color: #18352d; font-size: 13px; text-align: right; }
.bar-track { height: 5px; margin-top: 10px; overflow: hidden; border-radius: 999px; background: #eef2f0; }
.bar-track i { display: block; height: 100%; border-radius: inherit; }
.bar-track i.mint { background: linear-gradient(90deg, #1a9270, #6ed8b9); }
.bar-track i.violet { background: linear-gradient(90deg, #7252ba, #b29be5); }
.bar-track i.amber { background: linear-gradient(90deg, #c28626, #ebc476); }
.adjustment-line { display: flex; align-items: center; justify-content: space-between; margin: 0 22px; padding: 15px 0; border-bottom: 1px dashed #dce6e2; }
.adjustment-line > view { display: flex; align-items: center; gap: 10px; }
.adjustment-line > view > i { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; color: #7654c1; font-size: 13px; font-style: normal; background: #efebf9; }
.adjustment-line small, .adjustment-line b { display: block; }
.adjustment-line small { color: #9caaa7; font-size: 7px; letter-spacing: .12em; }
.adjustment-line b { margin-top: 4px; color: #445a54; font-size: 10px; }
.adjustment-line > text { color: #178164; font-size: 12px; font-weight: 800; }
.adjustment-line > text.negative { color: #b44f46; }
.payable-total { display: flex; align-items: center; justify-content: space-between; padding: 20px 22px; background: linear-gradient(90deg, #f3faf7, #f9fbfa); }
.payable-total small, .payable-total b { display: block; }
.payable-total small { color: #74948a; font-size: 8px; letter-spacing: .12em; }
.payable-total b { margin-top: 5px; color: #1f4438; font-size: 12px; }
.payable-total > text { color: #087f62; font-size: 23px; font-weight: 850; }

.statement-strip { width: 100%; white-space: nowrap; }
.statement-row { display: inline-flex; gap: 10px; padding: 0 22px 22px; }
.statement-card { box-sizing: border-box; width: 190px; padding: 16px; border: 1px solid #e2eae7; border-radius: 15px; text-align: left; background: #f8faf9; transition: .2s ease; }
.statement-card.active { border-color: rgba(12, 133, 100, .35); background: #f0faf7; box-shadow: inset 0 0 0 1px rgba(12,133,100,.07); }
.statement-card > view { display: flex; align-items: center; justify-content: space-between; }
.statement-card span { color: #6b7f79; font-size: 10px; font-weight: 750; }
.statement-card b, .statement-card text { display: block; }
.statement-card > b { margin-top: 16px; color: #172f28; font-size: 17px; }
.statement-card > text { margin-top: 7px; color: #99a8a4; font-size: 8px; }

.ledger-list { padding: 0 22px 18px; }
.ledger-row { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 12px; padding: 13px 0; border-top: 1px solid #eef2f0; }
.ledger-sequence { color: #91a19d; font-family: monospace; font-size: 9px; }
.ledger-copy b, .ledger-copy text { display: block; }
.ledger-copy b { color: #384e48; font-size: 10px; }
.ledger-copy text { margin-top: 4px; color: #9baba6; font-size: 8px; }
.ledger-row strong { color: #128164; font-size: 11px; }
.ledger-row strong.debit { color: #b54c43; }
.empty-ledger, .invoice-empty, .no-data { display: flex; flex-direction: column; align-items: center; text-align: center; }
.empty-ledger { padding: 22px 22px 26px; border-top: 1px solid #edf2f0; }
.empty-ledger view, .invoice-empty view, .no-data view { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 14px; color: #188568; background: #e6f4ef; }
.empty-ledger b, .invoice-empty b, .no-data b { margin-top: 11px; color: #40554f; font-size: 11px; }
.empty-ledger text, .invoice-empty text, .no-data text { max-width: 330px; margin-top: 6px; color: #92a39e; font-size: 9px; line-height: 1.7; }

.rule-panel { position: relative; padding: 24px 22px 19px; color: #fff; background: radial-gradient(circle at 100% 0, rgba(107, 228, 193, .18), transparent 18rem), linear-gradient(145deg, #0a241e, #103d32); }
.rule-orbit { position: absolute; right: 20px; top: 22px; width: 45px; height: 45px; display: grid; place-items: center; border: 1px solid rgba(106,225,193,.28); border-radius: 50%; }
.rule-orbit i { position: absolute; inset: 6px; border: 1px dashed rgba(106,225,193,.35); border-radius: 50%; }
.rule-orbit b { position: relative; color: #72dec0; }
.rule-panel > small { color: #65bca4; font-size: 8px; font-weight: 800; letter-spacing: .16em; }
.rule-title { display: block; margin-top: 7px; font-size: 16px; }
.rule-version { display: block; max-width: 220px; margin-top: 7px; overflow: hidden; color: #78988f; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.rule-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 22px; }
.rule-grid view { padding: 11px 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.045); }
.rule-grid small, .rule-grid b { display: block; }
.rule-grid small { color: #79988f; font-size: 8px; }
.rule-grid b { margin-top: 7px; color: #73dfc0; font-size: 16px; }
.formula-note { display: flex; gap: 10px; margin-top: 14px; padding: 12px; border-radius: 12px; background: rgba(0,0,0,.16); }
.formula-note i { color: #6bd8b9; font-size: 15px; font-style: normal; }
.formula-note text { color: #9bb3ac; font-size: 8px; line-height: 1.65; }
.rule-foot { display: flex; justify-content: space-between; margin-top: 15px; color: #67847c; font-size: 7px; }
.rule-foot b { color: #68cdb0; letter-spacing: .08em; }

.invoice-status { padding: 6px 8px; border-radius: 999px; color: #9aa9a5; font-size: 8px; font-style: normal; background: #f0f3f2; }
.invoice-status.submitted { color: #7654c1; background: #eeeaf9; }
.invoice-status.verified { color: #168366; background: #e3f3ee; }
.invoice-status.rejected { color: #b64e45; background: #f8e9e7; }
.invoice-paper { position: relative; margin: 0 22px 15px; padding: 17px; overflow: hidden; border: 1px solid #e3e9e7; border-radius: 13px; background: linear-gradient(135deg, #fafcfb, #f3f7f5); }
.paper-edge { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #168668; }
.invoice-paper > small { color: #9aaba6; font-size: 7px; letter-spacing: .15em; }
.invoice-paper > b { display: block; margin: 6px 0 13px; color: #314a43; font-size: 12px; }
.invoice-paper > view:not(.paper-edge) { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; color: #8d9d99; font-size: 8px; }
.invoice-paper text { color: #4d625c; text-align: right; }
.invoice-paper strong { color: #118063; font-size: 11px; }
.decision-note { display: block; margin: -5px 22px 15px; color: #7e908b; font-size: 8px; line-height: 1.6; }
.invoice-empty { padding: 4px 22px 20px; }
.wide-action { width: calc(100% - 44px); height: 38px; margin: 0 22px 20px; border-radius: 11px; color: #fff; font-size: 10px; font-weight: 750; background: #118164; }
.wide-action[disabled] { color: #91a29d; background: #e7edeb; }

.adjustment-panel .panel-head button { padding: 8px 10px; border-radius: 9px; color: #167c62; font-size: 9px; background: #e8f4f0; }
.adjustment-list { padding: 0 22px 15px; }
.adjustment-item { padding: 12px 0; border-top: 1px solid #edf2f0; }
.adjustment-top { display: flex; align-items: center; justify-content: space-between; }
.adjustment-top i { padding: 5px 7px; border-radius: 999px; color: #9b711d; font-size: 7px; font-style: normal; background: #faf0db; }
.adjustment-top i.approved { color: #168366; background: #e3f3ee; }
.adjustment-top i.rejected { color: #ae5147; background: #f8e9e7; }
.adjustment-top b { color: #168366; font-size: 11px; }
.adjustment-top b.debit { color: #b24f46; }
.adjustment-item > text { display: block; margin-top: 8px; color: #4c615b; font-size: 9px; line-height: 1.6; }
.adjustment-item > small { display: block; margin-top: 5px; color: #98a8a4; font-size: 7px; }
.mini-empty { display: flex; align-items: center; gap: 8px; margin: 0 22px 20px; padding: 12px; border-radius: 11px; color: #778c86; font-size: 9px; background: #f5f8f7; }
.mini-empty i { color: #188569; font-style: normal; }

.timeline { padding: 0 22px 17px; }
.event-row { position: relative; display: grid; grid-template-columns: 29px 1fr; gap: 10px; padding: 8px 0 12px; }
.event-row:not(:last-child)::after { content: ""; position: absolute; left: 14px; top: 36px; bottom: -2px; width: 1px; background: #dde7e3; }
.event-icon { position: relative; z-index: 1; width: 29px; height: 29px; display: grid; place-items: center; border-radius: 10px; color: #137e62; font-size: 8px; font-weight: 800; background: #e6f4ef; }
.event-row b, .event-row text { display: block; }
.event-row b { margin-top: 1px; color: #41564f; font-size: 9px; line-height: 1.45; }
.event-row text { margin-top: 4px; color: #9aaba6; font-size: 7px; }

.loading-state, .no-data { min-height: 58vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.loading-ring { width: 52px; height: 52px; display: grid; place-items: center; border: 1px solid #bcd7cf; border-radius: 50%; animation: pulse 1.6s ease-in-out infinite; }
.loading-ring i { width: 28px; height: 28px; border: 2px solid #19866a; border-right-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; }
.loading-state b { margin-top: 18px; color: #294b42; font-size: 13px; }
.loading-state text { margin-top: 7px; color: #8ba099; font-size: 9px; letter-spacing: .08em; }
.no-data view { width: 52px; height: 52px; font-size: 20px; }

.sheet-mask { position: fixed; z-index: 50; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding: 20px; background: rgba(4, 17, 14, .62); backdrop-filter: blur(6px); }
.sheet { box-sizing: border-box; width: min(520px, 100%); max-height: 88vh; overflow-y: auto; padding: 10px 24px calc(24px + env(safe-area-inset-bottom)); border: 1px solid rgba(255,255,255,.6); border-radius: 24px; background: #f9fbfa; box-shadow: 0 28px 70px rgba(2, 20, 15, .3); }
.sheet-handle { width: 42px; height: 4px; margin: 0 auto 16px; border-radius: 999px; background: #d3dedb; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.sheet-head small, .sheet-head b { display: block; }
.sheet-head small { color: #849993; font-size: 8px; font-weight: 800; letter-spacing: .15em; }
.sheet-head b { margin-top: 5px; color: #17342c; font-size: 18px; }
.sheet-head button { width: 32px; height: 32px; border-radius: 10px; color: #6f837d; font-size: 20px; background: #edf2f0; }
.direction-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; padding: 4px; border-radius: 12px; background: #ebf1ef; }
.direction-tabs button { height: 35px; border-radius: 9px; color: #7e918b; font-size: 10px; background: transparent; }
.direction-tabs button.active { color: #117e62; font-weight: 750; background: #fff; box-shadow: 0 4px 12px rgba(25,62,52,.07); }
.sheet label { display: block; margin-top: 13px; }
.sheet label > span { display: block; margin-bottom: 7px; color: #5d716b; font-size: 9px; font-weight: 700; }
.sheet input, .sheet textarea { box-sizing: border-box; width: 100%; border: 1px solid #dce6e2; border-radius: 11px; color: #1f3932; font-size: 11px; background: #fff; }
.sheet input { height: 42px; padding: 0 13px; }
.sheet textarea { min-height: 84px; padding: 11px 13px; line-height: 1.6; }
.sheet-notice { display: flex; align-items: flex-start; gap: 8px; margin-top: 14px; padding: 11px; border-radius: 10px; color: #806224; font-size: 8px; line-height: 1.6; background: #fbf2de; }
.sheet-notice i { font-style: normal; font-weight: 850; }
.sheet-notice.safe { color: #2d705d; background: #e8f5f1; }
.submit-button { width: 100%; height: 45px; margin-top: 18px; border-radius: 12px; color: #fff; font-size: 11px; font-weight: 800; background: linear-gradient(110deg, #08785d, #18a27e); box-shadow: 0 10px 22px rgba(12, 126, 97, .18); }
.invoice-amount { padding: 16px; border-radius: 14px; text-align: center; color: #fff; background: linear-gradient(125deg, #0b2a22, #10513f); }
.invoice-amount small, .invoice-amount b, .invoice-amount text { display: block; }
.invoice-amount small { color: #7fb6a7; font-size: 8px; letter-spacing: .1em; }
.invoice-amount b { margin-top: 8px; font-size: 25px; }
.invoice-amount text { margin-top: 6px; color: #89ab9f; font-size: 8px; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { box-shadow: 0 0 0 12px rgba(24,134,106,.06); } }

@media (max-width: 850px) {
  .content { width: min(94vw, 680px); margin-top: 14px; }
  .secure { display: none; }
  .hero { grid-template-columns: 1fr; border-radius: 20px; }
  .hero-main { padding: 28px 24px 20px; }
  .hero-title { font-size: 31px; }
  .hero-amount { padding: 23px 24px 28px; border-top: 1px solid rgba(255,255,255,.08); border-left: 0; }
  .hero-amount > text { margin-top: 19px; font-size: 34px; }
  .amount-meta { margin-top: 20px; }
  .seal { display: none; }
  .workflow { grid-template-columns: 1fr 1fr; gap: 17px 8px; padding: 15px; }
  .workflow-step > span { display: none; }
  .metric-grid { grid-template-columns: 1fr 1fr; }
  .main-grid { grid-template-columns: 1fr; }
  .right-column { display: grid; grid-template-columns: 1fr 1fr; }
  .timeline-panel { grid-column: 1 / -1; }
}

@media (max-width: 540px) {
  .topbar { padding-left: 14px; padding-right: 14px; }
  .brand text { font-size: 11px; }
  .brand small { font-size: 8px; }
  .content { width: calc(100vw - 24px); }
  .hero-main { padding: 25px 20px 18px; }
  .hero-desc { font-size: 10px; }
  .hero-actions { flex-wrap: wrap; }
  .policy-badge { width: 100%; }
  .hero-amount { padding: 20px; }
  .workflow-step { gap: 7px; }
  .workflow-step b { font-size: 9px; }
  .workflow-step text { font-size: 7px; }
  .metric-grid { gap: 8px; }
  .metric-card { grid-template-columns: 34px 1fr; gap: 8px; padding: 13px 11px; }
  .metric-icon { width: 34px; height: 34px; border-radius: 11px; }
  .metric-card b { font-size: 14px; }
  .composition-copy { align-items: flex-start; }
  .formula { flex-wrap: wrap; justify-content: flex-end; max-width: 165px; gap: 4px 7px; }
  .formula b { width: 100%; }
  .payable-total > text { font-size: 18px; }
  .right-column { display: flex; }
  .sheet-mask { padding: 8px; }
  .sheet { padding-left: 18px; padding-right: 18px; }
}
</style>
