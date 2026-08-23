export const requiredAlertPolicy = Object.freeze({
  AUTH_ANOMALY: [
    'P1',
    'auth_failures_rate',
    'rate_5m > 0.20 and attempts_5m >= 20',
    'freeze_identity_writes',
  ],
  CROSS_TENANT_DENIAL_SPIKE: [
    'P0',
    'cross_tenant_denials_total',
    'increase_5m > 0',
    'freeze_affected_tenant_high_risk_writes',
  ],
  PERMISSION_CHANGE_SPIKE: [
    'P1',
    'permission_changes_total',
    'increase_10m > 10',
    'freeze_member_and_role_writes',
  ],
  BULK_EXPORT_SPIKE: ['P1', 'customer_export_rows_total', 'increase_10m > 10000', 'freeze_exports'],
  REFUND_SPIKE: [
    'P1',
    'refund_requested_cents',
    'rate_10m > tenant_baseline_7d_x3',
    'freeze_refund_approval',
  ],
  RELEASE_SPIKE: ['P1', 'mini_program_release_total', 'increase_10m > 10', 'freeze_release_writes'],
  PAYMENT_CALLBACK_DELAY: [
    'P0',
    'payment_callback_persist_p95_ms',
    'value_5m > 300',
    'page_payment_on_call',
  ],
  REWARD_LEDGER_UNBALANCED: [
    'P0',
    'reward_unbalanced_transactions_total',
    'value > 0',
    'freeze_reward_writes',
  ],
  OUTBOX_DEAD: ['P0', 'outbox_dead_total', 'value > 0', 'page_platform_on_call'],
  PLUGIN_CIRCUIT_OPEN: [
    'P1',
    'plugin_circuit_open_total',
    'increase_5m > 0',
    'isolate_plugin_only',
  ],
  SECRET_READ_ANOMALY: [
    'P0',
    'secret_read_denials_total',
    'increase_5m > 0',
    'revoke_service_identity',
  ],
  DATABASE_SLOW_QUERY: ['P1', 'db_query_p95_ms', 'value_10m > 500', 'page_database_on_call'],
  AUDIT_WRITE_FAILURE: ['P0', 'audit_write_failures_total', 'value > 0', 'freeze_high_risk_writes'],
  PRIVACY_DELETION_FAILED: [
    'P1',
    'privacy_deletion_failed_total',
    'value > 0',
    'page_privacy_on_call',
  ],
});
export const requiredAlertCodes = Object.freeze(Object.keys(requiredAlertPolicy));

export function inspectOperationsAlerts(alerts) {
  const failures = [];
  if (!alerts || Array.isArray(alerts) || typeof alerts !== 'object')
    return ['alerts document must be an object'];
  const documentFields = Object.keys(alerts).filter(
    (field) => !['version', 'owner_source', 'rules'].includes(field),
  );
  if (documentFields.length)
    failures.push(`alerts document has undeclared fields: ${documentFields.join(', ')}`);
  if (alerts.version !== 1) failures.push('alerts version must be 1');
  if (alerts.owner_source !== 'DEPLOYMENT_ON_CALL_CONTACT')
    failures.push('alerts owner_source must be DEPLOYMENT_ON_CALL_CONTACT');
  if (!Array.isArray(alerts.rules)) return [...failures, 'alerts rules must be an array'];

  const codes = new Set();
  for (const [index, rule] of alerts.rules.entries()) {
    const prefix = `alerts rules[${index}]`;
    if (!rule || Array.isArray(rule) || typeof rule !== 'object') {
      failures.push(`${prefix} must be an object`);
      continue;
    }
    const extra = Object.keys(rule).filter(
      (field) => !['code', 'severity', 'metric', 'condition', 'action'].includes(field),
    );
    if (extra.length) failures.push(`${prefix} has undeclared fields: ${extra.join(', ')}`);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(rule.code ?? '')) failures.push(`${prefix}.code is invalid`);
    else if (codes.has(rule.code)) failures.push(`duplicate alert code ${rule.code}`);
    else codes.add(rule.code);
    if (!['P0', 'P1'].includes(rule.severity)) failures.push(`${prefix}.severity must be P0 or P1`);
    for (const field of ['metric', 'action'])
      if (!/^[a-z][a-z0-9_]*$/u.test(rule[field] ?? ''))
        failures.push(`${prefix}.${field} must be an identifier`);
    if (typeof rule.condition !== 'string' || rule.condition.trim().length < 3)
      failures.push(`${prefix}.condition must be meaningful`);
    const required = requiredAlertPolicy[rule.code];
    if (required) {
      const [severity, metric, condition, action] = required;
      for (const [field, expected] of Object.entries({ severity, metric, condition, action }))
        if (rule[field] !== expected)
          failures.push(`${rule.code}.${field} does not match the required alert policy`);
    }
  }
  for (const code of requiredAlertCodes)
    if (!codes.has(code)) failures.push(`missing alert ${code}`);
  return failures;
}
