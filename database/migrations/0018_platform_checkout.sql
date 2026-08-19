BEGIN;

CREATE TABLE platform_consumer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  recipient_name_ciphertext text NOT NULL,
  mobile_ciphertext text NOT NULL,
  province_code text NOT NULL,
  city_code text NOT NULL,
  district_code text NOT NULL,
  address_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  is_default boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id)
);

CREATE UNIQUE INDEX platform_consumer_addresses_one_default_uidx
ON platform_consumer_addresses(account_id) WHERE is_default AND status='ACTIVE';

CREATE TABLE store_checkout_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  allowed_order_types text[] NOT NULL DEFAULT '{}',
  delivery_fee_cents bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  free_delivery_threshold_cents bigint CHECK (free_delivery_threshold_cents IS NULL OR free_delivery_threshold_cents >= 0),
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  refund_rule_summary text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_id, policy_version),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (allowed_order_types <@ ARRAY['PHYSICAL_DELIVERY','STORE_PICKUP','GROUP_BUY','SERVICE_APPOINTMENT']::text[])
);

CREATE UNIQUE INDEX store_checkout_policies_one_active_uidx
ON store_checkout_policies(tenant_id,store_id) WHERE status='ACTIVE';

CREATE TABLE commerce_discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  rule_version text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  discount_type text NOT NULL CHECK (discount_type IN ('FIXED','BASIS_POINTS')),
  minimum_goods_cents bigint NOT NULL DEFAULT 0 CHECK (minimum_goods_cents >= 0),
  fixed_discount_cents bigint CHECK (fixed_discount_cents IS NULL OR fixed_discount_cents > 0),
  discount_basis_points integer CHECK (discount_basis_points IS NULL OR discount_basis_points BETWEEN 1 AND 10000),
  maximum_discount_cents bigint CHECK (maximum_discount_cents IS NULL OR maximum_discount_cents > 0),
  priority integer NOT NULL DEFAULT 100,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_id, rule_version),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK ((discount_type='FIXED') = (fixed_discount_cents IS NOT NULL)),
  CHECK ((discount_type='BASIS_POINTS') = (discount_basis_points IS NOT NULL))
);

CREATE TABLE platform_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  cart_id uuid NOT NULL REFERENCES shopping_carts(id),
  cart_version integer NOT NULL CHECK (cart_version > 0),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  submit_idempotency_key text,
  submit_request_hash text CHECK (submit_request_hash IS NULL OR submit_request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'QUOTED'
    CHECK (status IN ('QUOTED','SUBMITTING','PARTIAL','ORDERS_CREATED','FAILED','EXPIRED')),
  goods_amount_cents bigint NOT NULL CHECK (goods_amount_cents >= 0),
  discount_amount_cents bigint NOT NULL CHECK (discount_amount_cents >= 0),
  shipping_amount_cents bigint NOT NULL CHECK (shipping_amount_cents >= 0),
  payable_amount_cents bigint NOT NULL CHECK (payable_amount_cents >= 0),
  reward_redemption_status text NOT NULL DEFAULT 'NOT_APPLIED'
    CHECK (reward_redemption_status IN ('NOT_APPLIED','UNAVAILABLE_PENDING_POLICY','APPLIED')),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, id),
  CHECK (payable_amount_cents=goods_amount_cents+shipping_amount_cents-discount_amount_cents),
  CHECK (discount_amount_cents<=goods_amount_cents+shipping_amount_cents)
);

CREATE UNIQUE INDEX platform_checkout_sessions_submit_key_uidx
ON platform_checkout_sessions(account_id,submit_idempotency_key)
WHERE submit_idempotency_key IS NOT NULL;

CREATE TABLE platform_checkout_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL,
  account_id uuid NOT NULL,
  merchant_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_type text NOT NULL
    CHECK (order_type IN ('PHYSICAL_DELIVERY','STORE_PICKUP','GROUP_BUY','SERVICE_APPOINTMENT')),
  delivery_address_id uuid,
  item_snapshot jsonb NOT NULL CHECK (jsonb_typeof(item_snapshot)='array'),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot)='object'),
  discount_snapshot jsonb NOT NULL CHECK (jsonb_typeof(discount_snapshot)='object'),
  goods_amount_cents bigint NOT NULL CHECK (goods_amount_cents >= 0),
  discount_amount_cents bigint NOT NULL CHECK (discount_amount_cents >= 0),
  shipping_amount_cents bigint NOT NULL CHECK (shipping_amount_cents >= 0),
  payable_amount_cents bigint NOT NULL CHECK (payable_amount_cents >= 0),
  status text NOT NULL DEFAULT 'QUOTED'
    CHECK (status IN ('QUOTED','SUBMITTING','ORDER_CREATED','FAILED','EXPIRED')),
  order_id uuid,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checkout_id, merchant_tenant_id, store_id, order_type),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, checkout_id) REFERENCES platform_checkout_sessions(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, delivery_address_id) REFERENCES platform_consumer_addresses(account_id, id),
  FOREIGN KEY (merchant_tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id),
  FOREIGN KEY (merchant_tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (merchant_tenant_id, order_id) REFERENCES orders(tenant_id, id),
  CHECK (payable_amount_cents=goods_amount_cents+shipping_amount_cents-discount_amount_cents),
  CHECK ((status='ORDER_CREATED') = (order_id IS NOT NULL)),
  CHECK ((order_type='PHYSICAL_DELIVERY') = (delivery_address_id IS NOT NULL))
);

ALTER TABLE orders DROP CONSTRAINT orders_check;
ALTER TABLE orders
  ADD COLUMN shipping_amount_cents bigint NOT NULL DEFAULT 0 CHECK (shipping_amount_cents >= 0),
  ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(pricing_snapshot)='object'),
  ADD CONSTRAINT orders_payable_reconciliation_check
    CHECK (payable_amount_cents=goods_amount_cents+shipping_amount_cents-discount_amount_cents);

CREATE OR REPLACE FUNCTION app.assert_order_commerce_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id<>NEW.tenant_id OR OLD.store_id<>NEW.store_id OR
     OLD.customer_id<>NEW.customer_id OR OLD.source_channel<>NEW.source_channel OR
     OLD.order_type<>NEW.order_type OR OLD.goods_amount_cents<>NEW.goods_amount_cents OR
     OLD.discount_amount_cents<>NEW.discount_amount_cents OR
     OLD.shipping_amount_cents<>NEW.shipping_amount_cents OR
     OLD.pricing_snapshot<>NEW.pricing_snapshot OR
     OLD.payable_amount_cents<>NEW.payable_amount_cents OR OLD.currency<>NEW.currency THEN
    RAISE EXCEPTION 'order commercial snapshot is immutable';
  END IF;
  IF OLD.status<>NEW.status AND NOT (
    (OLD.status='PENDING_PAYMENT' AND NEW.status IN ('PAID','CANCELLED')) OR
    (OLD.status='PAID' AND NEW.status IN ('FULFILLING','COMPLETED','CLOSED')) OR
    (OLD.status='FULFILLING' AND NEW.status IN ('COMPLETED','CLOSED')) OR
    (OLD.status='COMPLETED' AND NEW.status='CLOSED')
  ) THEN RAISE EXCEPTION 'invalid order transition % -> %',OLD.status,NEW.status; END IF;
  IF NEW.paid_amount_cents<OLD.paid_amount_cents OR
     NEW.refunded_amount_cents<OLD.refunded_amount_cents THEN
    RAISE EXCEPTION 'order money projections cannot decrease';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE platform_consumer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_consumer_addresses FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_consumer_addresses_self ON platform_consumer_addresses
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

ALTER TABLE platform_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_checkout_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_checkout_sessions_self ON platform_checkout_sessions
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

ALTER TABLE platform_checkout_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_checkout_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_checkout_groups_self ON platform_checkout_groups
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

ALTER TABLE store_checkout_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_checkout_policies_tenant_isolation ON store_checkout_policies
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE commerce_discount_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_discount_rules_tenant_isolation ON commerce_discount_rules
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

INSERT INTO schema_migrations(version,checksum)
VALUES ('0018_platform_checkout',encode(digest('lequbao-v6.1-0018','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
