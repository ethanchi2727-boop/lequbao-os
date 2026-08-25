<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const cart = ref({ itemCount: 0, groups: [] });
const addresses = ref([]);
const checkout = ref(null);
const checkoutBusy = ref(false);
const deliveryMode = ref('STORE_PICKUP');
const selectedAddressId = ref('');
const items = computed(() => cart.value.groups.flatMap((group) => group.items));
const total = computed(() =>
  cart.value.groups.reduce((sum, group) => sum + group.subtotalCents, 0),
);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: items.value }),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    [cart.value, addresses.value] = await Promise.all([
      lifeSession.request('/api/v1/life/cart'),
      lifeSession.request('/api/v1/life/addresses'),
    ]);
    if (!selectedAddressId.value)
      selectedAddressId.value =
        addresses.value.find((address) => address.isDefault)?.id ?? addresses.value[0]?.id ?? '';
    checkout.value = null;
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

async function removeItem(item) {
  try {
    cart.value = await lifeSession.request(`/api/v1/life/cart/items/${item.id}`, {
      method: 'DELETE',
    });
    checkout.value = null;
    uni.showToast({ title: '已移除', icon: 'success' });
  } catch {
    uni.showToast({ title: '移除失败，请重试', icon: 'none' });
  }
}

const idempotencyKey = (scope) =>
  `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

async function quoteCheckout() {
  checkoutBusy.value = true;
  try {
    const fulfillmentChoices = cart.value.groups.flatMap((group) =>
      [...new Set(group.items.map((item) => item.productType).filter(Boolean))].map(
        (productType) => ({
          merchantTenantId: group.merchantTenantId,
          storeId: group.storeId,
          productType,
          orderType:
            productType === 'PHYSICAL'
              ? deliveryMode.value
              : productType === 'GROUP_BUY'
                ? 'GROUP_BUY'
                : 'SERVICE_APPOINTMENT',
          ...(productType === 'PHYSICAL' && deliveryMode.value === 'PHYSICAL_DELIVERY'
            ? { addressId: selectedAddressId.value }
            : {}),
        }),
      ),
    );
    if (
      deliveryMode.value === 'PHYSICAL_DELIVERY' &&
      fulfillmentChoices.some((choice) => choice.productType === 'PHYSICAL') &&
      !selectedAddressId.value
    ) {
      uni.showToast({ title: '请先在“我的”添加配送地址', icon: 'none' });
      return;
    }
    checkout.value = await lifeSession.request('/api/v1/life/checkouts/quote', {
      method: 'POST',
      header: { 'Idempotency-Key': idempotencyKey('life-quote') },
      data: { cartVersion: cart.value.version, fulfillmentChoices },
    });
  } catch {
    uni.showToast({ title: '结算核价失败，请检查库存', icon: 'none' });
  } finally {
    checkoutBusy.value = false;
  }
}

async function submitCheckout() {
  if (!checkout.value?.id) return;
  checkoutBusy.value = true;
  try {
    checkout.value = await lifeSession.request(
      `/api/v1/life/checkouts/${checkout.value.id}/actions/submit`,
      {
        method: 'POST',
        header: { 'Idempotency-Key': idempotencyKey('life-submit') },
      },
    );
    if (checkout.value.status === 'ORDERS_CREATED') {
      uni.showToast({ title: '订单已创建', icon: 'success' });
      await load();
      await uni.switchTab({ url: '/pages/me/index' });
    }
  } catch {
    uni.showToast({ title: '订单创建失败，请重试', icon: 'none' });
  } finally {
    checkoutBusy.value = false;
  }
}

onShow(load);
</script>
<template>
  <LifeSurface
    primary
    :show-assurance="false"
    theme-color="green"
    eyebrow="分组结算"
    title="购物车"
    detail="优惠、配送、奖励与实付逐项算清"
  >
    <template #ambient>
      <view class="cart-hero">
        <view
          ><text>购物车</text
          ><text>{{ items.length ? `${cart.itemCount} 件待结算` : '把喜欢的好物装进来' }}</text
          ><text>价格、库存与配送方式将在提交前再次核验</text></view
        >
        <view class="cart-basket"
          ><view class="basket-mark"><view></view><view></view></view
          ><text>¥{{ (total / 100).toFixed(2) }}</text></view
        >
      </view>
    </template>
    <view class="cart-trust"
      ><text>✓ 库存实核</text><text>✓ 分组履约</text><text>✓ 服务端核价</text
      ><text>✓ 售后有门</text></view
    >
    <view v-if="state === 'loading'" class="section empty-safe">正在重新校验价格与库存…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe">登录后查看购物车</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">购物车还是空的</view>
    <view v-for="group in cart.groups" v-else :key="group.storeId" class="section cart-group"
      ><view class="section-head"
        ><text>{{ group.storeName || '当前门店' }}</text
        ><text>{{ group.items.length }} 件商品</text></view
      ><view v-for="(item, index) in group.items" :key="item.id" class="row-card cart-line"
        ><view class="cart-photo" :style="{ '--sprite-x': `${(index % 4) * 33.333}%` }" /><view
          class="copy"
          ><text>{{ item.productTitle }}</text
          ><text class="cart-variant">{{
            item.available ? item.variantTitle : '商品或库存已变化'
          }}</text
          ><view class="cart-action"
            ><view class="line-price"
              ><text class="price">¥{{ ((item.unitPriceCents || 0) / 100).toFixed(2) }}</text
              ><text>× {{ item.quantity }}</text></view
            >
            ><button size="mini" @click="removeItem(item)">移除</button></view
          ></view
        ></view
      ></view
    ><view v-if="items.length" class="section"
      ><view class="section-head"><text>履约方式</text><text>按门店分别履约</text></view
      ><view class="fulfillment-tabs"
        ><button
          :class="{ active: deliveryMode === 'STORE_PICKUP' }"
          @click="
            deliveryMode = 'STORE_PICKUP';
            checkout = null;
          "
        >
          到店自提</button
        ><button
          :class="{ active: deliveryMode === 'PHYSICAL_DELIVERY' }"
          @click="
            deliveryMode = 'PHYSICAL_DELIVERY';
            checkout = null;
          "
        >
          配送到家
        </button></view
      ><picker
        v-if="deliveryMode === 'PHYSICAL_DELIVERY' && addresses.length"
        :range="addresses"
        range-key="addressLine"
        @change="
          selectedAddressId = addresses[$event.detail.value].id;
          checkout = null;
        "
      >
        <view class="address-picker">
          <text>配送地址</text>
          <text>{{
            addresses.find((address) => address.id === selectedAddressId)?.addressLine
          }}</text>
        </view>
      </picker>
      <view v-else-if="deliveryMode === 'PHYSICAL_DELIVERY'" class="empty-safe address-empty"
        >请先在“我的”添加收货地址</view
      >
      ><view class="section-head"><text>金额明细</text><text>服务端核价</text></view
      ><view class="amount-lines"
        ><view
          ><text>商品合计</text><text>¥{{ (total / 100).toFixed(2) }}</text></view
        ><view><text>配送费用</text><text>结算时确认</text></view
        ><view><text>优惠与奖励</text><text>以核价结果为准</text></view></view
      ><button
        v-if="!checkout"
        class="checkout-button"
        :loading="checkoutBusy"
        @click="quoteCheckout"
      >
        重新核价</button
      ><view v-else class="checkout-confirm"
        ><text>本次应付 ¥{{ (checkout.payableAmountCents / 100).toFixed(2) }}</text
        ><text>共 {{ checkout.groups.length }} 个履约分组，提交后分别创建订单</text
        ><button class="checkout-button" :loading="checkoutBusy" @click="submitCheckout">
          确认创建订单
        </button></view
      ></view
    ></LifeSurface
  >
</template>
<style scoped>
.cart-hero {
  display: flex;
  min-height: 260rpx;
  margin: 8rpx 20rpx 0;
  padding: 34rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  justify-content: space-between;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-brand-deep), var(--life-brand));
  box-shadow: var(--life-shadow);
  box-sizing: border-box;
}
.cart-hero > view:first-child {
  display: flex;
  max-width: 68%;
  flex-direction: column;
}
.cart-hero view:first-child text:first-child {
  font-size: 44rpx;
  font-weight: 900;
}
.cart-hero view:first-child text:nth-child(2) {
  margin-top: 10rpx;
  font-size: 25rpx;
  font-weight: 800;
}
.cart-hero view:first-child text:last-child {
  margin-top: 10rpx;
  font-size: 17rpx;
  opacity: 0.88;
}
.cart-basket {
  display: flex;
  width: 150rpx;
  height: 150rpx;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.16);
}
.cart-basket > text {
  margin-top: 10rpx;
  font-size: 19rpx;
  font-weight: 900;
}
.basket-mark {
  position: relative;
  width: 58rpx;
  height: 44rpx;
  border: 5rpx solid var(--life-paper);
  border-top: 0;
  border-radius: 5rpx 5rpx 14rpx 14rpx;
  box-sizing: border-box;
}
.basket-mark::before,
.basket-mark::after {
  position: absolute;
  top: -12rpx;
  width: 32rpx;
  height: 5rpx;
  border-radius: 999rpx;
  background: var(--life-paper);
  content: '';
}
.basket-mark::before {
  left: -2rpx;
  transform: rotate(-38deg);
}
.basket-mark::after {
  right: -2rpx;
  transform: rotate(38deg);
}
.basket-mark > view {
  position: absolute;
  top: 10rpx;
  width: 4rpx;
  height: 20rpx;
  border-radius: 999rpx;
  background: var(--life-paper);
}
.basket-mark > view:first-child {
  left: 16rpx;
}
.basket-mark > view:last-child {
  right: 16rpx;
}
.cart-trust {
  display: flex;
  min-height: 70rpx;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-around;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 16rpx;
}
.cart-photo {
  width: 150rpx;
  height: 132rpx;
  border-radius: 18rpx;
  flex: none;
  background: url('../../assets/v63-retail/product-sprite.webp') var(--sprite-x) 0 / 400% 200%
    no-repeat;
}
.cart-group {
  padding: 22rpx;
}
.cart-line {
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--life-line);
  border-radius: 0;
  box-shadow: none;
}
.cart-line:last-child {
  border-bottom: 0;
}
.cart-variant {
  display: inline-flex;
  align-self: flex-start;
  padding: 5rpx 10rpx;
  border-radius: 8rpx;
  background: #f1f4f2;
}
.cart-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.line-price {
  display: flex;
  align-items: baseline;
  gap: 9rpx;
}
.line-price > text:last-child {
  color: var(--life-muted);
  font-size: 18rpx;
}
.amount-lines {
  display: grid;
  gap: 14rpx;
}
.amount-lines > view {
  display: flex;
  justify-content: space-between;
  color: var(--life-muted);
  font-size: 21rpx;
}
.amount-lines > view:first-child text:last-child {
  color: var(--life-red);
  font-size: 26rpx;
  font-weight: 900;
}
.cart-action button {
  margin: 0;
  color: #9b3f20;
  background: #fff0eb;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.checkout-button {
  margin-top: 24rpx;
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 800;
}
.checkout-confirm {
  display: flex;
  margin-top: 24rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #e6ebe8;
  flex-direction: column;
  gap: 10rpx;
  color: #66736d;
  font-size: 22rpx;
}
.checkout-confirm text:first-child {
  color: #18231f;
  font-size: 30rpx;
  font-weight: 900;
}
.fulfillment-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14rpx;
  margin-bottom: 22rpx;
}
.fulfillment-tabs button {
  color: #66736d;
  background: #f1f5f3;
  border-radius: 18rpx;
  font-size: 23rpx;
}
.fulfillment-tabs button.active {
  color: #fff;
  background: #076c50;
}
.address-picker {
  display: flex;
  margin-bottom: 26rpx;
  padding: 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  flex-direction: column;
  gap: 8rpx;
  background: #f8faf9;
}
.address-picker text:first-child {
  color: #076c50;
  font-size: 20rpx;
  font-weight: 800;
}
.address-picker text:last-child {
  font-size: 24rpx;
}
.address-empty {
  margin-bottom: 26rpx;
}
</style>
