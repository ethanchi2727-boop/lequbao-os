BEGIN;

CREATE TABLE revenue_distribution_action_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('PAY','REVERSE')),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  reason_code text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CONSUMED','EXPIRED')),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  consumed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, statement_id, action_type, request_hash),
  FOREIGN KEY (tenant_id, statement_id) REFERENCES revenue_distribution_statements(tenant_id, id),
  CHECK (expires_at > requested_at),
  CHECK (
    (status = 'PENDING' AND approved_by IS NULL AND approved_at IS NULL AND consumed_at IS NULL)
    OR (status = 'REJECTED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND consumed_at IS NULL)
    OR (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND consumed_at IS NULL)
    OR (status = 'CONSUMED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND consumed_at IS NOT NULL)
    OR (status = 'EXPIRED' AND consumed_at IS NULL)
  ),
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE revenue_payout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  provider text NOT NULL,
  provider_payment_ref_hash text,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  failure_code text,
  requested_by uuid NOT NULL REFERENCES users(id),
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, allocation_id) REFERENCES revenue_distribution_allocations(tenant_id, id),
  FOREIGN KEY (tenant_id, approval_id) REFERENCES revenue_distribution_action_approvals(tenant_id, id),
  CHECK (
    (status = 'SUCCEEDED' AND provider_payment_ref_hash IS NOT NULL AND failure_code IS NULL)
    OR (status = 'FAILED' AND provider_payment_ref_hash IS NULL AND failure_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX revenue_payout_one_success_per_allocation
ON revenue_payout_attempts(tenant_id, allocation_id)
WHERE status = 'SUCCEEDED';

CREATE UNIQUE INDEX revenue_payout_provider_reference_unique
ON revenue_payout_attempts(tenant_id, provider, provider_payment_ref_hash)
WHERE provider_payment_ref_hash IS NOT NULL;

CREATE UNIQUE INDEX revenue_distribution_entry_derivation_unique
ON revenue_distribution_entries(tenant_id, original_entry_id, entry_type)
WHERE original_entry_id IS NOT NULL AND entry_type IN ('PAYMENT','REVERSAL');

CREATE OR REPLACE FUNCTION app.assert_distribution_entry_linkage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_allocation uuid;
  original_type text;
  original_amount bigint;
BEGIN
  IF NEW.entry_type = 'ACCRUAL' AND NEW.original_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'accrual entry cannot link an original entry';
  END IF;
  IF NEW.entry_type IN ('PAYMENT','REVERSAL') THEN
    IF NEW.original_entry_id IS NULL THEN
      RAISE EXCEPTION '% entry requires an original entry', NEW.entry_type;
    END IF;
    SELECT allocation_id, entry_type, amount_cents
      INTO original_allocation, original_type, original_amount
      FROM revenue_distribution_entries
     WHERE tenant_id = NEW.tenant_id AND id = NEW.original_entry_id;
    IF original_allocation IS NULL OR original_allocation <> NEW.allocation_id THEN
      RAISE EXCEPTION 'derived distribution entry must retain original tenant and allocation';
    END IF;
    IF NEW.entry_type = 'PAYMENT' AND original_type <> 'ACCRUAL' THEN
      RAISE EXCEPTION 'payment entry must link the original accrual';
    END IF;
    IF NEW.entry_type = 'REVERSAL' AND original_type NOT IN ('ACCRUAL','PAYMENT') THEN
      RAISE EXCEPTION 'reversal entry must link an accrual or payment';
    END IF;
    IF NEW.amount_cents <> -original_amount THEN
      RAISE EXCEPTION 'derived distribution entry must exactly negate the original entry';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_distribution_entry_linkage_check
BEFORE INSERT ON revenue_distribution_entries
FOR EACH ROW EXECUTE FUNCTION app.assert_distribution_entry_linkage();

CREATE OR REPLACE FUNCTION app.assert_distribution_approval_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tenant_id <> NEW.tenant_id OR OLD.statement_id <> NEW.statement_id
     OR OLD.action_type <> NEW.action_type OR OLD.request_hash <> NEW.request_hash
     OR OLD.reason_code <> NEW.reason_code OR OLD.requested_by <> NEW.requested_by
     OR OLD.requested_at <> NEW.requested_at OR OLD.expires_at <> NEW.expires_at THEN
    RAISE EXCEPTION 'distribution approval request content is immutable';
  END IF;
  IF NOT (
    (OLD.status = 'PENDING' AND NEW.status IN ('APPROVED','REJECTED','EXPIRED'))
    OR (OLD.status = 'APPROVED' AND NEW.status IN ('CONSUMED','EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'invalid distribution approval transition % to %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'APPROVED' AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expired distribution approval cannot be approved';
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_distribution_approval_transition_check
BEFORE UPDATE ON revenue_distribution_action_approvals
FOR EACH ROW EXECUTE FUNCTION app.assert_distribution_approval_transition();

CREATE OR REPLACE FUNCTION app.assert_revenue_payout_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allocation_statement uuid;
  allocation_amount bigint;
  approval_statement uuid;
  approval_action text;
  approval_status text;
  approval_expiry timestamptz;
BEGIN
  SELECT statement_id, allocated_cents INTO allocation_statement, allocation_amount
    FROM revenue_distribution_allocations
   WHERE tenant_id = NEW.tenant_id AND id = NEW.allocation_id;
  SELECT statement_id, action_type, status, expires_at
    INTO approval_statement, approval_action, approval_status, approval_expiry
    FROM revenue_distribution_action_approvals
   WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  IF allocation_statement IS NULL OR allocation_statement <> approval_statement
     OR approval_action <> 'PAY' OR approval_status <> 'APPROVED'
     OR approval_expiry <= NEW.completed_at THEN
    RAISE EXCEPTION 'payout requires a current approved PAY action for the same statement';
  END IF;
  IF NEW.amount_cents <> allocation_amount THEN
    RAISE EXCEPTION 'payout amount must exactly equal the frozen allocation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_payout_evidence_check
BEFORE INSERT ON revenue_payout_attempts
FOR EACH ROW EXECUTE FUNCTION app.assert_revenue_payout_evidence();

CREATE TRIGGER revenue_payout_attempts_immutable
BEFORE UPDATE OR DELETE ON revenue_payout_attempts
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER revenue_distribution_action_approvals_set_updated_at
BEFORE UPDATE ON revenue_distribution_action_approvals
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE revenue_distribution_action_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_distribution_action_approvals_tenant_isolation
ON revenue_distribution_action_approvals
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE revenue_payout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_payout_attempts_tenant_isolation
ON revenue_payout_attempts
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0005_distribution_payout_and_reversal', encode(digest('lequbao-v6.1-0005', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
