const contracts = require('../../generated/page-contracts.js');
const { commerceApi } = require('../../lib/api.js');

const liveProductRoutes = new Set(['/life/page-209', '/life/page-210', '/life/page-221']);
const liveProductListRoutes = new Set([
  '/life/page-200',
  '/life/page-201',
  '/life/page-203',
  '/life/page-204',
  '/life/page-213',
]);

Page({
  data: {
    contract: null,
    state: '加载中',
    stateIndex: 0,
    demoMode: false,
    liveData: null,
    liveKind: null,
    addressDraft: {
      recipientName: '',
      mobile: '',
      provinceCode: '',
      cityCode: '',
      districtCode: '',
      addressLine: '',
      isDefault: true,
    },
    refundDraft: { requestType: 'OTHER', reasonCode: '', description: '' },
    inputText: '',
    invoiceDraft: {
      profileType: 'PERSONAL',
      title: '',
      taxIdentifier: '',
      email: '',
      isDefault: true,
    },
    query: {},
  },
  onLoad(query) {
    const route = decodeURIComponent(query.route || '/life/page-198').split('?')[0];
    const contract = contracts.find((item) => item.route === route) || contracts[0];
    const demoMode = query.demo === '1';
    this.setData({
      contract: { ...contract, domainsText: contract.domains.join(' · ') },
      demoMode,
      query,
      state: demoMode ? '默认' : '加载中',
    });
    wx.setNavigationBarTitle({ title: contract.title });
    if (!demoMode) this.loadAuthoritative(route, query);
  },
  async loadAuthoritative(route, query) {
    if (route === '/life/page-211') {
      if (!query.productId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'trace' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'trace' });
      try {
        const report = await commerceApi.getTraceReport(query.productId);
        this.setData({ state: '默认', liveData: report });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-250') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'invoices' });
      try {
        const profiles = await commerceApi.listInvoiceProfiles();
        this.setData({ state: '默认', liveData: profiles });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/life/page-198', '/life/page-216', '/life/page-219'].includes(route)) {
      this.setData({ state: '加载中', liveData: null, liveKind: 'discovery' });
      try {
        const stores = await commerceApi.discoverStores({
          ...(query.cityCode ? { cityCode: query.cityCode } : {}),
          limit: 50,
        });
        this.setData({ state: stores.length ? '默认' : '空数据', liveData: stores });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (liveProductListRoutes.has(route)) {
      this.setData({ state: '加载中', liveData: null, liveKind: 'products' });
      try {
        const products = await commerceApi.listProducts({
          ...(query.productType ? { productType: query.productType } : {}),
          ...(query.query ? { query: query.query } : {}),
          limit: 50,
        });
        this.setData({ state: products.length ? '默认' : '空数据', liveData: products });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-218') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'storefront' });
      try {
        const storefront = await commerceApi.getStorefront();
        this.setData({ state: '默认', liveData: storefront });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-235') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'membership' });
      try {
        const [membership, rewards, orders] = await Promise.all([
          commerceApi.getStoreMembership(),
          commerceApi.listLifeRewards({ limit: 10 }),
          commerceApi.listLifeOrders({ limit: 10 }),
        ]);
        this.setData({ state: '默认', liveData: { membership, rewards, orders } });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/life/page-258', '/life/page-262'].includes(route)) {
      this.setData({ state: '加载中', liveData: null, liveKind: 'conversation' });
      if (!query.conversationId) {
        this.setData({ state: '默认', liveData: { conversation: null, messages: [] } });
        return;
      }
      try {
        const [conversation, messages] = await Promise.all([
          commerceApi.getConversation(query.conversationId),
          commerceApi.listConversationMessages(query.conversationId),
        ]);
        this.setData({ state: '默认', liveData: { conversation, messages } });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-264') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'conversations' });
      try {
        const conversations = await commerceApi.listConversations();
        this.setData({ state: conversations.length ? '默认' : '空数据', liveData: conversations });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/life/page-254', '/life/page-255'].includes(route)) {
      this.setData({ state: '加载中', liveData: null, liveKind: 'profile' });
      try {
        const profile = await commerceApi.getCustomerProfile();
        this.setData({ state: '默认', liveData: profile });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-259') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'orders' });
      try {
        const orders = await commerceApi.listLifeOrders({ limit: 50 });
        this.setData({ state: orders.length ? '默认' : '空数据', liveData: orders });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/life/page-239', '/life/page-240', '/life/page-246'].includes(route)) {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'aftercare' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'aftercare' });
      try {
        const aftercare = await commerceApi.getLifeAftercare(query.orderId);
        this.setData({
          state: aftercare.refunds.length ? '默认' : '空数据',
          liveData: aftercare,
        });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-242') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'verification' });
      try {
        const tokens = await commerceApi.listAvailableLifeVerification();
        this.setData({ state: tokens.length ? '默认' : '空数据', liveData: tokens });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-243') {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'verification' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'verification' });
      try {
        const tokens = await commerceApi.listLifeVerification(query.orderId);
        this.setData({ state: tokens.length ? '默认' : '空数据', liveData: tokens });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-245') {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'refundForm' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'refundForm' });
      try {
        const order = await commerceApi.getLifeOrder(query.orderId);
        this.setData({ state: '默认', liveData: order });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-252') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'rewards' });
      try {
        const rewards = await commerceApi.listLifeRewards({ limit: 50 });
        this.setData({ state: rewards.length ? '默认' : '空数据', liveData: rewards });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-248') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'addresses' });
      try {
        const addresses = await commerceApi.listAddresses();
        this.setData({ state: '默认', liveData: addresses });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/life/page-231', '/life/page-232'].includes(route)) {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'paymentOrder' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'paymentOrder' });
      try {
        const order = await commerceApi.getLifeOrder(query.orderId);
        this.setData({ state: '默认', liveData: order });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (['/life/page-227', '/life/page-228', '/life/page-229'].includes(route)) {
      if (!query.checkoutId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'checkout' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'checkout' });
      try {
        const [checkout, addresses] = await Promise.all([
          commerceApi.getCheckout(query.checkoutId),
          commerceApi.listAddresses(),
        ]);
        this.setData({
          state: '默认',
          liveData: {
            ...checkout,
            addresses,
            groups: checkout.groups.map((group) => ({
              ...group,
              deliveryAddress: addresses.find((address) => address.id === group.addressId) || null,
            })),
          },
        });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-237') {
      this.setData({ state: '加载中', liveData: null, liveKind: 'orders' });
      try {
        const orders = await commerceApi.listLifeOrders({ limit: 50 });
        this.setData({ state: orders.length ? '默认' : '空数据', liveData: orders });
      } catch {
        this.setData({ state: '可恢复失败', liveData: null });
      }
      return;
    }
    if (route === '/life/page-238') {
      if (!query.orderId) {
        this.setData({ state: '空数据', liveData: null, liveKind: 'order' });
        return;
      }
      this.setData({ state: '加载中', liveData: null, liveKind: 'order' });
      try {
        const order = await commerceApi.getLifeOrder(query.orderId);
        this.setData({ state: '默认', liveData: order });
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
      const product = await commerceApi.getProduct(query.productId);
      this.setData({ state: '默认', liveData: product });
    } catch {
      this.setData({ state: '可恢复失败', liveData: null });
    }
  },
  openOrder(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=%2Flife%2Fpage-238&orderId=${encodeURIComponent(event.currentTarget.dataset.orderId)}`,
    });
  },
  openCheckoutSection(event) {
    const route = event.currentTarget.dataset.route;
    wx.redirectTo({
      url: `/pages/route/index?route=${encodeURIComponent(route)}&checkoutId=${encodeURIComponent(this.data.liveData.id)}`,
    });
  },
  openPayment(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=%2Flife%2Fpage-231&orderId=${encodeURIComponent(event.currentTarget.dataset.orderId)}`,
    });
  },
  openOrderFeature(event) {
    const route = event.currentTarget.dataset.route;
    const orderId = event.currentTarget.dataset.orderId || this.data.liveData?.id;
    wx.navigateTo({
      url: `/pages/route/index?route=${encodeURIComponent(route)}&orderId=${encodeURIComponent(orderId)}`,
    });
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
      await commerceApi.setCartItem({
        merchantTenantId: product.merchantTenantId,
        storeId: product.storeId,
        variantId: variant.id,
        quantity: 1,
      });
      this.setData({ state: '成功' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async submitCheckout() {
    const checkout = this.data.liveData;
    if (!checkout || !['QUOTED', 'PARTIAL', 'FAILED'].includes(checkout.status)) return;
    this.setData({ state: '加载中' });
    try {
      const submitted = await commerceApi.submitCheckout(
        checkout.id,
        `life-checkout-submit-${checkout.id}`,
      );
      this.setData({
        state: submitted.status === 'ORDERS_CREATED' ? '默认' : '可恢复失败',
        liveData: submitted,
        liveKind: 'checkout',
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async startPayment() {
    const order = this.data.liveData;
    if (!order || order.status !== 'PENDING_PAYMENT') return;
    this.setData({ state: '加载中' });
    try {
      const intent = await commerceApi.createLifePayment(
        { orderId: order.id, provider: 'WECHAT_PAY' },
        `life-payment-${order.id}`,
      );
      const paymentOptions = JSON.parse(intent.clientCredential);
      await new Promise((resolve, reject) =>
        wx.requestPayment({ ...paymentOptions, success: resolve, fail: reject }),
      );
      await commerceApi.getLifeOrder(order.id);
      wx.redirectTo({
        url: `/pages/route/index?route=%2Flife%2Fpage-232&orderId=${encodeURIComponent(order.id)}`,
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  updateAddressDraft(event) {
    this.setData({
      [`addressDraft.${event.currentTarget.dataset.field}`]: event.detail.value,
    });
  },
  async saveAddress() {
    this.setData({ state: '加载中' });
    try {
      await commerceApi.saveAddress(this.data.addressDraft);
      const addresses = await commerceApi.listAddresses();
      this.setData({ state: '默认', liveData: addresses, liveKind: 'addresses' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async archiveAddress(event) {
    this.setData({ state: '加载中' });
    try {
      await commerceApi.archiveAddress(event.currentTarget.dataset.addressId);
      const addresses = await commerceApi.listAddresses();
      this.setData({
        state: '默认',
        liveData: addresses,
        liveKind: 'addresses',
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  updateRefundDraft(event) {
    this.setData({
      [`refundDraft.${event.currentTarget.dataset.field}`]: event.detail.value,
    });
  },
  async submitRefund() {
    const order = this.data.liveData;
    const draft = this.data.refundDraft;
    const items = (order?.items || [])
      .filter((item) => item.quantity > item.refundedQuantity)
      .map((item) => ({ orderItemId: item.id, quantity: item.quantity - item.refundedQuantity }));
    if (!order || !draft.reasonCode.trim() || !items.length) return;
    this.setData({ state: '加载中' });
    try {
      await commerceApi.requestLifeRefund(
        order.id,
        {
          requestType: draft.requestType,
          reasonCode: draft.reasonCode.trim(),
          ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
          items,
        },
        `life-refund-${order.id}-${Date.now()}`,
      );
      wx.redirectTo({
        url: `/pages/route/index?route=%2Flife%2Fpage-246&orderId=${encodeURIComponent(order.id)}`,
      });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  openProduct(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=%2Flife%2Fpage-209&productId=${encodeURIComponent(event.currentTarget.dataset.productId)}`,
    });
  },
  openConversation(event) {
    wx.navigateTo({
      url: `/pages/route/index?route=%2Flife%2Fpage-262&conversationId=${encodeURIComponent(event.currentTarget.dataset.conversationId)}`,
    });
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
        conversation = await commerceApi.createConversation(
          {
            channel: 'LEQU_LIFE',
            privacyPolicyVersion: 'v6.1',
            profileMemoryConsent: false,
            consentEvidenceRef: 'ui://life/customer-service/send',
            contextType: 'NONE',
          },
          `life-conversation-${Date.now()}`,
        );
      }
      await commerceApi.sendConversationMessage(
        conversation.id,
        content,
        `life-message-${conversation.id}-${Date.now()}`,
      );
      const [refreshed, messages] = await Promise.all([
        commerceApi.getConversation(conversation.id),
        commerceApi.listConversationMessages(conversation.id),
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
      const updated = await commerceApi.requestHuman(
        conversation.id,
        `life-human-${conversation.id}`,
      );
      this.setData({ state: '默认', liveData: { ...this.data.liveData, conversation: updated } });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async changeLifeConsent(event) {
    const consentType = event.currentTarget.dataset.consentType;
    const status = event.currentTarget.dataset.status;
    this.setData({ state: '加载中' });
    try {
      await commerceApi.changeConsent(
        {
          consentType,
          status,
          policyVersion: 'v6.1',
          evidenceRef: `ui://life/consent/${consentType.toLowerCase()}`,
          purpose:
            consentType === 'SUBSCRIPTION_MESSAGE'
              ? 'ORDER_AND_SERVICE_NOTIFICATIONS'
              : 'CONTINUOUS_CUSTOMER_PROFILE',
        },
        `life-consent-${consentType}-${status}-${Date.now()}`,
      );
      await this.loadAuthoritative(this.data.contract.route, this.data.query);
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async requestProfileView() {
    this.setData({ state: '加载中' });
    try {
      await commerceApi.requestPrivacy(
        { requestType: 'VIEW', scope: ['PROFILE_FACTS', 'CONSENTS'] },
        `life-profile-view-${Date.now()}`,
      );
      this.setData({ state: '成功' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async locateNearbyStores() {
    this.setData({ state: '加载中' });
    try {
      const location = await new Promise((resolve, reject) =>
        wx.getLocation({ type: 'gcj02', success: resolve, fail: reject }),
      );
      const stores = await commerceApi.discoverStores({
        latitude: location.latitude,
        longitude: location.longitude,
        limit: 50,
      });
      this.setData({ state: stores.length ? '默认' : '空数据', liveData: stores });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  openStoreMap(event) {
    const store = event.currentTarget.dataset.store;
    if (typeof store?.latitude !== 'number' || typeof store?.longitude !== 'number') return;
    wx.openLocation({
      latitude: store.latitude,
      longitude: store.longitude,
      name: store.name,
      address: `${store.cityCode || ''} ${store.districtCode || ''}`,
    });
  },
  updateInvoiceDraft(event) {
    this.setData({ [`invoiceDraft.${event.currentTarget.dataset.field}`]: event.detail.value });
  },
  setInvoiceType(event) {
    this.setData({ 'invoiceDraft.profileType': event.currentTarget.dataset.profileType });
  },
  async saveInvoiceProfile() {
    const draft = this.data.invoiceDraft;
    if (!draft.title.trim()) return;
    this.setData({ state: '加载中' });
    try {
      await commerceApi.saveInvoiceProfile({
        profileType: draft.profileType,
        title: draft.title.trim(),
        ...(draft.profileType === 'ENTERPRISE'
          ? { taxIdentifier: draft.taxIdentifier.trim() }
          : {}),
        ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
        isDefault: draft.isDefault,
      });
      const profiles = await commerceApi.listInvoiceProfiles();
      this.setData({ state: '默认', liveData: profiles, liveKind: 'invoices' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async archiveInvoiceProfile(event) {
    this.setData({ state: '加载中' });
    try {
      await commerceApi.archiveInvoiceProfile(event.currentTarget.dataset.profileId);
      const profiles = await commerceApi.listInvoiceProfiles();
      this.setData({ state: '默认', liveData: profiles, liveKind: 'invoices' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  primaryAction() {
    if (!this.data.demoMode || ['停用', '无权限', '加载中'].includes(this.data.state)) return;
    this.setData({ state: '成功' });
  },
});
