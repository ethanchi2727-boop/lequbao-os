<script>
import { baoSession } from './services/bao-session.js';

export default {
  onLaunch() {
    if (typeof uni === 'undefined') return;
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    const route = current?.route ?? '';
    if (route === 'pages/login/index') return;
    if (!baoSession.load()) {
      uni.reLaunch({ url: '/pages/login/index' });
    }
  },
};
</script>

<style>
/* ============================================================
   乐趣宝移动端 V6.5 设计系统 · 乐趣生活风
   延续乐趣生活最终概念（日夜双主题）的日间主题：
   米色纸感画布、乐趣生活绿渐变、鲜绿点缀、
   暖墨文字阶（对比达标），Token 命名不变。
   ============================================================ */
page,
uni-app {
  --bao-mobile-ink-950: #16130f;
  --bao-mobile-ink-900: #16130f;
  --bao-mobile-ink-700: #3a342a;
  --bao-mobile-ink-600: #4f4739;
  --bao-mobile-ink-500: #756a58;
  --bao-mobile-ink-400: #a39481;
  --bao-mobile-ink-300: #c9c0ae;
  --bao-mobile-ink-200: #e3dcc9;
  --bao-mobile-ink-100: #f2eddf;
  --bao-mobile-ink-50: #f6f1e6;
  --bao-mobile-paper: #ffffff;
  --bao-mobile-jade-700: #006b36;
  --bao-mobile-jade-600: #009146;
  --bao-mobile-jade-500: #12a458;
  --bao-mobile-jade-400: #35c26e;
  --bao-mobile-jade-300: #8fe04a;
  --bao-mobile-jade-200: #cfecdb;
  --bao-mobile-jade-100: #e6f4e9;
  --bao-mobile-jade-50: #f2f9ee;
  --bao-mobile-cyan-500: #43a016;
  --bao-mobile-ai-700: #006b36;
  --bao-mobile-ai-600: #009146;
  --bao-mobile-ai-100: #e6f4e9;
  --bao-mobile-warning-700: #b95a17;
  --bao-mobile-warning-100: #fdf0e3;
  --bao-mobile-danger-500: #d5342c;
  --bao-mobile-line: rgba(22, 19, 15, 0.09);
  --bao-mobile-line-strong: rgba(22, 19, 15, 0.16);
  --bao-mobile-shadow-card: 0 2rpx 6rpx rgba(22, 19, 15, 0.05),
    0 16rpx 40rpx rgba(22, 19, 15, 0.12);
  --bao-mobile-shadow-float: 0 4rpx 12rpx rgba(22, 19, 15, 0.06),
    0 24rpx 56rpx rgba(22, 19, 15, 0.18);
  --bao-mobile-jade-glow: 0 12rpx 30rpx rgba(0, 107, 54, 0.3);
  --bao-mobile-radius-xl: 44rpx;
  --bao-mobile-radius-card: 36rpx;
  --bao-mobile-radius-control: 24rpx;
  --bao-mobile-radius-small: 18rpx;
  --bao-mobile-gradient-brand: linear-gradient(
    135deg,
    var(--bao-mobile-jade-500),
    var(--bao-mobile-jade-600)
  );
  --bao-mobile-gradient-hero: linear-gradient(
    155deg,
    var(--bao-mobile-ink-950),
    #0e3a26 58%,
    #07231a
  );
  --bao-mobile-gradient-dark: linear-gradient(
    160deg,
    var(--bao-mobile-ink-950),
    #0e3a26
  );
  --bao-mobile-gradient-ai: linear-gradient(
    135deg,
    var(--bao-mobile-ai-700),
    var(--bao-mobile-ai-600)
  );
  background: var(--bao-mobile-ink-50);
  color: var(--bao-mobile-ink-900);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button::after {
  border: 0;
}
button {
  transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1), opacity 0.18s;
}
button:not([disabled]):active {
  transform: scale(0.97);
  opacity: 0.92;
}

/* —— 数字排版：经营数字统一等宽对齐 —— */
.m-result view text:last-child,
.m-stats view text:nth-child(2),
.m-context text:last-child,
.progress-ring text,
.income-hero > text:nth-child(2),
.m-progress-hero > view:first-child text:nth-child(2) {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

/* —— 卡片面板 —— */
.panel {
  margin-top: 28rpx;
  overflow: hidden;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-card);
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 96rpx;
  padding: 0 28rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.panel-head text:first-child {
  position: relative;
  padding-left: 22rpx;
  font-size: 29rpx;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.panel-head text:first-child::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 8rpx;
  height: 30rpx;
  border-radius: 999rpx;
  background: var(--bao-mobile-gradient-brand);
  content: '';
  transform: translateY(-50%);
}
.panel-head text:last-child {
  color: var(--bao-mobile-jade-600);
  font-size: 22rpx;
  font-weight: 600;
}
.empty-state {
  padding: 72rpx 28rpx;
  color: var(--bao-mobile-ink-400);
  text-align: center;
  font-size: 24rpx;
  line-height: 1.7;
}

/* —— 主按钮：胶囊 + 品牌渐变 + 玉石光晕 —— */
.m-primary {
  width: 100%;
  height: 96rpx;
  margin-top: 24rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: var(--bao-mobile-jade-glow);
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 96rpx;
}
.m-primary[disabled] {
  box-shadow: none;
  opacity: 0.5;
}

/* —— 上下文 Hero：品牌渐变 + 微光装饰 —— */
.m-context {
  position: relative;
  min-height: 112rpx;
  padding: 26rpx 28rpx;
  overflow: hidden;
  border-radius: var(--bao-mobile-radius-card);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-hero);
  box-shadow: var(--bao-mobile-jade-glow);
}
.m-context::after {
  position: absolute;
  top: -70rpx;
  right: -50rpx;
  width: 220rpx;
  height: 220rpx;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(255, 255, 255, 0.22),
    rgba(255, 255, 255, 0)
  );
  content: '';
}
.m-context text {
  display: block;
}
.m-context text:first-child {
  color: rgba(255, 255, 255, 0.75);
  font-size: 22rpx;
}
.m-context text:nth-child(2) {
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.m-context text:last-child {
  position: absolute;
  top: 26rpx;
  right: 24rpx;
  z-index: 1;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-paper);
  background: rgba(255, 255, 255, 0.18);
  font-size: 22rpx;
  font-weight: 700;
}

/* —— 对话气泡：用户玉石绿渐变 —— */
.m-user {
  width: 76%;
  margin: 32rpx 0 30rpx auto;
  padding: 24rpx 28rpx;
  border-radius: 32rpx 32rpx 10rpx 32rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 8rpx 22rpx rgba(0, 145, 70, 0.2);
  font-size: 25rpx;
  line-height: 1.65;
}

/* —— AI 卡片 —— */
.m-agent {
  padding: 28rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-card);
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.m-agent-head {
  display: flex;
  gap: 16rpx;
  align-items: center;
}
.m-agent-head > text:first-child {
  display: grid;
  width: 60rpx;
  height: 60rpx;
  place-items: center;
  border-radius: 20rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-ai);
  box-shadow: 0 6rpx 16rpx rgba(0, 107, 54, 0.3);
  font-size: 20rpx;
  font-weight: 700;
}
.m-agent-head > text:nth-child(2) {
  font-size: 26rpx;
  font-weight: 700;
}
.m-agent-head > text:last-child {
  margin-left: auto;
  color: var(--bao-mobile-ink-400);
  font-size: 22rpx;
}
.m-agent .agent-title {
  display: block;
  margin: 22rpx 0 10rpx;
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.4;
}
.m-agent > text {
  display: block;
  color: var(--bao-mobile-ink-500);
  font-size: 24rpx;
  line-height: 1.7;
}
.m-result {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
  margin-top: 22rpx;
}
.m-result view {
  display: flex;
  padding: 22rpx 24rpx;
  border: 1rpx solid var(--bao-mobile-jade-100);
  border-radius: var(--bao-mobile-radius-control);
  flex-direction: column;
  background: var(--bao-mobile-jade-50);
}
.m-result view text:first-child {
  color: var(--bao-mobile-ink-500);
  font-size: 22rpx;
}
.m-result view text:last-child {
  margin-top: 8rpx;
  color: var(--bao-mobile-jade-700);
  font-size: 40rpx;
  font-weight: 800;
}
.m-agent .agent-action {
  width: 100%;
  height: 88rpx;
  margin-top: 22rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: var(--bao-mobile-jade-glow);
  font-size: 26rpx;
  font-weight: 700;
  line-height: 88rpx;
}
.m-agent .agent-action[disabled] {
  box-shadow: none;
  color: var(--bao-mobile-ink-400);
  background: var(--bao-mobile-ink-100);
}

/* —— 输入条：悬浮胶囊 + CSS 图标 —— */
.m-composer {
  display: flex;
  gap: 16rpx;
  align-items: center;
  min-height: 108rpx;
  margin-top: 24rpx;
  padding: 0 18rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 999rpx;
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-float);
}
.m-composer text:first-child {
  position: relative;
  display: grid;
  width: 64rpx;
  height: 64rpx;
  place-items: center;
  border-radius: 50%;
  background: var(--bao-mobile-ink-100);
  font-size: 0;
}
.m-composer text:first-child::before,
.m-composer text:first-child::after {
  position: absolute;
  border-radius: 999rpx;
  background: var(--bao-mobile-ink-600);
  content: '';
}
.m-composer text:first-child::before {
  width: 26rpx;
  height: 4rpx;
}
.m-composer text:first-child::after {
  width: 4rpx;
  height: 26rpx;
}
.m-composer text:nth-child(2) {
  flex: 1;
  color: var(--bao-mobile-ink-400);
  font-size: 25rpx;
}
.m-composer text:last-child {
  position: relative;
  display: grid;
  width: 68rpx;
  height: 68rpx;
  place-items: center;
  border-radius: 50%;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: var(--bao-mobile-jade-glow);
  font-size: 0;
}
.m-composer text:last-child::before {
  width: 22rpx;
  height: 22rpx;
  margin-top: 8rpx;
  border-top: 5rpx solid var(--bao-mobile-paper);
  border-left: 5rpx solid var(--bao-mobile-paper);
  border-radius: 4rpx 0 0 0;
  content: '';
  transform: rotate(45deg);
}

/* —— 区块标题：玉石竖条锚点 —— */
.m-section {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 20rpx 4rpx 12rpx;
}
.m-section text:first-child {
  position: relative;
  flex: 1;
  padding-left: 22rpx;
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.m-section text:first-child::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 8rpx;
  height: 32rpx;
  border-radius: 999rpx;
  background: var(--bao-mobile-gradient-brand);
  content: '';
  transform: translateY(-50%);
}
.m-section text:last-child {
  color: var(--bao-mobile-ink-400);
  font-size: 22rpx;
}

/* —— 列表行 —— */
.task-list {
  padding: 8rpx 28rpx 12rpx;
}
.task-row {
  display: flex;
  align-items: center;
  min-height: 128rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.task-row:last-child {
  border-bottom: 0;
}
.task-row > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.task-row > view text:first-child {
  overflow: hidden;
  font-size: 27rpx;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-row > view text:last-child {
  margin-top: 8rpx;
  overflow: hidden;
  color: var(--bao-mobile-ink-500);
  font-size: 22rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-row > text:last-child {
  margin-left: 16rpx;
  color: var(--bao-mobile-ink-300);
  font-size: 30rpx;
}
.status-chip {
  margin-left: 16rpx;
  padding: 8rpx 20rpx;
  border: 1rpx solid var(--bao-mobile-jade-200);
  border-radius: 999rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-50);
  font-size: 21rpx;
  font-weight: 600;
}
.status-chip.warning {
  border-color: rgba(169, 78, 29, 0.2);
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
.row-action {
  min-width: 120rpx;
  height: 72rpx;
  margin-left: 16rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 6rpx 16rpx rgba(11, 149, 105, 0.24);
  font-size: 24rpx;
  font-weight: 700;
  line-height: 72rpx;
}
.row-action.secondary {
  border: 1rpx solid var(--bao-mobile-jade-200);
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-50);
  box-shadow: none;
}
.row-action[disabled] {
  box-shadow: none;
  opacity: 0.5;
}

/* —— 表单 —— */
.form-stack {
  display: flex;
  gap: 20rpx;
  padding: 26rpx 28rpx 30rpx;
  flex-direction: column;
  color: var(--bao-mobile-ink-500);
  font-size: 24rpx;
  line-height: 1.6;
}
.form-input {
  height: 92rpx;
  padding: 0 28rpx;
  border: 1rpx solid var(--bao-mobile-line-strong);
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-ink-900);
  background: var(--bao-mobile-ink-50);
  font-size: 27rpx;
}
.session-note {
  display: block;
  padding: 16rpx 28rpx 26rpx;
  color: var(--bao-mobile-ink-500);
  text-align: center;
  font-size: 22rpx;
}
.session-note.failed {
  color: var(--bao-mobile-danger-500);
}
.login-checkbox {
  display: grid;
  width: 40rpx;
  height: 40rpx;
  margin-top: 2rpx;
  place-items: center;
  border: 2rpx solid var(--bao-mobile-line-strong);
  border-radius: 12rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-paper);
  font-size: 22rpx;
  font-weight: 700;
}
.login-checkbox.checked {
  border: 0;
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 4rpx 12rpx rgba(11, 149, 105, 0.3);
}

/* —— 安全提示 —— */
.guardrail {
  display: flex;
  gap: 10rpx;
  margin-top: 24rpx;
  padding: 24rpx 26rpx;
  border-left: 6rpx solid var(--bao-mobile-warning-700);
  border-radius: var(--bao-mobile-radius-control);
  flex-direction: column;
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
.guardrail text:first-child {
  font-size: 22rpx;
  font-weight: 700;
}
.guardrail text:last-child {
  color: var(--bao-mobile-ink-700);
  font-size: 24rpx;
  line-height: 1.6;
}

/* —— 进度 Hero：深玉渐变 + 微光 —— */
.m-progress-hero {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 260rpx;
  padding: 36rpx 32rpx;
  overflow: hidden;
  border-radius: var(--bao-mobile-radius-xl);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
  box-shadow: var(--bao-mobile-shadow-float);
}
.m-progress-hero::after {
  position: absolute;
  top: -90rpx;
  right: -60rpx;
  width: 280rpx;
  height: 280rpx;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(110, 199, 38, 0.35),
    rgba(110, 199, 38, 0)
  );
  content: '';
}
.m-progress-hero > view:first-child {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
}
.m-progress-hero > view:first-child text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 22rpx;
}
.m-progress-hero > view:first-child text:nth-child(2) {
  margin: 18rpx 0;
  font-size: 64rpx;
  font-weight: 800;
  line-height: 1.1;
}
.m-progress-hero > view:first-child text:last-child {
  color: rgba(255, 255, 255, 0.55);
  font-size: 22rpx;
}
.progress-ring {
  position: relative;
  z-index: 1;
  display: grid;
  width: 164rpx;
  height: 164rpx;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(
    var(--bao-mobile-jade-400) var(--progress),
    rgba(255, 255, 255, 0.14) 0
  );
}
.progress-ring text {
  display: grid;
  width: 128rpx;
  height: 128rpx;
  place-items: center;
  border-radius: 50%;
  background: var(--bao-mobile-ink-950);
  font-size: 30rpx;
  font-weight: 800;
}

/* —— 提示条 —— */
.m-notice {
  margin-top: 24rpx;
  padding: 22rpx 26rpx;
  border: 1rpx solid var(--bao-mobile-jade-100);
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-50);
  font-size: 22rpx;
  line-height: 1.6;
}

/* —— 时间线 —— */
.m-timeline {
  padding: 10rpx 28rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-card);
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.timeline-step {
  display: flex;
  gap: 22rpx;
  align-items: center;
  min-height: 132rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.timeline-step:last-child {
  border-bottom: 0;
}
.timeline-step > text:first-child {
  display: grid;
  width: 64rpx;
  height: 64rpx;
  place-items: center;
  border: 1rpx solid var(--bao-mobile-ink-200);
  border-radius: 50%;
  color: var(--bao-mobile-ink-400);
  background: var(--bao-mobile-ink-50);
  font-size: 22rpx;
  font-weight: 700;
}
.timeline-step.done > text:first-child {
  border-color: var(--bao-mobile-jade-200);
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
}
.timeline-step.active > text:first-child {
  border: 0;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-ai);
  box-shadow: 0 6rpx 16rpx rgba(0, 107, 54, 0.3);
}
.timeline-step > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.timeline-step > view text:first-child {
  overflow: hidden;
  font-size: 27rpx;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-step > view text:last-child {
  margin-top: 8rpx;
  overflow: hidden;
  color: var(--bao-mobile-ink-500);
  font-size: 22rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-step > text:last-child {
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-jade-600);
  background: var(--bao-mobile-jade-50);
  font-size: 21rpx;
  font-weight: 600;
}
.timeline-step.active > text:last-child {
  color: var(--bao-mobile-ai-700);
  background: var(--bao-mobile-ai-100);
}

/* —— 收益 Hero：品牌渐变 + 光环装饰 —— */
.income-hero {
  position: relative;
  min-height: 400rpx;
  padding: 36rpx 32rpx;
  overflow: hidden;
  border-radius: var(--bao-mobile-radius-xl);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-hero);
  box-shadow: var(--bao-mobile-jade-glow);
}
.income-hero::before {
  position: absolute;
  top: -110rpx;
  right: -70rpx;
  width: 300rpx;
  height: 300rpx;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(110, 199, 38, 0.3),
    rgba(110, 199, 38, 0)
  );
  content: '';
}
.income-hero::after {
  position: absolute;
  bottom: 60rpx;
  right: 40rpx;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(116, 208, 175, 0.16),
    rgba(116, 208, 175, 0)
  );
  content: '';
}
.income-hero > text {
  position: relative;
  z-index: 1;
  display: block;
}
.income-hero > text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 22rpx;
  font-weight: 600;
}
.income-hero > text:nth-child(2) {
  margin-top: 16rpx;
  font-size: 64rpx;
  font-weight: 800;
  line-height: 1.15;
}
.income-meta {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 28rpx;
  margin-top: 14rpx;
  color: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
}
.income-trend {
  position: absolute;
  right: 0;
  bottom: 18rpx;
  left: 0;
  width: 100%;
  height: 150rpx;
}
.income-trend path {
  fill: none;
  stroke: var(--bao-mobile-jade-400);
  stroke-width: 3;
}
.income-bars {
  position: absolute;
  right: 32rpx;
  bottom: 32rpx;
  left: 32rpx;
  display: flex;
  gap: 12rpx;
  align-items: flex-end;
  height: 130rpx;
}
.income-bars text {
  flex: 1;
  border-radius: 999rpx 999rpx 0 0;
  background: rgba(255, 255, 255, 0.28);
}
.income-bars text:last-child {
  background: var(--bao-mobile-paper);
}
.income-bars text:nth-child(1) {
  height: 22%;
}
.income-bars text:nth-child(2) {
  height: 42%;
}
.income-bars text:nth-child(3) {
  height: 34%;
}
.income-bars text:nth-child(4) {
  height: 68%;
}
.income-bars text:nth-child(5) {
  height: 92%;
}

/* —— 统计卡 —— */
.m-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  margin-top: 24rpx;
}
.m-stats view {
  display: flex;
  min-height: 160rpx;
  padding: 24rpx 26rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-card);
  flex-direction: column;
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.m-stats view text:first-child,
.m-stats view text:last-child {
  color: var(--bao-mobile-ink-500);
  font-size: 22rpx;
}
.m-stats view text:nth-child(2) {
  margin: 12rpx 0 8rpx;
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.15;
}
.m-stats view text:last-child {
  color: var(--bao-mobile-jade-600);
}

/* —— 行动卡 —— */
.m-action-card {
  display: flex;
  gap: 20rpx;
  align-items: center;
  min-height: 148rpx;
  margin-bottom: 20rpx;
  padding: 24rpx 26rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-card);
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.m-action-card > text:first-child {
  display: grid;
  width: 76rpx;
  height: 76rpx;
  place-items: center;
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-ai);
  box-shadow: 0 6rpx 16rpx rgba(0, 107, 54, 0.26);
  font-size: 22rpx;
  font-weight: 700;
}
.m-action-card > text:first-child.warning {
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
  box-shadow: none;
}
.m-action-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.m-action-card > view text:first-child {
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.4;
}
.m-action-card > view text:last-child {
  margin-top: 8rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 22rpx;
  line-height: 1.5;
}
.m-action-card > text:last-child {
  color: var(--bao-mobile-ink-300);
  font-size: 32rpx;
}

/* —— H5 手机画布锁定 —— */
@media (min-width: 520px) {
  uni-page-body {
    width: 430px;
    min-height: 100vh;
    margin: 0 auto;
    box-shadow: var(--bao-mobile-shadow-float);
  }
  .uni-tabbar-bottom .uni-tabbar {
    width: 430px;
    left: 50%;
    transform: translateX(-50%);
  }
}

/* —— H5 底部五栏：精致浮感 —— */
/* #ifdef H5 */
.uni-tabbar-bottom .uni-tabbar {
  height: 66px;
  padding: 6px 8px calc(4px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  border-top: 1px solid var(--bao-mobile-line);
  background: var(--bao-mobile-paper) !important;
  box-shadow: 0 -8px 28px rgba(17, 27, 25, 0.07);
}
.uni-tabbar-bottom .uni-tabbar__bd {
  height: 52px !important;
  border-radius: 16px;
  transition: background 0.2s;
}
.uni-tabbar-bottom .uni-tabbar__icon,
.uni-tabbar-bottom .uni-tabbar__icon img {
  width: 23px !important;
  height: 23px !important;
}
.uni-tabbar-bottom .uni-tabbar__label {
  margin-top: 3px !important;
  font-weight: 600;
  line-height: 1 !important;
}
.uni-tabbar-bottom
  .uni-tabbar__item:has(.uni-tabbar__label[style*='rgb(11, 149, 105)'])
  .uni-tabbar__bd {
  background: var(--bao-mobile-jade-50);
}
/* #endif */
/* ============================================================
   V6.3.1 动效层 · 参考大鲲AI 的进入/数字/状态反馈手法
   卡片级联入场、经营数字弹出、在线状态呼吸点；
   尊重系统减弱动态设置。
   ============================================================ */
@keyframes bao-rise {
  from {
    opacity: 0;
    transform: translateY(18rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes bao-num {
  0% {
    opacity: 0;
    transform: translateY(16rpx) scale(0.94);
  }
  60% {
    opacity: 1;
    transform: translateY(-2rpx) scale(1.015);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes bao-ping {
  0% {
    box-shadow: 0 0 0 0 rgba(110, 199, 38, 0.35);
  }
  70% {
    box-shadow: 0 0 0 12rpx rgba(110, 199, 38, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(110, 199, 38, 0);
  }
}

/* —— 卡片级联入场 —— */
.m-context,
.income-hero,
.m-progress-hero,
.m-agent,
.panel,
.m-timeline,
.m-composer,
.m-notice,
.guardrail,
.m-action-card {
  animation: bao-rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.m-user {
  animation: bao-rise 0.45s 0.05s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.m-agent,
.m-stats {
  animation: bao-rise 0.45s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.panel,
.m-timeline {
  animation-delay: 0.14s;
}
.m-composer {
  animation-delay: 0.18s;
}
.m-action-card:nth-of-type(2) {
  animation-delay: 0.08s;
}
.m-action-card:nth-of-type(3) {
  animation-delay: 0.12s;
}
.m-stats view {
  animation: bao-rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.m-stats view:nth-child(2) {
  animation-delay: 0.07s;
}

/* —— 经营数字弹出 —— */
.income-hero > text:nth-child(2),
.m-progress-hero > view:first-child text:nth-child(2),
.m-result view text:last-child,
.m-stats view text:nth-child(2),
.m-context text:last-child,
.progress-ring text {
  animation: bao-num 0.6s 0.12s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* —— 在线状态呼吸点 —— */
.status-chip,
.timeline-step.active > text:first-child {
  animation: bao-rise 0.45s both, bao-ping 2.4s 0.6s ease-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}

/* ============================================================
   V6.5.1 概念稿精修对齐层
   依据 bao-redesign/index.html（V2 精修）逐组件对齐：
   稿面宽 392px，H5 画布 430px，换算系数 750/430 = 1.744。
   字号 / 图标 / 按钮 / 间距全部按稿换算为 rpx。
   ============================================================ */
page,
uni-app {
  --bao-mobile-fresh: #6ec726;
  --bao-mobile-fresh-ink: #06281b;
  --bao-mobile-gradient-fresh: linear-gradient(135deg, #8fe04a, #43a016);
  --bao-mobile-gradient-brand: linear-gradient(135deg, #12a458, #006b36);
  --bao-mobile-gradient-ai: linear-gradient(135deg, #12a458, #006b36);
}

/* —— 卡片 · 稿 .card radius20 pad16/18 —— */
.panel {
  border-radius: 35rpx;
}
.panel-head {
  min-height: 0;
  padding: 28rpx 31rpx 0;
  border-bottom: 0;
}
.panel-head text:first-child {
  padding-left: 0;
  font-size: 24rpx;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.panel-head text:first-child::before {
  display: none;
}
.panel-head text:last-child {
  color: var(--bao-mobile-jade-600);
  font-size: 19rpx;
  font-weight: 800;
}
.empty-state {
  font-size: 22rpx;
}

/* —— 主按钮 · 稿按钮字阶 900 —— */
.m-primary {
  height: 88rpx;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 88rpx;
}

/* —— 上下文 Hero · 稿 .promo radius22 pad15/18 + 双装饰环 —— */
.m-context {
  min-height: 0;
  padding: 26rpx 31rpx;
  border-radius: 38rpx;
}
.m-context::before {
  position: absolute;
  top: -101rpx;
  right: -80rpx;
  width: 296rpx;
  height: 296rpx;
  border: 45rpx solid rgba(110, 199, 38, 0.16);
  border-radius: 50%;
  content: '';
}
.m-context::after {
  top: auto;
  right: 63rpx;
  bottom: -122rpx;
  width: 227rpx;
  height: 227rpx;
  border: 35rpx solid rgba(110, 199, 38, 0.1);
  border-radius: 50%;
  background: none;
}
.m-context text:first-child {
  position: relative;
  z-index: 1;
  color: rgba(244, 250, 246, 0.78);
  font-size: 20rpx;
}
.m-context text:nth-child(2) {
  position: relative;
  z-index: 1;
  margin-top: 9rpx;
  font-size: 28rpx;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.m-context text:last-child {
  top: 24rpx;
  right: 26rpx;
  padding: 14rpx 26rpx;
  color: var(--bao-mobile-fresh-ink);
  background: var(--bao-mobile-fresh);
  box-shadow: 0 10rpx 24rpx -7rpx rgba(110, 199, 38, 0.5);
  font-size: 20rpx;
  font-weight: 900;
}

/* —— 对话气泡 · 稿 .bubble pad11/14 font12.5 lh1.65 —— */
.m-user {
  padding: 19rpx 24rpx;
  border-radius: 31rpx 7rpx 31rpx 31rpx;
  box-shadow: 0 14rpx 31rpx -17rpx rgba(0, 107, 54, 0.5);
  font-size: 22rpx;
  line-height: 1.65;
}
.m-agent {
  padding: 28rpx 31rpx;
  border-radius: 35rpx;
}
.m-agent-head {
  gap: 17rpx;
}
.m-agent-head > text:first-child {
  width: 56rpx;
  height: 56rpx;
  border-radius: 21rpx;
  background: var(--bao-mobile-gradient-brand);
  box-shadow: inset 0 3rpx 0 rgba(255, 255, 255, 0.28);
  font-size: 20rpx;
  font-weight: 900;
}
.m-agent-head > text:nth-child(2) {
  font-size: 22rpx;
  font-weight: 800;
}
.m-agent-head > text:last-child {
  font-size: 18rpx;
  font-weight: 700;
}
.m-agent .agent-title {
  margin: 19rpx 0 9rpx;
  font-size: 26rpx;
  font-weight: 800;
}
.m-agent > text {
  color: var(--bao-mobile-ink-600);
  font-size: 22rpx;
  line-height: 1.65;
}
.m-result view {
  padding: 19rpx 21rpx;
}
.m-result view text:first-child {
  font-size: 17rpx;
  font-weight: 600;
}
.m-result view text:last-child {
  margin-top: 7rpx;
  font-size: 33rpx;
  font-weight: 900;
}
.m-agent .agent-action {
  height: 80rpx;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 80rpx;
}

/* —— 输入条 · 稿 .composer pad6/7/6/18 + .send 36px —— */
.m-composer {
  gap: 14rpx;
  min-height: 0;
  padding: 10rpx 12rpx 10rpx 31rpx;
}
.m-composer text:first-child {
  width: 56rpx;
  height: 56rpx;
}
.m-composer text:first-child::before {
  width: 24rpx;
}
.m-composer text:first-child::after {
  height: 24rpx;
}
.m-composer text:nth-child(2) {
  font-size: 22rpx;
}
.m-composer text:last-child {
  width: 63rpx;
  height: 63rpx;
  box-shadow: 0 7rpx 17rpx -3rpx rgba(0, 107, 54, 0.45),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.3);
}
.m-composer text:last-child::before {
  width: 24rpx;
  height: 24rpx;
  margin-top: 9rpx;
  border-top-width: 4rpx;
  border-left-width: 4rpx;
}

/* —— 区块标题 · 稿 .sec-tag 15px/900 —— */
.m-section {
  min-height: 0;
  padding: 26rpx 4rpx 14rpx;
}
.m-section text:first-child {
  padding-left: 0;
  font-size: 26rpx;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.m-section text:first-child::before {
  display: none;
}
.m-section text:last-child {
  color: var(--bao-mobile-jade-600);
  font-size: 19rpx;
  font-weight: 800;
}

/* —— 列表行 · 稿 .taskrow pad12/0 gap12 虚线分隔 —— */
.task-list {
  padding: 5rpx 31rpx 17rpx;
}
.task-row {
  gap: 21rpx;
  min-height: 0;
  padding: 21rpx 0;
  border-bottom: 1rpx dashed var(--bao-mobile-line);
}
.task-row > view text:first-child {
  font-size: 22rpx;
  font-weight: 800;
  letter-spacing: 0.01em;
}
.task-row > view text:last-child {
  margin-top: 5rpx;
  font-size: 18rpx;
}
.task-row > text:last-child {
  font-size: 26rpx;
}
.status-chip {
  padding: 10rpx 19rpx;
  font-size: 18rpx;
  font-weight: 900;
}

/* —— 行按钮 · 稿 .pill-btn 11px/900 pad8/14 + ghost —— */
.row-action {
  min-width: 0;
  height: auto;
  padding: 14rpx 24rpx;
  box-shadow: 0 9rpx 21rpx -9rpx rgba(0, 107, 54, 0.55);
  font-size: 19rpx;
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 1.5;
}
.row-action.secondary {
  border: 1rpx solid rgba(0, 145, 70, 0.16);
  color: var(--bao-mobile-jade-700);
  background: rgba(0, 145, 70, 0.09);
  box-shadow: none;
}

/* —— 表单 · 稿正文字阶 12.5px —— */
.form-input {
  background: var(--bao-mobile-paper);
  font-size: 24rpx;
}

/* —— 安全提示 · 稿 .guard 全框 border radius14 pad12/15 —— */
.guardrail {
  gap: 9rpx;
  padding: 21rpx 26rpx;
  border: 1rpx solid rgba(185, 90, 23, 0.18);
  border-radius: 24rpx;
}
.guardrail text:first-child {
  font-size: 20rpx;
  font-weight: 800;
}
.guardrail text:last-child {
  color: #8a5a2b;
  font-size: 20rpx;
  line-height: 1.65;
}

/* —— 进度 Hero · 稿 .promo 装饰环 + 鲜绿进度环 —— */
.m-progress-hero {
  min-height: 0;
  padding: 31rpx;
  border-radius: 38rpx;
}
.m-progress-hero::after {
  top: -101rpx;
  right: -80rpx;
  bottom: auto;
  width: 296rpx;
  height: 296rpx;
  border: 45rpx solid rgba(110, 199, 38, 0.16);
  border-radius: 50%;
  background: none;
}
.m-progress-hero > view:first-child text:first-child {
  font-size: 20rpx;
  font-weight: 700;
}
.m-progress-hero > view:first-child text:nth-child(2) {
  margin: 16rpx 0;
  font-size: 33rpx;
  font-weight: 900;
}
.m-progress-hero > view:first-child text:last-child {
  font-size: 20rpx;
}
.progress-ring {
  background: conic-gradient(
    var(--bao-mobile-jade-300) var(--progress),
    rgba(255, 255, 255, 0.14) 0
  );
}
.progress-ring text {
  font-size: 33rpx;
  font-weight: 900;
}

/* —— 提示条 / 时间线 · 字阶对齐 —— */
.m-notice {
  padding: 19rpx 24rpx;
  font-size: 20rpx;
  line-height: 1.65;
}
.timeline-step > text:first-child {
  width: 59rpx;
  height: 59rpx;
  font-size: 20rpx;
  font-weight: 800;
}
.timeline-step.active > text:first-child {
  background: var(--bao-mobile-gradient-brand);
  box-shadow: inset 0 3rpx 0 rgba(255, 255, 255, 0.28);
}
.timeline-step > view text:first-child {
  font-size: 22rpx;
  font-weight: 800;
}
.timeline-step > view text:last-child {
  margin-top: 5rpx;
  font-size: 18rpx;
}
.timeline-step > text:last-child {
  padding: 10rpx 19rpx;
  font-size: 18rpx;
  font-weight: 900;
}

/* —— 收益 Hero · 鲜绿数据条 —— */
.income-hero {
  padding: 31rpx;
  border-radius: 38rpx;
}
.income-hero::before {
  top: -101rpx;
  right: -80rpx;
  width: 296rpx;
  height: 296rpx;
  border: 45rpx solid rgba(110, 199, 38, 0.16);
  border-radius: 50%;
  background: none;
}
.income-hero::after {
  right: 63rpx;
  bottom: -70rpx;
  width: 227rpx;
  height: 227rpx;
  border: 35rpx solid rgba(110, 199, 38, 0.1);
  border-radius: 50%;
  background: none;
}
.income-hero > text:first-child {
  font-size: 20rpx;
  font-weight: 700;
}
.income-hero > text:nth-child(2) {
  font-size: 33rpx;
  font-weight: 900;
}
.income-meta {
  font-size: 20rpx;
}
.income-trend path {
  stroke: var(--bao-mobile-jade-300);
}
.income-bars text {
  background: rgba(110, 199, 38, 0.35);
}
.income-bars text:last-child {
  background: var(--bao-mobile-gradient-fresh);
}

/* —— 统计卡 · 稿 .stat-row b19/900 span10/600 —— */
.m-stats view text:first-child,
.m-stats view text:last-child {
  font-size: 17rpx;
  font-weight: 600;
}
.m-stats view text:nth-child(2) {
  margin: 10rpx 0 7rpx;
  font-size: 33rpx;
  font-weight: 900;
}

/* —— 行动卡 · 稿 .tic 34px radius12 —— */
.m-action-card {
  min-height: 0;
}
.m-action-card > text:first-child {
  width: 59rpx;
  height: 59rpx;
  border-radius: 21rpx;
  background: var(--bao-mobile-gradient-brand);
  box-shadow: inset 0 3rpx 0 rgba(255, 255, 255, 0.28);
  font-size: 24rpx;
  font-weight: 900;
}
.m-action-card > view text:first-child {
  font-size: 22rpx;
  font-weight: 800;
}
.m-action-card > view text:last-child {
  margin-top: 5rpx;
  font-size: 18rpx;
}
.m-action-card > text:last-child {
  font-size: 26rpx;
}

/* —— H5 底部五栏 · 稿 .tabbar 66px + 激活顶部鲜绿指示条 —— */
/* #ifdef H5 */
.uni-tabbar-bottom .uni-tabbar {
  height: 66px;
  padding: 6px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  background: rgba(255, 255, 255, 0.88) !important;
  backdrop-filter: blur(14px);
  box-shadow: none;
}
.uni-tabbar-bottom .uni-tabbar__bd {
  position: relative;
  height: 50px !important;
  border-radius: 14px;
}
.uni-tabbar-bottom .uni-tabbar__icon,
.uni-tabbar-bottom .uni-tabbar__icon img {
  width: 21px !important;
  height: 21px !important;
}
.uni-tabbar-bottom .uni-tabbar__label {
  margin-top: 3px !important;
  font-size: 10px !important;
  font-weight: 600;
}
.uni-tabbar-bottom
  .uni-tabbar__item:has(.uni-tabbar__label[style*='rgb(0, 107, 54)'])
  .uni-tabbar__bd {
  background: transparent;
}
.uni-tabbar-bottom
  .uni-tabbar__item:has(.uni-tabbar__label[style*='rgb(0, 107, 54)'])
  .uni-tabbar__bd::before {
  position: absolute;
  top: -7px;
  left: 50%;
  width: 18px;
  height: 3px;
  border-radius: 2px;
  background: var(--bao-mobile-gradient-fresh);
  content: '';
  transform: translateX(-50%);
}
.uni-tabbar-bottom
  .uni-tabbar__label[style*='rgb(0, 107, 54)'] {
  font-weight: 800 !important;
}
/* #endif */

/* —— 任务大厅 · 稿 taskrow：图标瓦 + 标题描述 + 幽灵胶囊 —— */
.dir-row .navigator-wrap {
  display: flex;
  gap: 21rpx;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.dir-row .navigator-wrap > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.dir-row .navigator-wrap > view > text:first-child {
  overflow: hidden;
  font-size: 22rpx;
  font-weight: 800;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dir-row .navigator-wrap > view > text:last-child {
  margin-top: 5rpx;
  overflow: hidden;
  color: var(--bao-mobile-ink-500);
  font-size: 18rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dir-tic {
  display: grid;
  width: 59rpx;
  height: 59rpx;
  place-items: center;
  flex: none;
  border-radius: 21rpx;
  background: var(--bao-mobile-jade-50);
  box-shadow: inset 0 0 0 1rpx rgba(22, 19, 15, 0.05);
  font-size: 26rpx;
}
.dir-go {
  padding: 10rpx 19rpx;
  flex: none;
  border: 1rpx solid rgba(0, 145, 70, 0.16);
  border-radius: 999rpx;
  color: var(--bao-mobile-jade-700);
  background: rgba(0, 145, 70, 0.09);
  font-size: 19rpx;
  font-weight: 900;
  letter-spacing: 0.03em;
}
.dir-go.solid {
  border-color: transparent;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 9rpx 21rpx -9rpx rgba(0, 107, 54, 0.55);
}

/* ============================================================
   V6.7 概念稿完全一致层
   与 bao-redesign V2 精修稿同一套语言：
   问候大字 / 快捷意图 chip / 小满头像气泡 / 纸飞机发送钮 /
   宫格工具瓷贴 / 头像身份卡 / 安全提示条。
   ============================================================ */
page,
uni-app {
  --bao-mobile-gradient-deep: linear-gradient(135deg, #0e3a26, #07231a);
}

/* —— 问候 · 稿 .greet 25px/900 lh1.3 —— */
.m-greet {
  padding: 8rpx 4rpx 2rpx;
  font-size: 44rpx;
  font-weight: 900;
  letter-spacing: 0.015em;
  line-height: 1.3;
}
.m-greet > text {
  display: block;
}
.m-greet .greet-hl {
  color: var(--bao-mobile-jade-600);
}

/* —— 快捷意图 · 稿 .chip pad8/14 12px/700 + .hot 渐变 —— */
.m-chips {
  display: flex;
  margin-top: 24rpx;
  flex-wrap: wrap;
  gap: 14rpx;
}
.m-chip {
  padding: 14rpx 24rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 999rpx;
  color: var(--bao-mobile-ink-900);
  background: var(--bao-mobile-paper);
  box-shadow: 0 2rpx 4rpx rgba(22, 19, 15, 0.04);
  font-size: 21rpx;
  font-weight: 700;
}
.m-chip.hot {
  border-color: transparent;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 10rpx 24rpx -10rpx rgba(0, 107, 54, 0.5);
}

/* —— 小满消息 · 稿 .msg：头像 32px 圆角 12 + 气泡 4/18/18/18 —— */
.m-agent {
  display: flex;
  padding: 0;
  align-items: flex-start;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  gap: 17rpx;
}
.m-agent > .m-avatar {
  display: grid;
  width: 56rpx;
  height: 56rpx;
  place-items: center;
  flex: none;
  border-radius: 21rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: inset 0 3rpx 0 rgba(255, 255, 255, 0.28);
  font-size: 20rpx;
  font-weight: 900;
}
.m-thread {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.m-who {
  margin-bottom: 9rpx;
  color: var(--bao-mobile-ink-400);
  font-size: 18rpx;
  font-weight: 700;
}
.m-bubble {
  padding: 19rpx 24rpx;
  border: 1rpx solid rgba(22, 19, 15, 0.04);
  border-radius: 7rpx 31rpx 31rpx 31rpx;
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.m-bubble .agent-title {
  display: block;
  margin: 0 0 7rpx;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.65;
}
.m-bubble > text {
  display: block;
  color: var(--bao-mobile-ink-600);
  font-size: 22rpx;
  line-height: 1.65;
}
.m-thread .m-result {
  margin-top: 14rpx;
}
.m-thread .agent-action {
  margin-top: 14rpx;
}

/* —— 输入条 · 稿 .composer：占位 + 36px 纸飞机圆钮 —— */
.m-composer > text.m-ph {
  display: block;
  width: auto;
  height: auto;
  flex: 1;
  border-radius: 0;
  color: var(--bao-mobile-ink-400);
  background: none;
  box-shadow: none;
  font-size: 22rpx;
}
.m-composer > text.m-ph::before,
.m-composer > text.m-ph::after {
  display: none;
  content: none;
}
.m-composer > text.m-send {
  position: relative;
  display: grid;
  width: 63rpx;
  height: 63rpx;
  place-items: center;
  flex: none;
  border-radius: 50%;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 7rpx 17rpx -3rpx rgba(0, 107, 54, 0.45),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.3);
  font-size: 0;
}
.m-composer > text.m-send::before {
  width: 28rpx;
  height: 28rpx;
  margin: 0 0 0 -2rpx;
  border: 0;
  border-radius: 0;
  background: var(--bao-mobile-paper);
  content: '';
  transform: none;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 2 11 13'/%3E%3Cpath d='M22 2 15 22l-4-9-9-4z'/%3E%3C/svg%3E")
    center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 2 11 13'/%3E%3Cpath d='M22 2 15 22l-4-9-9-4z'/%3E%3C/svg%3E")
    center / contain no-repeat;
}
.m-composer > text.m-send::after {
  display: none;
  content: none;
}

/* —— 宫格工具 · 稿 .grid8：46px 瓷贴 + 11px 标签 —— */
.g8-grid {
  display: grid;
  padding: 26rpx 31rpx 31rpx;
  grid-template-columns: repeat(4, 1fr);
  gap: 28rpx 14rpx;
}
.g8-item {
  display: flex;
  align-items: center;
  flex-direction: column;
  color: var(--bao-mobile-ink-600);
  font-size: 19rpx;
  font-weight: 700;
  gap: 12rpx;
}
.g8-tile {
  display: grid;
  width: 80rpx;
  height: 80rpx;
  place-items: center;
  border-radius: 28rpx;
  box-shadow: inset 0 0 0 1rpx rgba(22, 19, 15, 0.05);
  font-size: 33rpx;
}
.g8-tile.t-green {
  background: rgba(0, 145, 70, 0.1);
}
.g8-tile.t-fresh {
  background: rgba(110, 199, 38, 0.14);
}
.g8-tile.t-red {
  background: rgba(213, 52, 44, 0.09);
}
.g8-tile.t-amber {
  background: rgba(185, 90, 23, 0.1);
}
.g8-tile.t-ink {
  background: rgba(22, 19, 15, 0.05);
}

/* —— 身份卡 · 稿 .avatar-x 52px 圆角 17 品牌渐变 —— */
.m-profile {
  display: flex;
  padding: 28rpx 31rpx;
  align-items: center;
  border: 1rpx solid rgba(22, 19, 15, 0.04);
  border-radius: 35rpx;
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
  gap: 24rpx;
}
.avatar-x {
  display: grid;
  width: 91rpx;
  height: 91rpx;
  place-items: center;
  flex: none;
  border-radius: 30rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: 0 14rpx 31rpx -14rpx rgba(0, 107, 54, 0.55),
    inset 0 3rpx 0 rgba(255, 255, 255, 0.28);
  font-size: 37rpx;
  font-weight: 900;
}
.m-profile-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.m-profile-main text:first-child {
  overflow: hidden;
  font-size: 28rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-profile-main text:last-child {
  margin-top: 7rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 20rpx;
}
</style>
