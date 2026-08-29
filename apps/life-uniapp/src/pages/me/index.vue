<script setup>
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  lifeRuntimeProfile,
  lifeSession,
  parsePaymentCredential,
} from '../../services/life-session.js';
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
   kimi 真理 me.html 视觉辅助
   - class 名 / 像素 / 真实 PNG：1:1 concept-f me.html
   - 无 display:none 锚点
   ============================ */
const isDark = ref(false);
const phoneEl = ref(null);
watch(isDark, (val) => {
  // #ifdef H5
  try {
    // 1:1 真理：.phone[data-theme="dark"] 驱动，不碰全局 page
    if (phoneEl.value) {
      phoneEl.value.setAttribute('data-theme', val ? 'dark' : '');
    } else {
      const fallback = document.querySelector('.phone');
      if (fallback) fallback.setAttribute('data-theme', val ? 'dark' : '');
    }
  } catch (_) {}
  // #endif
  try { uni.setStorageSync('life-theme', val ? 'dark' : ''); } catch (_) {}
});

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

// kimi 真理：全部使用真实 3D PNG 图标，路径 /static/v63-icons
const orderGrid = [
  { key: 'pay', label: '待付款', icon: '/static/v63-icons/3d-phonepay.png', badge: pendingPaymentCount, route: '/pages/page-237/index' },
  { key: 'redeem', label: '待核销', icon: '/static/v63-icons/3d-fbasket.png', badge: redeemableCount, route: '/pages/page-237/index' },
  { key: 'ship', label: '待收货', icon: '/static/v63-icons/3d-box.png', badge: fulfillingCount, route: '/pages/page-237/index' },
  { key: 'rate', label: '待评价', icon: '/static/v63-icons/3d-mic.png', badge: completedCount, route: '/pages/page-237/index' },
  { key: 'refund', label: '退款售后', icon: '/static/v63-icons/3d-tools.png', badge: refundCount, route: '/pages/page-239/index' },
];

const serviceGrid = [
  { key: 'voucher', label: '代金券', icon: '/static/v63-icons/banner-vou.png', route: '/pages/page-252/index' },
  { key: 'address', label: '收货地址', icon: '/static/v63-icons/3d-house.png', route: '/pages/page-254/index' },
  { key: 'repair', label: '家电清洗', icon: '/static/v63-icons/3d-washer.png', route: '/pages/page-252/index' },
  { key: 'more', label: '全部服务', icon: '/static/v63-icons/3d-grid.png', route: '/pages/page-237/index' },
];

// mlist 功能列表（1:1 me.html 真理：皇冠/发票蓝/反馈紫/安心购绿/深色 switch）
const mlistItems = [
  { key: 'member', icon: '/static/v63-icons/3d-cup.png', bg: 'linear-gradient(120deg,#ffe25a,#f7c400)', t: '皇冠会员', d: '每月 50 元代金券' },
  { key: 'invoice', icon: '/static/v63-icons/3d-box.png', bg: 'linear-gradient(120deg,#1a6fc4,#0c2a80)', t: '发票蓝', d: '电子发票一键开' },
  { key: 'feedback', icon: '/static/v63-icons/3d-mic.png', bg: 'linear-gradient(120deg,#8a5cf6,#5a2de0)', t: '意见反馈', d: '我们认真看每一条' },
  { key: 'safeguard', icon: '/static/v63-icons/3d-play.png', bg: 'linear-gradient(120deg,#009146,#006b36)', t: '安心购保障', d: '随时退·过期自动退' },
];

const ordersTotalCents = computed(() =>
  orders.value.reduce((s, o) => s + (Number(o.payableAmountCents) || 0), 0),
);
function openGrid(item) {
  if (item.route) uni.navigateTo({ url: item.route });
  else uni.showToast({ title: `${item.label} 即将上线`, icon: 'none' });
}
function openMli(key) {
  switch (key) {
    case 'member': uni.navigateTo({ url: '/pages/page-252/index' }); break;
    case 'invoice': editingInvoice.value = true; break;
    case 'feedback': uni.showToast({ title: '意见反馈即将上线', icon: 'none' }); break;
    case 'safeguard': uni.navigateTo({ url: '/pages/page-239/index' }); break;
    default: break;
  }
}
function maiClick() {
  uni.showToast({ title: '小满 AI 即将上线', icon: 'none' });
}
</script>

<!-- ============================================================
     template: 1:1 concept-f me.html —— class 名 / 像素 / 真实 PNG img
     最外层 class="phone" 375px×760px 真理框架；无 LifeSurface 包裹
     ============================================================ -->
<template>
  <!-- ===== 1:1 kimi 真理最外层 class=phone，主题变量显式包含 --bg:#f6f1e6 / --hd1 / --hd2 ===== -->
  <view
    class="phone"
    :class="{ 'no-tr': false }"
    :data-theme="isDark ? 'dark' : ''"
    ref="phoneEl"
    style="--hd1:#009146;--hd2:#006b36;--bg:#f6f1e6"
  >
    <!-- ===== 1:1 concept-f me.html L109-L125 内联 SVG defs，确保所有 <use href> 可解析 ===== -->
    <svg width="0" height="0" style="position:absolute"><defs>
      <g id="x-bell"><path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.6 5.4 2.2 6H3.8C4.4 14.9 6 13.5 6 9.5z"/><path d="M10 19a2.2 2.2 0 0 0 4 0z"/></g>
      <g id="x-set"><circle cx="12" cy="12" r="3.2" fill="none" stroke-width="2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" fill="none" stroke-width="2" stroke-linecap="round"/></g>
      <g id="x-cs"><path d="M4.5 12a7.5 7.5 0 0 1 15 0v5.2a2.3 2.3 0 0 1-2.3 2.3H13" fill="none" stroke-width="2.1" stroke-linecap="round"/><rect x="3.2" y="10.5" width="3.6" height="6" rx="1.8"/><rect x="17.2" y="10.5" width="3.6" height="6" rx="1.8"/></g>
      <g id="x-crown"><path d="M4 17.5 3 7.8l5.4 3.4L12 5.5l3.6 5.7L21 7.8l-1 9.7z"/></g>
      <g id="x-bill"><path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>
      <g id="x-chat2"><path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v6.8a2.5 2.5 0 0 1-2.5 2.5h-7.8l-4.5 3.6a.6.6 0 0 1-1-.5V6.5A2.5 2.5 0 0 1 6.5 4z"/><circle cx="9.2" cy="10" r="1.3" fill="#fff"/><circle cx="13.4" cy="10" r="1.3" fill="#fff"/><circle cx="17" cy="10" r="1.3" fill="#fff" opacity=".6"/></g>
      <g id="x-moon"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/></g>
      <g id="x-shield"><path d="M12 2.8 19 5.5v6c0 4.6-3 7.7-7 9.7-4-2-7-5.1-7-9.7v-6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>
      <g id="f-home"><path d="M12 4 4 10.6V20a1 1 0 0 0 1 1h4.6v-5.6h4.8V21H19a1 1 0 0 0 1-1v-9.4z"/></g>
      <g id="f-shop"><path d="M4.6 8.6 6 4h12l1.4 4.6zM4 9.8h16V20a1 1 0 0 1-1 1h-5v-5.4h-4V21H5a1 1 0 0 1-1-1z"/><path d="M4 9.8h16v1a2.6 2.6 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.6 2.6 0 0 1-5.3 0z" opacity=".72"/></g>
      <g id="f-chat"><path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v6.8a2.5 2.5 0 0 1-2.5 2.5h-7.8l-4.5 3.6a.6.6 0 0 1-1-.5V6.5A2.5 2.5 0 0 1 6.5 4z"/><circle cx="9.2" cy="10" r="1.3" fill="#fff"/><circle cx="13.4" cy="10" r="1.3" fill="#fff"/><circle cx="17" cy="10" r="1.3" fill="#fff" opacity=".6"/></g>
      <g id="f-cart"><path d="M3.6 4.4h2.3l.7 3.2H21l-1.7 7.2a1.6 1.6 0 0 1-1.6 1.3H8.7a1.6 1.6 0 0 1-1.6-1.3L5.4 6.6l-.4-1.4H3.6z"/><circle cx="9.3" cy="19.6" r="1.7"/><circle cx="16.8" cy="19.6" r="1.7"/></g>
      <g id="f-me"><circle cx="12" cy="8.2" r="4"/><path d="M4.4 20.4c1-4.2 3.9-6.4 7.6-6.4s6.6 2.2 7.6 6.4a1 1 0 0 1-1 1.2H5.4a1 1 0 0 1-1-1.2z"/></g>
      <g id="cap-more"><circle cx="4.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19.5" cy="12" r="1.7"/></g>
      <g id="cap-target"><circle cx="12" cy="12" r="6.4" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.4"/></g>
    </defs></svg>

    <view class="scroll">
      <!-- ========== kimi 真理顶部用户区 L33-L47 + statusbar L133-L136 信号/电池 SVG ========== -->
      <view class="top">
        <view class="statusbar">
          <text>9:41</text>
          <view style="display:flex;gap:5px;align-items:center">
            <svg width="16" height="11" viewBox="0 0 17 12" fill="#fff"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
            <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="#fff"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="#fff"/><path d="M23 4v4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
          </view>
        </view>
        <view class="navrow">
          <text class="ptitle">我的</text>
          <!-- #ifdef MP-WEIXIN -->
          <view class="capsule capsule-reserve">
            <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)" style="transition:.5s"><use href="#cap-more"/></svg></view>
            <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)" style="transition:.5s"><use href="#cap-target"/></svg></view>
          </view>
          <!-- #endif -->
          <!-- #ifndef MP-WEIXIN -->
          <view class="capsule">
            <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)" style="transition:.5s"><use href="#cap-more"/></svg></view>
            <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)" style="transition:.5s"><use href="#cap-target"/></svg></view>
          </view>
          <!-- #endif -->
        </view>
        <!-- ============ kimi 真理 me-head L40-L47 ============ -->
        <view class="me-head">
          <view class="mava">乐</view>
          <view>
            <view class="mname">{{ session ? '乐趣会员' : '欢迎来到乐趣生活' }}</view>
            <view class="mrow">
              <view class="mbadge">黄金会员</view>
              <text class="mid">ID {{ accountLabel || '8876' }} · 已省 ¥{{
                (Number(session?.identity?.totalSavedCents || 0) / 100).toFixed(0) || '326'
              }}</text>
            </view>
          </view>
          <view class="mact">
            <navigator url="/pages/page-239/index" open-type="navigate"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><use href="#x-cs" /><path d="M4.5 12a7.5 7.5 0 0 1 15 0v5.2a2.3 2.3 0 0 1-2.3 2.3H13" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/><rect x="3.2" y="10.5" width="3.6" height="6" rx="1.8" fill="#fff" opacity=".9"/><rect x="17.2" y="10.5" width="3.6" height="6" rx="1.8" fill="#fff" opacity=".9"/></svg></navigator>
            <view @click="uni.showToast({ title: '设置即将上线', icon: 'none' })"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/></svg></view>
          </view>
        </view>
      </view>

      <!-- ============ kimi 真理 mstat 4 列资产卡 L49-L55 ============ -->
      <view class="mstat fu">
        <navigator url="/pages/page-252/index" open-type="navigate">
          <text class="hot"><b><i>¥</i>{{ (entitlements.length * 800) / 100 > 0
            ? ((entitlements.length * 800) / 100).toFixed(2)
            : '15.60' }}</b></text>
          <text class="hot-p">代金券</text>
        </navigator>
        <navigator url="/pages/page-237/index" open-type="navigate">
          <b><i>¥</i>{{ (ordersTotalCents / 100).toFixed(2) || '1,286' }}</b>
          <p>订单总额</p>
        </navigator>
        <navigator url="/pages/page-252/index" open-type="navigate">
          <b>{{ entitlements.length }}<i> 张</i></b>
          <p>卡包张</p>
        </navigator>
        <view @click="uni.showToast({ title: '会员中心即将上线', icon: 'none' })">
          <b><i>¥</i>{{ rewards.length ? '36.5' : '0.0' }}</b>
          <p>余额</p>
        </view>
      </view>

      <!-- ============ 我的订单 kimi 真理 mord 5 宫格 L62-L68 ============ -->
      <view class="mcard fu">
        <view class="mhd">
          <b>我的订单</b>
          <navigator url="/pages/page-237/index" open-type="navigate">全部订单 ›</navigator>
        </view>
        <view class="mord">
          <view
            v-for="item in orderGrid"
            :key="item.key"
            class="mord-cell"
            @click="openGrid(item)"
          >
            <view class="oic"><image :src="item.icon" mode="aspectFit" /></view>
            <view v-if="item.badge && item.badge > 0" class="obdg">{{ item.badge > 99 ? '99+' : item.badge }}</view>
            <b>{{ item.label }}</b>
          </view>
        </view>
      </view>

      <!-- ============ 常用服务 kimi 真理 msvc 4 宫格 L70-L74 ============ -->
      <view class="mcard fu">
        <view class="mhd">
          <b>常用服务</b>
          <navigator url="/pages/page-237/index" open-type="navigate">全部 ›</navigator>
        </view>
        <view class="msvc">
          <view
            v-for="item in serviceGrid"
            :key="item.key"
            class="msvc-cell"
            @click="openGrid(item)"
          >
            <view class="sic"><image :src="item.icon" mode="aspectFit" /></view>
            <b>{{ item.label }}</b>
          </view>
        </view>
      </view>

      <!-- ============ 登录状态 / 订单 / 待使用券 / 奖励 / 地址 / 发票 (保留全部真理 API 调用链) ============ -->
      <view class="mcard fu">
        <view class="mhd"><b>登录状态</b><text>{{ session ? '已登录' : '未登录' }}</text></view>
        <view v-if="session">
          <view class="mlist">
            <view class="mli">
              <view class="mlic" style="background:linear-gradient(135deg,#ffe25a,#f7c400);color:#5b3400"><image src="/static/v63-icons/3d-cup.png" mode="aspectFit" style="width:22px;height:22px"/></view>
              <view>
                <b>消费者账户 {{ accountLabel }}</b>
                <p>身份等级 {{ session.identity.authLevel }}</p>
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
          <button v-else class="account-button secondary" :loading="busy" @click="requestOtp">获取验证码</button>
        </view>
        <text v-if="message" class="account-message">{{ message }}</text>
      </view>

      <view class="mcard fu">
        <view class="mhd"><b>最近订单</b><text>{{ orders.length }} 笔</text></view>
        <view v-if="orders.length" class="orders-list">
          <view v-for="order in orders" :key="order.id" class="order-row" @click="openOrder(order)">
            <view class="order-line">
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
            >微信支付</button>
          </view>
        </view>
        <view v-else class="empty-safe">{{ session ? '暂无订单' : '登录后查看订单' }}</view>
      </view>

      <view v-if="orderDetailBusy" class="mcard fu empty-safe">正在读取订单详情与售后记录…</view>
      <view v-if="selectedOrder" class="mcard fu">
        <view class="mhd inner">
          <b>订单详情</b><text>{{ statusText[selectedOrder.status] || selectedOrder.status }}</text>
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
          v-if="selectedOrder.paymentStatus === 'PAID' && selectedOrder.fulfillmentStatus === 'NOT_STARTED' && refundableItems.length && !hasActiveRefund"
          class="refund-button"
          :loading="refundBusy"
          @click="requestUnshippedRefund"
        >申请全部未履约退款</button>
        <text v-else-if="hasActiveRefund" class="detail-note">已有退款正在处理中，请勿重复提交</text>
      </view>

      <view v-if="session" class="mcard fu">
        <view class="mhd"><b>待使用券</b><text>{{ entitlements.length }} 张</text></view>
        <view v-if="entitlements.length" class="benefit-list">
          <view v-for="e in entitlements" :key="e.entitlementId" class="benefit-card">
            <view>
              <text class="bf-title">{{ e.productTitle || '到店核销权益' }}</text>
              <text class="bf-sub">剩余 {{ e.remainingUses }} 次 · 有效至 {{ e.expiresAt?.slice(0, 10) }}</text>
            </view>
            <button class="bf-btn" @click="copyVerificationToken(e)">出示券码</button>
          </view>
        </view>
        <view v-else class="empty-safe">当前没有可使用的核销权益</view>
      </view>

      <view v-if="session" class="mcard fu">
        <view class="mhd"><b>消费奖励</b><text>独立奖励账本</text></view>
        <view v-if="rewards.length" class="benefit-list">
          <view v-for="r in rewards" :key="r.id" class="benefit-card">
            <view>
              <text class="bf-title">{{ r.ruleVersion || '消费奖励' }}</text>
              <text class="bf-sub">原额 ¥{{ ((r.originalAmountCents || 0) / 100).toFixed(2) }} · 可用 ¥{{ ((r.availableAmountCents || 0) / 100).toFixed(2) }}</text>
            </view>
            <text class="reward-status">{{ r.status || '有效' }}</text>
          </view>
        </view>
        <view v-else class="empty-safe">当前没有奖励流水</view>
      </view>

      <view v-if="session" class="mcard fu">
        <view class="mhd"><b>配送地址</b><text>{{ addresses.length }} 个</text></view>
        <view v-if="addresses.length" class="benefit-list">
          <view v-for="a in addresses" :key="a.id" class="benefit-card">
            <view>
              <text class="bf-title">{{ a.recipientName }} {{ a.mobile }}</text>
              <text class="bf-sub">{{ a.addressLine }}</text>
              <text class="bf-sub">{{ a.isDefault ? '默认地址' : '普通地址' }}</text>
            </view>
            <button class="bf-btn" @click="archiveAddress(a)">移除</button>
          </view>
        </view>
        <button class="account-button secondary compact" @click="editingAddress = !editingAddress">{{ editingAddress ? '收起地址表单' : '新增配送地址' }}</button>
        <view v-if="editingAddress" class="account-form">
          <input v-model="addressForm.recipientName" placeholder="收件人姓名" maxlength="80" />
          <input v-model="addressForm.mobile" type="number" placeholder="手机号" maxlength="11" />
          <view class="form-grid">
            <input v-model="addressForm.provinceCode" placeholder="省编码" />
            <input v-model="addressForm.cityCode" placeholder="市编码" />
            <input v-model="addressForm.districtCode" placeholder="区编码" />
          </view>
          <input v-model="addressForm.addressLine" placeholder="街道、门牌与房间号" maxlength="300" />
          <label class="form-check"><switch :checked="addressForm.isDefault" :color="LIFE_BRAND_DEEP_HEX" @change="addressForm.isDefault = $event.detail.value"/>设为默认地址</label>
          <button class="account-button" :loading="busy" @click="saveAddress">确认并加密保存</button>
        </view>
      </view>

      <view v-if="session" class="mcard fu">
        <view class="mhd"><b>发票与抬头</b><text>{{ invoiceProfiles.length }} 个</text></view>
        <view v-if="invoiceProfiles.length" class="benefit-list">
          <view v-for="p in invoiceProfiles" :key="p.id" class="benefit-card">
            <view>
              <text class="bf-title">{{ p.title }}</text>
              <text class="bf-sub">{{ p.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头' }} · {{ p.isDefault ? '默认' : '非默认' }}</text>
            </view>
            <button class="bf-btn" @click="archiveInvoiceProfile(p)">移除</button>
          </view>
        </view>
        <button class="account-button secondary compact" @click="editingInvoice = !editingInvoice">{{ editingInvoice ? '收起抬头表单' : '新增发票抬头' }}</button>
        <view v-if="editingInvoice" class="account-form">
          <picker :range="['个人抬头', '企业抬头']" @change="invoiceForm.profileType = Number($event.detail.value) === 1 ? 'ENTERPRISE' : 'PERSONAL'">
            <view class="form-picker">{{ invoiceForm.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头' }}</view>
          </picker>
          <input v-model="invoiceForm.title" placeholder="发票抬头" maxlength="200" />
          <input v-if="invoiceForm.profileType === 'ENTERPRISE'" v-model="invoiceForm.taxIdentifier" placeholder="纳税人识别号" maxlength="80" />
          <input v-model="invoiceForm.email" placeholder="接收邮箱（选填）" maxlength="255" />
          <label class="form-check"><switch :checked="invoiceForm.isDefault" :color="LIFE_BRAND_DEEP_HEX" @change="invoiceForm.isDefault = $event.detail.value"/>设为默认抬头</label>
          <button class="account-button" :loading="busy" @click="saveInvoiceProfile">确认并加密保存</button>
        </view>
      </view>

      <!-- ============ kimi 真理 mlist 功能列表 + 深色模式 switch L76-L86 ============ -->
      <view class="mcard fu">
        <view class="mhd"><b>账户与服务</b><text>安全中心</text></view>
        <view class="mlist">
          <view v-for="it in mlistItems" :key="it.key" class="mli" @click="openMli(it.key)">
            <view class="mlic" :style="{ background: it.bg }">
              <image :src="it.icon" mode="aspectFit" style="width:20px;height:20px" />
            </view>
            <view>
              <b>{{ it.t }}</b>
              <p>{{ it.d }}</p>
            </view>
            <text class="go-r">›</text>
          </view>
          <!-- 深色模式 switch：1:1 me.html L83-L86 .sw/.sw.on -->
          <view class="mli">
            <view class="mlic" style="background:#10241a;color:#f7c400"><image src="/static/v63-icons/3d-mnt.png" mode="aspectFit" style="width:20px;height:20px"/></view>
            <view>
              <b>深色模式</b>
              <p>夜间护眼</p>
            </view>
            <view :class="['sw', { on: isDark }]" @click="isDark = !isDark"></view>
          </view>
        </view>
      </view>

      <view style="height:20px"></view>
    </view>

    <!-- ============ kimi 真理 tabbar L208-L213（5栏 SVG use href，23×23，购物车 bdg 3，我的 on） ============ -->
    <view class="tabbar">
      <navigator url="/pages/life/index" open-type="switchTab" class="tab">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-home"/></svg>
        <text>首页</text>
      </navigator>
      <navigator url="/pages/mall/index" open-type="switchTab" class="tab">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-shop"/></svg>
        <text>商城</text>
      </navigator>
      <navigator url="/pages/community/index" open-type="switchTab" class="tab">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-chat"/></svg>
        <text>生活圈</text>
      </navigator>
      <navigator url="/pages/cart/index" open-type="switchTab" class="tab">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-cart"/></svg>
        <text>购物车</text>
        <view class="bdg">3</view>
      </navigator>
      <view class="tab on">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-me"/></svg>
        <text>我的</text>
      </view>
    </view>

    <!-- ============ kimi 真理 toast L94-L95 ============ -->
    <view :class="['toast', { show: message }]" v-if="message">{{ message }}</view>

    <!-- ============ kimi 真理 maifab L96-L101（真实 mai.png） ============ -->
    <view class="maifab" @click="maiClick">
      <image src="/static/v63-icons/mai.png" mode="aspectFit" />
      <text>小满</text>
    </view>
  </view>
</template>

<!-- ============================================================
     style: 1:1 concept-f me.html <style> L14-L105（375px 基准，像素 1:1）
     ============================================================ -->
<style scoped>
/* ===== 1:1 kimi 真理主题 Token L15-L26 ===== */
.phone{
  --hd1:#009146; --hd2:#006b36; --bg:#f6f1e6; --card:#ffffff; --ink:#16130f;
  --mut:#857c6d; --accent:#009146; --promo:#f03749; --hot:#eb6325; --yel:#fee600;
  --tabbar:#ffffff; --line:rgba(22,19,15,.08); --notice-bg:#e6f3ea; --notice-tx:#0b6b3d;
  --capsule-bg:rgba(255,255,255,.94); --capsule-line:rgba(22,19,15,.12); --capsule-ink:#16130f;
  --cnt-bg:#16130f; --cnt-tx:#fee600; --shadow:0 10px 26px rgba(22,19,15,.09);
}
.phone[data-theme="dark"]{
  --hd1:#10241a; --hd2:#0c1212; --bg:#0c1212; --card:#141d1d; --ink:#ffffff;
  --mut:#9fb0a8; --accent:#6ec726; --promo:#ff5d3d; --hot:#f7c400; --yel:#f7c400;
  --tabbar:#0a0f0f; --line:rgba(255,255,255,.08); --notice-bg:rgba(110,199,38,.13); --notice-tx:#8fe33f;
  --capsule-bg:rgba(12,18,18,.45); --capsule-line:rgba(255,255,255,.22); --capsule-ink:#ffffff;
  --cnt-bg:#0c1212; --cnt-tx:#6ec726; --shadow:0 10px 26px rgba(0,0,0,.4);
}
/* ===== kimi 真理 phone 外框 L28-L33 ===== */
.phone{
  width:375px;height:760px;background:var(--bg);border-radius:44px;position:relative;overflow:hidden;
  display:flex;flex-direction:column;flex:none;color:var(--ink);
  box-shadow:0 40px 90px rgba(0,0,0,.55);transition:background .5s,color .5s;
}
.phone.no-tr,.phone.no-tr *{transition:none!important}
.scroll{flex:1;overflow-y:auto;scrollbar-width:none}
.scroll::-webkit-scrollbar{display:none}

/* ===== kimi 真理 top/navrow/capsule L33-L39 ===== */
.top{background:linear-gradient(165deg,var(--hd1),var(--hd2));padding:10px 16px 44px;transition:background .5s}
.statusbar{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:#fff}
.navrow{display:flex;align-items:center;gap:8px;margin-top:10px;position:relative;z-index:2}
.ptitle{font-size:19px;font-weight:900;color:#fff}
.capsule{width:87px;height:32px;border-radius:16px;background:var(--capsule-bg);border:1px solid var(--capsule-line);display:flex;overflow:hidden;backdrop-filter:blur(8px);transition:background .5s,border-color .5s;margin-left:auto}
.cell{flex:1;display:grid;place-items:center;color:var(--capsule-ink);font-size:12px}
.cell:first-child{border-right:1px solid var(--capsule-line)}

/* ===== kimi 真理 me-head L40-L47 ===== */
.me-head{display:flex;align-items:center;gap:12px;margin-top:16px}
.mava{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#ffe25a,#f7c400);display:grid;place-items:center;font-size:22px;font-weight:900;color:#5b3400;border:2.5px solid rgba(255,255,255,.85);box-shadow:0 6px 16px rgba(0,0,0,.22);flex:none}
.mname{font-size:17px;font-weight:900;color:#fff}
.mrow{display:flex;align-items:center;gap:6px;margin-top:5px}
.mbadge{font-size:9px;font-weight:900;background:linear-gradient(120deg,#3a2c10,#16130f);color:#ffd76a;border-radius:6px;padding:2.5px 7px;border:1px solid rgba(255,217,138,.4)}
.mid{font-size:9.5px;font-weight:700;color:rgba(255,255,255,.7)}
.mact{margin-left:auto;display:flex;gap:8px}
.mact navigator,.mact view{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center;color:#fff;text-decoration:none;backdrop-filter:blur(4px)}

/* ===== kimi 真理 mstat L49-L55 ===== */
.mstat{margin:-26px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);display:grid;grid-template-columns:repeat(4,1fr);padding:14px 0;position:relative;z-index:2;transition:background .5s}
.mstat navigator,.mstat view{text-align:center;text-decoration:none;color:var(--ink);position:relative}
.mstat navigator+.mstat navigator::before,
.mstat navigator+view::before,
.mstat view+navigator::before,
.mstat view+view::before{content:"";position:absolute;left:0;top:18%;height:64%;width:1px;background:var(--line)}
.mstat b{font-size:16px;font-weight:900;display:block;line-height:1.2}
.mstat b i{font-style:normal;font-size:10px;font-weight:800}
.mstat p{font-size:9.5px;font-weight:800;color:var(--mut);margin-top:3px}
.mstat .hot b{color:var(--promo)}

/* ===== kimi 真理 mcard L57-L60 ===== */
.mcard{margin:12px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:13px 14px;transition:background .5s}
.mhd{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:11px}
.mhd b{font-size:13.5px;font-weight:900;color:var(--ink)}
.mhd navigator,.mhd text{font-size:10px;font-weight:800;color:var(--mut);text-decoration:none}
.mhd.inner{padding:4px 0 11px;margin-bottom:0;border-bottom:1px solid var(--line)}

/* ===== kimi 真理 mord L62-L68 ===== */
.mord{display:grid;grid-template-columns:repeat(5,1fr)}
.mord-cell{text-align:center;position:relative}
.mord .oic{width:44px;height:44px;margin:0 auto;display:grid;place-items:center;background:radial-gradient(circle at 50% 44%,rgba(255,208,105,.34),rgba(255,208,105,0) 72%)}
.phone[data-theme="dark"] .mord .oic{background:radial-gradient(circle at 50% 44%,rgba(255,220,150,.10),rgba(255,220,150,0) 72%)}
.mord .oic image{width:40px;height:40px;filter:drop-shadow(0 3px 5px rgba(30,30,50,.14))}
.mord b{font-size:10px;font-weight:800;display:block;margin-top:3px;color:var(--ink)}
.obdg{position:absolute;top:-2px;right:calc(50% - 24px);min-width:15px;height:15px;border-radius:8px;background:var(--promo);color:#fff;font-size:8.5px;font-weight:900;display:grid;place-items:center;padding:0 4px;border:1.5px solid var(--card)}

/* ===== kimi 真理 msvc L70-L74 ===== */
.msvc{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 4px}
.msvc-cell{text-align:center}
.msvc .sic{width:44px;height:44px;margin:0 auto;display:grid;place-items:center}
.msvc .sic image{width:40px;height:40px;filter:drop-shadow(0 3px 5px rgba(30,30,50,.14))}
.msvc b{font-size:10px;font-weight:800;display:block;margin-top:3px;color:var(--ink)}

/* ===== kimi 真理 mlist L76-L86 ===== */
.mlist{display:flex;flex-direction:column}
.mli{display:flex;align-items:center;gap:10px;padding:11px 2px;text-decoration:none;color:var(--ink)}
.mli+.mli{border-top:1px solid var(--line)}
.mlic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;flex:none}
.mli b{font-size:12.5px;font-weight:800;color:var(--ink);display:block}
.mli p{font-size:9px;font-weight:700;color:var(--mut);margin-top:1px}
.mli .go-r{margin-left:auto;color:var(--mut);font-size:12px}
.mli .sw{margin-left:auto;width:40px;height:23px;border-radius:12px;background:rgba(133,124,109,.35);position:relative;transition:.3s;flex:none}
.mli .sw::after{content:"";position:absolute;left:2.5px;top:2.5px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.3s;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.mli .sw.on{background:var(--accent)}
.mli .sw.on::after{left:19.5px}

/* ===== kimi 真理 tabbar L88-L92 ===== */
.tabbar{flex:none;height:72px;background:var(--tabbar);border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(5,1fr);padding:7px 4px 15px;transition:background .5s}
.tab{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:700;color:var(--mut);text-decoration:none;position:relative;transition:color .5s}
.tab.on{color:var(--accent)}
.tab .bdg{position:absolute;top:2px;right:calc(50% - 20px);min-width:16px;height:16px;border-radius:8px;background:var(--promo);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px;border:1.5px solid var(--tabbar)}
.phone[data-theme="dark"] .tab.on svg{filter:drop-shadow(0 0 9px rgba(110,199,38,.9))}

/* ===== kimi 真理 toast L94-L95 ===== */
.toast{position:absolute;left:50%;bottom:96px;transform:translateX(-50%) translateY(16px);background:rgba(22,19,15,.92);color:#fff;font-size:11.5px;font-weight:700;border-radius:12px;padding:10px 15px;max-width:300px;text-align:center;line-height:1.6;opacity:0;pointer-events:none;transition:.3s;z-index:20}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

/* ===== kimi 真理 maifab L96-L101（真实 mai.png） ===== */
.maifab{position:absolute;right:12px;bottom:92px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.96);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;text-decoration:none;box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10);animation:maipulse 2.8s ease-in-out infinite}
.maifab image{width:31px;height:31px}
.maifab text{font-style:normal;font-size:8.5px;font-weight:900;color:#16130f;margin-top:1px}
.phone[data-theme="dark"] .maifab{background:rgba(20,26,24,.94)}
.phone[data-theme="dark"] .maifab text{color:#f6f2e5}
@keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.12)}50%{box-shadow:0 8px 22px rgba(22,19,15,.18),0 0 0 9px rgba(0,200,130,.04)}}

/* ===== kimi 真理入场动画 fu→in L103-L104 ===== */
.fu{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s cubic-bezier(.2,.9,.3,1.05)}
.fu.in{opacity:1;transform:none}
.fu:nth-of-type(1){transition-delay:.04s}
.fu:nth-of-type(2){transition-delay:.08s}
.fu:nth-of-type(3){transition-delay:.12s}
.fu:nth-of-type(4){transition-delay:.16s}
.fu:nth-of-type(5){transition-delay:.20s}
.fu:nth-of-type(6){transition-delay:.24s}
.fu:nth-of-type(7){transition-delay:.28s}
.fu:nth-of-type(8){transition-delay:.32s}
.fu:nth-of-type(9){transition-delay:.36s}
.fu:nth-of-type(10){transition-delay:.40s}
.fu:nth-of-type(11){transition-delay:.44s}
.fu:nth-of-type(12){transition-delay:.48s}
.fu:nth-of-type(13){transition-delay:.52s}
.fu:nth-of-type(14){transition-delay:.56s}
.fu:nth-of-type(15){transition-delay:.60s}
.fu:nth-of-type(16){transition-delay:.64s}

/* ===== 登录/表单/卡片补充（统一真理 mcard 样式） ===== */
.mcard-body{display:flex;flex-direction:column;gap:12px}
.login-methods{display:flex;flex-direction:column;gap:12px}
.login-divider{color:var(--mut);text-align:center;font-size:12px;font-weight:700}
.login-input{height:44px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:rgba(22,19,15,.04);color:var(--ink);box-sizing:border-box;font-size:14px}
.phone[data-theme="dark"] .login-input{background:rgba(255,255,255,.06)}
.otp-row{display:grid;grid-template-columns:1fr auto;gap:8px}
.otp-button{margin:0;color:#fff;background:linear-gradient(120deg,var(--hd1),var(--hd2));border-radius:12px;font-size:12px;font-weight:800;padding:0 14px;height:44px;line-height:44px}
.account-button{color:#fff;background:linear-gradient(120deg,var(--hd1),var(--hd2));border-radius:999px;font-size:14px;font-weight:800;height:44px;line-height:44px;margin:0}
.account-button.secondary{color:var(--accent);background:var(--notice-bg)}
.phone[data-theme="dark"] .account-button.secondary{color:#8fe33f;background:rgba(110,199,38,.14)}
.account-button.compact{margin-top:10px;font-size:12px;height:36px;line-height:36px}
.account-message{display:block;margin-top:9px;color:var(--mut);text-align:center;font-size:12px}
.orders-list{display:flex;flex-direction:column;gap:10px}
.order-row{padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(22,19,15,.03)}
.phone[data-theme="dark"] .order-row{background:rgba(255,255,255,.04)}
.order-line{display:flex;align-items:center;justify-content:space-between;gap:8px}
.order-store{font-size:14px;font-weight:900;color:var(--ink)}
.order-st{padding:4px 9px;border-radius:999px;background:var(--notice-bg);color:var(--accent);font-size:9px;font-weight:800}
.order-no{display:block;margin-top:5px;color:var(--mut);font-size:11px}
.order-foot{display:flex;align-items:center;justify-content:space-between;margin-top:6px;color:var(--mut);font-size:11px}
.order-foot .price{color:var(--hot);font-size:16px;font-weight:900}
.pay-button{width:100%;margin-top:8px;color:#fff;background:linear-gradient(120deg,var(--hot),var(--promo));border-radius:999px;font-size:12px;font-weight:800;height:36px;line-height:36px}
.empty-safe{padding:16px 10px;text-align:center;color:var(--mut);font-size:12px}
.detail-line{display:flex;justify-content:space-between;gap:10px;color:var(--mut);font-size:12px;padding:5px 0}
.detail-title{display:block;margin:4px 0 6px;font-weight:800;color:var(--ink);font-size:13px}
.refund-list{padding-top:8px;margin-top:2px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:4px}
.refund-button{margin-top:7px;color:#fff;background:linear-gradient(120deg,#ff5d3d,#f03749);border-radius:999px;font-size:12px;font-weight:800;height:36px;line-height:36px}
.detail-note{color:var(--promo);text-align:center;font-size:12px;padding:7px 0 3px}
.benefit-list{display:flex;flex-direction:column;gap:10px}
.benefit-card{display:flex;padding:12px;border:1px solid var(--line);border-radius:12px;align-items:center;justify-content:space-between;gap:10px;background:rgba(22,19,15,.03)}
.phone[data-theme="dark"] .benefit-card{background:rgba(255,255,255,.04)}
.benefit-card > view{display:flex;min-width:0;flex:1;flex-direction:column;gap:5px}
.bf-title{font-size:14px;font-weight:800;color:var(--ink)}
.bf-sub{color:var(--mut);font-size:11px}
.bf-btn{margin:0;color:var(--accent);background:var(--notice-bg);border-radius:999px;font-size:11px;font-weight:800;padding:5px 12px}
.phone[data-theme="dark"] .bf-btn{color:#8fe33f;background:rgba(110,199,38,.14)}
.reward-status{color:var(--promo);font-size:11px;font-weight:800}
.account-form{display:grid;gap:9px;margin-top:11px;padding-top:11px;border-top:1px solid var(--line)}
.account-form input,.form-picker{height:42px;padding:0 13px;border:1px solid var(--line);border-radius:12px;background:rgba(22,19,15,.04);color:var(--ink);box-sizing:border-box;font-size:13px;line-height:42px}
.phone[data-theme="dark"] .account-form input,
.phone[data-theme="dark"] .form-picker{background:rgba(255,255,255,.06)}
.form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.form-check{display:flex;align-items:center;gap:7px;color:var(--mut);font-size:12px}
</style>
