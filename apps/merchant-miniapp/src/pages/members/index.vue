<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type {
  MerchantMemberOverview,
  MerchantMemberSegment,
  MerchantMemberSummary,
  MerchantRecallTaskSummary,
} from '@lequ/contracts'
import { createRecallTask, fetchMemberOverview } from '../../services/members'

type MemberFilter = 'ALL' | MerchantMemberSegment

const overview = ref<MerchantMemberOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const activeFilter = ref<MemberFilter>('ALL')
const recallVisible = ref(false)
const recallConfirmed = ref(false)
const recallChannel = ref<MerchantRecallTaskSummary['channel']>('WECHAT')
const recallName = ref('沉睡会员温和召回')
const recallContent = ref('好久不见，为你保留了一份时令菜单与专属到店礼遇。')
const recallReason = ref('高流失风险且历史消费价值值得持续服务')

const filters: Array<{ key: MemberFilter; label: string }> = [
  { key: 'ALL', label: '全部会员' },
  { key: 'HIGH_VALUE', label: '高价值' },
  { key: 'DORMANT', label: '沉睡' },
  { key: 'ACTIVE', label: '活跃' },
  { key: 'NEW', label: '新客' },
]

const visibleMembers = computed(() => {
  const members = overview.value?.members ?? []
  return activeFilter.value === 'ALL'
    ? members
    : members.filter((member) => member.segment === activeFilter.value)
})
const dormantMembers = computed(() => overview.value?.members.filter((member) => member.segment === 'DORMANT') ?? [])
const consentCoverage = computed(() => {
  const metrics = overview.value?.metrics
  return metrics?.totalMembers ? Math.round(metrics.consentedMembers / metrics.totalMembers * 100) : 0
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchMemberOverview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '会员数据加载失败'
  } finally {
    loading.value = false
  }
}

onShow(() => void load())
onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function goBack(): void {
  uni.navigateBack()
}

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(fen / 100)
}

function segmentLabel(segment: MerchantMemberSegment): string {
  return segment === 'HIGH_VALUE' ? '高价值' : segment === 'DORMANT' ? '沉睡' : segment === 'ACTIVE' ? '活跃' : '新客'
}

function riskLabel(member: MerchantMemberSummary): string {
  return member.churnRisk === 'HIGH' ? '高流失风险' : member.churnRisk === 'MEDIUM' ? '需持续培育' : '关系稳定'
}

function lastVisit(value: string | null): string {
  if (!value) return '暂无到店'
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  return days === 0 ? '今日到店' : `${days} 天前到店`
}

function openMember(member: MerchantMemberSummary): void {
  uni.navigateTo({ url: `/pages/members/detail?memberId=${encodeURIComponent(member.id)}` })
}

function openRecall(): void {
  recallConfirmed.value = false
  recallChannel.value = 'WECHAT'
  recallName.value = '沉睡会员温和召回'
  recallContent.value = '好久不见，为你保留了一份时令菜单与专属到店礼遇。'
  recallReason.value = '高流失风险且历史消费价值值得持续服务'
  recallVisible.value = true
}

function tomorrowAtTen(): string {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  value.setHours(10, 0, 0, 0)
  return value.toISOString()
}

async function submitRecall(): Promise<void> {
  if (busy.value) return
  if (!recallConfirmed.value) {
    uni.showToast({ title: '请先确认人群授权、内容与触达影响', icon: 'none' })
    return
  }
  if (recallContent.value.trim().length < 5 || recallReason.value.trim().length < 3) {
    uni.showToast({ title: '请完善召回内容与业务原因', icon: 'none' })
    return
  }
  busy.value = true
  try {
    overview.value = await createRecallTask({
      name: recallName.value.trim(),
      memberIds: dormantMembers.value.map((member) => member.id),
      channel: recallChannel.value,
      content: recallContent.value.trim(),
      reason: recallReason.value.trim(),
      scheduledAt: tomorrowAtTen(),
    })
    recallVisible.value = false
    const task = overview.value.recallTasks[0]
    uni.showToast({ title: `已建计划：${task?.audienceCount ?? 0} 人`, icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '召回计划创建失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view class="members-page">
    <view class="hero-shell">
      <view class="topbar">
        <button aria-label="返回" @click="goBack">‹</button>
        <view><text>MEMBER INTELLIGENCE</text><strong>会员资产</strong></view>
        <button aria-label="更多">•••</button>
      </view>
      <view v-if="overview" class="hero-card">
        <view class="hero-head">
          <view><text>可经营会员</text><strong>{{ overview.metrics.totalMembers }}</strong></view>
          <view class="model-chip">可解释预测 · {{ overview.predictionModelVersion }}</view>
        </view>
        <view class="hero-stats">
          <view><strong>{{ overview.metrics.highValueMembers }}</strong><text>高价值</text></view>
          <view><strong>{{ overview.metrics.dormantMembers }}</strong><text>待召回</text></view>
          <view><strong>{{ overview.metrics.averageRepurchaseProbability }}%</strong><text>平均复购概率</text></view>
        </view>
        <view class="consent-row">
          <view><text>会员触达授权覆盖</text><strong>{{ consentCoverage }}%</strong></view>
          <view class="consent-progress"><i :style="{ width: `${consentCoverage}%` }" /></view>
        </view>
      </view>
    </view>

    <main v-if="overview" class="content">
      <button class="ai-recall-card" hover-class="pressed" @click="openRecall">
        <view class="ai-icon">✦</view>
        <view class="ai-copy">
          <text>AI RECALL OPPORTUNITY</text>
          <strong>有 {{ overview.metrics.dormantMembers }} 位沉睡会员值得温和召回</strong>
          <span>风险价值约 ¥{{ money(overview.metrics.atRiskValueFen) }}，系统会自动排除未授权会员。</span>
        </view>
        <view class="ai-arrow">→</view>
      </button>

      <view v-if="overview.recallTasks.length" class="latest-task">
        <view><i /> <text>最近计划</text><strong>{{ overview.recallTasks[0]?.name }}</strong></view>
        <span>{{ overview.recallTasks[0]?.audienceCount }} 人 · {{ overview.recallTasks[0]?.channel === 'WECHAT' ? '微信' : '短信' }} · 待执行</span>
      </view>

      <view class="filter-scroll">
        <button
          v-for="filter in filters"
          :key="filter.key"
          :class="{ active: activeFilter === filter.key }"
          @click="activeFilter = filter.key"
        >{{ filter.label }}</button>
      </view>

      <view class="section-head">
        <view><text>MEMBER PORTFOLIO</text><strong>会员画像</strong></view>
        <span>{{ visibleMembers.length }} 位 · {{ overview.segmentRuleVersion }}</span>
      </view>

      <view class="member-list">
        <button
          v-for="member in visibleMembers"
          :key="member.id"
          class="member-card"
          hover-class="pressed"
          @click="openMember(member)"
        >
          <view :class="['avatar', `avatar-${member.segment.toLowerCase()}`]">
            <text>{{ member.displayName.slice(0, 1) }}</text>
            <i v-if="member.marketingConsent">✓</i>
          </view>
          <view class="member-copy">
            <view class="name-row">
              <strong>{{ member.displayName }}</strong>
              <text :class="['segment', member.segment.toLowerCase()]">{{ segmentLabel(member.segment) }}</text>
            </view>
            <text class="phone">{{ member.phoneMasked }} · {{ lastVisit(member.lastVisitAt) }}</text>
            <view class="tags">
              <text v-for="tag in member.tags.slice(0, 3)" :key="tag">{{ tag }}</text>
            </view>
            <view class="value-row">
              <view><span>累计消费</span><strong>¥{{ money(member.lifetimeValueFen) }}</strong></view>
              <view><span>订单</span><strong>{{ member.orderCount }}</strong></view>
              <view><span>{{ riskLabel(member) }}</span><strong :class="{ danger: member.churnRisk === 'HIGH' }">{{ member.repurchaseProbability }}%</strong></view>
            </view>
          </view>
          <text class="card-arrow">›</text>
        </button>
      </view>

      <view class="privacy-card">
        <view>盾</view><text>会员原始数据归商家；触达只使用已授权人群，撤权后停止新增处理。</text>
      </view>
    </main>

    <view v-else-if="loading" class="state-card"><view>会</view><text>正在计算会员分层与复购信号…</text></view>
    <view v-else class="state-card"><strong>会员资产暂时不可用</strong><text>{{ errorMessage }}</text><button @click="load">重新加载</button></view>

    <view v-if="recallVisible" class="sheet-layer" @click.self="recallVisible = false">
      <view class="recall-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view><text>RECALL APPROVAL</text><strong>创建召回计划</strong></view>
          <button @click="recallVisible = false">×</button>
        </view>
        <view class="audience-card">
          <view class="audience-orbit">{{ dormantMembers.length }}</view>
          <view><strong>沉睡会员智能人群</strong><text>预计可触达 {{ dormantMembers.filter((member) => member.marketingConsent).length }} 人 · 自动排除 {{ dormantMembers.filter((member) => !member.marketingConsent).length }} 人</text></view>
        </view>
        <view class="channel-switch">
          <button :class="{ active: recallChannel === 'WECHAT' }" @click="recallChannel = 'WECHAT'">微信服务通知</button>
          <button :class="{ active: recallChannel === 'SMS' }" @click="recallChannel = 'SMS'">短信</button>
        </view>
        <label><text>计划名称</text><input v-model="recallName"></label>
        <label><text>召回内容</text><textarea v-model="recallContent" maxlength="500" /></label>
        <label><text>业务原因</text><input v-model="recallReason"></label>
        <view class="schedule-card"><text>计划执行</text><strong>明日 10:00</strong><span>当前只创建待执行任务，不伪造已发送结果。</span></view>
        <button :class="['confirmation', { checked: recallConfirmed }]" @click="recallConfirmed = !recallConfirmed">
          <i>{{ recallConfirmed ? '✓' : '' }}</i>
          <view><strong>我已核对人群、授权与内容</strong><text>系统将保存授权排除、规则版本和审批证据。</text></view>
        </button>
        <button class="primary-action" :disabled="busy" @click="submitRecall">{{ busy ? '正在安全创建…' : '强确认并创建计划' }}</button>
        <text class="safe-note">审批卡 · 授权过滤 · 规则版本 · 审计留痕</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
page { background:#f4f3f8 } button { margin:0; padding:0; border:0; line-height:inherit } button::after { display:none }
.members-page { min-height:100vh; background:#f4f3f8; color:#181b27; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
.hero-shell { padding:calc(env(safe-area-inset-top) + 10px) 17px 27px; border-radius:0 0 34px 34px; background:radial-gradient(circle at 88% 4%,rgba(123,240,205,.19),transparent 34%),linear-gradient(150deg,#10142a,#24214d 66%,#195347); color:#fff }
.topbar { display:grid; min-height:52px; grid-template-columns:40px 1fr 40px; align-items:center }.topbar button { display:flex; width:37px; height:37px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.09); border-radius:13px; background:rgba(255,255,255,.07); color:#fff; font-size:25px }.topbar button:last-child { font-size:10px; letter-spacing:2px }.topbar>view { text-align:center }.topbar text,.topbar strong { display:block }.topbar text { color:#84e3c7; font-size:7px; font-weight:900; letter-spacing:.14em }.topbar strong { margin-top:3px; font-size:17px }
.hero-card { margin-top:15px; padding:20px; border:1px solid rgba(255,255,255,.09); border-radius:25px; background:rgba(255,255,255,.075); box-shadow:0 20px 46px rgba(0,0,0,.16); backdrop-filter:blur(12px) }.hero-head { display:flex; align-items:flex-start; justify-content:space-between }.hero-head>view:first-child text,.hero-head>view:first-child strong { display:block }.hero-head>view:first-child text { color:rgba(255,255,255,.52); font-size:8px }.hero-head>view:first-child strong { margin-top:4px; font-size:37px; font-weight:950 }.model-chip { padding:6px 8px; border-radius:99px; background:rgba(116,231,199,.1); color:#83e7cb; font-size:7px; font-weight:850 }
.hero-stats { display:grid; grid-template-columns:repeat(3,1fr); margin-top:18px; padding:14px 0; border-top:1px solid rgba(255,255,255,.08); border-bottom:1px solid rgba(255,255,255,.08) }.hero-stats view { border-right:1px solid rgba(255,255,255,.08); text-align:center }.hero-stats view:last-child { border:0 }.hero-stats strong,.hero-stats text { display:block }.hero-stats strong { font-size:17px }.hero-stats text { margin-top:4px; color:rgba(255,255,255,.46); font-size:7px }
.consent-row { margin-top:14px }.consent-row>view:first-child { display:flex; justify-content:space-between; color:rgba(255,255,255,.55); font-size:8px }.consent-row strong { color:#86e9cd }.consent-progress { height:5px; margin-top:8px; overflow:hidden; border-radius:99px; background:rgba(255,255,255,.08) }.consent-progress i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#6d61ff,#7ce5c7) }
.content { padding:16px 17px calc(40px + env(safe-area-inset-bottom)) }.ai-recall-card { display:flex; width:100%; min-height:111px; align-items:center; padding:15px; border-radius:22px; background:linear-gradient(135deg,#6658ee,#443da5); box-shadow:0 13px 28px rgba(78,69,190,.2); color:#fff; text-align:left }.ai-icon { display:flex; width:44px; height:44px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:15px; background:rgba(255,255,255,.14); font-size:18px }.ai-copy { min-width:0; flex:1; margin-left:11px }.ai-copy text,.ai-copy strong,.ai-copy span { display:block }.ai-copy text { color:#bcb7ff; font-size:7px; font-weight:900; letter-spacing:.1em }.ai-copy strong { margin-top:5px; font-size:12px; line-height:1.4 }.ai-copy span { margin-top:6px; color:rgba(255,255,255,.58); font-size:7px; line-height:1.5 }.ai-arrow { margin-left:8px; font-size:18px }
.latest-task { display:flex; align-items:center; justify-content:space-between; margin-top:9px; padding:11px 13px; border:1px solid #e1dff2; border-radius:14px; background:#fff }.latest-task>view { display:flex; min-width:0; align-items:center; gap:5px }.latest-task i { width:6px; height:6px; border-radius:50%; background:#6759ef }.latest-task text { color:#88859b; font-size:7px }.latest-task strong { max-width:120px; overflow:hidden; font-size:8px; text-overflow:ellipsis; white-space:nowrap }.latest-task span { color:#655bd4; font-size:7px }
.filter-scroll { display:flex; gap:7px; overflow-x:auto; margin:19px -17px 0; padding:0 17px 5px; scrollbar-width:none }.filter-scroll::-webkit-scrollbar { display:none }.filter-scroll button { flex:0 0 auto; padding:9px 13px; border:1px solid #e4e2eb; border-radius:99px; background:#fff; color:#777887; font-size:8px; font-weight:800 }.filter-scroll button.active { border-color:#5149c5; background:#5149c5; box-shadow:0 8px 17px rgba(81,73,197,.18); color:#fff }
.section-head { display:flex; align-items:flex-end; justify-content:space-between; margin:20px 2px 11px }.section-head text,.section-head strong { display:block }.section-head text { color:#6659e7; font-size:7px; font-weight:900; letter-spacing:.13em }.section-head strong { margin-top:4px; font-size:18px; font-weight:950 }.section-head span { color:#9999a4; font-size:7px }
.member-list { display:grid; gap:9px }.member-card { display:flex; width:100%; min-height:152px; align-items:flex-start; padding:14px; border:1px solid rgba(31,31,57,.045); border-radius:22px; background:#fff; box-shadow:0 9px 24px rgba(31,30,63,.055); color:#1c1d2b; text-align:left }.avatar { position:relative; display:flex; width:55px; height:55px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:18px 18px 18px 7px; color:#fff }.avatar-high_value { background:linear-gradient(145deg,#bd8747,#775029) }.avatar-dormant { background:linear-gradient(145deg,#7c7894,#4a485f) }.avatar-active { background:linear-gradient(145deg,#28a98a,#126c5b) }.avatar-new { background:linear-gradient(145deg,#6f76df,#474aa2) }.avatar>text { font-size:18px; font-weight:950 }.avatar i { position:absolute; right:-3px; bottom:-3px; display:flex; width:18px; height:18px; align-items:center; justify-content:center; border:3px solid #fff; border-radius:50%; background:#15a27e; font-size:7px; font-style:normal }
.member-copy { min-width:0; flex:1; margin-left:12px }.name-row { display:flex; align-items:center; gap:6px }.name-row strong { font-size:13px }.segment { padding:3px 6px; border-radius:99px; font-size:7px; font-weight:850 }.segment.high_value { background:#fff1d9; color:#a46915 }.segment.dormant { background:#f0eff4; color:#6e6a80 }.segment.active { background:#e4f7f1; color:#0a7f64 }.segment.new { background:#eceeff; color:#575fc7 }.phone { display:block; margin-top:5px; color:#9696a0; font-size:7px }.tags { display:flex; gap:4px; margin-top:8px }.tags text { padding:4px 6px; border-radius:7px; background:#f3f3f7; color:#757583; font-size:6px }
.value-row { display:grid; grid-template-columns:1.2fr .65fr 1fr; margin-top:12px; padding-top:10px; border-top:1px solid #f0eff4 }.value-row view { border-right:1px solid #f0eff4 }.value-row view:last-child { border:0; text-align:right }.value-row span,.value-row strong { display:block }.value-row span { color:#9b9ba5; font-size:6px }.value-row strong { margin-top:3px; font-size:10px }.value-row .danger { color:#d65e51 }.card-arrow { align-self:center; margin-left:7px; color:#b4b4bd; font-size:22px }
.privacy-card { display:flex; align-items:center; gap:9px; margin-top:14px; padding:13px; border:1px solid #dfe9e6; border-radius:16px; background:#edf7f4; color:#647b74; font-size:7px; line-height:1.5 }.privacy-card view { display:flex; width:30px; height:30px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:10px; background:#16866a; color:#fff; font-size:8px; font-weight:900 }
.state-card { display:flex; min-height:70vh; flex-direction:column; align-items:center; justify-content:center; gap:11px; color:#858592; font-size:9px }.state-card>view { display:flex; width:54px; height:54px; align-items:center; justify-content:center; border-radius:18px; background:#554bc8; color:#fff; font-size:16px; font-weight:950 }.state-card strong { color:#292a37; font-size:14px }.state-card button { padding:10px 18px; border-radius:12px; background:#292a45; color:#fff; font-size:9px }
.sheet-layer { position:fixed; z-index:50; inset:0; display:flex; align-items:flex-end; background:rgba(9,9,27,.52) }.recall-sheet { width:100%; max-height:90vh; overflow-y:auto; padding:9px 19px calc(22px + env(safe-area-inset-bottom)); border-radius:29px 29px 0 0; background:#fff }.sheet-handle { width:41px; height:4px; margin:0 auto 17px; border-radius:99px; background:#dddde4 }.sheet-head { display:flex; align-items:flex-start; justify-content:space-between }.sheet-head text,.sheet-head strong { display:block }.sheet-head text { color:#5d52d7; font-size:7px; font-weight:900; letter-spacing:.13em }.sheet-head strong { margin-top:4px; font-size:21px; font-weight:950 }.sheet-head button { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border-radius:12px; background:#f1f1f5; color:#686875; font-size:20px }
.audience-card { display:flex; align-items:center; gap:11px; margin-top:18px; padding:14px; border-radius:17px; background:linear-gradient(135deg,#f0efff,#f5fbf9) }.audience-orbit { display:flex; width:43px; height:43px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:15px; background:#5a50d2; box-shadow:0 8px 17px rgba(90,80,210,.2); color:#fff; font-size:16px; font-weight:950 }.audience-card strong,.audience-card text { display:block }.audience-card strong { font-size:10px }.audience-card text { margin-top:5px; color:#747486; font-size:7px }
.channel-switch { display:grid; grid-template-columns:repeat(2,1fr); gap:6px; margin-top:14px; padding:4px; border-radius:13px; background:#f1f1f5 }.channel-switch button { height:36px; border-radius:10px; background:transparent; color:#777784; font-size:8px; font-weight:800 }.channel-switch button.active { background:#fff; box-shadow:0 5px 13px rgba(40,39,73,.08); color:#5148c3 }
.recall-sheet label { display:block; margin-top:12px }.recall-sheet label>text { display:block; margin:0 0 6px 2px; color:#626270; font-size:8px; font-weight:800 }.recall-sheet input,.recall-sheet textarea { box-sizing:border-box; width:100%; border:1px solid #e1e1e8; border-radius:13px; background:#f9f9fb; font-size:10px }.recall-sheet input { height:44px; padding:0 11px }.recall-sheet textarea { height:76px; padding:10px; line-height:1.5 }
.schedule-card { display:grid; grid-template-columns:1fr auto; margin-top:13px; padding:12px; border-radius:14px; background:#f3f4f8 }.schedule-card text { color:#777784; font-size:8px }.schedule-card strong { font-size:9px }.schedule-card span { grid-column:1/-1; margin-top:5px; color:#9999a3; font-size:7px }
.confirmation { display:flex; width:100%; align-items:flex-start; gap:10px; margin-top:14px; padding:13px; border:1px solid #e5e1dc; border-radius:16px; background:#fff9f5; color:#352f2c; text-align:left }.confirmation.checked { border-color:#5b51d3; background:#f2f1ff }.confirmation i { display:flex; width:21px; height:21px; flex:0 0 auto; align-items:center; justify-content:center; border:1px solid #c1c0ca; border-radius:7px; color:#fff; font-size:10px; font-style:normal }.confirmation.checked i { border-color:#5b51d3; background:#5b51d3 }.confirmation strong,.confirmation text { display:block }.confirmation strong { font-size:9px }.confirmation text { margin-top:4px; color:#817b78; font-size:7px }
.primary-action { width:100%; height:52px; margin-top:15px; border-radius:16px; background:linear-gradient(135deg,#6559ea,#4841aa); box-shadow:0 13px 25px rgba(75,66,177,.21); color:#fff; font-size:11px; font-weight:900 }.primary-action[disabled] { opacity:.6 }.safe-note { display:block; margin-top:9px; color:#9b9ba4; font-size:7px; text-align:center }.pressed { opacity:.8; transform:scale(.986) }
@media (min-width:680px) { .hero-shell,.content { max-width:720px; margin:0 auto }.recall-sheet { max-width:520px; margin:0 auto } }
</style>
