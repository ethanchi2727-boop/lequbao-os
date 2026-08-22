BEGIN;

ALTER TABLE delivery_projects
  ADD COLUMN merchant_profile_id uuid,
  ADD COLUMN subscription_id uuid,
  ADD COLUMN workflow_code text NOT NULL DEFAULT 'merchant_delivery_standard',
  ADD COLUMN workflow_version integer NOT NULL DEFAULT 1 CHECK (workflow_version > 0),
  ADD COLUMN rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version > 0),
  ADD COLUMN missing_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN wait_category text CHECK (wait_category IN ('PLATFORM','MERCHANT','WECHAT','THIRD_PARTY','INTERNAL')),
  ADD COLUMN platform_started_at timestamptz,
  ADD COLUMN platform_processing_seconds bigint NOT NULL DEFAULT 0 CHECK (platform_processing_seconds >= 0),
  ADD COLUMN merchant_wait_seconds bigint NOT NULL DEFAULT 0 CHECK (merchant_wait_seconds >= 0),
  ADD COLUMN external_wait_seconds bigint NOT NULL DEFAULT 0 CHECK (external_wait_seconds >= 0),
  ADD CONSTRAINT delivery_projects_merchant_profile_fk
    FOREIGN KEY (tenant_id, merchant_profile_id) REFERENCES merchant_profiles(tenant_id, id),
  ADD CONSTRAINT delivery_projects_subscription_fk
    FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions(tenant_id, id),
  ADD CONSTRAINT delivery_projects_acceptance_fields_check
    CHECK (status <> 'DELIVERED' OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL AND progress_percent = 100));

ALTER TABLE delivery_steps
  ADD COLUMN step_group text NOT NULL DEFAULT 'MERCHANT_PROFILE',
  ADD COLUMN required_step boolean NOT NULL DEFAULT true,
  ADD COLUMN execution_mode text NOT NULL DEFAULT 'AUTOMATED'
    CHECK (execution_mode IN ('AUTOMATED','HUMAN_CONFIRMATION','EXTERNAL_REVIEW')),
  ADD COLUMN responsibility text NOT NULL DEFAULT 'PLATFORM'
    CHECK (responsibility IN ('PLATFORM','MERCHANT','BUSINESS','PRODUCT','ENGINEERING','WECHAT','THIRD_PARTY')),
  ADD COLUMN depends_on text[] NOT NULL DEFAULT '{}',
  ADD COLUMN action_version integer NOT NULL DEFAULT 1 CHECK (action_version > 0),
  ADD COLUMN retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN max_auto_attempts integer NOT NULL DEFAULT 0 CHECK (max_auto_attempts BETWEEN 0 AND 2),
  ADD COLUMN next_retry_at timestamptz,
  ADD COLUMN result_ref text;

CREATE TABLE delivery_step_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  step_id uuid NOT NULL REFERENCES delivery_steps(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  action_version integer NOT NULL CHECK (action_version > 0),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','BLOCKED','UNKNOWN')),
  retryable boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_snapshot) = 'object'),
  output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(output_snapshot) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, step_id, attempt_no),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, project_id) REFERENCES delivery_projects(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR status <> 'RUNNING'),
  CHECK ((status NOT IN ('FAILED','BLOCKED','UNKNOWN')) OR error_code IS NOT NULL)
);

CREATE TABLE delivery_acceptance_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  checklist jsonb NOT NULL CHECK (jsonb_typeof(checklist) = 'object'),
  required_step_snapshot jsonb NOT NULL CHECK (jsonb_typeof(required_step_snapshot) = 'array'),
  accepted_by_ids uuid[] NOT NULL CHECK (cardinality(accepted_by_ids) >= 1),
  accepted_at timestamptz NOT NULL,
  receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES delivery_projects(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE delivery_project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  assignee_user_id uuid NOT NULL REFERENCES users(id),
  access_scope text[] NOT NULL DEFAULT ARRAY['DELIVERY_MATERIALS']::text[],
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, assignee_user_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES delivery_projects(tenant_id, id) ON DELETE CASCADE,
  CHECK (access_scope <@ ARRAY['DELIVERY_MATERIALS','STEP_EXECUTION']::text[]),
  CHECK (expires_at > granted_at AND expires_at <= granted_at + interval '30 days'),
  CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE TABLE delivery_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  step_id uuid REFERENCES delivery_steps(id),
  category text NOT NULL CHECK (category IN ('NETWORK','PARAMETER','PERMISSION','QUALIFICATION','REJECTED','UNKNOWN','INTERNAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','DISMISSED')),
  retryable boolean NOT NULL DEFAULT false,
  error_code text NOT NULL,
  employee_message text NOT NULL,
  responsibility text NOT NULL CHECK (responsibility IN ('PLATFORM','MERCHANT','BUSINESS','PRODUCT','ENGINEERING','WECHAT','THIRD_PARTY')),
  next_action text NOT NULL,
  owner_user_id uuid REFERENCES users(id),
  resolved_by uuid REFERENCES users(id),
  resolution text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES delivery_projects(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status IN ('RESOLVED','DISMISSED')) = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL))
);

CREATE TABLE delivery_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  wait_category text CHECK (wait_category IN ('PLATFORM','MERCHANT','WECHAT','THIRD_PARTY','INTERNAL')),
  reason_code text,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES delivery_projects(tenant_id, id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION app.assert_delivery_acceptance_ready()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'DELIVERED' AND OLD.status IS DISTINCT FROM 'DELIVERED' THEN
    IF EXISTS (
      SELECT 1 FROM delivery_steps
       WHERE tenant_id = NEW.tenant_id AND project_id = NEW.id
         AND required_step AND status <> 'SUCCEEDED'
    ) THEN
      RAISE EXCEPTION 'all required delivery steps must succeed before acceptance';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM delivery_acceptance_receipts
       WHERE tenant_id = NEW.tenant_id AND project_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'immutable acceptance receipt is required before delivery';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.accumulate_delivery_wait_time()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE elapsed_seconds bigint;
BEGIN
  elapsed_seconds := GREATEST(floor(extract(epoch FROM (now() - OLD.updated_at)))::bigint, 0);
  IF OLD.wait_category IN ('PLATFORM','INTERNAL') THEN
    NEW.platform_processing_seconds := OLD.platform_processing_seconds + elapsed_seconds;
  ELSIF OLD.wait_category = 'MERCHANT' THEN
    NEW.merchant_wait_seconds := OLD.merchant_wait_seconds + elapsed_seconds;
  ELSIF OLD.wait_category IN ('WECHAT','THIRD_PARTY') THEN
    NEW.external_wait_seconds := OLD.external_wait_seconds + elapsed_seconds;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_projects_accumulate_wait_time
BEFORE UPDATE ON delivery_projects
FOR EACH ROW EXECUTE FUNCTION app.accumulate_delivery_wait_time();

CREATE OR REPLACE FUNCTION app.assert_delivery_step_confirmation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'SUCCEEDED' OR OLD.status = 'SUCCEEDED' THEN RETURN NEW; END IF;
  IF NEW.step_code IN ('payment.bind','miniapp.release') AND NOT EXISTS (
    SELECT 1 FROM merchant_intake_sessions session
    JOIN merchant_intake_confirmations confirmation
      ON confirmation.tenant_id=session.tenant_id AND confirmation.session_id=session.id
    WHERE session.tenant_id=NEW.tenant_id AND session.delivery_project_id=NEW.project_id
      AND confirmation.confirmation_type='PAYMENT'
  ) THEN RAISE EXCEPTION 'merchant payment confirmation is required'; END IF;
  IF NEW.step_code='launch.first_offer' AND EXISTS (
    SELECT 1 FROM unnest(ARRAY['PRICE','REFUND_RULE']) required(confirmation_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM merchant_intake_sessions session
      JOIN merchant_intake_confirmations confirmation
        ON confirmation.tenant_id=session.tenant_id AND confirmation.session_id=session.id
      WHERE session.tenant_id=NEW.tenant_id AND session.delivery_project_id=NEW.project_id
        AND confirmation.confirmation_type=required.confirmation_type
    )
  ) THEN RAISE EXCEPTION 'merchant price and refund confirmations are required'; END IF;
  IF NEW.step_code IN ('miniapp.submit_review','miniapp.release') AND NOT EXISTS (
    SELECT 1 FROM merchant_intake_sessions session
    JOIN merchant_intake_confirmations confirmation
      ON confirmation.tenant_id=session.tenant_id AND confirmation.session_id=session.id
    WHERE session.tenant_id=NEW.tenant_id AND session.delivery_project_id=NEW.project_id
      AND confirmation.confirmation_type='PUBLISH_IMPACT'
      AND length(trim(confirmation.confirmed_payload->>'miniProgramName')) > 0
      AND confirmation.confirmed_payload->>'wechatReviewDisclosureAccepted' = 'true'
  ) THEN RAISE EXCEPTION 'merchant mini-program name and WeChat review disclosure confirmation are required'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_step_confirmation_check
BEFORE UPDATE OF status ON delivery_steps
FOR EACH ROW EXECUTE FUNCTION app.assert_delivery_step_confirmation();

CREATE TRIGGER delivery_acceptance_ready_check
BEFORE UPDATE OF status ON delivery_projects
FOR EACH ROW EXECUTE FUNCTION app.assert_delivery_acceptance_ready();

CREATE OR REPLACE FUNCTION app.assert_delivery_attempt_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'delivery attempts are append-only'; END IF;
  IF OLD.status <> 'RUNNING' OR NEW.status = 'RUNNING'
     OR OLD.tenant_id <> NEW.tenant_id OR OLD.project_id <> NEW.project_id
     OR OLD.step_id <> NEW.step_id OR OLD.attempt_no <> NEW.attempt_no
     OR OLD.action_version <> NEW.action_version OR OLD.idempotency_key <> NEW.idempotency_key
     OR OLD.input_snapshot <> NEW.input_snapshot OR OLD.started_at <> NEW.started_at THEN
    RAISE EXCEPTION 'completed delivery attempts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_step_attempts_terminal_once
BEFORE UPDATE OR DELETE ON delivery_step_attempts
FOR EACH ROW EXECUTE FUNCTION app.assert_delivery_attempt_transition();
CREATE TRIGGER delivery_acceptance_receipts_immutable
BEFORE UPDATE OR DELETE ON delivery_acceptance_receipts
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER delivery_status_history_immutable
BEFORE UPDATE OR DELETE ON delivery_status_history
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE delivery_step_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_step_attempts_tenant_isolation ON delivery_step_attempts
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE delivery_acceptance_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_acceptance_receipts_tenant_isolation ON delivery_acceptance_receipts
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE delivery_project_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_project_assignments_tenant_isolation ON delivery_project_assignments
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE delivery_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_exceptions_tenant_isolation ON delivery_exceptions
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE delivery_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_status_history_tenant_isolation ON delivery_status_history
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0010_delivery_workflow', encode(digest('lequbao-v6.1-0010', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
