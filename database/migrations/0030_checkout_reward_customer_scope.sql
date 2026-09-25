BEGIN;

-- Bind each redemption to the customer of both its checkout group and reward grant.
-- Existing 0028/0029 rows are backfilled from their checkout group relation.
ALTER TABLE platform_checkout_reward_redemptions ADD COLUMN customer_id uuid;
UPDATE platform_checkout_reward_redemptions redemption
   SET customer_id=checkout_group.customer_id
  FROM platform_checkout_groups checkout_group
 WHERE checkout_group.account_id=redemption.account_id
   AND checkout_group.id=redemption.checkout_group_id
   AND checkout_group.checkout_id=redemption.checkout_id
   AND checkout_group.merchant_tenant_id=redemption.merchant_tenant_id;
ALTER TABLE platform_checkout_reward_redemptions
  ALTER COLUMN customer_id SET NOT NULL;

ALTER TABLE platform_checkout_groups
  ADD CONSTRAINT platform_checkout_groups_reward_customer_unique
    UNIQUE (account_id, id, checkout_id, merchant_tenant_id, customer_id);
ALTER TABLE reward_grants
  ADD CONSTRAINT reward_grants_customer_scope_unique
    UNIQUE (tenant_id, id, customer_id);
ALTER TABLE platform_checkout_reward_redemptions
  ADD CONSTRAINT redemptions_group_customer_fk
    FOREIGN KEY (account_id, checkout_group_id, checkout_id, merchant_tenant_id, customer_id)
      REFERENCES platform_checkout_groups(account_id, id, checkout_id, merchant_tenant_id, customer_id)
      ON DELETE CASCADE,
  ADD CONSTRAINT redemptions_grant_customer_fk
    FOREIGN KEY (merchant_tenant_id, reward_grant_id, customer_id)
      REFERENCES reward_grants(tenant_id, id, customer_id) ON DELETE RESTRICT;

INSERT INTO schema_migrations(version,checksum)
VALUES ('0030_checkout_reward_customer_scope',encode(digest('lequbao-v6.1-0030-checkout-reward-customer-scope','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
