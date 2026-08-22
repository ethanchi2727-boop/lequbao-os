BEGIN;

ALTER TABLE knowledge_bases
  ADD COLUMN store_id uuid,
  ADD CONSTRAINT knowledge_bases_store_fk
    FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id);

ALTER TABLE knowledge_documents
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES users(id),
  ADD CONSTRAINT knowledge_documents_validity_check
    CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at > valid_from);

ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE customer_consents
  ADD COLUMN purpose text NOT NULL DEFAULT 'SERVICE_DELIVERY',
  ADD COLUMN interface_ref text,
  ADD COLUMN valid_until timestamptz,
  ADD CONSTRAINT customer_consents_validity_check
    CHECK (valid_until IS NULL OR valid_until > occurred_at);

ALTER TABLE conversations
  ADD COLUMN consumer_session_id text,
  ADD COLUMN privacy_policy_version text,
  ADD COLUMN context_type text CHECK (context_type IN ('NONE','PRODUCT','GROUP_BUY','ORDER')),
  ADD COLUMN context_id uuid,
  ADD COLUMN summary_object_key text,
  ADD COLUMN repeat_question_fingerprint text,
  ADD COLUMN repeat_question_count integer NOT NULL DEFAULT 0 CHECK (repeat_question_count >= 0),
  ADD COLUMN ai_processing_state text NOT NULL DEFAULT 'IDLE'
    CHECK (ai_processing_state IN ('IDLE','QUEUED','RUNNING','BLOCKED','FAILED')),
  ADD CONSTRAINT conversations_context_check
    CHECK ((context_type IS NULL OR context_type='NONE') = (context_id IS NULL));

ALTER TABLE handoff_tickets
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN escalated_at timestamptz,
  ADD COLUMN requested_by_type text NOT NULL DEFAULT 'RULE'
    CHECK (requested_by_type IN ('CUSTOMER','RULE','AI','EMPLOYEE')),
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_tenant_id_id_unique UNIQUE (tenant_id, id);
ALTER TABLE handoff_tickets
  ADD CONSTRAINT handoff_tickets_tenant_id_id_unique UNIQUE (tenant_id, id);

CREATE UNIQUE INDEX handoff_tickets_one_active_per_conversation_uidx
ON handoff_tickets(tenant_id,conversation_id)
WHERE status IN ('OPEN','ASSIGNED');

CREATE TABLE consumer_sessions (
  session_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  store_id uuid NOT NULL,
  auth_subject_hash text NOT NULL CHECK (auth_subject_hash ~ '^[a-f0-9]{64}$'),
  auth_level text NOT NULL DEFAULT 'WECHAT' CHECK (auth_level IN ('WECHAT','PHONE_BOUND')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR
         (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

ALTER TABLE conversations
  ADD CONSTRAINT conversations_consumer_session_fk
  FOREIGN KEY (tenant_id, consumer_session_id) REFERENCES consumer_sessions(tenant_id, session_id);

CREATE TABLE knowledge_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version integer NOT NULL CHECK (document_version > 0),
  source_type text NOT NULL CHECK (source_type IN ('MERCHANT_RULE','PRODUCT_REALTIME','ORDER_REALTIME','MERCHANT_FILE','EMPLOYEE_CONFIRMED_QA','PUBLIC_REFERENCE')),
  trust_level text NOT NULL CHECK (trust_level IN ('AUTHORITATIVE','VERIFIED','REFERENCE')),
  title text NOT NULL,
  citation_object_ref text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  valid_from timestamptz NOT NULL,
  expires_at timestamptz,
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_id, document_version),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, knowledge_base_id) REFERENCES knowledge_bases(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, document_id) REFERENCES knowledge_documents(tenant_id, id) ON DELETE CASCADE,
  CHECK (expires_at IS NULL OR expires_at > valid_from)
);

CREATE TABLE conversation_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  customer_message_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','HANDOFF','FAILED','CANCELLED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  locked_by text,
  locked_at timestamptz,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_message_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_message_id) REFERENCES conversation_messages(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status='RUNNING') = (locked_by IS NOT NULL AND locked_at IS NOT NULL)),
  CHECK ((status IN ('SUCCEEDED','HANDOFF','FAILED','CANCELLED')) = (completed_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR last_error_code IS NOT NULL)
);

CREATE TABLE conversation_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  tool_code text NOT NULL CHECK (tool_code IN ('STORE_STATUS','PRICE','INVENTORY','ORDER','REFUND_STATUS')),
  read_only boolean NOT NULL DEFAULT true CHECK (read_only),
  customer_id uuid,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  result_object_ref text,
  result_digest text CHECK (result_digest IS NULL OR result_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED','DENIED')),
  error_code text,
  trace_ref text NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_id, message_id, tool_code, request_digest),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, message_id) REFERENCES conversation_messages(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id),
  CHECK ((status='SUCCEEDED') = (result_object_ref IS NOT NULL AND result_digest IS NOT NULL)),
  CHECK ((status='SUCCEEDED') OR error_code IS NOT NULL)
);

CREATE TABLE conversation_answer_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  answer_message_id uuid NOT NULL,
  source_message_id uuid NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(citations)='array'),
  tool_call_ids uuid[] NOT NULL DEFAULT '{}',
  model_route text NOT NULL,
  prompt_version text NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  grounded boolean NOT NULL,
  risk_labels text[] NOT NULL DEFAULT '{}',
  model_trace_ref text NOT NULL,
  input_units bigint NOT NULL DEFAULT 0 CHECK (input_units >= 0),
  output_units bigint NOT NULL DEFAULT 0 CHECK (output_units >= 0),
  cost_minor_units bigint NOT NULL DEFAULT 0 CHECK (cost_minor_units >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, answer_message_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, answer_message_id) REFERENCES conversation_messages(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_message_id) REFERENCES conversation_messages(tenant_id, id) ON DELETE CASCADE,
  CHECK (grounded OR cardinality(risk_labels) > 0)
);

CREATE TABLE customer_profile_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  fact_type text NOT NULL CHECK (fact_type IN ('IDENTITY_LINK','ORDER_RELATION','CONSULTATION_SUMMARY','PREFERENCE','SERVICE_RECORD','EMPLOYEE_NOTE')),
  value_object_ref text NOT NULL,
  value_digest text NOT NULL CHECK (value_digest ~ '^[a-f0-9]{64}$'),
  source_type text NOT NULL CHECK (source_type IN ('CUSTOMER','ORDER','CONVERSATION','EMPLOYEE','MODEL_SUMMARY')),
  source_ref text NOT NULL,
  purpose text NOT NULL,
  generation_method text NOT NULL CHECK (generation_method IN ('DIRECT_FACT','DERIVED','MODEL_SUMMARY','HUMAN_CORRECTION')),
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','CORRECTED','EXPIRED','DELETION_PENDING','DELETED','RETAINED_RESTRICTED')),
  supersedes_id uuid,
  confirmed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, supersedes_id) REFERENCES customer_profile_facts(tenant_id, id),
  CHECK (expires_at > confirmed_at),
  CHECK ((generation_method='HUMAN_CORRECTION') = (supersedes_id IS NOT NULL))
);

CREATE TABLE customer_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('VIEW','CORRECT','WITHDRAW_CONSENT','DELETE','RESTRICT')),
  scope text[] NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','VALIDATING','PROCESSING','PARTIALLY_RETAINED','COMPLETED','REJECTED','FAILED')),
  legal_hold boolean NOT NULL DEFAULT false,
  retention_basis text,
  requested_by_session_id text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_summary)='object'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, request_hash),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, requested_by_session_id) REFERENCES consumer_sessions(tenant_id, session_id),
  CHECK (cardinality(scope) > 0),
  CHECK ((status IN ('PARTIALLY_RETAINED','COMPLETED','REJECTED')) = (completed_at IS NOT NULL)),
  CHECK ((status='PARTIALLY_RETAINED') = (retention_basis IS NOT NULL))
);

CREATE TABLE customer_service_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('IN_APP','WECOM_INTERNAL')),
  recipient_scope jsonb NOT NULL CHECK (jsonb_typeof(recipient_scope)='object'),
  payload_summary jsonb NOT NULL CHECK (jsonb_typeof(payload_summary)='object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DELIVERED','FAILED','SKIPPED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ticket_id, channel),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES handoff_tickets(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status='DELIVERED') = (delivered_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR last_error_code IS NOT NULL)
);

CREATE OR REPLACE FUNCTION app.assert_customer_service_conversation_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status='BOT_ACTIVE' AND NEW.status IN ('HUMAN_REQUESTED','CLOSED')) OR
    (OLD.status='HUMAN_REQUESTED' AND NEW.status='HUMAN_QUEUED') OR
    (OLD.status='HUMAN_QUEUED' AND NEW.status='HUMAN_ACTIVE') OR
    (OLD.status='HUMAN_ACTIVE' AND NEW.status IN ('BOT_ACTIVE','WAITING_CUSTOMER','CLOSED')) OR
    (OLD.status='WAITING_CUSTOMER' AND NEW.status IN ('HUMAN_ACTIVE','CLOSED')) OR
    (OLD.status='CLOSED' AND NEW.status='BOT_ACTIVE')
  ) THEN RAISE EXCEPTION 'invalid customer-service conversation transition % -> %', OLD.status, NEW.status; END IF;
  IF NEW.status='HUMAN_ACTIVE' AND NEW.assigned_user_id IS NULL THEN
    RAISE EXCEPTION 'active human conversation requires assigned employee';
  END IF;
  IF NEW.status='BOT_ACTIVE' AND NEW.assigned_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'bot-active conversation cannot retain assigned employee';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_service_conversation_transition_check
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION app.assert_customer_service_conversation_transition();

CREATE OR REPLACE FUNCTION app.assert_conversation_message_sender()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation_status text; assigned_user uuid;
BEGIN
  SELECT status,assigned_user_id INTO conversation_status,assigned_user
    FROM conversations WHERE tenant_id=NEW.tenant_id AND id=NEW.conversation_id;
  IF NEW.sender_type='AI' AND conversation_status <> 'BOT_ACTIVE' THEN
    RAISE EXCEPTION 'AI cannot reply after human handoff';
  END IF;
  IF NEW.sender_type='EMPLOYEE' AND
     (conversation_status <> 'HUMAN_ACTIVE' OR assigned_user IS DISTINCT FROM NEW.sender_user_id) THEN
    RAISE EXCEPTION 'only the assigned employee may reply';
  END IF;
  IF NEW.sender_type <> 'EMPLOYEE' AND NEW.sender_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-employee message cannot claim employee identity';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_message_sender_check
BEFORE INSERT ON conversation_messages
FOR EACH ROW EXECUTE FUNCTION app.assert_conversation_message_sender();

CREATE TRIGGER conversation_messages_immutable
BEFORE UPDATE OR DELETE ON conversation_messages
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER conversation_answer_evidence_immutable
BEFORE UPDATE OR DELETE ON conversation_answer_evidence
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER conversation_tool_calls_immutable
BEFORE UPDATE OR DELETE ON conversation_tool_calls
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER customer_consents_immutable
BEFORE UPDATE OR DELETE ON customer_consents
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE OR REPLACE FUNCTION app.assert_knowledge_publication_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'knowledge publications are append-only'; END IF;
  IF OLD.status <> 'ACTIVE' OR NEW.status NOT IN ('EXPIRED','REVOKED') OR
     OLD.tenant_id <> NEW.tenant_id OR OLD.store_id <> NEW.store_id OR
     OLD.knowledge_base_id <> NEW.knowledge_base_id OR OLD.document_id <> NEW.document_id OR
     OLD.document_version <> NEW.document_version OR OLD.source_type <> NEW.source_type OR
     OLD.trust_level <> NEW.trust_level OR OLD.title <> NEW.title OR
     OLD.citation_object_ref <> NEW.citation_object_ref OR OLD.content_hash <> NEW.content_hash OR
     OLD.valid_from <> NEW.valid_from OR OLD.expires_at IS DISTINCT FROM NEW.expires_at OR
     OLD.published_by <> NEW.published_by OR OLD.published_at <> NEW.published_at THEN
    RAISE EXCEPTION 'published knowledge content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_publication_transition_check
BEFORE UPDATE OR DELETE ON knowledge_publications
FOR EACH ROW EXECUTE FUNCTION app.assert_knowledge_publication_transition();

CREATE OR REPLACE FUNCTION app.assert_customer_profile_fact_consent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE consent_status text; consent_expiry timestamptz;
BEGIN
  IF NEW.status='CURRENT' THEN
    SELECT status,valid_until INTO consent_status,consent_expiry
      FROM customer_consents
     WHERE tenant_id=NEW.tenant_id AND customer_id=NEW.customer_id
       AND consent_type='PROFILE_MEMORY'
     ORDER BY occurred_at DESC,id DESC LIMIT 1;
    IF consent_status IS DISTINCT FROM 'GRANTED' OR
       (consent_expiry IS NOT NULL AND consent_expiry <= now()) THEN
      RAISE EXCEPTION 'active profile-memory consent is required for customer facts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_profile_fact_consent_check
BEFORE INSERT OR UPDATE OF status ON customer_profile_facts
FOR EACH ROW EXECUTE FUNCTION app.assert_customer_profile_fact_consent();

CREATE OR REPLACE FUNCTION app.assert_ai_job_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'AI jobs cannot be deleted'; END IF;
  IF OLD.status IN ('SUCCEEDED','HANDOFF','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'terminal AI job is immutable';
  END IF;
  IF NOT ((OLD.status='QUEUED' AND NEW.status IN ('RUNNING','CANCELLED')) OR
          (OLD.status='RUNNING' AND NEW.status IN ('QUEUED','SUCCEEDED','HANDOFF','FAILED','CANCELLED'))) THEN
    RAISE EXCEPTION 'invalid AI job transition % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_ai_job_transition_check
BEFORE UPDATE OR DELETE ON conversation_ai_jobs
FOR EACH ROW EXECUTE FUNCTION app.assert_ai_job_transition();

ALTER TABLE consumer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY consumer_sessions_tenant_isolation ON consumer_sessions
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE knowledge_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_publications_tenant_isolation ON knowledge_publications
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE conversation_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_ai_jobs_tenant_isolation ON conversation_ai_jobs
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE conversation_tool_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_tool_calls_tenant_isolation ON conversation_tool_calls
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE conversation_answer_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_answer_evidence_tenant_isolation ON conversation_answer_evidence
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE customer_profile_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_profile_facts_tenant_isolation ON customer_profile_facts
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE customer_privacy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_privacy_requests_tenant_isolation ON customer_privacy_requests
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE customer_service_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_service_notifications_tenant_isolation ON customer_service_notifications
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

INSERT INTO schema_migrations(version,checksum)
VALUES ('0012_customer_service_and_privacy',encode(digest('lequbao-v6.1-0012','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
