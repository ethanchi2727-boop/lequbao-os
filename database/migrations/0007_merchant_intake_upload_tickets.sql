BEGIN;

CREATE TABLE merchant_intake_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('IMAGE','DOCUMENT','AUDIO')),
  object_key text NOT NULL,
  expected_sha256 text NOT NULL CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  content_type text NOT NULL,
  max_bytes bigint NOT NULL CHECK (max_bytes BETWEEN 1 AND 52428800),
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','CONSUMED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, object_key),
  FOREIGN KEY (tenant_id, session_id) REFERENCES merchant_intake_sessions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES merchant_intake_assets(tenant_id, id),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'CREATED' AND asset_id IS NULL AND consumed_at IS NULL)
    OR (status = 'CONSUMED' AND asset_id IS NOT NULL AND consumed_at IS NOT NULL)
    OR (status = 'EXPIRED' AND asset_id IS NULL AND consumed_at IS NULL)
  )
);

CREATE OR REPLACE FUNCTION app.assert_intake_upload_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id <> NEW.tenant_id OR OLD.session_id <> NEW.session_id
     OR OLD.asset_type <> NEW.asset_type OR OLD.object_key <> NEW.object_key
     OR OLD.expected_sha256 <> NEW.expected_sha256 OR OLD.content_type <> NEW.content_type
     OR OLD.max_bytes <> NEW.max_bytes OR OLD.expires_at <> NEW.expires_at
     OR OLD.created_by <> NEW.created_by OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'merchant intake upload authorization is immutable';
  END IF;
  IF OLD.status <> 'CREATED' OR NEW.status NOT IN ('CONSUMED','EXPIRED') THEN
    RAISE EXCEPTION 'invalid merchant intake upload transition % to %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchant_intake_upload_transition_check
BEFORE UPDATE ON merchant_intake_uploads
FOR EACH ROW EXECUTE FUNCTION app.assert_intake_upload_transition();

ALTER TABLE merchant_intake_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_intake_uploads_tenant_isolation ON merchant_intake_uploads
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0007_merchant_intake_upload_tickets', encode(digest('lequbao-v6.1-0007', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
