<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeRuntimeProfile, lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const stores = ref([]);
const selectedStore = ref(null);
const storeProducts = ref([]);
const detailLoading = ref(false);
const scenes = Object.freeze([
  ['附近美食', '今天吃点好的'],
  ['休闲玩乐', '周末轻松逛'],
  ['生活服务', '日常所需在身边'],
  ['鲜花礼品', '心意今日送达'],
]);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: stores.value }),
);

async function ensurePreviewSession() {
  if (lifeSession.load() || !lifeRuntimeProfile.developmentMocks) return;
  await lifeSession.exchange('WECHAT', 'development-preview-life-user-v1');
}
async function load() {
  loading.value = true;
  error.value = null;
  try {
    await ensurePreviewSession();
    stores.value = await lifeSession.request('/api/v1/life/discovery/stores?limit=30');
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}
async function openStore(store) {
  selectedStore.value = store;
  storeProducts.value = [];
  detailLoading.value = true;
  try {
    storeProducts.value = await lifeSession.request(
      `/api/v1/life/discovery/products?storeId=${encodeURIComponent(store.id)}&limit=30`,
    );
  } catch {
    uni.showToast({ title: '门店商品加载失败，请重试', icon: 'none' });
  } finally {
    detailLoading.value = false;
  }
}
async function addToCart(product) {
  if (product.availableQuantity < 1) return;
  try {
    await lifeSession.request('/api/v1/life/cart/items', {
      method: 'PUT',
      data: {
        merchantTenantId: product.merchantTenantId,
        storeId: product.storeId,
        variantId: product.variantId,
        quantity: 1,
      },
    });
    uni.showToast({ title: '已加入购物车', icon: 'success' });
  } catch {
    uni.showToast({ title: '加入失败，请重试', icon: 'none' });
  }
}
function sceneStyle(index) {
  return {
    '--sprite-x': `${((index + 10) % 5) * 25}%`,
    '--sprite-y': `${Math.floor(((index + 10) % 15) / 5) * 50}%`,
  };
}
onShow(load);
</script>

<template>
  <LifeSurface primary :show-assurance="false" theme-color="blue">
    <template #ambient>
      <view class="community-hero">
        <view class="community-copy"
          ><text>附近好生活</text><text>发现城市里的</text><text>新鲜与热爱</text
          ><text>真实门店 · 实际在售 · 服务规则透明</text
          ><button @click="uni.navigateTo({ url: '/pages/page-198/index' })">
            选择城市 ›
          </button></view
        >
        <view class="community-photo" />
      </view>
      <view class="scene-grid">
        <button
          v-for="(scene, index) in scenes"
          :key="scene[0]"
          @click="uni.navigateTo({ url: '/pages/page-201/index?category=leisure' })"
        >
          <view class="scene-photo" :style="sceneStyle(index)" /><text>{{ scene[0] }}</text
          ><text>{{ scene[1] }}</text>
        </button>
      </view>
    </template>

    <view class="community-trust"
      ><text>✓ 门店真实在营</text><text>✓ 距离授权后计算</text><text>✓ 商品实时在售</text></view
    >
    <view v-if="state === 'loading'" class="community-state">正在读取真实门店…</view>
    <view v-else-if="state === 'unauthenticated'" class="community-state">登录后查看附近生活</view>
    <view v-else-if="state === 'forbidden'" class="community-state">当前账户无权查看附近门店</view>
    <view v-else-if="state === 'recoverable-error'" class="community-state" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="community-state">当前没有可展示的服务门店</view>
    <view v-else class="nearby-section">
      <view class="nearby-heading"
        ><view><text>附近服务门店</text><text>真实在营</text></view
        ><text>{{ stores.length }} 家</text></view
      >
      <view class="store-grid">
        <button v-for="(store, index) in stores" :key="store.id" @click="openStore(store)">
          <view class="store-photo" :style="sceneStyle(index % scenes.length)" />
          <view class="store-copy"
            ><text>{{ store.name }}</text
            ><text>{{ store.cityCode || '当前城市' }} · {{ store.productCount }} 件在售</text
            ><view
              ><text>{{
                store.distanceKm === null || store.distanceKm === undefined
                  ? '授权后查看距离'
                  : `${store.distanceKm}km`
              }}</text
              ><text>查看门店 ›</text></view
            ></view
          >
        </button>
      </view>
    </view>

    <view v-if="selectedStore" class="store-sheet" @click="selectedStore = null">
      <view class="store-sheet-card" @click.stop>
        <view class="store-heading"
          ><view
            ><text>{{ selectedStore.name }}</text
            ><text
              >{{ selectedStore.cityCode || '当前城市' }} ·
              {{ selectedStore.districtCode || '服务区域' }}</text
            ></view
          ><button @click="selectedStore = null">关闭</button></view
        >
        <view class="store-facts"
          ><text>{{ selectedStore.productCount }} 件在售</text
          ><text>{{
            selectedStore.distanceKm === null || selectedStore.distanceKm === undefined
              ? '距离待授权后计算'
              : `${selectedStore.distanceKm}km`
          }}</text
          ><text>信息来自门店主档</text></view
        >
        <view v-if="detailLoading" class="community-state">正在读取门店在售商品…</view>
        <view v-else-if="!storeProducts.length" class="community-state"
          >门店当前没有可购买商品</view
        >
        <view v-else class="store-products"
          ><LifeRetailProductCard
            v-for="(product, index) in storeProducts"
            :key="product.id"
            compact
            :product="product"
            :index="index"
            @select="() => {}"
            @add="addToCart"
        /></view>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.community-hero {
  position: relative;
  height: 344rpx;
  margin: 8rpx 20rpx 0;
  border-radius: var(--life-radius-lg);
  overflow: hidden;
  background: linear-gradient(
    135deg,
    var(--life-blue-deep),
    var(--life-blue) 62%,
    var(--life-blue-bright)
  );
  box-shadow: var(--life-shadow);
}
.community-copy {
  position: relative;
  z-index: 2;
  display: flex;
  width: 62%;
  padding: 30rpx;
  flex-direction: column;
  color: var(--life-paper);
}
.community-copy > text:first-child {
  align-self: flex-start;
  padding: 7rpx 12rpx;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 17rpx;
}
.community-copy > text:nth-child(2),
.community-copy > text:nth-child(3) {
  font-size: 39rpx;
  line-height: 1.14;
  font-weight: 900;
}
.community-copy > text:nth-child(2) {
  margin-top: 16rpx;
}
.community-copy > text:nth-child(4) {
  margin-top: 10rpx;
  font-size: 16rpx;
  opacity: 0.9;
}
.community-copy button {
  align-self: flex-start;
  margin: 20rpx 0 0;
  padding: 0 22rpx;
  border-radius: 24rpx;
  color: var(--life-blue-ink);
  background: var(--life-paper);
  font-size: 19rpx;
  font-weight: 900;
}
.community-photo,
.scene-photo,
.store-photo {
  background-image: url('../../assets/v63-retail/category-sprite.webp');
  background-repeat: no-repeat;
  background-size: 500% 300%;
}
.community-photo {
  position: absolute;
  right: -28rpx;
  bottom: -18rpx;
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  background-position: 50% 100%;
  box-shadow: 0 0 0 18rpx rgba(255, 255, 255, 0.14);
}
.scene-grid {
  display: grid;
  margin: 18rpx 20rpx 0;
  padding: 20rpx 14rpx;
  border-radius: var(--life-radius-lg);
  grid-template-columns: repeat(4, 1fr);
  gap: 10rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.scene-grid button {
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  line-height: 1.25;
}
.scene-photo {
  width: 116rpx;
  height: 116rpx;
  margin: 0 auto;
  border-radius: 50%;
  background-position: var(--sprite-x) var(--sprite-y);
}
.scene-grid text:nth-child(2) {
  display: block;
  margin-top: 9rpx;
  font-size: 20rpx;
  font-weight: 900;
}
.scene-grid text:last-child {
  display: block;
  margin-top: 4rpx;
  overflow: hidden;
  color: var(--life-muted);
  font-size: 14rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.community-trust {
  display: flex;
  min-height: 70rpx;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-around;
  color: var(--life-blue-ink);
  background: var(--life-blue-soft);
  font-size: 16rpx;
}
.community-state {
  margin-top: 20rpx;
  padding: 46rpx 20rpx;
  border: 2rpx dashed var(--life-line);
  border-radius: var(--life-radius-md);
  color: var(--life-muted);
  background: var(--life-paper);
  text-align: center;
}
.nearby-section {
  margin-top: 20rpx;
}
.nearby-heading {
  display: flex;
  min-height: 84rpx;
  padding: 0 8rpx;
  align-items: center;
  justify-content: space-between;
}
.nearby-heading > view {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.nearby-heading view text:first-child {
  font-size: 31rpx;
  font-weight: 900;
}
.nearby-heading view text:last-child {
  padding: 5rpx 9rpx;
  border-radius: 8rpx;
  color: var(--life-paper);
  background: var(--life-blue);
  font-size: 14rpx;
}
.nearby-heading > text {
  color: var(--life-muted);
  font-size: 18rpx;
}
.store-grid {
  display: grid;
  gap: 16rpx;
}
.store-grid > button {
  display: grid;
  min-width: 0;
  margin: 0;
  padding: 14rpx;
  border-radius: var(--life-radius-lg);
  grid-template-columns: 180rpx 1fr;
  gap: 18rpx;
  align-items: center;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
  text-align: left;
}
.store-photo {
  width: 180rpx;
  height: 160rpx;
  border-radius: 24rpx;
  background-position: var(--sprite-x) var(--sprite-y);
}
.store-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.store-copy > text:first-child {
  overflow: hidden;
  font-size: 27rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.store-copy > text:nth-child(2) {
  margin-top: 9rpx;
  color: var(--life-muted);
  font-size: 18rpx;
}
.store-copy > view {
  display: flex;
  margin-top: 16rpx;
  align-items: center;
  justify-content: space-between;
  color: var(--life-blue-deep);
  font-size: 17rpx;
  font-weight: 800;
}
.store-sheet {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: flex;
  padding: 30rpx;
  align-items: flex-end;
  background: rgba(16, 32, 25, 0.48);
  box-sizing: border-box;
}
.store-sheet-card {
  width: 100%;
  max-height: 88vh;
  padding: 28rpx;
  border-radius: 32rpx 32rpx 12rpx 12rpx;
  overflow-y: auto;
  background: var(--life-paper);
  box-sizing: border-box;
}
.store-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.store-heading > view {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7rpx;
}
.store-heading view text:first-child {
  font-size: 33rpx;
  font-weight: 900;
}
.store-heading view text:last-child {
  color: var(--life-muted);
  font-size: 20rpx;
}
.store-heading button {
  margin: 0;
  border-radius: 999rpx;
  color: var(--life-blue-ink);
  background: var(--life-blue-soft);
  font-size: 19rpx;
}
.store-facts {
  display: flex;
  margin: 20rpx 0;
  gap: 9rpx;
  flex-wrap: wrap;
}
.store-facts text {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  color: var(--life-blue-ink);
  background: var(--life-blue-soft);
  font-size: 17rpx;
}
.store-products {
  display: grid;
  gap: 14rpx;
}
</style>
