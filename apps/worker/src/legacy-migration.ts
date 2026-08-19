import { createHash } from 'node:crypto';

export type LegacyCombinedState =
  | 'UNPAID'
  | 'PAID'
  | 'PAID_PARTIAL_USED'
  | 'PAID_PARTIAL_USED_REFUNDING'
  | 'PAID_USED'
  | 'CANCELLED'
  | 'UNKNOWN';
export function splitLegacyState(state: LegacyCombinedState) {
  const states = {
    UNPAID: {
      order: 'PENDING_PAYMENT',
      payment: 'CREATED',
      verification: 'NOT_APPLICABLE',
      refund: 'NOT_REQUESTED',
    },
    PAID: {
      order: 'PAID',
      payment: 'SUCCEEDED',
      verification: 'AVAILABLE',
      refund: 'NOT_REQUESTED',
    },
    PAID_PARTIAL_USED: {
      order: 'FULFILLING',
      payment: 'SUCCEEDED',
      verification: 'PARTIALLY_USED',
      refund: 'NOT_REQUESTED',
    },
    PAID_PARTIAL_USED_REFUNDING: {
      order: 'FULFILLING',
      payment: 'SUCCEEDED',
      verification: 'PARTIALLY_USED',
      refund: 'PROCESSING',
    },
    PAID_USED: {
      order: 'COMPLETED',
      payment: 'SUCCEEDED',
      verification: 'USED',
      refund: 'NOT_REQUESTED',
    },
    CANCELLED: {
      order: 'CANCELLED',
      payment: 'FAILED',
      verification: 'NOT_APPLICABLE',
      refund: 'NOT_REQUESTED',
    },
  } as const;
  return state === 'UNKNOWN'
    ? { reviewRequired: true as const }
    : { ...states[state], reviewRequired: false as const };
}

export function safeLegacyIdentity(input: {
  sourceId: string;
  ownershipEvidence?: string;
  requestedRole?: string;
}) {
  if (!input.ownershipEvidence)
    return {
      sourceId: input.sourceId,
      status: 'DISABLED' as const,
      roles: [],
      reviewReason: 'OWNERSHIP_UNPROVEN',
    };
  return {
    sourceId: input.sourceId,
    status: 'ACTIVE' as const,
    roles:
      input.requestedRole && input.requestedRole !== 'MERCHANT_OWNER' ? [input.requestedRole] : [],
    reviewReason:
      input.requestedRole === 'MERCHANT_OWNER'
        ? 'OWNER_ROLE_REQUIRES_SEPARATE_CONFIRMATION'
        : undefined,
  };
}
export function safeLegacyConsent(input: {
  purpose: string;
  granted: boolean;
  evidenceRef?: string;
  occurredAt?: string;
}) {
  return input.granted && input.evidenceRef && input.occurredAt
    ? {
        migrate: true as const,
        purpose: input.purpose,
        evidenceRef: input.evidenceRef,
        occurredAt: input.occurredAt,
      }
    : { migrate: false as const, reviewReason: 'CONSENT_EVIDENCE_MISSING' };
}
export type MoneySummary = {
  orderPayableCents: bigint;
  providerPaidCents: bigint;
  refundCents: bigint;
  rewardGrantedCents: bigint;
  rewardUsedCents: bigint;
  rewardReversedCents: bigint;
  verificationCount: bigint;
};
export function reconcileMoney(source: MoneySummary, target: MoneySummary) {
  const keys = Object.keys(source) as (keyof MoneySummary)[];
  const differences = Object.fromEntries(keys.map((k) => [k, (target[k] - source[k]).toString()]));
  return { balanced: keys.every((k) => target[k] === source[k]), differences };
}
export function canonicalHash(value: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)),
    )
    .digest('hex');
}

export interface MigrationBatchStore<T> {
  loadCursor(entityType: string): Promise<{ lastSourceId?: string; batchNumber: number }>;
  readAfter(cursor: string | undefined, limit: number): Promise<T[]>;
  sourceId(row: T): string;
  transform(
    row: T,
  ): Promise<{ targetId: string; value: unknown } | { reviewReason: string; safeAction: string }>;
  writeMapped(input: {
    sourceId: string;
    sourceHash: string;
    targetId: string;
    targetHash: string;
    value: unknown;
  }): Promise<'CREATED' | 'EXACT_REPLAY'>;
  writeReview(input: { sourceId: string; reasonCode: string; safeAction: string }): Promise<void>;
  saveCursor(input: {
    lastSourceId: string;
    batchNumber: number;
    processedCount: number;
    inputHash: string;
    outputHash: string;
  }): Promise<void>;
}
export async function runMigrationBatch<T>(input: {
  entityType: string;
  limit: number;
  store: MigrationBatchStore<T>;
}) {
  const cursor = await input.store.loadCursor(input.entityType);
  const rows = await input.store.readAfter(cursor.lastSourceId, input.limit);
  const outputs: unknown[] = [];
  for (const row of rows) {
    const sourceId = input.store.sourceId(row),
      transformed = await input.store.transform(row);
    if ('reviewReason' in transformed) {
      await input.store.writeReview({
        sourceId,
        reasonCode: transformed.reviewReason,
        safeAction: transformed.safeAction,
      });
      outputs.push({ sourceId, review: transformed.reviewReason });
    } else {
      await input.store.writeMapped({
        sourceId,
        sourceHash: canonicalHash(row),
        targetId: transformed.targetId,
        targetHash: canonicalHash(transformed.value),
        value: transformed.value,
      });
      outputs.push({ sourceId, targetId: transformed.targetId });
    }
  }
  if (rows.length) {
    await input.store.saveCursor({
      lastSourceId: input.store.sourceId(rows.at(-1)!),
      batchNumber: cursor.batchNumber + 1,
      processedCount: rows.length,
      inputHash: canonicalHash(rows),
      outputHash: canonicalHash(outputs),
    });
  }
  return {
    processed: rows.length,
    complete: rows.length < input.limit,
    lastSourceId: rows.length ? input.store.sourceId(rows.at(-1)!) : cursor.lastSourceId,
  };
}
