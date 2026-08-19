export type VoucherMerchantMode = 'ZERO' | 'COMMISSION';

export interface VoucherPolicySnapshot {
  version: 1;
  merchantMode: VoucherMerchantMode;
  commissionBasis: 'ORDER_ORIGINAL_PRICE';
  commissionBps: number;
  consumerRewardShareBps: number;
  merchantRewardShareBps: number;
  accelerationShareBps: 2000;
  settlementEntityId: string;
  effectiveAt: string;
}

export interface VoucherLedgerLine {
  id: string;
  accountId: string;
  amountMinorUnits: bigint;
}

function rewardShare(commissionBps: number): number {
  if (!Number.isInteger(commissionBps) || commissionBps % 100 !== 0) {
    throw new RangeError('voucher commission rate must be a whole percentage');
  }
  if (commissionBps >= 300 && commissionBps <= 600) return 1800;
  if (commissionBps >= 700 && commissionBps <= 1400) return 2000;
  if (commissionBps >= 1500 && commissionBps <= 10_000) return 2500;
  throw new RangeError('voucher commission rate is outside the frozen tiers');
}

export function snapshotVoucherPolicy(input: {
  merchantMode: VoucherMerchantMode;
  commissionBps: number;
  settlementEntityId: string;
  effectiveAt: string;
}): VoucherPolicySnapshot {
  if (!input.settlementEntityId) throw new Error('one settlement entity is required');
  const share = input.merchantMode === 'ZERO' ? 0 : rewardShare(input.commissionBps);
  if (input.merchantMode === 'ZERO' && input.commissionBps !== 0) {
    throw new RangeError('ZERO merchants cannot carry a commission rate');
  }
  return {
    version: 1,
    merchantMode: input.merchantMode,
    commissionBasis: 'ORDER_ORIGINAL_PRICE',
    commissionBps: input.commissionBps,
    consumerRewardShareBps: share,
    merchantRewardShareBps: share,
    accelerationShareBps: 2000,
    settlementEntityId: input.settlementEntityId,
    effectiveAt: input.effectiveAt,
  };
}

export function calculateVoucherCommission(
  orderOriginalPriceMinorUnits: bigint,
  snapshot: VoucherPolicySnapshot,
): bigint {
  if (orderOriginalPriceMinorUnits < 0n)
    throw new RangeError('order original price cannot be negative');
  return (orderOriginalPriceMinorUnits * BigInt(snapshot.commissionBps)) / 10_000n;
}

export function reverseVoucherLines(
  originalLines: readonly VoucherLedgerLine[],
  reversalId: (originalId: string) => string,
): Array<VoucherLedgerLine & { reversesLineId: string }> {
  return originalLines.map((line) => ({
    id: reversalId(line.id),
    accountId: line.accountId,
    amountMinorUnits: -line.amountMinorUnits,
    reversesLineId: line.id,
  }));
}
