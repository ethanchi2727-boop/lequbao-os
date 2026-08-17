import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { systemRoles, type DataScope, type Principal, type SystemRole } from '@lequ/auth'
import type { AuthSession } from '@lequ/contracts'
import { DomainError } from './errors.js'

export const DEVELOPMENT_ACCESS_TOKENS = {
  hq: 'dev-hq-super-2026',
  cityManager: 'dev-city-manager-2026',
  sales: 'dev-city-sales-2026',
  salesPeer: 'dev-city-sales-peer-2026',
  delivery: 'dev-city-worker-2026',
  provider: 'dev-city-delivery-2026',
  merchant: 'dev-merchant-owner-2026',
  manager: 'dev-store-manager-2026',
  clerk: 'dev-store-clerk-2026',
  consumer: 'dev-consumer-2026',
} as const

interface SessionRow {
  user_id: string
  display_name: string
  tenant_id: string
  expires_at: string
  membership_id: string
  data_scope: DataScope
  city_ids_json: string
  merchant_ids_json: string
  store_ids_json: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new DomainError(500, 'invalid_identity_scope', '身份数据范围配置无效')
  }
  return parsed
}

export function authenticate(
  database: DatabaseSync,
  authorization: string | undefined,
): { principal: Principal; expiresAt: string } {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  const token = match?.[1]?.trim()
  if (!token) {
    throw new DomainError(401, 'authentication_required', '请先登录后再访问此服务')
  }

  const row = database.prepare(
    `SELECT s.user_id, u.display_name, s.tenant_id, s.expires_at,
            m.id AS membership_id, m.data_scope, m.city_ids_json,
            m.merchant_ids_json, m.store_ids_json
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id AND u.status = 'ACTIVE'
     JOIN memberships m ON m.user_id = s.user_id
       AND m.tenant_id = s.tenant_id AND m.status = 'ACTIVE'
     JOIN tenants t ON t.id = s.tenant_id AND t.status = 'ACTIVE'
     WHERE s.token_hash = ?`,
  ).get(sha256(token)) as unknown as SessionRow | undefined

  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    throw new DomainError(401, 'invalid_session', '登录会话无效或已过期')
  }

  const roleRows = database.prepare(
    'SELECT role FROM role_assignments WHERE membership_id = ? ORDER BY role',
  ).all(row.membership_id) as unknown as Array<{ role: string }>
  const roles = roleRows.map(({ role }) => role).filter(
    (role): role is SystemRole => systemRoles.some((candidate) => candidate === role),
  )
  if (roles.length === 0) {
    throw new DomainError(403, 'role_required', '当前账号尚未分配平台角色')
  }

  return {
    principal: {
      subject: row.user_id,
      displayName: row.display_name,
      tenantId: row.tenant_id,
      roles,
      dataScope: row.data_scope,
      cityIds: parseIds(row.city_ids_json),
      merchantIds: parseIds(row.merchant_ids_json),
      storeIds: parseIds(row.store_ids_json),
    },
    expiresAt: row.expires_at,
  }
}

export function toAuthSession(
  principal: Principal,
  expiresAt: string,
): AuthSession {
  return {
    subject: principal.subject,
    displayName: principal.displayName,
    tenantId: principal.tenantId,
    roles: [...principal.roles],
    dataScope: principal.dataScope,
    cityIds: [...principal.cityIds],
    merchantIds: [...principal.merchantIds],
    storeIds: [...principal.storeIds],
    expiresAt,
  }
}
