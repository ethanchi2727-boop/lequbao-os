import { describe, expect, it, vi } from 'vitest';
import {
  RevenueRightGovernanceAuthorizationError,
  RevenueRightGovernanceStateError,
  createRevenueRightGovernanceService,
} from './revenue-right-governance-service.js';

const identity = {
  tenantId: '40000000-0000-4000-8000-000000000001',
  userId: '40000000-0000-4000-8000-000000000002',
  roleCodes: ['BUSINESS_DEVELOPER'],
  storeIds: [],
  sessionId: 'session-1',
};

function service(handler: (sql: string) => unknown[]) {
  const query = vi.fn(async (sql: string) => {
    const rows = handler(sql);
    return { rows, rowCount: rows.length };
  });
  return createRevenueRightGovernanceService({
    connect: async () => ({ query, release: vi.fn() }),
  } as never);
}

describe('revenue-right transfer and dispute governance', () => {
  it('allows only the current beneficiary user to request a transfer', async () => {
    const value = service((sql) => {
      if (sql.includes('INSERT INTO idempotency_keys')) return [{ id: 'reservation' }];
      if (sql.includes('FROM merchant_revenue_right_holders'))
        return [
          {
            from_beneficiary_id: '40000000-0000-4000-8000-000000000004',
            beneficiary_user_id: identity.userId,
          },
        ];
      if (sql.includes('FROM revenue_beneficiaries')) return [{ allowed: 1 }];
      if (sql.includes('INSERT INTO revenue_right_transfers'))
        return [{ id: '40000000-0000-4000-8000-000000000006' }];
      return [];
    });
    await expect(
      value.requestTransfer({
        identity,
        idempotencyKey: 'transfer-1',
        traceId: 'trace-1',
        body: {
          rightHolderId: '40000000-0000-4000-8000-000000000003',
          toBeneficiaryId: '40000000-0000-4000-8000-000000000005',
          agreementObjectKey: 'tenant/agreements/transfer-1.pdf',
        },
      }),
    ).resolves.toEqual({
      id: '40000000-0000-4000-8000-000000000006',
      status: 'WAITING_CONFIRMATIONS',
      replayed: false,
    });

    const unauthorized = service((sql) => {
      if (sql.includes('INSERT INTO idempotency_keys')) return [{ id: 'reservation' }];
      if (sql.includes('FROM merchant_revenue_right_holders'))
        return [
          {
            from_beneficiary_id: '40000000-0000-4000-8000-000000000004',
            beneficiary_user_id: '40000000-0000-4000-8000-999999999999',
          },
        ];
      return [];
    });
    await expect(
      unauthorized.requestTransfer({
        identity,
        idempotencyKey: 'transfer-2',
        traceId: 'trace-2',
        body: {
          rightHolderId: '40000000-0000-4000-8000-000000000003',
          toBeneficiaryId: '40000000-0000-4000-8000-000000000005',
          agreementObjectKey: 'tenant/agreements/transfer-2.pdf',
        },
      }),
    ).rejects.toThrow(RevenueRightGovernanceAuthorizationError);
  });

  it('blocks approval until both beneficiaries confirm and the approver differs', async () => {
    const missingConfirmation = service((sql) => {
      if (sql.includes('INSERT INTO idempotency_keys')) return [{ id: 'reservation' }];
      if (sql.includes('FROM revenue_right_transfers'))
        return [
          {
            right_holder_id: '40000000-0000-4000-8000-000000000003',
            to_beneficiary_id: '40000000-0000-4000-8000-000000000005',
            requested_by: '40000000-0000-4000-8000-000000000009',
          },
        ];
      if (sql.includes('FROM revenue_right_transfer_confirmations')) return [{ one: 1 }];
      return [];
    });
    await expect(
      missingConfirmation.approveTransfer({
        identity,
        idempotencyKey: 'approve-1',
        traceId: 'trace-3',
        body: { transferId: '40000000-0000-4000-8000-000000000006' },
      }),
    ).rejects.toThrow(RevenueRightGovernanceStateError);
  });

  it('opens a dispute through the database freeze guard and returns an idempotent resource', async () => {
    const value = service((sql) => {
      if (sql.includes('INSERT INTO idempotency_keys')) return [{ id: 'reservation' }];
      if (sql.includes('INSERT INTO revenue_right_disputes'))
        return [{ id: '40000000-0000-4000-8000-000000000010' }];
      return [];
    });
    await expect(
      value.openDispute({
        identity,
        idempotencyKey: 'dispute-1',
        traceId: 'trace-4',
        body: {
          rightGroupId: '40000000-0000-4000-8000-000000000007',
          claimantBeneficiaryIds: [
            '40000000-0000-4000-8000-000000000004',
            '40000000-0000-4000-8000-000000000005',
          ],
          reasonCode: 'DUPLICATE_CLAIM',
        },
      }),
    ).resolves.toMatchObject({ status: 'OPEN', replayed: false });
  });
});
