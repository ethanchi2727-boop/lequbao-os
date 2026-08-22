\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id,tenant_code,legal_name,display_name)
VALUES ('55000000-0000-4000-8000-000000000001','checkout-tenant','Checkout Legal','Checkout');
INSERT INTO stores(id,tenant_id,store_code,store_name,status)
VALUES ('55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000001','CHECKOUT','Checkout Store','ACTIVE');
INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash) VALUES
  ('55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000001',repeat('c',64)),
  ('55000000-0000-4000-8000-000000000004','55000000-0000-4000-8000-000000000001',repeat('d',64));
INSERT INTO platform_consumer_accounts(id,union_identifier_hash) VALUES
  ('55000000-0000-4000-8000-000000000005',repeat('e',64)),
  ('55000000-0000-4000-8000-000000000006',repeat('f',64));
INSERT INTO shopping_carts(id,account_id) VALUES
  ('55000000-0000-4000-8000-000000000007','55000000-0000-4000-8000-000000000005'),
  ('55000000-0000-4000-8000-000000000008','55000000-0000-4000-8000-000000000006');
INSERT INTO platform_consumer_addresses(
  id,account_id,recipient_name_ciphertext,mobile_ciphertext,province_code,city_code,
  district_code,address_ciphertext,is_default
) VALUES
  ('55000000-0000-4000-8000-000000000009','55000000-0000-4000-8000-000000000005','cipher-a','mobile-a','31','3101','310106','address-a',true),
  ('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000006','cipher-b','mobile-b','31','3101','310106','address-b',true);
INSERT INTO platform_checkout_sessions(
  id,account_id,cart_id,cart_version,idempotency_key,request_hash,goods_amount_cents,
  discount_amount_cents,shipping_amount_cents,payable_amount_cents,expires_at
) VALUES
  ('55000000-0000-4000-8000-000000000011','55000000-0000-4000-8000-000000000005','55000000-0000-4000-8000-000000000007',1,'quote-a',repeat('1',64),1000,100,200,1100,now()+interval '10 minutes'),
  ('55000000-0000-4000-8000-000000000012','55000000-0000-4000-8000-000000000006','55000000-0000-4000-8000-000000000008',1,'quote-b',repeat('2',64),2000,0,0,2000,now()+interval '10 minutes');
INSERT INTO platform_checkout_groups(
  id,checkout_id,account_id,merchant_tenant_id,customer_id,store_id,order_type,
  delivery_address_id,item_snapshot,policy_snapshot,discount_snapshot,
  goods_amount_cents,discount_amount_cents,shipping_amount_cents,payable_amount_cents
) VALUES
  ('55000000-0000-4000-8000-000000000013','55000000-0000-4000-8000-000000000011','55000000-0000-4000-8000-000000000005','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000002','PHYSICAL_DELIVERY','55000000-0000-4000-8000-000000000009','[]','{}','{}',1000,100,200,1100),
  ('55000000-0000-4000-8000-000000000014','55000000-0000-4000-8000-000000000012','55000000-0000-4000-8000-000000000006','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000004','55000000-0000-4000-8000-000000000002','PHYSICAL_DELIVERY','55000000-0000-4000-8000-000000000010','[]','{}','{}',2000,0,0,2000);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lequ_platform_checkout_test') THEN
    CREATE ROLE lequ_platform_checkout_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app,public TO lequ_platform_checkout_test;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO lequ_platform_checkout_test;

SET ROLE lequ_platform_checkout_test;
SELECT set_config('app.consumer_account_id','55000000-0000-4000-8000-000000000005',true);

DO $$
DECLARE
  addresses integer;
  checkouts integer;
  groups integer;
  affected integer;
BEGIN
  SELECT count(*) INTO addresses FROM platform_consumer_addresses;
  SELECT count(*) INTO checkouts FROM platform_checkout_sessions;
  SELECT count(*) INTO groups FROM platform_checkout_groups;
  IF addresses<>1 OR checkouts<>1 OR groups<>1 THEN
    RAISE EXCEPTION 'platform checkout RLS failed: addresses %, checkouts %, groups %',
      addresses,checkouts,groups;
  END IF;
  UPDATE platform_checkout_groups SET last_error_code='CROSS_ACCOUNT'
   WHERE id='55000000-0000-4000-8000-000000000014';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-account checkout update succeeded'; END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT last_error_code FROM platform_checkout_groups
       WHERE id='55000000-0000-4000-8000-000000000014') IS NOT NULL THEN
    RAISE EXCEPTION 'cross-account checkout row changed';
  END IF;
END
$$;

ROLLBACK;

\echo 'Platform checkout account-isolation checks passed'
