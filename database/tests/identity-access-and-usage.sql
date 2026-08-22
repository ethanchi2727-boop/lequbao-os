\set ON_ERROR_STOP on

DO $$
DECLARE
  required_roles text[] := ARRAY[
    'PLATFORM_ADMIN','PLATFORM_OPS','PLATFORM_FINANCE','CHANNEL_PARTNER','MERCHANT_OWNER',
    'STORE_MANAGER','CUSTOMER_SERVICE','FINANCE','MARKETER','VERIFIER','AUDITOR',
    'PLUGIN_RUNTIME','BUSINESS_DEVELOPER','INVESTMENT_OPERATOR','REGIONAL_PROVIDER'
  ];
  actual_count integer;
BEGIN
  SELECT count(*) INTO actual_count FROM role_catalog WHERE role_code = ANY(required_roles);
  IF actual_count <> 15 THEN RAISE EXCEPTION 'expected all 15 frozen roles, got %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM permission_catalog;
  IF actual_count <> 51 THEN RAISE EXCEPTION 'expected 51 frozen permissions, got %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM role_permissions;
  IF actual_count <> 213 THEN RAISE EXCEPTION 'expected 213 scoped grants, got %', actual_count; END IF;
END $$;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('91000000-0000-4000-8000-000000000001','identity-fixture','身份测试','身份测试');
INSERT INTO users(id, display_name)
VALUES ('91000000-0000-4000-8000-000000000002','测试负责人');

BEGIN;
SELECT set_config('app.tenant_id','91000000-0000-4000-8000-000000000001',true);
INSERT INTO tenant_memberships(tenant_id,user_id,membership_status)
VALUES ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','ACTIVE');
INSERT INTO member_role_assignments(tenant_id,user_id,role_code)
VALUES ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','MERCHANT_OWNER');
INSERT INTO user_sessions(tenant_id,session_id,user_id,auth_level,issued_at,expires_at)
VALUES (
  '91000000-0000-4000-8000-000000000001','session-fixture',
  '91000000-0000-4000-8000-000000000002','MFA',now(),now() + interval '1 hour'
);
INSERT INTO tenant_subscriptions(
  id,tenant_id,plan_code,status,starts_at,current_period_start,current_period_end
) VALUES (
  '91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001',
  'STANDARD_898_MONTH','ACTIVE',now(),date_trunc('month',now()),date_trunc('month',now()) + interval '1 month'
);
INSERT INTO tenant_entitlement_snapshots(
  id,tenant_id,subscription_id,plan_code,subscription_version,entitlements,effective_from,effective_to
) VALUES (
  '91000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000003','STANDARD_898_MONTH',1,
  '{"usage_limits":{"AI_TOKENS":{"hard":100}}}',now(),now() + interval '1 month'
);
INSERT INTO ai_usage_ledger_entries(
  id,tenant_id,subscription_id,meter_code,source_type,source_id,provider,quantity,cost_cents,occurred_at,trace_id
) VALUES (
  '91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000003','AI_TOKENS','MODEL','generation-fixture','provider-fixture',
  10,1,now(),'trace-fixture'
);

DO $$
BEGIN
  BEGIN
    UPDATE tenant_entitlement_snapshots SET plan_code='PRO_1980_MONTH'
      WHERE id='91000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'entitlement snapshot mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'entitlement snapshot mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM ai_usage_ledger_entries WHERE id='91000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'usage ledger deletion unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'usage ledger deletion unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;
COMMIT;
