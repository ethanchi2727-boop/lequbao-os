\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id,tenant_code,legal_name,display_name)
VALUES ('4a000000-0000-4000-8000-000000000001','commerce-gate','Commerce Gate Legal','Commerce Gate');
INSERT INTO users(id,display_name)
VALUES
  ('4a000000-0000-4000-8000-000000000002','Refund Requester'),
  ('4a000000-0000-4000-8000-000000000003','Refund Approver');
INSERT INTO stores(id,tenant_id,store_code,store_name,status)
VALUES
  ('4a000000-0000-4000-8000-000000000004','4a000000-0000-4000-8000-000000000001','COM-A','Commerce A','ACTIVE'),
  ('4a000000-0000-4000-8000-000000000005','4a000000-0000-4000-8000-000000000001','COM-B','Commerce B','ACTIVE');
INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash,status)
VALUES ('4a000000-0000-4000-8000-000000000006','4a000000-0000-4000-8000-000000000001',repeat('a',64),'ACTIVE');
INSERT INTO products(id,tenant_id,store_id,product_type,title,status,sale_price_cents,reward_rule_snapshot)
VALUES (
  '4a000000-0000-4000-8000-000000000007','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000004','GROUP_BUY','双人套餐','ON_SALE',500,
  '{"version":"reward-v1","amount_cents":50,"funding_source":"MERCHANT"}'::jsonb
);
INSERT INTO product_variants(id,tenant_id,product_id,sku_code,title,sale_price_cents,status)
VALUES (
  '4a000000-0000-4000-8000-000000000008','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000007','COM-GROUP-1','标准券',500,'ACTIVE'
);
INSERT INTO inventory_balances(tenant_id,variant_id,on_hand,reserved)
VALUES ('4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000008',5,0);

INSERT INTO inventory_ledger(
  tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
) VALUES (
  '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000008',
  'RESERVE',2,'ORDER','4a000000-0000-4000-8000-000000000009','reserve:order-9'
);
-- Exact replay must be a no-op, including the balance projection.
INSERT INTO inventory_ledger(
  tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
) VALUES (
  '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000008',
  'RESERVE',2,'ORDER','4a000000-0000-4000-8000-000000000009','reserve:order-9'
);

DO $$
DECLARE balance_reserved bigint;
BEGIN
  SELECT reserved INTO balance_reserved FROM inventory_balances
   WHERE tenant_id='4a000000-0000-4000-8000-000000000001'
     AND variant_id='4a000000-0000-4000-8000-000000000008';
  IF balance_reserved<>2 THEN RAISE EXCEPTION 'inventory replay changed reservation'; END IF;
  BEGIN
    INSERT INTO inventory_ledger(
      tenant_id,variant_id,operation,quantity,business_type,business_id,idempotency_key
    ) VALUES (
      '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000008',
      'RESERVE',4,'ORDER','4a000000-0000-4000-8000-000000000010','reserve:oversell'
    );
    RAISE EXCEPTION 'oversold inventory unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='oversold inventory unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO merchant_payment_accounts(
  id,tenant_id,provider,provider_account_hash,credential_secret_ref,settlement_subject_ref,
  status,confirmed_by,confirmation_ref,confirmed_at
) VALUES (
  '4a000000-0000-4000-8000-000000000011','4a000000-0000-4000-8000-000000000001',
  'SANDBOX',repeat('b',64),'secret://payments/commerce-gate','subject://merchant-commerce-gate',
  'ACTIVE','4a000000-0000-4000-8000-000000000002','confirm://payment-account',now()
);
INSERT INTO orders(
  id,tenant_id,order_no,store_id,customer_id,source_channel,status,order_type,payment_status,
  fulfillment_status,verification_status,goods_amount_cents,discount_amount_cents,payable_amount_cents,
  paid_amount_cents,currency,expires_at,paid_at
) VALUES (
  '4a000000-0000-4000-8000-000000000009','4a000000-0000-4000-8000-000000000001','COM-ORDER-9',
  '4a000000-0000-4000-8000-000000000004','4a000000-0000-4000-8000-000000000006',
  'MERCHANT_MINI_PROGRAM','PAID','GROUP_BUY','PAID','NOT_STARTED','AVAILABLE',1000,0,1000,1000,
  'CNY',now()+interval '15 minutes',now()
);
INSERT INTO order_items(
  id,tenant_id,order_id,product_id,variant_id,title_snapshot,quantity,unit_price_cents,line_amount_cents
) VALUES (
  '4a000000-0000-4000-8000-000000000012','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000009','4a000000-0000-4000-8000-000000000007',
  '4a000000-0000-4000-8000-000000000008','双人套餐',2,500,1000
);
INSERT INTO payment_intents(
  id,tenant_id,order_id,provider,merchant_payment_account_ref,merchant_payment_account_id,
  provider_payment_id,amount_cents,status,idempotency_key,client_request_hash,succeeded_at
) VALUES (
  '4a000000-0000-4000-8000-000000000013','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000009','SANDBOX','subject://merchant-commerce-gate',
  '4a000000-0000-4000-8000-000000000011','provider-payment-13',1000,'SUCCEEDED',
  'payment:intent:13',repeat('c',64),now()
);
INSERT INTO payment_callback_receipts(
  id,tenant_id,provider,provider_event_id,provider_event_hash,payload_object_ref,payload_hash,
  signature_verified,event_type,payment_intent_id,processing_status,provider_occurred_at
) VALUES (
  '4a000000-0000-4000-8000-000000000014','4a000000-0000-4000-8000-000000000001',
  'SANDBOX','provider-event-14',repeat('d',64),'object://provider/event-14',repeat('e',64),true,
  'PAYMENT_SUCCEEDED','4a000000-0000-4000-8000-000000000013','RECEIVED',now()
);
UPDATE payment_callback_receipts SET processing_status='APPLIED',applied_at=now()
 WHERE id='4a000000-0000-4000-8000-000000000014';

DO $$
BEGIN
  BEGIN
    INSERT INTO payment_callback_receipts(
      tenant_id,provider,provider_event_id,provider_event_hash,payload_object_ref,payload_hash,
      signature_verified,event_type,payment_intent_id,provider_occurred_at
    ) VALUES (
      '4a000000-0000-4000-8000-000000000001','SANDBOX','provider-event-14',repeat('f',64),
      'object://provider/conflict',repeat('f',64),true,'PAYMENT_SUCCEEDED',
      '4a000000-0000-4000-8000-000000000013',now()
    );
    RAISE EXCEPTION 'provider event replay conflict unexpectedly persisted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;

INSERT INTO refunds(
  id,tenant_id,refund_no,order_id,payment_intent_id,amount_cents,reason_code,status,
  idempotency_key,requested_by,approval_policy_snapshot
) VALUES (
  '4a000000-0000-4000-8000-000000000015','4a000000-0000-4000-8000-000000000001','COM-REFUND-15',
  '4a000000-0000-4000-8000-000000000009','4a000000-0000-4000-8000-000000000013',200,
  'CUSTOMER_REQUEST','APPROVAL_REQUIRED','refund:15','4a000000-0000-4000-8000-000000000002',
  '{"version":"refund-v1","threshold_cents":100}'::jsonb
);
INSERT INTO refund_items(id,tenant_id,refund_id,order_item_id,quantity,amount_cents)
VALUES (
  '4a000000-0000-4000-8000-000000000016','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000015','4a000000-0000-4000-8000-000000000012',1,200
);
INSERT INTO refund_approvals(
  id,tenant_id,refund_id,requested_by,decided_by,status,request_reason,decision_reason,
  decided_at,expires_at
) VALUES (
  '4a000000-0000-4000-8000-000000000017','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000015','4a000000-0000-4000-8000-000000000002',
  '4a000000-0000-4000-8000-000000000003','APPROVED','HIGH_VALUE','policy passed',now(),
  now()+interval '1 hour'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO refunds(
      id,tenant_id,refund_no,order_id,payment_intent_id,amount_cents,reason_code,status,
      idempotency_key,requested_by
    ) VALUES (
      '4a000000-0000-4000-8000-000000000018','4a000000-0000-4000-8000-000000000001',
      'COM-REFUND-18','4a000000-0000-4000-8000-000000000009',
      '4a000000-0000-4000-8000-000000000013',900,'EXCESS','REQUESTED','refund:18',
      '4a000000-0000-4000-8000-000000000002'
    );
    INSERT INTO refund_items(tenant_id,refund_id,order_item_id,quantity,amount_cents)
    VALUES (
      '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000018',
      '4a000000-0000-4000-8000-000000000012',2,900
    );
    RAISE EXCEPTION 'refund beyond original scope unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='refund beyond original scope unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO verification_entitlements(
  id,tenant_id,order_item_id,order_id,verification_code_hash,total_uses,used_uses,status,
  valid_from,valid_until,allowed_store_ids
) VALUES (
  '4a000000-0000-4000-8000-000000000019','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000012','4a000000-0000-4000-8000-000000000009',
  repeat('1',64),2,0,'AVAILABLE',now()-interval '1 hour',now()+interval '1 day',
  ARRAY['4a000000-0000-4000-8000-000000000004'::uuid]
);

DO $$
BEGIN
  BEGIN
    INSERT INTO verification_uses(
      tenant_id,entitlement_id,store_id,quantity,verifier_user_id,idempotency_key,token_digest,trace_id
    ) VALUES (
      '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000019',
      '4a000000-0000-4000-8000-000000000005',1,'4a000000-0000-4000-8000-000000000002',
      'verify:wrong-store',repeat('1',64),'trace-wrong-store'
    );
    RAISE EXCEPTION 'wrong-store verification unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='wrong-store verification unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO verification_entitlements(
  id,tenant_id,order_item_id,order_id,verification_code_hash,total_uses,used_uses,status,
  valid_from,valid_until,allowed_store_ids
) VALUES (
  '4a000000-0000-4000-8000-000000000026','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000012','4a000000-0000-4000-8000-000000000009',
  repeat('2',64),1,0,'AVAILABLE',now()-interval '2 days',now()-interval '1 day',
  ARRAY['4a000000-0000-4000-8000-000000000004'::uuid]
);

DO $$
BEGIN
  BEGIN
    INSERT INTO verification_uses(
      tenant_id,entitlement_id,store_id,quantity,verifier_user_id,idempotency_key,token_digest,trace_id
    ) VALUES (
      '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000026',
      '4a000000-0000-4000-8000-000000000004',1,'4a000000-0000-4000-8000-000000000002',
      'verify:expired',repeat('2',64),'trace-expired'
    );
    RAISE EXCEPTION 'expired verification unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='expired verification unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO verification_uses(
  id,tenant_id,entitlement_id,store_id,quantity,verifier_user_id,idempotency_key,token_digest,trace_id
) VALUES (
  '4a000000-0000-4000-8000-000000000020','4a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000019','4a000000-0000-4000-8000-000000000004',1,
  '4a000000-0000-4000-8000-000000000002','verify:20',repeat('1',64),'trace-verify-20'
);
INSERT INTO verification_uses(
  tenant_id,entitlement_id,store_id,quantity,verifier_user_id,idempotency_key,token_digest,trace_id
) VALUES (
  '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000019',
  '4a000000-0000-4000-8000-000000000004',1,'4a000000-0000-4000-8000-000000000002',
  'verify:20',repeat('1',64),'trace-verify-replay'
);

-- REW-001: every grant is represented by at least two entries whose sum is zero.
INSERT INTO reward_accounts(id,tenant_id,owner_type,owner_id,status)
VALUES
  ('4a000000-0000-4000-8000-000000000021','4a000000-0000-4000-8000-000000000001','CUSTOMER','4a000000-0000-4000-8000-000000000006','ACTIVE'),
  ('4a000000-0000-4000-8000-000000000022','4a000000-0000-4000-8000-000000000001','MERCHANT_FUND',NULL,'ACTIVE');
INSERT INTO ledger_transactions(
  id,tenant_id,transaction_type,business_type,business_id,rule_snapshot,occurred_at
) VALUES (
  '4a000000-0000-4000-8000-000000000023','4a000000-0000-4000-8000-000000000001',
  'REWARD_GRANT','ORDER','4a000000-0000-4000-8000-000000000009','{"version":"reward-v1"}',now()
);
INSERT INTO ledger_entries(tenant_id,transaction_id,account_id,amount_cents)
VALUES
  ('4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000023','4a000000-0000-4000-8000-000000000021',50),
  ('4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000023','4a000000-0000-4000-8000-000000000022',-50);

DO $$
BEGIN
  -- REW-004: a deferred constraint rejects an unbalanced manual transaction.
  BEGIN
    UPDATE ledger_entries SET amount_cents=51
     WHERE transaction_id='4a000000-0000-4000-8000-000000000023' AND amount_cents=50;
    RAISE EXCEPTION 'reward ledger history unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='reward ledger history unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO ledger_transactions(
      id,tenant_id,transaction_type,business_type,business_id,occurred_at
    ) VALUES (
      '4a000000-0000-4000-8000-000000000024','4a000000-0000-4000-8000-000000000001',
      'REWARD_GRANT','ORDER','4a000000-0000-4000-8000-000000000024',now()
    );
    INSERT INTO ledger_entries(tenant_id,transaction_id,account_id,amount_cents)
    VALUES (
      '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000024',
      '4a000000-0000-4000-8000-000000000021',1
    );
    SET CONSTRAINTS ledger_entries_balance_trigger IMMEDIATE;
    RAISE EXCEPTION 'unbalanced reward transaction unexpectedly committed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='unbalanced reward transaction unexpectedly committed' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO commerce_reconciliation_batches(
  id,tenant_id,business_date,provider,provider_bill_object_ref,provider_bill_hash,status,
  order_paid_cents,provider_paid_cents,order_refunded_cents,provider_refunded_cents,
  difference_cents,completed_at
) VALUES (
  '4a000000-0000-4000-8000-000000000025','4a000000-0000-4000-8000-000000000001',
  current_date,'SANDBOX','object://provider/bill',repeat('2',64),'DIFFERENCE_FOUND',1000,1001,0,0,1,now()
);
INSERT INTO commerce_reconciliation_discrepancies(
  tenant_id,batch_id,reason_code,amount_cents,status
) VALUES (
  '4a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000025',
  'PROVIDER_AMOUNT_MISMATCH',1,'OPEN'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO commerce_reconciliation_batches(
      tenant_id,business_date,provider,provider_bill_object_ref,provider_bill_hash,status,
      order_paid_cents,provider_paid_cents,difference_cents,completed_at
    ) VALUES (
      '4a000000-0000-4000-8000-000000000001',current_date-1,'SANDBOX',
      'object://provider/false-balanced',repeat('3',64),'BALANCED',1000,1001,1,now()
    );
    RAISE EXCEPTION 'one-cent difference unexpectedly balanced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

ROLLBACK;
\echo 'Commerce inventory, payment replay, refund scope, verification, reward and reconciliation guards passed'
