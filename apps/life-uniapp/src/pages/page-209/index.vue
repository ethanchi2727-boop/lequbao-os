<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const productId = ref('');
const product = ref(null);
const loading = ref(false);
const error = ref(null);
const state = computed(() =>
  lifeSurfaceState({
    loading: loading.value,
    error: error.value,
    records: product.value ? [product.value] : [],
  }),
);

async function load() {
  if (!productId.value) return;
  loading.value = true;
  error.value = null;
  try {
    product.value = await lifeSession.request(
      `/api/v1/life/discovery/products/${encodeURIComponent(productId.value)}`,
    );
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function openPage(page) {
  uni.navigateTo({
    url: `/pages/page-${page}/index?productId=${encodeURIComponent(productId.value)}`,
  });
}

async function addPreferred() {
  const variant = product.value?.variants?.find((item) => item.available);
  if (!variant) return uni.showToast({ title: '当前没有可售规格', icon: 'none' });
  try {
    await lifeSession.request('/api/v1/life/cart/items', {
      method: 'PUT',
      data: {
        merchantTenantId: product.value.merchantTenantId,
        storeId: product.value.storeId,
        variantId: variant.id,
        quantity: 1,
      },
    });
    uni.showToast({ title: '已加入购物车', icon: 'success' });
  } catch {
    uni.showToast({ title: '加入失败，请刷新后重试', icon: 'none' });
  }
}

onLoad((options) => {
  productId.value = String(options?.productId ?? '');
  void load();
});
</script>

<template>
  <LifeSurface
    eyebrow="PAGE-209 · 商品详情"
    :title="product?.title || '商品详情'"
    detail="价格、规格和库存均由服务端实时确认"
    tone="orange"
  >
    <view v-if="state === 'loading'" class="section empty-safe">正在读取商品详情…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe"
      >登录后查看商品详情</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权查看此商品</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >商品不可用或加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">商品不存在或已经下架</view>
    <template v-else>
      <view class="product-image">
        <view class="product-status">{{
          product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '暂时售罄'
        }}</view>
      </view>
      <view class="section product-main">
        <text class="price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text>
        <text class="product-title">{{ product.title }}</text>
        <text>{{ product.storeName }} · 商品版本 {{ product.version }}</text>
        <view class="chips"
          ><text class="chip">{{ product.productType }}</text
          ><text class="chip">{{ product.variants.length }} 个有效规格</text></view
        >
      </view>
      <view class="service-strip"
        ><text>✓ 当前在售</text><text>✓ 库存实核</text><text>✓ 售后有门</text></view
      >
      <button class="detail-link" @click="openPage('210')">
        <text>选择规格</text><text>查看库存与价格 ›</text>
      </button>
      <button class="detail-link" @click="openPage('211')">
        <text>溯源报告</text><text>仅展示已核验证据 ›</text>
      </button>
      <view class="purchase-spacer" />
      <view class="purchase-actions">
        <button @click="openPage('211')">来源证据</button>
        <button :disabled="product.availableQuantity < 1" @click="addPreferred">加入购物车</button>
        <button :disabled="product.availableQuantity < 1" @click="openPage('210')">
          立即选规格
        </button>
      </view>
    </template>
  </LifeSurface>
</template>

<style scoped>
.product-image {
  position: relative;
  width: 100%;
  height: 580rpx;
  border-radius: var(--life-radius-lg);
  background: url('../../assets/v63-retail/product-sprite.webp') 0 0 / 400% 200% no-repeat;
  box-shadow: var(--life-shadow-soft);
}
.product-status {
  position: absolute;
  left: 22rpx;
  bottom: 22rpx;
  padding: 8rpx 14rpx;
  border-radius: 12rpx;
  color: var(--life-paper);
  background: var(--life-red);
  font-size: 17rpx;
  font-weight: 800;
}
.product-main {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.product-title {
  font-size: 36rpx;
  font-weight: 900;
}
.product-main > text:nth-child(3) {
  color: #66736d;
  font-size: 21rpx;
}
.detail-link {
  display: flex;
  width: 100%;
  margin: 18rpx 0 0;
  padding: 24rpx;
  justify-content: space-between;
  background: var(--life-paper);
  border-radius: var(--life-radius-md);
  box-shadow: var(--life-shadow-soft);
  font-size: 23rpx;
}
.detail-link text:first-child {
  font-weight: 900;
}
.detail-link text:last-child {
  color: #076c50;
}
.purchase-actions {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom));
  grid-template-columns: 150rpx 1fr 1fr;
  gap: 14rpx;
  background: var(--life-paper);
  box-shadow: 0 -10rpx 32rpx rgba(31, 68, 54, 0.1);
  box-sizing: border-box;
}
.purchase-actions button {
  margin: 0;
  color: #076c50;
  background: #e8f7f0;
  border-radius: 999rpx;
  font-size: 23rpx;
}
.purchase-actions button:last-child {
  color: #fff;
  background: #076c50;
}
.purchase-actions button:first-child {
  color: var(--life-muted);
  background: var(--life-paper);
}
.purchase-actions button[disabled] {
  opacity: 0.45;
}
.purchase-spacer {
  height: 112rpx;
}
.service-strip {
  display: flex;
  min-height: 70rpx;
  margin-top: 18rpx;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-around;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 17rpx;
}
@media (min-width: 600px) {
  .purchase-actions {
    width: 480px;
    right: auto;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
