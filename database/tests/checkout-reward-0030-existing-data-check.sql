\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform_checkout_reward_redemptions
    WHERE id='57000000-0000-4000-8000-000000000012'
      AND account_id='57000000-0000-4000-8000-000000000004'
      AND checkout_id='57000000-0000-4000-8000-000000000006'
      AND checkout_group_id='57000000-0000-4000-8000-000000000007'
      AND customer_id='57000000-0000-4000-8000-000000000003'
      AND reward_grant_id='57000000-0000-4000-8000-000000000011'
      AND amount_cents=500 AND status='RESERVED' AND order_id IS NULL
  ) THEN RAISE EXCEPTION '0030 changed existing redemption facts'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM reward_grants
    WHERE id='57000000-0000-4000-8000-000000000011'
      AND granted_amount_cents=1000 AND redeemed_amount_cents=0
  ) THEN RAISE EXCEPTION '0030 changed existing reward facts'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version='0030_checkout_reward_customer_scope'
  ) THEN RAISE EXCEPTION '0030 marker missing'; END IF;
END
$$;

\echo '0030 preserved committed 0028 redemption and reward facts'
