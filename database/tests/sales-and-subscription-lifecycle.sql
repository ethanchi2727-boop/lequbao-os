\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id,tenant_code,legal_name,display_name) VALUES
  ('25000000-0000-4000-8000-000000000001','sales-lifecycle-gate','Sales Lifecycle Legal','Sales Lifecycle');
INSERT INTO users(id,display_name) VALUES
  ('25000000-0000-4000-8000-000000000002','Sales requester'),
  ('25000000-0000-4000-8000-000000000003','Merchant approver');
INSERT INTO merchant_intake_sessions(id,tenant_id,channel,created_by) VALUES (
  '25000000-0000-4000-8000-000000000004','25000000-0000-4000-8000-000000000001',
  'WEB','25000000-0000-4000-8000-000000000002'
);
INSERT INTO merchant_intake_assets(
  id,tenant_id,session_id,source_channel,asset_type,sha256,security_status,
  processing_status,created_by
) VALUES
  ('25000000-0000-4000-8000-000000000005','25000000-0000-4000-8000-000000000001',
   '25000000-0000-4000-8000-000000000004','WEB','DOCUMENT',repeat('a',64),'SAFE',
   'SUCCEEDED','25000000-0000-4000-8000-000000000002'),
  ('25000000-0000-4000-8000-000000000006','25000000-0000-4000-8000-000000000001',
   '25000000-0000-4000-8000-000000000004','WEB','DOCUMENT',repeat('b',64),'SAFE',
   'SUCCEEDED','25000000-0000-4000-8000-000000000002');

INSERT INTO sales_opportunities(
  id,tenant_id,owner_user_id,legal_subject_name,unified_credit_code_hash,
  evidence_asset_id,first_contact_at,next_action,status
) VALUES (
  '25000000-0000-4000-8000-000000000007','25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002','Sales Gate Merchant',repeat('c',64),
  '25000000-0000-4000-8000-000000000005',now(),'Issue quote','QUALIFIED'
);
INSERT INTO sales_duplicate_checks(
  id,tenant_id,opportunity_id,checked_by,request_hash,result
) VALUES (
  '25000000-0000-4000-8000-000000000008','25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000007','25000000-0000-4000-8000-000000000002',
  repeat('d',64),'CLEAR'
);
INSERT INTO sales_quotes(
  id,tenant_id,opportunity_id,plan_code,list_price_cents,quoted_price_cents,
  status,valid_until,issued_by
) VALUES (
  '25000000-0000-4000-8000-000000000009','25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000007','STANDARD_898_MONTH',89800,89800,
  'ISSUED',now()+interval '1 month','25000000-0000-4000-8000-000000000002'
);
INSERT INTO sales_contracts(
  id,tenant_id,opportunity_id,quote_id,contract_no,contract_asset_id,
  amount_cents,status,privacy_policy_version
) VALUES (
  '25000000-0000-4000-8000-000000000010','25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000007','25000000-0000-4000-8000-000000000009',
  'SALES-GATE-001','25000000-0000-4000-8000-000000000006',89800,'SENT','privacy-v1'
);

DO $$
BEGIN
  BEGIN
    UPDATE sales_duplicate_checks SET result='POTENTIAL_DUPLICATE'
     WHERE id='25000000-0000-4000-8000-000000000008';
    RAISE EXCEPTION 'immutable duplicate check unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='immutable duplicate check unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE sales_contracts SET status='SIGNED'
     WHERE id='25000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'unsigned contract unexpectedly became signed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

UPDATE sales_contracts
   SET status='SIGNED',merchant_signer_ref_hash=repeat('e',64),
       platform_signer_user_id='25000000-0000-4000-8000-000000000002',signed_at=now()
 WHERE id='25000000-0000-4000-8000-000000000010';
INSERT INTO sales_collection_receipts(
  id,tenant_id,contract_id,provider,external_event_id,provider_reference_hash,
  amount_cents,status,occurred_at,recorded_by
) VALUES (
  '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000010','BANK','bank-event-1',repeat('f',64),
  89800,'CONFIRMED',now(),'25000000-0000-4000-8000-000000000002'
);

DO $$
BEGIN
  BEGIN
    UPDATE sales_collection_receipts SET amount_cents=1
     WHERE id='25000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'immutable collection receipt unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='immutable collection receipt unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO subscription_change_requests(
      tenant_id,contract_id,change_type,requested_plan_code,effective_at,reason_code,
      status,requested_by,approved_by,decided_by,decided_at
    ) VALUES (
      '25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000010',
      'ACTIVATE','STANDARD_898_MONTH',now(),'NEW_MERCHANT','APPROVED',
      '25000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000002',
      '25000000-0000-4000-8000-000000000002',now()
    );
    RAISE EXCEPTION 'same-person subscription approval unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

INSERT INTO subscription_change_requests(
  id,tenant_id,contract_id,change_type,requested_plan_code,effective_at,reason_code,
  requested_by
) VALUES (
  '25000000-0000-4000-8000-000000000012','25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000010','ACTIVATE','STANDARD_898_MONTH',now(),
  'NEW_MERCHANT','25000000-0000-4000-8000-000000000002'
);
UPDATE subscription_change_requests
   SET status='APPROVED',approved_by='25000000-0000-4000-8000-000000000003',
       decided_by='25000000-0000-4000-8000-000000000003',decided_at=now()
 WHERE id='25000000-0000-4000-8000-000000000012';
INSERT INTO tenant_subscriptions(
  id,tenant_id,plan_code,status,starts_at,current_period_start,current_period_end
) VALUES (
  '25000000-0000-4000-8000-000000000013','25000000-0000-4000-8000-000000000001',
  'STANDARD_898_MONTH','ACTIVE',now(),now(),now()+interval '1 month'
);
UPDATE subscription_change_requests
   SET status='APPLIED',applied_subscription_id='25000000-0000-4000-8000-000000000013',
       applied_at=now()
 WHERE id='25000000-0000-4000-8000-000000000012';

DO $$
BEGIN
  BEGIN
    INSERT INTO tenant_subscriptions(
      tenant_id,plan_code,status,starts_at,current_period_start,current_period_end
    ) VALUES (
      '25000000-0000-4000-8000-000000000001','PRO_1980_MONTH','ACTIVE',now(),now(),
      now()+interval '1 month'
    );
    RAISE EXCEPTION 'second live subscription unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;

ROLLBACK;

\echo 'Sales evidence immutability, contract signing, collection and dual-control subscription checks passed'
