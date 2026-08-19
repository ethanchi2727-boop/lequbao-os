import { describe, expect, it, vi } from 'vitest';
import {
  reconcileMoney,
  runMigrationBatch,
  safeLegacyConsent,
  safeLegacyIdentity,
  splitLegacyState,
} from './legacy-migration.js';
describe('legacy migration safety', () => {
  it('splits combined paid partial-use refund state without guessing', () => {
    expect(splitLegacyState('PAID_PARTIAL_USED_REFUNDING')).toEqual({
      order: 'FULFILLING',
      payment: 'SUCCEEDED',
      verification: 'PARTIALLY_USED',
      refund: 'PROCESSING',
      reviewRequired: false,
    });
    expect(splitLegacyState('UNKNOWN')).toEqual({ reviewRequired: true });
  });
  it('omits marketing consent without evidence and disables ambiguous accounts', () => {
    expect(safeLegacyConsent({ purpose: 'MARKETING', granted: true }).migrate).toBe(false);
    expect(safeLegacyIdentity({ sourceId: 'u1', requestedRole: 'MERCHANT_OWNER' })).toMatchObject({
      status: 'DISABLED',
      roles: [],
    });
  });
  it('requires zero differences across every financial dimension', () => {
    const summary = {
      orderPayableCents: 1n,
      providerPaidCents: 1n,
      refundCents: 0n,
      rewardGrantedCents: 1n,
      rewardUsedCents: 0n,
      rewardReversedCents: 0n,
      verificationCount: 1n,
    };
    expect(reconcileMoney(summary, summary).balanced).toBe(true);
    expect(reconcileMoney(summary, { ...summary, refundCents: 1n })).toMatchObject({
      balanced: false,
      differences: { refundCents: '1' },
    });
  });
  it('persists the cursor only after mapped writes and resumes after the exact source id', async () => {
    const writes: string[] = [];
    const store = {
      loadCursor: vi.fn().mockResolvedValue({ lastSourceId: '1', batchNumber: 2 }),
      readAfter: vi.fn().mockResolvedValue([{ id: '2' }, { id: '3' }]),
      sourceId: (row: { id: string }) => row.id,
      transform: vi.fn(async (row: { id: string }) => ({ targetId: `t${row.id}`, value: row })),
      writeMapped: vi.fn(async ({ sourceId }: { sourceId: string }) => {
        writes.push(sourceId);
        return 'CREATED' as const;
      }),
      writeReview: vi.fn(),
      saveCursor: vi.fn(),
    };
    const result = await runMigrationBatch({ entityType: 'orders', limit: 2, store });
    expect(store.readAfter).toHaveBeenCalledWith('1', 2);
    expect(writes).toEqual(['2', '3']);
    expect(store.saveCursor).toHaveBeenCalledWith(
      expect.objectContaining({ lastSourceId: '3', batchNumber: 3, processedCount: 2 }),
    );
    expect(result.complete).toBe(false);
  });
});
