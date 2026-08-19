\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='product_publication_receipts'
  ) THEN
    RAISE EXCEPTION 'product publication receipt RLS policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='product_publication_receipts_immutable'
  ) THEN
    RAISE EXCEPTION 'product publication receipt immutability missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='product_publication_receipts'::regclass
       AND contype='u' AND pg_get_constraintdef(oid) LIKE '%tenant_id, idempotency_key%'
  ) THEN
    RAISE EXCEPTION 'product publication idempotency uniqueness missing';
  END IF;
END $$;
ROLLBACK;
