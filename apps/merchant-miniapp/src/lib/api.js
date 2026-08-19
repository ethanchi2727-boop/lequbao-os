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
        else reject(new Error(response.data?.code || 'REQUEST_FAILED'));
      },
      fail: reject,
    }),
  );
}

function dualRequest(path, options = {}) {
  const app = getApp();
  if (!app.globalData.apiBaseUrl || !app.globalData.consumerToken)
    return Promise.reject(new Error('CONSUMER_SESSION_REQUIRED'));
  if (!app.globalData.lifeToken) return Promise.reject(new Error('LIFE_CONSUMER_SESSION_REQUIRED'));
  return new Promise((resolve, reject) =>
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        authorization: `Bearer ${app.globalData.consumerToken}`,
        'x-life-authorization': `Bearer ${app.globalData.lifeToken}`,
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
const merchantApi = {
  getStorefront: () => request('/api/v1/consumer/storefront'),
  getMembership: () => request('/api/v1/consumer/membership'),
  listStores: () => request('/api/v1/consumer/stores'),
  switchStore: (storeId, key) =>
    request('/api/v1/consumer/session/actions/switch-store', {
      method: 'POST',
      data: { storeId },
      idempotencyKey: key,
    }),
  listProducts: (query = {}) =>
    request(
      `/api/v1/consumer/products?${Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`,
    ),
  getProduct: (id) => request(`/api/v1/consumer/products/${encodeURIComponent(id)}`),
  getCart: () => dualRequest('/api/v1/merchant-consumer/cart'),
  setCartItem: (data) =>
    dualRequest('/api/v1/merchant-consumer/cart/items', { method: 'PUT', data }),
  removeCartItem: (itemId) =>
    dualRequest(`/api/v1/merchant-consumer/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),
  quoteCheckout: (data, key) =>
    dualRequest('/api/v1/merchant-consumer/checkouts/quote', {
      method: 'POST',
      data,
      idempotencyKey: key,
    }),
  getCheckout: (id) => dualRequest(`/api/v1/merchant-consumer/checkouts/${encodeURIComponent(id)}`),
  submitCheckout: (id, key) =>
    dualRequest(`/api/v1/merchant-consumer/checkouts/${encodeURIComponent(id)}/actions/submit`, {
      method: 'POST',
      idempotencyKey: key,
    }),
  createOrder: (data, key) =>
    request('/api/v1/orders', { method: 'POST', data, idempotencyKey: key }),
  getOrder: (id) => request(`/api/v1/orders/${id}`),
  listOrders: (query = {}) =>
    request(
      `/api/v1/orders?${Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`,
    ),
  createPayment: (data, key) =>
    request('/api/v1/payment-intents', { method: 'POST', data, idempotencyKey: key }),
  refund: (id, data, key) =>
    request(`/api/v1/orders/${id}/refunds`, { method: 'POST', data, idempotencyKey: key }),
  listRefunds: (id) => request(`/api/v1/orders/${encodeURIComponent(id)}/refunds`),
  listVerification: (id) =>
    request(`/api/v1/orders/${encodeURIComponent(id)}/verification-entitlements`),
  listAvailableVerification: () => request('/api/v1/verification-entitlements'),
  createConversation: (data, key) =>
    request('/api/v1/customer-service/conversations', {
      method: 'POST',
      data,
      idempotencyKey: key,
    }),
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
  changeProfileConsent: (data, key) =>
    request('/api/v1/customer-profile/consents', { method: 'POST', data, idempotencyKey: key }),
  requestPrivacy: (data, key) =>
    request('/api/v1/customer-profile/privacy-requests', {
      method: 'POST',
      data,
      idempotencyKey: key,
    }),
};

module.exports = { merchantApi };
