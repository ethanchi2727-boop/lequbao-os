BEGIN;

CREATE TABLE legacy_migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  migration_version text NOT NULL, source_snapshot_id text NOT NULL, phase text NOT NULL CHECK(phase IN ('EXPAND','BACKFILL','VERIFY','SWITCH','CONTRACT')),
  status text NOT NULL CHECK(status IN ('READY','RUNNING','PAUSED','VERIFYING','SUCCEEDED','FAILED','BLOCKED')),
  source_schema_hash text NOT NULL CHECK(source_schema_hash~'^[a-f0-9]{64}$'), started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,migration_version,source_snapshot_id), UNIQUE(tenant_id,id)
);

CREATE TABLE legacy_migration_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL, entity_type text NOT NULL, last_source_id text, batch_number integer NOT NULL DEFAULT 0 CHECK(batch_number>=0),
  processed_count bigint NOT NULL DEFAULT 0 CHECK(processed_count>=0), failed_count bigint NOT NULL DEFAULT 0 CHECK(failed_count>=0),
  batch_input_hash text, batch_output_hash text, status text NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','RUNNING','PAUSED','COMPLETED','FAILED')),
  lease_owner text, lease_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,run_id,entity_type), FOREIGN KEY(tenant_id,run_id) REFERENCES legacy_migration_runs(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE legacy_id_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL, entity_type text NOT NULL, source_id text NOT NULL, target_id uuid NOT NULL,
  source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'), target_hash text NOT NULL CHECK(target_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,run_id,entity_type,source_id),
  FOREIGN KEY(tenant_id,run_id) REFERENCES legacy_migration_runs(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE legacy_migration_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL, scope_type text NOT NULL CHECK(scope_type IN ('TENANT_DAY','TENANT_TOTAL','GLOBAL_TOTAL')), scope_key text NOT NULL,
  source_summary jsonb NOT NULL, target_summary jsonb NOT NULL, difference_summary jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('BALANCED','KNOWN_DIFFERENCE','UNEXPLAINED_DIFFERENCE')),
  approved_known_difference_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,run_id,scope_type,scope_key), FOREIGN KEY(tenant_id,run_id) REFERENCES legacy_migration_runs(tenant_id,id) ON DELETE CASCADE,
  CHECK(status<>'KNOWN_DIFFERENCE' OR approved_known_difference_by IS NOT NULL)
);

CREATE TABLE legacy_migration_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL, entity_type text NOT NULL, source_id text NOT NULL, reason_code text NOT NULL,
  safe_action text NOT NULL CHECK(safe_action IN ('DISABLE_ACCOUNT','OMIT_MARKETING_CONSENT','REVIEW_STATE','REVIEW_MONEY','REVIEW_OWNERSHIP')),
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','REJECTED')),
  resolved_by uuid REFERENCES users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,run_id,entity_type,source_id,reason_code), FOREIGN KEY(tenant_id,run_id) REFERENCES legacy_migration_runs(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE privacy_deletion_propagation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  privacy_request_id uuid NOT NULL, target_system text NOT NULL CHECK(target_system IN ('PRIMARY_DB','OBJECT_STORE','SEARCH','VECTOR','CACHE','RESTORE_REPLAY')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','LEGAL_HOLD')),
  idempotency_key text NOT NULL, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 20), last_error_code text,
  completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,privacy_request_id,target_system), FOREIGN KEY(tenant_id,privacy_request_id) REFERENCES customer_privacy_requests(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE operational_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  alert_code text NOT NULL, severity text NOT NULL CHECK(severity IN ('P0','P1','P2','P3')), resource_type text NOT NULL,
  resource_id text, trace_id text NOT NULL, fingerprint text NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb, first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
  acknowledged_by uuid REFERENCES users(id), resolved_at timestamptz, UNIQUE NULLS NOT DISTINCT(tenant_id,alert_code,fingerprint)
);

CREATE OR REPLACE FUNCTION app.enqueue_privacy_deletion_targets() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  IF NEW.request_type='DELETE' THEN
    FOREACH target IN ARRAY ARRAY['PRIMARY_DB','OBJECT_STORE','SEARCH','VECTOR','CACHE'] LOOP
      INSERT INTO privacy_deletion_propagation_tasks(tenant_id,privacy_request_id,target_system,status,idempotency_key)
      VALUES(NEW.tenant_id,NEW.id,target,CASE WHEN NEW.legal_hold THEN 'LEGAL_HOLD' ELSE 'PENDING' END,
             'privacy-delete:'||NEW.id::text||':'||target) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_privacy_requests_propagation
AFTER INSERT ON customer_privacy_requests FOR EACH ROW EXECUTE FUNCTION app.enqueue_privacy_deletion_targets();

CREATE OR REPLACE FUNCTION app.enqueue_restore_privacy_deletions(p_tenant_id uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE affected integer;
BEGIN
  INSERT INTO privacy_deletion_propagation_tasks(tenant_id,privacy_request_id,target_system,status,idempotency_key,attempt_count,last_error_code,completed_at,updated_at)
  SELECT tenant_id,id,'RESTORE_REPLAY','PENDING','privacy-restore:'||id::text,0,NULL,NULL,now()
    FROM customer_privacy_requests WHERE tenant_id=p_tenant_id AND request_type='DELETE' AND status IN('COMPLETED','PARTIALLY_RETAINED') AND NOT legal_hold
  ON CONFLICT(tenant_id,privacy_request_id,target_system) DO UPDATE SET status='PENDING',attempt_count=0,last_error_code=NULL,completed_at=NULL,updated_at=now();
  GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY[
  'legacy_migration_runs','legacy_migration_cursors','legacy_id_mappings','legacy_migration_reconciliations',
  'legacy_migration_review_items','privacy_deletion_propagation_tasks'
] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format(
  'CREATE POLICY %I_tenant_isolation ON %I USING(tenant_id=app.current_tenant_id()) WITH CHECK(tenant_id=app.current_tenant_id())',t,t); END LOOP; END $$;

CREATE POLICY operational_alert_events_tenant_isolation ON operational_alert_events
USING(tenant_id=app.current_tenant_id()) WITH CHECK(tenant_id=app.current_tenant_id());
ALTER TABLE operational_alert_events ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER legacy_id_mappings_immutable BEFORE UPDATE OR DELETE ON legacy_id_mappings FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER legacy_migration_reconciliations_immutable BEFORE UPDATE OR DELETE ON legacy_migration_reconciliations FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE OR REPLACE FUNCTION app.prevent_migration_switch_on_difference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phase IN ('SWITCH','CONTRACT') AND (
    NOT EXISTS(SELECT 1 FROM legacy_migration_reconciliations r WHERE r.tenant_id=NEW.tenant_id AND r.run_id=NEW.id)
    OR EXISTS(SELECT 1 FROM legacy_migration_reconciliations r WHERE r.tenant_id=NEW.tenant_id AND r.run_id=NEW.id AND r.status='UNEXPLAINED_DIFFERENCE')
  ) THEN RAISE EXCEPTION 'migration cannot switch with unexplained difference or missing reconciliation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legacy_migration_switch_guard BEFORE INSERT OR UPDATE ON legacy_migration_runs FOR EACH ROW EXECUTE FUNCTION app.prevent_migration_switch_on_difference();

INSERT INTO schema_migrations(version,checksum) VALUES('0015_operations_migration_and_privacy',encode(digest('lequbao-v6.1-0015','sha256'),'hex'));
COMMIT;
