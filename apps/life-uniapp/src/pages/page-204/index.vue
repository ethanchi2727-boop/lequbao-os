<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { filterLifeDiscovery, normalizeLifeQuery } from '../../services/life-discovery.js';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const error = ref(null);
const query = ref('');
const activeTab = ref('all');
const products = ref([]);
const stores = ref([]);
const productResults = computed(() => filterLifeDiscovery(products.value, query.value));
const storeResults = computed(() => filterLifeDiscovery(stores.value, query.value));
const records = computed(() => [...productResults.value, ...storeResults.value]);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: records.value }),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    [products.value, stores.value] = await Promise.all([
      lifeSession.request('/api/v1/life/discovery/products?limit=100'),
      lifeSession.request('/api/v1/life/discovery/stores?limit=100'),
    ]);
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function submitSearch() {
  query.value = normalizeLifeQuery(query.value);
  if (!query.value) uni.navigateBack();
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
    uni.showToast({ title: '加入失败，请刷新结果后重试', icon: 'none' });
  }
}

function openStore(store) {
  uni.navigateTo({
    url: `/pages/page-201/index?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}`,
  });
}

function openProduct(product) {
  uni.navigateTo({ url: `/pages/page-209/index?productId=${encodeURIComponent(product.id)}` });
}

onLoad((options) => {
  query.value = normalizeLifeQuery(options?.q);
  void load();
});
</script>

<template>
  <LifeSurface
    eyebrow="PAGE-204 · 搜索结果"
    :title="query ? `“${query}”的结果` : '综合搜索结果'"
    detail="商品与门店分开呈现，空结果和失败均可恢复"
  >
    <view class="result-search"
      ><input v-model="query" maxlength="60" confirm-type="search" @confirm="submitSearch" /><button
        @click="submitSearch"
      >
        更新
      </button></view
    >
    <view class="result-tabs">
      <button :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">
        全部 {{ records.length }}
      </button>
      <button :class="{ active: activeTab === 'products' }" @click="activeTab = 'products'">
        商品 {{ productResults.length }}
      </button>
      <button :class="{ active: activeTab === 'stores' }" @click="activeTab = 'stores'">
        门店 {{ storeResults.length }}
      </button>
    </view>
    <view v-if="state === 'loading'" class="section empty-safe">正在搜索真实商品与门店…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看搜索结果</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权搜索该范围</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >搜索失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe"
      >没有找到匹配结果，返回修改关键词</view
    >
    <view v-else>
      <view v-if="activeTab !== 'stores' && productResults.length" class="section">
        <view class="section-head"
          ><text>商品与服务</text><text>{{ productResults.length }} 条</text></view
        >
        <view class="result-list"
          ><view
            v-for="product in productResults"
            :key="product.id"
            class="result-card"
            @click="openProduct(product)"
            ><image src="/static/life-product.webp" mode="aspectFill" /><view
              ><text>{{ product.title }}</text
              ><text>{{ product.storeName }} · {{ product.variantTitle }}</text
              ><text class="price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text></view
            ><button
              size="mini"
              :disabled="product.availableQuantity < 1"
              @click.stop="addToCart(product)"
            >
              加购
            </button></view
          ></view
        >
      </view>
      <view v-if="activeTab !== 'products' && storeResults.length" class="section">
        <view class="section-head"
          ><text>附近门店</text><text>{{ storeResults.length }} 家</text></view
        >
        <view class="result-list"
          ><button
            v-for="store in storeResults"
            :key="store.id"
            class="store-result"
            @click="openStore(store)"
          >
            <image src="/static/local-dining.webp" mode="aspectFill" /><view
              ><text>{{ store.name }}</text
              ><text
                >{{ store.cityCode || '当前城市' }} · {{ store.productCount }} 件在售</text
              ></view
            ><text>查看</text>
          </button></view
        >
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.result-search {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12rpx;
  margin-top: 24rpx;
}
.result-search input {
  height: 76rpx;
  padding: 0 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  background: #fff;
  box-sizing: border-box;
}
.result-search button {
  margin: 0;
  color: #fff;
  background: #076c50;
  border-radius: 20rpx;
  font-size: 22rpx;
}
.result-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
  margin-top: 18rpx;
}
.result-tabs button {
  margin: 0;
  color: #66736d;
  background: #fff;
  border-radius: 18rpx;
  font-size: 20rpx;
}
.result-tabs button.active {
  color: #fff;
  background: #076c50;
}
.result-list {
  display: grid;
  gap: 16rpx;
}
.result-card,
.store-result {
  display: flex;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 16rpx;
  align-items: center;
  gap: 18rpx;
  text-align: left;
  background: #f8faf9;
  border-radius: 20rpx;
  box-sizing: border-box;
}
.result-card image,
.store-result image {
  width: 118rpx;
  height: 100rpx;
  border-radius: 16rpx;
}
.result-card > view,
.store-result > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 7rpx;
}
.result-card view text:first-child,
.store-result view text:first-child {
  font-size: 24rpx;
  font-weight: 900;
}
.result-card view text:nth-child(2),
.store-result view text:nth-child(2) {
  color: #66736d;
  font-size: 19rpx;
}
.result-card button {
  margin: 0;
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 18rpx;
}
.store-result > text:last-child {
  color: #076c50;
  font-size: 20rpx;
  font-weight: 800;
}
</style>
