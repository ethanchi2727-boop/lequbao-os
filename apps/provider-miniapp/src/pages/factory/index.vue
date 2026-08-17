<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  MiniAppFactoryOverview,
  MiniAppProjectStatus,
  MiniAppTemplateSummary,
  OnboardingLeadSummary,
} from '@lequ/contracts'
import { advanceProject, createProject, fetchFactory } from '../../services/factory'

const overview = ref<MiniAppFactoryOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const selectedTemplateCode = ref<MiniAppTemplateSummary['code']>('DINING_AURORA')

const stageFlow: Array<{ key: MiniAppProjectStatus; label: string }> = [
  { key: 'DRAFT', label: '草稿' },
  { key: 'GENERATED', label: '已生成' },
  { key: 'PREVIEW', label: '预览' },
  { key: 'MERCHANT_APPROVAL', label: '商家确认' },
  { key: 'REVIEW', label: '审核' },
  { key: 'GRAY', label: '灰度' },
  { key: 'LIVE', label: '正式' },
]
const statusLabels: Record<MiniAppProjectStatus, string> = {
  DRAFT: '配置草稿', GENERATED: 'AI 已生成', PREVIEW: '等待商家确认',
  MERCHANT_APPROVAL: '商家已确认', REVIEW: '审核中', GRAY: '灰度发布',
  LIVE: '已正式上线', ARCHIVED: '已归档',
}

const focusProject = computed(() => overview.value?.focusProject ?? null)
const selectedTemplate = computed(() => overview.value?.templates.find(
  (template) => template.code === selectedTemplateCode.value,
) ?? null)
const currentStageIndex = computed(() => {
  const status = focusProject.value?.status
  if (!status) return 0
  if (status === 'ARCHIVED') return stageFlow.length - 1
  return Math.max(0, stageFlow.findIndex((stage) => stage.key === status))
})
const canAdvance = computed(() => Boolean(
  focusProject.value && ['DRAFT', 'GENERATED', 'PREVIEW', 'MERCHANT_APPROVAL'].includes(focusProject.value.status) && !busy.value,
))
const actionLabel = computed(() => {
  if (busy.value) return '正在安全执行…'
  switch (focusProject.value?.status) {
    case 'DRAFT': return 'AI 生成页面草稿'
    case 'GENERATED': return '生成可分享预览'
    case 'PREVIEW': return '记录商家现场确认'
    case 'MERCHANT_APPROVAL': return '提交平台审核'
    case 'REVIEW': return '已提交 · 等待总部灰度'
    case 'GRAY': return '灰度观察中'
    case 'LIVE': return '已上线 · 创建新版本'
    default: return '选择一个交付项目'
  }
})

function hoursToSla(value: string): number {
  return Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 3_600_000))
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function load(focusId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchFactory(focusId)
    if (overview.value.focusProject) selectedTemplateCode.value = overview.value.focusProject.templateCode
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function selectProject(projectId: string): Promise<void> {
  if (focusProject.value?.id === projectId || busy.value) return
  await load(projectId)
}

async function startProject(lead: OnboardingLeadSummary): Promise<void> {
  if (!selectedTemplate.value || busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await createProject(lead, selectedTemplate.value)
    uni.showToast({ title: '项目已创建', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建失败'
  } finally {
    busy.value = false
  }
}

async function advance(): Promise<void> {
  const project = focusProject.value
  if (!project || !canAdvance.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await advanceProject(project, selectedTemplateCode.value)
    uni.showToast({ title: '已完成并留痕', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '执行失败'
  } finally {
    busy.value = false
  }
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

onLoad((query) => {
  const focusId = typeof query?.focusProjectId === 'string' ? query.focusProjectId : undefined
  void load(focusId)
})
</script>

<template>
  <view class="factory-shell">
    <view class="mesh mesh-a" /><view class="mesh mesh-b" />
    <view class="topbar">
      <button class="back" @click="goBack">‹</button>
      <view class="brand"><view class="brand-mark">F</view><view><text>MiniApp Factory</text><small>城市交付工作台</small></view></view>
      <view class="live-chip"><view /> 配置驱动运行时</view>
    </view>

    <scroll-view scroll-y class="viewport">
      <view class="content">
        <view class="title-row">
          <view><text class="eyebrow">E2 · ONE DAY DELIVERY</text><text class="page-title">让每一次上线，都清晰、可验收、可回滚</text><text class="page-copy">白名单区块、版本快照与分级发布，把门店数字化交付压缩到一个工作日。</text></view>
          <view class="sla-pill">目标 SLA · 24H</view>
        </view>

        <view v-if="errorMessage" class="error-bar"><text>{{ errorMessage }}</text><button @click="load(focusProject?.id)">重试</button></view>
        <view v-if="loading && !overview" class="loading-card">正在同步交付项目与版本证据…</view>

        <template v-else-if="overview">
          <view class="metric-grid">
            <view class="metric dark"><text class="metric-value">{{ overview.counts.total }}</text><text class="metric-name">交付项目</text><small>城市范围实时数据</small></view>
            <view class="metric"><text class="metric-value coral">{{ overview.counts.awaitingMerchant }}</text><text class="metric-name">待商家确认</text><small>需要现场推进</small></view>
            <view class="metric"><text class="metric-value violet">{{ overview.counts.inReview }}</text><text class="metric-name">审核 / 灰度</text><small>发布门禁进行中</small></view>
            <view class="metric"><text class="metric-value mint">{{ overview.counts.live }}</text><text class="metric-name">正式上线</text><small>{{ overview.counts.slaRisk }} 项 SLA 风险</small></view>
          </view>

          <view class="layout">
            <view class="sidebar">
              <view class="panel project-panel">
                <view class="panel-head"><view><text class="panel-kicker">DELIVERY QUEUE</text><text class="panel-title">交付项目</text></view><text class="count-chip">{{ overview.projects.length }}</text></view>
                <button v-for="project in overview.projects" :key="project.id" class="project-row" :class="{ active: focusProject?.id === project.id }" @click="selectProject(project.id)">
                  <view class="project-avatar">{{ project.merchantName.slice(0,1) }}</view>
                  <view class="project-copy"><view><text class="project-name">{{ project.merchantName }}</text><text class="status-chip">{{ statusLabels[project.status] }}</text></view><text class="project-next">{{ project.nextAction }}</text><text class="project-sla">SLA 剩余 {{ hoursToSla(project.slaDueAt) }} 小时</text></view>
                </button>
                <view v-if="!overview.projects.length" class="empty">尚无项目，从下方已就绪商家开始。</view>
              </view>

              <view class="panel ready-panel">
                <view class="panel-head"><view><text class="panel-kicker">READY TO START</text><text class="panel-title">待建店商家</text></view><text class="count-chip mint-bg">{{ overview.eligibleLeads.length }}</text></view>
                <view v-if="overview.eligibleLeads.length" class="ready-list">
                  <view v-for="lead in overview.eligibleLeads" :key="lead.id" class="ready-row"><view><text>{{ lead.name }}</text><small>{{ lead.category }} · 资料已确认</small></view><button @click="startProject(lead)">创建项目</button></view>
                </view>
                <view v-else class="empty">暂无新的交付就绪商家</view>
              </view>
            </view>

            <view class="main-column">
              <template v-if="focusProject">
                <view class="project-hero">
                  <view class="hero-orb" />
                  <view><view class="hero-tags"><text>{{ statusLabels[focusProject.status] }}</text><text>v{{ focusProject.currentDraftVersion || 0 }}</text><text>SLA {{ hoursToSla(focusProject.slaDueAt) }}H</text></view><text class="merchant-name">{{ focusProject.merchantName }}</text><text class="project-type">{{ focusProject.deliveryType }} · {{ focusProject.templateCode }}</text></view>
                  <view class="release-number"><text>{{ focusProject.currentReleaseVersion ?? '—' }}</text><small>线上版本</small></view>
                </view>

                <view class="panel workflow-panel">
                  <view class="panel-head"><view><text class="panel-kicker">RELEASE PIPELINE</text><text class="panel-title">发布流水线</text></view><text class="version-chip">项目版本 v{{ focusProject.version }}</text></view>
                  <view class="stage-track">
                    <view v-for="(stage,index) in stageFlow" :key="stage.key" class="stage" :class="{ done:index<currentStageIndex,current:index===currentStageIndex }"><view class="stage-dot">{{ index < currentStageIndex ? '✓' : index+1 }}</view><text>{{ stage.label }}</text></view>
                  </view>
                  <button class="primary" :disabled="!canAdvance" :class="{ disabled: !canAdvance }" @click="advance"><view><small>NEXT DELIVERY ACTION</small><text>{{ actionLabel }}</text></view><text class="primary-arrow">→</text></button>
                  <view class="guard-row"><text>✓ Schema 白名单</text><text>✓ 商家确认快照</text><text>✓ 灰度发布门禁</text><text>✓ 10 分钟回滚目标</text></view>
                </view>

                <view class="builder-grid">
                  <view class="panel template-panel">
                    <view class="panel-head"><view><text class="panel-kicker">TEMPLATE MARKET</text><text class="panel-title">行业模板</text></view></view>
                    <view class="template-list">
                      <button v-for="template in overview.templates" :key="template.code" :class="{ active:selectedTemplateCode===template.code }" @click="selectedTemplateCode=template.code">
                        <view class="template-swatch" :style="{background:template.accent}" /><view><text>{{ template.name }}</text><small>{{ template.description }}</small><text class="template-meta">{{ template.blocks.length }} 个白名单区块</text></view><view class="radio">{{ selectedTemplateCode===template.code?'✓':'' }}</view>
                      </button>
                    </view>
                  </view>

                  <view class="phone-wrap">
                    <view class="phone">
                      <view class="phone-bar"><text>9:41</text><view>•••</view></view>
                      <view class="preview-hero" :style="{background:overview.currentVersion?.theme.primary ?? '#6857E8'}"><small>WELCOME TO</small><text>{{ String(overview.currentVersion?.content.heroTitle ?? focusProject.merchantName) }}</text><text class="preview-description">{{ String(overview.currentVersion?.content.heroSubtitle ?? '正在等待 AI 生成品牌内容') }}</text><button>{{ String(overview.currentVersion?.content.cta ?? '探索门店') }}</button></view>
                      <view class="preview-blocks"><view v-for="block in overview.currentVersion?.schema.blocks.slice(1,6) ?? []" :key="block.id"><text>{{ block.type.slice(0,1) }}</text><small>{{ block.type }}</small></view></view>
                      <view class="phone-nav"><text>首页</text><text>服务</text><text>我的</text></view>
                    </view>
                    <text class="preview-caption">配置预览 · {{ overview.currentVersion?.previewPath ?? '等待生成' }}</text>
                  </view>
                </view>

                <view class="evidence-grid">
                  <view class="panel versions-panel"><view class="panel-head"><view><text class="panel-kicker">VERSION HISTORY</text><text class="panel-title">版本记录</text></view></view><view class="version-list"><view v-for="version in overview.versions" :key="version.id"><view class="version-number">v{{ version.version }}</view><view><text>{{ version.templateCode }}</text><small>{{ version.status }} · {{ shortDate(version.createdAt) }}</small></view><text class="version-state">{{ version.version===focusProject.currentReleaseVersion?'线上':'历史' }}</text></view><view v-if="!overview.versions.length" class="empty">生成后将保存首个不可变页面版本</view></view></view>
                  <view class="panel event-panel"><view class="panel-head"><view><text class="panel-kicker">DELIVERY EVIDENCE</text><text class="panel-title">交付证据</text></view><text class="count-chip">{{ overview.events.length }}</text></view><view class="event-list"><view v-for="event in overview.events" :key="event.id"><view class="event-dot" /><view><text>{{ event.summary }}</text><small>#{{ event.sequence }} · {{ event.type }} · {{ shortDate(event.createdAt) }}</small></view></view><view v-if="!overview.events.length" class="empty">项目创建后将开始记录</view></view></view>
                </view>
              </template>

              <view v-else class="panel no-focus"><view class="no-focus-icon">✦</view><text>从已就绪商家开始第一次交付</text><small>选择模板后创建项目，系统会自动生成页面 Schema、品牌内容与版本证据。</small></view>
            </view>
          </view>
        </template>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
.factory-shell{position:relative;min-height:100vh;overflow:hidden;color:#121827;background:#f3f6f8}.mesh{position:fixed;border-radius:50%;filter:blur(20px);opacity:.3;pointer-events:none}.mesh-a{width:500px;height:500px;right:-230px;top:-260px;background:radial-gradient(circle,#7658f0,transparent 70%)}.mesh-b{width:480px;height:480px;left:-260px;bottom:-250px;background:radial-gradient(circle,#27c49a,transparent 70%)}.topbar{position:relative;z-index:3;height:76px;padding:env(safe-area-inset-top) 28px 0;display:flex;align-items:center;gap:13px;color:white;background:#0b1126}.back{width:38px;height:38px;border-radius:12px;color:white;font-size:29px;background:rgba(255,255,255,.08)}.brand{display:flex;align-items:center;gap:10px;flex:1}.brand-mark{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:13px;font-weight:800;background:linear-gradient(140deg,#6e58ec,#1fc39a)}.brand text,.brand small{display:block}.brand text{font-size:16px;font-weight:780}.brand small{margin-top:2px;color:#8994b3;font-size:8px;letter-spacing:1.5px}.live-chip{display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(255,255,255,.1);border-radius:99px;color:#c5cde2;font-size:9px}.live-chip view{width:7px;height:7px;border-radius:50%;background:#27d39f;box-shadow:0 0 0 5px rgba(39,211,159,.12)}.viewport{height:calc(100vh - 76px)}.content{position:relative;z-index:1;width:min(1450px,calc(100% - 46px));margin:auto;padding:32px 0 60px}.title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}.eyebrow,.page-title,.page-copy{display:block}.eyebrow{color:#6552db;font-size:9px;font-weight:800;letter-spacing:1.5px}.page-title{margin-top:8px;font-size:29px;font-weight:800;letter-spacing:-1px}.page-copy{margin-top:8px;color:#788196;font-size:11px}.sla-pill{padding:10px 13px;border:1px solid #dfe3e9;border-radius:99px;color:#627084;font-size:9px;background:white}.error-bar{margin-bottom:14px;padding:13px 15px;display:flex;justify-content:space-between;border:1px solid #ffd5db;border-radius:14px;color:#a52d41;background:#fff0f2}.error-bar button{color:#b22f43;font-size:9px;background:transparent}.loading-card,.no-focus{padding:70px 25px;text-align:center}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.metric{min-height:112px;padding:17px;display:flex;flex-direction:column;border:1px solid #e0e5e9;border-radius:20px;background:rgba(255,255,255,.9);box-shadow:0 12px 34px rgba(27,40,55,.05)}.metric.dark{color:white;border:0;background:linear-gradient(145deg,#111a35,#23244d)}.metric-value{font-size:29px;font-weight:800}.metric-value.coral{color:#ed6074}.metric-value.violet{color:#7059e6}.metric-value.mint{color:#0ca77b}.metric-name{margin-top:2px;font-size:11px;font-weight:730}.metric small{margin-top:auto;color:#9098a8;font-size:8px}.layout{display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;align-items:start}.sidebar,.main-column{display:grid;gap:14px}.panel{border:1px solid #e0e5e9;border-radius:22px;background:rgba(255,255,255,.92);box-shadow:0 14px 40px rgba(28,43,57,.055)}.panel-head{padding:18px 18px 13px;display:flex;align-items:center;justify-content:space-between}.panel-kicker,.panel-title{display:block}.panel-kicker{color:#9098aa;font-size:7px;font-weight:800;letter-spacing:1.4px}.panel-title{margin-top:4px;font-size:15px;font-weight:770}.count-chip,.version-chip{padding:5px 8px;border-radius:99px;color:#6e7587;font-size:8px;background:#f0f2f5}.mint-bg{color:#07845f;background:#e0f8ef}.project-panel{overflow:hidden}.project-row{width:calc(100% - 16px);margin:0 8px 7px;padding:12px 9px;display:flex;gap:9px;text-align:left;border:1px solid transparent;border-radius:15px;background:transparent}.project-row.active{border-color:#dcd6ff;background:linear-gradient(135deg,#f2efff,#f1fbf8)}.project-avatar{flex:0 0 38px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:white;font-weight:750;background:linear-gradient(140deg,#6c58e9,#28bb94)}.project-copy{min-width:0;flex:1}.project-copy>view{display:flex;justify-content:space-between;gap:6px}.project-name{font-size:11px;font-weight:730}.status-chip{padding:4px 6px;border-radius:99px;color:#5c4fd0;font-size:7px;background:#eae6ff}.project-next,.project-sla{display:block;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.project-next{color:#687185;font-size:8px}.project-sla{color:#c18014;font-size:7px}.ready-list{padding:0 10px 11px}.ready-row{padding:11px;display:flex;align-items:center;justify-content:space-between;gap:9px;border-radius:13px;background:#f5faf8}.ready-row+ .ready-row{margin-top:7px}.ready-row text,.ready-row small{display:block}.ready-row text{font-size:10px;font-weight:700}.ready-row small{margin-top:3px;color:#85908f;font-size:7px}.ready-row button{padding:7px 9px;border-radius:9px;color:white;font-size:8px;background:#159e79}.empty{padding:20px;color:#939aaa;font-size:8px;text-align:center}.project-hero{position:relative;overflow:hidden;min-height:145px;padding:23px;display:flex;align-items:center;justify-content:space-between;color:white;border-radius:23px;background:linear-gradient(130deg,#101831,#242453 55%,#174e53);box-shadow:0 20px 46px rgba(23,32,67,.2)}.hero-orb{position:absolute;right:60px;width:230px;height:230px;border-radius:50%;background:radial-gradient(circle,rgba(40,202,155,.3),rgba(107,82,236,.08) 55%,transparent 70%)}.hero-tags{position:relative;display:flex;gap:6px}.hero-tags text{padding:5px 7px;border:1px solid rgba(255,255,255,.1);border-radius:99px;color:#cbd3e7;font-size:7px;background:rgba(255,255,255,.06)}.merchant-name,.project-type{position:relative;display:block}.merchant-name{margin-top:12px;font-size:23px;font-weight:800}.project-type{margin-top:6px;color:#9ca8c3;font-size:8px}.release-number{position:relative;width:68px;height:68px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:50%;background:rgba(255,255,255,.06)}.release-number text{font-size:22px;font-weight:800}.release-number small{color:#aab5cb;font-size:7px}.workflow-panel{padding-bottom:17px}.stage-track{padding:3px 18px 19px;display:flex}.stage{position:relative;flex:1;text-align:center}.stage:not(:last-child)::after{content:"";position:absolute;top:11px;left:calc(50% + 12px);right:calc(-50% + 12px);height:2px;background:#e5e8ed}.stage.done:not(:last-child)::after{background:#6e5ae3}.stage-dot{position:relative;z-index:1;width:24px;height:24px;margin:auto;display:flex;align-items:center;justify-content:center;border:2px solid #e1e5e9;border-radius:50%;color:#a1a7b2;font-size:7px;background:white}.stage.done .stage-dot{color:white;border-color:#6d58df;background:#6d58df}.stage.current .stage-dot{color:#0a9971;border-color:#23b88e;background:#e2faf3;box-shadow:0 0 0 5px #edfaf6}.stage>text{display:block;margin-top:7px;color:#969dad;font-size:7px}.stage.done>text,.stage.current>text{color:#51586b;font-weight:700}.primary{width:calc(100% - 36px);min-height:66px;margin:0 18px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;text-align:left;border-radius:16px;color:white;background:linear-gradient(115deg,#6754dc,#6257df 48%,#16aa82);box-shadow:0 13px 30px rgba(90,77,207,.22)}.primary.disabled{opacity:.52}.primary small,.primary text{display:block}.primary small{color:#d7d4f7;font-size:7px;letter-spacing:1.2px}.primary text{margin-top:5px;font-size:13px;font-weight:740}.primary b{font-size:22px}.guard-row{padding:12px 18px 0;display:flex;justify-content:center;gap:14px;color:#878f9f;font-size:7px}.builder-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:stretch}.template-list{padding:0 10px 12px}.template-list button{position:relative;width:100%;padding:11px;display:flex;align-items:center;gap:10px;text-align:left;border:1px solid transparent;border-radius:14px;background:#fafbfc}.template-list button+button{margin-top:7px}.template-list button.active{border-color:#d9d3fc;background:#f3f0ff}.template-swatch{flex:0 0 37px;width:37px;height:48px;border-radius:10px}.template-list button>view:nth-child(2){min-width:0;flex:1}.template-list text,.template-list small,.template-list em{display:block}.template-list text{font-size:10px;font-weight:730}.template-list small{margin-top:4px;color:#858d9f;font-size:7px;line-height:1.45}.template-list em{margin-top:5px;color:#6455ca;font-size:7px;font-style:normal}.radio{width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:1px solid #d7dbe2;border-radius:50%;color:white;font-size:7px}.template-list button.active .radio{border-color:#6d59dc;background:#6d59dc}.phone-wrap{padding:14px;display:flex;flex-direction:column;align-items:center;border-radius:22px;background:linear-gradient(150deg,#121933,#23254e)}.phone{width:210px;height:396px;overflow:hidden;border:7px solid #070b17;border-radius:30px;background:#f7f7fa;box-shadow:0 22px 46px rgba(0,0,0,.26)}.phone-bar{height:27px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;color:#202538;font-size:6px}.preview-hero{height:186px;padding:23px 15px;color:white;background:#6857e8}.preview-hero small,.preview-hero text,.preview-hero p{display:block}.preview-hero small{font-size:5px;letter-spacing:1.2px;opacity:.75}.preview-hero text{margin-top:7px;font-size:18px;font-weight:800}.preview-hero p{margin:7px 0 13px;font-size:7px;line-height:1.5;opacity:.82}.preview-hero button{padding:7px 10px;border-radius:99px;color:#30354a;font-size:6px;background:white}.preview-blocks{padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.preview-blocks view{height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:9px;background:white}.preview-blocks text{width:21px;height:21px;display:flex;align-items:center;justify-content:center;border-radius:7px;color:#6857e8;font-size:8px;background:#efedff}.preview-blocks small{margin-top:4px;color:#666e80;font-size:5px}.phone-nav{position:absolute;width:196px;margin-top:351px;padding:10px 20px;display:flex;justify-content:space-between;color:#9399a6;font-size:5px;background:white}.preview-caption{margin-top:10px;color:#909bb9;font-size:6px}.evidence-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:14px}.version-list,.event-list{padding:0 12px 13px}.version-list>view,.event-list>view{padding:9px;display:flex;align-items:center;gap:9px;border-radius:11px;background:#fafbfc}.version-list>view+view,.event-list>view+view{margin-top:6px}.version-number{width:29px;height:29px;display:flex;align-items:center;justify-content:center;border-radius:9px;color:#6453d0;font-size:8px;font-weight:800;background:#ece8ff}.version-list>view>view:nth-child(2),.event-list>view>view:nth-child(2){min-width:0;flex:1}.version-list text,.version-list small,.event-list text,.event-list small{display:block}.version-list text,.event-list text{font-size:8px;font-weight:680}.version-list small,.event-list small{margin-top:4px;color:#969dab;font-size:6px}.version-state{padding:4px 6px;border-radius:99px;color:#098262;font-size:6px;background:#e1f8f0}.event-dot{width:7px;height:7px;border-radius:50%;background:#6e59de;box-shadow:0 0 0 4px #ece9ff}.no-focus-icon{width:50px;height:50px;margin:0 auto 13px;display:flex;align-items:center;justify-content:center;border-radius:17px;color:white;font-size:19px;background:linear-gradient(140deg,#6d59e0,#1ab187)}.no-focus>text,.no-focus>small{display:block}.no-focus>text{font-size:16px;font-weight:750}.no-focus>small{max-width:480px;margin:8px auto 0;color:#858d9e;font-size:9px;line-height:1.6}
.primary .primary-arrow{margin:0;font-size:22px}.template-list .template-meta{margin-top:5px;color:#6455ca;font-size:7px;font-weight:500}.preview-hero .preview-description{margin:7px 0 13px;font-size:7px;font-weight:400;line-height:1.5;opacity:.82}
@media(max-width:980px){.content{width:min(100% - 28px,760px)}.metric-grid{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}.sidebar{grid-template-columns:1fr 1fr}.builder-grid{grid-template-columns:1fr}.phone-wrap{min-height:460px}.evidence-grid{grid-template-columns:1fr}}
@media(max-width:560px){.topbar{height:68px;padding-left:13px;padding-right:13px}.viewport{height:calc(100vh - 68px)}.live-chip{display:none}.content{width:calc(100% - 20px);padding-top:20px}.title-row{display:block}.page-title{font-size:22px}.sla-pill{display:inline-block;margin-top:13px}.metric-grid{gap:8px}.metric{min-height:102px}.layout{gap:10px}.sidebar{grid-template-columns:1fr}.stage-track{padding-left:9px;padding-right:9px}.stage>text{font-size:6px}.stage-dot{width:22px;height:22px}.guard-row{flex-wrap:wrap;gap:8px}.project-hero{padding:19px}.merchant-name{font-size:20px}.builder-grid,.evidence-grid{gap:10px}}
</style>
