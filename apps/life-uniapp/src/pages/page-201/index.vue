<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { categoryById, filterLifeDiscovery } from '../../services/life-discovery.js';
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
    eyebrow="PAGE-201 · 分类商品"
    :title="storeName || category.label"
    detail="搜索、排序与加购都基于当前服务端可售投影"
  >
    <view class="filter-bar">
      <input v-model="query" placeholder="在当前结果中搜索" confirm-type="search" />
      <picker
        :range="['推荐排序', '价格从低到高', '库存优先']"
        @change="sort = ['recommended', 'price', 'stock'][Number($event.detail.value)]"
      >
        <view class="sort-picker">{{
          sort === 'price' ? '价格排序' : sort === 'stock' ? '库存优先' : '推荐排序'
        }}</view>
      </picker>
    </view>
    <view v-if="state === 'loading'" class="section empty-safe">正在读取分类商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看分类商品</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权查看该分类</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">当前分类没有可售商品</view>
    <view v-else class="section">
      <view class="section-head"
        ><text>在售结果</text><text>{{ filtered.length }} 件</text></view
      >
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
.filter-bar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14rpx;
  margin-top: 24rpx;
}
.filter-bar input,
.sort-picker {
  height: 76rpx;
  padding: 0 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  background: #fff;
  box-sizing: border-box;
  font-size: 22rpx;
  line-height: 76rpx;
}
.sort-picker {
  color: #076c50;
  font-weight: 800;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
}
</style>
