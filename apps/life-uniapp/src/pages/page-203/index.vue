<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { normalizeLifeQuery, recentLifeSearches } from '../../services/life-discovery.js';

const STORAGE_KEY = 'lequ.life.recent-searches.v1';
const query = ref('');
const recent = ref([]);
const suggestions = Object.freeze(['早餐', '水果', '家庭保洁', '周末团购', '附近门店', '本地好物']);

function search(value = query.value) {
  const normalized = normalizeLifeQuery(value);
  if (!normalized) {
    uni.showToast({ title: '请输入搜索内容', icon: 'none' });
    return;
  }
  recent.value = recentLifeSearches(recent.value, normalized);
  uni.setStorageSync(STORAGE_KEY, recent.value);
  uni.navigateTo({ url: `/pages/page-204/index?q=${encodeURIComponent(normalized)}` });
}

function clearRecent() {
  recent.value = [];
  uni.removeStorageSync(STORAGE_KEY);
}

onShow(() => {
  const stored = uni.getStorageSync(STORAGE_KEY);
  recent.value = Array.isArray(stored) ? stored.slice(0, 8) : [];
});
</script>

<template>
  <LifeSurface
    eyebrow="PAGE-203 · 综合搜索"
    title="找商品，也找附近服务"
    detail="结果仅来自当前账户有权访问的门店，不跨租户猜测"
  >
    <view class="search-form">
      <input
        v-model="query"
        maxlength="60"
        focus
        confirm-type="search"
        placeholder="商品、门店或服务"
        @confirm="search()"
      />
      <button @click="search()">搜索</button>
    </view>
    <view class="search-trust"
      ><text>商品实时在售</text><text>门店关系有效</text><text>不跨租户猜测</text></view
    >
    <view class="section">
      <view class="section-head"><text>大家常搜</text><text>快捷入口</text></view>
      <view class="chips"
        ><button v-for="item in suggestions" :key="item" class="chip" @click="search(item)">
          {{ item }}
        </button></view
      >
    </view>
    <view v-if="recent.length" class="section">
      <view class="section-head"
        ><text>最近搜索</text><button size="mini" @click="clearRecent">清除</button></view
      >
      <view class="recent-list"
        ><button v-for="item in recent" :key="item" @click="search(item)">{{ item }}</button></view
      >
    </view>
    <view class="section search-policy"
      ><text
        >搜索词仅保存在当前设备用于快捷访问；服务端按当前消费者会话和有效商户关系返回结果。</text
      ></view
    >
  </LifeSurface>
</template>

<style scoped>
.search-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14rpx;
  margin-top: 24rpx;
}
.search-form input {
  height: 84rpx;
  padding: 0 24rpx;
  border: 2rpx solid #0f9d72;
  border-radius: 24rpx;
  background: #fff;
  box-sizing: border-box;
  font-size: 25rpx;
}
.search-form button {
  margin: 0;
  color: #fff;
  background: #076c50;
  border-radius: 24rpx;
  font-size: 24rpx;
}
.search-trust {
  display: grid;
  margin-top: 16rpx;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.search-trust text {
  padding: 14rpx 8rpx;
  border-radius: 16rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  text-align: center;
  font-size: 15rpx;
  font-weight: 800;
}
.search-trust text:nth-child(2) {
  color: #9b3f20;
  background: var(--life-coral-soft);
}
.search-trust text:nth-child(3) {
  color: #075d70;
  background: var(--life-blue-soft);
}
.chips button {
  margin: 0;
  border: 0;
}
.section-head button {
  margin: 0;
  color: #66736d;
  background: #f1f5f3;
  border-radius: 999rpx;
}
.recent-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
}
.recent-list button {
  margin: 0;
  color: #18231f;
  text-align: left;
  background: #f8faf9;
  border-radius: 18rpx;
  font-size: 22rpx;
}
.search-policy {
  color: #66736d;
  font-size: 21rpx;
  line-height: 1.7;
}
</style>
