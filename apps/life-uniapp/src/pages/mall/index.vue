<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSurfaceState } from '../../surface-contract.js';
import { lifeSession } from '../../services/life-session.js';

const loading = ref(false);
const error = ref(null);
const products = ref([]);
const query = ref('');
const selectedProduct = ref(null);
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
async function load() {
  loading.value = true;
  error.value = null;
  try {
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
onShow(load);
</script>
<template>
  <LifeSurface
    tone="orange"
    eyebrow="精选商城"
    title="把好品质带回家"
    detail="规格、配送与售后规则一次讲清"
    ><view class="chips"
      ><text class="chip">家庭采购</text><text class="chip">产地直达</text
      ><text class="chip">本地好物</text><text class="chip">会员严选</text></view
    ><view class="section search-box"
      ><input
        v-model="query"
        type="text"
        confirm-type="search"
        placeholder="搜索商品、规格或门店"
        aria-label="搜索商城商品"
      /><button v-if="query" size="mini" @click="query = ''">清除</button></view
    ><view v-if="state === 'loading'" class="section empty-safe">正在读取真实商品…</view>
    <view v-else-if="state === 'unauthenticated'" class="section empty-safe">登录后查看商城</view>
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权查看该商城</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view v-else-if="state === 'empty'" class="section empty-safe">当前没有在售实物商品</view>
    <view v-else class="section"
      ><view class="section-head"
        ><text>本周家庭采购</text><text>{{ filteredProducts.length }} 件</text></view
      ><view class="card-list"
        ><view
          v-for="product in filteredProducts"
          :key="product.id"
          class="row-card"
          @click="selectedProduct = product"
          ><image src="/static/life-product.webp" mode="aspectFill" /><view class="copy"
            ><text>{{ product.title }}</text
            ><text
              >{{ product.storeName }} · {{ product.variantTitle }} · 库存
              {{ product.availableQuantity }}</text
            ><view class="product-action"
              ><text class="price">¥{{ (product.salePriceCents / 100).toFixed(2) }}</text
              ><button
                size="mini"
                :disabled="product.availableQuantity < 1"
                @click.stop="addToCart(product)"
              >
                加入购物车
              </button></view
            ></view
          ></view
        ><view v-if="!filteredProducts.length" class="empty-safe"
          >没有匹配的在售商品，换个关键词试试</view
        ></view
      ></view
    ><view v-if="selectedProduct" class="product-sheet" @click="selectedProduct = null"
      ><view class="product-sheet-card" @click.stop
        ><image src="/static/life-product.webp" mode="aspectFill" /><text class="sheet-kicker">{{
          selectedProduct.storeName
        }}</text
        ><text class="sheet-title">{{ selectedProduct.title }}</text
        ><text class="sheet-copy"
          >{{ selectedProduct.variantTitle }} · 当前可售
          {{ selectedProduct.availableQuantity }} 件</text
        ><view class="trace-note"
          ><text>来源与规则</text
          ><text
            >门店、在售状态、当前规格与库存均来自服务端实时投影；完整溯源报告尚未由商户发布时不作虚假展示。</text
          ></view
        ><view class="sheet-action"
          ><text class="price">¥{{ (selectedProduct.salePriceCents / 100).toFixed(2) }}</text
          ><button
            :disabled="selectedProduct.availableQuantity < 1"
            @click="addToCart(selectedProduct)"
          >
            加入购物车
          </button></view
        ><button class="sheet-close" @click="selectedProduct = null">关闭详情</button></view
      ></view
    ></LifeSurface
  >
</template>
<style scoped>
.search-box {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.search-box input {
  height: 74rpx;
  padding: 0 22rpx;
  border-radius: 18rpx;
  flex: 1;
  background: #f4f7f5;
  font-size: 24rpx;
}
.search-box button {
  margin: 0;
  color: #9b3f20;
  background: #fff0eb;
  border-radius: 999rpx;
}
.product-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.product-action button {
  margin: 0;
  color: #fff;
  background: #9b3f20;
  border-radius: 999rpx;
  font-size: 20rpx;
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
  background: #fff;
  box-sizing: border-box;
}
.product-sheet-card > image {
  width: 100%;
  height: 320rpx;
  border-radius: 24rpx;
}
.sheet-kicker {
  margin-top: 20rpx;
  color: #9b3f20;
  font-size: 21rpx;
  font-weight: 800;
}
.sheet-title {
  margin: 8rpx 0;
  font-size: 36rpx;
  font-weight: 900;
}
.sheet-copy,
.trace-note text:last-child {
  color: #66736d;
  font-size: 22rpx;
  line-height: 1.6;
}
.trace-note {
  display: flex;
  margin: 22rpx 0;
  padding: 20rpx;
  border-radius: 20rpx;
  flex-direction: column;
  gap: 8rpx;
  background: #fff6df;
}
.trace-note text:first-child {
  color: #7b4f00;
  font-weight: 900;
}
.sheet-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sheet-action button {
  margin: 0;
  color: #fff;
  background: #9b3f20;
  border-radius: 999rpx;
  font-size: 23rpx;
}
.sheet-close {
  margin-top: 18rpx;
  color: #66736d;
  background: #f1f5f3;
  border-radius: 999rpx;
  font-size: 22rpx;
}
</style>
