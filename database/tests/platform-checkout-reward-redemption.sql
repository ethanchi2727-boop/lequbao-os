\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id,tenant_code,legal_name,display_name)
VALUES ('56000000-0000-4000-8000-000000000001','redemption-test','Redemption Legal','Redemption');
INSERT INTO stores(id,tenant_id,store_code,store_name,status)
VALUES ('56000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000001','REDEMPTION','Redemption Store','ACTIVE');
INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash) VALUES
  ('56000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000001',repeat('a',64)),
  ('56000000-0000-4000-8000-000000000004','56000000-0000-4000-8000-000000000001',repeat('b',64));
INSERT INTO platform_consumer_accounts(id,union_identifier_hash) VALUES
  ('56000000-0000-4000-8000-000000000005',repeat('c',64)),
  ('56000000-0000-4000-8000-000000000006',repeat('d',64));
INSERT INTO shopping_carts(id,account_id) VALUES
  ('56000000-0000-4000-8000-000000000007','56000000-0000-4000-8000-000000000005'),
  ('56000000-0000-4000-8000-000000000008','56000000-0000-4000-8000-000000000006');
INSERT INTO platform_checkout_sessions(
  id,account_id,cart_id,cart_version,idempotency_key,request_hash,goods_amount_cents,
  discount_amount_cents,shipping_amount_cents,payable_amount_cents,expires_at
) VALUES
  ('56000000-0000-4000-8000-000000000009','56000000-0000-4000-8000-000000000005','56000000-0000-4000-8000-000000000007',1,'redemption-a',repeat('1',64),1000,0,0,1000,now()+interval '10 minutes'),
  ('56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000006','56000000-0000-4000-8000-000000000008',1,'redemption-b',repeat('2',64),1000,0,0,1000,now()+interval '10 minutes');
INSERT INTO platform_checkout_groups(
  id,checkout_id,account_id,merchant_tenant_id,customer_id,store_id,order_type,
  item_snapshot,policy_snapshot,discount_snapshot,
  goods_amount_cents,discount_amount_cents,shipping_amount_cents,payable_amount_cents
) VALUES
  ('56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000009','56000000-0000-4000-8000-000000000005','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000002','STORE_PICKUP','[]','{}','{}',1000,0,0,1000),
  ('56000000-0000-4000-8000-000000000012','56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000006','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000004','56000000-0000-4000-8000-000000000002','STORE_PICKUP','[]','{}','{}',1000,0,0,1000);
INSERT INTO reward_accounts(id,tenant_id,owner_type,owner_id) VALUES
  ('56000000-0000-4000-8000-000000000013','56000000-0000-4000-8000-000000000001','CUSTOMER','56000000-0000-4000-8000-000000000003'),
  ('56000000-0000-4000-8000-000000000014','56000000-0000-4000-8000-000000000001','CUSTOMER','56000000-0000-4000-8000-000000000004');
INSERT INTO ledger_transactions(id,tenant_id,transaction_type,business_type,business_id,occurred_at) VALUES
  ('56000000-0000-4000-8000-000000000015','56000000-0000-4000-8000-000000000001','REWARD_GRANT','TEST','56000000-0000-4000-8000-000000000017',now()),
  ('56000000-0000-4000-8000-000000000016','56000000-0000-4000-8000-000000000001','REWARD_GRANT','TEST','56000000-0000-4000-8000-000000000018',now());
INSERT INTO reward_grants(
  id,tenant_id,customer_id,account_id,grant_transaction_id,rule_version,
  funding_source,granted_amount_cents,status,available_at
) VALUES
  ('56000000-0000-4000-8000-000000000019','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000013','56000000-0000-4000-8000-000000000015','TEST','MERCHANT',1000,'AVAILABLE',now()),
  ('56000000-0000-4000-8000-000000000020','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000004','56000000-0000-4000-8000-000000000014','56000000-0000-4000-8000-000000000016','TEST','MERCHANT',1000,'AVAILABLE',now());
INSERT INTO platform_checkout_reward_redemptions(
  id,checkout_id,checkout_group_id,account_id,merchant_tenant_id,customer_id,reward_grant_id,amount_cents
) VALUES
  ('56000000-0000-4000-8000-000000000021','56000000-0000-4000-8000-000000000009','56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000005','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000019',500),
  ('56000000-0000-4000-8000-000000000022','56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000012','56000000-0000-4000-8000-000000000006','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000004','56000000-0000-4000-8000-000000000020',500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='platform_checkout_reward_redemptions'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN RAISE EXCEPTION 'redemption RLS is not forced'; END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO platform_checkout_reward_redemptions(
      checkout_id,checkout_group_id,account_id,merchant_tenant_id,customer_id,reward_grant_id,amount_cents
    ) VALUES (
      '56000000-0000-4000-8000-000000000009','56000000-0000-4000-8000-000000000012','56000000-0000-4000-8000-000000000005','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000020',100
    );
    RAISE EXCEPTION 'cross-account checkout group was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO platform_checkout_reward_redemptions(
      checkout_id,checkout_group_id,account_id,merchant_tenant_id,customer_id,reward_grant_id,amount_cents
    ) VALUES (
      '56000000-0000-4000-8000-000000000009','56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000005','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000020',100
    );
    RAISE EXCEPTION 'cross-customer reward grant was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lequ_redemption_test') THEN
    CREATE ROLE lequ_redemption_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA app,public TO lequ_redemption_test;
GRANT SELECT,UPDATE ON platform_checkout_reward_redemptions TO lequ_redemption_test;
SET ROLE lequ_redemption_test;
SELECT set_config('app.consumer_account_id','56000000-0000-4000-8000-000000000005',true);

DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM platform_checkout_reward_redemptions)<>1 THEN
    RAISE EXCEPTION 'redemption account isolation failed';
  END IF;
  UPDATE platform_checkout_reward_redemptions SET amount_cents=100
   WHERE id='56000000-0000-4000-8000-000000000022';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-account redemption update succeeded'; END IF;
END
$$;

RESET ROLE;
ROLLBACK;

\echo 'Platform checkout reward redemption scope and RLS checks passed'
