<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  LeadCollaboratorSummary,
  LeadOwnershipAppealSummary,
  LeadOwnershipDecision,
  LeadTransferRequestSummary,
  SalesOwnershipOverview,
} from '@lequ/contracts'
import {
  addOwnershipCollaborator,
  createTransferRequest,
  decideOwnershipAppeal,
  decideTransferRequest,
  fetchSalesOwnership,
  submitOwnershipAppeal,
} from '../../services/ownership'

type SheetMode = 'TRANSFER' | 'APPEAL' | 'TRANSFER_DECISION' | 'APPEAL_DECISION' | 'COLLABORATOR' | null

const leadId = ref('')
const overview = ref<SalesOwnershipOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const sheetMode = ref<SheetMode>(null)
const selectedTransfer = ref<LeadTransferRequestSummary | null>(null)
const selectedAppeal = ref<LeadOwnershipAppealSummary | null>(null)
const decision = ref<LeadOwnershipDecision>('APPROVE')
const decisionNote = ref('')
const targetOwnerId = ref('')
const transferReason = ref('')
const evidenceText = ref('')
const appealReason = ref('')
const collaboratorUserId = ref('')
const collaboratorRole = ref<LeadCollaboratorSummary['role']>('OBSERVER')

const protectionPercent = computed(() => Math.min(
  100,
  Math.max(0, ((overview.value?.protection.daysRemaining ?? 0) / 30) * 100),
))
const pendingTransfer = computed(() =>
  overview.value?.transferRequests.find((item) => item.status === 'PENDING') ?? null,
)
const pendingAppeal = computed(() =>
  overview.value?.appeals.find((item) => item.status === 'PENDING') ?? null,
)

onLoad((query) => {
  leadId.value = typeof query?.leadId === 'string' ? decodeURIComponent(query.leadId) : ''
})

onShow(() => {
  if (leadId.value) void load()
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

async function load(): Promise<void> {
  if (!leadId.value) {
    loading.value = false
    errorMessage.value = '缺少商家线索标识'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchSalesOwnership(leadId.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '归属中心加载失败'
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  uni.navigateBack()
}

function dateLabel(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function roleLabel(roles: string[]): string {
  if (roles.includes('CITY_MANAGER')) return '城市负责人'
  if (roles.includes('CITY_DELIVERY')) return '城市交付'
  if (roles.includes('CITY_SALES')) return '城市销售'
  return '协作成员'
}

function collaboratorRoleLabel(role: LeadCollaboratorSummary['role']): string {
  if (role === 'CO_OWNER') return '共同负责人'
  if (role === 'DELIVERY_PARTNER') return '交付协作'
  return '观察协作'
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: '待审批',
    APPROVED: '已批准',
    REJECTED: '已拒绝',
    CANCELLED: '已取消',
    ACTIVE: '保护中',
    EXPIRING: '即将到期',
    EXPIRED: '已到期',
    DISPUTED: '争议冻结',
  }
  return labels[status] ?? status
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    TRANSFER_REQUESTED: '转移申请',
    TRANSFER_APPROVED: '批准转移',
    TRANSFER_REJECTED: '拒绝转移',
    APPEAL_SUBMITTED: '提交申诉',
    APPEAL_APPROVED: '申诉通过',
    APPEAL_REJECTED: '申诉驳回',
  }
  return labels[type] ?? type
}

function openTransferSheet(): void {
  const data = overview.value
  if (!data?.permissions.canRequestTransfer) return
  targetOwnerId.value = data.candidates[0]?.userId ?? ''
  transferReason.value = ''
  evidenceText.value = ''
  sheetMode.value = 'TRANSFER'
}

function openAppealSheet(): void {
  if (!overview.value?.permissions.canSubmitAppeal) return
  appealReason.value = ''
  evidenceText.value = ''
  sheetMode.value = 'APPEAL'
}

function openTransferDecision(
  request: LeadTransferRequestSummary,
  nextDecision: LeadOwnershipDecision,
): void {
  selectedTransfer.value = request
  decision.value = nextDecision
  decisionNote.value = ''
  sheetMode.value = 'TRANSFER_DECISION'
}

function openAppealDecision(
  appeal: LeadOwnershipAppealSummary,
  nextDecision: LeadOwnershipDecision,
): void {
  selectedAppeal.value = appeal
  decision.value = nextDecision
  decisionNote.value = ''
  sheetMode.value = 'APPEAL_DECISION'
}

function openCollaboratorSheet(): void {
  const data = overview.value
  if (!data?.permissions.canAddCollaborator) return
  collaboratorUserId.value = data.collaborationCandidates[0]?.userId ?? ''
  collaboratorRole.value = 'OBSERVER'
  sheetMode.value = 'COLLABORATOR'
}

function closeSheet(): void {
  if (busy.value) return
  sheetMode.value = null
  selectedTransfer.value = null
  selectedAppeal.value = null
}

function evidenceLines(): string[] {
  return evidenceText.value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function submitSheet(): Promise<void> {
  const data = overview.value
  if (!data || !sheetMode.value || busy.value) return
  busy.value = true
  try {
    if (sheetMode.value === 'TRANSFER') {
      if (!targetOwnerId.value || transferReason.value.trim().length < 5 || evidenceLines().length === 0) {
        throw new Error('请选择目标负责人，并填写转移原因和至少一条证据')
      }
      overview.value = await createTransferRequest(data, {
        targetOwnerId: targetOwnerId.value,
        reason: transferReason.value.trim(),
        evidence: evidenceLines(),
      })
      uni.showToast({ title: '转移申请已提交', icon: 'success' })
    } else if (sheetMode.value === 'APPEAL') {
      if (appealReason.value.trim().length < 5 || evidenceLines().length === 0) {
        throw new Error('请填写申诉原因和至少一条证据')
      }
      await submitOwnershipAppeal(data, appealReason.value.trim(), evidenceLines())
      overview.value = await fetchSalesOwnership(data.lead.id)
      uni.showToast({ title: '申诉已提交并冻结转移', icon: 'success' })
    } else if (sheetMode.value === 'TRANSFER_DECISION' && selectedTransfer.value) {
      if (decisionNote.value.trim().length < 5) throw new Error('请填写完整裁决意见')
      overview.value = await decideTransferRequest(
        selectedTransfer.value,
        decision.value,
        decisionNote.value.trim(),
      )
      uni.showToast({ title: decision.value === 'APPROVE' ? '已批准并完成交接' : '已拒绝申请', icon: 'success' })
    } else if (sheetMode.value === 'APPEAL_DECISION' && selectedAppeal.value) {
      if (decisionNote.value.trim().length < 5) throw new Error('请填写完整裁决意见')
      overview.value = await decideOwnershipAppeal(
        data,
        selectedAppeal.value,
        decision.value,
        decisionNote.value.trim(),
      )
      uni.showToast({ title: decision.value === 'APPROVE' ? '申诉已通过' : '申诉已驳回', icon: 'success' })
    } else if (sheetMode.value === 'COLLABORATOR') {
      if (!collaboratorUserId.value) throw new Error('请选择协作成员')
      await addOwnershipCollaborator(data, collaboratorUserId.value, collaboratorRole.value)
      overview.value = await fetchSalesOwnership(data.lead.id)
      uni.showToast({ title: '协作成员已添加', icon: 'success' })
    }
    closeSheet()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
    sheetMode.value = null
  }
}
</script>

<template>
  <view class="ownership-page">
    <header class="hero">
      <view class="topbar">
        <button aria-label="返回" @click="goBack">‹</button>
        <view class="brand">
          <view class="brand-mark">盾</view>
          <view><strong>归属中心</strong><text>OWNERSHIP GOVERNANCE</text></view>
        </view>
        <view class="policy-pill"><i /> 规则在线</view>
      </view>

      <view v-if="overview" class="hero-copy">
        <view>
          <text>PROTECTED RELATIONSHIP</text>
          <strong>{{ overview.lead.name }}</strong>
          <span>归属、保护、审批与协作共享一条可信证据链</span>
        </view>
        <view :class="['status-badge', `status-${overview.protection.status.toLowerCase()}`]">
          {{ statusLabel(overview.protection.status) }}
        </view>
      </view>
    </header>

    <main v-if="overview" class="content">
      <view class="protection-card">
        <view class="protection-orbit">
          <view class="orbit-inner">
            <strong>{{ overview.protection.daysRemaining }}</strong>
            <text>剩余天数</text>
          </view>
        </view>
        <view class="protection-copy">
          <text>30-DAY PROTECTION</text>
          <strong>{{ overview.protection.transferFrozen ? '争议裁决前，转移已冻结' : '30 天销售保护期持续有效' }}</strong>
          <span>{{ dateLabel(overview.protection.startedAt) }} — {{ dateLabel(overview.protection.expiresAt) }}</span>
          <view class="progress-track"><i :style="{ width: `${protectionPercent}%` }" /></view>
          <small>{{ overview.protection.policyVersion }} · 转移后重新计算，不覆盖历史证据</small>
        </view>
      </view>

      <view class="owner-card">
        <view class="owner-avatar">{{ overview.owner.displayName.slice(-1) }}</view>
        <view class="owner-copy">
          <text>CURRENT OWNER</text>
          <strong>{{ overview.owner.displayName }}</strong>
          <span>{{ roleLabel(overview.owner.roles) }} · 数据版本 v{{ overview.lead.version }}</span>
        </view>
        <view class="owner-lock"><i /> 唯一负责人</view>
      </view>

      <view v-if="overview.protection.transferFrozen" class="frozen-note">
        <i>!</i>
        <view><strong>归属争议处理中</strong><text>保护期状态已冻结，待城市负责人裁决后才能创建或批准转移。</text></view>
      </view>

      <view class="action-grid">
        <button
          data-testid="request-transfer"
          :disabled="!overview.permissions.canRequestTransfer || overview.candidates.length === 0"
          @click="openTransferSheet"
        >
          <i>↗</i><view><strong>申请转移</strong><text>必须审批后才会变更负责人</text></view><span>›</span>
        </button>
        <button
          data-testid="submit-appeal"
          :disabled="!overview.permissions.canSubmitAppeal"
          @click="openAppealSheet"
        >
          <i>证</i><view><strong>归属申诉</strong><text>提交可核验材料并冻结转移</text></view><span>›</span>
        </button>
      </view>

      <view class="section-head">
        <view><text>TRANSFER WORKFLOW</text><strong>转移申请</strong></view>
        <span>{{ overview.transferRequests.length }} 条记录</span>
      </view>
      <view v-if="overview.transferRequests.length" class="request-list">
        <view
          v-for="request in overview.transferRequests"
          :key="request.id"
          :data-testid="`transfer-${request.status.toLowerCase()}`"
          class="request-card"
        >
          <view class="request-top">
            <view><text>{{ dateLabel(request.createdAt) }}</text><strong>{{ request.reason }}</strong></view>
            <span :class="`status-${request.status.toLowerCase()}`">{{ statusLabel(request.status) }}</span>
          </view>
          <view class="handoff">
            <view><i>{{ request.currentOwner.displayName.slice(-1) }}</i><text>{{ request.currentOwner.displayName }}</text><small>当前负责人</small></view>
            <view class="handoff-arrow"><text>审批交接</text><i>→</i></view>
            <view><i class="target">{{ request.targetOwner.displayName.slice(-1) }}</i><text>{{ request.targetOwner.displayName }}</text><small>目标负责人</small></view>
          </view>
          <view class="evidence-chips">
            <text v-for="evidence in request.evidence" :key="evidence">{{ evidence }}</text>
          </view>
          <view v-if="request.decisionNote" class="decision-note">
            <text>裁决意见</text><strong>{{ request.decisionNote }}</strong><span>{{ request.decisionBy?.displayName }} · {{ dateLabel(request.decidedAt) }}</span>
          </view>
          <view
            v-if="request.status === 'PENDING' && overview.permissions.canManageOwnership"
            class="decision-actions"
          >
            <button @click="openTransferDecision(request, 'REJECT')">拒绝</button>
            <button class="approve" @click="openTransferDecision(request, 'APPROVE')">批准并交接</button>
          </view>
        </view>
      </view>
      <view v-else class="empty-row"><i>↗</i><view><strong>暂无转移申请</strong><text>负责人变化必须从这里发起并经过角色化审批。</text></view></view>

      <view class="section-head">
        <view><text>OWNERSHIP APPEAL</text><strong>归属申诉</strong></view>
        <span>{{ overview.appeals.length }} 条记录</span>
      </view>
      <view v-if="overview.appeals.length" class="appeal-list">
        <view
          v-for="appeal in overview.appeals"
          :key="appeal.id"
          :data-testid="`appeal-${appeal.status.toLowerCase()}`"
          class="appeal-card"
        >
          <view class="appeal-head">
            <view class="appeal-icon">证</view>
            <view><text>{{ appeal.applicant.displayName }} · {{ dateLabel(appeal.createdAt) }}</text><strong>{{ appeal.reason }}</strong></view>
            <span :class="`status-${appeal.status.toLowerCase()}`">{{ statusLabel(appeal.status) }}</span>
          </view>
          <view class="evidence-chips">
            <text v-for="evidence in appeal.evidence" :key="evidence">{{ evidence }}</text>
          </view>
          <view v-if="appeal.decisionNote" class="decision-note">
            <text>裁决意见</text><strong>{{ appeal.decisionNote }}</strong><span>{{ appeal.decisionBy?.displayName }} · {{ dateLabel(appeal.decidedAt) }}</span>
          </view>
          <view
            v-if="appeal.status === 'PENDING' && overview.permissions.canManageOwnership"
            class="decision-actions"
          >
            <button @click="openAppealDecision(appeal, 'REJECT')">驳回</button>
            <button class="approve" @click="openAppealDecision(appeal, 'APPROVE')">认可归属</button>
          </view>
        </view>
      </view>
      <view v-else class="empty-row"><i>证</i><view><strong>暂无归属争议</strong><text>如出现重复线索，请提交时间、签到或商家确认等可核验证据。</text></view></view>

      <view class="section-head">
        <view><text>COLLABORATION RING</text><strong>协作成员</strong></view>
        <button
          v-if="overview.permissions.canAddCollaborator"
          class="section-action"
          @click="openCollaboratorSheet"
        >＋ 添加</button>
        <span v-else>{{ overview.collaborators.length }} 人</span>
      </view>
      <view class="collaboration-card">
        <view class="owner-mini">
          <i>{{ overview.owner.displayName.slice(-1) }}</i>
          <view><strong>{{ overview.owner.displayName }}</strong><text>唯一负责人 · 可推进关键动作</text></view>
          <span>OWNER</span>
        </view>
        <view
          v-for="member in overview.collaborators"
          :key="member.id"
          class="member-row"
        >
          <i>{{ member.displayName.slice(-1) }}</i>
          <view><strong>{{ member.displayName }}</strong><text>{{ collaboratorRoleLabel(member.role) }} · {{ dateLabel(member.createdAt) }}</text></view>
          <span>{{ member.role }}</span>
        </view>
        <view v-if="!overview.collaborators.length" class="collaboration-empty">
          暂无协作成员；批准转移后，原负责人会自动保留为观察协作，避免交接信息断层。
        </view>
      </view>

      <view class="section-head">
        <view><text>IMMUTABLE EVIDENCE</text><strong>归属证据链</strong></view>
        <span>只追加</span>
      </view>
      <view v-if="overview.events.length" class="timeline">
        <view v-for="event in overview.events" :key="event.id" class="timeline-item">
          <view class="timeline-marker"><i /><span /></view>
          <view>
            <text>{{ eventLabel(event.type) }} · #{{ event.sequence }}</text>
            <strong>{{ event.summary }}</strong>
            <small>{{ event.actor.displayName }} · {{ dateLabel(event.createdAt) }}</small>
          </view>
        </view>
      </view>
      <view v-else class="empty-row"><i>✓</i><view><strong>当前归属稳定</strong><text>后续申请、裁决和交接都会以不可变事件追加在这里。</text></view></view>

      <view class="integrity-note">
        <i>盾</i><text>销售只能发起申请；审批权限、SQL 数据范围、乐观版本、幂等键、审计与 Outbox 在服务端强制执行，页面状态不能绕过。</text>
      </view>
    </main>

    <view v-else-if="loading" class="state-card">
      <view><i /></view><strong>正在核验归属证据</strong><text>读取保护期、协作关系与审批状态…</text>
    </view>
    <view v-else class="state-card">
      <view>!</view><strong>归属中心暂时不可用</strong><text>{{ errorMessage }}</text><button @click="load">重新加载</button>
    </view>

    <view v-if="sheetMode && overview" class="sheet-layer" @click.self="closeSheet">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view>
            <text>
              {{ sheetMode === 'TRANSFER' ? 'TRANSFER REQUEST' : sheetMode === 'APPEAL' ? 'OWNERSHIP APPEAL' : sheetMode === 'COLLABORATOR' ? 'COLLABORATION' : 'ROLE-BASED DECISION' }}
            </text>
            <strong>
              {{ sheetMode === 'TRANSFER' ? '申请转移负责人' : sheetMode === 'APPEAL' ? '提交归属申诉' : sheetMode === 'COLLABORATOR' ? '添加协作成员' : decision === 'APPROVE' ? '确认批准' : '确认拒绝' }}
            </strong>
          </view>
          <button @click="closeSheet">×</button>
        </view>

        <template v-if="sheetMode === 'TRANSFER'">
          <label><text>目标负责人</text></label>
          <view class="candidate-list">
            <button
              v-for="candidate in overview.candidates"
              :key="candidate.userId"
              :data-testid="`candidate-${candidate.userId}`"
              :class="{ active: targetOwnerId === candidate.userId }"
              @click="targetOwnerId = candidate.userId"
            >
              <i>{{ candidate.displayName.slice(-1) }}</i>
              <view><strong>{{ candidate.displayName }}</strong><text>{{ roleLabel(candidate.roles) }}</text></view>
              <span>{{ targetOwnerId === candidate.userId ? '✓' : '' }}</span>
            </button>
          </view>
          <label><text>转移原因 *</text><textarea v-model="transferReason" data-testid="transfer-reason" maxlength="500" placeholder="说明交接背景、商家意愿和业务连续性" /></label>
          <label><text>可核验证据 *</text><textarea v-model="evidenceText" data-testid="transfer-evidence" maxlength="1200" placeholder="每行一条，例如：商家微信群确认截图" /></label>
        </template>

        <template v-else-if="sheetMode === 'APPEAL'">
          <view class="sheet-warning"><i>!</i><text>提交后会冻结转移，直到城市负责人完成裁决。请只提交真实、可核验的事实。</text></view>
          <label><text>申诉原因 *</text><textarea v-model="appealReason" data-testid="appeal-reason" maxlength="500" placeholder="说明重复线索、首次有效触达或归属争议背景" /></label>
          <label><text>证据清单 *</text><textarea v-model="evidenceText" data-testid="appeal-evidence" maxlength="1200" placeholder="每行一条，例如：7 月 18 日定位签到" /></label>
        </template>

        <template v-else-if="sheetMode === 'COLLABORATOR'">
          <label><text>协作成员</text></label>
          <view class="candidate-list">
            <button
              v-for="candidate in overview.collaborationCandidates"
              :key="candidate.userId"
              :class="{ active: collaboratorUserId === candidate.userId }"
              @click="collaboratorUserId = candidate.userId"
            >
              <i>{{ candidate.displayName.slice(-1) }}</i>
              <view><strong>{{ candidate.displayName }}</strong><text>{{ roleLabel(candidate.roles) }}</text></view>
              <span>{{ collaboratorUserId === candidate.userId ? '✓' : '' }}</span>
            </button>
          </view>
          <label><text>协作角色</text></label>
          <view class="role-grid">
            <button :class="{ active: collaboratorRole === 'CO_OWNER' }" @click="collaboratorRole = 'CO_OWNER'">共同负责人</button>
            <button :class="{ active: collaboratorRole === 'DELIVERY_PARTNER' }" @click="collaboratorRole = 'DELIVERY_PARTNER'">交付协作</button>
            <button :class="{ active: collaboratorRole === 'OBSERVER' }" @click="collaboratorRole = 'OBSERVER'">观察协作</button>
          </view>
        </template>

        <template v-else>
          <view class="decision-summary">
            <i>{{ decision === 'APPROVE' ? '✓' : '×' }}</i>
            <view>
              <strong>{{ decision === 'APPROVE' ? '该操作会立即执行受控变更' : '该操作会保留当前归属状态' }}</strong>
              <text v-if="sheetMode === 'TRANSFER_DECISION' && selectedTransfer">
                {{ selectedTransfer.currentOwner.displayName }} → {{ selectedTransfer.targetOwner.displayName }}
              </text>
              <text v-else-if="selectedAppeal">{{ selectedAppeal.reason }}</text>
            </view>
          </view>
          <label><text>裁决意见 *</text><textarea v-model="decisionNote" data-testid="decision-note" maxlength="500" placeholder="说明事实依据、影响和后续安排" /></label>
        </template>

        <button data-testid="ownership-submit" class="primary-action" :disabled="busy" @click="submitSheet">
          {{ busy ? '正在安全提交…' : sheetMode === 'TRANSFER' ? '提交审批申请' : sheetMode === 'APPEAL' ? '提交申诉并冻结转移' : sheetMode === 'COLLABORATOR' ? '确认添加协作成员' : decision === 'APPROVE' ? '强确认并执行' : '确认拒绝' }}
        </button>
        <text class="safe-note">L2 归属治理 · 角色审批 · 乐观版本 · 幂等 · 审计 · Outbox</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
page{background:#f3f4f8}button{margin:0;padding:0;border:0;line-height:inherit}button::after{display:none}
.ownership-page{min-height:100vh;background:#f3f4f8;color:#1b1c29;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.hero{position:relative;overflow:hidden;padding:calc(env(safe-area-inset-top) + 10px) 17px 31px;border-radius:0 0 36px 36px;background:radial-gradient(circle at 83% 28%,rgba(236,84,115,.28),transparent 30%),radial-gradient(circle at 10% 108%,rgba(94,80,207,.34),transparent 42%),linear-gradient(147deg,#111528,#252640 63%,#573048);color:#fff}.hero::after{position:absolute;right:-79px;bottom:-121px;width:250px;height:250px;border:1px solid rgba(255,255,255,.07);border-radius:50%;box-shadow:0 0 0 32px rgba(255,255,255,.023),0 0 0 67px rgba(255,255,255,.016);content:""}.topbar{position:relative;z-index:2;display:flex;align-items:center}.topbar>button{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.06);color:#fff;font-size:25px}.brand{display:flex;min-width:0;flex:1;align-items:center;margin-left:9px}.brand-mark{display:flex;width:35px;height:35px;align-items:center;justify-content:center;border-radius:12px 12px 12px 4px;background:linear-gradient(145deg,#ff7a89,#df4c69);font-size:8px;font-weight:950}.brand>view:last-child{margin-left:8px}.brand strong,.brand text{display:block}.brand strong{font-size:13px}.brand text{margin-top:2px;color:rgba(255,255,255,.4);font-size:5px;font-weight:900;letter-spacing:.14em}.policy-pill{display:flex;align-items:center;gap:5px;padding:7px 8px;border:1px solid rgba(255,255,255,.08);border-radius:99px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.62);font-size:6px}.policy-pill i{width:5px;height:5px;border-radius:50%;background:#79e7c7;box-shadow:0 0 0 4px rgba(121,231,199,.09)}.hero-copy{position:relative;z-index:2;display:flex;align-items:flex-end;justify-content:space-between;margin-top:24px}.hero-copy>view:first-child text,.hero-copy>view:first-child strong,.hero-copy>view:first-child span{display:block}.hero-copy>view:first-child text{color:#ff95a4;font-size:6px;font-weight:900;letter-spacing:.14em}.hero-copy>view:first-child strong{margin-top:6px;font-size:24px;font-weight:950;letter-spacing:-.04em}.hero-copy>view:first-child span{margin-top:7px;color:rgba(255,255,255,.46);font-size:7px}.status-badge{padding:7px 9px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:rgba(255,255,255,.07);color:#8be8ce;font-size:7px;font-weight:850}.status-badge.status-disputed{color:#ff9cab}
.content{padding:0 17px 30px}.protection-card{position:relative;z-index:3;display:flex;align-items:center;gap:15px;margin-top:-14px;padding:15px;border:1px solid rgba(31,32,47,.055);border-radius:22px;background:#fff;box-shadow:0 13px 30px rgba(28,30,47,.09)}.protection-orbit{display:flex;width:73px;height:73px;flex:0 0 auto;align-items:center;justify-content:center;border:5px solid #eceaf9;border-top-color:#ec5a76;border-right-color:#7062d5;border-radius:50%;transform:rotate(15deg)}.orbit-inner{display:flex;flex-direction:column;align-items:center;transform:rotate(-15deg)}.orbit-inner strong{font-size:20px}.orbit-inner text{margin-top:1px;color:#a0a1ab;font-size:5px}.protection-copy{min-width:0;flex:1}.protection-copy>text,.protection-copy>strong,.protection-copy>span,.protection-copy>small{display:block}.protection-copy>text{color:#6559c8;font-size:5px;font-weight:900;letter-spacing:.13em}.protection-copy>strong{margin-top:5px;font-size:11px}.protection-copy>span{margin-top:5px;color:#898a95;font-size:6px}.protection-copy>small{margin-top:5px;color:#a2a3ac;font-size:5px}.progress-track{height:5px;margin-top:9px;overflow:hidden;border-radius:99px;background:#eeeef3}.progress-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6c5cd0,#ed5a76)}.owner-card{display:flex;align-items:center;margin-top:11px;padding:13px;border:1px solid rgba(31,32,48,.05);border-radius:18px;background:#fff}.owner-avatar{display:flex;width:42px;height:42px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:14px 14px 14px 5px;background:linear-gradient(145deg,#32344f,#1d1f33);color:#fff;font-size:13px;font-weight:950}.owner-copy{min-width:0;flex:1;margin-left:10px}.owner-copy text,.owner-copy strong,.owner-copy span{display:block}.owner-copy text{color:#e3546f;font-size:5px;font-weight:900;letter-spacing:.12em}.owner-copy strong{margin-top:4px;font-size:11px}.owner-copy span{margin-top:4px;color:#9596a0;font-size:6px}.owner-lock{display:flex;align-items:center;gap:5px;padding:6px 7px;border-radius:8px;background:#edf7f4;color:#3a7868;font-size:6px}.owner-lock i{width:5px;height:5px;border-radius:50%;background:#42b796}.frozen-note{display:flex;align-items:flex-start;gap:9px;margin-top:10px;padding:12px;border:1px solid #f3d8dd;border-radius:15px;background:#fff0f2;color:#7e4e58}.frozen-note>i{display:flex;width:25px;height:25px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:8px;background:#df5069;color:#fff;font-size:8px;font-style:normal;font-weight:900}.frozen-note strong,.frozen-note text{display:block}.frozen-note strong{font-size:8px}.frozen-note text{margin-top:4px;font-size:6px;line-height:1.5}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}.action-grid>button{display:flex;min-width:0;align-items:center;padding:12px;border:1px solid rgba(31,32,48,.055);border-radius:16px;background:#fff;color:#242531;text-align:left}.action-grid>button[disabled]{opacity:.45}.action-grid>button>i{display:flex;width:31px;height:31px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:10px;background:#efedff;color:#6153c7;font-size:10px;font-style:normal;font-weight:950}.action-grid>button:nth-child(2)>i{background:#fff0f2;color:#df4e69;font-size:7px}.action-grid>button>view{min-width:0;flex:1;margin-left:8px}.action-grid strong,.action-grid text{display:block}.action-grid strong{font-size:9px}.action-grid text{overflow:hidden;margin-top:4px;color:#9a9ba5;font-size:5px;text-overflow:ellipsis;white-space:nowrap}.action-grid>button>span{color:#b2b3bb;font-size:16px}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;margin:23px 2px 10px}.section-head text,.section-head strong{display:block}.section-head text{color:#e35570;font-size:5px;font-weight:900;letter-spacing:.14em}.section-head strong{margin-top:4px;font-size:18px;font-weight:950}.section-head>span{color:#999aa4;font-size:6px}.section-action{padding:7px 9px;border-radius:9px;background:#282a41;color:#fff;font-size:6px;font-weight:850}.request-list,.appeal-list{display:grid;gap:9px}.request-card,.appeal-card{overflow:hidden;padding:13px;border:1px solid rgba(30,31,47,.055);border-radius:19px;background:#fff;box-shadow:0 8px 21px rgba(27,29,45,.045)}.request-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.request-top>view{min-width:0}.request-top text,.request-top strong{display:block}.request-top text{color:#a0a1aa;font-size:5px}.request-top strong{margin-top:4px;font-size:8px;line-height:1.45}.request-top>span,.appeal-head>span{flex:0 0 auto;padding:5px 7px;border-radius:7px;background:#fff2dd;color:#b17712;font-size:6px;font-weight:850}.request-top>span.status-approved,.appeal-head>span.status-approved{background:#e8f7f2;color:#27826a}.request-top>span.status-rejected,.appeal-head>span.status-rejected{background:#f0f0f3;color:#82838d}.handoff{display:grid;grid-template-columns:1fr 55px 1fr;align-items:center;margin-top:12px;padding:11px;border-radius:13px;background:linear-gradient(135deg,#f7f6ff,#fff6f7)}.handoff>view:not(.handoff-arrow){display:grid;grid-template-columns:28px 1fr;align-items:center}.handoff>view:not(.handoff-arrow)>i{grid-row:1/3;display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:9px 9px 9px 3px;background:#2c2e47;color:#fff;font-size:8px;font-style:normal;font-weight:900}.handoff>view:not(.handoff-arrow)>i.target{background:#6656ca}.handoff>view:not(.handoff-arrow)>text,.handoff>view:not(.handoff-arrow)>small{overflow:hidden;margin-left:6px;text-overflow:ellipsis;white-space:nowrap}.handoff>view:not(.handoff-arrow)>text{font-size:7px;font-weight:850}.handoff>view:not(.handoff-arrow)>small{color:#999aa4;font-size:5px}.handoff-arrow{text-align:center}.handoff-arrow text,.handoff-arrow i{display:block}.handoff-arrow text{color:#9b9ca6;font-size:5px}.handoff-arrow i{margin-top:2px;color:#e15771;font-size:16px;font-style:normal}.evidence-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.evidence-chips text{padding:5px 7px;border:1px solid #e5e5eb;border-radius:7px;background:#fafafd;color:#777985;font-size:5px}.decision-note{margin-top:10px;padding:10px;border-radius:11px;background:#f6f7f9}.decision-note text,.decision-note strong,.decision-note span{display:block}.decision-note text{color:#9a9ba4;font-size:5px}.decision-note strong{margin-top:4px;font-size:7px;line-height:1.45}.decision-note span{margin-top:4px;color:#9d9ea7;font-size:5px}.decision-actions{display:grid;grid-template-columns:.7fr 1.3fr;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #eeeef2}.decision-actions button{height:34px;border-radius:10px;background:#f0f1f4;color:#72737d;font-size:7px;font-weight:850}.decision-actions button.approve{background:#282a42;color:#fff}.appeal-head{display:flex;align-items:center;gap:8px}.appeal-icon{display:flex;width:32px;height:32px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:10px;background:#fff0f2;color:#dc4d67;font-size:7px;font-weight:900}.appeal-head>view:nth-child(2){min-width:0;flex:1}.appeal-head text,.appeal-head strong{display:block}.appeal-head text{color:#9b9ca6;font-size:5px}.appeal-head strong{margin-top:4px;font-size:8px;line-height:1.45}
.empty-row{display:flex;align-items:center;gap:10px;padding:15px;border:1px dashed #dcdde4;border-radius:17px;background:#fafafd}.empty-row>i{display:flex;width:34px;height:34px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:11px;background:#eeecff;color:#6558ca;font-size:8px;font-style:normal;font-weight:900}.empty-row strong,.empty-row text{display:block}.empty-row strong{font-size:8px}.empty-row text{margin-top:4px;color:#999aa4;font-size:6px;line-height:1.5}.collaboration-card{overflow:hidden;border:1px solid rgba(30,31,47,.055);border-radius:18px;background:#fff}.owner-mini,.member-row{display:flex;align-items:center;padding:12px}.owner-mini i,.member-row>i{display:flex;width:34px;height:34px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:11px 11px 11px 4px;background:#282b45;color:#fff;font-size:9px;font-style:normal;font-weight:900}.member-row{border-top:1px solid #eeeef2}.member-row>i{background:#6658cd}.owner-mini>view,.member-row>view{min-width:0;flex:1;margin-left:9px}.owner-mini strong,.owner-mini text,.member-row strong,.member-row text{display:block}.owner-mini strong,.member-row strong{font-size:8px}.owner-mini text,.member-row text{margin-top:4px;color:#999aa4;font-size:6px}.owner-mini>span,.member-row>span{padding:4px 6px;border-radius:6px;background:#edf7f4;color:#347b67;font-size:5px}.member-row>span{background:#f0edff;color:#5e52bf}.collaboration-empty{padding:12px;border-top:1px solid #eeeef2;color:#999aa4;font-size:6px;line-height:1.55}.timeline{padding:13px;border:1px solid rgba(30,31,47,.055);border-radius:18px;background:#fff}.timeline-item{display:flex;gap:10px;min-height:63px}.timeline-marker{position:relative;width:12px;flex:0 0 auto}.timeline-marker i{position:absolute;z-index:2;top:4px;left:2px;width:8px;height:8px;border-radius:50%;background:#6859d0;box-shadow:0 0 0 4px #eeecff}.timeline-marker span{position:absolute;top:17px;bottom:0;left:5px;width:2px;background:#ecebf3}.timeline-item:last-child .timeline-marker span{display:none}.timeline-item>view:last-child{padding-bottom:11px}.timeline-item text,.timeline-item strong,.timeline-item small{display:block}.timeline-item text{color:#e0556f;font-size:5px;font-weight:850}.timeline-item strong{margin-top:4px;font-size:7px;line-height:1.45}.timeline-item small{margin-top:4px;color:#9b9ca6;font-size:5px}.integrity-note{display:flex;align-items:flex-start;gap:9px;margin-top:14px;padding:12px;border:1px solid #e1e5ed;border-radius:15px;background:#f9fafc;color:#747682;font-size:6px;line-height:1.55}.integrity-note i{display:flex;width:27px;height:27px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:9px;background:#292c45;color:#8de7d0;font-size:6px;font-style:normal;font-weight:900}
.state-card{display:flex;min-height:72vh;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:#898a95;font-size:8px}.state-card>view{display:flex;width:51px;height:51px;align-items:center;justify-content:center;border-radius:17px;background:#fff;box-shadow:0 12px 28px rgba(29,30,47,.08);color:#e3546f;font-size:16px}.state-card>view i{width:8px;height:8px;border-radius:50%;background:#e3546f;box-shadow:16px 4px 0 #6658ce,-9px 14px 0 #70d4b7}.state-card strong{color:#282a38;font-size:13px}.state-card button{margin-top:5px;padding:10px 15px;border-radius:11px;background:#282a42;color:#fff;font-size:7px}.sheet-layer{position:fixed;z-index:50;inset:0;display:flex;align-items:flex-end;background:rgba(8,9,22,.58)}.action-sheet{width:100%;max-height:90vh;overflow-y:auto;padding:9px 18px calc(22px + env(safe-area-inset-bottom));border-radius:29px 29px 0 0;background:#fff}.sheet-handle{width:40px;height:4px;margin:0 auto 16px;border-radius:99px;background:#dddde4}.sheet-head{display:flex;align-items:flex-start;justify-content:space-between}.sheet-head text,.sheet-head strong{display:block}.sheet-head text{color:#e45470;font-size:6px;font-weight:900;letter-spacing:.14em}.sheet-head strong{margin-top:4px;font-size:20px;font-weight:950}.sheet-head>button{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:11px;background:#f1f1f5;color:#696a75;font-size:19px}.action-sheet label{display:block;margin-top:14px}.action-sheet label>text{display:block;margin:0 0 6px 2px;color:#62636e;font-size:8px;font-weight:850}.action-sheet textarea{box-sizing:border-box;width:100%;height:85px;padding:10px;border:1px solid #e0e1e7;border-radius:13px;background:#f9f9fb;font-size:8px;line-height:1.55}.candidate-list{display:grid;gap:6px}.candidate-list>button{display:flex;align-items:center;padding:10px;border:1px solid #e2e3e9;border-radius:13px;background:#fafafd;color:#252632;text-align:left}.candidate-list>button.active{border-color:#6a5bcf;background:#f1efff}.candidate-list>button>i{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:11px;background:#2c2e47;color:#fff;font-size:9px;font-style:normal;font-weight:900}.candidate-list>button>view{min-width:0;flex:1;margin-left:8px}.candidate-list strong,.candidate-list text{display:block}.candidate-list strong{font-size:8px}.candidate-list text{margin-top:3px;color:#999aa4;font-size:6px}.candidate-list>button>span{color:#5e51c0;font-size:10px;font-weight:900}.sheet-warning{display:flex;align-items:flex-start;gap:8px;margin-top:14px;padding:11px;border-radius:12px;background:#fff0f2;color:#80535b;font-size:6px;line-height:1.5}.sheet-warning i{display:flex;width:20px;height:20px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:7px;background:#dd5069;color:#fff;font-size:7px;font-style:normal;font-weight:900}.role-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.role-grid button{height:39px;border:1px solid #e2e3e8;border-radius:11px;background:#fafafd;color:#7d7e89;font-size:6px;font-weight:850}.role-grid button.active{border-color:#6658ca;background:#efedff;color:#5d50be}.decision-summary{display:flex;align-items:center;gap:10px;margin-top:14px;padding:13px;border-radius:15px;background:linear-gradient(135deg,#f3f1ff,#fff3f5)}.decision-summary>i{display:flex;width:39px;height:39px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:13px;background:#282a43;color:#82e2c6;font-size:13px;font-style:normal;font-weight:900}.decision-summary strong,.decision-summary text{display:block}.decision-summary strong{font-size:8px}.decision-summary text{margin-top:5px;color:#858690;font-size:6px}.primary-action{width:100%;height:50px;margin-top:16px;border-radius:15px;background:linear-gradient(135deg,#ed5872,#c43f62);box-shadow:0 12px 24px rgba(204,65,96,.2);color:#fff;font-size:9px;font-weight:900}.primary-action[disabled]{opacity:.6}.safe-note{display:block;margin-top:9px;color:#999aa4;font-size:5px;text-align:center}
@media(min-width:680px){.hero,.content{max-width:720px;margin:0 auto}.action-sheet{max-width:520px;margin:0 auto}}
</style>
