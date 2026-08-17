BEGIN;

CREATE OR REPLACE FUNCTION app.assert_distribution_allocation_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_statement uuid;
  target_tenant uuid;
  statement_status text;
  expected_cents bigint;
  total_cents bigint;
  total_bps integer;
BEGIN
  target_statement := COALESCE(NEW.statement_id, OLD.statement_id);
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  SELECT status, distributable_cents INTO statement_status, expected_cents
    FROM revenue_distribution_statements
   WHERE tenant_id = target_tenant AND id = target_statement;
  IF statement_status IN ('LOCKED','PAYABLE','PAID') THEN
    SELECT COALESCE(sum(allocated_cents), 0), COALESCE(sum(share_bps), 0)
      INTO total_cents, total_bps
      FROM revenue_distribution_allocations
     WHERE tenant_id = target_tenant AND statement_id = target_statement
       AND status <> 'REVERSED';
    IF total_cents <> expected_cents OR total_bps <> 10000 THEN
      RAISE EXCEPTION 'locked distribution must reconcile: expected % cents/10000 bps, got % cents/% bps',
        expected_cents, total_cents, total_bps;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS revenue_distribution_allocation_total_check ON revenue_distribution_allocations;
CREATE CONSTRAINT TRIGGER revenue_distribution_allocation_total_check
AFTER INSERT OR UPDATE OR DELETE ON revenue_distribution_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_distribution_allocation_total();

CREATE OR REPLACE FUNCTION app.assert_locked_distribution_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_cents bigint;
  total_bps integer;
BEGIN
  IF NEW.status IN ('LOCKED','PAYABLE','PAID') THEN
    SELECT COALESCE(sum(allocated_cents), 0), COALESCE(sum(share_bps), 0)
      INTO total_cents, total_bps
      FROM revenue_distribution_allocations
     WHERE tenant_id = NEW.tenant_id AND statement_id = NEW.id
       AND status <> 'REVERSED';
    IF total_cents <> NEW.distributable_cents OR total_bps <> 10000 THEN
      RAISE EXCEPTION 'locked distribution must reconcile: expected % cents/10000 bps, got % cents/% bps',
        NEW.distributable_cents, total_cents, total_bps;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revenue_distribution_statement_lock_check ON revenue_distribution_statements;
CREATE CONSTRAINT TRIGGER revenue_distribution_statement_lock_check
AFTER INSERT OR UPDATE OF status ON revenue_distribution_statements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_locked_distribution_total();

INSERT INTO schema_migrations(version, checksum)
VALUES ('0003_revenue_distribution_invariants', encode(digest('lequbao-v6.1-0003', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
