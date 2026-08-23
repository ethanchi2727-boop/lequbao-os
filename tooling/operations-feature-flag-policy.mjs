export const requiredFeatureFlagRequirements = Object.freeze({
  consumer_payments: [
    'business_finance_product_technology_signoff',
    'payment_sandbox_passed',
    'reconciliation_green',
  ],
  reward_migration: [
    'business_finance_product_technology_signoff',
    'two_migration_drills',
    'zero_unexplained_difference',
  ],
  geo_external_publish: ['channel_credentials', 'adapter_contract_passed'],
  plugin_runtime: ['signed_first_party_package', 'sandbox_egress_passed'],
  mini_program_release: ['merchant_appid_authorization', 'wechat_review_drill'],
  identity_provider_login: ['provider_assertion_adapter', 'mfa_policy'],
});

export function inspectOperationsFeatureFlags(document) {
  const failures = [];
  if (!document || Array.isArray(document) || typeof document !== 'object')
    return ['feature flags document must be an object'];
  const extraDocumentFields = Object.keys(document).filter(
    (field) => !['version', 'defaults', 'requirements'].includes(field),
  );
  if (extraDocumentFields.length)
    failures.push(
      `feature flags document has undeclared fields: ${extraDocumentFields.join(', ')}`,
    );
  if (document.version !== 1) failures.push('feature flags version must be 1');
  for (const section of ['defaults', 'requirements'])
    if (
      !document[section] ||
      Array.isArray(document[section]) ||
      typeof document[section] !== 'object'
    )
      failures.push(`feature flags ${section} must be an object`);
  if (failures.some((failure) => failure.endsWith('must be an object'))) return failures;

  const requiredNames = Object.keys(requiredFeatureFlagRequirements);
  for (const section of ['defaults', 'requirements']) {
    const actualNames = Object.keys(document[section]);
    const missing = requiredNames.filter((name) => !actualNames.includes(name));
    const extra = actualNames.filter((name) => !requiredNames.includes(name));
    if (missing.length) failures.push(`feature flags ${section} is missing: ${missing.join(', ')}`);
    if (extra.length) failures.push(`feature flags ${section} is undeclared: ${extra.join(', ')}`);
  }
  for (const [name, requirements] of Object.entries(requiredFeatureFlagRequirements)) {
    if (document.defaults[name] !== false)
      failures.push(`feature flag ${name} must default to false`);
    if (JSON.stringify(document.requirements[name]) !== JSON.stringify(requirements))
      failures.push(`feature flag ${name} requirements do not match policy`);
  }
  return failures;
}
