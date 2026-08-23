\set ON_ERROR_STOP on

DO $$
DECLARE
  development_tenant constant uuid := '10000000-0000-4000-8000-000000000001';
  development_user constant uuid := '10000000-0000-4000-8000-000000000002';
  development_store constant uuid := '10000000-0000-4000-8000-000000000003';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenants
    WHERE id = development_tenant
      AND tenant_code = 'DEVELOPMENT_MOCK'
      AND settings ->> 'data_source' = 'development-mock'
      AND settings ->> 'production_eligible' = 'false'
  ) THEN
    RAISE EXCEPTION 'development tenant marker is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenant_memberships
    WHERE tenant_id = development_tenant
      AND user_id = development_user
      AND membership_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'development membership is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM stores
    WHERE tenant_id = development_tenant AND id = development_store AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'development store is missing';
  END IF;
  IF (SELECT count(*) FROM member_role_assignments
      WHERE tenant_id = development_tenant AND user_id = development_user) <> 12 THEN
    RAISE EXCEPTION 'development user must have exactly 12 frozen baseline roles';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM platform_consumer_tenant_links link
      JOIN platform_consumer_accounts account ON account.id=link.account_id
     WHERE link.merchant_tenant_id=development_tenant
       AND link.status='ACTIVE'
       AND account.union_identifier_hash=
         encode(digest('development-consumer-union:development-preview-life-user-v1','sha256'),'hex')
  ) THEN
    RAISE EXCEPTION 'development platform consumer link is missing';
  END IF;
  IF (SELECT count(*) FROM products
       WHERE tenant_id=development_tenant AND status='ON_SALE') < 2 THEN
    RAISE EXCEPTION 'development discovery products are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM store_checkout_policies
     WHERE tenant_id=development_tenant AND store_id=development_store AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'development checkout policy is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE tenant_id = development_tenant)
    OR EXISTS (SELECT 1 FROM payment_intents WHERE tenant_id = development_tenant)
    OR EXISTS (SELECT 1 FROM ledger_transactions WHERE tenant_id = development_tenant)
    OR EXISTS (SELECT 1 FROM reward_grants WHERE tenant_id = development_tenant)
    OR EXISTS (SELECT 1 FROM revenue_distribution_entries WHERE tenant_id = development_tenant)
  THEN
    RAISE EXCEPTION 'development seed must not create financial facts';
  END IF;
END $$;
