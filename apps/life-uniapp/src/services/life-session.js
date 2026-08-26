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
