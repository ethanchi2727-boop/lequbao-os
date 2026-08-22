const { commerceApi } = require('../../lib/api.js');

Page({
  data: { state: '加载中', orders: [] },
  onShow() {
    this.loadOrders();
  },
  async loadOrders() {
    this.setData({ state: '加载中', orders: [] });
    try {
      const orders = await commerceApi.listLifeOrders({ limit: 10 });
      this.setData({ orders, state: orders.length ? '默认' : '空数据' });
    } catch {
      this.setData({ state: '可恢复失败', orders: [] });
    }
  },
  openOrder(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=%2Flife%2Fpage-238&orderId=${encodeURIComponent(event.currentTarget.dataset.orderId)}`,
    });
  },
});
