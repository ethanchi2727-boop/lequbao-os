BEGIN;

ALTER TABLE external_authorizations
  ADD CONSTRAINT external_authorizations_secret_reference_check
  CHECK (credential_secret_ref ~ '^(secret|vault|kms)://[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$');

ALTER TABLE mini_programs
  ADD COLUMN merchant_profile_id uuid,
  ADD COLUMN delivery_project_id uuid,
  ADD COLUMN app_id_hash text,
  ADD COLUMN publishing_confirmer_user_id uuid REFERENCES users(id),
  ADD COLUMN last_stable_release_id uuid,
  ADD COLUMN pending_release_id uuid,
  ADD CONSTRAINT mini_programs_merchant_profile_fk
    FOREIGN KEY (tenant_id, merchant_profile_id) REFERENCES merchant_profiles(tenant_id, id),
  ADD CONSTRAINT mini_programs_delivery_project_fk
    FOREIGN KEY (tenant_id, delivery_project_id) REFERENCES delivery_projects(tenant_id, id),
  ADD CONSTRAINT mini_programs_app_id_hash_check
    CHECK (app_id_hash ~ '^[a-f0-9]{64}$');

UPDATE mini_programs SET app_id_hash=encode(digest(app_id,'sha256'),'hex') WHERE app_id_hash IS NULL;
ALTER TABLE mini_programs ALTER COLUMN app_id_hash SET NOT NULL;
CREATE UNIQUE INDEX mini_programs_global_app_id_hash_uidx ON mini_programs(app_id_hash);

ALTER TABLE mini_program_releases
  ADD COLUMN config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  ADD COLUMN config_digest text CHECK (config_digest IS NULL OR config_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN build_digest text CHECK (build_digest IS NULL OR build_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN template_commit text,
  ADD COLUMN backend_api_version text,
  ADD COLUMN database_compatibility_min text,
  ADD COLUMN database_compatibility_max text,
  ADD COLUMN external_version text,
  ADD COLUMN previous_stable_release_id uuid,
  ADD CONSTRAINT mini_program_releases_previous_stable_fk
    FOREIGN KEY (tenant_id, previous_stable_release_id) REFERENCES mini_program_releases(tenant_id, id);

ALTER TABLE mini_programs
  ADD CONSTRAINT mini_programs_last_stable_release_fk
  FOREIGN KEY (tenant_id, last_stable_release_id) REFERENCES mini_program_releases(tenant_id, id);
ALTER TABLE mini_programs
  ADD CONSTRAINT mini_programs_pending_release_fk
  FOREIGN KEY (tenant_id, pending_release_id) REFERENCES mini_program_releases(tenant_id, id);

CREATE TABLE mini_program_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_program_id uuid NOT NULL,
  release_id uuid NOT NULL,
  template_version text NOT NULL,
  template_commit text NOT NULL,
  config_version integer NOT NULL CHECK (config_version > 0),
  config_digest text NOT NULL CHECK (config_digest ~ '^[a-f0-9]{64}$'),
  artifact_ref text NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  preview_ref text NOT NULL,
  backend_api_version text NOT NULL,
  database_compatibility_min text NOT NULL,
  database_compatibility_max text NOT NULL,
  smoke_test_result jsonb NOT NULL CHECK (jsonb_typeof(smoke_test_result) = 'object'),
  built_by uuid NOT NULL REFERENCES users(id),
  built_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, release_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, mini_program_id) REFERENCES mini_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, release_id) REFERENCES mini_program_releases(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE mini_program_preview_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_program_id uuid,
  release_id uuid NOT NULL,
  build_id uuid NOT NULL,
  config_digest text NOT NULL CHECK (config_digest ~ '^[a-f0-9]{64}$'),
  build_digest text NOT NULL CHECK (build_digest ~ '^[a-f0-9]{64}$'),
  checklist jsonb NOT NULL CHECK (jsonb_typeof(checklist) = 'object'),
  confirmed_by uuid NOT NULL REFERENCES users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, release_id, build_id, config_digest),
  FOREIGN KEY (tenant_id, mini_program_id) REFERENCES mini_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, release_id) REFERENCES mini_program_releases(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, build_id) REFERENCES mini_program_builds(tenant_id, id) ON DELETE CASCADE,
  CHECK (checklist @> '{"nameConfirmed":true,"logoConfirmed":true,"homepageConfirmed":true,"productConfirmed":true,"priceConfirmed":true,"storeConfirmed":true,"groupBuyRuleConfirmed":true,"customerServiceConfirmed":true,"categoryQualified":true,"privacyConfirmed":true,"paymentSubjectConfirmed":true}'::jsonb)
);

CREATE OR REPLACE FUNCTION app.assert_mini_program_preview_confirmation_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mini_program_builds build
     WHERE build.tenant_id=NEW.tenant_id AND build.id=NEW.build_id
       AND build.mini_program_id=NEW.mini_program_id AND build.release_id=NEW.release_id
       AND build.config_digest=NEW.config_digest AND build.artifact_digest=NEW.build_digest
  ) THEN RAISE EXCEPTION 'preview confirmation must match the exact mini-program build'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mini_program_preview_confirmation_scope_check
BEFORE INSERT ON mini_program_preview_confirmations
FOR EACH ROW EXECUTE FUNCTION app.assert_mini_program_preview_confirmation_scope();

CREATE TABLE mini_program_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_program_id uuid,
  release_id uuid,
  provider_event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('AUTHORIZED','AUTH_REVOKED','REVIEW_APPROVED','REVIEW_REJECTED','PUBLISHED')),
  ciphertext_hash text NOT NULL CHECK (ciphertext_hash ~ '^[a-f0-9]{64}$'),
  encrypted_payload_object_ref text NOT NULL,
  decoded_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(decoded_summary) = 'object'),
  processing_status text NOT NULL DEFAULT 'RECEIVED' CHECK (processing_status IN ('RECEIVED','PROCESSED','REJECTED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_event_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, mini_program_id) REFERENCES mini_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, release_id) REFERENCES mini_program_releases(tenant_id, id)
);

CREATE TABLE mini_program_external_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_program_id uuid,
  release_id uuid,
  action text NOT NULL CHECK (action IN ('AUTHORIZE','UPLOAD_PREVIEW','SUBMIT_REVIEW','QUERY_REVIEW','PUBLISH','QUERY_ONLINE','ROLLBACK')),
  action_version integer NOT NULL CHECK (action_version > 0),
  idempotency_key text NOT NULL,
  external_request_id text,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','UNKNOWN')),
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_summary) = 'object'),
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response_summary) = 'object'),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, mini_program_id) REFERENCES mini_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, release_id) REFERENCES mini_program_releases(tenant_id, id),
  CHECK (action='AUTHORIZE' OR mini_program_id IS NOT NULL),
  CHECK ((status='RUNNING' AND completed_at IS NULL) OR status <> 'RUNNING'),
  CHECK ((status NOT IN ('FAILED','UNKNOWN')) OR error_code IS NOT NULL)
);

CREATE TABLE mini_program_rollout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_program_id uuid NOT NULL,
  release_id uuid NOT NULL,
  wave text NOT NULL CHECK (wave IN ('INTERNAL','PILOT','CANARY','ALL')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','PASSED','HALTED','ROLLED_BACK')),
  traffic_percent smallint NOT NULL CHECK (traffic_percent BETWEEN 0 AND 100),
  health_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(health_thresholds) = 'object'),
  observed_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(observed_metrics) = 'object'),
  halted_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, release_id, wave),
  FOREIGN KEY (tenant_id, mini_program_id) REFERENCES mini_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, release_id) REFERENCES mini_program_releases(tenant_id, id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION app.assert_mini_program_release_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status NOT IN ('DRAFT','BUILDING') AND (
    NEW.config_snapshot IS DISTINCT FROM OLD.config_snapshot OR
    NEW.config_digest IS DISTINCT FROM OLD.config_digest OR
    NEW.build_digest IS DISTINCT FROM OLD.build_digest OR
    NEW.template_version IS DISTINCT FROM OLD.template_version
  ) THEN RAISE EXCEPTION 'confirmed mini-program build inputs are immutable'; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='DRAFT' AND NEW.status='BUILDING') OR
    (OLD.status='DRAFT' AND NEW.status='PUBLISHING' AND NEW.rolled_back_from_id IS NOT NULL AND NEW.previous_stable_release_id IS NOT NULL) OR
    (OLD.status='BUILDING' AND NEW.status IN ('PREVIEW_READY','BUILD_FAILED')) OR
    (OLD.status='PREVIEW_READY' AND NEW.status='SUBMITTED') OR
    (OLD.status='SUBMITTED' AND NEW.status IN ('IN_REVIEW','APPROVED','REJECTED')) OR
    (OLD.status='IN_REVIEW' AND NEW.status IN ('APPROVED','REJECTED')) OR
    (OLD.status='APPROVED' AND NEW.status='PUBLISHING') OR
    (OLD.status='PUBLISHING' AND NEW.status IN ('PUBLISHED','PUBLISH_FAILED')) OR
    (OLD.status='PUBLISH_FAILED' AND NEW.status='PUBLISHING') OR
    (OLD.status='PUBLISHED' AND NEW.status='ROLLED_BACK')
  ) THEN RAISE EXCEPTION 'invalid mini-program release transition % -> %', OLD.status, NEW.status; END IF;
  IF NEW.status='SUBMITTED' AND NOT EXISTS (
    SELECT 1 FROM mini_program_preview_confirmations confirmation
    WHERE confirmation.tenant_id=NEW.tenant_id AND confirmation.release_id=NEW.id
      AND confirmation.config_digest=NEW.config_digest AND confirmation.build_digest=NEW.build_digest
  ) THEN RAISE EXCEPTION 'matching merchant preview confirmation is required before review'; END IF;
  IF NEW.status='PUBLISHING' AND NOT EXISTS (
    SELECT 1 FROM external_authorizations authz
    JOIN mini_programs mini ON mini.tenant_id=authz.tenant_id AND mini.authorization_id=authz.id
    WHERE mini.tenant_id=NEW.tenant_id AND mini.id=NEW.mini_program_id
      AND authz.status='ACTIVE' AND (authz.expires_at IS NULL OR authz.expires_at > now())
  ) THEN RAISE EXCEPTION 'active merchant AppID authorization is required before publish'; END IF;
  IF NEW.status='PUBLISHED' AND (NEW.external_version IS NULL OR NEW.published_at IS NULL) THEN
    RAISE EXCEPTION 'published release requires verified external version and time';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mini_program_release_transition_check
BEFORE UPDATE ON mini_program_releases
FOR EACH ROW EXECUTE FUNCTION app.assert_mini_program_release_transition();

CREATE OR REPLACE FUNCTION app.revoke_mini_program_on_authorization_loss()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='ACTIVE' AND NEW.status IN ('EXPIRED','REVOKED','ERROR') THEN
    UPDATE mini_programs SET status='AUTH_REVOKED'
     WHERE tenant_id=NEW.tenant_id AND authorization_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER external_authorization_loss_stops_mini_program
AFTER UPDATE OF status ON external_authorizations
FOR EACH ROW EXECUTE FUNCTION app.revoke_mini_program_on_authorization_loss();

CREATE OR REPLACE FUNCTION app.assert_mini_program_attempt_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'mini-program external attempts are append-only'; END IF;
  IF OLD.status <> 'RUNNING' OR NEW.status='RUNNING'
    OR OLD.tenant_id <> NEW.tenant_id OR OLD.mini_program_id IS DISTINCT FROM NEW.mini_program_id
    OR OLD.release_id IS DISTINCT FROM NEW.release_id OR OLD.action <> NEW.action
    OR OLD.action_version <> NEW.action_version OR OLD.idempotency_key <> NEW.idempotency_key
    OR OLD.request_summary <> NEW.request_summary OR OLD.started_at <> NEW.started_at THEN
    RAISE EXCEPTION 'completed mini-program external attempts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mini_program_external_attempts_terminal_once
BEFORE UPDATE OR DELETE ON mini_program_external_attempts
FOR EACH ROW EXECUTE FUNCTION app.assert_mini_program_attempt_transition();

CREATE TRIGGER mini_program_builds_immutable
BEFORE UPDATE OR DELETE ON mini_program_builds
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER mini_program_preview_confirmations_immutable
BEFORE UPDATE OR DELETE ON mini_program_preview_confirmations
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER mini_program_provider_events_immutable
BEFORE UPDATE OR DELETE ON mini_program_provider_events
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE mini_program_builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY mini_program_builds_tenant_isolation ON mini_program_builds
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE mini_program_preview_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY mini_program_preview_confirmations_tenant_isolation ON mini_program_preview_confirmations
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE mini_program_provider_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY mini_program_provider_events_tenant_isolation ON mini_program_provider_events
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE mini_program_external_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mini_program_external_attempts_tenant_isolation ON mini_program_external_attempts
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE mini_program_rollout_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY mini_program_rollout_batches_tenant_isolation ON mini_program_rollout_batches
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0011_mini_program_lifecycle', encode(digest('lequbao-v6.1-0011','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
