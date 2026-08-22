\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'employee_agent_%')<>6 THEN
    RAISE EXCEPTION 'employee agent RLS policies incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='employee_agent_evidence_immutable') THEN
    RAISE EXCEPTION 'employee agent evidence immutability missing';
  END IF;
END $$;
ROLLBACK;
