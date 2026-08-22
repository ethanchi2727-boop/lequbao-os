import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, '05_数据API事件权限与安全', 'database', 'schema.sql');
const migrationsDir = path.join(root, '05_数据API事件权限与安全', 'database', 'migrations');
const outputPath = path.join(migrationsDir, '0002_v6_1_永久收益权与AI对话建档.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
const startMarker = '-- V6.1 商务永久收益权、订阅收益分配和 AI 对话建档。';
const endMarker = '-- 常用更新时间触发器。';
const start = schema.indexOf(startMarker);
const end = schema.indexOf(endMarker);
if (start < 0 || end <= start) throw new Error('V6.1 schema block markers not found');
const block = schema.slice(start, end).trim();

const tenantTables = [
  'merchant_revenue_right_groups','merchant_revenue_right_holders','revenue_share_policies',
  'revenue_share_policy_splits','direct_cost_entries','revenue_distribution_statements',
  'revenue_distribution_allocations','revenue_distribution_entries','revenue_right_transfers',
  'merchant_intake_sessions','merchant_intake_assets','merchant_intake_field_candidates',
  'merchant_intake_confirmations'
];
const updatedTables = [
  'revenue_beneficiaries','merchant_revenue_right_groups','merchant_revenue_right_holders',
  'revenue_share_policies','revenue_distribution_statements','revenue_distribution_allocations',
  'revenue_right_transfers','merchant_intake_sessions'
];

const sql = `-- 从完整 schema.sql 的 V6.1 区块自动生成，不要手工复制部分表。\nBEGIN;\n\n${block}\n\n${updatedTables.map((name) => `CREATE TRIGGER ${name}_set_updated_at BEFORE UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();`).join('\n')}\n\nCREATE TRIGGER revenue_distribution_entries_immutable\nBEFORE UPDATE OR DELETE ON revenue_distribution_entries\nFOR EACH ROW EXECUTE FUNCTION app.reject_mutation();\n\nDO $$\nDECLARE\n  table_name text;\nBEGIN\n  FOREACH table_name IN ARRAY ARRAY[${tenantTables.map((name) => `'${name}'`).join(',')}]\n  LOOP\n    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);\n    EXECUTE format(\n      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',\n      table_name, table_name\n    );\n  END LOOP;\nEND $$;\n\nINSERT INTO role_catalog(role_code, role_name, scope_type, description) VALUES\n  ('BUSINESS_DEVELOPER','商务人员','CHANNEL','开发商户、协助交付并查看本人永久收益账户'),\n  ('INVESTMENT_OPERATOR','招商公司运营','CHANNEL','管理授权区域、区县服务商和招商公司收益'),\n  ('REGIONAL_PROVIDER','区县服务商','CHANNEL','查看授权区域商户、服务任务和本人算力包收益'),\n  ('PLATFORM_FINANCE','平台财务','PLATFORM','维护成本目录、复核月结、支付收益和处理冲回'),\n  ('PLATFORM_OPERATOR','平台运营','PLATFORM','管理套餐、商户交付、插件和运营异常')\nON CONFLICT (role_code) DO NOTHING;\n\nINSERT INTO direct_cost_catalog(cost_code, cost_name, deductible, allocation_method, description) VALUES\n  ('AI_MODEL','AI 模型实际成本',true,'DIRECT_USAGE','按商户实际模型、图像、语音和向量用量计算'),\n  ('CLOUD_USAGE','云服务实际成本',true,'PUBLISHED_SHARED_RULE','按公开且版本化的商户用量分摊规则计算'),\n  ('THIRD_PARTY','第三方接口实际成本',true,'DIRECT_USAGE','微信、短信、地图、GEO、ISV 等实际费用'),\n  ('PAYMENT_FEE','支付手续费',true,'DIRECT_INVOICE','对应订阅或算力包订单的支付通道费用'),\n  ('TAX','对应税费',true,'DIRECT_INVOICE','能直接对应订单的税费'),\n  ('CONSUMER_REWARD','消费奖励实际成本',true,'DIRECT_USAGE','由平台承担且能对应商户的消费奖励金额'),\n  ('GENERAL_PAYROLL','通用人员工资',false,'DIRECT_INVOICE','不能在商户收益分配前扣除'),\n  ('OFFICE_RENT','办公室租金',false,'DIRECT_INVOICE','不能在商户收益分配前扣除'),\n  ('UNUSED_QUOTA','未使用套餐额度',false,'DIRECT_USAGE','没有实际发生，不能当作成本')\nON CONFLICT (cost_code) DO NOTHING;\n\nINSERT INTO schema_migrations(version, checksum)\nVALUES ('0002_v6_1_revenue_rights_and_ai_intake', encode(digest('lequbao-v6.1-0002', 'sha256'), 'hex'));\n\nCOMMIT;\n`;

fs.mkdirSync(migrationsDir, {recursive: true});
fs.writeFileSync(outputPath, sql);
console.log(outputPath);


