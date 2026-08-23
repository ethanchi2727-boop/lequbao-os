export class LifeApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'LifeApiError';
    this.status = status;
  }
}

export function createLifeApi({ origin = location.origin, token } = {}) {
  const expectedOrigin = new URL(origin).origin;
  async function request(path) {
    const target = new URL(path, expectedOrigin);
    if (target.origin !== expectedOrigin) throw new LifeApiError('拒绝跨域消费者请求');
    if (!token) throw new LifeApiError('需要消费者会话', 401);
    const response = await fetch(target, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) throw new LifeApiError(`请求失败 (${response.status})`, response.status);
    return response.json();
  }
  return {
    products: (productType) =>
      request(`/api/v1/consumer/products?productType=${encodeURIComponent(productType)}&limit=20`),
    storefront: () => request('/api/v1/consumer/storefront'),
  };
}
