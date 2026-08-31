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
   *
   * Concept-f 升级（日夜双主题 + 入场动画 + banner tint）：
   *  --hd1/--hd2      英雄区主色（渐变 top/deep）
   *  --bg/--card      页面/卡片背景
   *  --ink/--mut      主/次 文字
   *  --accent/--promo/--hot/--yel 绿/红/橙/黄 语义色
   *  --tabbar/--line/--shadow     顶栏/分割线/阴影
   *  --notice-bg/--notice-tx      公告条
   *  --cnt-bg/--cnt-tx            倒计时胶囊
   *  @property --tint             三图轮播横幅渐变底色，CSS 动画平滑联动
   *
   *  data-theme="dark" 覆盖上述变量即可切换夜间模式；
   *  .fu → .in 类切换滚动入场动画。
   */
  /* ========= V6.1 / V6.3 正式设计（保留，与 concept-f token 并存） ========= */
  --life-brand: #0d8b62;
  --life-brand-deep: #066b4c;
  --life-brand-soft: #e7f7f0;
  --life-coral: #ff5a36;
  --life-coral-soft: #fff0ea;
  --life-coral-ink: #9b3f20;
  --life-red: #e03b36;
  --life-yellow: #ffc93e;
  --life-yellow-soft: #fff8e1;
  --life-blue: #1596c9;
  --life-blue-soft: #e8f7fd;
  --life-blue-deep: #087b8d;
  --life-blue-ink: #075d70;
  --life-blue-mist: #edfafa;
  --life-blue-bright: #8cd9d3;
  --life-coral-deep: #d92636;
  --life-coral-bright: #ff9c68;
  --life-coral-amber: #f39a42;
  --life-coral-line: #ffd2cb;
  --life-ink-soft: #46534d;
  --life-muted-bright: #84908a;
  --life-yellow-deep: #d38a00;
  --life-yellow-ink: #7b4f00;
  --life-channel-green-soft: #e7f8c8;
  --life-channel-green-bright: #b9df66;
  --life-channel-yellow-soft: #fff0d0;
  --life-channel-yellow-bright: #ffd072;
  --life-channel-coral-soft: #ffe5df;
  --life-channel-coral-bright: #ffc1ad;
  --life-channel-blue-soft: #dff9ff;
  --life-channel-blue-bright: #82ddee;
  --life-paper: #ffffff;
  --life-bg: #fff9ec;
  --life-ink: #17201c;
  --life-muted: #66736d;
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
  /* ========= Concept-f（ADR-0013 V6.3 视觉补钉） 日夜双主题 ========= */
  --hd1: #009146;
  --hd2: #006b36;
  --bg: #f6f1e6;
  --card: #ffffff;
  --ink: #16130f;
  --mut: #857c6d;
  --accent: #009146;
  --promo: #f03749;
  --hot: #eb6325;
  --yel: #fee600;
  --tabbar: #ffffff;
  --line: rgba(22, 19, 15, 0.08);
  --notice-bg: #e6f3ea;
  --notice-tx: #0b6b3d;
  --cnt-bg: #16130f;
  --cnt-tx: #fee600;
  --shadow: 0 10rpx 26rpx rgba(22, 19, 15, 0.09);
  --tint: #e7f4ef;
  background: var(--bg);
  color: var(--ink);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
page[data-theme='dark'] {
  --life-bg: #0e0d0b;
  --life-paper: #1b1916;
  --life-ink: #f6f1e6;
  --life-muted: #b5afa2;
  --life-line: rgba(246, 241, 230, 0.1);
  --life-wash: #161512;
  --hd1: #1bb061;
  --hd2: #0f834a;
  --bg: #0e0d0b;
  --card: #1b1916;
  --ink: #f6f1e6;
  --mut: #b5afa2;
  --accent: #29c676;
  --promo: #ff5a6c;
  --hot: #ff884d;
  --yel: #fff27a;
  --tabbar: #1b1916;
  --line: rgba(246, 241, 230, 0.1);
  --notice-bg: #0e3222;
  --notice-tx: #b9f2ce;
  --cnt-bg: #f6f1e6;
  --cnt-tx: #16130f;
  --shadow: 0 10rpx 26rpx rgba(0, 0, 0, 0.4);
  --tint: #12261b;
}
@supports (background: var(--tint, initial)) {
  @property --tint {
    syntax: '<color>';
    inherits: true;
    initial-value: #e7f4ef;
  }
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

/* ========= Concept-f 通用：入场动画 / 金刚位 3D 黏土发光 / 小满 AI 浮动按钮 / 通用分区标题 ========= */
.fu {
  opacity: 0;
  transform: translateY(26rpx);
  transition: opacity 520ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, opacity;
}
.fu.in {
  opacity: 1;
  transform: translateY(0);
}
/* 通用黏土图标光晕容器（5 色变体） */
.gic {
  position: relative;
  display: inline-flex;
  width: 96rpx;
  height: 96rpx;
  border-radius: 30rpx;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.gic::before {
  position: absolute;
  content: '';
  inset: 0;
  border-radius: 30rpx;
  background: radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.2) 56%, rgba(255, 255, 255, 0) 74%);
}
.gic::after {
  position: absolute;
  content: '';
  inset: 6rpx;
  border-radius: 24rpx;
  background: var(--c2, #e7f7f0);
  box-shadow: inset 0 -4rpx 0 rgba(0, 0, 0, 0.06);
}
.gic .gph {
  position: relative;
  z-index: 1;
  width: 68rpx;
  height: 68rpx;
  border-radius: 22rpx;
  background-image: url('./assets/v63-retail/category-sprite.webp');
  background-repeat: no-repeat;
  background-size: 500% 300%;
  background-position: var(--sprite-x, 0) var(--sprite-y, 0);
  box-shadow: 0 4rpx 10rpx rgba(0, 0, 0, 0.1);
}
/* 订单 / 服务 3D 小图标（概念-f oic/ric/n/sic 简化成单类） */
.oic {
  position: relative;
  display: inline-flex;
  width: 92rpx;
  height: 92rpx;
  border-radius: 28rpx;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0) 62%), var(--c2, #fff2df);
}
.oic .mono {
  position: relative;
  z-index: 1;
  color: var(--c1, #eb6325);
  font-size: 44rpx;
  font-weight: 900;
  line-height: 1;
}
/* 小满 AI FAB 通用 */
.maifab {
  position: fixed;
  right: 24rpx;
  bottom: calc(180rpx + env(safe-area-inset-bottom));
  z-index: 90;
  display: inline-flex;
  padding: 16rpx 24rpx 16rpx 16rpx;
  border-radius: 999rpx;
  align-items: center;
  gap: 12rpx;
  color: #063d28;
  background: linear-gradient(135deg, #ffe27a, #ffb14c 60%, #ff6d3a);
  box-shadow: 0 16rpx 36rpx rgba(255, 122, 52, 0.35), 0 2rpx 0 rgba(255, 255, 255, 0.8) inset;
  animation: maipulse 2.8s ease-in-out infinite;
}
.maifab .mai-ava {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: #fff;
  border: 3rpx solid #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  color: #009146;
  font-weight: 900;
}
.maifab .mai-lab {
  font-size: 24rpx;
  font-weight: 900;
  letter-spacing: 0.5rpx;
}
@keyframes maipulse {
  0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 16rpx 36rpx rgba(255, 122, 52, 0.35), 0 2rpx 0 rgba(255, 255, 255, 0.8) inset; }
  50% { transform: translateY(-4rpx) scale(1.02); box-shadow: 0 22rpx 46rpx rgba(255, 122, 52, 0.45), 0 2rpx 0 rgba(255, 255, 255, 0.9) inset; }
}
/* 通用分区标题（+更多按钮） */
.sec-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 24rpx 28rpx 16rpx;
}
.sec-h .sec-tt {
  font-size: 34rpx;
  font-weight: 900;
  color: var(--ink, #16130f);
  letter-spacing: 0.4rpx;
}
.sec-h .sec-tt::before {
  content: '';
  display: inline-block;
  width: 8rpx;
  height: 28rpx;
  margin-right: 12rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, var(--hd1, #009146), var(--hd2, #006b36));
  vertical-align: -2rpx;
}
.sec-h .sec-more {
  font-size: 22rpx;
  color: var(--mut, #857c6d);
  font-weight: 700;
}
/* 通用卡片：白底 + 阴影 + 日夜边界 */
.cc {
  background: var(--card, #fff);
  border-radius: 28rpx;
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line, rgba(22, 19, 15, 0.08));
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
