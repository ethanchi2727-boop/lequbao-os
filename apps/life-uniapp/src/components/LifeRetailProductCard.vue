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
</script>

<template>
  <view class="retail-card" :class="{ compact }" @click="$emit('select', product)">
    <view class="product-photo" :style="productStyle(index)" />
    <text class="stock-badge">{{
      product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '暂时售罄'
    }}</text>
    <view class="card-copy">
      <text class="product-title">{{ product.title }}</text>
      <text class="product-detail">{{ product.storeName }} · {{ product.variantTitle }}</text>
      <view class="product-action">
        <text>¥{{ (product.salePriceCents / 100).toFixed(2) }}</text>
        <button
          :disabled="product.availableQuantity < 1"
          aria-label="加入购物车"
          @click.stop="$emit('add', product)"
        >
          ＋
        </button>
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
  box-shadow: var(--life-shadow-soft);
}
.product-photo {
  width: 100%;
  height: 320rpx;
  background: url('../assets/v63-retail/product-sprite.webp') var(--sprite-x) var(--sprite-y) / 400%
    200% no-repeat;
}
.stock-badge {
  position: absolute;
  top: 278rpx;
  left: 16rpx;
  padding: 6rpx 10rpx;
  border-radius: 10rpx;
  color: var(--life-paper);
  background: var(--life-red);
  font-size: 15rpx;
}
.card-copy {
  display: flex;
  padding: 16rpx 18rpx 18rpx;
  flex-direction: column;
}
.product-title {
  overflow: hidden;
  font-size: 24rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-detail {
  min-height: 48rpx;
  margin-top: 8rpx;
  color: var(--life-muted);
  font-size: 17rpx;
  line-height: 1.4;
}
.product-action {
  display: flex;
  margin-top: 12rpx;
  align-items: center;
  justify-content: space-between;
}
.product-action > text {
  color: var(--life-red);
  font-size: 30rpx;
  font-weight: 900;
}
.product-action button {
  width: 52rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  color: var(--life-paper);
  background: var(--life-coral);
  font-size: 34rpx;
  line-height: 52rpx;
}
.product-action button[disabled] {
  opacity: 0.45;
}
.compact {
  display: grid;
  min-height: 178rpx;
  grid-template-columns: 184rpx 1fr;
  border-radius: var(--life-radius-md);
}
.compact .product-photo {
  height: 100%;
  min-height: 178rpx;
}
.compact .stock-badge {
  top: auto;
  bottom: 12rpx;
  left: 12rpx;
}
.compact .card-copy {
  min-width: 0;
  justify-content: center;
}
.compact .product-detail {
  min-height: auto;
}
</style>
