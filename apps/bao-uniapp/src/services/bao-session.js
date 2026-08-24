/* global uni */

const SESSION_KEY = 'lequ.bao.employee.session.v1';
const DEVICE_KEY = 'lequ.bao.employee.device.v1';

const uniRuntime = {
  getStorageSync: (key) => uni.getStorageSync(key),
  setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: (key) => uni.removeStorageSync(key),
  request: (options) => uni.request(options),
  login: (options) => uni.login(options),
};

export const baoRuntimeProfile = Object.freeze({
  previewData: import.meta.env.VITE_LEQU_PREVIEW_DATA === '1',
  developmentMocks: import.meta.env.VITE_LEQU_DEVELOPMENT_MOCKS === '1',
});

function deviceId(storage) {
  const existing = storage.getStorageSync(DEVICE_KEY);
  if (typeof existing === 'string' && existing.length >= 16) return existing;
  const generated = `bao-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  storage.setStorageSync(DEVICE_KEY, generated);
  return generated;
}

function responseError(response) {
  const error = new Error(response?.data?.code ?? `HTTP_${response?.statusCode ?? 0}`);
  error.status = response?.statusCode ?? 0;
  error.code = response?.data?.code ?? 'REQUEST_FAILED';
  return error;
}

export function createBaoSessionClient({
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
  async function raw(options) {
    const response = await transport.request(options);
    if (response.statusCode < 200 || response.statusCode >= 300) throw responseError(response);
    return response.data;
  }
  async function exchange(assertion) {
    return save(
      await raw({
        url: apiUrl('/api/v1/auth/sessions/exchange'),
        method: 'POST',
        data: { provider: 'ENTERPRISE_WECOM', assertion, deviceId: deviceId(storage) },
      }),
    );
  }
  async function refresh() {
    const session = load();
    if (!session?.refreshToken || !session?.identity) throw responseError({ statusCode: 401 });
    try {
      return save(
        await raw({
          url: apiUrl('/api/v1/auth/sessions/refresh'),
          method: 'POST',
          data: {
            tenantId: session.identity.tenantId,
            userId: session.identity.userId,
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
  async function switchTenant(tenantId) {
    const session = load();
    if (!session?.accessToken) throw responseError({ statusCode: 401 });
    const next = await raw({
      url: apiUrl('/api/v1/auth/sessions/switch-tenant'),
      method: 'POST',
      data: { tenantId, deviceId: deviceId(storage) },
      header: { Authorization: `Bearer ${session.accessToken}` },
    });
    return save(next);
  }
  async function request(path, options = {}, retry = true) {
    const session = load();
    if (!session?.accessToken) throw responseError({ statusCode: 401 });
    try {
      return await raw({
        url: apiUrl(path),
        method: options.method ?? 'GET',
        data: options.data,
        header: {
          ...options.header,
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch (error) {
      if (error.status !== 401 || !retry) throw error;
      const rotated = await refresh();
      return raw({
        url: apiUrl(path),
        method: options.method ?? 'GET',
        data: options.data,
        header: {
          ...options.header,
          Authorization: `Bearer ${rotated.accessToken}`,
        },
      });
    }
  }
  async function loginWithWecom() {
    const result = await transport.login({ provider: 'weixin' });
    if (!result?.code) throw new Error('WECOM_LOGIN_UNAVAILABLE');
    return exchange(result.code);
  }
  async function logout() {
    try {
      if (load()?.accessToken)
        await request('/api/v1/auth/sessions/revoke', {
          method: 'POST',
          data: { reason: 'USER_LOGOUT' },
        });
    } finally {
      clear();
    }
  }
  return { load, clear, exchange, refresh, switchTenant, request, loginWithWecom, logout };
}

export const baoSession = createBaoSessionClient();
