<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  LeadStage,
  SalesCrmLeadSummary,
  SalesCrmMapPoint,
  SalesCrmOverview,
  SalesCrmTimingFilter,
} from '@lequ/contracts'
import { fetchSalesCrm } from '../../services/sales'

type ViewMode = 'LIST' | 'MAP'

const overview = ref<SalesCrmOverview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const keyword = ref('')
const activeStage = ref<LeadStage | null>(null)
const activeSource = ref('')
const activeTiming = ref<SalesCrmTimingFilter>('ALL')
const viewMode = ref<ViewMode>('LIST')
const selectedMapLeadId = ref('')

const stageOptions: Array<{ value: LeadStage | null; label: string }> = [
  { value: null, label: '全部阶段' },
  { value: 'NEW', label: '新线索' },
  { value: 'DIAGNOSED', label: '已体检' },
  { value: 'CONTRACT_DRAFT', label: '待签约' },
  { value: 'SIGNED', label: '已签约' },
  { value: 'ASSET_REVIEW', label: '资料确认' },
  { value: 'READY_FOR_DELIVERY', label: '交付就绪' },
  { value: 'LOST', label: '已关闭' },
]
const timingOptions: Array<{ value: SalesCrmTimingFilter; label: string }> = [
  { value: 'ALL', label: '全部节奏' },
  { value: 'OVERDUE', label: '已逾期' },
  { value: 'TODAY', label: '今天跟进' },
  { value: 'UPCOMING', label: '即将跟进' },
]

const selectedMapLead = computed<SalesCrmLeadSummary | null>(() => {
  const leads = overview.value?.leads ?? []
  return leads.find((item) => item.lead.id === selectedMapLeadId.value)
    ?? leads.find((item) => item.location)
    ?? null
})
const hasFilters = computed(() => Boolean(
  keyword.value.trim()
  || activeStage.value
  || activeSource.value
  || activeTiming.value !== 'ALL',
))

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchSalesCrm({
      keyword: keyword.value,
      stage: activeStage.value,
      source: activeSource.value,
      timing: activeTiming.value,
    })
    overview.value = result
    if (!result.map.points.some((point) => point.leadId === selectedMapLeadId.value)) {
      selectedMapLeadId.value = result.map.points[0]?.leadId ?? ''
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '商家 CRM 加载失败'
  } finally {
    loading.value = false
  }
}

onShow(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function search(): void {
  void load()
}

function chooseStage(stage: LeadStage | null): void {
  activeStage.value = stage
  void load()
}

function chooseTiming(timing: SalesCrmTimingFilter): void {
  activeTiming.value = timing
  void load()
}

function chooseSource(source: string): void {
  activeSource.value = activeSource.value === source ? '' : source
  void load()
}

function clearFilters(): void {
  keyword.value = ''
  activeStage.value = null
  activeSource.value = ''
  activeTiming.value = 'ALL'
  void load()
}

function stageLabel(stage: LeadStage): string {
  return stageOptions.find((item) => item.value === stage)?.label ?? stage
}

function dueLabel(value: string): string {
  const due = new Date(value)
  const minutes = Math.round((due.getTime() - Date.now()) / 60000)
  if (minutes < -60) return `逾期 ${Math.ceil(Math.abs(minutes) / 60)} 小时`
  if (minutes < 0) return `逾期 ${Math.abs(minutes)} 分钟`
  if (minutes < 60) return `${Math.max(minutes, 1)} 分钟后`
  if (due.toDateString() === new Date().toDateString()) {
    return `今天 ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
  }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (due.toDateString() === tomorrow.toDateString()) {
    return `明天 ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
  }
  return `${due.getMonth() + 1}月${due.getDate()}日`
}

function activityLabel(item: SalesCrmLeadSummary): string {
  if (!item.lastFollowUpAt) return '尚未首次跟进'
  const date = new Date(item.lastFollowUpAt)
  return `最近 ${date.getMonth() + 1}月${date.getDate()}日跟进`
}

function openLead(leadId: string): void {
  uni.navigateTo({ url: `/pages/onboarding/index?focusLeadId=${encodeURIComponent(leadId)}` })
}

function showMapLead(leadId: string): void {
  selectedMapLeadId.value = leadId
}

function mapPointStyle(point: SalesCrmMapPoint): Record<string, string> {
  const points = overview.value?.map.points ?? []
  if (points.length <= 1) return { left: '50%', top: '48%' }
  const latitudes = points.map((item) => item.latitude)
  const longitudes = points.map((item) => item.longitude)
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes)
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes)
  const left = longitudeSpan === 0
    ? 50
    : 12 + ((point.longitude - Math.min(...longitudes)) / longitudeSpan) * 76
  const top = latitudeSpan === 0
    ? 48
    : 14 + (1 - (point.latitude - Math.min(...latitudes)) / latitudeSpan) * 67
  return { left: `${left}%`, top: `${top}%` }
}

function switchWorkspace(
  target: 'TODAY' | 'MERCHANTS' | 'COPILOT' | 'PERFORMANCE' | 'TEAM',
): void {
  if (target === 'MERCHANTS') return
  if (target === 'TODAY') {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  if (target === 'COPILOT') {
    uni.navigateTo({ url: '/pages/copilot/index' })
    return
  }
  uni.navigateTo({
    url: target === 'PERFORMANCE' ? '/pages/performance/index' : '/pages/team/index',
  })
}
</script>

<template>
  <view class="crm-page">
    <header class="hero">
      <view class="topbar">
        <view class="brand">
          <view class="brand-mark">S</view>
          <view><strong>商家 CRM</strong><text>LEQU SALES INTELLIGENCE</text></view>
        </view>
        <view class="scope-pill"><i /> 我的数据范围</view>
        <view class="avatar">林</view>
      </view>

      <view class="hero-title">
        <view>
          <text>OPPORTUNITY UNIVERSE</text>
          <strong>让每条线索，都有下一步</strong>
          <span>列表、位置与跟进时间线保持同一份可信事实</span>
        </view>
        <view class="radar-mark"><i /><i /><strong>{{ overview?.metrics.total ?? '—' }}</strong></view>
      </view>

      <view class="search-row">
        <view class="search-box">
          <i>⌕</i>
          <input
            v-model="keyword"
            data-testid="crm-search"
            confirm-type="search"
            placeholder="搜索商家、联系人、地址或来源"
            @confirm="search"
          >
          <button v-if="keyword" aria-label="清空搜索" @click="keyword = ''">×</button>
        </view>
        <button class="search-action" data-testid="crm-search-submit" @click="search">搜索</button>
      </view>
    </header>

    <main v-if="overview" class="content">
      <view class="metric-rail">
        <view><strong>{{ overview.metrics.filtered }}</strong><text>当前结果</text></view>
        <view><strong class="danger">{{ overview.metrics.overdue }}</strong><text>跟进逾期</text></view>
        <view><strong>{{ overview.metrics.protected }}</strong><text>保护期内</text></view>
        <view><strong>{{ overview.metrics.located }}</strong><text>已定位</text></view>
      </view>

      <scroll-view scroll-x :show-scrollbar="false" class="filter-scroll">
        <view class="filter-row">
          <button
            v-for="item in stageOptions"
            :key="item.label"
            :class="{ active: activeStage === item.value }"
            @click="chooseStage(item.value)"
          >{{ item.label }}</button>
        </view>
      </scroll-view>

      <view class="timing-row">
        <button
          v-for="item in timingOptions"
          :key="item.value"
          :data-testid="`timing-${item.value.toLowerCase()}`"
          :class="{ active: activeTiming === item.value }"
          @click="chooseTiming(item.value)"
        >{{ item.label }}</button>
      </view>

      <view v-if="overview.filters.sources.length" class="source-row">
        <text>来源</text>
        <view class="source-chips">
          <button
            v-for="source in overview.filters.sources"
            :key="source"
            :class="{ active: activeSource === source }"
            @click="chooseSource(source)"
          >{{ source }}</button>
        </view>
      </view>

      <view class="section-head">
        <view>
          <text>MERCHANT PIPELINE</text>
          <strong>{{ viewMode === 'LIST' ? '商机列表' : '商机地图' }}</strong>
        </view>
        <view class="view-switch">
          <button
            data-testid="view-list"
            :class="{ active: viewMode === 'LIST' }"
            @click="viewMode = 'LIST'"
          >列</button>
          <button
            data-testid="view-map"
            :class="{ active: viewMode === 'MAP' }"
            @click="viewMode = 'MAP'"
          >图</button>
        </view>
      </view>

      <view v-if="viewMode === 'LIST' && overview.leads.length" class="lead-list">
        <button
          v-for="item in overview.leads"
          :key="item.lead.id"
          :data-testid="`lead-card-${item.lead.id}`"
          class="lead-card"
          @click="openLead(item.lead.id)"
        >
          <view class="lead-main">
            <view class="merchant-avatar">{{ item.lead.name.slice(0, 1) }}</view>
            <view class="lead-copy">
              <view class="merchant-name">
                <strong>{{ item.lead.name }}</strong>
                <text :class="`stage-${item.lead.stage.toLowerCase()}`">{{ stageLabel(item.lead.stage) }}</text>
              </view>
              <span>{{ item.lead.category }} · {{ item.lead.source }}</span>
              <small>{{ item.location?.district ?? '待确认位置' }} · {{ item.lead.contactName }} {{ item.lead.contactPhoneMasked }}</small>
            </view>
            <view class="chevron">›</view>
          </view>
          <view class="next-action">
            <view><i :class="{ overdue: item.isOverdue }" /> <text>下一步</text></view>
            <strong>{{ item.lead.nextAction }}</strong>
            <span :class="{ overdue: item.isOverdue }">{{ dueLabel(item.lead.nextActionAt) }}</span>
          </view>
          <view class="lead-foot">
            <text>{{ activityLabel(item) }} · {{ item.followUpCount }} 次跟进 / {{ item.activityCount }} 条时间线</text>
            <span v-if="item.protectionDaysRemaining">保护期 {{ item.protectionDaysRemaining }} 天</span>
            <span v-else>保护期已结束</span>
          </view>
        </button>
      </view>

      <view v-else-if="viewMode === 'MAP' && overview.map.points.length" class="map-section">
        <view class="map-canvas">
          <view class="map-grid" />
          <view class="map-orbit orbit-one" />
          <view class="map-orbit orbit-two" />
          <view class="river">SUZHOU CREEK</view>
          <view class="road road-one" />
          <view class="road road-two" />
          <view class="map-caption">
            <text>SHANGHAI · OPPORTUNITY MAP</text>
            <strong>{{ overview.map.points.length }} 个可定位商机</strong>
          </view>
          <button
            v-for="point in overview.map.points"
            :key="point.leadId"
            :data-testid="`map-point-${point.leadId}`"
            :style="mapPointStyle(point)"
            :class="['map-point', { active: selectedMapLeadId === point.leadId, overdue: point.isOverdue }]"
            @click="showMapLead(point.leadId)"
          >
            <i>{{ point.name.slice(0, 1) }}</i>
            <text>{{ point.name }}</text>
          </button>
          <view class="map-legend"><i /> 商机 <i class="late" /> 逾期 <i class="focus" /> 当前</view>
        </view>

        <button
          v-if="selectedMapLead"
          class="map-detail"
          data-testid="map-selected-lead"
          @click="openLead(selectedMapLead.lead.id)"
        >
          <view class="map-detail-top">
            <view>
              <text>{{ selectedMapLead.location?.district }} · {{ selectedMapLead.lead.category }}</text>
              <strong>{{ selectedMapLead.lead.name }}</strong>
            </view>
            <span>{{ stageLabel(selectedMapLead.lead.stage) }}</span>
          </view>
          <view class="map-next">
            <i :class="{ overdue: selectedMapLead.isOverdue }" />
            <view><text>建议下一步</text><strong>{{ selectedMapLead.lead.nextAction }}</strong></view>
            <span>进入详情 ›</span>
          </view>
        </button>

        <view class="location-note">
          <i>i</i>
          <text>演示数据使用有版本、来源和置信度的本地参考坐标；生产环境接入合规地图服务后才用于导航，不会将推测位置冒充真实定位。</text>
        </view>
      </view>

      <view v-else class="empty-card">
        <view>⌕</view>
        <strong>{{ viewMode === 'MAP' ? '当前结果还没有可信坐标' : '没有找到匹配商家' }}</strong>
        <text>{{ hasFilters ? '试试放宽筛选条件，完整线索仍会保留在数据范围内。' : '新线索创建后会立即出现在这里。' }}</text>
        <button v-if="hasFilters" @click="clearFilters">清除全部筛选</button>
      </view>

      <view class="integrity-card">
        <view>盾</view>
        <text>商家详情中的跟进、阶段、保护期和申诉都会写入同一条不可静默覆盖的业务时间线；城市销售不能越权直接转移归属。</text>
      </view>
    </main>

    <view v-else-if="loading" class="state-card">
      <view class="loading-orbit"><i /></view>
      <strong>正在加载商机宇宙</strong>
      <text>校验数据范围、跟进节奏与位置可信度…</text>
    </view>
    <view v-else class="state-card">
      <view>!</view>
      <strong>商家 CRM 暂时不可用</strong>
      <text>{{ errorMessage }}</text>
      <button @click="load">重新加载</button>
    </view>

    <nav class="bottom-nav">
      <button @click="switchWorkspace('TODAY')"><i>今</i><text>今日</text></button>
      <button class="active" @click="switchWorkspace('MERCHANTS')"><i>商</i><text>商家</text></button>
      <button @click="switchWorkspace('COPILOT')"><i>✦</i><text>AI</text></button>
      <button @click="switchWorkspace('PERFORMANCE')"><i>绩</i><text>业绩</text></button>
      <button @click="switchWorkspace('TEAM')"><i>队</i><text>团队</text></button>
    </nav>
  </view>
</template>

<style scoped lang="scss">
page { background:#f4f5f8 } button { margin:0; padding:0; border:0; line-height:inherit } button::after { display:none }
.crm-page { min-height:100vh; padding-bottom:82px; background:#f4f5f8; color:#1b1c29; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
.hero { position:relative; overflow:hidden; padding:calc(env(safe-area-inset-top) + 12px) 17px 29px; border-radius:0 0 35px 35px; background:radial-gradient(circle at 83% 23%,rgba(255,102,126,.28),transparent 28%),radial-gradient(circle at 10% 100%,rgba(104,89,215,.32),transparent 38%),linear-gradient(145deg,#101426,#252541 64%,#573047); color:#fff }
.hero::after { position:absolute; top:80px; right:-93px; width:245px; height:245px; border:1px solid rgba(255,255,255,.07); border-radius:50%; box-shadow:0 0 0 29px rgba(255,255,255,.024),0 0 0 62px rgba(255,255,255,.016); content:"" }
.topbar { position:relative; z-index:2; display:flex; min-height:43px; align-items:center }.brand { display:flex; min-width:0; flex:1; align-items:center }.brand-mark { display:flex; width:35px; height:35px; align-items:center; justify-content:center; border-radius:12px 12px 12px 4px; background:linear-gradient(145deg,#ff7a89,#df4c69); box-shadow:0 8px 19px rgba(239,82,111,.26); font-size:13px; font-weight:950 }.brand>view:last-child { margin-left:9px }.brand strong,.brand text { display:block }.brand strong { font-size:14px }.brand text { margin-top:2px; color:rgba(255,255,255,.4); font-size:5px; font-weight:900; letter-spacing:.14em }.scope-pill { display:flex; align-items:center; gap:5px; margin-right:8px; padding:7px 8px; border:1px solid rgba(255,255,255,.08); border-radius:99px; background:rgba(255,255,255,.05); color:rgba(255,255,255,.66); font-size:6px }.scope-pill i { width:5px; height:5px; border-radius:50%; background:#76e5c4; box-shadow:0 0 0 4px rgba(118,229,196,.1) }.avatar { display:flex; width:33px; height:33px; align-items:center; justify-content:center; border:2px solid rgba(255,255,255,.16); border-radius:50%; background:#fff; color:#2b2435; font-size:10px; font-weight:950 }
.hero-title { position:relative; z-index:2; display:flex; align-items:center; justify-content:space-between; margin-top:22px }.hero-title>view:first-child text,.hero-title>view:first-child strong,.hero-title>view:first-child span { display:block }.hero-title>view:first-child text { color:#ff93a2; font-size:6px; font-weight:900; letter-spacing:.15em }.hero-title>view:first-child strong { margin-top:6px; font-size:23px; font-weight:950; letter-spacing:-.04em }.hero-title>view:first-child span { margin-top:7px; color:rgba(255,255,255,.47); font-size:7px }.radar-mark { position:relative; display:flex; width:60px; height:60px; flex:0 0 auto; align-items:center; justify-content:center; margin-left:8px; border:1px solid rgba(255,255,255,.13); border-radius:50%; box-shadow:inset 0 0 0 10px rgba(255,255,255,.025),inset 0 0 0 20px rgba(255,255,255,.02) }.radar-mark::after { position:absolute; width:50%; height:1px; background:linear-gradient(90deg,transparent,#86e5ca); content:""; transform:translateX(50%) rotate(-33deg); transform-origin:left center }.radar-mark i { position:absolute; width:5px; height:5px; border-radius:50%; background:#ff7f92 }.radar-mark i:first-child { top:12px; right:15px }.radar-mark i:nth-child(2) { bottom:13px; left:11px; background:#83e4c9 }.radar-mark strong { position:relative; z-index:1; font-size:15px }
.search-row { position:relative; z-index:3; display:grid; grid-template-columns:1fr 58px; gap:7px; margin-top:20px }.search-box { display:flex; height:44px; align-items:center; padding:0 11px; border:1px solid rgba(255,255,255,.09); border-radius:14px; background:rgba(255,255,255,.09); backdrop-filter:blur(12px) }.search-box i { margin-right:7px; color:#99eed7; font-size:18px; font-style:normal }.search-box input { min-width:0; flex:1; color:#fff; font-size:8px }.search-box button { display:flex; width:23px; height:23px; align-items:center; justify-content:center; border-radius:8px; background:rgba(255,255,255,.09); color:rgba(255,255,255,.7); font-size:14px }.search-action { border-radius:14px; background:linear-gradient(135deg,#ff7287,#d84b6a); box-shadow:0 9px 20px rgba(219,73,103,.25); color:#fff; font-size:8px; font-weight:900 }
.content { padding:0 17px 30px }.metric-rail { position:relative; z-index:4; display:grid; grid-template-columns:repeat(4,1fr); margin-top:-13px; padding:14px 5px; border:1px solid rgba(31,33,49,.055); border-radius:19px; background:#fff; box-shadow:0 12px 29px rgba(27,28,44,.08) }.metric-rail view { border-right:1px solid #eeeef2; text-align:center }.metric-rail view:last-child { border:0 }.metric-rail strong,.metric-rail text { display:block }.metric-rail strong { font-size:16px }.metric-rail strong.danger { color:#e3526b }.metric-rail text { margin-top:4px; color:#9a9ba5; font-size:6px }
.filter-scroll { width:calc(100% + 34px); margin:17px -17px 0; white-space:nowrap; scrollbar-width:none }.filter-scroll::-webkit-scrollbar,.filter-scroll *::-webkit-scrollbar { display:none }.filter-row { display:flex; gap:6px; padding:0 17px 5px }.filter-row button { flex:0 0 auto; padding:9px 12px; border:1px solid #e1e2e7; border-radius:99px; background:#fff; color:#7f808b; font-size:7px; font-weight:800 }.filter-row button.active { border-color:#27293f; background:#27293f; box-shadow:0 8px 17px rgba(39,41,63,.16); color:#fff }
:deep(.filter-scroll .uni-scroll-view) { scrollbar-width:none }
:deep(.filter-scroll .uni-scroll-view::-webkit-scrollbar) { display:none }
.timing-row { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-top:7px; padding:4px; border-radius:13px; background:#e8e8ed }.timing-row button { height:32px; border-radius:9px; background:transparent; color:#8b8c96; font-size:6px; font-weight:850 }.timing-row button.active { background:#fff; box-shadow:0 5px 12px rgba(31,32,48,.08); color:#d94c68 }
.source-row { display:flex; align-items:center; gap:8px; margin-top:9px }.source-row>text { flex:0 0 auto; color:#9a9ba4; font-size:7px }.source-chips { display:flex; min-width:0; flex:1; flex-wrap:wrap; gap:5px }.source-row button { flex:0 0 auto; padding:6px 8px; border:1px solid #e2e2e7; border-radius:8px; background:#fafafd; color:#888995; font-size:6px }.source-row button.active { border-color:#6e60d3; background:#f0edff; color:#5c4fc3 }
.section-head { display:flex; align-items:flex-end; justify-content:space-between; margin:23px 2px 11px }.section-head text,.section-head strong { display:block }.section-head text { color:#e45670; font-size:6px; font-weight:900; letter-spacing:.14em }.section-head strong { margin-top:4px; font-size:19px; font-weight:950 }.view-switch { display:grid; grid-template-columns:repeat(2,32px); gap:3px; padding:3px; border-radius:11px; background:#e7e7ec }.view-switch button { height:29px; border-radius:8px; background:transparent; color:#9697a0; font-size:8px; font-weight:900 }.view-switch button.active { background:#fff; box-shadow:0 4px 10px rgba(26,28,44,.09); color:#5750c6 }
.lead-list { display:grid; gap:9px }.lead-card { display:block; width:100%; overflow:hidden; border:1px solid rgba(30,31,47,.055); border-radius:20px; background:#fff; box-shadow:0 8px 22px rgba(28,29,45,.05); color:#20212d; text-align:left }.lead-main { display:flex; align-items:center; padding:13px 13px 10px }.merchant-avatar { display:flex; width:43px; height:43px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:15px 15px 15px 5px; background:linear-gradient(145deg,#343552,#1e2033); color:#fff; font-size:13px; font-weight:950 }.lead-card:nth-child(3n+2) .merchant-avatar { background:linear-gradient(145deg,#735fdc,#5340b7) }.lead-card:nth-child(3n+3) .merchant-avatar { background:linear-gradient(145deg,#e86177,#b93e5c) }.lead-copy { min-width:0; flex:1; margin-left:10px }.merchant-name { display:flex; align-items:center; gap:6px }.merchant-name strong { overflow:hidden; max-width:142px; font-size:11px; text-overflow:ellipsis; white-space:nowrap }.merchant-name text { flex:0 0 auto; padding:3px 5px; border-radius:6px; background:#f0effa; color:#635ac2; font-size:5px }.merchant-name text.stage-lost { background:#eeeef1; color:#898a93 }.lead-copy>span,.lead-copy>small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }.lead-copy>span { margin-top:5px; color:#676873; font-size:7px }.lead-copy>small { margin-top:4px; color:#a0a1aa; font-size:6px }.chevron { color:#b4b5bd; font-size:20px }.next-action { display:grid; grid-template-columns:43px 1fr auto; align-items:center; gap:8px; margin:0 11px; padding:10px; border-radius:12px; background:#f7f7fa }.next-action>view { display:flex; align-items:center; gap:5px; color:#92939d; font-size:6px }.next-action i { width:6px; height:6px; border-radius:50%; background:#65cbae; box-shadow:0 0 0 4px rgba(101,203,174,.1) }.next-action i.overdue { background:#e95068; box-shadow:0 0 0 4px rgba(233,80,104,.09) }.next-action strong { overflow:hidden; font-size:7px; text-overflow:ellipsis; white-space:nowrap }.next-action>span { color:#777985; font-size:6px }.next-action>span.overdue { color:#df4d65; font-weight:850 }.lead-foot { display:flex; align-items:center; justify-content:space-between; padding:10px 13px 11px; color:#9a9ba4; font-size:6px }.lead-foot span { padding:4px 6px; border-radius:6px; background:#eef7f4; color:#40806e }
.map-section { display:grid; gap:10px }.map-canvas { position:relative; height:315px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:23px; background:radial-gradient(circle at 70% 26%,rgba(111,91,218,.22),transparent 27%),linear-gradient(145deg,#171a2d,#242541); box-shadow:0 14px 30px rgba(24,25,43,.18) }.map-grid { position:absolute; inset:0; opacity:.35; background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px); background-size:29px 29px; transform:rotate(-8deg) scale(1.2) }.map-orbit { position:absolute; border:1px solid rgba(116,227,199,.13); border-radius:50% }.orbit-one { top:33px; right:19px; width:115px; height:115px; box-shadow:0 0 0 21px rgba(116,227,199,.025) }.orbit-two { bottom:-53px; left:-45px; width:180px; height:180px; border-color:rgba(255,118,139,.12); box-shadow:0 0 0 28px rgba(255,118,139,.022) }.river { position:absolute; top:62%; left:-6%; width:116%; padding:4px 0; background:rgba(93,139,189,.1); color:rgba(143,193,224,.23); font-size:6px; font-weight:900; letter-spacing:.45em; text-align:center; transform:rotate(-10deg) }.road { position:absolute; height:1px; background:rgba(255,255,255,.11); transform-origin:left center }.road-one { top:36%; left:-10%; width:120%; transform:rotate(18deg) }.road-two { top:19%; left:25%; width:95%; transform:rotate(79deg) }.map-caption { position:absolute; z-index:2; top:15px; left:15px }.map-caption text,.map-caption strong { display:block }.map-caption text { color:#8ce7ce; font-size:5px; font-weight:900; letter-spacing:.14em }.map-caption strong { margin-top:4px; color:#fff; font-size:11px }.map-point { position:absolute; z-index:5; display:flex; width:31px; height:31px; align-items:center; justify-content:center; border:2px solid rgba(255,255,255,.26); border-radius:50% 50% 50% 6px; background:#7361dc; box-shadow:0 8px 18px rgba(0,0,0,.26); color:#fff; transform:translate(-50%,-50%) rotate(-45deg) }.map-point i { font-size:8px; font-style:normal; font-weight:950; transform:rotate(45deg) }.map-point text { position:absolute; top:33px; left:50%; width:max-content; max-width:91px; overflow:hidden; padding:4px 6px; border:1px solid rgba(255,255,255,.09); border-radius:7px; background:rgba(13,14,29,.72); color:rgba(255,255,255,.7); font-size:5px; text-overflow:ellipsis; white-space:nowrap; transform:translateX(-50%) rotate(45deg) }.map-point.overdue { background:#e7536c }.map-point.active { z-index:8; border-color:#93ecd4; box-shadow:0 0 0 7px rgba(124,231,202,.15),0 10px 21px rgba(0,0,0,.28); transform:translate(-50%,-50%) rotate(-45deg) scale(1.16) }.map-point.active text { background:#fff; color:#24263c; font-weight:850 }.map-legend { position:absolute; z-index:4; right:11px; bottom:10px; display:flex; align-items:center; gap:5px; padding:6px 8px; border-radius:8px; background:rgba(8,9,20,.55); color:rgba(255,255,255,.45); font-size:5px }.map-legend i { width:5px; height:5px; border-radius:50%; background:#7361dc }.map-legend i.late { margin-left:3px; background:#e7536c }.map-legend i.focus { margin-left:3px; border:1px solid #8ee8d0; background:transparent }
.map-detail { display:block; width:100%; padding:14px; border:1px solid rgba(29,31,47,.055); border-radius:19px; background:#fff; box-shadow:0 8px 21px rgba(28,29,45,.05); color:#20212d; text-align:left }.map-detail-top { display:flex; align-items:flex-start; justify-content:space-between }.map-detail-top text,.map-detail-top strong { display:block }.map-detail-top text { color:#999aa4; font-size:6px }.map-detail-top strong { margin-top:4px; font-size:13px }.map-detail-top>span { padding:5px 7px; border-radius:7px; background:#f0effb; color:#5e53c2; font-size:6px }.map-next { display:flex; align-items:center; gap:9px; margin-top:12px; padding-top:11px; border-top:1px solid #eeeef2 }.map-next>i { width:8px; height:8px; border-radius:50%; background:#68cdb1; box-shadow:0 0 0 5px rgba(104,205,177,.1) }.map-next>i.overdue { background:#e65069; box-shadow:0 0 0 5px rgba(230,80,105,.09) }.map-next>view { min-width:0; flex:1 }.map-next text,.map-next strong { display:block }.map-next text { color:#a0a1a9; font-size:5px }.map-next strong { overflow:hidden; margin-top:3px; font-size:7px; text-overflow:ellipsis; white-space:nowrap }.map-next>span { color:#6257c7; font-size:6px; font-weight:850 }.location-note { display:flex; align-items:flex-start; gap:8px; padding:11px; border:1px solid #e1e8e6; border-radius:14px; background:#edf6f3; color:#667b75; font-size:6px; line-height:1.55 }.location-note i { display:flex; width:20px; height:20px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:7px; background:#25836c; color:#fff; font-size:7px; font-style:normal; font-weight:900 }
.empty-card { display:flex; min-height:205px; flex-direction:column; align-items:center; justify-content:center; border:1px dashed #d9d9e1; border-radius:21px; background:#fff; text-align:center }.empty-card>view { display:flex; width:45px; height:45px; align-items:center; justify-content:center; border-radius:15px; background:#efedff; color:#6256ca; font-size:20px }.empty-card strong { margin-top:11px; font-size:11px }.empty-card text { max-width:235px; margin-top:6px; color:#999aa4; font-size:7px; line-height:1.55 }.empty-card button { margin-top:12px; padding:9px 13px; border-radius:10px; background:#27293f; color:#fff; font-size:7px; font-weight:850 }.integrity-card { display:flex; align-items:center; gap:9px; margin-top:13px; padding:12px; border:1px solid #e1e5ed; border-radius:15px; background:#f8f9fc; color:#747681; font-size:6px; line-height:1.55 }.integrity-card view { display:flex; width:29px; height:29px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:9px; background:#292c45; color:#8ce6cf; font-size:7px; font-weight:900 }
.state-card { display:flex; min-height:72vh; flex-direction:column; align-items:center; justify-content:center; gap:9px; color:#8b8c96; font-size:8px }.state-card>view { display:flex; width:52px; height:52px; align-items:center; justify-content:center; border-radius:17px; background:#e6536f; box-shadow:0 12px 25px rgba(230,83,111,.2); color:#fff; font-size:16px }.state-card strong { color:#272936; font-size:13px }.state-card button { margin-top:5px; padding:10px 15px; border-radius:11px; background:#282a42; color:#fff; font-size:7px }.state-card .loading-orbit { position:relative; border:2px solid #e4e1fa; background:#fff; box-shadow:none }.loading-orbit::before { position:absolute; inset:8px; border:1px solid #efeff4; border-radius:50%; content:"" }.loading-orbit i { width:8px; height:8px; border-radius:50%; background:#e6536f; box-shadow:17px 5px 0 #6b5dd2,-10px 13px 0 #71d5b7 }
.bottom-nav { position:fixed; z-index:30; right:0; bottom:0; left:0; display:grid; grid-template-columns:repeat(5,1fr); padding:7px 11px calc(7px + env(safe-area-inset-bottom)); border-top:1px solid rgba(34,35,50,.07); background:rgba(255,255,255,.94); box-shadow:0 -10px 28px rgba(22,23,37,.07); backdrop-filter:blur(16px) }.bottom-nav button { display:flex; height:50px; flex-direction:column; align-items:center; justify-content:center; border-radius:14px; background:transparent; color:#9b9ca6 }.bottom-nav i,.bottom-nav text { display:block }.bottom-nav i { font-size:11px; font-style:normal; font-weight:950 }.bottom-nav text { margin-top:4px; font-size:6px; font-weight:850 }.bottom-nav button.active { background:#f0eefc; color:#5c50ca }
@media (min-width:680px) { .hero,.content { max-width:720px; margin:0 auto }.bottom-nav { right:50%; left:50%; width:520px; transform:translateX(-50%) } }
</style>
