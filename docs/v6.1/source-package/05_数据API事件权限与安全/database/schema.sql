-- 乐趣宝与乐趣生活 PostgreSQL 15+ 基线结构
-- 执行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
-- 生产环境应由迁移工具按版本执行；本文件用于新环境初始化与契约测试。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable table % does not allow %', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','OFFBOARDING','CLOSED')),
  data_region text NOT NULL DEFAULT 'CN',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_hash text,
  email_hash text,
  display_name text NOT NULL,
  avatar_url text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','DISABLED')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_mobile_hash_uidx ON users(mobile_hash) WHERE mobile_hash IS NOT NULL;
CREATE UNIQUE INDEX users_email_hash_uidx ON users(email_hash) WHERE email_hash IS NOT NULL;

CREATE TABLE permission_catalog (
  permission_code text PRIMARY KEY,
  domain text NOT NULL,
  description text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_catalog (
  role_code text PRIMARY KEY,
  role_name text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('PLATFORM','CHANNEL','TENANT','STORE')),
  description text NOT NULL,
  system_role boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_code text NOT NULL REFERENCES role_catalog(role_code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permission_catalog(permission_code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_no text,
  membership_status text NOT NULL DEFAULT 'ACTIVE' CHECK (membership_status IN ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE merchant_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  legal_subject_name text NOT NULL,
  unified_credit_code_ciphertext text,
  business_license_object_key text,
  contact_name_ciphertext text,
  contact_mobile_ciphertext text,
  industry_code text NOT NULL,
  service_region_codes text[] NOT NULL DEFAULT '{}',
  profile_status text NOT NULL DEFAULT 'DRAFT' CHECK (profile_status IN ('DRAFT','VERIFYING','VERIFIED','REJECTED','EXPIRED')),
  verified_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_code text NOT NULL,
  store_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','CLOSED')),
  province_code text,
  city_code text,
  district_code text,
  address_ciphertext text,
  longitude numeric(10,7),
  latitude numeric(10,7),
  service_phone_ciphertext text,
  opening_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE member_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_code text NOT NULL REFERENCES role_catalog(role_code),
  store_id uuid,
  granted_by uuid REFERENCES users(id),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, user_id, role_code, store_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id) ON DELETE CASCADE,
  CHECK ((store_id IS NULL) OR (role_code IN ('STORE_MANAGER','CUSTOMER_SERVICE','VERIFIER','MARKETER')))
);

CREATE TABLE plans (
  plan_code text PRIMARY KEY,
  plan_name text NOT NULL,
  billing_period text NOT NULL CHECK (billing_period IN ('MONTH','YEAR')),
  list_price_cents bigint NOT NULL CHECK (list_price_cents >= 0),
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES plans(plan_code),
  status text NOT NULL CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED')),
  starts_at timestamptz NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  minimum_term_end timestamptz,
  auto_renew boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_period_end > current_period_start)
);

CREATE TABLE usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meter_code text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  soft_limit numeric(20,6),
  hard_limit numeric(20,6),
  cost_cents bigint NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, meter_code, period_start, period_end),
  CHECK (period_end >= period_start),
  CHECK (hard_limit IS NULL OR soft_limit IS NULL OR hard_limit >= soft_limit)
);

CREATE TABLE delivery_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid,
  project_type text NOT NULL DEFAULT 'STANDARD_898',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','WAITING_MERCHANT_INPUT','WAITING_AUTHORIZATION','PROVISIONING','PARTIALLY_FAILED','BLOCKED','ACCEPTANCE','DELIVERED','OPERATING','SUSPENDED','CANCELLED')),
  progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  blocking_reason_code text,
  owner_user_id uuid REFERENCES users(id),
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);

CREATE TABLE delivery_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  step_code text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','WAITING_INPUT','WAITING_AUTH','RUNNING','SUCCEEDED','FAILED','BLOCKED','SKIPPED')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, step_code),
  FOREIGN KEY (tenant_id, project_id) REFERENCES delivery_projects(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE external_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('WECHAT_COMPONENT','WECOM','PAYMENT_PROVIDER','GEO_TARGET')),
  external_account_id text NOT NULL,
  external_subject_name text,
  authorization_scope text[] NOT NULL DEFAULT '{}',
  credential_secret_ref text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','EXPIRED','REVOKED','ERROR')),
  authorized_by uuid REFERENCES users(id),
  authorized_at timestamptz,
  expires_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_account_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE mini_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  authorization_id uuid NOT NULL,
  app_id text NOT NULL,
  merchant_chosen_name text NOT NULL,
  template_code text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','AUTHORIZED','ACTIVE','SUSPENDED','AUTH_REVOKED')),
  current_release_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, app_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, authorization_id) REFERENCES external_authorizations(tenant_id, id)
);

CREATE TABLE mini_program_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_program_id uuid NOT NULL,
  release_number bigint GENERATED ALWAYS AS IDENTITY,
  template_version text NOT NULL,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_artifact_ref text,
  external_audit_id text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','BUILDING','PREVIEW_READY','BUILD_FAILED','SUBMITTED','IN_REVIEW','APPROVED','REJECTED','PUBLISHING','PUBLISHED','PUBLISH_FAILED','ROLLED_BACK')),
  rejection_reason text,
  merchant_confirmed_by uuid REFERENCES users(id),
  merchant_confirmed_at timestamptz,
  published_at timestamptz,
  rolled_back_from_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mini_program_id, release_number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, mini_program_id) REFERENCES mini_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, rolled_back_from_id) REFERENCES mini_program_releases(tenant_id, id)
);

ALTER TABLE mini_programs
  ADD CONSTRAINT mini_programs_current_release_fk
  FOREIGN KEY (tenant_id, current_release_id) REFERENCES mini_program_releases(tenant_id, id);

CREATE TABLE geo_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  canonical_name text NOT NULL,
  canonical_categories text[] NOT NULL DEFAULT '{}',
  canonical_description text NOT NULL,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATING','READY','INVALID','PUBLISHING','ACTIVE','DEGRADED','FAILED','STALE')),
  completeness_score smallint NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  consistency_score smallint NOT NULL DEFAULT 0 CHECK (consistency_score BETWEEN 0 AND 100),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE geo_publish_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  geo_profile_id uuid NOT NULL,
  target_code text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHING','ACTIVE','FAILED','AUTH_REQUIRED','STALE')),
  external_record_id text,
  last_error_code text,
  last_published_at timestamptz,
  next_check_at timestamptz,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (geo_profile_id, target_code),
  FOREIGN KEY (tenant_id, geo_profile_id) REFERENCES geo_profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('MANUAL','PRODUCT','ORDER_POLICY','FAQ','FILE','URL')),
  title text NOT NULL,
  content_object_key text,
  content_hash text NOT NULL,
  pii_classification text NOT NULL DEFAULT 'INTERNAL' CHECK (pii_classification IN ('PUBLIC','INTERNAL','PERSONAL','SENSITIVE')),
  status text NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','READY','FAILED','ARCHIVED')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (knowledge_base_id, content_hash),
  FOREIGN KEY (tenant_id, knowledge_base_id) REFERENCES knowledge_bases(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  union_identifier_hash text NOT NULL,
  nickname_ciphertext text,
  mobile_ciphertext text,
  mobile_hash text,
  profile_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ANONYMIZED','DELETION_PENDING','DELETED')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, union_identifier_hash),
  UNIQUE (tenant_id, id)
);

CREATE TABLE customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('SERVICE','PROFILE_MEMORY','MARKETING','SUBSCRIPTION_MESSAGE','LOCATION')),
  policy_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('GRANTED','WITHDRAWN')),
  evidence_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX customer_consents_current_idx ON customer_consents(tenant_id, customer_id, consent_type, occurred_at DESC);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid,
  customer_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'MERCHANT_MINI_PROGRAM' CHECK (channel IN ('MERCHANT_MINI_PROGRAM','LEQU_LIFE','WEB')),
  status text NOT NULL DEFAULT 'BOT_ACTIVE' CHECK (status IN ('BOT_ACTIVE','HUMAN_REQUESTED','HUMAN_QUEUED','HUMAN_ACTIVE','WAITING_CUSTOMER','CLOSED')),
  risk_level text NOT NULL DEFAULT 'NORMAL' CHECK (risk_level IN ('NORMAL','ELEVATED','HIGH')),
  assigned_user_id uuid REFERENCES users(id),
  last_message_at timestamptz,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('CUSTOMER','AI','EMPLOYEE','SYSTEM')),
  sender_user_id uuid REFERENCES users(id),
  content_object_key text NOT NULL,
  content_preview_redacted text,
  message_type text NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT','IMAGE','FILE','ORDER_CARD','PRODUCT_CARD','SYSTEM_EVENT')),
  model_trace_ref text,
  risk_labels text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX conversation_messages_lookup_idx ON conversation_messages(tenant_id, conversation_id, created_at);

CREATE TABLE handoff_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  reason_code text NOT NULL,
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','HIGH','URGENT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ASSIGNED','RESOLVED','CANCELLED','EXPIRED')),
  assigned_user_id uuid REFERENCES users(id),
  due_at timestamptz,
  resolved_at timestamptz,
  resolution_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid,
  product_type text NOT NULL CHECK (product_type IN ('PHYSICAL','SERVICE','GROUP_BUY','DIGITAL_SUPPLY')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ON_SALE','OFF_SALE','ARCHIVED')),
  sale_price_cents bigint NOT NULL CHECK (sale_price_cents >= 0),
  market_price_cents bigint CHECK (market_price_cents IS NULL OR market_price_cents >= sale_price_cents),
  reward_rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  sku_code text NOT NULL,
  title text NOT NULL,
  sale_price_cents bigint NOT NULL CHECK (sale_price_cents >= 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku_code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory_balances (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  on_hand bigint NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, variant_id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id) ON DELETE CASCADE,
  CHECK (reserved <= on_hand)
);

CREATE TABLE inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INCREASE','RESERVE','RELEASE','CONSUME','ADJUST')),
  quantity bigint NOT NULL CHECK (quantity <> 0),
  business_type text NOT NULL,
  business_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  store_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_channel text NOT NULL CHECK (source_channel IN ('MERCHANT_MINI_PROGRAM','LEQU_LIFE','WORKBENCH')),
  status text NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT','PAID','FULFILLING','COMPLETED','CANCELLED','CLOSED')),
  goods_amount_cents bigint NOT NULL CHECK (goods_amount_cents >= 0),
  discount_amount_cents bigint NOT NULL DEFAULT 0 CHECK (discount_amount_cents >= 0),
  payable_amount_cents bigint NOT NULL CHECK (payable_amount_cents >= 0),
  paid_amount_cents bigint NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
  refunded_amount_cents bigint NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  expires_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_no),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id),
  CHECK (payable_amount_cents = goods_amount_cents - discount_amount_cents),
  CHECK (refunded_amount_cents <= paid_amount_cents)
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  title_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  line_amount_cents bigint NOT NULL CHECK (line_amount_cents >= 0),
  refunded_quantity integer NOT NULL DEFAULT 0 CHECK (refunded_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id),
  CHECK (line_amount_cents = unit_price_cents * quantity),
  CHECK (refunded_quantity <= quantity)
);

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  provider text NOT NULL,
  merchant_payment_account_ref text NOT NULL,
  provider_payment_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PROCESSING','SUCCEEDED','FAILED','EXPIRED','PARTIALLY_REFUNDED','REFUNDED')),
  idempotency_key text NOT NULL,
  client_request_hash text NOT NULL,
  expires_at timestamptz,
  succeeded_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id),
  UNIQUE (provider, provider_payment_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_intent_id uuid NOT NULL,
  provider_transaction_id text NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('PAYMENT','QUERY','CLOSE','REFUND')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  verified boolean NOT NULL DEFAULT false,
  provider_occurred_at timestamptz,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_transaction_id, transaction_type),
  FOREIGN KEY (tenant_id, payment_intent_id) REFERENCES payment_intents(tenant_id, id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  refund_no text NOT NULL,
  order_id uuid NOT NULL,
  payment_intent_id uuid NOT NULL,
  provider_refund_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason_code text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVAL_REQUIRED','SUBMITTING','PROCESSING','SUCCEEDED','FAILED','REJECTED')),
  idempotency_key text NOT NULL,
  requested_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  succeeded_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, refund_no),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (provider_refund_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, payment_intent_id) REFERENCES payment_intents(tenant_id, id)
);

CREATE TABLE refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id)
);

CREATE TABLE verification_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL,
  verification_code_hash text NOT NULL,
  total_uses integer NOT NULL CHECK (total_uses > 0),
  used_uses integer NOT NULL DEFAULT 0 CHECK (used_uses >= 0),
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','PARTIALLY_USED','FULLY_USED','VOIDED')),
  valid_from timestamptz,
  valid_until timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, verification_code_hash),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id),
  CHECK (used_uses <= total_uses)
);

CREATE TABLE verification_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL,
  store_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  verifier_user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  reversed_by_id uuid REFERENCES verification_uses(id),
  reversal_reason text,
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, entitlement_id) REFERENCES verification_entitlements(tenant_id, id)
);

CREATE TABLE reward_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('CUSTOMER','MERCHANT_FUND','PLATFORM_CLEARING','CAMPAIGN_FUND')),
  owner_id uuid,
  currency char(3) NOT NULL DEFAULT 'CNY',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, owner_type, owner_id, currency),
  UNIQUE (tenant_id, id)
);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('REWARD_GRANT','REWARD_REDEEM','REWARD_REVERSE','REWARD_EXPIRE','SETTLEMENT_ADJUSTMENT')),
  business_type text NOT NULL,
  business_id uuid NOT NULL,
  source_event_id uuid,
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, transaction_type, business_type, business_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL,
  account_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  available_at timestamptz,
  expires_at timestamptz,
  original_entry_id uuid REFERENCES ledger_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, transaction_id) REFERENCES ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, account_id) REFERENCES reward_accounts(tenant_id, id) ON DELETE RESTRICT
);

-- 奖励资格是便于业务查询的投影，金额事实仍以不可变账本为准。
CREATE TABLE reward_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  account_id uuid NOT NULL,
  order_id uuid,
  grant_transaction_id uuid NOT NULL,
  rule_version text NOT NULL,
  funding_source text NOT NULL CHECK (funding_source IN ('MERCHANT','PLATFORM_CAMPAIGN','PARTNER_CAMPAIGN')),
  granted_amount_cents bigint NOT NULL CHECK (granted_amount_cents > 0),
  redeemed_amount_cents bigint NOT NULL DEFAULT 0 CHECK (redeemed_amount_cents >= 0),
  reversed_amount_cents bigint NOT NULL DEFAULT 0 CHECK (reversed_amount_cents >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','AVAILABLE','REDEEMED','EXPIRED','REVERSED')),
  available_at timestamptz,
  expires_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES reward_accounts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, grant_transaction_id) REFERENCES ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (redeemed_amount_cents + reversed_amount_cents <= granted_amount_cents)
);

CREATE OR REPLACE FUNCTION app.assert_ledger_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction uuid;
  entry_count integer;
  entry_sum bigint;
BEGIN
  target_transaction := CASE WHEN TG_OP = 'DELETE' THEN OLD.transaction_id ELSE NEW.transaction_id END;
  SELECT count(*), COALESCE(sum(amount_cents), 0)
    INTO entry_count, entry_sum
    FROM ledger_entries
   WHERE transaction_id = target_transaction;
  IF entry_count < 2 OR entry_sum <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced: entries %, sum %', target_transaction, entry_count, entry_sum;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_balance_trigger
AFTER INSERT OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_ledger_balanced();

CREATE TABLE settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  settlement_type text NOT NULL CHECK (settlement_type IN ('REWARD_FUND','CHANNEL_COMMISSION','SUBSCRIPTION_RECONCILIATION')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CALCULATING','REVIEW_REQUIRED','APPROVED','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  gross_amount_cents bigint NOT NULL DEFAULT 0,
  adjustment_amount_cents bigint NOT NULL DEFAULT 0,
  net_amount_cents bigint NOT NULL DEFAULT 0,
  approved_by uuid REFERENCES users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (period_end >= period_start),
  CHECK (net_amount_cents = gross_amount_cents + adjustment_amount_cents)
);

CREATE TABLE settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  business_type text NOT NULL,
  business_id uuid NOT NULL,
  amount_cents bigint NOT NULL,
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, business_type, business_id),
  FOREIGN KEY (tenant_id, batch_id) REFERENCES settlement_batches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_code text NOT NULL UNIQUE,
  name text NOT NULL,
  publisher_type text NOT NULL DEFAULT 'FIRST_PARTY' CHECK (publisher_type IN ('FIRST_PARTY','APPROVED_PARTNER')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWING','APPROVED','PUBLISHED','DEPRECATED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  semantic_version text NOT NULL,
  manifest jsonb NOT NULL,
  package_digest text NOT NULL,
  signature text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWING','APPROVED','PUBLISHED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plugin_id, semantic_version)
);

CREATE TABLE tenant_plugin_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plugin_id uuid NOT NULL REFERENCES plugins(id),
  plugin_version_id uuid NOT NULL REFERENCES plugin_versions(id),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','GRANTED','INSTALLING','ACTIVE','SUSPENDED','UNINSTALLED')),
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz,
  config_secret_ref text,
  config_public jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plugin_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE tenant_plugin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  permission_code text NOT NULL REFERENCES permission_catalog(permission_code),
  resource_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (installation_id, permission_code),
  FOREIGN KEY (tenant_id, installation_id) REFERENCES tenant_plugin_installations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_code text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','WAITING_INPUT','WAITING_EXTERNAL','SUCCEEDED','FAILED','CANCELLED')),
  current_step text,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope, idempotency_key)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL,
  partition_key text NOT NULL,
  payload jsonb NOT NULL,
  pii_classification text NOT NULL DEFAULT 'INTERNAL' CHECK (pii_classification IN ('PUBLIC','INTERNAL','PERSONAL','SENSITIVE')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  trace_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_name)
);

CREATE INDEX outbox_events_worker_idx ON outbox_events(status, next_attempt_at, created_at)
WHERE status IN ('PENDING','FAILED');

CREATE TABLE inbox_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consumer_name text NOT NULL,
  event_id uuid NOT NULL,
  payload_hash text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  result_code text NOT NULL DEFAULT 'OK',
  UNIQUE (tenant_id, consumer_name, event_id)
);

CREATE TABLE webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  signature_verified boolean NOT NULL,
  payload_object_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','REJECTED','FAILED')),
  attempt_count integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, external_event_id)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('USER','AI','PLUGIN','SYSTEM','SUPPORT')),
  actor_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  permission_code text,
  result_code text NOT NULL,
  ip_hash text,
  user_agent_hash text,
  before_redacted jsonb,
  after_redacted jsonb,
  trace_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_lookup_idx ON audit_logs(tenant_id, resource_type, resource_id, occurred_at DESC);

CREATE TABLE tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  anonymous_id_hash text,
  user_id uuid REFERENCES users(id),
  customer_id uuid,
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  page_id text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_basis text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tracking_events_query_idx ON tracking_events(tenant_id, event_name, occurred_at DESC);

CREATE TABLE migration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  migration_code text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('EXPAND','BACKFILL','VERIFY','SWITCH','CONTRACT')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','PAUSED','SUCCEEDED','FAILED','ROLLED_BACK')),
  cursor_value text,
  processed_count bigint NOT NULL DEFAULT 0,
  error_count bigint NOT NULL DEFAULT 0,
  before_checksum text,
  after_checksum text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, migration_code)
);

CREATE TABLE data_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  export_scope text[] NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','READY','EXPIRED','FAILED','CANCELLED')),
  object_key text,
  download_secret_hash text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- V6.1 商务永久收益权、订阅收益分配和 AI 对话建档。
ALTER TABLE merchant_profiles ADD CONSTRAINT merchant_profiles_tenant_id_id_uniq UNIQUE (tenant_id, id);
ALTER TABLE tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_tenant_id_id_uniq UNIQUE (tenant_id, id);

CREATE TABLE revenue_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('BUSINESS_PERSON','SHANGZHI_ENTITY','LEQU_LIFE_ENTITY','LEQUBAO_ENTITY','REGIONAL_PROVIDER')),
  user_id uuid REFERENCES users(id),
  legal_name text NOT NULL,
  identity_ref_ciphertext text,
  payout_account_secret_ref text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((beneficiary_type = 'BUSINESS_PERSON' AND user_id IS NOT NULL) OR beneficiary_type <> 'BUSINESS_PERSON')
);

CREATE TABLE merchant_revenue_right_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  merchant_profile_id uuid NOT NULL,
  right_type text NOT NULL DEFAULT 'SUBSCRIPTION_ORIGIN' CHECK (right_type IN ('SUBSCRIPTION_ORIGIN')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','DISPUTED','SUSPENDED','TRANSFERRED','TERMINATED')),
  source_contract_ref text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  starts_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_profile_id) REFERENCES merchant_profiles(tenant_id, id),
  CHECK (ended_at IS NULL OR ended_at >= starts_at)
);

CREATE UNIQUE INDEX merchant_revenue_right_active_uidx
ON merchant_revenue_right_groups(tenant_id, merchant_profile_id, right_type)
WHERE status IN ('ACTIVE','DISPUTED','SUSPENDED');

CREATE TABLE merchant_revenue_right_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  right_group_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES revenue_beneficiaries(id),
  share_bps integer NOT NULL CHECK (share_bps BETWEEN 1 AND 7000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','TRANSFERRED','TERMINATED')),
  starts_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, right_group_id, beneficiary_id, starts_at),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, right_group_id) REFERENCES merchant_revenue_right_groups(tenant_id, id) ON DELETE CASCADE,
  CHECK (ended_at IS NULL OR ended_at >= starts_at)
);

CREATE OR REPLACE FUNCTION app.assert_revenue_right_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group uuid;
  target_tenant uuid;
  group_status text;
  total_bps integer;
BEGIN
  target_group := COALESCE(NEW.right_group_id, OLD.right_group_id);
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  SELECT status INTO group_status
    FROM merchant_revenue_right_groups
   WHERE tenant_id = target_tenant AND id = target_group;
  IF group_status = 'ACTIVE' THEN
    SELECT COALESCE(sum(share_bps), 0) INTO total_bps
      FROM merchant_revenue_right_holders
     WHERE tenant_id = target_tenant AND right_group_id = target_group AND status = 'ACTIVE';
    IF total_bps <> 7000 THEN
      RAISE EXCEPTION 'active business revenue right must total 7000 bps, got %', total_bps;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER merchant_revenue_right_total_check
AFTER INSERT OR UPDATE OR DELETE ON merchant_revenue_right_holders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_revenue_right_total();

CREATE OR REPLACE FUNCTION app.assert_active_revenue_right_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_bps integer;
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    SELECT COALESCE(sum(share_bps), 0) INTO total_bps
      FROM merchant_revenue_right_holders
     WHERE tenant_id = NEW.tenant_id AND right_group_id = NEW.id AND status = 'ACTIVE';
    IF total_bps <> 7000 THEN
      RAISE EXCEPTION 'active business revenue right must total 7000 bps, got %', total_bps;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER merchant_revenue_right_group_activation_check
AFTER INSERT OR UPDATE OF status ON merchant_revenue_right_groups
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_active_revenue_right_group();

CREATE TABLE revenue_share_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_type text NOT NULL CHECK (policy_type IN ('SUBSCRIPTION','COMPUTE_PACK_WITHOUT_REGION','COMPUTE_PACK_WITH_REGION')),
  policy_version integer NOT NULL,
  cost_basis text NOT NULL CHECK (cost_basis IN ('DIRECT_ACTUAL_COST')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_type, policy_version),
  UNIQUE (tenant_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK ((status <> 'ACTIVE') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE revenue_share_policy_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL,
  beneficiary_role text NOT NULL CHECK (beneficiary_role IN ('ORIGINATING_BUSINESS','SHANGZHI','LEQU_LIFE','LEQUBAO','REGIONAL_PROVIDER')),
  share_bps integer NOT NULL CHECK (share_bps BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_id, beneficiary_role),
  FOREIGN KEY (tenant_id, policy_id) REFERENCES revenue_share_policies(tenant_id, id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION app.assert_policy_split_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_policy uuid;
  target_tenant uuid;
  policy_status text;
  total_bps integer;
BEGIN
  target_policy := COALESCE(NEW.policy_id, OLD.policy_id);
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  SELECT status INTO policy_status FROM revenue_share_policies WHERE tenant_id = target_tenant AND id = target_policy;
  IF policy_status = 'ACTIVE' THEN
    SELECT COALESCE(sum(share_bps), 0) INTO total_bps
      FROM revenue_share_policy_splits
     WHERE tenant_id = target_tenant AND policy_id = target_policy;
    IF total_bps <> 10000 THEN
      RAISE EXCEPTION 'active revenue policy must total 10000 bps, got %', total_bps;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER revenue_policy_split_total_check
AFTER INSERT OR UPDATE OR DELETE ON revenue_share_policy_splits
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_policy_split_total();

CREATE OR REPLACE FUNCTION app.assert_active_policy_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_bps integer;
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    SELECT COALESCE(sum(share_bps), 0) INTO total_bps
      FROM revenue_share_policy_splits
     WHERE tenant_id = NEW.tenant_id AND policy_id = NEW.id;
    IF total_bps <> 10000 THEN
      RAISE EXCEPTION 'active revenue policy must total 10000 bps, got %', total_bps;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER revenue_policy_activation_check
AFTER INSERT OR UPDATE OF status ON revenue_share_policies
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_active_policy_total();

CREATE TABLE direct_cost_catalog (
  cost_code text PRIMARY KEY,
  cost_name text NOT NULL,
  deductible boolean NOT NULL,
  allocation_method text NOT NULL CHECK (allocation_method IN ('DIRECT_USAGE','DIRECT_INVOICE','PUBLISHED_SHARED_RULE')),
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE direct_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid,
  source_type text NOT NULL CHECK (source_type IN ('SUBSCRIPTION','COMPUTE_PACK')),
  source_id uuid NOT NULL,
  service_period_start date NOT NULL,
  service_period_end date NOT NULL,
  cost_code text NOT NULL REFERENCES direct_cost_catalog(cost_code),
  quantity numeric(20,6) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_cost_cents numeric(20,6) NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  cost_status text NOT NULL CHECK (cost_status IN ('PROVISIONAL','ACTUAL','REVERSED')),
  supplier_ref text,
  evidence_object_key text,
  source_event_id text NOT NULL,
  reversal_of uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_event_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions(tenant_id, id),
  FOREIGN KEY (tenant_id, reversal_of) REFERENCES direct_cost_entries(tenant_id, id),
  CHECK (service_period_end >= service_period_start),
  CHECK ((source_type <> 'SUBSCRIPTION') OR subscription_id IS NOT NULL),
  CHECK ((cost_status <> 'REVERSED') OR reversal_of IS NOT NULL)
);

CREATE TABLE revenue_distribution_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('SUBSCRIPTION','COMPUTE_PACK')),
  source_id uuid NOT NULL,
  subscription_id uuid,
  policy_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  actual_receipt_cents bigint NOT NULL CHECK (actual_receipt_cents >= 0),
  refund_cents bigint NOT NULL DEFAULT 0 CHECK (refund_cents >= 0),
  direct_cost_cents bigint NOT NULL DEFAULT 0 CHECK (direct_cost_cents >= 0),
  distributable_cents bigint NOT NULL CHECK (distributable_cents >= 0),
  status text NOT NULL DEFAULT 'ESTIMATED' CHECK (status IN ('ESTIMATED','WAITING_COST','REVIEW','LOCKED','PAYABLE','PAID','REVERSED')),
  locked_by uuid REFERENCES users(id),
  locked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, period_start, period_end),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions(tenant_id, id),
  FOREIGN KEY (tenant_id, policy_id) REFERENCES revenue_share_policies(tenant_id, id),
  CHECK (period_end >= period_start),
  CHECK (distributable_cents = GREATEST(actual_receipt_cents - refund_cents - direct_cost_cents, 0)),
  CHECK ((status NOT IN ('LOCKED','PAYABLE','PAID')) OR (locked_by IS NOT NULL AND locked_at IS NOT NULL))
);

CREATE TABLE revenue_distribution_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES revenue_beneficiaries(id),
  right_holder_id uuid,
  beneficiary_role text NOT NULL CHECK (beneficiary_role IN ('ORIGINATING_BUSINESS','SHANGZHI','LEQU_LIFE','LEQUBAO','REGIONAL_PROVIDER')),
  share_bps integer NOT NULL CHECK (share_bps BETWEEN 1 AND 10000),
  allocated_cents bigint NOT NULL CHECK (allocated_cents >= 0),
  status text NOT NULL DEFAULT 'ACCRUED' CHECK (status IN ('ACCRUED','HELD','PAYABLE','PAID','REVERSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, statement_id, beneficiary_id, beneficiary_role),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, statement_id) REFERENCES revenue_distribution_statements(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, right_holder_id) REFERENCES merchant_revenue_right_holders(tenant_id, id)
);

CREATE TABLE revenue_distribution_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('ACCRUAL','PROVISIONAL_ADJUSTMENT','ACTUAL_ADJUSTMENT','PAYMENT','REVERSAL')),
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  idempotency_key text NOT NULL,
  original_entry_id uuid,
  reason_code text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, allocation_id) REFERENCES revenue_distribution_allocations(tenant_id, id),
  FOREIGN KEY (tenant_id, original_entry_id) REFERENCES revenue_distribution_entries(tenant_id, id)
);

CREATE TABLE revenue_right_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  right_holder_id uuid NOT NULL,
  from_beneficiary_id uuid NOT NULL REFERENCES revenue_beneficiaries(id),
  to_beneficiary_id uuid NOT NULL REFERENCES revenue_beneficiaries(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','WAITING_CONFIRMATIONS','APPROVED','REJECTED','EFFECTIVE','CANCELLED')),
  agreement_object_key text,
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  effective_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, right_holder_id) REFERENCES merchant_revenue_right_holders(tenant_id, id),
  CHECK (from_beneficiary_id <> to_beneficiary_id),
  CHECK ((status NOT IN ('APPROVED','EFFECTIVE')) OR approved_by IS NOT NULL)
);

CREATE TABLE merchant_intake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  merchant_profile_id uuid,
  delivery_project_id uuid,
  channel text NOT NULL CHECK (channel IN ('WEB','MOBILE_H5','WECOM')),
  status text NOT NULL DEFAULT 'COLLECTING' CHECK (status IN ('COLLECTING','EXTRACTING','WAITING_ANSWERS','WAITING_CONFIRMATION','CONFIRMED','PUBLISHING','COMPLETED','FAILED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES users(id),
  last_message_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_profile_id) REFERENCES merchant_profiles(tenant_id, id),
  FOREIGN KEY (tenant_id, delivery_project_id) REFERENCES delivery_projects(tenant_id, id)
);

CREATE TABLE merchant_intake_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  source_channel text NOT NULL CHECK (source_channel IN ('WEB','MOBILE_H5','WECOM')),
  source_message_id text,
  asset_type text NOT NULL CHECK (asset_type IN ('IMAGE','DOCUMENT','AUDIO','TEXT')),
  object_key text,
  original_filename text,
  mime_type text,
  sha256 text NOT NULL,
  security_status text NOT NULL DEFAULT 'PENDING' CHECK (security_status IN ('PENDING','SAFE','REJECTED','FAILED')),
  processing_status text NOT NULL DEFAULT 'QUEUED' CHECK (processing_status IN ('QUEUED','PROCESSING','SUCCEEDED','FAILED')),
  error_code text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id, sha256),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES merchant_intake_sessions(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE merchant_intake_field_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  asset_id uuid,
  field_path text NOT NULL,
  candidate_value jsonb NOT NULL,
  confidence numeric(5,4) CHECK (confidence BETWEEN 0 AND 1),
  decision_status text NOT NULL DEFAULT 'PROPOSED' CHECK (decision_status IN ('PROPOSED','CONFIRMED','CORRECTED','REJECTED','CONFLICT')),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id, field_path, asset_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES merchant_intake_sessions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES merchant_intake_assets(tenant_id, id),
  CHECK ((decision_status = 'PROPOSED') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE merchant_intake_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  confirmation_type text NOT NULL CHECK (confirmation_type IN ('LEGAL_SUBJECT','PAYMENT','PRICE','REFUND_RULE','PUBLIC_CONTACT','PUBLISH_IMPACT')),
  confirmed_payload jsonb NOT NULL CHECK (jsonb_typeof(confirmed_payload) = 'object'),
  confirmed_by uuid NOT NULL REFERENCES users(id),
  confirmation_channel text NOT NULL CHECK (confirmation_channel IN ('WEB_CLICK','MOBILE_CLICK','WECOM_SECURE_CARD')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id, confirmation_type, confirmed_at),
  FOREIGN KEY (tenant_id, session_id) REFERENCES merchant_intake_sessions(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX revenue_right_groups_merchant_idx ON merchant_revenue_right_groups(tenant_id, merchant_profile_id, status);
CREATE INDEX direct_cost_entries_period_idx ON direct_cost_entries(tenant_id, service_period_start, service_period_end, cost_status);
CREATE INDEX revenue_statements_period_idx ON revenue_distribution_statements(tenant_id, period_start, period_end, status);
CREATE INDEX revenue_allocations_beneficiary_idx ON revenue_distribution_allocations(beneficiary_id, status, created_at DESC);
CREATE INDEX merchant_intake_sessions_status_idx ON merchant_intake_sessions(tenant_id, status, updated_at DESC);
CREATE INDEX merchant_intake_fields_session_idx ON merchant_intake_field_candidates(tenant_id, session_id, decision_status);

-- 常用更新时间触发器。
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenants','users','tenant_memberships','merchant_profiles','stores','tenant_subscriptions',
    'delivery_projects','delivery_steps','external_authorizations','mini_programs','mini_program_releases',
    'geo_profiles','knowledge_bases','knowledge_documents','customer_profiles','conversations',
    'handoff_tickets','products','product_variants','inventory_balances','orders','payment_intents',
    'refunds','verification_entitlements','reward_grants','settlement_batches','plugins','tenant_plugin_installations',
    'workflow_runs','migration_jobs','data_export_jobs','revenue_beneficiaries','merchant_revenue_right_groups',
    'merchant_revenue_right_holders','revenue_share_policies','direct_cost_entries','revenue_distribution_statements',
    'revenue_distribution_allocations','revenue_right_transfers','merchant_intake_sessions'
  ]
  LOOP
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()', table_name, table_name);
  END LOOP;
END $$;

-- 奖励账本和审计日志只允许追加。
CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER revenue_distribution_entries_immutable
BEFORE UPDATE OR DELETE ON revenue_distribution_entries
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

-- 为所有租户业务表启用行级隔离。应用每个事务开始时必须 SET LOCAL app.tenant_id。
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_memberships','merchant_profiles','stores','member_role_assignments','tenant_subscriptions','usage_meters',
    'delivery_projects','delivery_steps','external_authorizations','mini_programs','mini_program_releases',
    'geo_profiles','geo_publish_targets','knowledge_bases','knowledge_documents','customer_profiles','customer_consents',
    'conversations','conversation_messages','handoff_tickets','products','product_variants','inventory_balances',
    'inventory_ledger','orders','order_items','payment_intents','payment_transactions','refunds','refund_items',
    'verification_entitlements','verification_uses','reward_accounts','ledger_transactions','ledger_entries','reward_grants',
    'settlement_batches','settlement_items','tenant_plugin_installations','tenant_plugin_grants','workflow_runs',
    'idempotency_keys','outbox_events','inbox_receipts','audit_logs','tracking_events','migration_jobs','data_export_jobs',
    'merchant_revenue_right_groups','merchant_revenue_right_holders','revenue_share_policies','revenue_share_policy_splits',
    'direct_cost_entries','revenue_distribution_statements','revenue_distribution_allocations','revenue_distribution_entries',
    'revenue_right_transfers','merchant_intake_sessions','merchant_intake_assets','merchant_intake_field_candidates',
    'merchant_intake_confirmations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name,
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_self ON tenants
USING (id = app.current_tenant_id())
WITH CHECK (id = app.current_tenant_id());

-- V1 最小角色。完整授权关系以 RBAC矩阵.csv 为准，初始化时由种子迁移写入。
INSERT INTO role_catalog(role_code, role_name, scope_type, description) VALUES
  ('BUSINESS_DEVELOPER','商务人员','CHANNEL','开发商户、协助交付并查看本人永久收益账户'),
  ('INVESTMENT_OPERATOR','招商公司运营','CHANNEL','管理授权区域、区县服务商和招商公司收益'),
  ('REGIONAL_PROVIDER','区县服务商','CHANNEL','查看授权区域商户、服务任务和本人算力包收益'),
  ('PLATFORM_FINANCE','平台财务','PLATFORM','维护成本目录、复核月结、支付收益和处理冲回'),
  ('PLATFORM_OPERATOR','平台运营','PLATFORM','管理套餐、商户交付、插件和运营异常'),
  ('MERCHANT_OWNER','商家负责人','TENANT','商家全部经营权限，关键操作仍需二次确认'),
  ('STORE_MANAGER','店长','STORE','指定门店经营与人工客服管理'),
  ('CUSTOMER_SERVICE','客服','STORE','会话接管与客户问题处理'),
  ('FINANCE','财务','TENANT','对账、退款审批与结算查看'),
  ('MARKETER','运营','STORE','商品、团购、GEO 与内容运营'),
  ('VERIFIER','核销员','STORE','仅执行核销和查询本次结果'),
  ('AUDITOR','审计员','TENANT','只读报表与审计日志')
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO plans(plan_code, plan_name, billing_period, list_price_cents, entitlements) VALUES
  ('STANDARD_898_MONTH','标准版','MONTH',89800,'{"merchant_entities":1,"brands":1,"stores":1,"staff_seats":2,"mini_programs":1}'::jsonb),
  ('PRO_1980_MONTH','专业版','MONTH',198000,'{"merchant_entities":1,"brands":1,"stores":3,"staff_seats":10,"mini_programs":1}'::jsonb)
ON CONFLICT (plan_code) DO NOTHING;

INSERT INTO direct_cost_catalog(cost_code, cost_name, deductible, allocation_method, description) VALUES
  ('AI_MODEL','AI 模型实际成本',true,'DIRECT_USAGE','按商户实际模型、图像、语音和向量用量计算'),
  ('CLOUD_USAGE','云服务实际成本',true,'PUBLISHED_SHARED_RULE','按公开且版本化的商户用量分摊规则计算'),
  ('THIRD_PARTY','第三方接口实际成本',true,'DIRECT_USAGE','微信、短信、地图、GEO、ISV 等实际费用'),
  ('PAYMENT_FEE','支付手续费',true,'DIRECT_INVOICE','对应订阅或算力包订单的支付通道费用'),
  ('TAX','对应税费',true,'DIRECT_INVOICE','能直接对应订单的税费'),
  ('CONSUMER_REWARD','消费奖励实际成本',true,'DIRECT_USAGE','由平台承担且能对应商户的消费奖励金额'),
  ('GENERAL_PAYROLL','通用人员工资',false,'DIRECT_INVOICE','不能在商户收益分配前扣除'),
  ('OFFICE_RENT','办公室租金',false,'DIRECT_INVOICE','不能在商户收益分配前扣除'),
  ('UNUSED_QUOTA','未使用套餐额度',false,'DIRECT_USAGE','没有实际发生，不能当作成本')
ON CONFLICT (cost_code) DO NOTHING;

INSERT INTO schema_migrations(version, checksum)
VALUES ('0001_baseline', encode(digest('lequbao-baseline-0001', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, checksum)
VALUES ('0002_v6_1_revenue_rights_and_ai_intake', encode(digest('lequbao-v6.1-0002', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
