<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
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

/* ===== kimi 真理日夜 tswitch（.phone[data-theme=dark] 驱动） ===== */
const isDark = ref(false);
function toggleTheme(){ isDark.value = !isDark.value; }
</script>

<template>
  <view
    class="phone"
    :class="{ 'no-tr': false }"
    :data-theme="isDark ? 'dark' : ''"
    style="--hd1:#009146;--hd2:#006b36;--bg:#f6f1e6"
  >
    <svg width="0" height="0" style="position:absolute"><defs>
      <g id="x-bell"><path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.6 5.4 2.2 6H3.8C4.4 14.9 6 13.5 6 9.5z"/><path d="M10 19a2.2 2.2 0 0 0 4 0z"/></g>
      <g id="x-set"><circle cx="12" cy="12" r="3.2" fill="none" stroke-width="2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" fill="none" stroke-width="2" stroke-linecap="round"/></g>
      <g id="x-cs"><path d="M4.5 12a7.5 7.5 0 0 1 15 0v5.2a2.3 2.3 0 0 1-2.3 2.3H13" fill="none" stroke-width="2.1" stroke-linecap="round"/><rect x="3.2" y="10.5" width="3.6" height="6" rx="1.8"/><rect x="17.2" y="10.5" width="3.6" height="6" rx="1.8"/></g>
      <g id="x-crown"><path d="M4 17.5 3 7.8l5.4 3.4L12 5.5l3.6 5.7L21 7.8l-1 9.7z"/></g>
      <g id="x-bill"><path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>
      <g id="x-chat2"><path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v6.8a2.5 2.5 0 0 1-2.5 2.5h-7.8l-4.5 3.6a.6.6 0 0 1-1-.5V6.5A2.5 2.5 0 0 1 6.5 4z"/><circle cx="9.2" cy="10" r="1.3" fill="#fff"/><circle cx="13.4" cy="10" r="1.3" fill="#fff"/><circle cx="17" cy="10" r="1.3" fill="#fff" opacity=".6"/></g>
      <g id="x-moon"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/></g>
      <g id="x-sun"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4" stroke-width="2" stroke-linecap="round"/></g>
      <g id="x-shield"><path d="M12 2.8 19 5.5v6c0 4.6-3 7.7-7 9.7-4-2-7-5.1-7-9.7v-6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>
      <g id="x-mega"><path d="M4 6.5 12 13l8-6.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17z"/><path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6.5"/></g>
      <g id="x-flash"><path d="M13 3 5 15h6l-1 6 8-12h-6z"/></g>
      <g id="x-grid4"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></g>
      <g id="x-plus"><path d="M12 5v14M5 12h14" stroke-width="2.4" stroke-linecap="round"/></g>
      <g id="x-search"><circle cx="11" cy="11" r="6.5" fill="none" stroke-width="2.2"/><path d="m16 16 4.5 4.5" stroke-width="2.6" stroke-linecap="round"/></g>
      <g id="x-arrow"><path d="m6 12 12 0M12 6l6 6-6 6" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>
      <g id="x-pin"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></g>
      <g id="f-home"><path d="M12 4 4 10.6V20a1 1 0 0 0 1 1h4.6v-5.6h4.8V21H19a1 1 0 0 0 1-1v-9.4z"/></g>
      <g id="f-shop"><path d="M4.6 8.6 6 4h12l1.4 4.6zM4 9.8h16V20a1 1 0 0 1-1 1h-5v-5.4h-4V21H5a1 1 0 0 1-1-1z"/><path d="M4 9.8h16v1a2.6 2.6 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.6 2.6 0 0 1-5.3 0z" opacity=".72"/></g>
      <g id="f-chat"><path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v6.8a2.5 2.5 0 0 1-2.5 2.5h-7.8l-4.5 3.6a.6.6 0 0 1-1-.5V6.5A2.5 2.5 0 0 1 6.5 4z"/><circle cx="9.2" cy="10" r="1.3" fill="#fff"/><circle cx="13.4" cy="10" r="1.3" fill="#fff"/><circle cx="17" cy="10" r="1.3" fill="#fff" opacity=".6"/></g>
      <g id="f-cart"><path d="M3.6 4.4h2.3l.7 3.2H21l-1.7 7.2a1.6 1.6 0 0 1-1.6 1.3H8.7a1.6 1.6 0 0 1-1.6-1.3L5.4 6.6l-.4-1.4H3.6z"/><circle cx="9.3" cy="19.6" r="1.7"/><circle cx="16.8" cy="19.6" r="1.7"/></g>
      <g id="f-me"><circle cx="12" cy="8.2" r="4"/><path d="M4.4 20.4c1-4.2 3.9-6.4 7.6-6.4s6.6 2.2 7.6 6.4a1 1 0 0 1-1 1.2H5.4a1 1 0 0 1-1-1.2z"/></g>
      <g id="f-leaf"><path d="M5 20c1-6 4-13 14-15-1 8-6 13-12 15l-2 0z"/><path d="M6 19c3-4 7-7 12-9" fill="none" stroke-width="1.8" stroke-linecap="round"/></g>
      <g id="f-egg"><ellipse cx="12" cy="14" rx="6" ry="7"/><path d="M12 7c-1.5-2.2-3.5-3.6-5-3.5" fill="none" stroke-width="1.6" stroke-linecap="round"/></g>
      <g id="cap-more"><circle cx="4.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19.5" cy="12" r="1.7"/></g>
      <g id="cap-target"><circle cx="12" cy="12" r="6.4" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.4"/></g>
</defs></svg>

<view class="scroll">
    <view class="top">
      <view class="statusbar"><text>9:41</text>
        <text style="display:flex;gap:5px;align-items:center">
          <svg width="16" height="11" viewBox="0 0 17 12" fill="#fff"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
          <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="#fff"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="#fff"/><path d="M23 4v4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
        </text>
      </view>
      <view class="navrow"><view class="ptitle">购物车</view>
        <view class="capsule">
          <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)" style="transition:.5s"><use href="#cap-more"/></svg></view>
          <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)" style="transition:.5s"><use href="#cap-target"/></svg></view>
        </view></view>
    </view>

    <view class="pick fu">
      <view class="pi"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><use href="#x-pin"/></svg></view>
      <view class="pt"><text style="font-weight:900;display:inline-block">幸福里 3 号楼自提点</text><text style="display:block">今日 16:00 后可取 · 距您 120 米</text></view>
      <navigator url="/pages/page-254/index" open-type="navigate" >更换</navigator>
    </view>
    <view class="cj fu">高温关怀券<view class="bar"><view style="display:inline-block;font-style:normal"></view></view>再买 ¥12.2 立减 8 元</view>
    <view class="clist">
        <view class="crow fu" data-p="19.9"><image src="/static/v63-img/p-prawn.jpg" alt="" mode="aspectFill"/>
          <view class="ci"><navigator url="/pages/page-209/index?t=goods&id=sk1" open-type="navigate" class="nm"  style="text-decoration:none;color:inherit">鲜活基围虾</navigator><view class="sp">500g · 今日秒杀</view>
            <view class="bot"><view class="pr">¥<text style="font-weight:900;display:inline-block">19</text><text style="vertical-align:super;display:inline-block">.9</text></view>
              <view class="step"><button class="minus">−</button><text class="qty" style="font-weight:900;display:inline-block">1</text><button class="plus">+</button></view></view></view></view>
        <view class="crow fu" data-p="9.9"><image src="/static/v63-img/p-eggs.jpg" alt="" mode="aspectFill"/>
          <view class="ci"><navigator url="/pages/page-209/index?t=goods&id=sk2" open-type="navigate" class="nm"  style="text-decoration:none;color:inherit">散养土鸡蛋</navigator><view class="sp">30 枚 · 可溯源</view>
            <view class="bot"><view class="pr">¥<text style="font-weight:900;display:inline-block">9</text><text style="vertical-align:super;display:inline-block">.9</text></view>
              <view class="step"><button class="minus">−</button><text class="qty" style="font-weight:900;display:inline-block">2</text><button class="plus">+</button></view></view></view></view>
        <view class="crow fu" data-p="6.9"><image src="/static/v63-img/p-tomato.jpg" alt="" mode="aspectFill"/>
          <view class="ci"><navigator url="/pages/page-209/index?t=goods&id=sk3" open-type="navigate" class="nm"  style="text-decoration:none;color:inherit">沙瓤番茄</navigator><view class="sp">3 斤 · 自然熟</view>
            <view class="bot"><view class="pr">¥<text style="font-weight:900;display:inline-block">6</text><text style="vertical-align:super;display:inline-block">.9</text></view>
              <view class="step"><button class="minus">−</button><text class="qty" style="font-weight:900;display:inline-block">1</text><button class="plus">+</button></view></view></view></view>
    </view>
    <view style="height:10px"></view>
  </view>
  <view class="paybar">
    <view class="sum"><text style="display:block">共 <text id="pc">4</text> 件 · 已含优惠</text><view class="t">合计：<text id="pt" style="font-weight:900;display:inline-block">¥46.6</text></view></view>
    <navigator url="/pages/page-218/index" open-type="navigate" class="paybtn"  style="text-decoration:none;display:grid;place-items:center">去结算</navigator>
  </view>
<view class="tabbar">
    <navigator url="/pages/life/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-home"/></svg>首页</navigator>
    <navigator url="/pages/mall/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-shop"/></svg>商城</navigator>
    <navigator url="/pages/community/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-chat"/></svg>生活圈</navigator>
    <navigator url="/pages/cart/index" open-type="switchTab" class="tab on" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-cart"/></svg>购物车<text class="bdg">3</text></navigator>
    <navigator url="/pages/me/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-me"/></svg>我的</navigator>
  </view>
  <navigator url="/pages/page-259/index" open-type="navigate" class="maifab" id="maifab"  aria-label="小满AI"><image src="/static/v63-icons/mai.png" alt="小满" mode="aspectFit"/><text style="font-style:normal">小满</text></navigator>

  </view>
</template>

<style scoped>

  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  /* body rule removed (Vue scoped) */
  /* .cap rules removed */
  /* ============ 主题变量 ============ */
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
  .phone{
    width:375px;height:760px;background:var(--bg);border-radius:44px;position:relative;overflow:hidden;
    display:flex;flex-direction:column;flex:none;color:var(--ink);
    box-shadow:0 30px 80px -20px rgba(0,0,0,.55),0 0 0 10px #141210;
    transition:background .5s;
  }
  .scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none}
  .scroll::-webkit-scrollbar{display:none}
  /* ============ 顶部（搜索 + 胶囊） ============ */
  .top{background:linear-gradient(165deg,var(--hd1),var(--hd2));padding:10px 16px 34px;transition:background .5s;position:relative;overflow:hidden}
  .top::after{content:"";position:absolute;right:-46px;top:-52px;width:150px;height:150px;border-radius:50%;background:rgba(254,230,0,.14)}
  .statusbar{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:#fff;padding:4px 10px 0;position:relative;z-index:2}
  .navrow{display:flex;align-items:center;gap:8px;margin-top:10px;position:relative;z-index:2}
  .loc{display:flex;align-items:center;gap:3px;color:#fff;font-size:12.5px;font-weight:800;flex-shrink:0;max-width:104px;background:rgba(255,255,255,.16);border-radius:999px;padding:7px 9px}
  .loc b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800}
  .loc svg{flex-shrink:0}
  .search{
    flex:1;height:34px;background:rgba(255,255,255,.95);border-radius:17px;
    display:flex;align-items:center;gap:7px;padding:0 13px;font-size:12.5px;color:#9a938a;
  }
  [data-theme="dark"] .search{background:rgba(255,255,255,.14);backdrop-filter:blur(8px);color:rgba(255,255,255,.75)}
  .capsule{
    width:87px;height:32px;flex:none;border-radius:16px;background:var(--capsule-bg);
    display:flex;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.14);transition:background .5s;
  }
  [data-theme="dark"] .capsule{backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.25);box-shadow:none}
  .capsule .cell{flex:1;display:grid;place-items:center;height:100%}
  .capsule .cell:first-child{border-right:1px solid var(--capsule-line)}
  /* ============ 主图（日夜双图切换） ============ */
  .hero{margin:-22px 14px 0;border-radius:18px;overflow:hidden;position:relative;z-index:3;box-shadow:var(--shadow);height:136px}
  .hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .6s}
  .hero .img-d{opacity:0}
  [data-theme="dark"] .hero .img-d{opacity:1}
  [data-theme="dark"] .hero .img-l{opacity:0}
  .hero .ov{position:absolute;inset:0;background:linear-gradient(100deg,rgba(22,19,15,.6) 6%,transparent 60%)}
  .hero .tx{position:absolute;left:15px;top:13px;color:#fff}
  .hero .tx .k{display:inline-block;background:var(--yel);color:#16130f;font-size:10px;font-weight:900;padding:3px 7px;border-radius:6px;letter-spacing:.06em}
  .hero .tx h2{font-size:19.5px;font-weight:900;margin-top:6px;line-height:1.3;text-shadow:0 2px 10px rgba(0,0,0,.4)}
  .hero .tx p{font-size:11px;font-weight:700;opacity:.92;margin-top:3px}
  /* 主题切换开关 */
  .tswitch{
    position:absolute;right:12px;bottom:12px;z-index:4;border:none;cursor:pointer;font-family:inherit;
    display:flex;align-items:center;gap:6px;border-radius:999px;padding:8px 13px;
    background:rgba(22,19,15,.55);backdrop-filter:blur(8px);color:#fff;font-size:11.5px;font-weight:800;
    border:1px solid rgba(255,255,255,.25);
  }
  /* ============ 公告（轻盈版） ============ */
  .notice{
    margin:12px 14px 0;height:38px;border-radius:12px;background:var(--notice-bg);
    display:flex;align-items:center;gap:8px;padding:0 13px;overflow:hidden;transition:background .5s;
  }
  .notice .lb{flex:none;display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:900;color:var(--notice-tx)}
  .notice .roll{flex:1;min-width:0;overflow:hidden;white-space:nowrap;font-size:12px;font-weight:600;color:var(--notice-tx)}
  .notice .roll-in{display:inline-block;animation:roll 22s linear infinite;will-change:transform}
  @keyframes roll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  /* ============ 秒杀（减重版） ============ */
  .sk{margin:12px 14px 0;background:var(--card);border-radius:18px;padding:13px 13px 12px;box-shadow:var(--shadow);transition:background .5s}
  .sk-hd{display:flex;align-items:center;justify-content:space-between}
  .sk-hd h3{font-size:16.5px;font-weight:900;color:var(--ink);display:flex;align-items:center;gap:6px}
  .sk-hd h3 svg{color:var(--promo)}
  .sk-hd h3 em{font-style:normal;font-size:10px;font-weight:900;color:#fff;background:var(--promo);border-radius:5px;padding:2px 6px;letter-spacing:.06em}
  .cnt{display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--mut)}
  .cnt b{background:var(--cnt-bg);color:var(--cnt-tx);border-radius:5px;padding:3px 6px;font-size:11.5px;font-weight:900}
  .sk-rail{display:flex;gap:10px;margin-top:11px;overflow-x:auto;scrollbar-width:none}
  .sk-rail::-webkit-scrollbar{display:none}
  .sk-card{flex:none;width:112px;border-radius:13px;overflow:hidden;border:1px solid var(--line);background:var(--card)}
  .sk-card img{width:100%;height:80px;object-fit:cover;display:block}
  .sk-bd{padding:7px 9px 9px}
  .sk-nm{font-size:11.5px;font-weight:800;line-height:1.35;height:30px;overflow:hidden;color:var(--ink)}
  .sk-pr{margin-top:4px;display:flex;align-items:baseline;gap:5px}
  .sk-pr b{color:var(--promo);font-size:16px;font-weight:900}
  .sk-pr s{font-size:10px;color:var(--mut)}
  .sk-bar{height:12px;border-radius:6px;background:color-mix(in srgb,var(--promo) 12%,transparent);margin-top:6px;position:relative;overflow:hidden}
  .sk-bar i{position:absolute;inset:0;right:auto;background:linear-gradient(90deg,var(--hot),var(--promo));border-radius:6px}
  .sk-bar span{position:absolute;inset:0;text-align:center;font-size:8.5px;font-weight:900;color:#fff;line-height:12px;text-shadow:0 1px 2px rgba(0,0,0,.3)}
  /* ============ 分类 ============ */
  .cats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 8px;padding:16px 14px 2px}
  .cat{display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:transform .15s}
  .cat:active{transform:scale(.92)}
  .badge{width:56px;height:56px;border-radius:19px;overflow:hidden;box-shadow:var(--shadow)}
  .badge img{width:100%;height:100%;object-fit:cover;display:block}
  .badge.duo{display:grid;place-items:center}
  .cat span{font-size:11.5px;font-weight:800;color:var(--ink)}
  /* ============ 分区货架 ============ */
  .aisle{margin:16px 14px 0}
  .aisle-hd{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 11px}
  .aisle-hd h3{font-size:17px;font-weight:900;display:flex;align-items:center;gap:8px;color:var(--ink)}
  .aisle-hd h3 .chip-ic{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;color:#fff}
  .aisle-hd a{font-size:11.5px;font-weight:800;text-decoration:none}
  .aisle-hd a.c-grn{color:#009146}
  .aisle-hd a.c-blu{color:#1a6fc4}
  .phone[data-theme="dark"] .aisle-hd a.c-grn{color:#6ec726}
  .phone[data-theme="dark"] .aisle-hd a.c-blu{color:#5ea8f0}
  .aisle-bd{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .pd{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);transition:background .5s}
  .pd img{width:100%;height:100px;object-fit:cover;display:block}
  .pd-bd{padding:8px 10px 10px}
  .pd-nm{font-size:13px;font-weight:800;line-height:1.4;color:var(--ink)}
  .pd-tg{display:inline-block;font-size:9.5px;font-weight:800;border-radius:5px;padding:2px 6px;margin-top:4px}
  .pd-row{display:flex;align-items:flex-end;justify-content:space-between;margin-top:6px}
  .pr{color:var(--promo);font-weight:900;font-size:11px}
  .pr b{font-size:20px;letter-spacing:-.02em}
  .pr sup{font-size:10.5px;font-weight:900}
  .pr s{color:var(--mut);font-size:10px;font-weight:600;margin-left:4px}
  .pbtn{width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;display:grid;place-items:center;background:linear-gradient(145deg,#19b26b,var(--green,#009146));background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 70%,#3dff8f),var(--accent));box-shadow:0 6px 13px color-mix(in srgb,var(--accent) 40%,transparent),inset 0 1.5px 0 rgba(255,255,255,.35);transition:transform .12s}
  .pbtn:active{transform:scale(.86)}
  /* ============ 团购 ============ */
  .tg{margin:14px 14px 0;background:var(--card);border-radius:18px;padding:14px;box-shadow:var(--shadow);transition:background .5s}
  .tg-hd{display:flex;justify-content:space-between;align-items:center}
  .tg-hd h3{font-size:16.5px;font-weight:900;color:var(--ink)}
  .tg-hd em{font-style:normal;background:linear-gradient(135deg,#ff8a3d,var(--hot,#eb6325));color:#fff;font-size:10.5px;font-weight:900;border-radius:7px;padding:4px 9px}
  .tg-it{display:flex;gap:12px;margin-top:11px;align-items:center}
  .tg-it img{width:66px;height:66px;border-radius:13px;object-fit:cover}
  .tg-it .t{flex:1}
  .tg-it .t b{font-size:14px;font-weight:800;color:var(--ink)}
  .tg-it .t p{font-size:11px;color:var(--mut);font-weight:600;margin-top:3px}
  .tg-go{border:none;border-radius:999px;font-size:12.5px;font-weight:900;padding:11px 16px;font-family:inherit;cursor:pointer;white-space:nowrap;color:#fff;display:flex;align-items:center;gap:5px;background:linear-gradient(135deg,#ff5d3a,var(--promo));box-shadow:0 7px 15px color-mix(in srgb,var(--promo) 40%,transparent),inset 0 1.5px 0 rgba(255,255,255,.3)}
  .tg-bar{height:9px;border-radius:5px;background:var(--line);margin-top:11px;overflow:hidden}
  .tg-bar i{display:block;height:100%;width:74%;background:linear-gradient(90deg,var(--yel),var(--hot));border-radius:5px}
  .tg-ft{font-size:11px;font-weight:700;color:var(--mut);margin-top:7px}
  .tg-ft b{color:var(--accent)}
  .foot-note{text-align:center;font-size:10.5px;letter-spacing:.24em;font-weight:800;color:var(--mut);padding:20px 0 14px;opacity:.7}
  /* ============ Tabbar ============ */
  /* ============ 瀑布流推荐 ============ */
  .wf{margin:20px 14px 0}
  .wf-hd{display:flex;align-items:center;justify-content:center;gap:10px;padding:0 0 13px;color:var(--ink)}
  .wf-hd::before,.wf-hd::after{content:"";width:30px;height:1px;background:var(--mut);opacity:.45}
  .wf-hd h3{font-size:16px;font-weight:900;display:flex;align-items:center;gap:6px}
  .wf-hd h3 svg{color:var(--hot)}
  .wf-bd{display:flex;gap:10px;align-items:flex-start}
  .wf-col{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0}
  .wf-it{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);transition:background .5s;animation:wfIn .45s ease both}
  @keyframes wfIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .wf-it img{width:100%;object-fit:cover;display:block}
  .wf-it .pd-bd{padding:8px 10px 10px}
  .wf-load{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 0 4px;font-size:11.5px;font-weight:700;color:var(--mut)}
  .wf-load i{width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .wf-end{text-align:center;padding:16px 0 4px;font-size:11.5px;font-weight:700;color:var(--mut)}
  .tabbar{flex:none;height:72px;background:var(--tabbar);border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(5,1fr);padding:7px 4px 15px;transition:background .5s}
  .tab{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;font-weight:700;color:var(--mut);padding-top:5px;position:relative}
  .tab.on{color:var(--accent)}
  [data-theme="dark"] .tab.on svg{filter:drop-shadow(0 0 9px rgba(110,199,38,.9))}
  .tab .bdg{position:absolute;top:2px;right:calc(50% - 20px);min-width:16px;height:16px;border-radius:8px;background:var(--promo);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px;border:1.5px solid var(--tabbar)}
  .fu{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
  .fu.in{opacity:1;transform:none}
  /* responsive media removed */

  a.tab{text-decoration:none}
  .ptitle{color:#fff;font-size:19px;font-weight:900;letter-spacing:.02em;flex:1}
  .pick{margin:12px 14px 0;background:linear-gradient(135deg,var(--hd1),var(--hd2));border-radius:16px;padding:13px 14px;color:#fff;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow)}
  .pick .pi{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.18);display:grid;place-items:center;flex:none}
  .pick .pt{flex:1;min-width:0}
  .pick .pt b{font-size:13.5px;font-weight:900;display:block}
  .pick .pt p{font-size:10.5px;font-weight:700;opacity:.85;margin-top:2px}
  .pick a{flex:none;color:#fff;font-size:11px;font-weight:800;text-decoration:none;background:rgba(255,255,255,.18);border-radius:999px;padding:7px 11px}
  .cj{margin:11px 14px 0;background:var(--notice-bg);color:var(--notice-tx);border-radius:12px;padding:10px 13px;font-size:11.5px;font-weight:800;display:flex;align-items:center;gap:8px;transition:background .5s}
  .cj .bar{flex:1;height:5px;border-radius:3px;background:rgba(0,0,0,.08);overflow:hidden}
  .cj .bar i{display:block;height:100%;width:70%;border-radius:3px;background:currentColor}
  .clist{margin:12px 14px 0;display:flex;flex-direction:column;gap:10px}
  .crow{display:flex;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:11px;box-shadow:var(--shadow);align-items:center;transition:background .5s}
  .crow img{width:72px;height:72px;border-radius:12px;object-fit:cover;flex:none}
  .crow .ci{flex:1;min-width:0}
  .crow .ci .nm{font-size:13.5px;font-weight:800;color:var(--ink)}
  .crow .ci .sp{font-size:10.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .crow .ci .bot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
  .step{display:flex;align-items:center;gap:2px;background:var(--bg);border-radius:999px;padding:3px}
  .step button{width:24px;height:24px;border:none;border-radius:50%;background:var(--card);color:var(--ink);font-size:14px;font-weight:900;display:grid;place-items:center;cursor:pointer;box-shadow:var(--shadow)}
  .step b{min-width:26px;text-align:center;font-size:13px;font-weight:900;color:var(--ink)}
  .paybar{flex:none;display:flex;align-items:center;gap:11px;background:var(--tabbar);border-top:1px solid var(--line);padding:10px 14px 8px;transition:background .5s}
  .paybar .sum{flex:1;min-width:0}
  .paybar .sum p{font-size:10px;font-weight:700;color:var(--mut)}
  .paybar .sum .t{font-size:12px;font-weight:900;color:var(--ink)}
  .paybar .sum .t b{color:var(--promo);font-size:21px}
  .paybtn{border:none;border-radius:999px;background:linear-gradient(135deg,#f7563c,#e8253f);color:#fff;font-size:14px;font-weight:900;padding:12px 26px;cursor:pointer;box-shadow:0 6px 16px rgba(232,37,63,.35)}
.phone.no-tr,.phone.no-tr *{transition:none!important}
  /* ===== 小满 AI 入口 ===== */
  .maifab{position:absolute;right:12px;bottom:92px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.96);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;text-decoration:none;box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10);animation:maipulse 2.8s ease-in-out infinite}
  .maifab img{width:31px;height:31px}
  .maifab em{font-style:normal;font-size:8.5px;font-weight:900;color:#16130f;margin-top:1px}
  .phone[data-theme="dark"] .maifab{background:rgba(20,26,24,.94)}
  .phone[data-theme="dark"] .maifab em{color:#f6f2e5}
  @keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.12)}50%{box-shadow:0 8px 22px rgba(22,19,15,.18),0 0 0 9px rgba(0,200,130,.04)}}
  .maitoast{position:absolute;left:50%;bottom:158px;transform:translateX(-50%) translateY(14px);background:rgba(22,19,15,.92);color:#fff;font-size:11.5px;font-weight:700;border-radius:12px;padding:10px 15px;max-width:290px;text-align:center;line-height:1.6;opacity:0;pointer-events:none;transition:.3s;z-index:40}
  .maitoast.show{opacity:1;transform:translateX(-50%) translateY(0)}

</style>

