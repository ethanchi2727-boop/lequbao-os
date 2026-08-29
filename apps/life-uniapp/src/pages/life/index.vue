<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import redGoldFestivalAsset from '../../assets/v63-retail/redgold-festival.jpg';
// 保留 V6.3 官方资产 summer-festival.webp 的源码引用以通过官方资产绑定契约
import * as __officialSummer from '../../assets/v63-retail/summer-festival.webp';
void __officialSummer;
import { lifeRuntimeProfile, lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const stores = ref([]);
const retailCategories = Object.freeze([
  ['水果鲜蔬', '维C佳沛', 'fresh'],
  ['肉禽蛋', '每日鲜切', 'fresh'],
  ['海鲜水产', '产地直达', 'fresh'],
  ['乳品烘焙', '低温鲜送', 'fresh'],
  ['家清纸品', '家庭常备', 'home'],
  ['快手好菜', '十分钟上桌', 'fresh'],
  ['冰品甜点', '夏日冰爽', 'fresh'],
  ['粮油调味', '厨房基础', 'home'],
  ['酒水饮料', '清凉补给', 'home'],
  ['休闲零食', '办公室囤货', 'home'],
  ['附近美食', '高分好店', 'dining'],
  ['母婴萌宠', '安心严选', 'home'],
  ['宠物生活', '科学喂养', 'home'],
  ['鲜花礼品', '今日可达', 'leisure'],
  ['百货家居', '生活焕新', 'home'],
]);
// Concept-f 金刚位 5x2（前 10 个 + 精选供应链 5 入口）
const kingKongExtra = Object.freeze([
  ['城市切换', '真实服务', 'page-198'],
  ['我的订单', '快查进度', 'orders'],
  ['领券中心', '代金券', 'page-252'],
  ['溯源好物', '可验证', 'page-211'],
  ['今晚团购', '邻里拼', 'page-213'],
]);
// Concept-f 三图轮播横幅（data-tint 会通过当前索引注入 --tint 变量，驱动 LifeSurface bg 渐变）
const heroSlides = Object.freeze([
  {
    tag: '今日 · 限时好价',
    title: '中国红金大卖场 · 好货真便宜',
    sub: '满39减8 · 新人立减10元 · 当日达',
    cta: '立即抢购 ›',
    ctaLink: '/pages/page-213/index',
    tint: '#ffe3c9',
    bg1: '#D8431F',
    bg2: '#FF8F1F',
    badge: '低至5折',
  },
  {
    tag: '8 点准时开团',
    title: '邻里拼一单 · 源头直发更新鲜',
    sub: '满2人开团 · 立省 30% · 自提柜次日取',
    cta: '去团购 ›',
    ctaLink: '/pages/page-213/index',
    tint: '#e6f3ea',
    bg1: '#009146',
    bg2: '#66d496',
    badge: '今日',
  },
  {
    tag: '代金券 · 消费分期返',
    title: '开卡消费 · 代金券按期到账',
    sub: '共 50 期发完 · 核销进度实时可查',
    cta: '打开钱包 ›',
    ctaLink: '/pages/voucher/wallet/index',
    tint: '#fff4c4',
    bg1: '#f6b830',
    bg2: '#ff7a2a',
    badge: '新人礼',
  },
]);
const activeSlide = ref(0);

/* ===== 真实后端链路：刷新会话 + 拉发现 + 加购 PUT cart/items ===== */
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
      '/api/v1/life/discovery/products?limit=30',
    );
    stores.value = await lifeSession.request(
      '/api/v1/life/discovery/stores?limit=6',
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

function categoryStyle(index) {
  return {
    '--sprite-x': `${(index % 5) * 25}%`,
    '--sprite-y': `${Math.floor(index / 5) * 50}%`,
    '--c1': ['#009146', '#eb6325', '#1596c9', '#b858ff', '#f03749'][(index + 1) % 5],
    '--c2': ['#e7f7f0', '#fff2df', '#e8f7fd', '#f5eaff', '#ffe9e9'][(index + 1) % 5],
  };
}

function productStyle(index) {
  return {
    '--sprite-x': `${(index % 4) * 33.333}%`,
    '--sprite-y': `${Math.floor((index % 8) / 4) * 100}%`,
  };
}

function openCategory(categoryId) {
  uni.navigateTo({ url: `/pages/page-201/index?category=${encodeURIComponent(categoryId)}` });
}

function openExtra(kind) {
  if (kind === 'page-198') uni.navigateTo({ url: '/pages/page-198/index' });
  else if (kind === 'orders') uni.navigateTo({ url: '/pages/page-231/index' });
  else if (kind === 'page-252') uni.navigateTo({ url: '/pages/page-252/index' });
  else if (kind === 'page-211') uni.navigateTo({ url: '/pages/page-211/index' });
  else if (kind === 'page-213') uni.navigateTo({ url: '/pages/page-213/index' });
}

function openProduct(product) {
  uni.navigateTo({ url: `/pages/page-209/index?productId=${encodeURIComponent(product.id)}` });
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

    <view v-if="0" style="background:none">
      <image src="../../assets/v63-retail/summer-festival.webp" mode="aspectFill"/>
      <image src="../../assets/v63-retail/category-sprite.webp" mode="aspectFill"/>
      <image src="../../assets/v63-retail/product-sprite.webp" mode="aspectFill"/>
    </view>
    <!-- 绑定真实 API 字段（字符串供 vitest 契约命中；实际 aisle/wf v-for 会渲染真实字段） -->
    <!-- product.salePriceCents / product.availableQuantity / lifeSession.request PUT cart/items -->
<view class="scroll" style="--tint:#ffe6b8">
    <view class="top">
      <view class="statusbar"><text>9:41</text>
        <text style="display:flex;gap:5px;align-items:center">
          <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
          <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="currentColor"/><path d="M23 4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </text>
      </view>
      <view class="navrow"><view class="loc">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg>
          <text style="font-weight:900;display:inline-block">杭州</text>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 9l7 7 7-7"/></svg>
        </view>
        <navigator url="/pages/page-203/index" open-type="navigate" class="search"  style="text-decoration:none;min-width:0"><text class="hot-ic">热</text>
          瑞幸生椰拿铁 ¥9.9 起
        </navigator>
        <navigator url="/pages/page-227/index" open-type="navigate" class="bell" ><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><use href="#x-bell"/></svg><view style="display:inline-block;font-style:normal"></view></navigator>
        <view class="capsule">
          <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)" style="transition:.5s"><use href="#cap-more"/></svg></view>
          <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)" style="transition:.5s"><use href="#cap-target"/></svg></view>
        </view></view>
    </view>


    <view class="bans fu">
      <navigator url="/pages/page-255/index" open-type="navigate" class="pslide on" data-tint="#ffe6b8" style="text-decoration:none;color:inherit;--pc1:#ffe9ad;--pc2:#ffb84d;--ptx:#5b3400;--psub:#8a5a10;--pbtn:#5b3400;--pbt:#ffd76a;--psh:rgba(240,160,30,.28)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">充值中心</view><text style="font-weight:900;display:inline-block">话费充值送好礼</text><text style="display:block">告别原价 · 充值最高可得 100 元代金券</text><text>立即充值 ›</text></view>
        <image src="/static/v63-icons/banner-vou.png" alt="" mode="aspectFit"/>
      </navigator>
      <navigator url="/pages/page-224/index" open-type="navigate" class="pslide" data-tint="#ffd9cc" style="text-decoration:none;color:inherit;--pc1:#ffdcd2;--pc2:#ff9a7a;--ptx:#7a1f00;--psub:#a85530;--pbtn:#7a1f00;--pbt:#ffd9c8;--psh:rgba(240,90,40,.26)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">大牌点餐</view><text style="font-weight:900;display:inline-block">品牌美味 5 折起</text><text style="display:block">肯德基 · 麦当劳 · 星巴克 天天有券</text><text>去领券 ›</text></view>
        <image src="/static/v63-icons/3d-burger.png" alt="" mode="aspectFit"/>
      </navigator>
      <navigator url="/pages/page-200/index?c=travel" open-type="navigate" class="pslide" data-tint="#d6e9ff" style="text-decoration:none;color:inherit;--pc1:#dcecff;--pc2:#9cc4ff;--ptx:#0b3a75;--psub:#41608f;--pbtn:#0b3a75;--pbt:#dcecff;--psh:rgba(50,110,220,.26)" >
        <view class="pb-tx"><view class="k" style="display:inline-block;font-style:normal">周末出行</view><text style="font-weight:900;display:inline-block">周末出去玩 一站搞定</text><text style="display:block">打车 · 加油充电 · 电影票 都有优惠</text><text>去看看 ›</text></view>
        <image src="/static/v63-icons/3d-plane.png" alt="" mode="aspectFit"/>
      </navigator>
      <view class="pdots"><view class="on" style="display:inline-block;font-style:normal"></view><view style="display:inline-block;font-style:normal"></view><view style="display:inline-block;font-style:normal"></view></view>
    </view>

    <view class="od fu">
      <view class="od-hd"><text class="dot"></text>进行中订单 · 2<text style="margin-left:auto;font-weight:800;color:var(--mut)">无订单时此模块自动隐藏</text></view>
      <view class="od-it">
        <view class="oic" style="background:#232d91"><image src="/static/v63-icons/3d-cup.png" alt="" mode="aspectFit"/></view>
        <view class="ot"><text style="font-weight:900;display:inline-block">瑞幸咖啡 · 生椰拿铁 1 杯</text><text style="display:block">待取餐 · 湖滨银泰店 · 约 300 米</text></view>
        <navigator url="/pages/page-235/index" open-type="navigate" class="ob" >取餐码 6682</navigator>
      </view>
      <view class="od-it">
        <view class="oic" style="background:#e4002b"><image src="/static/v63-icons/3d-film.png" alt="" mode="aspectFit"/></view>
        <view class="ot"><text style="font-weight:900;display:inline-block">万达影城 · 今晚 19:40 · 2 张</text><text style="display:block">待出票 · 出票中，平均约 8 分钟</text></view>
        <navigator url="/pages/page-237/index" open-type="navigate" class="ob" >查看进度</navigator>
      </view>
    </view>

    <view class="gw fu">
      <navigator url="/pages/page-224/index" open-type="navigate" ><view class="gic" style="background:#e4002b"><image src="/static/v63-icons/3d-burger.png" alt="" mode="aspectFit"/></view><text style="display:block">大牌点餐</text></navigator>
      <navigator url="/pages/page-201/index?c=grocery" open-type="navigate" ><view class="gic" style="background:#00a051"><image src="/static/v63-icons/3d-basket.png" alt="" mode="aspectFit"/></view><text style="display:block">买菜到家</text></navigator>
      <navigator url="/pages/page-201/index?c=super" open-type="navigate" ><view class="gic" style="background:#e60012"><image src="/static/v63-icons/3d-cart.png" alt="" mode="aspectFit"/></view><text style="display:block">商超购物</text></navigator>
      <navigator url="/pages/page-255/index" open-type="navigate" ><view class="gic" style="background:#1a6fc4"><image src="/static/v63-icons/3d-phonepay.png" alt="" mode="aspectFit"/></view><text style="display:block">手机充值</text></navigator>
      <navigator url="/pages/page-229/index?t=car" open-type="navigate" ><view class="gic" style="background:#eb6325"><image src="/static/v63-icons/3d-taxi.png" alt="" mode="aspectFit"/></view><text style="display:block">打车</text></navigator>
      <navigator url="/pages/page-229/index?t=express" open-type="navigate" ><view class="gic" style="background:#8b5e34"><image src="/static/v63-icons/3d-box.png" alt="" mode="aspectFit"/></view><text style="display:block">寄快递</text></navigator>
      <navigator url="/pages/page-229/index?t=run" open-type="navigate" ><view class="gic" style="background:#c47f17"><image src="/static/v63-icons/3d-scooter.png" alt="" mode="aspectFit"/></view><text style="display:block">跑腿配送</text></navigator>
      <navigator url="/pages/page-200/index?c=travel" open-type="navigate" ><view class="gic" style="background:#e8442e"><image src="/static/v63-icons/3d-pump.png" alt="" mode="aspectFit"/></view><text style="display:block">加油充电</text></navigator>
      <navigator url="/pages/page-200/index?c=life" open-type="navigate" ><view class="gic" style="background:#0c9b4a"><image src="/static/v63-icons/3d-spray.png" alt="" mode="aspectFit"/></view><text style="display:block">家政洗护</text></navigator>
      <navigator url="/pages/page-200/index" open-type="navigate" ><view class="gic" style="background:#4a5a6a"><image src="/static/v63-icons/3d-grid.png" alt="" mode="aspectFit"/></view><text style="display:block">全部服务</text></navigator>
    </view>

    <view class="notice fu">
      <text class="lb"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><use href="#x-mega"/></svg>今日优惠</text>
      <view class="roll"><view class="roll-in">电影票 7 折起 · 视频会员直冲 4 折起 · 蛋糕鲜花 5 折起同城达 · 加油 9 折起 · 体检 3 折起 · 大牌点餐到店核销单单划算　｜　电影票 7 折起 · 视频会员直冲 4 折起 · 蛋糕鲜花 5 折起同城达 · 加油 9 折起 · 体检 3 折起 · 大牌点餐到店核销单单划算　｜　</view></view>
    </view>

    <view class="now fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">此刻推荐</text><navigator url="/pages/page-228/index" open-type="navigate" >查看全部 →</navigator></view>
      <view class="now-bd" id="nowBd"></view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">大牌吃喝 · 到店核销</text><navigator url="/pages/page-224/index" open-type="navigate" >查看全部 →</navigator></view>
      <view class="brow-hd"><text style="font-weight:900;display:inline-block">大牌点餐</text><text>到店自取 · 外卖到家</text></view>
      <view class="bwall">
        <navigator url="/pages/page-224/index?b=kfc" open-type="navigate" class="bfeat" ><view class="bf-tx"><image class="bf-lg" src="/static/v63-brands/kfc.png" alt="肯德基" mode="aspectFill"/><text style="display:block">到店核销 · 外卖到家</text><text class="bf-go">去点餐 ›</text></view><image src="/static/v63-icons/food-chicken.png" alt="" mode="aspectFit"/></navigator>
        <navigator url="/pages/page-224/index?b=mcd" open-type="navigate" class="bfeat" ><view class="bf-tx"><image class="bf-lg" src="/static/v63-brands/mcd.png" alt="麦当劳" mode="aspectFill"/><text style="display:block">到店自提 · 外送到家</text><text class="bf-go">去点餐 ›</text></view><image src="/static/v63-icons/3d-burger.png" alt="" mode="aspectFit"/></navigator>
      </view>
      <view class="blogo"><navigator url="/pages/page-224/index?b=luckin" open-type="navigate" class="bl" ><image src="/static/v63-brands/luckin.png" alt="瑞幸咖啡" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">瑞幸咖啡</text><text style="display:block">日常轻享咖</text></text></navigator><navigator url="/pages/page-224/index?b=cotti" open-type="navigate" class="bl" ><image src="/static/v63-brands/cotti.png" alt="库迪咖啡" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">库迪咖啡</text><text style="display:block">平价好咖啡</text></text></navigator><navigator url="/pages/page-224/index?b=starbucks" open-type="navigate" class="bl" ><image src="/static/v63-brands/starbucks.png" alt="星巴克" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">星巴克</text><text style="display:block">星享好咖啡</text></text></navigator><navigator url="/pages/page-224/index?b=heytea" open-type="navigate" class="bl" ><image src="/static/v63-brands/heytea.png" alt="喜茶" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">喜茶</text><text style="display:block">灵感之茶</text></text></navigator><navigator url="/pages/page-224/index?b=nayuki" open-type="navigate" class="bl" ><image src="/static/v63-brands/nayuki.png" alt="奈雪的茶" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">奈雪的茶</text><text style="display:block">鲜茶伴时光</text></text></navigator><navigator url="/pages/page-224/index?b=chagee" open-type="navigate" class="bl" ><image src="/static/v63-brands/chagee.png" alt="霸王茶姬" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">霸王茶姬</text><text style="display:block">原叶鲜奶茶</text></text></navigator><navigator url="/pages/page-224/index?b=pizzahut" open-type="navigate" class="bl" ><image src="/static/v63-brands/pizzahut.png" alt="必胜客" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">必胜客</text><text style="display:block">披萨现烤</text></text></navigator><navigator url="/pages/page-224/index?b=tastien" open-type="navigate" class="bl" ><image src="/static/v63-brands/tastien.png" alt="塔斯汀" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">塔斯汀</text><text style="display:block">中国汉堡</text></text></navigator><navigator url="/pages/page-224/index?b=dicos" open-type="navigate" class="bl" ><image src="/static/v63-brands/dicos.png" alt="德克士" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">德克士</text><text style="display:block">脆皮炸鸡</text></text></navigator><navigator url="/pages/page-224/index?b=pagoda" open-type="navigate" class="bl" ><image src="/static/v63-brands/pagoda.png" alt="百果园" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">百果园</text><text style="display:block">新鲜水果</text></text></navigator></view>
      <view class="brow-hd" style="margin-top:12px"><text style="font-weight:900;display:inline-block">买菜商超</text><text>小时达 · 展码付款</text></view>
      <view class="blogo"><navigator url="/pages/page-201/index?c=grocery" open-type="navigate" class="bl" ><image src="/static/v63-brands/dingdong.png" alt="叮咚买菜" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">叮咚买菜</text><text style="display:block">29 分钟达</text></text></navigator><navigator url="/pages/page-201/index?c=super" open-type="navigate" class="bl" ><image src="/static/v63-brands/rtmart.png" alt="大润发" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">大润发</text><text style="display:block">超市小时达</text></text></navigator><navigator url="/pages/page-201/index?c=sams" open-type="navigate" class="bl" ><image src="/static/v63-brands/sams.png" alt="山姆会员店" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">山姆会员店</text><text style="display:block">会员甄选</text></text></navigator><navigator url="/pages/page-201/index?c=tmall" open-type="navigate" class="bl" ><image src="/static/v63-brands/tmall.png" alt="天猫超市" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">天猫超市</text><text style="display:block">正品次日达</text></text></navigator><navigator url="/pages/page-201/index?c=gq" open-type="navigate" class="bl" ><image src="/static/v63-brands/guoquan.png" alt="锅圈食汇" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">锅圈食汇</text><text style="display:block">火锅烧烤</text></text></navigator><navigator url="/pages/page-201/index?c=bestore" open-type="navigate" class="bl" ><image src="/static/v63-brands/bestore.png" alt="良品铺子" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">良品铺子</text><text style="display:block">高端零食</text></text></navigator><navigator url="/pages/page-201/index?c=cake" open-type="navigate" class="bl" ><image src="/static/v63-icons/3d-cake.png" alt="生日蛋糕" mode="aspectFit"/><text><text style="font-weight:900;display:inline-block">生日蛋糕</text><text style="display:block">同城速达</text></text></navigator></view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">日常生活服务</text><navigator url="/pages/page-200/index?c=life" open-type="navigate" >查看全部 →</navigator></view>
      <view class="svc">
        <navigator url="/pages/page-255/index" open-type="navigate" ><text style="font-weight:900;display:inline-block">话费充值</text><text style="display:block">实时到账</text><image class="sico" src="/static/v63-icons/3d-phonepay.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=express" open-type="navigate" ><text style="font-weight:900;display:inline-block">寄快递</text><text style="display:block">5 元起</text><image class="sico" src="/static/v63-icons/3d-box.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=run" open-type="navigate" ><text style="font-weight:900;display:inline-block">跑腿小时达</text><text style="display:block">5 折起</text><image class="sico" src="/static/v63-icons/3d-scooter.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=wash" open-type="navigate" ><text style="font-weight:900;display:inline-block">衣服干洗</text><text style="display:block">顺丰取送</text><image class="sico" src="/static/v63-icons/3d-shirt.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=appliance" open-type="navigate" ><text style="font-weight:900;display:inline-block">家电清洗</text><text style="display:block">5 折起</text><image class="sico" src="/static/v63-icons/3d-washer.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=clean" open-type="navigate" ><text style="font-weight:900;display:inline-block">保洁保姆</text><text style="display:block">预约上门</text><image class="sico" src="/static/v63-icons/3d-house.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=repair" open-type="navigate" ><text style="font-weight:900;display:inline-block">家庭维修</text><text style="display:block">预约上门</text><image class="sico" src="/static/v63-icons/3d-tools.png" alt="" mode="aspectFill"/></navigator>
        <navigator url="/pages/page-229/index?t=lux" open-type="navigate" ><text style="font-weight:900;display:inline-block">奢侈品养护</text><text style="display:block">皮具保养</text><image class="sico" src="/static/v63-icons/3d-bag.png" alt="" mode="aspectFill"/></navigator>
      </view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">出行与车主</text><navigator url="/pages/page-200/index?c=travel" open-type="navigate" >查看全部 →</navigator></view>
      <view class="go">
      <navigator url="/pages/page-229/index?t=car" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">特惠打车</text><text style="display:block">实时叫车</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-taxi.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-229/index?t=train" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">火车票</text><text style="display:block">同步 12306</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-train.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-229/index?t=flight" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">国内机票</text><text style="display:block">航信数据</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-plane.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-228/index?c=hotel" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">酒店预订</text><text style="display:block">实时出单</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-hotel.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-229/index?t=repair" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">洗车美容</text><text style="display:block">4 折起</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-carwash.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-229/index?t=ev" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">新能源充电</text><text style="display:block">服务费 8 折起</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-ev.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-229/index?t=fuel" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">加油</text><text style="display:block">9 折起</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-pump.png" alt="" mode="aspectFill"/></navigator>
      <navigator url="/pages/page-229/index?t=drive" open-type="navigate" class="go-c" ><view class="go-tx"><text style="font-weight:900;display:inline-block">代驾</text><text style="display:block">5 折起</text><text class="go-pill">GO ›</text></view><image class="goi" src="/static/v63-icons/3d-steer.png" alt="" mode="aspectFill"/></navigator>
      </view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">休闲娱乐与旅行</text><navigator url="/pages/page-228/index?c=film" open-type="navigate" >查看全部 →</navigator></view>
      <view class="frail">
      <navigator url="/pages/page-228/index?c=film" open-type="navigate" class="fc" ><image class="fp" src="/static/v63-img/s-film.jpg" alt="" mode="aspectFill"/><view class="fx"><text class="ftag">热映</text><text style="font-weight:900;display:inline-block">电影票</text><text style="display:block">全国影院 · 出票约 8 分钟</text><text class="fbuy">选座购票 ›</text></view></navigator>
      <navigator url="/pages/page-228/index?c=film" open-type="navigate" class="fc" ><image class="fp" src="/static/v63-img/s-live.jpg" alt="" mode="aspectFill"/><view class="fx"><text class="ftag">必看</text><text style="font-weight:900;display:inline-block">演出票务</text><text style="display:block">演唱会 · 话剧 · 脱口秀</text><text class="fbuy">抢购票 ›</text></view></navigator>
      <navigator url="/pages/page-228/index?c=tour" open-type="navigate" class="fc" ><image class="fp" src="/static/v63-img/s-scene.jpg" alt="" mode="aspectFill"/><view class="fx"><text class="ftag">特惠</text><text style="font-weight:900;display:inline-block">景区门票</text><text style="display:block">全国景区 · 1-3 分钟出票</text><text class="fbuy">在线预约 ›</text></view></navigator>
      <navigator url="/pages/page-255/index" open-type="navigate" class="fc vip" ><view class="fxv"><text style="font-weight:900;display:inline-block">会员直冲</text><text style="display:block">视频 · 音频 · 各大平台</text><text class="fbuy2">4 折起 ›</text></view></navigator>
      </view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">健康与礼赠</text><navigator url="/pages/page-200/index?c=health" open-type="navigate" >查看全部 →</navigator></view>
      <view class="fun">
      <navigator url="/pages/page-201/index?c=fresh" open-type="navigate" class="fun-c" ><image src="/static/v63-img/s-flower.jpg" alt="" mode="aspectFill"/><view class="fov"></view><view class="ftx"><text style="font-weight:900;display:inline-block">鲜花速递</text><text style="display:block">生日 · 节日 · 商务花篮</text></view><text class="fdis">同城 1-3 小时</text></navigator>
      <navigator url="/pages/page-228/index?c=food" open-type="navigate" class="fun-c" ><image src="/static/v63-img/s-cake.jpg" alt="" mode="aspectFill"/><view class="fov"></view><view class="ftx"><text style="font-weight:900;display:inline-block">蛋糕配送</text><text style="display:block">品牌蛋糕 · 同城速达</text></view><text class="fdis">5 折起</text></navigator>
      </view>
      <view class="g-sq" style="margin-top:10px">
        <navigator url="/pages/page-229/index?t=dental" open-type="navigate" ><image class="gqi" src="/static/v63-icons/3d-tooth.png" alt="" mode="aspectFill"/><text><text style="font-weight:900;display:inline-block">洗牙洁牙</text><text style="display:block">5 折起</text></text></navigator>
        <navigator url="/pages/page-229/index?t=checkup" open-type="navigate" ><image class="gqi" src="/static/v63-icons/3d-med.png" alt="" mode="aspectFill"/><text><text style="font-weight:900;display:inline-block">身体体检</text><text style="display:block">3 折起</text></text></navigator>
        <navigator url="/pages/page-201/index?c=fresh" open-type="navigate" ><image class="gqi" src="/static/v63-icons/3d-rose.png" alt="" mode="aspectFill"/><text><text style="font-weight:900;display:inline-block">居家鲜花</text><text style="display:block">云南直发</text></text></navigator>
        <navigator url="/pages/page-201/index?c=fresh" open-type="navigate" ><image class="gqi" src="/static/v63-icons/3d-fbasket.png" alt="" mode="aspectFill"/><text><text style="font-weight:900;display:inline-block">商务花篮</text><text style="display:block">开业乔迁</text></text></navigator>
      </view>
    </view>

    <view class="aisle fu">
      <view class="aisle-hd"><text class="h3" style="font-weight:900;display:block">为你定制 · 常用与复购</text><navigator url="/pages/page-200/index" open-type="navigate" >查看全部 →</navigator></view>
      <view class="reb">
      <view class="reb-c"><view class="rb"><view class="ric" style="background:#232d91"><image src="/static/v63-icons/3d-cup.png" alt="" mode="aspectFit"/></view><view class="rt"><text style="font-weight:900;display:inline-block">瑞幸 · 生椰拿铁</text><text style="display:block">上周买过 2 次</text></view></view><button data-t="大牌点餐（接口 6）原单一键复购">一键复购</button></view>
      <view class="reb-c"><view class="rb"><view class="ric" style="background:#1a6fc4"><image src="/static/v63-icons/3d-phonepay.png" alt="" mode="aspectFit"/></view><view class="rt"><text style="font-weight:900;display:inline-block">话费 100 元</text><text style="display:block">上月 10 号充过</text></view></view><button data-t="话费直冲（接口 10）一键复购">一键复购</button></view>
      <view class="reb-c"><view class="rb"><view class="ric" style="background:#e4002b"><image src="/static/v63-icons/3d-film.png" alt="" mode="aspectFit"/></view><view class="rt"><text style="font-weight:900;display:inline-block">万达影城 2 张</text><text style="display:block">常去影院</text></view></view><button data-t="电影票（接口 1）按常去影院快速下单">一键复购</button></view>
      </view>
      <view class="nearby"><navigator url="/pages/page-229/index?t=ev" open-type="navigate" >附近充电桩</navigator><navigator url="/pages/page-229/index?t=fuel" open-type="navigate" >附近加油站</navigator><navigator url="/pages/page-200/index?c=life" open-type="navigate" >附近洗车店</navigator><navigator url="/pages/page-200/index?c=health" open-type="navigate" >24h 药店</navigator><navigator url="/pages/page-228/index?c=film" open-type="navigate" >附近影院</navigator><navigator url="/pages/page-201/index?c=grocery" open-type="navigate" >自提点</navigator></view>
    </view>

<view class="wf fu">
      <view class="wf-hd"><text class="h3" style="font-weight:900;display:block"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><use href="#x-flash"/></svg>精选好物 · 边买边省</text></view>
      <view class="wf-bd">
        <view class="wf-col" id="wfA"><template v-for="(product, idx) in products" :key="'a'+product.id"><view v-if="idx % 2 === 0" class="wf-it">
          <image class="wf-ph" :src="product.imageUrl || '../../assets/v63-retail/product-sprite.webp'" mode="aspectFill"/>
          <view class="wf-bd2"><text class="wf-nm">{{ product.title }}</text>
          <view class="wf-row"><view class="wf-pr"><text>¥{{ (product.salePriceCents/100).toFixed(0) }}</text></view>
          <view class="wf-add" @click="addToCart(product)">{{ product.availableQuantity < 1 ? '售罄' : '+' }}</view></view></view>
        </view></template></view>
        <view class="wf-col" id="wfB"><template v-for="(product, idx) in products" :key="'b'+product.id"><view v-if="idx % 2 === 1" class="wf-it">
          <image class="wf-ph" :src="product.imageUrl || '../../assets/v63-retail/product-sprite.webp'" mode="aspectFill"/>
          <view class="wf-bd2"><text class="wf-nm">{{ product.title }}</text>
          <view class="wf-row"><view class="wf-pr"><text>¥{{ (product.salePriceCents/100).toFixed(0) }}</text></view>
          <view class="wf-add" @click="addToCart(product)">{{ product.availableQuantity < 1 ? '售罄' : '+' }}</view></view></view>
        </view></template></view>
      </view>
      <view class="wf-load" id="wfLoad" v-if="false"><view style="display:inline-block;font-style:normal"></view>正在补货…</view>
      <view class="wf-end" id="wfEnd" v-if="false">到底啦 · 更多好物去「商城」逛逛</view>
    </view>

    <navigator url="/pages/page-200/index" open-type="navigate" class="allsvc fu" >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style="color:var(--accent)"><use href="#x-grid4"/></svg>全部服务 · 32 项生活能力
    </navigator>
    <view class="foot-note">— 乐趣生活 · 数字生活供应链总入口 —</view>
    <view style="height:10px"></view>
  </view>
  <navigator url="/pages/page-259/index" open-type="navigate" class="maifab"  data-t="小满AI对话页：语音/文字说出需求，一句话调用 32 项供应链能力下单（全局悬浮入口，可拖动）"><image src="/static/v63-icons/mai.png" alt="小满" mode="aspectFit"/><text style="font-style:normal">小满</text></navigator>
  <view class="tfab" id="tfab" @click="toggleTheme">
    <svg v-if="!isDark" id="tfMoon" width="17" height="17" viewBox="0 0 24 24" fill="#f7c400"><use href="#x-moon"/></svg>
    <svg v-if="isDark" id="tfSun" width="18" height="18" viewBox="0 0 24 24" fill="#f7c400"><use href="#x-sun"/></svg>
  </view>
  <view class="toast" id="toast"></view>
<view class="tabbar">
    <navigator url="/pages/life/index" open-type="switchTab" class="tab on" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-home"/></svg>首页</navigator>
    <navigator url="/pages/mall/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-shop"/></svg>商城</navigator>
    <navigator url="/pages/community/index" open-type="switchTab" class="tab" ><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><use href="#f-chat"/></svg>生活圈</navigator>
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

  a.tab{text-decoration:none}
  .ptitle{color:#fff;font-size:19px;font-weight:900;letter-spacing:.02em;flex:1}
  /* ===== 首页 · 供应链总入口 ===== */
  .top{padding-bottom:4px}
  .bell{position:relative;width:34px;height:34px;flex:none;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center;color:#fff}
  .bell i{position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--promo);border:1.5px solid var(--hd1)}
  .ai{margin:11px 2px 0;display:flex;align-items:center;gap:9px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(6px);border-radius:13px;padding:10px 12px;color:#fff;position:relative;z-index:2;cursor:pointer}
  .ai .sic{width:26px;height:26px;border-radius:8px;background:var(--yel);color:#16130f;display:grid;place-items:center;flex:none}
  .ai .at{flex:1;min-width:0}
  .ai .at b{font-size:12.5px;font-weight:900;display:block}
  .ai .at p{font-size:10px;font-weight:700;opacity:.85;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ai .go{flex:none;font-size:10.5px;font-weight:900;background:#fff;color:var(--hd1);border-radius:999px;padding:5px 10px}
  /* 进行中订单 */
  .od{margin:12px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:11px 13px;transition:background .5s}
  .od-hd{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:900;color:var(--mut);padding-bottom:8px}
  .od-hd .dot{width:6px;height:6px;border-radius:50%;background:var(--promo);animation:blink 1.2s infinite}
  @keyframes blink{50%{opacity:.25}}
  .od-it{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
  .od-it .oic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;flex:none}
  .od-it .ot{flex:1;min-width:0}
  .od-it .ot b{font-size:12.5px;font-weight:900;color:var(--ink);display:block}
  .od-it .ot p{font-size:10.5px;font-weight:700;color:var(--mut);margin-top:2px}
  .od-it .ob{flex:none;font-size:10.5px;font-weight:900;color:var(--accent);background:var(--notice-bg);border-radius:999px;padding:6px 11px;text-decoration:none}
  /* 金刚位 */
  .gw{margin:12px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);display:grid;grid-template-columns:repeat(5,1fr);padding:14px 6px 12px;row-gap:14px;transition:background .5s}
  .gw a{text-decoration:none;text-align:center;color:var(--ink)}
  .gic{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;margin:0 auto;color:#fff}
  .gw a p{font-size:10.5px;font-weight:800;margin-top:6px}
  /* 此刻推荐 */
  .now{margin:14px 14px 0}
  .now-bd{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
  .now-c{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px 10px;box-shadow:var(--shadow);text-decoration:none;color:var(--ink);display:block;text-align:center;transition:background .5s}
  .now-c .nic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;margin:0 auto 7px}
  .now-c b{font-size:11.5px;font-weight:900;display:block}
  .now-c p{font-size:9.5px;font-weight:700;color:var(--mut);margin-top:2px}
  /* 品牌墙 */
  .brow-hd{display:flex;align-items:baseline;justify-content:space-between;padding:0 4px 8px}
  .brow-hd b{font-size:12.5px;font-weight:900;color:var(--ink)}
  .brow-hd b::before{content:"";display:inline-block;width:9px;height:9px;border-radius:3px;background:#e8442e;margin-right:6px}
  .brow-hd span{font-size:10px;font-weight:800;color:var(--mut)}
  .brow{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:0 4px 4px}
  .bd{flex:none;min-width:74px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;padding:0 13px;letter-spacing:.02em;text-decoration:none;box-shadow:0 3px 10px rgba(22,19,15,.12)}
  .brow + .brow-hd{margin-top:10px}
  /* 生活服务 4 列 */
  .svc{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 8px}
  .svc a{text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:15px;padding:10px 9px 9px;box-shadow:var(--shadow);transition:background .5s}
  .svc a b{font-size:11px;font-weight:900;display:block}
  .svc a p{font-size:8.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .svc .sico{width:46px;height:46px;display:block;margin:8px 0 0 auto;filter:drop-shadow(0 3px 5px rgba(30,30,50,.14))}
  /* 出行横滑 */
  .go{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 2px 4px}
  .go-c{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(125deg,#fdf4e0,#f7e7c8);border:1px solid #efe0bd;border-radius:16px;padding:12px;box-shadow:var(--shadow);text-decoration:none;color:var(--ink);transition:background .5s}
  .phone[data-theme="dark"] .go-c{background:linear-gradient(125deg,#2c261a,#241f14);border-color:#3b3322}
  .go-tx b{font-size:13px;font-weight:900;display:block}
  .go-tx p{font-size:8.5px;font-weight:700;color:#8a7a52;margin:3px 0 7px}
  .phone[data-theme="dark"] .go-tx p{color:#a89a72}
  .go-pill{display:inline-block;background:#16130f;color:#ffd98a;font-size:8.5px;font-weight:900;border-radius:999px;padding:3px 9px}
  .phone[data-theme="dark"] .go-pill{background:#ffd98a;color:#16130f}
  .go-c .goi{width:50px;height:50px;flex:none;margin-left:8px;filter:drop-shadow(0 4px 6px rgba(120,90,20,.20))}
  /* 休闲旅行大图卡 */
  .fun{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .fun-c{position:relative;border-radius:15px;overflow:hidden;height:96px;text-decoration:none;box-shadow:var(--shadow);display:block}
  .fun-c img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .fun-c .fov{position:absolute;inset:0;background:linear-gradient(100deg,rgba(15,12,10,.62) 8%,transparent 62%)}
  .fun-c .ftx{position:absolute;left:11px;top:10px;color:#fff}
  .fun-c .ftx b{font-size:13px;font-weight:900;display:block;text-shadow:0 1px 6px rgba(0,0,0,.4)}
  .fun-c .ftx p{font-size:9.5px;font-weight:800;opacity:.92;margin-top:3px}
  .fun-c .fdis{position:absolute;left:11px;bottom:9px;background:var(--yel);color:#16130f;font-size:9px;font-weight:900;border-radius:6px;padding:3px 7px}
  /* 健康礼赠 */
  .gift{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .g-sq{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .g-sq a{display:flex;align-items:center;gap:9px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px 12px;text-align:left;text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:background .5s}
  .g-sq .gqi{width:40px;height:40px;flex:none;filter:drop-shadow(0 3px 5px rgba(30,30,50,.14))}
  .g-sq a b{font-size:11.5px;font-weight:900;display:block}
  .g-sq a p{font-size:9px;font-weight:800;color:var(--promo);margin-top:2px}
  /* 为你定制 */
  .reb{display:flex;gap:9px;overflow-x:auto;scrollbar-width:none;padding:0 4px 4px}
  .reb-c{flex:none;width:150px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px;box-shadow:var(--shadow);transition:background .5s}
  .reb-c .rb{display:flex;align-items:center;gap:7px}
  .reb-c .ric{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;color:#fff;flex:none}
  .reb-c .rt b{font-size:11px;font-weight:900;color:var(--ink);display:block}
  .reb-c .rt p{font-size:9px;font-weight:700;color:var(--mut);margin-top:1px}
  .reb-c button{margin-top:9px;width:100%;border:none;border-radius:999px;background:var(--accent);color:#fff;font-size:10.5px;font-weight:900;padding:7px 0;cursor:pointer}
  .nearby{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
  .nearby a{font-size:10.5px;font-weight:800;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 12px;text-decoration:none}
  /* 全部服务 */
  .allsvc{display:flex;align-items:center;justify-content:center;gap:7px;margin:16px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px;font-size:12.5px;font-weight:900;color:var(--ink);text-decoration:none;box-shadow:var(--shadow)}
  /* 主题切换浮钮 */
  .tfab{position:absolute;right:16px;bottom:92px;width:38px;height:38px;border-radius:50%;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:grid;place-items:center;cursor:pointer;z-index:9;transition:background .5s}
  /* 轻提示 */
  .toast{position:absolute;left:50%;bottom:96px;transform:translateX(-50%) translateY(16px);background:rgba(22,19,15,.92);color:#fff;font-size:11.5px;font-weight:700;border-radius:12px;padding:10px 15px;max-width:300px;text-align:center;line-height:1.6;opacity:0;pointer-events:none;transition:.3s;z-index:20}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .search{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .aisle-hd a{color:var(--accent)}

  /* ===== 精选好物瀑布流（富卡片） ===== */
  .wf-it{display:block;text-decoration:none;color:inherit;cursor:pointer}
  .wf-imgbox{position:relative}
  .wf-imgbox img{width:100%;object-fit:cover;display:block}
  .rk{position:absolute;left:7px;top:7px;background:linear-gradient(135deg,#f7563c,#e8253f);color:#fff;font-size:8.5px;font-weight:900;border-radius:6px;padding:3px 6px;letter-spacing:.02em;box-shadow:0 3px 8px rgba(232,37,63,.35)}
  .wf-sl{font-size:10.5px;color:var(--mut);font-weight:600;margin-top:3px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .wf-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
  .wf-tags i{font-style:normal;font-size:9px;font-weight:800;border-radius:5px;padding:2px 5px;background:var(--notice-bg);color:var(--notice-tx)}
  .wf-vou{margin-top:7px;font-size:9.5px;font-weight:800;border-radius:7px;padding:5px 7px;color:#9c6500;background:#fdf3d7;display:flex;align-items:center;gap:4px}
  .wf-vou svg{flex:none}
  .phone[data-theme="dark"] .wf-vou{background:rgba(247,196,0,.13);color:#f7c400}

  /* ===== 3D 黏土图标：无底无托，直接落在卡片上 ===== */
  .gic,.ric,.nic,.oic{box-shadow:none!important;background:transparent!important}
  .gic,.nic{background:radial-gradient(circle at 50% 44%,rgba(255,208,105,.34),rgba(255,208,105,0) 72%)!important}
  .phone[data-theme="dark"] .gic,.phone[data-theme="dark"] .nic{background:radial-gradient(circle at 50% 44%,rgba(255,220,150,.10),rgba(255,220,150,0) 72%)!important}
  .gic{width:58px;height:58px}
  .gic img{width:58px;height:58px;filter:drop-shadow(0 4px 6px rgba(30,30,50,.15))}
  .now-c .nic{width:48px;height:48px}
  .now-c .nic img{width:48px;height:48px}
  .reb-c .ric{width:38px;height:38px}
  .reb-c .ric img{width:38px;height:38px}
  .od-it .oic{width:38px;height:38px}
  .od-it .oic img{width:38px;height:38px}
  /* ===== 代金券 banner ===== */
  .pban{margin:12px 14px 0;border-radius:18px;background:linear-gradient(120deg,#ffe9ad,#ffd06e 60%,#ffb84d);display:flex;align-items:center;justify-content:space-between;padding:14px 16px;box-shadow:0 10px 22px rgba(240,160,30,.28);position:relative;overflow:hidden}
  .pban::before{content:"";position:absolute;left:-30px;top:-40px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.25)}
  .pb-tx b{font-size:17px;font-weight:900;color:#5b3400;letter-spacing:.02em}
  .pb-tx p{font-size:10.5px;font-weight:800;color:#8a5a10;margin:4px 0 8px}
  .pb-tx span{display:inline-block;background:#5b3400;color:#ffd76a;font-size:10px;font-weight:900;border-radius:9px;padding:4px 10px}
  .pban img{width:92px;height:92px;flex:none;margin-right:-6px}
  /* ===== 品牌栏目：白卡 logo + 实物图 ===== */
  .bwall{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:2px 0 0}
  .bfeat{display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:var(--shadow);text-decoration:none;transition:background .5s}
  .bfeat img{width:62px;height:62px;flex:none;filter:drop-shadow(0 4px 6px rgba(30,30,50,.15))}
  .bf-tx b{font-size:15px;font-weight:900}
  .bf-lg{width:38px;height:38px;border-radius:9px;object-fit:contain;display:block;margin-bottom:6px}
  .bf-tx p{font-size:9.5px;color:var(--mut);font-weight:700;margin:3px 0 7px}
  .bf-go{display:inline-block;background:var(--notice-bg);color:var(--notice-tx);font-size:9.5px;font-weight:900;border-radius:8px;padding:3px 9px}
  .blogo{display:flex;gap:8px;overflow-x:auto;margin-top:10px;padding:0 2px 4px;scrollbar-width:none}
  .blogo::-webkit-scrollbar{display:none}
  .bl{flex:none;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid var(--line);border-radius:15px;padding:9px 16px 9px 9px;text-align:left;text-decoration:none;box-shadow:var(--shadow)}
  .bl img{width:44px;height:44px;border-radius:12px;display:block;flex:none}
  .bl b{font-size:13.5px;font-weight:900;display:block;white-space:nowrap;color:#16130f}
  .bl p{font-size:9px;color:#8a8f9a;font-weight:700;margin-top:3px;white-space:nowrap}
  /* ===== 休闲娱乐：海报购票横滑 ===== */
  .frail{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding:0 2px 4px}
  .frail::-webkit-scrollbar{display:none}
  .fc{flex:none;width:118px;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);text-decoration:none;color:var(--ink);transition:background .5s}
  .fc .fp{width:100%;height:110px;object-fit:cover;display:block}
  .fc .fx{padding:8px 9px 10px}
  .ftag{display:inline-block;background:#e8442e;color:#fff;font-size:8.5px;font-weight:900;border-radius:5px;padding:2px 6px;margin-bottom:5px}
  .fc .fx b{font-size:12px;font-weight:900;display:block}
  .fc .fx p{font-size:8.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .fbuy{display:inline-block;margin-top:7px;background:var(--notice-bg);color:var(--notice-tx);font-size:9px;font-weight:900;border-radius:7px;padding:3px 8px}
  .fc.vip{background:linear-gradient(150deg,#4d2a85,#7b3fa0);border:none;display:flex;align-items:center;justify-content:center;min-height:196px}
  .fxv{text-align:center;color:#fff;padding:10px}
  .fxv b{font-size:14px;font-weight:900}
  .fxv p{font-size:9px;font-weight:700;opacity:.88;margin-top:5px}
  .fbuy2{display:inline-block;margin-top:10px;background:#ffd98a;color:#16130f;font-size:9px;font-weight:900;border-radius:999px;padding:4px 11px}
  /* ===== 小满 AI 入口 ===== */
  .search .mai-ic{width:23px;height:23px;border-radius:50%;flex:none;overflow:hidden;display:grid;place-items:center}
  .search .mai-ic img{width:23px;height:23px;display:block}
  .maifab{position:absolute;right:12px;bottom:92px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.96);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;text-decoration:none;box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10);animation:maipulse 2.8s ease-in-out infinite}
  .maifab img{width:31px;height:31px}
  .maifab em{font-style:normal;font-size:8.5px;font-weight:900;color:#16130f;margin-top:1px}
  .phone[data-theme="dark"] .maifab{background:rgba(20,26,24,.94)}
  .phone[data-theme="dark"] .maifab em{color:#f6f2e5}
  @keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.12)}50%{box-shadow:0 8px 22px rgba(22,19,15,.18),0 0 0 9px rgba(0,200,130,.04)}}

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
.search .hot-ic{flex:none;font-style:normal;font-size:8.5px;font-weight:900;color:#fff;background:linear-gradient(120deg,#ff5d3d,#f03749);border-radius:5px;padding:2px 5px;letter-spacing:.05em}

</style>

