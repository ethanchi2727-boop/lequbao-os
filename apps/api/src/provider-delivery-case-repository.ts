import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

const DELIVERY_SLA_HOURS = 7 * 24

interface DeliveryOwnerRow {
  user_id: string
  display_name: string
  city_ids_json: string
  roles: string
}

function deliveryOwner(
  database: DatabaseSync,
  tenantId: string,
  cityId: string,
  fallbackActorId: string,
): { userId: string; displayName: string } {
  const candidates = database.prepare(
    `SELECT users.id AS user_id, users.display_name, memberships.city_ids_json,
            GROUP_CONCAT(role_assignments.role, ',') AS roles
     FROM users
     JOIN memberships
       ON memberships.user_id = users.id
      AND memberships.tenant_id = ?
      AND memberships.status = 'ACTIVE'
     JOIN role_assignments ON role_assignments.membership_id = memberships.id
     WHERE users.status = 'ACTIVE'
     GROUP BY users.id, users.display_name, memberships.city_ids_json`,
  ).all(tenantId) as unknown as DeliveryOwnerRow[]
  const ranked = candidates
    .filter((candidate) => {
      const cities = JSON.parse(candidate.city_ids_json) as unknown
      return Array.isArray(cities) && cities.includes(cityId)
    })
    .map((candidate) => {
      const roles = candidate.roles.split(',')
      const priority = roles.includes('CITY_PROVIDER_ADMIN')
        ? 0
        : roles.includes('CITY_DELIVERY')
          ? 1
          : roles.includes('CITY_MANAGER')
            ? 2
            : 9
      return { candidate, priority }
    })
    .filter(({ priority }) => priority < 9)
    .sort((left, right) => left.priority - right.priority
      || left.candidate.display_name.localeCompare(right.candidate.display_name, 'zh-CN'))
  const selected = ranked[0]?.candidate
  if (selected) return { userId: selected.user_id, displayName: selected.display_name }
  const fallback = database.prepare(
    `SELECT display_name FROM users WHERE id = ? AND status = 'ACTIVE'`,
  ).get(fallbackActorId) as { display_name: string } | undefined
  return {
    userId: fallbackActorId,
    displayName: fallback?.display_name ?? '待分配负责人',
  }
}

export function ensureProviderDeliveryCase(
  database: DatabaseSync,
  input: {
    tenantId: string
    cityId: string
    leadId: string
    merchantName: string
    actorId: string
    timestamp: string
  },
): string {
  const existing = database.prepare(
    `SELECT id FROM provider_delivery_cases
     WHERE tenant_id = ? AND lead_id = ?`,
  ).get(input.tenantId, input.leadId) as { id: string } | undefined
  if (existing) return existing.id

  const owner = deliveryOwner(
    database,
    input.tenantId,
    input.cityId,
    input.actorId,
  )
  const caseId = `delivery-case-${randomUUID()}`
  const targetDueAt = new Date(
    Date.parse(input.timestamp) + DELIVERY_SLA_HOURS * 60 * 60 * 1000,
  ).toISOString()
  database.prepare(
    `INSERT INTO provider_delivery_cases
     (id, tenant_id, city_id, lead_id, owner_id, priority, target_due_at,
      version, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'HIGH', ?, 1, ?, ?, ?)`,
  ).run(
    caseId,
    input.tenantId,
    input.cityId,
    input.leadId,
    owner.userId,
    targetDueAt,
    input.actorId,
    input.timestamp,
    input.timestamp,
  )
  const payload = JSON.stringify({
    leadId: input.leadId,
    merchantName: input.merchantName,
    ownerId: owner.userId,
    ownerDisplayName: owner.displayName,
    stage: 'WAITING_CAPTURE',
    overallSlaHours: DELIVERY_SLA_HOURS,
    projectionVersion: 'provider-delivery-projection-v1',
  })
  database.prepare(
    `INSERT INTO provider_delivery_case_events
     (id, tenant_id, case_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'CASE_CREATED', ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.tenantId,
    caseId,
    input.leadId,
    input.actorId,
    `已建立 ${input.merchantName} 九阶段交付案件并分配负责人`,
    payload,
    input.timestamp,
  )
  return caseId
}
