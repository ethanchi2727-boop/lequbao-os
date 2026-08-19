import { describe, expect, it } from 'vitest';
import {
  COMPUTE_PACK_POLICY_V1,
  SUBSCRIPTION_POLICY_V1,
  allocateComputePackRevenue,
  allocateSubscriptionRevenue,
  snapshotComputePackPolicy,
} from './revenue-policy.js';

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
    [99n, [69n, 9n, 21n]],
    [1n, [0n, 0n, 1n]],
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

describe('frozen compute-pack policy v1', () => {
  it('uses 50/30/20 without a regional provider and 50/30/10/10 with one', () => {
    expect(COMPUTE_PACK_POLICY_V1.withoutRegionalProvider.map((item) => item.shareBps)).toEqual([
      5000, 3000, 2000,
    ]);
    expect(COMPUTE_PACK_POLICY_V1.withRegionalProvider.map((item) => item.shareBps)).toEqual([
      5000, 3000, 1000, 1000,
    ]);
  });

  it('freezes provider eligibility at purchase and never changes an existing snapshot', () => {
    const without = snapshotComputePackPolicy({ purchasedAt: '2026-08-01T00:00:00+08:00' });
    const withRegion = snapshotComputePackPolicy({
      purchasedAt: '2026-08-02T00:00:00+08:00',
      regionalProviderId: 'provider-1',
    });
    expect(without.policyType).toBe('COMPUTE_PACK_WITHOUT_REGION');
    expect(without.regionalProviderId).toBeNull();
    expect(withRegion.policyType).toBe('COMPUTE_PACK_WITH_REGION');
    expect(withRegion.regionalProviderId).toBe('provider-1');
  });

  it('floors losses at zero and reconciles every positive minor unit', () => {
    expect(
      allocateComputePackRevenue(-1n, snapshotComputePackPolicy({ purchasedAt: 'x' })),
    ).toEqual([
      { beneficiaryRole: 'LEQUBAO', shareBps: 5000, allocatedMinorUnits: 0n },
      { beneficiaryRole: 'ORIGINATING_BUSINESS', shareBps: 3000, allocatedMinorUnits: 0n },
      { beneficiaryRole: 'SHANGZHI', shareBps: 2000, allocatedMinorUnits: 0n },
    ]);
    const allocations = allocateComputePackRevenue(
      99n,
      snapshotComputePackPolicy({ purchasedAt: 'x', regionalProviderId: 'provider-1' }),
    );
    expect(allocations.reduce((sum, item) => sum + item.allocatedMinorUnits, 0n)).toBe(99n);
    expect(
      allocations.find((item) => item.beneficiaryRole === 'LEQUBAO')?.allocatedMinorUnits,
    ).toBe(52n);
  });
});
