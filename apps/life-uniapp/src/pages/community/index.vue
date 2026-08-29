<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import { lifeRuntimeProfile, lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const error = ref(null);
const stores = ref([]);
const selectedStore = ref(null);
const storeProducts = ref([]);
const detailLoading = ref(false);
const scenes = Object.freeze([
  ['附近美食', '今天吃点好的'],
  ['休闲玩乐', '周末轻松逛'],
  ['生活服务', '日常所需在身边'],
  ['鲜花礼品', '心意今日送达'],
]);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: stores.value }),
);
function safeDistanceKm(store) {
  return store?.distanceKm === null || store?.distanceKm === undefined
    ? null
    : `${store.distanceKm}km`;
}

async function ensurePreviewSession() {
  if (lifeSession.load() || !lifeRuntimeProfile.developmentMocks) return;
  await lifeSession.exchange('WECHAT', 'development-preview-life-user-v1');
}
async function load() {
  loading.value = true;
  error.value = null;
  try {
    await ensurePreviewSession();
    stores.value = await lifeSession.request('/api/v1/life/discovery/stores?limit=30');
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}
async function openStore(store) {
  selectedStore.value = store;
  storeProducts.value = [];
  detailLoading.value = true;
  try {
    storeProducts.value = await lifeSession.request(
      `/api/v1/life/discovery/products?storeId=${encodeURIComponent(store.id)}&limit=30`,
    );
  } catch {
    uni.showToast({ title: '门店商品加载失败，请重试', icon: 'none' });
  } finally {
    detailLoading.value = false;
  }
}
async function addToCart(product) {
  if (product.availableQuantity < 1) return;
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
  }
}
function sceneStyle(index) {
  return {
    '--sprite-x': `${((index + 10) % 5) * 25}%`,
    '--sprite-y': `${Math.floor(((index + 10) % 15) / 5) * 50}%`,
  };
}
onShow(load);

/* ============ concept-f 三图轮播 + tint 联动（纯视觉，不改冻结契约） ============ */
const communitySlides = Object.freeze([
  {
    key: 'tuan',
    tint: '#ffe6b8',
    k: '生活圈 · 团购',
    title: '周末团购节',
    sub: '爆款套餐 5 折起 · 先囤后约 · 不用可退',
    btn: '去逛逛 ›',
    c1: '#ffe9ad', c2: '#ffb84d', tx: '#5b3400', subc: '#8a5a10',
    pbtn: '#5b3400', pbt: '#ffd76a', glyph: '🍲',
  },
  {
    key: 'beauty',
    tint: '#ffdbe7',
    k: '丽人焕新季',
    title: '丽人焕新季',
    sub: '美发 · 美甲 · 美容 3 折起',
    btn: '去变美 ›',
    c1: '#ffe0ea', c2: '#ff9ec2', tx: '#8f1148', subc: '#b04a74',
    pbtn: '#8f1148', pbt: '#ffe0ea', glyph: '💐',
  },
  {
    key: 'kids',
    tint: '#dbf0dd',
    k: '亲子玩乐',
    title: '亲子玩乐汇',
    sub: '乐园 · DIY · 研学 周末通用',
    btn: '带娃去 ›',
    c1: '#dff5d9', c2: '#8fd9a8', tx: '#0d5c2e', subc: '#3a7a52',
    pbtn: '#0d5c2e', pbt: '#dff5d9', glyph: '🎡',
  },
]);
const activeSlide = ref(0);

/* 辅助：生活品牌墙 2x2 + 娱乐横滑（纯视觉展示，无数据时显示占位） */
const lifeBrandWall = Object.freeze([
  ['餐饮美食', '品牌团购 · 到店核销', '🍱', 'rgba(240,160,30,.14)'],
  ['休闲玩乐', 'K 歌 · 电玩 · 密室', '🎤', 'rgba(220,60,130,.12)'],
  ['丽人美发', '洗剪吹 · 美甲 · 美容', '💇', 'rgba(140,80,220,.12)'],
  ['亲子乐园', '乐园 · DIY · 研学', '🎠', 'rgba(30,150,80,.13)'],
]);
const frailRail = Object.freeze([
  ['观影通兑', '双人票 59.9', '🎬', '#0D6F96'],
  ['KTV 欢唱', '3 小时 39 起', '🎙️', '#B23AEE'],
  ['酒店民宿', '钟点房 4 折起', '🏨', '#F57C00'],
  ['周边一日游', '亲子套票热售', '🏞️', '#1E88E5'],
  ['运动健身', '单次体验 19.9', '🏋️', '#00897B'],
]);
const vipCard = {
  title: '乐趣生活 VIP',
  sub: '每月 24 张专属券 · 到店免预约',
  amount: '¥25',
  unit: '/月',
  tag: '开卡礼包 价值 ¥288',
};

/* ===== kimi 真理日夜 tswitch（.phone[data-theme=dark] 驱动） ===== */
const isDark = ref(false);
function toggleTheme(){ isDark.value = !isDark.value; }
</script>

<template>
  <view
    class="phone"
    :class="{ 'no-tr': false }"
    :data-theme="isDark ? 'dark' : ''"
    style="--hd1:#1a4fb0;--hd2:#0c2a80;--bg:#f6f1e6"
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

<view class="scroll" style="--tint:#ffe6b8">
    <view class="top">
      <view class="statusbar"><text>9:41</text>
        <text style="display:flex;gap:5px;align-items:center">
          <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
          <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="currentColor"/><path d="M23 4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </text>
      </view>
      <view class="navrow">
        <navigator url="/pages/page-198/index" open-type="navigate" class="loc" data-t="切换城市/定位：团购按当前定位 3km 内推荐"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8a7.2 7.2 0 0 0-7.2 7.2C4.8 15.4 12 21.5 12 21.5S19.2 15.4 19.2 10A7.2 7.2 0 0 0 12 2.8zm0 9.7a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>杭州<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 9l7 7 7-7"/></svg></navigator>
        <navigator url="/pages/page-203/index" open-type="navigate" class="qsearch"  style="text-decoration:none">
          <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor"><use href="#x-search"/></svg>
          搜商家 / 搜团购套餐…
        </navigator>
        <navigator url="/pages/page-227/index" open-type="navigate" class="bell" ><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><use href="#x-bell"/></svg><view style="display:inline-block;font-style:normal"></view></navigator>
        <view class="capsule" style="margin-left:0">
          <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)" style="transition:.5s"><use href="#cap-more"/></svg></view>
          <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)" style="transition:.5s"><use href="#cap-target"/></svg></view>
        </view></view>
    </view>

    <view class="bans fu">
      <navigator url="/pages/page-228/index" open-type="navigate" class="pslide on" data-tint="#ffe6b8" style="text-decoration:none;color:inherit;--pc1:#ffe9ad;--pc2:#ffb84d;--ptx:#5b3400;--psub:#8a5a10;--pbtn:#5b3400;--pbt:#ffd76a;--psh:rgba(240,160,30,.28)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">生活圈 · 团购</view><text style="font-weight:900;display:inline-block">周末团购节</text><text style="display:block">爆款套餐 5 折起 · 先囤后约 · 不用可退</text><text>去逛逛 ›</text></view>
        <image src="/static/v63-icons/3d-hotpot.png" alt="" mode="aspectFit"/>
      </navigator>
      <navigator url="/pages/page-228/index?c=beauty" open-type="navigate" class="pslide" data-tint="#ffdbe7" style="text-decoration:none;color:inherit;--pc1:#ffe0ea;--pc2:#ff9ec2;--ptx:#8f1148;--psub:#b04a74;--pbtn:#8f1148;--pbt:#ffe0ea;--psh:rgba(220,60,130,.25)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">丽人焕新季</view><text style="font-weight:900;display:inline-block">丽人焕新季</text><text style="display:block">美发 · 美甲 · 美容 3 折起</text><text>去变美 ›</text></view>
        <image src="/static/v63-icons/3d-rose.png" alt="" mode="aspectFit"/>
      </navigator>
      <navigator url="/pages/page-228/index?c=kids" open-type="navigate" class="pslide" data-tint="#dbf0dd" style="text-decoration:none;color:inherit;--pc1:#dff5d9;--pc2:#8fd9a8;--ptx:#0d5c2e;--psub:#3a7a52;--pbtn:#0d5c2e;--pbt:#dff5d9;--psh:rgba(30,150,80,.24)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">亲子玩乐</view><text style="font-weight:900;display:inline-block">亲子玩乐汇</text><text style="display:block">乐园 · DIY · 研学 周末通用</text><text>带娃去 ›</text></view>
        <image src="/static/v63-icons/3d-play.png" alt="" mode="aspectFit"/>
      </navigator>
      <view class="pdots"><view class="on" style="display:inline-block;font-style:normal"></view><view style="display:inline-block;font-style:normal"></view><view style="display:inline-block;font-style:normal"></view></view>
    </view>

    <view class="qcat fu">
      <navigator url="/pages/page-228/index?c=food" open-type="navigate"  data-t="美食团购：附近餐饮商家套餐（到店核销）"><view class="qic"><image src="/static/v63-icons/3d-burger.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">美食团购</text><text style="display:block">附近 328 家</text></navigator>
      <navigator url="/pages/page-228/index?c=drink" open-type="navigate"  data-t="奶茶饮品团购：瑞幸/喜茶等品牌券到店核销"><view class="qic"><image src="/static/v63-icons/3d-cup.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">奶茶饮品</text><text style="display:block">券后 9.9 起</text></navigator>
      <navigator url="/pages/page-228/index?c=film" open-type="navigate"  data-t="电影演出团购：观影券/演出票通兑"><view class="qic"><image src="/static/v63-icons/3d-film.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">电影演出</text><text style="display:block">双人券 59.9</text></navigator>
      <navigator url="/pages/page-228/index?c=hotel" open-type="navigate"  data-t="酒店民宿团购：钟点房/住宿套餐"><view class="qic"><image src="/static/v63-icons/3d-hotel.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">酒店民宿</text><text style="display:block">4 折起</text></navigator>
      <navigator url="/pages/page-228/index?c=ktv" open-type="navigate"  data-t="KTV 团购：欢唱套餐/酒水券"><view class="qic"><image src="/static/v63-icons/3d-mic.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">KTV 欢唱</text><text style="display:block">3 小时 39 起</text></navigator>
      <navigator url="/pages/page-228/index?c=tour" open-type="navigate"  data-t="周边游团购：景区门票+玩乐套餐"><view class="qic"><image src="/static/v63-icons/3d-mnt.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">周边游</text><text style="display:block">亲子套票热售</text></navigator>
      <navigator url="/pages/page-228/index?c=beauty" open-type="navigate"  data-t="丽人美发团购：洗剪吹/美甲/美容套餐"><view class="qic"><image src="/static/v63-icons/3d-spray.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">丽人美发</text><text style="display:block">总监洗剪吹 38</text></navigator>
      <navigator url="/pages/page-228/index?c=kids" open-type="navigate"  data-t="亲子乐园团购：儿童乐园/电玩城套餐"><view class="qic"><image src="/static/v63-icons/3d-play.png" alt="" mode="aspectFit"/></view><text style="font-weight:900;display:inline-block">亲子乐园</text><text style="display:block">周末通用</text></navigator>
    </view>

    <view class="community-trust fu"
      ><text>✓ 门店真实在营</text><text>✓ 距离授权后计算</text><text>✓ 商品实时在售</text></view
    >
    <view v-if="state === 'loading'" class="community-state fu">正在读取真实门店…</view>
    <view v-else-if="state === 'unauthenticated'" class="community-state fu">登录后查看附近生活</view>
    <view v-else-if="state === 'forbidden'" class="community-state fu">当前账户无权查看附近门店</view>
    <view v-else-if="state === 'recoverable-error'" class="community-state fu" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="community-state fu">当前没有可展示的服务门店</view>
    <view v-else class="nearby-section fu" v-if="stores.length">
      <view class="nearby-heading"
        ><view><text>附近服务门店</text><text>真实在营</text></view
        ><text>{{ stores.length }} 家</text></view
      >
      <view class="store-grid">
        <button
          v-for="(store, index) in stores"
          :key="store.id"
          @click="openStore(store)"
          class="store-card"
        >
          <view class="store-photo" :style="sceneStyle(index % scenes.length)" />
          <view class="store-copy"
            ><text>{{ store.name }}</text
            ><text>{{ store.cityCode || '当前城市' }} · {{ store.productCount || 0 }} 件在售</text
            ><view
              ><text>{{
                safeDistanceKm(store) ?? '授权后查看距离'
              }}</text
              ><text>查看门店 ›</text></view
            ></view
          >
        </button>
      </view>
    </view>

    <view class="qseg fu">
      <button class="on" id="segDeal">团购套餐</button><button id="segShop">附近商家</button>
    </view>

    <view class="qtabs fu" id="dealTabs">
      <navigator url="/pages/community/index" open-type="switchTab" class="on" data-f="all">推荐</navigator><navigator url="/pages/page-228/index?c=food" open-type="navigate" data-f="food">美食</navigator><navigator url="/pages/page-228/index?c=beauty" open-type="navigate" data-f="beauty">丽人</navigator><navigator url="/pages/page-228/index?c=fun" open-type="navigate" data-f="fun">休闲玩乐</navigator><navigator url="/pages/page-228/index?c=trip" open-type="navigate" data-f="trip">酒旅</navigator>
      <navigator url="/pages/page-204/index" open-type="navigate" class="sort" data-t="切换排序：销量优先 / 距离优先 / 价格最低">销量 ↓</navigator>
    </view>

    <view class="shops" id="shopList">
      <navigator url="/pages/page-198/index" class="shop fu" open-type="navigate" >
        <image class="simg" src="/static/v63-img/n-crayfish.jpg" alt="" mode="aspectFill"/>
        <view class="sinfo"><text style="font-weight:900;display:inline-block">虾闹闹 · 麻辣小龙虾</text><view class="smeta"><view style="display:inline-block;font-style:normal">★4.8</view> · 480m · 川菜 · 人均 ¥65</view><view class="stags">主营 <text style="font-style:normal">麻辣小龙虾 · 江湖菜</text></view><view class="saddr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>西湖区文三路 100 号</view><text class="sdeal">热门团购：双人餐 ¥98</text></view>
        <text class="sgo">进店 ›</text>
      </navigator>
      <navigator url="/pages/page-245/index?s=1" open-type="navigate" class="shop fu" >
        <image class="simg" src="/static/v63-img/n-skewer.jpg" alt="" mode="aspectFill"/>
        <view class="sinfo"><text style="font-weight:900;display:inline-block">串局 · 东北烧烤</text><view class="smeta"><view style="display:inline-block;font-style:normal">★4.7</view> · 650m · 烧烤 · 人均 ¥58</view><view class="stags">主营 <text style="font-style:normal">牛羊肉串 · 扎啤烤翅</text></view><view class="saddr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>拱墅区莫干山路 66 号</view><text class="sdeal">热门团购：四人撸串 ¥128</text></view>
        <text class="sgo">进店 ›</text>
      </navigator>
      <navigator url="/pages/page-245/index?s=2" open-type="navigate" class="shop fu" >
        <image class="simg" src="/static/v63-img/p-barber.jpg" alt="" mode="aspectFill"/>
        <view class="sinfo"><text style="font-weight:900;display:inline-block">型格美发 · 银泰店</text><view class="smeta"><view style="display:inline-block;font-style:normal">★4.9</view> · 320m · 丽人美发 · 人均 ¥45</view><view class="stags">主营 <text style="font-style:normal">洗剪吹 · 染烫造型</text></view><view class="saddr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>西湖区银泰百货 5F</view><text class="sdeal">热门团购：总监洗剪吹 ¥38</text></view>
        <text class="sgo">进店 ›</text>
      </navigator>
      <navigator url="/pages/page-245/index?s=3" open-type="navigate" class="shop fu" >
        <image class="simg" src="/static/v63-img/s-cake.jpg" alt="" mode="aspectFill"/>
        <view class="sinfo"><text style="font-weight:900;display:inline-block">甜屿 · 手作蛋糕</text><view class="smeta"><view style="display:inline-block;font-style:normal">★4.8</view> · 1.2km · 烘焙 · 人均 ¥42</view><view class="stags">主营 <text style="font-style:normal">生日蛋糕 · 手作甜点</text></view><view class="saddr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>滨江区江南大道 288 号</view><text class="sdeal">热门团购：6寸蛋糕 ¥88</text></view>
        <text class="sgo">进店 ›</text>
      </navigator>
      <navigator url="/pages/page-245/index?s=4" open-type="navigate" class="shop fu" >
        <image class="simg" src="/static/v63-img/s-film.jpg" alt="" mode="aspectFill"/>
        <view class="sinfo"><text style="font-weight:900;display:inline-block">万达影城 · 西湖店</text><view class="smeta"><view style="display:inline-block;font-style:normal">★4.9</view> · 900m · 电影 · 人均 ¥35</view><view class="stags">主营 <text style="font-style:normal">电影放映 · 通兑券</text></view><view class="saddr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>西湖区西溪印象城 3F</view><text class="sdeal">热门团购：双人通兑 ¥59.9</text></view>
        <text class="sgo">进店 ›</text>
      </navigator>
      <navigator url="/pages/page-245/index?s=5" open-type="navigate" class="shop fu" >
        <image class="simg" src="/static/v63-img/n-melon.jpg" alt="" mode="aspectFill"/>
        <view class="sinfo"><text style="font-weight:900;display:inline-block">果然鲜 · 精品水果</text><view class="smeta"><view style="display:inline-block;font-style:normal">★4.6</view> · 210m · 水果 · 人均 ¥20</view><view class="stags">主营 <text style="font-style:normal">精品水果 · 现切果切</text></view><view class="saddr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>西湖区文二路 45 号</view><text class="sdeal">热门团购：麒麟西瓜 ¥15.9</text></view>
        <text class="sgo">进店 ›</text>
      </navigator>
    </view>

    <view class="deals" id="dealList">
      <navigator url="/pages/page-209/index?id=d1" open-type="navigate" class="deal fu" data-c="food"  data-t="商家主页：虾闹闹——套餐详情→在线购买→到店展码核销（团购能力）">
        <view class="dimgbox"><image src="/static/v63-img/n-crayfish.jpg" alt="" mode="aspectFill"/><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">虾闹闹 · 麻辣小龙虾<text class="dstar">★4.8</text><text class="ddist">480m</text></view>
          <view class="dtit">【双人餐】招牌麻辣小龙虾 2 斤 + 配菜双拼 + 饮品</view>
          <view class="drules"><view style="display:inline-block;font-style:normal">随时退</view><view style="display:inline-block;font-style:normal">过期自动退</view><view style="display:inline-block;font-style:normal">免预约</view></view>
          <view class="drow"><view><text class="dprice">¥98<text style="text-decoration:line-through">¥168</text></text><text class="dsold">　已售 3200+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator url="/pages/page-209/index?id=d2" open-type="navigate" class="deal fu" data-c="food"  data-t="商家主页：串局烧烤——套餐详情→在线购买→到店展码核销（团购能力）">
        <view class="dimgbox"><image src="/static/v63-img/n-skewer.jpg" alt="" mode="aspectFill"/><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">串局 · 东北烧烤<text class="dstar">★4.7</text><text class="ddist">650m</text></view>
          <view class="dtit">【四人撸串套餐】牛羊肉串 40 串 + 烤翅 + 扎啤 4 杯</view>
          <view class="drules"><view style="display:inline-block;font-style:normal">随时退</view><view style="display:inline-block;font-style:normal">过期自动退</view></view>
          <view class="drow"><view><text class="dprice">¥128<text style="text-decoration:line-through">¥228</text></text><text class="dsold">　已售 2100+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator url="/pages/page-209/index?id=d3" open-type="navigate" class="deal fu" data-c="beauty"  data-t="商家主页：型格美发——洗剪吹套餐→购买→预约到店核销（丽人团购）">
        <view class="dimgbox"><image src="/static/v63-img/p-barber.jpg" alt="" mode="aspectFill"/><text class="dtag">丽人</text></view>
        <view class="dinfo">
          <view class="dshop">型格美发 · 银泰店<text class="dstar">★4.9</text><text class="ddist">320m</text></view>
          <view class="dtit">【总监洗剪吹】含头皮检测 + 造型，周末通用</view>
          <view class="drules"><view style="display:inline-block;font-style:normal">随时退</view><view style="display:inline-block;font-style:normal">需预约</view></view>
          <view class="drow"><view><text class="dprice">¥38<text style="text-decoration:line-through">¥88</text></text><text class="dsold">　已售 8600+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator url="/pages/page-209/index?id=d4" open-type="navigate" class="deal fu" data-c="food"  data-t="商家主页：甜屿蛋糕——团购券购买→到店自提核销（接口 4/5 蛋糕能力）">
        <view class="dimgbox"><image src="/static/v63-img/s-cake.jpg" alt="" mode="aspectFill"/><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">甜屿 · 手作蛋糕<text class="dstar">★4.8</text><text class="ddist">1.2km</text></view>
          <view class="dtit">【6 寸生日蛋糕】动物奶油，8 款可选，需提前 4 小时预约</view>
          <view class="drules"><view style="display:inline-block;font-style:normal">随时退</view><view style="display:inline-block;font-style:normal">过期自动退</view></view>
          <view class="drow"><view><text class="dprice">¥88<text style="text-decoration:line-through">¥158</text></text><text class="dsold">　已售 1500+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator url="/pages/page-209/index?id=d5" open-type="navigate" class="deal fu" data-c="fun"  data-t="万达影城通兑券：在线购券→选影片场次→影院核销（接口 1）">
        <view class="dimgbox"><image src="/static/v63-img/s-film.jpg" alt="" mode="aspectFill"/><text class="dtag">通兑</text></view>
        <view class="dinfo">
          <view class="dshop">万达影城 · 西湖店<text class="dstar">★4.9</text><text class="ddist">900m</text></view>
          <view class="dtit">【双人观影通兑券】2D/3D 全场次通用，含 2 杯可乐</view>
          <view class="drules"><view style="display:inline-block;font-style:normal">随时退</view><view style="display:inline-block;font-style:normal">全场次通用</view></view>
          <view class="drow"><view><text class="dprice">¥59.9<text style="text-decoration:line-through">¥160</text></text><text class="dsold">　已售 5.2万</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator url="/pages/page-209/index?id=d6" open-type="navigate" class="deal fu" data-c="food"  data-t="商家主页：果然鲜——水果团购价→到店自提/小时达（商超能力）">
        <view class="dimgbox"><image src="/static/v63-img/n-melon.jpg" alt="" mode="aspectFill"/><text class="dtag">自提</text></view>
        <view class="dinfo">
          <view class="dshop">果然鲜 · 精品水果<text class="dstar">★4.6</text><text class="ddist">210m</text></view>
          <view class="dtit">【麒麟西瓜 3 斤】现摘现切，不甜包退</view>
          <view class="drules"><view style="display:inline-block;font-style:normal">随时退</view><view style="display:inline-block;font-style:normal">坏果包赔</view></view>
          <view class="drow"><view><text class="dprice">¥15.9<text style="text-decoration:line-through">¥24</text></text><text class="dsold">　已售 9800+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
    </view>
  </view>

  <view v-if="selectedStore" class="store-sheet" @click="selectedStore = null">
    <view class="store-sheet-card" @click.stop>
      <view class="store-heading"
        ><view
          ><text>{{ selectedStore.name }}</text
          ><text
            >{{ selectedStore.cityCode || '当前城市' }} ·
            {{ selectedStore.districtCode || '服务区域' }}</text
          ></view
        ><button @click="selectedStore = null">关闭</button></view
      >
      <view class="store-facts"
        ><text>{{ selectedStore.productCount || 0 }} 件在售</text
        ><text>{{
          safeDistanceKm(selectedStore) ?? '距离待授权后计算'
        }}</text
        ><text>信息来自门店主档</text></view
      >
      <view v-if="detailLoading" class="community-state">正在读取门店在售商品…</view>
      <view v-else-if="!storeProducts.length" class="community-state"
        >门店当前没有可购买商品</view
      >
      <view v-else class="store-products"
        ><LifeRetailProductCard
          v-for="(product, index) in storeProducts"
          :key="product.id"
          compact
          :product="product"
          :index="index"
          @select="() => {}"
          @add="addToCart"
      /></view>
    </view>
  </view>

  <navigator url="/pages/page-259/index" open-type="navigate" class="maifab" id="maifab"  data-t="小满AI对话页：语音/文字说出需求，一句话调用 32 项供应链能力下单（全局悬浮入口，可拖动）"><image src="/static/v63-icons/mai.png" alt="小满" mode="aspectFit"/><text style="font-style:normal">小满</text></navigator>
  <view class="toast" id="toast"></view>
  <view class="tabbar">
    <navigator url="/pages/life/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-home"/></svg>首页</navigator>
    <navigator url="/pages/mall/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-shop"/></svg>商城</navigator>
    <navigator url="/pages/community/index" open-type="switchTab" class="tab on" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-chat"/></svg>生活圈</navigator>
    <navigator url="/pages/cart/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-cart"/></svg>购物车<text class="bdg">3</text></navigator>
    <navigator url="/pages/me/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-me"/></svg>我的</navigator>
  </view>

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
  .phone{width:375px;height:760px;background:var(--bg);border-radius:44px;position:relative;overflow:hidden;display:flex;flex-direction:column;flex:none;color:var(--ink);box-shadow:0 40px 90px rgba(0,0,0,.55);transition:background .5s,color .5s}
  .no-tr,.no-tr *{transition:none!important}
  .scroll{flex:1;overflow-y:auto;scrollbar-width:none}
  .scroll::-webkit-scrollbar{display:none}
  /* ============ 顶部 ============ */
  .top{background:linear-gradient(165deg,var(--hd1),var(--hd2));padding:10px 16px 4px;transition:background .5s;position:relative;overflow:hidden}
  .top::after{content:"";position:absolute;right:-46px;top:-52px;width:150px;height:150px;border-radius:50%;background:rgba(254,230,0,.14)}
  .statusbar{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:#fff;padding:4px 10px 0;position:relative;z-index:2}
  .navrow{display:flex;align-items:center;gap:8px;margin-top:10px;position:relative;z-index:2}
  .ptitle{font-size:19px;font-weight:900;color:#fff;letter-spacing:.02em}
  .capsule{margin-left:auto;width:87px;height:32px;border-radius:16px;background:var(--capsule-bg);border:1px solid var(--capsule-line);display:flex;overflow:hidden;backdrop-filter:blur(8px);transition:background .5s,border-color .5s}
  .cell{flex:1;display:grid;place-items:center}
  .cell:first-child{border-right:1px solid var(--capsule-line)}
  .loc{display:flex;align-items:center;gap:3px;color:#fff;font-size:12.5px;font-weight:800;flex-shrink:0;max-width:104px;background:rgba(255,255,255,.16);border-radius:999px;padding:7px 9px;text-decoration:none}
  .bell{position:relative;width:34px;height:34px;flex:none;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center;color:#fff;text-decoration:none}
  .bell i{position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--promo);border:1.5px solid var(--hd1)}
  .qsearch{flex:1;min-width:0;height:34px;background:rgba(255,255,255,.95);border-radius:17px;display:flex;align-items:center;gap:7px;padding:0 13px;font-size:12.5px;color:#9a938a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  [data-theme="dark"] .qsearch{background:rgba(255,255,255,.14);color:rgba(255,255,255,.75)}
  /* ============ 团购节 banner ============ */
  .qban{margin:12px 14px 0;border-radius:18px;background:linear-gradient(120deg,#ffe9ad,#ffd06e 60%,#ffb84d);display:flex;align-items:center;justify-content:space-between;padding:14px 16px;box-shadow:0 10px 22px rgba(240,160,30,.28);position:relative;overflow:hidden}
  .qban::before{content:"";position:absolute;right:-24px;top:-46px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.16)}
  .qb-tx b{font-size:17px;font-weight:900;color:#5b3400;letter-spacing:.02em}
  .qb-tx p{font-size:10.5px;font-weight:800;color:#8a5a10;margin:4px 0 8px}
  .qb-tx span{display:inline-block;background:#5b3400;color:#ffd76a;font-size:10px;font-weight:900;border-radius:9px;padding:4px 10px}
  .qban img{width:86px;height:86px;flex:none;filter:drop-shadow(0 6px 8px rgba(90,10,10,.3))}
  /* ============ 团购分类（黏土图标） ============ */
  .qcat{margin:14px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 6px 12px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px 4px;box-shadow:var(--shadow);transition:background .5s}
  .qcat a{text-decoration:none;text-align:center;color:var(--ink)}
  .qcat .qic{width:50px;height:50px;margin:0 auto;display:grid;place-items:center;background:radial-gradient(circle at 50% 44%,rgba(255,208,105,.34),rgba(255,208,105,0) 72%)}
  .qcat .qic img{width:46px;height:46px;filter:drop-shadow(0 3px 5px rgba(30,30,50,.14))}
  .qcat a b{font-size:11px;font-weight:900;display:block;margin-top:2px}
  .qcat a p{font-size:8.5px;font-weight:700;color:var(--mut);margin-top:2px}
  .phone[data-theme="dark"] .qcat .qic{background:radial-gradient(circle at 50% 44%,rgba(255,220,150,.10),rgba(255,220,150,0) 72%)}
  /* ============ 套餐/商家切换 ============ */
  .qseg{margin:14px 14px 0;display:flex;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:3px;box-shadow:var(--shadow);transition:background .5s}
  .qseg button{flex:1;border:none;background:none;font-size:12px;font-weight:900;color:var(--mut);border-radius:9px;padding:8px 0;cursor:pointer;font-family:inherit}
  .qseg button.on{background:linear-gradient(120deg,#00a850,#007a3d);color:#fff;box-shadow:0 3px 8px rgba(0,145,70,.28)}
  /* ============ 商家列表 ============ */
  .shops{margin:10px 14px 0;display:none;flex-direction:column;gap:10px;padding-bottom:16px}
  .shop{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:var(--shadow);text-decoration:none;color:var(--ink);transition:background .5s}
  .simg{width:62px;height:62px;border-radius:14px;object-fit:cover;flex:none}
  .sinfo{flex:1;min-width:0}
  .sinfo b{font-size:13.5px;font-weight:900;display:block}
  .sinfo .smeta{font-size:9.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .sinfo .smeta i{font-style:normal;color:#f7a800;font-weight:900}
  .sdeal{display:inline-block;font-size:9px;font-weight:800;color:var(--promo);background:rgba(240,55,73,.09);border-radius:5px;padding:2.5px 7px;margin-top:6px}
  .phone[data-theme="dark"] .sdeal{background:rgba(255,93,61,.13)}
  .sgo{flex:none;font-size:10.5px;font-weight:900;color:var(--accent)}
  .stags{font-size:9.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .stags em{font-style:normal;color:var(--ink);font-weight:800}
  .saddr{display:flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .saddr svg{flex:none;opacity:.55}
  /* ============ 筛选 tabs ============ */
  .qtabs{margin:14px 14px 0;display:flex;gap:8px;align-items:center;overflow-x:auto;scrollbar-width:none}
  .qtabs::-webkit-scrollbar{display:none}
  .qtabs a{flex:none;font-size:11.5px;font-weight:800;color:var(--mut);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 13px;text-decoration:none;transition:background .5s}
  .qtabs a.on{background:linear-gradient(120deg,#00a850,#007a3d);color:#fff;border-color:transparent;font-weight:900}
  .qtabs .sort{margin-left:auto;color:var(--accent);border-color:transparent;background:none;font-weight:900}
  /* ============ 商家团购列表 ============ */
  .deals{margin:10px 14px 0;display:flex;flex-direction:column;gap:10px;padding-bottom:16px}
  .deal{display:flex;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px;box-shadow:var(--shadow);text-decoration:none;color:var(--ink);transition:background .5s}
  .dimgbox{position:relative;flex:none;width:96px;height:96px}
  .dimgbox img{width:96px;height:96px;border-radius:12px;object-fit:cover;display:block}
  .dtag{position:absolute;left:5px;top:5px;background:rgba(240,55,73,.94);color:#fff;font-size:8.5px;font-weight:900;border-radius:5px;padding:2px 6px}
  .dinfo{flex:1;min-width:0;display:flex;flex-direction:column}
  .dshop{font-size:13.5px;font-weight:900;display:flex;align-items:center;gap:5px}
  .dshop .dstar{font-size:10px;font-weight:800;color:#f7a800}
  .dshop .ddist{font-size:9px;font-weight:700;color:var(--mut);margin-left:auto}
  .dtit{font-size:10.5px;font-weight:700;color:var(--mut);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .drules{display:flex;gap:5px;margin-top:5px}
  .drules i{font-style:normal;font-size:8px;font-weight:800;color:var(--notice-tx);background:var(--notice-bg);border-radius:4px;padding:2px 5px}
  .drow{margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding-top:6px}
  .dprice{font-size:17px;font-weight:900;color:var(--promo)}
  .dprice s{font-size:10px;color:var(--mut);font-weight:700;margin-left:4px}
  .dsold{font-size:9px;font-weight:700;color:var(--mut)}
  .dbuy{flex:none;background:linear-gradient(120deg,#ff7a3d,#f03749);color:#fff;font-size:10.5px;font-weight:900;border-radius:9px;padding:6px 12px;box-shadow:0 4px 10px rgba(240,55,73,.3)}
  .dright{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between}
  /* ============ Tabbar ============ */
  .tabbar{flex:none;height:72px;background:var(--tabbar);border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(5,1fr);padding:7px 4px 15px;transition:background .5s}
  .tab{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:700;color:var(--mut);text-decoration:none;position:relative;transition:color .5s}
  .tab.on{color:var(--accent)}
  .tab .bdg{position:absolute;top:2px;right:calc(50% - 20px);min-width:16px;height:16px;border-radius:8px;background:var(--promo);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px;border:1.5px solid var(--tabbar)}
  [data-theme="dark"] .tab.on svg{filter:drop-shadow(0 0 9px rgba(110,199,38,.9))}
  /* ============ toast / 悬浮球 ============ */
  .toast{position:absolute;left:50%;bottom:96px;transform:translateX(-50%) translateY(16px);background:rgba(22,19,15,.92);color:#fff;font-size:11.5px;font-weight:700;border-radius:12px;padding:10px 15px;max-width:300px;text-align:center;line-height:1.6;opacity:0;pointer-events:none;transition:.3s;z-index:20}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .maifab{position:absolute;right:12px;bottom:92px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.96);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;text-decoration:none;box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10);animation:maipulse 2.8s ease-in-out infinite}
  .maifab img{width:31px;height:31px}
  .maifab em{font-style:normal;font-size:8.5px;font-weight:900;color:#16130f;margin-top:1px}
  .phone[data-theme="dark"] .maifab{background:rgba(20,26,24,.94)}
  .phone[data-theme="dark"] .maifab em{color:#f6f2e5}
  @keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.12)}50%{box-shadow:0 8px 22px rgba(22,19,15,.18),0 0 0 9px rgba(0,200,130,.04)}}
  /* ============ 入场动画 ============ */
  .fu{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s cubic-bezier(.2,.9,.3,1.05)}
  .fu.in{opacity:1;transform:none}
  /* responsive media removed */

/* ===== V10：顶部随 banner 联动渐变 + 三图轮播 ===== */
@property --tint{syntax:'<color>';inherits:false;initial-value:#ffe6b8}
.scroll{background:linear-gradient(180deg,var(--tint,#ffe6b8) 0px,var(--bg) 500px);transition:--tint .9s ease}
[data-theme="dark"] .scroll{background:var(--bg)}
.top{background:none;overflow:visible;padding-bottom:4px}
.top::after{display:none}
.statusbar{color:var(--ink)}
.loc{background:rgba(255,255,255,.92);color:var(--ink);box-shadow:0 3px 10px rgba(22,19,15,.07)}
.bell{background:rgba(255,255,255,.92);color:var(--ink);box-shadow:0 3px 10px rgba(22,19,15,.07)}
.bell i{border-color:#fff}
[data-theme="dark"] .statusbar{color:#fff}
[data-theme="dark"] .loc,[data-theme="dark"] .bell{background:rgba(255,255,255,.14);color:#fff;box-shadow:none}
.bans{margin:12px 14px 0;position:relative;height:118px;border-radius:18px}
.pslide{position:absolute;inset:0;border-radius:18px;background:linear-gradient(120deg,var(--pc1),var(--pc2));display:flex;align-items:center;justify-content:space-between;padding:13px 15px;overflow:hidden;opacity:0;transform:translateX(16px) scale(.98);transition:opacity .65s ease,transform .65s ease;pointer-events:none;box-shadow:0 10px 22px var(--psh,rgba(22,19,15,.14))}
.pslide.on{opacity:1;transform:none;pointer-events:auto}
.pslide::before{content:"";position:absolute;left:-34px;top:-46px;width:124px;height:124px;border-radius:50%;background:rgba(255,255,255,.22)}
.pb-tx{position:relative;z-index:2;min-width:0}
.pb-tx .k{display:inline-block;font-style:normal;font-size:9px;font-weight:900;letter-spacing:.16em;color:var(--ptx);opacity:.72;border:1px solid currentColor;border-radius:6px;padding:2px 6px;margin-bottom:6px}
.pb-tx b{display:block;font-size:19px;font-weight:900;color:var(--ptx);letter-spacing:.05em;line-height:1.25}
.pb-tx p{font-size:10.5px;font-weight:800;color:var(--psub);margin:5px 0 8px;letter-spacing:.02em}
.pb-tx span{display:inline-block;background:var(--pbtn);color:var(--pbt);font-size:10px;font-weight:900;border-radius:9px;padding:4.5px 11px;letter-spacing:.04em}
.pslide>img{width:88px;height:88px;flex:none;position:relative;z-index:2;filter:drop-shadow(0 8px 10px rgba(22,19,15,.18))}
.pdots{position:absolute;right:13px;bottom:10px;display:flex;gap:5px;z-index:6}
.pdots i{width:5px;height:5px;border-radius:99px;background:rgba(22,19,15,.16);transition:.35s}
.pdots i.on{width:15px;background:rgba(22,19,15,.55)}
/* ===== 巡检修复：信任三标签 + 状态 + 附近真实门店 + 门店详情浮层 ===== */
.community-trust{display:flex;margin:14px 14px 0;gap:8px;flex-wrap:wrap}
.community-trust>text{padding:4px 9px;border-radius:999px;background:var(--notice-bg);color:var(--notice-tx);font-size:10px;font-weight:800}
.community-state{margin:10px 14px 0;padding:14px 12px;border-radius:14px;background:var(--card);border:1px dashed var(--line);color:var(--mut);font-size:11.5px;font-weight:700;text-align:center}
.nearby-section{margin:10px 14px 0}
.nearby-heading{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px}
.nearby-heading view{display:flex;flex-direction:column;gap:2px}
.nearby-heading view text:first-child{font-size:13.5px;font-weight:900;color:var(--ink)}
.nearby-heading view text:last-child{font-size:9.5px;font-weight:700;color:var(--mut)}
.nearby-heading>text:last-child{font-size:10.5px;font-weight:800;color:var(--accent)}
.store-grid{display:grid;gap:10px;grid-template-columns:1fr}
.store-card{margin:0;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:var(--shadow);display:flex;gap:10px;align-items:center;text-align:left;line-height:1.4}
.store-photo{width:62px;height:62px;border-radius:14px;flex:none;background-repeat:no-repeat;background-size:500% 300%}
.store-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.store-copy>text:first-child{font-size:13px;font-weight:900;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.store-copy>text:nth-child(2){font-size:9.5px;font-weight:700;color:var(--mut)}
.store-copy>view{display:flex;margin-top:3px;align-items:center;justify-content:space-between;gap:6px}
.store-copy>view text:first-child{font-size:9.5px;font-weight:800;color:var(--notice-tx);background:var(--notice-bg);padding:2px 5px;border-radius:5px}
.store-copy>view text:last-child{font-size:10.5px;font-weight:900;color:var(--accent)}
/* ===== store-sheet 浮层 ===== */
.store-sheet{position:fixed;z-index:80;top:0;right:0;bottom:0;left:0;display:flex;align-items:flex-end;background:var(--life-overlay,rgba(22,19,15,.45))}
.store-sheet-card{width:100%;max-height:84vh;overflow:auto;padding:14px 14px calc(14px + env(safe-area-inset-bottom));border-radius:18px 18px 0 0;background:var(--bg,#f6f1e6);box-sizing:border-box}
.store-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.store-heading view{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
.store-heading view text:first-child{font-size:16px;font-weight:900;color:var(--ink,#16130f)}
.store-heading view text:last-child{font-size:10.5px;font-weight:700;color:var(--mut,#857c6d)}
.store-heading button{margin:0;border-radius:999px;padding:5px 11px;background:var(--life-bg,#e6f3ea);color:var(--life-brand-deep,#0b6b3d);font-size:10.5px;font-weight:800}
.store-facts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.store-facts>text{padding:4px 8px;border-radius:999px;background:var(--card,#fff);border:1px solid var(--line);font-size:10px;font-weight:700;color:var(--mut)}
.store-products{display:grid;gap:10px;grid-template-columns:1fr}

</style>

