<script setup lang="ts">
import { computed } from 'vue'
import type { ExperienceSnapshot } from '@lequ/contracts'
import ActionButton from '../components/ActionButton.vue'

const props = defineProps<{ snapshot: ExperienceSnapshot; busy: boolean }>()
defineEmits<{ advance: [] }>()

const ownsNextStep = computed(() => props.snapshot.nextStep?.role === 'hq')
const ctaLabel = computed(() => ownsNextStep.value ? props.snapshot.nextStep?.actionLabel ?? '完成复核' : props.snapshot.completedSteps >= 12 ? '全链路审计已通过' : '等待业务链路完成')

function timeLabel(value: string): string {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function roleLabel(role: string): string {
  return ({ sales: '销售宝', provider: '服务商', consumer: '消费者', merchant: '经营宝', hq: 'HQ', system: '系统', 'merchant-owner': '商家老板' } as Record<string, string>)[role] ?? role
}
</script>

<template>
  <view class="hq-shell">
    <aside class="hq-sidebar">
      <view class="hq-logo"><view class="logo-mark">◦</view><view><text>乐趣生活</text><small>HQ CONTROL</small></view></view>
      <view class="nav-group">
        <text class="nav-caption">总览</text>
        <view class="side-link active"><text class="side-icon">⌁</text><span>控制塔</span><i /></view>
        <view class="side-link"><text class="side-icon">◎</text><span>城市网络</span></view>
        <view class="side-link"><text class="side-icon">◇</text><span>商家网络</span></view>
      </view>
      <view class="nav-group">
        <text class="nav-caption">能力中心</text>
        <view class="side-link"><text class="side-icon">▣</text><span>MiniApp</span></view>
        <view class="side-link"><text class="side-icon">⌖</text><span>GEO OS</span></view>
        <view class="side-link"><text class="side-icon">✦</text><span>Skill Network</span></view>
      </view>
      <view class="nav-group">
        <text class="nav-caption">治理</text>
        <view class="side-link"><text class="side-icon">✓</text><span>审批工作流</span></view>
        <view class="side-link"><text class="side-icon">◉</text><span>风控审计</span><b>{{ snapshot.audits.length }}</b></view>
      </view>
      <view class="sidebar-bottom"><view class="admin-avatar">HQ</view><view><text>总部运营中心</text><small>全平台权限</small></view></view>
    </aside>

    <view class="hq-main">
      <view class="hq-header">
        <view>
          <text class="hq-eyebrow">NATIONAL OPERATIONS · REAL TIME</text>
          <text class="hq-title">全链路控制塔</text>
          <text class="hq-subtitle">从供给建档到消费者履约，每一步都有证据。</text>
        </view>
        <view class="header-actions">
          <view class="system-health"><text /> 系统健康</view>
          <view class="date-chip">2026 · 07 · 22</view>
        </view>
      </view>

      <view v-if="snapshot.completedSteps >= 12" class="success-banner">
        <view class="success-mark">✓</view>
        <view><text>首个垂直切片审计通过</text><small>12 个关键步骤、{{ snapshot.metrics.eventCount }} 个领域事件、0 个未解释风险</small></view>
        <text class="cert-id">AUDIT · {{ snapshot.runId.slice(0, 8).toUpperCase() }}</text>
      </view>

      <view class="kpi-grid">
        <view class="kpi-card primary">
          <view class="kpi-head"><text class="kpi-label">链路完成度</text><text class="kpi-trend">实时</text></view>
          <text class="kpi-value">{{ snapshot.completionRate }}<small>%</small></text>
          <view class="kpi-track"><view :style="{ width: `${snapshot.completionRate}%` }" /></view>
        </view>
        <view class="kpi-card">
          <view class="kpi-head"><text class="kpi-label">审计覆盖</text><text class="kpi-icon mint">✓</text></view>
          <text class="kpi-value dark">{{ snapshot.metrics.auditCoverage }}<small>%</small></text>
          <text class="kpi-note positive">证据链完整</text>
        </view>
        <view class="kpi-card">
          <view class="kpi-head"><text class="kpi-label">可调用 Skill</text><text class="kpi-icon blue">✦</text></view>
          <text class="kpi-value dark">{{ snapshot.skills.length }}</text>
          <text class="kpi-note">成功率 98.9%+</text>
        </view>
        <view class="kpi-card">
          <view class="kpi-head"><text class="kpi-label">高风险事件</text><text class="kpi-icon coral">!</text></view>
          <text class="kpi-value dark">0</text>
          <text class="kpi-note positive">无需人工接管</text>
        </view>
      </view>

      <view class="dashboard-grid">
        <view class="network-card panel-card">
          <view class="panel-head">
            <view><text class="panel-kicker">LIVE NETWORK</text><text class="panel-title">城市供给网络</text></view>
            <view class="legend"><text class="legend-dot" /> 活跃节点</view>
          </view>
          <view class="network-map">
            <view class="map-grid" />
            <view class="route route-one" /><view class="route route-two" /><view class="route route-three" />
            <view class="map-node shanghai active"><i /><text>上海</text><small>本次链路</small></view>
            <view class="map-node beijing"><i /><text>北京</text></view>
            <view class="map-node chengdu"><i /><text>成都</text></view>
            <view class="map-node guangzhou"><i /><text>广州</text></view>
            <view class="network-center"><text>1,268</text><small>在线商家节点</small></view>
          </view>
          <view class="network-stats">
            <view><text>46</text><span>活跃城市</span></view>
            <view><text>99.97%</text><span>API 可用率</span></view>
            <view><text>182ms</text><span>P95 响应</span></view>
          </view>
        </view>

        <view class="review-card panel-card">
          <view class="panel-head">
            <view><text class="panel-kicker">AUDIT REVIEW</text><text class="panel-title">当前审计包</text></view>
            <text class="review-badge">{{ snapshot.completedSteps }}/12</text>
          </view>
          <view class="merchant-review">
            <view class="merchant-monogram">云</view>
            <view><text class="review-name">{{ snapshot.merchant?.name ?? '云和里·时令餐厅' }}</text><text class="review-meta">上海 · 江浙融合菜 · {{ snapshot.merchant?.state ?? '待建档' }}</text></view>
          </view>
          <view class="review-list">
            <view><text class="check">✓</text><span>六层授权独立留痕</span><b>{{ snapshot.consents.length }}/6</b></view>
            <view><text class="check">✓</text><span>MiniApp 版本快照</span><b>{{ snapshot.miniApp?.version ?? '—' }}</b></view>
            <view><text class="check">✓</text><span>GEO 评分证据</span><b>{{ snapshot.merchant?.geoScore ?? '—' }}</b></view>
            <view><text class="check">✓</text><span>订单风险分级</span><b>L2</b></view>
          </view>
          <ActionButton :label="ctaLabel" :busy="busy" :disabled="!ownsNextStep" tone="dark" @click="$emit('advance')" />
        </view>
      </view>

      <view class="audit-card panel-card">
        <view class="panel-head audit-heading">
          <view><text class="panel-kicker">IMMUTABLE TRAIL</text><text class="panel-title">实时审计时间线</text></view>
          <view class="audit-filters"><text class="active">全部</text><text>L2+</text><text>系统</text></view>
        </view>
        <view class="audit-table">
          <view class="audit-row audit-header"><text>时间</text><text>操作者</text><text>动作</text><text>风险</text><text>结果</text></view>
          <view v-for="event in snapshot.audits.slice(0, 6)" :key="event.id" class="audit-row">
            <text class="mono">{{ timeLabel(event.createdAt) }}</text>
            <text>{{ roleLabel(event.actorRole) }}</text>
            <text class="action-cell">{{ event.summary }}</text>
            <text><i class="risk-chip" :class="event.riskLevel.toLowerCase()">{{ event.riskLevel }}</i></text>
            <text class="success-text">✓ {{ event.result === 'APPROVED' ? '已确认' : '成功' }}</text>
          </view>
          <view v-if="snapshot.audits.length === 0" class="audit-empty">等待第一条业务操作进入不可变审计链路</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.hq-shell{display:flex;min-height:820px;background:#f3f5f9;color:var(--ink)}.hq-sidebar{display:flex;width:188px;flex:0 0 188px;flex-direction:column;padding:22px 15px;background:linear-gradient(180deg,#0b1026,#090d1e);color:#fff}.hq-logo,.side-link,.sidebar-bottom,.hq-header,.header-actions,.system-health,.success-banner,.kpi-head,.panel-head,.legend,.merchant-review,.review-list>view,.audit-filters{display:flex;align-items:center}.hq-logo{gap:9px;padding:0 5px 22px;border-bottom:1px solid rgba(255,255,255,.08)}.logo-mark{display:flex;width:33px;height:33px;align-items:center;justify-content:center;border:5px solid #675cf6;border-top-color:#35d8b1;border-radius:50%;font-weight:900}.hq-logo text,.hq-logo small,.nav-caption,.hq-eyebrow,.hq-title,.hq-subtitle,.success-banner text,.success-banner small,.kpi-label,.kpi-value,.kpi-note,.panel-kicker,.panel-title,.map-node text,.map-node small,.network-center text,.network-center small,.review-name,.review-meta{display:block}.hq-logo text{font-size:14px;font-weight:900}.hq-logo small{margin-top:2px;color:rgba(255,255,255,.38);font-size:7px;letter-spacing:.13em}.nav-group{margin-top:21px}.nav-caption{padding:0 9px 8px;color:rgba(255,255,255,.26);font-size:8px;font-weight:900;letter-spacing:.14em}.side-link{position:relative;gap:9px;min-height:39px;margin-bottom:3px;padding:0 9px;border-radius:11px;color:rgba(255,255,255,.45);font-size:10px;font-weight:750}.side-link.active{background:rgba(103,92,246,.18);color:#fff}.side-link.active i{position:absolute;width:3px;height:18px;right:0;border-radius:3px;background:#746aff}.side-icon{width:18px;color:#7a84a7;font-size:14px;text-align:center}.side-link.active .side-icon{color:#9e97ff}.side-link b{margin-left:auto;padding:3px 6px;border-radius:6px;background:#ff6b7a;color:#fff;font-size:7px}.sidebar-bottom{gap:8px;margin-top:auto;padding:14px 6px 0;border-top:1px solid rgba(255,255,255,.08)}.admin-avatar{display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:10px;background:linear-gradient(135deg,#675cf6,#3478f6);font-size:8px;font-weight:900}.sidebar-bottom text,.sidebar-bottom small{display:block}.sidebar-bottom text{font-size:9px;font-weight:800}.sidebar-bottom small{margin-top:2px;color:rgba(255,255,255,.3);font-size:7px}
.hq-main{min-width:0;flex:1;padding:25px}.hq-header{justify-content:space-between}.hq-eyebrow,.panel-kicker{color:var(--indigo);font-size:8px;font-weight:900;letter-spacing:.16em}.hq-title{margin-top:5px;font-size:25px;font-weight:950;letter-spacing:-.035em}.hq-subtitle{margin-top:5px;color:var(--muted);font-size:10px}.header-actions{gap:8px}.system-health,.date-chip{padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--muted);font-size:8px;font-weight:800}.system-health{gap:6px;color:#147b61}.system-health text{width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgba(22,185,140,.1)}
.success-banner{gap:11px;margin-top:16px;padding:12px 14px;border:1px solid #bee9db;border-radius:14px;background:linear-gradient(90deg,#edfaf6,#fff);color:#125e4b}.success-mark{display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:10px;background:var(--mint);color:#fff;font-weight:950}.success-banner text{font-size:11px;font-weight:900}.success-banner small{margin-top:3px;color:#4d806f;font-size:8px}.success-banner .cert-id{margin-left:auto;color:#138061;font-size:8px;letter-spacing:.1em}
.kpi-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr;gap:10px;margin-top:16px}.kpi-card{min-width:0;padding:14px;border:1px solid rgba(16,24,40,.05);border-radius:16px;background:#fff;box-shadow:0 7px 20px rgba(16,24,40,.04)}.kpi-card.primary{background:linear-gradient(145deg,#4f46e5,#675cf6 60%,#3478f6);color:#fff;box-shadow:0 13px 28px rgba(79,70,229,.2)}.kpi-head{justify-content:space-between}.kpi-label{color:var(--muted);font-size:8px;font-weight:800}.primary .kpi-label{color:rgba(255,255,255,.62)}.kpi-trend{padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.12);font-size:7px}.kpi-icon{display:flex;width:21px;height:21px;align-items:center;justify-content:center;border-radius:7px;font-size:9px;font-weight:950}.kpi-icon.mint{background:#e4f8f1;color:var(--mint)}.kpi-icon.blue{background:#e8f2ff;color:var(--blue)}.kpi-icon.coral{background:#fff0f2;color:var(--coral)}.kpi-value{margin-top:8px;font-size:26px;font-weight:950;letter-spacing:-.035em}.kpi-value.dark{color:var(--ink)}.kpi-value small{font-size:12px}.kpi-track{height:4px;margin-top:9px;border-radius:99px;background:rgba(255,255,255,.16);overflow:hidden}.kpi-track view{height:100%;border-radius:inherit;background:linear-gradient(90deg,#90f3d7,#fff)}.kpi-note{margin-top:6px;color:var(--muted);font-size:7px}.kpi-note.positive{color:#138061;font-weight:800}
.dashboard-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:10px;margin-top:10px}.panel-card{border:1px solid rgba(16,24,40,.05);border-radius:18px;background:#fff;box-shadow:0 8px 22px rgba(16,24,40,.04)}.network-card,.review-card{padding:16px}.panel-head{justify-content:space-between}.panel-title{margin-top:4px;font-size:14px;font-weight:900}.legend{gap:5px;color:var(--muted);font-size:7px}.legend-dot{width:6px;height:6px;border-radius:50%;background:#6258f5;box-shadow:0 0 0 4px rgba(98,88,245,.1)}.network-map{position:relative;height:158px;margin-top:9px;overflow:hidden;border-radius:13px;background:radial-gradient(circle at 60% 35%,rgba(89,84,230,.16),transparent 28%),linear-gradient(145deg,#0d1430,#111d3c)}.map-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:22px 22px}.route{position:absolute;height:1px;transform-origin:left;background:linear-gradient(90deg,rgba(103,92,246,.1),#675cf6,rgba(53,216,177,.5));box-shadow:0 0 8px rgba(103,92,246,.6)}.route-one{width:42%;left:25%;top:35%;transform:rotate(14deg)}.route-two{width:34%;left:36%;top:66%;transform:rotate(-42deg)}.route-three{width:31%;left:47%;top:30%;transform:rotate(57deg)}.map-node{position:absolute;z-index:2;color:rgba(255,255,255,.55);font-size:7px}.map-node i{display:block;width:7px;height:7px;margin-bottom:4px;border:2px solid #a9a4ff;border-radius:50%;background:#675cf6;box-shadow:0 0 0 5px rgba(103,92,246,.1),0 0 13px #675cf6}.map-node text{font-weight:850}.map-node small{margin-top:2px;color:#4bdcbb;font-size:6px}.map-node.shanghai{right:23%;bottom:27%}.map-node.beijing{right:29%;top:20%}.map-node.chengdu{left:35%;top:52%}.map-node.guangzhou{right:39%;bottom:14%}.map-node.active i{width:9px;height:9px;border-color:#75f1d2;background:#20c99f}.network-center{position:absolute;left:14px;top:14px;padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.05);color:#fff}.network-center text{font-size:15px;font-weight:950}.network-center small{margin-top:2px;color:rgba(255,255,255,.35);font-size:6px}.network-stats{display:flex;justify-content:space-between;margin-top:10px}.network-stats view{width:31%;padding:8px 9px;border-radius:10px;background:#f7f8fa}.network-stats text,.network-stats span{display:block}.network-stats text{font-size:11px;font-weight:950}.network-stats span{margin-top:3px;color:var(--muted);font-size:7px}
.review-badge{padding:6px 8px;border-radius:8px;background:#eeecff;color:var(--indigo);font-size:8px;font-weight:900}.merchant-review{gap:9px;margin-top:13px;padding:10px;border-radius:12px;background:#f7f8fa}.merchant-monogram{display:flex;width:36px;height:36px;align-items:center;justify-content:center;border-radius:11px;background:linear-gradient(145deg,#173e3d,#16b98c);color:#fff;font-size:12px;font-weight:900}.review-name{font-size:10px;font-weight:900}.review-meta{margin-top:4px;color:var(--muted);font-size:7px}.review-list{margin:10px 0}.review-list>view{min-height:31px;border-bottom:1px solid #f0f1f4;font-size:8px}.review-list .check{display:flex;width:18px;height:18px;align-items:center;justify-content:center;margin-right:7px;border-radius:6px;background:#e4f8f1;color:var(--mint);font-size:8px;font-weight:950}.review-list span{color:var(--muted)}.review-list b{margin-left:auto;font-size:8px}
.audit-card{margin-top:10px;padding:15px}.audit-heading{margin-bottom:9px}.audit-filters{gap:4px;padding:3px;border-radius:8px;background:#f5f6f8}.audit-filters text{padding:5px 7px;border-radius:6px;color:var(--muted);font-size:7px;font-weight:800}.audit-filters text.active{background:#fff;color:var(--ink);box-shadow:0 2px 6px rgba(16,24,40,.06)}.audit-table{overflow:hidden;border:1px solid #eceef2;border-radius:12px}.audit-row{display:grid;grid-template-columns:70px 72px 1fr 45px 58px;min-height:32px;align-items:center;padding:0 10px;border-top:1px solid #f0f1f4;color:var(--ink-soft);font-size:7px}.audit-row:first-child{border-top:0}.audit-header{min-height:27px;background:#f8f9fb;color:var(--muted);font-weight:850}.mono{color:var(--muted);font-variant-numeric:tabular-nums}.action-cell{overflow:hidden;padding-right:8px;text-overflow:ellipsis;white-space:nowrap}.risk-chip{padding:3px 5px;border-radius:5px;background:#eef0f4;color:var(--muted);font-style:normal;font-weight:900}.risk-chip.l2,.risk-chip.l3{background:#fff1e5;color:#b76513}.success-text{color:#148061;font-weight:850}.audit-empty{padding:20px;text-align:center;color:var(--muted);font-size:8px}
@media (max-width:760px){.hq-shell{display:block;min-height:820px}.hq-sidebar{display:none}.hq-main{padding:18px 14px 90px}.hq-header{align-items:flex-start}.hq-title{font-size:25px}.hq-subtitle{max-width:230px;line-height:1.45}.date-chip{display:none}.success-banner{align-items:flex-start}.success-banner .cert-id{display:none}.kpi-grid{grid-template-columns:1fr 1fr}.dashboard-grid{grid-template-columns:1fr}.network-map{height:180px}.audit-card{overflow:hidden}.audit-table{overflow-x:auto}.audit-row{width:620px}.header-actions{margin-top:4px}}
</style>
