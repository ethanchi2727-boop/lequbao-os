<script>
export default { onLaunch() {} };
</script>

<style>
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
  --bao-mobile-line: rgba(17, 27, 25, 0.1);
  --bao-mobile-line-strong: rgba(17, 27, 25, 0.18);
  --bao-mobile-shadow-card: 0 12rpx 34rpx rgba(17, 27, 25, 0.06);
  --bao-mobile-shadow-float: 0 20rpx 48rpx rgba(17, 27, 25, 0.1);
  --bao-mobile-radius-xl: 40rpx;
  --bao-mobile-radius-card: 30rpx;
  --bao-mobile-radius-control: 22rpx;
  --bao-mobile-radius-small: 18rpx;
  --bao-mobile-gradient-brand: linear-gradient(
    135deg,
    var(--bao-mobile-jade-400),
    var(--bao-mobile-cyan-500)
  );
  --bao-mobile-gradient-dark: linear-gradient(
    145deg,
    var(--bao-mobile-ink-950),
    var(--bao-mobile-ink-700)
  );
  --bao-mobile-gradient-ai: linear-gradient(
    135deg,
    var(--bao-mobile-ai-700),
    var(--bao-mobile-ai-600)
  );
  background: var(--bao-mobile-ink-50);
  color: var(--bao-mobile-ink-900);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
button::after {
  border: 0;
}
.panel {
  margin-top: 18rpx;
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
  min-height: 84rpx;
  padding: 0 22rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.panel-head text:first-child {
  font-size: 25rpx;
  font-weight: 900;
}
.panel-head text:last-child {
  color: var(--bao-mobile-jade-700);
  font-size: 18rpx;
}
.empty-state {
  padding: 58rpx 22rpx;
  color: var(--bao-mobile-ink-500);
  text-align: center;
  font-size: 21rpx;
  line-height: 1.6;
}
.m-primary {
  width: 100%;
  height: 78rpx;
  margin-top: 22rpx;
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  box-shadow: var(--bao-mobile-shadow-card);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 78rpx;
}
.m-context {
  position: relative;
  min-height: 102rpx;
  padding: 20rpx;
  border-radius: 26rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
}
.m-context text {
  display: block;
}
.m-context text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 17rpx;
}
.m-context text:nth-child(2) {
  margin-top: 8rpx;
  font-size: 23rpx;
  font-weight: 800;
}
.m-context text:last-child {
  position: absolute;
  top: 34rpx;
  right: 22rpx;
  color: var(--bao-mobile-jade-300);
  font-size: 24rpx;
  font-weight: 900;
}
.m-user {
  width: 76%;
  margin: 32rpx 0 30rpx auto;
  padding: 22rpx;
  border-radius: 30rpx 30rpx 8rpx 30rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-ink-900);
  font-size: 21rpx;
  line-height: 1.7;
}
.m-agent {
  padding: 22rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 32rpx;
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-card);
}
.m-agent-head {
  display: flex;
  gap: 12rpx;
  align-items: center;
}
.m-agent-head > text:first-child {
  display: grid;
  width: 54rpx;
  height: 54rpx;
  place-items: center;
  border-radius: var(--bao-mobile-radius-small);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-ai);
  font-size: 19rpx;
  font-weight: 900;
}
.m-agent-head > text:nth-child(2) {
  font-size: 22rpx;
  font-weight: 800;
}
.m-agent-head > text:last-child {
  margin-left: auto;
  color: var(--bao-mobile-ink-400);
  font-size: 17rpx;
}
.m-agent .agent-title {
  display: block;
  margin: 18rpx 0 8rpx;
  font-size: 25rpx;
  font-weight: 900;
}
.m-agent > text {
  display: block;
  color: var(--bao-mobile-ink-500);
  font-size: 19rpx;
  line-height: 1.65;
}
.m-result {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
  margin-top: 18rpx;
}
.m-result view {
  display: flex;
  padding: 16rpx;
  border-radius: var(--bao-mobile-radius-small);
  flex-direction: column;
  background: var(--bao-mobile-ink-50);
}
.m-result view text:first-child {
  color: var(--bao-mobile-ink-500);
  font-size: 17rpx;
}
.m-result view text:last-child {
  margin-top: 6rpx;
  font-size: 27rpx;
  font-weight: 900;
}
.m-agent .agent-action {
  width: 100%;
  height: 62rpx;
  margin-top: 18rpx;
  border-radius: var(--bao-mobile-radius-small);
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 19rpx;
  font-weight: 800;
  line-height: 62rpx;
}
.m-composer {
  display: flex;
  gap: 10rpx;
  align-items: center;
  min-height: 98rpx;
  margin-top: 20rpx;
  padding: 0 14rpx;
  border: 1rpx solid var(--bao-mobile-line-strong);
  border-radius: 28rpx;
  background: var(--bao-mobile-paper);
  box-shadow: var(--bao-mobile-shadow-float);
}
.m-composer text:first-child {
  display: grid;
  width: 58rpx;
  height: 58rpx;
  place-items: center;
  color: var(--bao-mobile-ink-600);
  font-size: 28rpx;
}
.m-composer text:nth-child(2) {
  flex: 1;
  color: var(--bao-mobile-ink-400);
  font-size: 18rpx;
}
.m-composer text:last-child {
  display: grid;
  width: 60rpx;
  height: 60rpx;
  place-items: center;
  border-radius: var(--bao-mobile-radius-small);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  font-size: 25rpx;
  font-weight: 900;
}
.m-section {
  display: flex;
  align-items: center;
  min-height: 78rpx;
  padding: 16rpx 4rpx 8rpx;
}
.m-section text:first-child {
  flex: 1;
  font-size: 24rpx;
  font-weight: 900;
}
.m-section text:last-child {
  color: var(--bao-mobile-ink-400);
  font-size: 17rpx;
}
.task-list {
  padding: 4rpx 20rpx;
}
.task-row {
  display: flex;
  align-items: center;
  min-height: 116rpx;
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
  font-size: 21rpx;
  font-weight: 800;
}
.task-row > view text:last-child {
  margin-top: 7rpx;
  overflow: hidden;
  color: var(--bao-mobile-ink-500);
  font-size: 17rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-chip {
  margin-left: 14rpx;
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 16rpx;
  font-weight: 800;
}
.status-chip.warning {
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
.row-action {
  min-width: 106rpx;
  height: 54rpx;
  margin-left: 14rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-brand);
  font-size: 18rpx;
  font-weight: 800;
  line-height: 54rpx;
}
.row-action.secondary {
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
}
.row-action[disabled] {
  opacity: 0.55;
}
.form-stack {
  display: flex;
  gap: 18rpx;
  padding: 22rpx;
  flex-direction: column;
  color: var(--bao-mobile-ink-500);
  font-size: 19rpx;
  line-height: 1.55;
}
.form-input {
  height: 76rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--bao-mobile-line-strong);
  border-radius: var(--bao-mobile-radius-small);
  color: var(--bao-mobile-ink-900);
  background: var(--bao-mobile-paper);
  font-size: 20rpx;
}
.session-note {
  display: block;
  padding: 14rpx 22rpx 22rpx;
  color: var(--bao-mobile-ink-500);
  text-align: center;
  font-size: 18rpx;
}
.guardrail {
  display: flex;
  gap: 8rpx;
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: var(--bao-mobile-radius-control);
  flex-direction: column;
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
.guardrail text:first-child {
  font-size: 17rpx;
  font-weight: 900;
}
.guardrail text:last-child {
  color: var(--bao-mobile-ink-700);
  font-size: 19rpx;
  line-height: 1.55;
}
.m-progress-hero {
  display: flex;
  align-items: center;
  min-height: 248rpx;
  padding: 30rpx;
  border-radius: 36rpx;
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
}
.m-progress-hero > view:first-child {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.m-progress-hero > view:first-child text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 17rpx;
}
.m-progress-hero > view:first-child text:nth-child(2) {
  margin: 16rpx 0;
  font-size: 50rpx;
  font-weight: 900;
}
.m-progress-hero > view:first-child text:last-child {
  color: var(--bao-mobile-ink-400);
  font-size: 17rpx;
}
.progress-ring {
  display: grid;
  width: 150rpx;
  height: 150rpx;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(
    var(--bao-mobile-jade-400) var(--progress),
    rgba(255, 255, 255, 0.14) 0
  );
}
.progress-ring text {
  display: grid;
  width: 120rpx;
  height: 120rpx;
  place-items: center;
  border-radius: 50%;
  background: var(--bao-mobile-ink-900);
  font-size: 25rpx;
  font-weight: 900;
}
.m-notice {
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: 24rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 18rpx;
  line-height: 1.55;
}
.m-timeline {
  padding: 6rpx 20rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: var(--bao-mobile-radius-card);
  background: var(--bao-mobile-paper);
}
.timeline-step {
  display: flex;
  gap: 18rpx;
  align-items: center;
  min-height: 122rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.timeline-step:last-child {
  border-bottom: 0;
}
.timeline-step > text:first-child {
  display: grid;
  width: 58rpx;
  height: 58rpx;
  place-items: center;
  border: 1rpx solid var(--bao-mobile-ink-200);
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-ink-500);
  background: var(--bao-mobile-paper);
  font-size: 18rpx;
  font-weight: 900;
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
}
.timeline-step > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.timeline-step > view text:first-child {
  font-size: 21rpx;
  font-weight: 800;
}
.timeline-step > view text:last-child {
  margin-top: 6rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 17rpx;
}
.timeline-step > text:last-child {
  color: var(--bao-mobile-jade-600);
  font-size: 16rpx;
}
.income-hero {
  position: relative;
  min-height: 380rpx;
  padding: 32rpx;
  overflow: hidden;
  border-radius: var(--bao-mobile-radius-xl);
  color: var(--bao-mobile-paper);
  background: var(--bao-mobile-gradient-dark);
}
.income-hero > text {
  display: block;
}
.income-hero > text:first-child {
  color: var(--bao-mobile-jade-300);
  font-size: 18rpx;
}
.income-hero > text:nth-child(2) {
  margin-top: 18rpx;
  font-size: 52rpx;
  font-weight: 900;
}
.income-meta {
  display: flex;
  gap: 24rpx;
  margin-top: 10rpx;
  color: var(--bao-mobile-jade-200);
  font-size: 17rpx;
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
  right: 24rpx;
  bottom: 26rpx;
  left: 24rpx;
  display: flex;
  gap: 10rpx;
  align-items: flex-end;
  height: 126rpx;
}
.income-bars text {
  flex: 1;
  border-radius: 999rpx 999rpx 0 0;
  background: var(--bao-mobile-jade-400);
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
.m-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
  margin-top: 18rpx;
}
.m-stats view {
  display: flex;
  min-height: 150rpx;
  padding: 20rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 28rpx;
  flex-direction: column;
  background: var(--bao-mobile-paper);
}
.m-stats view text:first-child,
.m-stats view text:last-child {
  color: var(--bao-mobile-ink-500);
  font-size: 17rpx;
}
.m-stats view text:nth-child(2) {
  margin: 10rpx 0 6rpx;
  font-size: 34rpx;
  font-weight: 900;
}
.m-action-card {
  display: flex;
  gap: 16rpx;
  align-items: center;
  min-height: 138rpx;
  margin-bottom: 16rpx;
  padding: 20rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 28rpx;
  background: var(--bao-mobile-paper);
}
.m-action-card > text:first-child {
  display: grid;
  width: 68rpx;
  height: 68rpx;
  place-items: center;
  border-radius: var(--bao-mobile-radius-control);
  color: var(--bao-mobile-ai-700);
  background: var(--bao-mobile-ai-100);
  font-size: 20rpx;
  font-weight: 900;
}
.m-action-card > text:first-child.warning {
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
.m-action-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.m-action-card > view text:first-child {
  font-size: 21rpx;
  font-weight: 800;
}
.m-action-card > view text:last-child {
  margin-top: 7rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 17rpx;
}
.m-action-card > text:last-child {
  color: var(--bao-mobile-ink-400);
}
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

/* #ifdef H5 */
.uni-tabbar-bottom .uni-tabbar {
  height: 62px;
  padding: 3px 5px 2px;
  box-sizing: border-box;
  background: var(--bao-mobile-paper) !important;
}
.uni-tabbar-bottom .uni-tabbar__bd {
  height: 57px !important;
  border-radius: 12px;
}
.uni-tabbar-bottom .uni-tabbar__icon,
.uni-tabbar-bottom .uni-tabbar__icon img {
  width: 22px !important;
  height: 22px !important;
}
.uni-tabbar-bottom .uni-tabbar__label {
  margin-top: 2px !important;
  line-height: 1 !important;
}
.uni-tabbar-bottom
  .uni-tabbar__item:has(.uni-tabbar__label[style*='rgb(11, 149, 105)'])
  .uni-tabbar__bd {
  background: var(--bao-mobile-jade-50);
}
/* #endif */
</style>
