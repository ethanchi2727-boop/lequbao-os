\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('42000000-0000-4000-8000-000000000001', 'delivery-gate', 'Delivery Gate Legal', 'Delivery Gate');
INSERT INTO users(id, display_name)
VALUES ('42000000-0000-4000-8000-000000000002', 'Delivery accepter');
INSERT INTO merchant_profiles(
  id, tenant_id, legal_subject_name, business_license_object_key,
  contact_name_ciphertext, contact_mobile_ciphertext, industry_code, profile_status
) VALUES (
  '42000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000001',
  'Delivery Merchant', 'license/object', 'cipher-name', 'cipher-mobile', 'LOCAL_LIFE', 'VERIFIED'
);
INSERT INTO stores(
  id, tenant_id, store_code, store_name, status, address_ciphertext,
  longitude, latitude, opening_hours
) VALUES (
  '42000000-0000-4000-8000-000000000004', '42000000-0000-4000-8000-000000000001',
  'DELIVERY-STORE', 'Delivery Store', 'ACTIVE', 'cipher-address', 120, 30,
  '[{"day":1,"open":"09:00","close":"18:00"}]'::jsonb
);
INSERT INTO tenant_subscriptions(
  id, tenant_id, plan_code, status, starts_at, current_period_start, current_period_end
) VALUES (
  '42000000-0000-4000-8000-000000000005', '42000000-0000-4000-8000-000000000001',
  'STANDARD_898_MONTH', 'ACTIVE', now(), now(), now() + interval '1 month'
);
INSERT INTO delivery_projects(
  id, tenant_id, merchant_profile_id, store_id, subscription_id, status,
  progress_percent, owner_user_id
) VALUES (
  '42000000-0000-4000-8000-000000000006', '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000004',
  '42000000-0000-4000-8000-000000000005', 'ACCEPTANCE', 99,
  '42000000-0000-4000-8000-000000000002'
);
INSERT INTO delivery_steps(
  id, tenant_id, project_id, step_code, step_group, required_step, execution_mode, responsibility
) VALUES (
  '42000000-0000-4000-8000-000000000007', '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000006', 'acceptance.merchant_signoff', 'ACCEPTANCE', true,
  'HUMAN_CONFIRMATION', 'MERCHANT'
);
INSERT INTO delivery_steps(
  id, tenant_id, project_id, step_code, step_group, required_step, execution_mode, responsibility
) VALUES (
  '42000000-0000-4000-8000-000000000010', '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000006', 'launch.first_offer', 'LAUNCH', false,
  'HUMAN_CONFIRMATION', 'MERCHANT'
);

DO $$
BEGIN
  BEGIN
    UPDATE delivery_steps SET status='SUCCEEDED'
     WHERE id='42000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'unconfirmed price and refund action unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'unconfirmed price and refund action unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE delivery_projects
       SET status='DELIVERED', progress_percent=100,
           accepted_by='42000000-0000-4000-8000-000000000002', accepted_at=now()
     WHERE id='42000000-0000-4000-8000-000000000006';
    RAISE EXCEPTION 'incomplete delivery acceptance unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'incomplete delivery acceptance unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

UPDATE delivery_steps
   SET status='SUCCEEDED', completed_at=now()
 WHERE id='42000000-0000-4000-8000-000000000007';
INSERT INTO delivery_acceptance_receipts(
  id, tenant_id, project_id, checklist, required_step_snapshot,
  accepted_by_ids, accepted_at, receipt_hash
) VALUES (
  '42000000-0000-4000-8000-000000000008', '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000006', '{"merchantSignoff":true}'::jsonb,
  '[{"stepCode":"acceptance.merchant_signoff","status":"SUCCEEDED"}]'::jsonb,
  ARRAY['42000000-0000-4000-8000-000000000002'::uuid], now(), repeat('a', 64)
);
UPDATE delivery_projects
   SET status='DELIVERED', progress_percent=100,
       accepted_by='42000000-0000-4000-8000-000000000002', accepted_at=now()
 WHERE id='42000000-0000-4000-8000-000000000006';

INSERT INTO delivery_step_attempts(
  id, tenant_id, project_id, step_id, attempt_no, action_version, idempotency_key,
  status, input_snapshot
) VALUES (
  '42000000-0000-4000-8000-000000000009', '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000006', '42000000-0000-4000-8000-000000000007',
  1, 1, 'delivery:project:signoff:v1', 'RUNNING', '{"confirmation":true}'::jsonb
);
UPDATE delivery_step_attempts
   SET status='SUCCEEDED', output_snapshot='{"receipt":"ok"}'::jsonb, completed_at=now()
 WHERE id='42000000-0000-4000-8000-000000000009';

DO $$
BEGIN
  BEGIN
    UPDATE delivery_step_attempts SET output_snapshot='{"receipt":"changed"}'::jsonb
     WHERE id='42000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'completed attempt unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'completed attempt unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE delivery_acceptance_receipts SET checklist='{"merchantSignoff":false}'::jsonb
     WHERE id='42000000-0000-4000-8000-000000000008';
    RAISE EXCEPTION 'acceptance receipt unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'acceptance receipt unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO delivery_project_assignments(
      tenant_id, project_id, assignee_user_id, granted_by, expires_at
    ) VALUES (
      '42000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000006',
      '42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002',
      now() + interval '31 days'
    );
    RAISE EXCEPTION 'overlong temporary delivery access unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

ROLLBACK;

\echo 'Delivery required-step acceptance, immutable evidence and temporary-access checks passed'
