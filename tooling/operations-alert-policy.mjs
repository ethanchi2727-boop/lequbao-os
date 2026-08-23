export const requiredAlertCodes = Object.freeze([
  'AUTH_ANOMALY',
  'CROSS_TENANT_DENIAL_SPIKE',
  'PERMISSION_CHANGE_SPIKE',
  'BULK_EXPORT_SPIKE',
  'REFUND_SPIKE',
  'RELEASE_SPIKE',
  'PAYMENT_CALLBACK_DELAY',
  'REWARD_LEDGER_UNBALANCED',
  'OUTBOX_DEAD',
  'PLUGIN_CIRCUIT_OPEN',
  'SECRET_READ_ANOMALY',
  'DATABASE_SLOW_QUERY',
  'AUDIT_WRITE_FAILURE',
  'PRIVACY_DELETION_FAILED',
]);

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
  }
  for (const code of requiredAlertCodes)
    if (!codes.has(code)) failures.push(`missing alert ${code}`);
  return failures;
}
