import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const matrixPath = resolve(root, 'docs/v6.1/source-package/05_数据API事件权限与安全/RBAC矩阵.csv');
const outputPath = resolve(root, 'database/migrations/0008_identity_access_and_usage.sql');

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\r' || character === '\n') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return {
    headers,
    records: values.map((valuesRow) =>
      Object.fromEntries(headers.map((header, index) => [header, valuesRow[index] ?? ''])),
    ),
  };
}

const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const riskFor = (permission) =>
  /(approve|pay|reverse|publish|rollback|role\.manage|tenant\.suspend|export)/u.test(permission)
    ? 'CRITICAL'
    : /(create|execute|accept|send|close|request|reconcile|install|grant|lock|manage)/u.test(
          permission,
        )
      ? 'HIGH'
      : 'MEDIUM';

const { headers, records } = parseCsv(await readFile(matrixPath, 'utf8'));
const permissions = headers.slice(3);
const roleRows = records
  .map(
    (record) =>
      `  (${quote(record.role_code)},${quote(record.role_name)},${quote(record.scope)},${quote(`V6.1 frozen RBAC role: ${record.role_name}`)})`,
  )
  .join(',\n');
const permissionRows = permissions
  .map((permission) => {
    const domain = permission.split('.')[0];
    return `  (${quote(permission)},${quote(domain)},${quote(`V6.1 frozen permission ${permission}`)},${quote(riskFor(permission))})`;
  })
  .join(',\n');
const grantRows = records
  .flatMap((record) =>
    permissions
      .filter((permission) => record[permission] !== 'NONE')
      .map(
        (permission) =>
          `  (${quote(record.role_code)},${quote(permission)},${quote(record[permission])})`,
      ),
  )
  .join(',\n');

const sql = `-- Generated from the frozen V6.1 RBAC matrix. Do not hand-edit the seed section.
BEGIN;

ALTER TABLE role_catalog DROP CONSTRAINT IF EXISTS role_catalog_scope_type_check;
ALTER TABLE role_catalog ADD CONSTRAINT role_catalog_scope_type_check
  CHECK (scope_type IN ('PLATFORM','CHANNEL','TENANT','STORE','INSTALLATION'));

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS access_scope text;
UPDATE role_permissions SET access_scope = 'ALL' WHERE access_scope IS NULL;
ALTER TABLE role_permissions ALTER COLUMN access_scope SET NOT NULL;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_access_scope_check;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_access_scope_check
  CHECK (access_scope IN ('ALL','ASSIGNED','CONDITIONAL','DUAL','GRANT','JIT_READ','OWN','REGION','STORE','TENANT'));

CREATE TABLE user_sessions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  user_id uuid NOT NULL,
  refresh_token_hash text,
  device_fingerprint_hash text,
  auth_level text NOT NULL DEFAULT 'PASSWORD' CHECK (auth_level IN ('PASSWORD','MFA')),
  risk_level text NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH','BLOCKED')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, session_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CHECK (expires_at > issued_at),
  CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE INDEX user_sessions_active_idx ON user_sessions(tenant_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE tenant_entitlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  plan_code text NOT NULL REFERENCES plans(plan_code),
  subscription_version integer NOT NULL CHECK (subscription_version > 0),
  entitlements jsonb NOT NULL CHECK (jsonb_typeof(entitlements) = 'object'),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subscription_id, subscription_version),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions(tenant_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE ai_usage_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid,
  meter_code text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('MODEL','IMAGE','OCR','ASR','VECTOR','WORKFLOW')),
  source_id text NOT NULL,
  provider text NOT NULL,
  model_code text,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  trace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, meter_code),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions(tenant_id, id)
);

CREATE TRIGGER tenant_entitlement_snapshots_immutable
BEFORE UPDATE OR DELETE ON tenant_entitlement_snapshots
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER ai_usage_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ai_usage_ledger_entries
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sessions_tenant_isolation ON user_sessions
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE tenant_entitlement_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_entitlement_snapshots_tenant_isolation ON tenant_entitlement_snapshots
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE ai_usage_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_ledger_entries_tenant_isolation ON ai_usage_ledger_entries
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

INSERT INTO role_catalog(role_code, role_name, scope_type, description) VALUES
${roleRows}
ON CONFLICT (role_code) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  scope_type = EXCLUDED.scope_type,
  description = EXCLUDED.description;

INSERT INTO permission_catalog(permission_code, domain, description, risk_level) VALUES
${permissionRows}
ON CONFLICT (permission_code) DO UPDATE SET
  domain = EXCLUDED.domain,
  description = EXCLUDED.description,
  risk_level = EXCLUDED.risk_level;

INSERT INTO role_permissions(role_code, permission_code, access_scope) VALUES
${grantRows}
ON CONFLICT (role_code, permission_code) DO UPDATE SET access_scope = EXCLUDED.access_scope;

INSERT INTO schema_migrations(version, checksum)
VALUES ('0008_identity_access_and_usage', encode(digest('lequbao-v6.1-0008', 'sha256'), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
`;

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== sql) throw new Error('0008 RBAC migration is stale; run pnpm rbac:generate');
  console.log(
    `RBAC migration verified: ${records.length} roles, ${permissions.length} permissions.`,
  );
} else {
  await writeFile(outputPath, sql, 'utf8');
  console.log(
    `Generated RBAC migration: ${records.length} roles, ${permissions.length} permissions.`,
  );
}
