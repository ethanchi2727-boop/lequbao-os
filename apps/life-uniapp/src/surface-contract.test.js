import { describe, expect, it } from 'vitest';
import { lifeSurfaceContract, lifeSurfaceState } from './surface-contract.js';

describe('乐趣生活 UniApp surface contract', () => {
  it('binds every frozen top-level tab to authoritative V6 endpoints', () => {
    expect(Object.keys(lifeSurfaceContract)).toEqual([
      'life',
      'mall',
      'community',
      'cart',
      'me',
      'page198',
      'page200',
      'page201',
      'page203',
      'page204',
      'page207',
      'page209',
      'page210',
      'page211',
      'page213',
      'page216',
      'page218',
      'page221',
      'page224',
      'page227',
      'page228',
      'page229',
      'page231',
      'page232',
      'page235',
      'page237',
      'page238',
      'page239',
      'page240',
    ]);
    expect(lifeSurfaceContract.cart.write).toContain('/api/v1/life/cart/items');
    expect(lifeSurfaceContract.cart.write).toContain('/api/v1/life/checkouts/quote');
    expect(lifeSurfaceContract.me.read).toContain('/api/v1/life/orders');
    expect(lifeSurfaceContract.page201.write).toContain('/api/v1/life/cart/items');
    expect(lifeSurfaceContract.page204.read).toContain('/api/v1/life/discovery/stores');
    expect(lifeSurfaceContract.page209.read).toContain(
      '/api/v1/life/discovery/products/{productId}',
    );
    expect(lifeSurfaceContract.page211.read).toContain(
      '/api/v1/life/discovery/products/{productId}/trace-report',
    );
    expect(lifeSurfaceContract.page227.write).toContain('/api/v1/life/checkouts/quote');
    expect(lifeSurfaceContract.page218.read).toContain('/api/v1/life/discovery/stores');
    expect(lifeSurfaceContract.page231.write).toContain('/api/v1/life/payment-intents');
    expect(lifeSurfaceContract.page238.write).toContain('/api/v1/life/orders/{orderId}/refunds');
  });

  it.each([
    [{ loading: true }, 'loading'],
    [{ error: { status: 401 } }, 'unauthenticated'],
    [{ error: { status: 403 } }, 'forbidden'],
    [{ error: { status: 503 } }, 'recoverable-error'],
    [{ records: [] }, 'empty'],
    [{ records: [{}] }, 'ready'],
  ])('classifies UI state without treating errors as empty data', (input, expected) => {
    expect(lifeSurfaceState(input)).toBe(expected);
  });
});
