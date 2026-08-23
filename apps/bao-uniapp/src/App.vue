<script>
export default { onLaunch() {} };
</script>
<style>
page {
  background: #f7f8fc;
  color: #202233;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
button::after {
  border: 0;
}
.panel {
  margin-top: 22rpx;
  padding: 28rpx;
  border: 1rpx solid #e8e9f1;
  border-radius: 26rpx;
  background: #fff;
  box-shadow: 0 12rpx 34rpx rgba(36, 32, 70, 0.07);
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
  color: #5b50ed;
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
  background: #f7f6ff;
}
.metric text:first-child {
  color: #737789;
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
  background: #f7f8fc;
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
  color: #737789;
  font-size: 21rpx;
}
.status {
  margin-left: 18rpx;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  color: #5145cd;
  background: #ebe9ff;
  font-size: 20rpx;
  font-weight: 800;
}
.status.warning {
  color: #a64b26;
  background: #fff0e8;
}
</style>
