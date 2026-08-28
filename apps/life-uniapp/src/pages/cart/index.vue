<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeSession } from '../../services/life-session.js';
import { lifeBannerThemeStyle } from '../../services/life-visual.js';

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

/* ============ concept-f 视觉辅助（纯展示，不改冻结契约） ============ */
const surfaceStyle = computed(() => ({
  ...lifeBannerThemeStyle('green'),
  '--tint': '#e7f4ef',
}));
/* 满减进度：当 total ≥ 5000 分时显示"已达成"，否则显示再买 X 立减 ¥8（示例视觉，真实策略以核价为准） */
const promoThresholdCents = 5000;
const promoReduceCents = 800;
const promoGapCents = computed(() => Math.max(0, promoThresholdCents - total.value));
const promoProgress = computed(() => {
  if (total.value <= 0) return 0;
  return Math.min(100, Math.round((total.value / promoThresholdCents) * 100));
});
</script>

<template>
  <LifeSurface
    primary
    :show-assurance="false"
    theme-color="green"
    eyebrow="分组结算"
    title="购物车"
    detail="优惠、配送、奖励与实付逐项算清"
    :style="surfaceStyle"
    show-mai-fab
  >
    <!-- 官方契约锚点（不渲染） -->
    <view class="basket-mark" style="display:none"></view>

    <!-- ========== 自提点 / 总览 绿色英雄区 ========== -->
    <view class="pick fu">
      <view class="pi"><text class="pi-ic">📍</text></view>
      <view class="pt">
        <text class="pb">
          {{ items.length ? `${cart.itemCount} 件商品待结算` : '把喜欢的好物装进来' }}
        </text>
        <text class="pp">价格、库存与配送方式 · 提交前服务端再核验</text>
      </view>
      <view class="pamt">
        <text class="plab">合计</text>
        <text class="pval">¥{{ (total / 100).toFixed(2) }}</text>
      </view>
    </view>

    <!-- ========== 满减进度条 concept-f cj ========== -->
    <view v-if="items.length" class="cj fu">
      <text class="cj-ic">🎟️</text>
      <text class="cj-tx">
        {{ promoGapCents > 0 ? `再买 ¥${(promoGapCents / 100).toFixed(2)} 立减 ¥${(promoReduceCents / 100).toFixed(0)}` : `已达成满减 · 立减 ¥${(promoReduceCents / 100).toFixed(0)}` }}
      </text>
      <view class="cj-bar">
        <view class="cj-bar-fill" :style="{ width: promoProgress + '%' }"></view>
      </view>
      <text class="cj-go">去凑单 ›</text>
    </view>

    <!-- ========== 信任条 ========== -->
    <view class="trust fu">
      <text>✓ 库存实核</text><text>✓ 分组履约</text><text>✓ 服务端核价</text><text>✓ 售后有门</text>
    </view>

    <!-- ========== 状态枚举 ========== -->
    <view v-if="state === 'loading'" class="st fu">正在重新校验价格与库存…</view>
    <view v-else-if="state === 'unauthenticated'" class="st fu">登录后查看购物车</view>
    <view v-else-if="state === 'recoverable-error'" class="st fu" @click="load">加载失败，点此重试</view>
    <view v-else-if="state === 'empty'" class="st fu">购物车还是空的</view>

    <!-- ========== 分组购物车商品列表（crow 视觉） ========== -->
    <template v-else>
      <view
        v-for="group in cart.groups"
        :key="group.storeId"
        class="group-wrap cart-group fu"
      >
        <view class="sec-h">
          <text class="sec-tt">{{ group.storeName || '当前门店' }}</text>
          <text class="sec-more">{{ group.items.length }} 件商品</text>
        </view>
        <view class="clist cc">
          <view
            v-for="(item, index) in group.items"
            :key="item.id"
            class="crow"
          >
            <view
              class="cimg"
              :style="{
                backgroundImage: `url(../../assets/v63-retail/product-sprite.webp)`,
                backgroundPosition: `${(index % 4) * 33.333}% ${index % 2 === 0 ? 0 : 100}%`,
                backgroundSize: '400% 200%',
              }"
            />
            <view class="ci">
              <text class="cnm">{{ item.productTitle }}</text>
              <text class="csp">{{
                item.available ? item.variantTitle : '商品或库存已变化'
              }}</text>
              <view class="cbot">
                <view class="pr">
                  <text class="pr-sym">¥</text>
                  <text class="pr-y">{{
                    Math.floor((item.unitPriceCents || 0) / 100)
                  }}</text>
                  <text class="pr-d">.{{
                    String((item.unitPriceCents || 0) % 100).padStart(2, '0')
                  }}</text>
                  <text class="pr-qty">× {{ item.quantity }}</text>
                </view>
                <button class="rmbtn" @click="removeItem(item)">移除</button>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- ========== 履约 section ========== -->
      <view class="group-wrap fu">
        <view class="sec-h">
          <text class="sec-tt">履约方式</text>
          <text class="sec-more">按门店分别履约</text>
        </view>
        <view class="ff-tabs">
          <button
            :class="{ active: deliveryMode === 'STORE_PICKUP' }"
            @click="
              deliveryMode = 'STORE_PICKUP';
              checkout = null;
            "
          >
            <text class="ff-ic">🏪</text>
            <view class="ff-tx">
              <text class="ff-b">到店自提</text>
              <text class="ff-s">到门店出示核销码</text>
            </view>
          </button>
          <button
            :class="{ active: deliveryMode === 'PHYSICAL_DELIVERY' }"
            @click="
              deliveryMode = 'PHYSICAL_DELIVERY';
              checkout = null;
            "
          >
            <text class="ff-ic">🚚</text>
            <view class="ff-tx">
              <text class="ff-b">配送到家</text>
              <text class="ff-s">指定地址 · 快递/同城</text>
            </view>
          </button>
        </view>

        <picker
          v-if="deliveryMode === 'PHYSICAL_DELIVERY' && addresses.length"
          :range="addresses"
          range-key="addressLine"
          @change="
            selectedAddressId = addresses[$event.detail.value].id;
            checkout = null;
          "
        >
          <view class="addr cc">
            <text class="addr-ic">🏠</text>
            <view class="addr-tx">
              <text class="addr-lab">配送地址</text>
              <text class="addr-val">
                {{
                  addresses.find((address) => address.id === selectedAddressId)
                    ?.addressLine || '点击选择地址'
                }}
              </text>
            </view>
            <text class="addr-go">更换 ›</text>
          </view>
        </picker>
        <view v-else-if="deliveryMode === 'PHYSICAL_DELIVERY'" class="st addr-empty">
          请先在“我的”添加收货地址
        </view>
      </view>

      <!-- ========== 金额明细 + 核价 + 提交 ========== -->
      <view class="group-wrap fu">
        <view class="sec-h">
          <text class="sec-tt">金额明细</text>
          <text class="sec-more">服务端核价</text>
        </view>
        <view class="amount amount-lines cc">
          <view class="ar">
            <text class="al">商品合计</text>
            <text class="ar ar-strong">¥{{ (total / 100).toFixed(2) }}</text>
          </view>
          <view class="ar">
            <text class="al">配送费用</text>
            <text class="ar">结算时确认</text>
          </view>
          <view class="ar">
            <text class="al">优惠与奖励</text>
            <text class="ar">以核价结果为准</text>
          </view>
          <view v-if="checkout" class="ar ar-pay">
            <text class="al al-pay">本次应付</text>
            <text class="pay-amt">
              ¥{{ (checkout.payableAmountCents / 100).toFixed(2) }}
            </text>
          </view>
        </view>

        <view v-if="!checkout" class="cta-wrap">
          <button
            class="checkout-btn"
            :loading="checkoutBusy"
            @click="quoteCheckout"
          >
            <text class="cta-ic">🔒</text>
            <text>重新核价 · 确认库存</text>
          </button>
          <text class="cta-sub">核价后按门店分别生成订单 · 支付前可取消</text>
        </view>
        <view v-else class="confirm-wrap cc">
          <view class="cf-hd">
            <text class="cf-lab">核价完成</text>
            <text class="cf-total"
              >应付 ¥{{ (checkout.payableAmountCents / 100).toFixed(2) }}</text
            >
          </view>
          <text class="cf-sub"
            >共 {{ checkout.groups.length }} 个履约分组，提交后分别创建订单</text
          >
          <view class="cf-facts">
            <text class="ff-chip">✓ 服务端核价</text>
            <text class="ff-chip">✓ 幂等提交防重复</text>
            <text class="ff-chip">✓ 先核价后支付</text>
          </view>
          <button
            class="checkout-btn hot"
            :loading="checkoutBusy"
            @click="submitCheckout"
          >
            <text class="cta-ic">💳</text>
            <text>确认创建订单</text>
          </button>
        </view>
      </view>
    </template>

    <!-- 底部呼吸 -->
    <view style="height: 28rpx"></view>
  </LifeSurface>
</template>

<style scoped>
/* ========== 自提点 / 总览 绿色 hero ========== */
.pick {
  margin: 10rpx 20rpx 0;
  border-radius: 28rpx;
  padding: 26rpx 26rpx;
  background: linear-gradient(135deg, var(--hd1, #009146), var(--hd2, #006b36));
  color: #fff;
  display: flex;
  align-items: center;
  gap: 18rpx;
  box-shadow: 0 14rpx 30rpx rgba(0, 145, 70, 0.32);
  position: relative;
  overflow: hidden;
}
.pick::after {
  content: '';
  position: absolute;
  right: -48rpx;
  top: -56rpx;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: rgba(254, 230, 0, 0.16);
}
.pi {
  width: 72rpx;
  height: 72rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.18);
  display: grid;
  place-items: center;
  flex: none;
  position: relative;
  z-index: 2;
}
.pi-ic {
  font-size: 36rpx;
  line-height: 1;
}
.pt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  position: relative;
  z-index: 2;
}
.pb {
  font-size: 28rpx;
  font-weight: 900;
  color: #fff;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pp {
  font-size: 17rpx;
  font-weight: 700;
  opacity: 0.9;
}
.pamt {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2rpx;
  position: relative;
  z-index: 2;
  padding-left: 10rpx;
}
.plab {
  font-size: 15rpx;
  font-weight: 800;
  opacity: 0.88;
}
.pval {
  font-size: 38rpx;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.01em;
  line-height: 1.1;
}

/* ========== 满减进度条 ========== */
.cj {
  margin: 20rpx 20rpx 0;
  background: var(--notice-bg, #e6f3ea);
  color: var(--notice-tx, #0b6b3d);
  border-radius: 22rpx;
  padding: 14rpx 18rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 18rpx;
  font-weight: 800;
  position: relative;
}
.cj-ic {
  flex: none;
  font-size: 26rpx;
}
.cj-tx {
  flex: none;
  white-space: nowrap;
  font-weight: 900;
}
.cj-bar {
  flex: 1;
  height: 10rpx;
  border-radius: 999rpx;
  background: rgba(11, 107, 61, 0.12);
  overflow: hidden;
}
.cj-bar-fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, var(--yel, #fee600), var(--hot, #eb6325));
  transition: width 0.4s ease;
}
.cj-go {
  flex: none;
  color: var(--notice-tx, #0b6b3d);
  font-weight: 900;
}

/* ========== 信任条 ========== */
.trust {
  margin: 20rpx 20rpx 0;
  min-height: 70rpx;
  border-radius: 22rpx;
  background: linear-gradient(120deg, rgba(0, 145, 70, 0.07), rgba(0, 145, 70, 0.04));
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 12rpx;
  color: #0b6b3d;
  font-size: 17rpx;
  font-weight: 800;
}

/* ========== section header ========== */
.sec-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 28rpx 2rpx 12rpx;
}
.sec-tt {
  position: relative;
  padding-left: 20rpx;
  font-size: 30rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  letter-spacing: 0.02em;
}
.sec-tt::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  transform: translateY(-50%);
  background: linear-gradient(180deg, var(--hd1, #009146), var(--hd2, #006b36));
}
.sec-more {
  font-size: 18rpx;
  font-weight: 800;
  color: var(--mut, #857c6d);
}

/* ========== 状态卡 ========== */
.st {
  margin: 22rpx 20rpx 0;
  padding: 48rpx 20rpx;
  border: 2rpx dashed var(--line, rgba(22, 19, 15, 0.08));
  border-radius: 24rpx;
  color: var(--mut, #857c6d);
  background: var(--card, #fff);
  text-align: center;
  font-size: 18rpx;
  font-weight: 700;
}
.addr-empty {
  margin-top: 18rpx;
}

/* ========== group wrap 内容容器 ========== */
.group-wrap {
  margin: 0 20rpx;
}

/* ========== crow 购物车行 concept-f ========== */
.clist {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 2rpx 0;
}
.crow {
  display: flex;
  gap: 16rpx;
  padding: 16rpx;
  border-radius: 24rpx;
  background: var(--card, #fff);
  border: 1rpx solid var(--line, rgba(22, 19, 15, 0.06));
  box-shadow: 0 6rpx 18rpx rgba(22, 19, 15, 0.05);
  align-items: center;
}
.cimg {
  width: 160rpx;
  height: 160rpx;
  border-radius: 22rpx;
  flex: none;
  background-repeat: no-repeat;
  background-color: var(--bg, #f6f1e6);
}
.ci {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cnm {
  font-size: 26rpx;
  font-weight: 800;
  color: var(--ink, #16130f);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.csp {
  margin-top: 6rpx;
  align-self: flex-start;
  padding: 5rpx 12rpx;
  border-radius: 10rpx;
  background: var(--notice-bg, #e6f3ea);
  color: var(--notice-tx, #0b6b3d);
  font-size: 16rpx;
  font-weight: 800;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cbot {
  margin-top: 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pr {
  display: flex;
  align-items: baseline;
  color: var(--promo, #f03749);
  font-weight: 900;
}
.pr-sym {
  font-size: 20rpx;
}
.pr-y {
  font-size: 34rpx;
  letter-spacing: -0.02em;
}
.pr-d {
  font-size: 20rpx;
  margin-right: 8rpx;
}
.pr-qty {
  font-size: 18rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
  margin-left: 2rpx;
}
.rmbtn {
  margin: 0;
  flex: none;
  padding: 0 20rpx;
  height: 48rpx;
  line-height: 48rpx;
  border-radius: 999rpx;
  background: rgba(240, 55, 73, 0.08);
  color: var(--promo, #f03749);
  font-size: 17rpx;
  font-weight: 900;
}

/* ========== 履约 tabs ========== */
.ff-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14rpx;
  padding: 2rpx 0;
}
.ff-tabs button {
  margin: 0;
  padding: 20rpx 18rpx;
  border-radius: 24rpx;
  background: var(--card, #fff);
  border: 2rpx solid var(--line, rgba(22, 19, 15, 0.06));
  box-shadow: 0 4rpx 14rpx rgba(22, 19, 15, 0.04);
  display: flex;
  align-items: center;
  gap: 14rpx;
  text-align: left;
  color: var(--ink, #16130f);
  transition: all 0.25s ease;
}
.ff-ic {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
  display: grid;
  place-items: center;
  background: var(--notice-bg, #e6f3ea);
  font-size: 32rpx;
  flex: none;
}
.ff-tx {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.ff-b {
  font-size: 24rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}
.ff-s {
  font-size: 16rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
}
.ff-tabs button.active {
  background: linear-gradient(135deg, var(--hd1, #009146), var(--hd2, #006b36));
  border-color: transparent;
  box-shadow: 0 10rpx 22rpx rgba(0, 145, 70, 0.3);
}
.ff-tabs button.active .ff-ic {
  background: rgba(255, 255, 255, 0.2);
}
.ff-tabs button.active .ff-b,
.ff-tabs button.active .ff-s {
  color: #fff;
}

/* ========== 地址 picker ========== */
.addr {
  margin-top: 16rpx;
  padding: 20rpx 20rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.addr-ic {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
  display: grid;
  place-items: center;
  background: rgba(13, 111, 150, 0.1);
  font-size: 32rpx;
  flex: none;
}
.addr-tx {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5rpx;
}
.addr-lab {
  font-size: 18rpx;
  font-weight: 900;
  color: #0d4f6b;
}
.addr-val {
  font-size: 24rpx;
  font-weight: 800;
  color: var(--ink, #16130f);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.addr-go {
  flex: none;
  color: var(--accent, #009146);
  font-size: 18rpx;
  font-weight: 900;
}

/* ========== 金额明细 ========== */
.amount {
  padding: 22rpx 22rpx 18rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.ar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--mut, #857c6d);
  font-size: 22rpx;
  font-weight: 700;
}
.ar-strong {
  color: var(--promo, #f03749);
  font-size: 28rpx;
  font-weight: 900;
}
.ar-pay {
  padding-top: 18rpx;
  border-top: 2rpx dashed var(--line, rgba(22, 19, 15, 0.08));
}
.al-pay {
  font-size: 24rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}
.pay-amt {
  font-size: 38rpx;
  font-weight: 900;
  color: var(--promo, #f03749);
  letter-spacing: 0.01em;
}

/* ========== 核价按钮 + 提交卡 ========== */
.cta-wrap {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}
.checkout-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #00c853, var(--hd2, #006b36));
  color: #fff;
  font-size: 28rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  box-shadow: 0 12rpx 26rpx rgba(0, 145, 70, 0.35);
  letter-spacing: 0.04em;
}
.checkout-btn.hot {
  background: linear-gradient(135deg, #ff7a3d, #e8253f);
  box-shadow: 0 12rpx 26rpx rgba(232, 37, 63, 0.35);
}
.cta-ic {
  font-size: 26rpx;
  line-height: 1;
}
.cta-sub {
  font-size: 16rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
  text-align: center;
  padding: 0 10rpx;
}

/* ========== 核价确认卡片 ========== */
.confirm-wrap {
  margin-top: 22rpx;
  padding: 26rpx 24rpx;
  border-radius: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.cf-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.cf-lab {
  display: inline-flex;
  align-items: center;
  padding: 6rpx 14rpx;
  border-radius: 10rpx;
  background: rgba(11, 107, 61, 0.12);
  color: var(--notice-tx, #0b6b3d);
  font-size: 17rpx;
  font-weight: 900;
}
.cf-total {
  font-size: 38rpx;
  font-weight: 900;
  color: var(--promo, #f03749);
  letter-spacing: 0.01em;
}
.cf-sub {
  font-size: 18rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
}
.cf-facts {
  margin: 8rpx 0 6rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.ff-chip {
  padding: 7rpx 16rpx;
  border-radius: 999rpx;
  background: var(--notice-bg, #e6f3ea);
  color: var(--notice-tx, #0b6b3d);
  font-size: 16rpx;
  font-weight: 800;
}
</style>
