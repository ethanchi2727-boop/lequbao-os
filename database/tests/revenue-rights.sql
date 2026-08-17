\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('30000000-0000-4000-8000-000000000001', 'revenue-test', 'Revenue Test Legal', 'Revenue Test');
INSERT INTO users(id, display_name) VALUES
  ('30000000-0000-4000-8000-000000000002', 'Creator'),
  ('30000000-0000-4000-8000-000000000003', 'Business A'),
  ('30000000-0000-4000-8000-000000000004', 'Business B');
INSERT INTO merchant_profiles(id, tenant_id, legal_subject_name, industry_code, profile_status) VALUES
  ('30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'Merchant Legal', 'LOCAL_LIFE', 'VERIFIED');
INSERT INTO revenue_beneficiaries(id, beneficiary_type, user_id, legal_name, status) VALUES
  ('30000000-0000-4000-8000-000000000006', 'BUSINESS_PERSON', '30000000-0000-4000-8000-000000000003', 'Business A', 'ACTIVE'),
  ('30000000-0000-4000-8000-000000000007', 'BUSINESS_PERSON', '30000000-0000-4000-8000-000000000004', 'Business B', 'ACTIVE');

INSERT INTO merchant_revenue_right_groups(
  id, tenant_id, merchant_profile_id, status, source_contract_ref, starts_at, created_by
) VALUES (
  '30000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000005', 'PENDING', 'contract-revenue-test', now(),
  '30000000-0000-4000-8000-000000000002'
);
INSERT INTO merchant_revenue_right_holders(tenant_id, right_group_id, beneficiary_id, share_bps, starts_at) VALUES
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000006', 4000, now()),
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000007', 3000, now());
UPDATE merchant_revenue_right_groups
   SET status = 'ACTIVE'
 WHERE id = '30000000-0000-4000-8000-000000000008';

INSERT INTO revenue_share_policies(
  id, tenant_id, policy_type, policy_version, cost_basis, status, effective_from, approved_by, approved_at
) VALUES (
  '30000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000001',
  'SUBSCRIPTION', 1, 'DIRECT_ACTUAL_COST', 'DRAFT', now(), '30000000-0000-4000-8000-000000000002', now()
);
INSERT INTO revenue_share_policy_splits(tenant_id, policy_id, beneficiary_role, share_bps) VALUES
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000009', 'ORIGINATING_BUSINESS', 7000),
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000009', 'SHANGZHI', 1000),
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000009', 'LEQU_LIFE', 2000);
UPDATE revenue_share_policies SET status = 'ACTIVE'
 WHERE id = '30000000-0000-4000-8000-000000000009';

SET CONSTRAINTS ALL IMMEDIATE;

DO $$
DECLARE
  right_total integer;
  policy_total integer;
BEGIN
  SELECT sum(share_bps) INTO right_total
    FROM merchant_revenue_right_holders
   WHERE right_group_id = '30000000-0000-4000-8000-000000000008' AND status = 'ACTIVE';
  SELECT sum(share_bps) INTO policy_total
    FROM revenue_share_policy_splits
   WHERE policy_id = '30000000-0000-4000-8000-000000000009';
  IF right_total <> 7000 THEN RAISE EXCEPTION 'right total is %, expected 7000', right_total; END IF;
  IF policy_total <> 10000 THEN RAISE EXCEPTION 'policy total is %, expected 10000', policy_total; END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO merchant_revenue_right_groups(
      tenant_id, merchant_profile_id, status, source_contract_ref, starts_at, created_by
    ) VALUES (
      '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005',
      'ACTIVE', 'duplicate-contract', now(), '30000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'duplicate active right unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;

ROLLBACK;

\echo 'Revenue-right and frozen policy checks passed'
