<script setup>
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeCategories } from '../../services/life-discovery.js';

function openCategory(category) {
  uni.navigateTo({
    url: `/pages/page-201/index?category=${encodeURIComponent(category.id)}`,
  });
}
</script>

<template>
  <LifeSurface
    eyebrow="PAGE-200 · 生活分类"
    title="按今天要做的事来找"
    detail="分类映射到服务端冻结商品类型，切换不会改变真实库存与价格"
  >
    <button class="search-entry" @click="uni.navigateTo({ url: '/pages/page-203/index' })">
      搜索商品、服务或附近门店
    </button>
    <view class="category-grid">
      <button
        v-for="(category, index) in lifeCategories"
        :key="category.id"
        :class="['category-card', category.accent]"
        @click="openCategory(category)"
      >
        <view class="category-icon">
          <image src="/static/life-category-sprite.webp" mode="aspectFill" />
        </view>
        <text>{{ category.label }}</text>
        <text>{{
          index < 2 ? '送到家或到店自提' : index === 2 ? '规则与库存实时确认' : '预约和履约状态可查'
        }}</text>
      </button>
    </view>
    <view class="section promise">
      <view class="section-head"><text>分类使用说明</text><text>真实数据</text></view>
      <text>分类只帮助筛选；商品状态、价格、库存、配送范围与售后规则始终由服务端重新确认。</text>
    </view>
  </LifeSurface>
</template>

<style scoped>
.search-entry {
  margin: 24rpx 0;
  color: #66736d;
  text-align: left;
  background: #fff;
  border-radius: 22rpx;
  font-size: 23rpx;
}
.category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
}
.category-card {
  display: flex;
  min-height: 260rpx;
  margin: 0;
  padding: 22rpx;
  align-items: flex-start;
  flex-direction: column;
  text-align: left;
  background: #fff;
  border-radius: 26rpx;
  box-shadow: 0 12rpx 30rpx rgba(22, 57, 43, 0.08);
}
.category-icon {
  width: 96rpx;
  height: 96rpx;
  margin-bottom: 18rpx;
  border-radius: 30rpx;
  overflow: hidden;
  background: #e8f7f0;
}
.category-icon image {
  width: 100%;
  height: 100%;
}
.category-card > text:nth-child(2) {
  font-size: 28rpx;
  font-weight: 900;
}
.category-card > text:last-child {
  margin-top: 10rpx;
  color: #66736d;
  font-size: 19rpx;
  line-height: 1.5;
}
.category-card.orange .category-icon,
.category-card.red .category-icon {
  background: #fff0eb;
}
.category-card.blue .category-icon,
.category-card.purple .category-icon {
  background: #e9f6f8;
}
.category-card.gold .category-icon {
  background: #fff6df;
}
.promise > text {
  color: #66736d;
  font-size: 22rpx;
  line-height: 1.7;
}
</style>
