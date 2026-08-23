<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import {
  lifeRuntimeProfile,
  lifeSession,
  parsePaymentCredential,
} from '../../services/life-session.js';

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
</script>
<template>
  <LifeSurface eyebrow="生活账户" title="我的" detail="订单、售后、会员权益和隐私设置"
    ><view class="section">
      <view class="section-head"
        ><text>登录状态</text><text>{{ session ? '已登录' : '未登录' }}</text></view
      >
      <view v-if="session" class="card-list">
        <view class="row-card"
          ><view class="copy"
            ><text>消费者账户 {{ accountLabel }}</text
            ><text>身份等级 {{ session.identity.authLevel }}</text></view
          ></view
        >
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
    <view class="section"
      ><view class="section-head"
        ><text>最近订单</text><text>{{ orders.length }} 笔</text></view
      ><view v-if="orders.length" class="card-list"
        ><view v-for="order in orders" :key="order.id" class="row-card" @click="openOrder(order)"
          ><view class="copy"
            ><text>{{ order.storeName }} · {{ statusText[order.status] || order.status }}</text
            ><text>订单 {{ order.orderNo }} · {{ order.paymentStatus }}</text
            ><text class="price">¥{{ (order.payableAmountCents / 100).toFixed(2) }}</text
            ><button
              v-if="order.status === 'PENDING_PAYMENT'"
              class="pay-button"
              :loading="payingOrderId === order.id"
              :disabled="Boolean(payingOrderId)"
              @click.stop="payOrder(order)"
            >
              微信支付
            </button></view
          ></view
        ></view
      ><view v-else class="empty-safe">{{ session ? '暂无订单' : '登录后查看订单' }}</view></view
    ><view v-if="orderDetailBusy" class="section empty-safe">正在读取订单详情与售后记录…</view>
    <view v-if="selectedOrder" class="section order-detail"
      ><view class="section-head"
        ><text>订单详情</text
        ><text>{{ statusText[selectedOrder.status] || selectedOrder.status }}</text></view
      ><view v-for="item in selectedOrder.items" :key="item.id" class="detail-line"
        ><text>{{ item.title }} × {{ item.quantity }}</text
        ><text>¥{{ (item.lineAmountCents / 100).toFixed(2) }}</text></view
      ><view v-if="aftercare.refunds.length" class="refund-list"
        ><text class="detail-title">退款记录</text
        ><view v-for="refund in aftercare.refunds" :key="refund.id" class="detail-line"
          ><text>{{ refund.reasonCode }} · {{ refund.status }}</text
          ><text>¥{{ (refund.amountCents / 100).toFixed(2) }}</text></view
        ></view
      ><button
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
    <view v-if="session" class="section"
      ><view class="section-head"
        ><text>待使用券</text><text>{{ entitlements.length }} 张</text></view
      ><view v-if="entitlements.length" class="card-list"
        ><view
          v-for="entitlement in entitlements"
          :key="entitlement.entitlementId"
          class="benefit-card"
          ><view
            ><text>{{ entitlement.productTitle || '到店核销权益' }}</text
            ><text
              >剩余 {{ entitlement.remainingUses }} 次 · 有效至
              {{ entitlement.expiresAt?.slice(0, 10) }}</text
            ></view
          ><button size="mini" @click="copyVerificationToken(entitlement)">出示券码</button></view
        ></view
      ><view v-else class="empty-safe">当前没有可使用的核销权益</view></view
    ><view v-if="session" class="section"
      ><view class="section-head"><text>消费奖励</text><text>独立奖励账本</text></view
      ><view v-if="rewards.length" class="card-list"
        ><view v-for="reward in rewards" :key="reward.id" class="benefit-card"
          ><view
            ><text>{{ reward.ruleVersion || '消费奖励' }}</text
            ><text
              >原额 ¥{{ ((reward.originalAmountCents || 0) / 100).toFixed(2) }} · 可用 ¥{{
                ((reward.availableAmountCents || 0) / 100).toFixed(2)
              }}</text
            ></view
          ><text class="reward-status">{{ reward.status || '有效' }}</text></view
        ></view
      ><view v-else class="empty-safe">当前没有奖励流水</view></view
    ><view v-if="session" class="section"
      ><view class="section-head"
        ><text>配送地址</text><text>{{ addresses.length }} 个</text></view
      ><view v-if="addresses.length" class="card-list"
        ><view v-for="address in addresses" :key="address.id" class="account-record"
          ><view
            ><text>{{ address.recipientName }} {{ address.mobile }}</text
            ><text>{{ address.addressLine }}</text
            ><text>{{ address.isDefault ? '默认地址' : '普通地址' }}</text></view
          ><button size="mini" @click="archiveAddress(address)">移除</button></view
        ></view
      ><button class="account-button secondary compact" @click="editingAddress = !editingAddress">
        {{ editingAddress ? '收起地址表单' : '新增配送地址' }}</button
      ><view v-if="editingAddress" class="account-form"
        ><input v-model="addressForm.recipientName" placeholder="收件人姓名" maxlength="80" />
        <input v-model="addressForm.mobile" type="number" placeholder="手机号" maxlength="11" />
        <view class="form-grid"
          ><input v-model="addressForm.provinceCode" placeholder="省编码" /><input
            v-model="addressForm.cityCode"
            placeholder="市编码" /><input v-model="addressForm.districtCode" placeholder="区编码"
        /></view>
        <input v-model="addressForm.addressLine" placeholder="街道、门牌与房间号" maxlength="300" />
        <label class="form-check"
          ><switch
            :checked="addressForm.isDefault"
            color="#076c50"
            @change="addressForm.isDefault = $event.detail.value"
          />设为默认地址</label
        >
        <button class="account-button" :loading="busy" @click="saveAddress">
          确认并加密保存
        </button></view
      ></view
    ><view v-if="session" class="section"
      ><view class="section-head"
        ><text>发票与抬头</text><text>{{ invoiceProfiles.length }} 个</text></view
      ><view v-if="invoiceProfiles.length" class="card-list"
        ><view v-for="profile in invoiceProfiles" :key="profile.id" class="account-record"
          ><view
            ><text>{{ profile.title }}</text
            ><text
              >{{ profile.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头' }} ·
              {{ profile.isDefault ? '默认' : '非默认' }}</text
            ></view
          ><button size="mini" @click="archiveInvoiceProfile(profile)">移除</button></view
        ></view
      ><button class="account-button secondary compact" @click="editingInvoice = !editingInvoice">
        {{ editingInvoice ? '收起抬头表单' : '新增发票抬头' }}</button
      ><view v-if="editingInvoice" class="account-form"
        ><picker
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
        <label class="form-check"
          ><switch
            :checked="invoiceForm.isDefault"
            color="#076c50"
            @change="invoiceForm.isDefault = $event.detail.value"
          />设为默认抬头</label
        >
        <button class="account-button" :loading="busy" @click="saveInvoiceProfile">
          确认并加密保存
        </button></view
      ></view
    ><view class="section"
      ><view class="section-head"><text>账户与服务</text><text>安全中心</text></view
      ><view class="card-list"
        ><view class="row-card"
          ><view class="copy"
            ><text>消费奖励</text><text>奖励账本与订单支付相互独立</text></view
          ></view
        ><view class="row-card"
          ><view class="copy"
            ><text>隐私与授权</text><text>查看、撤回并导出个人授权记录</text></view
          ></view
        ></view
      ></view
    ></LifeSurface
  >
</template>
<style scoped>
.account-button {
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 800;
}
.account-button.secondary {
  color: #076c50;
  background: #e8f7f0;
}
.account-message {
  display: block;
  margin-top: 18rpx;
  color: #66736d;
  text-align: center;
  font-size: 22rpx;
}
.login-methods {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}
.login-divider {
  color: #84908a;
  text-align: center;
  font-size: 20rpx;
}
.login-input {
  height: 82rpx;
  padding: 0 24rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 20rpx;
  background: #f8faf9;
  box-sizing: border-box;
  font-size: 26rpx;
}
.otp-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14rpx;
}
.otp-button {
  margin: 0;
  color: #fff;
  background: #076c50;
  border-radius: 20rpx;
  font-size: 22rpx;
}
.pay-button {
  width: 100%;
  margin-top: 14rpx;
  color: #fff;
  background: #076c50;
  border-radius: 999rpx;
  font-size: 23rpx;
}
.order-detail {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.detail-line {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  color: #66736d;
  font-size: 22rpx;
}
.detail-title {
  display: block;
  margin: 8rpx 0 12rpx;
  font-weight: 800;
}
.refund-list {
  padding-top: 12rpx;
  border-top: 1rpx solid #e6ebe8;
}
.refund-button {
  margin-top: 14rpx;
  color: #9b3f20;
  background: #fff0eb;
  border-radius: 999rpx;
  font-size: 23rpx;
}
.detail-note {
  color: #9b3f20;
  text-align: center;
  font-size: 22rpx;
}
.benefit-card,
.account-record {
  display: flex;
  padding: 20rpx;
  border: 1rpx solid #e6ebe8;
  border-radius: 20rpx;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  background: #f8faf9;
}
.benefit-card > view,
.account-record > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.benefit-card view text:first-child,
.account-record view text:first-child {
  font-size: 25rpx;
  font-weight: 800;
}
.benefit-card view text:nth-child(2),
.account-record view text:not(:first-child) {
  color: #66736d;
  font-size: 20rpx;
}
.benefit-card button,
.account-record button {
  margin: 0;
  color: #076c50;
  background: #e8f7f0;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.reward-status {
  color: #9b3f20;
  font-size: 20rpx;
  font-weight: 800;
}
.account-button.compact {
  margin-top: 20rpx;
  font-size: 22rpx;
}
.account-form {
  display: grid;
  gap: 16rpx;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #e6ebe8;
}
.account-form input,
.form-picker {
  height: 78rpx;
  padding: 0 22rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 18rpx;
  background: #f8faf9;
  box-sizing: border-box;
  font-size: 23rpx;
  line-height: 78rpx;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.form-check {
  display: flex;
  align-items: center;
  gap: 12rpx;
  color: #66736d;
  font-size: 22rpx;
}
</style>
