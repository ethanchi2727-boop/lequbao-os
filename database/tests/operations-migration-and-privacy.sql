\set ON_ERROR_STOP on
BEGIN;
INSERT INTO tenants(id,tenant_code,legal_name,display_name,status,data_region) VALUES('51000000-0000-4000-8000-000000000001','migration-test','Migration Test','Migration Test','ACTIVE','CN');
SELECT set_config('app.tenant_id','51000000-0000-4000-8000-000000000001',false);
INSERT INTO legacy_migration_runs(id,tenant_id,migration_version,source_snapshot_id,phase,status,source_schema_hash)
VALUES('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','v1','snapshot-1','VERIFY','VERIFYING',repeat('a',64));
INSERT INTO legacy_migration_reconciliations(tenant_id,run_id,scope_type,scope_key,source_summary,target_summary,difference_summary,status)
VALUES('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','TENANT_TOTAL','all','{}','{}','{"refund_cents":1}','UNEXPLAINED_DIFFERENCE');
DO $$ BEGIN
  BEGIN UPDATE legacy_migration_runs SET phase='SWITCH' WHERE id='51000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'switch guard failed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='switch guard failed' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE relname='privacy_deletion_propagation_tasks' AND relrowsecurity) THEN RAISE EXCEPTION 'privacy propagation RLS missing'; END IF;
END $$;
ROLLBACK;
