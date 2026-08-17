\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('92000000-0000-4000-8000-000000000001', 'intake-db-test', 'Intake DB Legal', 'Intake DB');
INSERT INTO users(id, display_name) VALUES
  ('92000000-0000-4000-8000-000000000002', 'Merchant Owner'),
  ('92000000-0000-4000-8000-000000000003', 'AI Processor');

INSERT INTO merchant_intake_sessions(id, tenant_id, channel, created_by)
VALUES ('92000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001', 'WEB', '92000000-0000-4000-8000-000000000002');
INSERT INTO merchant_intake_assets(
  id, tenant_id, session_id, source_channel, asset_type, object_key, sha256,
  security_status, processing_status, error_code, created_by
) VALUES (
  '92000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000004', 'WEB', 'DOCUMENT', 'tenant/unsafe.pdf', repeat('a', 64),
  'REJECTED', 'FAILED', 'MALWARE_DETECTED', '92000000-0000-4000-8000-000000000002'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO merchant_intake_field_candidates(
      tenant_id, session_id, asset_id, field_path, candidate_value, confidence
    ) VALUES (
      '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
      '92000000-0000-4000-8000-000000000005', 'merchant.legal_subject_name', '"unsafe"'::jsonb, 0.9
    );
    RAISE EXCEPTION 'unsafe asset unexpectedly produced a candidate';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'candidate requires a safe successfully processed asset%' THEN NULL; ELSE RAISE; END IF;
  END;
END
$$;

INSERT INTO merchant_intake_assets(
  id, tenant_id, session_id, source_channel, asset_type, object_key, sha256,
  security_status, processing_status, created_by
) VALUES (
  '92000000-0000-4000-8000-000000000006', '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000004', 'WEB', 'IMAGE', 'tenant/license.jpg', repeat('b', 64),
  'SAFE', 'SUCCEEDED', '92000000-0000-4000-8000-000000000002'
);
INSERT INTO merchant_intake_field_candidates(
  tenant_id, session_id, asset_id, field_path, candidate_value, confidence
) VALUES (
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000006', 'merchant.legal_subject_name', '"Intake DB Legal"'::jsonb, 0.99
);
INSERT INTO merchant_intake_confirmations(
  id, tenant_id, session_id, confirmation_type, confirmed_payload, confirmed_by, confirmation_channel
) VALUES (
  '92000000-0000-4000-8000-000000000007', '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000004', 'LEGAL_SUBJECT', '{"confirmed":true}'::jsonb,
  '92000000-0000-4000-8000-000000000002', 'WEB_CLICK'
);

DO $$
BEGIN
  BEGIN
    UPDATE merchant_intake_confirmations SET confirmed_payload = '{"changed":true}'::jsonb
     WHERE id = '92000000-0000-4000-8000-000000000007';
    RAISE EXCEPTION 'intake confirmation unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'immutable table merchant_intake_confirmations%' THEN NULL; ELSE RAISE; END IF;
  END;
END
$$;

INSERT INTO merchant_intake_sessions(id, tenant_id, channel, created_by)
VALUES ('92000000-0000-4000-8000-000000000008', '92000000-0000-4000-8000-000000000001', 'WEB', '92000000-0000-4000-8000-000000000002');
UPDATE merchant_intake_sessions SET status = 'EXTRACTING' WHERE id = '92000000-0000-4000-8000-000000000008';
UPDATE merchant_intake_sessions SET status = 'WAITING_CONFIRMATION' WHERE id = '92000000-0000-4000-8000-000000000008';
INSERT INTO merchant_profiles(id, tenant_id, legal_subject_name, industry_code)
VALUES ('92000000-0000-4000-8000-000000000009', '92000000-0000-4000-8000-000000000001', 'Unconfirmed Legal', 'LOCAL_LIFE');
UPDATE merchant_intake_sessions
   SET status = 'CONFIRMED', merchant_profile_id = '92000000-0000-4000-8000-000000000009'
 WHERE id = '92000000-0000-4000-8000-000000000008';

DO $$
BEGIN
  BEGIN
    INSERT INTO merchant_intake_commits(
      tenant_id, session_id, merchant_profile_id, committed_fields, confirmation_ids,
      changed_field_paths, committed_by
    ) VALUES (
      '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000008',
      '92000000-0000-4000-8000-000000000009', '{"merchant.legal_subject_name":"Unconfirmed Legal"}'::jsonb,
      ARRAY['92000000-0000-4000-8000-000000000007']::uuid[], ARRAY['merchant.legal_subject_name']::text[],
      '92000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'commit without session legal confirmation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'legal subject confirmation is required before commit' THEN NULL; ELSE RAISE; END IF;
  END;
END
$$;

ROLLBACK;

\echo 'Merchant intake safety, confirmation immutability and commit guards passed'
