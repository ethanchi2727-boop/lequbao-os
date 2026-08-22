function request(path, options = {}) {
  const app = getApp();
  if (!app.globalData.apiBaseUrl || !app.globalData.consumerToken)
    return Promise.reject(new Error('CONSUMER_SESSION_REQUIRED'));
  return new Promise((resolve, reject) =>
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        authorization: `Bearer ${app.globalData.consumerToken}`,
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
        'content-type': 'application/json',
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else
          reject(
            Object.assign(new Error(response.data?.code || 'REQUEST_FAILED'), {
              statusCode: response.statusCode,
            }),
          );
      },
      fail: reject,
    }),
  );
}

function lifeRequest(path, options = {}) {
  const app = getApp();
  if (!app.globalData.apiBaseUrl || !app.globalData.lifeToken)
    return Promise.reject(new Error('LIFE_CONSUMER_SESSION_REQUIRED'));
  return new Promise((resolve, reject) =>
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        authorization: `Bearer ${app.globalData.lifeToken}`,
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
        'content-type': 'application/json',
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else
          reject(
            Object.assign(new Error(response.data?.code || 'REQUEST_FAILED'), {
              statusCode: response.statusCode,
            }),
          );
      },
      fail: reject,
    }),
  );
}

const commerceApi = {
  getStorefront: () => request('/api/v1/consumer/storefront'),
  listProducts: (query = {}) =>
    request(
      `/api/v1/consumer/products?${Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`,
    ),
  getProduct: (id) => request(`/api/v1/consumer/products/${encodeURIComponent(id)}`),
  getTraceReport: (id) =>
    request(`/api/v1/consumer/products/${encodeURIComponent(id)}/trace-report`),
  getStoreMembership: () => request('/api/v1/consumer/membership'),
  createConversation: (data, key) =>
    request('/api/v1/customer-service/conversations', {
      method: 'POST',
      data,
      idempotencyKey: key,
    }),
  listConversations: () => request('/api/v1/customer-service/conversations'),
  getConversation: (id) =>
    request(`/api/v1/customer-service/conversations/${encodeURIComponent(id)}`),
  listConversationMessages: (id) =>
    request(`/api/v1/customer-service/conversations/${encodeURIComponent(id)}/messages`),
  sendConversationMessage: (id, content, key) =>
    request(`/api/v1/customer-service/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      data: { content },
      idempotencyKey: key,
    }),
  requestHuman: (id, key) =>
    request(
      `/api/v1/customer-service/conversations/${encodeURIComponent(id)}/actions/request-human`,
      {
        method: 'POST',
        data: { reasonCode: 'CUSTOMER_REQUESTED_HUMAN', priority: 'NORMAL' },
        idempotencyKey: key,
      },
    ),
  getCustomerProfile: () => request('/api/v1/customer-profile'),
  changeConsent: (data, key) =>
    request('/api/v1/customer-profile/consents', { method: 'POST', data, idempotencyKey: key }),
  requestPrivacy: (data, key) =>
    request('/api/v1/customer-profile/privacy-requests', {
      method: 'POST',
      data,
      idempotencyKey: key,
    }),
  getCart: () => lifeRequest('/api/v1/life/cart'),
  discoverStores: (query = {}) =>
    lifeRequest(
      `/api/v1/life/discovery/stores?${Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`,
    ),
  listAddresses: () => lifeRequest('/api/v1/life/addresses'),
  saveAddress: (data) => lifeRequest('/api/v1/life/addresses', { method: 'PUT', data }),
  archiveAddress: (addressId) =>
    lifeRequest(`/api/v1/life/addresses/${encodeURIComponent(addressId)}`, {
      method: 'DELETE',
    }),
  listInvoiceProfiles: () => lifeRequest('/api/v1/life/invoice-profiles'),
  saveInvoiceProfile: (data) =>
    lifeRequest('/api/v1/life/invoice-profiles', { method: 'PUT', data }),
  archiveInvoiceProfile: (profileId) =>
    lifeRequest(`/api/v1/life/invoice-profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    }),
  setCartItem: (data) => lifeRequest('/api/v1/life/cart/items', { method: 'PUT', data }),
  removeCartItem: (itemId) =>
    lifeRequest(`/api/v1/life/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  listLifeOrders: (query = {}) =>
    lifeRequest(
      `/api/v1/life/orders?${Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`,
    ),
  getLifeOrder: (orderId) => lifeRequest(`/api/v1/life/orders/${encodeURIComponent(orderId)}`),
  getLifeAftercare: (orderId) =>
    lifeRequest(`/api/v1/life/orders/${encodeURIComponent(orderId)}/aftercare`),
  requestLifeRefund: (orderId, data, idempotencyKey) =>
    lifeRequest(`/api/v1/life/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: 'POST',
      data,
      idempotencyKey,
    }),
  listLifeVerification: (orderId) =>
    lifeRequest(`/api/v1/life/orders/${encodeURIComponent(orderId)}/verification-entitlements`),
  listAvailableLifeVerification: () => lifeRequest('/api/v1/life/verification-entitlements'),
  listLifeRewards: (query = {}) =>
    lifeRequest(
      `/api/v1/life/rewards?${Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`,
    ),
  quoteCheckout: (data, idempotencyKey) =>
    lifeRequest('/api/v1/life/checkouts/quote', { method: 'POST', data, idempotencyKey }),
  getCheckout: (checkoutId) =>
    lifeRequest(`/api/v1/life/checkouts/${encodeURIComponent(checkoutId)}`),
  submitCheckout: (checkoutId, idempotencyKey) =>
    lifeRequest(`/api/v1/life/checkouts/${encodeURIComponent(checkoutId)}/actions/submit`, {
      method: 'POST',
      idempotencyKey,
    }),
  createLifePayment: (data, idempotencyKey) =>
    lifeRequest('/api/v1/life/payment-intents', { method: 'POST', data, idempotencyKey }),
  createOrder: (data, idempotencyKey) =>
    request('/api/v1/orders', { method: 'POST', data, idempotencyKey }),
  getOrder: (orderId) => request(`/api/v1/orders/${orderId}`),
  createPayment: (data, idempotencyKey) =>
    request('/api/v1/payment-intents', { method: 'POST', data, idempotencyKey }),
  requestRefund: (orderId, data, idempotencyKey) =>
    request(`/api/v1/orders/${orderId}/refunds`, { method: 'POST', data, idempotencyKey }),
  listVerification: (orderId) => request(`/api/v1/orders/${orderId}/verification-entitlements`),
};

module.exports = { commerceApi };
