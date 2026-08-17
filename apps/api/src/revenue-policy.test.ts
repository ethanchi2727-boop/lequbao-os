import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_POLICY_V1, allocateSubscriptionRevenue } from './revenue-policy.js';

describe('frozen subscription revenue policy v1', () => {
  it('is exactly 70/10/20 and totals 100 percent', () => {
    expect(SUBSCRIPTION_POLICY_V1.splits).toEqual([
      { beneficiaryRole: 'ORIGINATING_BUSINESS', shareBps: 7000 },
      { beneficiaryRole: 'SHANGZHI', shareBps: 1000 },
      { beneficiaryRole: 'LEQU_LIFE', shareBps: 2000 },
    ]);
    expect(SUBSCRIPTION_POLICY_V1.splits.reduce((sum, split) => sum + split.shareBps, 0)).toBe(
      10_000,
    );
  });

  it.each([
    [100n, [70n, 10n, 20n]],
    [99n, [69n, 10n, 20n]],
    [1n, [1n, 0n, 0n]],
    [0n, [0n, 0n, 0n]],
  ])('allocates %s minor units without losing a cent', (amount, expected) => {
    const allocations = allocateSubscriptionRevenue(amount);
    expect(allocations.map((allocation) => allocation.allocatedMinorUnits)).toEqual(expected);
    expect(allocations.reduce((sum, allocation) => sum + allocation.allocatedMinorUnits, 0n)).toBe(
      amount,
    );
  });

  it('rejects negative distributable revenue', () => {
    expect(() => allocateSubscriptionRevenue(-1n)).toThrow(RangeError);
  });
});
