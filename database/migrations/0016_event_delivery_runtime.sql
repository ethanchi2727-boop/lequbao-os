BEGIN;

CREATE TABLE event_consumer_offsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consumer_name text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  partition_key text NOT NULL,
  last_aggregate_version integer NOT NULL CHECK(last_aggregate_version >= 0),
  last_event_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,consumer_name,aggregate_type,aggregate_id)
);

CREATE TABLE event_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE RESTRICT,
  consumer_name text NOT NULL DEFAULT 'outbox-publisher',
  error_class text NOT NULL,
  error_code text NOT NULL,
  error_summary text NOT NULL,
  first_failed_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK(attempt_count > 0),
  recommended_action text NOT NULL,
  replay_count integer NOT NULL DEFAULT 0 CHECK(replay_count >= 0),
  last_replayed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,event_id,consumer_name)
);

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY[
  'event_consumer_offsets','event_dead_letters'
] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format(
    'CREATE POLICY %I_tenant_isolation ON %I USING(tenant_id=app.current_tenant_id()) WITH CHECK(tenant_id=app.current_tenant_id())',
    t,t
  );
END LOOP; END $$;

INSERT INTO schema_migrations(version,checksum)
VALUES('0016_event_delivery_runtime',encode(digest('lequbao-v6.1-0016','sha256'),'hex'));

COMMIT;
