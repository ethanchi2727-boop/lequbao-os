\set ON_ERROR_STOP on

-- A committed 0028 database already containing a reserved redemption must survive 0029.
BEGIN;
INSERT INTO tenants(id,tenant_code,legal_name,display_name)
VALUES ('57000000-0000-4000-8000-000000000001','redemption-upgrade','Upgrade Legal','Upgrade');
INSERT INTO stores(id,tenant_id,store_code,store_name,status)
VALUES ('57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000001','UPGRADE','Upgrade Store','ACTIVE');
INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash)
VALUES ('57000000-0000-4000-8000-000000000003','57000000-0000-4000-8000-000000000001',repeat('5',64));
INSERT INTO platform_consumer_accounts(id,union_identifier_hash)
VALUES ('57000000-0000-4000-8000-000000000004',repeat('6',64));
INSERT INTO shopping_carts(id,account_id)
VALUES ('57000000-0000-4000-8000-000000000005','57000000-0000-4000-8000-000000000004');
INSERT INTO platform_checkout_sessions(
  id,account_id,cart_id,cart_version,idempotency_key,request_hash,goods_amount_cents,
  discount_amount_cents,shipping_amount_cents,payable_amount_cents,expires_at
) VALUES (
  '57000000-0000-4000-8000-000000000006','57000000-0000-4000-8000-000000000004','57000000-0000-4000-8000-000000000005',1,'upgrade-quote',repeat('7',64),1000,0,0,1000,now()+interval '10 minutes'
);
INSERT INTO platform_checkout_groups(
  id,checkout_id,account_id,merchant_tenant_id,customer_id,store_id,order_type,
  item_snapshot,policy_snapshot,discount_snapshot,
  goods_amount_cents,discount_amount_cents,shipping_amount_cents,payable_amount_cents
) VALUES (
  '57000000-0000-4000-8000-000000000007','57000000-0000-4000-8000-000000000006','57000000-0000-4000-8000-000000000004','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000003','57000000-0000-4000-8000-000000000002','STORE_PICKUP','[]','{}','{}',1000,0,0,1000
);
INSERT INTO reward_accounts(id,tenant_id,owner_type,owner_id)
VALUES ('57000000-0000-4000-8000-000000000008','57000000-0000-4000-8000-000000000001','CUSTOMER','57000000-0000-4000-8000-000000000003');
INSERT INTO ledger_transactions(id,tenant_id,transaction_type,business_type,business_id,occurred_at)
VALUES ('57000000-0000-4000-8000-000000000009','57000000-0000-4000-8000-000000000001','REWARD_GRANT','TEST','57000000-0000-4000-8000-000000000010',now());
INSERT INTO reward_grants(
  id,tenant_id,customer_id,account_id,grant_transaction_id,rule_version,
  funding_source,granted_amount_cents,status,available_at
) VALUES (
  '57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000003','57000000-0000-4000-8000-000000000008','57000000-0000-4000-8000-000000000009','TEST','MERCHANT',1000,'AVAILABLE',now()
);
INSERT INTO platform_checkout_reward_redemptions(
  id,checkout_id,checkout_group_id,account_id,merchant_tenant_id,reward_grant_id,amount_cents
) VALUES (
  '57000000-0000-4000-8000-000000000012','57000000-0000-4000-8000-000000000006','57000000-0000-4000-8000-000000000007','57000000-0000-4000-8000-000000000004','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000011',500
);
COMMIT;

\echo 'Committed 0028 redemption fixture created'
