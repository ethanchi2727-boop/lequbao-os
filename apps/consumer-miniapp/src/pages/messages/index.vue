<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchConsumerMessages,
  readConsumerMessage,
  type ConsumerMessageCategory,
  type ConsumerMessageOverview,
  type ConsumerMessageSummary,
} from '../../services/consumer'

type CategoryFilter = ConsumerMessageCategory | 'ALL'

const overview = ref<ConsumerMessageOverview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const activeCategory = ref<CategoryFilter>('ALL')
const unreadOnly = ref(false)
const readingId = ref('')

const categoryMeta: Array<{
  id: CategoryFilter
  label: string
  icon: string
}> = [
  { id: 'ALL', label: '全部', icon: '全' },
  { id: 'TRANSACTION', label: '交易', icon: '单' },
  { id: 'SERVICE', label: '服务', icon: '服' },
  { id: 'FAMILY', label: '家庭', icon: '家' },
  { id: 'SYSTEM', label: '系统', icon: '知' },
]

const activeCount = computed(() =>
  overview.value?.categoryCounts.find(({ category }) =>
    category === activeCategory.value) ?? { total: 0, unread: 0 })

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const category = activeCategory.value
    overview.value = await fetchConsumerMessages(category === 'ALL'
      ? { unreadOnly: unreadOnly.value }
      : { category, unreadOnly: unreadOnly.value })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '消息加载失败'
  } finally {
    loading.value = false
  }
}

async function selectCategory(category: CategoryFilter): Promise<void> {
  activeCategory.value = category
  await load()
}

async function toggleUnread(): Promise<void> {
  unreadOnly.value = !unreadOnly.value
  await load()
}

async function openMessage(message: ConsumerMessageSummary): Promise<void> {
  if (readingId.value) return
  if (!message.read) {
    readingId.value = message.id
    try {
      overview.value = await readConsumerMessage(message)
    } catch (error) {
      uni.showToast({
        title: error instanceof Error ? error.message : '已读状态更新失败',
        icon: 'none',
      })
    } finally {
      readingId.value = ''
    }
    if (activeCategory.value !== 'ALL' || unreadOnly.value) await load()
  }
  if (message.actionTarget?.startsWith('/pages/')) {
    uni.navigateTo({ url: message.actionTarget })
  }
}

function goBack(): void {
  uni.navigateBack()
}

function formatTime(value: string): string {
  const date = new Date(value)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`
  if (date.toDateString() === now.toDateString()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function categoryFor(category: ConsumerMessageCategory) {
  return categoryMeta.find(({ id }) => id === category) ?? categoryMeta[4]!
}

onMounted(load)
</script>

<template>
  <view class="message-page">
    <header class="page-header">
      <button class="back-button" hover-class="tap" @click="goBack">←</button>
      <view class="header-title">
        <text class="eyebrow">MESSAGE CENTER</text>
        <text class="title">消息</text>
      </view>
      <button class="unread-filter" :class="{ active: unreadOnly }" hover-class="tap" @click="toggleUnread">
        <text class="filter-dot" />只看未读
      </button>
    </header>

    <main class="content">
      <section class="summary-card">
        <view class="summary-orb"><text>✦</text></view>
        <view>
          <text class="summary-number">{{ overview?.unreadCount ?? 0 }}</text>
          <text class="summary-label">条未读消息</text>
        </view>
        <text class="summary-copy">重要进度、服务提醒和家庭协作，都集中在这里。</text>
      </section>

      <scroll-view class="category-scroll" scroll-x :show-scrollbar="false">
        <view class="category-row">
          <button
            v-for="category in categoryMeta"
            :key="category.id"
            class="category-chip"
            :class="{ active: activeCategory === category.id }"
            hover-class="tap"
            @click="selectCategory(category.id)"
          >
            <text>{{ category.label }}</text>
            <text
              v-if="overview?.categoryCounts.find((item) => item.category === category.id)?.unread"
              class="chip-count"
            >
              {{ overview?.categoryCounts.find((item) => item.category === category.id)?.unread }}
            </text>
          </button>
        </view>
      </scroll-view>

      <view class="list-heading">
        <text>{{ categoryMeta.find(({ id }) => id === activeCategory)?.label }}消息</text>
        <text>{{ activeCount.total }} 条</text>
      </view>

      <view v-if="loading" class="state-card">
        <view class="loading-dot" /><view class="loading-dot delay-one" /><view class="loading-dot delay-two" />
        <text>正在同步消息</text>
      </view>
      <view v-else-if="errorMessage" class="state-card error">
        <text class="state-icon">!</text>
        <text>{{ errorMessage }}</text>
        <button @click="load">重新加载</button>
      </view>
      <view v-else-if="!overview?.messages.length" class="state-card empty">
        <text class="state-icon">✓</text>
        <text class="empty-title">{{ unreadOnly ? '未读已经清空' : '这里暂时很安静' }}</text>
        <text class="empty-copy">新的服务进度会第一时间出现在这里</text>
      </view>
      <view v-else class="message-list">
        <button
          v-for="message in overview.messages"
          :key="message.id"
          class="message-card"
          :class="{ unread: !message.read }"
          hover-class="card-tap"
          @click="openMessage(message)"
        >
          <view class="message-icon" :class="`category-${message.category.toLowerCase()}`">
            {{ categoryFor(message.category).icon }}
          </view>
          <view class="message-main">
            <view class="message-topline">
              <view class="message-title-row">
                <text v-if="!message.read" class="unread-dot" />
                <text class="message-title">{{ message.title }}</text>
              </view>
              <text class="message-time">{{ formatTime(message.createdAt) }}</text>
            </view>
            <text class="message-body">{{ message.body }}</text>
            <view v-if="message.actionLabel" class="message-action">
              <text>{{ message.actionLabel }}</text><text>→</text>
            </view>
          </view>
        </button>
      </view>

      <view class="privacy-note">
        <text>盾</text>
        <view>
          <text class="privacy-title">消息内容归你所有</text>
          <text class="privacy-copy">家庭成员之间按权限隔离，已读操作保留审计记录。</text>
        </view>
      </view>
    </main>
  </view>
</template>

<style scoped lang="scss">
.message-page { min-height: 100vh; background: radial-gradient(circle at 100% 0%, #dff7ed 0, transparent 28%), #f5f8f5; color: #1a261f; }
.page-header { display: flex; height: calc(72px + env(safe-area-inset-top)); align-items: flex-end; padding: env(safe-area-inset-top) 18px 13px; }
.back-button { display: flex; width: 39px; height: 39px; align-items: center; justify-content: center; border: 1px solid rgba(30,60,47,.06); border-radius: 14px; background: rgba(255,255,255,.82); color: #26362e; font-size: 20px; }
.header-title { flex: 1; margin-left: 13px; }
.eyebrow, .title { display: block; }
.eyebrow { color: #39846e; font-size: 8px; font-weight: 950; letter-spacing: .15em; }
.title { margin-top: 2px; font-size: 23px; font-weight: 950; letter-spacing: -.04em; }
.unread-filter { display: flex; height: 36px; align-items: center; gap: 6px; padding: 0 11px; border-radius: 999px; background: rgba(255,255,255,.75); color: #7b877f; font-size: 10px; font-weight: 800; }
.unread-filter.active { background: #1a725b; color: white; }
.filter-dot { width: 6px; height: 6px; border-radius: 50%; background: #e5685b; }
.content { padding: 11px 18px 45px; }
.summary-card { position: relative; display: flex; overflow: hidden; min-height: 118px; align-items: center; padding: 21px; border-radius: 25px; background: linear-gradient(135deg,#173d33,#215947); box-shadow: 0 17px 38px rgba(20,64,50,.2); color: white; }
.summary-card::after { position: absolute; right: -45px; bottom: -75px; width: 160px; height: 160px; border: 1px solid rgba(255,255,255,.1); border-radius: 50%; box-shadow: 0 0 0 25px rgba(255,255,255,.025); content: ''; }
.summary-orb { display: flex; width: 47px; height: 47px; flex: none; align-items: center; justify-content: center; margin-right: 14px; border: 1px solid rgba(255,255,255,.13); border-radius: 16px; background: rgba(255,255,255,.08); color: #99e6ca; }
.summary-number { display: block; font-size: 27px; font-weight: 950; }
.summary-label { display: block; margin-top: -3px; color: #b8d8cb; font-size: 10px; }
.summary-copy { max-width: 135px; margin-left: auto; color: rgba(255,255,255,.57); font-size: 9px; line-height: 1.6; }
.category-scroll { width: calc(100% + 36px); margin: 17px -18px 0; white-space: nowrap; }
.category-row { display: inline-flex; gap: 8px; padding: 0 18px 4px; }
.category-chip { display: flex; height: 38px; align-items: center; gap: 6px; padding: 0 14px; border: 1px solid rgba(27,55,43,.06); border-radius: 999px; background: rgba(255,255,255,.86); color: #758178; font-size: 10px; font-weight: 850; }
.category-chip.active { border-color: #1b725c; background: #1b725c; box-shadow: 0 8px 17px rgba(27,114,92,.18); color: white; }
.chip-count { display: flex; min-width: 16px; height: 16px; align-items: center; justify-content: center; padding: 0 4px; border-radius: 999px; background: #eb6a5c; color: white; font-size: 8px; }
.category-chip.active .chip-count { background: white; color: #1b725c; }
.list-heading { display: flex; align-items: center; justify-content: space-between; margin: 24px 2px 11px; }
.list-heading text:first-child { font-size: 17px; font-weight: 950; }
.list-heading text:last-child { color: #98a29c; font-size: 9px; }
.message-list { display: flex; flex-direction: column; gap: 9px; }
.message-card { display: flex; width: 100%; padding: 15px; border: 1px solid rgba(28,58,45,.05); border-radius: 21px; background: rgba(255,255,255,.75); text-align: left; }
.message-card.unread { background: white; box-shadow: 0 10px 25px rgba(39,70,56,.07); }
.message-icon { display: flex; width: 42px; height: 42px; flex: none; align-items: center; justify-content: center; border-radius: 14px; background: #e5f6ee; color: #26755f; font-size: 11px; font-weight: 950; }
.category-transaction { background: #e5f6ee; color: #26755f; }
.category-service { background: #fff1db; color: #a56a19; }
.category-family { background: #eee8ff; color: #7553b4; }
.category-system { background: #e8eff5; color: #587083; }
.message-main { flex: 1; min-width: 0; margin-left: 12px; }
.message-topline, .message-title-row { display: flex; align-items: flex-start; }
.message-topline { justify-content: space-between; gap: 7px; }
.message-title-row { flex: 1; min-width: 0; }
.unread-dot { width: 6px; height: 6px; flex: none; margin: 6px 6px 0 0; border-radius: 50%; background: #e96154; box-shadow: 0 0 0 4px rgba(233,97,84,.08); }
.message-title { display: -webkit-box; overflow: hidden; color: #29372f; font-size: 13px; font-weight: 900; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.message-time { flex: none; color: #a0aaa3; font-size: 8px; line-height: 1.9; }
.message-body { display: -webkit-box; margin-top: 7px; overflow: hidden; color: #7e8982; font-size: 10px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.message-action { display: flex; align-items: center; justify-content: space-between; margin-top: 11px; padding-top: 10px; border-top: 1px solid #eef1ee; color: #26745e; font-size: 9px; font-weight: 900; }
.state-card { display: flex; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; border-radius: 22px; background: white; color: #8a958e; font-size: 10px; }
.state-card.error button { margin-top: 12px; padding: 9px 15px; border-radius: 11px; background: #1b725c; color: white; font-size: 9px; font-weight: 900; }
.state-icon { display: flex; width: 42px; height: 42px; align-items: center; justify-content: center; margin-bottom: 11px; border-radius: 14px; background: #e7f5ef; color: #258166; font-size: 17px; font-weight: 950; }
.error .state-icon { background: #fff0ed; color: #e26656; }
.empty-title { margin-top: 2px; color: #425047; font-size: 13px; font-weight: 900; }
.empty-copy { margin-top: 5px; color: #9aa39d; font-size: 9px; }
.loading-dot { width: 7px; height: 7px; margin: 2px; border-radius: 50%; background: #2b856b; animation: blink 1s infinite; }
.delay-one { animation-delay: .15s; }.delay-two { margin-bottom: 12px; animation-delay: .3s; }
.privacy-note { display: flex; align-items: center; gap: 10px; margin-top: 22px; padding: 14px; border-radius: 17px; background: rgba(229,240,234,.72); }
.privacy-note > text { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 11px; background: white; color: #39816c; font-size: 9px; font-weight: 900; }
.privacy-title, .privacy-copy { display: block; }
.privacy-title { color: #536158; font-size: 10px; font-weight: 900; }
.privacy-copy { margin-top: 3px; color: #8a958e; font-size: 8px; }
.tap, .card-tap { opacity: .72; transform: scale(.985); }
@keyframes blink { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
@media (min-width: 680px) { .content, .page-header { max-width: 720px; margin: 0 auto; } }
</style>
