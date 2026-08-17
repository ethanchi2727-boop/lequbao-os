<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  changeConsumerContext,
  fetchConsumerHome,
  type ConsumerHomeOverview,
} from '../../services/consumer'

type SheetType = 'CITY' | 'HOUSEHOLD' | null

const home = ref<ConsumerHomeOverview | null>(null)
const loading = ref(true)
const switching = ref(false)
const errorMessage = ref('')
const query = ref('')
const sheet = ref<SheetType>(null)

const mainProgress = computed(() => home.value?.inProgress[0] ?? null)
const progressMoreCount = computed(() =>
  Math.max(0, (home.value?.inProgress.length ?? 0) - 1))

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    home.value = await fetchConsumerHome()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '首页加载失败'
  } finally {
    loading.value = false
  }
}

function navigate(target: string): void {
  if (!target.startsWith('/pages/')) return
  uni.navigateTo({ url: target })
}

function openSearch(searchQuery = query.value): void {
  const normalized = searchQuery.trim()
  const suffix = normalized ? `?query=${encodeURIComponent(normalized)}` : ''
  uni.navigateTo({ url: `/pages/search/index${suffix}` })
}

function openAssistant(prompt = query.value): void {
  const normalized = prompt.trim()
  const suffix = normalized ? `?prompt=${encodeURIComponent(normalized)}` : ''
  uni.navigateTo({ url: `/pages/assistant/index${suffix}` })
}

function openMessages(): void {
  uni.navigateTo({ url: '/pages/messages/index' })
}

function openNearby(): void {
  uni.navigateTo({ url: '/pages/nearby/index' })
}

function unavailable(label: string): void {
  uni.showToast({
    title: `${label}将在 AI 助手批次接通`,
    icon: 'none',
  })
}

function openModule(path: string): void {
  uni.navigateTo({ url: `/pages/module/index?path=${encodeURIComponent(path)}` })
}

async function updateContext(cityId: string, householdMemberId: string): Promise<void> {
  if (!home.value || switching.value) return
  const current = home.value
  if (
    cityId === current.city.id
    && householdMemberId === current.household.activeMember.id
  ) {
    sheet.value = null
    return
  }
  switching.value = true
  try {
    home.value = await changeConsumerContext({
      expectedVersion: current.profile.version,
      cityId,
      householdMemberId,
    })
    sheet.value = null
    uni.showToast({ title: '生活上下文已切换', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '切换失败',
      icon: 'none',
    })
    await load()
  } finally {
    switching.value = false
  }
}

function formatFen(value: number | null): string {
  if (value === null) return '待确认'
  return `¥${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}`
}

function formatSchedule(value: string | null): string {
  if (!value) return '等待确认时间'
  const date = new Date(value)
  const today = new Date()
  const day = date.toDateString() === today.toDateString()
    ? '今天'
    : `${date.getMonth() + 1}月${date.getDate()}日`
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

onMounted(load)
</script>

<template>
  <view class="consumer-page">
    <view class="ambient ambient-one" />
    <view class="ambient ambient-two" />

    <view v-if="loading" class="state-page">
      <view class="loading-orb"><text>✦</text></view>
      <text class="state-title">正在理解你的今天</text>
      <text class="state-copy">同步家庭身份、城市和生活进度…</text>
    </view>

    <view v-else-if="errorMessage" class="state-page">
      <view class="error-symbol">!</view>
      <text class="state-title">暂时没有连接上</text>
      <text class="state-copy">{{ errorMessage }}</text>
      <button class="retry-button" @click="load">重新连接</button>
    </view>

    <template v-else-if="home">
      <header class="topbar">
        <button class="context-button" hover-class="tap" @click="sheet = 'CITY'">
          <text class="pin">⌁</text>
          <text>{{ home.city.name }}</text>
          <text class="chevron">⌄</text>
        </button>
        <view class="wordmark">
          <view class="brand-orbit"><text>•</text></view>
          <text class="brand-cn">乐趣生活</text>
        </view>
        <view class="top-actions">
          <button class="icon-button message-button" hover-class="tap" @click="openMessages">
            <text>⌁</text>
            <text v-if="home.unreadMessageCount" class="unread-badge">
              {{ home.unreadMessageCount > 9 ? '9+' : home.unreadMessageCount }}
            </text>
          </button>
          <button class="member-avatar" hover-class="tap" @click="sheet = 'HOUSEHOLD'">
            {{ home.household.activeMember.avatarKey }}
          </button>
        </view>
      </header>

      <main class="main-content">
        <section class="intro">
          <view class="intro-context">
            <text>{{ home.profile.greeting }}</text>
            <button class="family-pill" hover-class="tap" @click="sheet = 'HOUSEHOLD'">
              <text>{{ home.household.activeMember.relation }}</text><text>⌄</text>
            </button>
          </view>
          <text class="hero-heading">今天想让我帮你<text class="accent-word">做什么？</text></text>
          <text class="hero-subtitle">说一句就好，剩下的交给乐趣生活</text>
        </section>

        <section class="ai-composer">
          <view class="composer-glow" />
          <view class="composer-head">
            <view class="ai-mark"><text>✦</text></view>
            <text class="composer-label">乐趣 AI</text>
            <text class="composer-state"><text class="online-dot" />在线</text>
          </view>
          <view class="input-row">
            <input
              v-model="query"
              class="intent-input"
              confirm-type="search"
              placeholder="比如：今晚两个人，找个安静靠窗的位置"
              placeholder-class="intent-placeholder"
              @confirm="openAssistant()"
            />
            <button class="voice-button" hover-class="tap" @click="openAssistant('')">
              <text class="voice-bars">◖</text>
            </button>
          </view>
          <view class="composer-tools">
            <view class="tool-group">
              <button class="tool-button" @click="openAssistant('')"><text>▧</text>图片</button>
              <button class="tool-button" @click="openNearby"><text>⌖</text>位置</button>
              <button class="tool-button" @click="openSearch()"><text>⌕</text>全局搜索</button>
            </view>
            <button class="send-button" :class="{ active: query.trim() }" @click="openAssistant()">
              <text>↑</text>
            </button>
          </view>
        </section>

        <scroll-view class="intent-scroll" scroll-x :show-scrollbar="false">
          <view class="intent-row">
            <button
              v-for="intent in home.quickIntents"
              :key="intent.id"
              class="intent-chip"
              :class="`tone-${intent.tone.toLowerCase()}`"
              hover-class="tap"
              @click="openAssistant(intent.prompt)"
            >
              <text class="intent-icon">{{ intent.icon }}</text>
              <text>{{ intent.label }}</text>
            </button>
          </view>
        </scroll-view>

        <section v-if="mainProgress" class="section-block progress-section">
          <view class="section-heading">
            <view>
              <text class="section-kicker">LIVE PROGRESS</text>
              <text class="section-title">正在进行</text>
            </view>
            <text v-if="progressMoreCount" class="more-link">还有 {{ progressMoreCount }} 项</text>
          </view>
          <button class="progress-card" hover-class="card-tap" @click="navigate(mainProgress.actionTarget)">
            <view class="progress-topline">
              <view class="status-chip"><text class="pulse" />{{ mainProgress.subtitle }}</view>
              <text class="progress-arrow">↗</text>
            </view>
            <text class="progress-title">{{ mainProgress.title }}</text>
            <text class="progress-merchant">{{ mainProgress.merchantName }}</text>
            <view class="progress-footer">
              <view class="schedule">
                <text class="schedule-icon">◷</text>
                <text>{{ formatSchedule(mainProgress.scheduledAt) }}</text>
              </view>
              <text class="amount">{{ formatFen(mainProgress.amountFen) }}</text>
            </view>
          </button>
        </section>

        <section v-if="home.prepared.length" class="section-block">
          <view class="section-heading">
            <view>
              <text class="section-kicker">PREPARED FOR YOU</text>
              <text class="section-title">为你准备</text>
            </view>
            <text class="section-note">基于当前家庭身份</text>
          </view>
          <scroll-view class="prepared-scroll" scroll-x :show-scrollbar="false">
            <view class="prepared-row">
              <button
                v-for="card in home.prepared"
                :key="card.id"
                class="prepared-card"
                :class="`prepared-${card.tone.toLowerCase()}`"
                hover-class="card-tap"
                @click="navigate(card.actionTarget)"
              >
                <view class="prepared-head">
                  <text class="prepared-eyebrow">{{ card.eyebrow }}</text>
                  <text class="prepared-glyph">
                    {{ card.kind === 'BENEFIT' ? '券' : card.kind === 'FAMILY_TASK' ? '家' : card.kind === 'REORDER' ? '↻' : '荐' }}
                  </text>
                </view>
                <text class="prepared-title">{{ card.title }}</text>
                <text class="prepared-copy">{{ card.description }}</text>
                <view class="prepared-action">
                  <text>{{ card.actionLabel }}</text><text>→</text>
                </view>
              </button>
            </view>
          </scroll-view>
        </section>

        <section v-if="home.recentServices.length" class="section-block recent-section">
          <view class="section-heading">
            <view>
              <text class="section-kicker">RECENT</text>
              <text class="section-title">最近使用</text>
            </view>
          </view>
          <view class="recent-grid">
            <button
              v-for="service in home.recentServices"
              :key="service.id"
              class="recent-item"
              hover-class="tap"
              @click="navigate(service.actionTarget)"
            >
              <view class="recent-icon">{{ service.icon }}</view>
              <text class="recent-title">{{ service.title }}</text>
            </button>
          </view>
        </section>

        <view class="trust-note">
          <text class="trust-icon">✓</text>
          <text>只展示已授权真实服务 · 价格与可用状态以确认页为准</text>
        </view>
      </main>

      <nav class="bottom-nav">
        <button class="nav-item active"><text class="nav-icon">⌂</text><text>首页</text></button>
        <button class="nav-item" @click="openNearby"><text class="nav-icon">⌖</text><text>附近</text></button>
        <button class="nav-ai" @click="openAssistant()"><view><text>✦</text></view><text>问乐趣</text></button>
        <button class="nav-item" @click="openModule('family')"><text class="nav-icon">♧</text><text>家庭</text></button>
        <button class="nav-item" @click="openModule('profile')"><text class="nav-icon">○</text><text>我的</text></button>
      </nav>

      <view v-if="sheet" class="sheet-layer" @click="sheet = null">
        <view class="sheet-panel" @click.stop>
          <view class="sheet-handle" />
          <view class="sheet-header">
            <view>
              <text class="sheet-kicker">{{ sheet === 'CITY' ? 'CITY CONTEXT' : 'FAMILY IDENTITY' }}</text>
              <text class="sheet-title">{{ sheet === 'CITY' ? '选择服务城市' : '今天为谁安排生活？' }}</text>
            </view>
            <button class="sheet-close" @click="sheet = null">×</button>
          </view>
          <view v-if="sheet === 'CITY'" class="option-list">
            <button
              v-for="city in home.cities"
              :key="city.id"
              class="option-card"
              :class="{ selected: city.isCurrent }"
              :disabled="switching || !city.available"
              @click="updateContext(city.id, home.household.activeMember.id)"
            >
              <view class="option-main">
                <text class="option-title">{{ city.name }}</text>
                <text class="option-copy">
                  {{ city.serviceLevel === 'FULL' ? '完整生活服务已开放' : '探索服务已开放' }}
                </text>
              </view>
              <text v-if="city.isCurrent" class="selected-mark">✓</text>
              <text v-else class="option-arrow">→</text>
            </button>
          </view>
          <view v-else class="option-list">
            <button
              v-for="member in home.household.members"
              :key="member.id"
              class="option-card member-option"
              :class="{ selected: member.isCurrent }"
              :disabled="switching"
              @click="updateContext(home.city.id, member.id)"
            >
              <view class="option-avatar">{{ member.avatarKey }}</view>
              <view class="option-main">
                <view class="member-name-row">
                  <text class="option-title">{{ member.name }}</text>
                  <text class="relation-tag">{{ member.relation }}</text>
                </view>
                <text class="option-copy">{{ member.subtitle }}</text>
              </view>
              <text v-if="member.isCurrent" class="selected-mark">✓</text>
              <text v-else class="option-arrow">→</text>
            </button>
          </view>
          <text class="sheet-footnote">不同身份会独立应用饮食偏好、内容范围与确认权限</text>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.consumer-page {
  --ink: #17201b;
  --muted: #758078;
  --green: #167b64;
  --mint: #bff2df;
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 90% 0%, rgba(190, 242, 223, .72), transparent 31%),
    linear-gradient(180deg, #f9fcf9 0%, #f4f7f3 100%);
  color: var(--ink);
}
.ambient { position: absolute; border-radius: 50%; filter: blur(50px); pointer-events: none; }
.ambient-one { top: 290px; left: -110px; width: 230px; height: 230px; background: rgba(208, 195, 255, .25); }
.ambient-two { top: 780px; right: -130px; width: 250px; height: 250px; background: rgba(255, 211, 150, .2); }
.topbar {
  position: relative; z-index: 3; display: flex; height: calc(64px + env(safe-area-inset-top));
  align-items: flex-end; justify-content: space-between; padding: env(safe-area-inset-top) 19px 11px;
}
.context-button, .top-actions, .wordmark, .composer-head, .composer-tools,
.tool-group, .progress-topline, .progress-footer, .section-heading,
.prepared-head, .prepared-action, .intro-context, .family-pill, .member-name-row {
  display: flex; align-items: center;
}
.context-button {
  min-width: 88px; height: 38px; gap: 6px; padding: 0 11px; border: 1px solid rgba(23,32,27,.07);
  border-radius: 999px; background: rgba(255,255,255,.72); backdrop-filter: blur(14px);
  color: var(--ink); font-size: 14px; font-weight: 800;
}
.pin { color: var(--green); font-size: 18px; transform: rotate(-35deg); }
.chevron { color: #97a098; font-size: 12px; }
.wordmark { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); gap: 7px; }
.brand-orbit { display: flex; width: 25px; height: 25px; align-items: center; justify-content: center; border: 3px solid var(--green); border-top-color: #4fc5a0; border-radius: 50%; color: #0d5646; transform: rotate(-22deg); }
.brand-cn { font-size: 15px; font-weight: 950; letter-spacing: .06em; white-space: nowrap; }
.top-actions { gap: 9px; }
.icon-button, .member-avatar {
  position: relative; display: flex; width: 38px; height: 38px; align-items: center; justify-content: center;
  border: 1px solid rgba(23,32,27,.07); border-radius: 50%; background: rgba(255,255,255,.78);
  box-shadow: 0 7px 20px rgba(40,66,54,.07); font-size: 17px;
}
.message-button > text:first-child { transform: rotate(180deg); font-size: 20px; }
.member-avatar { background: #183c33; color: white; font-size: 10px; font-weight: 900; }
.unread-badge {
  position: absolute; top: -3px; right: -3px; min-width: 16px; height: 16px; padding: 0 4px;
  border: 2px solid #f7fbf8; border-radius: 999px; background: #ee6659; color: white; font-size: 8px; line-height: 12px;
}
.main-content { position: relative; z-index: 1; padding: 16px 18px calc(118px + env(safe-area-inset-bottom)); }
.intro-context { justify-content: space-between; color: #65716a; font-size: 13px; font-weight: 700; }
.family-pill { gap: 5px; padding: 7px 10px; border-radius: 999px; background: rgba(255,255,255,.75); color: #607068; font-size: 11px; font-weight: 800; }
.hero-heading { display: block; max-width: 330px; margin-top: 9px; font-size: 31px; font-weight: 950; line-height: 1.2; letter-spacing: -.045em; }
.accent-word { color: var(--green); }
.hero-subtitle { display: block; margin-top: 8px; color: #89938d; font-size: 12px; }
.ai-composer {
  position: relative; overflow: hidden; margin-top: 22px; padding: 18px; border: 1px solid rgba(255,255,255,.9);
  border-radius: 26px; background: rgba(255,255,255,.9); box-shadow: 0 20px 48px rgba(47,81,64,.11);
}
.composer-glow { position: absolute; top: -65px; right: -40px; width: 145px; height: 145px; border-radius: 50%; background: rgba(139, 228, 192, .34); filter: blur(28px); }
.composer-head { position: relative; gap: 7px; }
.ai-mark { display: flex; width: 27px; height: 27px; align-items: center; justify-content: center; border-radius: 9px; background: #173e34; color: #9ee7cb; font-size: 11px; }
.composer-label { font-size: 13px; font-weight: 900; }
.composer-state { margin-left: auto; color: #86918a; font-size: 10px; }
.online-dot { display: inline-block; width: 5px; height: 5px; margin-right: 5px; border-radius: 50%; background: #2fbd8d; box-shadow: 0 0 0 4px rgba(47,189,141,.1); }
.input-row { position: relative; display: flex; align-items: flex-end; min-height: 80px; }
.intent-input { flex: 1; height: 65px; padding-right: 45px; color: var(--ink); font-size: 17px; font-weight: 700; line-height: 1.5; }
.intent-placeholder { color: #a5ada8; font-size: 14px; font-weight: 500; }
.voice-button { position: absolute; right: 0; bottom: 13px; display: flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 50%; background: #f1f6f2; color: #27755f; }
.voice-bars { font-size: 20px; }
.composer-tools { position: relative; justify-content: space-between; padding-top: 12px; border-top: 1px solid #eef1ee; }
.tool-group { gap: 13px; }
.tool-button { display: flex; align-items: center; gap: 4px; color: #7b867f; font-size: 10px; }
.tool-button text { color: #3f6d5e; font-size: 14px; }
.send-button { display: flex; width: 35px; height: 35px; align-items: center; justify-content: center; border-radius: 12px; background: #e8eee9; color: #a7b0aa; font-size: 19px; font-weight: 900; transition: all .2s; }
.send-button.active { background: #173e34; box-shadow: 0 8px 18px rgba(23,62,52,.24); color: white; }
.intent-scroll { width: calc(100% + 36px); margin: 15px -18px 0; white-space: nowrap; }
.intent-row { display: inline-flex; gap: 9px; padding: 0 18px 5px; }
.intent-chip { display: flex; height: 41px; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid rgba(22,49,39,.055); border-radius: 999px; background: rgba(255,255,255,.8); box-shadow: 0 6px 15px rgba(35,65,52,.045); color: #46524b; font-size: 11px; font-weight: 800; }
.intent-icon { display: flex; width: 23px; height: 23px; align-items: center; justify-content: center; border-radius: 8px; font-size: 10px; }
.tone-mint .intent-icon { background: #dff6ed; color: #13775f; }
.tone-amber .intent-icon { background: #fff0d2; color: #b07018; }
.tone-violet .intent-icon { background: #eee7ff; color: #7450bf; }
.section-block { margin-top: 30px; }
.section-heading { justify-content: space-between; margin: 0 2px 13px; }
.section-kicker, .section-title { display: block; }
.section-kicker { color: #32876e; font-size: 8px; font-weight: 950; letter-spacing: .15em; }
.section-title { margin-top: 4px; font-size: 21px; font-weight: 950; letter-spacing: -.03em; }
.more-link, .section-note { color: #9aa39d; font-size: 10px; }
.progress-card {
  width: 100%; padding: 17px; border: 1px solid rgba(255,255,255,.6); border-radius: 23px;
  background: linear-gradient(145deg, #1c4c3e, #15362f); box-shadow: 0 17px 35px rgba(18,55,45,.2); color: white; text-align: left;
}
.progress-topline { justify-content: space-between; }
.status-chip { display: flex; align-items: center; padding: 6px 9px; border: 1px solid rgba(255,255,255,.1); border-radius: 999px; background: rgba(255,255,255,.08); color: #b8decf; font-size: 9px; }
.pulse { width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #66dfb5; box-shadow: 0 0 0 4px rgba(102,223,181,.13); }
.progress-arrow { color: rgba(255,255,255,.55); font-size: 18px; }
.progress-title { display: block; margin-top: 16px; font-size: 20px; font-weight: 950; }
.progress-merchant { display: block; margin-top: 5px; color: rgba(255,255,255,.57); font-size: 11px; }
.progress-footer { justify-content: space-between; margin-top: 19px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1); }
.schedule { display: flex; align-items: center; gap: 6px; color: #d6e9e1; font-size: 11px; font-weight: 700; }
.schedule-icon { color: #75d8b6; font-size: 15px; }
.amount { color: white; font-size: 15px; font-weight: 950; }
.prepared-scroll { width: calc(100% + 36px); margin: 0 -18px; white-space: nowrap; }
.prepared-row { display: inline-flex; gap: 11px; padding: 0 18px 8px; }
.prepared-card {
  width: 244px; min-height: 195px; padding: 17px; border: 1px solid rgba(26,52,42,.05);
  border-radius: 22px; background: white; box-shadow: 0 10px 26px rgba(44,73,59,.07); text-align: left; white-space: normal;
}
.prepared-mint { background: linear-gradient(145deg, #f4fff9, #fff); }
.prepared-amber { background: linear-gradient(145deg, #fff8ea, #fff); }
.prepared-violet { background: linear-gradient(145deg, #f7f3ff, #fff); }
.prepared-coral { background: linear-gradient(145deg, #fff2ef, #fff); }
.prepared-head, .prepared-action { justify-content: space-between; }
.prepared-eyebrow { color: #98702d; font-size: 9px; font-weight: 900; }
.prepared-glyph { display: flex; width: 30px; height: 30px; align-items: center; justify-content: center; border-radius: 10px; background: rgba(22,123,100,.09); color: var(--green); font-size: 11px; font-weight: 900; }
.prepared-title { display: block; margin-top: 13px; overflow: hidden; color: #223028; font-size: 16px; font-weight: 950; text-overflow: ellipsis; white-space: nowrap; }
.prepared-copy { display: -webkit-box; height: 41px; margin-top: 7px; overflow: hidden; color: #7b867f; font-size: 10px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.prepared-action { margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(26,52,42,.07); color: #286d5b; font-size: 10px; font-weight: 900; }
.recent-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
.recent-item { display: flex; min-width: 0; flex-direction: column; align-items: center; gap: 8px; }
.recent-icon { display: flex; width: 53px; height: 53px; align-items: center; justify-content: center; border: 1px solid rgba(24,61,50,.05); border-radius: 18px; background: rgba(255,255,255,.85); box-shadow: 0 8px 18px rgba(37,67,53,.055); color: #2f7561; font-size: 15px; font-weight: 900; }
.recent-title { width: 100%; overflow: hidden; color: #536058; font-size: 10px; font-weight: 750; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.trust-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 31px; color: #a0aaa4; font-size: 8px; }
.trust-icon { display: flex; width: 14px; height: 14px; align-items: center; justify-content: center; border: 1px solid #b4beb8; border-radius: 50%; font-size: 7px; }
.bottom-nav {
  position: fixed; z-index: 8; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5, 1fr);
  height: calc(72px + env(safe-area-inset-bottom)); padding: 7px 10px env(safe-area-inset-bottom);
  border-top: 1px solid rgba(33,58,47,.06); background: rgba(252,254,252,.92); box-shadow: 0 -12px 35px rgba(30,63,48,.08); backdrop-filter: blur(20px);
}
.nav-item, .nav-ai { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #9aa39d; font-size: 9px; font-weight: 750; }
.nav-icon { font-size: 19px; }
.nav-item.active { color: #1a745e; }
.nav-ai { color: #326e5f; transform: translateY(-13px); }
.nav-ai view { display: flex; width: 49px; height: 49px; align-items: center; justify-content: center; border: 5px solid #f7faf7; border-radius: 18px; background: linear-gradient(145deg,#1f8068,#153f34); box-shadow: 0 9px 22px rgba(24,91,72,.28); color: #bcf3df; font-size: 17px; }
.sheet-layer { position: fixed; z-index: 20; inset: 0; display: flex; align-items: flex-end; background: rgba(13,27,21,.38); backdrop-filter: blur(5px); }
.sheet-panel { width: 100%; padding: 9px 18px calc(22px + env(safe-area-inset-bottom)); border-radius: 30px 30px 0 0; background: #f8fbf8; box-shadow: 0 -25px 60px rgba(10,33,23,.2); }
.sheet-handle { width: 39px; height: 4px; margin: 0 auto 17px; border-radius: 9px; background: #d8ded9; }
.sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.sheet-kicker, .sheet-title { display: block; }
.sheet-kicker { color: #36816b; font-size: 8px; font-weight: 950; letter-spacing: .15em; }
.sheet-title { margin-top: 5px; font-size: 21px; font-weight: 950; }
.sheet-close { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 50%; background: #e9eee9; color: #667169; font-size: 21px; font-weight: 400; }
.option-list { display: flex; flex-direction: column; gap: 9px; }
.option-card { display: flex; width: 100%; min-height: 66px; align-items: center; padding: 13px 15px; border: 1px solid rgba(29,64,50,.055); border-radius: 18px; background: white; text-align: left; }
.option-card.selected { border-color: rgba(31,137,105,.28); background: #effaf5; box-shadow: inset 0 0 0 1px rgba(31,137,105,.05); }
.option-main { flex: 1; min-width: 0; }
.option-title, .option-copy { display: block; }
.option-title { color: #26342c; font-size: 14px; font-weight: 900; }
.option-copy { margin-top: 4px; overflow: hidden; color: #8b958f; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.selected-mark { display: flex; width: 25px; height: 25px; align-items: center; justify-content: center; border-radius: 50%; background: #23866b; color: white; font-size: 11px; }
.option-arrow { color: #b1bab4; font-size: 16px; }
.option-avatar { display: flex; width: 40px; height: 40px; flex: none; align-items: center; justify-content: center; margin-right: 11px; border-radius: 14px; background: #183e34; color: white; font-size: 10px; font-weight: 900; }
.member-name-row { gap: 7px; }
.relation-tag { padding: 3px 6px; border-radius: 999px; background: #e8eee9; color: #6f7973; font-size: 8px; }
.sheet-footnote { display: block; margin-top: 15px; color: #9ca59f; font-size: 9px; text-align: center; }
.state-page { display: flex; min-height: 100vh; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; }
.loading-orb, .error-symbol { display: flex; width: 65px; height: 65px; align-items: center; justify-content: center; border-radius: 23px; background: #193f35; box-shadow: 0 17px 35px rgba(25,63,53,.2); color: #9ce6ca; font-size: 22px; }
.loading-orb { animation: breathe 1.8s ease-in-out infinite; }
.error-symbol { background: #fff0ed; box-shadow: none; color: #dd6555; font-weight: 950; }
.state-title { margin-top: 20px; font-size: 20px; font-weight: 950; }
.state-copy { margin-top: 7px; color: #8a948e; font-size: 11px; line-height: 1.6; }
.retry-button { margin-top: 20px; padding: 12px 22px; border-radius: 14px; background: #193f35; color: white; font-size: 12px; font-weight: 900; }
.tap, .card-tap { opacity: .74; transform: scale(.98); }
@keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@media (max-width: 420px) {
  .wordmark { display: none; }
}
@media (min-width: 680px) {
  .main-content { max-width: 720px; margin: 0 auto; }
  .topbar { max-width: 760px; margin: 0 auto; }
  .bottom-nav { right: 50%; left: auto; width: 720px; transform: translateX(50%); border-radius: 24px 24px 0 0; }
  .sheet-panel { max-width: 560px; margin: 0 auto; border-radius: 30px 30px 0 0; }
}
</style>
