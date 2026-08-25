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
    theme-color="green"
    eyebrow="分组结算"
    title="购物车"
    detail="优惠、配送、奖励与实付逐项算清"
    ><view v-if="state === 'loading'" class="section empty-safe">正在重新校验价格与库存…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe">登录后查看购物车</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">购物车还是空的</view>
    <view v-for="group in cart.groups" v-else :key="group.storeId" class="section"
      ><view class="section-head"
        ><text>{{ group.storeName || '当前门店' }}</text
        ><text>{{ group.items.length }} 件商品</text></view
      ><view v-for="item in group.items" :key="item.id" class="row-card"
        ><image src="/static/life-product.webp" mode="aspectFill" /><view class="copy"
          ><text>{{ item.productTitle }} × {{ item.quantity }}</text
          ><text>{{ item.available ? item.variantTitle : '商品或库存已变化' }}</text
          ><view class="cart-action"
            ><text class="price">¥{{ ((item.unitPriceCents || 0) / 100).toFixed(2) }}</text
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
      ><view class="section-head"><text>金额明细</text><text>规则快照</text></view
      ><view class="chips"
        ><text class="chip">商品 ¥{{ (total / 100).toFixed(2) }}</text
        ><text class="chip">运费结算时确认</text><text class="chip">价格已实时校验</text></view
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
.cart-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
