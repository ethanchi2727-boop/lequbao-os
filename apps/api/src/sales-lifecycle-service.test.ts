import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createSalesLifecycleService,
  SalesLifecycleStateError,
} from './sales-lifecycle-service.js';

const tenantId = '21000000-0000-4000-8000-000000000001';
const actorId = '21000000-0000-4000-8000-000000000002';
const opportunityId = '21000000-0000-4000-8000-000000000003';
const assetId = '21000000-0000-4000-8000-000000000004';
const contractId = '21000000-0000-4000-8000-000000000006';
const identity: AuthorizationContext = {
  tenantId,
  userId: actorId,
  roleCodes: ['BUSINESS_DEVELOPER'],
  storeIds: [],
  sessionId: 'session-sales',
  accessScopes: ['ASSIGNED'],
  assignedStoreIds: [],
};

function fixture(handler: (sql: string, values?: unknown[]) => unknown[]) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const query = vi.fn(async (rawSql: string, values?: unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    statements.push({ sql, values });
    const rows = handler(sql, values);
    return { rows, rowCount: rows.length };
  });
  const client = { query, release: vi.fn() };
  return {
    statements,
    service: createSalesLifecycleService(
      { connect: vi.fn(async () => client) } as unknown as Pick<pg.Pool, 'connect'>,
      { identityHashSecret: 'sales-identity-test-secret-32-bytes-long' },
    ),
  };
}

const command = (body: unknown, idempotencyKey = 'sales-key') => ({
  identity,
  idempotencyKey,
  traceId: 'trace-sales',
  body,
});

describe('sales lifecycle', () => {
  it('requires an independent high-entropy identity hashing secret', () => {
    expect(() =>
      createSalesLifecycleService({} as Pick<pg.Pool, 'connect'>, {
        identityHashSecret: 'too-short',
      }),
    ).toThrow(/32 bytes/u);
  });

  it('lists only the assigned owner and returns no matching hashes', async () => {
    const fx = fixture((sql) =>
      sql.includes('FROM sales_opportunities WHERE tenant_id')
        ? [
            {
              id: opportunityId,
              owner_user_id: actorId,
              legal_subject_name: '示例餐饮有限公司',
              status: 'NEW',
              first_contact_at: '2026-08-19T00:00:00.000Z',
              next_action: '完成重复检查',
              protection_until: '2026-11-19T00:00:00.000Z',
              converted_merchant_profile_id: null,
              version: 1,
              created_at: '2026-08-19T00:00:00.000Z',
              updated_at: '2026-08-19T00:00:00.000Z',
              has_evidence: true,
            },
          ]
        : [],
    );
    const result = await fx.service.list(identity, {});
    expect(result).toEqual([
      expect.objectContaining({ id: opportunityId, legalSubjectName: '示例餐饮有限公司' }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/credit|mobile|address|_hash/iu);
    const select = fx.statements.find(({ sql }) =>
      sql.includes('FROM sales_opportunities WHERE tenant_id'),
    );
    expect(select?.values?.slice(0, 3)).toEqual([tenantId, false, actorId]);
  });

  it('never exposes stable-identifier hashes from opportunity detail', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT id,owner_user_id,legal_subject_name'))
        return [
          {
            id: opportunityId,
            owner_user_id: actorId,
            legal_subject_name: '示例餐饮有限公司',
            unified_credit_code_hash: 'secret-credit-hash',
            contact_mobile_hash: 'secret-mobile-hash',
            store_address_hash: 'secret-address-hash',
            evidence_asset_id: assetId,
            first_contact_at: '2026-08-19T00:00:00.000Z',
            next_action: '报价',
            status: 'QUALIFIED',
            protection_until: null,
            converted_merchant_profile_id: null,
            loss_reason_code: null,
            version: 2,
            created_at: '2026-08-19T00:00:00.000Z',
            updated_at: '2026-08-19T00:00:00.000Z',
          },
        ];
      return [];
    });
    const result = await fx.service.get(identity, opportunityId);
    expect(result).toMatchObject({ id: opportunityId, status: 'QUALIFIED', hasEvidence: true });
    expect(JSON.stringify(result)).not.toContain('secret-');
  });

  it('creates a lead from safe processed evidence and persists only HMAC identifiers', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT 1 FROM merchant_intake_assets')) return [{ '?column?': 1 }];
      if (sql.startsWith('INSERT INTO sales_opportunities'))
        return [
          {
            id: opportunityId,
            owner_user_id: actorId,
            legal_subject_name: '示例餐饮有限公司',
            status: 'NEW',
            protection_until: '2026-11-19T00:00:00.000Z',
            version: 1,
            created_at: '2026-08-19T00:00:00.000Z',
          },
        ];
      return [];
    });
    await fx.service.create(
      command({
        legalSubjectName: '示例餐饮有限公司',
        unifiedCreditCode: '91310000RAWVALUE',
        contactMobile: '13800138000',
        evidenceAssetId: assetId,
        firstContactAt: '2026-08-19T08:00:00+08:00',
        nextAction: '完成重复检查',
      }),
    );
    const insert = fx.statements.find(({ sql }) =>
      sql.startsWith('INSERT INTO sales_opportunities'),
    );
    expect(insert?.values?.[3]).toMatch(/^[a-f0-9]{64}$/u);
    expect(insert?.values?.[4]).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(fx.statements)).not.toContain('91310000RAWVALUE');
    expect(JSON.stringify(fx.statements)).not.toContain('13800138000');
  });

  it('guards each duplicate comparison against null and records potential matches', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT id,owner_user_id,legal_subject_name'))
        return [
          {
            id: opportunityId,
            owner_user_id: actorId,
            legal_subject_name: '示例餐饮有限公司',
            unified_credit_code_hash: null,
            contact_mobile_hash: 'mobile-hash',
            store_address_hash: null,
            status: 'NEW',
          },
        ];
      if (sql.startsWith('SELECT id FROM sales_opportunities'))
        return [{ id: '21000000-0000-4000-8000-000000000007' }];
      if (sql.startsWith('SELECT id FROM merchant_profiles')) return [];
      if (sql.startsWith('INSERT INTO sales_duplicate_checks'))
        return [
          {
            id: '21000000-0000-4000-8000-000000000008',
            result: 'POTENTIAL_DUPLICATE',
            matched_opportunity_ids: ['21000000-0000-4000-8000-000000000007'],
            matched_merchant_profile_ids: [],
            decision_reason_code: null,
            checked_at: '2026-08-19T00:00:00.000Z',
          },
        ];
      return [];
    });
    await expect(
      fx.service.checkDuplicates(command({ opportunityId }, 'duplicate-key')),
    ).resolves.toMatchObject({ result: 'POTENTIAL_DUPLICATE' });
    const comparison = fx.statements.find(({ sql }) =>
      sql.startsWith('SELECT id FROM sales_opportunities'),
    )?.sql;
    expect(comparison).toContain('$3::text IS NOT NULL');
    expect(comparison).toContain('$4::text IS NOT NULL');
    expect(comparison).toContain('$5::text IS NOT NULL');
  });

  it('rejects unsupported quote inflation before writing a quote', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT id,owner_user_id,legal_subject_name'))
        return [{ id: opportunityId, owner_user_id: actorId, status: 'QUALIFIED' }];
      if (sql.startsWith('SELECT list_price_cents')) return [{ list_price_cents: '89800' }];
      return [];
    });
    await expect(
      fx.service.createQuote(
        command(
          {
            opportunityId,
            planCode: 'MERCHANT_898',
            quotedPriceCents: 99900,
            validUntil: '2026-09-19T08:00:00+08:00',
          },
          'quote-key',
        ),
      ),
    ).rejects.toBeInstanceOf(SalesLifecycleStateError);
    expect(fx.statements.some(({ sql }) => sql.startsWith('INSERT INTO sales_quotes'))).toBe(false);
  });

  it('signs a sent contract with a one-way signer reference', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('UPDATE sales_contracts contract'))
        return [
          {
            id: contractId,
            opportunity_id: opportunityId,
            contract_no: 'HT-2026-001',
            amount_cents: '89800',
            status: 'SIGNED',
            signed_at: '2026-08-19T00:00:00.000Z',
            version: 2,
          },
        ];
      return [];
    });
    await fx.service.signContract(
      command(
        {
          contractId,
          merchantSignerReference: 'raw-merchant-signer-reference',
          signedAt: '2026-08-19T08:00:00+08:00',
        },
        'sign-key',
      ),
    );
    const update = fx.statements.find(({ sql }) =>
      sql.startsWith('UPDATE sales_contracts contract'),
    );
    expect(update?.values?.[2]).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(fx.statements)).not.toContain('raw-merchant-signer-reference');
  });

  it('records provider collection evidence without persisting the provider reference', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT request_hash,response_body')) return [];
      if (sql.startsWith('SELECT contract.id,contract.amount_cents'))
        return [{ id: contractId, amount_cents: '89800' }];
      if (sql.startsWith('INSERT INTO sales_collection_receipts'))
        return [
          {
            id: '21000000-0000-4000-8000-000000000009',
            contract_id: contractId,
            provider: 'BANK_RECONCILIATION',
            amount_cents: '89800',
            currency: 'CNY',
            status: 'CONFIRMED',
            occurred_at: '2026-08-19T00:00:00.000Z',
            created_at: '2026-08-19T00:00:00.000Z',
          },
        ];
      return [];
    });
    await fx.service.recordCollection(
      command(
        {
          contractId,
          provider: 'BANK_RECONCILIATION',
          externalEventId: 'bank-event-1',
          providerReference: 'raw-bank-reference',
          amountCents: 89800,
          currency: 'CNY',
          occurredAt: '2026-08-19T08:00:00+08:00',
        },
        'collection-key',
      ),
    );
    const insert = fx.statements.find(({ sql }) =>
      sql.startsWith('INSERT INTO sales_collection_receipts'),
    );
    expect(insert?.values?.[4]).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(fx.statements)).not.toContain('raw-bank-reference');
  });
});
