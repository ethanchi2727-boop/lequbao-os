-- 从完整 schema.sql 的 V6.1 区块自动生成，不要手工复制部分表。
BEGIN;

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

CREATE TRIGGER revenue_beneficiaries_set_updated_at BEFORE UPDATE ON revenue_beneficiaries FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER merchant_revenue_right_groups_set_updated_at BEFORE UPDATE ON merchant_revenue_right_groups FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER merchant_revenue_right_holders_set_updated_at BEFORE UPDATE ON merchant_revenue_right_holders FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER revenue_share_policies_set_updated_at BEFORE UPDATE ON revenue_share_policies FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER revenue_distribution_statements_set_updated_at BEFORE UPDATE ON revenue_distribution_statements FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER revenue_distribution_allocations_set_updated_at BEFORE UPDATE ON revenue_distribution_allocations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER revenue_right_transfers_set_updated_at BEFORE UPDATE ON revenue_right_transfers FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER merchant_intake_sessions_set_updated_at BEFORE UPDATE ON merchant_intake_sessions FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER revenue_distribution_entries_immutable
BEFORE UPDATE OR DELETE ON revenue_distribution_entries
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['merchant_revenue_right_groups','merchant_revenue_right_holders','revenue_share_policies','revenue_share_policy_splits','direct_cost_entries','revenue_distribution_statements','revenue_distribution_allocations','revenue_distribution_entries','revenue_right_transfers','merchant_intake_sessions','merchant_intake_assets','merchant_intake_field_candidates','merchant_intake_confirmations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name, table_name
    );
  END LOOP;
END $$;

INSERT INTO role_catalog(role_code, role_name, scope_type, description) VALUES
  ('BUSINESS_DEVELOPER','商务人员','CHANNEL','开发商户、协助交付并查看本人永久收益账户'),
  ('INVESTMENT_OPERATOR','招商公司运营','CHANNEL','管理授权区域、区县服务商和招商公司收益'),
  ('REGIONAL_PROVIDER','区县服务商','CHANNEL','查看授权区域商户、服务任务和本人算力包收益'),
  ('PLATFORM_FINANCE','平台财务','PLATFORM','维护成本目录、复核月结、支付收益和处理冲回'),
  ('PLATFORM_OPERATOR','平台运营','PLATFORM','管理套餐、商户交付、插件和运营异常')
ON CONFLICT (role_code) DO NOTHING;

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
VALUES ('0002_v6_1_revenue_rights_and_ai_intake', encode(digest('lequbao-v6.1-0002', 'sha256'), 'hex'));

COMMIT;
