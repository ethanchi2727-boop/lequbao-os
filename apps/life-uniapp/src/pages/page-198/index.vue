<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const locating = ref(false);
const error = ref(null);
const stores = ref([]);
const cityCode = ref('');
const locationLabel = ref('选择城市或授权定位');
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: stores.value }),
);

async function load(query = '') {
  loading.value = true;
  error.value = null;
  try {
    stores.value = await lifeSession.request(`/api/v1/life/discovery/stores?limit=30${query}`);
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

async function useCity() {
  const code = cityCode.value.trim().slice(0, 20);
  locationLabel.value = code ? `城市 ${code}` : '全部已建立服务关系的城市';
  await load(code ? `&cityCode=${encodeURIComponent(code)}` : '');
}

async function locate() {
  locating.value = true;
  try {
    const position = await uni.getLocation({ type: 'gcj02' });
    locationLabel.value = '已按当前位置由近到远排序';
    await load(`&latitude=${position.latitude}&longitude=${position.longitude}`);
  } catch {
    uni.showToast({ title: '定位未授权，可继续输入城市编码', icon: 'none' });
  } finally {
    locating.value = false;
  }
}

function openStore(store) {
  uni.navigateTo({
    url: `/pages/page-201/index?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}`,
  });
}

onShow(() => load());
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    eyebrow="PAGE-198 · 生活消费"
    title="城市与推荐"
    detail="只展示已与当前账户建立有效服务关系的真实门店"
  >
    <view class="location-card">
      <view class="location-mark"><view></view></view>
      <view
        ><text>当前范围</text><text>{{ locationLabel }}</text></view
      >
      <button :loading="locating" @click="locate">使用定位</button>
    </view>
    <view class="city-search">
      <input
        v-model="cityCode"
        maxlength="20"
        placeholder="输入城市编码，如 320100"
        confirm-type="search"
        @confirm="useCity"
      />
      <button @click="useCity">切换城市</button>
    </view>
    <view class="quick-actions">
      <button @click="uni.navigateTo({ url: '/pages/page-200/index' })">
        <text>浏览分类</text><text>按生活场景找服务</text>
      </button>
      <button @click="uni.navigateTo({ url: '/pages/page-203/index' })">
        <text>综合搜索</text><text>商品、门店一次找</text>
      </button>
    </view>
    <view v-if="state === 'loading'" class="section empty-safe">正在读取附近真实门店…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看城市推荐</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe"
      >当前账户没有城市推荐权限</view
    >
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="useCity">
      加载失败，点此重试
    </view>
    <view v-else-if="state === 'empty'" class="section empty-safe">
      当前城市尚无已建立服务关系的在营门店，可切换城市或清除城市编码
    </view>
    <view v-else class="store-section">
      <view class="section-head"
        ><text>为你推荐</text><text>{{ stores.length }} 家</text></view
      >
      <view class="store-list">
        <button
          v-for="store in stores"
          :key="store.id"
          class="store-card"
          @click="openStore(store)"
        >
          <view class="store-photo"
            ><text v-if="store.distanceKm !== null">{{ store.distanceKm }}km</text></view
          >
          <view>
            <text>{{ store.name }}</text>
            <text>{{ store.cityCode || '当前城市' }} · 当前在营</text>
            <view class="store-card-foot"
              ><text>{{ store.productCount }} 件在售</text><text>进店选购 ›</text></view
            >
          </view>
        </button>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.location-card,
.city-search,
.quick-actions {
  display: flex;
  margin-top: 24rpx;
  gap: 14rpx;
}
.location-card {
  padding: 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-lg);
  align-items: center;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.location-card > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.location-mark {
  position: relative;
  width: 58rpx;
  height: 58rpx;
  border-radius: 18rpx;
  flex: none;
  background: var(--life-brand-soft);
}
.location-mark::before {
  position: absolute;
  top: 12rpx;
  left: 17rpx;
  width: 24rpx;
  height: 30rpx;
  border: 5rpx solid var(--life-brand);
  border-radius: 50% 50% 50% 8rpx;
  box-sizing: border-box;
  content: '';
  transform: rotate(45deg);
}
.location-card view:nth-child(2) text:first-child {
  color: var(--life-brand-deep);
  font-size: 20rpx;
  font-weight: 900;
}
.location-card view:nth-child(2) text:last-child {
  overflow: hidden;
  font-size: 25rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.location-card button,
.city-search button,
.quick-actions button {
  margin: 0;
  color: var(--life-paper);
  background: var(--life-brand-deep);
  border-radius: 999rpx;
  font-size: 22rpx;
}
.city-search input {
  height: 78rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  flex: 1;
  background: var(--life-paper);
  box-sizing: border-box;
  font-size: 23rpx;
}
.quick-actions button {
  display: flex;
  min-height: 104rpx;
  padding: 17rpx 20rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  color: var(--life-ink);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.quick-actions text:first-child {
  font-size: 22rpx;
  font-weight: 900;
}
.quick-actions text:last-child {
  margin-top: 4rpx;
  color: var(--life-muted);
  font-size: 15rpx;
}
.store-section {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.store-list {
  display: grid;
  gap: 18rpx;
}
.store-card {
  display: flex;
  width: 100%;
  min-height: 150rpx;
  margin: 0;
  padding: 0 0 18rpx;
  border-bottom: 1rpx solid var(--life-line);
  align-items: center;
  gap: 20rpx;
  text-align: left;
  background: transparent;
  border-radius: 0;
}
.store-card:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.store-photo {
  position: relative;
  width: 150rpx;
  height: 120rpx;
  border-radius: 18rpx;
  flex: none;
  background: url('../../assets/v63-retail/category-sprite.webp') 50% 100% / 500% 300% no-repeat;
}
.store-photo > text {
  position: absolute;
  right: 8rpx;
  bottom: 8rpx;
  padding: 4rpx 8rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: rgba(5, 68, 49, 0.82);
  font-size: 14rpx;
}
.store-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.store-card view text:first-child {
  font-size: 27rpx;
  font-weight: 900;
}
.store-card view text:not(:first-child) {
  color: var(--life-muted);
  font-size: 20rpx;
}
.store-card-foot {
  display: flex;
  margin-top: 5rpx;
  align-items: center;
  justify-content: space-between;
}
.store-card-foot text:first-child {
  color: var(--life-red);
  font-size: 19rpx;
  font-weight: 900;
}
.store-card-foot text:last-child {
  color: var(--life-brand-deep);
  font-size: 18rpx;
  font-weight: 800;
}
</style>
