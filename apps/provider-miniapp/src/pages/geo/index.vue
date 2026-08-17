<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { GeoOverview, GeoWorkspaceStatus, MiniAppProjectSummary } from '@lequ/contracts'
import { advanceGeoWorkspace, createGeoProject, fetchGeoOverview } from '../../services/geo'

const overview = ref<GeoOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')

const statusLabels: Record<GeoWorkspaceStatus, string> = {
  PENDING: '待扫描', SCANNING: '扫描中', ISSUE_FOUND: '发现问题',
  FIX_PROPOSED: '方案待确认', MERCHANT_APPROVAL: '商家已确认',
  PUBLISHED: '修复已发布', MONITORING: '持续观测',
}
const stages: Array<{ key: GeoWorkspaceStatus; label: string }> = [
  { key: 'PENDING', label: '建档' },
  { key: 'ISSUE_FOUND', label: '扫描' },
  { key: 'FIX_PROPOSED', label: '方案' },
  { key: 'MERCHANT_APPROVAL', label: '确认' },
  { key: 'PUBLISHED', label: '发布' },
  { key: 'MONITORING', label: '观测' },
]
const channelLabels: Record<string, string> = {
  MERCHANT_PROFILE: '商家档案', MINIAPP: '品牌小程序', MAP_A: '地图 A', MAP_B: '地图 B',
}

const focusWorkspace = computed(() => overview.value?.focusWorkspace ?? null)
const stageIndex = computed(() => {
  const status = focusWorkspace.value?.status
  if (!status) return 0
  if (status === 'SCANNING') return 1
  return Math.max(0, stages.findIndex((item) => item.key === status))
})
const canAdvance = computed(() => Boolean(
  focusWorkspace.value
  && ['PENDING', 'ISSUE_FOUND', 'FIX_PROPOSED', 'MERCHANT_APPROVAL', 'PUBLISHED'].includes(focusWorkspace.value.status)
  && !busy.value,
))
const actionLabel = computed(() => {
  if (busy.value) return '正在安全执行并留痕…'
  switch (focusWorkspace.value?.status) {
    case 'PENDING': return '运行九维健康扫描'
    case 'ISSUE_FOUND': return '生成修复与内容方案'
    case 'FIX_PROPOSED': return '记录商家现场确认'
    case 'MERCHANT_APPROVAL': return '发布渠道修复'
    case 'PUBLISHED': return '启动可见性观测'
    case 'MONITORING': return '观测已运行 · 查看效果'
    default: return '选择 GEO 工作区'
  }
})
const scoreDelta = computed(() => {
  const focus = focusWorkspace.value
  if (!focus?.score || !focus.previousScore) return 0
  return focus.score - focus.previousScore
})
const observationTotals = computed(() => (overview.value?.observations ?? []).reduce(
  (totals, item) => ({
    mentions: totals.mentions + item.mentions,
    visits: totals.visits + item.visits,
    inquiries: totals.inquiries + item.inquiries,
    orders: totals.orders + item.orders,
  }),
  { mentions: 0, visits: 0, inquiries: 0, orders: 0 },
))

async function load(focusId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchGeoOverview(focusId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载 GEO 工作区失败'
  } finally {
    loading.value = false
  }
}

async function selectWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === focusWorkspace.value?.id || busy.value) return
  await load(workspaceId)
}

async function startWorkspace(project: MiniAppProjectSummary): Promise<void> {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await createGeoProject(project)
    uni.showToast({ title: 'GEO 工作区已创建', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建失败'
  } finally {
    busy.value = false
  }
}

async function advance(): Promise<void> {
  if (!focusWorkspace.value || !canAdvance.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await advanceGeoWorkspace(focusWorkspace.value)
    uni.showToast({ title: '已完成并保存证据', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '执行失败'
  } finally {
    busy.value = false
  }
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

onLoad((query) => {
  const focusId = typeof query?.focusWorkspaceId === 'string' ? query.focusWorkspaceId : undefined
  void load(focusId)
})
</script>

<template>
  <view class="geo-shell">
    <view class="topbar">
      <button class="back" @click="goBack">←</button>
      <view class="brand-mark">G</view>
      <view class="brand-copy"><text>GEO OS</text><small>城市可见性操作系统</small></view>
      <view class="system-state"><i /> 规则 v5.0 · 正常</view>
    </view>

    <scroll-view scroll-y class="viewport">
      <view class="content">
        <view class="page-head">
          <view><text class="eyebrow">E3 · MACHINE-READABLE COMMERCE</text><text class="page-title">把“被看见”变成可解释、可修复、可观测</text><text class="page-copy">统一门店实体与事实来源，扫描渠道差异，用有证据的内容连接访问、咨询和订单。</text></view>
          <view class="compliance"><text>合规边界</text><small>不承诺第三方排名、推荐或无依据增长</small></view>
        </view>

        <view v-if="errorMessage" class="error-bar"><text>{{ errorMessage }}</text><button @click="load(focusWorkspace?.id)">重试</button></view>
        <view v-if="loading && !overview" class="loading-card">正在读取实体、事实与渠道证据…</view>

        <template v-else-if="overview">
          <view class="metric-grid">
            <view class="metric dark"><small>GEO 工作区</small><text>{{ overview.counts.total }}</text><view>城市权限范围</view></view>
            <view class="metric"><small>扫描 / 待处理</small><text class="blue">{{ overview.counts.scanning }}</text><view>等待九维扫描</view></view>
            <view class="metric"><small>开放问题</small><text class="coral">{{ overview.counts.issues }}</text><view>均有来源与建议值</view></view>
            <view class="metric"><small>持续观测</small><text class="mint">{{ overview.counts.monitoring }}</text><view>归因不等于因果</view></view>
          </view>

          <view class="workspace-layout">
            <view class="side-column">
              <view class="panel queue-panel">
                <view class="panel-head"><view><small>WORKSPACE</small><text>商家队列</text></view><b>{{ overview.workspaces.length }}</b></view>
                <button v-for="workspace in overview.workspaces" :key="workspace.id" class="workspace-row" :class="{ active: workspace.id === focusWorkspace?.id }" @click="selectWorkspace(workspace.id)">
                  <view class="merchant-avatar">{{ workspace.merchantName.slice(0, 1) }}</view>
                  <view class="workspace-copy"><view><text>{{ workspace.merchantName }}</text><i>{{ workspace.score ?? '—' }}</i></view><small>{{ statusLabels[workspace.status] }} · {{ workspace.nextAction }}</small></view>
                </button>
                <view v-if="!overview.workspaces.length" class="empty">等待已上线 MiniApp 进入 GEO 交付。</view>
              </view>

              <view class="panel eligible-panel">
                <view class="panel-head"><view><small>READY FOR GEO</small><text>已上线商家</text></view><b>{{ overview.eligibleProjects.length }}</b></view>
                <view v-for="project in overview.eligibleProjects" :key="project.id" class="eligible-row"><view><text>{{ project.merchantName }}</text><small>线上 v{{ project.currentReleaseVersion }} · POI 待匹配</small></view><button @click="startWorkspace(project)">开始</button></view>
                <view v-if="!overview.eligibleProjects.length" class="empty">暂无新的已上线商家</view>
              </view>
            </view>

            <view class="main-column">
              <template v-if="focusWorkspace">
                <view class="hero">
                  <view class="hero-glow" />
                  <view class="score-ring" :style="{ '--score': `${(focusWorkspace.score ?? 0) * 3.6}deg` }"><view><text>{{ focusWorkspace.score ?? '—' }}</text><small>GEO 健康分</small></view></view>
                  <view class="hero-copy"><view class="hero-tags"><text>{{ statusLabels[focusWorkspace.status] }}</text><text>扫描 v{{ focusWorkspace.scanVersion }}</text><text v-if="scoreDelta">提升 +{{ scoreDelta }}</text></view><text class="merchant-name">{{ focusWorkspace.merchantName }}</text><small>{{ focusWorkspace.nextAction }}</small></view>
                  <view class="benchmark"><small>上海同业百分位</small><text>P{{ overview.cityBenchmark.merchantPercentile }}</text><view>城市均值 {{ overview.cityBenchmark.cityAverage }} · 行业 {{ overview.cityBenchmark.industryAverage }}</view></view>
                </view>

                <view class="panel pipeline-panel">
                  <view class="panel-head"><view><small>CONTROLLED WORKFLOW</small><text>扫描与发布链路</text></view><b>实体 v{{ focusWorkspace.version }}</b></view>
                  <view class="stage-track"><view v-for="(stage, index) in stages" :key="stage.key" class="stage" :class="{ done: index < stageIndex, current: index === stageIndex }"><i>{{ index < stageIndex ? '✓' : index + 1 }}</i><text>{{ stage.label }}</text></view></view>
                  <button class="primary-action" :disabled="!canAdvance" :class="{ disabled: !canAdvance }" @click="advance"><view><small>NEXT CONTROLLED ACTION</small><text>{{ actionLabel }}</text></view><b>→</b></button>
                  <view class="guardrail"><text>✓ 冻结权重</text><text>✓ 来源与置信度</text><text>✓ 商家确认</text><text>✓ 不可变扫描证据</text></view>
                </view>

                <view class="insight-grid">
                  <view class="panel dimension-panel">
                    <view class="panel-head"><view><small>NINE DIMENSIONS</small><text>九维健康画像</text></view><b>{{ focusWorkspace.score ?? 0 }}/100</b></view>
                    <view class="dimension-list"><view v-for="dimension in overview.dimensions" :key="dimension.key" class="dimension-row"><view><text>{{ dimension.label }}</text><small v-if="dimension.delta > 0">+{{ dimension.delta }}</small></view><view class="dimension-track"><i :style="{ width: `${dimension.maxScore ? dimension.score / dimension.maxScore * 100 : 0}%` }" :class="dimension.status.toLowerCase()" /></view><b>{{ dimension.score }}<small>/{{ dimension.maxScore }}</small></b></view></view>
                  </view>

                  <view class="panel identity-panel">
                    <view class="panel-head"><view><small>ENTITY IDENTITY</small><text>实体与可信事实</text></view><b v-if="overview.identity">{{ percent(overview.identity.confidence) }}</b></view>
                    <template v-if="overview.identity">
                      <view class="poi-card"><view class="poi-icon">⌖</view><view><text>{{ overview.identity.storeName }}</text><small>{{ overview.identity.address }}</small><b>{{ overview.identity.canonicalPoiId }} · {{ overview.identity.matchStatus }}</b></view></view>
                      <view class="alias-row"><small>别名</small><text v-for="alias in overview.identity.aliases" :key="alias">{{ alias }}</text></view>
                      <view class="fact-list"><view v-for="fact in overview.facts" :key="fact.id"><view><small>{{ fact.fieldLabel }}</small><text>{{ fact.value }}</text></view><view class="fact-source"><b>{{ percent(fact.confidence) }}</b><small>{{ fact.sourceType }}</small></view></view></view>
                    </template>
                    <view v-else class="empty">创建工作区后将建立标准实体与来源事实。</view>
                  </view>
                </view>

                <view class="panel consistency-panel">
                  <view class="panel-head"><view><small>CHANNEL CONSISTENCY</small><text>四渠道字段映射</text></view><b>{{ overview.channelComparisons.length }} 个关键字段</b></view>
                  <scroll-view scroll-x class="comparison-scroll"><view class="comparison-table"><view class="comparison-head"><text>标准字段</text><text v-for="label in channelLabels" :key="label">{{ label }}</text><text>一致率</text></view><view v-for="field in overview.channelComparisons" :key="field.fieldKey" class="comparison-row"><view><b>{{ field.fieldLabel }}</b><small>{{ field.canonicalValue }}</small></view><view v-for="channel in field.channels" :key="channel.channel" :class="['channel-value', channel.status.toLowerCase()]"><i /> <text>{{ channel.value || '缺失' }}</text></view><b class="rate">{{ field.consistencyRate }}%</b></view><view v-if="!overview.channelComparisons.length" class="empty wide-empty">运行扫描后显示原始渠道快照与差异。</view></view></scroll-view>
                </view>

                <view class="lower-grid">
                  <view class="panel issue-panel">
                    <view class="panel-head"><view><small>EXPLAINABLE FIXES</small><text>问题与建议值</text></view><b>{{ overview.issues.length }}</b></view>
                    <view v-for="issue in overview.issues" :key="issue.id" class="issue-row"><view :class="['severity', issue.severity.toLowerCase()]">{{ issue.severity }}</view><view class="issue-copy"><text>{{ issue.title }}</text><small>{{ issue.channel }} · {{ issue.currentValue }}</small><view>建议 → {{ issue.recommendedValue }}</view></view><b>{{ issue.status }}</b></view>
                    <view v-if="!overview.issues.length" class="empty">完成扫描后显示有证据的问题。</view>
                  </view>

                  <view class="panel content-panel">
                    <view class="panel-head"><view><small>CONTENT INTELLIGENCE</small><text>问题词与场景计划</text></view><b>{{ overview.contentPlan?.status ?? '待生成' }}</b></view>
                    <template v-if="overview.contentPlan">
                      <view class="term-group"><small>高意图问题词</small><view><text v-for="term in overview.contentPlan.questionTerms" :key="term">{{ term }}</text></view></view>
                      <view class="term-group scenes"><small>本地场景词</small><view><text v-for="term in overview.contentPlan.scenarioTerms" :key="term">{{ term }}</text></view></view>
                      <view class="plan-list"><view v-for="(item,index) in overview.contentPlan.items" :key="item.title"><b>0{{ index + 1 }}</b><view><text>{{ item.title }}</text><small>{{ item.format }} · {{ item.channel }}</small></view><i>{{ item.evidenceFactKeys.length }} 引用</i></view></view>
                    </template>
                    <view v-else class="empty">修复方案会同时生成可追溯事实的内容计划。</view>
                  </view>
                </view>

                <view class="lower-grid">
                  <view class="panel observation-panel">
                    <view class="panel-head"><view><small>VISIBILITY OBSERVABILITY</small><text>可见性到交易</text></view><b>last-touch-v1</b></view>
                    <view class="funnel"><view><small>提及</small><text>{{ observationTotals.mentions }}</text></view><i>→</i><view><small>访问</small><text>{{ observationTotals.visits }}</text></view><i>→</i><view><small>咨询</small><text>{{ observationTotals.inquiries }}</text></view><i>→</i><view class="order"><small>订单</small><text>{{ observationTotals.orders }}</text></view></view>
                    <view class="channel-observations"><view v-for="item in overview.observations" :key="`${item.date}-${item.channel}`"><text>{{ item.channel }}</text><small>{{ item.visits }} 访问 · {{ item.inquiries }} 咨询 · {{ item.orders }} 订单</small></view></view>
                    <view v-if="!overview.observations.length" class="empty">发布修复后启动聚合观测，不展示个人级轨迹。</view>
                  </view>

                  <view class="panel event-panel">
                    <view class="panel-head"><view><small>IMMUTABLE EVIDENCE</small><text>交付证据</text></view><b>{{ overview.events.length }}</b></view>
                    <view class="event-list"><view v-for="event in overview.events" :key="event.id"><i /><view><text>{{ event.summary }}</text><small>#{{ event.sequence }} · {{ event.type }} · {{ shortDate(event.createdAt) }}</small></view></view></view>
                  </view>
                </view>

                <view class="compliance-footer"><view>!</view><text>{{ focusWorkspace.complianceNotice }}</text><small>所有建议必须绑定可验证事实；观测数据仅用于评估交付，不表达因果保证。</small></view>
              </template>

              <view v-else class="panel no-focus"><view>⌖</view><text>从已上线商家建立第一个 GEO 工作区</text><small>系统会关联 MiniApp 发布版本、已确认资料和授权证据，再运行九维扫描。</small></view>
            </view>
          </view>
        </template>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
.geo-shell{min-height:100vh;background:#f3f6f8;color:#13221d}.topbar{position:relative;z-index:10;height:70px;padding:0 28px;display:flex;align-items:center;border-bottom:1px solid rgba(24,62,49,.08);background:rgba(250,252,251,.94);backdrop-filter:blur(18px)}.back{width:38px;height:38px;margin-right:12px;border:1px solid #dbe5e1;border-radius:12px;background:#fff;color:#35534a;font-size:19px}.brand-mark{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:11px;background:linear-gradient(145deg,#123f34,#1ab389);color:#fff;font-size:16px;font-weight:900;box-shadow:0 8px 20px rgba(21,137,104,.2)}.brand-copy{margin-left:10px}.brand-copy text,.brand-copy small,.page-title,.page-copy,.metric text,.metric small,.metric view,.merchant-name,.hero-copy small,.benchmark text,.benchmark small,.benchmark view,.panel-head text,.panel-head small,.workspace-copy text,.workspace-copy small,.eligible-row text,.eligible-row small,.dimension-row text,.dimension-row small,.poi-card text,.poi-card small,.poi-card b,.fact-list text,.fact-list small,.comparison-row text,.comparison-row small,.issue-copy text,.issue-copy small,.issue-copy view,.term-group small,.plan-list text,.plan-list small,.funnel text,.funnel small,.channel-observations text,.channel-observations small,.event-list text,.event-list small,.compliance-footer text,.compliance-footer small,.no-focus text,.no-focus small{display:block}.brand-copy text{font-size:13px;font-weight:900;letter-spacing:.08em}.brand-copy small{margin-top:2px;color:#85958f;font-size:8px}.system-state{margin-left:auto;padding:8px 12px;border:1px solid #dce8e3;border-radius:999px;background:#fff;color:#4f6b62;font-size:9px;font-weight:750}.system-state i{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#18b087;box-shadow:0 0 0 4px rgba(24,176,135,.1)}.viewport{height:calc(100vh - 70px)}.content{width:min(1480px,calc(100% - 40px));margin:0 auto;padding:34px 0 70px}.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.eyebrow{display:block;color:#148565;font-size:9px;font-weight:900;letter-spacing:.18em}.page-title{margin-top:8px;font-size:30px;font-weight:900;letter-spacing:-1.2px}.page-copy{max-width:760px;margin-top:9px;color:#698078;font-size:11px;line-height:1.7}.compliance{flex:0 0 auto;padding:12px 15px;border:1px solid #f0dcae;border-radius:14px;background:#fffaf0}.compliance text{display:block;color:#9b6a17;font-size:9px;font-weight:900}.compliance small{display:block;margin-top:3px;color:#7d715b;font-size:8px}.error-bar,.loading-card{margin-top:20px;padding:15px 18px;border-radius:16px}.error-bar{display:flex;align-items:center;justify-content:space-between;background:#fff0f2;color:#a73849}.error-bar button{padding:8px 13px;border-radius:10px;background:#fff;color:#a73849;font-size:9px}.loading-card{background:#fff;color:#698078}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}.metric{min-height:118px;padding:18px;border:1px solid #e0e9e5;border-radius:20px;background:#fff;box-shadow:0 10px 28px rgba(21,48,39,.045)}.metric.dark{border-color:#163b31;background:linear-gradient(145deg,#102f27,#174c3e);color:#fff}.metric small{color:#7d9189;font-size:8px;font-weight:850;letter-spacing:.08em}.metric.dark small{color:#9ec0b4}.metric text{margin-top:8px;font-size:31px;font-weight:900}.metric view{margin-top:6px;color:#8ca098;font-size:8px}.metric.dark view{color:#a7c2b9}.metric .blue{color:#3478f6}.metric .coral{color:#ef6572}.metric .mint{color:#14a77f}.workspace-layout{display:grid;grid-template-columns:292px minmax(0,1fr);gap:15px;margin-top:15px}.side-column,.main-column{display:flex;min-width:0;flex-direction:column;gap:14px}.panel{overflow:hidden;border:1px solid #e0e9e5;border-radius:22px;background:#fff;box-shadow:0 12px 34px rgba(21,48,39,.045)}.panel-head{min-height:70px;padding:17px 19px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf2f0}.panel-head small{color:#178466;font-size:7px;font-weight:900;letter-spacing:.14em}.panel-head text{margin-top:4px;font-size:15px;font-weight:900}.panel-head>b{padding:6px 9px;border-radius:9px;background:#edf8f4;color:#277763;font-size:8px}.workspace-row{width:100%;padding:13px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #edf2f0;background:#fff;text-align:left}.workspace-row.active{background:linear-gradient(90deg,#effaf6,#fff);box-shadow:inset 3px 0 #18a77f}.merchant-avatar{width:36px;height:36px;display:flex;flex:0 0 36px;align-items:center;justify-content:center;border-radius:12px;background:#dff5ed;color:#13765c;font-size:12px;font-weight:900}.workspace-copy{min-width:0;flex:1}.workspace-copy>view{display:flex;align-items:center;gap:6px}.workspace-copy text{overflow:hidden;font-size:10px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}.workspace-copy i{margin-left:auto;color:#158263;font-size:13px;font-style:normal;font-weight:900}.workspace-copy small{margin-top:5px;overflow:hidden;color:#82938d;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.eligible-row{padding:13px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #edf2f0}.eligible-row>view{min-width:0;flex:1}.eligible-row text{font-size:10px;font-weight:850}.eligible-row small{margin-top:4px;color:#879991;font-size:7px}.eligible-row button{padding:8px 11px;border-radius:9px;background:#183f34;color:#fff;font-size:8px}.empty{padding:22px 18px;color:#90a099;font-size:9px;line-height:1.6;text-align:center}.hero{position:relative;overflow:hidden;min-height:192px;padding:25px 28px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;border-radius:25px;background:linear-gradient(135deg,#0e2e26,#185342 58%,#167c62);color:#fff;box-shadow:0 24px 50px rgba(18,81,63,.2)}.hero-glow{position:absolute;right:16%;top:-100px;width:310px;height:310px;border-radius:50%;background:radial-gradient(circle,rgba(83,230,179,.25),transparent 68%)}.score-ring{position:relative;width:116px;height:116px;padding:8px;border-radius:50%;background:conic-gradient(#62e4b6 var(--score),rgba(255,255,255,.13) 0)}.score-ring>view{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;background:#123a30}.score-ring text{font-size:34px;font-weight:950}.score-ring small{margin-top:1px;color:#9fc9bb;font-size:7px}.hero-copy{position:relative}.hero-tags{display:flex;gap:7px}.hero-tags text{padding:5px 8px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(255,255,255,.07);color:#c8e2d9;font-size:7px}.merchant-name{margin-top:13px;font-size:28px;font-weight:900}.hero-copy>small{margin-top:7px;color:#b2d0c6;font-size:9px}.benchmark{position:relative;padding:15px 17px;border:1px solid rgba(255,255,255,.12);border-radius:17px;background:rgba(5,26,21,.25);text-align:right}.benchmark small{color:#a9c9be;font-size:7px}.benchmark text{margin-top:3px;font-size:28px;font-weight:900}.benchmark view{margin-top:5px;color:#92b7aa;font-size:7px}.pipeline-panel{overflow:visible}.stage-track{padding:20px 28px 11px;display:grid;grid-template-columns:repeat(6,1fr)}.stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;color:#9aacA5}.stage:not(:last-child)::after{content:'';position:absolute;z-index:0;top:14px;left:calc(50% + 14px);right:calc(-50% + 14px);height:2px;background:#e4ebe8}.stage.done:not(:last-child)::after{background:#22b18a}.stage i{position:relative;z-index:1;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #dce6e2;border-radius:50%;background:#fff;font-size:8px;font-style:normal;font-weight:900}.stage.done i{border-color:#20a982;background:#20a982;color:#fff}.stage.current i{border-color:#173f34;color:#173f34;box-shadow:0 0 0 5px rgba(23,110,84,.08)}.stage text{font-size:7px;font-weight:800}.primary-action{width:calc(100% - 38px);min-height:66px;margin:12px 19px 0;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-radius:17px;background:linear-gradient(135deg,#183f34,#19a77f);color:#fff;text-align:left;box-shadow:0 12px 25px rgba(22,135,102,.2)}.primary-action.disabled{opacity:.42}.primary-action small,.primary-action text{display:block}.primary-action small{color:#a9d7c7;font-size:7px;letter-spacing:.12em}.primary-action text{margin-top:4px;font-size:13px;font-weight:900}.primary-action>b{font-size:21px}.guardrail{padding:12px 20px 18px;display:flex;gap:16px;flex-wrap:wrap;color:#668078;font-size:7px}.insight-grid,.lower-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dimension-list{padding:10px 18px 17px}.dimension-row{min-height:38px;display:grid;grid-template-columns:136px minmax(80px,1fr) 42px;align-items:center;gap:11px}.dimension-row>view:first-child{display:flex;align-items:center;gap:5px}.dimension-row text{font-size:8px;font-weight:800}.dimension-row small{color:#18a77f;font-size:7px}.dimension-track{height:6px;border-radius:99px;background:#edf2f0;overflow:hidden}.dimension-track i{display:block;height:100%;border-radius:99px;background:#18a77f}.dimension-track i.good{background:#52a8e8}.dimension-track i.attention{background:#ef7d78}.dimension-row>b{text-align:right;font-size:10px}.dimension-row>b small{display:inline;color:#9aaba4}.poi-card{margin:15px 17px;padding:14px;display:flex;gap:11px;border-radius:16px;background:#f1f8f5}.poi-icon{width:38px;height:38px;display:flex;flex:0 0 38px;align-items:center;justify-content:center;border-radius:13px;background:#173f34;color:#6fe3bb;font-size:18px}.poi-card>view:last-child{min-width:0}.poi-card text{font-size:11px;font-weight:900}.poi-card small{margin-top:4px;color:#71877e;font-size:7px}.poi-card b{margin-top:6px;color:#168266;font-size:7px}.alias-row{padding:0 17px 11px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.alias-row small{color:#8ba098;font-size:7px}.alias-row text{padding:5px 7px;border-radius:7px;background:#f4f6f5;color:#526b62;font-size:7px}.fact-list{padding:0 17px 16px}.fact-list>view{padding:8px 0;display:flex;justify-content:space-between;gap:12px;border-top:1px solid #eef2f0}.fact-list>view>view:first-child{min-width:0}.fact-list small{color:#8a9c95;font-size:7px}.fact-list text{margin-top:3px;font-size:8px;font-weight:800}.fact-source{text-align:right}.fact-source b{color:#168266;font-size:8px}.comparison-scroll{width:100%}.comparison-table{min-width:870px;padding:8px 18px 18px}.comparison-head,.comparison-row{display:grid;grid-template-columns:1.5fr repeat(4,1fr) 52px;gap:8px;align-items:center}.comparison-head{padding:8px 10px;color:#82968e;font-size:7px}.comparison-row{min-height:54px;padding:8px 10px;border-top:1px solid #eef2f0}.comparison-row>view:first-child b{font-size:8px}.comparison-row>view:first-child small{margin-top:3px;color:#879991;font-size:7px}.channel-value{min-width:0;padding:7px;border-radius:9px;background:#f3f7f5;display:flex;align-items:center;gap:5px}.channel-value i{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#17a77f}.channel-value.diff{background:#fff6ed}.channel-value.diff i{background:#ef984d}.channel-value.missing{background:#fff0f2}.channel-value.missing i{background:#e45d6b}.channel-value text{overflow:hidden;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.rate{color:#177b60;font-size:9px;text-align:right}.wide-empty{grid-column:1/-1}.issue-row{padding:12px 17px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid #eef2f0}.severity{width:40px;padding:5px 0;flex:0 0 40px;border-radius:7px;background:#eef5f2;color:#3b7160;font-size:6px;font-weight:900;text-align:center}.severity.high{background:#ffedf0;color:#c34759}.severity.medium{background:#fff4e5;color:#a76a1c}.issue-copy{min-width:0;flex:1}.issue-copy text{font-size:9px;font-weight:850}.issue-copy small{margin-top:4px;color:#899a94;font-size:7px}.issue-copy view{margin-top:6px;color:#167c60;font-size:7px}.issue-row>b{color:#758a82;font-size:6px}.term-group{padding:13px 17px 0}.term-group>small{color:#788d85;font-size:7px;font-weight:800}.term-group>view{margin-top:7px;display:flex;gap:6px;flex-wrap:wrap}.term-group text{padding:6px 8px;border-radius:999px;background:#eaf6f2;color:#18765d;font-size:7px}.term-group.scenes text{background:#eef2ff;color:#5563a6}.plan-list{padding:10px 17px 15px}.plan-list>view{padding:9px 0;display:flex;align-items:center;gap:9px;border-top:1px solid #eef2f0}.plan-list>view>b{width:25px;color:#1a8668;font-size:9px}.plan-list>view>view{min-width:0;flex:1}.plan-list text{font-size:8px;font-weight:820}.plan-list small{margin-top:3px;color:#8b9c96;font-size:6px}.plan-list i{color:#6f827b;font-size:6px;font-style:normal}.funnel{padding:22px 18px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px}.funnel>view{min-width:66px;padding:11px;border-radius:14px;background:#f2f7f5;text-align:center}.funnel .order{background:#173f34;color:#fff}.funnel small{color:#81948d;font-size:7px}.funnel .order small{color:#a7c4ba}.funnel text{margin-top:4px;font-size:18px;font-weight:900}.funnel>i{color:#afbbb6;font-size:10px;font-style:normal}.channel-observations{padding:0 18px 16px}.channel-observations>view{padding:7px 0;display:flex;justify-content:space-between;border-top:1px solid #eef2f0}.channel-observations text{font-size:7px;font-weight:850}.channel-observations small{color:#849790;font-size:7px}.event-list{max-height:280px;padding:12px 18px 17px;overflow:auto}.event-list>view{position:relative;padding:0 0 15px 18px;display:flex}.event-list>view>i{position:absolute;left:0;top:3px;width:7px;height:7px;border:2px solid #fff;border-radius:50%;background:#1ca780;box-shadow:0 0 0 1px #1ca780}.event-list>view:not(:last-child)::after{content:'';position:absolute;left:3px;top:12px;bottom:0;width:1px;background:#dce8e3}.event-list text{font-size:8px;font-weight:800}.event-list small{margin-top:4px;color:#899b94;font-size:6px}.compliance-footer{padding:15px 18px;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;border:1px solid #ecdcae;border-radius:17px;background:#fffbf1}.compliance-footer>view{grid-row:1/3;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:#f5d98a;color:#7c5a12;font-weight:900}.compliance-footer text{color:#695322;font-size:8px;font-weight:850}.compliance-footer small{color:#8c7d5a;font-size:7px}.no-focus{min-height:420px;padding:80px 25px;text-align:center}.no-focus>view{width:70px;height:70px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;border-radius:24px;background:#e8f6f1;color:#178365;font-size:28px}.no-focus text{font-size:16px;font-weight:900}.no-focus small{max-width:420px;margin:9px auto;color:#82958e;font-size:9px;line-height:1.7}
.back{margin-left:0}.page-head>view:first-child{min-width:0;flex:1}.page-title{width:100%;max-width:880px;line-height:1.18;white-space:normal;word-break:break-all}.compliance{flex:0 0 300px}
@media (max-width:900px){.content{width:calc(100% - 24px);padding-top:22px}.page-head{display:block}.compliance{margin-top:13px}.metric-grid{grid-template-columns:repeat(2,1fr)}.workspace-layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:1fr 1fr}.hero{grid-template-columns:auto 1fr}.benchmark{grid-column:1/-1;text-align:left}.insight-grid,.lower-grid{grid-template-columns:1fr}}
@media (max-width:520px){.topbar{height:64px;padding:0 13px}.viewport{height:calc(100vh - 64px)}.system-state{padding:7px 8px;font-size:7px}.brand-copy small{display:none}.page-title{font-size:23px;line-height:1.18}.page-copy{font-size:9px}.metric-grid{gap:8px}.metric{min-height:102px;padding:14px;border-radius:17px}.metric text{font-size:26px}.workspace-layout{gap:10px}.side-column{display:flex}.panel{border-radius:19px}.hero{padding:20px;grid-template-columns:auto 1fr;gap:14px}.score-ring{width:82px;height:82px}.score-ring text{font-size:26px}.merchant-name{font-size:21px}.hero-tags{gap:4px;flex-wrap:wrap}.benchmark{padding:12px}.stage-track{padding-left:12px;padding-right:12px}.stage:not(:last-child)::after{left:calc(50% + 11px);right:calc(-50% + 11px);top:11px}.stage i{width:22px;height:22px}.stage text{font-size:6px}.primary-action{width:calc(100% - 24px);margin-left:12px;margin-right:12px}.guardrail{padding-left:13px;padding-right:13px;gap:8px}.dimension-row{grid-template-columns:112px minmax(60px,1fr) 38px}.funnel{padding:16px 10px;gap:4px}.funnel>view{min-width:52px;padding:9px 5px}.funnel text{font-size:15px}.channel-observations>view{display:block}.channel-observations small{margin-top:3px}.compliance-footer{grid-template-columns:auto 1fr}}
</style>
