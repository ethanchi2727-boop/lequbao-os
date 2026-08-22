BEGIN;

CREATE TABLE revenue_distribution_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL,
  cost_entry_id uuid,
  dispute_type text NOT NULL CHECK (dispute_type IN ('COST','REVENUE')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  requested_by uuid NOT NULL REFERENCES users(id),
  resolved_by uuid REFERENCES users(id),
  resolution_code text,
  resolution_note text,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,requested_by,idempotency_key),
  FOREIGN KEY (tenant_id,statement_id) REFERENCES revenue_distribution_statements(tenant_id,id),
  FOREIGN KEY (tenant_id,cost_entry_id) REFERENCES direct_cost_entries(tenant_id,id),
  CHECK ((dispute_type='COST')=(cost_entry_id IS NOT NULL)),
  CHECK ((status IN ('RESOLVED','REJECTED'))=(resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK ((status='RESOLVED')=(resolution_code IS NOT NULL))
);

CREATE INDEX revenue_distribution_disputes_statement_idx
ON revenue_distribution_disputes(tenant_id,statement_id,status,created_at DESC);

ALTER TABLE revenue_distribution_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_distribution_disputes_tenant_isolation
ON revenue_distribution_disputes
USING (tenant_id=app.current_tenant_id())
WITH CHECK (tenant_id=app.current_tenant_id());

CREATE TRIGGER revenue_distribution_disputes_set_updated_at
BEFORE UPDATE ON revenue_distribution_disputes
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.protect_distribution_dispute_request()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.tenant_id,OLD.statement_id,OLD.cost_entry_id,OLD.dispute_type,OLD.reason_code,
         OLD.description,OLD.requested_by,OLD.idempotency_key,OLD.request_hash)
     IS DISTINCT FROM
     ROW(NEW.tenant_id,NEW.statement_id,NEW.cost_entry_id,NEW.dispute_type,NEW.reason_code,
         NEW.description,NEW.requested_by,NEW.idempotency_key,NEW.request_hash) THEN
    RAISE EXCEPTION 'distribution dispute request evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_distribution_disputes_request_immutable
BEFORE UPDATE ON revenue_distribution_disputes
FOR EACH ROW EXECUTE FUNCTION app.protect_distribution_dispute_request();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0022_distribution_disputes',encode(digest('lequbao-v6.1-0022','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
