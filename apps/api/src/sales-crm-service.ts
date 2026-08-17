import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  LeadStage,
  OnboardingLeadSummary,
  SalesCrmLeadSummary,
  SalesCrmOverview,
  SalesCrmTimingFilter,
} from '@lequ/contracts'

const SHANGHAI_CENTER = { latitude: 31.2304, longitude: 121.4737 }
const DAY_MS = 24 * 60 * 60 * 1000

const STAGE_ORDER: Record<LeadStage, number> = {
  NEW: 0,
  DIAGNOSED: 1,
  CONTRACT_DRAFT: 2,
  SIGNED: 3,
  ASSET_REVIEW: 4,
  READY_FOR_DELIVERY: 5,
  LOST: 6,
}

interface SalesCrmRow {
  id: string
  tenant_id: string
  city_id: string
  name: string
  category: string
  source: string
  contact_name: string
  contact_phone_masked: string
  address: string
  owner_id: string
  owner_display_name: string
  stage: LeadStage
  protection_expires_at: string
  dispute_status: OnboardingLeadSummary['disputeStatus']
  health_score: number | null
  loss_reason: string | null
  next_action: string
  next_action_at: string
  version: number
  latitude: number | null
  longitude: number | null
  district: string | null
  geocode_source: 'MANUAL' | 'LOCAL_REFERENCE' | 'PROVIDER' | null
  location_confidence: number | null
  location_version: number | null
  follow_up_count: number
  activity_count: number
  last_follow_up_at: string | null
}

export interface SalesCrmQueryInput {
  keyword?: string | undefined
  stage?: LeadStage | undefined
  source?: string | undefined
  timing?: SalesCrmTimingFilter | undefined
}

function leadScope(principal: Principal, alias = 'leads'): { clause: string; values: string[] } {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope === 'CITY') {
    if (principal.cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
    return {
      clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
      values: [...principal.cityIds],
    }
  }
  return {
    clause: ` AND (
      ${alias}.owner_id = ? OR EXISTS (
        SELECT 1 FROM lead_collaborators lc
        WHERE lc.tenant_id = ${alias}.tenant_id
          AND lc.lead_id = ${alias}.id
          AND lc.user_id = ?
      )
    )`,
    values: [principal.subject, principal.subject],
  }
}

function listScopedRows(database: DatabaseSync, principal: Principal): SalesCrmRow[] {
  const scope = leadScope(principal)
  return database.prepare(
    `WITH follow_up_stats AS (
       SELECT lead_id, COUNT(*) AS follow_up_count, MAX(occurred_at) AS last_follow_up_at
       FROM lead_followups
       WHERE tenant_id = ?
       GROUP BY lead_id
     ),
     activity_stats AS (
       SELECT lead_id, COUNT(*) AS activity_count
       FROM lead_activities
       WHERE tenant_id = ?
       GROUP BY lead_id
     )
     SELECT leads.id, leads.tenant_id, leads.city_id, leads.name, leads.category,
            leads.source, leads.contact_name, leads.contact_phone_masked,
            leads.address, leads.owner_id, users.display_name AS owner_display_name,
            leads.stage, leads.protection_expires_at, leads.dispute_status,
            leads.health_score, leads.loss_reason, leads.next_action,
            leads.next_action_at, leads.version,
            lead_locations.latitude, lead_locations.longitude,
            lead_locations.district, lead_locations.geocode_source,
            lead_locations.confidence AS location_confidence,
            lead_locations.version AS location_version,
            COALESCE(follow_up_stats.follow_up_count, 0) AS follow_up_count,
            COALESCE(activity_stats.activity_count, 0) AS activity_count,
            follow_up_stats.last_follow_up_at
     FROM leads
     JOIN users ON users.id = leads.owner_id
     LEFT JOIN lead_locations
       ON lead_locations.lead_id = leads.id
      AND lead_locations.tenant_id = leads.tenant_id
     LEFT JOIN follow_up_stats ON follow_up_stats.lead_id = leads.id
     LEFT JOIN activity_stats ON activity_stats.lead_id = leads.id
     WHERE leads.tenant_id = ?${scope.clause}`,
  ).all(
    principal.tenantId,
    principal.tenantId,
    principal.tenantId,
    ...scope.values,
  ) as unknown as SalesCrmRow[]
}

function toLead(row: SalesCrmRow): OnboardingLeadSummary {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    source: row.source,
    contactName: row.contact_name,
    contactPhoneMasked: row.contact_phone_masked,
    address: row.address,
    ownerId: row.owner_id,
    stage: row.stage,
    protectionExpiresAt: row.protection_expires_at,
    disputeStatus: row.dispute_status,
    healthScore: row.health_score,
    lossReason: row.loss_reason,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    version: row.version,
  }
}

function localDateKey(value: string | number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function isOverdue(row: SalesCrmRow, timestamp: number): boolean {
  return row.stage !== 'LOST' && Date.parse(row.next_action_at) < timestamp
}

function matchesTiming(
  row: SalesCrmRow,
  timing: SalesCrmTimingFilter,
  timestamp: number,
): boolean {
  if (timing === 'ALL') return true
  if (row.stage === 'LOST') return false
  const nextActionAt = Date.parse(row.next_action_at)
  if (timing === 'OVERDUE') return nextActionAt < timestamp
  if (timing === 'TODAY') return localDateKey(nextActionAt) === localDateKey(timestamp)
  return nextActionAt > timestamp && localDateKey(nextActionAt) !== localDateKey(timestamp)
}

function matchesKeyword(row: SalesCrmRow, keyword: string): boolean {
  if (!keyword) return true
  const haystack = [
    row.name,
    row.category,
    row.source,
    row.contact_name,
    row.contact_phone_masked,
    row.address,
    row.owner_display_name,
  ].join('\n').toLocaleLowerCase('zh-CN')
  return haystack.includes(keyword.toLocaleLowerCase('zh-CN'))
}

function toSummary(row: SalesCrmRow, timestamp: number): SalesCrmLeadSummary {
  const hasLocation = (
    row.latitude !== null
    && row.longitude !== null
    && row.district !== null
    && row.geocode_source !== null
    && row.location_confidence !== null
    && row.location_version !== null
  )
  return {
    lead: toLead(row),
    ownerDisplayName: row.owner_display_name,
    location: hasLocation
      ? {
          latitude: row.latitude as number,
          longitude: row.longitude as number,
          district: row.district as string,
          geocodeSource: row.geocode_source as NonNullable<SalesCrmRow['geocode_source']>,
          confidence: row.location_confidence as number,
          version: row.location_version as number,
        }
      : null,
    followUpCount: row.follow_up_count,
    activityCount: row.activity_count,
    lastFollowUpAt: row.last_follow_up_at,
    isOverdue: isOverdue(row, timestamp),
    protectionDaysRemaining: Math.max(
      0,
      Math.ceil((Date.parse(row.protection_expires_at) - timestamp) / DAY_MS),
    ),
  }
}

function compareRows(left: SalesCrmRow, right: SalesCrmRow, timestamp: number): number {
  const overdueDelta = Number(isOverdue(right, timestamp)) - Number(isOverdue(left, timestamp))
  if (overdueDelta !== 0) return overdueDelta
  const stageDelta = STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage]
  if (stageDelta !== 0) return stageDelta
  return Date.parse(left.next_action_at) - Date.parse(right.next_action_at)
}

export function getSalesCrmOverview(
  database: DatabaseSync,
  principal: Principal,
  input: SalesCrmQueryInput = {},
): SalesCrmOverview {
  const timestamp = Date.now()
  const keyword = input.keyword?.trim() ?? ''
  const stage = input.stage ?? null
  const source = input.source?.trim() || null
  const timing = input.timing ?? 'ALL'
  const allRows = listScopedRows(database, principal)
  const filteredRows = allRows
    .filter((row) => (
      matchesKeyword(row, keyword)
      && (!stage || row.stage === stage)
      && (!source || row.source === source)
      && matchesTiming(row, timing, timestamp)
    ))
    .sort((left, right) => compareRows(left, right, timestamp))

  const locatedRows = filteredRows.filter((row) => (
    row.latitude !== null && row.longitude !== null
  ))
  const center = locatedRows.length === 0
    ? SHANGHAI_CENTER
    : {
        latitude: locatedRows.reduce((sum, row) => sum + (row.latitude ?? 0), 0) / locatedRows.length,
        longitude: locatedRows.reduce((sum, row) => sum + (row.longitude ?? 0), 0) / locatedRows.length,
      }

  return {
    metrics: {
      total: allRows.length,
      filtered: filteredRows.length,
      overdue: allRows.filter((row) => isOverdue(row, timestamp)).length,
      protected: allRows.filter((row) => Date.parse(row.protection_expires_at) > timestamp).length,
      disputed: allRows.filter((row) => row.dispute_status !== 'NONE').length,
      located: allRows.filter((row) => row.latitude !== null && row.longitude !== null).length,
    },
    leads: filteredRows.map((row) => toSummary(row, timestamp)),
    map: {
      center,
      points: locatedRows.map((row) => ({
        leadId: row.id,
        name: row.name,
        category: row.category,
        stage: row.stage,
        latitude: row.latitude as number,
        longitude: row.longitude as number,
        district: row.district ?? '',
        isOverdue: isOverdue(row, timestamp),
        nextAction: row.next_action,
      })),
    },
    filters: {
      sources: [...new Set(allRows.map((row) => row.source))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      stages: [...new Set(allRows.map((row) => row.stage))]
        .sort((a, b) => STAGE_ORDER[a] - STAGE_ORDER[b]),
    },
    query: { keyword, stage, source, timing },
    updatedAt: new Date(timestamp).toISOString(),
  }
}
