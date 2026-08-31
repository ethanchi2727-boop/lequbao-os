import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { AuthorizationContext } from './access-control.js';
import {
  createMerchantOperationsService,
  MerchantOperationsAuthorizationError,
  MerchantOperationsConflictError,
  MerchantOperationsStateError,
} from './merchant-operations-service.js';

const tenantId = '13000000-0000-4000-8000-000000000001';
const storeId = '13000000-0000-4000-8000-000000000002';
const identity: AuthorizationContext = {
  tenantId,
  userId: '13000000-0000-4000-8000-000000000003',
  roleCodes: ['STORE_MANAGER'],
  storeIds: [storeId],
  sessionId: 'session-1',
  accessScopes: ['STORE'],
  assignedStoreIds: [storeId],
};

function fixture(rowsByMarker: Record<string, unknown[]>) {
  const statements: Array<[string, unknown[] | undefined]> = [];
  const client = {
    query: async (sql: string, parameters?: unknown[]) => {
      statements.push([sql, parameters]);
      const marker = Object.keys(rowsByMarker).find((candidate) => sql.includes(candidate));
      const rows = marker ? (rowsByMarker[marker] ?? []) : [];
      return { rowCount: rows.length, rows };
    },
    release: () => undefined,
  };
  return {
    statements,
    pool: { connect: async () => client } as unknown as Pick<pg.Pool, 'connect'>,
  };
}

describe('merchant operations read model', () => {
  it('returns a safe merchant profile without ciphertext or object-store references', async () => {
    const db = fixture({
      'FROM merchant_profiles': [
        {
          id: '13000000-0000-4000-8000-000000000004',
          legal_subject_name: '拾味餐饮有限公司',
          industry_code: 'DINING',
          service_region_codes: ['320100'],
          profile_status: 'VERIFIED',
          verified_at: '2026-08-01T00:00:00.000Z',
          version: 2,
          updated_at: '2026-08-02T00:00:00.000Z',
        },
      ],
    });
    const result = await createMerchantOperationsService(db.pool).getMerchantProfile(identity);
    expect(result).toMatchObject({
      legalSubjectName: '拾味餐饮有限公司',
      merchantName: '拾味餐饮有限公司',
      status: 'VERIFIED',
    });
    expect(JSON.stringify(result)).not.toMatch(/ciphertext|object.?key/iu);
  });

  it('scopes product and inventory reads to assigned stores in SQL parameters', async () => {
    const db = fixture({ 'FROM products product': [] });
    await createMerchantOperationsService(db.pool).listProducts(identity, {
      productType: 'GROUP_BUY',
    });
    const query = db.statements.find(([sql]) => sql.includes('FROM products product'));
    expect(query?.[1]?.[0]).toBe(tenantId);
    expect(query?.[1]?.[1]).toEqual([storeId]);
    expect(query?.[1]?.[3]).toBe('GROUP_BUY');
  });

  it('rejects a requested store outside the current authorization context before SQL', async () => {
    const db = fixture({});
    expect(() =>
      createMerchantOperationsService(db.pool).listOrders(identity, {
        storeId: '13000000-0000-4000-8000-000000000099',
      }),
    ).toThrow(MerchantOperationsAuthorizationError);
    expect(db.statements).toHaveLength(0);
  });

  it('loads order detail, item snapshots and refunds only after scoped order ownership', async () => {
    const orderId = '13000000-0000-4000-8000-000000000005';
    const db = fixture({
      'FROM orders': [
        {
          id: orderId,
          order_no: 'O-1',
          store_id: storeId,
          status: 'PAID',
          payable_amount_cents: 1000,
          paid_amount_cents: 1000,
          refunded_amount_cents: 0,
          currency: 'CNY',
          paid_at: '2026-08-01T00:00:00.000Z',
          version: 1,
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      'FROM order_items': [{ id: 'item-1', title_snapshot: '套餐', quantity: 1 }],
      'FROM refunds': [],
    });
    const result = await createMerchantOperationsService(db.pool).getOrder(identity, orderId);
    expect(result).toMatchObject({ id: orderId, storeId, items: [{ title_snapshot: '套餐' }] });
    const orderQuery = db.statements.find(([sql]) => sql.includes('FROM orders'));
    expect(orderQuery?.[1]).toEqual([tenantId, orderId, [storeId]]);
  });

  it('lists pseudonymous customer operations data inside the assigned store scope', async () => {
    const db = fixture({
      'FROM customer_profiles profile': [
        {
          id: '13000000-0000-4000-8000-000000000006',
          status: 'ACTIVE',
          first_seen_at: '2026-08-01T00:00:00.000Z',
          last_seen_at: '2026-08-02T00:00:00.000Z',
          version: 1,
          order_count: '2',
          conversation_count: '3',
        },
      ],
    });
    const result = await createMerchantOperationsService(db.pool).listCustomers(identity, {});
    expect(result).toEqual([
      expect.objectContaining({ status: 'ACTIVE', orderCount: 2, conversationCount: 3 }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/nickname|mobile|ciphertext/iu);
    expect(
      db.statements.find(([sql]) => sql.includes('FROM customer_profiles profile'))?.[1]?.[1],
    ).toEqual([storeId]);
  });

  it('returns only immutable reward projections for the scoped customer', async () => {
    const customerId = '13000000-0000-4000-8000-000000000006';
    const db = fixture({
      'FROM reward_grants grant': [
        {
          id: 'grant-1',
          order_id: 'order-1',
          rule_version: 'v1',
          funding_source: 'MERCHANT',
          granted_amount_cents: '500',
          redeemed_amount_cents: '100',
          reversed_amount_cents: '50',
          status: 'AVAILABLE',
          available_at: '2026-08-01T00:00:00.000Z',
          expires_at: null,
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
        },
      ],
    });
    await expect(
      createMerchantOperationsService(db.pool).listCustomerRewards(identity, customerId),
    ).resolves.toEqual([
      expect.objectContaining({ grantedAmountCents: 500, redeemedAmountCents: 100 }),
    ]);
    expect(db.statements.find(([sql]) => sql.includes('FROM reward_grants grant'))?.[1]).toEqual([
      tenantId,
      customerId,
      [storeId],
    ]);
  });

  it('publishes an in-scope group buy only after version, store, variant and stock checks', async () => {
    const productId = '13000000-0000-4000-8000-000000000007';
    const db = fixture({
      'FROM product_publication_receipts': [],
      'FROM products product LEFT JOIN stores': [
        {
          id: productId,
          store_id: storeId,
          product_type: 'GROUP_BUY',
          status: 'DRAFT',
          sale_price_cents: '9900',
          version: 1,
          store_status: 'ACTIVE',
        },
      ],
      'FROM product_variants variant LEFT JOIN inventory_balances': [
        { active_variants: '1', available_quantity: '5' },
      ],
      'UPDATE products SET': [{ version: 2, updated_at: '2026-08-19T00:00:00.000Z' }],
    });
    await expect(
      createMerchantOperationsService(db.pool).publishProduct(
        identity,
        productId,
        'publish-product-1',
        'trace-product',
        { expectedVersion: 1, confirmed: true },
      ),
    ).resolves.toMatchObject({ productId, status: 'ON_SALE', version: 2, replayed: false });
    expect(
      db.statements.some(([sql]) => sql.includes('INSERT INTO product_publication_receipts')),
    ).toBe(true);
    expect(db.statements.some(([sql]) => sql.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(
      db.statements.find(([sql]) => sql.includes('FROM products product LEFT'))?.[1]?.[2],
    ).toEqual([storeId]);
  });

  it('fails closed for unavailable stock and rejects a conflicting idempotency replay', async () => {
    const productId = '13000000-0000-4000-8000-000000000008';
    const unavailable = fixture({
      'FROM product_publication_receipts': [],
      'FROM products product LEFT JOIN stores': [
        {
          id: productId,
          store_id: storeId,
          product_type: 'GROUP_BUY',
          status: 'DRAFT',
          sale_price_cents: '9900',
          version: 1,
          store_status: 'ACTIVE',
        },
      ],
      'FROM product_variants variant LEFT JOIN inventory_balances': [
        { active_variants: '1', available_quantity: '0' },
      ],
    });
    await expect(
      createMerchantOperationsService(unavailable.pool).publishProduct(
        identity,
        productId,
        'publish-product-2',
        'trace-product-2',
        { expectedVersion: 1, confirmed: true },
      ),
    ).rejects.toBeInstanceOf(MerchantOperationsStateError);

    const conflict = fixture({
      'FROM product_publication_receipts': [
        { product_id: productId, request_hash: 'different', to_status: 'ON_SALE' },
      ],
    });
    await expect(
      createMerchantOperationsService(conflict.pool).publishProduct(
        identity,
        productId,
        'publish-product-2',
        'trace-product-2',
        { expectedVersion: 1, confirmed: true },
      ),
    ).rejects.toBeInstanceOf(MerchantOperationsConflictError);
  });
});
