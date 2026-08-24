import { describe, expect, it } from 'vitest';
import { requiresRegionalIntakeAssignment } from './merchant-intake-service.js';

describe('merchant intake role scope', () => {
  it('keeps a regional-only identity bound to an assigned delivery project', () => {
    expect(requiresRegionalIntakeAssignment(['REGIONAL_PROVIDER'])).toBe(true);
    expect(requiresRegionalIntakeAssignment(['REGIONAL_PROVIDER', 'CUSTOMER_SERVICE'])).toBe(true);
  });

  it('does not let an additional regional role remove a broader intake role grant', () => {
    expect(requiresRegionalIntakeAssignment(['MERCHANT_OWNER'])).toBe(false);
    expect(requiresRegionalIntakeAssignment(['MERCHANT_OWNER', 'REGIONAL_PROVIDER'])).toBe(false);
    expect(requiresRegionalIntakeAssignment(['BUSINESS_DEVELOPER', 'REGIONAL_PROVIDER'])).toBe(
      false,
    );
  });
});
