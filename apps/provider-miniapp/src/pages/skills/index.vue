<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  GeoWorkspaceSummary,
  SkillNetworkOverview,
  SkillNetworkVersionSummary,
  SkillSuiteStatus,
} from '@lequ/contracts'
import { advanceSkillProject, createSkillProject, fetchSkillNetwork, invokeDemoSkill } from '../../services/skills'

const overview = ref<SkillNetworkOverview | null>(null)
const loading = ref(true)
const busy = ref(false)
const invokingId = ref('')
const errorMessage = ref('')
const selectedSkillId = ref('')

const statusLabels: Record<SkillSuiteStatus, string> = {
  DRAFT: '草稿', GENERATED: 'Manifest 已生成', TESTED: '测试通过',
  CERT_PENDING: '等待认证', CERTIFIED: '已认证', GRAY: '灰度中', ONLINE: '已上线', PAUSED: '已暂停',
}
const stages: Array<{ key: SkillSuiteStatus; label: string }> = [
  { key: 'DRAFT', label: '建档' }, { key: 'GENERATED', label: '生成' },
  { key: 'TESTED', label: '测试' }, { key: 'CERT_PENDING', label: '认证' },
  { key: 'CERTIFIED', label: '通过' }, { key: 'GRAY', label: '灰度' },
  { key: 'ONLINE', label: '上线' },
]
const skillLabels: Record<string, { title: string; icon: string; note: string }> = {
  get_menu: { title: '结构化菜单', icon: '菜', note: '读取菜品、价格与过敏原' },
  find_table: { title: '桌位查询', icon: '桌', note: '查询时段，不创建交易' },
  reserve_table: { title: '订座草稿', icon: '订', note: 'L2 强确认后幂等创建' },
}

const focusSuite = computed(() => overview.value?.focusSuite ?? null)
const selectedSkill = computed(() => overview.value?.skills.find((skill) => skill.id === selectedSkillId.value) ?? overview.value?.skills[0] ?? null)
const stageIndex = computed(() => {
  const status = focusSuite.value?.status
  if (!status) return 0
  if (status === 'PAUSED') return stages.length - 1
  return Math.max(0, stages.findIndex((stage) => stage.key === status))
})
const canAdvance = computed(() => Boolean(
  focusSuite.value && ['DRAFT', 'GENERATED', 'TESTED'].includes(focusSuite.value.status) && !busy.value,
))
const actionLabel = computed(() => {
  if (busy.value) return '正在执行并保存证据…'
  switch (focusSuite.value?.status) {
    case 'DRAFT': return '生成三项标准 Manifest'
    case 'GENERATED': return '运行 12 组认证测试'
    case 'TESTED': return '提交总部认证'
    case 'CERT_PENDING': return '等待总部认证权限'
    case 'CERTIFIED': return '已认证 · 等待灰度'
    case 'GRAY': return '灰度验证中'
    case 'ONLINE': return 'Registry 已上线'
    case 'PAUSED': return '调用已暂停'
    default: return '选择 Skill 套件'
  }
})
const selectedTests = computed(() => overview.value?.tests.filter((test) => test.skillVersionId === selectedSkill.value?.id) ?? [])

async function load(focusId?: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchSkillNetwork(focusId)
    selectedSkillId.value = overview.value.skills[0]?.id ?? ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载 Skill Network 失败'
  } finally {
    loading.value = false
  }
}

async function selectSuite(suiteId: string): Promise<void> {
  if (suiteId === focusSuite.value?.id || busy.value) return
  await load(suiteId)
}

async function startSuite(workspace: GeoWorkspaceSummary): Promise<void> {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await createSkillProject(workspace)
    selectedSkillId.value = ''
    uni.showToast({ title: 'Skill 套件已创建', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建失败'
  } finally {
    busy.value = false
  }
}

async function advance(): Promise<void> {
  if (!focusSuite.value || !canAdvance.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    overview.value = await advanceSkillProject(focusSuite.value)
    selectedSkillId.value = overview.value.skills[0]?.id ?? ''
    uni.showToast({ title: '已完成并留痕', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '执行失败'
  } finally {
    busy.value = false
  }
}

async function invoke(skill: SkillNetworkVersionSummary): Promise<void> {
  if (!focusSuite.value || invokingId.value) return
  invokingId.value = skill.id
  errorMessage.value = ''
  try {
    overview.value = await invokeDemoSkill(focusSuite.value, skill)
    uni.showToast({ title: '调用成功并校验', icon: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '调用失败'
  } finally {
    invokingId.value = ''
  }
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function schemaPreview(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

function goBack(): void {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

onLoad((query) => {
  const focusId = typeof query?.focusSuiteId === 'string' ? query.focusSuiteId : undefined
  void load(focusId)
})
</script>

<template>
  <view class="skill-shell">
    <view class="topbar"><button class="back" @click="goBack">←</button><view class="logo">S</view><view class="brand"><text>SKILL NETWORK</text><small>Merchant Capability Registry</small></view><view class="network-live"><i /> Registry online</view></view>
    <scroll-view scroll-y class="viewport">
      <view class="content">
        <view class="page-head"><view><text class="eyebrow">E4 · TRUSTED CAPABILITY LAYER</text><text class="page-title">让商家能力，可发现、可测试、可授权、可回滚</text><text class="page-copy">Manifest 是能力合同；认证测试、风险策略、强确认和结果校验共同决定它能否进入 Agent 运行时。</text></view><view class="trust-card"><text>TRUST CHAIN</text><small>Intent → Policy → Discovery → Consent → Invoke → Validate → Audit</small></view></view>

        <view v-if="errorMessage" class="error-bar"><text>{{ errorMessage }}</text><button @click="load(focusSuite?.id)">重试</button></view>
        <view v-if="loading && !overview" class="loading-card">正在同步 Registry、Schema 测试与运行日志…</view>

        <template v-else-if="overview">
          <view class="metrics"><view class="metric dark"><small>Skill 套件</small><text>{{ overview.counts.total }}</text><view>城市交付范围</view></view><view class="metric"><small>待测试</small><text class="blue">{{ overview.counts.pendingTest }}</text><view>Manifest / Schema</view></view><view class="metric"><small>认证流水线</small><text class="violet">{{ overview.counts.certification }}</text><view>权限门禁进行中</view></view><view class="metric"><small>在线 Registry</small><text class="mint">{{ overview.counts.online * 3 }}</text><view>可发现标准能力</view></view></view>

          <view class="workspace-layout">
            <view class="sidebar">
              <view class="panel queue"><view class="panel-head"><view><small>SUITES</small><text>商家能力套件</text></view><b>{{ overview.suites.length }}</b></view><button v-for="suite in overview.suites" :key="suite.id" class="suite-row" :class="{active:suite.id===focusSuite?.id}" @click="selectSuite(suite.id)"><view class="suite-avatar">{{ suite.merchantName.slice(0,1) }}</view><view><view><text>{{ suite.merchantName }}</text><b>{{ statusLabels[suite.status] }}</b></view><small>{{ suite.nextAction }}</small></view></button><view v-if="!overview.suites.length" class="empty">等待 GEO 观测完成后生成商家能力。</view></view>
              <view class="panel eligible"><view class="panel-head"><view><small>READY TO BUILD</small><text>GEO 已就绪</text></view><b>{{ overview.eligibleGeoWorkspaces.length }}</b></view><view v-for="workspace in overview.eligibleGeoWorkspaces" :key="workspace.id" class="eligible-row"><view><text>{{ workspace.merchantName }}</text><small>GEO {{ workspace.score }} · 事实可引用</small></view><button @click="startSuite(workspace)">创建</button></view><view v-if="!overview.eligibleGeoWorkspaces.length" class="empty">暂无新的观测中商家</view></view>
            </view>

            <view class="main-column">
              <template v-if="focusSuite">
                <view class="hero"><view class="hero-grid" /><view><view class="hero-tags"><text>{{ statusLabels[focusSuite.status] }}</text><text>Suite v{{ focusSuite.version }}</text><text>3 CAPABILITIES</text></view><text class="merchant-name">{{ focusSuite.merchantName }}</text><small>{{ focusSuite.nextAction }}</small></view><view class="hero-metric"><small>调用成功率</small><text>{{ overview.metrics.successRate }}%</text><view>P95 {{ overview.metrics.p95LatencyMs }}ms</view></view><view class="hero-metric"><small>可用率</small><text>{{ overview.metrics.availability }}%</text><view>投诉 {{ overview.metrics.complaintRate }}%</view></view></view>

                <view class="panel pipeline"><view class="panel-head"><view><small>CERTIFICATION PIPELINE</small><text>生成、测试与分级发布</text></view><b>默认拒绝</b></view><view class="stage-track"><view v-for="(stage,index) in stages" :key="stage.key" class="stage" :class="{done:index<stageIndex,current:index===stageIndex}"><i>{{ index<stageIndex?'✓':index+1 }}</i><text>{{ stage.label }}</text></view></view><button class="primary" :disabled="!canAdvance" :class="{disabled:!canAdvance}" @click="advance"><view><small>NEXT GOVERNED ACTION</small><text>{{ actionLabel }}</text></view><b>→</b></button><view class="guardrails"><text>✓ JSON Schema</text><text>✓ Scope 最小化</text><text>✓ L2 强确认</text><text>✓ 幂等与结果校验</text><text>✓ 审计 / Outbox</text></view></view>

                <view class="skill-grid">
                  <view v-for="skill in overview.skills" :key="skill.id" class="skill-card" :class="{active:selectedSkill?.id===skill.id}" @click="selectedSkillId=skill.id">
                    <view class="skill-icon">{{ skillLabels[skill.name]?.icon }}</view>
                    <view class="skill-title"><text>{{ skill.name }}</text><small>{{ skillLabels[skill.name]?.title }} · {{ skill.version }}</small></view>
                    <view class="maturity">{{ skill.maturity }}</view>
                    <view class="skill-note">{{ skillLabels[skill.name]?.note }}</view>
                    <view class="skill-tags"><text>{{ skill.manifest.riskLevel }}</text><text>{{ skill.manifest.approvalRequired?'需确认':'无需确认' }}</text><text>{{ skill.status }}</text></view>
                    <view class="skill-sla"><small>SLA {{ skill.manifest.slaMs }}ms · Retry {{ skill.manifest.retryMax }}</small><b>{{ shortHash(skill.schemaHash) }}</b></view>
                    <button v-if="skill.status==='ONLINE'" class="invoke" :disabled="Boolean(invokingId)" @click.stop="invoke(skill)">{{ invokingId===skill.id?'调用中…':'沙盒调用' }}</button>
                  </view>
                  <view v-if="!overview.skills.length" class="panel empty large">生成后展示三项标准能力和完整 Manifest。</view>
                </view>

                <view v-if="selectedSkill" class="builder-grid">
                  <view class="panel manifest"><view class="panel-head"><view><small>SKILL MANIFEST</small><text>{{ selectedSkill.name }}@{{ selectedSkill.version }}</text></view><b>{{ selectedSkill.manifest.riskLevel }}</b></view><view class="manifest-meta"><view><small>Skill ID</small><text>{{ selectedSkill.manifest.skillId }}</text></view><view><small>Adapter</small><text>{{ selectedSkill.manifest.adapter }}</text></view><view><small>Scopes</small><text>{{ selectedSkill.manifest.scopes.join(' · ') }}</text></view><view><small>Policy</small><text>{{ selectedSkill.manifest.approvalRequired?'用户强确认':'低风险直接读取' }} · Timeout {{ selectedSkill.manifest.timeoutMs }}ms</text></view></view><view class="schema-columns"><view><text>INPUT SCHEMA</text><scroll-view scroll-y><pre>{{ schemaPreview(selectedSkill.manifest.inputSchema) }}</pre></scroll-view></view><view><text>OUTPUT SCHEMA</text><scroll-view scroll-y><pre>{{ schemaPreview(selectedSkill.manifest.outputSchema) }}</pre></scroll-view></view></view></view>
                  <view class="panel tests"><view class="panel-head"><view><small>SCHEMA TEST CENTER</small><text>认证测试</text></view><b>{{ selectedTests.length }}/4</b></view><view v-for="test in selectedTests" :key="test.id" class="test-row"><view class="test-check">✓</view><view><text>{{ test.testType }}</text><small>{{ test.detail }}</small></view><view><b>{{ test.latencyMs }}ms</b><small>{{ test.assertionCount }} assertions</small></view></view><view v-if="!selectedTests.length" class="empty">运行测试后展示 Schema、适配器与风险策略证据。</view></view>
                </view>

                <view class="runtime-grid">
                  <view class="panel runtime"><view class="panel-head"><view><small>RUNTIME MONITORING</small><text>调用质量</text></view><b>P95 {{ overview.metrics.p95LatencyMs }}ms</b></view><view class="quality-grid"><view><small>成功率</small><text>{{ overview.metrics.successRate }}%</text><i><b :style="{width:`${overview.metrics.successRate}%`}" /></i></view><view><small>可用率</small><text>{{ overview.metrics.availability }}%</text><i><b :style="{width:`${overview.metrics.availability}%`}" /></i></view><view><small>退款率</small><text>{{ overview.metrics.refundRate }}%</text><i><b style="width:0" /></i></view><view><small>投诉率</small><text>{{ overview.metrics.complaintRate }}%</text><i><b style="width:0" /></i></view></view><view class="invocation-list"><view v-for="invocation in overview.invocations" :key="invocation.id"><view class="runtime-dot" /><view><text>{{ invocation.skillName }} · {{ invocation.intent }}</text><small>{{ invocation.status }} · {{ invocation.latencyMs }}ms · attempt {{ invocation.attemptCount }} · schema {{ invocation.resultValid?'valid':'invalid' }}</small></view><b>{{ invocation.approvalConfirmed?'已确认':'低风险' }}</b></view><view v-if="!overview.invocations.length" class="empty">上线后可从能力卡执行受控沙盒调用。</view></view></view>
                  <view class="panel events"><view class="panel-head"><view><small>AUDIT EVIDENCE</small><text>不可变事件</text></view><b>{{ overview.events.length }}</b></view><view class="event-list"><view v-for="event in overview.events" :key="event.id"><i /><view><text>{{ event.summary }}</text><small>#{{ event.sequence }} · {{ event.type }} · {{ shortDate(event.createdAt) }}</small></view></view></view></view>
                </view>
              </template>
              <view v-else class="panel no-focus"><view>S</view><text>从 GEO 已就绪商家创建能力套件</text><small>三项 Skill 会共享实体事实，但各自保留独立 Schema、风险策略、认证与调用证据。</small></view>
            </view>
          </view>
        </template>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
.skill-shell{min-height:100vh;background:#f5f5fa;color:#18182c}.topbar{height:70px;padding:0 28px;display:flex;align-items:center;border-bottom:1px solid #e8e7f0;background:rgba(251,251,254,.94);backdrop-filter:blur(18px)}.back{width:38px;height:38px;margin:0 12px 0 0;border:1px solid #deddea;border-radius:12px;background:#fff;color:#393856;font-size:19px}.logo{width:35px;height:35px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(145deg,#40328f,#7c5ce7);color:#fff;font-weight:950;box-shadow:0 9px 22px rgba(92,70,190,.25)}.brand{margin-left:10px}.brand text,.brand small,.page-title,.page-copy,.metric text,.metric small,.metric view,.panel-head text,.panel-head small,.suite-row text,.suite-row small,.eligible-row text,.eligible-row small,.merchant-name,.hero>view>small,.hero-metric text,.hero-metric small,.hero-metric view,.skill-title text,.skill-title small,.skill-note,.skill-sla small,.skill-sla b,.manifest-meta small,.manifest-meta text,.schema-columns>view>text,.test-row text,.test-row small,.quality-grid small,.quality-grid text,.invocation-list text,.invocation-list small,.event-list text,.event-list small,.no-focus text,.no-focus small{display:block}.brand text{font-size:12px;font-weight:950;letter-spacing:.12em}.brand small{margin-top:2px;color:#9794aa;font-size:7px}.network-live{margin-left:auto;padding:8px 11px;border:1px solid #e2e1eb;border-radius:999px;background:#fff;color:#68657b;font-size:8px}.network-live i{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#24b58a;box-shadow:0 0 0 4px rgba(36,181,138,.1)}.viewport{height:calc(100vh - 70px)}.content{width:min(1480px,calc(100% - 40px));margin:0 auto;padding:34px 0 70px}.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:25px}.eyebrow{display:block;color:#6854cf;font-size:9px;font-weight:950;letter-spacing:.18em}.page-title{margin-top:8px;font-size:29px;font-weight:950;letter-spacing:-1px}.page-copy{max-width:770px;margin-top:9px;color:#77758a;font-size:10px;line-height:1.7}.trust-card{max-width:390px;padding:12px 15px;border:1px solid #e0dcf6;border-radius:15px;background:#f1effc}.trust-card text{display:block;color:#5d48c5;font-size:8px;font-weight:950;letter-spacing:.1em}.trust-card small{display:block;margin-top:4px;color:#75718d;font-size:7px}.error-bar,.loading-card{margin-top:20px;padding:15px 18px;border-radius:15px}.error-bar{display:flex;justify-content:space-between;background:#fff0f2;color:#a63f52}.error-bar button{padding:7px 12px;border-radius:9px;background:#fff;color:#a63f52;font-size:8px}.loading-card{background:#fff;color:#78768b}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}.metric{min-height:116px;padding:17px;border:1px solid #e4e3ed;border-radius:20px;background:#fff;box-shadow:0 10px 28px rgba(36,31,73,.045)}.metric.dark{border-color:#29244e;background:linear-gradient(145deg,#201b43,#342b70);color:#fff}.metric small{color:#8c899d;font-size:8px;font-weight:850}.metric.dark small{color:#aaa3d0}.metric text{margin-top:8px;font-size:30px;font-weight:950}.metric view{margin-top:7px;color:#9996a7;font-size:7px}.metric.dark view{color:#b4afd1}.metric .blue{color:#377cf3}.metric .violet{color:#765de0}.metric .mint{color:#18a77f}.workspace-layout{display:grid;grid-template-columns:292px minmax(0,1fr);gap:14px;margin-top:14px}.sidebar,.main-column{display:flex;min-width:0;flex-direction:column;gap:14px}.panel{overflow:hidden;border:1px solid #e4e3ed;border-radius:22px;background:#fff;box-shadow:0 12px 34px rgba(36,31,73,.045)}.panel-head{min-height:69px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eeedf3}.panel-head small{color:#6d58d2;font-size:7px;font-weight:950;letter-spacing:.14em}.panel-head text{margin-top:4px;font-size:14px;font-weight:950}.panel-head>b{padding:6px 9px;border-radius:9px;background:#f0eefb;color:#6450c4;font-size:7px}.suite-row{width:100%;padding:13px 14px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #efedf4;background:#fff;text-align:left}.suite-row.active{background:linear-gradient(90deg,#f2f0fc,#fff);box-shadow:inset 3px 0 #715bd6}.suite-avatar{width:35px;height:35px;display:flex;flex:0 0 35px;align-items:center;justify-content:center;border-radius:12px;background:#ece9fb;color:#6652c6;font-size:12px;font-weight:900}.suite-row>view:last-child{min-width:0;flex:1}.suite-row>view>view{display:flex;align-items:center;gap:5px}.suite-row text{overflow:hidden;font-size:9px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}.suite-row b{margin-left:auto;color:#6d58d2;font-size:6px}.suite-row small{margin-top:5px;overflow:hidden;color:#9491a2;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.eligible-row{padding:13px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #eeedf3}.eligible-row>view{min-width:0;flex:1}.eligible-row text{font-size:9px;font-weight:900}.eligible-row small{margin-top:4px;color:#9995a6;font-size:7px}.eligible-row button{padding:8px 11px;border-radius:9px;background:#332b6c;color:#fff;font-size:7px}.empty{padding:22px 18px;color:#9a97a8;font-size:8px;line-height:1.6;text-align:center}.hero{position:relative;overflow:hidden;min-height:186px;padding:26px 28px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:15px;border-radius:25px;background:linear-gradient(135deg,#17142f,#2b245d 55%,#4a3498);color:#fff;box-shadow:0 23px 48px rgba(47,35,105,.24)}.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(90deg,transparent,#000)}.hero>view{position:relative}.hero-tags{display:flex;gap:7px}.hero-tags text{padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.07);color:#d1ccec;font-size:7px}.merchant-name{margin-top:13px;font-size:27px;font-weight:950}.hero>view>small{margin-top:7px;color:#b8b2d5;font-size:8px}.hero-metric{min-width:125px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(9,7,28,.25)}.hero-metric small{color:#aaa4ca;font-size:7px}.hero-metric text{margin-top:5px;font-size:24px;font-weight:950}.hero-metric view{margin-top:4px;color:#9f98c4;font-size:7px}.stage-track{padding:20px 24px 10px;display:grid;grid-template-columns:repeat(7,1fr)}.stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;color:#a3a0af}.stage:not(:last-child)::after{content:'';position:absolute;z-index:0;top:13px;left:calc(50% + 13px);right:calc(-50% + 13px);height:2px;background:#e7e5ee}.stage.done:not(:last-child)::after{background:#745fd9}.stage i{position:relative;z-index:1;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid #dfdde8;border-radius:50%;background:#fff;font-size:7px;font-style:normal;font-weight:900}.stage.done i{border-color:#715bd5;background:#715bd5;color:#fff}.stage.current i{border-color:#2f285f;color:#2f285f;box-shadow:0 0 0 5px rgba(97,76,190,.08)}.stage text{font-size:7px;font-weight:800}.primary{width:calc(100% - 36px);min-height:65px;margin:12px 18px 0;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-radius:17px;background:linear-gradient(135deg,#332b70,#755bd7);color:#fff;text-align:left;box-shadow:0 13px 25px rgba(92,69,193,.22)}.primary.disabled{opacity:.42}.primary small,.primary text{display:block}.primary small{color:#beb7e5;font-size:7px;letter-spacing:.12em}.primary text{margin-top:4px;font-size:13px;font-weight:950}.primary>b{font-size:21px}.guardrails{padding:12px 19px 17px;display:flex;gap:14px;flex-wrap:wrap;color:#77738b;font-size:7px}.skill-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.skill-card{position:relative;min-height:208px;padding:17px;border:1px solid #e5e3ed;border-radius:20px;background:#fff;color:#1d1b32;text-align:left;box-shadow:0 10px 28px rgba(41,34,85,.045)}.skill-card.active{border-color:#8e7be0;box-shadow:0 0 0 3px rgba(112,90,210,.08),0 14px 32px rgba(41,34,85,.07)}.skill-icon{width:39px;height:39px;display:flex;align-items:center;justify-content:center;border-radius:13px;background:#ece9fb;color:#654ec7;font-size:12px;font-weight:950}.skill-title{margin-top:12px}.skill-title text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;font-weight:900}.skill-title small{margin-top:3px;color:#908d9e;font-size:7px}.maturity{position:absolute;right:16px;top:17px;padding:6px 8px;border-radius:9px;background:#2f2864;color:#fff;font-size:8px;font-weight:950}.skill-note{margin-top:12px;color:#716e80;font-size:8px}.skill-tags{margin-top:10px;display:flex;gap:5px;flex-wrap:wrap}.skill-tags text{padding:5px 7px;border-radius:7px;background:#f2f0f7;color:#625e73;font-size:6px}.skill-sla{margin-top:12px;padding-top:10px;border-top:1px solid #eeedf3;display:flex;align-items:center;justify-content:space-between}.skill-sla small{color:#8f8ba0;font-size:6px}.skill-sla b{color:#6b56cb;font-size:6px}.invoke{width:100%;height:34px;margin-top:11px;border-radius:10px;background:#2f2865;color:#fff;font-size:8px}.large{grid-column:1/-1}.builder-grid,.runtime-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:13px}.manifest-meta{padding:14px 17px;display:grid;grid-template-columns:1fr 1fr;gap:11px}.manifest-meta>view{min-width:0;padding:10px;border-radius:12px;background:#f6f5fa}.manifest-meta small{color:#9894a6;font-size:6px}.manifest-meta text{margin-top:4px;overflow:hidden;font-size:7px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.schema-columns{padding:0 17px 17px;display:grid;grid-template-columns:1fr 1fr;gap:9px}.schema-columns>view{overflow:hidden;border-radius:14px;background:#151329}.schema-columns>view>text{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);color:#978bea;font-size:6px;font-weight:950;letter-spacing:.11em}.schema-columns scroll-view{height:188px}.schema-columns pre{margin:0;padding:12px;color:#c9c5df;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:6px;line-height:1.7;white-space:pre-wrap}.test-row{padding:12px 15px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;border-bottom:1px solid #eeedf3}.test-check{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:#e7f7f1;color:#168563;font-size:9px;font-weight:950}.test-row>view:nth-child(2){min-width:0}.test-row text{font-size:8px;font-weight:900}.test-row small{margin-top:4px;color:#9390a0;font-size:6px}.test-row>view:last-child{text-align:right}.test-row>view:last-child b{color:#6652c3;font-size:7px}.quality-grid{padding:15px;display:grid;grid-template-columns:1fr 1fr;gap:9px}.quality-grid>view{padding:12px;border-radius:14px;background:#f6f5fa}.quality-grid small{color:#8f8c9d;font-size:6px}.quality-grid text{margin-top:4px;font-size:18px;font-weight:950}.quality-grid i{height:4px;margin-top:8px;display:block;border-radius:99px;background:#e4e1ec;overflow:hidden}.quality-grid i b{height:100%;display:block;border-radius:99px;background:linear-gradient(90deg,#715bd7,#24b58a)}.invocation-list{padding:0 16px 15px}.invocation-list>view{padding:9px 0;display:flex;align-items:flex-start;gap:9px;border-top:1px solid #eeedf3}.runtime-dot{width:7px;height:7px;margin-top:3px;flex:0 0 7px;border-radius:50%;background:#25b58b}.invocation-list>view>view:nth-child(2){min-width:0;flex:1}.invocation-list text{font-size:7px;font-weight:850}.invocation-list small{margin-top:4px;color:#9290a0;font-size:6px}.invocation-list>view>b{color:#6853c8;font-size:6px}.event-list{max-height:350px;padding:13px 17px;overflow:auto}.event-list>view{position:relative;padding:0 0 14px 17px}.event-list>view>i{position:absolute;left:0;top:3px;width:7px;height:7px;border:2px solid #fff;border-radius:50%;background:#705bd5;box-shadow:0 0 0 1px #705bd5}.event-list>view:not(:last-child)::after{content:'';position:absolute;left:3px;top:12px;bottom:0;width:1px;background:#e0ddeb}.event-list text{font-size:7px;font-weight:850}.event-list small{margin-top:4px;color:#9692a3;font-size:6px}.no-focus{min-height:420px;padding:80px 25px;text-align:center}.no-focus>view{width:70px;height:70px;margin:0 auto 17px;display:flex;align-items:center;justify-content:center;border-radius:23px;background:#ebe8fb;color:#6450c2;font-size:28px;font-weight:950}.no-focus text{font-size:16px;font-weight:950}.no-focus small{max-width:430px;margin:9px auto;color:#908da0;font-size:8px;line-height:1.7}
.page-head>view:first-child{min-width:0;flex:1}.page-title{width:100%;max-width:860px;line-height:1.18;white-space:normal;word-break:break-all}.trust-card{flex:0 0 340px}
@media(max-width:950px){.content{width:calc(100% - 24px)}.page-head{display:block}.trust-card{margin-top:12px}.metrics{grid-template-columns:repeat(2,1fr)}.workspace-layout{grid-template-columns:1fr}.sidebar{display:grid;grid-template-columns:1fr 1fr}.hero{grid-template-columns:1fr 1fr}.hero>view:first-of-type{grid-column:1/-1}.skill-grid{grid-template-columns:1fr}.builder-grid,.runtime-grid{grid-template-columns:1fr}}
@media(max-width:520px){.topbar{height:64px;padding:0 13px}.viewport{height:calc(100vh - 64px)}.brand small{display:none}.network-live{padding:7px 8px;font-size:6px}.content{padding-top:22px}.page-title{font-size:22px;line-height:1.2}.metrics{gap:8px}.metric{min-height:100px;padding:14px}.metric text{font-size:25px}.sidebar{display:flex}.hero{padding:20px;grid-template-columns:1fr 1fr}.merchant-name{font-size:21px}.hero-metric{min-width:0}.stage-track{padding-left:9px;padding-right:9px}.stage i{width:22px;height:22px}.stage:not(:last-child)::after{top:11px;left:calc(50% + 11px);right:calc(-50% + 11px)}.stage text{font-size:6px}.primary{width:calc(100% - 24px);margin-left:12px;margin-right:12px}.guardrails{gap:8px;padding-left:12px;padding-right:12px}.manifest-meta,.schema-columns{grid-template-columns:1fr}.quality-grid{grid-template-columns:1fr 1fr}}
</style>
