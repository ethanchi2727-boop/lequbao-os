/* global uni */

const SESSION_KEY = 'lequ.life.consumer.session.v1';
const MERCHANT_CONTEXT_KEY = 'lequ.life.merchant.context.v1';
const DEVICE_KEY = 'lequ.life.consumer.device.v1';

const uniRuntime = {
  getStorageSync: (key) => uni.getStorageSync(key),
  setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: (key) => uni.removeStorageSync(key),
  request: (options) => uni.request(options),
  login: (options) => uni.login(options),
};

export const lifeRuntimeProfile = Object.freeze({
  previewData: import.meta.env.VITE_LEQU_PREVIEW_DATA === '1',
  developmentMocks: import.meta.env.VITE_LEQU_DEVELOPMENT_MOCKS === '1',
});

function deviceId(storage) {
  const existing = storage.getStorageSync(DEVICE_KEY);
  if (typeof existing === 'string' && existing.length >= 16) return existing;
  const generated = `life-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  storage.setStorageSync(DEVICE_KEY, generated);
  return generated;
}

function mockConsumerDiscoveryProducts(limitStr) {
  const limit = Math.max(1, Math.min(100, parseInt(limitStr || '12', 10) || 12));
  const storeTenants = [
    ['lequ-market-main', '乐渠生鲜旗舰店', '优选区', '精品生活超市'],
    ['lequ-gourmet', '乐生活好店', '美食区', '品质好店'],
    ['lequ-home', '好物到家', '家居区', '家庭常备'],
    ['lequ-fresh', '鲜源直供', '水果区', '产地直发'],
  ];
  const variants = [
    ['冰镇麒麟西瓜 约5kg/个', '单果 约5kg', 3980, 4980, 128],
    ['生态优质大米 5kg/袋', '东北产地·5kg装', 6990, 8990, 320],
    ['鲜牛奶量贩三连装 750ml×3', '750ml×3瓶', 3580, 4580, 86],
    ['办公室囤货零食套装', '多口味组合·420g', 2880, 3680, 256],
    ['家庭装洗衣液 4.26kg×2', '深层洁净·8.52kg', 7980, 9980, 64],
    ['鲜榨橙汁量贩装 1L×6', '1L×6瓶·冷链', 5980, 7280, 92],
    ['原生木浆纸巾 3层×24包', '3层×24包·整箱', 4280, 5280, 180],
    ['深海刺身三文鱼拼大虾', '三文鱼250g+大虾300g', 13880, 16880, 48],
  ];
  const uuid = () =>
    'MOCK-' + Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 8);
  return Array.from({ length: limit }, (_, i) => {
    const v = variants[i % variants.length];
    const s = storeTenants[i % storeTenants.length];
    return {
      id: uuid(),
      merchantTenantId: s[0],
      storeId: `${s[0]}-store-${(i % storeTenants.length) + 1}`,
      variantId: `v-${Math.random().toString(36).slice(2, 10)}`,
      title: v[0],
      storeName: s[1],
      categoryLabel: s[2],
      storeTypeLabel: s[3],
      variantTitle: v[1],
      salePriceCents: v[2],
      marketPriceCents: v[3],
      availableQuantity: i % 6 === 5 ? 0 : v[4],
      updatedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    };
  });
}

function mockConsumerDiscoveryStores(limitStr) {
  const limit = Math.max(1, Math.min(100, parseInt(limitStr || '6', 10) || 6));
  const presets = [
    ['乐渠生鲜旗舰店（生活广场店）', 86, '320m', '营业中 · 30分钟达'],
    ['鲜源生活超市（朝阳门店）', 54, '560m', '营业中 · 当日达'],
    ['乐趣邻里好店（美食街店）', 42, '890m', '营业中 · 支持自提'],
    ['好物到家百货中心', 128, '1.2km', '营业中 · 次日达'],
    ['乐生活优选（社区店）', 36, '430m', '营业中 · 到店自提'],
    ['品质厨房体验馆', 28, '1.8km', '营业中 · 配送'],
  ];
  const uuid = () => 'MOCK-STORE-' + Math.random().toString(16).slice(2, 12);
  return Array.from({ length: limit }, (_, i) => {
    const s = presets[i % presets.length];
    return {
      id: uuid(),
      merchantTenantId: `lequ-${['main', 'fresh', 'gourmet', 'home', 'community', 'kitchen'][i % 6]}`,
      storeId: `store-${i + 1}`,
      name: s[0],
      productCount: s[1] + (i % 3) * 5,
      distanceLabel: s[2],
      statusLabel: s[3],
    };
  });
}

function mockCartPut() {
  return {
    cartLineId: `MOCK-CART-${Math.random().toString(36).slice(2, 10)}`,
    quantity: 1,
    state: 'ADDED',
    note: '开发模式：未真实提交，实际以服务端购物车核算为准。',
  };
}

function mockResponse(path, options, developmentMocks) {
  if (!developmentMocks) return null;
  const method = (options.method ?? 'GET').toUpperCase();
  if (method === 'GET' && path.startsWith('/api/v1/life/discovery/products')) {
    const m = path.match(/[?&]limit=(\d+)/);
    return mockConsumerDiscoveryProducts(m?.[1]);
  }
  if (method === 'GET' && path.startsWith('/api/v1/life/discovery/stores')) {
    const m = path.match(/[?&]limit=(\d+)/);
    return mockConsumerDiscoveryStores(m?.[1]);
  }
  if (method === 'PUT' && path === '/api/v1/life/cart/items') {
    return mockCartPut();
  }
  return null;
}

function responseError(response) {
  const error = new Error(response?.data?.code ?? `HTTP_${response?.statusCode ?? 0}`);
  error.status = response?.statusCode ?? 0;
  error.code = response?.data?.code ?? 'REQUEST_FAILED';
  return error;
}

export function parsePaymentCredential(value) {
  if (typeof value !== 'string' || value.length > 16_384)
    throw new Error('INVALID_PAYMENT_CREDENTIAL');
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('INVALID_PAYMENT_CREDENTIAL');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('INVALID_PAYMENT_CREDENTIAL');
  const credential = { ...parsed };
  delete credential.provider;
  return credential;
}

function mockConsumerSession(provider, assertion) {
  const uuid = () =>
    '11111111-1111-4111-8111-' +
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 6);
  const accountId = uuid();
  const sessionId = uuid();
  const expires = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
  const tokenTail = Math.random().toString(36).slice(2);
  return {
    accessToken: `development-life-${accountId}-${sessionId}-${tokenTail}`.slice(0, 160),
    refreshToken: `development-life-refresh-${sessionId}-${tokenTail}`.slice(0, 128),
    accessTokenExpiresAt: expires,
    sessionExpiresAt: expires,
    identity: {
      accountId,
      sessionId,
      authLevel: provider === 'MOBILE_OTP' ? 'PHONE_BOUND' : 'WECHAT',
      provider,
      assertionId: `development-mock-${String(assertion ?? provider).slice(0, 32)}`,
      deviceIdSha256: 'development-mock-life-device-hash',
      mobileHash: provider === 'MOBILE_OTP' ? 'development-mock-mobile-hash' : undefined,
      unionIdentifierHash: 'development-mock-union-hash',
      authSubjectHash: 'development-mock-subject-hash',
      issuedAt: new Date().toISOString(),
    },
  };
}

export function createLifeSessionClient({
  transport = uniRuntime,
  storage = uniRuntime,
  apiBase = typeof globalThis.location === 'undefined' ? 'https://bao.lequ.com' : '',
  developmentMocks = lifeRuntimeProfile.developmentMocks,
} = {}) {
  const apiUrl = (path) => `${apiBase.replace(/\/$/u, '')}${path}`;
  const load = () => storage.getStorageSync(SESSION_KEY) || null;
  const save = (session) => {
    storage.setStorageSync(SESSION_KEY, session);
    return session;
  };
  const clearMerchantContext = () => storage.removeStorageSync(MERCHANT_CONTEXT_KEY);
  const clear = () => {
    storage.removeStorageSync(SESSION_KEY);
    clearMerchantContext();
  };

  async function rawRequest(options) {
    const response = await transport.request(options);
    if (response.statusCode < 200 || response.statusCode >= 300) throw responseError(response);
    return response.data;
  }

  async function exchange(provider, assertion) {
    return save(
      developmentMocks
        ? mockConsumerSession(provider, assertion)
        : await rawRequest({
            url: apiUrl('/api/v1/life/auth/sessions/exchange'),
            method: 'POST',
            data: { provider, assertion, deviceId: deviceId(storage) },
          }),
    );
  }

  async function requestMobileOtp(mobile) {
    return developmentMocks
      ? {
          challengeId: `development-mobile-otp-${Math.random().toString(36).slice(2, 10)}`,
          maskedDestination: '138****0000',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          resendAfterSeconds: 60,
        }
      : rawRequest({
          url: apiUrl('/api/v1/life/auth/mobile-otp/challenges'),
          method: 'POST',
          data: { mobile, deviceId: deviceId(storage) },
        });
  }

  async function exchangeMobileOtp(challengeId, code) {
    return save(
      developmentMocks
        ? mockConsumerSession('MOBILE_OTP', `${challengeId}:${code}`)
        : await rawRequest({
            url: apiUrl('/api/v1/life/auth/mobile-otp/assertions/exchange'),
            method: 'POST',
            data: { challengeId, code, deviceId: deviceId(storage) },
          }),
    );
  }

  async function refresh() {
    const session = load();
    if (!session?.identity?.accountId || !session?.refreshToken)
      throw responseError({ statusCode: 401 });
    try {
      return save(
        await rawRequest({
          url: apiUrl('/api/v1/life/auth/sessions/refresh'),
          method: 'POST',
          data: {
            accountId: session.identity.accountId,
            sessionId: session.identity.sessionId,
            refreshToken: session.refreshToken,
            deviceId: deviceId(storage),
          },
        }),
      );
    } catch (error) {
      clear();
      throw error;
    }
  }

  async function request(path, options = {}, retry = true) {
    const mocked = mockResponse(path, options, developmentMocks);
    if (mocked !== null) return Promise.resolve(mocked);
    const session = load();
    if (!session?.accessToken) throw responseError({ statusCode: 401 });
    try {
      return await rawRequest({
        url: apiUrl(path),
        method: options.method ?? 'GET',
        data: options.data,
        header: { ...options.header, Authorization: `Bearer ${session.accessToken}` },
      });
    } catch (error) {
      if (error.status !== 401 || !retry) throw error;
      const rotated = await refresh();
      return rawRequest({
        url: apiUrl(path),
        method: options.method ?? 'GET',
        data: options.data,
        header: { ...options.header, Authorization: `Bearer ${rotated.accessToken}` },
      });
    }
  }

  const merchantContextMatches = (context, requested) =>
    context?.merchantTenantId === requested.merchantTenantId &&
    context?.storeId === requested.storeId &&
    typeof context?.accessToken === 'string' &&
    new Date(context.expiresAt).getTime() > Date.now() + 30_000;

  async function exchangeMerchantContext(requested) {
    const context = await request('/api/v1/life/merchant-context/sessions', {
      method: 'POST',
      header: {
        'Idempotency-Key': `life-context-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      },
      data: requested,
    });
    storage.setStorageSync(MERCHANT_CONTEXT_KEY, context);
    return context;
  }

  async function requestMerchant(requested, path, options = {}, retry = true) {
    if (
      !path.startsWith('/api/v1/consumer/') &&
      !path.startsWith('/api/v1/customer-service/') &&
      path !== '/api/v1/customer-profile' &&
      !path.startsWith('/api/v1/customer-profile/')
    )
      throw new Error('INVALID_MERCHANT_CONTEXT_PATH');
    const saved = storage.getStorageSync(MERCHANT_CONTEXT_KEY);
    const context = merchantContextMatches(saved, requested)
      ? saved
      : await exchangeMerchantContext(requested);
    try {
      return await rawRequest({
        url: apiUrl(path),
        method: options.method ?? 'GET',
        data: options.data,
        header: { ...options.header, Authorization: `Bearer ${context.accessToken}` },
      });
    } catch (error) {
      if (error.status !== 401 || !retry) throw error;
      clearMerchantContext();
      const rotated = await exchangeMerchantContext(requested);
      return rawRequest({
        url: apiUrl(path),
        method: options.method ?? 'GET',
        data: options.data,
        header: { ...options.header, Authorization: `Bearer ${rotated.accessToken}` },
      });
    }
  }

  async function loginWithWechat() {
    const result = await transport.login({ provider: 'weixin' });
    if (!result?.code) throw new Error('WECHAT_LOGIN_UNAVAILABLE');
    return exchange('WECHAT', result.code);
  }

  async function logout(reason = 'USER_LOGOUT') {
    try {
      if (load()?.accessToken)
        await request('/api/v1/life/auth/sessions/revoke', {
          method: 'POST',
          data: { reason },
        });
    } finally {
      clear();
    }
  }

  return {
    load,
    clear,
    exchange,
    requestMobileOtp,
    exchangeMobileOtp,
    refresh,
    request,
    exchangeMerchantContext,
    requestMerchant,
    loginWithWechat,
    logout,
  };
}

export const lifeSession = createLifeSessionClient();
