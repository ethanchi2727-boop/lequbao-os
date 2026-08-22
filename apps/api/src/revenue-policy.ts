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

export const COMPUTE_PACK_POLICY_V1 = Object.freeze({
  withoutRegionalProvider: Object.freeze([
    { beneficiaryRole: 'LEQUBAO' as const, shareBps: 5000 },
    { beneficiaryRole: 'ORIGINATING_BUSINESS' as const, shareBps: 3000 },
    { beneficiaryRole: 'SHANGZHI' as const, shareBps: 2000 },
  ]),
  withRegionalProvider: Object.freeze([
    { beneficiaryRole: 'LEQUBAO' as const, shareBps: 5000 },
    { beneficiaryRole: 'ORIGINATING_BUSINESS' as const, shareBps: 3000 },
    { beneficiaryRole: 'SHANGZHI' as const, shareBps: 1000 },
    { beneficiaryRole: 'REGIONAL_PROVIDER' as const, shareBps: 1000 },
  ]),
});

export type ComputePackBeneficiaryRole =
  'LEQUBAO' | 'ORIGINATING_BUSINESS' | 'SHANGZHI' | 'REGIONAL_PROVIDER';

export interface ComputePackPolicySnapshot {
  policyType: 'COMPUTE_PACK_WITH_REGION' | 'COMPUTE_PACK_WITHOUT_REGION';
  policyVersion: 1;
  regionalProviderId: string | null;
  purchasedAt: string;
  splits: readonly { beneficiaryRole: ComputePackBeneficiaryRole; shareBps: number }[];
}

export function snapshotComputePackPolicy(input: {
  purchasedAt: string;
  regionalProviderId?: string;
}): ComputePackPolicySnapshot {
  const withRegion = Boolean(input.regionalProviderId);
  return {
    policyType: withRegion ? 'COMPUTE_PACK_WITH_REGION' : 'COMPUTE_PACK_WITHOUT_REGION',
    policyVersion: 1,
    regionalProviderId: input.regionalProviderId ?? null,
    purchasedAt: input.purchasedAt,
    splits: withRegion
      ? COMPUTE_PACK_POLICY_V1.withRegionalProvider
      : COMPUTE_PACK_POLICY_V1.withoutRegionalProvider,
  };
}

export function allocateComputePackRevenue(
  netProfitMinorUnits: bigint,
  snapshot: ComputePackPolicySnapshot,
) {
  return allocateExactly(
    netProfitMinorUnits > 0n ? netProfitMinorUnits : 0n,
    snapshot.splits.map((split) => ({ key: split.beneficiaryRole, shareBps: split.shareBps })),
    'LEQUBAO',
  ).map(({ key, ...allocation }) => ({
    beneficiaryRole: key as ComputePackBeneficiaryRole,
    ...allocation,
  }));
}

export function allocateSubscriptionRevenue(distributableMinorUnits: bigint): RevenueAllocation[] {
  return allocateExactly(
    distributableMinorUnits,
    SUBSCRIPTION_POLICY_V1.splits.map((split) => ({
      key: split.beneficiaryRole,
      shareBps: split.shareBps,
    })),
    'LEQU_LIFE',
  ).map(({ key, shareBps, allocatedMinorUnits }) => ({
    beneficiaryRole: key as SubscriptionBeneficiaryRole,
    shareBps,
    allocatedMinorUnits,
  }));
}
import { allocateExactly } from './revenue-distribution.js';
