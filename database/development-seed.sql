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

COMMIT;
