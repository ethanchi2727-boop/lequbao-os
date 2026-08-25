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
  --life-brand: #0aa76d;
  --life-brand-deep: #067a52;
  --life-brand-soft: #e8fbf3;
  --life-coral: #ff4f55;
  --life-coral-soft: #fff0ed;
  --life-red: #f02f36;
  --life-yellow: #ffcf2f;
  --life-yellow-soft: #fff7d7;
  --life-blue: #20bfe2;
  --life-blue-soft: #e9fbff;
  --life-paper: #ffffff;
  --life-bg: #f3f4f3;
  --life-ink: #18231f;
  --life-muted: #7b8883;
  --life-line: #e8ecea;
  --life-shadow: 0 16rpx 52rpx rgba(31, 68, 54, 0.1);
  --life-shadow-soft: 0 8rpx 30rpx rgba(31, 68, 54, 0.07);
  --life-radius-xl: 48rpx;
  --life-radius-lg: 36rpx;
  --life-radius-md: 28rpx;
  background: var(--life-bg);
  color: var(--life-ink);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
button::after {
  border: 0;
}
.section {
  margin-top: 26rpx;
  padding: 28rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
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
  color: var(--life-brand);
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
  color: var(--life-muted);
  font-size: 22rpx;
}
.price {
  color: var(--life-red);
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
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 20rpx;
  font-weight: 700;
}
.empty-safe {
  padding: 52rpx 24rpx;
  border: 2rpx dashed var(--life-line);
  border-radius: 24rpx;
  text-align: center;
  color: var(--life-muted);
}

@media (min-width: 600px) {
  uni-page-body {
    width: 480px;
    min-height: 100vh;
    margin: 0 auto;
    box-shadow: var(--life-shadow);
  }
  .uni-tabbar-bottom .uni-tabbar {
    width: 480px;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
