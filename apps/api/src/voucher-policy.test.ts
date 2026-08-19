import { describe, expect, it } from 'vitest';
import {
  calculateVoucherCommission,
  reverseVoucherLines,
  snapshotVoucherPolicy,
} from './voucher-policy.js';

describe('frozen single-entity voucher policy', () => {
  it.each([
    [300, 1800],
    [600, 1800],
    [700, 2000],
    [1400, 2000],
    [1500, 2500],
  ])('retains the original %s bps reward tier', (commissionBps, rewardBps) => {
    expect(
      snapshotVoucherPolicy({
        merchantMode: 'COMMISSION',
        commissionBps,
        settlementEntityId: 'single-platform-entity',
        effectiveAt: '2026-08-18T00:00:00+08:00',
      }),
    ).toMatchObject({
      commissionBasis: 'ORDER_ORIGINAL_PRICE',
      consumerRewardShareBps: rewardBps,
      merchantRewardShareBps: rewardBps,
      accelerationShareBps: 2000,
      settlementEntityId: 'single-platform-entity',
    });
  });

  it('calculates commission from original price rather than discounted payment', () => {
    const snapshot = snapshotVoucherPolicy({
      merchantMode: 'COMMISSION',
      commissionBps: 1000,
      settlementEntityId: 'single-platform-entity',
      effectiveAt: '2026-08-18T00:00:00+08:00',
    });
    expect(calculateVoucherCommission(10_000n, snapshot)).toBe(1000n);
  });

  it('keeps ZERO mode distinct and rejects rates outside frozen integer tiers', () => {
    expect(
      snapshotVoucherPolicy({
        merchantMode: 'ZERO',
        commissionBps: 0,
        settlementEntityId: 'single-platform-entity',
        effectiveAt: '2026-08-18T00:00:00+08:00',
      }),
    ).toMatchObject({ consumerRewardShareBps: 0, merchantRewardShareBps: 0 });
    expect(() =>
      snapshotVoucherPolicy({
        merchantMode: 'COMMISSION',
        commissionBps: 650,
        settlementEntityId: 'single-platform-entity',
        effectiveAt: '2026-08-18T00:00:00+08:00',
      }),
    ).toThrow('whole percentage');
  });

  it('reverses immutable original lines and permits a negative resulting account balance', () => {
    const originals = [
      { id: 'consumer-reward', accountId: 'consumer', amountMinorUnits: 20n },
      { id: 'merchant-reward', accountId: 'merchant', amountMinorUnits: 20n },
      { id: 'acceleration', accountId: 'pool', amountMinorUnits: 20n },
    ];
    const reversals = reverseVoucherLines(originals, (id) => `refund:${id}`);
    expect(reversals.map((line) => line.amountMinorUnits)).toEqual([-20n, -20n, -20n]);
    expect(reversals.map((line) => line.reversesLineId)).toEqual(originals.map((line) => line.id));
    expect(5n + reversals[0]!.amountMinorUnits).toBe(-15n);
    expect(originals[0]!.amountMinorUnits).toBe(20n);
  });
});
