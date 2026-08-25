<script setup>
defineProps({
  product: { type: Object, required: true },
  index: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
});
defineEmits(['select', 'add']);
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
</script>

<template>
  <view class="retail-card" :class="{ compact }" @click="$emit('select', product)">
    <view class="photo-wrap">
      <view class="product-photo" :style="productStyle(index)" />
      <text v-if="discount(product)" class="discount-badge">省 {{ discount(product) }}%</text>
      <text class="store-badge">{{ product.storeName }}</text>
      <button
        class="photo-add"
        :disabled="product.availableQuantity < 1"
        aria-label="加入购物车"
        @click.stop="$emit('add', product)"
      >
        ＋
      </button>
    </view>
    <view class="card-copy">
      <text class="product-title">{{ product.title }}</text>
      <text class="product-detail">{{ product.variantTitle || '默认规格' }}</text>
      <view class="price-row">
        <text>¥{{ money(product.salePriceCents) }}</text>
        <text v-if="Number(product.marketPriceCents) > Number(product.salePriceCents)"
          >¥{{ money(product.marketPriceCents) }}</text
        >
      </view>
      <view class="product-meta">
        <text>{{ typeLabel(product.productType) }}</text>
        <text>{{
          product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '暂时售罄'
        }}</text>
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
  background: var(--life-paper);
  border: 1rpx solid var(--life-line);
  box-shadow: var(--life-shadow-card);
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
.discount-badge,
.store-badge {
  position: absolute;
  padding: 7rpx 12rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  font-size: 16rpx;
  font-weight: 800;
}
.discount-badge {
  top: 14rpx;
  left: 14rpx;
  background: var(--life-red);
}
.store-badge {
  bottom: 14rpx;
  left: 14rpx;
  max-width: 190rpx;
  overflow: hidden;
  background: var(--life-overlay);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.photo-add {
  position: absolute;
  right: 14rpx;
  bottom: 14rpx;
  width: 56rpx;
  height: 56rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  color: var(--life-paper);
  background: var(--life-brand);
  box-shadow: var(--life-shadow-float);
  font-size: 36rpx;
  line-height: 56rpx;
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
  font-size: 26rpx;
  line-height: 1.28;
  font-weight: 900;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.product-detail {
  min-height: 34rpx;
  margin-top: 8rpx;
  color: var(--life-muted);
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
.price-row > text:first-child {
  color: var(--life-red);
  font-size: 32rpx;
  font-weight: 900;
}
.price-row > text:last-child:not(:first-child) {
  margin-left: 10rpx;
  color: var(--life-muted);
  font-size: 18rpx;
  text-decoration: line-through;
}
.product-meta {
  margin-top: 12rpx;
  color: var(--life-muted);
  font-size: 16rpx;
}
.product-meta text:first-child {
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-weight: 800;
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
  display: none;
}
</style>
