<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeRuntimeProfile, lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const stores = ref([]);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: products.value }),
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
    [stores.value, products.value] = await Promise.all([
      lifeSession.request('/api/v1/life/discovery/stores?limit=6'),
      lifeSession.request('/api/v1/life/discovery/products?limit=12'),
    ]);
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
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

onShow(load);
</script>
<template>
  <LifeSurface
    eyebrow="今日生活直供"
    title="把新鲜和附近，装进生活篮子"
    detail="当日达 · 来源可查 · 售后有入口"
    ><image class="banner" src="/static/life-banner.webp" mode="aspectFill" />
    <view class="leaf-actions">
      <button @click="uni.navigateTo({ url: '/pages/page-198/index' })">城市与推荐</button>
      <button @click="uni.navigateTo({ url: '/pages/page-200/index' })">全部分类</button>
      <button @click="uni.navigateTo({ url: '/pages/page-203/index' })">综合搜索</button>
    </view>
    <view class="grid"
      ><view
        v-for="item in [
          '果蔬',
          '肉蛋',
          '粮油',
          '烘焙',
          '饮品',
          '零食',
          '快手菜',
          '休闲',
          '住宿',
          '清洁',
        ]"
        :key="item"
        ><view class="icon"
          ><image src="/static/life-category-sprite.webp" mode="aspectFill" /></view
        ><text>{{ item }}</text></view
      ></view
    >
    <view v-if="state === 'loading'" class="section empty-safe">正在读取真实门店与商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看与你建立服务关系的门店和商品</view
    >
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">当前还没有可展示的在售商品</view>
    <view v-if="stores.length" class="section">
      <view class="section-head"
        ><text>附近服务门店</text><text>{{ stores.length }} 家</text></view
      >
      <view class="chips">
        <text v-for="store in stores" :key="store.id" class="chip"
          >{{ store.name }} · {{ store.productCount }} 件</text
        >
      </view>
    </view>
    <view v-if="products.length" class="section">
      <view class="section-head"><text>今天值得买</text><text>全部商品</text></view>
      <view class="card-list">
        <view v-for="(product, index) in products" :key="product.id" class="row-card">
          <image
            :src="index % 2 === 0 ? '/static/life-product.webp' : '/static/local-dining.webp'"
            mode="aspectFill"
          />
          <view class="copy"
            ><text>{{ product.title }}</text
            ><text
              >{{ product.storeName }} · {{ product.variantTitle }} · 库存
              {{ product.availableQuantity }}</text
            ><view class="product-action"
              ><text class="price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text
              ><button
                size="mini"
                :disabled="product.availableQuantity < 1"
                @click.stop="addToCart(product)"
              >
                加入购物车
              </button></view
            ></view
          >
        </view>
      </view>
    </view>
    <view class="section"
      ><view class="section-head"><text>安心消费</text><text>查看规则</text></view
      ><view class="chips"
        ><text class="chip">实际库存确认</text><text class="chip">履约进度可查</text
        ><text class="chip">售后责任明确</text></view
      ></view
    >
  </LifeSurface>
</template>
<style scoped>
.banner {
  width: 100%;
  height: 300rpx;
  margin-bottom: 26rpx;
  border-radius: 30rpx;
}
.leaf-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-bottom: 24rpx;
}
.leaf-actions button {
  margin: 0;
  padding: 0 12rpx;
  color: #076c50;
  background: #e8f7f0;
  border-radius: 18rpx;
  font-size: 20rpx;
  font-weight: 800;
}
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 26rpx 12rpx;
}
.grid > view {
  text-align: center;
  font-size: 22rpx;
}
.icon {
  width: 86rpx;
  height: 86rpx;
  margin: 0 auto 10rpx;
  border-radius: 28rpx;
  overflow: hidden;
  background: #fff2b8;
  box-shadow: 0 10rpx 24rpx rgba(22, 57, 43, 0.12);
}
.icon image {
  width: 100%;
  height: 100%;
}
.product-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.product-action button {
  margin: 0;
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 20rpx;
}
</style>
