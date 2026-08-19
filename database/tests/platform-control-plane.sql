\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE tablename IN (
    'tenant_connector_health','reward_rule_versions'
  ))<>2 THEN
    RAISE EXCEPTION 'platform control tenant RLS policies incomplete';
  END IF;
  IF (SELECT count(*) FROM official_skill_versions WHERE status='PUBLISHED')<>10 THEN
    RAISE EXCEPTION 'official V1 skill catalog is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='reward_rule_versions'
      AND indexname='reward_rule_versions_active_uidx'
  ) THEN
    RAISE EXCEPTION 'one active reward rule version guard missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='version'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
      WHERE table_name='commerce_reconciliation_discrepancies' AND column_name='resolved_by'
  ) THEN
    RAISE EXCEPTION 'versioned plan or discrepancy controls missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='platform_control_receipts'::regclass
      AND contype='u'
  ) THEN
    RAISE EXCEPTION 'platform control idempotency receipt guard missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='order_items' AND column_name='reward_rule_snapshot'
       AND data_type='jsonb' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'immutable order reward snapshot missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='app' AND procedure.proname='platform_merchant_directory'
       AND procedure.prosecdef
  ) THEN
    RAISE EXCEPTION 'platform merchant directory security boundary missing';
  END IF;
END $$;

INSERT INTO tenants(id,tenant_code,legal_name,display_name,status)
VALUES
  ('6f260000-0000-4000-8000-000000000001','PLATFORM_FIXTURE','平台测试主体','平台测试租户','ACTIVE'),
  ('6f260000-0000-4000-8000-000000000002','DIRECTORY_FIXTURE_MERCHANT','目录测试商户主体','目录测试商户','ACTIVE');
INSERT INTO users(id,display_name,status)
VALUES
  ('6f260000-0000-4000-8000-000000000003','平台目录管理员','ACTIVE'),
  ('6f260000-0000-4000-8000-000000000004','普通商户成员','ACTIVE');
INSERT INTO tenant_memberships(tenant_id,user_id,membership_status,joined_at)
VALUES
  ('6f260000-0000-4000-8000-000000000001','6f260000-0000-4000-8000-000000000003','ACTIVE',now()),
  ('6f260000-0000-4000-8000-000000000001','6f260000-0000-4000-8000-000000000004','ACTIVE',now());
INSERT INTO member_role_assignments(tenant_id,user_id,role_code)
VALUES
  ('6f260000-0000-4000-8000-000000000001','6f260000-0000-4000-8000-000000000003','PLATFORM_ADMIN'),
  ('6f260000-0000-4000-8000-000000000001','6f260000-0000-4000-8000-000000000004','MERCHANT_OWNER');
INSERT INTO merchant_profiles(tenant_id,legal_subject_name,industry_code,profile_status)
VALUES('6f260000-0000-4000-8000-000000000002','不可进入目录结果的法定主体','LOCAL_LIFE','VERIFIED');

DO $$
DECLARE
  directory_row record;
BEGIN
  BEGIN
    PERFORM * FROM app.platform_merchant_directory(
      '6f260000-0000-4000-8000-000000000001',
      '6f260000-0000-4000-8000-000000000004',
      'DIRECTORY_FIXTURE_MERCHANT','ACTIVE',10
    );
    RAISE EXCEPTION 'non-platform member unexpectedly read the cross-merchant directory';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT * INTO directory_row FROM app.platform_merchant_directory(
    '6f260000-0000-4000-8000-000000000001',
    '6f260000-0000-4000-8000-000000000003',
    'DIRECTORY_FIXTURE_MERCHANT','ACTIVE',10
  );
  IF directory_row.tenant_id IS DISTINCT FROM '6f260000-0000-4000-8000-000000000002'::uuid
     OR directory_row.display_name IS DISTINCT FROM '目录测试商户'
     OR directory_row.industry_code IS DISTINCT FROM 'LOCAL_LIFE'
     OR directory_row.profile_status IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'authorized platform directory projection is incomplete or incorrect';
  END IF;
END $$;
ROLLBACK;
