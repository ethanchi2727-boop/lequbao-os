<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const productId = ref('');
const product = ref(null);
const selectedId = ref('');
const quantity = ref(1);
const loading = ref(false);
const submitting = ref(false);
const error = ref(null);
const state = computed(() =>
  lifeSurfaceState({
    loading: loading.value,
    error: error.value,
    records: product.value ? [product.value] : [],
  }),
);
const selected = computed(
  () => product.value?.variants?.find((variant) => variant.id === selectedId.value) ?? null,
);

async function load() {
  if (!productId.value) return;
  loading.value = true;
  error.value = null;
  try {
    product.value = await lifeSession.request(
      `/api/v1/life/discovery/products/${encodeURIComponent(productId.value)}`,
    );
    selectedId.value =
      product.value.variants.find((variant) => variant.available)?.id ??
      product.value.variants[0]?.id ??
      '';
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function changeQuantity(delta) {
  quantity.value = Math.max(1, Math.min(99, quantity.value + delta));
}

async function confirm() {
  if (!selected.value?.available)
    return uni.showToast({ title: '请选择有库存的规格', icon: 'none' });
  submitting.value = true;
  try {
    await lifeSession.request('/api/v1/life/cart/items', {
      method: 'PUT',
      data: {
        merchantTenantId: product.value.merchantTenantId,
        storeId: product.value.storeId,
        variantId: selected.value.id,
        quantity: quantity.value,
      },
    });
    uni.showToast({ title: '已加入购物车', icon: 'success' });
  } catch {
    uni.showToast({ title: '库存或价格已变化，请重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onLoad((options) => {
  productId.value = String(options?.productId ?? '');
  void load();
});
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    eyebrow="PAGE-210 · 规格选择"
    :title="product?.title || '选择规格'"
    detail="提交时服务端会再次确认库存和价格"
  >
    <view v-if="state === 'loading'" class="section empty-safe">正在读取有效规格…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe">登录后选择规格</view>
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权选择此商品</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >规格加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">商品不存在或已经下架</view>
    <template v-else>
      <view class="selection-summary">
        <view class="selection-photo"></view>
        <view
          ><text>{{ product.title }}</text
          ><text class="selection-price"
            >¥{{ ((selected?.salePriceCents || 0) / 100).toFixed(2) }}</text
          ><text>{{ selected ? `已选：${selected.title}` : '请选择可售规格' }}</text></view
        >
      </view>
      <view class="section variant-section">
        <view class="section-head"
          ><text>有效规格</text><text>{{ product.variants.length }} 项</text></view
        >
        <view class="variant-grid"
          ><button
            v-for="variant in product.variants"
            :key="variant.id"
            :class="['variant', { active: selectedId === variant.id }]"
            :disabled="!variant.available"
            @click="selectedId = variant.id"
          >
            <text>{{ variant.title }}</text
            ><text class="price">¥{{ (variant.salePriceCents / 100).toFixed(2) }}</text
            ><text>{{ variant.available ? `库存 ${variant.availableQuantity}` : '已售罄' }}</text>
          </button></view
        >
      </view>
      <view class="section quantity"
        ><text>购买数量</text
        ><view
          ><button @click="changeQuantity(-1)">−</button><text>{{ quantity }}</text
          ><button @click="changeQuantity(1)">+</button></view
        ></view
      >
      <view class="confirm-rail"
        ><view
          ><text>合计</text
          ><text>¥{{ (((selected?.salePriceCents || 0) * quantity) / 100).toFixed(2) }}</text></view
        ><button class="confirm" :disabled="submitting || !selected?.available" @click="confirm">
          {{ submitting ? '正在确认…' : '加入购物车' }}
        </button></view
      >
    </template>
  </LifeSurface>
</template>

<style scoped>
.variant {
  display: flex;
  width: 100%;
  min-height: 132rpx;
  margin: 0;
  padding: 17rpx;
  justify-content: center;
  flex-direction: column;
  gap: 6rpx;
  text-align: left;
  background: #f8faf9;
  border: 2rpx solid transparent;
  border-radius: 20rpx;
}
.variant-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}
.variant.active {
  border-color: #0f9d72;
  background: #e8f7f0;
}
.variant > text:first-child {
  font-weight: 900;
}
.variant > text:last-child {
  color: #66736d;
  font-size: 16rpx;
}
.variant .price {
  color: var(--life-red);
  font-size: 22rpx;
  font-weight: 900;
}
.selection-summary {
  display: flex;
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: var(--life-radius-lg);
  gap: 20rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.selection-photo {
  width: 150rpx;
  height: 150rpx;
  border-radius: 20rpx;
  flex: none;
  background: url('../../assets/v63-retail/product-sprite.webp') 0 0 / 400% 200% no-repeat;
}
.selection-summary > view:last-child {
  display: flex;
  min-width: 0;
  justify-content: center;
  flex-direction: column;
  gap: 8rpx;
}
.selection-summary > view:last-child > text:first-child {
  overflow: hidden;
  font-size: 25rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-summary > view:last-child > text:last-child {
  color: var(--life-muted);
  font-size: 18rpx;
}
.selection-price {
  color: var(--life-red);
  font-size: 30rpx;
  font-weight: 900;
}
.quantity {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 900;
}
.quantity view {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.quantity button {
  width: 64rpx;
  height: 64rpx;
  margin: 0;
  padding: 0;
  line-height: 64rpx;
  background: #e8f7f0;
  border-radius: 50%;
}
.confirm-rail {
  display: flex;
  position: sticky;
  z-index: 3;
  bottom: calc(18rpx + env(safe-area-inset-bottom));
  margin-top: 24rpx;
  padding: 14rpx 14rpx 14rpx 24rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  align-items: center;
  justify-content: space-between;
  background: var(--life-paper);
  box-shadow: 0 12rpx 34rpx rgba(7, 68, 49, 0.16);
}
.confirm-rail > view {
  display: flex;
  flex-direction: column;
}
.confirm-rail > view text:first-child {
  color: var(--life-muted);
  font-size: 16rpx;
}
.confirm-rail > view text:last-child {
  color: var(--life-red);
  font-size: 29rpx;
  font-weight: 900;
}
.confirm {
  margin: 0;
  padding: 0 34rpx;
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 900;
}
</style>
