import { describe, expect, it } from 'vitest';
import { baoMobileSurfaceContract, mobileActionPolicy } from './surface-contract.js';

describe('乐趣宝 UniApp mobile contract', () => {
  it('keeps mobile entry points task-focused and backed by existing V6 APIs', () => {
    expect(Object.keys(baoMobileSurfaceContract)).toEqual([
      'workbench',
      'merchants',
      'orders',
      'service',
      'me',
    ]);
    expect(baoMobileSurfaceContract.workbench.read).toEqual(['/api/v1/operational-home/today']);
    expect(baoMobileSurfaceContract.merchants.read).toContain('/api/v1/revenue-operations/summary');
    expect(baoMobileSurfaceContract.orders.read).toContain('/api/v1/merchant-operations/refunds');
  });

  it('fails closed before exposing a mobile command', () => {
    expect(mobileActionPolicy({ permission: false, resourceInScope: true })).toBe('forbidden');
    expect(
      mobileActionPolicy({
        permission: true,
        resourceInScope: true,
        mfaRequired: true,
        mfaReady: false,
      }),
    ).toBe('requires-mfa');
    expect(
      mobileActionPolicy({
        permission: true,
        resourceInScope: true,
        mfaRequired: true,
        mfaReady: true,
      }),
    ).toBe('enabled');
  });
});
