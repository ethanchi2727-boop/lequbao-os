<script>
import { frozenLifePageRoute } from './services/life-discovery.js';

export default {
  onLaunch() {
    // #ifdef H5
    const target = frozenLifePageRoute(globalThis.location?.pathname ?? '');
    if (target) setTimeout(() => uni.reLaunch({ url: target }), 0);
    // #endif
  },
};
</script>

<style>
page {
  background: #f5f7f5;
  color: #18231f;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
button::after {
  border: 0;
}
.section {
  margin-top: 26rpx;
  padding: 28rpx;
  border: 1rpx solid #e6ebe8;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 12rpx 36rpx rgba(22, 57, 43, 0.07);
}
.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 22rpx;
}
.section-head text:first-child {
  font-size: 30rpx;
  font-weight: 900;
}
.section-head text:last-child {
  color: #0f9d72;
  font-size: 22rpx;
}
.card-list {
  display: grid;
  gap: 18rpx;
}
.row-card {
  display: flex;
  gap: 22rpx;
  align-items: center;
}
.row-card image {
  width: 174rpx;
  height: 142rpx;
  border-radius: 22rpx;
  object-fit: cover;
}
.row-card .copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.row-card .copy text:first-child {
  font-size: 28rpx;
  font-weight: 800;
}
.row-card .copy text:nth-child(2) {
  margin: 8rpx 0 12rpx;
  color: #66736d;
  font-size: 22rpx;
}
.price {
  color: #ff6038;
  font-size: 30rpx;
  font-weight: 900;
}
.chips {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}
.chip {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  color: #076c50;
  background: #e8f7f0;
  font-size: 20rpx;
  font-weight: 700;
}
.empty-safe {
  padding: 52rpx 24rpx;
  border: 2rpx dashed #cfd9d4;
  border-radius: 24rpx;
  text-align: center;
  color: #66736d;
}
</style>
