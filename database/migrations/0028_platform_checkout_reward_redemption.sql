BEGIN;

-- 结算代金券抵扣快照：quote 阶段登记 RESERVED 抵扣意图，submit 成单后置为 SETTLED 并核销 reward_grants。
-- 金额事实仍以 reward_grants(redeemed_amount_cents) 与不可变账本为准，本表仅为结算链路投影。
ALTER TABLE reward_grants
  ADD CONSTRAINT reward_grants_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE platform_checkout_groups
  ADD CONSTRAINT platform_checkout_groups_redemption_scope_unique
    UNIQUE (account_id, id, checkout_id, merchant_tenant_id);

CREATE TABLE platform_checkout_reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL,
  checkout_group_id uuid NOT NULL,
  account_id uuid NOT NULL,
  merchant_tenant_id uuid NOT NULL,
  reward_grant_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','SETTLED','RELEASED')),
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checkout_id, reward_grant_id),
  FOREIGN KEY (account_id, checkout_id)
    REFERENCES platform_checkout_sessions(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, checkout_group_id, checkout_id, merchant_tenant_id)
    REFERENCES platform_checkout_groups(account_id, id, checkout_id, merchant_tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_tenant_id, reward_grant_id)
    REFERENCES reward_grants(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (merchant_tenant_id, order_id)
    REFERENCES orders(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status='SETTLED') = (order_id IS NOT NULL))
);

CREATE INDEX platform_checkout_reward_redemptions_checkout_idx
  ON platform_checkout_reward_redemptions(account_id, checkout_id);

ALTER TABLE platform_checkout_reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_checkout_reward_redemptions FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_checkout_reward_redemptions_self ON platform_checkout_reward_redemptions
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

INSERT INTO schema_migrations(version,checksum)
VALUES ('0028_platform_checkout_reward_redemption',encode(digest('lequbao-v6.1-0028-platform-checkout-reward-redemption','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
