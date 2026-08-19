\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE tablename IN (
    'customer_service_shifts','customer_service_tasks','customer_service_quality_reviews'
  ))<>3 THEN
    RAISE EXCEPTION 'customer service operations RLS policies incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='customer_service_tasks'::regclass
      AND pg_get_constraintdef(oid) LIKE '%customer_id IS NOT NULL%OR%conversation_id IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'customer service task resource binding missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='customer_service_quality_reviews'::regclass
      AND pg_get_constraintdef(oid) LIKE '%REMEDIATION_REQUIRED%remediation_task_id%'
  ) THEN
    RAISE EXCEPTION 'quality remediation task binding missing';
  END IF;
END $$;
ROLLBACK;
