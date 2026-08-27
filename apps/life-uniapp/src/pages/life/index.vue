<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import summerFestivalAsset from '../../assets/v63-retail/summer-festival.webp';
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
    theme-color="green"
    eyebrow="今日生活直供"
    title="把新鲜和附近，装进生活篮子"
    detail="当日达 · 来源可查 · 售后有入口"
  >
    <template #ambient>
      <view class="festival">
        <image :src="summerFestivalAsset" mode="aspectFill" />
        <view class="festival-copy">
          <text>乐趣生活 · 夏日会场</text>
          <view class="festival-title"><text>一站买齐</text><text>今日生活所需</text></view>
          <text>生鲜 · 食品 · 百货 · 到家服务</text>
          <button @click="uni.navigateTo({ url: '/pages/page-213/index' })">进入活动会场 ›</button>
        </view>
        <view class="festival-badge"><text>权益透明</text><text>以结算确认为准</text></view>
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
      <button @click="uni.switchTab({ url: '/pages/cart/index' })">
        <text>结算优惠</text><text>按服务端实时核价</text><text>去结算</text>
      </button>
      <button @click="uni.navigateTo({ url: '/pages/page-252/index' })">
        <text>消费奖励</text><text>支付后按规则入账</text><text>看明细</text>
      </button>
      <button @click="uni.navigateTo({ url: '/pages/page-200/index' })">全部分类</button>
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
        <view><text>今日热卖</text><text>真实库存</text></view>
        <button @click="uni.switchTab({ url: '/pages/mall/index' })">天天好价 ›</button>
      </view>
      <view class="flash-row">
        <button
          v-for="(product, index) in products.slice(0, 4)"
          :key="product.id"
          @click="openProduct(product)"
        >
          <view class="product-photo flash-photo" :style="productStyle(index)" />
          <text>{{ product.title }}</text>
          <text>{{
            product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '暂时售罄'
          }}</text>
          <text class="retail-price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text>
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
          <view class="product-photo goods-photo" :style="productStyle(index)" />
          <text class="stock-badge">{{
            product.availableQuantity > 0 ? `库存 ${product.availableQuantity}` : '暂时售罄'
          }}</text>
          <text class="goods-title">{{ product.title }}</text>
          <text class="goods-detail">{{ product.storeName }} · {{ product.variantTitle }}</text>
          <view class="goods-action">
            <text>¥{{ (product.salePriceCents / 100).toFixed(2) }}</text>
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
  height: 410rpx;
  margin: 6rpx 20rpx 0;
  border-radius: var(--life-radius-lg);
  overflow: hidden;
  background: var(--life-blue);
  box-shadow: var(--life-shadow);
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
    rgba(0, 123, 131, 0.84),
    rgba(0, 146, 154, 0.16) 64%,
    transparent
  );
}
.festival-copy {
  position: absolute;
  z-index: 2;
  top: 36rpx;
  left: 36rpx;
  display: flex;
  flex-direction: column;
  color: var(--life-paper);
}
.festival-copy > text:first-child {
  align-self: flex-start;
  padding: 8rpx 14rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 18rpx;
}
.festival-title {
  display: flex;
  margin: 20rpx 0 10rpx;
  flex-direction: column;
  font-size: 46rpx;
  line-height: 1.14;
  font-weight: 900;
}
.festival-copy > text:nth-child(3) {
  font-size: 18rpx;
}
.festival-copy button {
  align-self: flex-start;
  margin: 28rpx 0 0;
  padding: 0 24rpx;
  border-radius: 26rpx;
  color: var(--life-yellow-ink);
  background: var(--life-yellow);
  font-size: 21rpx;
  font-weight: 800;
}
.festival-badge {
  position: absolute;
  z-index: 3;
  top: 20rpx;
  right: 20rpx;
  display: flex;
  width: 136rpx;
  height: 136rpx;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-coral), var(--life-coral-bright));
  box-shadow: 0 8rpx 28rpx rgba(165, 45, 41, 0.35);
  transform: rotate(6deg);
}
.festival-badge text:first-child {
  font-size: 20rpx;
  font-weight: 900;
}
.festival-badge text:last-child {
  margin-top: 6rpx;
  font-size: 14rpx;
}
.category-grid {
  display: grid;
  margin: 18rpx 20rpx 0;
  padding: 26rpx 12rpx 24rpx;
  border-radius: var(--life-radius-lg);
  grid-template-columns: repeat(5, 1fr);
  gap: 22rpx 10rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.category-grid button {
  position: relative;
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  line-height: 1.2;
}
.category-photo {
  width: 108rpx;
  height: 108rpx;
  margin: 0 auto;
  border-radius: 50%;
  background-image: url('../../assets/v63-retail/category-sprite.webp');
  background-size: 500% 300%;
  background-position: var(--sprite-x) var(--sprite-y);
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.08);
}
.category-grid button > text:nth-child(2) {
  display: block;
  margin-top: 10rpx;
  overflow: hidden;
  font-size: 21rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-grid button > text:nth-child(3) {
  display: block;
  margin-top: 4rpx;
  overflow: hidden;
  color: var(--life-muted);
  font-size: 15rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fresh-badge {
  position: absolute;
  top: -6rpx;
  right: 0;
  padding: 4rpx 8rpx;
  border-radius: 14rpx;
  color: var(--life-paper);
  background: var(--life-coral);
  font-size: 13rpx;
}
.benefit-strip {
  display: grid;
  padding: 14rpx;
  border-radius: var(--life-radius-md);
  grid-template-columns: 1fr 1fr 112rpx;
  gap: 8rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.benefit-strip button {
  display: flex;
  min-width: 0;
  min-height: 92rpx;
  margin: 0;
  padding: 10rpx 12rpx;
  border-radius: 20rpx;
  justify-content: center;
  flex-direction: column;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-coral), var(--life-coral));
  font-size: 16rpx;
  line-height: 1.3;
}
.benefit-strip button text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}
.benefit-strip button text:last-child {
  margin-top: 4rpx;
  opacity: 0.9;
}
.benefit-strip > button:last-child {
  align-items: center;
  color: var(--life-yellow-ink);
  background: var(--life-yellow-soft);
  font-weight: 900;
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
  margin-top: 20rpx;
  border-radius: var(--life-radius-lg);
  overflow: hidden;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.block-heading {
  display: flex;
  min-height: 110rpx;
  padding: 20rpx 24rpx;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, var(--life-coral-soft), var(--life-paper));
  box-sizing: border-box;
}
.block-heading > view {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.block-heading view text:first-child {
  font-size: 32rpx;
  font-weight: 900;
}
.block-heading view text:last-child {
  padding: 6rpx 10rpx;
  border-radius: 10rpx;
  color: var(--life-paper);
  background: var(--life-coral);
  font-size: 16rpx;
}
.block-heading button {
  margin: 0;
  padding: 0;
  color: var(--life-muted);
  background: transparent;
  font-size: 19rpx;
}
.flash-row {
  display: grid;
  padding: 0 14rpx 22rpx;
  grid-template-columns: repeat(4, 1fr);
  gap: 8rpx;
}
.flash-row button {
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  line-height: 1.3;
  text-align: left;
}
.product-photo {
  width: 100%;
  background-image: url('../../assets/v63-retail/product-sprite.webp');
  background-repeat: no-repeat;
  background-size: 400% 200%;
  background-position: var(--sprite-x) var(--sprite-y);
}
.flash-photo {
  height: 176rpx;
}
.flash-row button > text:nth-child(2) {
  display: block;
  overflow: hidden;
  font-size: 18rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flash-row button > text:nth-child(3) {
  display: inline-block;
  margin-top: 4rpx;
  padding: 4rpx 6rpx;
  border-radius: 8rpx;
  color: var(--life-coral);
  background: var(--life-coral-soft);
  font-size: 14rpx;
}
.retail-price {
  display: block;
  margin-top: 5rpx;
  color: var(--life-red);
  font-size: 26rpx;
  font-weight: 900;
}
.life-channels {
  display: grid;
  margin-top: 20rpx;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
.life-channels button {
  display: flex;
  min-height: 220rpx;
  margin: 0;
  padding: 24rpx;
  align-items: flex-start;
  justify-content: center;
  flex-direction: column;
  border-radius: var(--life-radius-lg);
  text-align: left;
  box-shadow: var(--life-shadow-soft);
}
.life-channels button text:first-child {
  font-size: 17rpx;
  font-weight: 800;
}
.life-channels button text:nth-child(2) {
  margin: 8rpx 0 4rpx;
  font-size: 30rpx;
  font-weight: 900;
}
.life-channels button text:last-child {
  color: var(--life-muted);
  font-size: 17rpx;
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
  min-height: 70rpx;
  margin-top: 20rpx;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-around;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 16rpx;
}
.store-scroll {
  width: 100%;
  padding: 0 20rpx 20rpx;
  white-space: nowrap;
  box-sizing: border-box;
}
.store-scroll button {
  display: inline-flex;
  min-width: 250rpx;
  margin: 0 12rpx 0 0;
  padding: 20rpx;
  border-radius: 20rpx;
  flex-direction: column;
  background: var(--life-brand-soft);
  text-align: left;
}
.store-scroll button text:first-child {
  font-size: 22rpx;
  font-weight: 900;
}
.store-scroll button text:last-child {
  margin-top: 6rpx;
  color: var(--life-muted);
  font-size: 17rpx;
}
.shelf-heading {
  padding: 24rpx 24rpx 0;
}
.shelf-heading > text {
  font-size: 32rpx;
  font-weight: 900;
}
.shelf-heading > view {
  display: flex;
  margin-top: 18rpx;
  border-bottom: 1rpx solid var(--life-line);
  justify-content: space-between;
}
.shelf-heading view text {
  padding: 12rpx 22rpx;
  color: var(--life-muted);
  font-size: 19rpx;
}
.shelf-heading view .active {
  border-bottom: 4rpx solid var(--life-red);
  color: var(--life-red);
  font-weight: 900;
}
.goods-grid {
  display: grid;
  padding: 16rpx;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
  background: var(--life-bg);
}
.goods-grid > view {
  position: relative;
  min-width: 0;
  margin: 0;
  padding: 0 0 18rpx;
  border-radius: var(--life-radius-lg);
  overflow: hidden;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
  line-height: 1.3;
  text-align: left;
}
.goods-photo {
  height: 330rpx;
}
.stock-badge {
  position: absolute;
  top: 288rpx;
  left: 16rpx;
  padding: 6rpx 10rpx;
  border-radius: 10rpx;
  color: var(--life-paper);
  background: var(--life-red);
  font-size: 15rpx;
}
.goods-title,
.goods-detail {
  display: block;
  margin: 12rpx 20rpx 0;
}
.goods-title {
  overflow: hidden;
  font-size: 24rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.goods-detail {
  min-height: 48rpx;
  color: var(--life-muted);
  font-size: 17rpx;
}
.goods-action {
  display: flex;
  margin: 14rpx 18rpx 0;
  align-items: center;
  justify-content: space-between;
}
.goods-action > text {
  color: var(--life-red);
  font-size: 31rpx;
  font-weight: 900;
}
.goods-action button {
  width: 52rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  color: var(--life-paper);
  background: var(--life-coral);
  font-size: 34rpx;
  line-height: 52rpx;
}
</style>
