BEGIN;

CREATE OR REPLACE FUNCTION app.current_consumer_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.consumer_account_id', true), '')::uuid
$$;

CREATE TABLE platform_consumer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  union_identifier_hash text NOT NULL UNIQUE CHECK (union_identifier_hash ~ '^[a-f0-9]{64}$'),
  mobile_hash text CHECK (mobile_hash IS NULL OR mobile_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','SUSPENDED','DELETION_PENDING','DELETED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_consumer_sessions (
  session_id text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  auth_subject_hash text NOT NULL CHECK (auth_subject_hash ~ '^[a-f0-9]{64}$'),
  auth_level text NOT NULL DEFAULT 'WECHAT' CHECK (auth_level IN ('WECHAT','PHONE_BOUND')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR
         (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE TABLE platform_consumer_tenant_links (
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  merchant_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESTRICTED','UNLINKED')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  PRIMARY KEY (account_id, merchant_tenant_id),
  UNIQUE (merchant_tenant_id, customer_id, account_id),
  FOREIGN KEY (merchant_tenant_id, customer_id)
    REFERENCES customer_profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE shopping_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES platform_consumer_accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CHECKED_OUT','ABANDONED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  checked_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='CHECKED_OUT') = (checked_out_at IS NOT NULL))
);

CREATE UNIQUE INDEX shopping_carts_one_active_per_account_uidx
ON shopping_carts(account_id) WHERE status='ACTIVE';

CREATE TABLE shopping_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  merchant_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, merchant_tenant_id, store_id, variant_id),
  FOREIGN KEY (merchant_tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (merchant_tenant_id, product_id) REFERENCES products(tenant_id, id),
  FOREIGN KEY (merchant_tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
);

CREATE INDEX shopping_cart_items_cart_idx
ON shopping_cart_items(cart_id,merchant_tenant_id,store_id,created_at,id);

ALTER TABLE platform_consumer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_consumer_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_consumer_accounts_self ON platform_consumer_accounts
  USING (id=app.current_consumer_account_id())
  WITH CHECK (id=app.current_consumer_account_id());

ALTER TABLE platform_consumer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_consumer_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_consumer_sessions_self ON platform_consumer_sessions
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

ALTER TABLE platform_consumer_tenant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_consumer_tenant_links FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_consumer_tenant_links_self ON platform_consumer_tenant_links
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

ALTER TABLE shopping_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_carts FORCE ROW LEVEL SECURITY;
CREATE POLICY shopping_carts_self ON shopping_carts
  USING (account_id=app.current_consumer_account_id())
  WITH CHECK (account_id=app.current_consumer_account_id());

ALTER TABLE shopping_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_cart_items FORCE ROW LEVEL SECURITY;
CREATE POLICY shopping_cart_items_self ON shopping_cart_items
  USING (EXISTS (
    SELECT 1 FROM shopping_carts cart
     WHERE cart.id=shopping_cart_items.cart_id
       AND cart.account_id=app.current_consumer_account_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM shopping_carts cart
     WHERE cart.id=shopping_cart_items.cart_id
       AND cart.account_id=app.current_consumer_account_id()
  ));

INSERT INTO schema_migrations(version,checksum)
VALUES ('0017_platform_consumer_cart',encode(digest('lequbao-v6.1-0017','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
