\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'rls-a', 'RLS A Legal', 'RLS A'),
  ('20000000-0000-4000-8000-000000000002', 'rls-b', 'RLS B Legal', 'RLS B');

INSERT INTO stores(id, tenant_id, store_code, store_name) VALUES
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A-1', 'Tenant A Store'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'B-1', 'Tenant B Store');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lequ_rls_test') THEN
    CREATE ROLE lequ_rls_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app, public TO lequ_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lequ_rls_test;

SET ROLE lequ_rls_test;
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  visible_stores integer;
  affected_rows integer;
BEGIN
  SELECT count(*) INTO visible_stores FROM stores;
  IF visible_stores <> 1 THEN
    RAISE EXCEPTION 'RLS read isolation failed: expected 1 store, found %', visible_stores;
  END IF;

  UPDATE stores SET store_name = 'forbidden' WHERE tenant_id = '20000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 0 THEN
    RAISE EXCEPTION 'RLS update isolation failed';
  END IF;

  BEGIN
    INSERT INTO stores(tenant_id, store_code, store_name)
    VALUES ('20000000-0000-4000-8000-000000000002', 'B-X', 'Cross tenant write');
    RAISE EXCEPTION 'RLS cross-tenant insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stores WHERE store_code = 'B-X') THEN
    RAISE EXCEPTION 'cross-tenant row leaked through RLS';
  END IF;
  IF (SELECT store_name FROM stores WHERE id = '22000000-0000-4000-8000-000000000002') <> 'Tenant B Store' THEN
    RAISE EXCEPTION 'tenant B row was modified';
  END IF;
END
$$;

ROLLBACK;

\echo 'RLS isolation checks passed'
