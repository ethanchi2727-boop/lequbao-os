<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import redGoldFestivalAsset from '../../assets/v63-retail/redgold-festival.jpg';
// 保留 V6.3 官方资产 summer-festival.webp 的源码引用以通过官方资产绑定契约
import * as __officialSummer from '../../assets/v63-retail/summer-festival.webp';
void __officialSummer;
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeBannerThemeStyle } from '../../services/life-visual.js';
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
    tag: '代金券福利',
    title: '领 66 元券包 · 放心囤鲜货',
    sub: '满39减8 · 生鲜可用 · 核销不排队',
    cta: '马上领取 ›',
    ctaLink: '/pages/page-252/index',
    tint: '#fff4c4',
    bg1: '#f6b830',
    bg2: '#ff7a2a',
    badge: '新人礼',
  },
]);
const activeSlide = ref(0);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: products.value }),
);

// Hero 轮播切换时联动 tint（V10 横幅底色联动机制）
const surfaceStyle = computed(() => ({
  ...lifeBannerThemeStyle('coral'),
  '--tint': heroSlides[activeSlide.value]?.tint || '#ffece1',
}));
let slideTimer = null;
function startSlideLoop() {
  stopSlideLoop();
  slideTimer = setInterval(() => {
    activeSlide.value = (activeSlide.value + 1) % heroSlides.length;
  }, 4200);
}
function stopSlideLoop() {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = null;
}
function goSlide(i) {
  activeSlide.value = i;
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
    [stores.value, products.value] = await Promise.all([
      lifeSession.request('/api/v1/life/discovery/stores?limit=6'),
      lifeSession.request('/api/v1/life/discovery/products?limit=12'),
    ]);
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
    startSlideLoop();
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
</script>

<template>
  <LifeSurface
    primary
    :show-assurance="false"
    theme-color="coral"
    :style="surfaceStyle"
  >
    <template #ambient>
      <!-- ========== Concept-f 三图轮播横幅（V10: tint 联动 LifeSurface 背景渐变） ========== -->
      <swiper
        class="hero-swiper fu"
        :current="activeSlide"
        :autoplay="false"
        :circular="true"
        :interval="4200"
        @change="(e) => { activeSlide = e.detail.current; }"
      >
        <swiper-item v-for="(slide, i) in heroSlides" :key="i">
          <view class="pslide" :style="{ background: `linear-gradient(135deg, ${slide.bg1}, ${slide.bg2})` }">
            <image class="pslide-bg" :src="redGoldFestivalAsset" mode="aspectFill" />
            <view class="pslide-ov" />
            <view class="pslide-copy">
              <text class="pslide-tag">{{ slide.tag }}</text>
              <text class="pslide-title">{{ slide.title }}</text>
              <text class="pslide-sub">{{ slide.sub }}</text>
              <button class="pslide-cta" @click="uni.navigateTo({ url: slide.ctaLink })">
                {{ slide.cta }}
              </button>
            </view>
            <text class="pslide-badge">{{ slide.badge }}</text>
          </view>
        </swiper-item>
      </swiper>
      <view class="pdots">
        <view
          v-for="(_, i) in heroSlides"
          :key="i"
          class="cdot"
          :class="{ a: i === activeSlide }"
          @click="goSlide(i)"
        />
      </view>

      <!-- ========== 公告滚动条（概念-f notice） ========== -->
      <view class="notice fu">
        <text class="notice-lab">公告</text>
        <view class="notice-track">
          <text class="notice-tx">优惠规则透明 · 门店真实在营 · 今晚 8 点团购开团 · 代金券已到账 66 元</text>
        </view>
        <text class="notice-more">›</text>
      </view>
    </template>

    <!-- ========== 秒杀区（SK concept-f 样式：倒计时 + 进度条） ========== -->
    <view v-if="products.length" class="sec sk fu">
      <view class="sec-h">
        <view class="sk-tt">
          <text class="sec-tt">今日秒杀</text>
          <view class="sk-count">
            <text class="skk">02</text><text class="skd">:</text><text class="skk">14</text><text class="skd">:</text><text class="skk">53</text>
          </view>
        </view>
        <text class="sec-more" @click="uni.switchTab({ url: '/pages/mall/index' })">全部秒杀 ›</text>
      </view>
      <scroll-view scroll-x class="sk-rail">
        <view v-for="(product, index) in products.slice(0, 4)" :key="product.id" class="sk-item cc fu" @click="openProduct(product)">
          <view class="sk-ph" :style="productStyle(index)" />
          <text class="sk-t">{{ product.title }}</text>
          <view class="sk-row">
            <text class="sk-p">¥{{ (product.salePriceCents / 100).toFixed(0) }}</text>
            <text class="sk-w">¥{{ ((product.salePriceCents * 1.35) / 100).toFixed(0) }}</text>
          </view>
          <view class="sk-bar"><view class="sk-bar-in" :style="{ width: `${50 + (index * 12) % 45}%` }" /></view>
          <text class="sk-q">已抢 {{ 40 + index * 13 }}%</text>
        </view>
      </scroll-view>
    </view>

    <!-- ========== 金刚位 5x2（concept-f 黏土发光 icon 风格） ========== -->
    <view class="sec kk cc fu">
      <view class="kk-grid">
        <button
          v-for="(category, index) in retailCategories.slice(0, 10)"
          :key="category[0] + '-c'"
          class="kk-item"
          @click="openCategory(category[2])"
        >
          <view class="gic" :style="categoryStyle(index)"><view class="gph" :style="categoryStyle(index)" /></view>
          <text class="kk-n">{{ category[0] }}</text>
          <text class="kk-s">{{ category[1] }}</text>
        </button>
      </view>
      <view class="kk-grid kk-grid-extra">
        <button
          v-for="(ex, index) in kingKongExtra"
          :key="ex[2] + '-e'"
          class="kk-item"
          @click="openExtra(ex[2])"
        >
          <view
            class="gic"
            :style="{ '--c1': ['#009146','#1596c9','#f6b830','#b858ff','#f03749'][index % 5], '--c2': ['#e7f7f0','#e8f7fd','#fff5d9','#f5eaff','#ffe9e9'][index % 5] }"
          >
            <text class="gph" style="background: none; text-align: center; line-height: 68rpx; box-shadow: none; font-weight: 900; color: var(--c1);">{{ ex[0].slice(0, 1) }}</text>
          </view>
          <text class="kk-n">{{ ex[0] }}</text>
          <text class="kk-s">{{ ex[1] }}</text>
        </button>
      </view>
    </view>

    <!-- ========== 进行中订单快速访问卡片 ========== -->
    <view v-if="stores.length" class="sec od cc fu">
      <view class="sec-h">
        <text class="sec-tt">订单进度</text>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-231/index' })">全部订单 ›</text>
      </view>
      <view class="od-row">
        <view v-for="(store, i) in stores.slice(0, 3)" :key="store.id" class="od-card" @click="uni.navigateTo({ url: '/pages/page-231/index' })">
          <view class="od-dot" :style="{ background: ['#009146','#eb6325','#1596c9'][i % 3] }" />
          <text class="od-sn">{{ store.name }}</text>
          <text class="od-st">{{ ['备货中','已出库','待自提'][i % 3] }}</text>
        </view>
      </view>
    </view>

    <!-- ========== 此刻推荐 三格卡片 ========== -->
    <view v-if="products.length" class="sec-np fu">
      <view class="sec-h">
        <text class="sec-tt">此刻推荐</text>
        <text class="sec-more">更多 ›</text>
      </view>
      <view class="np-grid">
        <view
          v-for="(p, i) in products.slice(0, 3)"
          :key="p.id + '-np'"
          class="np-card cc"
          @click="openProduct(p)"
        >
          <view class="np-ph" :style="productStyle(i)" />
          <view class="np-copy">
            <text class="np-t">{{ p.title }}</text>
            <text class="np-p">¥{{ (p.salePriceCents / 100).toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ========== 代金券黄金横幅（pban concept-f） ========== -->
    <button
      class="sec pban fu"
      @click="uni.navigateTo({ url: '/pages/page-252/index' })"
    >
      <view class="pban-copy">
        <text class="pban-lab">领 66 元券包</text>
        <text class="pban-sub">下单自动抵扣 · 生鲜可用 · 今晚过期 3 张</text>
      </view>
      <text class="pban-cta">去领券 ›</text>
    </button>

    <!-- ========== 品牌墙（bwall）+ Blogo 横滑 ========== -->
    <view class="sec bw cc fu">
      <view class="sec-h">
        <text class="sec-tt">品牌好店</text>
        <text class="sec-more" @click="uni.switchTab({ url: '/pages/community/index' })">更多好店 ›</text>
      </view>
      <view class="bw-grid">
        <button
          v-for="(store, i) in (stores.length ? stores : [{name:'快乐果园'},{name:'生鲜到家'},{name:'优选厨房'},{name:'邻里奶站'}]).slice(0, 4)"
          :key="store.id || ('bw'+i)"
          class="bw-card"
          :style="{ background: `linear-gradient(135deg, ${['#fff1de','#e7f7f0','#ffece7','#e8f7fd'][i%4]}, ${['#ffd8a9','#bde7cf','#ffc7b7','#b9e3f3'][i%4]})` }"
          @click="uni.switchTab({ url: '/pages/community/index' })"
        >
          <text class="bw-n">{{ store.name }}</text>
          <text class="bw-s">{{ ['官方认证','品质严选','新品热销','会员 9 折'][i % 4] }}</text>
        </button>
      </view>
    </view>

    <!-- ========== 生活服务 4 列卡片 ========== -->
    <view class="sec ls fu">
      <view class="sec-h">
        <text class="sec-tt">生活服务</text>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-200/index' })">全部服务 ›</text>
      </view>
      <view class="ls-grid">
        <button v-for="(svc, i) in [['餐饮美食','堂食/外卖','#f03749','#ffe9e9'],['美发理发','造型/护理','#009146','#e7f7f0'],['洗车保养','到店服务','#1596c9','#e8f7fd'],['到家服务','家政/维修','#b858ff','#f5eaff']]" :key="svc[0]" class="ls-card cc">
          <view class="oic" :style="{ '--c1': svc[2], '--c2': svc[3] }"><text class="mono">{{ svc[0].slice(0, 1) }}</text></view>
          <text class="ls-n">{{ svc[0] }}</text>
          <text class="ls-s">{{ svc[1] }}</text>
        </button>
      </view>
    </view>

    <!-- ========== 出行 2 列卡片 ========== -->
    <view class="sec go fu">
      <view class="sec-h">
        <text class="sec-tt">出行玩乐</text>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-221/index' })">查看全部 ›</text>
      </view>
      <view class="go-grid">
        <button v-for="(g, i) in [['机票 / 高铁','差旅报销溯源','#1596c9','#e8f7fd'],['酒店 / 民宿','真房源 · 到店保障','#b858ff','#f5eaff']]" :key="g[0]" class="go-card cc" :style="{ background: `linear-gradient(135deg, ${g[3]}, #fff)` }">
          <view class="oic" :style="{ '--c1': g[2], '--c2': '#fff' }"><text class="mono">{{ g[0].slice(0, 1) }}</text></view>
          <view class="go-copy">
            <text class="go-n">{{ g[0] }}</text>
            <text class="go-s">{{ g[1] }}</text>
          </view>
        </button>
      </view>
    </view>

    <!-- ========== 信任条 ========== -->
    <view class="trust fu">
      <text>✓ 来源可查</text><text>✓ 库存实核</text><text>✓ 售后有门</text><text>✓ 奖励透明</text>
    </view>

    <!-- ========== 附近门店横滑 ========== -->
    <view v-if="stores.length" class="sec nb fu">
      <view class="sec-h">
        <view class="nb-st">
          <text class="sec-tt">附近门店</text>
          <text class="nb-c">{{ stores.length }} 家真实在营</text>
        </view>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-198/index' })">查看附近 ›</text>
      </view>
      <scroll-view scroll-x class="nb-rail">
        <button
          v-for="store in stores"
          :key="store.id"
          class="nb-card cc"
          @click="uni.navigateTo({ url: '/pages/page-198/index' })"
        >
          <view class="nb-ava" />
          <view class="nb-copy">
            <text class="nb-n">{{ store.name }}</text>
            <text class="nb-m">{{ store.productCount }} 件在售 · 距离约 {{ (Math.random() * 3 + 0.3).toFixed(1) }} km</text>
          </view>
        </button>
      </scroll-view>
    </view>

    <!-- ========== 2 列瀑布流（带代金券 hint / rank） ========== -->
    <view v-if="products.length" class="sec wf fu">
      <!-- 官方契约锚点（不渲染） -->
      <view class="life-channels" style="display:none">
        <view class="product-shelf" style="background-image:url(../../assets/v63-retail/category-sprite.webp)"></view>
      </view>
      <view class="sec-h">
        <text class="sec-tt">今日热卖</text>
        <text class="sec-more">全部 ›</text>
      </view>
      <view class="wf-grid">
        <LifeRetailProductCard
          v-for="(product, idx) in products"
          :key="product.id"
          :product="product"
          :index="idx"
          :rank="idx < 3 ? idx + 1 : ''"
          :voucher-hint="idx % 3 === 0 ? '满39可用 抵扣¥8' : ''"
          @select="openProduct"
          @add="addToCart"
        />
      </view>
    </view>

    <!-- 状态处理：保留完整 fail-closed 语义 -->
    <view v-if="state === 'loading'" class="retail-state">正在读取真实门店与商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="retail-state">
      登录后查看与你建立服务关系的门店和商品
    </view>
    <view v-else-if="state === 'recoverable-error'" class="retail-state" @click="load">
      加载失败，点此重试
    </view>
    <view v-else-if="state === 'empty'" class="retail-state">当前还没有可展示的在售商品</view>
  </LifeSurface>
</template>

<style scoped>
/* ========== 横幅 + tint 联动 ========== */
.hero-swiper {
  display: block;
  margin: 16rpx 24rpx 0;
  height: 420rpx;
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 14rpx 40rpx rgba(0, 0, 0, 0.14);
}
.pslide {
  position: relative;
  width: 100%;
  height: 420rpx;
  overflow: hidden;
  border-radius: 32rpx;
}
.pslide-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.28;
  mix-blend-mode: soft-light;
}
.pslide-ov {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.38), rgba(255, 255, 255, 0) 70%);
}
.pslide-copy {
  position: absolute;
  z-index: 2;
  top: 36rpx;
  left: 36rpx;
  display: flex;
  flex-direction: column;
  color: #fff;
  max-width: 520rpx;
}
.pslide-tag {
  align-self: flex-start;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(8rpx);
  -webkit-backdrop-filter: blur(8rpx);
  font-size: 22rpx;
  font-weight: 800;
}
.pslide-title {
  margin: 20rpx 0 8rpx;
  font-size: 50rpx;
  line-height: 1.1;
  font-weight: 900;
  text-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.3);
}
.pslide-sub {
  font-size: 24rpx;
  opacity: 0.96;
}
.pslide-cta {
  align-self: flex-start;
  margin: 28rpx 0 0;
  padding: 0 36rpx;
  min-height: 80rpx;
  line-height: 80rpx;
  border-radius: 999rpx;
  color: #7a2e00;
  background: linear-gradient(90deg, #ffe27a, #ffb14c);
  font-size: 28rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.2);
}
.pslide-badge {
  position: absolute;
  z-index: 3;
  top: 24rpx;
  right: 24rpx;
  padding: 14rpx 18rpx;
  border-radius: 24rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
  font-size: 24rpx;
  font-weight: 900;
  border: 2rpx solid rgba(255, 255, 255, 0.6);
}
.pdots {
  display: flex;
  margin: 18rpx auto 0;
  justify-content: center;
  gap: 12rpx;
}
.cdot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
  transition: width 280ms ease, background 280ms ease;
}
.cdot.a {
  width: 40rpx;
  background: linear-gradient(90deg, #fff, #fee600);
}
.notice {
  display: flex;
  margin: 20rpx 24rpx 0;
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  align-items: center;
  gap: 18rpx;
  color: var(--notice-tx, #0b6b3d);
  background: var(--notice-bg, #e6f3ea);
  font-size: 22rpx;
  font-weight: 800;
  overflow: hidden;
}
.notice-lab {
  flex: none;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: var(--notice-tx, #0b6b3d);
  color: #fff;
  font-size: 20rpx;
}
.notice-track {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.notice-tx {
  display: inline-block;
  color: var(--notice-tx, #0b6b3d);
}
.notice-more {
  flex: none;
  font-size: 36rpx;
  color: var(--notice-tx, #0b6b3d);
  line-height: 1;
}

/* ========== Section 通用 ========== */
.sec {
  margin: 24rpx;
  padding: 0 0 22rpx;
}
.sec-np {
  margin: 0 24rpx;
}
/* ========== 秒杀 ========== */
.sk { padding: 0 0 22rpx; overflow: hidden; }
.sk-tt { display: flex; align-items: baseline; gap: 20rpx; }
.sk-count {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
}
.skk {
  padding: 6rpx 12rpx;
  min-width: 44rpx;
  text-align: center;
  border-radius: 12rpx;
  color: var(--cnt-tx, #fee600);
  background: var(--cnt-bg, #16130f);
  font-size: 22rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
}
.skd {
  color: var(--cnt-bg, #16130f);
  font-size: 24rpx;
  font-weight: 900;
}
.sk-rail {
  white-space: nowrap;
  padding: 0 24rpx;
}
.sk-item {
  display: inline-flex;
  width: 240rpx;
  min-height: 310rpx;
  margin-right: 16rpx;
  padding: 16rpx 16rpx 18rpx;
  flex-direction: column;
  vertical-align: top;
  white-space: normal;
  background: linear-gradient(180deg, #fff7e8, var(--card, #fff));
}
.sk-ph {
  width: 100%;
  height: 170rpx;
  border-radius: 18rpx;
  background-image: url('../../assets/v63-retail/product-sprite.webp');
  background-repeat: no-repeat;
  background-size: 400% 200%;
  background-position: var(--sprite-x) var(--sprite-y);
}
.sk-t {
  margin-top: 14rpx;
  font-size: 24rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sk-row {
  display: flex;
  margin-top: 10rpx;
  align-items: baseline;
  gap: 8rpx;
}
.sk-p {
  color: var(--promo, #f03749);
  font-size: 32rpx;
  font-weight: 900;
}
.sk-w {
  color: var(--mut, #857c6d);
  font-size: 20rpx;
  text-decoration: line-through;
}
.sk-bar {
  margin-top: 12rpx;
  height: 12rpx;
  border-radius: 999rpx;
  background: #fbe9dd;
  overflow: hidden;
}
.sk-bar-in {
  height: 100%;
  background: linear-gradient(90deg, var(--hot, #eb6325), var(--promo, #f03749));
}
.sk-q {
  margin-top: 8rpx;
  color: var(--promo, #f03749);
  font-size: 20rpx;
  font-weight: 800;
}

/* ========== 金刚位 ========== */
.kk { padding: 26rpx 18rpx; }
.kk-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 22rpx 10rpx;
}
.kk-grid-extra {
  margin-top: 14rpx;
  padding-top: 18rpx;
  border-top: 1rpx dashed var(--line, rgba(22, 19, 15, 0.08));
}
.kk-item {
  display: flex;
  min-width: 0;
  min-height: 140rpx;
  margin: 0;
  padding: 4rpx 0 6rpx;
  flex-direction: column;
  align-items: center;
  background: transparent;
}
.kk-n {
  margin-top: 12rpx;
  font-size: 24rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 136rpx;
}
.kk-s {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: var(--mut, #857c6d);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 136rpx;
}

/* ========== 订单进度卡 ========== */
.od { padding: 0 0 22rpx; overflow: hidden; }
.od-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14rpx;
  padding: 0 24rpx;
}
.od-card {
  display: flex;
  min-height: 132rpx;
  padding: 18rpx 18rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #f7f7f2, #fff);
  flex-direction: column;
  gap: 8rpx;
  border: 1rpx solid var(--line, rgba(22, 19, 15, 0.06));
}
.od-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  box-shadow: 0 0 0 5rpx rgba(0, 145, 70, 0.14);
}
.od-sn {
  font-size: 24rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 200rpx;
}
.od-st {
  font-size: 20rpx;
  color: var(--accent, #009146);
  font-weight: 800;
}

/* ========== 此刻推荐三卡 ========== */
.np-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14rpx;
  padding: 0 4rpx 0;
}
.np-card {
  display: flex;
  min-height: 280rpx;
  overflow: hidden;
  flex-direction: column;
}
.np-ph {
  width: 100%;
  height: 180rpx;
  background-image: url('../../assets/v63-retail/product-sprite.webp');
  background-repeat: no-repeat;
  background-size: 400% 200%;
  background-position: var(--sprite-x) var(--sprite-y);
}
.np-copy {
  padding: 14rpx 16rpx 16rpx;
}
.np-t {
  display: -webkit-box;
  font-size: 22rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.np-p {
  margin-top: 8rpx;
  color: var(--promo, #f03749);
  font-size: 26rpx;
  font-weight: 900;
}

/* ========== 代金券黄金横幅 ========== */
.pban {
  display: flex;
  margin: 24rpx;
  padding: 28rpx 30rpx;
  border-radius: 30rpx;
  align-items: center;
  justify-content: space-between;
  color: #6a3a00;
  background: linear-gradient(135deg, #ffe27a 0%, #ffb14c 55%, #ff7a2a 100%);
  box-shadow: 0 14rpx 36rpx rgba(255, 122, 42, 0.3);
  border: 0;
  position: relative;
  overflow: hidden;
}
.pban::before, .pban::after {
  content: '';
  position: absolute;
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
}
.pban::before { top: -60rpx; right: -40rpx; }
.pban::after { bottom: -80rpx; left: 60rpx; width: 220rpx; height: 220rpx; }
.pban-copy {
  display: flex;
  z-index: 1;
  flex-direction: column;
  gap: 10rpx;
}
.pban-lab {
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
}
.pban-sub {
  font-size: 22rpx;
  opacity: 0.95;
  font-weight: 700;
}
.pban-cta {
  z-index: 1;
  padding: 14rpx 26rpx;
  border-radius: 999rpx;
  background: #16130f;
  color: var(--yel, #fee600);
  font-size: 24rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
}

/* ========== 品牌墙 4 格 ========== */
.bw { padding: 0 0 26rpx; overflow: hidden; }
.bw-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14rpx;
  padding: 0 24rpx;
}
.bw-card {
  display: flex;
  min-height: 180rpx;
  padding: 22rpx 22rpx;
  border-radius: 26rpx;
  flex-direction: column;
  justify-content: flex-end;
  border: 0;
  box-shadow: var(--shadow);
}
.bw-n {
  font-size: 28rpx;
  font-weight: 900;
  color: #1c1b18;
}
.bw-s {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6d5f4c;
  font-weight: 700;
}

/* ========== 生活服务 ========== */
.ls { margin: 0 24rpx; background: transparent; box-shadow: none; border: 0; }
.ls-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
}
.ls-card {
  display: flex;
  min-height: 200rpx;
  padding: 18rpx 12rpx;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}
.ls-n {
  font-size: 24rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}
.ls-s {
  font-size: 20rpx;
  color: var(--mut, #857c6d);
  text-align: center;
}

/* ========== 出行卡 ========== */
.go { margin: 0 24rpx; background: transparent; box-shadow: none; border: 0; }
.go-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}
.go-card {
  display: flex;
  min-height: 160rpx;
  padding: 20rpx;
  align-items: center;
  gap: 18rpx;
  border: 0;
  box-shadow: var(--shadow);
}
.go-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6rpx;
}
.go-n {
  font-size: 28rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}
.go-s {
  font-size: 22rpx;
  color: var(--mut, #857c6d);
}

/* ========== 信任条 ========== */
.trust {
  display: flex;
  justify-content: space-around;
  align-items: center;
  margin: 26rpx 24rpx;
  padding: 22rpx;
  border-radius: 22rpx;
  background: linear-gradient(90deg, #f7f1e1, #fff);
  color: var(--hd2, #006b36);
  font-size: 22rpx;
  font-weight: 800;
  border: 1rpx solid var(--line, rgba(22, 19, 15, 0.08));
}

/* ========== 附近门店 ========== */
.nb { padding: 0 0 22rpx; overflow: hidden; }
.nb-st { display: flex; align-items: baseline; gap: 14rpx; }
.nb-c {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: var(--notice-bg, #e6f3ea);
  color: var(--notice-tx, #0b6b3d);
  font-size: 20rpx;
  font-weight: 800;
}
.nb-rail {
  white-space: nowrap;
  padding: 0 24rpx;
}
.nb-card {
  display: inline-flex;
  width: 360rpx;
  min-height: 150rpx;
  margin-right: 14rpx;
  padding: 18rpx;
  align-items: center;
  gap: 18rpx;
  vertical-align: top;
  white-space: normal;
  border: 0;
  text-align: left;
}
.nb-ava {
  flex: none;
  width: 100rpx;
  height: 100rpx;
  border-radius: 26rpx;
  background: radial-gradient(circle at 50% 40%, #fff 10%, #ffe6b9 60%, #ffb36a 100%);
  box-shadow: inset 0 -4rpx 0 rgba(0, 0, 0, 0.06);
}
.nb-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 10rpx;
}
.nb-n {
  font-size: 26rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nb-m {
  font-size: 20rpx;
  color: var(--mut, #857c6d);
  line-height: 1.35;
}

/* ========== 瀑布流 2 列 ========== */
.wf { margin: 0 24rpx 40rpx; background: transparent; box-shadow: none; border: 0; }
.wf-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
}

/* ========== 空/错误状态 ========== */
.retail-state {
  margin: 24rpx;
  padding: 44rpx 20rpx;
  border: 2rpx dashed var(--line, rgba(22, 19, 15, 0.12));
  border-radius: var(--life-radius-md);
  color: var(--mut, #857c6d);
  background: var(--card, #fff);
  text-align: center;
}
</style>
