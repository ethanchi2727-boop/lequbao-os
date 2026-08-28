<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeRuntimeProfile, lifeSession } from '../../services/life-session.js';
import { lifeBannerThemeStyle } from '../../services/life-visual.js';

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
const surfaceStyle = computed(() => {
  const s = communitySlides[activeSlide.value] || communitySlides[0];
  return {
    ...lifeBannerThemeStyle('blue'),
    '--tint': s.tint,
  };
});

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
</script>

<template>
  <LifeSurface primary :show-assurance="false" theme-color="blue" :style="surfaceStyle" show-mai-fab>
    <!-- ========== 三图轮播 + tint 联动 ========== -->
    <view class="bans fu">
      <swiper
        class="bans-swiper"
        :autoplay="true"
        :circular="true"
        :interval="4200"
        :duration="520"
        indicator-dots
        indicator-color="rgba(22,19,15,.16)"
        indicator-active-color="rgba(22,19,15,.55)"
        @change="(e) => (activeSlide = e.detail.current)"
      >
        <swiper-item v-for="(s, idx) in communitySlides" :key="s.key">
          <view
            class="pslide"
            :style="{
              background: `linear-gradient(120deg, ${s.c1}, ${s.c2})`,
              color: s.tx,
            }"
          >
            <view class="pb-tx">
              <text class="k" :style="{ color: s.tx, borderColor: s.tx }">{{ s.k }}</text>
              <text class="pb-b" :style="{ color: s.tx }">{{ s.title }}</text>
              <text class="pb-p" :style="{ color: s.subc }">{{ s.sub }}</text>
              <text class="pb-btn" :style="{ background: s.pbtn, color: s.pbt }">{{ s.btn }}</text>
            </view>
            <view class="pb-glyph">{{ s.glyph }}</view>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <!-- ========== 公告条（生活圈信任 + 选城市入口） ========== -->
    <view class="notice fu">
      <view class="ntc-lab">生活圈</view>
      <text class="ntc-tx">真实门店 · 实际在售 · 距离授权后计算 · 服务规则透明</text>
      <button class="ntc-go" @click="uni.navigateTo({ url: '/pages/page-198/index' })">选择城市 ›</button>
    </view>

    <!-- ========== 4 场景宫格（黏土发光 gic） ========== -->
    <view class="qcat cc fu">
      <button
        v-for="(scene, index) in scenes"
        :key="scene[0]"
        class="qcat-cell"
        @click="uni.navigateTo({ url: '/pages/page-201/index?category=leisure' })"
      >
        <view class="gic gic-blue" :class="'gic-v' + ((index % 5) + 1)">
          <view class="gph" :style="sceneStyle(index)" />
        </view>
        <text class="qcat-b">{{ scene[0] }}</text>
        <text class="qcat-p">{{ scene[1] }}</text>
      </button>
    </view>

    <!-- ========== 品牌墙 2x2 ========== -->
    <view class="sec-h fu">
      <text class="sec-tt">生活 · 品牌馆</text>
      <text class="sec-more">12 大品牌官方直供 ›</text>
    </view>
    <view class="bwall fu">
      <button
        v-for="(item, idx) in lifeBrandWall"
        :key="item[0]"
        class="bcell cc"
        @click="uni.navigateTo({ url: '/pages/page-201/index?category=leisure' })"
      >
        <view class="bico" :style="{ background: item[3] }">{{ item[2] }}</view>
        <text class="bc-b">{{ item[0] }}</text>
        <text class="bc-p">{{ item[1] }}</text>
      </button>
    </view>

    <!-- ========== 娱乐海报横滑 rail + VIP ========== -->
    <view class="sec-h fu">
      <text class="sec-tt">娱乐 · 出行</text>
      <text class="sec-more">周末特惠 ›</text>
    </view>
    <scroll-view scroll-x class="frail fu" :show-scrollbar="false">
      <view class="frail-track">
        <view
          v-for="(f, idx) in frailRail"
          :key="f[0]"
          class="fcard"
          :style="{ background: `linear-gradient(140deg, ${f[3]}, ${f[3]}bb)` }"
        >
          <text class="fglyph">{{ f[0].slice(0, 1) }}</text>
          <text class="fb">{{ f[0] }}</text>
          <text class="fp">{{ f[1] }}</text>
        </view>
        <view class="vipcard">
          <view class="vip-row1">
            <text class="vip-t">{{ vipCard.title }}</text>
            <text class="vip-amt">{{ vipCard.amount }}<text class="vip-unit">{{ vipCard.unit }}</text></text>
          </view>
          <text class="vip-sub">{{ vipCard.sub }}</text>
          <text class="vip-tag">{{ vipCard.tag }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- ========== 信任条 ========== -->
    <view class="trust fu">
      <text>✓ 门店真实在营</text>
      <text>✓ 距离授权后计算</text>
      <text>✓ 商品实时在售</text>
      <text>✓ 到店核销可退</text>
    </view>

    <!-- ========== 状态枚举：loading / 未登录 / 禁权 / 错误 / 空 ========== -->
    <view v-if="state === 'loading'" class="st fu">正在读取真实门店…</view>
    <view v-else-if="state === 'unauthenticated'" class="st fu">登录后查看附近生活</view>
    <view v-else-if="state === 'forbidden'" class="st fu">当前账户无权查看附近门店</view>
    <view v-else-if="state === 'recoverable-error'" class="st fu" @click="load">加载失败，点此重试</view>
    <view v-else-if="state === 'empty'" class="st fu">当前没有可展示的服务门店</view>

    <!-- ========== 附近门店 dense 列表 ========== -->
    <template v-else>
      <view class="sec-h fu">
        <text class="sec-tt">附近服务门店</text>
        <text class="sec-more">{{ stores.length }} 家在营</text>
      </view>
      <view class="shops fu">
        <button v-for="(store, index) in stores" :key="store.id" class="shop cc" @click="openStore(store)">
          <view class="simg">
            <view class="sphoto" :style="sceneStyle(index % scenes.length)" />
          </view>
          <view class="sinfo">
            <text class="sb">{{ store.name }}</text>
            <view class="smeta">
              <text class="sstar">★4.{{ 6 + (index % 4) }}</text>
              <text class="sdot">·</text>
              <text>{{ store.distanceKm === null ? '待授权查看距离' : `${store.distanceKm}km` }}</text>
              <text class="sdot">·</text>
              <text>{{ (store.cityCode || '当前城市') + '' }}</text>
            </view>
            <view class="stags">
              <text>主营 </text>
              <text class="stag-em">{{ (store.productCount || 0) }} 件商品在线在售</text>
            </view>
            <view class="saddr">
              <text class="spindot">📍</text>
              <text>{{ store.districtCode || '门店服务覆盖区域' }}</text>
            </view>
            <text class="sdeal">热门团购：到店核销套餐可用</text>
          </view>
          <text class="sgo">进店 ›</text>
        </button>
      </view>
    </template>

    <!-- 底部呼吸 -->
    <view style="height: 28rpx"></view>

    <!-- ========== 门店详情 sheet ========== -->
    <view v-if="selectedStore" class="store-sheet" @click="selectedStore = null">
      <view class="store-sheet-card cc" @click.stop>
        <view class="store-heading">
          <view class="sh-left">
            <text class="sh-name">{{ selectedStore.name }}</text>
            <text class="sh-sub">
              {{ selectedStore.cityCode || '当前城市' }} ·
              {{ selectedStore.districtCode || '服务区域' }}
            </text>
          </view>
          <button class="sh-close" @click="selectedStore = null">关闭</button>
        </view>
        <view class="store-facts">
          <text class="sf">{{ selectedStore.productCount }} 件在售</text>
          <text class="sf">{{ selectedStore.distanceKm === null ? '距离待授权后计算' : `${selectedStore.distanceKm}km` }}</text>
          <text class="sf sf-ink">信息来自门店主档</text>
        </view>
        <view v-if="detailLoading" class="st">正在读取门店在售商品…</view>
        <view v-else-if="!storeProducts.length" class="st">门店当前没有可购买商品</view>
        <view v-else class="store-products">
          <LifeRetailProductCard
            v-for="(product, index) in storeProducts"
            :key="product.id"
            compact
            :product="product"
            :index="index"
            :voucher-hint="index % 4 === 0 ? '到店核销 · 随时退' : ''"
            @select="() => {}"
            @add="addToCart"
          />
        </view>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
/* ========== 三图轮播 concept-f bans ========== */
.bans {
  margin: 10rpx 20rpx 0;
  position: relative;
  border-radius: 28rpx;
  overflow: hidden;
}
.bans-swiper {
  width: 100%;
  height: 220rpx;
  border-radius: 28rpx;
}
.pslide {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 26rpx;
  box-shadow: 0 10rpx 30rpx rgba(22, 19, 15, 0.14);
  overflow: hidden;
  box-sizing: border-box;
}
.pslide::before {
  content: '';
  position: absolute;
  left: -48rpx;
  top: -68rpx;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
}
.pb-tx {
  position: relative;
  z-index: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.k {
  display: inline-block;
  font-size: 16rpx;
  font-weight: 900;
  letter-spacing: 0.16em;
  opacity: 0.72;
  border: 1rpx solid currentColor;
  border-radius: 10rpx;
  padding: 3rpx 10rpx;
  margin-bottom: 10rpx;
}
.pb-b {
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: 0.04em;
  line-height: 1.22;
}
.pb-p {
  font-size: 18rpx;
  font-weight: 800;
  margin: 8rpx 0 12rpx;
}
.pb-btn {
  display: inline-block;
  font-size: 18rpx;
  font-weight: 900;
  border-radius: 14rpx;
  padding: 7rpx 18rpx;
}
.pb-glyph {
  position: relative;
  z-index: 2;
  width: 136rpx;
  height: 136rpx;
  border-radius: 32rpx;
  display: grid;
  place-items: center;
  font-size: 86rpx;
  background: rgba(255, 255, 255, 0.22);
  box-shadow: 0 10rpx 22rpx rgba(22, 19, 15, 0.16);
  flex: none;
}

/* ========== 公告条 ========== */
.notice {
  margin: 20rpx 20rpx 0;
  min-height: 70rpx;
  border-radius: 22rpx;
  background: var(--notice-bg, #e6f3ea);
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 0 16rpx;
  color: var(--notice-tx, #0b6b3d);
  font-size: 18rpx;
  font-weight: 800;
}
.ntc-lab {
  flex: none;
  padding: 5rpx 12rpx;
  border-radius: 10rpx;
  background: rgba(11, 107, 61, 0.14);
  color: var(--notice-tx, #0b6b3d);
  font-size: 16rpx;
  font-weight: 900;
}
.ntc-tx {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 17rpx;
  font-weight: 700;
  opacity: 0.9;
}
.ntc-go {
  flex: none;
  margin: 0;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: var(--notice-tx, #0b6b3d);
  color: #fff;
  font-size: 17rpx;
  font-weight: 900;
  line-height: 44rpx;
  height: 44rpx;
}

/* ========== 分类宫格（黏土发光 gic） ========== */
.qcat {
  margin: 18rpx 20rpx 0;
  padding: 22rpx 10rpx 18rpx;
  border-radius: 28rpx;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14rpx 6rpx;
}
.qcat-cell {
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.qcat-b {
  margin-top: 8rpx;
  font-size: 20rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}
.qcat-p {
  margin-top: 3rpx;
  font-size: 14rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 150rpx;
}

/* ========== section header ========== */
.sec-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 28rpx 22rpx 10rpx;
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
  color: var(--accent, #009146);
}

/* ========== 品牌墙 2x2 ========== */
.bwall {
  margin: 0 20rpx;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14rpx;
}
.bcell {
  padding: 20rpx 14rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  text-align: center;
}
.bico {
  width: 92rpx;
  height: 92rpx;
  border-radius: 24rpx;
  display: grid;
  place-items: center;
  font-size: 48rpx;
}
.bc-b {
  margin-top: 12rpx;
  font-size: 22rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
}
.bc-p {
  margin-top: 4rpx;
  font-size: 15rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
  max-width: 280rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ========== 娱乐横滑 rail ========== */
.frail {
  margin: 0 20rpx;
  white-space: nowrap;
}
.frail-track {
  display: inline-flex;
  gap: 14rpx;
  padding: 4rpx 2rpx 12rpx;
}
.fcard {
  width: 190rpx;
  height: 210rpx;
  border-radius: 24rpx;
  padding: 22rpx 18rpx;
  display: inline-flex;
  flex-direction: column;
  color: #fff;
  box-shadow: 0 10rpx 24rpx rgba(22, 19, 15, 0.14);
  box-sizing: border-box;
  flex: none;
}
.fglyph {
  font-size: 42rpx;
  line-height: 1;
}
.fb {
  margin-top: auto;
  font-size: 22rpx;
  font-weight: 900;
}
.fp {
  margin-top: 6rpx;
  font-size: 16rpx;
  font-weight: 800;
  opacity: 0.92;
}
.vipcard {
  width: 300rpx;
  height: 210rpx;
  flex: none;
  border-radius: 24rpx;
  background: linear-gradient(140deg, #2a1347, #6e2ea8 58%, #b263ff);
  color: #fff;
  padding: 22rpx 22rpx;
  box-sizing: border-box;
  box-shadow: 0 10rpx 24rpx rgba(120, 60, 220, 0.32);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.vipcard::before {
  content: '';
  position: absolute;
  right: -40rpx;
  top: -50rpx;
  width: 180rpx;
  height: 180rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.vip-row1 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  position: relative;
  z-index: 2;
}
.vip-t {
  font-size: 24rpx;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.vip-amt {
  font-size: 34rpx;
  font-weight: 900;
}
.vip-unit {
  font-size: 16rpx;
  font-weight: 800;
  opacity: 0.85;
  margin-left: 2rpx;
}
.vip-sub {
  margin-top: auto;
  font-size: 15rpx;
  font-weight: 800;
  opacity: 0.92;
  position: relative;
  z-index: 2;
}
.vip-tag {
  margin-top: 10rpx;
  align-self: flex-start;
  padding: 5rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(254, 230, 0, 0.18);
  color: #fee600;
  font-size: 14rpx;
  font-weight: 900;
  position: relative;
  z-index: 2;
}

/* ========== 信任条 ========== */
.trust {
  margin: 20rpx 20rpx 0;
  min-height: 70rpx;
  border-radius: 22rpx;
  background: linear-gradient(120deg, rgba(13, 111, 150, 0.08), rgba(13, 150, 201, 0.06));
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 12rpx;
  color: #0d4f6b;
  font-size: 17rpx;
  font-weight: 800;
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

/* ========== 附近门店 dense list ========== */
.shops {
  margin: 4rpx 20rpx 0;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding-bottom: 20rpx;
}
.shop {
  margin: 0;
  padding: 18rpx;
  border-radius: 26rpx;
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  text-align: left;
  position: relative;
}
.simg {
  width: 170rpx;
  height: 170rpx;
  flex: none;
  border-radius: 24rpx;
  overflow: hidden;
  position: relative;
}
.sphoto {
  width: 100%;
  height: 100%;
  background-image: url('../../assets/v63-retail/category-sprite.webp');
  background-repeat: no-repeat;
  background-size: 500% 300%;
  background-position: var(--sprite-x, 0) var(--sprite-y, 0);
}
.sinfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.sb {
  font-size: 28rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.smeta {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-top: 5rpx;
  font-size: 17rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
  flex-wrap: wrap;
}
.sstar {
  color: #f7a800;
  font-weight: 900;
}
.sdot {
  opacity: 0.5;
}
.stags {
  margin-top: 6rpx;
  font-size: 17rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
}
.stag-em {
  color: var(--ink, #16130f);
  font-weight: 800;
}
.saddr {
  margin-top: 5rpx;
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 16rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
}
.spindot {
  opacity: 0.85;
  font-size: 15rpx;
}
.sdeal {
  margin-top: 7rpx;
  align-self: flex-start;
  padding: 5rpx 12rpx;
  border-radius: 10rpx;
  background: rgba(240, 55, 73, 0.09);
  color: var(--promo, #f03749);
  font-size: 16rpx;
  font-weight: 900;
}
.sgo {
  position: absolute;
  right: 20rpx;
  top: 18rpx;
  font-size: 18rpx;
  font-weight: 900;
  color: var(--accent, #009146);
}

/* ========== 门店 sheet ========== */
.store-sheet {
  position: fixed;
  z-index: 60;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  padding: 40rpx;
  align-items: flex-end;
  background: rgba(16, 32, 25, 0.48);
  box-sizing: border-box;
}
.store-sheet-card {
  width: 100%;
  max-height: 88vh;
  padding: 30rpx 28rpx 36rpx;
  border-radius: 36rpx 36rpx 16rpx 16rpx;
  overflow-y: auto;
  box-sizing: border-box;
}
.store-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.sh-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7rpx;
}
.sh-name {
  font-size: 34rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sh-sub {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--mut, #857c6d);
}
.sh-close {
  margin: 0;
  flex: none;
  padding: 0 24rpx;
  height: 52rpx;
  line-height: 52rpx;
  border-radius: 999rpx;
  background: rgba(13, 111, 150, 0.08);
  color: #0d4f6b;
  font-size: 19rpx;
  font-weight: 900;
}
.store-facts {
  display: flex;
  margin: 22rpx 0 6rpx;
  gap: 10rpx;
  flex-wrap: wrap;
}
.sf {
  padding: 9rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(13, 111, 150, 0.08);
  color: #0d4f6b;
  font-size: 18rpx;
  font-weight: 800;
}
.sf-ink {
  background: var(--notice-bg, #e6f3ea);
  color: var(--notice-tx, #0b6b3d);
}
.store-products {
  display: grid;
  gap: 14rpx;
  margin-top: 20rpx;
}
</style>
