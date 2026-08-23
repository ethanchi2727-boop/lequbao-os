<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const stores = ref([]);
const selectedStore = ref(null);
const storeProducts = ref([]);
const detailLoading = ref(false);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: stores.value }),
);
async function load() {
  loading.value = true;
  error.value = null;
  try {
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
onShow(load);
</script>
<template>
  <LifeSurface
    tone="blue"
    eyebrow="附近好生活"
    title="在城市里发现点新鲜"
    detail="真实门店 · 实际距离 · 到店规则透明"
    ><view v-if="state === 'loading'" class="section empty-safe">正在读取真实门店…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看附近生活</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe"
      >当前账户无权查看附近门店</view
    >
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">当前没有可展示的服务门店</view>
    <view v-else class="section"
      ><view class="section-head"
        ><text>附近服务门店</text><text>{{ stores.length }} 家</text></view
      ><view class="card-list">
        <view v-for="store in stores" :key="store.id" class="row-card" @click="openStore(store)"
          ><image src="/static/local-dining.webp" mode="aspectFill" /><view class="copy"
            ><text>{{ store.name }}</text
            ><text>{{ store.cityCode || '当前城市' }} · {{ store.productCount }} 件在售</text
            ><text class="price">{{
              store.distanceKm === null ? '查看门店' : `${store.distanceKm}km`
            }}</text></view
          ></view
        >
      </view></view
    ><view v-if="selectedStore" class="store-sheet" @click="selectedStore = null"
      ><view class="store-sheet-card" @click.stop
        ><view class="store-heading"
          ><view
            ><text>{{ selectedStore.name }}</text
            ><text
              >{{ selectedStore.cityCode || '当前城市' }} ·
              {{ selectedStore.districtCode || '服务区域' }}</text
            ></view
          ><button size="mini" @click="selectedStore = null">关闭</button></view
        ><view class="store-facts"
          ><text>{{ selectedStore.productCount }} 件在售</text
          ><text>{{
            selectedStore.distanceKm === null ? '距离待授权后计算' : `${selectedStore.distanceKm}km`
          }}</text
          ><text>营业信息来自门店主档</text></view
        ><view v-if="detailLoading" class="empty-safe">正在读取门店在售商品…</view>
        <view v-else-if="!storeProducts.length" class="empty-safe">门店当前没有可购买商品</view>
        <view v-else class="card-list store-products"
          ><view v-for="product in storeProducts" :key="product.id" class="row-card"
            ><image src="/static/local-dining.webp" mode="aspectFill" /><view class="copy"
              ><text>{{ product.title }}</text
              ><text>{{ product.variantTitle }} · 库存 {{ product.availableQuantity }}</text
              ><view class="store-action"
                ><text class="price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text
                ><button
                  size="mini"
                  :disabled="product.availableQuantity < 1"
                  @click="addToCart(product)"
                >
                  加入购物车
                </button></view
              ></view
            ></view
          ></view
        ></view
      ></view
    ></LifeSurface
  >
</template>
<style scoped>
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
  background: #fff;
  box-sizing: border-box;
}
.store-heading,
.store-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}
.store-heading > view {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.store-heading view text:first-child {
  font-size: 34rpx;
  font-weight: 900;
}
.store-heading view text:last-child {
  color: #66736d;
  font-size: 21rpx;
}
.store-heading button,
.store-action button {
  margin: 0;
  color: #076c50;
  background: #e8f7f0;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.store-facts {
  display: flex;
  gap: 10rpx;
  margin: 22rpx 0;
  flex-wrap: wrap;
}
.store-facts text {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  color: #155e75;
  background: #e9f6f8;
  font-size: 19rpx;
}
.store-products {
  max-height: 58vh;
  overflow-y: auto;
}
</style>
