import { describe, expect, it } from 'vitest';
import {
  CreateRevenueRightRequestSchema,
  EventEnvelopeSchema,
  MinorCurrencyAmountSchema,
} from './index.js';

describe('shared contracts', () => {
  it.each(['0', '1', '89800', '9007199254740993'])('accepts safe money string %s', (value) => {
    expect(MinorCurrencyAmountSchema.parse(value)).toBe(value);
  });

  it.each(['-1', '01', '1.5', 89800])('rejects ambiguous money %s', (value) => {
    expect(MinorCurrencyAmountSchema.safeParse(value).success).toBe(false);
  });

  it('validates a versioned tenant event envelope', () => {
    expect(
      EventEnvelopeSchema.parse({
        eventId: '00000000-0000-4000-8000-000000000001',
        eventType: 'merchant.revenue-right.created',
        aggregateType: 'merchant_revenue_right_group',
        aggregateId: '00000000-0000-4000-8000-000000000002',
        tenantId: '00000000-0000-4000-8000-000000000003',
        occurredAt: '2026-08-17T12:00:00+08:00',
        schemaVersion: 1,
        idempotencyKey: 'create-right:merchant-1:v1',
        payload: { source: 'subscription' },
      }).schemaVersion,
    ).toBe(1);
  });

  it('requires the internal business holders to total exactly 70 percent', () => {
    const result = CreateRevenueRightRequestSchema.safeParse({
      sourceContractRef: 'contract-2026-001',
      startsAt: '2026-08-17T12:00:00+08:00',
      createdBy: '00000000-0000-4000-8000-000000000001',
      holders: [
        { beneficiaryId: '00000000-0000-4000-8000-000000000002', shareBps: 4000 },
        { beneficiaryId: '00000000-0000-4000-8000-000000000003', shareBps: 3000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate holders and totals other than 70 percent', () => {
    const beneficiaryId = '00000000-0000-4000-8000-000000000002';
    const result = CreateRevenueRightRequestSchema.safeParse({
      sourceContractRef: 'contract-2026-001',
      startsAt: '2026-08-17T12:00:00+08:00',
      createdBy: '00000000-0000-4000-8000-000000000001',
      holders: [
        { beneficiaryId, shareBps: 4000 },
        { beneficiaryId, shareBps: 2000 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(2);
  });
});
