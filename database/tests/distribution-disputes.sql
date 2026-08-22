\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='revenue_distribution_disputes') THEN
    RAISE EXCEPTION 'distribution dispute RLS policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='revenue_distribution_disputes'::regclass
      AND tgname='revenue_distribution_disputes_request_immutable'
  ) THEN
    RAISE EXCEPTION 'distribution dispute immutable request trigger missing';
  END IF;
END;
$$;

ROLLBACK;
