<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ProviderDeliveryCaseSummary,
  ProviderDeliveryEvidenceSummary,
  ProviderDeliveryStage,
  ProviderDeliveryBoardOverview,
} from '@lequ/contracts'
import { fetchProviderDeliveryBoard } from '../../services/delivery-board'

type StageFilter = 'ALL' | ProviderDeliveryStage

const overview = ref<ProviderDeliveryBoardOverview | null>(null)
const loading = ref(true)
const switching = ref(false)
const errorMessage = ref('')
const selectedStage = ref<StageFilter>('ALL')

const focus = computed(() => overview.value?.focusCase ?? null)
const filteredCases = computed(() => {
  const cases = overview.value?.cases ?? []
  return selectedStage.value === 'ALL'
    ? cases
    : cases.filter((item) => item.stage === selectedStage.value)
})
const currentStage = computed(() =>
  overview.value?.stages.find(({ key }) => key === focus.value?.stage) ?? null,
)
const action = computed(() => {
  const item = focus.value
  if (!item) return { label: '等待交付案件', url: '' }
  if (['WAITING_CAPTURE', 'CAPTURING'].includes(item.stage)) {
    return {
      label: item.stage === 'WAITING_CAPTURE' ? '进入资料采集与确认' : '继续确认经营资料',
      url: `/pages/growth/index?focusLeadId=${encodeURIComponent(item.leadId)}`,
    }
  }
  if (['MINIAPP_GENERATING', 'MERCHANT_CONFIRMATION', 'REVIEWING', 'LIVE'].includes(item.stage)) {
    return {
      label: item.stage === 'LIVE' ? '查看小程序发布结果' : '进入 MiniApp Factory',
      url: `/pages/factory/index${item.projectId ? `?focusProjectId=${encodeURIComponent(item.projectId)}` : ''}`,
    }
  }
  if (item.stage === 'GEO_SERVICING') {
    return {
      label: '进入 GEO 服务工作区',
      url: `/pages/geo/index${item.geoWorkspaceId ? `?focusWorkspaceId=${encodeURIComponent(item.geoWorkspaceId)}` : ''}`,
    }
  }
  return {
    label: item.stage === 'DELIVERED' ? '查看 Skill 交付资产' : '进入 Skill Network',
    url: `/pages/skills/index${item.skillSuiteId ? `?focusSuiteId=${encodeURIComponent(item.skillSuiteId)}` : ''}`,
  }
})

const sourceCards = computed(() => {
  const item = focus.value
  if (!item) return []
  return [
    {
      code: '01',
      name: '商家入网',
      caption: 'ONBOARDING',
      value: item.sourceStatuses.lead,
      active: true,
    },
    {
      code: '02',
      name: '小程序工厂',
      caption: 'MINIAPP',
      value: item.sourceStatuses.miniapp ?? '尚未创建',
      active: Boolean(item.projectId),
    },
    {
      code: '03',
      name: 'GEO OS',
      caption: 'GEO',
      value: item.sourceStatuses.geo ?? '尚未创建',
      active: Boolean(item.geoWorkspaceId),
    },
    {
      code: '04',
      name: 'Skill Network',
      caption: 'SKILL',
      value: item.sourceStatuses.skill ?? '尚未创建',
      active: Boolean(item.skillSuiteId),
    },
  ]
})

const evidenceLabels: Record<ProviderDeliveryEvidenceSummary['source'], string> = {
  DELIVERY: '交付案件',
  ONBOARDING: '商家入网',
  MINIAPP: '小程序工厂',
  GEO: 'GEO OS',
  SKILL: 'Skill Network',
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function slaLabel(item: ProviderDeliveryCaseSummary): string {
  if (item.slaStatus === 'COMPLETED') return '已按链路交付'
  if (item.slaStatus === 'OVERDUE') return `已超时 ${Math.abs(item.hoursRemaining)}h`
  if (item.slaStatus === 'DUE_SOON') return `剩余 ${item.hoursRemaining}h`
  return `SLA 剩余 ${item.hoursRemaining}h`
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

async function load(focusCaseId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderDeliveryBoard(focusCaseId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '交付看板加载失败'
  } finally {
    loading.value = false
  }
}

async function selectCase(caseId: string): Promise<void> {
  if (focus.value?.id === caseId || switching.value) return
  switching.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderDeliveryBoard(caseId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '案件切换失败'
  } finally {
    switching.value = false
  }
}

function selectStage(stage: StageFilter): void {
  selectedStage.value = stage
}

function openAction(): void {
  if (!action.value.url) return
  uni.navigateTo({ url: action.value.url })
}

function openGrowth(): void {
  uni.navigateTo({ url: '/pages/growth/index' })
}

function openWorkOrders(): void {
  const query = focus.value ? `?focusCaseId=${encodeURIComponent(focus.value.id)}` : ''
  uni.navigateTo({ url: `/pages/work-orders/index${query}` })
}

onLoad((query) => {
  const focusCaseId = typeof query?.focusCaseId === 'string' ? query.focusCaseId : undefined
  const stage = typeof query?.stage === 'string' ? query.stage as StageFilter : 'ALL'
  const validStages = new Set<StageFilter>([
    'ALL',
    'WAITING_CAPTURE',
    'CAPTURING',
    'MINIAPP_GENERATING',
    'MERCHANT_CONFIRMATION',
    'REVIEWING',
    'LIVE',
    'GEO_SERVICING',
    'SKILL_GENERATING',
    'DELIVERED',
  ])
  selectedStage.value = validStages.has(stage) ? stage : 'ALL'
  void load(focusCaseId)
})
</script>

<template>
  <view class="delivery-shell">
    <view class="ambient ambient-a" />
    <view class="ambient ambient-b" />

    <header class="topbar">
      <button class="back" aria-label="返回" @click="goBack">‹</button>
      <view class="brand">
        <view class="brand-mark"><text>9</text><small>STAGE</small></view>
        <view><text class="brand-name">Delivery Control</text><text class="brand-copy">城市交付中枢</text></view>
      </view>
      <view class="sync-pill"><view class="sync-dot" /> 权威状态实时投影</view>
    </header>

    <scroll-view scroll-y class="viewport">
      <main class="content">
        <view v-if="errorMessage" class="error-bar">
          <text>{{ errorMessage }}</text>
          <button @click="load(focus?.id)">重新同步</button>
        </view>

        <view class="hero">
          <view class="hero-grid" />
          <view class="hero-glow" />
          <view class="hero-main">
            <view class="hero-kicker"><text>LIVE</text> {{ overview?.city.name ?? '城市交付网络' }}</view>
            <text class="hero-title">九阶段，一条可信交付链</text>
            <text class="hero-summary">每个商家都有负责人、下一步和证据链。状态直接来自四个权威业务域，不靠人工重复维护。</text>
          </view>
          <view class="hero-score" :style="{ '--hero-progress': `${(overview?.metrics.averageProgressRate ?? 0) * 3.6}deg` }">
            <text>{{ overview?.metrics.averageProgressRate ?? 0 }}</text><small>%</small>
            <view>平均交付进度</view>
          </view>
          <view class="hero-metrics">
            <view><text>{{ overview?.metrics.active ?? '—' }}</text><small>进行中</small></view>
            <view><text>{{ overview?.metrics.atRisk ?? '—' }}</text><small>需关注</small></view>
            <view><text>{{ overview?.metrics.delivered ?? '—' }}</text><small>已交付</small></view>
            <view><text>{{ overview?.metrics.averageCycleHours ?? '—' }}h</text><small>平均周期</small></view>
          </view>
        </view>

        <view v-if="loading" class="loading-panel">
          <view class="loading-ring" />
          <text>正在汇聚四个权威领域的交付状态…</text>
        </view>

        <template v-else-if="overview">
          <view class="stage-panel">
            <view class="section-head">
              <view><text class="eyebrow">DELIVERY PIPELINE</text><text class="section-title">全城九阶段分布</text></view>
              <view class="section-actions">
                <button class="work-order-link" @click="openWorkOrders">工单中心 ↗</button>
                <button :class="{ active: selectedStage === 'ALL' }" @click="selectStage('ALL')">全部 {{ overview.metrics.total }}</button>
              </view>
            </view>
            <scroll-view scroll-x class="stage-scroll" :show-scrollbar="false">
              <view class="stage-track">
                <button
                  v-for="stage in overview.stages"
                  :key="stage.key"
                  class="stage-node"
                  :class="{
                    selected: selectedStage === stage.key,
                    passed: focus && stage.index < focus.stageIndex,
                    current: focus?.stage === stage.key,
                  }"
                  @click="selectStage(stage.key)"
                >
                  <view class="stage-index">{{ String(stage.index).padStart(2, '0') }}</view>
                  <view class="stage-copy"><text>{{ stage.shortLabel }}</text><small>{{ stage.count }} 个案件</small></view>
                  <view v-if="stage.index < 9" class="stage-line" />
                </button>
              </view>
            </scroll-view>
          </view>

          <view class="workspace">
            <aside class="case-panel panel">
              <view class="panel-head">
                <view><text class="eyebrow">CASE QUEUE</text><text class="panel-title">交付案件</text></view>
                <text class="count">{{ filteredCases.length }}</text>
              </view>
              <scroll-view scroll-y class="case-list">
                <button
                  v-for="item in filteredCases"
                  :key="item.id"
                  class="case-card"
                  :class="{ active: focus?.id === item.id }"
                  @click="selectCase(item.id)"
                >
                  <view class="case-top">
                    <view class="merchant-avatar">{{ item.merchantName.slice(0, 1) }}</view>
                    <view class="merchant-copy"><text>{{ item.merchantName }}</text><small>{{ item.category }} · {{ item.owner.displayName }}</small></view>
                    <view class="progress-number">{{ item.progressRate }}%</view>
                  </view>
                  <view class="mini-progress"><view :style="{ width: `${item.progressRate}%` }" /></view>
                  <view class="case-foot">
                    <text>{{ overview.stages.find((stage) => stage.key === item.stage)?.label }}</text>
                    <text :class="`sla-${item.slaStatus.toLowerCase()}`">{{ slaLabel(item) }}</text>
                  </view>
                </button>
                <view v-if="filteredCases.length === 0" class="empty">
                  <view>✓</view><text>该阶段暂无积压案件</text><small>新的权威状态会自动进入对应阶段</small>
                </view>
              </scroll-view>
            </aside>

            <section v-if="focus" class="focus-column">
              <view class="focus-card">
                <view class="focus-watermark">{{ String(focus.stageIndex).padStart(2, '0') }}</view>
                <view class="focus-heading">
                  <view>
                    <view class="focus-badges">
                      <text>阶段 {{ focus.stageIndex }}/9</text>
                      <text :class="`risk-${focus.slaStatus.toLowerCase()}`">{{ slaLabel(focus) }}</text>
                    </view>
                    <text class="focus-name">{{ focus.merchantName }}</text>
                    <text class="focus-meta">{{ focus.category }} · 案件 {{ focus.id.slice(-8).toUpperCase() }}</text>
                  </view>
                  <view class="progress-orbit" :style="{ '--progress': `${focus.progressRate * 3.6}deg` }">
                    <view><text>{{ focus.progressRate }}</text><small>%</small></view>
                  </view>
                </view>

                <view class="focus-body">
                  <view class="next-card">
                    <view class="next-icon">↗</view>
                    <view><small>NEXT BEST ACTION</small><text>{{ focus.nextAction }}</text></view>
                  </view>
                  <button class="primary-action" @click="openAction">
                    <view><small>继续推进并保留证据</small><text>{{ action.label }}</text></view><b>→</b>
                  </button>
                  <view class="owner-row">
                    <view class="owner-avatar">{{ focus.owner.displayName.slice(0, 1) }}</view>
                    <view><small>交付负责人</small><text>{{ focus.owner.displayName }}</text></view>
                    <view class="owner-divider" />
                    <view><small>阶段停留</small><text>{{ focus.stageAgeHours }} 小时</text></view>
                    <view class="owner-divider" />
                    <view><small>目标交付</small><text>{{ shortDate(focus.targetDueAt) }}</text></view>
                  </view>
                </view>
              </view>

              <view class="source-panel panel">
                <view class="panel-head">
                  <view><text class="eyebrow">SOURCE OF TRUTH</text><text class="panel-title">权威状态链</text></view>
                  <text class="version">{{ overview.policy.projectionVersion.replace('provider-delivery-', '') }}</text>
                </view>
                <view class="source-grid">
                  <view
                    v-for="(source, index) in sourceCards"
                    :key="source.caption"
                    class="source-card"
                    :class="{ active: source.active }"
                  >
                    <view class="source-top"><text>{{ source.code }}</text><view :class="{ online: source.active }" /></view>
                    <text class="source-caption">{{ source.caption }}</text>
                    <text class="source-name">{{ source.name }}</text>
                    <text class="source-value">{{ source.value }}</text>
                    <view v-if="index < sourceCards.length - 1" class="source-connector">→</view>
                  </view>
                </view>
              </view>

              <view class="lower-grid">
                <view class="journey-panel panel">
                  <view class="panel-head">
                    <view><text class="eyebrow">STAGE CONTRACT</text><text class="panel-title">当前阶段准入</text></view>
                    <text class="target">{{ currentStage?.targetHours }}H 目标</text>
                  </view>
                  <view class="journey-body">
                    <view class="journey-index">{{ String(focus.stageIndex).padStart(2, '0') }}</view>
                    <view><text>{{ currentStage?.label }}</text><small>{{ currentStage?.description }}</small></view>
                  </view>
                  <view class="guardrails">
                    <view><text>✓</text><small>城市数据隔离</small></view>
                    <view><text>✓</text><small>状态自动推导</small></view>
                    <view><text>✓</text><small>事实不可篡改</small></view>
                  </view>
                </view>

                <view class="evidence-panel panel">
                  <view class="panel-head">
                    <view><text class="eyebrow">AUDIT TRAIL</text><text class="panel-title">最近交付证据</text></view>
                    <text class="count">{{ overview.evidence.length }}</text>
                  </view>
                  <scroll-view scroll-y class="evidence-list">
                    <view v-for="event in overview.evidence" :key="event.id" class="event">
                      <view class="event-rail"><view /><view class="event-line" /></view>
                      <view class="event-body">
                        <view><text>{{ evidenceLabels[event.source] }}</text><small>{{ shortDate(event.createdAt) }}</small></view>
                        <text class="event-summary">{{ event.summary }}</text>
                        <small>{{ event.actorName }} · {{ event.type }}</small>
                      </view>
                    </view>
                    <view v-if="overview.evidence.length === 0" class="empty compact"><text>暂无交付证据</text></view>
                  </scroll-view>
                </view>
              </view>
            </section>

            <view v-else class="no-focus panel">
              <view>9</view><text>从签约开始，自动建立交付案件</text><small>完成套餐签约后，系统将分配城市交付负责人并启动 168 小时总 SLA。</small>
              <button @click="openGrowth">进入本地签约工作台 →</button>
            </view>
          </view>

          <view class="trust-footer">
            <view><text>168H</text><small>总交付 SLA</small></view>
            <view><text>4</text><small>权威业务域</small></view>
            <view><text>9</text><small>自动投影阶段</small></view>
            <view><text>100%</text><small>关键操作留痕</small></view>
          </view>
        </template>
      </main>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
button{margin:0;padding:0;border:0;border-radius:0;line-height:inherit;background:transparent}button::after{display:none}
.delivery-shell{position:relative;min-height:100vh;overflow:hidden;color:#101624;background:#f1f4f8}.ambient{position:fixed;border-radius:50%;filter:blur(70px);pointer-events:none}.ambient-a{width:360px;height:360px;right:-160px;top:120px;background:rgba(100,79,238,.12)}.ambient-b{width:330px;height:330px;left:-180px;bottom:-80px;background:rgba(13,183,144,.1)}
.topbar{position:relative;z-index:5;height:80px;padding:env(safe-area-inset-top) 28px 0;display:flex;align-items:center;gap:14px;color:#fff;background:#090f22}.back{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;font-size:29px;background:rgba(255,255,255,.05)}.brand{display:flex;align-items:center;gap:11px;flex:1}.brand-mark{width:40px;height:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.18);border-radius:13px;background:linear-gradient(145deg,#7659f1,#16b38a);box-shadow:0 9px 25px rgba(100,80,230,.25)}.brand-mark text{font-size:17px;font-weight:900;line-height:1}.brand-mark small{margin-top:3px;font-size:5px;font-weight:800;letter-spacing:.8px}.brand-name,.brand-copy{display:block}.brand-name{font-size:15px;font-weight:800;letter-spacing:.02em}.brand-copy{margin-top:3px;color:#8995b2;font-size:8px;letter-spacing:.12em}.sync-pill{padding:8px 12px;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.1);border-radius:99px;color:#bcc5db;font-size:8px;background:rgba(255,255,255,.04)}.sync-dot{width:7px;height:7px;border-radius:50%;background:#27d5a2;box-shadow:0 0 0 5px rgba(39,213,162,.12)}
.viewport{height:calc(100vh - 80px)}.content{position:relative;z-index:1;width:min(1420px,calc(100% - 48px));margin:auto;padding:28px 0 56px}.error-bar{margin-bottom:13px;padding:12px 15px;display:flex;align-items:center;justify-content:space-between;border:1px solid #ffcbd4;border-radius:14px;color:#a52a40;font-size:9px;background:#fff0f3}.error-bar button{color:#9f2940;font-size:9px;font-weight:750}
.hero{position:relative;min-height:225px;padding:29px 32px;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 190px;align-items:center;border-radius:28px;color:#fff;background:linear-gradient(125deg,#0d152e 0%,#151b3d 50%,#163c44 100%);box-shadow:0 24px 52px rgba(16,25,55,.2)}.hero-grid{position:absolute;inset:0;opacity:.13;background-image:linear-gradient(rgba(255,255,255,.24) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.24) 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(90deg,#000,transparent 75%)}.hero-glow{position:absolute;width:300px;height:300px;right:50px;top:-130px;border-radius:50%;background:radial-gradient(circle,rgba(42,223,171,.27),rgba(106,84,234,.1) 55%,transparent 70%)}.hero-main,.hero-score{position:relative}.hero-kicker{display:flex;align-items:center;gap:7px;color:#9da8c3;font-size:8px;font-weight:800;letter-spacing:1.3px}.hero-kicker text{padding:4px 6px;border-radius:99px;color:#051e18;background:#2bdba8}.hero-title{display:block;margin-top:16px;font-size:31px;font-weight:860;letter-spacing:-1.3px}.hero-summary{display:block;max-width:620px;margin-top:10px;color:#a8b3cb;font-size:10px;line-height:1.7}.hero-score{justify-self:end;width:134px;height:134px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:conic-gradient(#2bd9a6 var(--hero-progress),rgba(255,255,255,.08) 0);box-shadow:inset 0 0 0 10px #121b38}.hero-score>text{font-size:39px;font-weight:850}.hero-score>small{margin-top:13px;color:#aeb8ce;font-size:10px}.hero-score>view{position:absolute;margin-top:65px;color:#8f9bb7;font-size:7px}.hero-metrics{position:absolute;left:32px;right:230px;bottom:24px;display:flex;gap:30px}.hero-metrics view{display:flex;align-items:baseline;gap:7px}.hero-metrics text{font-size:17px;font-weight:820}.hero-metrics small{color:#8995af;font-size:7px}
.loading-panel{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#778195;font-size:10px}.loading-ring{width:35px;height:35px;margin-bottom:14px;border:3px solid #e2e5eb;border-top-color:#6c56df;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.panel,.stage-panel{border:1px solid #dfe4ea;border-radius:23px;background:rgba(255,255,255,.92);box-shadow:0 15px 40px rgba(28,42,58,.055)}.stage-panel{margin-top:14px;padding:19px 0 15px;overflow:hidden}.section-head,.panel-head{padding:0 20px 14px;display:flex;align-items:center;justify-content:space-between}.section-actions{display:flex;gap:6px}.section-actions button{padding:6px 10px;border-radius:99px;color:#778196;font-size:8px;background:#f1f3f7}.section-actions button.active{color:#fff;background:#161d38}.section-actions .work-order-link{color:#fff;background:linear-gradient(110deg,#6c57db,#19aa83)}.eyebrow,.section-title,.panel-title{display:block}.eyebrow{color:#8874e9;font-size:7px;font-weight:850;letter-spacing:1.4px}.section-title,.panel-title{margin-top:4px;font-size:14px;font-weight:800}.stage-scroll{width:100%;white-space:nowrap}.stage-track{min-width:940px;padding:2px 20px;display:flex}.stage-node{position:relative;width:100px;display:flex;align-items:center;gap:8px;text-align:left}.stage-index{position:relative;z-index:2;width:27px;height:27px;display:flex;align-items:center;justify-content:center;flex:0 0 27px;border:2px solid #e0e4e9;border-radius:50%;color:#9aa1ae;font-size:7px;font-weight:800;background:#fff}.stage-copy{position:relative;z-index:2;min-width:0}.stage-copy text,.stage-copy small{display:block}.stage-copy text{color:#626a7a;font-size:8px;font-weight:730}.stage-copy small{margin-top:3px;color:#a0a6b1;font-size:6px}.stage-line{position:absolute;z-index:1;left:26px;right:-1px;top:13px;height:2px;background:#e8ebef}.stage-node.passed .stage-index{color:#fff;border-color:#6b57df;background:#6b57df}.stage-node.passed .stage-line{background:#6b57df}.stage-node.current .stage-index{color:#075e48;border-color:#25c69b;background:#dff9f1;box-shadow:0 0 0 5px #effaf7}.stage-node.selected .stage-copy text{color:#5c48cf}.stage-node.selected .stage-copy small{color:#7665d7}
.workspace{margin-top:14px;display:grid;grid-template-columns:310px minmax(0,1fr);gap:14px;align-items:start}.case-panel{overflow:hidden}.count,.version,.target{padding:5px 8px;border-radius:99px;color:#6b7484;font-size:7px;background:#f0f2f5}.case-list{height:690px;padding:0 9px 10px;box-sizing:border-box}.case-card{width:100%;margin-bottom:7px;padding:12px 10px;border:1px solid transparent;border-radius:16px;text-align:left;background:#f8f9fb;transition:.18s}.case-card.active{border-color:#d8d0ff;background:linear-gradient(135deg,#f2efff,#effaf7);box-shadow:0 8px 22px rgba(90,73,203,.08)}.case-top{display:flex;align-items:center;gap:9px}.merchant-avatar{width:37px;height:37px;flex:0 0 37px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:#fff;font-size:12px;font-weight:800;background:linear-gradient(140deg,#725ce7,#22ae89)}.merchant-copy{min-width:0;flex:1}.merchant-copy text,.merchant-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.merchant-copy text{font-size:10px;font-weight:760}.merchant-copy small{margin-top:4px;color:#8a92a0;font-size:7px}.progress-number{color:#6653d5;font-size:11px;font-weight:850}.mini-progress{height:3px;margin-top:10px;overflow:hidden;border-radius:99px;background:#e4e7eb}.mini-progress view{height:100%;border-radius:inherit;background:linear-gradient(90deg,#735ee8,#24bd93)}.case-foot{margin-top:8px;display:flex;justify-content:space-between;color:#71798a;font-size:7px}.sla-overdue,.risk-overdue{color:#d9445b!important}.sla-due_soon,.risk-due_soon{color:#bd7912!important}.sla-completed,.risk-completed{color:#078160!important}.empty{padding:32px 15px;text-align:center}.empty view{width:42px;height:42px;margin:auto;display:flex;align-items:center;justify-content:center;border-radius:14px;color:#0e8e6b;background:#e1f8f0}.empty text,.empty small{display:block}.empty text{margin-top:10px;font-size:10px;font-weight:740}.empty small{margin-top:5px;color:#9299a6;font-size:7px;line-height:1.5}.empty.compact{padding:20px}
.focus-column{display:grid;gap:14px}.focus-card{position:relative;overflow:hidden;border-radius:24px;background:#fff;box-shadow:0 16px 42px rgba(28,41,57,.07)}.focus-heading{position:relative;min-height:145px;padding:23px 25px;display:flex;align-items:center;justify-content:space-between;color:#fff;background:linear-gradient(120deg,#121a35,#24244e 58%,#174c4f)}.focus-watermark{position:absolute;right:175px;top:-33px;color:rgba(255,255,255,.035);font-size:145px;font-weight:900;line-height:1}.focus-badges{display:flex;gap:6px}.focus-badges text{padding:5px 8px;border:1px solid rgba(255,255,255,.1);border-radius:99px;color:#c5cde1;font-size:7px;background:rgba(255,255,255,.06)}.focus-name,.focus-meta{display:block}.focus-name{margin-top:13px;font-size:23px;font-weight:850}.focus-meta{margin-top:6px;color:#8e9ab5;font-size:8px}.progress-orbit{width:82px;height:82px;flex:0 0 82px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:conic-gradient(#29d6a3 var(--progress),rgba(255,255,255,.1) 0)}.progress-orbit>view{width:66px;height:66px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#19223e}.progress-orbit text{font-size:23px;font-weight:850}.progress-orbit small{margin-top:8px;color:#8d98b1;font-size:8px}.focus-body{padding:16px}.next-card{padding:14px;display:flex;align-items:center;gap:12px;border:1px solid #e2e5ea;border-radius:16px;background:#fafbfc}.next-icon{width:37px;height:37px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:#fff;font-size:16px;background:linear-gradient(140deg,#745ee7,#20b78f)}.next-card>view:nth-child(2){min-width:0}.next-card small,.next-card text{display:block}.next-card small{color:#8d95a4;font-size:6px;font-weight:800;letter-spacing:1.2px}.next-card text{margin-top:5px;font-size:11px;font-weight:750}.primary-action{width:100%;min-height:61px;margin-top:10px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-radius:16px;color:#fff;text-align:left;background:linear-gradient(110deg,#6955db,#6756dc 50%,#14a980);box-shadow:0 13px 28px rgba(94,78,205,.2)}.primary-action small,.primary-action text{display:block}.primary-action small{color:#d7d4f6;font-size:6px;letter-spacing:1px}.primary-action text{margin-top:5px;font-size:12px;font-weight:780}.primary-action b{font-size:21px}.owner-row{margin-top:11px;padding:11px 5px 2px;display:flex;align-items:center;gap:9px}.owner-avatar{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#6654d2;font-size:10px;font-weight:800;background:#ece9ff}.owner-row>view:not(.owner-avatar):not(.owner-divider){min-width:0}.owner-row small,.owner-row text{display:block}.owner-row small{color:#999fac;font-size:6px}.owner-row text{margin-top:4px;font-size:8px;font-weight:700;white-space:nowrap}.owner-divider{width:1px;height:27px;margin:0 3px;background:#e6e8ec}
.source-panel{padding:18px 0}.source-grid{padding:0 15px;display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.source-card{position:relative;min-width:0;padding:12px;border:1px solid #e4e7eb;border-radius:15px;background:#fafbfc}.source-card.active{border-color:#dcd5ff;background:linear-gradient(145deg,#f5f2ff,#f2fbf8)}.source-top{display:flex;align-items:center;justify-content:space-between}.source-top>text{color:#9299a8;font-size:7px;font-weight:800}.source-top>view{width:6px;height:6px;border-radius:50%;background:#cbd0d8}.source-top>view.online{background:#1fc597;box-shadow:0 0 0 4px rgba(31,197,151,.1)}.source-caption,.source-name,.source-value{display:block}.source-caption{margin-top:13px;color:#8c78e8;font-size:6px;font-weight:800;letter-spacing:1px}.source-name{margin-top:4px;font-size:9px;font-weight:750}.source-value{margin-top:8px;overflow:hidden;color:#697184;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.source-connector{position:absolute;z-index:2;right:-9px;top:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border:1px solid #e1e4e9;border-radius:50%;color:#8070d4;font-size:7px;background:#fff}
.lower-grid{display:grid;grid-template-columns:.82fr 1.18fr;gap:14px}.journey-panel,.evidence-panel{overflow:hidden}.journey-body{padding:3px 17px 15px;display:flex;align-items:center;gap:13px}.journey-index{width:48px;height:48px;flex:0 0 48px;display:flex;align-items:center;justify-content:center;border-radius:16px;color:#fff;font-size:15px;font-weight:850;background:linear-gradient(140deg,#715ae2,#1cb58d)}.journey-body>view:nth-child(2) text,.journey-body>view:nth-child(2) small{display:block}.journey-body>view:nth-child(2) text{font-size:11px;font-weight:770}.journey-body>view:nth-child(2) small{margin-top:5px;color:#858d9d;font-size:7px;line-height:1.55}.guardrails{margin:0 13px 13px;padding:10px;display:flex;gap:7px;border-radius:13px;background:#f6f8f9}.guardrails view{flex:1;text-align:center}.guardrails text{display:block;color:#0a936d;font-size:9px}.guardrails small{display:block;margin-top:3px;color:#7f8795;font-size:6px}.evidence-list{height:205px;padding:0 15px 12px;box-sizing:border-box}.event{display:flex;gap:10px}.event-rail{width:11px;flex:0 0 11px;display:flex;align-items:center;flex-direction:column}.event-rail>view:first-child{width:7px;height:7px;flex:0 0 7px;margin-top:4px;border-radius:50%;background:#715bdf;box-shadow:0 0 0 4px #eeebff}.event-rail .event-line{width:1px;flex:1;min-height:38px;background:#e2e4e9}.event:last-child .event-line{display:none}.event-body{min-width:0;flex:1;padding-bottom:12px}.event-body>view{display:flex;justify-content:space-between;gap:8px}.event-body>view text{color:#6b58d7;font-size:7px;font-weight:750}.event-body>view small{color:#a0a6b1;font-size:6px}.event-summary{display:block;margin-top:5px;font-size:8px;font-weight:690;line-height:1.45}.event-body>small{display:block;margin-top:4px;color:#969daa;font-size:6px}
.no-focus{min-height:430px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.no-focus>view{width:54px;height:54px;display:flex;align-items:center;justify-content:center;border-radius:18px;color:#fff;font-size:21px;font-weight:900;background:linear-gradient(140deg,#715be1,#1db68e)}.no-focus>text{margin-top:14px;font-size:16px;font-weight:800}.no-focus>small{max-width:400px;margin-top:7px;color:#8991a0;font-size:8px;line-height:1.6}.no-focus button{margin-top:17px;padding:11px 16px;border-radius:12px;color:#fff;font-size:9px;background:#6553d4}
.trust-footer{margin-top:14px;padding:16px 22px;display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e0e4e9;border-radius:20px;background:rgba(255,255,255,.72)}.trust-footer view{text-align:center}.trust-footer view+view{border-left:1px solid #e5e8ec}.trust-footer text,.trust-footer small{display:block}.trust-footer text{font-size:16px;font-weight:850}.trust-footer small{margin-top:4px;color:#8e95a3;font-size:7px}
@media(max-width:760px){.topbar{height:70px;padding-left:15px;padding-right:15px}.sync-pill{padding:7px}.sync-pill{font-size:0}.sync-pill .sync-dot{margin:0}.viewport{height:calc(100vh - 70px)}.content{width:calc(100% - 24px);padding-top:14px}.hero{min-height:230px;padding:23px 20px;grid-template-columns:1fr 78px;align-items:start}.hero-title{font-size:24px}.hero-summary{font-size:9px}.hero-score{width:75px;height:75px;box-shadow:inset 0 0 0 7px #121b38}.hero-score>text{font-size:24px}.hero-score>view{margin-top:46px;font-size:5px}.hero-metrics{left:20px;right:20px;bottom:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.hero-metrics view{display:block}.hero-metrics text,.hero-metrics small{display:block}.hero-metrics text{font-size:14px}.hero-metrics small{margin-top:3px}.workspace{grid-template-columns:1fr}.case-list{height:auto;max-height:360px}.focus-card{grid-row:auto}.focus-heading{padding:20px;min-height:128px}.focus-name{font-size:19px}.progress-orbit{width:69px;height:69px;flex-basis:69px}.progress-orbit>view{width:55px;height:55px}.progress-orbit text{font-size:19px}.owner-row{overflow-x:auto}.source-grid{grid-template-columns:repeat(2,1fr)}.source-connector{display:none}.lower-grid{grid-template-columns:1fr}.evidence-list{height:240px}.trust-footer{padding:14px 5px}.trust-footer text{font-size:13px}.trust-footer small{font-size:6px}.section-head,.panel-head{padding-left:16px;padding-right:16px}}
</style>
