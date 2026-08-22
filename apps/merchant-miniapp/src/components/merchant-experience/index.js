const { merchantApi } = require('../../lib/api.js');

const sections = {
  首页: {
    title: '本店',
    subtitle: '本店商品、团购与服务，一处看清',
    route: '/merchant/page-267',
  },
  商品: { title: '本店好物', subtitle: '规格、价格、配送和保障透明', route: '/merchant/page-273' },
  团购: {
    title: '到店团购',
    subtitle: '使用时间、预约与核销规则先说明',
    route: '/merchant/page-276',
  },
  订单: {
    title: '我的订单',
    subtitle: '支付、履约、核销与售后分开显示',
    route: '/merchant/page-288',
  },
  我的: { title: '会员与服务', subtitle: '券、售后、隐私和 AI 店员', route: '/merchant/page-302' },
};

function presentProduct(product) {
  return {
    id: product.id,
    title: product.title,
    detail: product.variants?.map((variant) => variant.title).join(' · ') || '暂无可用规格',
    price: (product.salePriceCents / 100).toFixed(2),
    tag: product.productType === 'GROUP_BUY' ? '到店团购' : '本店在售',
    route: product.productType === 'GROUP_BUY' ? '/merchant/page-277' : '/merchant/page-274',
  };
}

Component({
  properties: { section: { type: String, value: '首页' } },
  data: { state: '加载中', content: sections.首页, products: [] },
  lifetimes: {
    attached() {
      this.loadLiveContent();
    },
  },
  observers: {
    section(value) {
      this.setData({ content: sections[value] || sections.首页 });
      if (this.data.state !== '加载中') this.loadLiveContent();
    },
  },
  methods: {
    async loadLiveContent() {
      this.setData({ state: '加载中', products: [] });
      try {
        const section = this.properties.section;
        if (!['首页', '商品', '团购'].includes(section)) {
          this.setData({ state: '停用', products: [] });
          return;
        }
        const productType =
          section === '团购' ? 'GROUP_BUY' : section === '商品' ? 'PHYSICAL' : undefined;
        const [storefront, products] = await Promise.all([
          merchantApi.getStorefront(),
          merchantApi.listProducts({ productType, limit: 20 }),
        ]);
        this.setData({
          content: { ...(sections[section] || sections.首页), title: storefront.name },
          products: products.map(presentProduct),
          state: products.length ? '默认' : '空数据',
        });
      } catch {
        this.setData({ state: '可恢复失败', products: [] });
      }
    },
    open(event) {
      const route = event.currentTarget.dataset.route || this.data.content.route;
      const productId = event.currentTarget.dataset.productId;
      wx.navigateTo({
        url: `/pages/route/index?route=${encodeURIComponent(route)}${productId ? `&productId=${encodeURIComponent(productId)}` : ''}`,
      });
    },
    askAi() {
      wx.navigateTo({ url: '/pages/route/index?route=%2Fmerchant%2Fpage-298' });
    },
    retry() {
      this.loadLiveContent();
    },
  },
});
