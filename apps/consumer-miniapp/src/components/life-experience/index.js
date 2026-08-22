const { commerceApi } = require('../../lib/api.js');

const categories = [
  '新鲜果蔬',
  '肉禽蛋水产',
  '米面粮油',
  '乳品烘焙',
  '酒水饮料',
  '休闲零食',
  '快手好菜',
  '影视休闲',
  '酒店住宿',
  '纸品清洁',
  '洗车养护',
  '健康养护',
  '亲子教育',
  '鲜花礼品',
  '生活缴费',
  '会员好券',
].map((title, index) => ({ title, index }));

const content = {
  生活: {
    eyebrow: '今日生活直供',
    title: '把新鲜和附近，装进生活篮子',
    subtitle: '当日达 · 来源可查 · 售后有入口',
    route: '/life/page-198',
  },
  商城: {
    eyebrow: '家庭常备',
    title: '每一件都讲清规格与到手价',
    subtitle: '配送方式和优惠在下单前说明',
    route: '/life/page-207',
  },
  生活圈: {
    eyebrow: '附近好生活',
    title: '吃喝玩乐，先看距离和使用规则',
    subtitle: '真实门店 · 到店核销 · 过期规则透明',
    route: '/life/page-216',
  },
  购物车: {
    eyebrow: '分组结算',
    title: '分组结算',
    subtitle: '优惠、运费、奖励、实付逐项算清',
    route: '/life/page-224',
  },
  我的: {
    eyebrow: '生活账户',
    title: '生活账户',
    subtitle: '订单、售后、会员权益、地址和设置',
    route: '/life/page-235',
  },
};

function presentProduct(product) {
  return {
    id: product.id,
    title: product.title,
    detail: product.variants?.map((variant) => variant.title).join(' · ') || '暂无可用规格',
    price: (product.salePriceCents / 100).toFixed(2),
    tag: product.productType === 'GROUP_BUY' ? '到店团购' : '真实在售',
  };
}

Component({
  properties: { section: { type: String, value: '生活' } },
  data: {
    state: '加载中',
    categories,
    content: content.生活,
    products: [],
    groupBuy: null,
  },
  lifetimes: {
    attached() {
      this.loadLiveContent();
    },
  },
  observers: {
    section(value) {
      this.setData({ content: content[value] || content.生活 });
      if (this.data.state !== '加载中') this.loadLiveContent();
    },
  },
  methods: {
    async loadLiveContent() {
      this.setData({ state: '加载中', products: [], groupBuy: null });
      try {
        const section = this.properties.section;
        if (!['生活', '商城', '生活圈'].includes(section)) {
          this.setData({ state: '停用', products: [], groupBuy: null });
          return;
        }
        const productType =
          section === '生活' ? 'DIGITAL_SUPPLY' : section === '商城' ? 'PHYSICAL' : 'GROUP_BUY';
        const results = await commerceApi.listProducts({ productType, limit: 20 });
        const groupBuy = section === '生活圈' && results[0] ? presentProduct(results[0]) : null;
        const presented = section === '生活圈' ? [] : results.map(presentProduct);
        this.setData({
          products: presented,
          groupBuy,
          state: presented.length || groupBuy ? '默认' : '空数据',
        });
      } catch {
        this.setData({ state: '可恢复失败', products: [], groupBuy: null });
      }
    },
    openRoute(event) {
      const route = event.currentTarget.dataset.route || this.data.content.route;
      const productId = event.currentTarget.dataset.productId;
      wx.navigateTo({
        url: `/pages/route/index?route=${encodeURIComponent(route)}${productId ? `&productId=${encodeURIComponent(productId)}` : ''}`,
      });
    },
    chooseCategory(event) {
      this.openRoute({
        currentTarget: {
          dataset: { route: `/life/page-201?category=${event.currentTarget.dataset.index}` },
        },
      });
    },
    retry() {
      this.loadLiveContent();
    },
    askAssistant() {
      wx.navigateTo({ url: '/pages/route/index?route=%2Flife%2Fpage-258' });
    },
  },
});
