BEGIN;

CREATE TABLE subscription_cash_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('RECEIPT','REFUND')),
  entry_type text NOT NULL CHECK (entry_type IN ('CONFIRMATION','CORRECTION')),
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  provider text NOT NULL,
  external_event_id text NOT NULL,
  provider_reference_hash text NOT NULL,
  original_entry_id uuid,
  occurred_at timestamptz NOT NULL,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_event_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions(tenant_id, id),
  FOREIGN KEY (tenant_id, original_entry_id) REFERENCES subscription_cash_ledger_entries(tenant_id, id),
  CHECK (
    (entry_type = 'CONFIRMATION' AND amount_cents > 0 AND original_entry_id IS NULL)
    OR (entry_type = 'CORRECTION' AND original_entry_id IS NOT NULL)
  )
);

CREATE INDEX subscription_cash_ledger_period_idx
ON subscription_cash_ledger_entries(tenant_id, subscription_id, occurred_at, bucket);

CREATE OR REPLACE FUNCTION app.assert_subscription_cash_correction_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_subscription uuid;
  original_bucket text;
BEGIN
  IF NEW.entry_type = 'CORRECTION' THEN
    SELECT subscription_id, bucket INTO original_subscription, original_bucket
      FROM subscription_cash_ledger_entries
     WHERE tenant_id = NEW.tenant_id AND id = NEW.original_entry_id;
    IF original_subscription IS NULL
       OR original_subscription <> NEW.subscription_id
       OR original_bucket <> NEW.bucket THEN
      RAISE EXCEPTION 'cash correction must retain original tenant, subscription and bucket';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscription_cash_correction_scope_check
BEFORE INSERT ON subscription_cash_ledger_entries
FOR EACH ROW EXECUTE FUNCTION app.assert_subscription_cash_correction_scope();

CREATE TRIGGER subscription_cash_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON subscription_cash_ledger_entries
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE subscription_cash_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_cash_ledger_entries_tenant_isolation
ON subscription_cash_ledger_entries
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0004_subscription_cash_ledger', encode(digest('lequbao-v6.1-0004', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
