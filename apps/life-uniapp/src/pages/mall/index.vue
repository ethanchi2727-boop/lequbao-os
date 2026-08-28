<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
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
const surfaceStyle = computed(() => ({ '--tint': mallSlides[activeSlide.value]?.tint || '#dff0d4' }));

const filteredProducts = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return products.value;
  return products.value.filter((product) =>
    [product.title, product.storeName, product.variantTitle]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword)),
  );
});
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: products.value }),
);

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
</script>

<template>
  <LifeSurface
    primary
    :show-assurance="false"
    theme-color="coral"
    :style="surfaceStyle"
  >
    <template #ambient>
      <!-- 三图轮播横幅（商城绿/蓝/紫 tint） -->
      <swiper
        class="hero-swiper fu"
        :current="activeSlide"
        :autoplay="true"
        :circular="true"
        :interval="4200"
        @change="(e) => { activeSlide = e.detail.current; }"
      >
        <swiper-item v-for="(slide, i) in mallSlides" :key="i">
          <view class="pslide" :style="{ background: `linear-gradient(135deg, ${slide.bg1}, ${slide.bg2})` }">
            <view class="pslide-ov" />
            <view class="pslide-copy">
              <text class="pslide-tag">{{ slide.tag }}</text>
              <text class="pslide-title">{{ slide.title }}</text>
              <text class="pslide-sub">{{ slide.sub }}</text>
              <button class="pslide-cta" @click="uni.navigateTo({ url: slide.ctaLink })">{{ slide.cta }}</button>
            </view>
            <text class="pslide-badge">{{ slide.badge }}</text>
          </view>
        </swiper-item>
      </swiper>
      <view class="pdots">
        <view
          v-for="(_, i) in mallSlides"
          :key="i"
          class="cdot"
          :class="{ a: i === activeSlide }"
          @click="activeSlide = i"
        />
      </view>
      <!-- 公告条 -->
      <view class="notice fu">
        <text class="notice-lab">商城公告</text>
        <view class="notice-track">
          <text class="notice-tx">在售实核 · 库存同步 · 满 99 包邮 · 会员多享 5% 积分</text>
        </view>
        <text class="notice-more">›</text>
      </view>
    </template>

    <!-- 搜索栏（保留 v-model 完整契约） -->
    <view class="retail-search fu">
      <text class="s-ic">⌕</text>
      <input
        v-model="query"
        confirm-type="search"
        placeholder="搜索商品、规格或门店"
        aria-label="搜索商城商品"
        class="s-in"
      />
      <button v-if="query" class="s-clr" @click="query = ''">清除</button>
    </view>

    <!-- 秒杀 SK：进度条 + 倒计时 -->
    <view v-if="products.length" class="sec sk cc fu">
      <view class="sec-h">
        <view class="sk-tt">
          <text class="sec-tt">商城秒杀</text>
          <view class="sk-count">
            <text class="skk">01</text><text class="skd">:</text><text class="skk">58</text><text class="skd">:</text><text class="skk">20</text>
          </view>
        </view>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-213/index' })">抢购 ›</text>
      </view>
      <scroll-view scroll-x class="sk-rail">
        <view v-for="(product, index) in products.slice(0, 3)" :key="product.id" class="sk-item" @click="selectedProduct = product">
          <view class="sk-ph" :style="productStyle(index)" />
          <text class="sk-t">{{ product.title }}</text>
          <view class="sk-row">
            <text class="sk-p">¥{{ (product.salePriceCents / 100).toFixed(0) }}</text>
            <text class="sk-w">¥{{ ((product.salePriceCents * 1.35) / 100).toFixed(0) }}</text>
          </view>
          <view class="sk-bar"><view class="sk-bar-in" :style="{ width: `${40 + (index * 18) % 55}%` }" /></view>
          <text class="sk-q">已抢 {{ 40 + index * 20 }}%</text>
        </view>
      </scroll-view>
    </view>

    <!-- 分类照片墙 4x2 (8 大入口) -->
    <view class="sec cats fu">
      <view class="sec-h">
        <text class="sec-tt">分类选购</text>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-200/index' })">全部分类 ›</text>
      </view>
      <view class="cats-grid">
        <button
          v-for="(cat, i) in [['水果鲜蔬','/pages/page-201/index?category=fresh'],['肉禽蛋','/pages/page-201/index?category=fresh'],['乳品烘焙','/pages/page-201/index?category=fresh'],['家清纸品','/pages/page-201/index?category=home'],['粮油调味','/pages/page-201/index?category=home'],['酒水饮料','/pages/page-201/index?category=home'],['母婴萌宠','/pages/page-201/index?category=home'],['鲜花礼品','/pages/page-201/index?category=leisure']]"
          :key="cat[0]"
          class="cat-card"
          :style="categoryStyle(i)"
          @click="uni.navigateTo({ url: cat[1] })"
        >
          <view class="gic" :style="categoryStyle(i)"><view class="gph" :style="categoryStyle(i)" /></view>
          <text class="cat-n">{{ cat[0] }}</text>
        </button>
      </view>
    </view>

    <!-- 多分区货架：蔬菜鲜果 / 肉禽蛋奶 + chip icon 标题 -->
    <view v-if="products.length" class="sec aisle cc fu">
      <view class="aisle-h">
        <view class="aisle-chip" style="background: #e7f7f0; color: #006b36;">
          <text class="chip-ico">🥬</text>
          <text>蔬菜鲜果</text>
        </view>
        <text class="aisle-more" @click="uni.navigateTo({ url: '/pages/page-201/index?category=fresh' })">更多 ›</text>
      </view>
      <view class="aisle-grid">
        <LifeRetailProductCard
          v-for="(p, i) in products.slice(0, 2)"
          :key="'a1-'+p.id"
          :product="p"
          :index="i"
          compact
          @select="(x) => { selectedProduct = x; }"
          @add="addToCart"
        />
      </view>
    </view>

    <view v-if="products.length" class="sec aisle cc fu">
      <view class="aisle-h">
        <view class="aisle-chip" style="background: #fff2df; color: #a24b15;">
          <text class="chip-ico">🥚</text>
          <text>肉禽蛋奶</text>
        </view>
        <text class="aisle-more" @click="uni.navigateTo({ url: '/pages/page-201/index?category=fresh' })">更多 ›</text>
      </view>
      <view class="aisle-grid">
        <LifeRetailProductCard
          v-for="(p, i) in products.slice(2, 4)"
          :key="'a2-'+p.id"
          :product="p"
          :index="i + 2"
          compact
          @select="(x) => { selectedProduct = x; }"
          @add="addToCart"
        />
      </view>
    </view>

    <!-- 邻里拼一单（团购卡片） -->
    <view v-if="products.length" class="sec tg fu" @click="uni.navigateTo({ url: '/pages/page-213/index' })">
      <view class="tg-card cc">
        <view class="tg-ph" />
        <view class="tg-copy">
          <text class="tg-lab">邻里拼一单</text>
          <text class="tg-t">{{ products[0]?.title || '爆款源头好货' }}</text>
          <text class="tg-s">2 人成团 · 立省 30% · 自提柜次日取</text>
          <view class="tg-row">
            <text class="tg-p">¥{{ products[0] ? ((products[0].salePriceCents * 0.7) / 100).toFixed(2) : '0.00' }}</text>
            <text class="tg-w">单买价 ¥{{ products[0] ? (products[0].salePriceCents / 100).toFixed(2) : '0.00' }}</text>
          </view>
          <view class="tg-bar"><view class="tg-bar-in" style="width: 72%;" /></view>
          <text class="tg-q">已拼 72% · 差 1 人成团</text>
        </view>
      </view>
    </view>

    <!-- 4 通道横滑标签条（保留全部/家庭采购/本地好物/品质严选契约） -->
    <scroll-view scroll-x class="channel-scroll fu">
      <button
        v-for="channel in channels"
        :key="channel"
        :class="{ active: activeChannel === channel }"
        @click="activeChannel = channel"
      >
        {{ channel }}
      </button>
    </scroll-view>

    <!-- 状态处理 fail-closed -->
    <view v-if="state === 'loading'" class="retail-state">正在读取真实商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="retail-state">登录后查看商城</view>
    <view v-else-if="state === 'forbidden'" class="retail-state">当前账户无权查看该商城</view>
    <view v-else-if="state === 'recoverable-error'" class="retail-state" @click="load">加载失败，点此重试</view>
    <view v-else-if="state === 'empty'" class="retail-state">当前没有在售实物商品</view>

    <!-- 瀑布流推荐（LifeRetailProductCard 带 代金券 hint 增强） -->
    <view v-else class="sec wf fu">
      <view class="sec-h">
        <view class="wf-tt">
          <text class="sec-tt">好物推荐</text>
          <text class="wf-n">{{ filteredProducts.length }} 件实时在售</text>
        </view>
        <text class="sec-more" @click="uni.navigateTo({ url: '/pages/page-207/index' })">精选 ›</text>
      </view>
      <view v-if="filteredProducts.length" class="goods-grid">
        <LifeRetailProductCard
          v-for="(product, index) in filteredProducts"
          :key="product.id"
          :product="product"
          :index="index"
          :rank="index < 2 ? index + 1 : ''"
          :voucher-hint="index % 4 === 1 ? '满99减18' : (index % 3 === 0 ? '满39抵扣8' : '')"
          @select="(x) => { selectedProduct = x; }"
          @add="addToCart"
        />
      </view>
      <view v-else class="retail-state">没有匹配的在售商品，换个关键词试试</view>
    </view>

    <!-- 商品详情 sheet（完整保留原契约，升级视觉） -->
    <view v-if="selectedProduct" class="product-sheet" @click="selectedProduct = null">
      <view class="product-sheet-card cc" @click.stop>
        <view class="sheet-ph" :style="productStyle(products.indexOf(selectedProduct))" />
        <text class="sheet-kicker">{{ selectedProduct.storeName }}</text>
        <text class="sheet-title">{{ selectedProduct.title }}</text>
        <text class="sheet-copy">{{ selectedProduct.variantTitle }} · 当前可售 {{ selectedProduct.availableQuantity }} 件</text>
        <view class="trace-note"><text>来源与规则</text><text>门店、在售状态、当前规格与库存均来自服务端实时投影。</text></view>
        <view class="sheet-action">
          <text>¥{{ (selectedProduct.salePriceCents / 100).toFixed(2) }}</text>
          <button :disabled="selectedProduct.availableQuantity < 1" @click="addToCart(selectedProduct)">加入购物车</button>
        </view>
        <button class="sheet-detail" @click="openProductDetail(selectedProduct)">查看完整详情与规格</button>
        <button class="sheet-close" @click="selectedProduct = null">关闭详情</button>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
/* ========== 横幅（商城 tint） ========== */
.hero-swiper {
  display: block;
  margin: 16rpx 24rpx 0;
  height: 380rpx;
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 14rpx 40rpx rgba(0, 0, 0, 0.14);
}
.pslide {
  position: relative;
  width: 100%;
  height: 380rpx;
  overflow: hidden;
  border-radius: 32rpx;
}
.pslide-ov {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.3), rgba(255, 255, 255, 0) 70%);
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
  font-size: 22rpx;
  font-weight: 800;
}
.pslide-title {
  margin: 20rpx 0 8rpx;
  font-size: 46rpx;
  line-height: 1.12;
  font-weight: 900;
  text-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.28);
}
.pslide-sub {
  font-size: 24rpx;
  opacity: 0.95;
}
.pslide-cta {
  align-self: flex-start;
  margin: 26rpx 0 0;
  padding: 0 34rpx;
  min-height: 78rpx;
  line-height: 78rpx;
  border-radius: 999rpx;
  color: #1c1b18;
  background: linear-gradient(90deg, #ffe27a, #fff);
  font-size: 28rpx;
  font-weight: 900;
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.2);
  border: 0;
}
.pslide-badge {
  position: absolute;
  z-index: 3;
  top: 24rpx;
  right: 24rpx;
  padding: 12rpx 16rpx;
  border-radius: 22rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10rpx);
  font-size: 22rpx;
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
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
  transition: width 280ms ease, background 280ms ease;
}
.cdot.a {
  width: 40rpx;
  background: linear-gradient(90deg, #fff, #009146);
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
.notice-more {
  flex: none;
  font-size: 36rpx;
  line-height: 1;
}

/* ========== 搜索 ========== */
.retail-search {
  display: flex;
  margin: 20rpx 24rpx 0;
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  align-items: center;
  gap: 14rpx;
  background: var(--card, #fff);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line, rgba(22,19,15,0.08));
}
.s-ic {
  color: var(--accent, #009146);
  font-size: 38rpx;
  font-weight: 700;
}
.s-in {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: var(--ink, #16130f);
}
.s-clr {
  margin: 0;
  padding: 0 16rpx;
  min-height: 56rpx;
  line-height: 56rpx;
  border-radius: 999rpx;
  background: #ffe7e3;
  color: var(--promo, #f03749);
  font-size: 22rpx;
  font-weight: 800;
}

/* ========== Section ========== */
.sec {
  margin: 24rpx;
  padding: 0 0 22rpx;
  overflow: hidden;
}
.sk { padding: 0 0 22rpx; }
.sk-tt { display: flex; align-items: baseline; gap: 20rpx; }
.sk-count { display: inline-flex; align-items: center; gap: 6rpx; }
.skk {
  padding: 6rpx 12rpx;
  min-width: 44rpx;
  text-align: center;
  border-radius: 12rpx;
  color: var(--cnt-tx, #fee600);
  background: var(--cnt-bg, #16130f);
  font-size: 22rpx;
  font-weight: 900;
}
.skd { color: var(--cnt-bg, #16130f); font-size: 24rpx; font-weight: 900; }
.sk-rail { white-space: nowrap; padding: 0 24rpx; }
.sk-item {
  display: inline-flex;
  width: 280rpx;
  min-height: 330rpx;
  margin-right: 16rpx;
  padding: 16rpx;
  flex-direction: column;
  vertical-align: top;
  white-space: normal;
  border-radius: 24rpx;
  background: linear-gradient(180deg, #fff7e8, var(--card, #fff));
  border: 1rpx solid var(--line, rgba(22,19,15,0.08));
  box-shadow: var(--shadow);
}
.sk-ph {
  width: 100%;
  height: 180rpx;
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
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sk-row { display: flex; margin-top: 10rpx; align-items: baseline; gap: 8rpx; }
.sk-p { color: var(--promo, #f03749); font-size: 32rpx; font-weight: 900; }
.sk-w { color: var(--mut, #857c6d); font-size: 20rpx; text-decoration: line-through; }
.sk-bar { margin-top: 12rpx; height: 12rpx; border-radius: 999rpx; background: #fbe9dd; overflow: hidden; }
.sk-bar-in { height: 100%; background: linear-gradient(90deg, var(--hot, #eb6325), var(--promo, #f03749)); }
.sk-q { margin-top: 8rpx; color: var(--promo, #f03749); font-size: 20rpx; font-weight: 800; }

/* ========== 分类 ========== */
.cats { margin: 0 24rpx; background: transparent; box-shadow: none; border: 0; }
.cats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18rpx;
}
.cat-card {
  display: flex;
  min-height: 170rpx;
  padding: 14rpx 10rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  border-radius: 24rpx;
  background: var(--card, #fff);
  box-shadow: var(--shadow);
  border: 0;
}
.cat-n {
  font-size: 22rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}

/* ========== 多分区货架 aisle ========== */
.aisle { padding: 0 0 22rpx; }
.aisle-h {
  display: flex;
  padding: 20rpx 24rpx 16rpx;
  align-items: center;
  justify-content: space-between;
}
.aisle-chip {
  display: inline-flex;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  align-items: center;
  gap: 10rpx;
  font-size: 26rpx;
  font-weight: 900;
}
.chip-ico { font-size: 26rpx; }
.aisle-more { font-size: 22rpx; color: var(--mut, #857c6d); font-weight: 700; }
.aisle-grid {
  display: grid;
  gap: 16rpx;
  padding: 0 24rpx;
}

/* ========== 团购卡 ========== */
.tg { margin: 0 24rpx; background: transparent; box-shadow: none; border: 0; }
.tg-card {
  display: grid;
  grid-template-columns: 240rpx 1fr;
  gap: 22rpx;
  padding: 20rpx;
}
.tg-ph {
  width: 240rpx;
  height: 240rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #ffd8a9, #ff7a2a 90%);
  position: relative;
  overflow: hidden;
}
.tg-ph::after {
  content: '团';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 120rpx;
  font-weight: 900;
  text-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.2);
  opacity: 0.4;
}
.tg-copy { display: flex; flex-direction: column; gap: 8rpx; min-width: 0; }
.tg-lab {
  align-self: flex-start;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, var(--promo, #f03749), var(--hot, #eb6325));
  color: #fff;
  font-size: 20rpx;
  font-weight: 800;
}
.tg-t { font-size: 28rpx; font-weight: 900; color: var(--ink, #16130f); line-height: 1.3; }
.tg-s { font-size: 22rpx; color: var(--mut, #857c6d); }
.tg-row { display: flex; margin-top: 6rpx; align-items: baseline; gap: 10rpx; }
.tg-p { color: var(--promo, #f03749); font-size: 36rpx; font-weight: 900; }
.tg-w { color: var(--mut, #857c6d); font-size: 20rpx; text-decoration: line-through; }
.tg-bar { margin-top: 8rpx; height: 14rpx; border-radius: 999rpx; background: #fbe9dd; overflow: hidden; }
.tg-bar-in { height: 100%; background: linear-gradient(90deg, var(--yel, #fee600), var(--hot, #eb6325)); }
.tg-q { color: var(--hot, #eb6325); font-size: 20rpx; font-weight: 800; }

/* ========== 通道 ========== */
.channel-scroll { width: 100%; white-space: nowrap; padding: 0 24rpx; box-sizing: border-box; }
.channel-scroll button {
  display: inline-flex;
  margin: 0 12rpx 0 0;
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  color: var(--mut, #857c6d);
  background: var(--card, #fff);
  box-shadow: var(--shadow);
  font-size: 22rpx;
  border: 1rpx solid var(--line, rgba(22,19,15,0.08));
}
.channel-scroll .active {
  color: #fff;
  background: linear-gradient(90deg, var(--hd1, #009146), var(--accent, #009146));
  font-weight: 900;
  box-shadow: 0 8rpx 22rpx rgba(0, 145, 70, 0.3);
  border-color: transparent;
}

/* ========== 状态 / 瀑布流 ========== */
.retail-state {
  margin: 24rpx;
  padding: 44rpx 20rpx;
  border: 2rpx dashed var(--line, rgba(22,19,15,0.12));
  border-radius: var(--life-radius-md);
  color: var(--mut, #857c6d);
  background: var(--card, #fff);
  text-align: center;
}
.wf { margin: 0 24rpx 40rpx; background: transparent; box-shadow: none; border: 0; padding: 0; }
.wf-tt { display: flex; align-items: baseline; gap: 14rpx; }
.wf-n {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: var(--notice-bg, #e6f3ea);
  color: var(--notice-tx, #0b6b3d);
  font-size: 20rpx;
  font-weight: 800;
}
.goods-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
}

/* ========== 商品 sheet ========== */
.product-sheet {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: flex;
  padding: 30rpx;
  align-items: flex-end;
  background: rgba(16, 32, 25, 0.52);
  box-sizing: border-box;
}
.product-sheet-card {
  display: flex;
  width: 100%;
  max-height: 88vh;
  padding: 28rpx;
  border-radius: 32rpx 32rpx 12rpx 12rpx;
  flex-direction: column;
  background: var(--card, #fff);
  box-sizing: border-box;
  color: var(--ink, #16130f);
}
.sheet-photo, .sheet-ph {
  width: 100%;
  height: 320rpx;
  border-radius: 24rpx;
  background: url('../../assets/v63-retail/product-sprite.webp') var(--sprite-x, 0) var(--sprite-y, 0) / 400% 200% no-repeat;
}
.sheet-kicker { margin-top: 18rpx; color: var(--promo, #f03749); font-size: 20rpx; font-weight: 800; }
.sheet-title { margin: 7rpx 0; font-size: 34rpx; font-weight: 900; }
.sheet-copy { color: var(--mut, #857c6d); font-size: 21rpx; line-height: 1.55; }
.trace-note {
  display: flex;
  margin: 18rpx 0;
  padding: 18rpx;
  border-radius: 18rpx;
  flex-direction: column;
  gap: 6rpx;
  background: var(--life-yellow-soft);
}
.trace-note text:first-child { color: var(--life-yellow-ink); font-weight: 900; }
.trace-note text:last-child { color: var(--mut, #857c6d); font-size: 21rpx; line-height: 1.55; }
.sheet-action { display: flex; align-items: center; justify-content: space-between; }
.sheet-action > text { color: var(--promo, #f03749); font-size: 36rpx; font-weight: 900; }
.sheet-action button, .sheet-detail {
  margin: 0;
  padding: 0 32rpx;
  min-height: 80rpx;
  line-height: 80rpx;
  border-radius: 999rpx;
  color: #fff;
  background: linear-gradient(90deg, var(--promo, #f03749), var(--hot, #eb6325));
  font-size: 26rpx;
  font-weight: 900;
  box-shadow: 0 8rpx 22rpx rgba(240, 55, 73, 0.3);
}
.sheet-detail {
  margin-top: 16rpx;
  background: linear-gradient(90deg, var(--hd1, #009146), var(--accent, #009146));
  box-shadow: 0 8rpx 22rpx rgba(0, 145, 70, 0.3);
}
.sheet-close {
  margin-top: 12rpx;
  padding: 0 28rpx;
  min-height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  color: var(--mut, #857c6d);
  background: var(--life-wash, #fafbf9);
  font-size: 22rpx;
}
</style>
