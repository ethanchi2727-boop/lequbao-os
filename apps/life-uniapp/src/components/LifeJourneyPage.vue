<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from './LifeSurface.vue';
import {
  lifeSession,
  lifeRuntimeProfile,
  parsePaymentCredential,
} from '../services/life-session.js';
import { lifeSurfaceState } from '../surface-contract.js';

const props = defineProps({ pageId: { type: String, required: true } });
const pageMeta = Object.freeze({
  216: ['附近推荐', '按真实距离发现可服务门店', 'blue'],
  218: ['商家详情', '门店主档与当前在售商品', 'blue'],
  221: ['团购详情', '价格、库存与履约规则实时确认', 'orange'],
  224: ['购物车', '按商家分组并重新校验价格库存', 'green'],
  227: ['地址与配送', '为实物商品选择真实履约方式', 'green'],
  228: ['优惠与奖励', '奖励独立记账，不替代订单优惠', 'orange'],
  229: ['订单确认', '服务端核价后再创建商家直收订单', 'green'],
  231: ['微信支付', '支付结果只以服务端回调为准', 'blue'],
  232: ['支付结果', '刷新服务端订单状态，避免重复付款', 'blue'],
  235: ['会员首页', '账户权益与消费奖励清晰分账', 'orange'],
  237: ['订单列表', '仅展示当前消费者可访问的订单', 'green'],
  238: ['订单详情', '订单、支付、履约状态同源展示', 'green'],
  239: ['售后记录', '申请进度与金额来自售后服务', 'orange'],
  240: ['退款详情', '退款审批与渠道进度可追踪', 'orange'],
});
const meta = computed(() => pageMeta[props.pageId] ?? ['生活服务', '服务端真实状态', 'green']);
const loading = ref(false);
const busy = ref(false);
const error = ref(null);
const records = ref([]);
const detail = ref(null);
const cart = ref({ groups: [], itemCount: 0 });
const addresses = ref([]);
const rewards = ref([]);
const checkout = ref(null);
const deliveryMode = ref('STORE_PICKUP');
const selectedAddressId = ref('');
const notice = ref('');
const orderFilter = ref('ALL');
const orderFilters = Object.freeze([
  ['ALL', '全部'],
  ['PENDING_PAYMENT', '待付款'],
  ['PAID', '已付款'],
  ['FULFILLING', '履约中'],
  ['COMPLETED', '已完成'],
]);
const query = () => getCurrentPages().at(-1)?.options ?? {};
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: records.value }),
);
const cartItems = computed(() => (cart.value.groups || []).flatMap((group) => group.items || []));
const orderId = computed(() => query().orderId || detail.value?.id || records.value[0]?.id || '');
const filteredOrders = computed(() =>
  props.pageId !== '237' || orderFilter.value === 'ALL'
    ? records.value
    : records.value.filter((order) => order.status === orderFilter.value),
);
const money = (cents) => `¥${(Number(cents || 0) / 100).toFixed(2)}`;
const orderStatusText = Object.freeze({
  PENDING_PAYMENT: '待付款',
  PAID: '已付款',
  FULFILLING: '履约中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
});
const statusText = (status) => orderStatusText[status] || status || '状态更新中';
const key = (scope) => `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const go = (id, parameters = {}) => {
  const suffix = Object.entries(parameters)
    .filter(([, value]) => value)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  uni.navigateTo({ url: `/pages/page-${id}/index${suffix ? `?${suffix}` : ''}` });
};

async function load() {
  loading.value = true;
  error.value = null;
  notice.value = '';
  records.value = [];
  detail.value = null;
  try {
    const params = query();
    if (props.pageId === '216')
      records.value = await lifeSession.request('/api/v1/life/discovery/stores?limit=30');
    if (props.pageId === '218') {
      let storeId = params.storeId;
      if (!storeId) {
        const stores = await lifeSession.request('/api/v1/life/discovery/stores?limit=1');
        storeId = stores[0]?.id || '';
      }
      if (!storeId) return;
      records.value = await lifeSession.request(
        `/api/v1/life/discovery/products?storeId=${encodeURIComponent(storeId)}&limit=30`,
      );
      detail.value = {
        id: storeId,
        name: params.storeName || records.value[0]?.storeName || '门店',
      };
    }
    if (props.pageId === '221') {
      const products = await lifeSession.request(
        '/api/v1/life/discovery/products?productType=GROUP_BUY&limit=100',
      );
      detail.value = params.productId
        ? await lifeSession.request(
            `/api/v1/life/discovery/products/${encodeURIComponent(params.productId)}`,
          )
        : products[0] || null;
      records.value = detail.value ? [detail.value] : [];
    }
    if (['224', '227', '229'].includes(props.pageId)) {
      [cart.value, addresses.value] = await Promise.all([
        lifeSession.request('/api/v1/life/cart'),
        lifeSession.request('/api/v1/life/addresses'),
      ]);
      records.value = cartItems.value;
      selectedAddressId.value =
        params.addressId ||
        addresses.value.find((item) => item.isDefault)?.id ||
        addresses.value[0]?.id ||
        '';
      checkout.value = uni.getStorageSync('lequ.life.checkout.v1') || null;
    }
    if (props.pageId === '228') {
      rewards.value = await lifeSession.request('/api/v1/life/rewards?limit=20');
      records.value = rewards.value;
    }
    if (['231', '232', '238'].includes(props.pageId)) {
      detail.value = params.orderId
        ? await lifeSession.request(`/api/v1/life/orders/${encodeURIComponent(params.orderId)}`)
        : null;
      records.value = detail.value ? [detail.value] : [];
    }
    if (props.pageId === '235') {
      const [membership, ledger] = await Promise.all([
        lifeSession.request('/api/v1/consumer/membership'),
        lifeSession.request('/api/v1/life/rewards?limit=20'),
      ]);
      detail.value = membership;
      rewards.value = ledger;
      records.value = [membership];
    }
    if (props.pageId === '237')
      records.value = await lifeSession.request(
        `/api/v1/life/orders?${params.status ? `status=${encodeURIComponent(params.status)}&` : ''}limit=30`,
      );
    if (['239', '240'].includes(props.pageId)) {
      detail.value = params.orderId
        ? await lifeSession.request(
            `/api/v1/life/orders/${encodeURIComponent(params.orderId)}/aftercare`,
          )
        : null;
      records.value = detail.value?.refunds || [];
      if (props.pageId === '240' && params.refundId)
        records.value = records.value.filter((item) => item.id === params.refundId);
    }
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

async function addToCart(product) {
  busy.value = true;
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
    uni.showToast({ title: '加入失败，请重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
async function removeItem(item) {
  busy.value = true;
  try {
    cart.value = await lifeSession.request(`/api/v1/life/cart/items/${item.id}`, {
      method: 'DELETE',
    });
    records.value = cartItems.value;
  } catch {
    uni.showToast({ title: '移除失败，请重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
function fulfillmentChoices() {
  return (cart.value.groups || []).flatMap((group) =>
    [...new Set((group.items || []).map((item) => item.productType))].map((productType) => ({
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
    })),
  );
}
async function quote() {
  if (deliveryMode.value === 'PHYSICAL_DELIVERY' && !selectedAddressId.value)
    return uni.showToast({ title: '请选择配送地址', icon: 'none' });
  busy.value = true;
  try {
    checkout.value = await lifeSession.request('/api/v1/life/checkouts/quote', {
      method: 'POST',
      header: { 'Idempotency-Key': key('life-quote') },
      data: { cartVersion: cart.value.version, fulfillmentChoices: fulfillmentChoices() },
    });
    uni.setStorageSync('lequ.life.checkout.v1', checkout.value);
    go('228');
  } catch {
    uni.showToast({ title: '核价失败，请刷新库存', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
async function submit() {
  if (!checkout.value?.id) return quote();
  busy.value = true;
  try {
    checkout.value = await lifeSession.request(
      `/api/v1/life/checkouts/${checkout.value.id}/actions/submit`,
      { method: 'POST', header: { 'Idempotency-Key': key('life-submit') } },
    );
    uni.setStorageSync('lequ.life.checkout.v1', checkout.value);
    const created =
      checkout.value.orders?.[0] || checkout.value.groups?.find((item) => item.orderId);
    go('231', { orderId: created?.id || created?.orderId || '' });
  } catch {
    uni.showToast({ title: '创建订单失败，可安全重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
async function pay() {
  if (!orderId.value) return;
  busy.value = true;
  try {
    const intent = await lifeSession.request('/api/v1/life/payment-intents', {
      method: 'POST',
      header: { 'Idempotency-Key': key(`life-payment-${orderId.value}`) },
      data: { orderId: orderId.value, provider: 'WECHAT_PAY' },
    });
    if (!lifeRuntimeProfile.developmentMocks)
      await uni.requestPayment({
        ...parsePaymentCredential(intent.clientCredential),
        provider: 'wxpay',
      });
    notice.value = lifeRuntimeProfile.developmentMocks
      ? '开发 Mock 只创建支付意图，不会伪造支付成功'
      : '支付已提交，最终结果以服务端确认';
    go('232', { orderId: orderId.value });
  } catch {
    notice.value = '支付未完成；请刷新订单状态后再决定是否重试';
  } finally {
    busy.value = false;
  }
}
async function refund() {
  const order = detail.value;
  const items = (order?.items || [])
    .map((item) => ({
      orderItemId: item.id,
      quantity: Number(item.quantity) - Number(item.refundedQuantity || 0),
    }))
    .filter((item) => item.quantity > 0);
  if (
    !order ||
    order.paymentStatus !== 'PAID' ||
    order.fulfillmentStatus !== 'NOT_STARTED' ||
    !items.length
  )
    return;
  busy.value = true;
  try {
    await lifeSession.request(`/api/v1/life/orders/${order.id}/refunds`, {
      method: 'POST',
      header: { 'Idempotency-Key': key(`life-refund-${order.id}`) },
      data: { requestType: 'UNSHIPPED_REFUND', reasonCode: 'CUSTOMER_UNSHIPPED_REFUND', items },
    });
    go('239', { orderId: order.id });
  } catch {
    uni.showToast({ title: '退款申请失败，请刷新后重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
onShow(load);
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    :eyebrow="`PAGE-${pageId}`"
    :title="meta[0]"
    :detail="meta[1]"
    :theme-color="meta[2] === 'orange' ? 'coral' : meta[2]"
  >
    <view v-if="state === 'loading'" class="section empty-safe">正在读取服务端真实状态…</view>
    <view
      v-else-if="state === 'unauthenticated'"
      class="section empty-safe"
      @click="uni.switchTab({ url: '/pages/me/index' })"
      >登录后继续，点此前往“我的”</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权访问该记录</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty' && pageId !== '228'" class="section empty-safe"
      >当前没有可展示的数据</view
    >

    <view v-if="pageId === '216' && state === 'ready'" class="section card-list">
      <view
        v-for="store in records"
        :key="store.id"
        class="journey-row"
        @click="go('218', { storeId: store.id, storeName: store.name })"
        ><view
          ><text>{{ store.name }}</text
          ><text>{{ store.cityCode || '当前城市' }} · {{ store.productCount }} 件在售</text></view
        ><text>{{ store.distanceKm === null ? '查看' : `${store.distanceKm}km` }}</text></view
      >
    </view>
    <view v-if="pageId === '218' && state === 'ready'" class="section"
      ><view class="section-head"
        ><text>{{ detail.name }}</text
        ><text>{{ records.length }} 件在售</text></view
      ><view class="card-list"
        ><view
          v-for="product in records"
          :key="product.id"
          class="journey-row"
          @click="
            product.productType === 'GROUP_BUY'
              ? go('221', { productId: product.id })
              : addToCart(product)
          "
          ><view
            ><text>{{ product.title }}</text
            ><text>{{ product.variantTitle }} · 库存 {{ product.availableQuantity }}</text></view
          ><text>{{ money(product.salePriceCents) }}</text></view
        ></view
      ></view
    >
    <view v-if="pageId === '221' && detail" class="section"
      ><view class="section-head"
        ><text>{{ detail.title }}</text
        ><text>{{ money(detail.salePriceCents) }}</text></view
      ><view class="facts"
        ><text>{{ detail.variantTitle }}</text
        ><text>库存 {{ detail.availableQuantity }}</text
        ><text>成交前服务端再次校验</text></view
      ><button
        class="primary"
        :loading="busy"
        :disabled="detail.availableQuantity < 1"
        @click="addToCart(detail)"
      >
        加入购物车
      </button></view
    >
    <view v-if="pageId === '224' && state === 'ready'" class="section"
      ><view v-for="group in cart.groups" :key="group.storeId"
        ><view class="section-head"
          ><text>{{ group.storeName || '当前门店' }}</text
          ><text>{{ money(group.subtotalCents) }}</text></view
        ><view v-for="item in group.items" :key="item.id" class="journey-row"
          ><view
            ><text>{{ item.productTitle }} × {{ item.quantity }}</text
            ><text>{{ item.available ? item.variantTitle : '库存或价格已变化' }}</text></view
          ><button size="mini" @click="removeItem(item)">移除</button></view
        ></view
      ><button class="primary" @click="go('227')">去结算</button></view
    >
    <view v-if="pageId === '227' && state === 'ready'" class="section"
      ><view class="section-head"><text>履约方式</text><text>按门店分别履约</text></view
      ><view class="tabs delivery-tabs"
        ><button
          :class="{ active: deliveryMode === 'STORE_PICKUP' }"
          @click="deliveryMode = 'STORE_PICKUP'"
        >
          <text>到店自提</text><text>到店核验后取货</text></button
        ><button
          :class="{ active: deliveryMode === 'PHYSICAL_DELIVERY' }"
          @click="deliveryMode = 'PHYSICAL_DELIVERY'"
        >
          <text>配送到家</text><text>按地址安排履约</text>
        </button></view
      ><picker
        v-if="deliveryMode === 'PHYSICAL_DELIVERY' && addresses.length"
        :range="addresses"
        range-key="addressLine"
        @change="selectedAddressId = addresses[$event.detail.value].id"
        ><view class="picker">{{
          addresses.find((item) => item.id === selectedAddressId)?.addressLine
        }}</view></picker
      ><view v-else-if="deliveryMode === 'PHYSICAL_DELIVERY'" class="empty-safe"
        >请先在“我的”维护配送地址</view
      ><button class="primary" :loading="busy" @click="quote">确认履约并核价</button></view
    >
    <view v-if="pageId === '228' && ['ready', 'empty'].includes(state)" class="section"
      ><view class="section-head"><text>消费奖励</text><text>独立账本</text></view
      ><view v-for="reward in records" :key="reward.id" class="journey-row"
        ><view
          ><text>{{ reward.ruleVersion || '消费奖励' }}</text
          ><text>可用 {{ money(reward.availableAmountCents) }}</text></view
        ><text>{{ reward.status }}</text></view
      ><view v-if="!records.length" class="empty-safe"
        >当前没有可用奖励，本次仍可按服务端核价结算</view
      ><text class="notice">奖励不会被客户端擅自抵扣；本次订单优惠以服务端核价为准。</text
      ><button class="primary" @click="go('229')">查看订单确认</button></view
    >
    <view v-if="pageId === '229' && state === 'ready'" class="section"
      ><view class="section-head"
        ><text>服务端核价</text
        ><text>{{ checkout ? money(checkout.payableAmountCents) : '待核价' }}</text></view
      ><view class="checkout-truth"
        ><view
          ><text>购物车版本</text><text>{{ cart.version }}</text></view
        ><view
          ><text>履约分组</text
          ><text>{{ checkout?.groups?.length || cart.groups.length }}</text></view
        ><view
          ><text>价格状态</text><text>{{ checkout ? '已核价' : '待重新核价' }}</text></view
        ></view
      ><view class="checkout-amounts"
        ><view
          ><text>商品金额</text
          ><text>{{
            money(cart.groups.reduce((sum, group) => sum + Number(group.subtotalCents || 0), 0))
          }}</text></view
        ><view><text>配送与优惠</text><text>服务端规则计算</text></view
        ><view class="checkout-payable"
          ><text>应付金额</text
          ><text>{{ checkout ? money(checkout.payableAmountCents) : '待核价' }}</text></view
        ></view
      ><view class="facts"
        ><text>购物车版本 {{ cart.version }}</text
        ><text>{{ checkout?.groups?.length || cart.groups.length }} 个履约分组</text
        ><text>提交后按商家分别创建订单</text></view
      ><button class="primary" :loading="busy" @click="submit">
        {{ checkout ? '确认创建订单' : '重新核价' }}
      </button></view
    >
    <view v-if="['231', '232', '238'].includes(pageId) && detail" class="section"
      ><view class="section-head"
        ><text>订单 {{ detail.orderNumber || detail.id }}</text
        ><text>{{ statusText(detail.status) }}</text></view
      ><view v-if="pageId === '238'" class="order-truth-grid"
        ><view
          ><text>支付状态</text><text>{{ detail.paymentStatus }}</text></view
        ><view
          ><text>履约状态</text><text>{{ detail.fulfillmentStatus }}</text></view
        ><view
          ><text>售后状态</text><text>{{ detail.aftercareStatus || '暂无售后' }}</text></view
        ><view
          ><text>订单应付</text><text>{{ money(detail.payableAmountCents) }}</text></view
        ></view
      ><view v-if="pageId === '238' && detail.items?.length" class="order-item-list"
        ><view v-for="item in detail.items" :key="item.id"
          ><text>{{ item.title }} × {{ item.quantity }}</text
          ><text>{{ money(item.lineAmountCents) }}</text></view
        ></view
      ><view class="facts"
        ><text>应付 {{ money(detail.payableAmountCents) }}</text
        ><text>支付 {{ detail.paymentStatus }}</text
        ><text>履约 {{ detail.fulfillmentStatus }}</text
        ><text>售后 {{ detail.aftercareStatus }}</text></view
      ><button
        v-if="pageId === '231' && detail.status === 'PENDING_PAYMENT'"
        class="primary"
        :loading="busy"
        @click="pay"
      >
        发起微信支付</button
      ><button v-if="pageId === '232'" class="secondary" @click="load">刷新服务端支付状态</button
      ><text v-if="pageId === '232'" class="payment-truth"
        >微信客户端结果不等于订单支付成功；本页只展示服务端回调确认后的状态。</text
      >
      ><button v-if="pageId === '238'" class="secondary" @click="go('239', { orderId: detail.id })">
        查看售后记录</button
      ><button
        v-if="
          pageId === '238' &&
          detail.paymentStatus === 'PAID' &&
          detail.fulfillmentStatus === 'NOT_STARTED'
        "
        class="danger"
        :loading="busy"
        @click="refund"
      >
        申请未履约退款
      </button></view
    >
    <view v-if="pageId === '235' && detail" class="section"
      ><view class="section-head"
        ><text>{{ detail.levelName || detail.level || '会员账户' }}</text
        ><text>{{ detail.status || '有效' }}</text></view
      ><view class="member-benefit-grid"
        ><view
          ><text>{{ rewards.length }}</text
          ><text>奖励记录</text></view
        ><view
          ><text>{{ records.length }}</text
          ><text>会员账户</text></view
        ><view><text>独立</text><text>订单与奖励账本</text></view></view
      ><view class="facts"
        ><text>会员权益来自服务端账户</text><text>奖励流水 {{ rewards.length }} 条</text
        ><text>订单支付与奖励独立记账</text></view
      ></view
    >
    <view v-if="pageId === '237' && state === 'ready'" class="order-list-surface">
      <scroll-view scroll-x class="order-filters">
        <button
          v-for="filter in orderFilters"
          :key="filter[0]"
          :class="{ active: orderFilter === filter[0] }"
          @click="orderFilter = filter[0]"
        >
          {{ filter[1] }}
        </button>
      </scroll-view>
      <view v-if="filteredOrders.length" class="card-list">
        <view
          v-for="order in filteredOrders"
          :key="order.id"
          class="order-card"
          @click="go('238', { orderId: order.id })"
        >
          <view class="order-card-head"
            ><text>{{ order.storeName || '商家订单' }}</text
            ><text>{{ statusText(order.status) }}</text></view
          >
          <text class="order-number">订单 {{ order.orderNumber || order.id }}</text>
          <view class="order-card-summary"
            ><text>{{ order.items?.length || order.itemCount || 0 }} 件商品</text
            ><text>{{ order.fulfillmentStatus || '等待履约信息' }}</text></view
          >
          <view class="order-card-foot"
            ><text>{{ money(order.payableAmountCents) }}</text
            ><text>查看详情 ›</text></view
          >
        </view>
      </view>
      <view v-else class="empty-safe">当前筛选下没有订单</view>
    </view>
    <view v-if="['239', '240'].includes(pageId) && state === 'ready'" class="section card-list"
      ><view
        v-for="refundItem in records"
        :key="refundItem.id"
        class="refund-card"
        @click="
          pageId === '239' && go('240', { orderId: query().orderId, refundId: refundItem.id })
        "
        ><view class="refund-card-head"
          ><text>退款 {{ refundItem.id }}</text
          ><text>{{ refundItem.status }}</text></view
        ><text>{{ refundItem.reasonCode || refundItem.requestType }}</text>
        <view class="refund-card-foot"
          ><text>{{ money(refundItem.amountCents) }}</text
          ><text>{{ pageId === '239' ? '查看退款详情 ›' : '渠道进度以服务端为准' }}</text></view
        ></view
      ></view
    >
    <text v-if="notice" class="notice section">{{ notice }}</text>
  </LifeSurface>
</template>

<style scoped>
.journey-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #e6ebe8;
}
.journey-row > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.journey-row view text:first-child {
  font-size: 26rpx;
  font-weight: 800;
}
.journey-row view text:last-child,
.notice {
  color: #66736d;
  font-size: 21rpx;
}
.journey-row > text {
  color: #0f9d72;
  font-size: 23rpx;
  font-weight: 800;
}
.journey-row button {
  margin: 0;
  color: #9b3f20;
  background: #fff0eb;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.facts {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
  margin: 20rpx 0;
}
.facts text {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  color: #076c50;
  background: #e8f7f0;
  font-size: 20rpx;
}
.primary,
.secondary,
.danger {
  margin-top: 24rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 800;
}
.primary {
  color: #fff;
  background: #076c50;
}
.secondary {
  color: #076c50;
  background: #e8f7f0;
}
.danger {
  color: #9b3f20;
  background: #fff0eb;
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14rpx;
}
.tabs button {
  color: #66736d;
  background: #f1f5f3;
  border-radius: 18rpx;
  font-size: 23rpx;
}
.tabs button.active {
  color: #fff;
  background: #076c50;
}
.delivery-tabs button {
  display: flex;
  min-height: 108rpx;
  padding: 17rpx 20rpx;
  flex-direction: column;
  justify-content: center;
  text-align: left;
}
.delivery-tabs button text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}
.delivery-tabs button text:last-child {
  margin-top: 4rpx;
  font-size: 16rpx;
  opacity: 0.74;
}
.picker {
  margin-top: 18rpx;
  padding: 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  background: #f8faf9;
  font-size: 22rpx;
}
.notice {
  display: block;
  margin-top: 20rpx;
  line-height: 1.7;
}
.order-list-surface {
  margin-top: 20rpx;
}
.order-filters {
  width: 100%;
  padding-bottom: 16rpx;
  white-space: nowrap;
}
.order-filters button {
  display: inline-flex;
  margin: 0 12rpx 0 0;
  padding: 8rpx 25rpx;
  border-radius: 999rpx;
  color: var(--life-muted);
  background: var(--life-paper);
  font-size: 19rpx;
}
.order-filters button.active {
  color: var(--life-paper);
  background: var(--life-brand);
  font-weight: 900;
}
.order-card {
  padding: 24rpx;
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.order-card-head,
.order-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.order-card-head text:first-child {
  font-size: 25rpx;
  font-weight: 900;
}
.order-card-head text:last-child {
  padding: 6rpx 10rpx;
  border-radius: 10rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 16rpx;
}
.order-number {
  display: block;
  margin: 15rpx 0;
  color: var(--life-muted);
  font-size: 18rpx;
}
.order-card-summary {
  display: flex;
  margin: 0 0 16rpx;
  padding: 14rpx 16rpx;
  border-radius: 14rpx;
  justify-content: space-between;
  color: var(--life-muted);
  background: #f7f9f8;
  font-size: 17rpx;
}
.order-card-foot text:first-child {
  color: var(--life-red);
  font-size: 30rpx;
  font-weight: 900;
}
.order-card-foot text:last-child {
  color: var(--life-brand-deep);
  font-size: 18rpx;
  font-weight: 800;
}
.order-truth-grid {
  display: grid;
  margin-top: 18rpx;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
}
.order-truth-grid > view {
  display: flex;
  padding: 18rpx;
  border-radius: 18rpx;
  flex-direction: column;
  gap: 7rpx;
  background: var(--life-brand-soft);
}
.order-truth-grid text:first-child {
  color: var(--life-muted);
  font-size: 16rpx;
}
.order-truth-grid text:last-child {
  color: var(--life-brand-deep);
  font-size: 22rpx;
  font-weight: 900;
}
.order-item-list {
  display: grid;
  margin-top: 18rpx;
  gap: 10rpx;
}
.order-item-list > view {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--life-line);
  justify-content: space-between;
  gap: 18rpx;
  font-size: 20rpx;
}
.order-item-list text:last-child {
  color: var(--life-red);
  font-weight: 900;
}
.checkout-truth {
  display: grid;
  margin-top: 18rpx;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.checkout-truth > view {
  display: flex;
  min-width: 0;
  padding: 16rpx 8rpx;
  border-radius: 18rpx;
  align-items: center;
  flex-direction: column;
  background: var(--life-brand-soft);
}
.checkout-truth text:first-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.checkout-truth text:last-child {
  margin-top: 6rpx;
  color: var(--life-brand-deep);
  font-size: 19rpx;
  font-weight: 900;
}
.checkout-amounts {
  display: grid;
  margin-top: 20rpx;
  padding: 20rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  gap: 13rpx;
  background: #f9fbfa;
}
.checkout-amounts > view {
  display: flex;
  justify-content: space-between;
  color: var(--life-muted);
  font-size: 20rpx;
}
.checkout-amounts .checkout-payable {
  padding-top: 14rpx;
  border-top: 1rpx solid var(--life-line);
  color: var(--life-ink);
  font-weight: 900;
}
.checkout-payable text:last-child {
  color: var(--life-red);
  font-size: 28rpx;
}
.payment-truth {
  display: block;
  margin-top: 16rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  color: #075d70;
  background: var(--life-blue-soft);
  font-size: 18rpx;
  line-height: 1.55;
}
.refund-card {
  padding: 22rpx;
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.refund-card-head,
.refund-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.refund-card-head text:first-child {
  overflow: hidden;
  font-size: 22rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.refund-card-head text:last-child {
  padding: 6rpx 10rpx;
  border-radius: 10rpx;
  color: #9b3f20;
  background: var(--life-coral-soft);
  font-size: 15rpx;
}
.refund-card > text {
  display: block;
  margin: 14rpx 0;
  color: var(--life-muted);
  font-size: 18rpx;
}
.refund-card-foot text:first-child {
  color: var(--life-red);
  font-size: 27rpx;
  font-weight: 900;
}
.refund-card-foot text:last-child {
  color: #9b3f20;
  font-size: 16rpx;
}
.member-benefit-grid {
  display: grid;
  margin-top: 18rpx;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.member-benefit-grid > view {
  display: flex;
  min-width: 0;
  padding: 18rpx 8rpx;
  border-radius: 18rpx;
  align-items: center;
  flex-direction: column;
  background: var(--life-yellow-soft);
}
.member-benefit-grid text:first-child {
  color: #9b5c00;
  font-size: 26rpx;
  font-weight: 900;
}
.member-benefit-grid text:last-child {
  margin-top: 5rpx;
  color: var(--life-muted);
  text-align: center;
  font-size: 14rpx;
}
</style>
