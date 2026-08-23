import { describe, expect, it } from 'vitest';
import { lifeSurfaceContract, lifeSurfaceState } from './surface-contract.js';

describe('乐趣生活 UniApp surface contract', () => {
  it('binds every frozen top-level tab to authoritative V6 endpoints', () => {
    expect(Object.keys(lifeSurfaceContract)).toEqual(['life', 'mall', 'community', 'cart', 'me']);
    expect(lifeSurfaceContract.cart.write).toContain('/api/v1/life/cart/items');
    expect(lifeSurfaceContract.cart.write).toContain('/api/v1/life/checkouts/quote');
    expect(lifeSurfaceContract.me.read).toContain('/api/v1/life/orders');
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
