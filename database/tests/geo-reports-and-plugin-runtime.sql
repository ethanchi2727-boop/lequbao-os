\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF (SELECT count(*) FROM metric_definitions WHERE active) < 6 THEN
    RAISE EXCEPTION 'metric definitions missing';
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    UPDATE metric_definitions SET description='silent semantic change' WHERE metric_code='PAID_ORDERS';
    RAISE EXCEPTION 'metric version guard did not reject mutation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='metric version guard did not reject mutation' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='plugin_runtime_invocations' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'plugin runtime invocation RLS missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='geo_publication_evidence_immutable' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'GEO evidence immutability missing'; END IF;
END $$;

ROLLBACK;
