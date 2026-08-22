\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id, tenant_code, legal_name, display_name)
VALUES ('50000000-0000-4000-8000-000000000001', 'cash-ledger-test', 'Cash Ledger Legal', 'Cash Ledger');
INSERT INTO users(id, display_name)
VALUES ('50000000-0000-4000-8000-000000000002', 'Cash Recorder');
INSERT INTO tenant_subscriptions(
  id, tenant_id, plan_code, status, starts_at, current_period_start, current_period_end
) VALUES (
  '50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001',
  'STANDARD_898_MONTH', 'ACTIVE', now(), now(), now() + interval '1 month'
);

INSERT INTO subscription_cash_ledger_entries(
  id, tenant_id, subscription_id, bucket, entry_type, amount_cents, provider,
  external_event_id, provider_reference_hash, occurred_at, recorded_by
) VALUES
  ('50000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'RECEIPT', 'CONFIRMATION', 1000, 'WECHAT', 'receipt-1', 'hash-receipt-1', now(), '50000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'REFUND', 'CONFIRMATION', 100, 'WECHAT', 'refund-1', 'hash-refund-1', now(), '50000000-0000-4000-8000-000000000002');
INSERT INTO subscription_cash_ledger_entries(
  tenant_id, subscription_id, bucket, entry_type, amount_cents, provider,
  external_event_id, provider_reference_hash, original_entry_id, occurred_at, recorded_by
) VALUES
  ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'RECEIPT', 'CORRECTION', -10, 'INTERNAL', 'receipt-correction-1', 'hash-correction-1', '50000000-0000-4000-8000-000000000004', now(), '50000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'REFUND', 'CORRECTION', -20, 'INTERNAL', 'refund-correction-1', 'hash-correction-2', '50000000-0000-4000-8000-000000000005', now(), '50000000-0000-4000-8000-000000000002');

DO $$
DECLARE
  receipt_total bigint;
  refund_total bigint;
BEGIN
  SELECT sum(amount_cents) FILTER (WHERE bucket = 'RECEIPT'),
         sum(amount_cents) FILTER (WHERE bucket = 'REFUND')
    INTO receipt_total, refund_total
    FROM subscription_cash_ledger_entries
   WHERE subscription_id = '50000000-0000-4000-8000-000000000003';
  IF receipt_total <> 990 OR refund_total <> 80 THEN
    RAISE EXCEPTION 'cash ledger totals wrong: receipt %, refund %', receipt_total, refund_total;
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO subscription_cash_ledger_entries(
      tenant_id, subscription_id, bucket, entry_type, amount_cents, provider,
      external_event_id, provider_reference_hash, original_entry_id, occurred_at
    ) VALUES (
      '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003',
      'REFUND', 'CORRECTION', 1, 'INTERNAL', 'wrong-bucket-correction', 'wrong-hash',
      '50000000-0000-4000-8000-000000000004', now()
    );
    RAISE EXCEPTION 'cross-bucket correction unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'cash correction must retain original%' THEN NULL;
    ELSE RAISE;
    END IF;
  END;

  BEGIN
    UPDATE subscription_cash_ledger_entries SET amount_cents = 999
     WHERE id = '50000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'cash ledger mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'immutable table subscription_cash_ledger_entries%' THEN NULL;
    ELSE RAISE;
    END IF;
  END;
END
$$;

ROLLBACK;

\echo 'Subscription cash source ledger checks passed'
