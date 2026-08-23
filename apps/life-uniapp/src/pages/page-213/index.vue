<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
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

onLoad(() => void load());
</script>

<template>
  <LifeSurface
    eyebrow="PAGE-213 · 活动会场"
    title="正在进行的真实优惠"
    detail="会场只聚合当前可售团购商品，不虚构活动倒计时或原价"
    tone="orange"
  >
    <view class="truth-note"
      ><text>实时规则</text><text>库存、成交价与履约条件以下单时服务端确认结果为准</text></view
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
    <view v-else class="section"
      ><view class="section-head"
        ><text>团购精选</text><text>{{ products.length }} 项</text></view
      ><button
        v-for="product in products"
        :key="product.id"
        class="event-card"
        @click="openProduct(product)"
      >
        <image src="/static/local-dining.webp" mode="aspectFill" /><view
          ><text>{{ product.title }}</text
          ><text>{{ product.storeName }} · {{ product.variantTitle }}</text
          ><text class="price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text
          ><text>{{
            product.availableQuantity > 0 ? `可售 ${product.availableQuantity}` : '当前售罄'
          }}</text></view
        >
      </button></view
    >
  </LifeSurface>
</template>

<style scoped>
.truth-note {
  display: flex;
  padding: 22rpx;
  gap: 12rpx;
  flex-direction: column;
  color: #7b4f00;
  background: #fff5d6;
  border-radius: 22rpx;
}
.truth-note text:first-child {
  font-weight: 900;
}
.truth-note text:last-child {
  font-size: 20rpx;
}
.event-card {
  display: flex;
  width: 100%;
  margin: 14rpx 0;
  padding: 16rpx;
  gap: 18rpx;
  text-align: left;
  background: #f8faf9;
  border-radius: 22rpx;
}
.event-card image {
  width: 180rpx;
  height: 150rpx;
  border-radius: 18rpx;
}
.event-card view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.event-card view text:first-child {
  font-size: 26rpx;
  font-weight: 900;
}
.event-card view text:nth-child(2),
.event-card view text:last-child {
  color: #66736d;
  font-size: 19rpx;
}
</style>
