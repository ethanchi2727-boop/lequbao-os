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
onShow(load);
</script>

<template>
  <LifeSurface primary :show-assurance="false" theme-color="coral">
    <template #ambient>
      <view class="mall-hero">
        <view class="hero-copy">
          <text>乐趣生活 · 品质商城</text><text>家庭采购</text><text>一次买齐更省心</text>
          <text>价格与库存以服务端实时确认为准</text>
          <button @click="uni.navigateTo({ url: '/pages/page-207/index' })">进入商城精选 ›</button>
        </view>
        <view class="hero-product" />
        <view class="hero-seal"><text>品质</text><text>严选</text></view>
      </view>
      <view class="mall-quick-grid">
        <button @click="uni.navigateTo({ url: '/pages/page-200/index' })">
          <text>全部分类</text><text>按需选购</text>
        </button>
        <button @click="uni.navigateTo({ url: '/pages/page-213/index' })">
          <text>活动会场</text><text>规则透明</text>
        </button>
        <button @click="uni.navigateTo({ url: '/pages/page-211/index' })">
          <text>来源可查</text><text>品质故事</text>
        </button>
        <button @click="uni.switchTab({ url: '/pages/cart/index' })">
          <text>我的购物车</text><text>服务端核价</text>
        </button>
      </view>
    </template>

    <view class="mall-benefits"
      ><text>✓ 在售实核</text><text>✓ 库存同步</text><text>✓ 配送透明</text
      ><text>✓ 售后有门</text></view
    >
    <view class="retail-search">
      <text>⌕</text
      ><input
        v-model="query"
        confirm-type="search"
        placeholder="搜索商品、规格或门店"
        aria-label="搜索商城商品"
      />
      <button v-if="query" @click="query = ''">清除</button>
    </view>
    <scroll-view scroll-x class="channel-scroll">
      <button
        v-for="channel in channels"
        :key="channel"
        :class="{ active: activeChannel === channel }"
        @click="activeChannel = channel"
      >
        {{ channel }}
      </button>
    </scroll-view>

    <view v-if="state === 'loading'" class="retail-state">正在读取真实商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="retail-state">登录后查看商城</view>
    <view v-else-if="state === 'forbidden'" class="retail-state">当前账户无权查看该商城</view>
    <view v-else-if="state === 'recoverable-error'" class="retail-state" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="retail-state">当前没有在售实物商品</view>
    <view v-else class="mall-shelf">
      <view class="shelf-heading"
        ><view><text>本周家庭采购</text><text>实时在售</text></view
        ><text>{{ filteredProducts.length }} 件</text></view
      >
      <view v-if="filteredProducts.length" class="goods-grid">
        <LifeRetailProductCard
          v-for="(product, index) in filteredProducts"
          :key="product.id"
          :product="product"
          :index="index"
          @select="selectedProduct = product"
          @add="addToCart"
        />
      </view>
      <view v-else class="retail-state">没有匹配的在售商品，换个关键词试试</view>
    </view>

    <view v-if="selectedProduct" class="product-sheet" @click="selectedProduct = null">
      <view class="product-sheet-card" @click.stop>
        <view class="sheet-photo" /><text class="sheet-kicker">{{
          selectedProduct.storeName
        }}</text>
        <text class="sheet-title">{{ selectedProduct.title }}</text>
        <text class="sheet-copy"
          >{{ selectedProduct.variantTitle }} · 当前可售
          {{ selectedProduct.availableQuantity }} 件</text
        >
        <view class="trace-note"
          ><text>来源与规则</text
          ><text>门店、在售状态、当前规格与库存均来自服务端实时投影。</text></view
        >
        <view class="sheet-action"
          ><text>¥{{ (selectedProduct.salePriceCents / 100).toFixed(2) }}</text
          ><button
            :disabled="selectedProduct.availableQuantity < 1"
            @click="addToCart(selectedProduct)"
          >
            加入购物车
          </button></view
        >
        <button class="sheet-detail" @click="openProductDetail(selectedProduct)">
          查看完整详情与规格
        </button>
        <button class="sheet-close" @click="selectedProduct = null">关闭详情</button>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.mall-hero {
  position: relative;
  height: 344rpx;
  margin: 8rpx 20rpx 0;
  border-radius: var(--life-radius-lg);
  overflow: hidden;
  background: linear-gradient(
    135deg,
    var(--life-coral-deep),
    var(--life-coral) 58%,
    var(--life-coral-bright)
  );
  box-shadow: var(--life-shadow);
}
.hero-copy {
  position: relative;
  z-index: 2;
  display: flex;
  width: 58%;
  padding: 30rpx;
  flex-direction: column;
  color: var(--life-paper);
}
.hero-copy > text:first-child {
  align-self: flex-start;
  padding: 7rpx 12rpx;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 16rpx;
}
.hero-copy > text:nth-child(2),
.hero-copy > text:nth-child(3) {
  font-size: 39rpx;
  line-height: 1.14;
  font-weight: 900;
}
.hero-copy > text:nth-child(2) {
  margin-top: 16rpx;
}
.hero-copy > text:nth-child(4) {
  margin-top: 10rpx;
  font-size: 16rpx;
  opacity: 0.9;
}
.hero-copy button {
  align-self: flex-start;
  margin: 20rpx 0 0;
  padding: 0 20rpx;
  border-radius: 24rpx;
  color: var(--life-coral-ink);
  background: var(--life-yellow);
  font-size: 19rpx;
  font-weight: 900;
}
.hero-product,
.sheet-photo {
  background: url('../../assets/v63-retail/product-sprite.webp') 0 0 / 400% 200% no-repeat;
}
.hero-product {
  position: absolute;
  right: -46rpx;
  bottom: -24rpx;
  width: 330rpx;
  height: 330rpx;
  border-radius: 50%;
  box-shadow: 0 0 0 18rpx rgba(255, 255, 255, 0.13);
}
.hero-seal {
  position: absolute;
  z-index: 3;
  top: 20rpx;
  right: 18rpx;
  display: flex;
  width: 78rpx;
  height: 78rpx;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--life-coral-ink);
  background: var(--life-yellow);
  font-size: 16rpx;
  font-weight: 900;
}
.mall-quick-grid {
  display: grid;
  margin: 18rpx 20rpx 0;
  padding: 20rpx;
  border-radius: var(--life-radius-lg);
  grid-template-columns: repeat(4, 1fr);
  gap: 10rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.mall-quick-grid button {
  display: flex;
  min-width: 0;
  min-height: 102rpx;
  margin: 0;
  padding: 12rpx 6rpx;
  border-radius: 20rpx;
  justify-content: center;
  flex-direction: column;
  background: var(--life-coral-soft);
  line-height: 1.3;
}
.mall-quick-grid text:first-child {
  color: var(--life-coral-ink);
  font-size: 20rpx;
  font-weight: 900;
}
.mall-quick-grid text:last-child {
  margin-top: 5rpx;
  color: var(--life-muted);
  font-size: 14rpx;
}
.mall-benefits {
  display: flex;
  min-height: 70rpx;
  border-radius: 24rpx;
  align-items: center;
  justify-content: space-around;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  font-size: 16rpx;
}
.retail-search {
  display: flex;
  height: 78rpx;
  margin-top: 18rpx;
  padding: 0 20rpx;
  border: 1rpx solid var(--life-coral-line);
  border-radius: 24rpx;
  align-items: center;
  gap: 12rpx;
  background: var(--life-paper);
}
.retail-search > text {
  color: var(--life-coral);
  font-size: 30rpx;
}
.retail-search input {
  min-width: 0;
  flex: 1;
  font-size: 22rpx;
}
.retail-search button {
  margin: 0;
  padding: 0 8rpx;
  color: var(--life-coral-ink);
  background: transparent;
  font-size: 18rpx;
}
.channel-scroll {
  width: 100%;
  margin-top: 16rpx;
  white-space: nowrap;
}
.channel-scroll button {
  display: inline-flex;
  margin: 0 12rpx 0 0;
  padding: 8rpx 26rpx;
  border-radius: 999rpx;
  color: var(--life-muted);
  background: var(--life-paper);
  font-size: 19rpx;
}
.channel-scroll .active {
  color: var(--life-paper);
  background: var(--life-coral);
  font-weight: 900;
}
.retail-state {
  margin-top: 20rpx;
  padding: 48rpx 20rpx;
  border: 2rpx dashed var(--life-line);
  border-radius: var(--life-radius-md);
  color: var(--life-muted);
  background: var(--life-paper);
  text-align: center;
}
.mall-shelf {
  margin-top: 20rpx;
}
.shelf-heading {
  display: flex;
  min-height: 84rpx;
  padding: 0 8rpx;
  align-items: center;
  justify-content: space-between;
}
.shelf-heading > view {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.shelf-heading view text:first-child {
  font-size: 31rpx;
  font-weight: 900;
}
.shelf-heading view text:last-child {
  padding: 5rpx 9rpx;
  border-radius: 8rpx;
  color: var(--life-paper);
  background: var(--life-coral);
  font-size: 14rpx;
}
.shelf-heading > text {
  color: var(--life-muted);
  font-size: 18rpx;
}
.goods-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}
.product-sheet {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: flex;
  padding: 30rpx;
  align-items: flex-end;
  background: rgba(16, 32, 25, 0.48);
  box-sizing: border-box;
}
.product-sheet-card {
  display: flex;
  width: 100%;
  max-height: 88vh;
  padding: 28rpx;
  border-radius: 32rpx 32rpx 12rpx 12rpx;
  flex-direction: column;
  background: var(--life-paper);
  box-sizing: border-box;
}
.sheet-photo {
  width: 100%;
  height: 300rpx;
  border-radius: 24rpx;
}
.sheet-kicker {
  margin-top: 18rpx;
  color: var(--life-coral-ink);
  font-size: 20rpx;
  font-weight: 800;
}
.sheet-title {
  margin: 7rpx 0;
  font-size: 34rpx;
  font-weight: 900;
}
.sheet-copy,
.trace-note text:last-child {
  color: var(--life-muted);
  font-size: 21rpx;
  line-height: 1.55;
}
.trace-note {
  display: flex;
  margin: 18rpx 0;
  padding: 18rpx;
  border-radius: 18rpx;
  flex-direction: column;
  gap: 6rpx;
  background: var(--life-yellow-soft);
}
.trace-note text:first-child {
  color: var(--life-yellow-ink);
  font-weight: 900;
}
.sheet-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sheet-action > text {
  color: var(--life-red);
  font-size: 32rpx;
  font-weight: 900;
}
.sheet-action button,
.sheet-detail {
  margin: 0;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: var(--life-coral);
  font-size: 21rpx;
}
.sheet-detail {
  margin-top: 16rpx;
  background: var(--life-brand-deep);
}
.sheet-close {
  margin-top: 12rpx;
  border-radius: 999rpx;
  color: var(--life-muted);
  background: var(--life-wash);
  font-size: 21rpx;
}
</style>
