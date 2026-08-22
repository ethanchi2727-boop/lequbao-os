export type CostStatus = 'PROVISIONAL' | 'ACTUAL' | 'REVERSED';

export interface DirectCostLine {
  amountMinorUnits: bigint;
  status: CostStatus;
}

export interface StatementCalculationInput {
  actualReceiptMinorUnits: bigint;
  refundMinorUnits: bigint;
  directCosts: readonly DirectCostLine[];
}

export interface StatementCalculation {
  actualReceiptMinorUnits: bigint;
  refundMinorUnits: bigint;
  directCostMinorUnits: bigint;
  distributableMinorUnits: bigint;
  readyToLock: boolean;
}

export interface AllocationParticipant {
  key: string;
  shareBps: number;
}

export interface ExactAllocation extends AllocationParticipant {
  allocatedMinorUnits: bigint;
}

export function calculateStatement(input: StatementCalculationInput): StatementCalculation {
  if (input.actualReceiptMinorUnits < 0n || input.refundMinorUnits < 0n) {
    throw new RangeError('receipt and refund amounts cannot be negative');
  }
  if (input.directCosts.some((cost) => cost.amountMinorUnits < 0n)) {
    throw new RangeError('direct costs cannot be negative');
  }

  const currentCosts = input.directCosts.filter((cost) => cost.status !== 'REVERSED');
  const directCostMinorUnits = currentCosts.reduce((sum, cost) => sum + cost.amountMinorUnits, 0n);
  const rawDistributable =
    input.actualReceiptMinorUnits - input.refundMinorUnits - directCostMinorUnits;

  return {
    actualReceiptMinorUnits: input.actualReceiptMinorUnits,
    refundMinorUnits: input.refundMinorUnits,
    directCostMinorUnits,
    distributableMinorUnits: rawDistributable > 0n ? rawDistributable : 0n,
    readyToLock: currentCosts.every((cost) => cost.status === 'ACTUAL'),
  };
}

export function allocateExactly(
  distributableMinorUnits: bigint,
  participants: readonly AllocationParticipant[],
  residualRecipientKey?: string,
): ExactAllocation[] {
  if (distributableMinorUnits < 0n) throw new RangeError('distributable amount cannot be negative');
  if (participants.length === 0) throw new RangeError('at least one participant is required');
  if (new Set(participants.map((participant) => participant.key)).size !== participants.length) {
    throw new RangeError('allocation participant keys must be unique');
  }
  if (
    participants.some(
      (participant) => !Number.isInteger(participant.shareBps) || participant.shareBps <= 0,
    )
  ) {
    throw new RangeError('allocation shares must be positive integer basis points');
  }
  const totalBps = participants.reduce((sum, participant) => sum + participant.shareBps, 0);
  if (totalBps !== 10_000)
    throw new RangeError(`allocation shares must total 10000 bps, got ${totalBps}`);

  const denominator = 10_000n;
  const provisional = participants.map((participant) => {
    const numerator = distributableMinorUnits * BigInt(participant.shareBps);
    return {
      ...participant,
      allocatedMinorUnits: numerator / denominator,
      remainder: numerator % denominator,
    };
  });
  let remaining =
    distributableMinorUnits -
    provisional.reduce((sum, allocation) => sum + allocation.allocatedMinorUnits, 0n);
  if (residualRecipientKey) {
    const residualRecipient = provisional.find(
      (allocation) => allocation.key === residualRecipientKey,
    );
    if (!residualRecipient)
      throw new RangeError('residual recipient must be an allocation participant');
    residualRecipient.allocatedMinorUnits += remaining;
  } else {
    const remainderOrder = [...provisional].sort(
      (left, right) =>
        Number(right.remainder - left.remainder) || left.key.localeCompare(right.key),
    );
    for (const allocation of remainderOrder) {
      if (remaining === 0n) break;
      allocation.allocatedMinorUnits += 1n;
      remaining -= 1n;
    }
  }

  return provisional.map(({ key, shareBps, allocatedMinorUnits }) => ({
    key,
    shareBps,
    allocatedMinorUnits,
  }));
}

export function assertLockableAndReconciled(
  statement: StatementCalculation,
  allocations: readonly ExactAllocation[],
): void {
  if (!statement.readyToLock) throw new Error('statement still contains provisional costs');
  const allocated = allocations.reduce(
    (sum, allocation) => sum + allocation.allocatedMinorUnits,
    0n,
  );
  if (allocated !== statement.distributableMinorUnits) {
    throw new Error(
      `allocation mismatch: expected ${statement.distributableMinorUnits}, allocated ${allocated}`,
    );
  }
}
