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
  return allocateExactly(
    distributableMinorUnits,
    SUBSCRIPTION_POLICY_V1.splits.map((split) => ({
      key: split.beneficiaryRole,
      shareBps: split.shareBps,
    })),
  ).map(({ key, shareBps, allocatedMinorUnits }) => ({
    beneficiaryRole: key as SubscriptionBeneficiaryRole,
    shareBps,
    allocatedMinorUnits,
  }));
}
import { allocateExactly } from './revenue-distribution.js';
