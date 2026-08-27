<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: products.value }),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    products.value = await lifeSession.request(
      '/api/v1/life/discovery/products?productType=GROUP_BUY&limit=100',
    );
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
    uni.showToast({ title: '库存或价格已变化', icon: 'none' });
  }
}

onLoad(() => void load());
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    eyebrow="PAGE-213 · 活动会场"
    title="正在进行的真实优惠"
    detail="会场只聚合当前可售团购商品，不虚构活动倒计时或原价"
    theme-color="coral"
  >
    <view class="event-banner"
      ><view
        ><text>本地团购</text><text>到店好价，真实可核销</text
        ><text>库存、成交价与履约条件以下单时服务端确认结果为准</text></view
      ><view class="event-badge"><text>团</text><text>实时在售</text></view></view
    >
    <view v-if="state === 'loading'" class="section empty-safe">正在读取活动商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看活动会场</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe"
      >当前账户无权访问活动会场</view
    >
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >会场加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe"
      >当前没有进行中的真实团购活动</view
    >
    <view v-else class="event-section"
      ><view class="section-head"
        ><text>团购精选</text><text>{{ products.length }} 项</text></view
      ><view class="event-grid"
        ><LifeRetailProductCard
          v-for="(product, index) in products"
          :key="product.id"
          :product="product"
          :index="index"
          @select="openProduct"
          @add="addToCart" /></view
    ></view>
  </LifeSurface>
</template>

<style scoped>
.event-banner {
  display: flex;
  min-height: 210rpx;
  margin-top: 20rpx;
  padding: 28rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  justify-content: space-between;
  color: var(--life-paper);
  background-image:
    linear-gradient(
      90deg,
      rgba(108, 39, 17, 0.96) 0%,
      rgba(226, 103, 65, 0.84) 62%,
      rgba(226, 103, 65, 0.18) 100%
    ),
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
.event-banner > view:first-child {
  display: flex;
  max-width: 70%;
  flex-direction: column;
}
.event-banner > view:first-child text:first-child {
  align-self: flex-start;
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 16rpx;
  font-weight: 900;
}
.event-banner > view:first-child text:nth-child(2) {
  margin-top: 10rpx;
  font-size: 31rpx;
  font-weight: 900;
}
.event-banner > view:first-child text:last-child {
  margin-top: 8rpx;
  font-size: 16rpx;
  opacity: 0.86;
}
.event-badge {
  display: flex;
  width: 112rpx;
  height: 112rpx;
  border: 8rpx solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  background: var(--life-yellow-soft);
  color: var(--life-coral-ink);
  box-sizing: border-box;
}
.event-badge text:first-child {
  font-size: 34rpx;
  font-weight: 900;
}
.event-badge text:last-child {
  font-size: 14rpx;
  font-weight: 800;
}
.event-section {
  margin-top: 22rpx;
}
.event-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}
</style>
