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
    compact
    :show-assurance="false"
    eyebrow="PAGE-203 · 综合搜索"
    title="搜索乐趣生活"
    detail="商品、门店与本地服务，一次找到"
  >
    <view class="search-form">
      <view class="search-mark" aria-hidden="true"></view>
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
    <view v-if="recent.length" class="search-section">
      <view class="search-section-head"
        ><view><text class="history-mark"></text><text>历史搜索</text></view
        ><button size="mini" @click="clearRecent">清除</button></view
      >
      <view class="search-chips recent-chips"
        ><button v-for="item in recent" :key="item" @click="search(item)">{{ item }}</button></view
      >
    </view>
    <view class="search-section">
      <view class="search-section-head"
        ><view><text class="hot-mark"></text><text>热门搜索</text></view
        ><text>本地精选</text></view
      >
      <view class="search-chips"
        ><button
          v-for="(item, index) in suggestions"
          :key="item"
          :class="{ hot: index < 3 }"
          @click="search(item)"
        >
          {{ item }}
        </button></view
      >
    </view>
    <view class="search-trust"
      ><text>实时在售</text><text>同城门店</text><text>服务可追溯</text></view
    >
    <view class="search-policy"
      ><text
        >搜索词仅保存在当前设备用于快捷访问；服务端按当前消费者会话和有效商户关系返回结果，不跨租户猜测。</text
      ></view
    >
  </LifeSurface>
</template>

<style scoped>
.search-form {
  display: grid;
  position: sticky;
  z-index: 2;
  top: 0;
  grid-template-columns: 34rpx 1fr auto;
  gap: 8rpx;
  margin: 20rpx -2rpx 0;
  padding: 8rpx 8rpx 8rpx 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 999rpx;
  align-items: center;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.search-form input {
  height: 70rpx;
  padding: 0 8rpx;
  box-sizing: border-box;
  font-size: 24rpx;
}
.search-form button {
  margin: 0;
  padding: 0 28rpx;
  color: var(--life-paper);
  background: var(--life-brand);
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 800;
}
.search-mark {
  width: 20rpx;
  height: 20rpx;
  border: 4rpx solid var(--life-muted);
  border-radius: 50%;
  box-sizing: border-box;
}
.search-mark::after {
  display: block;
  width: 9rpx;
  height: 4rpx;
  margin: 14rpx 0 0 13rpx;
  border-radius: 999rpx;
  background: var(--life-muted);
  content: '';
  transform: rotate(45deg);
}
.search-section {
  margin-top: 34rpx;
  padding: 0 4rpx;
}
.search-section-head {
  display: flex;
  margin-bottom: 18rpx;
  align-items: center;
  justify-content: space-between;
}
.search-section-head > view {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 25rpx;
  font-weight: 900;
}
.search-section-head > text,
.search-section-head button {
  margin: 0;
  padding: 0;
  color: var(--life-muted);
  background: transparent;
  font-size: 18rpx;
}
.history-mark,
.hot-mark {
  display: block;
  width: 18rpx;
  height: 18rpx;
  border: 4rpx solid var(--life-muted-bright);
  border-radius: 50%;
}
.hot-mark {
  border: 0;
  border-radius: 12rpx 12rpx 12rpx 2rpx;
  background: var(--life-red);
  transform: rotate(45deg);
}
.search-chips {
  display: flex;
  gap: 14rpx;
  flex-wrap: wrap;
}
.search-chips button {
  margin: 0;
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  color: var(--life-ink-soft);
  background: var(--life-wash);
  font-size: 20rpx;
}
.search-chips button.hot {
  color: var(--life-red);
  background: var(--life-coral-soft);
}
.search-trust {
  display: grid;
  margin-top: 38rpx;
  padding: 18rpx 8rpx;
  border-top: 1rpx solid var(--life-line);
  border-bottom: 1rpx solid var(--life-line);
  grid-template-columns: repeat(3, 1fr);
}
.search-trust text {
  border-right: 1rpx solid var(--life-line);
  color: var(--life-brand-deep);
  text-align: center;
  font-size: 17rpx;
  font-weight: 800;
}
.search-trust text:last-child {
  border-right: 0;
}
.search-policy {
  margin-top: 24rpx;
  padding: 20rpx 22rpx;
  border-radius: var(--life-radius-md);
  color: var(--life-muted);
  background: var(--life-paper);
  font-size: 18rpx;
  line-height: 1.7;
}
</style>
