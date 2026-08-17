<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type {
  MerchantMemberBenefitSummary,
  MerchantMemberOverview,
  MerchantMemberSummary,
} from '@lequ/contracts'
import { fetchMemberOverview, grantBenefit, saveMemberTags } from '../../services/members'

type ActionMode = 'TAGS' | 'BENEFIT' | null

const overview = ref<MerchantMemberOverview | null>(null)
const memberId = ref('')
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')
const actionMode = ref<ActionMode>(null)
const tagText = ref('')
const benefitKind = ref<MerchantMemberBenefitSummary['kind']>('EXPERIENCE')
const benefitTitle = ref('主厨席优先预约权')
const benefitValueYuan = ref('0')
const benefitConfirmed = ref(false)

const member = computed<MerchantMemberSummary | null>(() => overview.value?.focusMember ?? null)

onLoad((options) => {
  memberId.value = typeof options?.memberId === 'string' ? options.memberId : ''
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    overview.value = await fetchMemberOverview(memberId.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '会员画像加载失败'
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  uni.navigateBack()
}

function money(fen: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(fen / 100)
}

function shortDate(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function segmentLabel(value: MerchantMemberSummary['segment']): string {
  return value === 'HIGH_VALUE' ? '高价值会员' : value === 'DORMANT' ? '沉睡会员' : value === 'ACTIVE' ? '活跃会员' : '新会员'
}

function openTags(): void {
  if (!member.value) return
  tagText.value = member.value.tags.join('、')
  actionMode.value = 'TAGS'
}

function openBenefit(): void {
  benefitKind.value = 'EXPERIENCE'
  benefitTitle.value = '主厨席优先预约权'
  benefitValueYuan.value = '0'
  benefitConfirmed.value = false
  actionMode.value = 'BENEFIT'
}

function closeAction(): void {
  if (busy.value) return
  actionMode.value = null
}

function expiresInDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString()
}

async function submitAction(): Promise<void> {
  if (!member.value || busy.value || !actionMode.value) return
  busy.value = true
  try {
    if (actionMode.value === 'TAGS') {
      const tags = tagText.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean)
      overview.value = await saveMemberTags(member.value, tags)
      uni.showToast({ title: '会员标签已更新', icon: 'success' })
    } else {
      if (!benefitConfirmed.value) throw new Error('请先确认权益内容与履约责任')
      overview.value = await grantBenefit(member.value, {
        kind: benefitKind.value,
        title: benefitTitle.value.trim(),
        valueFen: Math.round(Number(benefitValueYuan.value || 0) * 100),
        expiresAt: expiresInDays(30),
      })
      uni.showToast({ title: '会员权益已发放', icon: 'success' })
    }
    actionMode.value = null
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view v-if="member && overview" class="detail-page">
    <view class="profile-hero">
      <view class="topbar"><button @click="goBack">‹</button><text>会员画像</text><button>•••</button></view>
      <view class="profile-main">
        <view class="avatar">{{ member.displayName.slice(0, 1) }}</view>
        <view class="profile-copy">
          <view><strong>{{ member.displayName }}</strong><text>{{ segmentLabel(member.segment) }}</text></view>
          <span>{{ member.phoneMasked }} · {{ member.marketingConsent ? '已授权会员触达' : '已撤回营销授权' }}</span>
        </view>
      </view>
      <view class="score-card">
        <view class="score-ring" :style="{ '--score': `${member.repurchaseProbability * 3.6}deg` }">
          <view><strong>{{ member.repurchaseProbability }}%</strong><text>复购概率</text></view>
        </view>
        <view class="score-copy">
          <text>AI 复购判断</text>
          <strong>{{ member.churnRisk === 'HIGH' ? '需要人工关怀' : member.churnRisk === 'MEDIUM' ? '持续培育关系' : '关系稳定' }}</strong>
          <span>{{ overview.predictionModelVersion }} · 非收益承诺</span>
        </view>
      </view>
    </view>

    <main class="content">
      <view class="metric-grid">
        <view><text>累计消费</text><strong>¥{{ money(member.lifetimeValueFen) }}</strong></view>
        <view><text>订单</text><strong>{{ member.orderCount }}</strong></view>
        <view><text>平均客单</text><strong>¥{{ money(member.averageTicketFen) }}</strong></view>
      </view>

      <section>
        <view class="section-head"><view><text>WHY THIS SCORE</text><strong>预测依据</strong></view><span>可解释</span></view>
        <view class="reason-card">
          <view v-for="(reason, index) in member.predictionReasons" :key="reason"><i>0{{ index + 1 }}</i><text>{{ reason }}</text></view>
        </view>
      </section>

      <section>
        <view class="section-head"><view><text>MEMBER TAGS</text><strong>会员标签</strong></view><button @click="openTags">编辑</button></view>
        <view class="tag-card"><text v-for="tag in member.tags" :key="tag">{{ tag }}</text><button @click="openTags">＋</button></view>
      </section>

      <section>
        <view class="section-head"><view><text>BENEFITS</text><strong>会员权益</strong></view><button @click="openBenefit">发放权益</button></view>
        <view v-if="overview.benefits.length" class="benefit-list">
          <view v-for="benefit in overview.benefits" :key="benefit.id" class="benefit-card">
            <view class="benefit-icon">{{ benefit.kind === 'COUPON' ? '券' : benefit.kind === 'LEVEL' ? '级' : '礼' }}</view>
            <view><strong>{{ benefit.title }}</strong><text>{{ benefit.ruleVersion }} · 至 {{ shortDate(benefit.expiresAt) }}</text></view>
            <span>{{ benefit.status === 'ACTIVE' ? '生效中' : benefit.status }}</span>
          </view>
        </view>
        <button v-else class="empty-benefit" @click="openBenefit">还没有生效权益，点击为会员创建</button>
      </section>

      <section>
        <view class="section-head"><view><text>LIFETIME TIMELINE</text><strong>消费时间线</strong></view><span>{{ overview.timeline.length }} 条</span></view>
        <view class="timeline">
          <view v-for="item in overview.timeline" :key="item.id" class="timeline-item">
            <view class="timeline-dot" />
            <view class="timeline-card">
              <view><strong>{{ item.title }}</strong><span>{{ shortDate(item.occurredAt) }}</span></view>
              <text>{{ item.detail }}</text>
              <small v-if="item.amountFen !== null">关联金额 ¥{{ money(item.amountFen) }}</small>
            </view>
          </view>
        </view>
      </section>

      <view class="governance-card">会员数据归商家 · 预测可解释 · 触达看授权 · 变更全留痕</view>
    </main>

    <view v-if="actionMode" class="sheet-layer" @click.self="closeAction">
      <view class="action-sheet">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <view><text>{{ actionMode === 'TAGS' ? 'PROFILE TAGS' : 'BENEFIT APPROVAL' }}</text><strong>{{ actionMode === 'TAGS' ? '编辑会员标签' : '发放会员权益' }}</strong></view>
          <button @click="closeAction">×</button>
        </view>
        <view v-if="actionMode === 'TAGS'">
          <label><text>标签（使用顿号或逗号分隔，最多 8 个）</text><textarea v-model="tagText" maxlength="240" /></label>
          <view class="tag-examples">建议：纪念日 · 高客单 · 企业采购 · 待召回</view>
        </view>
        <view v-else>
          <view class="kind-switch">
            <button :class="{ active: benefitKind === 'EXPERIENCE' }" @click="benefitKind = 'EXPERIENCE'">体验权益</button>
            <button :class="{ active: benefitKind === 'COUPON' }" @click="benefitKind = 'COUPON'">优惠权益</button>
            <button :class="{ active: benefitKind === 'LEVEL' }" @click="benefitKind = 'LEVEL'">等级权益</button>
          </view>
          <label><text>权益名称</text><input v-model="benefitTitle"></label>
          <label v-if="benefitKind === 'COUPON'"><text>权益面值（元）</text><input v-model="benefitValueYuan" type="digit"></label>
          <view class="expiry-card"><text>有效期</text><strong>发放后 30 天</strong><span>规则 {{ 'member-benefit-v1' }}</span></view>
          <button :class="['confirmation', { checked: benefitConfirmed }]" @click="benefitConfirmed = !benefitConfirmed">
            <i>{{ benefitConfirmed ? '✓' : '' }}</i><view><strong>我已核对权益与履约责任</strong><text>发放后将形成门店需兑现的真实会员权益。</text></view>
          </button>
        </view>
        <button class="primary-action" :disabled="busy" @click="submitAction">{{ busy ? '正在安全处理…' : actionMode === 'TAGS' ? '保存标签' : '强确认并发放权益' }}</button>
        <text class="safe-note">版本校验 · 权限边界 · 幂等执行 · 审计留痕</text>
      </view>
    </view>
  </view>

  <view v-else-if="loading" class="state-card"><view>会</view><text>正在装载会员画像与时间线…</text></view>
  <view v-else class="state-card"><strong>会员画像不可用</strong><text>{{ errorMessage }}</text><button @click="load">重新加载</button></view>
</template>

<style scoped lang="scss">
page { background:#f4f3f8 } button { margin:0; padding:0; border:0; line-height:inherit } button::after { display:none }
.detail-page { min-height:100vh; background:#f4f3f8; color:#1b1c2a; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
.profile-hero { padding:calc(env(safe-area-inset-top) + 10px) 17px 25px; border-radius:0 0 35px 35px; background:radial-gradient(circle at 82% 0,rgba(124,232,200,.2),transparent 34%),linear-gradient(150deg,#11152d,#292451 66%,#185248); color:#fff }.topbar { display:grid; min-height:48px; grid-template-columns:40px 1fr 40px; align-items:center }.topbar button { display:flex; width:36px; height:36px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:rgba(255,255,255,.07); color:#fff; font-size:25px }.topbar button:last-child { font-size:10px; letter-spacing:2px }.topbar>text { font-size:14px; font-weight:900; text-align:center }
.profile-main { display:flex; align-items:center; gap:13px; margin-top:16px }.avatar { display:flex; width:66px; height:66px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:22px 22px 22px 8px; background:linear-gradient(145deg,#c49458,#745031); box-shadow:0 14px 27px rgba(0,0,0,.2); color:#fff; font-size:23px; font-weight:950 }.profile-copy { min-width:0; flex:1 }.profile-copy>view { display:flex; align-items:center; gap:7px }.profile-copy strong { font-size:21px }.profile-copy>view text { padding:4px 7px; border-radius:99px; background:rgba(255,255,255,.1); color:#8be7cd; font-size:7px; font-weight:850 }.profile-copy span { display:block; margin-top:7px; color:rgba(255,255,255,.53); font-size:8px }
.score-card { display:flex; align-items:center; gap:15px; margin-top:19px; padding:15px; border:1px solid rgba(255,255,255,.08); border-radius:21px; background:rgba(255,255,255,.07) }.score-ring { display:flex; width:77px; height:77px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:50%; background:conic-gradient(#7be2c6 var(--score),rgba(255,255,255,.09) 0); box-shadow:inset 0 0 0 7px rgba(15,18,43,.65) }.score-ring>view { text-align:center }.score-ring strong,.score-ring text { display:block }.score-ring strong { font-size:17px }.score-ring text { margin-top:2px; color:rgba(255,255,255,.52); font-size:6px }.score-copy text,.score-copy strong,.score-copy span { display:block }.score-copy text { color:#83e4c8; font-size:7px; font-weight:900; letter-spacing:.1em }.score-copy strong { margin-top:5px; font-size:13px }.score-copy span { margin-top:6px; color:rgba(255,255,255,.45); font-size:7px }
.content { padding:15px 17px calc(40px + env(safe-area-inset-bottom)) }.metric-grid { display:grid; grid-template-columns:repeat(3,1fr); padding:15px 8px; border-radius:20px; background:#fff; box-shadow:0 10px 24px rgba(35,32,70,.055) }.metric-grid view { border-right:1px solid #efedf4; text-align:center }.metric-grid view:last-child { border:0 }.metric-grid text,.metric-grid strong { display:block }.metric-grid text { color:#9998a4; font-size:7px }.metric-grid strong { margin-top:5px; font-size:14px }
section { margin-top:25px }.section-head { display:flex; align-items:flex-end; justify-content:space-between; margin:0 2px 10px }.section-head text,.section-head strong { display:block }.section-head text { color:#6156db; font-size:7px; font-weight:900; letter-spacing:.13em }.section-head strong { margin-top:4px; font-size:17px; font-weight:950 }.section-head>span { color:#9b9aa5; font-size:7px }.section-head>button { padding:6px 9px; border-radius:9px; background:#eceafe; color:#574dc8; font-size:8px; font-weight:850 }
.reason-card { display:grid; gap:9px; padding:15px; border-radius:20px; background:linear-gradient(140deg,#fff,#f8f7ff); box-shadow:0 9px 22px rgba(35,32,70,.05) }.reason-card view { display:flex; align-items:flex-start; gap:9px }.reason-card i { display:flex; width:25px; height:25px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:9px; background:#eceaff; color:#5b51d0; font-size:7px; font-style:normal; font-weight:900 }.reason-card text { padding-top:5px; color:#5f5f6e; font-size:9px; line-height:1.45 }
.tag-card { display:flex; flex-wrap:wrap; gap:6px; padding:14px; border-radius:18px; background:#fff }.tag-card text,.tag-card button { padding:7px 10px; border-radius:10px; background:#f0eff6; color:#666675; font-size:8px }.tag-card button { background:#eae8ff; color:#5a50cf; font-weight:900 }
.benefit-list { display:grid; gap:8px }.benefit-card { display:flex; align-items:center; gap:10px; padding:13px; border-radius:18px; background:#fff }.benefit-icon { display:flex; width:38px; height:38px; flex:0 0 auto; align-items:center; justify-content:center; border-radius:13px; background:linear-gradient(145deg,#c99a5a,#866035); color:#fff; font-size:11px; font-weight:900 }.benefit-card>view:nth-child(2) { min-width:0; flex:1 }.benefit-card strong,.benefit-card text { display:block }.benefit-card strong { font-size:10px }.benefit-card text { margin-top:4px; color:#92919c; font-size:7px }.benefit-card span { padding:4px 6px; border-radius:7px; background:#e6f7f1; color:#0b8064; font-size:7px }.empty-benefit { width:100%; height:60px; border:1px dashed #d9d6e6; border-radius:17px; background:#faf9fd; color:#767382; font-size:8px }
.timeline { position:relative; display:grid; gap:9px }.timeline::before { position:absolute; top:12px; bottom:12px; left:7px; width:1px; background:#d8d4e6; content:'' }.timeline-item { position:relative; display:flex; gap:10px }.timeline-dot { z-index:1; width:9px; height:9px; flex:0 0 auto; margin-top:15px; border:3px solid #f4f3f8; border-radius:50%; background:#5e53d3; box-shadow:0 0 0 1px #aaa4d1 }.timeline-card { min-width:0; flex:1; padding:13px; border-radius:16px; background:#fff }.timeline-card>view { display:flex; justify-content:space-between }.timeline-card strong { font-size:9px }.timeline-card span { color:#9c9ba5; font-size:7px }.timeline-card>text { display:block; margin-top:6px; color:#72717e; font-size:8px; line-height:1.5 }.timeline-card small { display:block; margin-top:6px; color:#0c8366; font-size:7px }.governance-card { margin-top:16px; padding:13px; border-radius:15px; background:#eaf5f2; color:#627b74; font-size:7px; text-align:center }
.sheet-layer { position:fixed; z-index:50; inset:0; display:flex; align-items:flex-end; background:rgba(9,9,27,.52) }.action-sheet { width:100%; max-height:88vh; overflow-y:auto; padding:9px 19px calc(22px + env(safe-area-inset-bottom)); border-radius:29px 29px 0 0; background:#fff }.sheet-handle { width:41px; height:4px; margin:0 auto 17px; border-radius:99px; background:#dddde4 }.sheet-head { display:flex; align-items:flex-start; justify-content:space-between }.sheet-head text,.sheet-head strong { display:block }.sheet-head text { color:#5d52d7; font-size:7px; font-weight:900; letter-spacing:.13em }.sheet-head strong { margin-top:4px; font-size:21px; font-weight:950 }.sheet-head button { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border-radius:12px; background:#f1f1f5; color:#686875; font-size:20px }
.action-sheet label { display:block; margin-top:17px }.action-sheet label>text { display:block; margin:0 0 6px 2px; color:#626270; font-size:8px; font-weight:800 }.action-sheet input,.action-sheet textarea { box-sizing:border-box; width:100%; border:1px solid #e1e1e8; border-radius:13px; background:#f9f9fb; font-size:10px }.action-sheet input { height:44px; padding:0 11px }.action-sheet textarea { height:90px; padding:10px }.tag-examples { margin-top:9px; color:#92919c; font-size:7px }.kind-switch { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:17px; padding:4px; border-radius:13px; background:#f0eff5 }.kind-switch button { height:36px; border-radius:10px; background:transparent; color:#767582; font-size:8px; font-weight:800 }.kind-switch button.active { background:#fff; box-shadow:0 5px 12px rgba(41,38,80,.08); color:#554bc6 }
.expiry-card { display:grid; grid-template-columns:1fr auto; margin-top:13px; padding:12px; border-radius:14px; background:#f3f3f7 }.expiry-card text { color:#7d7c88; font-size:8px }.expiry-card strong { font-size:9px }.expiry-card span { grid-column:1/-1; margin-top:5px; color:#9998a3; font-size:7px }.confirmation { display:flex; width:100%; align-items:flex-start; gap:10px; margin-top:14px; padding:13px; border:1px solid #e5e1dc; border-radius:16px; background:#fff9f5; color:#352f2c; text-align:left }.confirmation.checked { border-color:#5b51d3; background:#f2f1ff }.confirmation i { display:flex; width:21px; height:21px; flex:0 0 auto; align-items:center; justify-content:center; border:1px solid #c1c0ca; border-radius:7px; color:#fff; font-size:10px; font-style:normal }.confirmation.checked i { border-color:#5b51d3; background:#5b51d3 }.confirmation strong,.confirmation text { display:block }.confirmation strong { font-size:9px }.confirmation text { margin-top:4px; color:#817b78; font-size:7px }
.primary-action { width:100%; height:52px; margin-top:16px; border-radius:16px; background:linear-gradient(135deg,#6559ea,#4841aa); box-shadow:0 13px 25px rgba(75,66,177,.21); color:#fff; font-size:11px; font-weight:900 }.primary-action[disabled] { opacity:.6 }.safe-note { display:block; margin-top:9px; color:#9b9ba4; font-size:7px; text-align:center }
.state-card { display:flex; min-height:100vh; flex-direction:column; align-items:center; justify-content:center; gap:11px; background:#f4f3f8; color:#858592; font-size:9px }.state-card>view { display:flex; width:54px; height:54px; align-items:center; justify-content:center; border-radius:18px; background:#554bc8; color:#fff; font-size:16px; font-weight:950 }.state-card strong { color:#292a37; font-size:14px }.state-card button { padding:10px 18px; border-radius:12px; background:#292a45; color:#fff; font-size:9px }
@media (min-width:680px) { .profile-hero,.content { max-width:720px; margin:0 auto }.action-sheet { max-width:520px; margin:0 auto } }
</style>
