<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import { lifeRuntimeProfile, lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const query = ref('');
const selectedProduct = ref(null);
const activeChannel = ref('全部');
const channels = Object.freeze(['全部', '家庭采购', '本地好物', '品质严选']);

// Concept-f 商城三图横幅：绿/蓝/紫三色 tint 联动 LifeSurface bg
const mallSlides = Object.freeze([
  {
    tag: '新品上架 · 当日送达',
    title: '家庭采购 · 源头好物更便宜',
    sub: '满 99 减 18 · 满额立减券 · 包邮到家',
    cta: '去选购 ›',
    ctaLink: '/pages/page-207/index',
    tint: '#dff0d4',
    bg1: '#0f8a47',
    bg2: '#66d496',
    badge: '全场包邮',
  },
  {
    tag: '家政洗护节',
    title: '洗衣 / 洗车 / 家政 一次约齐',
    sub: '到店服务真实可约 · 电子核销不用排队',
    cta: '立即预约 ›',
    ctaLink: '/pages/page-200/index',
    tint: '#d7eefa',
    bg1: '#1570d6',
    bg2: '#6ec9ff',
    badge: '服务节',
  },
  {
    tag: '会员福利日',
    title: '办会员 · 每周三领 5 折券',
    sub: '会员价再叠加代金券 · 充值享积分翻倍',
    cta: '开通会员 ›',
    ctaLink: '/pages/page-252/index',
    tint: '#efe3ff',
    bg1: '#7b46e6',
    bg2: '#c29bff',
    badge: '超值',
  },
]);
const activeSlide = ref(0);

async function ensurePreviewSession() {
  if (lifeSession.load() || !lifeRuntimeProfile.developmentMocks) return;
  await lifeSession.exchange('WECHAT', 'development-preview-life-user-v1');
}
async function load() {
  loading.value = true;
  error.value = null;
  try {
    await ensurePreviewSession();
    products.value = await lifeSession.request(
      '/api/v1/life/discovery/products?productType=PHYSICAL&limit=30',
    );
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
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
function openProductDetail(product) {
  uni.navigateTo({ url: `/pages/page-209/index?productId=${encodeURIComponent(product.id)}` });
}
function productStyle(index) {
  return {
    '--sprite-x': `${(index % 4) * 33.333}%`,
    '--sprite-y': `${Math.floor((index % 8) / 4) * 100}%`,
  };
}
function categoryStyle(index) {
  return {
    '--sprite-x': `${(index % 5) * 25}%`,
    '--sprite-y': `${Math.floor(index / 5) * 50}%`,
    '--c1': ['#009146', '#eb6325', '#1596c9', '#b858ff', '#f03749', '#16a58c', '#8a6d3b', '#c94b8f'][(index) % 8],
    '--c2': ['#e7f7f0', '#fff2df', '#e8f7fd', '#f5eaff', '#ffe9e9', '#e3f9f1', '#fdf2dc', '#ffe9f4'][(index) % 8],
  };
}
onShow(load);

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

<view class="scroll" style="--tint:#dff0d4">
    <view class="top">
      <view class="statusbar"><text>9:41</text>
        <text style="display:flex;gap:5px;align-items:center">
          <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
          <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="currentColor"/><path d="M23 4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </text>
      </view>
      <view class="navrow">
        <view class="loc">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>
          <text style="font-weight:900;display:inline-block">幸福里</text>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 9l7 7 7-7"/></svg>
        </view>
        <navigator url="/pages/page-203/index" open-type="navigate" class="search"  style="text-decoration:none">
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor"><use href="#x-search"/></svg>
          搜：土鸡蛋 / 活虾 / 理发
        </navigator>
        <view class="capsule">
          <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)" style="transition:.5s"><use href="#cap-more"/></svg></view>
          <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)" style="transition:.5s"><use href="#cap-target"/></svg></view>
        </view>
      </view>
    </view>

    <view class="bans fu">
      <navigator url="/pages/page-201/index?c=fresh" open-type="navigate" class="pslide on" data-tint="#dff0d4" style="text-decoration:none;color:inherit;--pc1:#e2f3d4;--pc2:#a8dd8a;--ptx:#1e4d0f;--psub:#4a7a34;--pbtn:#1e4d0f;--pbt:#e2f3d4;--psh:rgba(80,170,60,.26)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">今日鲜到</view><text style="font-weight:900;display:inline-block">凌晨现摘 晌午上桌</text><text style="display:block">产地直供 · 满 59 元送到家</text><text>去逛逛 ›</text></view>
        <image src="/static/v63-icons/3d-fbasket.png" alt="" mode="aspectFit"/>
      </navigator>
      <navigator url="/pages/page-200/index?c=life" open-type="navigate" class="pslide" data-tint="#d9e9fb" style="text-decoration:none;color:inherit;--pc1:#ddeeff;--pc2:#9ec9f5;--ptx:#0d3f77;--psub:#3d6494;--pbtn:#0d3f77;--pbt:#ddeeff;--psh:rgba(50,110,220,.25)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">家清服务</view><text style="font-weight:900;display:inline-block">家清焕新节</text><text style="display:block">洗护 · 保洁 · 家电清洗 预约上门</text><text>去预约 ›</text></view>
        <image src="/static/v63-icons/3d-washer.png" alt="" mode="aspectFit"/>
      </navigator>
      <navigator url="/pages/page-201/index?c=super" open-type="navigate" class="pslide" data-tint="#eadffb" style="text-decoration:none;color:inherit;--pc1:#f0e4ff;--pc2:#c5a1f5;--ptx:#4a1a8a;--psub:#7446ab;--pbtn:#4a1a8a;--pbt:#f0e4ff;--psh:rgba(130,70,220,.25)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">会员专享</view><text style="font-weight:900;display:inline-block">会员囤货日</text><text style="display:block">商超百货 满 99 减 30</text><text>去囤货 ›</text></view>
        <image src="/static/v63-icons/3d-bag.png" alt="" mode="aspectFit"/>
      </navigator>
      <view class="pdots"><view class="on" style="display:inline-block;font-style:normal"></view><view style="display:inline-block;font-style:normal"></view><view style="display:inline-block;font-style:normal"></view></view>
      <button class="tswitch" id="tswitch" @click="toggleTheme">
        <svg v-if="!isDark" id="ts-ic-moon" width="14" height="14" viewBox="0 0 24 24" fill="#f7c400"><use href="#x-moon"/></svg>
        <svg v-if="isDark" id="ts-ic-sun" width="15" height="15" viewBox="0 0 24 24" fill="#fee600"><use href="#x-sun"/></svg>
        <text id="ts-tx">夜市模式</text>
      </button>
    </view>

    <navigator url="/pages/page-227/index" open-type="navigate" class="notice fu"  style="text-decoration:none;color:inherit">
      <text class="lb"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><use href="#x-mega"/></svg>公告</text>
      <view class="roll"><view class="roll-in">高温关怀券满 30 减 8 已放入卡包 · 孤寡老人下单免配送费 · 今晚 8 点新米拼团截单 · 明早 6:30 早市开摊　｜　高温关怀券满 30 减 8 已放入卡包 · 孤寡老人下单免配送费 · 今晚 8 点新米拼团截单 · 明早 6:30 早市开摊　｜　</view></view>
    </navigator>

    <view class="sk fu">
      <view class="sk-hd">
        <text class="h3" style="font-weight:900;display:block"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><use href="#x-flash"/></svg>限时秒杀<text style="font-style:normal">进行中</text></text>
        <view class="cnt">距结束 <text style="font-weight:900;display:inline-block">01</text>:<text style="font-weight:900;display:inline-block">58</text>:<text style="font-weight:900;display:inline-block">42</text></view>
      </view>
      <view class="sk-rail">
        <navigator url="/pages/page-209/index?t=goods&id=sk1" open-type="navigate" class="sk-card"  style="text-decoration:none;color:inherit"><image src="/static/v63-img/p-prawn.jpg" alt="" mode="aspectFill"/>
          <view class="sk-bd"><view class="sk-nm">鲜活基围虾 500g</view>
            <view class="sk-pr"><text style="font-weight:900;display:inline-block">¥19.9</text><text style="text-decoration:line-through">¥32</text></view>
            <view class="sk-bar"><view style="width:86%;display:inline-block;font-style:normal"></view><text>已抢86%</text></view></view></navigator>
        <navigator url="/pages/page-209/index?t=goods&id=sk2" open-type="navigate" class="sk-card"  style="text-decoration:none;color:inherit"><image src="/static/v63-img/p-eggs.jpg" alt="" mode="aspectFill"/>
          <view class="sk-bd"><view class="sk-nm">散养土鸡蛋 30枚</view>
            <view class="sk-pr"><text style="font-weight:900;display:inline-block">¥9.9</text><text style="text-decoration:line-through">¥15.8</text></view>
            <view class="sk-bar"><view style="width:72%;display:inline-block;font-style:normal"></view><text>已抢72%</text></view></view></navigator>
        <navigator url="/pages/page-209/index?t=goods&id=sk3" open-type="navigate" class="sk-card"  style="text-decoration:none;color:inherit"><image src="/static/v63-img/p-tomato.jpg" alt="" mode="aspectFill"/>
          <view class="sk-bd"><view class="sk-nm">沙瓤番茄 3 斤</view>
            <view class="sk-pr"><text style="font-weight:900;display:inline-block">¥6.9</text><text style="text-decoration:line-through">¥11</text></view>
            <view class="sk-bar"><view style="width:64%;display:inline-block;font-style:normal"></view><text>已抢64%</text></view></view></navigator>
      </view>
    </view>

    <view class="cats fu">
      <navigator url="/pages/page-201/index?c=veg" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-greens.jpg" alt="" mode="aspectFill"/></view><text>时令蔬菜</text></navigator>
      <navigator url="/pages/page-201/index?c=fruit" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-apple.jpg" alt="" mode="aspectFill"/></view><text>新鲜水果</text></navigator>
      <navigator url="/pages/page-201/index?c=grocery" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-eggs.jpg" alt="" mode="aspectFill"/></view><text>肉禽蛋奶</text></navigator>
      <navigator url="/pages/page-201/index?c=grocery" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-prawn.jpg" alt="" mode="aspectFill"/></view><text>鲜活水产</text></navigator>
      <navigator url="/pages/page-201/index?c=super" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-rice.jpg" alt="" mode="aspectFill"/></view><text>粮油米面</text></navigator>
      <navigator url="/pages/page-228/index" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-group.jpg" alt="" mode="aspectFill"/></view><text>邻里团购</text></navigator>
      <navigator url="/pages/page-255/index" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-bill.jpg" alt="" mode="aspectFill"/></view><text>缴费代办</text></navigator>
      <navigator url="/pages/page-228/index?c=beauty" open-type="navigate" class="cat"  style="text-decoration:none;color:inherit"><view class="badge"><image src="/static/v63-img/p-barber.jpg" alt="" mode="aspectFill"/></view><text>理发洗护</text></navigator>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block"><text class="chip-ic" style="background:linear-gradient(135deg,#19b26b,#009146)"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><use href="#f-leaf"/></svg></text>蔬菜鲜果</text><navigator url="/pages/page-201/index?c=veg" open-type="navigate"  class="c-grn">进专区 →</navigator></view>
      <view class="aisle-bd">
        <template v-for="(product, idx) in products.slice(0, 4)" :key="'veg'+product.id">
        <navigator :url="'/pages/page-209/index?id=' + product.id" open-type="navigate" class="pd" style="text-decoration:none;color:inherit">
          <image class="pd-ph" :src="product.imageUrl || '../../assets/v63-retail/product-sprite.webp'" mode="aspectFill"/>
          <view class="pd-bd"><view class="pd-nm">{{ product.title }}</view>
            <view class="pd-row"><view class="pr"><text>¥{{ (product.salePriceCents/100).toFixed(0) }}</text></view>
              <text class="pbtn" @click.stop="addToCart(product)"><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff"><use href="#x-plus"/></svg></text></view></view></navigator>
        </template>
      </view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block"><text class="chip-ic" style="background:linear-gradient(135deg,#2f86d8,#0756a5)"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><use href="#f-egg"/></svg></text>肉禽蛋奶</text><navigator url="/pages/page-201/index?c=meat" open-type="navigate"  class="c-blu">进专区 →</navigator></view>
      <view class="aisle-bd">
        <navigator url="/pages/page-209/index?t=goods&id=pd3" open-type="navigate" class="pd"  style="text-decoration:none;color:inherit"><image src="/static/v63-img/p-eggs.jpg" alt="" mode="aspectFill"/>
          <view class="pd-bd"><view class="pd-nm">散养土鸡蛋 30 枚</view>
            <text class="pd-tg" style="background:#e7f0fa;color:#0756a5">可溯源</text>
            <view class="pd-row"><view class="pr">¥<text style="font-weight:900;display:inline-block">9</text><text style="vertical-align:super;display:inline-block">.9</text><text style="text-decoration:line-through">¥15.8</text></view>
              <text class="pbtn"><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff"><use href="#x-plus"/></svg></text></view></view></navigator>
        <navigator url="/pages/page-209/index?t=goods&id=pd4" open-type="navigate" class="pd"  style="text-decoration:none;color:inherit"><image src="/static/v63-img/p-prawn.jpg" alt="" mode="aspectFill"/>
          <view class="pd-bd"><view class="pd-nm">鲜活基围虾 500g</view>
            <text class="pd-tg" style="background:#ffe9eb;color:#f03749">今日秒杀</text>
            <view class="pd-row"><view class="pr">¥<text style="font-weight:900;display:inline-block">19</text><text style="vertical-align:super;display:inline-block">.9</text><text style="text-decoration:line-through">¥32</text></view>
              <text class="pbtn"><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff"><use href="#x-plus"/></svg></text></view></view></navigator>
      </view>
    </view>

    <view class="tg fu">
      <view class="tg-hd"><text class="h3" style="font-weight:900;display:block">邻里拼一单</text><text style="font-style:normal">还差 13 人成团</text></view>
      <view class="tg-it">
        <image src="/static/v63-img/p-tomato.jpg" alt="" mode="aspectFill"/>
        <view class="t"><text style="font-weight:900;display:inline-block">五常新大米 10 斤 · 团长价 ¥29.9</text><text style="display:block">3 号楼王婶当团长 · 送到她家楼下自取</text></view>
        <navigator url="/pages/page-228/index" open-type="navigate" class="tg-go"  style="text-decoration:none">参团<svg width="13" height="13" viewBox="0 0 24 24" stroke="#fff"><use href="#x-arrow"/></svg></navigator>
      </view>
      <view class="tg-bar"><view style="display:inline-block;font-style:normal"></view></view>
      <view class="tg-ft">已有 <text style="font-weight:900;display:inline-block">37 位邻居</text>参团 · 今晚 8 点截团</view>
    </view>

    <view class="wf">
      <view class="wf-hd"><text class="h3" style="font-weight:900;display:block"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><use href="#x-flash"/></svg>为你推荐</text></view>
      <view class="wf-bd">
        <view class="wf-col" id="wfA"></view>
        <view class="wf-col" id="wfB"></view>
      </view>
      <view class="wf-load" id="wfLoad" v-if="false"><view style="display:inline-block;font-style:normal"></view>正在补货…</view>
      <view class="wf-end" id="wfEnd" v-if="false">到底啦 · 去生活圈看看邻居们在买啥</view>
    </view>

    <view style="height:8px"></view>
  </view>

  <view class="tabbar">
    <navigator url="/pages/life/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-home"/></svg>首页</navigator>
    <navigator url="/pages/mall/index" open-type="switchTab" class="tab on" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-shop"/></svg>商城</navigator>
    <navigator url="/pages/community/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-chat"/></svg>生活圈</navigator>
    <navigator url="/pages/cart/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-cart"/></svg>购物车<text class="bdg">3</text></navigator>
    <navigator url="/pages/me/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-me"/></svg>我的</navigator>
  </view>
  </view>
  <navigator url="/pages/page-259/index" open-type="navigate" class="maifab" id="maifab"  aria-label="小满AI"><image src="/static/v63-icons/mai.png" alt="小满" mode="aspectFit"/><text style="font-style:normal">小满</text></navigator>

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
  a.tab{text-decoration:none}
  .tab{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;font-weight:700;color:var(--mut);padding-top:5px;position:relative}
  .tab.on{color:var(--accent)}
  [data-theme="dark"] .tab.on svg{filter:drop-shadow(0 0 9px rgba(110,199,38,.9))}
  .tab .bdg{position:absolute;top:2px;right:calc(50% - 20px);min-width:16px;height:16px;border-radius:8px;background:var(--promo);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px;border:1.5px solid var(--tabbar)}
  .fu{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
  .fu.in{opacity:1;transform:none}
  /* responsive media removed */
.phone.no-tr,.phone.no-tr *{transition:none!important}

  .wf-it{display:block;text-decoration:none;color:inherit;cursor:pointer}
  .wf-vou{margin-top:7px;font-size:9.5px;font-weight:800;border-radius:7px;padding:5px 7px;color:#9c6500;background:#fdf3d7;display:flex;align-items:center;gap:4px}
  .wf-vou svg{flex:none}
  .phone[data-theme="dark"] .wf-vou{background:rgba(247,196,0,.13);color:#f7c400}
  /* ===== 小满 AI 入口 ===== */
  .maifab{position:absolute;right:12px;bottom:92px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.96);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;text-decoration:none;box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10);animation:maipulse 2.8s ease-in-out infinite}
  .maifab img{width:31px;height:31px}
  .maifab em{font-style:normal;font-size:8.5px;font-weight:900;color:#16130f;margin-top:1px}
  .phone[data-theme="dark"] .maifab{background:rgba(20,26,24,.94)}
  .phone[data-theme="dark"] .maifab em{color:#f6f2e5}
  @keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.12)}50%{box-shadow:0 8px 22px rgba(22,19,15,.18),0 0 0 9px rgba(0,200,130,.04)}}
  .maitoast{position:absolute;left:50%;bottom:158px;transform:translateX(-50%) translateY(14px);background:rgba(22,19,15,.92);color:#fff;font-size:11.5px;font-weight:700;border-radius:12px;padding:10px 15px;max-width:290px;text-align:center;line-height:1.6;opacity:0;pointer-events:none;transition:.3s;z-index:40}
  .maitoast.show{opacity:1;transform:translateX(-50%) translateY(0)}

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
.bans .tswitch{z-index:7}
.bans .pdots{left:14px;right:auto}

</style>

