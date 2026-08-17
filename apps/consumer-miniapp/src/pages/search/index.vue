<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  fetchConsumerHome,
  searchConsumerServices,
  type ConsumerHomeOverview,
  type ConsumerSearchOverview,
} from '../../services/consumer'

type ResultFilter = 'ALL' | 'MERCHANT' | 'SERVICE' | 'PRODUCT'

const home = ref<ConsumerHomeOverview | null>(null)
const result = ref<ConsumerSearchOverview | null>(null)
const query = ref('')
const searchedQuery = ref('')
const loading = ref(false)
const initializing = ref(true)
const errorMessage = ref('')
const activeType = ref<ResultFilter>('ALL')

const visibleResults = computed(() => {
  if (!result.value) return []
  if (activeType.value === 'ALL') return result.value.results
  return result.value.results.filter(({ type }) => type === activeType.value)
})

const suggestions = computed(() =>
  result.value?.suggestedQueries ?? home.value?.searchHot ?? [])

const recentQueries = computed(() => result.value?.recentQueries ?? [])

async function initialize(initialQuery: string): Promise<void> {
  initializing.value = true
  try {
    home.value = await fetchConsumerHome()
    if (initialQuery.trim()) await search(initialQuery)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '搜索服务加载失败'
  } finally {
    initializing.value = false
  }
}

async function search(searchQuery = query.value): Promise<void> {
  const normalized = searchQuery.trim()
  if (!normalized) {
    uni.showToast({ title: '先告诉我你想找什么', icon: 'none' })
    return
  }
  if (!home.value || loading.value) return
  query.value = normalized
  loading.value = true
  errorMessage.value = ''
  activeType.value = 'ALL'
  try {
    result.value = await searchConsumerServices({
      query: normalized,
      cityId: home.value.city.id,
      householdMemberId: home.value.household.activeMember.id,
    })
    searchedQuery.value = normalized
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '搜索失败'
  } finally {
    loading.value = false
  }
}

function clearSearch(): void {
  query.value = ''
  result.value = null
  searchedQuery.value = ''
  errorMessage.value = ''
}

function goBack(): void {
  uni.navigateBack()
}

function openTarget(target: string): void {
  if (target.startsWith('/pages/')) uni.navigateTo({ url: target })
}

function formatPrice(value: number | null): string {
  if (value === null) return '到店了解'
  return `¥${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}`
}

function formatDistance(value: number): string {
  return value < 1000 ? `${value}m` : `${(value / 1000).toFixed(1)}km`
}

const typeLabels: Array<{ type: ResultFilter; label: string }> = [
  { type: 'ALL', label: '全部' },
  { type: 'MERCHANT', label: '门店' },
  { type: 'SERVICE', label: '服务' },
  { type: 'PRODUCT', label: '商品' },
]

onLoad((options) => {
  const initialQuery = typeof options?.query === 'string'
    ? decodeURIComponent(options.query)
    : ''
  query.value = initialQuery
  void initialize(initialQuery)
})
</script>

<template>
  <view class="search-page">
    <header class="search-header">
      <button class="back-button" hover-class="tap" @click="goBack">←</button>
      <view class="search-box">
        <text class="search-icon">⌕</text>
        <input
          v-model="query"
          class="search-input"
          focus
          confirm-type="search"
          placeholder="一句话告诉我你的需要"
          placeholder-class="search-placeholder"
          @confirm="search()"
        />
        <button v-if="query" class="clear-button" @click="clearSearch">×</button>
      </view>
      <button class="search-button" :disabled="loading" hover-class="tap" @click="search()">搜索</button>
    </header>

    <main class="content">
      <view v-if="initializing" class="initial-state">
        <view class="search-orb"><text>✦</text></view>
        <text>正在建立你的生活上下文…</text>
      </view>

      <template v-else>
        <section v-if="!result && !loading" class="discovery">
          <view class="context-card">
            <view class="context-ai"><text>✦</text></view>
            <view class="context-copy">
              <text class="context-title">为 {{ home?.household.activeMember.name }} 搜索</text>
              <text class="context-subtitle">{{ home?.city.name }} · {{ home?.household.activeMember.subtitle }}</text>
            </view>
            <text class="private-chip">私密</text>
          </view>

          <section class="suggestion-section">
            <view class="section-heading">
              <view><text class="eyebrow">INSPIRED SEARCH</text><text class="section-title">或许你想找</text></view>
            </view>
            <view class="suggestion-grid">
              <button
                v-for="(suggestion, index) in suggestions"
                :key="suggestion"
                class="suggestion-card"
                hover-class="card-tap"
                @click="search(suggestion)"
              >
                <view class="suggestion-index">0{{ index + 1 }}</view>
                <text class="suggestion-text">{{ suggestion }}</text>
                <text class="suggestion-arrow">↗</text>
              </button>
            </view>
          </section>

          <section v-if="recentQueries.length" class="recent-section">
            <view class="section-heading">
              <view><text class="eyebrow">RECENT</text><text class="section-title">最近搜索</text></view>
            </view>
            <view class="recent-tags">
              <button v-for="item in recentQueries" :key="item" @click="search(item)">
                <text>◷</text>{{ item }}
              </button>
            </view>
          </section>

          <view class="principle-card">
            <view class="principle-icon">盾</view>
            <view>
              <text class="principle-title">搜索由真实授权内容驱动</text>
              <text class="principle-copy">不做付费竞价排名；查询词只留在你的个人历史中。</text>
            </view>
          </view>
        </section>

        <view v-if="loading" class="loading-state">
          <view class="scan-line" />
          <view class="search-orb"><text>✦</text></view>
          <text class="loading-title">正在为你理解“{{ query }}”</text>
          <text class="loading-copy">核对城市、家庭偏好和已授权服务</text>
        </view>

        <section v-else-if="result" class="result-section">
          <view class="result-summary">
            <view>
              <text class="result-kicker">{{ result.city.name }} · {{ result.activeMember.name }}</text>
              <text class="result-title">关于“{{ searchedQuery }}”</text>
              <text class="result-copy">找到 {{ result.resultCount }} 个真实结果，按匹配度与距离排序</text>
            </view>
            <view class="result-count">{{ result.resultCount }}</view>
          </view>

          <scroll-view class="type-scroll" scroll-x :show-scrollbar="false">
            <view class="type-row">
              <button
                v-for="tab in typeLabels"
                :key="tab.type"
                class="type-chip"
                :class="{ active: activeType === tab.type }"
                @click="activeType = tab.type"
              >
                <text>{{ tab.label }}</text>
                <text>{{ result.typeCounts.find(({ type }) => type === tab.type)?.count ?? 0 }}</text>
              </button>
            </view>
          </scroll-view>

          <view v-if="errorMessage" class="error-banner"><text>!</text>{{ errorMessage }}</view>

          <view v-if="!visibleResults.length" class="empty-results">
            <view class="empty-icon">⌕</view>
            <text class="empty-title">暂时没有合适结果</text>
            <text class="empty-copy">我们不会为了填满页面而伪造门店或库存，换个说法试试。</text>
            <view class="empty-suggestions">
              <button v-for="suggestion in result.suggestedQueries.slice(0, 3)" :key="suggestion" @click="search(suggestion)">
                {{ suggestion }}
              </button>
            </view>
          </view>

          <view v-else class="result-list">
            <button
              v-for="item in visibleResults"
              :key="`${item.type}-${item.id}`"
              class="result-card"
              hover-class="card-tap"
              @click="openTarget(item.actionTarget)"
            >
              <view class="result-visual" :class="`visual-${item.type.toLowerCase()}`">
                <view class="visual-orbit" />
                <text>{{ item.type === 'MERCHANT' ? '店' : item.type === 'SERVICE' ? '服' : '物' }}</text>
                <view class="type-badge">{{ item.type === 'MERCHANT' ? '门店' : item.type === 'SERVICE' ? '服务' : '商品' }}</view>
              </view>
              <view class="result-main">
                <view class="result-topline">
                  <text class="item-title">{{ item.title }}</text>
                  <text class="distance">{{ formatDistance(item.distanceMeters) }}</text>
                </view>
                <text v-if="item.type !== 'MERCHANT'" class="merchant-name">{{ item.merchantName }}</text>
                <text class="item-subtitle">{{ item.subtitle }}</text>
                <view class="badges">
                  <text v-for="badge in item.badges.slice(0, 3)" :key="badge">{{ badge }}</text>
                </view>
                <view class="reason">
                  <text class="reason-star">✦</text>
                  <text>{{ item.reason }}</text>
                </view>
                <view class="item-footer">
                  <view class="rating"><text>★</text>{{ item.rating }} <text class="reviews">({{ item.reviewCount }})</text></view>
                  <view class="price">
                    <text>{{ formatPrice(item.priceFen) }}</text>
                    <text v-if="item.compareAtFen" class="compare-price">{{ formatPrice(item.compareAtFen) }}</text>
                    <text v-if="item.priceFen !== null" class="price-unit">起</text>
                  </view>
                </view>
              </view>
            </button>
          </view>

          <view class="result-trust">
            <text>✓</text>
            <text>仅展示已发布、已授权且目录有效的内容</text>
          </view>
        </section>
      </template>
    </main>
  </view>
</template>

<style scoped lang="scss">
.search-page { min-height: 100vh; background: radial-gradient(circle at 88% 0%, rgba(190,241,222,.75), transparent 29%), #f5f8f5; color: #19251e; }
.search-header { position: sticky; z-index: 5; top: 0; display: flex; height: calc(69px + env(safe-area-inset-top)); align-items: flex-end; gap: 9px; padding: env(safe-area-inset-top) 16px 12px; background: rgba(247,250,247,.87); backdrop-filter: blur(18px); }
.back-button { display: flex; width: 39px; height: 43px; flex: none; align-items: center; justify-content: center; border-radius: 14px; color: #304037; font-size: 20px; }
.search-box { display: flex; height: 43px; flex: 1; min-width: 0; align-items: center; padding: 0 11px; border: 1px solid rgba(31,66,50,.08); border-radius: 15px; background: white; box-shadow: 0 8px 20px rgba(40,74,59,.06); }
.search-icon { margin-right: 7px; color: #347863; font-size: 21px; }
.search-input { flex: 1; min-width: 0; height: 43px; color: #233128; font-size: 13px; font-weight: 750; }
.search-placeholder { color: #a0aaa4; font-size: 12px; font-weight: 500; }
.clear-button { display: flex; width: 23px; height: 23px; align-items: center; justify-content: center; border-radius: 50%; background: #edf1ed; color: #859088; font-size: 15px; }
.search-button { height: 43px; flex: none; padding: 0 8px; color: #216f58; font-size: 12px; font-weight: 950; }
.content { padding: 8px 17px 46px; }
.context-card { display: flex; align-items: center; padding: 15px; border: 1px solid rgba(30,61,47,.055); border-radius: 20px; background: rgba(255,255,255,.78); }
.context-ai, .search-orb { display: flex; width: 42px; height: 42px; flex: none; align-items: center; justify-content: center; border-radius: 14px; background: #193f34; color: #9ce5ca; }
.context-copy { flex: 1; min-width: 0; margin-left: 11px; }
.context-title, .context-subtitle { display: block; }
.context-title { color: #2c3b32; font-size: 12px; font-weight: 900; }
.context-subtitle { margin-top: 4px; overflow: hidden; color: #89938d; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.private-chip { padding: 5px 8px; border-radius: 999px; background: #eaf5f0; color: #3a7966; font-size: 8px; font-weight: 850; }
.suggestion-section, .recent-section { margin-top: 27px; }
.section-heading { margin: 0 2px 12px; }
.eyebrow, .section-title { display: block; }
.eyebrow { color: #3a866f; font-size: 8px; font-weight: 950; letter-spacing: .15em; }
.section-title { margin-top: 4px; font-size: 21px; font-weight: 950; letter-spacing: -.035em; }
.suggestion-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 9px; }
.suggestion-card { position: relative; overflow: hidden; min-height: 105px; padding: 14px; border: 1px solid rgba(29,60,46,.05); border-radius: 19px; background: white; box-shadow: 0 8px 22px rgba(41,72,58,.055); text-align: left; }
.suggestion-card:nth-child(2n) { background: linear-gradient(145deg,#fbf7ff,#fff); }
.suggestion-card:nth-child(3n) { background: linear-gradient(145deg,#fff8ea,#fff); }
.suggestion-index { color: #afbab3; font-size: 8px; font-weight: 900; letter-spacing: .08em; }
.suggestion-text { display: block; max-width: 120px; margin-top: 15px; color: #344239; font-size: 13px; font-weight: 900; line-height: 1.4; }
.suggestion-arrow { position: absolute; right: 13px; bottom: 12px; color: #5f8a7c; font-size: 15px; }
.recent-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.recent-tags button { display: flex; align-items: center; gap: 5px; padding: 9px 11px; border: 1px solid rgba(32,65,50,.05); border-radius: 999px; background: rgba(255,255,255,.8); color: #68746c; font-size: 9px; }
.recent-tags text { color: #3b806a; }
.principle-card { display: flex; align-items: center; gap: 11px; margin-top: 29px; padding: 15px; border-radius: 18px; background: #eaf2ed; }
.principle-icon { display: flex; width: 36px; height: 36px; flex: none; align-items: center; justify-content: center; border-radius: 12px; background: white; color: #3c7b67; font-size: 9px; font-weight: 900; }
.principle-title, .principle-copy { display: block; }
.principle-title { color: #536158; font-size: 10px; font-weight: 900; }
.principle-copy { margin-top: 4px; color: #89948c; font-size: 8px; line-height: 1.5; }
.initial-state, .loading-state { position: relative; display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: #849087; font-size: 10px; }
.initial-state .search-orb, .loading-state .search-orb { width: 58px; height: 58px; margin-bottom: 17px; border-radius: 20px; box-shadow: 0 14px 30px rgba(25,63,52,.19); font-size: 19px; }
.loading-title { color: #334139; font-size: 15px; font-weight: 900; }
.loading-copy { margin-top: 6px; color: #909a93; font-size: 9px; }
.scan-line { position: absolute; top: 20%; width: 100%; height: 1px; background: linear-gradient(90deg,transparent,#55ae91,transparent); animation: scan 1.8s infinite ease-in-out; }
.result-summary { display: flex; align-items: center; justify-content: space-between; padding: 16px 4px 13px; }
.result-kicker, .result-title, .result-copy { display: block; }
.result-kicker { color: #41836f; font-size: 8px; font-weight: 950; letter-spacing: .08em; }
.result-title { margin-top: 6px; font-size: 22px; font-weight: 950; letter-spacing: -.04em; }
.result-copy { margin-top: 5px; color: #909a94; font-size: 9px; }
.result-count { display: flex; width: 49px; height: 49px; align-items: center; justify-content: center; border-radius: 17px; background: #193f34; box-shadow: 0 9px 21px rgba(25,63,52,.17); color: #a9ead2; font-size: 19px; font-weight: 950; }
.type-scroll { width: calc(100% + 34px); margin: 3px -17px 14px; white-space: nowrap; }
.type-row { display: inline-flex; gap: 8px; padding: 0 17px 4px; }
.type-chip { display: flex; height: 37px; align-items: center; gap: 8px; padding: 0 13px; border: 1px solid rgba(28,59,45,.06); border-radius: 999px; background: rgba(255,255,255,.82); color: #758078; font-size: 9px; font-weight: 850; }
.type-chip text:last-child { display: flex; min-width: 17px; height: 17px; align-items: center; justify-content: center; padding: 0 4px; border-radius: 999px; background: #edf1ee; color: #8a958e; font-size: 8px; }
.type-chip.active { background: #1a705a; color: white; }
.type-chip.active text:last-child { background: rgba(255,255,255,.18); color: white; }
.result-list { display: flex; flex-direction: column; gap: 11px; }
.result-card { display: flex; width: 100%; overflow: hidden; padding: 12px; border: 1px solid rgba(29,59,45,.05); border-radius: 22px; background: white; box-shadow: 0 9px 24px rgba(41,73,58,.065); text-align: left; }
.result-visual { position: relative; display: flex; width: 96px; min-height: 154px; flex: none; align-items: center; justify-content: center; overflow: hidden; border-radius: 17px; background: linear-gradient(145deg,#d9f3e9,#b5dbc8); color: #246b57; font-size: 24px; font-weight: 950; }
.visual-service { background: linear-gradient(145deg,#e8e0ff,#c9b9ef); color: #6d4baa; }
.visual-product { background: linear-gradient(145deg,#ffeed3,#ebcc94); color: #976421; }
.visual-orbit { position: absolute; width: 105px; height: 105px; border: 1px solid rgba(255,255,255,.52); border-radius: 50%; box-shadow: 0 0 0 19px rgba(255,255,255,.13); }
.type-badge { position: absolute; bottom: 8px; left: 8px; padding: 5px 7px; border-radius: 999px; background: rgba(255,255,255,.79); color: inherit; font-size: 8px; font-weight: 900; backdrop-filter: blur(8px); }
.result-main { flex: 1; min-width: 0; margin-left: 12px; }
.result-topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 7px; }
.item-title { flex: 1; overflow: hidden; color: #29372f; font-size: 14px; font-weight: 950; text-overflow: ellipsis; white-space: nowrap; }
.distance { flex: none; color: #96a098; font-size: 8px; }
.merchant-name { display: block; margin-top: 4px; color: #46806f; font-size: 9px; font-weight: 800; }
.item-subtitle { display: -webkit-box; margin-top: 5px; overflow: hidden; color: #89938c; font-size: 8px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.badges { display: flex; gap: 5px; margin-top: 7px; overflow: hidden; }
.badges text { flex: none; padding: 4px 6px; border-radius: 6px; background: #eef6f2; color: #3e7866; font-size: 7px; font-weight: 800; }
.reason { display: flex; align-items: flex-start; gap: 5px; margin-top: 8px; padding: 7px; border-radius: 9px; background: #f6f8f6; color: #78837b; font-size: 7px; line-height: 1.4; }
.reason-star { flex: none; color: #329174; }
.item-footer { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 9px; }
.rating { color: #59665d; font-size: 8px; font-weight: 800; }
.rating > text:first-child { color: #efaa3e; }
.reviews { color: #a0aaa3; font-weight: 500; }
.price { display: flex; align-items: baseline; gap: 3px; color: #d45c48; }
.price > text:first-child { font-size: 14px; font-weight: 950; }
.compare-price { color: #a7afa9; font-size: 8px; text-decoration: line-through; }
.price-unit { color: #8b958e; font-size: 7px; }
.empty-results { display: flex; min-height: 350px; flex-direction: column; align-items: center; justify-content: center; padding: 25px; text-align: center; }
.empty-icon { display: flex; width: 58px; height: 58px; align-items: center; justify-content: center; border-radius: 19px; background: #e9f3ee; color: #5a8b79; font-size: 24px; }
.empty-title { margin-top: 16px; font-size: 15px; font-weight: 950; }
.empty-copy { max-width: 255px; margin-top: 7px; color: #909a94; font-size: 9px; line-height: 1.6; }
.empty-suggestions { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; margin-top: 15px; }
.empty-suggestions button { padding: 8px 10px; border-radius: 999px; background: white; color: #4f7568; font-size: 8px; }
.result-trust { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 23px; color: #99a39c; font-size: 8px; }
.result-trust text:first-child { display: flex; width: 15px; height: 15px; align-items: center; justify-content: center; border: 1px solid #b3bcb6; border-radius: 50%; font-size: 7px; }
.error-banner { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; padding: 10px; border-radius: 12px; background: #fff0ed; color: #c96051; font-size: 9px; }
.error-banner text { display: flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 50%; background: #dc6a5a; color: white; font-size: 8px; font-weight: 950; }
.tap, .card-tap { opacity: .72; transform: scale(.985); }
@keyframes scan { 0% { top: 25%; opacity: 0; } 30% { opacity: 1; } 100% { top: 75%; opacity: 0; } }
@media (min-width: 680px) { .content, .search-header { max-width: 760px; margin: 0 auto; } .suggestion-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
