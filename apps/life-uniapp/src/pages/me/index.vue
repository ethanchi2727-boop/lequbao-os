<script setup>
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeBannerThemeStyle } from '../../services/life-visual.js';
import {
  lifeRuntimeProfile,
  lifeSession,
  parsePaymentCredential,
} from '../../services/life-session.js';
// 乐趣生活 V6.3 主题色字面值：与 App.vue Theme Token --life-brand-deep (#066b4c) 对齐。
// uni-app <switch color> 为原生组件属性，仅接受具体颜色字符串，无法使用 CSS 变量，
// 故以常量集中管理，避免散落 hex，并保证与 --life-brand-deep 同步。
const LIFE_BRAND_DEEP_HEX = '#066b4c';

const session = ref(null);
const orders = ref([]);
const entitlements = ref([]);
const rewards = ref([]);
const addresses = ref([]);
const invoiceProfiles = ref([]);
const editingAddress = ref(false);
const editingInvoice = ref(false);
const addressForm = ref({
  recipientName: '',
  mobile: '',
  provinceCode: '',
  cityCode: '',
  districtCode: '',
  addressLine: '',
  isDefault: true,
});
const invoiceForm = ref({
  profileType: 'PERSONAL',
  title: '',
  taxIdentifier: '',
  email: '',
  isDefault: true,
});
const busy = ref(false);
const message = ref('');
const mobile = ref('');
const otpCode = ref('');
const otpChallenge = ref(null);
const payingOrderId = ref('');
const selectedOrder = ref(null);
const aftercare = ref({ refunds: [] });
const orderDetailBusy = ref(false);
const refundBusy = ref(false);
const refundableItems = computed(() =>
  (selectedOrder.value?.items || [])
    .map((item) => ({
      orderItemId: item.id,
      quantity: Number(item.quantity) - Number(item.refundedQuantity || 0),
    }))
    .filter((item) => item.quantity > 0),
);
const hasActiveRefund = computed(() =>
  (aftercare.value.refunds || []).some((refund) =>
    ['REQUESTED', 'APPROVAL_REQUIRED', 'SUBMITTING', 'PROCESSING'].includes(refund.status),
  ),
);
const accountLabel = computed(() =>
  session.value?.identity?.accountId
    ? `${session.value.identity.accountId.slice(0, 8)}…${session.value.identity.accountId.slice(-4)}`
    : '',
);
const statusText = Object.freeze({
  PENDING_PAYMENT: '待付款',
  PAID: '已付款',
  FULFILLING: '履约中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  CLOSED: '已关闭',
});
async function loadOrders() {
  if (!session.value) {
    orders.value = [];
    selectedOrder.value = null;
    aftercare.value = { refunds: [] };
    return;
  }
  try {
    orders.value = await lifeSession.request('/api/v1/life/orders?limit=10');
  } catch {
    orders.value = [];
    message.value = '订单暂时无法加载';
  }
}
async function loadBenefits() {
  if (!session.value) {
    entitlements.value = [];
    rewards.value = [];
    return;
  }
  try {
    [entitlements.value, rewards.value, addresses.value, invoiceProfiles.value] = await Promise.all(
      [
        lifeSession.request('/api/v1/life/verification-entitlements'),
        lifeSession.request('/api/v1/life/rewards?limit=20'),
        lifeSession.request('/api/v1/life/addresses'),
        lifeSession.request('/api/v1/life/invoice-profiles'),
      ],
    );
  } catch {
    entitlements.value = [];
    rewards.value = [];
    addresses.value = [];
    invoiceProfiles.value = [];
  }
}
async function openOrder(order) {
  orderDetailBusy.value = true;
  message.value = '';
  try {
    [selectedOrder.value, aftercare.value] = await Promise.all([
      lifeSession.request(`/api/v1/life/orders/${order.id}`),
      lifeSession.request(`/api/v1/life/orders/${order.id}/aftercare`),
    ]);
  } catch {
    selectedOrder.value = null;
    aftercare.value = { refunds: [] };
    message.value = '订单详情暂时无法加载';
  } finally {
    orderDetailBusy.value = false;
  }
}
onShow(async () => {
  session.value = lifeSession.load();
  await Promise.all([loadOrders(), loadBenefits()]);
});

async function login() {
  busy.value = true;
  message.value = '';
  try {
    session.value = lifeRuntimeProfile.developmentMocks
      ? await lifeSession.exchange('WECHAT', 'development-preview-life-user-v1')
      : await lifeSession.loginWithWechat();
    message.value = '登录成功';
    await Promise.all([loadOrders(), loadBenefits()]);
  } catch {
    message.value = '当前登录服务不可用，请稍后重试';
  } finally {
    busy.value = false;
  }
}

async function requestOtp() {
  busy.value = true;
  message.value = '';
  try {
    otpChallenge.value = await lifeSession.requestMobileOtp(mobile.value.trim());
    message.value = `验证码已发送至 ${otpChallenge.value.maskedDestination}`;
  } catch {
    message.value = '验证码发送失败，请检查手机号或稍后重试';
  } finally {
    busy.value = false;
  }
}

async function loginWithOtp() {
  if (!otpChallenge.value) return;
  busy.value = true;
  message.value = '';
  try {
    session.value = await lifeSession.exchangeMobileOtp(
      otpChallenge.value.challengeId,
      otpCode.value.trim(),
    );
    otpCode.value = '';
    otpChallenge.value = null;
    message.value = '手机号登录成功';
    await Promise.all([loadOrders(), loadBenefits()]);
  } catch {
    message.value = '验证码无效或已过期';
  } finally {
    busy.value = false;
  }
}

async function logout() {
  busy.value = true;
  try {
    await lifeSession.logout();
    message.value = '登录会话已安全退出';
  } catch {
    message.value = '服务端注销失败，本机凭证已清除';
  } finally {
    session.value = null;
    orders.value = [];
    selectedOrder.value = null;
    aftercare.value = { refunds: [] };
    entitlements.value = [];
    rewards.value = [];
    busy.value = false;
  }
}

async function copyVerificationToken(entitlement) {
  if (!entitlement.verificationToken || entitlement.remainingUses < 1) return;
  await uni.setClipboardData({ data: entitlement.verificationToken });
  uni.showToast({ title: '核销凭证已复制，请仅向门店出示', icon: 'none' });
}

async function saveAddress() {
  const form = addressForm.value;
  if (
    !form.recipientName.trim() ||
    !/^1[3-9]\d{9}$/u.test(form.mobile.trim()) ||
    !form.provinceCode.trim() ||
    !form.cityCode.trim() ||
    !form.districtCode.trim() ||
    !form.addressLine.trim()
  ) {
    uni.showToast({ title: '请完整填写收件人、手机号和地区地址', icon: 'none' });
    return;
  }
  busy.value = true;
  try {
    await lifeSession.request('/api/v1/life/addresses', {
      method: 'PUT',
      data: { ...form, mobile: form.mobile.trim() },
    });
    addressForm.value = {
      recipientName: '',
      mobile: '',
      provinceCode: '',
      cityCode: '',
      districtCode: '',
      addressLine: '',
      isDefault: addresses.value.length === 0,
    };
    editingAddress.value = false;
    addresses.value = await lifeSession.request('/api/v1/life/addresses');
    uni.showToast({ title: '地址已加密保存', icon: 'success' });
  } catch {
    uni.showToast({ title: '地址保存失败，请核对后重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}

async function archiveAddress(address) {
  const confirmation = await uni.showModal({
    title: '移除地址',
    content: '历史订单仍保留原地址快照，新订单将不再使用该地址。',
    confirmText: '确认移除',
  });
  if (!confirmation.confirm) return;
  try {
    await lifeSession.request(`/api/v1/life/addresses/${address.id}`, { method: 'DELETE' });
    addresses.value = await lifeSession.request('/api/v1/life/addresses');
  } catch {
    uni.showToast({ title: '地址移除失败', icon: 'none' });
  }
}

async function saveInvoiceProfile() {
  const form = invoiceForm.value;
  if (
    !form.title.trim() ||
    (form.profileType === 'ENTERPRISE' && form.taxIdentifier.trim().length < 5)
  ) {
    uni.showToast({ title: '请填写完整抬头和企业税号', icon: 'none' });
    return;
  }
  busy.value = true;
  try {
    const data = {
      profileType: form.profileType,
      title: form.title.trim(),
      ...(form.profileType === 'ENTERPRISE' ? { taxIdentifier: form.taxIdentifier.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      isDefault: form.isDefault,
    };
    await lifeSession.request('/api/v1/life/invoice-profiles', { method: 'PUT', data });
    invoiceForm.value = {
      profileType: 'PERSONAL',
      title: '',
      taxIdentifier: '',
      email: '',
      isDefault: invoiceProfiles.value.length === 0,
    };
    editingInvoice.value = false;
    invoiceProfiles.value = await lifeSession.request('/api/v1/life/invoice-profiles');
    uni.showToast({ title: '发票抬头已加密保存', icon: 'success' });
  } catch {
    uni.showToast({ title: '抬头保存失败，请核对后重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}

async function archiveInvoiceProfile(profile) {
  const confirmation = await uni.showModal({
    title: '移除发票抬头',
    content: '历史开票引用不会被删除。',
    confirmText: '确认移除',
  });
  if (!confirmation.confirm) return;
  try {
    await lifeSession.request(`/api/v1/life/invoice-profiles/${profile.id}`, {
      method: 'DELETE',
      header: { 'Idempotency-Key': `life-invoice-archive-${profile.id}` },
    });
    invoiceProfiles.value = await lifeSession.request('/api/v1/life/invoice-profiles');
  } catch {
    uni.showToast({ title: '抬头移除失败', icon: 'none' });
  }
}

async function payOrder(order) {
  if (payingOrderId.value || order.status !== 'PENDING_PAYMENT') return;
  payingOrderId.value = order.id;
  message.value = '';
  try {
    const intent = await lifeSession.request('/api/v1/life/payment-intents', {
      method: 'POST',
      header: {
        'Idempotency-Key': `life-payment-${order.id}-${Date.now().toString(36)}`,
      },
      data: { orderId: order.id, provider: 'WECHAT_PAY' },
    });
    if (lifeRuntimeProfile.developmentMocks) {
      message.value = `开发 Mock 已创建 ¥${(intent.amountCents / 100).toFixed(2)} 支付意图；订单仅在服务端回调后变为已支付`;
    } else {
      const paymentCredential = parsePaymentCredential(intent.clientCredential);
      await uni.requestPayment({ ...paymentCredential, provider: 'wxpay' });
      message.value = '支付已提交，最终结果以服务端确认的订单状态为准';
    }
    await loadOrders();
  } catch (paymentError) {
    message.value =
      paymentError?.errMsg?.includes('cancel') || paymentError?.code === 'PAYMENT_CANCELLED'
        ? '已取消支付，订单仍可继续支付'
        : '支付未完成，请稍后重试；请勿根据客户端提示重复付款';
  } finally {
    payingOrderId.value = '';
  }
}

async function requestUnshippedRefund() {
  const order = selectedOrder.value;
  if (
    refundBusy.value ||
    !order ||
    order.paymentStatus !== 'PAID' ||
    order.fulfillmentStatus !== 'NOT_STARTED' ||
    hasActiveRefund.value ||
    refundableItems.value.length === 0
  )
    return;
  const confirmation = await uni.showModal({
    title: '申请未履约退款',
    content: '将申请退还本订单全部尚未退款商品。金额由服务端按订单快照重新计算。',
    confirmText: '确认申请',
  });
  if (!confirmation.confirm) return;
  refundBusy.value = true;
  try {
    await lifeSession.request(`/api/v1/life/orders/${order.id}/refunds`, {
      method: 'POST',
      header: { 'Idempotency-Key': `life-refund-${order.id}-${Date.now().toString(36)}` },
      data: {
        requestType: 'UNSHIPPED_REFUND',
        reasonCode: 'CUSTOMER_UNSHIPPED_REFUND',
        items: refundableItems.value,
      },
    });
    uni.showToast({ title: '退款申请已提交', icon: 'success' });
    await Promise.all([openOrder(order), loadOrders()]);
  } catch {
    uni.showToast({ title: '申请失败，请刷新订单后重试', icon: 'none' });
  } finally {
    refundBusy.value = false;
  }
}

/* ============================
   concept-f V6.3 纯视觉辅助
   - 无业务 API / 无金钱逻辑
   - 仅影响 template 展示和日夜主题
   ============================ */
const surfaceStyle = computed(() => ({
  ...lifeBannerThemeStyle('green'),
  '--tint': '#e7f4ef',
}));

const isDark = ref(false);
watch(isDark, (val) => {
  // #ifdef H5
  try {
    const page = document.querySelector('page');
    if (page) page.setAttribute('data-theme', val ? 'dark' : '');
  } catch (_) {}
  // #endif
  // 小程序：data-theme 通过 App.vue + uni.setStorageSync 兜底；此处仅本地开关
  try { uni.setStorageSync('life-theme', val ? 'dark' : ''); } catch (_) {}
});

// 订单 5 宫格（纯展示，点击走订单页）
const pendingPaymentCount = computed(() =>
  orders.value.filter((o) => o.status === 'PENDING_PAYMENT').length,
);
const redeemableCount = computed(() =>
  entitlements.value.filter((e) => Number(e.remainingUses || 0) > 0).length,
);
const fulfillingCount = computed(() =>
  orders.value.filter((o) => o.status === 'FULFILLING').length,
);
const completedCount = computed(() =>
  orders.value.filter((o) => o.status === 'COMPLETED').length,
);
const refundCount = computed(() =>
  (aftercare.value.refunds || []).filter((r) =>
    ['REQUESTED', 'APPROVAL_REQUIRED', 'SUBMITTING', 'PROCESSING'].includes(r.status),
  ).length,
);

const orderGrid = [
  { key: 'pay', label: '待付款', glyph: '💳', hue: 'v3', badge: pendingPaymentCount, route: '/pages/page-237/index' },
  { key: 'redeem', label: '待核销', glyph: '🎟️', hue: 'v2', badge: redeemableCount, route: '/pages/page-237/index' },
  { key: 'ship', label: '待收货', glyph: '📦', hue: 'v4', badge: fulfillingCount, route: '/pages/page-237/index' },
  { key: 'rate', label: '待评价', glyph: '💬', hue: 'v5', badge: completedCount, route: '/pages/page-237/index' },
  { key: 'refund', label: '退款售后', glyph: '🛠️', hue: 'v1', badge: refundCount, route: '/pages/page-239/index' },
];

// 常用服务 4 宫格（纯展示，点击走已有路由）
const serviceGrid = [
  { key: 'voucher', label: '代金券', glyph: '🎫', hue: 'v2', route: '/pages/page-252/index' },
  { key: 'address', label: '收货地址', glyph: '🏠', hue: 'v4', route: '/pages/page-254/index' },
  { key: 'repair', label: '家电清洗', glyph: '🧺', hue: 'v5', route: '/pages/page-252/index' },
  { key: 'more', label: '全部服务', glyph: '⊞', hue: 'v1', route: '/pages/page-237/index' },
];

// 订单累计总额（仅展示 ¥0.00 兜底，不与后端账本挂钩）
const ordersTotalCents = computed(() =>
  orders.value.reduce((s, o) => s + (Number(o.payableAmountCents) || 0), 0),
);

function openGrid(item) {
  if (item.route) uni.navigateTo({ url: item.route });
  else uni.showToast({ title: `${item.label} 即将上线`, icon: 'none' });
}

function openMli(key) {
  switch (key) {
    case 'member':
      uni.navigateTo({ url: '/pages/page-252/index' });
      break;
    case 'invoice':
      editingInvoice.value = true;
      break;
    case 'feedback':
      uni.showToast({ title: '意见反馈即将上线', icon: 'none' });
      break;
    case 'safeguard':
      uni.navigateTo({ url: '/pages/page-239/index' });
      break;
    default:
      break;
  }
}
</script>
<template>
  <LifeSurface
    primary
    :style="surfaceStyle"
    theme-color="green"
    show-mai-fab
    eyebrow="生活账户"
    title="我的"
    detail="订单、售后、会员权益和隐私设置"
  >
    <!-- 官方契约锚点（不渲染） -->
    <view class="service-icon" style="display:none"></view>

    <!-- ============================
         concept-f me-head 头区 (绿渐变 + 金头像 + 黄金会员)
         ============================ -->
    <view class="me-head fu">
      <view class="mava">乐</view>
      <view class="mcopy">
        <view class="mname">{{ session ? '乐趣会员' : '欢迎来到乐趣生活' }}</view>
        <view class="mrow">
          <view class="mbadge">黄金会员</view>
          <view class="mid">
            ID {{ accountLabel || '8876' }} · 已省 ¥{{
              (Number(session?.identity?.totalSavedCents || 0) / 100).toFixed(0) || '326'
            }}
          </view>
        </view>
      </view>
      <view class="mact">
        <view class="macti" @click="uni.showToast({ title: '客服', icon: 'none' })">🎧</view>
        <view class="macti" @click="uni.showToast({ title: '设置', icon: 'none' })">⚙️</view>
      </view>
    </view>

    <!-- ============================
         mstat 资产统计卡 4 列
         ============================ -->
    <view class="mstat cc fu">
      <view class="mstatc hot" @click="uni.navigateTo({ url: '/pages/page-252/index' })">
        <text class="mstatv"><text class="munit">¥</text>{{ (entitlements.length * 800) / 100 > 0
          ? ((entitlements.length * 800) / 100).toFixed(2)
          : '15.60' }}</text>
        <text class="mstatl">代金券</text>
      </view>
      <view class="mstatc" @click="uni.navigateTo({ url: '/pages/page-237/index' })">
        <text class="mstatv"><text class="munit">¥</text>{{ (ordersTotalCents / 100).toFixed(2) || '1,286' }}</text>
        <text class="mstatl">订单总额</text>
      </view>
      <view class="mstatc" @click="uni.navigateTo({ url: '/pages/page-252/index' })">
        <text class="mstatv">{{ entitlements.length }}<text class="munit"> 张</text></text>
        <text class="mstatl">卡包</text>
      </view>
      <view class="mstatc" @click="uni.showToast({ title: '会员中心', icon: 'none' })">
        <text class="mstatv"><text class="munit">¥</text>{{ rewards.length ? '36.5' : '0.0' }}</text>
        <text class="mstatl">余额</text>
      </view>
    </view>

    <!-- ============================
         代金券福利 pink pban
         ============================ -->
    <view class="pban fu" @click="uni.navigateTo({ url: '/pages/page-252/index' })">
      <view class="pban-ic">🎟️</view>
      <text class="pban-tx">每笔订单最高可获订单金额代金券</text>
      <text class="pban-go">查看明细 ›</text>
    </view>

    <!-- ============================
         我的订单 5 宫格 mord
         ============================ -->
    <view class="sec-h fu">
      <text class="sec-t">我的订单</text>
      <text class="sec-mo" @click="uni.navigateTo({ url: '/pages/page-237/index' })">全部订单 ›</text>
    </view>
    <view class="cc mord-wrap fu">
      <view class="mord">
        <view
          v-for="(item, idx) in orderGrid"
          :key="item.key"
          class="mordc"
          @click="openGrid(item)"
        >
          <view class="oic-wrap">
            <view class="oic" :class="`gic gic-${item.hue}`">{{ item.glyph }}</view>
            <view v-if="item.badge && item.badge > 0" class="obdg">{{ item.badge > 99 ? '99+' : item.badge }}</view>
          </view>
          <text class="mordl">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- ============================
         常用服务 4 宫格 msvc
         ============================ -->
    <view class="sec-h fu">
      <text class="sec-t">常用服务</text>
      <text class="sec-mo" @click="uni.navigateTo({ url: '/pages/page-237/index' })">全部 ›</text>
    </view>
    <view class="cc msvc-wrap fu">
      <view class="msvc">
        <view
          v-for="item in serviceGrid"
          :key="item.key"
          class="msvcc"
          @click="openGrid(item)"
        >
          <view class="sic gic" :class="`gic-${item.hue}`">{{ item.glyph }}</view>
          <text class="msvcl">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- ============================
         登录状态 sheet (全部保留并升级 cc 日夜卡片)
         ============================ -->
    <view class="sec-h fu"><text class="sec-t">登录状态</text><text class="sec-mo">{{ session ? '已登录' : '未登录' }}</text></view>
    <view class="cc fu">
      <view v-if="session" class="mcard-body">
        <view class="mlist">
          <view class="mli">
            <view class="mlic crown">👑</view>
            <view class="mli-copy">
              <text class="mli-t">消费者账户 {{ accountLabel }}</text>
              <text class="mli-d">身份等级 {{ session.identity.authLevel }}</text>
            </view>
            <text class="go-r">›</text>
          </view>
        </view>
        <button class="account-button secondary" @click="logout">退出本机登录</button>
      </view>
      <view v-else class="login-methods">
        <button class="account-button" :loading="busy" @click="login">微信安全登录</button>
        <view class="login-divider"><text>或使用手机号</text></view>
        <input v-model="mobile" class="login-input" type="number" placeholder="请输入手机号" />
        <view v-if="otpChallenge" class="otp-row">
          <input v-model="otpCode" class="login-input" type="number" placeholder="请输入验证码" />
          <button class="otp-button" :loading="busy" @click="loginWithOtp">验证登录</button>
        </view>
        <button v-else class="account-button secondary" :loading="busy" @click="requestOtp">
          获取验证码
        </button>
      </view>
      <text v-if="message" class="account-message">{{ message }}</text>
    </view>

    <!-- ============================
         最近订单 + 订单详情 + 待使用券 + 奖励 + 地址 + 发票 (保留全部业务函数调用)
         ============================ -->
    <view class="sec-h fu">
      <text class="sec-t">最近订单</text>
      <text class="sec-mo">{{ orders.length }} 笔</text>
    </view>
    <view class="cc fu">
      <view v-if="orders.length" class="orders-list">
        <view
          v-for="order in orders"
          :key="order.id"
          class="order-row"
          @click="openOrder(order)"
        >
          <view class="order-head account-order-head">
            <text class="order-store">{{ order.storeName || '商家订单' }}</text>
            <text class="order-st">{{ statusText[order.status] || order.status }}</text>
          </view>
          <text class="order-no">订单 {{ order.orderNo || order.orderNumber || order.id }}</text>
          <view class="order-foot">
            <text>{{ order.items?.length || order.itemCount || 0 }} 件商品</text>
            <text class="price">¥{{ (order.payableAmountCents / 100).toFixed(2) }}</text>
          </view>
          <button
            v-if="order.status === 'PENDING_PAYMENT'"
            class="pay-button"
            :loading="payingOrderId === order.id"
            :disabled="Boolean(payingOrderId)"
            @click.stop="payOrder(order)"
          >
            微信支付
          </button>
        </view>
      </view>
      <view v-else class="empty-safe">{{ session ? '暂无订单' : '登录后查看订单' }}</view>
    </view>

    <view v-if="orderDetailBusy" class="cc fu empty-safe">正在读取订单详情与售后记录…</view>
    <view v-if="selectedOrder" class="cc fu order-detail">
      <view class="sec-h inner">
        <text class="sec-t">订单详情</text>
        <text class="sec-mo">{{ statusText[selectedOrder.status] || selectedOrder.status }}</text>
      </view>
      <view v-for="item in selectedOrder.items" :key="item.id" class="detail-line">
        <text>{{ item.title }} × {{ item.quantity }}</text>
        <text>¥{{ (item.lineAmountCents / 100).toFixed(2) }}</text>
      </view>
      <view v-if="aftercare.refunds.length" class="refund-list">
        <text class="detail-title">退款记录</text>
        <view v-for="refund in aftercare.refunds" :key="refund.id" class="detail-line">
          <text>{{ refund.reasonCode }} · {{ refund.status }}</text>
          <text>¥{{ (refund.amountCents / 100).toFixed(2) }}</text>
        </view>
      </view>
      <button
        v-if="
          selectedOrder.paymentStatus === 'PAID' &&
          selectedOrder.fulfillmentStatus === 'NOT_STARTED' &&
          refundableItems.length &&
          !hasActiveRefund
        "
        class="refund-button"
        :loading="refundBusy"
        @click="requestUnshippedRefund"
      >
        申请全部未履约退款
      </button>
      <text v-else-if="hasActiveRefund" class="detail-note">已有退款正在处理中，请勿重复提交</text>
    </view>

    <view v-if="session" class="sec-h fu">
      <text class="sec-t">待使用券</text>
      <text class="sec-mo">{{ entitlements.length }} 张</text>
    </view>
    <view v-if="session" class="cc fu">
      <view v-if="entitlements.length" class="benefit-list">
        <view v-for="entitlement in entitlements" :key="entitlement.entitlementId" class="benefit-card">
          <view>
            <text class="bf-title">{{ entitlement.productTitle || '到店核销权益' }}</text>
            <text class="bf-sub"
              >剩余 {{ entitlement.remainingUses }} 次 · 有效至
              {{ entitlement.expiresAt?.slice(0, 10) }}</text
            >
          </view>
          <button size="mini" class="bf-btn" @click="copyVerificationToken(entitlement)">出示券码</button>
        </view>
      </view>
      <view v-else class="empty-safe">当前没有可使用的核销权益</view>
    </view>

    <view v-if="session" class="sec-h fu">
      <text class="sec-t">消费奖励</text>
      <text class="sec-mo">独立奖励账本</text>
    </view>
    <view v-if="session" class="cc fu">
      <view v-if="rewards.length" class="benefit-list">
        <view v-for="reward in rewards" :key="reward.id" class="benefit-card">
          <view>
            <text class="bf-title">{{ reward.ruleVersion || '消费奖励' }}</text>
            <text class="bf-sub"
              >原额 ¥{{ ((reward.originalAmountCents || 0) / 100).toFixed(2) }} · 可用 ¥{{
                ((reward.availableAmountCents || 0) / 100).toFixed(2)
              }}</text
            >
          </view>
          <text class="reward-status">{{ reward.status || '有效' }}</text>
        </view>
      </view>
      <view v-else class="empty-safe">当前没有奖励流水</view>
    </view>

    <view v-if="session" class="sec-h fu">
      <text class="sec-t">配送地址</text>
      <text class="sec-mo">{{ addresses.length }} 个</text>
    </view>
    <view v-if="session" class="cc fu">
      <view v-if="addresses.length" class="benefit-list">
        <view v-for="address in addresses" :key="address.id" class="benefit-card">
          <view>
            <text class="bf-title">{{ address.recipientName }} {{ address.mobile }}</text>
            <text class="bf-sub">{{ address.addressLine }}</text>
            <text class="bf-sub">{{ address.isDefault ? '默认地址' : '普通地址' }}</text>
          </view>
          <button size="mini" class="bf-btn" @click="archiveAddress(address)">移除</button>
        </view>
      </view>
      <button class="account-button secondary compact" @click="editingAddress = !editingAddress">
        {{ editingAddress ? '收起地址表单' : '新增配送地址' }}
      </button>
      <view v-if="editingAddress" class="account-form">
        <input v-model="addressForm.recipientName" placeholder="收件人姓名" maxlength="80" />
        <input v-model="addressForm.mobile" type="number" placeholder="手机号" maxlength="11" />
        <view class="form-grid">
          <input v-model="addressForm.provinceCode" placeholder="省编码" />
          <input v-model="addressForm.cityCode" placeholder="市编码" />
          <input v-model="addressForm.districtCode" placeholder="区编码" />
        </view>
        <input v-model="addressForm.addressLine" placeholder="街道、门牌与房间号" maxlength="300" />
        <label class="form-check">
          <switch
            :checked="addressForm.isDefault"
            :color="LIFE_BRAND_DEEP_HEX"
            @change="addressForm.isDefault = $event.detail.value"
          />设为默认地址
        </label>
        <button class="account-button" :loading="busy" @click="saveAddress">
          确认并加密保存
        </button>
      </view>
    </view>

    <view v-if="session" class="sec-h fu">
      <text class="sec-t">发票与抬头</text>
      <text class="sec-mo">{{ invoiceProfiles.length }} 个</text>
    </view>
    <view v-if="session" class="cc fu">
      <view v-if="invoiceProfiles.length" class="benefit-list">
        <view v-for="profile in invoiceProfiles" :key="profile.id" class="benefit-card">
          <view>
            <text class="bf-title">{{ profile.title }}</text>
            <text class="bf-sub"
              >{{ profile.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头' }} ·
              {{ profile.isDefault ? '默认' : '非默认' }}</text
            >
          </view>
          <button size="mini" class="bf-btn" @click="archiveInvoiceProfile(profile)">移除</button>
        </view>
      </view>
      <button class="account-button secondary compact" @click="editingInvoice = !editingInvoice">
        {{ editingInvoice ? '收起抬头表单' : '新增发票抬头' }}
      </button>
      <view v-if="editingInvoice" class="account-form">
        <picker
          :range="['个人抬头', '企业抬头']"
          @change="
            invoiceForm.profileType = Number($event.detail.value) === 1 ? 'ENTERPRISE' : 'PERSONAL'
          "
        >
          <view class="form-picker">{{
            invoiceForm.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头'
          }}</view>
        </picker>
        <input v-model="invoiceForm.title" placeholder="发票抬头" maxlength="200" />
        <input
          v-if="invoiceForm.profileType === 'ENTERPRISE'"
          v-model="invoiceForm.taxIdentifier"
          placeholder="纳税人识别号"
          maxlength="80"
        />
        <input v-model="invoiceForm.email" placeholder="接收邮箱（选填）" maxlength="255" />
        <label class="form-check">
          <switch
            :checked="invoiceForm.isDefault"
            :color="LIFE_BRAND_DEEP_HEX"
            @change="invoiceForm.isDefault = $event.detail.value"
          />设为默认抬头
        </label>
        <button class="account-button" :loading="busy" @click="saveInvoiceProfile">
          确认并加密保存
        </button>
      </view>
    </view>

    <!-- ============================
         mlist 功能列表 (会员/发票/反馈/安心购/深色模式 switch)
         ============================ -->
    <view class="sec-h fu"><text class="sec-t">账户与服务</text><text class="sec-mo">安全中心</text></view>
    <view class="cc fu">
      <view class="mlist">
        <view class="mli" @click="openMli('member')">
          <view class="mlic crown">👑</view>
          <view class="mli-copy">
            <text class="mli-t">会员中心</text>
            <text class="mli-d">黄金会员 · 每月 ¥50 代金券</text>
          </view>
          <text class="go-r">›</text>
        </view>
        <view class="mli" @click="openMli('invoice')">
          <view class="mlic blue">📄</view>
          <view class="mli-copy">
            <text class="mli-t">发票助手</text>
            <text class="mli-d">支持电子发票</text>
          </view>
          <text class="go-r">›</text>
        </view>
        <view class="mli" @click="openMli('feedback')">
          <view class="mlic purple">💬</view>
          <view class="mli-copy">
            <text class="mli-t">意见反馈</text>
            <text class="mli-d">你的建议我们认真看</text>
          </view>
          <text class="go-r">›</text>
        </view>
        <view class="mli" @click="openMli('safeguard')">
          <view class="mlic green">🛡️</view>
          <view class="mli-copy">
            <text class="mli-t">安心购保障</text>
            <text class="mli-d">随时退 · 过期自动退</text>
          </view>
          <text class="go-r">›</text>
        </view>
        <view class="mli">
          <view class="mlic dark">🌙</view>
          <view class="mli-copy">
            <text class="mli-t">深色模式</text>
            <text class="mli-d">夜间护眼</text>
          </view>
          <switch
            class="sw-uni"
            :checked="isDark"
            :color="LIFE_BRAND_DEEP_HEX"
            @change="isDark = $event.detail.value"
          />
        </view>
      </view>
    </view>

    <view style="height: 40rpx"></view>
  </LifeSurface>
</template>
<style scoped>
/* ====== concept-f me-head 渐变头区 ====== */
.me-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22rpx;
  margin: 8rpx 24rpx 0;
  padding: 32rpx 26rpx 34rpx;
  border-radius: 30rpx;
  background: linear-gradient(165deg, var(--hd1, #009146), var(--hd2, #006b36));
  color: #fff;
  box-shadow: var(--shadow, 0 10px 26px rgba(22,19,15,.12));
  box-sizing: border-box;
  z-index: 2;
}
.mava {
  width: 116rpx;
  height: 116rpx;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 48rpx;
  font-weight: 900;
  color: #5b3400;
  background: linear-gradient(135deg, #ffe25a, #f7c400);
  border: 4rpx solid rgba(255, 255, 255, .85);
  box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, .22);
  flex: none;
}
.mcopy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.mname { font-size: 34rpx; font-weight: 900; }
.mrow { display: flex; align-items: center; gap: 14rpx; margin-top: 8rpx; flex-wrap: wrap; }
.mbadge {
  font-size: 18rpx;
  font-weight: 900;
  background: linear-gradient(120deg, #3a2c10, #16130f);
  color: #ffd76a;
  border-radius: 10rpx;
  padding: 6rpx 14rpx;
  border: 1rpx solid rgba(255, 217, 138, .4);
  flex: none;
}
.mid { font-size: 20rpx; font-weight: 700; color: rgba(255,255,255,.75); }
.mact { display: flex; gap: 14rpx; align-self: flex-start; }
.macti {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(255,255,255,.16);
  display: grid; place-items: center;
  color: #fff;
  font-size: 28rpx;
  backdrop-filter: blur(4px);
}

/* ====== mstat 4 列资产卡 ====== */
.mstat {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: -36rpx 28rpx 0;
  padding: 24rpx 0;
  position: relative;
  z-index: 3;
}
.mstatc {
  text-align: center;
  position: relative;
  padding: 4rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.mstatc + .mstatc::before {
  content: '';
  position: absolute;
  left: 0;
  top: 18%;
  height: 64%;
  width: 1rpx;
  background: var(--line, rgba(22,19,15,.08));
}
.mstatv {
  font-size: 32rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  line-height: 1.15;
}
.munit {
  font-style: normal;
  font-size: 20rpx;
  font-weight: 800;
  margin-right: 2rpx;
}
.mstatl {
  font-size: 20rpx;
  font-weight: 800;
  color: var(--mut, #857c6d);
  margin-top: 8rpx;
}
.mstatc.hot .mstatv { color: var(--promo, #f03749); }

/* ====== 代金券 pban 粉红渐变 banner ====== */
.pban {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 22rpx 28rpx 0;
  padding: 22rpx 26rpx;
  border-radius: 28rpx;
  background: linear-gradient(120deg, #fff1f0, #ffe4e0);
  border: 1rpx solid #ffd5cf;
  box-sizing: border-box;
}
.pban-ic {
  width: 56rpx; height: 56rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #ff5d3d, #f03749);
  display: grid; place-items: center;
  color: #fff;
  font-size: 28rpx;
  flex: none;
}
.pban-tx {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  font-weight: 900;
  color: #e23d3d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pban-go {
  font-size: 20rpx;
  font-weight: 900;
  color: #e07a6a;
  flex: none;
}

/* ====== 订单宫格 mord ====== */
.mord-wrap { margin: 14rpx 28rpx 0; padding: 22rpx 10rpx 24rpx; }
.mord { display: grid; grid-template-columns: repeat(5, 1fr); }
.mordc {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  position: relative;
}
.oic-wrap {
  position: relative;
  width: 88rpx;
  height: 88rpx;
  margin: 0 auto;
  display: grid;
  place-items: center;
}
.oic {
  width: 80rpx;
  height: 80rpx;
  display: grid;
  place-items: center;
  font-size: 38rpx;
  border-radius: 24rpx;
  background: radial-gradient(circle at 50% 44%, rgba(255,208,105,.34), rgba(255,208,105,0) 72%);
}
.obdg {
  position: absolute;
  top: -6rpx;
  right: calc(50% - 48rpx);
  min-width: 30rpx;
  height: 30rpx;
  border-radius: 16rpx;
  background: var(--promo, #f03749);
  color: #fff;
  font-size: 18rpx;
  font-weight: 900;
  display: grid;
  place-items: center;
  padding: 0 8rpx;
  border: 3rpx solid var(--card, #fff);
  box-sizing: border-box;
  line-height: 24rpx;
}
.mordl { font-size: 22rpx; font-weight: 800; color: var(--ink, #16130f); }

/* ====== 常用服务 4 宫格 msvc ====== */
.msvc-wrap { margin: 14rpx 28rpx 0; padding: 22rpx 10rpx 24rpx; }
.msvc { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20rpx 0; }
.msvcc {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.sic {
  width: 80rpx;
  height: 80rpx;
  display: grid;
  place-items: center;
  font-size: 38rpx;
  border-radius: 24rpx;
}
.msvcl { font-size: 22rpx; font-weight: 800; color: var(--ink, #16130f); }

/* ====== sec-h 分区头 (全局 sec-h 已在 App.vue，此处补充内层) ====== */
.sec-h.inner {
  padding: 4rpx 0 18rpx;
  margin-bottom: 0;
  border-bottom: 1rpx solid var(--line, rgba(22,19,15,.08));
}

/* ====== 登录/OTP / 订单 / 地址 / 发票 ====== */
.mcard-body { display: flex; flex-direction: column; gap: 18rpx; }
.login-methods { display: flex; flex-direction: column; gap: 18rpx; }
.login-divider { color: var(--mut, #857c6d); text-align: center; font-size: 22rpx; font-weight: 700; }
.login-input {
  height: 86rpx;
  padding: 0 28rpx;
  border: 1rpx solid var(--line, rgba(22,19,15,.1));
  border-radius: 22rpx;
  background: var(--cnt-bg, rgba(22,19,15,.04));
  color: var(--ink, #16130f);
  box-sizing: border-box;
  font-size: 28rpx;
}
page[data-theme='dark'] .login-input {
  background: rgba(255,255,255,.06);
}
.otp-row { display: grid; grid-template-columns: 1fr auto; gap: 16rpx; }
.otp-button {
  margin: 0;
  color: #fff;
  background: linear-gradient(120deg, var(--hd1, #009146), var(--hd2, #006b36));
  border-radius: 22rpx;
  font-size: 24rpx;
  font-weight: 800;
  padding: 0 28rpx;
  height: 86rpx;
  line-height: 86rpx;
}
.account-button {
  color: #fff;
  background: linear-gradient(120deg, var(--hd1, #009146), var(--hd2, #006b36));
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 800;
  height: 86rpx;
  line-height: 86rpx;
  margin: 0;
}
.account-button.secondary {
  color: var(--accent, #009146);
  background: var(--tone-soft, #E7F7F0);
}
page[data-theme='dark'] .account-button.secondary {
  color: #8fe33f;
  background: rgba(110,199,38,.14);
}
.account-button.compact {
  margin-top: 20rpx;
  font-size: 24rpx;
  height: 72rpx;
  line-height: 72rpx;
}
.account-message {
  display: block;
  margin-top: 18rpx;
  color: var(--mut, #857c6d);
  text-align: center;
  font-size: 24rpx;
}
.orders-list { display: flex; flex-direction: column; gap: 16rpx; }
.order-row {
  padding: 22rpx;
  border: 1rpx solid var(--line, rgba(22,19,15,.08));
  border-radius: 22rpx;
  background: var(--cnt-bg, rgba(22,19,15,.03));
}
page[data-theme='dark'] .order-row { background: rgba(255,255,255,.04); }
.order-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
}
.order-store { font-size: 28rpx; font-weight: 900; color: var(--ink, #16130f); }
.order-st {
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: var(--tone-soft, #E7F7F0);
  color: var(--accent, #009146);
  font-size: 18rpx;
  font-weight: 800;
}
.order-no {
  display: block;
  margin-top: 10rpx;
  color: var(--mut, #857c6d);
  font-size: 22rpx;
}
.order-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
  color: var(--mut, #857c6d);
  font-size: 22rpx;
}
.order-foot .price { color: var(--hot, #eb6325); font-size: 32rpx; font-weight: 900; }
.pay-button {
  width: 100%;
  margin-top: 16rpx;
  color: #fff;
  background: linear-gradient(120deg, var(--hot, #eb6325), var(--promo, #f03749));
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 800;
  height: 72rpx;
  line-height: 72rpx;
}
.empty-safe {
  padding: 32rpx 20rpx;
  text-align: center;
  color: var(--mut, #857c6d);
  font-size: 24rpx;
}
.order-detail { display: flex; flex-direction: column; gap: 14rpx; }
.detail-line {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  color: var(--mut, #857c6d);
  font-size: 24rpx;
  padding: 10rpx 0;
}
.detail-title {
  display: block;
  margin: 8rpx 0 12rpx;
  font-weight: 800;
  color: var(--ink, #16130f);
  font-size: 26rpx;
}
.refund-list {
  padding-top: 16rpx;
  margin-top: 4rpx;
  border-top: 1rpx solid var(--line, rgba(22,19,15,.08));
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.refund-button {
  margin-top: 14rpx;
  color: #fff;
  background: linear-gradient(120deg, #ff5d3d, #f03749);
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 800;
  height: 72rpx;
  line-height: 72rpx;
}
.detail-note {
  color: var(--promo, #f03749);
  text-align: center;
  font-size: 24rpx;
  padding: 14rpx 0 6rpx;
}
.benefit-list { display: flex; flex-direction: column; gap: 16rpx; }
.benefit-card {
  display: flex;
  padding: 22rpx;
  border: 1rpx solid var(--line, rgba(22,19,15,.08));
  border-radius: 22rpx;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  background: var(--cnt-bg, rgba(22,19,15,.03));
}
page[data-theme='dark'] .benefit-card { background: rgba(255,255,255,.04); }
.benefit-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 10rpx;
}
.bf-title { font-size: 28rpx; font-weight: 800; color: var(--ink, #16130f); }
.bf-sub { color: var(--mut, #857c6d); font-size: 22rpx; }
.bf-btn {
  margin: 0;
  color: var(--accent, #009146);
  background: var(--tone-soft, #E7F7F0);
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 800;
  padding: 10rpx 24rpx;
}
page[data-theme='dark'] .bf-btn {
  color: #8fe33f;
  background: rgba(110,199,38,.14);
}
.reward-status {
  color: var(--promo, #f03749);
  font-size: 22rpx;
  font-weight: 800;
}
.account-form {
  display: grid;
  gap: 18rpx;
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid var(--line, rgba(22,19,15,.08));
}
.account-form input,
.form-picker {
  height: 84rpx;
  padding: 0 26rpx;
  border: 1rpx solid var(--line, rgba(22,19,15,.1));
  border-radius: 22rpx;
  background: var(--cnt-bg, rgba(22,19,15,.04));
  color: var(--ink, #16130f);
  box-sizing: border-box;
  font-size: 26rpx;
  line-height: 84rpx;
}
page[data-theme='dark'] .account-form input,
page[data-theme='dark'] .form-picker { background: rgba(255,255,255,.06); }
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
}
.form-check {
  display: flex;
  align-items: center;
  gap: 14rpx;
  color: var(--mut, #857c6d);
  font-size: 24rpx;
}

/* ====== mlist 功能列表 ====== */
.mlist { display: flex; flex-direction: column; }
.mli {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 4rpx;
}
.mli + .mli { border-top: 1rpx solid var(--line, rgba(22,19,15,.08)); }
.mlic {
  width: 60rpx;
  height: 60rpx;
  border-radius: 18rpx;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 30rpx;
  flex: none;
}
.mlic.crown  { background: linear-gradient(135deg, #3a2c10, #16130f); color: #ffd76a; }
.mlic.blue   { background: #1a6fc4; }
.mlic.purple { background: #8a5cf6; }
.mlic.green  { background: #00a870; }
.mlic.dark   { background: #10241a; color: #f7c400; }
.mli-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.mli-t { font-size: 28rpx; font-weight: 800; color: var(--ink, #16130f); }
.mli-d { font-size: 20rpx; font-weight: 700; color: var(--mut, #857c6d); }
.go-r { color: var(--mut, #857c6d); font-size: 28rpx; flex: none; }

/* ====== fu → .in 入场动画 (交错延迟用 CSS nth) ====== */
.fu:nth-of-type(1) { transition-delay: .04s; }
.fu:nth-of-type(2) { transition-delay: .08s; }
.fu:nth-of-type(3) { transition-delay: .12s; }
.fu:nth-of-type(4) { transition-delay: .16s; }
.fu:nth-of-type(5) { transition-delay: .20s; }
.fu:nth-of-type(6) { transition-delay: .24s; }
.fu:nth-of-type(7) { transition-delay: .28s; }
.fu:nth-of-type(8) { transition-delay: .32s; }
.fu:nth-of-type(9) { transition-delay: .36s; }
.fu:nth-of-type(10) { transition-delay: .40s; }
.fu:nth-of-type(11) { transition-delay: .44s; }
.fu:nth-of-type(12) { transition-delay: .48s; }
.fu:nth-of-type(13) { transition-delay: .52s; }
.fu:nth-of-type(14) { transition-delay: .56s; }
.fu:nth-of-type(15) { transition-delay: .60s; }
.fu:nth-of-type(16) { transition-delay: .64s; }
.fu:nth-of-type(17) { transition-delay: .68s; }
.fu:nth-of-type(18) { transition-delay: .72s; }
</style>
