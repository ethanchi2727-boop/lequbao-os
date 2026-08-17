export const SUBSCRIPTION_POLICY_V1 = Object.freeze({
  policyType: 'SUBSCRIPTION' as const,
  version: 1,
  costBasis: 'DIRECT_ACTUAL_COST' as const,
  splits: Object.freeze([
    { beneficiaryRole: 'ORIGINATING_BUSINESS' as const, shareBps: 7000 },
    { beneficiaryRole: 'SHANGZHI' as const, shareBps: 1000 },
    { beneficiaryRole: 'LEQU_LIFE' as const, shareBps: 2000 },
  ]),
});

export type SubscriptionBeneficiaryRole =
  (typeof SUBSCRIPTION_POLICY_V1.splits)[number]['beneficiaryRole'];

export interface RevenueAllocation {
  beneficiaryRole: SubscriptionBeneficiaryRole;
  shareBps: number;
  allocatedMinorUnits: bigint;
}

export function allocateSubscriptionRevenue(distributableMinorUnits: bigint): RevenueAllocation[] {
  if (distributableMinorUnits < 0n)
    throw new RangeError('distributable revenue cannot be negative');

  const denominator = 10_000n;
  const provisional = SUBSCRIPTION_POLICY_V1.splits.map((split) => {
    const numerator = distributableMinorUnits * BigInt(split.shareBps);
    return {
      ...split,
      allocatedMinorUnits: numerator / denominator,
      remainder: numerator % denominator,
    };
  });
  let undistributed =
    distributableMinorUnits -
    provisional.reduce((sum, allocation) => sum + allocation.allocatedMinorUnits, 0n);

  const remainderOrder = [...provisional].sort(
    (left, right) =>
      Number(right.remainder - left.remainder) ||
      left.beneficiaryRole.localeCompare(right.beneficiaryRole),
  );
  for (const allocation of remainderOrder) {
    if (undistributed === 0n) break;
    allocation.allocatedMinorUnits += 1n;
    undistributed -= 1n;
  }

  return provisional.map(({ beneficiaryRole, shareBps, allocatedMinorUnits }) => ({
    beneficiaryRole,
    shareBps,
    allocatedMinorUnits,
  }));
}
