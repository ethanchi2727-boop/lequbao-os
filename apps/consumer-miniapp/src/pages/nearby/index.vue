<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchConsumerNearby,
  type ConsumerNearbyOverview,
} from '../../services/consumer'

type ViewMode = 'LIST' | 'MAP'
type LocationState = 'IDLE' | 'LOCATING' | 'GRANTED' | 'DENIED' | 'UNAVAILABLE'

interface EphemeralLocation {
  latitude: number
  longitude: number
  accuracyMeters?: number
}

const overview = ref<ConsumerNearbyOverview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const viewMode = ref<ViewMode>('LIST')
const locationState = ref<LocationState>('IDLE')
const ephemeralLocation = ref<EphemeralLocation | null>(null)

const locatedStoreCount = computed(() =>
  overview.value?.map.points.length ?? 0)

async function load(location?: EphemeralLocation): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const context = overview.value
    overview.value = await fetchConsumerNearby({
      ...(context ? {
        cityId: context.city.id,
        householdMemberId: context.activeMember.id,
      } : {}),
      ...(location ? { location } : {}),
      limit: 20,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '附近服务加载失败'
  } finally {
    loading.value = false
  }
}

function requestCurrentLocation(): void {
  if (locationState.value === 'LOCATING') return
  locationState.value = 'LOCATING'
  uni.getLocation({
    type: 'gcj02',
    isHighAccuracy: true,
    highAccuracyExpireTime: 5000,
    success: async (result) => {
      const location: EphemeralLocation = {
        latitude: result.latitude,
        longitude: result.longitude,
        accuracyMeters: result.accuracy,
      }
      ephemeralLocation.value = location
      locationState.value = 'GRANTED'
      await load(location)
      if (!errorMessage.value) {
        uni.showToast({ title: '已按当前位置排序', icon: 'success' })
      }
    },
    fail: async (result) => {
      const message = result.errMsg.toLocaleLowerCase()
      locationState.value = message.includes('deny') || message.includes('auth')
        ? 'DENIED'
        : 'UNAVAILABLE'
      ephemeralLocation.value = null
      await load()
      uni.showToast({
        title: locationState.value === 'DENIED'
          ? '已保留城市浏览模式'
          : '定位不可用，已显示城市好店',
        icon: 'none',
      })
    },
  })
}

function formatDistance(value: number | null): string {
  if (value === null) return '城市精选'
  if (value < 1000) return `直线 ${value}m`
  return `直线 ${(value / 1000).toFixed(1)}km`
}

function openStore(target: string): void {
  if (!target.startsWith('/pages/')) return
  uni.navigateTo({ url: target })
}

function goHome(): void {
  uni.reLaunch({ url: '/pages/index/index' })
}

function openAssistant(): void {
  uni.navigateTo({ url: '/pages/assistant/index' })
}

function openModule(path: string): void {
  uni.navigateTo({ url: `/pages/module/index?path=${encodeURIComponent(path)}` })
}

function markerStyle(latitude: number, longitude: number): Record<string, string> {
  const points = overview.value?.map.points ?? []
  const coordinates = [
    ...points.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
    ...(ephemeralLocation.value ? [ephemeralLocation.value] : []),
  ]
  if (!coordinates.length) return { left: '50%', top: '50%' }
  const latitudes = coordinates.map((point) => point.latitude)
  const longitudes = coordinates.map((point) => point.longitude)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.006)
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.006)
  const x = 10 + ((longitude - minLongitude) / longitudeSpan) * 80
  const y = 90 - ((latitude - minLatitude) / latitudeSpan) * 80
  return {
    left: `${Math.max(8, Math.min(92, x))}%`,
    top: `${Math.max(8, Math.min(92, y))}%`,
  }
}

onMounted(() => load())
</script>

<template>
  <view class="nearby-page">
    <view class="ambient ambient-one" />
    <view class="ambient ambient-two" />

    <header class="nearby-header">
      <button class="back-button" hover-class="tap" @click="goHome">←</button>
      <view class="header-copy">
        <text class="header-title">附近</text>
        <text class="header-subtitle">已授权真实门店</text>
      </view>
      <view class="privacy-mark">⌖</view>
    </header>

    <view v-if="loading && !overview" class="state-page">
      <view class="loading-orb">⌖</view>
      <text class="state-title">正在读取城市好店</text>
      <text class="state-copy">默认不需要精确位置，也不会保存你的位置</text>
    </view>

    <view v-else-if="errorMessage && !overview" class="state-page">
      <view class="error-symbol">!</view>
      <text class="state-title">附近服务暂时不可用</text>
      <text class="state-copy">{{ errorMessage }}</text>
      <button class="primary-button compact" @click="load()">重新加载</button>
    </view>

    <template v-else-if="overview">
      <main class="nearby-content">
        <section class="location-card">
          <view>
            <text class="location-kicker">
              {{ overview.mode === 'LOCATION' ? 'LOCATION ACTIVE' : 'CITY FALLBACK' }}
            </text>
            <text class="location-title">
              {{ overview.mode === 'LOCATION' ? '已按当前位置排序' : `${overview.city.name}城市浏览` }}
            </text>
            <text class="location-copy">{{ overview.notice }}</text>
          </view>
          <button
            class="location-button"
            :disabled="locationState === 'LOCATING'"
            @click="requestCurrentLocation"
          >
            {{ locationState === 'LOCATING' ? '定位中…' : overview.mode === 'LOCATION' ? '重新定位' : '使用当前位置' }}
          </button>
          <view v-if="locationState === 'DENIED'" class="location-feedback">
            <text>未获得定位权限</text>
            <text>你仍可浏览城市好店和门店分布；可在系统设置中授权后重试。</text>
          </view>
          <view v-else-if="locationState === 'UNAVAILABLE'" class="location-feedback">
            <text>当前设备无法定位</text>
            <text>已自动降级为城市浏览，不会使用默认坐标冒充你的位置。</text>
          </view>
          <view class="privacy-row">
            <text>✓</text>
            <text>精确位置仅用于本次排序，不落库、不进入审计与埋点</text>
          </view>
        </section>

        <section class="results-section">
          <view class="section-head">
            <view>
              <text class="section-kicker">DISCOVER NEARBY</text>
              <text class="section-title">{{ overview.stores.length }} 家真实门店</text>
            </view>
            <view class="view-switch">
              <button :class="{ active: viewMode === 'LIST' }" @click="viewMode = 'LIST'">列表</button>
              <button :class="{ active: viewMode === 'MAP' }" @click="viewMode = 'MAP'">分布</button>
            </view>
          </view>

          <view v-if="viewMode === 'MAP'" class="map-panel">
            <view class="map-grid">
              <view class="map-road road-one" />
              <view class="map-road road-two" />
              <view class="map-road road-three" />
              <view
                v-for="(point, index) in overview.map.points"
                :key="point.storeId"
                class="store-marker"
                :style="markerStyle(point.latitude, point.longitude)"
              >
                <text>{{ index + 1 }}</text>
              </view>
              <view
                v-if="ephemeralLocation"
                class="user-marker"
                :style="markerStyle(ephemeralLocation.latitude, ephemeralLocation.longitude)"
              >
                <text />
              </view>
              <view v-if="!locatedStoreCount" class="map-empty">当前门店暂无可信坐标</view>
            </view>
            <view class="map-legend">
              <text><i class="legend-store" />{{ locatedStoreCount }} 个可信门店位置</text>
              <text v-if="ephemeralLocation"><i class="legend-user" />本次位置</text>
            </view>
            <text class="map-boundary">门店位置事实分布 · 非导航地图 · 不提供路线和实时路程</text>
          </view>

          <view v-else class="store-list">
            <button
              v-for="(store, index) in overview.stores"
              :key="store.id"
              class="store-card"
              hover-class="card-tap"
              @click="openStore(store.actionTarget)"
            >
              <view class="store-number">{{ String(index + 1).padStart(2, '0') }}</view>
              <view class="store-main">
                <view class="store-topline">
                  <view>
                    <text class="store-name">{{ store.name }}</text>
                    <text class="store-meta">{{ store.category }} · {{ store.businessHours }}</text>
                  </view>
                  <view class="distance-pill" :class="{ located: store.distanceMeters !== null }">
                    {{ formatDistance(store.distanceMeters) }}
                  </view>
                </view>
                <text class="store-reason">{{ store.reason }}</text>
                <view class="badge-row">
                  <text v-for="badge in store.badges.slice(0, 3)" :key="badge">{{ badge }}</text>
                </view>
                <view class="store-footer">
                  <text>{{ store.address }}</text>
                  <text class="rating">★ {{ store.rating.toFixed(1) }} · {{ store.reviewCount }} 条</text>
                </view>
              </view>
            </button>
          </view>
        </section>

        <view class="trust-note">
          <text>✓</text>
          <text>无竞价排名 · 暂停展示与停业门店自动排除 · 无坐标门店不会出现在分布图</text>
        </view>
      </main>

      <nav class="bottom-nav">
        <button class="nav-item" @click="goHome"><text class="nav-icon">⌂</text><text>首页</text></button>
        <button class="nav-item active"><text class="nav-icon">⌖</text><text>附近</text></button>
        <button class="nav-ai" @click="openAssistant"><view><text>✦</text></view><text>问乐趣</text></button>
        <button class="nav-item" @click="openModule('family')"><text class="nav-icon">♧</text><text>家庭</text></button>
        <button class="nav-item" @click="openModule('profile')"><text class="nav-icon">○</text><text>我的</text></button>
      </nav>
    </template>
  </view>
</template>

<style scoped lang="scss">
.nearby-page {
  --ink: #17201b; --muted: #7c8880; --green: #167b64;
  position: relative; min-height: 100vh; overflow: hidden;
  background: radial-gradient(circle at 100% 0%, rgba(190,242,223,.75), transparent 30%), linear-gradient(180deg,#f9fcf9,#f3f7f3);
  color: var(--ink);
}
.ambient { position: absolute; border-radius: 50%; filter: blur(55px); pointer-events: none; }
.ambient-one { top: 350px; left: -120px; width: 250px; height: 250px; background: rgba(210,198,255,.26); }
.ambient-two { top: 800px; right: -130px; width: 260px; height: 260px; background: rgba(255,214,155,.2); }
.nearby-header {
  position: relative; z-index: 3; display: flex; width: 100%; height: calc(68px + env(safe-area-inset-top));
  align-items: flex-end; gap: 11px; padding: env(safe-area-inset-top) 18px 11px;
}
.back-button, .privacy-mark { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border: 1px solid rgba(23,32,27,.07); border-radius: 15px; background: rgba(255,255,255,.78); box-shadow: 0 8px 20px rgba(40,66,54,.07); }
.header-copy { flex: 1; }
.header-title, .header-subtitle { display: block; }
.header-title { font-size: 17px; font-weight: 950; }
.header-subtitle { margin-top: 2px; color: #88938c; font-size: 9px; }
.privacy-mark { border-radius: 50%; color: var(--green); font-size: 18px; }
.nearby-content { position: relative; z-index: 1; padding: 15px 18px calc(104px + env(safe-area-inset-bottom)); }
.location-card { position: relative; overflow: hidden; padding: 20px; border: 1px solid rgba(255,255,255,.9); border-radius: 25px; background: rgba(255,255,255,.9); box-shadow: 0 18px 45px rgba(40,72,56,.1); }
.location-kicker, .location-title, .location-copy { display: block; }
.location-kicker, .section-kicker { color: #32876e; font-size: 8px; font-weight: 950; letter-spacing: .15em; }
.location-title { margin-top: 7px; font-size: 22px; font-weight: 950; letter-spacing: -.03em; }
.location-copy { max-width: 92%; margin-top: 7px; color: var(--muted); font-size: 10px; line-height: 1.65; }
.location-button { width: 100%; height: 46px; margin-top: 16px; border-radius: 15px; background: #173e34; color: white; font-size: 12px; font-weight: 900; }
.location-button[disabled] { opacity: .55; }
.location-feedback { margin-top: 12px; padding: 12px; border-radius: 14px; background: #fff4e6; }
.location-feedback text { display: block; color: #8e6428; font-size: 9px; line-height: 1.55; }
.location-feedback text:first-child { margin-bottom: 3px; font-size: 11px; font-weight: 900; }
.privacy-row { display: flex; align-items: flex-start; gap: 7px; margin-top: 13px; color: #89948d; font-size: 8px; line-height: 1.5; }
.privacy-row text:first-child { display: flex; width: 15px; height: 15px; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #def4eb; color: #18765e; font-size: 8px; }
.results-section { margin-top: 27px; }
.section-head, .store-topline, .store-footer, .map-legend { display: flex; align-items: center; justify-content: space-between; }
.section-title { display: block; margin-top: 4px; font-size: 21px; font-weight: 950; letter-spacing: -.03em; }
.view-switch { display: flex; padding: 3px; border-radius: 12px; background: #e9eeea; }
.view-switch button { padding: 7px 10px; border-radius: 9px; color: #7f8983; font-size: 9px; font-weight: 850; }
.view-switch button.active { background: white; box-shadow: 0 4px 10px rgba(35,60,49,.08); color: #236c59; }
.store-list { margin-top: 13px; }
.store-card { display: flex; width: 100%; margin-bottom: 11px; padding: 16px; border: 1px solid rgba(28,56,44,.055); border-radius: 22px; background: rgba(255,255,255,.92); box-shadow: 0 9px 25px rgba(38,68,53,.06); text-align: left; }
.store-number { display: flex; width: 35px; height: 35px; flex: none; align-items: center; justify-content: center; border-radius: 12px; background: #e3f6ed; color: #1e765f; font-size: 9px; font-weight: 950; }
.store-main { min-width: 0; flex: 1; margin-left: 11px; }
.store-topline { align-items: flex-start; gap: 8px; }
.store-name, .store-meta, .store-reason { display: block; }
.store-name { font-size: 15px; font-weight: 950; }
.store-meta { margin-top: 4px; color: #8b958f; font-size: 8px; }
.distance-pill { flex: none; padding: 6px 8px; border-radius: 999px; background: #f1f3f1; color: #879089; font-size: 8px; font-weight: 900; }
.distance-pill.located { background: #dcf4ea; color: #19725b; }
.store-reason { margin-top: 11px; color: #66736b; font-size: 10px; line-height: 1.55; }
.badge-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.badge-row text { padding: 4px 7px; border-radius: 8px; background: #f1f5f2; color: #617068; font-size: 7px; font-weight: 800; }
.store-footer { gap: 8px; margin-top: 12px; padding-top: 11px; border-top: 1px solid #edf0ed; color: #929b95; font-size: 8px; }
.store-footer > text:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rating { flex: none; color: #966f29; font-weight: 850; }
.map-panel { margin-top: 13px; padding: 13px; border: 1px solid rgba(28,56,44,.055); border-radius: 23px; background: white; box-shadow: 0 9px 25px rgba(38,68,53,.06); }
.map-grid { position: relative; height: 370px; overflow: hidden; border-radius: 17px; background: linear-gradient(145deg,#edf4ef,#e6eee8); }
.map-grid::before { position: absolute; inset: 0; background-image: linear-gradient(rgba(51,92,72,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(51,92,72,.055) 1px,transparent 1px); background-size: 34px 34px; content: ''; }
.map-road { position: absolute; border-radius: 999px; background: rgba(255,255,255,.8); box-shadow: 0 0 0 1px rgba(77,103,89,.04); }
.road-one { top: 35%; left: -10%; width: 120%; height: 14px; transform: rotate(-12deg); }
.road-two { top: -10%; left: 46%; width: 12px; height: 120%; transform: rotate(9deg); }
.road-three { top: 68%; left: -5%; width: 110%; height: 9px; transform: rotate(18deg); }
.store-marker, .user-marker { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; transform: translate(-50%,-50%); }
.store-marker { width: 31px; height: 37px; border: 4px solid white; border-radius: 50% 50% 50% 12px; background: #176f59; box-shadow: 0 7px 15px rgba(18,78,60,.25); color: white; font-size: 9px; font-weight: 950; transform: translate(-50%,-50%) rotate(-45deg); }
.store-marker text { transform: rotate(45deg); }
.user-marker { width: 18px; height: 18px; border: 4px solid white; border-radius: 50%; background: #4c74e8; box-shadow: 0 0 0 7px rgba(76,116,232,.16); }
.user-marker text { width: 5px; height: 5px; border-radius: 50%; background: white; }
.map-empty { position: absolute; top: 50%; width: 100%; color: #86918a; font-size: 10px; text-align: center; }
.map-legend { justify-content: flex-start; gap: 16px; margin-top: 11px; color: #76827a; font-size: 8px; }
.map-legend text { display: flex; align-items: center; gap: 5px; }
.map-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.legend-store { background: #176f59; }.legend-user { background: #4c74e8; }
.map-boundary { display: block; margin-top: 9px; color: #9aa39e; font-size: 8px; text-align: center; }
.trust-note { display: flex; align-items: flex-start; justify-content: center; gap: 6px; margin: 25px 5px 0; color: #9aa49e; font-size: 8px; line-height: 1.5; text-align: center; }
.trust-note text:first-child { color: #23765f; font-weight: 900; }
.bottom-nav { position: fixed; z-index: 8; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5,1fr); height: calc(72px + env(safe-area-inset-bottom)); padding: 7px 10px env(safe-area-inset-bottom); border-top: 1px solid rgba(33,58,47,.06); background: rgba(252,254,252,.94); box-shadow: 0 -12px 35px rgba(30,63,48,.08); backdrop-filter: blur(20px); }
.nav-item,.nav-ai { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #9aa39d; font-size: 9px; font-weight: 750; }
.nav-icon { font-size: 19px; }.nav-item.active { color: #1a745e; }
.nav-ai { color: #326e5f; transform: translateY(-13px); }.nav-ai view { display: flex; width: 49px; height: 49px; align-items: center; justify-content: center; border: 5px solid #f7faf7; border-radius: 18px; background: linear-gradient(145deg,#1f8068,#153f34); box-shadow: 0 9px 22px rgba(24,91,72,.28); color: #bcf3df; font-size: 17px; }
.state-page { display: flex; min-height: calc(100vh - 68px); flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; }
.loading-orb,.error-symbol { display: flex; width: 65px; height: 65px; align-items: center; justify-content: center; border-radius: 23px; background: #193f35; box-shadow: 0 17px 35px rgba(25,63,53,.2); color: #9ce6ca; font-size: 22px; }
.error-symbol { background: #fff0ed; box-shadow: none; color: #dd6555; font-weight: 950; }
.state-title { margin-top: 20px; font-size: 20px; font-weight: 950; }.state-copy { margin-top: 7px; color: #8a948e; font-size: 11px; line-height: 1.6; }
.primary-button.compact { margin-top: 20px; padding: 12px 22px; border-radius: 14px; background: #193f35; color: white; font-size: 12px; font-weight: 900; }
.tap,.card-tap { opacity: .75; transform: scale(.985); }
@media (min-width: 680px) {
  .nearby-header,.nearby-content { max-width: 680px; margin: 0 auto; }
  .bottom-nav { right: 50%; left: auto; width: 680px; transform: translateX(50%); border-radius: 24px 24px 0 0; }
  .map-grid { height: 430px; }
}
</style>
