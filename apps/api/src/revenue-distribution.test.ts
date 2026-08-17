import { describe, expect, it } from 'vitest';
import {
  allocateExactly,
  assertLockableAndReconciled,
  calculateStatement,
} from './revenue-distribution.js';

describe('revenue distribution calculation', () => {
  it('subtracts refunds and current direct costs and floors ordinary loss at zero', () => {
    expect(
      calculateStatement({
        actualReceiptMinorUnits: 1000n,
        refundMinorUnits: 100n,
        directCosts: [
          { amountMinorUnits: 250n, status: 'ACTUAL' },
          { amountMinorUnits: 999n, status: 'REVERSED' },
        ],
      }),
    ).toEqual({
      actualReceiptMinorUnits: 1000n,
      refundMinorUnits: 100n,
      directCostMinorUnits: 250n,
      distributableMinorUnits: 650n,
      readyToLock: true,
    });
    expect(
      calculateStatement({
        actualReceiptMinorUnits: 100n,
        refundMinorUnits: 20n,
        directCosts: [{ amountMinorUnits: 200n, status: 'ACTUAL' }],
      }).distributableMinorUnits,
    ).toBe(0n);
  });

  it('uses an approved provisional amount for estimates but blocks locking', () => {
    const statement = calculateStatement({
      actualReceiptMinorUnits: 1000n,
      refundMinorUnits: 0n,
      directCosts: [{ amountMinorUnits: 200n, status: 'PROVISIONAL' }],
    });
    expect(statement.distributableMinorUnits).toBe(800n);
    expect(statement.readyToLock).toBe(false);
    expect(() => assertLockableAndReconciled(statement, [])).toThrow('provisional');
  });

  it('allocates multiple business holders plus 10/20 platform shares without losing a cent', () => {
    const statement = calculateStatement({
      actualReceiptMinorUnits: 99n,
      refundMinorUnits: 0n,
      directCosts: [],
    });
    const allocations = allocateExactly(statement.distributableMinorUnits, [
      { key: 'business-a', shareBps: 4000 },
      { key: 'business-b', shareBps: 3000 },
      { key: 'shangzhi', shareBps: 1000 },
      { key: 'lequ-life', shareBps: 2000 },
    ]);
    expect(allocations.map((allocation) => allocation.allocatedMinorUnits)).toEqual([
      39n,
      30n,
      10n,
      20n,
    ]);
    expect(() => assertLockableAndReconciled(statement, allocations)).not.toThrow();
  });

  it('rejects non-100-percent shares, duplicate keys and a one-cent mismatch', () => {
    expect(() => allocateExactly(100n, [{ key: 'business', shareBps: 7000 }])).toThrow('10000');
    expect(() =>
      allocateExactly(100n, [
        { key: 'same', shareBps: 7000 },
        { key: 'same', shareBps: 3000 },
      ]),
    ).toThrow('unique');
    expect(() =>
      assertLockableAndReconciled(
        calculateStatement({
          actualReceiptMinorUnits: 100n,
          refundMinorUnits: 0n,
          directCosts: [],
        }),
        [{ key: 'wrong', shareBps: 10_000, allocatedMinorUnits: 99n }],
      ),
    ).toThrow('allocation mismatch');
  });
});
