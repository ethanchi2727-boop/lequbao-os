/* global uni */

const SESSION_KEY = 'lequ.life.consumer.session.v1';
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

export function createLifeSessionClient({
  transport = uniRuntime,
  storage = uniRuntime,
  apiBase = typeof globalThis.location === 'undefined' ? 'https://bao.lequ.com' : '',
} = {}) {
  const apiUrl = (path) => `${apiBase.replace(/\/$/u, '')}${path}`;
  const load = () => storage.getStorageSync(SESSION_KEY) || null;
  const save = (session) => {
    storage.setStorageSync(SESSION_KEY, session);
    return session;
  };
  const clear = () => storage.removeStorageSync(SESSION_KEY);

  async function rawRequest(options) {
    const response = await transport.request(options);
    if (response.statusCode < 200 || response.statusCode >= 300) throw responseError(response);
    return response.data;
  }

  async function exchange(provider, assertion) {
    return save(
      await rawRequest({
        url: apiUrl('/api/v1/life/auth/sessions/exchange'),
        method: 'POST',
        data: { provider, assertion, deviceId: deviceId(storage) },
      }),
    );
  }

  async function requestMobileOtp(mobile) {
    return rawRequest({
      url: apiUrl('/api/v1/life/auth/mobile-otp/challenges'),
      method: 'POST',
      data: { mobile, deviceId: deviceId(storage) },
    });
  }

  async function exchangeMobileOtp(challengeId, code) {
    return save(
      await rawRequest({
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
    loginWithWechat,
    logout,
  };
}

export const lifeSession = createLifeSessionClient();
