\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('80000000-0000-4000-8000-000000000001', 'payout-test', 'Payout Legal', 'Payout');
INSERT INTO users(id, display_name) VALUES
  ('80000000-0000-4000-8000-000000000002', 'Finance Requester'),
  ('80000000-0000-4000-8000-000000000003', 'Finance Approver');
INSERT INTO tenant_memberships(tenant_id, user_id, membership_status) VALUES
  ('80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'ACTIVE'),
  ('80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000003', 'ACTIVE');
INSERT INTO member_role_assignments(tenant_id, user_id, role_code) VALUES
  ('80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'PLATFORM_FINANCE'),
  ('80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000003', 'PLATFORM_FINANCE');
INSERT INTO revenue_beneficiaries(id, beneficiary_type, legal_name, status)
VALUES ('80000000-0000-4000-8000-000000000004', 'LEQU_LIFE_ENTITY', 'Lequ Life', 'ACTIVE');
INSERT INTO revenue_share_policies(
  id, tenant_id, policy_type, policy_version, cost_basis, status, effective_from, approved_by, approved_at
) VALUES (
  '80000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000001',
  'SUBSCRIPTION', 1, 'DIRECT_ACTUAL_COST', 'DRAFT', now(), '80000000-0000-4000-8000-000000000003', now()
);
INSERT INTO revenue_share_policy_splits(tenant_id, policy_id, beneficiary_role, share_bps)
VALUES ('80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000005', 'LEQU_LIFE', 10000);

INSERT INTO revenue_distribution_statements(
  id, tenant_id, source_type, source_id, policy_id, period_start, period_end,
  actual_receipt_cents, refund_cents, direct_cost_cents, distributable_cents,
  status, locked_by, locked_at
) VALUES (
  '80000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000001',
  'SUBSCRIPTION', '80000000-0000-4000-8000-000000000007', '80000000-0000-4000-8000-000000000005',
  DATE '2026-08-01', DATE '2026-08-31', 100, 0, 0, 100, 'REVIEW',
  '80000000-0000-4000-8000-000000000002', now()
);
INSERT INTO revenue_distribution_allocations(
  id, tenant_id, statement_id, beneficiary_id, beneficiary_role, share_bps, allocated_cents
) VALUES (
  '80000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000004',
  'LEQU_LIFE', 10000, 100
);
UPDATE revenue_distribution_statements SET status = 'LOCKED'
 WHERE id = '80000000-0000-4000-8000-000000000006';
INSERT INTO revenue_distribution_entries(
  id, tenant_id, allocation_id, entry_type, amount_cents, idempotency_key, reason_code, created_by
) VALUES (
  '80000000-0000-4000-8000-000000000009', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000008', 'ACCRUAL', 100, 'payout-test-accrual',
  'STATEMENT_LOCKED', '80000000-0000-4000-8000-000000000002'
);
SET CONSTRAINTS ALL IMMEDIATE;

INSERT INTO revenue_distribution_action_approvals(
  id, tenant_id, statement_id, action_type, request_hash, reason_code, requested_by, expires_at
) VALUES (
  '80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000006', 'PAY', repeat('a', 64), 'OBSERVATION_COMPLETE',
  '80000000-0000-4000-8000-000000000002', now() + interval '1 hour'
);

DO $$
BEGIN
  BEGIN
    UPDATE revenue_distribution_action_approvals
       SET status = 'APPROVED', approved_by = requested_by, approved_at = now()
     WHERE id = '80000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'same-person approval unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

UPDATE revenue_distribution_action_approvals
   SET status = 'APPROVED', approved_by = '80000000-0000-4000-8000-000000000003', approved_at = now()
 WHERE id = '80000000-0000-4000-8000-000000000010';
UPDATE revenue_distribution_statements SET status = 'PAYABLE'
 WHERE id = '80000000-0000-4000-8000-000000000006';
UPDATE revenue_distribution_allocations SET status = 'PAYABLE'
 WHERE id = '80000000-0000-4000-8000-000000000008';

DO $$
BEGIN
  BEGIN
    INSERT INTO revenue_payout_attempts(
      tenant_id, allocation_id, approval_id, amount_cents, provider, idempotency_key,
      status, requested_by, completed_at
    ) VALUES (
      '80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000008',
      '80000000-0000-4000-8000-000000000010', 100, 'WECHAT', 'missing-provider-proof',
      'SUCCEEDED', '80000000-0000-4000-8000-000000000003', now()
    );
    RAISE EXCEPTION 'successful payout without provider evidence unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

INSERT INTO revenue_payout_attempts(
  id, tenant_id, allocation_id, approval_id, amount_cents, provider, provider_payment_ref_hash,
  idempotency_key, status, requested_by, completed_at
) VALUES (
  '80000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000010',
  100, 'WECHAT', repeat('b', 64), 'payout-attempt-success', 'SUCCEEDED',
  '80000000-0000-4000-8000-000000000003', now()
);
INSERT INTO revenue_distribution_entries(
  id, tenant_id, allocation_id, entry_type, amount_cents, idempotency_key,
  original_entry_id, reason_code, created_by
) VALUES (
  '80000000-0000-4000-8000-000000000012', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000008', 'PAYMENT', -100, 'payment-entry-success',
  '80000000-0000-4000-8000-000000000009', 'PROVIDER_PAYMENT_SUCCEEDED',
  '80000000-0000-4000-8000-000000000003'
);
UPDATE revenue_distribution_allocations SET status = 'PAID'
 WHERE id = '80000000-0000-4000-8000-000000000008';
UPDATE revenue_distribution_statements SET status = 'PAID'
 WHERE id = '80000000-0000-4000-8000-000000000006';
UPDATE revenue_distribution_action_approvals SET status = 'CONSUMED', consumed_at = now()
 WHERE id = '80000000-0000-4000-8000-000000000010';

INSERT INTO revenue_distribution_action_approvals(
  id, tenant_id, statement_id, action_type, request_hash, reason_code, requested_by, expires_at
) VALUES (
  '80000000-0000-4000-8000-000000000013', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000006', 'REVERSE', repeat('c', 64), 'SUBSCRIPTION_REFUND',
  '80000000-0000-4000-8000-000000000002', now() + interval '1 hour'
);
UPDATE revenue_distribution_action_approvals
   SET status = 'APPROVED', approved_by = '80000000-0000-4000-8000-000000000003', approved_at = now()
 WHERE id = '80000000-0000-4000-8000-000000000013';
INSERT INTO revenue_distribution_entries(
  tenant_id, allocation_id, entry_type, amount_cents, idempotency_key,
  original_entry_id, reason_code, created_by
) VALUES (
  '80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000008',
  'REVERSAL', 100, 'reversal-entry-success', '80000000-0000-4000-8000-000000000012',
  'SUBSCRIPTION_REFUND', '80000000-0000-4000-8000-000000000003'
);
UPDATE revenue_distribution_statements SET status = 'REVERSED'
 WHERE id = '80000000-0000-4000-8000-000000000006';
UPDATE revenue_distribution_allocations SET status = 'REVERSED'
 WHERE id = '80000000-0000-4000-8000-000000000008';
UPDATE revenue_distribution_action_approvals SET status = 'CONSUMED', consumed_at = now()
 WHERE id = '80000000-0000-4000-8000-000000000013';

DO $$
BEGIN
  BEGIN
    UPDATE revenue_payout_attempts SET provider_payment_ref_hash = repeat('d', 64)
     WHERE id = '80000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'provider payout evidence unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'immutable table revenue_payout_attempts%' THEN NULL; ELSE RAISE; END IF;
  END;
END
$$;

ROLLBACK;

\echo 'Distribution dual approval, payout evidence and reversal linkage checks passed'
