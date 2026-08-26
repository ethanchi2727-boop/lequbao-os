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
    compact
    :show-assurance="false"
    eyebrow="PAGE-200 · 生活分类"
    title="按今天要做的事来找"
    detail="分类映射到服务端冻结商品类型，切换不会改变真实库存与价格"
  >
    <button class="search-entry" @click="uni.navigateTo({ url: '/pages/page-203/index' })">
      <view class="search-entry-mark"></view><text>搜索商品、服务或附近门店</text><text>搜索</text>
    </button>
    <view class="category-grid">
      <button
        v-for="(category, index) in lifeCategories"
        :key="category.id"
        :class="['category-card', category.accent]"
        @click="openCategory(category)"
      >
        <view
          class="category-icon"
          :style="{
            '--sprite-x': `${(index % 5) * 25}%`,
            '--sprite-y': `${Math.floor(index / 5) * 50}%`,
          }"
        />
        <text>{{ category.label }}</text>
        <text>{{
          index < 2 ? '送到家或到店自提' : index === 2 ? '规则与库存实时确认' : '预约和履约状态可查'
        }}</text>
      </button>
    </view>
    <view class="scene-strip">
      <button @click="openCategory(lifeCategories[0])">
        <text>今日新鲜</text><text>果蔬肉蛋 · 实时库存</text>
      </button>
      <button @click="openCategory(lifeCategories[2])">
        <text>附近好吃</text><text>团购规则 · 到店核销</text>
      </button>
      <button @click="openCategory(lifeCategories[3])">
        <text>周末放松</text><text>服务预约 · 履约可查</text>
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
  display: grid;
  width: 100%;
  margin: 20rpx 0 24rpx;
  padding: 8rpx 8rpx 8rpx 22rpx;
  border: 1rpx solid var(--life-line);
  grid-template-columns: 28rpx 1fr auto;
  align-items: center;
  gap: 10rpx;
  color: var(--life-muted);
  text-align: left;
  background: var(--life-paper);
  border-radius: 999rpx;
  box-shadow: var(--life-shadow-soft);
  font-size: 23rpx;
}
.search-entry-mark {
  width: 19rpx;
  height: 19rpx;
  border: 4rpx solid var(--life-muted);
  border-radius: 50%;
  box-sizing: border-box;
}
.search-entry > text:last-child {
  padding: 11rpx 24rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: var(--life-brand);
  font-size: 18rpx;
  font-weight: 900;
}
.category-grid {
  display: grid;
  padding: 22rpx 12rpx;
  border-radius: var(--life-radius-lg);
  grid-template-columns: repeat(4, 1fr);
  gap: 20rpx 8rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.category-card {
  display: flex;
  min-height: 154rpx;
  margin: 0;
  padding: 4rpx;
  align-items: center;
  flex-direction: column;
  text-align: center;
  background: transparent;
}
.category-icon {
  width: 94rpx;
  height: 94rpx;
  margin-bottom: 9rpx;
  border-radius: 50%;
  background-image: url('../../assets/v63-retail/category-sprite.webp');
  background-repeat: no-repeat;
  background-size: 500% 300%;
  background-position: var(--sprite-x) var(--sprite-y);
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.08);
}
.category-card > text:nth-child(2) {
  font-size: 19rpx;
  font-weight: 900;
}
.category-card > text:last-child {
  display: none;
  color: var(--life-muted);
  font-size: 16rpx;
  line-height: 1.4;
}
.scene-strip {
  display: grid;
  margin-top: 20rpx;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 12rpx;
}
.scene-strip button {
  display: flex;
  min-width: 0;
  min-height: 142rpx;
  margin: 0;
  padding: 18rpx 12rpx;
  border-radius: var(--life-radius-md);
  justify-content: center;
  flex-direction: column;
  background: var(--life-brand-soft);
  line-height: 1.35;
}
.scene-strip button:nth-child(2) {
  background: var(--life-coral-soft);
}
.scene-strip button:nth-child(3) {
  background: var(--life-blue-soft);
}
.scene-strip text:first-child {
  font-size: 21rpx;
  font-weight: 900;
}
.scene-strip text:last-child {
  margin-top: 6rpx;
  color: var(--life-muted);
  font-size: 14rpx;
}
.promise {
  margin-bottom: 30rpx;
}
.promise > text {
  color: var(--life-muted);
  font-size: 22rpx;
  line-height: 1.7;
}
</style>
