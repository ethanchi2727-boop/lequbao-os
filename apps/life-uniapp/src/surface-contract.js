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
});

export function lifeSurfaceState({ loading = false, error, records } = {}) {
  if (loading) return 'loading';
  if (error?.status === 401) return 'unauthenticated';
  if (error?.status === 403) return 'forbidden';
  if (error) return 'recoverable-error';
  if (Array.isArray(records) && records.length === 0) return 'empty';
  return 'ready';
}
