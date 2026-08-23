\set ON_ERROR_STOP on
WITH facts AS (
  SELECT tenant_id,'orders_count' AS metric,count(*)::numeric AS value FROM orders GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'orders_payable_cents',COALESCE(sum(payable_amount_cents),0) FROM orders GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'orders_paid_cents',COALESCE(sum(paid_amount_cents),0) FROM orders GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'orders_refunded_cents',COALESCE(sum(refunded_amount_cents),0) FROM orders GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'verified_payment_count',count(*) FROM payment_transactions WHERE transaction_type='PAYMENT' AND verified GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'verified_payment_cents',COALESCE(sum(amount_cents),0) FROM payment_transactions WHERE transaction_type='PAYMENT' AND verified GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'succeeded_refund_count',count(*) FROM refunds WHERE status='SUCCEEDED' GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'succeeded_refund_cents',COALESCE(sum(amount_cents),0) FROM refunds WHERE status='SUCCEEDED' GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'verification_use_count',count(*) FROM verification_uses GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'verification_quantity',COALESCE(sum(quantity),0) FROM verification_uses GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'reward_entry_count',count(*) FROM ledger_entries GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'reward_entry_net_cents',COALESCE(sum(amount_cents),0) FROM ledger_entries GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'reward_grant_count',count(*) FROM reward_grants GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'reward_granted_cents',COALESCE(sum(granted_amount_cents),0) FROM reward_grants GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'reward_redeemed_cents',COALESCE(sum(redeemed_amount_cents),0) FROM reward_grants GROUP BY tenant_id
  UNION ALL SELECT tenant_id,'reward_reversed_cents',COALESCE(sum(reversed_amount_cents),0) FROM reward_grants GROUP BY tenant_id
), per_tenant AS (
  SELECT tenant_id,jsonb_object_agg(metric,to_jsonb(value) ORDER BY metric) AS metrics
    FROM facts GROUP BY tenant_id
)
SELECT jsonb_build_object(
  'schemaVersion',1,
  'tenantCount',(SELECT count(*) FROM tenants),
  'tenants',COALESCE(
    (
      SELECT jsonb_object_agg(
        encode(digest(t.id::text,'sha256'),'hex'),
        COALESCE(p.metrics,'{}'::jsonb)
        ORDER BY encode(digest(t.id::text,'sha256'),'hex')
      )
        FROM tenants t LEFT JOIN per_tenant p ON p.tenant_id=t.id
    ),
    '{}'::jsonb
  )
)::text;
