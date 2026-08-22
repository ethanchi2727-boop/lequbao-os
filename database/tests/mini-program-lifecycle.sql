\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name) VALUES
  ('44000000-0000-4000-8000-000000000001','mini-gate-a','Mini Gate A Legal','Mini Gate A'),
  ('44000000-0000-4000-8000-000000000002','mini-gate-b','Mini Gate B Legal','Mini Gate B');
INSERT INTO users(id, display_name) VALUES
  ('44000000-0000-4000-8000-000000000003','Mini publisher');
INSERT INTO merchant_profiles(id,tenant_id,legal_subject_name,industry_code,profile_status) VALUES
  ('44000000-0000-4000-8000-000000000004','44000000-0000-4000-8000-000000000001','Merchant A','LOCAL_LIFE','VERIFIED'),
  ('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-000000000002','Merchant B','LOCAL_LIFE','VERIFIED');
INSERT INTO delivery_projects(id,tenant_id,merchant_profile_id,status,owner_user_id) VALUES
  ('44000000-0000-4000-8000-000000000006','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000004','PROVISIONING','44000000-0000-4000-8000-000000000003'),
  ('44000000-0000-4000-8000-000000000007','44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000005','PROVISIONING','44000000-0000-4000-8000-000000000003');

DO $$
BEGIN
  BEGIN
    INSERT INTO external_authorizations(
      tenant_id,provider,external_account_id,credential_secret_ref,status
    ) VALUES (
      '44000000-0000-4000-8000-000000000001','WECHAT_COMPONENT','wx-plaintext','plaintext-secret','ACTIVE'
    );
    RAISE EXCEPTION 'plaintext provider credential unexpectedly persisted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

INSERT INTO external_authorizations(
  id,tenant_id,provider,external_account_id,external_subject_name,authorization_scope,
  credential_secret_ref,status,authorized_by,authorized_at
) VALUES
  ('44000000-0000-4000-8000-000000000008','44000000-0000-4000-8000-000000000001',
   'WECHAT_COMPONENT','wx-mini-a','Merchant A',ARRAY['ACCOUNT_INFO','CODE_MANAGEMENT'],
   'vault://wechat/mini-a','ACTIVE','44000000-0000-4000-8000-000000000003',now()),
  ('44000000-0000-4000-8000-000000000009','44000000-0000-4000-8000-000000000002',
   'WECHAT_COMPONENT','wx-mini-b','Merchant B',ARRAY['ACCOUNT_INFO','CODE_MANAGEMENT'],
   'vault://wechat/mini-b','ACTIVE','44000000-0000-4000-8000-000000000003',now());

INSERT INTO mini_programs(
  id,tenant_id,merchant_profile_id,delivery_project_id,authorization_id,app_id,app_id_hash,
  merchant_chosen_name,template_code,status,publishing_confirmer_user_id
) VALUES (
  '44000000-0000-4000-8000-000000000010','44000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000004','44000000-0000-4000-8000-000000000006',
  '44000000-0000-4000-8000-000000000008','wx-mini-a',repeat('a',64),
  'Merchant A Mini Program','standard-local-life','AUTHORIZED','44000000-0000-4000-8000-000000000003'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO mini_programs(
      tenant_id,merchant_profile_id,delivery_project_id,authorization_id,app_id,app_id_hash,
      merchant_chosen_name,template_code,status,publishing_confirmer_user_id
    ) VALUES (
      '44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000005',
      '44000000-0000-4000-8000-000000000007','44000000-0000-4000-8000-000000000009',
      'wx-mini-a-again',repeat('a',64),'Duplicate','standard-local-life','AUTHORIZED',
      '44000000-0000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'cross-tenant AppID ownership conflict unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;

INSERT INTO mini_program_releases(
  id,tenant_id,mini_program_id,template_version,config_version,config_snapshot,config_digest,
  build_artifact_ref,build_digest,template_commit,backend_api_version,
  database_compatibility_min,database_compatibility_max,status
) VALUES
  ('44000000-0000-4000-8000-000000000011','44000000-0000-4000-8000-000000000001',
   '44000000-0000-4000-8000-000000000010','6.1.0',1,'{"theme":"gold"}',repeat('b',64),
   'artifact://mini/a/1',repeat('c',64),'commit-a','v1','0010','0011','PREVIEW_READY'),
  ('44000000-0000-4000-8000-000000000012','44000000-0000-4000-8000-000000000001',
   '44000000-0000-4000-8000-000000000010','6.1.1',2,'{"theme":"blue"}',repeat('d',64),
   'artifact://mini/a/2',repeat('e',64),'commit-b','v1','0010','0011','PREVIEW_READY'),
  ('44000000-0000-4000-8000-000000000013','44000000-0000-4000-8000-000000000001',
   '44000000-0000-4000-8000-000000000010','6.2.0',3,'{}',repeat('f',64),
   NULL,NULL,NULL,NULL,NULL,NULL,'DRAFT');

INSERT INTO mini_program_builds(
  id,tenant_id,mini_program_id,release_id,template_version,template_commit,config_version,
  config_digest,artifact_ref,artifact_digest,preview_ref,backend_api_version,
  database_compatibility_min,database_compatibility_max,smoke_test_result,built_by
) VALUES (
  '44000000-0000-4000-8000-000000000014','44000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000010','44000000-0000-4000-8000-000000000011',
  '6.1.0','commit-a',1,repeat('b',64),'artifact://mini/a/1',repeat('c',64),'preview://mini/a/1',
  'v1','0010','0011','{"passed":true,"checks":{"login":true,"payment":true}}',
  '44000000-0000-4000-8000-000000000003'
);

DO $$
BEGIN
  BEGIN
    UPDATE mini_program_releases SET status='SUBMITTED'
     WHERE id='44000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'unconfirmed preview unexpectedly submitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'unconfirmed preview unexpectedly submitted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE mini_program_releases SET status='PUBLISHING'
     WHERE id='44000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'unapproved release unexpectedly published';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'unapproved release unexpectedly published' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO mini_program_preview_confirmations(
  id,tenant_id,mini_program_id,release_id,build_id,config_digest,build_digest,checklist,confirmed_by
) VALUES (
  '44000000-0000-4000-8000-000000000015','44000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000010','44000000-0000-4000-8000-000000000011',
  '44000000-0000-4000-8000-000000000014',repeat('b',64),repeat('c',64),
  '{"nameConfirmed":true,"logoConfirmed":true,"homepageConfirmed":true,"productConfirmed":true,
    "priceConfirmed":true,"storeConfirmed":true,"groupBuyRuleConfirmed":true,
    "customerServiceConfirmed":true,"categoryQualified":true,"privacyConfirmed":true,
    "paymentSubjectConfirmed":true}',
  '44000000-0000-4000-8000-000000000003'
);
UPDATE mini_program_releases SET status='SUBMITTED'
 WHERE id='44000000-0000-4000-8000-000000000011';

INSERT INTO mini_program_external_attempts(
  id,tenant_id,action,action_version,idempotency_key,status,request_summary
) VALUES (
  '44000000-0000-4000-8000-000000000016','44000000-0000-4000-8000-000000000001',
  'AUTHORIZE',1,'mini-program:authorize:db-gate','RUNNING','{}'
);
UPDATE mini_program_external_attempts
   SET status='SUCCEEDED',response_summary='{"scope":"ok"}',completed_at=now()
 WHERE id='44000000-0000-4000-8000-000000000016';

DO $$
BEGIN
  BEGIN
    UPDATE mini_program_builds SET artifact_ref='artifact://tampered'
     WHERE id='44000000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'immutable build unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'immutable build unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE mini_program_preview_confirmations SET checklist='{}'
     WHERE id='44000000-0000-4000-8000-000000000015';
    RAISE EXCEPTION 'immutable confirmation unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'immutable confirmation unexpectedly changed' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE mini_program_external_attempts SET response_summary='{"changed":true}'
     WHERE id='44000000-0000-4000-8000-000000000016';
    RAISE EXCEPTION 'terminal external attempt unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'terminal external attempt unexpectedly changed' THEN RAISE; END IF;
  END;
END
$$;

UPDATE external_authorizations SET status='REVOKED'
 WHERE id='44000000-0000-4000-8000-000000000008';
DO $$
BEGIN
  IF (SELECT status FROM mini_programs WHERE id='44000000-0000-4000-8000-000000000010') <> 'AUTH_REVOKED'
  THEN RAISE EXCEPTION 'authorization loss did not stop mini-program operations'; END IF;
END
$$;

ROLLBACK;
\echo 'Mini-program ownership, confirmation, immutable build and authorization-loss checks passed'
