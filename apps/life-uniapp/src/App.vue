<script>
import { frozenLifePageRoute } from './services/life-discovery.js';

export default {
  onLaunch() {
    // #ifdef H5
    const target = frozenLifePageRoute(
      globalThis.location?.pathname ?? '',
      globalThis.location?.search ?? '',
    );
    if (target) setTimeout(() => uni.reLaunch({ url: target }), 0);
    // #endif
  },
};
</script>

<style>
page {
  /* 乐趣生活 V6.3 正式主题 Token（按 乐趣生活鲜活视觉设计系统 / ADR-0013）：
   * 生活绿 #0D8B62（服务/信任/溯源/AI助手/正常）
   * 交易橙 #FF5A36（价格/立即购买/领券/限时优惠）
   * 暖米白 #FFF9EC（首页氛围和生活温度）
   * 中性灰 #F5F7F6（商城/购物车/列表背景）
   * 深墨色 #17201C（主文字/重要数字）
   */
  --life-brand: #0d8b62; /* 松石绿/生活绿 主色 */
  --life-brand-deep: #066b4c; /* 深墨绿 主文字辅强 */
  --life-brand-soft: #e7f7f0; /* 绿色软底 */
  --life-coral: #ff5a36; /* 交易橙（原设计稿），用于价格/购买/优惠 */
  --life-coral-soft: #fff0ea; /* 橙色软底 */
  --life-coral-ink: #9b3f20; /* 棕红文字：到手价/原价深色（保留原视觉，集中管理） */
  --life-red: #e03b36; /* 砖红，仅用于错误/拒绝 */
  --life-yellow: #ffc93e; /* 明黄，优惠权益 */
  --life-yellow-soft: #fff8e1;
  --life-blue: #1596c9; /* 湖蓝，活动氛围 */
  --life-blue-soft: #e8f7fd;
  --life-blue-deep: #087b8d; /* 湖蓝深色：服务/旅程页渐变 top（保留原视觉，集中管理） */
  --life-blue-ink: #075d70; /* 湖蓝文字：更深辅文（保留原视觉，集中管理） */
  --life-blue-mist: #edfafa; /* 极浅蓝雾：溯源/服务页浅蓝渐变起色 */
  --life-blue-bright: #8cd9d3; /* 亮青蓝：地图/社区渐变收色 */
  --life-coral-deep: #d92636; /* 深红渐变起色：商城 hero 顶部 */
  --life-coral-bright: #ff9c68; /* 浅橙渐变收色：商城 hero / 节日徽章 */
  --life-coral-amber: #f39a42; /* 橙黄渐变起色：会员卡/权益汇总（精确保留原视觉） */
  --life-coral-line: #ffd2cb; /* 浅橙描边：商城输入条 */
  --life-ink-soft: #46534d; /* 深灰次文字：表单/卡片深色辅文 */
  --life-muted-bright: #84908a; /* 浅灰次文字：分割线/占位辅文 */
  --life-yellow-deep: #d38a00; /* 暖金：图标边/装饰圆点 */
  --life-yellow-ink: #7b4f00; /* 棕黄文字：说明/标签/权益深色（统一 #7b4f00 #9b5c00 #7a4300） */
  --life-channel-green-soft: #e7f8c8; /* 装饰渠道卡：绿调起色 */
  --life-channel-green-bright: #b9df66; /* 装饰渠道卡：绿调收色 */
  --life-channel-yellow-soft: #fff0d0; /* 装饰渠道卡：黄调起色 */
  --life-channel-yellow-bright: #ffd072; /* 装饰渠道卡：黄调收色 */
  --life-channel-coral-soft: #ffe5df; /* 装饰渠道卡：橙调起色 */
  --life-channel-coral-bright: #ffc1ad; /* 装饰渠道卡：橙调收色 */
  --life-channel-blue-soft: #dff9ff; /* 装饰渠道卡：蓝调起色 */
  --life-channel-blue-bright: #82ddee; /* 装饰渠道卡：蓝调收色 */
  --life-paper: #ffffff; /* 卡片底色 */
  --life-bg: #fff9ec; /* 暖米白，整体页面底色 */
  --life-ink: #17201c; /* 深墨色 主文字 */
  --life-muted: #66736d; /* 次文字：灰绿（按设计系统） */
  --life-line: #e8ebe9;
  --life-wash: #fafbf9;
  --life-overlay: rgba(23, 32, 28, 0.46);
  --life-glass: rgba(255, 255, 255, 0.22);
  --life-shadow: 0 16rpx 52rpx rgba(23, 65, 50, 0.12);
  --life-shadow-soft: 0 8rpx 30rpx rgba(23, 65, 50, 0.08);
  --life-shadow-card: 0 5rpx 18rpx rgba(23, 65, 50, 0.09);
  --life-shadow-float: 0 10rpx 24rpx rgba(13, 139, 98, 0.3);
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
