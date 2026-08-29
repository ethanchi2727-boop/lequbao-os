BEGIN;

-- 结算代金券抵扣快照：quote 阶段登记 RESERVED 抵扣意图，submit 成单后置为 SETTLED 并核销 reward_grants。
-- 金额事实仍以 reward_grants(redeemed_amount_cents) 与不可变账本为准，本表仅为结算链路投影。
CREATE TABLE platform_checkout_reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES platform_checkout_sessions(id) ON DELETE CASCADE,
  checkout_group_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  merchant_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reward_grant_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','SETTLED','RELEASED')),
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checkout_id, reward_grant_id),
  FOREIGN KEY (merchant_tenant_id, reward_grant_id)
    REFERENCES reward_grants(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX platform_checkout_reward_redemptions_checkout_idx
  ON platform_checkout_reward_redemptions(account_id, checkout_id);

INSERT INTO schema_migrations(version,checksum)
VALUES ('0028_platform_checkout_reward_redemption',encode(digest('lequbao-v6.1-0028-platform-checkout-reward-redemption','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
