BEGIN;

ALTER TABLE geo_profiles
  ADD COLUMN IF NOT EXISTS canonical_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE geo_publish_targets
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS authorization_status text NOT NULL DEFAULT 'MISSING'
    CHECK (authorization_status IN ('MISSING','ACTIVE','EXPIRED','REVOKED')),
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1;

CREATE TABLE geo_publication_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  geo_profile_id uuid NOT NULL,
  target_id uuid NOT NULL REFERENCES geo_publish_targets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('SUBMIT','STATUS_CHECK','ACCESS_CHECK','DIFFERENCE_FOUND')),
  request_hash text NOT NULL,
  response_reference text,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text NOT NULL CHECK (result IN ('SUCCEEDED','PROCESSING','REJECTED','FAILED','RATE_LIMITED','MANUAL_CHECK')),
  actor_id uuid REFERENCES users(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  trace_id text NOT NULL,
  UNIQUE (tenant_id, target_id, action, request_hash),
  FOREIGN KEY (tenant_id, geo_profile_id) REFERENCES geo_profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE geo_difference_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  geo_profile_id uuid NOT NULL,
  target_id uuid NOT NULL REFERENCES geo_publish_targets(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  canonical_value_hash text NOT NULL,
  observed_value_hash text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONFIRMED','RESOLVED','IGNORED')),
  due_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, target_id, field_name, observed_value_hash),
  FOREIGN KEY (tenant_id, geo_profile_id) REFERENCES geo_profiles(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE plugin_versions
  ADD COLUMN IF NOT EXISTS permission_fingerprint text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rollback_version_id uuid REFERENCES plugin_versions(id);

ALTER TABLE tenant_plugin_installations
  ADD COLUMN IF NOT EXISTS authorization_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS token_generation integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS circuit_status text NOT NULL DEFAULT 'CLOSED'
    CHECK (circuit_status IN ('CLOSED','OPEN','HALF_OPEN')),
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circuit_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS uninstalled_at timestamptz;

ALTER TABLE tenant_plugin_grants
  DROP CONSTRAINT IF EXISTS tenant_plugin_grants_permission_code_fkey;

CREATE OR REPLACE FUNCTION app.validate_plugin_grant_manifest()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant_plugin_installations i
    JOIN plugin_versions v ON v.id=i.plugin_version_id
    WHERE i.tenant_id=NEW.tenant_id AND i.id=NEW.installation_id
      AND v.manifest->'permissions' ? NEW.permission_code
  ) THEN
    RAISE EXCEPTION 'plugin grant is not declared by installed manifest';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tenant_plugin_grants_manifest_guard
BEFORE INSERT OR UPDATE ON tenant_plugin_grants
FOR EACH ROW EXECUTE FUNCTION app.validate_plugin_grant_manifest();

CREATE TABLE plugin_runtime_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  plugin_version_id uuid NOT NULL REFERENCES plugin_versions(id),
  task_id uuid,
  actor_id uuid REFERENCES users(id),
  idempotency_key text NOT NULL,
  action_code text NOT NULL,
  requested_domain text,
  input_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','RETRYABLE_FAILURE','PERMANENT_FAILURE','UNKNOWN','DENIED','CIRCUIT_OPEN')),
  error_code text,
  usage_units numeric(18,6) NOT NULL DEFAULT 0,
  trace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, installation_id, idempotency_key),
  FOREIGN KEY (tenant_id, installation_id) REFERENCES tenant_plugin_installations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE plugin_data_deletion_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  manifest_version text NOT NULL,
  deleted_scopes jsonb NOT NULL,
  token_generation integer NOT NULL,
  completed_at timestamptz NOT NULL,
  trace_id text NOT NULL,
  UNIQUE (tenant_id, installation_id),
  FOREIGN KEY (tenant_id, installation_id) REFERENCES tenant_plugin_installations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE metric_definitions (
  metric_code text PRIMARY KEY,
  display_name text NOT NULL,
  unit text NOT NULL,
  source_event_types text[] NOT NULL,
  calculation_sql_version text NOT NULL,
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE monthly_value_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_month date NOT NULL,
  store_id uuid,
  status text NOT NULL DEFAULT 'GENERATING' CHECK (status IN ('GENERATING','READY','FAILED')),
  generated_through timestamptz NOT NULL,
  metric_definition_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, report_month, store_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);

CREATE TABLE monthly_value_report_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id uuid NOT NULL,
  metric_code text NOT NULL REFERENCES metric_definitions(metric_code),
  metric_value numeric(20,4) NOT NULL,
  source_count integer NOT NULL CHECK (source_count >= 0),
  source_event_ids uuid[] NOT NULL DEFAULT '{}',
  calculation_trace jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, metric_code),
  FOREIGN KEY (tenant_id, report_id) REFERENCES monthly_value_reports(tenant_id, id) ON DELETE CASCADE
);

INSERT INTO metric_definitions(metric_code,display_name,unit,source_event_types,calculation_sql_version,description) VALUES
  ('AI_RECEPTIONS','AI 接待数','COUNT',ARRAY['customer_service.conversation_started.v1'],'v1','报告周期内开始的有效顾客会话'),
  ('HUMAN_HANDOFFS','人工转接数','COUNT',ARRAY['customer_service.human_requested.v1'],'v1','报告周期内创建的人工接管请求'),
  ('PAID_ORDERS','支付订单数','COUNT',ARRAY['payment.succeeded.v1'],'v1','报告周期内首次进入已支付状态的订单'),
  ('VERIFICATIONS','核销次数','COUNT',ARRAY['verification.used.v1'],'v1','报告周期内成功核销记录'),
  ('REFUND_CENTS','退款金额','CENTS',ARRAY['refund.succeeded.v1'],'v1','报告周期内供应商确认成功的退款金额'),
  ('GEO_HEALTH','GEO 健康分','PERCENT',ARRAY['geo.health.checked'],'v1','只反映完整度、一致性、时效和可访问性，不代表排名或流量')
ON CONFLICT (metric_code) DO UPDATE SET
  display_name=EXCLUDED.display_name, unit=EXCLUDED.unit,
  source_event_types=EXCLUDED.source_event_types,
  calculation_sql_version=EXCLUDED.calculation_sql_version, description=EXCLUDED.description;

CREATE OR REPLACE FUNCTION app.reject_metric_definition_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.calculation_sql_version = NEW.calculation_sql_version AND
     (OLD.source_event_types <> NEW.source_event_types OR OLD.description <> NEW.description) THEN
    RAISE EXCEPTION 'metric definition semantics require a new version';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER metric_definitions_version_guard
BEFORE UPDATE ON metric_definitions FOR EACH ROW EXECUTE FUNCTION app.reject_metric_definition_mutation();

CREATE OR REPLACE FUNCTION app.materialize_monthly_value_report(
  p_tenant_id uuid,
  p_report_month date,
  p_store_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_report_id uuid;
  v_month_end date := (p_report_month + interval '1 month')::date;
  v_metric record;
  v_event_ids uuid[];
  v_value numeric(20,4);
BEGIN
  IF p_report_month <> date_trunc('month',p_report_month)::date THEN
    RAISE EXCEPTION 'report month must be the first day';
  END IF;
  INSERT INTO monthly_value_reports(tenant_id,report_month,store_id,status,generated_through,metric_definition_version)
  VALUES(p_tenant_id,p_report_month,p_store_id,'GENERATING',v_month_end::timestamptz,'v1')
  ON CONFLICT(tenant_id,report_month,store_id) DO NOTHING
  RETURNING id INTO v_report_id;
  IF v_report_id IS NULL THEN
    SELECT id INTO v_report_id FROM monthly_value_reports
     WHERE tenant_id=p_tenant_id AND report_month=p_report_month
       AND store_id IS NOT DISTINCT FROM p_store_id;
    RETURN v_report_id;
  END IF;

  FOR v_metric IN SELECT * FROM metric_definitions WHERE active ORDER BY metric_code LOOP
    IF v_metric.metric_code='GEO_HEALTH' THEN
      SELECT COALESCE(avg((completeness_score+consistency_score)/2.0),0),ARRAY[]::uuid[]
        INTO v_value,v_event_ids FROM geo_profiles
       WHERE tenant_id=p_tenant_id AND (p_store_id IS NULL OR store_id=p_store_id);
    ELSE
      SELECT CASE WHEN v_metric.unit='CENTS'
                  THEN COALESCE(sum(COALESCE((payload->>'amount_cents')::numeric,0)),0)
                  ELSE count(*)::numeric END,
             COALESCE(array_agg(id ORDER BY occurred_at,id),ARRAY[]::uuid[])
        INTO v_value,v_event_ids
        FROM outbox_events
       WHERE tenant_id=p_tenant_id
         AND event_name=ANY(v_metric.source_event_types)
         AND occurred_at>=p_report_month::timestamptz AND occurred_at<v_month_end::timestamptz
         AND (p_store_id IS NULL OR payload->>'store_id'=p_store_id::text);
    END IF;
    INSERT INTO monthly_value_report_metrics(
      tenant_id,report_id,metric_code,metric_value,source_count,source_event_ids,calculation_trace
    ) VALUES(
      p_tenant_id,v_report_id,v_metric.metric_code,v_value,cardinality(v_event_ids),v_event_ids,
      jsonb_build_object('version',v_metric.calculation_sql_version,'event_types',v_metric.source_event_types,
                         'from',p_report_month,'to_exclusive',v_month_end,'store_id',p_store_id)
    );
  END LOOP;
  UPDATE monthly_value_reports SET status='READY' WHERE tenant_id=p_tenant_id AND id=v_report_id;
  RETURN v_report_id;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'geo_publication_evidence','geo_difference_tasks','plugin_runtime_invocations',
    'plugin_data_deletion_receipts','monthly_value_reports','monthly_value_report_metrics'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id())',
      t,t
    );
  END LOOP;
END $$;

CREATE TRIGGER geo_publication_evidence_immutable
BEFORE UPDATE OR DELETE ON geo_publication_evidence FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER plugin_runtime_invocations_immutable
BEFORE UPDATE OR DELETE ON plugin_runtime_invocations FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER plugin_data_deletion_receipts_immutable
BEFORE UPDATE OR DELETE ON plugin_data_deletion_receipts FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER monthly_value_report_metrics_immutable
BEFORE UPDATE OR DELETE ON monthly_value_report_metrics FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0014_geo_reports_and_plugin_runtime',encode(digest('lequbao-v6.1-0014','sha256'),'hex'));

COMMIT;
