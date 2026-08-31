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
  <!-- ===== kimi 真理商品卡（concept-f orders.html .gcell + deals.html .deal 复合结构）=====
       严禁 rpx 换算 375px 基准像素、自创 discount-badge/store-badge/photo-add 旧 V6.1 锚点 -->
  <view
    class="gcell fu"
    :class="{ compact, 'has-vou': !!voucherHint }"
    @click="emit('select', product)"
  >
    <view class="dimgbox">
      <view class="product-photo" :style="productStyle(index)" />
      <text v-if="rank" class="rank-badge">No.{{ rank }}</text>
      <text v-if="discount(product)" class="dtag">省{{ discount(product) }}%</text>
      <text v-if="effectivePromo" class="gtag">{{ effectivePromo }}</text>
      <text class="store-badge">{{ product.storeName }}</text>
      <view
        class="gplus"
        :class="{ disabled: product.availableQuantity < 1 }"
        @click.stop="emit('add', product)"
      >＋</view>
    </view>
    <view class="gt">
      <text class="product-title">{{ product.title }}</text>
      <text class="product-detail">{{ product.variantTitle || '默认规格' }}</text>
      <view class="grow">
        <text class="gp">¥{{ money(product.salePriceCents) }}<text
          v-if="Number(product.marketPriceCents) > Number(product.salePriceCents)"
          class="gp-was"
        >¥{{ money(product.marketPriceCents) }}</text></text>
        <text class="stock-tx">{{
          product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '售罄'
        }}</text>
      </view>
      <view class="product-meta">
        <text class="type-pill">{{ typeLabel(product.productType) }}</text>
        <view v-if="voucherHint" class="voucher-hint">
          <text class="vou-lab">券</text>
          <text>{{ voucherHint }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
/* ===== kimi 真理 .gcell 商品卡（concept-f orders.html 真实 class + 真实 px）===== */
.gcell {
  background: var(--card, #fff);
  border: 1px solid var(--line, rgba(22, 19, 15, 0.08));
  border-radius: 16px;
  overflow: hidden;
  text-decoration: none;
  color: var(--ink, #16130f);
  box-shadow: var(--shadow, 0 10px 26px rgba(22, 19, 15, 0.09));
  transition: transform 260ms ease, box-shadow 260ms ease, background 0.5s;
}
.dimgbox {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.product-photo {
  width: 100%;
  height: 118px;
  background: url('../assets/v63-retail/product-sprite.webp') var(--sprite-x) var(--sprite-y) / 400%
    200% no-repeat;
  display: block;
  object-fit: cover;
}
/* ===== badge 层（kimi .dtag + .gtag 真实 class）===== */
.rank-badge,
.dtag,
.gtag,
.store-badge {
  position: absolute;
  padding: 1.5px 5px;
  border-radius: 4px;
  color: var(--life-paper, #fff);
  font-size: 8.5px;
  font-weight: 800;
}
.rank-badge {
  top: 5px;
  left: 5px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #f6b830, #ff7a2a);
  color: #fff;
  box-shadow: 0 2px 6px rgba(255, 122, 42, 0.4);
  letter-spacing: 0.25px;
}
.dtag {
  top: 5px;
  right: 5px;
  background: linear-gradient(120deg, #ff5d3d, #f03749);
  color: #fff;
  z-index: 2;
}
.gtag {
  top: 24px;
  right: 5px;
  color: var(--notice-tx, #0b6b3d);
  background: var(--notice-bg, #e6f3ea);
  z-index: 2;
}
.rank-badge + .dtag {
  top: 5px;
}
.rank-badge + .gtag {
  top: 5px;
  right: 42px;
}
.store-badge {
  bottom: 5px;
  left: 5px;
  max-width: 100px;
  overflow: hidden;
  background: rgba(22, 19, 15, 0.55);
  color: #fff;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* ===== kimi .gplus 加号按钮（concept-f orders.html 真实 class）===== */
.gplus {
  position: absolute;
  right: 7px;
  bottom: 7px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00c853, #009146);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 3px 8px rgba(0, 145, 70, 0.35);
  font-size: 14px;
  font-weight: 700;
  z-index: 3;
}
.gplus.disabled {
  opacity: 0.45;
}
/* ===== kimi .gt 文案区（concept-f orders.html 真实 class）===== */
.gt {
  padding: 9px 11px 11px;
  display: flex;
  flex-direction: column;
}
.product-title {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.product-detail {
  margin-top: 3px;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--mut, #857c6d);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
/* ===== kimi .grow 价格行（concept-f orders.html 真实 class）===== */
.grow {
  display: flex;
  margin-top: 7px;
  align-items: center;
  justify-content: space-between;
}
.gp {
  font-size: 15px;
  font-weight: 900;
  color: var(--promo, #f03749);
}
.gp-was {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--mut, #857c6d);
  margin-left: 3px;
  text-decoration: line-through;
}
.stock-tx {
  font-size: 8.5px;
  font-weight: 700;
  color: var(--mut, #857c6d);
}
.product-meta {
  display: flex;
  margin-top: 5px;
  align-items: center;
  gap: 5px;
}
.type-pill {
  padding: 1.5px 5px;
  border-radius: 4px;
  font-size: 8.5px;
  font-weight: 800;
  color: var(--notice-tx, #0b6b3d);
  background: var(--notice-bg, #e6f3ea);
}
.voucher-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1.5px 5px;
  border-radius: 4px;
  background: var(--cnt-bg, #16130f);
  color: var(--cnt-tx, #fee600);
  font-size: 8.5px;
  font-weight: 800;
}
.vou-lab {
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--cnt-bg, #16130f);
  background: var(--cnt-tx, #fee600);
  font-weight: 900;
}
/* ===== compact 变体（kimi .deal 横版）===== */
.compact {
  display: grid;
  grid-template-columns: 96px 1fr;
  border-radius: 16px;
}
.compact .dimgbox,
.compact .product-photo {
  height: 100%;
  min-height: 96px;
}
.compact .product-photo {
  width: 96px;
  height: 96px;
}
.compact .store-badge {
  max-width: 60px;
}
.compact .gt {
  min-width: 0;
  justify-content: center;
}
.compact .product-detail {
  -webkit-line-clamp: 1;
}
.compact .product-title {
  -webkit-line-clamp: 1;
}
.compact .gplus {
  width: 22px;
  height: 22px;
  font-size: 12px;
}
</style>
