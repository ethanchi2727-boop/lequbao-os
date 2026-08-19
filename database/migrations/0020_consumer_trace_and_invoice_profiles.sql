BEGIN;

CREATE TABLE product_trace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  report_version integer NOT NULL CHECK (report_version > 0),
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence)='array'),
  status text NOT NULL DEFAULT 'VERIFIED' CHECK (status IN ('VERIFIED','WITHDRAWN','EXPIRED')),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,product_id,report_version),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,product_id) REFERENCES products(tenant_id,id),
  CHECK (expires_at IS NULL OR expires_at > verified_at)
);

CREATE UNIQUE INDEX product_trace_reports_one_current_uidx
ON product_trace_reports(tenant_id,product_id)
WHERE status='VERIFIED';

CREATE TABLE platform_invoice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  profile_type text NOT NULL CHECK (profile_type IN ('PERSONAL','ENTERPRISE')),
  title_ciphertext text NOT NULL,
  tax_identifier_ciphertext text,
  email_ciphertext text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,id),
  CHECK ((profile_type='ENTERPRISE') = (tax_identifier_ciphertext IS NOT NULL))
);

CREATE UNIQUE INDEX platform_invoice_profiles_one_default_uidx
ON platform_invoice_profiles(account_id) WHERE is_default AND status='ACTIVE';

ALTER TABLE product_trace_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_trace_reports_tenant_isolation ON product_trace_reports
USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

ALTER TABLE platform_invoice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_invoice_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_invoice_profiles_self ON platform_invoice_profiles
USING (account_id=app.current_consumer_account_id())
WITH CHECK (account_id=app.current_consumer_account_id());

INSERT INTO schema_migrations(version,checksum)
VALUES ('0020_consumer_trace_and_invoice_profiles',encode(digest('lequbao-v6.1-0020','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
