\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES
  ('39000000-0000-4000-8000-000000000001', 'right-governance', 'Right Governance Legal', 'Right Governance'),
  ('39000000-0000-4000-8000-000000000014', 'right-dispute', 'Right Dispute Legal', 'Right Dispute');
INSERT INTO users(id, display_name) VALUES
  ('39000000-0000-4000-8000-000000000002', 'Current holder'),
  ('39000000-0000-4000-8000-000000000003', 'New holder'),
  ('39000000-0000-4000-8000-000000000004', 'Independent approver');
INSERT INTO merchant_profiles(id, tenant_id, legal_subject_name, industry_code, profile_status) VALUES
  ('39000000-0000-4000-8000-000000000005', '39000000-0000-4000-8000-000000000001', 'Transfer merchant', 'LOCAL_LIFE', 'VERIFIED'),
  ('39000000-0000-4000-8000-000000000006', '39000000-0000-4000-8000-000000000014', 'Dispute merchant', 'LOCAL_LIFE', 'VERIFIED');
INSERT INTO revenue_beneficiaries(id, beneficiary_type, user_id, legal_name, status) VALUES
  ('39000000-0000-4000-8000-000000000007', 'BUSINESS_PERSON', '39000000-0000-4000-8000-000000000002', 'Current holder', 'ACTIVE'),
  ('39000000-0000-4000-8000-000000000008', 'BUSINESS_PERSON', '39000000-0000-4000-8000-000000000003', 'New holder', 'ACTIVE');
INSERT INTO merchant_revenue_right_groups(
  id, tenant_id, merchant_profile_id, status, source_contract_ref, starts_at, created_by
) VALUES
  ('39000000-0000-4000-8000-000000000009', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000005', 'PENDING', 'transfer-contract', now(), '39000000-0000-4000-8000-000000000002'),
  ('39000000-0000-4000-8000-000000000010', '39000000-0000-4000-8000-000000000014', '39000000-0000-4000-8000-000000000006', 'PENDING', 'dispute-contract', now(), '39000000-0000-4000-8000-000000000002');
INSERT INTO merchant_revenue_right_holders(
  id, tenant_id, right_group_id, beneficiary_id, share_bps, starts_at
) VALUES
  ('39000000-0000-4000-8000-000000000011', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000009', '39000000-0000-4000-8000-000000000007', 7000, now()),
  ('39000000-0000-4000-8000-000000000012', '39000000-0000-4000-8000-000000000014', '39000000-0000-4000-8000-000000000010', '39000000-0000-4000-8000-000000000007', 7000, now());
UPDATE merchant_revenue_right_groups SET status = 'ACTIVE'
 WHERE id IN ('39000000-0000-4000-8000-000000000009', '39000000-0000-4000-8000-000000000010');
SET CONSTRAINTS ALL IMMEDIATE;

INSERT INTO revenue_right_transfers(
  id, tenant_id, right_holder_id, from_beneficiary_id, to_beneficiary_id,
  status, requested_by, agreement_object_key
) VALUES (
  '39000000-0000-4000-8000-000000000013', '39000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000011', '39000000-0000-4000-8000-000000000007',
  '39000000-0000-4000-8000-000000000008', 'WAITING_CONFIRMATIONS',
  '39000000-0000-4000-8000-000000000002', 'evidence/transfer-13.pdf'
);

DO $$
BEGIN
  BEGIN
    UPDATE revenue_right_transfers
       SET status = 'APPROVED', approved_by = '39000000-0000-4000-8000-000000000004'
     WHERE id = '39000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'approval without both confirmations unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'approval without both confirmations unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO revenue_right_transfer_confirmations(
      tenant_id, transfer_id, confirmation_role, beneficiary_id, confirmed_by
    ) VALUES (
      '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000013',
      'FROM_BENEFICIARY', '39000000-0000-4000-8000-000000000008', '39000000-0000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'mismatched beneficiary confirmation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'mismatched beneficiary confirmation unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO revenue_right_transfer_confirmations(
  tenant_id, transfer_id, confirmation_role, beneficiary_id, confirmed_by
) VALUES
  ('39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000013', 'FROM_BENEFICIARY', '39000000-0000-4000-8000-000000000007', '39000000-0000-4000-8000-000000000002'),
  ('39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000013', 'TO_BENEFICIARY', '39000000-0000-4000-8000-000000000008', '39000000-0000-4000-8000-000000000003');

DO $$
BEGIN
  BEGIN
    UPDATE revenue_right_transfers
       SET status = 'APPROVED', approved_by = requested_by
     WHERE id = '39000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'same-person approval unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'same-person approval unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

UPDATE revenue_right_transfers
   SET status = 'EFFECTIVE', approved_by = '39000000-0000-4000-8000-000000000004', effective_at = now()
 WHERE id = '39000000-0000-4000-8000-000000000013';

INSERT INTO revenue_right_disputes(
  tenant_id, right_group_id, claimant_beneficiary_ids, reason_code, opened_by
) VALUES (
  '39000000-0000-4000-8000-000000000014', '39000000-0000-4000-8000-000000000010',
  ARRAY['39000000-0000-4000-8000-000000000007'::uuid, '39000000-0000-4000-8000-000000000008'::uuid],
  'JOINT_DISPUTE', '39000000-0000-4000-8000-000000000002'
);

DO $$
DECLARE frozen_status text;
BEGIN
  SELECT status INTO frozen_status FROM merchant_revenue_right_groups
   WHERE id = '39000000-0000-4000-8000-000000000010';
  IF frozen_status <> 'DISPUTED' THEN
    RAISE EXCEPTION 'open dispute did not atomically freeze the right group';
  END IF;
END
$$;

ROLLBACK;

\echo 'Revenue-right transfer confirmation, dual approval and dispute freeze checks passed'
