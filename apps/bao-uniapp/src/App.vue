<script>
export default { onLaunch() {} };
</script>
<style>
page {
  --bao-mobile-ink-950: #0b1312;
  --bao-mobile-ink-900: #111b19;
  --bao-mobile-ink-700: #33423e;
  --bao-mobile-ink-600: #53645f;
  --bao-mobile-ink-500: #74847f;
  --bao-mobile-ink-400: #9ba8a4;
  --bao-mobile-ink-200: #d8dfdc;
  --bao-mobile-ink-100: #eef2f0;
  --bao-mobile-ink-50: #f7f9f8;
  --bao-mobile-paper: #ffffff;
  --bao-mobile-jade-700: #086448;
  --bao-mobile-jade-600: #087d59;
  --bao-mobile-jade-500: #0b9569;
  --bao-mobile-jade-400: #25ae82;
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
  padding: 24rpx;
  border: 1rpx solid var(--bao-mobile-line);
  border-radius: 24rpx;
  background: var(--bao-mobile-paper);
  box-shadow: 0 12rpx 34rpx rgba(17, 27, 25, 0.06);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22rpx;
}
.panel-head text:first-child {
  font-size: 30rpx;
  font-weight: 900;
}
.panel-head text:last-child {
  color: var(--bao-mobile-jade-700);
  font-size: 22rpx;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}
.metric {
  display: flex;
  padding: 24rpx;
  border-radius: 22rpx;
  flex-direction: column;
  background: var(--bao-mobile-ink-50);
}
.metric text:first-child {
  color: var(--bao-mobile-ink-500);
  font-size: 21rpx;
}
.metric text:last-child {
  margin-top: 10rpx;
  font-size: 36rpx;
  font-weight: 900;
}
.task-list {
  display: grid;
  gap: 14rpx;
}
.task {
  display: flex;
  padding: 22rpx;
  border-radius: 20rpx;
  align-items: center;
  justify-content: space-between;
  border: 1rpx solid var(--bao-mobile-line);
  background: var(--bao-mobile-paper);
}
.task view {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.task view text:first-child {
  font-weight: 800;
}
.task view text:last-child {
  margin-top: 6rpx;
  color: var(--bao-mobile-ink-500);
  font-size: 21rpx;
}
.status {
  margin-left: 18rpx;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  color: var(--bao-mobile-jade-700);
  background: var(--bao-mobile-jade-100);
  font-size: 20rpx;
  font-weight: 800;
}
.status.warning {
  color: var(--bao-mobile-warning-700);
  background: var(--bao-mobile-warning-100);
}
</style>
