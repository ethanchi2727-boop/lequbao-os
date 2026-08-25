<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import {
  categoryById,
  filterLifeDiscovery,
  lifeCategories,
} from '../../services/life-discovery.js';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const query = ref('');
const sort = ref('recommended');
const category = ref(categoryById('fresh'));
const storeId = ref('');
const storeName = ref('');
const filtered = computed(() => {
  const records = filterLifeDiscovery(products.value, query.value);
  if (sort.value === 'price')
    return records.sort((left, right) => left.salePriceCents - right.salePriceCents);
  if (sort.value === 'stock')
    return records.sort((left, right) => right.availableQuantity - left.availableQuantity);
  return records;
});
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: products.value }),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const parameters = storeId.value
      ? `storeId=${encodeURIComponent(storeId.value)}`
      : `productType=${category.value.productType}`;
    products.value = await lifeSession.request(
      `/api/v1/life/discovery/products?${parameters}&limit=100`,
    );
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function selectCategory(nextCategory) {
  if (storeId.value) return;
  category.value = nextCategory;
  void load();
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
    uni.showToast({ title: '加入失败，商品或库存可能已变化', icon: 'none' });
  }
}

function openProduct(product) {
  uni.navigateTo({ url: `/pages/page-209/index?productId=${encodeURIComponent(product.id)}` });
}

onLoad((options) => {
  category.value = categoryById(options?.category);
  storeId.value = String(options?.storeId ?? '');
  storeName.value = String(options?.storeName ?? '');
  void load();
});
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    eyebrow="PAGE-201 · 分类商品"
    :title="storeName || category.label"
    detail="搜索、排序与加购都基于当前服务端可售投影"
  >
    <scroll-view v-if="!storeId" class="category-tabs" scroll-x show-scrollbar="false">
      <button
        v-for="item in lifeCategories"
        :key="item.id"
        :class="{ active: category.id === item.id }"
        @click="selectCategory(item)"
      >
        <text>{{ item.label }}</text>
      </button>
    </scroll-view>
    <view class="category-banner">
      <view class="banner-mark"><text>严选</text></view>
      <view class="banner-copy">
        <text>{{ storeName ? '门店在售' : '严选品类' }}</text>
        <text>{{ storeName || category.label }}</text>
        <text>{{ products.length }} 款真实在售商品</text>
      </view>
    </view>
    <view class="search-bar">
      <input v-model="query" placeholder="在当前结果中搜索" confirm-type="search" />
    </view>
    <scroll-view class="sort-bar" scroll-x show-scrollbar="false">
      <button :class="{ active: sort === 'recommended' }" @click="sort = 'recommended'">
        综合排序
      </button>
      <button :class="{ active: sort === 'price' }" @click="sort = 'price'">价格优先</button>
      <button :class="{ active: sort === 'stock' }" @click="sort = 'stock'">库存优先</button>
      <text>{{ filtered.length }} 件结果</text>
    </scroll-view>
    <view v-if="state === 'loading'" class="section empty-safe">正在读取分类商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看分类商品</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权查看该分类</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">当前分类没有可售商品</view>
    <view v-else class="product-section">
      <view v-if="filtered.length" class="product-grid">
        <LifeRetailProductCard
          v-for="(product, index) in filtered"
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
.category-tabs,
.sort-bar {
  width: 100%;
  white-space: nowrap;
}
.category-tabs {
  margin: 22rpx 0 18rpx;
}
.category-tabs button,
.sort-bar button {
  display: inline-flex;
  width: auto;
  min-height: 58rpx;
  margin: 0 12rpx 0 0;
  padding: 0 22rpx;
  border-radius: 999rpx;
  align-items: center;
  color: var(--life-muted);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-card);
  font-size: 19rpx;
  font-weight: 800;
}
.category-tabs button.active,
.sort-bar button.active {
  color: var(--life-paper);
  background: var(--life-brand);
  box-shadow: var(--life-shadow-float);
}
.category-banner {
  display: flex;
  min-height: 190rpx;
  padding: 26rpx 30rpx;
  border-radius: var(--life-radius-md);
  align-items: center;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-brand), var(--life-brand-deep));
  box-shadow: var(--life-shadow);
  box-sizing: border-box;
}
.banner-mark {
  display: flex;
  width: 72rpx;
  height: 72rpx;
  margin-right: 22rpx;
  border-radius: 22rpx;
  align-items: center;
  justify-content: center;
  background: var(--life-glass);
  font-size: 20rpx;
  font-weight: 900;
}
.banner-copy {
  display: flex;
  flex-direction: column;
}
.banner-copy text:first-child,
.banner-copy text:last-child {
  font-size: 18rpx;
  opacity: 0.82;
}
.banner-copy text:nth-child(2) {
  margin: 5rpx 0;
  font-size: 40rpx;
  font-weight: 900;
}
.search-bar {
  display: flex;
  height: 76rpx;
  margin-top: 18rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  align-items: center;
  background: var(--life-paper);
  box-sizing: border-box;
}
.search-bar input {
  min-width: 0;
  flex: 1;
  font-size: 21rpx;
}
.sort-bar {
  margin: 18rpx 0;
}
.sort-bar text {
  display: inline-block;
  margin-left: 6rpx;
  color: var(--life-muted);
  font-size: 18rpx;
}
.product-section {
  margin-top: 4rpx;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}
</style>
