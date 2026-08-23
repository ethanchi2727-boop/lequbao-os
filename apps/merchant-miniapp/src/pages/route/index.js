const contracts = require('../../generated/page-contracts.js');
const commerceExperiences = require('../../generated/merchant-experiences-commerce.json');
const transactionExperiences = require('../../generated/merchant-experiences-transactions.json');
const serviceExperiences = require('../../generated/merchant-experiences-service.json');
const { merchantApi } = require('../../lib/api.js');

const merchantExperiences = new Map(
  [...commerceExperiences, ...transactionExperiences, ...serviceExperiences].map((item) => [
    item.id,
    item,
  ]),
);

const liveProductRoutes = new Set(['/merchant/page-274', '/merchant/page-277']);

function fulfillmentChoices(cart) {
  const productTypes = new Set(
    (cart.groups || []).flatMap((group) => group.items || []).map((item) => item.productType),
  );
  return [...productTypes].filter(Boolean).map((productType) => ({
    productType,
    orderType:
      productType === 'GROUP_BUY'
        ? 'GROUP_BUY'
        : productType === 'SERVICE'
          ? 'SERVICE_APPOINTMENT'
          : 'STORE_PICKUP',
  }));
}

Page({
  data: {
    contract: null,
    state: '加载中',
    stateIndex: 0,
    demoMode: false,
    liveData: null,
    liveKind: null,
    query: {},
    inputText: '',
    experience: null,
  },
  onLoad(query) {
    const route = decodeURIComponent(query.route || '/merchant/page-267').split('?')[0];
    const contract = contracts.find((item) => item.route === route) || contracts[0];
    const demoMode = query.demo === '1';
    this.setData({
      contract: { ...contract, domainsText: contract.domains.join(' · ') },
      demoMode,
      query,
      experience: merchantExperiences.get(contract.id) || null,
      state: demoMode ? '默认' : '加载中',
    });
    wx.setNavigationBarTitle({ title: contract.title });
    if (!demoMode) this.loadAuthoritative(route, query);
  },
  async loadAuthoritative(route, query) {
    if (route === '/merchant/page-269') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'storefront' });
      try {
        const storefront = await merchantApi.getStorefront();
        this.setData({
          state: '默认',
          liveData: {
            ...storefront,
            openingHoursText: storefront.openingHours
              ? JSON.stringify(storefront.openingHours)
              : '未设置',
          },
        });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-270') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'stores' });
      try {
        const stores = await merchantApi.listStores();
        this.setData({ state: stores.length ? '默认' : '空数据', liveData: stores });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-302') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'membership' });
      try {
        const membership = await merchantApi.getMembership();
        this.setData({ state: '默认', liveData: membership });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-280') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'cart' });
      try {
        const cart = await merchantApi.getCart();
        this.setData({ state: cart.itemCount ? '默认' : '空数据', liveData: cart });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-282') {
      if (!query.checkoutId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'checkout' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'checkout' });
      try {
        const checkout = await merchantApi.getCheckout(query.checkoutId);
        this.setData({ state: '默认', liveData: checkout });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/merchant/page-297', '/merchant/page-298', '/merchant/page-299'].includes(route)) {
      this.setData({ state: '加载中', liveData: null, liveKind: 'conversation' });
      if (!query.conversationId) {
        this.setData({ state: '默认', liveData: { conversation: null, messages: [] } });
        return;
      }
      try {
        const [conversation, messages] = await Promise.all([
          merchantApi.getConversation(query.conversationId),
          merchantApi.listConversationMessages(query.conversationId),
        ]);
        this.setData({ state: '默认', liveData: { conversation, messages } });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-307') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'profile' });
      try {
        const profile = await merchantApi.getCustomerProfile();
        this.setData({ state: '默认', liveData: profile });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-304') {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'refundApply' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'refundApply' });
      try {
        const order = await merchantApi.getOrder(query.orderId);
        this.setData({ state: '默认', liveData: order });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-305') {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'refunds' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'refunds' });
      try {
        const refunds = await merchantApi.listRefunds(query.orderId);
        this.setData({ state: refunds.length ? '默认' : '空数据', liveData: refunds });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-288') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'orders' });
      try {
        const orders = await merchantApi.listOrders({ limit: 50 });
        this.setData({ state: orders.length ? '默认' : '空数据', liveData: orders });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/merchant/page-289', '/merchant/page-284', '/merchant/page-285'].includes(route)) {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'order' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'order' });
      try {
        const order = await merchantApi.getOrder(query.orderId);
        this.setData({ state: '默认', liveData: order });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/merchant/page-290', '/merchant/page-291'].includes(route)) {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'refunds' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'refunds' });
      try {
        const refunds = await merchantApi.listRefunds(query.orderId);
        this.setData({ state: refunds.length ? '默认' : '空数据', liveData: refunds });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-293') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'verification' });
      try {
        const tokens = await merchantApi.listAvailableVerification();
        this.setData({ state: tokens.length ? '默认' : '空数据', liveData: tokens });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/merchant/page-294') {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'verification' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'verification' });
      try {
        const tokens = await merchantApi.listVerification(query.orderId);
        this.setData({ state: tokens.length ? '默认' : '空数据', liveData: tokens });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (!liveProductRoutes.has(route)) {
      this.setData({ state: '停用', liveData: null });
      return;
    }
    if (!query.productId) {
      this.setData({ state: '空数据', liveData: null });
      return;
    }
    this.setData({ state: '加载中', liveData: null, liveKind: 'product' });
    try {
      const product = await merchantApi.getProduct(query.productId);
      this.setData({ state: '默认', liveData: product });
    } catch {
      this.setData({ state: '可恢复失败', liveData: null });
    }
  },
  nextState() {
    if (!this.data.demoMode) return;
    const index = (this.data.stateIndex + 1) % this.data.contract.states.length;
    this.setData({ stateIndex: index, state: this.data.contract.states[index] });
  },
  retry() {
    const route = this.data.contract?.route;
    if (route) this.loadAuthoritative(route, this.data.query);
  },
  async addToCart() {
    const product = this.data.liveData;
    const variant = product?.variants?.find((item) => item.available);
    if (!product || !variant) {
      this.setData({ state: '可恢复失败' });
      return;
    }
    this.setData({ state: '加载中' });
    try {
      await merchantApi.setCartItem({
        variantId: variant.id,
        quantity: 1,
      });
      this.setData({ state: '成功' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async changeCartQuantity(event) {
    const item = event.currentTarget.dataset.item;
    const nextQuantity = Number(item.quantity) + Number(event.currentTarget.dataset.delta);
    this.setData({ state: '加载中' });
    try {
      const cart =
        nextQuantity > 0
          ? await merchantApi.setCartItem({ variantId: item.variantId, quantity: nextQuantity })
          : await merchantApi.removeCartItem(item.id);
      this.setData({ state: cart.itemCount ? '默认' : '空数据', liveData: cart });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async prepareCheckout() {
    const cart = this.data.liveData;
    if (!cart?.id || !cart.itemCount) return;
    const unavailable = (cart.groups || []).some((group) =>
      (group.items || []).some((item) => !item.available),
    );
    if (unavailable) {
      this.setData({ state: '可恢复失败' });
      return;
    }
    this.setData({ state: '加载中' });
    try {
      const checkout = await merchantApi.quoteCheckout(
        { cartVersion: cart.version, fulfillmentChoices: fulfillmentChoices(cart) },
        `merchant-checkout-${cart.id}-${cart.version}`,
      );
      wx.navigateTo({
        url: `/pages/route/index?route=%2Fmerchant%2Fpage-282&checkoutId=${encodeURIComponent(checkout.id)}`,
      });
      this.setData({ state: '默认' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async submitMerchantCheckout() {
    const checkout = this.data.liveData;
    if (!checkout?.id || checkout.status !== 'QUOTED') return;
    this.setData({ state: '加载中' });
    try {
      const submitted = await merchantApi.submitCheckout(
        checkout.id,
        `merchant-submit-${checkout.id}`,
      );
      const orderId = (submitted.groups || []).find((group) => group.orderId)?.orderId;
      if (!orderId) throw new Error('ORDER_CREATION_PENDING');
      wx.redirectTo({
        url: `/pages/route/index?route=%2Fmerchant%2Fpage-284&orderId=${encodeURIComponent(orderId)}`,
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  onMessageInput(event) {
    this.setData({ inputText: event.detail.value });
  },
  async sendCustomerMessage() {
    const content = this.data.inputText.trim();
    if (!content) return;
    this.setData({ state: '加载中' });
    try {
      let conversation = this.data.liveData?.conversation;
      if (!conversation) {
        conversation = await merchantApi.createConversation(
          {
            channel: 'MERCHANT_MINI_PROGRAM',
            privacyPolicyVersion: 'v6.1',
            profileMemoryConsent: false,
            consentEvidenceRef: 'ui://merchant-miniapp/customer-service/send',
            contextType: 'NONE',
          },
          `merchant-conversation-${Date.now()}`,
        );
      }
      await merchantApi.sendConversationMessage(
        conversation.id,
        content,
        `merchant-message-${conversation.id}-${Date.now()}`,
      );
      const [refreshed, messages] = await Promise.all([
        merchantApi.getConversation(conversation.id),
        merchantApi.listConversationMessages(conversation.id),
      ]);
      this.setData({
        state: '默认',
        inputText: '',
        query: { ...this.data.query, conversationId: conversation.id },
        liveData: { conversation: refreshed, messages },
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async requestHumanService() {
    const conversation = this.data.liveData?.conversation;
    if (!conversation || conversation.status !== 'BOT_ACTIVE') return;
    this.setData({ state: '加载中' });
    try {
      const updated = await merchantApi.requestHuman(
        conversation.id,
        `merchant-human-${conversation.id}`,
      );
      this.setData({
        state: '默认',
        liveData: { ...this.data.liveData, conversation: updated },
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async requestFullRefund() {
    const order = this.data.liveData;
    if (!order?.id || !order.items?.length) return;
    const refundableItems = order.items
      .map((item) => ({
        orderItemId: item.id,
        quantity: Number(item.quantity) - Number(item.refundedQuantity || 0),
      }))
      .filter((item) => item.quantity > 0);
    if (!refundableItems.length) return;
    const confirmed = await new Promise((resolve) =>
      wx.showModal({
        title: '确认申请售后',
        content: '将按当前订单全部可退商品提交申请，实际金额由服务端重新计算。',
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirmed) return;
    this.setData({ state: '加载中' });
    try {
      await merchantApi.refund(
        order.id,
        {
          requestType: 'OTHER',
          reasonCode: 'CUSTOMER_AFTERCARE_REQUEST',
          description: '消费者从独立商家小程序申请整单售后',
          items: refundableItems,
        },
        `merchant-refund-${order.id}-${order.version}-${order.refundedAmountCents}`,
      );
      wx.redirectTo({
        url: `/pages/route/index?route=%2Fmerchant%2Fpage-305&orderId=${encodeURIComponent(order.id)}`,
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async withdrawProfileMemory() {
    this.setData({ state: '加载中' });
    try {
      await merchantApi.changeProfileConsent(
        {
          consentType: 'PROFILE_MEMORY',
          status: 'WITHDRAWN',
          policyVersion: 'v6.1',
          evidenceRef: 'ui://merchant-miniapp/privacy/withdraw',
          purpose: 'STOP_CONTINUOUS_CUSTOMER_PROFILE',
        },
        `merchant-profile-withdraw-${Date.now()}`,
      );
      await this.loadAuthoritative('/merchant/page-307', this.data.query);
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async requestProfileView() {
    this.setData({ state: '加载中' });
    try {
      await merchantApi.requestPrivacy(
        { requestType: 'VIEW', scope: ['PROFILE_FACTS', 'CONSENTS'] },
        `merchant-profile-view-${Date.now()}`,
      );
      this.setData({ state: '成功' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async switchMerchantStore(event) {
    const storeId = event.currentTarget.dataset.storeId;
    if (!storeId || event.currentTarget.dataset.current) return;
    this.setData({ state: '加载中' });
    try {
      const result = await merchantApi.switchStore(
        storeId,
        `merchant-switch-${storeId}-${Date.now()}`,
      );
      wx.setStorageSync('consumerToken', result.accessToken);
      getApp().globalData.consumerToken = result.accessToken;
      wx.reLaunch({ url: '/pages/home/index' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  openOrder(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=%2Fmerchant%2Fpage-289&orderId=${encodeURIComponent(event.currentTarget.dataset.orderId)}`,
    });
  },
  openOrderFeature(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=${encodeURIComponent(event.currentTarget.dataset.route)}&orderId=${encodeURIComponent(event.currentTarget.dataset.orderId || this.data.liveData.id)}`,
    });
  },
  openExperienceAction(event) {
    const route = event.currentTarget.dataset.route;
    if (!route) return;
    wx.navigateTo({ url: `/pages/route/index?route=${encodeURIComponent(route)}` });
  },
  async startPayment() {
    const order = this.data.liveData;
    if (!order || order.status !== 'PENDING_PAYMENT') return;
    this.setData({ state: '加载中' });
    try {
      const intent = await merchantApi.createPayment(
        { orderId: order.id, provider: 'WECHAT_PAY' },
        `merchant-payment-${order.id}`,
      );
      const paymentOptions = JSON.parse(intent.clientCredential);
      await new Promise((resolve, reject) =>
        wx.requestPayment({ ...paymentOptions, success: resolve, fail: reject }),
      );
      await merchantApi.getOrder(order.id);
      wx.redirectTo({
        url: `/pages/route/index?route=%2Fmerchant%2Fpage-285&orderId=${encodeURIComponent(order.id)}`,
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  primaryAction() {
    if (!this.data.demoMode || ['停用', '无权限', '加载中'].includes(this.data.state)) return;
    this.setData({ state: '成功' });
  },
});
