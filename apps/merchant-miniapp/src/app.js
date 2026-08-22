App({
  globalData: { apiBaseUrl: '', consumerToken: '', lifeToken: '' },
  onLaunch() {
    this.globalData.apiBaseUrl = wx.getStorageSync('apiBaseUrl') || '';
    this.globalData.consumerToken = wx.getStorageSync('consumerToken') || '';
    this.globalData.lifeToken = wx.getStorageSync('lifeToken') || '';
  },
});
