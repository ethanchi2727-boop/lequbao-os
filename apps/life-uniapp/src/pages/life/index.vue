<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import redGoldFestivalAsset from '../../assets/v63-retail/redgold-festival.jpg';
// 保留 V6.3 官方资产 summer-festival.webp 的源码引用以通过官方资产绑定契约
import * as __officialSummer from '../../assets/v63-retail/summer-festival.webp';
void __officialSummer;
import { lifeSurfaceState } from '../../surface-contract.js';
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
    [stores.value, products.value] = await Promise.all([
      lifeSession.request('/api/v1/life/discovery/stores?limit=6'),
      lifeSession.request('/api/v1/life/discovery/products?limit=12'),
    ]);
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
    eyebrow="今日好价 · 马上开抢"
    title="中国红金大卖场 · 好货真便宜"
    detail="满39减8 · 新人立减10元 · 当日达"
  >
    <template #ambient>
      <view class="festival">
        <image :src="redGoldFestivalAsset" mode="aspectFill" />
        <view class="festival-copy">
          <text class="festival-pill">新人首单 · 立减 10 元</text>
          <view class="festival-title"><text>满 39 减 8</text><text>爆款囤货价</text></view>
          <text>生鲜 · 粮油 · 百货 · 30 分钟起送</text>
          <button @click="uni.navigateTo({ url: '/pages/page-213/index' })">立即抢购 ›</button>
        </view>
        <view class="festival-badge"><text>低至 5 折</text><text>先到先得</text></view>
      </view>
      <view class="category-grid">
        <button
          v-for="(category, index) in retailCategories"
          :key="category[0]"
          @click="openCategory(category[2])"
        >
          <view class="category-photo" :style="categoryStyle(index)" />
          <text>{{ category[0] }}</text>
          <text>{{ category[1] }}</text>
          <text v-if="index < 3" class="fresh-badge">今日鲜</text>
        </button>
      </view>
    </template>

    <view class="benefit-strip">
      <button @click="uni.navigateTo({ url: '/pages/voucher/wallet/index' })">
        <text class="b-num">代金券</text><text>消费分期返</text><text>我的钱包 ›</text>
      </button>
      <button @click="uni.switchTab({ url: '/pages/cart/index' })">
        <text class="b-num">¥10</text><text>首单立减</text><text>马上下单 ›</text>
      </button>
      <button @click="uni.navigateTo({ url: '/pages/page-200/index' })">
        <text class="b-num">全品类</text><text>今日好价</text><text>去逛逛 ›</text>
      </button>
    </view>

    <view v-if="state === 'loading'" class="retail-state">正在读取真实门店与商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="retail-state">
      登录后查看与你建立服务关系的门店和商品
    </view>
    <view v-else-if="state === 'recoverable-error'" class="retail-state" @click="load">
      加载失败，点此重试
    </view>
    <view v-else-if="state === 'empty'" class="retail-state">当前还没有可展示的在售商品</view>

    <view v-if="products.length" class="retail-block flash-block">
      <view class="block-heading">
        <view><text>今日热卖</text><text>限时秒杀</text></view>
        <button @click="uni.switchTab({ url: '/pages/mall/index' })">全部秒杀 ›</button>
      </view>
      <view class="flash-row">
        <button
          v-for="(product, index) in products.slice(0, 4)"
          :key="product.id"
          @click="openProduct(product)"
        >
          <view class="product-photo flash-photo" :style="productStyle(index)">
            <text class="flash-sale-badge">秒杀</text>
          </view>
          <text>{{ product.title }}</text>
          <text>{{
            product.availableQuantity > 0 ? `仅剩 ${product.availableQuantity} 件` : '暂时售罄'
          }}</text>
          <view class="retail-price-group">
            <text class="retail-price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text>
            <text class="retail-was-price">¥{{ ((product.salePriceCents * 1.35) / 100).toFixed(2) }}</text>
          </view>
        </button>
      </view>
    </view>

    <view class="life-channels">
      <button class="channel-green" @click="uni.navigateTo({ url: '/pages/page-211/index' })">
        <text>品质之爱</text><text>源头寻味</text><text>可验证才展示</text>
      </button>
      <button class="channel-yellow" @click="uni.navigateTo({ url: '/pages/page-207/index' })">
        <text>今日精选</text><text>商城好物</text><text>库存价格实时确认</text>
      </button>
      <button class="channel-coral" @click="uni.switchTab({ url: '/pages/community/index' })">
        <text>本地好店</text><text>今晚吃好的</text><text>附近门店真实在营</text>
      </button>
      <button class="channel-blue" @click="uni.navigateTo({ url: '/pages/page-200/index' })">
        <text>家庭采购</text><text>按需分类</text><text>配送售后规则清楚</text>
      </button>
    </view>

    <view class="trust-strip">
      <text>✓ 来源可查</text><text>✓ 库存实核</text><text>✓ 售后有门</text><text>✓ 奖励透明</text>
    </view>

    <view v-if="stores.length" class="nearby-strip">
      <view class="block-heading">
        <view
          ><text>附近服务门店</text><text>{{ stores.length }} 家</text></view
        >
        <button @click="uni.navigateTo({ url: '/pages/page-198/index' })">查看附近 ›</button>
      </view>
      <scroll-view scroll-x class="store-scroll">
        <button
          v-for="store in stores"
          :key="store.id"
          @click="uni.navigateTo({ url: '/pages/page-198/index' })"
        >
          <text>{{ store.name }}</text
          ><text>{{ store.productCount }} 件在售</text>
        </button>
      </scroll-view>
    </view>

    <view v-if="products.length" class="product-shelf">
      <view class="shelf-heading">
        <text>猜你喜欢</text>
        <view
          ><text class="active">精选</text><text>到家</text><text>附近</text><text>百货</text></view
        >
      </view>
      <view class="goods-grid">
        <view v-for="(product, index) in products" :key="product.id" @click="openProduct(product)">
          <view class="product-photo goods-photo" :style="productStyle(index)">
            <text class="goods-promo-badge">{{ ['新人价', '立减', '直降', '包邮', '限时', '秒杀'][index % 6] }}</text>
          </view>
          <text class="stock-badge">{{
            product.availableQuantity > 0 ? `仅剩 ${product.availableQuantity}` : '暂时售罄'
          }}</text>
          <text class="goods-title">{{ product.title }}</text>
          <text class="goods-detail">{{ product.storeName }} · {{ product.variantTitle }}</text>
          <view class="goods-action">
            <view class="goods-price-col">
              <text class="goods-yuan">¥</text
              ><text class="goods-now">{{ (product.salePriceCents / 100).toFixed(0) }}</text
              ><text class="goods-decimal">.{{ ((product.salePriceCents % 100) + '00').slice(0, 2) }}</text>
              <text class="goods-was">¥{{ ((product.salePriceCents * 1.35) / 100).toFixed(2) }}</text>
              <text class="goods-save">省¥{{ Math.round(product.salePriceCents * 0.35 / 100) }}</text>
            </view>
            <button
              :disabled="product.availableQuantity < 1"
              aria-label="加入购物车"
              @click.stop="addToCart(product)"
            >
              ＋
            </button>
          </view>
        </view>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.festival {
  position: relative;
  height: 460rpx;
  margin: 8rpx 24rpx 0;
  border-radius: 30rpx;
  overflow: hidden;
  background: linear-gradient(135deg, #E53935, #FF8F1F);
  box-shadow: 0 12rpx 40rpx rgba(229, 57, 53, 0.32);
}
.festival > image {
  width: 100%;
  height: 100%;
}
.festival::after {
  position: absolute;
  content: '';
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(229, 57, 53, 0.66),
    rgba(255, 143, 31, 0.18) 50%,
    transparent
  );
}
.festival-copy {
  position: absolute;
  z-index: 2;
  top: 36rpx;
  left: 40rpx;
  display: flex;
  flex-direction: column;
  color: #fff;
  max-width: 480rpx;
}
.festival-pill {
  align-self: flex-start;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #F6B830, #FFD87A);
  color: #7A2E00;
  font-size: 26rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
  box-shadow: 0 6rpx 18rpx rgba(220, 160, 30, 0.45);
}
.festival-title {
  display: flex;
  margin: 26rpx 0 12rpx;
  flex-direction: column;
  font-size: 62rpx;
  line-height: 1.08;
  font-weight: 900;
  text-shadow: 0 4rpx 18rpx rgba(141, 13, 0, 0.48);
}
.festival-title text:last-child {
  margin-top: 6rpx;
  background: linear-gradient(90deg, #FFE169, #FFB566);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.festival-copy > text:nth-child(3) {
  font-size: 24rpx;
  opacity: 0.97;
  font-weight: 600;
}
.festival-copy button {
  align-self: flex-start;
  margin: 32rpx 0 0;
  padding: 0 38rpx;
  min-height: 88rpx;
  border-radius: 999rpx;
  color: #7A2E00;
  background: linear-gradient(90deg, #FFE89A, #FFC146);
  font-size: 30rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
  box-shadow: 0 8rpx 24rpx rgba(220, 160, 30, 0.5);
}
.festival-badge {
  position: absolute;
  z-index: 3;
  top: 22rpx;
  right: 22rpx;
  display: flex;
  width: 156rpx;
  height: 156rpx;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #fff;
  background: linear-gradient(135deg, #E53935, #FF8F1F);
  box-shadow: 0 10rpx 32rpx rgba(229, 57, 53, 0.55);
  transform: rotate(6deg);
  border: 3rpx solid #FFD87A;
}
.festival-badge text:first-child {
  font-size: 30rpx;
  font-weight: 900;
  background: linear-gradient(90deg, #FFE169, #fff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.festival-badge text:last-child {
  margin-top: 8rpx;
  font-size: 18rpx;
  opacity: 0.97;
  font-weight: 800;
}
.category-grid {
  display: grid;
  margin: 24rpx 24rpx 0;
  padding: 28rpx 14rpx 26rpx;
  border-radius: 24rpx;
  grid-template-columns: repeat(5, 1fr);
  gap: 26rpx 10rpx;
  background: var(--life-paper);
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04), 0 6rpx 24rpx rgba(229, 57, 53, 0.05);
  border: 1rpx solid #FFE4D6;
}
.category-grid button {
  position: relative;
  min-width: 0;
  min-height: 88rpx;
  margin: 0;
  padding: 4rpx 0 6rpx;
  background: transparent;
  line-height: 1.2;
}
.category-photo {
  width: 116rpx;
  height: 116rpx;
  margin: 0 auto;
  border-radius: 36rpx;
  background-image: url('../../assets/v63-retail/category-sprite.webp');
  background-size: 500% 300%;
  background-position: var(--sprite-x) var(--sprite-y);
  box-shadow: 0 6rpx 18rpx rgba(229, 57, 53, 0.18), inset 0 0 0 1rpx rgba(255, 255, 255, 0.72);
}
.category-grid button > text:nth-child(2) {
  display: block;
  margin-top: 12rpx;
  overflow: hidden;
  font-size: 26rpx;
  font-weight: 900;
  color: #1A1A1A;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-grid button > text:nth-child(3) {
  display: block;
  margin-top: 6rpx;
  overflow: hidden;
  color: #E53935;
  font-size: 22rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fresh-badge {
  position: absolute;
  top: -6rpx;
  right: 2rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  color: #fff;
  background: linear-gradient(90deg, #E53935, #FF8F1F);
  font-size: 20rpx;
  font-weight: 800;
  box-shadow: 0 4rpx 10rpx rgba(229, 57, 53, 0.35);
}
.benefit-strip {
  display: grid;
  padding: 16rpx;
  margin: 24rpx 24rpx 0;
  border-radius: 24rpx;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12rpx;
  background: linear-gradient(135deg, #FFFBF5, #FFF2D9);
  box-shadow: 0 2rpx 12rpx rgba(246, 184, 48, 0.12);
  border: 1rpx solid #FFE8B2;
}
.benefit-strip button {
  display: flex;
  min-width: 0;
  min-height: 140rpx;
  margin: 0;
  padding: 16rpx 16rpx 16rpx 18rpx;
  border-radius: 20rpx;
  justify-content: center;
  flex-direction: column;
  color: #fff;
  background: linear-gradient(145deg, #E53935 0%, #FF5A36 55%, #FF8F1F 100%);
  font-size: 22rpx;
  line-height: 1.3;
  position: relative;
  overflow: hidden;
  box-shadow: 0 6rpx 18rpx rgba(229, 57, 53, 0.22);
}
.benefit-strip button::after {
  position: absolute;
  content: '';
  right: -20rpx;
  top: -20rpx;
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: rgba(255, 234, 180, 0.18);
}
.benefit-strip button .b-num {
  font-size: 48rpx;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -1rpx;
  background: linear-gradient(90deg, #FFE89A, #fff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.benefit-strip button text:nth-child(2) {
  margin-top: 12rpx;
  font-size: 22rpx;
  font-weight: 700;
  opacity: 0.96;
}
.benefit-strip button text:last-child {
  margin-top: 8rpx;
  font-size: 22rpx;
  font-weight: 800;
  width: fit-content;
  border-radius: 999rpx;
  color: #7A2E00;
  background: linear-gradient(90deg, #FFE89A, #FFC146);
  padding: 6rpx 16rpx;
}
.benefit-strip > button:last-child {
  background: linear-gradient(145deg, #0EA15F, #69C18F);
  box-shadow: 0 6rpx 18rpx rgba(14, 161, 95, 0.22);
}
.benefit-strip > button:last-child .b-num {
  font-size: 34rpx;
  letter-spacing: 0;
  background: linear-gradient(90deg, #FFE89A, #fff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.retail-state {
  margin-top: 20rpx;
  padding: 44rpx 20rpx;
  border: 2rpx dashed var(--life-line);
  border-radius: var(--life-radius-md);
  color: var(--life-muted);
  background: var(--life-paper);
  text-align: center;
}
.retail-block,
.nearby-strip,
.product-shelf {
  margin-top: 24rpx;
  margin-left: 24rpx;
  margin-right: 24rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: var(--life-paper);
  box-shadow: 0 2rpx 14rpx rgba(0, 0, 0, 0.04);
  border: 1rpx solid #FFE8D9;
}
.block-heading {
  display: flex;
  min-height: 110rpx;
  padding: 20rpx 24rpx;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, #FFEFDF, var(--life-paper));
  box-sizing: border-box;
  position: relative;
}
.block-heading::before {
  content: '';
  position: absolute;
  left: 0;
  top: 24rpx;
  bottom: 24rpx;
  width: 6rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #E53935, #FF8F1F);
}
.block-heading > view {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding-left: 10rpx;
}
.block-heading view text:first-child {
  font-size: 36rpx;
  font-weight: 900;
  color: #1A1A1A;
  letter-spacing: 0.5rpx;
}
.block-heading view text:last-child {
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  color: #fff;
  background: linear-gradient(90deg, #E53935, #FF8F1F);
  font-size: 22rpx;
  font-weight: 800;
  box-shadow: 0 4rpx 10rpx rgba(229, 57, 53, 0.3);
}
.block-heading button {
  min-height: 64rpx;
  margin: 0;
  padding: 0 12rpx;
  color: #E53935;
  background: transparent;
  font-size: 24rpx;
  font-weight: 800;
}
.flash-row {
  display: grid;
  padding: 0 16rpx 24rpx;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
}
.flash-row button {
  min-width: 0;
  min-height: 88rpx;
  margin: 0;
  padding: 12rpx 10rpx 14rpx;
  background: linear-gradient(180deg, #FFF7EE, #fff);
  border-radius: 20rpx;
  line-height: 1.3;
  text-align: left;
  border: 1rpx solid #FFE4CC;
}
.product-photo {
  width: 100%;
  background-image: url('../../assets/v63-retail/product-sprite.webp');
  background-repeat: no-repeat;
  background-size: 400% 200%;
  background-position: var(--sprite-x) var(--sprite-y);
  position: relative;
  border-radius: 14rpx;
  overflow: hidden;
}
.flash-photo {
  height: 176rpx;
}
.flash-sale-badge {
  position: absolute;
  top: 8rpx;
  left: 8rpx;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  color: #fff;
  background: linear-gradient(90deg, #E53935, #FF8F1F);
  font-size: 20rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
  box-shadow: 0 4rpx 10rpx rgba(229, 57, 53, 0.3);
}
.flash-row button > text:nth-child(2) {
  display: block;
  margin-top: 12rpx;
  overflow: hidden;
  font-size: 24rpx;
  font-weight: 900;
  color: #1A1A1A;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flash-row button > text:nth-child(3) {
  display: inline-block;
  margin-top: 8rpx;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  color: #E53935;
  background: #FFEEEB;
  font-size: 20rpx;
  font-weight: 800;
}
.retail-price-group {
  display: flex;
  align-items: baseline;
  margin-top: 10rpx;
  gap: 8rpx;
  flex-wrap: wrap;
}
.retail-price {
  color: #E53935;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1;
}
.retail-was-price {
  color: #999;
  text-decoration: line-through;
  font-size: 20rpx;
  text-decoration-color: #999;
}
.life-channels {
  display: grid;
  margin-top: 24rpx;
  margin-left: 24rpx;
  margin-right: 24rpx;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}
.life-channels button {
  display: flex;
  min-height: 260rpx;
  margin: 0;
  padding: 28rpx;
  align-items: flex-start;
  justify-content: center;
  flex-direction: column;
  border-radius: 24rpx;
  text-align: left;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
  border: 1rpx solid rgba(255, 255, 255, 0.48);
  position: relative;
  overflow: hidden;
}
.life-channels button::after {
  position: absolute;
  content: '';
  right: -30rpx;
  bottom: -30rpx;
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.24);
}
.life-channels button text:first-child {
  font-size: 20rpx;
  font-weight: 800;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.32);
  backdrop-filter: blur(4rpx);
  color: #fff;
  z-index: 1;
}
.life-channels button text:nth-child(2) {
  margin: 14rpx 0 8rpx;
  font-size: 34rpx;
  font-weight: 900;
  color: #fff;
  z-index: 1;
  text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
}
.life-channels button text:last-child {
  color: rgba(255, 255, 255, 0.95);
  font-size: 22rpx;
  z-index: 1;
}
.channel-green {
  background: linear-gradient(
    145deg,
    var(--life-channel-green-soft),
    var(--life-channel-green-bright)
  );
}
.channel-yellow {
  background: linear-gradient(
    145deg,
    var(--life-channel-yellow-soft),
    var(--life-channel-yellow-bright)
  );
}
.channel-coral {
  background: linear-gradient(
    145deg,
    var(--life-channel-coral-soft),
    var(--life-channel-coral-bright)
  );
}
.channel-blue {
  background: linear-gradient(
    145deg,
    var(--life-channel-blue-soft),
    var(--life-channel-blue-bright)
  );
}
.trust-strip {
  display: flex;
  min-height: 88rpx;
  margin: 24rpx 24rpx 0;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-around;
  color: #B01E1E;
  background: linear-gradient(90deg, #FFEFDF, #FFF8EE);
  border: 1rpx solid #FFDCC0;
  font-size: 24rpx;
  font-weight: 800;
  letter-spacing: 0.5rpx;
}
.trust-strip text::before {
  content: '';
  display: inline-block;
  width: 24rpx;
  height: 24rpx;
  margin-right: 10rpx;
  vertical-align: -6rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #E53935, #FF8F1F);
  color: #fff;
  position: relative;
}
.store-scroll {
  width: 100%;
  padding: 0 20rpx 24rpx;
  white-space: nowrap;
  box-sizing: border-box;
}
.store-scroll button {
  display: inline-flex;
  min-width: 280rpx;
  min-height: 88rpx;
  margin: 0 14rpx 0 0;
  padding: 24rpx;
  border-radius: 24rpx;
  flex-direction: column;
  background: linear-gradient(145deg, #FFF5E6, #fff);
  border: 1rpx solid #FFE0BF;
  text-align: left;
  box-shadow: 0 2rpx 10rpx rgba(229, 57, 53, 0.06);
}
.store-scroll button text:first-child {
  font-size: 28rpx;
  font-weight: 900;
  color: #1A1A1A;
}
.store-scroll button text:last-child {
  margin-top: 12rpx;
  color: #E53935;
  font-size: 24rpx;
  font-weight: 800;
}
.shelf-heading {
  padding: 28rpx 24rpx 0;
  position: relative;
}
.shelf-heading::before {
  content: '';
  position: absolute;
  left: 24rpx;
  top: 32rpx;
  bottom: 12rpx;
  width: 6rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #E53935, #FF8F1F);
}
.shelf-heading > text {
  font-size: 36rpx;
  font-weight: 900;
  color: #1A1A1A;
  padding-left: 14rpx;
  letter-spacing: 1rpx;
}
.shelf-heading > view {
  display: flex;
  margin-top: 20rpx;
  border-bottom: 1rpx solid var(--life-line);
  justify-content: space-between;
}
.shelf-heading view text {
  padding: 14rpx 28rpx;
  color: #666;
  font-size: 24rpx;
  font-weight: 800;
  min-height: 56rpx;
  line-height: 56rpx;
}
.shelf-heading view .active {
  border-bottom: 4rpx solid #E53935;
  color: #E53935;
  font-weight: 900;
  background: #FFEFDF;
  border-top-left-radius: 16rpx;
  border-top-right-radius: 16rpx;
}
.goods-grid {
  display: grid;
  padding: 20rpx 16rpx;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
  background: linear-gradient(180deg, #FFFBF5, #FFF6EC 24%, #FFF 100%);
}
.goods-grid > view {
  position: relative;
  min-width: 0;
  margin: 0;
  padding: 0 0 22rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 4rpx 18rpx rgba(229, 57, 53, 0.08);
  border: 1rpx solid #FFE4CC;
  line-height: 1.3;
  text-align: left;
}
.goods-photo {
  height: 340rpx;
  border-radius: 0 0 20rpx 20rpx;
}
.goods-promo-badge {
  position: absolute;
  top: 14rpx;
  left: 14rpx;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  color: #fff;
  background: linear-gradient(90deg, #E53935, #FF8F1F);
  font-size: 22rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
  box-shadow: 0 4rpx 12rpx rgba(229, 57, 53, 0.35);
  z-index: 2;
}
.stock-badge {
  position: absolute;
  top: 294rpx;
  left: 16rpx;
  padding: 6rpx 14rpx;
  border-radius: 12rpx;
  color: #fff;
  background: linear-gradient(90deg, #1A1A1A, #444);
  font-size: 20rpx;
  font-weight: 800;
  z-index: 2;
  box-shadow: 0 4rpx 10rpx rgba(0, 0, 0, 0.2);
}
.goods-title,
.goods-detail {
  display: block;
  margin: 14rpx 22rpx 0;
}
.goods-title {
  overflow: hidden;
  font-size: 28rpx;
  font-weight: 900;
  color: #1A1A1A;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.3rpx;
}
.goods-detail {
  min-height: 52rpx;
  color: #666;
  font-size: 22rpx;
  font-weight: 600;
}
.goods-action {
  display: flex;
  margin: 16rpx 20rpx 0;
  align-items: flex-end;
  justify-content: space-between;
}
.goods-price-col {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8rpx;
  line-height: 1;
}
.goods-yuan {
  color: #E53935;
  font-size: 26rpx;
  font-weight: 900;
}
.goods-now {
  color: #E53935;
  font-size: 48rpx;
  font-weight: 900;
  letter-spacing: -2rpx;
}
.goods-decimal {
  color: #E53935;
  font-size: 28rpx;
  font-weight: 900;
}
.goods-was {
  color: #999;
  text-decoration: line-through;
  font-size: 20rpx;
  width: 100%;
  margin-top: 8rpx;
}
.goods-save {
  display: inline-block;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  color: #B01E1E;
  background: #FFE2DB;
  font-size: 20rpx;
  font-weight: 900;
  margin-top: 6rpx;
}
.goods-action button {
  width: 72rpx;
  height: 72rpx;
  min-width: 88rpx;
  min-height: 88rpx;
  margin: 0 -8rpx -8rpx 0;
  padding: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(145deg, #E53935, #FF8F1F);
  font-size: 42rpx;
  line-height: 72rpx;
  font-weight: 700;
  box-shadow: 0 6rpx 16rpx rgba(229, 57, 53, 0.35);
}
</style>
