<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  ProviderSlaIncidentSummary,
  ProviderSlaLevel,
  ProviderSlaOverview,
} from '@lequ/contracts'
import {
  acknowledgeProviderSla,
  fetchProviderSla,
  scanProviderSla,
} from '../../services/sla'

const overview = ref<ProviderSlaOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const sheetOpen = ref(false)
const confirmationChecked = ref(false)
const responsePlan = ref('已锁定责任人与阻塞项，将优先补齐交付材料，并在两小时内回填处理结果。')

const focus = computed(() => overview.value?.focusIncident ?? null)
const activeIncidents = computed(() =>
  (overview.value?.incidents ?? []).filter(({ status }) => status !== 'RESOLVED'),
)
const resolvedIncidents = computed(() =>
  (overview.value?.incidents ?? []).filter(({ status }) => status === 'RESOLVED'),
)

const levelMeta: Record<ProviderSlaLevel, { label: string; short: string; tone: string }> = {
  1: { label: '城市响应', short: 'L1', tone: 'level-one' },
  2: { label: '服务商介入', short: 'L2', tone: 'level-two' },
  3: { label: '总部督办', short: 'L3', tone: 'level-three' },
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/work-orders/index' }) })
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function statusLabel(status: ProviderSlaIncidentSummary['status']): string {
  if (status === 'OPEN') return '待响应'
  if (status === 'ACKNOWLEDGED') return '处置中'
  return '已关闭'
}

async function load(focusIncidentId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchProviderSla(focusIncidentId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'SLA 指挥盘加载失败'
  } finally {
    loading.value = false
  }
}

async function selectIncident(incidentId: string): Promise<void> {
  if (busy.value || focus.value?.id === incidentId) return
  busy.value = true
  try {
    overview.value = await fetchProviderSla(incidentId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '异常切换失败'
  } finally {
    busy.value = false
  }
}

async function scanNow(): Promise<void> {
  if (busy.value || !overview.value?.permissions.canScan) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await scanProviderSla()
    uni.showToast({ title: '扫描完成，升级事实已同步', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '扫描失败'
  } finally {
    busy.value = false
  }
}

function openAcknowledge(): void {
  if (!focus.value || focus.value.status === 'RESOLVED') return
  confirmationChecked.value = false
  responsePlan.value = focus.value.responsePlan
    ?? '已锁定责任人与阻塞项，将优先补齐交付材料，并在两小时内回填处理结果。'
  sheetOpen.value = true
}

function closeSheet(): void {
  if (!busy.value) sheetOpen.value = false
}

async function submitAcknowledge(): Promise<void> {
  const incident = focus.value
  if (!incident || busy.value) return
  if (!confirmationChecked.value) {
    uni.showToast({ title: '请先完成强确认', icon: 'none' })
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await acknowledgeProviderSla({
      incidentId: incident.id,
      expectedVersion: incident.version,
      responsePlan: responsePlan.value.trim(),
    })
    sheetOpen.value = false
    uni.showToast({ title: '恢复计划已进入证据链', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '确认处置失败'
  } finally {
    busy.value = false
  }
}

function openWorkOrder(): void {
  if (!focus.value) return
  uni.navigateTo({
    url: `/pages/work-orders/index?focusWorkOrderId=${encodeURIComponent(focus.value.workOrder.id)}`,
  })
}

onLoad((query) => {
  const incidentId = typeof query?.focusIncidentId === 'string'
    ? query.focusIncidentId
    : undefined
  void load(incidentId)
})
</script>

<template>
  <view class="sla-shell">
    <view class="topbar">
      <button class="back" @click="goBack">‹</button>
      <view class="brand"><view class="brand-mark">S</view><view><text>SLA Control Room</text><small>城市交付异常指挥盘</small></view></view>
      <view class="live-pill"><view /> {{ overview?.policy.scanIntervalSeconds ?? 60 }}s 自动扫描</view>
    </view>

    <scroll-view scroll-y class="viewport">
      <main class="content">
        <view v-if="errorMessage" class="error-bar"><text>{{ errorMessage }}</text><button @click="load(focus?.id)">刷新</button></view>

        <section class="hero">
          <view class="hero-grid" /><view class="radar"><view /><view /><view /><i /></view>
          <view class="hero-copy">
            <view class="eyebrow"><text>AUTOMATIC ESCALATION</text><small>{{ overview?.city.name ?? '城市交付中心' }}</small></view>
            <text class="hero-title">超时不是红点，<br />而是一条必须闭环的责任链</text>
            <text class="hero-summary">系统按 0 / 4 / 12 小时自动升级；负责人确认恢复计划，管理层只处理真正需要介入的阻塞。</text>
            <view class="hero-actions">
              <button :class="{ disabled: busy || !overview?.permissions.canScan }" @click="scanNow">{{ busy ? '扫描中…' : '立即校准 SLA' }} <text>↻</text></button>
              <small>上次扫描 {{ formatDate(overview?.lastScanAt ?? null) }}</small>
            </view>
          </view>
          <view class="hero-metrics">
            <view><small>ACTIVE</small><text>{{ overview?.metrics.active ?? '—' }}</text><b>进行中异常</b></view>
            <view class="attention"><small>UNACK</small><text>{{ overview?.metrics.unacknowledged ?? '—' }}</text><b>等待响应</b></view>
            <view class="critical"><small>LEVEL 3</small><text>{{ overview?.metrics.level3 ?? '—' }}</text><b>总部督办</b></view>
            <view><small>MAX DELAY</small><text>{{ overview?.metrics.maxOverdueHours ?? '—' }}<i>h</i></text><b>最长超时</b></view>
          </view>
        </section>

        <section class="policy-rail">
          <view v-for="item in overview?.policy.tiers" :key="item.level" :class="levelMeta[item.level].tone">
            <b>{{ levelMeta[item.level].short }}</b>
            <span><text>{{ levelMeta[item.level].label }}</text><small>超时 {{ item.afterHours }}h · {{ item.recipients.join(' / ') }}</small></span>
            <i>→</i>
          </view>
          <view class="connector"><b>OUT</b><span><text>待连接器投递</text><small>不伪造外部送达</small></span></view>
        </section>

        <view v-if="loading" class="loading-card"><view /><text>正在重建城市 SLA 责任链…</text></view>

        <template v-else>
          <view class="workspace">
            <aside class="incident-panel">
              <view class="panel-head"><view><small>INCIDENT QUEUE</small><text>异常队列</text></view><b>{{ activeIncidents.length }}</b></view>
              <scroll-view scroll-y class="incident-list">
                <button
                  v-for="item in activeIncidents"
                  :key="item.id"
                  :class="['incident-card', levelMeta[item.level].tone, { active: focus?.id === item.id }]"
                  @click="selectIncident(item.id)"
                >
                  <view class="incident-top"><b>{{ levelMeta[item.level].short }}</b><text>{{ statusLabel(item.status) }}</text></view>
                  <strong>{{ item.merchantName }}</strong>
                  <small>{{ item.workOrder.title }}</small>
                  <view class="incident-foot"><text>{{ item.owner.displayName }}</text><b>+{{ item.overdueHours }}h</b></view>
                </button>
                <view v-if="activeIncidents.length === 0" class="healthy">
                  <view>✓</view><text>当前没有未关闭异常</text><small>扫描器仍会每分钟核对截止时间。</small>
                </view>
              </scroll-view>
              <view v-if="resolvedIncidents.length" class="resolved-count">已关闭 {{ resolvedIncidents.length }} 项 <text>证据永久保留</text></view>
            </aside>

            <section v-if="focus" class="focus-area">
              <view :class="['focus-card', levelMeta[focus.level].tone]">
                <view class="focus-stripe" />
                <view class="focus-main">
                  <view class="focus-level"><small>{{ levelMeta[focus.level].short }}</small><text>{{ levelMeta[focus.level].label }}</text></view>
                  <view class="focus-copy"><view class="badges"><text>{{ statusLabel(focus.status) }}</text><text>{{ focus.workOrder.typeLabel }}</text><text>v{{ focus.version }}</text></view><strong>{{ focus.merchantName }}</strong><small>{{ focus.workOrder.title }}</small></view>
                  <view class="delay-orb"><small>OVERDUE</small><text>+{{ focus.overdueHours }}</text><b>HOURS</b></view>
                </view>
                <view class="focus-facts">
                  <view><small>责任人</small><text>{{ focus.owner.displayName }}</text></view>
                  <view><small>原截止时间</small><text>{{ formatDate(focus.dueAt) }}</text></view>
                  <view><small>当前升级对象</small><text>{{ focus.escalationTarget }}</text></view>
                  <view><small>策略版本</small><text>{{ focus.policyVersion }}</text></view>
                </view>
                <view v-if="focus.responsePlan" class="response-plan"><small>RECOVERY PLAN</small><text>{{ focus.responsePlan }}</text><b>{{ focus.acknowledgedBy }} · {{ formatDate(focus.acknowledgedAt) }}</b></view>
                <view class="focus-actions">
                  <button class="secondary" @click="openWorkOrder">查看原工单 ↗</button>
                  <button v-if="focus.status !== 'RESOLVED' && overview?.permissions.canAcknowledge" class="primary" @click="openAcknowledge">{{ focus.status === 'ACKNOWLEDGED' ? '更新本层恢复计划' : '确认接单并提交计划' }} <text>→</text></button>
                  <view v-else class="closed-action">异常已关闭，证据只读</view>
                </view>
              </view>

              <view class="detail-grid">
                <section class="timeline-card">
                  <view class="section-head"><view><small>APPEND-ONLY TRAIL</small><text>自动升级证据链</text></view><b>{{ overview?.events.length ?? 0 }}</b></view>
                  <view class="timeline">
                    <view v-for="event in overview?.events" :key="event.id">
                      <i :class="levelMeta[event.level].tone">{{ event.level }}</i>
                      <span><b>{{ event.summary }}</b><small>{{ event.actorName }} · {{ formatDate(event.createdAt) }}</small></span>
                    </view>
                  </view>
                </section>
                <section class="guardrail-card">
                  <small>OPERATING GUARDRAILS</small><text>自动化只做三件事</text>
                  <view><b>01</b><span>识别真实截止时间</span></view>
                  <view><b>02</b><span>升级责任层级并写入证据</span></view>
                  <view><b>03</b><span>生成待投递 Outbox</span></view>
                  <p>不会代替负责人填写计划，不会伪造微信或短信已经送达。</p>
                </section>
              </view>
            </section>

            <section v-else class="all-clear">
              <view class="pulse">✓</view><small>ALL SYSTEMS ON TIME</small><text>城市交付 SLA 当前健康</text><p>系统仍按 {{ overview?.policy.scanIntervalSeconds }} 秒周期自动扫描；任何超时都会建立只追加异常证据。</p>
            </section>
          </view>
        </template>
      </main>
    </scroll-view>

    <view v-if="sheetOpen" class="sheet-mask" @click="closeSheet">
      <view class="sheet" @click.stop>
        <view class="sheet-head"><view><small>STRONG CONFIRMATION</small><text>确认 {{ focus ? levelMeta[focus.level].label : '' }} 异常</text></view><button @click="closeSheet">×</button></view>
        <view class="incident-summary"><b>{{ focus?.merchantName }}</b><text>{{ focus?.workOrder.title }}</text><small>当前已超时 {{ focus?.overdueHours }} 小时 · 确认后仍会按策略继续监测和升级</small></view>
        <text class="field-label">恢复计划与明确时间点</text>
        <textarea v-model="responsePlan" maxlength="1200" placeholder="写明负责人、阻塞项、解决动作和预计完成时间" />
        <button class="check-row" :class="{ checked: confirmationChecked }" @click="confirmationChecked = !confirmationChecked"><text>{{ confirmationChecked ? '✓' : '' }}</text><view><b>我确认接手当前层级的 SLA 异常</b><small>计划、操作者、层级和版本将进入不可变证据链。</small></view></button>
        <button class="sheet-submit" :class="{ disabled: !confirmationChecked || busy }" @click="submitAcknowledge">{{ busy ? '正在写入证据链…' : '强确认并提交恢复计划' }} <text>→</text></button>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
button{margin:0;padding:0;border:0;line-height:inherit;background:transparent}button::after{display:none}.sla-shell{min-height:100vh;color:#111829;background:radial-gradient(circle at 10% 20%,rgba(98,76,225,.09),transparent 26%),linear-gradient(135deg,#f0f3f8,#f8f9fb 50%,#eef4f2);font-family:Inter,"PingFang SC",sans-serif}.topbar{height:78px;padding:0 28px;display:flex;align-items:center;gap:14px;color:#fff;background:#080f23}.back{width:40px;height:40px;border:1px solid #25304b;border-radius:13px;color:#fff;font-size:23px}.brand{display:flex;align-items:center;gap:11px}.brand-mark{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:13px;font-size:13px;font-weight:900;background:linear-gradient(140deg,#705be0,#f16c50)}.brand text,.brand small{display:block}.brand text{font-size:13px;font-weight:850}.brand small{margin-top:3px;color:#77839c;font-size:6px}.live-pill{margin-left:auto;padding:9px 12px;display:flex;align-items:center;gap:7px;border:1px solid #25304b;border-radius:99px;color:#9aa6bd;font-size:7px}.live-pill view{width:6px;height:6px;border-radius:50%;background:#25d49b;box-shadow:0 0 0 5px rgba(37,212,155,.11)}.viewport{height:calc(100vh - 78px)}.content{width:min(1392px,calc(100% - 48px));margin:auto;padding:26px 0 80px}.error-bar{margin-bottom:12px;padding:12px 15px;display:flex;justify-content:space-between;border:1px solid #ffd1d6;border-radius:12px;color:#a92e43;background:#fff1f3;font-size:8px}.hero{position:relative;min-height:270px;padding:34px 38px;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:35px;align-items:center;border-radius:29px;color:#fff;background:linear-gradient(118deg,#0b142d,#24254a 55%,#4d252b);box-shadow:0 25px 55px rgba(16,24,50,.2)}.hero-grid{position:absolute;inset:0;opacity:.11;background-image:linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px);background-size:36px 36px}.radar{position:absolute;right:410px;top:-125px;width:440px;height:440px;border:1px solid rgba(255,255,255,.08);border-radius:50%}.radar>view{position:absolute;inset:58px;border:1px solid rgba(255,255,255,.07);border-radius:50%}.radar>view:nth-child(2){inset:116px}.radar>view:nth-child(3){inset:174px}.radar i{position:absolute;left:50%;top:50%;width:190px;height:1px;background:linear-gradient(90deg,#f17455,transparent);transform-origin:left;transform:rotate(-28deg)}.hero-copy,.hero-metrics{position:relative}.eyebrow{display:flex;align-items:center;gap:8px}.eyebrow text{padding:5px 7px;border-radius:99px;color:#31120d;background:#ff7c5f;font-size:6px;font-weight:900;letter-spacing:1px}.eyebrow small{color:#8e9ab4;font-size:7px}.hero-title{display:block;margin-top:18px;font-size:30px;line-height:1.25;font-weight:900;letter-spacing:-1.2px}.hero-summary{display:block;max-width:640px;margin-top:10px;color:#a4aec2;font-size:9px;line-height:1.7}.hero-actions{margin-top:20px;display:flex;align-items:center;gap:14px}.hero-actions button{min-width:185px;padding:12px 15px;display:flex;justify-content:space-between;border-radius:12px;color:#172033;background:#fff;font-size:9px;font-weight:800}.disabled{opacity:.45}.hero-actions small{color:#7f8ba4;font-size:7px}.hero-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.hero-metrics view{min-height:89px;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:17px;background:rgba(255,255,255,.055)}.hero-metrics view.attention{background:rgba(240,173,70,.1)}.hero-metrics view.critical{background:rgba(239,90,82,.14)}.hero-metrics small,.hero-metrics b{display:block}.hero-metrics small{color:#78849f;font-size:6px;font-weight:800;letter-spacing:1px}.hero-metrics text{display:block;margin-top:7px;font-size:25px;font-weight:900}.hero-metrics text i{font-size:9px;font-style:normal}.hero-metrics b{margin-top:4px;color:#919db4;font-size:7px;font-weight:500}.policy-rail{margin-top:15px;padding:9px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;border:1px solid #e2e6eb;border-radius:18px;background:rgba(255,255,255,.87);box-shadow:0 12px 28px rgba(32,43,66,.07)}.policy-rail>view{min-height:57px;padding:10px;display:flex;align-items:center;gap:10px;border-radius:12px;background:#f5f6f8}.policy-rail>view>b{width:31px;height:31px;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#fff;font-size:8px;background:#596276}.policy-rail span{min-width:0}.policy-rail text,.policy-rail small{display:block}.policy-rail text{font-size:8px;font-weight:800}.policy-rail small{margin-top:3px;overflow:hidden;color:#9198a5;font-size:6px;white-space:nowrap;text-overflow:ellipsis}.policy-rail i{margin-left:auto;color:#c3c8d0;font-style:normal}.policy-rail .level-one>b{background:#d89931}.policy-rail .level-two>b{background:#e06f3f}.policy-rail .level-three>b{background:#df4255}.policy-rail .connector>b{background:#6953d5}.loading-card{margin-top:15px;min-height:250px;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:22px;background:#fff}.loading-card view{width:9px;height:9px;border-radius:50%;background:#ef6b4b;box-shadow:0 0 0 8px rgba(239,107,75,.12)}.loading-card text{color:#7f8797;font-size:9px}.workspace{margin-top:15px;display:grid;grid-template-columns:330px minmax(0,1fr);gap:15px}.incident-panel,.focus-card,.timeline-card,.guardrail-card,.all-clear{border:1px solid #e0e4e9;border-radius:22px;background:rgba(255,255,255,.92);box-shadow:0 15px 35px rgba(30,43,65,.07)}.incident-panel{padding:18px}.panel-head,.section-head{display:flex;align-items:center;justify-content:space-between}.panel-head small,.panel-head text,.section-head small,.section-head text{display:block}.panel-head small,.section-head small{color:#7964d7;font-size:6px;font-weight:900;letter-spacing:1.1px}.panel-head text,.section-head text{margin-top:5px;font-size:15px;font-weight:850}.panel-head>b,.section-head>b{width:27px;height:27px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#78808e;background:#f0f2f5;font-size:7px}.incident-list{height:570px;margin-top:15px}.incident-card{width:100%;margin-bottom:8px;padding:13px;border:1px solid #e4e7eb;border-radius:15px;text-align:left;background:#fafbfc}.incident-card.active{border-color:#a899ed;box-shadow:0 7px 20px rgba(94,73,202,.11);background:#f6f3ff}.incident-top{display:flex;justify-content:space-between}.incident-top b{padding:4px 6px;border-radius:7px;color:#fff;background:#d89931;font-size:7px}.incident-card.level-two .incident-top b{background:#e06f3f}.incident-card.level-three .incident-top b{background:#df4255}.incident-top text{color:#8e96a3;font-size:7px}.incident-card strong,.incident-card>small{display:block}.incident-card strong{margin-top:10px;font-size:10px}.incident-card>small{margin-top:5px;overflow:hidden;color:#818998;font-size:7px;white-space:nowrap;text-overflow:ellipsis}.incident-foot{margin-top:11px;padding-top:9px;display:flex;justify-content:space-between;border-top:1px solid #eceef1}.incident-foot text{color:#7d8594;font-size:7px}.incident-foot b{color:#d83d53;font-size:9px}.healthy{padding:60px 15px;text-align:center}.healthy view{width:49px;height:49px;margin:auto;display:flex;align-items:center;justify-content:center;border-radius:18px;color:#fff;background:#22b58c;font-size:20px}.healthy text,.healthy small{display:block}.healthy text{margin-top:15px;font-size:10px;font-weight:800}.healthy small{margin-top:6px;color:#8b93a0;font-size:7px}.resolved-count{padding:10px;border-radius:11px;color:#66707f;background:#f3f5f7;font-size:7px}.resolved-count text{float:right;color:#9aa1ab}.focus-area{min-width:0}.focus-card{position:relative;overflow:hidden}.focus-stripe{height:5px;background:linear-gradient(90deg,#d99d3b,#ef6e4d)}.focus-card.level-three .focus-stripe{background:linear-gradient(90deg,#df4056,#9b2e60)}.focus-main{padding:24px;display:flex;align-items:center;gap:18px;background:linear-gradient(115deg,#111a34,#252649 68%,#51252d);color:#fff}.focus-level{width:70px;height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:22px;background:linear-gradient(145deg,#f3a746,#e66842)}.focus-card.level-three .focus-level{background:linear-gradient(145deg,#f05d53,#b62e5a)}.focus-level small{font-size:18px;font-weight:900}.focus-level text{margin-top:3px;font-size:6px}.focus-copy{min-width:0}.badges{display:flex;gap:6px}.badges text{padding:4px 6px;border:1px solid rgba(255,255,255,.12);border-radius:99px;color:#a9b3c9;font-size:6px}.focus-copy strong,.focus-copy>small{display:block}.focus-copy strong{margin-top:10px;font-size:17px}.focus-copy>small{margin-top:5px;color:#9da8be;font-size:8px}.delay-orb{width:82px;height:82px;margin-left:auto;flex-basis:82px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:50%}.delay-orb small,.delay-orb b{color:#8e9ab2;font-size:5px}.delay-orb text{margin:4px 0;font-size:19px;font-weight:900}.focus-facts{padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.focus-facts view{padding:12px;border-radius:12px;background:#f5f6f8}.focus-facts small,.focus-facts text{display:block}.focus-facts small{color:#989faa;font-size:6px}.focus-facts text{margin-top:5px;overflow:hidden;font-size:8px;font-weight:750;white-space:nowrap;text-overflow:ellipsis}.response-plan{margin:0 16px;padding:14px;border:1px solid #bde8db;border-radius:13px;background:#edf9f5}.response-plan small,.response-plan text,.response-plan b{display:block}.response-plan small{color:#149474;font-size:6px;font-weight:900;letter-spacing:1px}.response-plan text{margin-top:7px;font-size:8px;line-height:1.6}.response-plan b{margin-top:7px;color:#708079;font-size:6px}.focus-actions{padding:16px;display:flex;gap:8px}.focus-actions button,.closed-action{min-height:45px;display:flex;align-items:center;justify-content:center;border-radius:12px;font-size:8px;font-weight:800}.focus-actions .secondary{width:145px;border:1px solid #dfe3e8;color:#626c7b}.focus-actions .primary{flex:1;justify-content:space-between;padding:0 17px;color:#fff;background:linear-gradient(100deg,#e66c43,#db3f59)}.closed-action{flex:1;color:#178366;background:#ebf7f3}.detail-grid{margin-top:15px;display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:15px}.timeline-card,.guardrail-card{padding:19px}.timeline{margin-top:17px}.timeline>view{position:relative;padding:0 0 17px 37px;display:flex;gap:10px}.timeline>view:not(:last-child)::before{content:"";position:absolute;left:13px;top:25px;bottom:0;width:1px;background:#e1e4e9}.timeline i{position:absolute;left:0;top:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:9px;color:#fff;background:#d89a36;font-size:7px;font-style:normal;font-weight:900}.timeline i.level-two{background:#e06f3f}.timeline i.level-three{background:#df4255}.timeline span b,.timeline span small{display:block}.timeline span b{font-size:8px}.timeline span small{margin-top:5px;color:#939aa6;font-size:6px}.guardrail-card>small{color:#7660d3;font-size:6px;font-weight:900;letter-spacing:1px}.guardrail-card>text{display:block;margin:7px 0 14px;font-size:13px;font-weight:850}.guardrail-card>view{margin-top:8px;padding:10px;display:flex;align-items:center;gap:9px;border-radius:11px;background:#f4f5f7}.guardrail-card>view b{color:#df5360;font-size:7px}.guardrail-card>view span{font-size:7px}.guardrail-card p{margin:12px 0 0;color:#89919f;font-size:7px;line-height:1.6}.all-clear{min-height:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.pulse{width:70px;height:70px;display:flex;align-items:center;justify-content:center;border-radius:25px;color:#fff;background:#20b589;box-shadow:0 0 0 14px rgba(32,181,137,.1);font-size:27px}.all-clear small{margin-top:25px;color:#1b9c78;font-size:6px;font-weight:900;letter-spacing:1.2px}.all-clear text{margin-top:8px;font-size:22px;font-weight:900}.all-clear p{max-width:420px;color:#8c94a2;font-size:8px;line-height:1.7}.sheet-mask{position:fixed;z-index:30;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(4,9,22,.62);backdrop-filter:blur(9px)}.sheet{width:min(650px,100%);padding:21px;border-radius:25px;background:#fff;box-shadow:0 28px 80px rgba(8,14,33,.3)}.sheet-head{display:flex;align-items:center;justify-content:space-between}.sheet-head small,.sheet-head text{display:block}.sheet-head small{color:#df4b59;font-size:6px;font-weight:900;letter-spacing:1px}.sheet-head text{margin-top:5px;font-size:16px;font-weight:850}.sheet-head button{width:34px;height:34px;border-radius:11px;color:#747c8c;font-size:20px;background:#f1f3f6}.incident-summary{margin-top:16px;padding:13px;border-radius:13px;background:#fff3ef}.incident-summary b,.incident-summary text,.incident-summary small{display:block}.incident-summary b{font-size:9px}.incident-summary text{margin-top:5px;font-size:8px}.incident-summary small{margin-top:6px;color:#a36b61;font-size:7px}.field-label{display:block;margin:15px 0 7px;color:#7d8594;font-size:7px;font-weight:800}.sheet textarea{width:100%;height:105px;padding:12px;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:13px;font-size:9px;background:#f8f9fb}.check-row{width:100%;margin-top:13px;padding:12px;display:flex;align-items:center;gap:10px;border-radius:13px;text-align:left;background:#f4f6f8}.check-row>text{width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:2px solid #cdd2da;border-radius:7px;color:#fff;font-size:9px}.check-row.checked>text{border-color:#df4b59;background:#df4b59}.check-row b,.check-row small{display:block}.check-row b{font-size:8px}.check-row small{margin-top:4px;color:#8b93a1;font-size:6px}.sheet-submit{width:100%;margin-top:10px;padding:14px 16px;display:flex;justify-content:space-between;border-radius:13px;color:#fff;background:linear-gradient(105deg,#e46b42,#d83c59);font-size:9px;font-weight:850}.sheet-submit.disabled{opacity:.45}
@media(max-width:760px){.topbar{height:70px;padding:0 14px}.live-pill{font-size:0}.viewport{height:calc(100vh - 70px)}.content{width:calc(100% - 24px);padding-top:13px}.hero{min-height:420px;padding:22px 19px;display:block}.radar{right:-230px;top:-80px}.hero-title{font-size:24px}.hero-metrics{margin-top:20px}.hero-metrics view{min-height:76px;padding:12px}.policy-rail{overflow-x:auto;display:flex}.policy-rail>view{min-width:210px}.workspace{grid-template-columns:1fr}.incident-list{height:auto;max-height:390px}.focus-main{padding:18px 14px;gap:11px}.focus-level{width:52px;height:52px;flex-basis:52px;border-radius:17px}.focus-level small{font-size:13px}.focus-copy strong{font-size:14px}.delay-orb{width:62px;height:62px;flex-basis:62px}.delay-orb text{font-size:15px}.focus-facts{grid-template-columns:repeat(2,1fr)}.detail-grid{grid-template-columns:1fr}.focus-actions{flex-wrap:wrap}.focus-actions .secondary{width:100%}.sheet-mask{padding:8px}.sheet{padding:17px;border-radius:23px}}
</style>
