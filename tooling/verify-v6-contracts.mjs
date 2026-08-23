import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const schema = await read('database/schema.sql');
const sourceSchema = await read(
  'docs/v6.1/source-package/05_数据API事件权限与安全/database/schema.sql',
);
const migration = await read('database/migrations/0002_v6_1_永久收益权与AI对话建档.sql');
const identityMigration = await read('database/migrations/0008_identity_access_and_usage.sql');
const rightsGovernanceMigration = await read(
  'database/migrations/0009_revenue_right_governance.sql',
);
const deliveryMigration = await read('database/migrations/0010_delivery_workflow.sql');
const miniProgramMigration = await read('database/migrations/0011_mini_program_lifecycle.sql');
const customerServiceMigration = await read(
  'database/migrations/0012_customer_service_and_privacy.sql',
);
const commerceMigration = await read(
  'database/migrations/0013_commerce_fulfillment_and_reconciliation.sql',
);
const geoPluginReportMigration = await read(
  'database/migrations/0014_geo_reports_and_plugin_runtime.sql',
);
const operationsMigration = await read(
  'database/migrations/0015_operations_migration_and_privacy.sql',
);
const eventRuntimeMigration = await read('database/migrations/0016_event_delivery_runtime.sql');
const platformConsumerCartMigration = await read(
  'database/migrations/0017_platform_consumer_cart.sql',
);
const platformCheckoutMigration = await read('database/migrations/0018_platform_checkout.sql');
const merchantMiniCheckoutMigration = await read(
  'database/migrations/0019_merchant_mini_checkout_scope.sql',
);
const consumerEvidenceMigration = await read(
  'database/migrations/0020_consumer_trace_and_invoice_profiles.sql',
);
const salesLifecycleMigration = await read(
  'database/migrations/0021_sales_and_subscription_lifecycle.sql',
);
const distributionDisputeMigration = await read(
  'database/migrations/0022_distribution_disputes.sql',
);
const employeeAgentRuntimeMigration = await read(
  'database/migrations/0023_employee_agent_runtime.sql',
);
const productPublicationMigration = await read(
  'database/migrations/0024_product_publication_receipts.sql',
);
const customerServiceOperationsMigration = await read(
  'database/migrations/0025_customer_service_operations.sql',
);
const platformControlMigration = await read('database/migrations/0026_platform_control_plane.sql');
const platformConsumerIdentityMigration = await read(
  'database/migrations/0027_platform_consumer_identity_exchange.sql',
);
const pageStats = JSON.parse(
  await read('docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树统计.json'),
);
const events = await read(
  'docs/v6.1/source-package/05_数据API事件权限与安全/events/领域事件目录.csv',
);

const failures = [];
const tableCount = [
  ...`${schema}\n${identityMigration}\n${rightsGovernanceMigration}\n${deliveryMigration}\n${miniProgramMigration}\n${customerServiceMigration}\n${commerceMigration}\n${geoPluginReportMigration}\n${operationsMigration}\n${eventRuntimeMigration}\n${platformConsumerCartMigration}\n${platformCheckoutMigration}\n${merchantMiniCheckoutMigration}\n${consumerEvidenceMigration}\n${salesLifecycleMigration}\n${distributionDisputeMigration}\n${employeeAgentRuntimeMigration}\n${productPublicationMigration}\n${customerServiceOperationsMigration}\n${platformControlMigration}`.matchAll(
    /^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim,
  ),
].length;
const sourceTableCount = [...sourceSchema.matchAll(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim)]
  .length;
if (sourceTableCount !== 73)
  failures.push(`expected 73 source-package tables, found ${sourceTableCount}`);
if (tableCount !== 164) failures.push(`expected 164 audited target tables, found ${tableCount}`);
if (pageStats.total_nodes !== 307)
  failures.push(`expected 307 page nodes, found ${pageStats.total_nodes}`);
if (pageStats.leaf_pages !== 197)
  failures.push(`expected 197 leaf pages, found ${pageStats.leaf_pages}`);
if (events.trim().split(/\r?\n/u).length - 1 !== 46) failures.push('expected 46 domain events');
if (/^\+/mu.test(migration)) failures.push('migration contains accidental diff markers');
if (!schema.includes('ENABLE ROW LEVEL SECURITY')) failures.push('schema does not enable RLS');
if (!platformControlMigration.includes('ADD COLUMN IF NOT EXISTS reward_rule_snapshot'))
  failures.push('order reward rule snapshot boundary missing');
if (!platformControlMigration.includes('SECURITY DEFINER'))
  failures.push('platform merchant directory database boundary missing');
if (!schema.includes('CREATE TRIGGER audit_logs_immutable'))
  failures.push('immutable audit trigger missing');
if (!schema.includes('\\ir migrations/0008_identity_access_and_usage.sql'))
  failures.push('clean schema does not include migration 0008');
if (!identityMigration.includes('CREATE TABLE user_sessions'))
  failures.push('revocable user session table missing');
if (!identityMigration.includes('CREATE TRIGGER ai_usage_ledger_entries_immutable'))
  failures.push('immutable AI usage ledger missing');
if (!schema.includes('\\ir migrations/0009_revenue_right_governance.sql'))
  failures.push('clean schema does not include migration 0009');
if (!rightsGovernanceMigration.includes('transfer requires both beneficiary confirmations'))
  failures.push('revenue-right transfer confirmation guard missing');
if (!schema.includes('\\ir migrations/0010_delivery_workflow.sql'))
  failures.push('clean schema does not include migration 0010');
if (!deliveryMigration.includes('all required delivery steps must succeed before acceptance'))
  failures.push('delivery acceptance database guard missing');
if (!deliveryMigration.includes('completed delivery attempts are immutable'))
  failures.push('delivery attempt terminal immutability guard missing');
if (!deliveryMigration.includes('merchant price and refund confirmations are required'))
  failures.push('delivery merchant-confirmation database guard missing');
if (!schema.includes('\\ir migrations/0011_mini_program_lifecycle.sql'))
  failures.push('clean schema does not include migration 0011');
if (!miniProgramMigration.includes('mini_programs_global_app_id_hash_uidx'))
  failures.push('global merchant AppID ownership guard missing');
if (
  !miniProgramMigration.includes('matching merchant preview confirmation is required before review')
)
  failures.push('mini-program review confirmation guard missing');
if (!miniProgramMigration.includes('published release requires verified external version and time'))
  failures.push('mini-program publish evidence guard missing');
if (!miniProgramMigration.includes('mini-program external attempts are append-only'))
  failures.push('mini-program external attempt immutability guard missing');
if (!schema.includes('\\ir migrations/0012_customer_service_and_privacy.sql'))
  failures.push('clean schema does not include migration 0012');
if (!customerServiceMigration.includes('AI cannot reply after human handoff'))
  failures.push('AI post-handoff reply guard missing');
if (!customerServiceMigration.includes('only the assigned employee may reply'))
  failures.push('assigned employee identity guard missing');
if (
  !customerServiceMigration.includes('active profile-memory consent is required for customer facts')
)
  failures.push('customer profile consent guard missing');
if (!customerServiceMigration.includes('handoff_tickets_one_active_per_conversation_uidx'))
  failures.push('single active human handoff guard missing');
if (!schema.includes('\\ir migrations/0013_commerce_fulfillment_and_reconciliation.sql'))
  failures.push('clean schema does not include migration 0013');
if (!schema.includes('\\ir migrations/0014_geo_reports_and_plugin_runtime.sql'))
  failures.push('clean schema does not include migration 0014');
if (!schema.includes('\\ir migrations/0015_operations_migration_and_privacy.sql'))
  failures.push('clean schema does not include migration 0015');
if (!schema.includes('\\ir migrations/0016_event_delivery_runtime.sql'))
  failures.push('clean schema does not include migration 0016');
if (!schema.includes('\\ir migrations/0017_platform_consumer_cart.sql'))
  failures.push('clean schema does not include migration 0017');
if (!schema.includes('\\ir migrations/0018_platform_checkout.sql'))
  failures.push('clean schema does not include migration 0018');
if (!schema.includes('\\ir migrations/0019_merchant_mini_checkout_scope.sql'))
  failures.push('clean schema does not include migration 0019');
if (!schema.includes('\\ir migrations/0020_consumer_trace_and_invoice_profiles.sql'))
  failures.push('clean schema does not include migration 0020');
if (!schema.includes('\\ir migrations/0021_sales_and_subscription_lifecycle.sql'))
  failures.push('clean schema does not include migration 0021');
if (!schema.includes('\\ir migrations/0027_platform_consumer_identity_exchange.sql'))
  failures.push('clean schema does not include migration 0027');
if (!eventRuntimeMigration.includes('CREATE TABLE event_dead_letters'))
  failures.push('event dead-letter evidence table missing');
if (!eventRuntimeMigration.includes('CREATE TABLE event_consumer_offsets'))
  failures.push('ordered consumer offset table missing');
if (!platformConsumerCartMigration.includes('shopping_carts_one_active_per_account_uidx'))
  failures.push('single active platform consumer cart guard missing');
if (!platformConsumerCartMigration.includes('FORCE ROW LEVEL SECURITY'))
  failures.push('platform consumer cart RLS must be forced');
if (!platformCheckoutMigration.includes('platform_checkout_sessions_self'))
  failures.push('platform checkout account isolation policy missing');
if (!merchantMiniCheckoutMigration.includes("'MERCHANT_MINI_PROGRAM'"))
  failures.push('merchant mini-program checkout source boundary missing');
if (!consumerEvidenceMigration.includes('platform_invoice_profiles_self'))
  failures.push('platform invoice profile account isolation missing');
if (!salesLifecycleMigration.includes('sales_collection_receipts_immutable'))
  failures.push('sales collection receipt immutability guard missing');
if (!salesLifecycleMigration.includes("'sales_opportunities','sales_duplicate_checks'"))
  failures.push('sales opportunity RLS missing');
if (!platformCheckoutMigration.includes('orders_payable_reconciliation_check'))
  failures.push('shipping-aware order reconciliation guard missing');
if (!platformCheckoutMigration.includes('store_checkout_policies_one_active_uidx'))
  failures.push('single active store checkout policy guard missing');
if (!commerceMigration.includes('refund item exceeds original order scope'))
  failures.push('refund original-order scope guard missing');
if (!commerceMigration.includes('CREATE TRIGGER ledger_entries_immutable'))
  failures.push('reward ledger append-only guard missing');
if (!commerceMigration.includes('CREATE TABLE payment_callback_receipts'))
  failures.push('payment callback replay receipt missing');
if (!commerceMigration.includes("status <> 'BALANCED' OR difference_cents=0"))
  failures.push('commerce reconciliation difference guard missing');
if (!platformConsumerIdentityMigration.includes('platform_consumer_sessions_assertion_uidx'))
  failures.push('platform consumer assertion replay guard missing');
if (!platformConsumerIdentityMigration.includes('platform_consumer_sessions_identity_immutable'))
  failures.push('platform consumer session identity immutability guard missing');
if (!platformConsumerIdentityMigration.includes('SECURITY DEFINER'))
  failures.push('platform consumer session issuance database boundary missing');

if (failures.length > 0) {
  for (const failure of failures) console.error(`V6 contract failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'V6 contracts verified: 73 source tables, 164 audited target tables, 307 nodes, 197 leaves, 46 domain events, RLS and audit guards.',
  );
}
