-- Development-only identity and merchant shell for the local mock gateway.
-- This file intentionally creates no orders, payments, rewards, balances or ledger entries.

\if :{?development_seed}
SELECT :'development_seed' = 'enabled' AS development_seed_allowed \gset
\else
\set development_seed_allowed false
\endif

\if :development_seed_allowed
\echo 'Applying explicit development-only seed'
\else
\echo 'Refusing development seed: pass -v development_seed=enabled'
\quit 3
\endif

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('lequ-development-seed-v1', 0));

INSERT INTO tenants(id, tenant_code, legal_name, display_name, status, settings)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'DEVELOPMENT_MOCK',
  '开发模拟主体（非真实商户）',
  '乐趣宝开发租户',
  'ACTIVE',
  '{"data_source":"development-mock","production_eligible":false}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  settings = EXCLUDED.settings,
  updated_at = now();

INSERT INTO users(id, display_name, status)
VALUES ('10000000-0000-4000-8000-000000000002', '开发模拟管理员', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'ACTIVE', updated_at = now();

INSERT INTO tenant_memberships(tenant_id, user_id, employee_no, membership_status, joined_at)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'DEV-MOCK-001',
  'ACTIVE',
  now()
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  membership_status = 'ACTIVE',
  updated_at = now();

INSERT INTO merchant_profiles(
  id, tenant_id, legal_subject_name, industry_code, profile_status, verified_at
)
VALUES (
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '开发模拟商户（非真实数据）',
  'DEVELOPMENT_MOCK',
  'VERIFIED',
  now()
)
ON CONFLICT (tenant_id) DO UPDATE SET
  legal_subject_name = EXCLUDED.legal_subject_name,
  industry_code = EXCLUDED.industry_code,
  profile_status = 'VERIFIED',
  updated_at = now();

INSERT INTO stores(id, tenant_id, store_code, store_name, status, city_code, district_code)
VALUES (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'DEV-MOCK-STORE',
  '开发模拟门店',
  'ACTIVE',
  '310100',
  '310101'
)
ON CONFLICT (tenant_id, id) DO UPDATE SET
  store_name = EXCLUDED.store_name,
  status = 'ACTIVE',
  updated_at = now();

INSERT INTO member_role_assignments(tenant_id, user_id, role_code, store_id, granted_by)
SELECT
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid,
  role_code,
  CASE
    WHEN role_code IN ('STORE_MANAGER', 'CUSTOMER_SERVICE', 'MARKETER', 'VERIFIER')
      THEN '10000000-0000-4000-8000-000000000003'::uuid
    ELSE NULL
  END,
  '10000000-0000-4000-8000-000000000002'::uuid
FROM unnest(ARRAY[
  'BUSINESS_DEVELOPER',
  'INVESTMENT_OPERATOR',
  'REGIONAL_PROVIDER',
  'PLATFORM_FINANCE',
  'PLATFORM_OPERATOR',
  'MERCHANT_OWNER',
  'STORE_MANAGER',
  'CUSTOMER_SERVICE',
  'FINANCE',
  'MARKETER',
  'VERIFIER',
  'AUDITOR'
]) AS roles(role_code)
ON CONFLICT (tenant_id, user_id, role_code, store_id) DO NOTHING;

INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash,profile_summary,status)
VALUES (
  '10000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000001',
  encode(digest('development-consumer-union:development-preview-life-user-v1','sha256'),'hex'),
  '{"data_source":"development-mock"}'::jsonb,
  'ACTIVE'
)
ON CONFLICT (tenant_id,id) DO UPDATE SET
  profile_summary=EXCLUDED.profile_summary,status='ACTIVE',updated_at=now();

INSERT INTO platform_consumer_accounts(id,union_identifier_hash,status)
VALUES (
  '10000000-0000-4000-8000-000000000021',
  encode(digest('development-consumer-union:development-preview-life-user-v1','sha256'),'hex'),
  'ACTIVE'
)
ON CONFLICT (union_identifier_hash) DO UPDATE SET status='ACTIVE',updated_at=now();

INSERT INTO platform_consumer_tenant_links(
  account_id,merchant_tenant_id,customer_id,status,verified_at
)
SELECT
  account.id,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000020',
  'ACTIVE',
  now()
FROM platform_consumer_accounts account
WHERE account.union_identifier_hash=
  encode(digest('development-consumer-union:development-preview-life-user-v1','sha256'),'hex')
ON CONFLICT (account_id,merchant_tenant_id) DO UPDATE SET
  customer_id=EXCLUDED.customer_id,status='ACTIVE',verified_at=now();

INSERT INTO products(
  id,tenant_id,store_id,product_type,title,status,sale_price_cents,market_price_cents
)
VALUES
  (
    '10000000-0000-4000-8000-000000000030',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'PHYSICAL','开发预览 · 产地鲜切水果组合','ON_SALE',3990,4590
  ),
  (
    '10000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'SERVICE','开发预览 · 附近双人精选晚餐','ON_SALE',16800,19800
  )
ON CONFLICT (tenant_id,id) DO UPDATE SET
  title=EXCLUDED.title,status='ON_SALE',sale_price_cents=EXCLUDED.sale_price_cents,
  market_price_cents=EXCLUDED.market_price_cents,updated_at=now();

INSERT INTO product_variants(id,tenant_id,product_id,sku_code,title,sale_price_cents,status)
VALUES
  (
    '10000000-0000-4000-8000-000000000040',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000030',
    'DEV-FRUIT-STANDARD','标准份',3990,'ACTIVE'
  ),
  (
    '10000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000031',
    'DEV-DINING-TWO','双人份',16800,'ACTIVE'
  )
ON CONFLICT (tenant_id,id) DO UPDATE SET
  title=EXCLUDED.title,sale_price_cents=EXCLUDED.sale_price_cents,status='ACTIVE',updated_at=now();

INSERT INTO inventory_balances(tenant_id,variant_id,on_hand,reserved)
VALUES
  ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000040',50,0),
  ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000041',20,0)
ON CONFLICT (tenant_id,variant_id) DO UPDATE SET
  on_hand=EXCLUDED.on_hand,reserved=0,version=inventory_balances.version+1,updated_at=now();

INSERT INTO store_checkout_policies(
  id,tenant_id,store_id,policy_version,status,allowed_order_types,
  delivery_fee_cents,free_delivery_threshold_cents,estimated_minutes,refund_rule_summary
)
VALUES (
  '10000000-0000-4000-8000-000000000050',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'development-preview-v1',
  'ACTIVE',
  ARRAY['STORE_PICKUP','SERVICE_APPOINTMENT'],
  0,
  NULL,
  30,
  '开发预览：未履约前可按订单售后规则申请退款'
)
ON CONFLICT (tenant_id,store_id,policy_version) DO UPDATE SET
  status='ACTIVE',allowed_order_types=EXCLUDED.allowed_order_types,
  estimated_minutes=EXCLUDED.estimated_minutes,
  refund_rule_summary=EXCLUDED.refund_rule_summary;

COMMIT;
