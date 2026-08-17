import assert from 'node:assert/strict';
import pg from 'pg';
import { createDistributionLockService } from '../src/distribution-lock-service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const tenantId = '70000000-0000-4000-8000-000000000001';
const financeUser = '70000000-0000-4000-8000-000000000002';
const businessUserA = '70000000-0000-4000-8000-000000000003';
const businessUserB = '70000000-0000-4000-8000-000000000004';
const subscriptionId = '70000000-0000-4000-8000-000000000005';
const merchantProfileId = '70000000-0000-4000-8000-000000000006';
const businessA = '70000000-0000-4000-8000-000000000007';
const businessB = '70000000-0000-4000-8000-000000000008';
const shangzhi = '70000000-0000-4000-8000-000000000009';
const lequLife = '70000000-0000-4000-8000-000000000010';
const rightGroup = '70000000-0000-4000-8000-000000000011';
const policyId = '70000000-0000-4000-8000-000000000012';

const pool = new pg.Pool({ connectionString });
try {
  await pool.query(
    `INSERT INTO tenants(id, tenant_code, legal_name, display_name)
     VALUES ($1, 'lock-integration', 'Lock Integration Legal', 'Lock Integration')`,
    [tenantId],
  );
  await pool.query(
    `INSERT INTO users(id, display_name) VALUES
       ($1, 'Finance'), ($2, 'Business A'), ($3, 'Business B')`,
    [financeUser, businessUserA, businessUserB],
  );
  await pool.query(
    `INSERT INTO tenant_subscriptions(
       id, tenant_id, plan_code, status, starts_at, current_period_start, current_period_end
     ) VALUES ($1, $2, 'STANDARD_898_MONTH', 'ACTIVE', '2026-08-01', '2026-08-01', '2026-09-01')`,
    [subscriptionId, tenantId],
  );
  await pool.query(
    `INSERT INTO merchant_profiles(id, tenant_id, legal_subject_name, industry_code, profile_status)
     VALUES ($1, $2, 'Integration Merchant', 'LOCAL_LIFE', 'VERIFIED')`,
    [merchantProfileId, tenantId],
  );
  await pool.query(
    `INSERT INTO revenue_beneficiaries(id, beneficiary_type, user_id, legal_name, status) VALUES
       ($1, 'BUSINESS_PERSON', $5, 'Business A', 'ACTIVE'),
       ($2, 'BUSINESS_PERSON', $6, 'Business B', 'ACTIVE'),
       ($3, 'SHANGZHI_ENTITY', NULL, 'Shangzhi', 'ACTIVE'),
       ($4, 'LEQU_LIFE_ENTITY', NULL, 'Lequ Life', 'ACTIVE')`,
    [businessA, businessB, shangzhi, lequLife, businessUserA, businessUserB],
  );
  await pool.query(
    `INSERT INTO merchant_revenue_right_groups(
       id, tenant_id, merchant_profile_id, status, source_contract_ref, starts_at, created_by
     ) VALUES ($1, $2, $3, 'PENDING', 'integration-contract', '2026-08-01', $4)`,
    [rightGroup, tenantId, merchantProfileId, financeUser],
  );
  await pool.query(
    `INSERT INTO merchant_revenue_right_holders(
       tenant_id, right_group_id, beneficiary_id, share_bps, starts_at
     ) VALUES ($1, $2, $3, 4000, '2026-08-01'), ($1, $2, $4, 3000, '2026-08-01')`,
    [tenantId, rightGroup, businessA, businessB],
  );
  await pool.query(`UPDATE merchant_revenue_right_groups SET status = 'ACTIVE' WHERE id = $1`, [
    rightGroup,
  ]);
  await pool.query(
    `INSERT INTO revenue_share_policies(
       id, tenant_id, policy_type, policy_version, cost_basis, status, effective_from,
       approved_by, approved_at
     ) VALUES ($1, $2, 'SUBSCRIPTION', 1, 'DIRECT_ACTUAL_COST', 'DRAFT', '2026-08-01', $3, now())`,
    [policyId, tenantId, financeUser],
  );
  await pool.query(
    `INSERT INTO revenue_share_policy_splits(tenant_id, policy_id, beneficiary_role, share_bps) VALUES
       ($1, $2, 'ORIGINATING_BUSINESS', 7000),
       ($1, $2, 'SHANGZHI', 1000),
       ($1, $2, 'LEQU_LIFE', 2000)`,
    [tenantId, policyId],
  );
  await pool.query(`UPDATE revenue_share_policies SET status = 'ACTIVE' WHERE id = $1`, [policyId]);
  await pool.query(
    `INSERT INTO subscription_cash_ledger_entries(
       tenant_id, subscription_id, bucket, entry_type, amount_cents, provider,
       external_event_id, provider_reference_hash, occurred_at, recorded_by
     ) VALUES
       ($1, $2, 'RECEIPT', 'CONFIRMATION', 1000, 'WECHAT', 'integration-receipt', 'receipt-hash', '2026-08-15', $3),
       ($1, $2, 'REFUND', 'CONFIRMATION', 100, 'WECHAT', 'integration-refund', 'refund-hash', '2026-08-20', $3)`,
    [tenantId, subscriptionId, financeUser],
  );
  await pool.query(
    `INSERT INTO direct_cost_entries(
       tenant_id, subscription_id, source_type, source_id, service_period_start, service_period_end,
       cost_code, amount_cents, cost_status, source_event_id, created_by
     ) VALUES ($1, $2, 'SUBSCRIPTION', $2, '2026-08-01', '2026-08-31',
               'AI_MODEL', 200, 'ACTUAL', 'integration-ai-cost', $3)`,
    [tenantId, subscriptionId, financeUser],
  );

  const service = createDistributionLockService(pool);
  const command = {
    tenantId,
    idempotencyKey: 'integration-lock-2026-08',
    traceId: 'integration-trace-1',
    body: {
      subscriptionId,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      lockedBy: financeUser,
    },
  };
  const first = await service.lock(command);
  const replay = await service.lock(command);
  assert.deepEqual(replay, first);
  assert.equal(first.status, 'LOCKED');
  assert.equal(first.distributableMinorUnits, '700');
  assert.deepEqual(
    first.allocations.map((allocation) => allocation.allocatedMinorUnits),
    ['280', '210', '70', '140'],
  );

  const evidence = await pool.query<{
    statements: string;
    allocations: string;
    entries: string;
    outbox: string;
    audits: string;
  }>(
    `SELECT
       (SELECT count(*) FROM revenue_distribution_statements WHERE tenant_id = $1)::text AS statements,
       (SELECT count(*) FROM revenue_distribution_allocations WHERE tenant_id = $1)::text AS allocations,
       (SELECT count(*) FROM revenue_distribution_entries WHERE tenant_id = $1)::text AS entries,
       (SELECT count(*) FROM outbox_events WHERE tenant_id = $1 AND event_name = 'distribution.statement_locked.v1')::text AS outbox,
       (SELECT count(*) FROM audit_logs WHERE tenant_id = $1 AND action = 'LOCK')::text AS audits`,
    [tenantId],
  );
  assert.deepEqual(evidence.rows[0], {
    statements: '1',
    allocations: '4',
    entries: '4',
    outbox: '1',
    audits: '1',
  });
  console.log(
    'Distribution lock PostgreSQL integration passed, including exact allocations and idempotent replay.',
  );
} finally {
  await pool.end();
}
