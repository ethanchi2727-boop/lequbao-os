BEGIN;

CREATE TABLE sales_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  legal_subject_name text NOT NULL,
  unified_credit_code_hash text,
  contact_mobile_hash text,
  store_address_hash text,
  evidence_asset_id uuid NOT NULL,
  first_contact_at timestamptz NOT NULL,
  next_action text NOT NULL,
  status text NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW','QUALIFIED','DUPLICATE_REVIEW','QUOTED','CONTRACTED','WON','LOST')),
  protection_until timestamptz,
  converted_merchant_profile_id uuid,
  loss_reason_code text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,converted_merchant_profile_id)
    REFERENCES merchant_profiles(tenant_id,id),
  FOREIGN KEY (tenant_id,evidence_asset_id)
    REFERENCES merchant_intake_assets(tenant_id,id),
  CHECK (unified_credit_code_hash IS NOT NULL OR contact_mobile_hash IS NOT NULL OR store_address_hash IS NOT NULL),
  CHECK (unified_credit_code_hash IS NULL OR unified_credit_code_hash ~ '^[a-f0-9]{64}$'),
  CHECK (contact_mobile_hash IS NULL OR contact_mobile_hash ~ '^[a-f0-9]{64}$'),
  CHECK (store_address_hash IS NULL OR store_address_hash ~ '^[a-f0-9]{64}$'),
  CHECK ((status='LOST') = (loss_reason_code IS NOT NULL))
);

CREATE INDEX sales_opportunities_owner_status_idx
ON sales_opportunities(tenant_id,owner_user_id,status,updated_at DESC);
CREATE INDEX sales_opportunities_credit_idx
ON sales_opportunities(tenant_id,unified_credit_code_hash)
WHERE unified_credit_code_hash IS NOT NULL;
CREATE INDEX sales_opportunities_mobile_idx
ON sales_opportunities(tenant_id,contact_mobile_hash)
WHERE contact_mobile_hash IS NOT NULL;

CREATE TABLE sales_duplicate_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  checked_by uuid NOT NULL REFERENCES users(id),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  matched_opportunity_ids uuid[] NOT NULL DEFAULT '{}',
  matched_merchant_profile_ids uuid[] NOT NULL DEFAULT '{}',
  result text NOT NULL CHECK (result IN ('CLEAR','POTENTIAL_DUPLICATE','CONFIRMED_DUPLICATE')),
  decision_reason_code text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,opportunity_id,request_hash),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,opportunity_id)
    REFERENCES sales_opportunities(tenant_id,id) ON DELETE CASCADE,
  CHECK ((result='CONFIRMED_DUPLICATE') = (decision_reason_code IS NOT NULL))
);

CREATE TABLE sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  plan_code text NOT NULL REFERENCES plans(plan_code),
  list_price_cents bigint NOT NULL CHECK (list_price_cents >= 0),
  quoted_price_cents bigint NOT NULL CHECK (quoted_price_cents >= 0),
  addon_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(addon_snapshot)='array'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','ACCEPTED','EXPIRED','WITHDRAWN')),
  valid_until timestamptz NOT NULL,
  issued_by uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,opportunity_id)
    REFERENCES sales_opportunities(tenant_id,id) ON DELETE CASCADE,
  CHECK (valid_until > created_at),
  CHECK (quoted_price_cents <= list_price_cents OR jsonb_array_length(addon_snapshot)>0)
);

CREATE TABLE sales_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  contract_no text NOT NULL,
  contract_asset_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','SIGNED','VOID')),
  privacy_policy_version text NOT NULL,
  merchant_signer_ref_hash text,
  platform_signer_user_id uuid REFERENCES users(id),
  signed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,contract_no),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,opportunity_id)
    REFERENCES sales_opportunities(tenant_id,id),
  FOREIGN KEY (tenant_id,quote_id) REFERENCES sales_quotes(tenant_id,id),
  FOREIGN KEY (tenant_id,contract_asset_id)
    REFERENCES merchant_intake_assets(tenant_id,id),
  CHECK (merchant_signer_ref_hash IS NULL OR merchant_signer_ref_hash ~ '^[a-f0-9]{64}$'),
  CHECK ((status='SIGNED') =
    (merchant_signer_ref_hash IS NOT NULL AND platform_signer_user_id IS NOT NULL AND signed_at IS NOT NULL))
);

CREATE TABLE sales_collection_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  provider_reference_hash text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  status text NOT NULL CHECK (status IN ('CONFIRMED','REVERSED')),
  original_receipt_id uuid,
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provider,external_event_id),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,contract_id) REFERENCES sales_contracts(tenant_id,id),
  FOREIGN KEY (tenant_id,original_receipt_id) REFERENCES sales_collection_receipts(tenant_id,id),
  CHECK (provider_reference_hash ~ '^[a-f0-9]{64}$'),
  CHECK ((status='CONFIRMED' AND amount_cents>0 AND original_receipt_id IS NULL)
    OR (status='REVERSED' AND amount_cents<0 AND original_receipt_id IS NOT NULL))
);

CREATE TABLE subscription_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id uuid,
  subscription_id uuid,
  applied_subscription_id uuid,
  change_type text NOT NULL CHECK (change_type IN ('ACTIVATE','RENEW','CANCEL','PLAN_CHANGE')),
  requested_plan_code text REFERENCES plans(plan_code),
  effective_at timestamptz NOT NULL,
  reason_code text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','APPLIED','REJECTED','CANCELLED')),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  decided_by uuid REFERENCES users(id),
  decision_reason_code text,
  decided_at timestamptz,
  applied_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,contract_id) REFERENCES sales_contracts(tenant_id,id),
  FOREIGN KEY (tenant_id,subscription_id) REFERENCES tenant_subscriptions(tenant_id,id),
  FOREIGN KEY (tenant_id,applied_subscription_id) REFERENCES tenant_subscriptions(tenant_id,id),
  CHECK (
    (change_type='ACTIVATE' AND contract_id IS NOT NULL AND subscription_id IS NULL
      AND requested_plan_code IS NOT NULL)
    OR (change_type='RENEW' AND contract_id IS NOT NULL AND subscription_id IS NOT NULL)
    OR (change_type='PLAN_CHANGE' AND contract_id IS NOT NULL AND subscription_id IS NOT NULL
      AND requested_plan_code IS NOT NULL)
    OR (change_type='CANCEL' AND contract_id IS NULL AND subscription_id IS NOT NULL
      AND requested_plan_code IS NULL)
  ),
  CHECK ((status IN ('APPROVED','APPLIED')) = (approved_by IS NOT NULL)),
  CHECK ((status<>'PENDING') = (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK ((status='APPLIED') = (applied_at IS NOT NULL)),
  CHECK ((status='APPLIED') = (applied_subscription_id IS NOT NULL)),
  CHECK (decided_by IS NULL OR decided_by<>requested_by),
  CHECK (approved_by IS NULL OR approved_by=decided_by),
  CHECK ((status='REJECTED') = (decision_reason_code IS NOT NULL))
);

CREATE UNIQUE INDEX tenant_subscriptions_one_live_idx
ON tenant_subscriptions(tenant_id)
WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED');

CREATE TABLE renewal_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  report_month date NOT NULL CHECK (report_month=date_trunc('month',report_month)::date),
  metrics_snapshot jsonb NOT NULL CHECK (jsonb_typeof(metrics_snapshot)='object'),
  issue_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(issue_snapshot)='array'),
  recommended_plan_code text REFERENCES plans(plan_code),
  recommendation_reason text NOT NULL,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','CONTACTED','ACCEPTED','DECLINED','EXPIRED')),
  due_at timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,subscription_id,report_month),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,subscription_id) REFERENCES tenant_subscriptions(tenant_id,id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales_opportunities','sales_duplicate_checks','sales_quotes','sales_contracts',
    'sales_collection_receipts','subscription_change_requests','renewal_previews'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id())',
      table_name,table_name
    );
  END LOOP;
END $$;

CREATE TRIGGER sales_opportunities_set_updated_at BEFORE UPDATE ON sales_opportunities
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER sales_quotes_set_updated_at BEFORE UPDATE ON sales_quotes
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER sales_contracts_set_updated_at BEFORE UPDATE ON sales_contracts
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER subscription_change_requests_set_updated_at BEFORE UPDATE ON subscription_change_requests
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER renewal_previews_set_updated_at BEFORE UPDATE ON renewal_previews
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER sales_duplicate_checks_immutable BEFORE UPDATE OR DELETE ON sales_duplicate_checks
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER sales_collection_receipts_immutable BEFORE UPDATE OR DELETE ON sales_collection_receipts
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0021_sales_and_subscription_lifecycle',encode(digest('lequbao-v6.1-0021','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
