BEGIN;

-- Upgrade databases that already recorded 0028 without changing reward or order money facts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='platform_checkout_groups'::regclass
      AND conname='platform_checkout_groups_redemption_scope_unique'
  ) THEN
    ALTER TABLE platform_checkout_groups
      ADD CONSTRAINT platform_checkout_groups_redemption_scope_unique
        UNIQUE (account_id, id, checkout_id, merchant_tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='platform_checkout_reward_redemptions'::regclass
      AND conname='redemptions_account_checkout_fk'
  ) THEN
    ALTER TABLE platform_checkout_reward_redemptions
      ADD CONSTRAINT redemptions_account_checkout_fk
        FOREIGN KEY (account_id, checkout_id)
          REFERENCES platform_checkout_sessions(account_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='platform_checkout_reward_redemptions'::regclass
      AND conname='redemptions_group_scope_fk'
  ) THEN
    ALTER TABLE platform_checkout_reward_redemptions
      ADD CONSTRAINT redemptions_group_scope_fk
        FOREIGN KEY (account_id, checkout_group_id, checkout_id, merchant_tenant_id)
          REFERENCES platform_checkout_groups(account_id, id, checkout_id, merchant_tenant_id)
          ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='platform_checkout_reward_redemptions'::regclass
      AND conname='redemptions_tenant_order_fk'
  ) THEN
    ALTER TABLE platform_checkout_reward_redemptions
      ADD CONSTRAINT redemptions_tenant_order_fk
        FOREIGN KEY (merchant_tenant_id, order_id)
          REFERENCES orders(tenant_id, id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='platform_checkout_reward_redemptions'::regclass
      AND conname='redemptions_settled_order_check'
  ) THEN
    ALTER TABLE platform_checkout_reward_redemptions
      ADD CONSTRAINT redemptions_settled_order_check
        CHECK ((status='SETTLED') = (order_id IS NOT NULL));
  END IF;
END
$$;

ALTER TABLE platform_checkout_reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_checkout_reward_redemptions FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='platform_checkout_reward_redemptions'
      AND policyname='platform_checkout_reward_redemptions_self'
  ) THEN
    CREATE POLICY platform_checkout_reward_redemptions_self
      ON platform_checkout_reward_redemptions
      USING (account_id=app.current_consumer_account_id())
      WITH CHECK (account_id=app.current_consumer_account_id());
  END IF;
END
$$;

INSERT INTO schema_migrations(version,checksum)
VALUES ('0029_checkout_reward_redemption_scope',encode(digest('lequbao-v6.1-0029-checkout-reward-redemption-scope','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
