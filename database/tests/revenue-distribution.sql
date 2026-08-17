\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('40000000-0000-4000-8000-000000000001', 'distribution-test', 'Distribution Legal', 'Distribution');
INSERT INTO users(id, display_name)
VALUES ('40000000-0000-4000-8000-000000000002', 'Finance Approver');
INSERT INTO revenue_beneficiaries(id, beneficiary_type, user_id, legal_name, status) VALUES
  ('40000000-0000-4000-8000-000000000003', 'BUSINESS_PERSON', '40000000-0000-4000-8000-000000000002', 'Original Business', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000004', 'SHANGZHI_ENTITY', NULL, 'Shangzhi', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000005', 'LEQU_LIFE_ENTITY', NULL, 'Lequ Life', 'ACTIVE');
INSERT INTO revenue_share_policies(
  id, tenant_id, policy_type, policy_version, cost_basis, status, effective_from, approved_by, approved_at
) VALUES (
  '40000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001',
  'SUBSCRIPTION', 1, 'DIRECT_ACTUAL_COST', 'DRAFT', now(), '40000000-0000-4000-8000-000000000002', now()
);
INSERT INTO revenue_share_policy_splits(tenant_id, policy_id, beneficiary_role, share_bps) VALUES
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006', 'ORIGINATING_BUSINESS', 7000),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006', 'SHANGZHI', 1000),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006', 'LEQU_LIFE', 2000);
UPDATE revenue_share_policies SET status = 'ACTIVE'
 WHERE id = '40000000-0000-4000-8000-000000000006';

INSERT INTO revenue_distribution_statements(
  id, tenant_id, source_type, source_id, policy_id, period_start, period_end,
  actual_receipt_cents, refund_cents, direct_cost_cents, distributable_cents,
  status, locked_by, locked_at
) VALUES (
  '40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001',
  'SUBSCRIPTION', '40000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000006',
  DATE '2026-08-01', DATE '2026-08-31', 99, 0, 0, 99, 'REVIEW',
  '40000000-0000-4000-8000-000000000002', now()
);
INSERT INTO revenue_distribution_allocations(
  tenant_id, statement_id, beneficiary_id, beneficiary_role, share_bps, allocated_cents
) VALUES
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000003', 'ORIGINATING_BUSINESS', 7000, 69),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000004', 'SHANGZHI', 1000, 10),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000005', 'LEQU_LIFE', 2000, 20);
UPDATE revenue_distribution_statements SET status = 'LOCKED'
 WHERE id = '40000000-0000-4000-8000-000000000007';
SET CONSTRAINTS ALL IMMEDIATE;

INSERT INTO revenue_distribution_entries(
  id, tenant_id, allocation_id, entry_type, amount_cents, idempotency_key, reason_code, created_by
)
SELECT '40000000-0000-4000-8000-000000000009', tenant_id, id, 'ACCRUAL', allocated_cents,
       'distribution-7-business-accrual', 'STATEMENT_LOCKED', '40000000-0000-4000-8000-000000000002'
  FROM revenue_distribution_allocations
 WHERE statement_id = '40000000-0000-4000-8000-000000000007'
   AND beneficiary_role = 'ORIGINATING_BUSINESS';

DO $$
BEGIN
  BEGIN
    UPDATE revenue_distribution_entries SET amount_cents = 70
     WHERE id = '40000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'immutable distribution entry unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'immutable table revenue_distribution_entries%' THEN NULL;
    ELSE RAISE;
    END IF;
  END;
END
$$;

INSERT INTO revenue_distribution_statements(
  id, tenant_id, source_type, source_id, policy_id, period_start, period_end,
  actual_receipt_cents, refund_cents, direct_cost_cents, distributable_cents,
  status, locked_by, locked_at
) VALUES (
  '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001',
  'SUBSCRIPTION', '40000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000006',
  DATE '2026-09-01', DATE '2026-09-30', 99, 0, 0, 99, 'REVIEW',
  '40000000-0000-4000-8000-000000000002', now()
);
INSERT INTO revenue_distribution_allocations(
  tenant_id, statement_id, beneficiary_id, beneficiary_role, share_bps, allocated_cents
) VALUES
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000003', 'ORIGINATING_BUSINESS', 7000, 69),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000004', 'SHANGZHI', 1000, 10),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000005', 'LEQU_LIFE', 2000, 19);

DO $$
BEGIN
  BEGIN
    UPDATE revenue_distribution_statements SET status = 'LOCKED'
     WHERE id = '40000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'one-cent mismatch unexpectedly locked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'locked distribution must reconcile:%' THEN NULL;
    ELSE RAISE;
    END IF;
  END;
END
$$;

ROLLBACK;

\echo 'Distribution reconciliation and immutable-ledger checks passed'
