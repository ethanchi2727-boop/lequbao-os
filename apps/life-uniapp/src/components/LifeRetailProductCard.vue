<script setup>
import { computed } from 'vue';

const props = defineProps({
  product: { type: Object, required: true },
  index: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
  rank: { type: [Number, String], default: '' },
  promoTag: { type: String, default: '' },
  voucherHint: { type: String, default: '' },
});
const emit = defineEmits(['select', 'add']);

function productStyle(index) {
  return {
    '--sprite-x': `${(index % 4) * 33.333}%`,
    '--sprite-y': `${Math.floor((index % 8) / 4) * 100}%`,
  };
}
function money(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}
function discount(product) {
  const sale = Number(product.salePriceCents || 0);
  const market = Number(product.marketPriceCents || 0);
  return market > sale && sale > 0 ? Math.round((1 - sale / market) * 100) : 0;
}
function typeLabel(type) {
  return (
    {
      PHYSICAL: '实物配送',
      SERVICE: '到店服务',
      GROUP_BUY: '团购核销',
      DIGITAL_SUPPLY: '数字商品',
    }[type] || '在售商品'
  );
}

const defaultPromoTags = ['新人价', '立减', '直降', '包邮', '限时', '秒杀'];
const effectivePromo = computed(
  () => props.promoTag || defaultPromoTags[props.index % defaultPromoTags.length],
);
</script>

<template>
  <view
    class="retail-card fu"
    :class="{ compact, 'has-vou': !!voucherHint }"
    @click="emit('select', product)"
  >
    <view class="photo-wrap">
      <view class="product-photo" :style="productStyle(index)" />
      <!-- concept-f 丰富 Badge 层 -->
      <text v-if="rank" class="rank-badge">No.{{ rank }}</text>
      <text v-if="discount(product)" class="discount-badge">省{{ discount(product) }}%</text>
      <text v-if="effectivePromo" class="promo-tag">{{ effectivePromo }}</text>
      <text class="store-badge">{{ product.storeName }}</text>
      <button
        class="photo-add"
        :disabled="product.availableQuantity < 1"
        aria-label="加入购物车"
        @click.stop="emit('add', product)"
      >
        ＋
      </button>
    </view>
    <view class="card-copy">
      <text class="product-title">{{ product.title }}</text>
      <text class="product-detail">{{ product.variantTitle || '默认规格' }}</text>
      <view class="price-row">
        <text class="price-now">¥{{ money(product.salePriceCents) }}</text>
        <text v-if="Number(product.marketPriceCents) > Number(product.salePriceCents)" class="price-was"
          >¥{{ money(product.marketPriceCents) }}</text
        >
      </view>
      <view class="product-meta">
        <text class="type-pill">{{ typeLabel(product.productType) }}</text>
        <text class="stock-tx">{{
          product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '暂时售罄'
        }}</text>
      </view>
      <view v-if="voucherHint" class="voucher-hint">
        <text class="vou-lab">券</text>
        <text>{{ voucherHint }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.retail-card {
  position: relative;
  min-width: 0;
  border-radius: var(--life-radius-lg);
  overflow: hidden;
  background: var(--card, #fff);
  border: 1rpx solid var(--line, rgba(22, 19, 15, 0.08));
  box-shadow: var(--shadow);
  transition: transform 260ms ease, box-shadow 260ms ease;
}
.photo-wrap {
  position: relative;
  overflow: hidden;
}
.product-photo {
  width: 100%;
  height: 326rpx;
  background: url('../assets/v63-retail/product-sprite.webp') var(--sprite-x) var(--sprite-y) / 400%
    200% no-repeat;
}
.rank-badge,
.discount-badge,
.promo-tag,
.store-badge {
  position: absolute;
  padding: 7rpx 12rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  font-size: 16rpx;
  font-weight: 800;
}
.rank-badge {
  top: 14rpx;
  left: 14rpx;
  padding: 8rpx 16rpx;
  background: linear-gradient(135deg, #f6b830, #ff7a2a);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(255, 122, 42, 0.4);
  letter-spacing: 0.5rpx;
}
.discount-badge {
  top: 14rpx;
  right: 14rpx;
  background: var(--promo, #f03749);
  z-index: 2;
}
.promo-tag {
  top: 56rpx;
  right: 14rpx;
  background: var(--hot, #eb6325);
  z-index: 2;
}
.rank-badge + .discount-badge {
  top: 14rpx;
}
.rank-badge + .promo-tag {
  top: 14rpx;
  right: 98rpx;
}
.store-badge {
  bottom: 14rpx;
  left: 14rpx;
  max-width: 200rpx;
  overflow: hidden;
  background: var(--life-overlay);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.photo-add {
  position: absolute;
  right: 14rpx;
  bottom: 14rpx;
  width: 60rpx;
  height: 60rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, var(--accent, #009146), var(--hd2, #006b36));
  box-shadow: 0 10rpx 24rpx rgba(0, 80, 40, 0.28);
  font-size: 38rpx;
  line-height: 60rpx;
  font-weight: 700;
  z-index: 3;
}
.card-copy {
  display: flex;
  padding: 16rpx 18rpx 18rpx;
  flex-direction: column;
}
.product-title {
  display: -webkit-box;
  min-height: 64rpx;
  overflow: hidden;
  color: var(--ink, #16130f);
  font-size: 26rpx;
  line-height: 1.28;
  font-weight: 900;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.product-detail {
  min-height: 34rpx;
  margin-top: 8rpx;
  color: var(--mut, #857c6d);
  font-size: 17rpx;
  line-height: 1.4;
}
.price-row,
.product-meta {
  display: flex;
  margin-top: 12rpx;
  align-items: center;
  justify-content: space-between;
}
.price-now {
  color: var(--promo, #f03749);
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: -0.5rpx;
}
.price-was {
  margin-left: 8rpx;
  color: var(--mut, #857c6d);
  font-size: 18rpx;
  text-decoration: line-through;
}
.product-meta {
  color: var(--mut, #857c6d);
  font-size: 16rpx;
  align-items: center;
}
.type-pill {
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  color: var(--hd2, #006b36);
  background: var(--notice-bg, #e6f3ea);
  font-weight: 800;
}
.voucher-hint {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 12rpx;
  padding: 10rpx 14rpx;
  border-radius: 14rpx;
  align-self: flex-start;
  color: var(--cnt-tx, #fee600);
  background: var(--cnt-bg, #16130f);
  font-size: 18rpx;
  font-weight: 800;
  letter-spacing: 0.3rpx;
}
.has-vou .voucher-hint {
  background: linear-gradient(90deg, var(--cnt-bg, #16130f), #2b2418);
}
.vou-lab {
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  color: var(--cnt-bg, #16130f);
  background: var(--cnt-tx, #fee600);
  font-weight: 900;
}
.photo-add[disabled] {
  opacity: 0.45;
}
.compact {
  display: grid;
  min-height: 178rpx;
  grid-template-columns: 184rpx 1fr;
  border-radius: var(--life-radius-md);
}
.compact .photo-wrap,
.compact .product-photo {
  height: 100%;
  min-height: 178rpx;
}
.compact .store-badge {
  max-width: 110rpx;
}
.compact .card-copy {
  min-width: 0;
  justify-content: center;
}
.compact .product-detail {
  min-height: auto;
}
.compact .product-title {
  min-height: auto;
  -webkit-line-clamp: 1;
}
.compact .photo-add {
  width: 52rpx;
  height: 52rpx;
  line-height: 52rpx;
  font-size: 32rpx;
}
</style>
