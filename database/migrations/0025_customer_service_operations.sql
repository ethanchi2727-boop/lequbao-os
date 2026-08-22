BEGIN;

CREATE TABLE customer_service_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  assignee_user_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED','ACTIVE','ENDED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key),
  FOREIGN KEY (tenant_id,store_id) REFERENCES stores(tenant_id,id),
  CHECK (ends_at>starts_at AND ends_at<=starts_at+interval '24 hours')
);

CREATE TABLE customer_service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  customer_id uuid,
  conversation_id uuid,
  task_type text NOT NULL CHECK (task_type IN (
    'FOLLOW_UP','RETENTION','COMPLAINT','KNOWLEDGE_GAP','SERVICE_RECOVERY'
  )),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','HIGH','URGENT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ASSIGNED','DONE','CANCELLED')),
  assigned_user_id uuid REFERENCES users(id),
  due_at timestamptz NOT NULL,
  summary_redacted jsonb NOT NULL CHECK (jsonb_typeof(summary_redacted)='object'),
  resolution_code text,
  created_by uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  completion_idempotency_key text,
  completion_hash text CHECK (completion_hash IS NULL OR completion_hash ~ '^[a-f0-9]{64}$'),
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key),
  UNIQUE (tenant_id,completion_idempotency_key),
  FOREIGN KEY (tenant_id,store_id) REFERENCES stores(tenant_id,id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customer_profiles(tenant_id,id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id),
  CHECK (customer_id IS NOT NULL OR conversation_id IS NOT NULL),
  CHECK ((status='DONE')=(completed_at IS NOT NULL AND completed_by IS NOT NULL AND resolution_code IS NOT NULL)),
  CHECK ((completion_idempotency_key IS NULL)=(completion_hash IS NULL))
);

CREATE TABLE customer_service_quality_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'RANDOM','LOW_RATING','COMPLAINT','HIGH_RISK','POLICY_SAMPLE'
  )),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','REVIEWED','REMEDIATION_REQUIRED','CLOSED')),
  reviewer_user_id uuid REFERENCES users(id),
  accuracy_score smallint CHECK (accuracy_score BETWEEN 0 AND 100),
  safety_score smallint CHECK (safety_score BETWEEN 0 AND 100),
  policy_score smallint CHECK (policy_score BETWEEN 0 AND 100),
  findings_redacted jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(findings_redacted)='object'),
  remediation_task_id uuid,
  decision_idempotency_key text,
  decision_hash text CHECK (decision_hash IS NULL OR decision_hash ~ '^[a-f0-9]{64}$'),
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,conversation_id,trigger_type),
  UNIQUE (tenant_id,decision_idempotency_key),
  FOREIGN KEY (tenant_id,store_id) REFERENCES stores(tenant_id,id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id),
  FOREIGN KEY (tenant_id,remediation_task_id) REFERENCES customer_service_tasks(tenant_id,id),
  CHECK ((decision_idempotency_key IS NULL)=(decision_hash IS NULL)),
  CHECK ((status='PENDING')=(reviewed_at IS NULL)),
  CHECK (status='PENDING' OR (
    reviewer_user_id IS NOT NULL AND accuracy_score IS NOT NULL
    AND safety_score IS NOT NULL AND policy_score IS NOT NULL
  )),
  CHECK (status<>'REMEDIATION_REQUIRED' OR remediation_task_id IS NOT NULL)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customer_service_shifts','customer_service_tasks','customer_service_quality_reviews'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON %I USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id())',
      table_name,table_name
    );
  END LOOP;
END $$;

CREATE TRIGGER customer_service_shifts_updated BEFORE UPDATE ON customer_service_shifts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER customer_service_tasks_updated BEFORE UPDATE ON customer_service_tasks
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER customer_service_quality_reviews_updated BEFORE UPDATE ON customer_service_quality_reviews
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0025_customer_service_operations',encode(digest('lequbao-v6.1-0025-customer-service-operations','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
