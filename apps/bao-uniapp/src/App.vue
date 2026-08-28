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
   乐趣宝移动端 V6.3 设计系统 · 玉石新生
   在 V6.2 玉石绿品牌基调上整体重设计：
   更轻的画布、更柔的卡片、更有层次的 Hero、
   更精致的按钮与图标，手机阅读优先。
   ============================================================ */
page,
uni-app {
  --bao-mobile-ink-950: #0b1312;
  --bao-mobile-ink-900: #111b19;
  --bao-mobile-ink-700: #33423e;
  --bao-mobile-ink-600: #53645f;
  --bao-mobile-ink-500: #74847f;
  --bao-mobile-ink-400: #9ba8a4;
  --bao-mobile-ink-300: #b9c3c0;
  --bao-mobile-ink-200: #d8dfdc;
  --bao-mobile-ink-100: #eef2f0;
  --bao-mobile-ink-50: #f7f9f8;
  --bao-mobile-paper: #ffffff;
  --bao-mobile-jade-700: #086448;
  --bao-mobile-jade-600: #087d59;
  --bao-mobile-jade-500: #0b9569;
  --bao-mobile-jade-400: #25ae82;
  --bao-mobile-jade-300: #74d0af;
  --bao-mobile-jade-200: #b9e8d7;
  --bao-mobile-jade-100: #e4f6ef;
  --bao-mobile-jade-50: #f1fbf7;
  --bao-mobile-cyan-500: #25a7b8;
  --bao-mobile-ai-700: #4b3cc4;
  --bao-mobile-ai-600: #6657e8;
  --bao-mobile-ai-100: #ece9ff;
  --bao-mobile-warning-700: #a94e1d;
  --bao-mobile-warning-100: #fff0e1;
  --bao-mobile-danger-500: #df5a58;
  --bao-mobile-line: rgba(17, 27, 25, 0.08);
  --bao-mobile-line-strong: rgba(17, 27, 25, 0.16);
  --bao-mobile-shadow-card: 0 2rpx 6rpx rgba(17, 27, 25, 0.03),
    0 16rpx 40rpx rgba(17, 27, 25, 0.06);
  --bao-mobile-shadow-float: 0 4rpx 12rpx rgba(17, 27, 25, 0.05),
    0 24rpx 56rpx rgba(17, 27, 25, 0.12);
  --bao-mobile-jade-glow: 0 12rpx 30rpx rgba(8, 100, 72, 0.34);
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
    #0e382c 58%,
    #0b4a36
  );
  --bao-mobile-gradient-dark: linear-gradient(
    160deg,
    var(--bao-mobile-ink-950),
    #0e382c
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
  box-shadow: 0 8rpx 22rpx rgba(11, 149, 105, 0.2);
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
  box-shadow: 0 6rpx 16rpx rgba(102, 87, 232, 0.32);
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
    rgba(37, 174, 130, 0.35),
    rgba(37, 174, 130, 0)
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
  box-shadow: 0 6rpx 16rpx rgba(102, 87, 232, 0.32);
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
    rgba(37, 174, 130, 0.3),
    rgba(37, 174, 130, 0)
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
  box-shadow: 0 6rpx 16rpx rgba(102, 87, 232, 0.28);
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
    box-shadow: 0 0 0 0 rgba(37, 174, 130, 0.35);
  }
  70% {
    box-shadow: 0 0 0 12rpx rgba(37, 174, 130, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(37, 174, 130, 0);
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
</style>
