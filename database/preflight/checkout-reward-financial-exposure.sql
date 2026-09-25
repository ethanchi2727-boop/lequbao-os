\set ON_ERROR_STOP on

-- Run against an isolated restored database with a privileged migration identity.
-- This report contains aggregate counts and minor currency units only.
BEGIN READ ONLY;
SET LOCAL row_security = off;

WITH settled AS (
  SELECT redemption.merchant_tenant_id AS tenant_id,
         redemption.order_id,
         redemption.checkout_group_id,
         sum(redemption.amount_cents)::bigint AS reward_cents,
         count(*)::bigint AS redemption_count,
         count(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM ledger_transactions ledger_tx
            WHERE ledger_tx.tenant_id=redemption.merchant_tenant_id
              AND ledger_tx.transaction_type='REWARD_REDEEM'
              AND ledger_tx.business_id=redemption.id
         ))::bigint AS missing_redeem_ledger_count
    FROM platform_checkout_reward_redemptions redemption
   WHERE redemption.status='SETTLED'
   GROUP BY redemption.merchant_tenant_id,redemption.order_id,redemption.checkout_group_id
), exposure AS (
  SELECT settled.*,
         checkout_group.payable_amount_cents AS quoted_payable_cents,
         checkout_order.payable_amount_cents AS order_payable_cents,
         checkout_order.status AS order_status,
         checkout_order.payment_status
    FROM settled
    LEFT JOIN platform_checkout_groups checkout_group
      ON checkout_group.id=settled.checkout_group_id
     AND checkout_group.merchant_tenant_id=settled.tenant_id
    LEFT JOIN orders checkout_order
      ON checkout_order.id=settled.order_id
     AND checkout_order.tenant_id=settled.tenant_id
)
SELECT count(*)::bigint AS settled_order_groups,
       coalesce(sum(redemption_count),0)::bigint AS settled_redemptions,
       coalesce(sum(reward_cents),0)::bigint AS settled_reward_cents,
       coalesce(sum(missing_redeem_ledger_count),0)::bigint AS missing_redeem_ledger_rows,
       count(*) FILTER (WHERE order_status IS NULL)::bigint AS missing_order_groups,
       count(*) FILTER (WHERE order_status IN ('CANCELLED','CLOSED')
                         OR payment_status='FAILED')::bigint AS failed_or_closed_order_groups,
       count(*) FILTER (WHERE order_payable_cents >
                            greatest(quoted_payable_cents-reward_cents,0))::bigint
         AS order_exceeds_quoted_cash_groups
  FROM exposure;

COMMIT;
