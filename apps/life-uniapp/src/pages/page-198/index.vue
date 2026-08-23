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
    eyebrow="PAGE-198 · 生活消费"
    title="城市与推荐"
    detail="只展示已与当前账户建立有效服务关系的真实门店"
  >
    <view class="location-card">
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
      <button @click="uni.navigateTo({ url: '/pages/page-200/index' })">浏览分类</button>
      <button @click="uni.navigateTo({ url: '/pages/page-203/index' })">综合搜索</button>
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
    <view v-else class="section">
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
          <image src="/static/local-dining.webp" mode="aspectFill" />
          <view>
            <text>{{ store.name }}</text>
            <text>{{ store.cityCode || '当前城市' }} · {{ store.productCount }} 件在售</text>
            <text>{{
              store.distanceKm === null ? '查看门店商品' : `距你 ${store.distanceKm}km`
            }}</text>
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
  padding: 24rpx;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-between;
  background: #e8f7f0;
}
.location-card > view {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.location-card view text:first-child {
  color: #076c50;
  font-size: 20rpx;
  font-weight: 900;
}
.location-card view text:last-child {
  font-size: 25rpx;
  font-weight: 800;
}
.location-card button,
.city-search button,
.quick-actions button {
  margin: 0;
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 22rpx;
}
.city-search input {
  height: 78rpx;
  padding: 0 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  flex: 1;
  background: #fff;
  box-sizing: border-box;
  font-size: 23rpx;
}
.quick-actions button {
  flex: 1;
  color: #076c50;
  background: #fff;
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
  padding: 18rpx;
  align-items: center;
  gap: 20rpx;
  text-align: left;
  background: #f8faf9;
  border-radius: 22rpx;
}
.store-card image {
  width: 150rpx;
  height: 120rpx;
  border-radius: 18rpx;
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
  color: #66736d;
  font-size: 20rpx;
}
</style>
