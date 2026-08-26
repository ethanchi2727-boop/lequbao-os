<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { filterLifeDiscovery } from '../../services/life-discovery.js';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const query = ref('');
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: products.value }),
);
const visibleProducts = computed(() => filterLifeDiscovery(products.value, query.value));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    products.value = await lifeSession.request('/api/v1/life/discovery/products?limit=100');
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function openProduct(product) {
  uni.navigateTo({ url: `/pages/page-209/index?productId=${encodeURIComponent(product.id)}` });
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
    uni.showToast({ title: '加入失败，请刷新商品后重试', icon: 'none' });
  }
}

onLoad(() => void load());
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    eyebrow="PAGE-207 · 商城精选"
    title="今天值得带回家"
    detail="只展示当前账户关联商户的真实在售商品"
    theme-color="coral"
  >
    <view class="mall-banner"
      ><view><text>商城精选</text><text>真实门店 · 实时库存</text><text>今天值得带回家</text></view
      ><button @click="uni.navigateTo({ url: '/pages/page-213/index' })">团购会场</button></view
    >
    <view class="mall-search">
      <view class="mall-search-mark"></view>
      <input v-model="query" placeholder="在精选商品中搜索" confirm-type="search" />
      <text>{{ visibleProducts.length }} 件</text>
    </view>
    <view v-if="state === 'loading'" class="section empty-safe">正在读取实时货架…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看商城精选</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权访问商城</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >货架加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">当前没有可售商品</view>
    <view v-else class="mall-section">
      <view class="section-head"
        ><text>实时精选</text><text>{{ visibleProducts.length }} 件</text></view
      >
      <view v-if="visibleProducts.length" class="goods-list">
        <LifeRetailProductCard
          v-for="(product, index) in visibleProducts"
          :key="product.id"
          :product="product"
          :index="index"
          @select="openProduct"
          @add="addToCart"
        />
      </view>
      <view v-else class="empty-safe">没有匹配当前关键词的商品</view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.mall-search {
  display: grid;
  margin-top: 16rpx;
  padding: 8rpx 18rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  grid-template-columns: 28rpx 1fr auto;
  align-items: center;
  gap: 8rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.mall-search input {
  height: 64rpx;
  padding: 0 8rpx;
  box-sizing: border-box;
}
.mall-search > text:last-child {
  color: var(--life-muted);
  font-size: 17rpx;
}
.mall-search-mark {
  width: 19rpx;
  height: 19rpx;
  border: 4rpx solid var(--life-muted);
  border-radius: 50%;
  box-sizing: border-box;
}
.mall-banner {
  display: flex;
  min-height: 210rpx;
  margin-top: 20rpx;
  padding: 28rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  justify-content: space-between;
  color: var(--life-paper);
  background-image:
    linear-gradient(90deg, rgba(108, 39, 17, 0.94), rgba(226, 103, 65, 0.4)),
    url('../../assets/v63-retail/product-sprite.webp');
  background-position:
    0 0,
    100% 100%;
  background-repeat: no-repeat;
  background-size:
    100% 100%,
    400% 200%;
  box-shadow: var(--life-shadow);
  box-sizing: border-box;
}
.mall-banner > view {
  display: flex;
  flex-direction: column;
  gap: 7rpx;
}
.mall-banner view text:first-child {
  font-size: 17rpx;
  opacity: 0.86;
}
.mall-banner view text:nth-child(2) {
  font-size: 30rpx;
  font-weight: 900;
}
.mall-banner view text:last-child {
  font-size: 18rpx;
}
.mall-banner button {
  margin: 0;
  padding: 0 20rpx;
  border-radius: 999rpx;
  color: #9b3f20;
  background: #fff5d6;
  font-size: 18rpx;
  font-weight: 900;
}
.mall-section {
  margin-top: 22rpx;
}
.goods-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}
</style>
