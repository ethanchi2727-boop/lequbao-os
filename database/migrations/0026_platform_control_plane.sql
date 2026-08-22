BEGIN;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE commerce_reconciliation_discrepancies
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES users(id);
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS reward_rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(reward_rule_snapshot)='object');

CREATE TABLE tenant_connector_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_code text NOT NULL CHECK (connector_code IN ('WECOM_INTAKE','WECOM_NOTIFICATION')),
  status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('UNKNOWN','HEALTHY','DEGRADED','DOWN','CHECKING')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  next_retry_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connector_code),
  UNIQUE (tenant_id, id),
  CHECK (status <> 'HEALTHY' OR last_error_code IS NULL)
);

CREATE TABLE reward_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','RETIRED')),
  funding_source text NOT NULL CHECK (funding_source IN ('MERCHANT','PLATFORM_CAMPAIGN','PARTNER_CAMPAIGN')),
  trigger_code text NOT NULL,
  grant_config jsonb NOT NULL CHECK (jsonb_typeof(grant_config)='object'),
  reversal_policy jsonb NOT NULL CHECK (jsonb_typeof(reversal_policy)='object'),
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_code, version),
  UNIQUE (tenant_id, id),
  CHECK ((status='RETIRED')=(retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX reward_rule_versions_active_uidx
  ON reward_rule_versions(tenant_id,rule_code) WHERE status='ACTIVE';

CREATE TABLE official_skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_code text NOT NULL,
  name text NOT NULL,
  semantic_version text NOT NULL CHECK (semantic_version ~ '^\d+\.\d+\.\d+$'),
  applicable_industries text[] NOT NULL DEFAULT '{}',
  required_permissions text[] NOT NULL DEFAULT '{}',
  required_plugins text[] NOT NULL DEFAULT '{}',
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  package_digest text NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  signature text NOT NULL,
  status text NOT NULL CHECK (status IN ('PUBLISHED','DEPRECATED','REVOKED')),
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_code,semantic_version)
);

CREATE TABLE channel_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code text NOT NULL UNIQUE,
  partner_name text NOT NULL,
  partner_type text NOT NULL CHECK (partner_type IN ('CHANNEL_PARTNER','INVESTMENT_OPERATOR','REGIONAL_PROVIDER')),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','ENDED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channel_partner_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES channel_partners(id) ON DELETE RESTRICT,
  province_code text NOT NULL,
  city_code text,
  district_code text,
  status text NOT NULL CHECK (status IN ('ACTIVE','ENDED')),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE NULLS NOT DISTINCT (partner_id,province_code,city_code,district_code),
  CHECK ((status='ENDED')=(ended_at IS NOT NULL))
);

CREATE TABLE model_route_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code text NOT NULL UNIQUE,
  purpose text NOT NULL,
  model_key text NOT NULL,
  per_task_budget_cents bigint NOT NULL CHECK (per_task_budget_cents >= 0),
  monthly_budget_cents bigint NOT NULL CHECK (monthly_budget_cents >= per_task_budget_cents),
  max_steps integer NOT NULL CHECK (max_steps BETWEEN 1 AND 12),
  max_tool_calls integer NOT NULL CHECK (max_tool_calls BETWEEN 0 AND 20),
  status text NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_control_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  response_body jsonb NOT NULL CHECK (jsonb_typeof(response_body)='object'),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope,idempotency_key)
);

CREATE OR REPLACE FUNCTION app.platform_merchant_directory(
  p_actor_tenant_id uuid,
  p_actor_user_id uuid,
  p_query text,
  p_status text,
  p_limit integer
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_code text,
  display_name text,
  status text,
  data_region text,
  industry_code text,
  profile_status text,
  store_count integer,
  plan_code text,
  subscription_status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM tenant_memberships membership
      JOIN member_role_assignments assignment
        ON assignment.tenant_id=membership.tenant_id AND assignment.user_id=membership.user_id
     WHERE membership.tenant_id=p_actor_tenant_id
       AND membership.user_id=p_actor_user_id
       AND membership.membership_status='ACTIVE'
       AND assignment.role_code IN ('PLATFORM_ADMIN','PLATFORM_OPS','PLATFORM_FINANCE')
       AND (assignment.valid_until IS NULL OR assignment.valid_until>now())
  ) THEN
    RAISE EXCEPTION 'platform merchant directory access denied' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT tenant.id,tenant.tenant_code,tenant.display_name,tenant.status,tenant.data_region,
         profile.industry_code,profile.profile_status,count(DISTINCT store.id)::integer,
         (array_agg(subscription.plan_code ORDER BY subscription.created_at DESC)
           FILTER(WHERE subscription.id IS NOT NULL))[1],
         (array_agg(subscription.status ORDER BY subscription.created_at DESC)
           FILTER(WHERE subscription.id IS NOT NULL))[1],tenant.updated_at
    FROM tenants tenant
    LEFT JOIN merchant_profiles profile ON profile.tenant_id=tenant.id
    LEFT JOIN stores store ON store.tenant_id=tenant.id
    LEFT JOIN tenant_subscriptions subscription ON subscription.tenant_id=tenant.id
   WHERE (p_query IS NULL OR tenant.display_name ILIKE '%'||p_query||'%'
          OR tenant.tenant_code ILIKE '%'||p_query||'%')
     AND (p_status IS NULL OR tenant.status=p_status)
   GROUP BY tenant.id,profile.industry_code,profile.profile_status
   ORDER BY tenant.updated_at DESC,tenant.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200);
END;
$$;
REVOKE ALL ON FUNCTION app.platform_merchant_directory(uuid,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.platform_merchant_directory(uuid,uuid,text,text,integer) TO CURRENT_USER;

WITH skill_source(code,name) AS (VALUES
  ('merchant-one-click-delivery','标准商户一键交付'),
  ('first-group-buy-launch','首个团购上线'),
  ('store-profile-organization','门店资料整理'),
  ('customer-service-knowledge','客服知识整理'),
  ('ai-customer-service-launch-check','AI 客服上线检查'),
  ('geo-basic-publication-check','GEO 基础发布与核查'),
  ('order-exception-handling','订单异常处理'),
  ('day-7-operation-check','第 7 天经营检查'),
  ('day-30-operation-review','第 30 天经营复盘'),
  ('monthly-operation-report','月度经营报告')
), packaged AS (
  SELECT code,name,jsonb_build_object(
    'startConditions',jsonb_build_array('required resources are present'),
    'steps',jsonb_build_array('validate inputs','execute bounded workflow','request required human confirmations','verify success criteria'),
    'humanConfirmations',jsonb_build_array('all external writes and high-risk actions'),
    'successCriteria',jsonb_build_array('all required checks pass','result and evidence are durable'),
    'failureHandling',jsonb_build_array('stop without expanding permission','retain evidence','offer bounded retry or human handoff'),
    'limits',jsonb_build_object('maxSteps',12,'maxToolCalls',20,'maxAutomaticRetries',2)
  ) AS definition FROM skill_source
)
INSERT INTO official_skill_versions(
  id,skill_code,name,semantic_version,definition,package_digest,signature,status,published_at
)
SELECT gen_random_uuid(),code,name,'1.0.0',definition,
       encode(digest(definition::text,'sha256'),'hex'),
       'sha256:'||encode(digest(definition::text,'sha256'),'hex'),'PUBLISHED',now()
FROM packaged
ON CONFLICT DO NOTHING;

ALTER TABLE tenant_connector_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_connector_health FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_connector_health_tenant_isolation ON tenant_connector_health
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

ALTER TABLE reward_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_rule_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY reward_rule_versions_tenant_isolation ON reward_rule_versions
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

CREATE TRIGGER tenant_connector_health_set_updated_at
BEFORE UPDATE ON tenant_connector_health
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER channel_partners_set_updated_at
BEFORE UPDATE ON channel_partners
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER model_route_budgets_set_updated_at
BEFORE UPDATE ON model_route_budgets
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0026_platform_control_plane',encode(digest('lequbao-v6.1-0026-platform-control-plane','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
