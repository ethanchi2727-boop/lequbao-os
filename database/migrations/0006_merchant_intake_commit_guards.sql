BEGIN;

ALTER TABLE merchant_intake_field_candidates
  ALTER COLUMN asset_id SET NOT NULL;

ALTER TABLE merchant_intake_sessions
  ADD COLUMN missing_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN impact_targets text[] NOT NULL DEFAULT '{}',
  ADD CHECK (impact_targets <@ ARRAY['MINI_PROGRAM','GEO','AI_SERVICE','PRODUCT','GROUP_BUY']::text[]);

CREATE TABLE merchant_intake_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  merchant_profile_id uuid NOT NULL,
  committed_fields jsonb NOT NULL CHECK (jsonb_typeof(committed_fields) = 'object'),
  confirmation_ids uuid[] NOT NULL,
  changed_field_paths text[] NOT NULL,
  impact_targets text[] NOT NULL DEFAULT '{}',
  committed_by uuid NOT NULL REFERENCES users(id),
  committed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES merchant_intake_sessions(tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_profile_id) REFERENCES merchant_profiles(tenant_id, id),
  CHECK (cardinality(confirmation_ids) > 0),
  CHECK (cardinality(changed_field_paths) > 0)
);

CREATE OR REPLACE FUNCTION app.assert_intake_session_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id <> NEW.tenant_id OR OLD.channel <> NEW.channel
     OR OLD.created_by <> NEW.created_by OR OLD.created_at <> NEW.created_at
     OR OLD.delivery_project_id IS DISTINCT FROM NEW.delivery_project_id THEN
    RAISE EXCEPTION 'merchant intake session identity is immutable';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'COLLECTING' AND NEW.status IN ('EXTRACTING','CANCELLED'))
    OR (OLD.status = 'EXTRACTING' AND NEW.status IN ('WAITING_ANSWERS','WAITING_CONFIRMATION','FAILED'))
    OR (OLD.status = 'WAITING_ANSWERS' AND NEW.status IN ('EXTRACTING','CANCELLED'))
    OR (OLD.status = 'WAITING_CONFIRMATION' AND NEW.status IN ('WAITING_ANSWERS','CONFIRMED'))
    OR (OLD.status = 'CONFIRMED' AND NEW.status IN ('PUBLISHING','COMPLETED'))
    OR (OLD.status = 'PUBLISHING' AND NEW.status IN ('COMPLETED','FAILED'))
    OR (OLD.status = 'FAILED' AND NEW.status = 'PUBLISHING')
  ) THEN
    RAISE EXCEPTION 'invalid merchant intake transition % to %', OLD.status, NEW.status;
  END IF;
  IF OLD.merchant_profile_id IS DISTINCT FROM NEW.merchant_profile_id
     AND (OLD.merchant_profile_id IS NOT NULL OR NEW.status <> 'CONFIRMED') THEN
    RAISE EXCEPTION 'merchant profile may only be bound once during confirmation';
  END IF;
  NEW.version := CASE WHEN ROW(OLD.status, OLD.merchant_profile_id, OLD.last_message_at, OLD.missing_items, OLD.impact_targets)
                           IS DISTINCT FROM ROW(NEW.status, NEW.merchant_profile_id, NEW.last_message_at, NEW.missing_items, NEW.impact_targets)
                      THEN OLD.version + 1 ELSE OLD.version END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchant_intake_session_transition_check
BEFORE UPDATE ON merchant_intake_sessions
FOR EACH ROW EXECUTE FUNCTION app.assert_intake_session_transition();

CREATE OR REPLACE FUNCTION app.assert_intake_asset_processing()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tenant_id <> NEW.tenant_id OR OLD.session_id <> NEW.session_id
       OR OLD.source_channel <> NEW.source_channel
       OR OLD.source_message_id IS DISTINCT FROM NEW.source_message_id
       OR OLD.asset_type <> NEW.asset_type OR OLD.object_key IS DISTINCT FROM NEW.object_key
       OR OLD.sha256 <> NEW.sha256 OR OLD.created_by <> NEW.created_by
       OR OLD.created_at <> NEW.created_at THEN
      RAISE EXCEPTION 'merchant intake asset source is immutable';
    END IF;
    IF OLD.security_status <> NEW.security_status
       AND NOT (OLD.security_status = 'PENDING' AND NEW.security_status IN ('SAFE','REJECTED','FAILED')) THEN
      RAISE EXCEPTION 'invalid asset security transition % to %', OLD.security_status, NEW.security_status;
    END IF;
    IF OLD.processing_status <> NEW.processing_status AND NOT (
      (OLD.processing_status = 'QUEUED' AND NEW.processing_status IN ('PROCESSING','FAILED'))
      OR (OLD.processing_status = 'PROCESSING' AND NEW.processing_status IN ('SUCCEEDED','FAILED'))
    ) THEN
      RAISE EXCEPTION 'invalid asset processing transition % to %', OLD.processing_status, NEW.processing_status;
    END IF;
  END IF;
  IF NEW.processing_status IN ('PROCESSING','SUCCEEDED') AND NEW.security_status <> 'SAFE' THEN
    RAISE EXCEPTION 'unsafe asset cannot enter extraction';
  END IF;
  IF NEW.security_status IN ('REJECTED','FAILED')
     AND (NEW.processing_status <> 'FAILED' OR NEW.error_code IS NULL) THEN
    RAISE EXCEPTION 'failed security scan must stop processing with an error code';
  END IF;
  IF NEW.processing_status = 'FAILED' AND NEW.error_code IS NULL THEN
    RAISE EXCEPTION 'failed asset processing requires an error code';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchant_intake_asset_processing_check
BEFORE INSERT OR UPDATE ON merchant_intake_assets
FOR EACH ROW EXECUTE FUNCTION app.assert_intake_asset_processing();

CREATE OR REPLACE FUNCTION app.assert_intake_candidate_trace()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_session uuid; asset_security text; asset_processing text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tenant_id <> NEW.tenant_id OR OLD.session_id <> NEW.session_id
       OR OLD.asset_id <> NEW.asset_id OR OLD.field_path <> NEW.field_path
       OR OLD.candidate_value <> NEW.candidate_value
       OR OLD.confidence IS DISTINCT FROM NEW.confidence OR OLD.created_at <> NEW.created_at THEN
      RAISE EXCEPTION 'merchant intake candidate evidence is immutable';
    END IF;
    IF OLD.decision_status <> NEW.decision_status AND NOT (
      (OLD.decision_status = 'PROPOSED' AND NEW.decision_status IN ('CONFIRMED','CORRECTED','REJECTED','CONFLICT'))
      OR (OLD.decision_status = 'CONFLICT' AND NEW.decision_status IN ('CONFIRMED','CORRECTED','REJECTED'))
    ) THEN
      RAISE EXCEPTION 'invalid candidate decision transition % to %', OLD.decision_status, NEW.decision_status;
    END IF;
  END IF;
  SELECT session_id, security_status, processing_status
    INTO asset_session, asset_security, asset_processing
    FROM merchant_intake_assets
   WHERE tenant_id = NEW.tenant_id AND id = NEW.asset_id;
  IF asset_session IS NULL OR asset_session <> NEW.session_id
     OR asset_security <> 'SAFE' OR asset_processing <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'candidate requires a safe successfully processed asset in the same session';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchant_intake_candidate_trace_check
BEFORE INSERT OR UPDATE ON merchant_intake_field_candidates
FOR EACH ROW EXECUTE FUNCTION app.assert_intake_candidate_trace();

CREATE OR REPLACE FUNCTION app.assert_intake_commit_ready()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_status text;
BEGIN
  SELECT status INTO session_status FROM merchant_intake_sessions
   WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  IF session_status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'merchant intake session must be confirmed before commit';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM merchant_intake_confirmations
     WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id
       AND confirmation_type = 'LEGAL_SUBJECT'
  ) THEN
    RAISE EXCEPTION 'legal subject confirmation is required before commit';
  END IF;
  IF EXISTS (
    SELECT 1 FROM merchant_intake_field_candidates
     WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id
       AND decision_status IN ('PROPOSED','CONFLICT')
  ) THEN
    RAISE EXCEPTION 'unresolved merchant intake candidates block commit';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM merchant_intake_field_candidates candidate
     WHERE candidate.tenant_id = NEW.tenant_id AND candidate.session_id = NEW.session_id
       AND candidate.decision_status <> 'REJECTED'
       AND CASE
         WHEN candidate.field_path LIKE 'payment.%' THEN 'PAYMENT'
         WHEN candidate.field_path LIKE 'product.%price%' THEN 'PRICE'
         WHEN candidate.field_path LIKE 'refund.%' THEN 'REFUND_RULE'
         WHEN candidate.field_path LIKE 'merchant.public_contact.%' THEN 'PUBLIC_CONTACT'
         WHEN candidate.field_path LIKE 'publish.%' THEN 'PUBLISH_IMPACT'
       END IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM merchant_intake_confirmations confirmation
          WHERE confirmation.tenant_id = candidate.tenant_id
            AND confirmation.session_id = candidate.session_id
            AND confirmation.confirmation_type = CASE
              WHEN candidate.field_path LIKE 'payment.%' THEN 'PAYMENT'
              WHEN candidate.field_path LIKE 'product.%price%' THEN 'PRICE'
              WHEN candidate.field_path LIKE 'refund.%' THEN 'REFUND_RULE'
              WHEN candidate.field_path LIKE 'merchant.public_contact.%' THEN 'PUBLIC_CONTACT'
              WHEN candidate.field_path LIKE 'publish.%' THEN 'PUBLISH_IMPACT'
            END
       )
  ) THEN
    RAISE EXCEPTION 'high-risk merchant intake fields require separate confirmations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchant_intake_commit_ready_check
BEFORE INSERT ON merchant_intake_commits
FOR EACH ROW EXECUTE FUNCTION app.assert_intake_commit_ready();

CREATE TRIGGER merchant_intake_confirmations_immutable
BEFORE UPDATE OR DELETE ON merchant_intake_confirmations
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER merchant_intake_commits_immutable
BEFORE UPDATE OR DELETE ON merchant_intake_commits
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE merchant_intake_commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_intake_commits_tenant_isolation ON merchant_intake_commits
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0006_merchant_intake_commit_guards', encode(digest('lequbao-v6.1-0006', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
