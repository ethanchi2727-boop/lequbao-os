export const lifeSurfaceContract = Object.freeze({
  life: Object.freeze({
    read: ['/api/v1/life/discovery/stores', '/api/v1/life/discovery/products'],
    write: ['/api/v1/life/cart/items'],
  }),
  mall: Object.freeze({
    read: ['/api/v1/life/discovery/products'],
    write: ['/api/v1/life/cart/items'],
  }),
  community: Object.freeze({
    read: ['/api/v1/life/discovery/stores', '/api/v1/life/discovery/products'],
    write: ['/api/v1/life/cart/items'],
  }),
  cart: Object.freeze({
    read: ['/api/v1/life/cart', '/api/v1/life/addresses'],
    write: [
      '/api/v1/life/cart/items',
      '/api/v1/life/cart/items/{itemId}',
      '/api/v1/life/checkouts/quote',
      '/api/v1/life/checkouts/{checkoutId}/actions/submit',
    ],
  }),
  me: Object.freeze({
    read: [
      '/api/v1/consumer/membership',
      '/api/v1/life/orders',
      '/api/v1/life/orders/{orderId}/aftercare',
      '/api/v1/life/addresses',
      '/api/v1/life/invoice-profiles',
      '/api/v1/life/rewards',
      '/api/v1/life/verification-entitlements',
    ],
    write: [
      '/api/v1/life/payment-intents',
      '/api/v1/life/orders/{orderId}/refunds',
      '/api/v1/life/addresses',
      '/api/v1/life/addresses/{addressId}',
      '/api/v1/life/invoice-profiles',
      '/api/v1/life/invoice-profiles/{profileId}',
    ],
  }),
  page198: Object.freeze({ read: ['/api/v1/life/discovery/stores'] }),
  page200: Object.freeze({ read: [] }),
  page201: Object.freeze({
    read: ['/api/v1/life/discovery/products'],
    write: ['/api/v1/life/cart/items'],
  }),
  page203: Object.freeze({ read: [] }),
  page204: Object.freeze({
    read: ['/api/v1/life/discovery/products', '/api/v1/life/discovery/stores'],
    write: ['/api/v1/life/cart/items'],
  }),
  page207: Object.freeze({
    read: ['/api/v1/life/discovery/products'],
    write: ['/api/v1/life/cart/items'],
  }),
  page209: Object.freeze({
    read: ['/api/v1/life/discovery/products/{productId}'],
    write: ['/api/v1/life/cart/items'],
  }),
  page210: Object.freeze({
    read: ['/api/v1/life/discovery/products/{productId}'],
    write: ['/api/v1/life/cart/items'],
  }),
  page211: Object.freeze({
    read: ['/api/v1/life/discovery/products/{productId}/trace-report'],
  }),
  page213: Object.freeze({
    read: ['/api/v1/life/discovery/products'],
    write: ['/api/v1/life/cart/items'],
  }),
  page216: Object.freeze({ read: ['/api/v1/life/discovery/stores'] }),
  page218: Object.freeze({
    read: ['/api/v1/life/discovery/stores', '/api/v1/life/discovery/products'],
  }),
  page221: Object.freeze({
    read: ['/api/v1/life/discovery/products/{productId}'],
    write: ['/api/v1/life/cart/items'],
  }),
  page224: Object.freeze({
    read: ['/api/v1/life/cart'],
    write: ['/api/v1/life/cart/items/{itemId}'],
  }),
  page227: Object.freeze({
    read: ['/api/v1/life/cart', '/api/v1/life/addresses'],
    write: ['/api/v1/life/checkouts/quote'],
  }),
  page228: Object.freeze({ read: ['/api/v1/life/rewards'] }),
  page229: Object.freeze({
    read: ['/api/v1/life/cart', '/api/v1/life/addresses'],
    write: ['/api/v1/life/checkouts/{checkoutId}/actions/submit'],
  }),
  page231: Object.freeze({
    read: ['/api/v1/life/orders/{orderId}'],
    write: ['/api/v1/life/payment-intents'],
  }),
  page232: Object.freeze({ read: ['/api/v1/life/orders/{orderId}'] }),
  page235: Object.freeze({
    read: ['/api/v1/consumer/membership', '/api/v1/life/rewards'],
  }),
  page237: Object.freeze({ read: ['/api/v1/life/orders'] }),
  page238: Object.freeze({
    read: ['/api/v1/life/orders/{orderId}'],
    write: ['/api/v1/life/orders/{orderId}/refunds'],
  }),
  page239: Object.freeze({ read: ['/api/v1/life/orders/{orderId}/aftercare'] }),
  page240: Object.freeze({ read: ['/api/v1/life/orders/{orderId}/aftercare'] }),
  page219: Object.freeze({ read: ['/api/v1/life/discovery/stores'] }),
  page242: Object.freeze({ read: ['/api/v1/life/verification-entitlements'] }),
  page243: Object.freeze({
    read: ['/api/v1/life/orders/{orderId}/verification-entitlements'],
  }),
  page245: Object.freeze({
    read: ['/api/v1/life/orders/{orderId}'],
    write: ['/api/v1/life/orders/{orderId}/refunds'],
  }),
  page246: Object.freeze({ read: ['/api/v1/life/orders/{orderId}/aftercare'] }),
  page248: Object.freeze({
    read: ['/api/v1/life/addresses'],
    write: ['/api/v1/life/addresses', '/api/v1/life/addresses/{addressId}'],
  }),
  page250: Object.freeze({
    read: ['/api/v1/life/invoice-profiles'],
    write: ['/api/v1/life/invoice-profiles', '/api/v1/life/invoice-profiles/{profileId}'],
  }),
  page252: Object.freeze({ read: ['/api/v1/life/rewards'] }),
  page254: Object.freeze({ read: [], blockedBy: 'MERCHANT_CONSUMER_SESSION_REQUIRED' }),
  page255: Object.freeze({ read: [], blockedBy: 'MERCHANT_CONSUMER_SESSION_REQUIRED' }),
  page258: Object.freeze({ read: [], blockedBy: 'MERCHANT_CONSUMER_SESSION_REQUIRED' }),
  page259: Object.freeze({ read: ['/api/v1/life/orders'] }),
  page262: Object.freeze({ read: [], blockedBy: 'MERCHANT_CONSUMER_SESSION_REQUIRED' }),
  page264: Object.freeze({ read: [], blockedBy: 'MERCHANT_CONSUMER_SESSION_REQUIRED' }),
});

export function lifeSurfaceState({ loading = false, error, records } = {}) {
  if (loading) return 'loading';
  if (error?.status === 401) return 'unauthenticated';
  if (error?.status === 403) return 'forbidden';
  if (error) return 'recoverable-error';
  if (Array.isArray(records) && records.length === 0) return 'empty';
  return 'ready';
}
