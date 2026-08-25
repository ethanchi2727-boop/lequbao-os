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
    eyebrow="PAGE-207 · 商城精选"
    title="今天值得带回家"
    detail="只展示当前账户关联商户的真实在售商品"
    theme-color="coral"
  >
    <view class="mall-search">
      <input v-model="query" placeholder="在精选商品中搜索" confirm-type="search" />
      <button @click="uni.navigateTo({ url: '/pages/page-213/index' })">活动会场</button>
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
    <view v-else class="section">
      <view class="section-head"
        ><text>实时精选</text><text>{{ visibleProducts.length }} 件</text></view
      >
      <view v-if="visibleProducts.length" class="goods-list">
        <LifeRetailProductCard
          v-for="(product, index) in visibleProducts"
          :key="product.id"
          compact
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
  grid-template-columns: 1fr auto;
  gap: 14rpx;
}
.mall-search input {
  height: 76rpx;
  padding: 0 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  background: #fff;
  box-sizing: border-box;
}
.mall-search button {
  margin: 0;
  color: #fff;
  background: #9b3f20;
  border-radius: 20rpx;
  font-size: 21rpx;
}
.goods-list {
  display: grid;
  gap: 18rpx;
}
</style>
