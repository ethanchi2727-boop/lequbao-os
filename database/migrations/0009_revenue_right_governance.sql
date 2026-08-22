BEGIN;

CREATE TABLE revenue_right_transfer_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL,
  confirmation_role text NOT NULL CHECK (confirmation_role IN ('FROM_BENEFICIARY','TO_BENEFICIARY')),
  beneficiary_id uuid NOT NULL REFERENCES revenue_beneficiaries(id),
  confirmed_by uuid NOT NULL REFERENCES users(id),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, transfer_id, confirmation_role),
  FOREIGN KEY (tenant_id, transfer_id) REFERENCES revenue_right_transfers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE revenue_right_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  right_group_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','REJECTED','CANCELLED')),
  claimant_beneficiary_ids uuid[] NOT NULL CHECK (cardinality(claimant_beneficiary_ids) >= 2),
  reason_code text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  opened_by uuid NOT NULL REFERENCES users(id),
  resolved_by uuid REFERENCES users(id),
  resolution jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, right_group_id) REFERENCES merchant_revenue_right_groups(tenant_id, id),
  CHECK ((status = 'OPEN' AND resolved_by IS NULL AND resolved_at IS NULL) OR status <> 'OPEN'),
  CHECK ((status NOT IN ('RESOLVED','REJECTED')) OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolution IS NOT NULL))
);

CREATE UNIQUE INDEX revenue_right_disputes_open_uidx
ON revenue_right_disputes(tenant_id, right_group_id) WHERE status = 'OPEN';

CREATE OR REPLACE FUNCTION app.assert_revenue_transfer_confirmation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_beneficiary uuid;
  confirming_user uuid;
BEGIN
  SELECT CASE NEW.confirmation_role
           WHEN 'FROM_BENEFICIARY' THEN transfer.from_beneficiary_id
           ELSE transfer.to_beneficiary_id
         END
    INTO expected_beneficiary
    FROM revenue_right_transfers transfer
   WHERE transfer.tenant_id = NEW.tenant_id AND transfer.id = NEW.transfer_id;
  SELECT user_id INTO confirming_user FROM revenue_beneficiaries WHERE id = NEW.beneficiary_id;
  IF expected_beneficiary IS NULL OR NEW.beneficiary_id <> expected_beneficiary
     OR confirming_user IS NULL OR confirming_user <> NEW.confirmed_by THEN
    RAISE EXCEPTION 'transfer confirmation must come from the matching beneficiary user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_right_transfer_confirmation_check
BEFORE INSERT ON revenue_right_transfer_confirmations
FOR EACH ROW EXECUTE FUNCTION app.assert_revenue_transfer_confirmation();

CREATE OR REPLACE FUNCTION app.assert_revenue_transfer_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  confirmation_count integer;
BEGIN
  IF NEW.status IN ('APPROVED','EFFECTIVE') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by = NEW.requested_by THEN
      RAISE EXCEPTION 'transfer approval requires a different approver';
    END IF;
    SELECT count(*) INTO confirmation_count
      FROM revenue_right_transfer_confirmations
     WHERE tenant_id = NEW.tenant_id AND transfer_id = NEW.id;
    IF confirmation_count <> 2 THEN
      RAISE EXCEPTION 'transfer requires both beneficiary confirmations';
    END IF;
  END IF;
  IF NEW.status = 'EFFECTIVE' AND NEW.effective_at IS NULL THEN
    RAISE EXCEPTION 'effective transfer requires effective_at';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_right_transfer_approval_check
BEFORE UPDATE OF status, approved_by, effective_at ON revenue_right_transfers
FOR EACH ROW EXECUTE FUNCTION app.assert_revenue_transfer_approval();

CREATE OR REPLACE FUNCTION app.freeze_revenue_right_on_dispute()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE merchant_revenue_right_groups
     SET status = 'DISPUTED'
   WHERE tenant_id = NEW.tenant_id AND id = NEW.right_group_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'only an active revenue right can enter dispute'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_right_dispute_freeze
BEFORE INSERT ON revenue_right_disputes
FOR EACH ROW EXECUTE FUNCTION app.freeze_revenue_right_on_dispute();

CREATE TRIGGER revenue_right_transfer_confirmations_immutable
BEFORE UPDATE OR DELETE ON revenue_right_transfer_confirmations
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE revenue_right_transfer_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_right_transfer_confirmations_tenant_isolation ON revenue_right_transfer_confirmations
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE revenue_right_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_right_disputes_tenant_isolation ON revenue_right_disputes
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO schema_migrations(version, checksum)
VALUES ('0009_revenue_right_governance', encode(digest('lequbao-v6.1-0009', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
