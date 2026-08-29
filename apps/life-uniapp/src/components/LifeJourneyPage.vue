<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from './LifeRetailProductCard.vue';
import LifeSurface from './LifeSurface.vue';
import {
  lifeSession,
  lifeRuntimeProfile,
  parsePaymentCredential,
} from '../services/life-session.js';
import { fetchLifeVouchers, groupVouchers } from '../services/life-vouchers.js';
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
const vouchers = ref([]);
const selectedVoucherId = ref('');
const deliveryMode = ref('STORE_PICKUP');
const selectedAddressId = ref('');
const notice = ref('');
const orderFilter = ref('ALL');
const orderSearch = ref('');
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
const cartSummary = computed(() => ({
  stores: cart.value.groups?.length || 0,
  items: cartItems.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  subtotal: (cart.value.groups || []).reduce(
    (sum, group) => sum + Number(group.subtotalCents || 0),
    0,
  ),
}));
const applicableVouchers = computed(() => {
  const tenantIds = new Set(
    (checkout.value?.groups?.length ? checkout.value.groups : cart.value.groups || []).map(
      (group) => group.merchantTenantId,
    ),
  );
  if (!tenantIds.size) return vouchers.value;
  return vouchers.value.filter((voucher) => tenantIds.has(voucher.merchantTenantId));
});
const applicableVoucherCents = computed(() =>
  applicableVouchers.value.reduce((sum, voucher) => sum + Number(voucher.amountCents || 0), 0),
);
const orderId = computed(() => query().orderId || detail.value?.id || records.value[0]?.id || '');
const groupDiscountText = computed(() => {
  const sale = Number(detail.value?.salePriceCents || 0);
  const market = Number(detail.value?.marketPriceCents || 0);
  if (sale <= 0 || market <= sale) return '';
  return ((sale / market) * 10).toFixed(1).replace(/\.0$/u, '');
});
const voucherRuleUrl = computed(
  () => `/pages/voucher/rule/index?amt=${(Number(detail.value?.salePriceCents || 0) / 100).toFixed(2)}`,
);
const filteredOrders = computed(() => {
  const filtered =
    props.pageId !== '237' || orderFilter.value === 'ALL'
      ? records.value
      : records.value.filter((order) => order.status === orderFilter.value);
  const keyword = orderSearch.value.trim().toLocaleLowerCase();
  if (!keyword) return filtered;
  return filtered.filter((order) =>
    [order.orderNumber, order.orderNo, order.id, order.storeName]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(keyword)),
  );
});
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
const paymentStatusText = (status) =>
  ({ PENDING: '待支付', PROCESSING: '支付处理中', PAID: '已支付', FAILED: '支付失败' })[status] ||
  status ||
  '待确认';
const fulfillmentStatusText = (status) =>
  ({
    NOT_STARTED: '待履约',
    PREPARING: '备货中',
    IN_PROGRESS: '履约中',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  })[status] ||
  status ||
  '待确认';
const aftercareStatusText = (status) =>
  ({ NONE: '暂无售后', REQUESTED: '已申请', PROCESSING: '处理中', COMPLETED: '已完成' })[status] ||
  status ||
  '暂无售后';
const refundStatusText = (status) =>
  ({
    REQUESTED: '已提交',
    APPROVED: '已批准',
    PROCESSING: '渠道处理中',
    SUCCEEDED: '退款成功',
    REJECTED: '已拒绝',
    FAILED: '退款失败',
  })[status] ||
  status ||
  '状态更新中';
const refundProgress = (status) =>
  ({ REQUESTED: 1, APPROVED: 2, PROCESSING: 2, SUCCEEDED: 3 })[status] || 1;
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
      if (props.pageId === '229') {
        const fulfillment = uni.getStorageSync('lequ.life.fulfillment.v1');
        if (fulfillment?.deliveryMode) deliveryMode.value = fulfillment.deliveryMode;
        if (fulfillment?.addressId) selectedAddressId.value = fulfillment.addressId;
        vouchers.value = groupVouchers(
          await fetchLifeVouchers(lifeSession, 100).catch(() => []),
        ).active;
        selectedVoucherId.value = '';
      }
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
async function buyNow(product) {
  busy.value = true;
  try {
    cart.value = await lifeSession.request('/api/v1/life/cart/items', {
      method: 'PUT',
      data: {
        merchantTenantId: product.merchantTenantId,
        storeId: product.storeId,
        variantId: product.variantId,
        quantity: 1,
      },
    });
    go('224');
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
async function quote(redemption) {
  const rewardRedemption =
    redemption && typeof redemption === 'object' && typeof redemption.action === 'string'
      ? { action: redemption.action, ...(redemption.rewardGrantIds ? { rewardGrantIds: redemption.rewardGrantIds } : {}) }
      : null;
  if (deliveryMode.value === 'PHYSICAL_DELIVERY' && !selectedAddressId.value)
    return uni.showToast({ title: '请选择配送地址', icon: 'none' });
  busy.value = true;
  try {
    checkout.value = await lifeSession.request('/api/v1/life/checkouts/quote', {
      method: 'POST',
      header: { 'Idempotency-Key': key('life-quote') },
      data: {
        cartVersion: cart.value.version,
        fulfillmentChoices: fulfillmentChoices(),
        ...(rewardRedemption ? { rewardRedemption } : {}),
      },
    });
    uni.setStorageSync('lequ.life.checkout.v1', checkout.value);
    uni.setStorageSync('lequ.life.fulfillment.v1', {
      deliveryMode: deliveryMode.value,
      addressId: selectedAddressId.value,
    });
    if (props.pageId !== '229') go('228');
  } catch {
    uni.showToast({ title: '核价失败，请刷新库存', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
async function toggleVoucher(voucher) {
  if (busy.value || !cart.value?.version) return;
  const previous = selectedVoucherId.value;
  const next =
    previous === voucher.id
      ? { id: '', redemption: { action: 'SKIP' } }
      : { id: voucher.id, redemption: { action: 'APPLY', rewardGrantIds: [voucher.id] } };
  selectedVoucherId.value = next.id;
  await quote(next.redemption);
  if (checkout.value?.rewardRedemptionStatus === 'APPLIED' && !next.id)
    selectedVoucherId.value = previous;
  if (next.id && checkout.value?.rewardRedemptionStatus !== 'APPLIED') {
    selectedVoucherId.value = '';
    uni.showToast({ title: '该代金券本单暂不可抵', icon: 'none' });
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

    <view v-if="pageId === '216' && state === 'ready'" class="store-discovery">
      <view class="section-head"
        ><text>附近好店</text><text>{{ records.length }} 家在营</text></view
      >
      <button
        v-for="(store, index) in records"
        :key="store.id"
        class="journey-store-card"
        @click="go('218', { storeId: store.id, storeName: store.name })"
      >
        <view class="journey-store-photo" :style="{ '--store-x': `${(index % 4) * 25}%` }"
          ><text v-if="store.distanceKm !== null">{{ store.distanceKm }}km</text></view
        ><view
          ><text>{{ store.name }}</text
          ><text>{{ store.cityCode || '当前城市' }} · 当前在营</text
          ><view
            ><text>{{ store.productCount }} 件在售</text><text>进店 ›</text></view
          ></view
        >
      </button>
    </view>
    <view v-if="pageId === '218' && state === 'ready'" class="store-detail-surface"
      ><view class="store-detail-head"
        ><view class="store-detail-photo"></view
        ><view
          ><text>{{ detail.name }}</text
          ><text>真实在营 · 服务范围已确认</text
          ><text>{{ records.length }} 件商品与服务在售</text></view
        ></view
      ><view class="section-head"><text>门店在售</text><text>库存实时更新</text></view
      ><view class="journey-product-grid"
        ><LifeRetailProductCard
          v-for="(product, index) in records"
          :key="product.id"
          :product="product"
          :index="index"
          @select="
            (selectedProduct) =>
              selectedProduct.productType === 'GROUP_BUY'
                ? go('221', { productId: selectedProduct.id })
                : go('209', { productId: selectedProduct.id })
          "
          @add="addToCart" /></view
    ></view>
    <view v-if="pageId === '221' && detail" class="group-detail-surface"
      ><view class="group-detail-photo"
        ><text>到店团购</text
        ><text>{{ detail.availableQuantity > 0 ? '实时可售' : '当前售罄' }}</text></view
      ><view class="group-detail-copy"
        ><view class="group-price"
          ><text>{{ money(detail.salePriceCents) }}</text
          ><text
            v-if="Number(detail.marketPriceCents) > Number(detail.salePriceCents)"
            class="group-price-old"
            >{{ money(detail.marketPriceCents) }}</text
          ><text v-if="groupDiscountText" class="group-price-off"
            >限时 {{ groupDiscountText }} 折</text
          ><text v-else class="group-price-tag">服务端实时成交价</text></view
        ><text class="group-title">{{ detail.title }}</text
        ><view class="drules"
          ><text>随时退</text><text>过期自动退</text><text>免预约</text></view
        ><text class="group-store">{{ detail.storeName || '适用门店以核价结果为准' }}</text
        ><navigator class="voucher-banner" :url="voucherRuleUrl" hover-class="none"
          ><view class="voucher-banner-icon"><text>券</text></view
          ><view class="voucher-banner-copy"
            ><text class="voucher-banner-title"
              >最高可获得 {{ money(detail.salePriceCents) }} 元代金券</text
            ><text class="voucher-banner-desc">共50期发放完毕 · 确认收货后按期到账</text></view
          ><text class="voucher-banner-go">规则 ›</text></navigator
        ><view
          class="group-shop-card"
          @click="go('218', { storeId: detail.storeId, storeName: detail.storeName })"
          ><view class="group-shop-copy"
            ><text>{{ detail.storeName || '适用门店' }}</text
            ><text>门店主档、在售商品与核销规则</text></view
          ><text class="group-shop-go">查看门店 ›</text></view
        ><view class="group-rule-grid"
          ><view
            ><text>规格</text><text>{{ detail.variantTitle }}</text></view
          ><view
            ><text>库存</text><text>{{ detail.availableQuantity }}</text></view
          ><view><text>履约</text><text>到店核销</text></view></view
        ><view class="group-know-card"
          ><text class="group-know-title">购买须知</text
          ><view class="mrow"
            ><text>有效期</text><text>以订单核销页展示为准</text></view
          ><view class="mrow"
            ><text>预约</text><text>免预约，高峰期建议提前到店</text></view
          ><view class="mrow"
            ><text>退款</text><text class="mrow-accent">未核销可申请退款 · 售后以服务端规则为准</text></view
          ></view
        ><text class="group-notice">成交前服务端会再次校验价格、库存与适用门店。</text></view
      ><view class="group-buy-bar"
        ><button
          class="group-cart-button"
          :loading="busy"
          :disabled="detail.availableQuantity < 1"
          @click="addToCart(detail)"
        >
          加入购物车
        </button
        ><button
          class="primary group-buy-button"
          :loading="busy"
          :disabled="detail.availableQuantity < 1"
          @click="buyNow(detail)"
        >
          马上抢 {{ money(detail.salePriceCents) }}
        </button></view
      ></view
    >
    <view v-if="pageId === '224' && state === 'ready'" class="journey-cart-surface">
      <view class="journey-cart-summary">
        <view class="journey-basket-mark"><view></view></view>
        <view
          ><text>{{ cartSummary.items }} 件商品</text
          ><text>{{ cartSummary.stores }} 家门店分别履约</text></view
        >
        <text>{{ money(cartSummary.subtotal) }}</text>
      </view>
      <view v-for="group in cart.groups" :key="group.storeId" class="journey-cart-group">
        <view class="journey-cart-store">
          <view class="journey-store-mark"></view>
          <text>{{ group.storeName || '当前门店' }}</text
          ><text>{{ money(group.subtotalCents) }}</text>
        </view>
        <view v-for="item in group.items" :key="item.id" class="journey-cart-item">
          <view class="journey-item-photo"><view></view></view>
          <view class="journey-item-copy">
            <text>{{ item.productTitle }}</text>
            <text>{{ item.available ? item.variantTitle : '库存或价格已变化' }}</text>
            <text>数量 × {{ item.quantity }}</text>
          </view>
          <button size="mini" @click="removeItem(item)">移除</button>
        </view>
      </view>
      <view class="journey-cart-rail">
        <view
          ><text>合计</text><text>{{ money(cartSummary.subtotal) }}</text></view
        >
        <button class="primary" @click="go('227')">去结算</button>
      </view>
    </view>
    <view v-if="pageId === '227' && state === 'ready'" class="fulfillment-surface">
      <view class="fulfillment-summary">
        <view><text>选择履约方式</text><text>每家门店按服务端规则分别确认</text></view>
        <text>{{ cartSummary.stores }} 组</text>
      </view>
      <view class="tabs delivery-tabs"
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
      ><view class="fulfillment-tip">
        <text>{{ deliveryMode === 'STORE_PICKUP' ? '到店自提' : '配送到家' }}</text>
        <text>{{
          deliveryMode === 'STORE_PICKUP'
            ? '下单后按订单中的门店信息到店核验取货'
            : '配送范围、运费和时效将在服务端核价时确认'
        }}</text>
      </view>
      <picker
        v-if="deliveryMode === 'PHYSICAL_DELIVERY' && addresses.length"
        :range="addresses"
        range-key="addressLine"
        @change="selectedAddressId = addresses[$event.detail.value].id"
        ><view class="picker">{{
          addresses.find((item) => item.id === selectedAddressId)?.addressLine
        }}</view></picker
      ><view v-else-if="deliveryMode === 'PHYSICAL_DELIVERY'" class="empty-safe"
        >请先在“我的”维护配送地址</view
      ><button class="primary" :loading="busy" @click="quote">确认履约并核价</button>
    </view>
    <view
      v-if="pageId === '228' && ['ready', 'empty'].includes(state)"
      class="reward-choice-surface"
    >
      <view class="reward-choice-summary">
        <view><text>消费奖励</text><text>与订单支付资金独立记账</text></view>
        <text>{{ records.length }} 笔</text>
      </view>
      <view v-if="records.length" class="reward-choice-list">
        <view v-for="reward in records" :key="reward.id" class="reward-choice-card">
          <view class="reward-choice-mark"><view></view></view>
          <view>
            <view
              ><text>{{ reward.ruleVersion || '消费奖励' }}</text
              ><text>{{ reward.status }}</text></view
            >
            <text>可用 {{ money(reward.availableAmountCents) }}</text>
            <text>服务端奖励流水，不由客户端自动抵扣</text>
          </view>
        </view>
      </view>
      <view v-else class="empty-safe">当前没有可用奖励，本次仍可按服务端核价结算</view
      ><view class="reward-choice-note"
        >奖励不会被客户端擅自抵扣；本次订单优惠以服务端核价为准。</view
      >
      <button class="primary" @click="go('229')">查看订单确认</button>
    </view>
    <view v-if="pageId === '229' && state === 'ready'" class="checkout-confirm-surface"
      ><view class="checkout-confirm-summary"
        ><view class="checkout-confirm-mark"><view></view></view
        ><view><text>确认订单</text><text>价格、库存与履约规则由服务端最终确认</text></view
        ><text>{{
          checkout ? money(checkout.cashPayableCents ?? checkout.payableAmountCents) : '待核价'
        }}</text></view
      ><view class="checkout-truth"
        ><view
          ><text>购物车版本</text><text>{{ cart.version }}</text></view
        ><view
          ><text>履约分组</text
          ><text>{{ checkout?.groups?.length || cart.groups.length }}</text></view
        ><view
          ><text>价格状态</text><text>{{ checkout ? '已核价' : '待重新核价' }}</text></view
        ></view
      ><view v-if="checkout?.groups?.length" class="checkout-group-list"
        ><view v-for="(group, index) in checkout.groups" :key="group.id" class="checkout-group-card"
          ><view
            ><text>履约分组 {{ index + 1 }}</text
            ><text>{{
              group.orderType === 'PHYSICAL_DELIVERY' ? '配送到家' : '到店自提'
            }}</text></view
          ><text
            >{{ group.items?.length || 0 }} 项商品 · 规则
            {{ group.policy?.version || '未标注' }}</text
          ><view class="checkout-group-benefit"
            ><text>{{ group.discount?.name || '无可用优惠' }}</text
            ><text>{{ money(group.payableAmountCents) }}</text></view
          ></view
        ></view
      ><view class="voucher-apply-card"
        ><view class="voucher-apply-head"
          ><text class="voucher-apply-title">代金券抵扣</text
          ><text class="voucher-apply-count">{{ applicableVouchers.length }} 张可用</text></view
        ><view v-if="applicableVouchers.length" class="voucher-apply-list"
          ><view
            v-for="voucher in applicableVouchers"
            :key="voucher.id"
            class="vopt"
            :class="{ on: selectedVoucherId === voucher.id }"
            @click="toggleVoucher(voucher)"
            ><view class="vopt-copy"
              ><text class="vopt-name">通用代金券 {{ money(voucher.amountCents) }}</text
              ><text class="vopt-desc">{{ voucher.descLine || '无门槛 · 以服务端核价为准' }}</text></view
            ><text class="vopt-action">{{ selectedVoucherId === voucher.id ? '已选 ✓' : '选择' }}</text></view
          ></view
        ><view v-else class="voucher-apply-empty"
          >暂无本单可用代金券 · 下单消费可按规则获得</view
        ></view
      ><view class="checkout-amounts"
        ><view
          ><text>商品金额</text
          ><text>{{ money(checkout?.goodsAmountCents ?? cartSummary.subtotal) }}</text></view
        ><view
          ><text>配送费用</text
          ><text>{{ checkout ? money(checkout.shippingAmountCents) : '待核价' }}</text></view
        ><view
          ><text>订单优惠</text
          ><text>{{ checkout ? `-${money(checkout.discountAmountCents)}` : '待核价' }}</text></view
        ><view v-if="checkout?.rewardRedemptionCents > 0"
          ><text>代金券抵扣</text
          ><text class="voucher-amount">−{{ money(checkout.rewardRedemptionCents) }}</text></view
        ><view class="checkout-payable"
          ><text>应付金额</text
          ><text>{{
            checkout ? money(checkout.cashPayableCents ?? checkout.payableAmountCents) : '待核价'
          }}</text></view
        ></view
      ><view class="checkout-confirm-note"
        >提交后按商家分别创建订单；部分分组失败时，服务端会保留已成功结果并支持安全重试。</view
      >
      ><button class="primary" :loading="busy" @click="submit">
        {{ checkout ? '确认创建订单' : '重新核价' }}
      </button></view
    >
    <view
      v-if="['231', '232', '238'].includes(pageId) && detail"
      :class="pageId === '238' ? 'order-detail-surface' : 'section'"
      ><view v-if="pageId !== '238'" class="section-head"
        ><text>订单 {{ detail.orderNumber || detail.id }}</text
        ><text>{{ statusText(detail.status) }}</text></view
      ><view v-else class="order-detail-summary"
        ><view class="order-detail-mark"><view></view></view
        ><view
          ><text>{{ detail.storeName || '商家订单' }}</text
          ><text>订单 {{ detail.orderNumber || detail.id }}</text></view
        ><text>{{ statusText(detail.status) }}</text></view
      ><view
        v-if="['231', '232'].includes(pageId)"
        class="payment-status-panel"
        :class="{ paid: detail.paymentStatus === 'PAID' }"
        ><view class="payment-seal"><view></view></view
        ><view
          ><text>{{ detail.paymentStatus === 'PAID' ? '支付已确认' : '等待服务端确认支付' }}</text
          ><text>{{ money(detail.payableAmountCents) }}</text
          ><text>订单状态只以服务端支付回调为准</text></view
        ></view
      ><view v-if="pageId === '238'" class="order-truth-grid"
        ><view
          ><text>支付状态</text><text>{{ paymentStatusText(detail.paymentStatus) }}</text></view
        ><view
          ><text>履约状态</text
          ><text>{{ fulfillmentStatusText(detail.fulfillmentStatus) }}</text></view
        ><view
          ><text>售后状态</text><text>{{ aftercareStatusText(detail.aftercareStatus) }}</text></view
        ><view
          ><text>订单应付</text><text>{{ money(detail.payableAmountCents) }}</text></view
        ></view
      ><view v-if="pageId === '238' && detail.items?.length" class="order-item-list"
        ><view v-for="item in detail.items" :key="item.id" class="order-detail-item"
          ><view class="order-detail-photo"><view></view></view
          ><view
            ><text>{{ item.title || item.productTitle }}</text
            ><text>数量 × {{ item.quantity }}</text></view
          ><text>{{ money(item.lineAmountCents) }}</text></view
        ></view
      ><view v-if="pageId !== '238'" class="facts"
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
    <view v-if="pageId === '235' && detail" class="member-surface">
      <view class="member-card">
        <view class="member-card-head">
          <view class="member-emblem"><view></view></view>
          <view
            ><text>{{ detail.levelName || detail.level || '乐趣生活会员' }}</text
            ><text>账户状态 {{ detail.status || '以服务端为准' }}</text></view
          >
          <text>MEMBER</text>
        </view>
        <view class="member-balance">
          <view
            ><text>{{ money(detail.availableRewardCents) }}</text
            ><text>可用消费奖励</text></view
          >
          <view
            ><text>{{ rewards.length }}</text
            ><text>奖励流水</text></view
          >
        </view>
        <text class="member-since">加入时间 {{ detail.memberSince || '服务端暂未标注' }}</text>
      </view>
      <view class="member-benefit-grid">
        <view><text>真实</text><text>会员账户</text></view>
        <view
          ><text>{{ detail.grants?.length || 0 }}</text
          ><text>奖励批次</text></view
        >
        <view><text>独立</text><text>资金与奖励</text></view>
      </view>
      <view class="member-rules">
        <view
          ><text>权益说明</text><text>当前账户权益、状态和奖励余额均来自服务端会员主档</text></view
        >
        <view><text>奖励分账</text><text>消费奖励单独记账，不替代订单优惠或支付资金</text></view>
        <view
          ><text>长期留存</text><text>奖励流水按真实账户持续保存，并可在奖励明细中查询</text></view
        >
      </view>
    </view>
    <view v-if="pageId === '237' && state === 'ready'" class="order-list-surface">
      <view class="order-list-summary">
        <view class="order-list-mark"><view></view></view>
        <view
          ><text>我的订单</text><text>{{ records.length }} 笔服务端订单</text></view
        >
        <text>{{ filteredOrders.length }} 笔</text>
      </view>
      <view class="order-search">
        <view class="order-search-mark"></view>
        <input v-model="orderSearch" type="text" placeholder="搜索订单号或商家" />
        <text v-if="orderSearch" @click="orderSearch = ''">清除</text>
      </view>
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
      <view v-else class="empty-safe">当前筛选或搜索下没有订单</view>
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
          ><text>{{ refundStatusText(refundItem.status) }}</text></view
        ><text>{{ refundItem.reasonCode || refundItem.requestType }}</text>
        <view class="refund-progress"
          ><view
            v-for="step in 3"
            :key="step"
            :class="{ active: step <= refundProgress(refundItem.status) }"
            ><text></text><text>{{ ['提交申请', '渠道处理', '退款完成'][step - 1] }}</text></view
          ></view
        >
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
  border-bottom: 1rpx solid var(--life-line);
}
.store-discovery,
.store-detail-surface,
.group-detail-surface {
  margin-top: 20rpx;
}
.store-discovery {
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.journey-store-card {
  display: flex;
  width: 100%;
  margin: 0;
  padding: 17rpx 0;
  border-bottom: 1rpx solid var(--life-line);
  align-items: center;
  gap: 18rpx;
  text-align: left;
  background: transparent;
}
.journey-store-card:last-child {
  border-bottom: 0;
}
.journey-store-photo,
.store-detail-photo {
  width: 146rpx;
  height: 116rpx;
  border-radius: 18rpx;
  flex: none;
  background: url('../assets/v63-retail/category-sprite.webp') var(--store-x, 50%) 100% / 500% 300%
    no-repeat;
}
.journey-store-photo {
  position: relative;
}
.journey-store-photo > text {
  position: absolute;
  right: 7rpx;
  bottom: 7rpx;
  padding: 3rpx 7rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: rgba(7, 68, 49, 0.8);
  font-size: 13rpx;
}
.journey-store-card > view:last-child {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.journey-store-card > view:last-child > text:first-child {
  font-size: 25rpx;
  font-weight: 900;
}
.journey-store-card > view:last-child > text:nth-child(2) {
  color: var(--life-muted);
  font-size: 18rpx;
}
.journey-store-card > view:last-child > view {
  display: flex;
  justify-content: space-between;
  color: var(--life-brand-deep);
  font-size: 18rpx;
  font-weight: 800;
}
.store-detail-head {
  display: flex;
  margin-bottom: 22rpx;
  padding: 20rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 20rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.store-detail-head > view:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7rpx;
}
.store-detail-head > view:last-child text:first-child {
  font-size: 28rpx;
  font-weight: 900;
}
.store-detail-head > view:last-child text:not(:first-child) {
  color: var(--life-muted);
  font-size: 17rpx;
}
.journey-product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}
.group-detail-surface {
  overflow: hidden;
  border-radius: var(--life-radius-lg);
  background: var(--life-paper);
  box-shadow: var(--life-shadow);
}
.group-detail-photo {
  display: flex;
  height: 360rpx;
  padding: 20rpx;
  align-items: flex-start;
  justify-content: space-between;
  background: url('../assets/v63-retail/product-sprite.webp') 33.333% 100% / 400% 200% no-repeat;
  box-sizing: border-box;
}
.group-detail-photo > text {
  padding: 6rpx 11rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: rgba(108, 39, 17, 0.84);
  font-size: 16rpx;
  font-weight: 900;
}
.group-detail-copy {
  padding: 24rpx;
}
.group-price {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}
.group-price text:first-child {
  color: var(--life-red);
  font-size: 40rpx;
  font-weight: 900;
}
.group-price text:last-child,
.group-store,
.group-notice {
  color: var(--life-muted);
  font-size: 17rpx;
}
.group-title {
  display: block;
  margin-top: 10rpx;
  font-size: 30rpx;
  font-weight: 900;
}
.group-store {
  display: block;
  margin-top: 7rpx;
}
.group-rule-grid {
  display: grid;
  margin-top: 20rpx;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10rpx;
}
.group-rule-grid > view {
  display: flex;
  padding: 15rpx 8rpx;
  border-radius: 16rpx;
  align-items: center;
  flex-direction: column;
  gap: 5rpx;
  background: var(--life-coral-soft);
}
.group-rule-grid text:first-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.group-rule-grid text:last-child {
  color: var(--life-coral-ink);
  font-size: 18rpx;
  font-weight: 900;
}
.group-notice {
  display: block;
  margin-top: 17rpx;
  line-height: 1.55;
}
.group-buy-button {
  margin: 0 24rpx 24rpx;
}
.group-price-old {
  color: var(--life-muted);
  font-size: 12px;
  font-weight: 700;
  padding-bottom: 4px;
  text-decoration: line-through;
}
.group-price-off {
  margin-left: auto;
  padding: 3px 7px;
  border-radius: 6px;
  color: #ffffff;
  background: linear-gradient(120deg, #ff5d3d, #f03749);
  font-size: 9.5px;
  font-weight: 800;
}
.group-price-tag {
  margin-left: auto;
  color: var(--life-muted);
  font-size: 9.5px;
  font-weight: 700;
}
.drules {
  display: flex;
  margin-top: 9px;
  gap: 6px;
}
.drules text {
  padding: 3px 8px;
  border-radius: 7px;
  color: #e23d3d;
  background: rgba(240, 55, 73, 0.08);
  font-size: 9.5px;
  font-weight: 800;
}
.voucher-banner {
  display: flex;
  margin-top: 12px;
  padding: 11px 13px;
  border: 1px solid #ffd5cf;
  border-radius: 14px;
  align-items: center;
  gap: 10px;
  background: linear-gradient(120deg, #fff1f0, #ffe4e0);
}
.voucher-banner-icon {
  display: grid;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  flex: none;
  place-items: center;
  background: linear-gradient(135deg, #ff5d3d, #f03749);
}
.voucher-banner-icon text {
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
}
.voucher-banner-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.voucher-banner-title {
  color: #e23d3d;
  font-size: 12px;
  font-weight: 900;
}
.voucher-banner-desc {
  color: #e07a6a;
  font-size: 10px;
  font-weight: 700;
}
.voucher-banner-go {
  color: #e23d3d;
  font-size: 11px;
  font-weight: 900;
}
.group-shop-card {
  display: flex;
  margin-top: 12px;
  padding: 12px 13px;
  border: 1px solid var(--life-line);
  border-radius: 14px;
  align-items: center;
  gap: 10px;
  background: var(--life-paper);
}
.group-shop-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.group-shop-copy text:first-child {
  color: var(--life-ink);
  font-size: 13px;
  font-weight: 900;
}
.group-shop-copy text:last-child {
  color: var(--life-muted);
  font-size: 10px;
  font-weight: 700;
}
.group-shop-go {
  color: var(--life-muted);
  font-size: 11px;
  font-weight: 800;
}
.group-know-card {
  display: grid;
  margin-top: 14px;
  padding: 12px 13px;
  border: 1px solid var(--life-line);
  border-radius: 14px;
  gap: 9px;
}
.group-know-title {
  color: var(--life-ink);
  font-size: 13px;
  font-weight: 900;
}
.mrow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
}
.mrow text:first-child {
  color: var(--life-muted);
  font-weight: 700;
  flex: none;
}
.mrow text:last-child {
  color: var(--life-ink);
  font-weight: 800;
  text-align: right;
}
.mrow .mrow-accent {
  color: #009146;
}
.group-buy-bar {
  display: flex;
  padding: 14px 12px 16px;
  gap: 10px;
}
.group-buy-bar .group-buy-button {
  margin: 0;
  flex: 1;
}
.group-cart-button {
  margin: 0;
  border: 1.5px solid #009146;
  border-radius: 999px;
  color: #009146;
  background: #ffffff;
  font-size: 13px;
  font-weight: 900;
  flex: 1;
}
.jrow > view {
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
  color: var(--life-muted);
  font-size: 21rpx;
}
.journey-row > text {
  color: var(--life-brand);
  font-size: 23rpx;
  font-weight: 800;
}
.journey-row button {
  margin: 0;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
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
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
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
  color: var(--life-paper);
  background: var(--life-brand-deep);
}
.secondary {
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
}
.danger {
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14rpx;
}
.tabs button {
  color: var(--life-muted);
  background: var(--life-wash);
  border-radius: 18rpx;
  font-size: 23rpx;
}
.tabs button.active {
  color: var(--life-paper);
  background: var(--life-brand-deep);
}
.journey-cart-surface,
.fulfillment-surface,
.reward-choice-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 16rpx;
}
.journey-cart-summary,
.fulfillment-summary,
.reward-choice-summary {
  display: flex;
  padding: 22rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 16rpx;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-brand), var(--life-brand-deep));
  box-shadow: var(--life-shadow);
}
.journey-basket-mark {
  position: relative;
  width: 54rpx;
  height: 45rpx;
  border: 4rpx solid var(--life-paper);
  border-top: 0;
  border-radius: 7rpx 7rpx 13rpx 13rpx;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.journey-basket-mark::before,
.journey-basket-mark::after {
  position: absolute;
  bottom: -14rpx;
  width: 7rpx;
  height: 7rpx;
  border-radius: 50%;
  background: var(--life-paper);
  content: '';
}
.journey-basket-mark::before {
  left: 7rpx;
}
.journey-basket-mark::after {
  right: 7rpx;
}
.journey-basket-mark view {
  position: absolute;
  top: -12rpx;
  left: -12rpx;
  width: 18rpx;
  height: 4rpx;
  border-radius: 99rpx;
  background: var(--life-paper);
}
.journey-cart-summary > view:nth-child(2),
.fulfillment-summary > view,
.reward-choice-summary > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
}
.journey-cart-summary > view:nth-child(2) text:first-child,
.fulfillment-summary > view text:first-child,
.reward-choice-summary > view text:first-child {
  font-size: 24rpx;
  font-weight: 900;
}
.journey-cart-summary > view:nth-child(2) text:last-child,
.fulfillment-summary > view text:last-child,
.reward-choice-summary > view text:last-child {
  opacity: 0.82;
  font-size: 15rpx;
}
.journey-cart-summary > text,
.fulfillment-summary > text,
.reward-choice-summary > text {
  flex: 0 0 auto;
  font-size: 22rpx;
  font-weight: 900;
}
.journey-cart-group {
  overflow: hidden;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.journey-cart-store {
  display: flex;
  padding: 17rpx 20rpx;
  align-items: center;
  gap: 10rpx;
  background: var(--life-bg);
}
.journey-store-mark {
  width: 23rpx;
  height: 19rpx;
  border: 3rpx solid var(--life-brand-deep);
  border-radius: 3rpx;
  box-sizing: border-box;
}
.journey-cart-store text:nth-child(2) {
  overflow: hidden;
  flex: 1;
  font-size: 19rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journey-cart-store text:last-child {
  color: var(--life-red);
  font-size: 18rpx;
  font-weight: 900;
}
.journey-cart-item {
  display: flex;
  padding: 17rpx;
  border-top: 1rpx solid var(--life-line);
  align-items: center;
  gap: 13rpx;
}
.journey-item-photo {
  display: flex;
  width: 78rpx;
  height: 78rpx;
  border-radius: 17rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  background: linear-gradient(145deg, var(--life-yellow-soft), var(--life-coral-soft));
}
.journey-item-photo view {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50% 45% 55% 40%;
  background: var(--life-coral);
  transform: rotate(-18deg);
}
.journey-item-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
}
.journey-item-copy text:first-child {
  overflow: hidden;
  font-size: 19rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journey-item-copy text:not(:first-child) {
  color: var(--life-muted);
  font-size: 14rpx;
}
.journey-cart-item button {
  margin: 0;
  flex: 0 0 auto;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  font-size: 14rpx;
}
.journey-cart-rail {
  display: flex;
  padding: 14rpx 16rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  align-items: center;
  gap: 16rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow);
}
.journey-cart-rail > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.journey-cart-rail > view text:first-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.journey-cart-rail > view text:last-child {
  color: var(--life-red);
  font-size: 25rpx;
  font-weight: 900;
}
.journey-cart-rail button {
  width: auto;
  margin: 0;
  padding: 0 32rpx;
}
.fulfillment-summary {
  background: linear-gradient(135deg, var(--life-blue-deep), var(--life-blue-ink));
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
.fulfillment-tip {
  display: grid;
  padding: 18rpx 20rpx;
  border-radius: var(--life-radius-md);
  gap: 5rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
}
.fulfillment-tip text:first-child {
  font-size: 19rpx;
  font-weight: 900;
}
.fulfillment-tip text:last-child {
  font-size: 15rpx;
  line-height: 1.5;
}
.reward-choice-summary {
  background: linear-gradient(135deg, var(--life-coral-amber), var(--life-red));
}
.reward-choice-list {
  display: grid;
  gap: 12rpx;
}
.reward-choice-card {
  display: flex;
  padding: 19rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  gap: 14rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.reward-choice-mark {
  display: flex;
  width: 58rpx;
  height: 58rpx;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  background: var(--life-yellow-soft);
}
.reward-choice-mark view {
  width: 25rpx;
  height: 25rpx;
  border: 5rpx solid var(--life-yellow-deep);
  border-radius: 50%;
  box-sizing: border-box;
}
.reward-choice-card > view:last-child {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}
.reward-choice-card > view:last-child > view {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}
.reward-choice-card > view:last-child > view text:first-child {
  font-size: 19rpx;
  font-weight: 900;
}
.reward-choice-card > view:last-child > view text:last-child {
  color: var(--life-yellow-ink);
  font-size: 14rpx;
}
.reward-choice-card > view:last-child > text:nth-child(2) {
  color: var(--life-red);
  font-size: 22rpx;
  font-weight: 900;
}
.reward-choice-card > view:last-child > text:last-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.reward-choice-note {
  padding: 17rpx 20rpx;
  border-radius: 16rpx;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  font-size: 16rpx;
  line-height: 1.5;
}
.picker {
  margin-top: 18rpx;
  padding: 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 20rpx;
  background: var(--life-wash);
  font-size: 22rpx;
}
.notice {
  display: block;
  margin-top: 20rpx;
  line-height: 1.7;
}
.order-list-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 14rpx;
}
.order-list-summary,
.checkout-confirm-summary,
.order-detail-summary {
  display: flex;
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 16rpx;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-brand), var(--life-brand-deep));
  box-shadow: var(--life-shadow);
}
.order-list-mark,
.checkout-confirm-mark,
.order-detail-mark {
  display: flex;
  width: 56rpx;
  height: 56rpx;
  border: 3rpx solid var(--life-paper);
  border-radius: 17rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
}
.order-list-mark view,
.checkout-confirm-mark view,
.order-detail-mark view {
  width: 24rpx;
  height: 17rpx;
  border-bottom: 5rpx solid var(--life-paper);
  border-left: 5rpx solid var(--life-paper);
  transform: rotate(-45deg) translate(2rpx, -2rpx);
}
.order-list-summary > view:nth-child(2),
.checkout-confirm-summary > view:nth-child(2),
.order-detail-summary > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
}
.order-list-summary > view:nth-child(2) text:first-child,
.checkout-confirm-summary > view:nth-child(2) text:first-child,
.order-detail-summary > view:nth-child(2) text:first-child {
  overflow: hidden;
  font-size: 24rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-list-summary > view:nth-child(2) text:last-child,
.checkout-confirm-summary > view:nth-child(2) text:last-child,
.order-detail-summary > view:nth-child(2) text:last-child {
  opacity: 0.82;
  font-size: 15rpx;
}
.order-list-summary > text,
.checkout-confirm-summary > text,
.order-detail-summary > text {
  flex: 0 0 auto;
  font-size: 18rpx;
  font-weight: 900;
}
.order-search {
  display: grid;
  padding: 13rpx 18rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  grid-template-columns: 25rpx 1fr auto;
  align-items: center;
  gap: 10rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.order-search-mark {
  width: 18rpx;
  height: 18rpx;
  border: 4rpx solid var(--life-muted);
  border-radius: 50%;
  box-sizing: border-box;
}
.order-search input {
  min-width: 0;
  color: var(--life-ink);
  font-size: 18rpx;
}
.order-search > text {
  color: var(--life-brand-deep);
  font-size: 15rpx;
}
.order-filters {
  width: 100%;
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
  background: var(--life-wash);
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
.checkout-confirm-surface,
.order-detail-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 16rpx;
}
.checkout-confirm-summary {
  background: linear-gradient(135deg, var(--life-coral), var(--life-red));
}
.checkout-group-list {
  display: grid;
  gap: 12rpx;
}
.checkout-group-card {
  display: grid;
  padding: 19rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  gap: 8rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.checkout-group-card > view:first-child,
.checkout-group-benefit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.checkout-group-card > view:first-child text:first-child {
  font-size: 19rpx;
  font-weight: 900;
}
.checkout-group-card > view:first-child text:last-child {
  color: var(--life-brand-deep);
  font-size: 15rpx;
}
.checkout-group-card > text {
  color: var(--life-muted);
  font-size: 15rpx;
}
.checkout-group-benefit text:first-child {
  color: var(--life-red);
  font-size: 16rpx;
}
.checkout-group-benefit text:last-child {
  color: var(--life-red);
  font-size: 23rpx;
  font-weight: 900;
}
.checkout-confirm-note {
  padding: 17rpx 20rpx;
  border-radius: 16rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 15rpx;
  line-height: 1.55;
}
.order-detail-summary {
  background: linear-gradient(135deg, var(--life-brand), var(--life-brand-deep));
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
  padding: 14rpx;
  border-bottom: 1rpx solid var(--life-line);
  border-radius: 16rpx;
  align-items: center;
  justify-content: space-between;
  gap: 13rpx;
  background: var(--life-paper);
}
.order-detail-photo {
  display: flex;
  width: 68rpx;
  height: 68rpx;
  border-radius: 15rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  background: var(--life-yellow-soft);
}
.order-detail-photo view {
  width: 27rpx;
  height: 27rpx;
  border-radius: 50% 45% 55% 40%;
  transform: rotate(-18deg);
  background: var(--life-coral);
}
.order-detail-item > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}
.order-detail-item > view:nth-child(2) text:first-child {
  overflow: hidden;
  font-size: 18rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-detail-item > view:nth-child(2) text:last-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.order-detail-item > text:last-child {
  color: var(--life-red);
  flex: 0 0 auto;
  font-size: 19rpx;
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
  background: var(--life-wash);
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
.voucher-apply-card {
  display: block;
  margin-top: 10px;
  padding: 12px;
  border: 0.5px solid var(--life-line);
  border-radius: var(--life-radius-md);
  background: var(--life-wash);
}
.voucher-apply-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.voucher-apply-title {
  color: var(--life-ink);
  font-size: 14.5px;
  font-weight: 900;
}
.voucher-apply-count {
  color: var(--life-muted);
  font-size: 10.5px;
  font-weight: 700;
}
.voucher-apply-list {
  display: grid;
  margin-top: 10px;
  gap: 8px;
}
.vopt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1.5px solid var(--life-line);
  border-radius: 12px;
  background: var(--life-card, #ffffff);
}
.vopt.on {
  border-color: #f03749;
  background: rgba(240, 55, 73, 0.08);
}
.vopt-copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}
.vopt-name {
  color: var(--life-ink);
  font-size: 12.5px;
  font-weight: 900;
}
.vopt-desc {
  color: var(--life-muted);
  font-size: 9.5px;
  font-weight: 700;
}
.vopt-action {
  color: var(--life-muted);
  font-size: 11px;
  font-weight: 900;
}
.vopt.on .vopt-action {
  color: #f03749;
}
.voucher-apply-empty {
  margin-top: 10px;
  color: var(--life-muted);
  font-size: 11px;
  font-weight: 700;
}
.checkout-amounts .voucher-amount {
  color: #f03749;
  font-weight: 900;
}
.payment-truth {
  display: block;
  margin-top: 16rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  color: var(--life-blue-ink);
  background: var(--life-blue-soft);
  font-size: 18rpx;
  line-height: 1.55;
}
.payment-status-panel {
  display: flex;
  margin-top: 18rpx;
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 20rpx;
  background: var(--life-blue-soft);
}
.payment-seal {
  display: flex;
  width: 82rpx;
  height: 82rpx;
  border: 5rpx solid var(--life-blue-deep);
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex: none;
}
.payment-seal > view {
  width: 29rpx;
  height: 14rpx;
  border-bottom: 6rpx solid var(--life-blue-deep);
  border-left: 6rpx solid var(--life-blue-deep);
  transform: rotate(-45deg) translate(2rpx, -2rpx);
}
.payment-status-panel.paid {
  background: var(--life-brand-soft);
}
.payment-status-panel.paid .payment-seal {
  border-color: var(--life-brand);
}
.payment-status-panel.paid .payment-seal > view {
  border-color: var(--life-brand);
}
.payment-status-panel > view:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5rpx;
}
.payment-status-panel > view:last-child text:first-child {
  color: var(--life-blue-ink);
  font-size: 24rpx;
  font-weight: 900;
}
.payment-status-panel.paid > view:last-child text:first-child {
  color: var(--life-brand-deep);
}
.payment-status-panel > view:last-child text:nth-child(2) {
  color: var(--life-red);
  font-size: 34rpx;
  font-weight: 900;
}
.payment-status-panel > view:last-child text:last-child {
  color: var(--life-muted);
  font-size: 16rpx;
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
.refund-progress {
  display: grid;
  margin: 16rpx 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.refund-progress > view {
  display: flex;
  position: relative;
  align-items: center;
  flex-direction: column;
  gap: 7rpx;
  color: var(--life-muted);
  font-size: 14rpx;
}
.refund-progress > view::before {
  position: absolute;
  z-index: 0;
  top: 8rpx;
  left: 0;
  width: 100%;
  height: 3rpx;
  background: var(--life-line);
  content: '';
}
.refund-progress > view:first-child::before {
  left: 50%;
  width: 50%;
}
.refund-progress > view:last-child::before {
  width: 50%;
}
.refund-progress > view > text:first-child {
  z-index: 1;
  width: 18rpx;
  height: 18rpx;
  border: 4rpx solid var(--life-paper);
  border-radius: 50%;
  background: var(--life-line);
  box-shadow: 0 0 0 2rpx var(--life-line);
}
.refund-progress > view.active {
  color: var(--life-brand-deep);
  font-weight: 800;
}
.refund-progress > view.active::before {
  background: var(--life-brand);
}
.refund-progress > view.active > text:first-child {
  background: var(--life-brand);
  box-shadow: 0 0 0 2rpx var(--life-brand);
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
  color: var(--life-coral-ink);
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
  color: var(--life-coral-ink);
  font-size: 16rpx;
}
.member-benefit-grid {
  display: grid;
  margin-top: 18rpx;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.member-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 16rpx;
}
.member-card {
  overflow: hidden;
  padding: 28rpx;
  border-radius: var(--life-radius-lg);
  color: var(--life-paper);
  background:
    radial-gradient(circle at 85% 5%, rgba(255, 255, 255, 0.22), transparent 34%),
    linear-gradient(135deg, var(--life-coral-amber), var(--life-red));
  box-shadow: var(--life-shadow);
}
.member-card-head,
.member-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.member-emblem {
  display: flex;
  width: 56rpx;
  height: 56rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.65);
  border-radius: 18rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transform: rotate(45deg);
  background: rgba(255, 255, 255, 0.14);
}
.member-emblem view {
  width: 17rpx;
  height: 17rpx;
  border-radius: 50%;
  background: var(--life-paper);
}
.member-card-head > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
}
.member-card-head > view:nth-child(2) text:first-child {
  font-size: 25rpx;
  font-weight: 900;
}
.member-card-head > view:nth-child(2) text:last-child,
.member-card-head > text,
.member-since {
  opacity: 0.82;
  font-size: 14rpx;
}
.member-card-head > text {
  letter-spacing: 2rpx;
}
.member-balance {
  margin: 32rpx 0 22rpx;
  justify-content: flex-start;
  gap: 58rpx;
}
.member-balance > view {
  display: flex;
  flex-direction: column;
  gap: 5rpx;
}
.member-balance text:first-child {
  font-size: 32rpx;
  font-weight: 900;
}
.member-balance text:last-child {
  opacity: 0.82;
  font-size: 15rpx;
}
.member-rules {
  display: grid;
  padding: 6rpx 20rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.member-rules > view {
  display: grid;
  padding: 17rpx 0;
  border-bottom: 1rpx solid var(--life-line);
  gap: 5rpx;
}
.member-rules > view:last-child {
  border-bottom: 0;
}
.member-rules text:first-child {
  color: var(--life-ink);
  font-size: 19rpx;
  font-weight: 900;
}
.member-rules text:last-child {
  color: var(--life-muted);
  font-size: 15rpx;
  line-height: 1.55;
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
  color: var(--life-yellow-ink);
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
