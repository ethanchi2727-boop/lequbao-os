\set ON_ERROR_STOP on

-- Run as the migration owner on a quiesced 0028 database before 0029/0030.
-- Aggregate counts only; do not print customer, account, order or grant identifiers.
BEGIN READ ONLY;
SET LOCAL row_security = off;

DO $$
DECLARE
  marker_count bigint;
  checkout_conflicts bigint;
  group_conflicts bigint;
  grant_conflicts bigint;
  customer_conflicts bigint;
  order_conflicts bigint;
  status_conflicts bigint;
BEGIN
  SELECT count(*) INTO marker_count FROM schema_migrations
   WHERE version='0028_platform_checkout_reward_redemption';
  IF marker_count<>1 THEN
    RAISE EXCEPTION 'checkout reward upgrade requires applied migration 0028';
  END IF;

  SELECT
    count(*) FILTER (WHERE checkout_session.id IS NULL),
    count(*) FILTER (WHERE checkout_group.id IS NULL),
    count(*) FILTER (WHERE reward_grant.id IS NULL),
    count(*) FILTER (WHERE checkout_group.id IS NOT NULL
                       AND reward_grant.id IS NOT NULL
                       AND checkout_group.customer_id IS DISTINCT FROM reward_grant.customer_id),
    count(*) FILTER (WHERE redemption.order_id IS NOT NULL AND checkout_order.id IS NULL),
    count(*) FILTER (WHERE (redemption.status='SETTLED') IS DISTINCT FROM
                          (redemption.order_id IS NOT NULL))
    INTO checkout_conflicts,group_conflicts,grant_conflicts,
         customer_conflicts,order_conflicts,status_conflicts
  FROM platform_checkout_reward_redemptions redemption
  LEFT JOIN platform_checkout_sessions checkout_session
    ON checkout_session.id=redemption.checkout_id
   AND checkout_session.account_id=redemption.account_id
  LEFT JOIN platform_checkout_groups checkout_group
    ON checkout_group.id=redemption.checkout_group_id
   AND checkout_group.checkout_id=redemption.checkout_id
   AND checkout_group.account_id=redemption.account_id
   AND checkout_group.merchant_tenant_id=redemption.merchant_tenant_id
  LEFT JOIN reward_grants reward_grant
    ON reward_grant.id=redemption.reward_grant_id
   AND reward_grant.tenant_id=redemption.merchant_tenant_id
  LEFT JOIN orders checkout_order
    ON checkout_order.id=redemption.order_id
   AND checkout_order.tenant_id=redemption.merchant_tenant_id;

  IF checkout_conflicts+group_conflicts+grant_conflicts+customer_conflicts+
     order_conflicts+status_conflicts<>0 THEN
    RAISE EXCEPTION 'checkout reward upgrade conflicts: checkout=%, group=%, grant=%, customer=%, order=%, status=%',
      checkout_conflicts,group_conflicts,grant_conflicts,customer_conflicts,
      order_conflicts,status_conflicts;
  END IF;
END
$$;

COMMIT;
\echo 'Checkout reward upgrade preflight passed'
