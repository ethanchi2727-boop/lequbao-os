BEGIN;

CREATE TABLE employee_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  mode text NOT NULL CHECK (mode IN ('NORMAL','COMPLEX')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,store_id) REFERENCES stores(tenant_id,id)
);

CREATE TABLE employee_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  prompt_object_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('NORMAL','COMPLEX','BACKGROUND')),
  status text NOT NULL DEFAULT 'PLANNING' CHECK (status IN (
    'PLANNING','READY','RUNNING','WAITING_APPROVAL','PAUSED','SUCCEEDED','FAILED','CANCELLED'
  )),
  plan_version integer NOT NULL DEFAULT 1 CHECK (plan_version>0),
  planned_steps integer NOT NULL DEFAULT 0 CHECK (planned_steps BETWEEN 0 AND 12),
  max_steps integer NOT NULL CHECK (max_steps BETWEEN 1 AND 12),
  max_tool_calls integer NOT NULL CHECK (max_tool_calls BETWEEN 0 AND 100),
  max_cost_micros bigint NOT NULL CHECK (max_cost_micros>=0),
  actual_tool_calls integer NOT NULL DEFAULT 0 CHECK (actual_tool_calls BETWEEN 0 AND 100),
  actual_cost_micros bigint NOT NULL DEFAULT 0 CHECK (actual_cost_micros>=0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 2),
  deadline_at timestamptz NOT NULL,
  result_summary_redacted text,
  failure_code text,
  unknown_result boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,created_by,idempotency_key),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES employee_agent_conversations(tenant_id,id),
  CHECK (deadline_at>created_at),
  CHECK (max_steps<=CASE WHEN mode='NORMAL' THEN 8 ELSE 12 END),
  CHECK ((status IN ('SUCCEEDED','FAILED','CANCELLED'))=(completed_at IS NOT NULL)),
  CHECK (status<>'SUCCEEDED' OR (failure_code IS NULL AND NOT unknown_result)),
  CHECK (actual_cost_micros<=max_cost_micros)
);

CREATE TABLE employee_agent_task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  plan_version integer NOT NULL CHECK (plan_version>0),
  step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 12),
  action_code text NOT NULL CHECK (action_code ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  tool_code text,
  risk_level text NOT NULL CHECK (risk_level IN ('AUTO','NOTIFY','CONFIRM','DUAL_CONFIRM')),
  input_summary_redacted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_summary_redacted)='object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','RUNNING','WAITING_APPROVAL','SUCCEEDED','FAILED','UNKNOWN','SKIPPED'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  output_summary_redacted jsonb CHECK (output_summary_redacted IS NULL OR jsonb_typeof(output_summary_redacted)='object'),
  failure_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,task_id,plan_version,step_number),
  FOREIGN KEY (tenant_id,task_id) REFERENCES employee_agent_tasks(tenant_id,id) ON DELETE CASCADE,
  CHECK (status<>'SUCCEEDED' OR output_summary_redacted IS NOT NULL),
  CHECK (status<>'UNKNOWN' OR failure_code IS NOT NULL)
);

CREATE TABLE employee_agent_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  content_type text NOT NULL CHECK (char_length(content_type) BETWEEN 1 AND 255),
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 52428800),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,task_id) REFERENCES employee_agent_tasks(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE employee_agent_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  step_id uuid,
  evidence_type text NOT NULL CHECK (evidence_type IN ('SOURCE','TOOL_CALL','TOOL_RESULT','MODEL_TRACE')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 255),
  reference_hash text NOT NULL CHECK (reference_hash ~ '^[a-f0-9]{64}$'),
  summary_redacted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary_redacted)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,task_id) REFERENCES employee_agent_tasks(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,step_id) REFERENCES employee_agent_task_steps(tenant_id,id)
);

CREATE TABLE employee_agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  step_id uuid NOT NULL,
  plan_version integer NOT NULL CHECK (plan_version>0),
  approval_level text NOT NULL CHECK (approval_level IN ('CONFIRM','DUAL_CONFIRM')),
  impact_summary_redacted jsonb NOT NULL CHECK (jsonb_typeof(impact_summary_redacted)='object'),
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED','CONSUMED')),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,token_hash),
  FOREIGN KEY (tenant_id,task_id) REFERENCES employee_agent_tasks(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,step_id) REFERENCES employee_agent_task_steps(tenant_id,id),
  CHECK (expires_at>created_at),
  CHECK ((status IN ('APPROVED','REJECTED','CONSUMED'))=(decided_at IS NOT NULL)),
  CHECK (status<>'CONSUMED' OR consumed_at IS NOT NULL),
  CHECK (approval_level<>'DUAL_CONFIRM' OR approved_by IS NULL OR approved_by<>requested_by)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'employee_agent_conversations','employee_agent_tasks','employee_agent_task_steps',
    'employee_agent_artifacts','employee_agent_evidence','employee_agent_approvals'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id())',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER employee_agent_conversations_updated BEFORE UPDATE ON employee_agent_conversations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER employee_agent_tasks_updated BEFORE UPDATE ON employee_agent_tasks FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER employee_agent_task_steps_updated BEFORE UPDATE ON employee_agent_task_steps FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER employee_agent_evidence_immutable BEFORE UPDATE OR DELETE ON employee_agent_evidence FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER employee_agent_artifacts_immutable BEFORE UPDATE OR DELETE ON employee_agent_artifacts FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0023_employee_agent_runtime',encode(digest('lequbao-v6.1-0023','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
