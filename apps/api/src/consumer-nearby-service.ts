import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  ConsumerCitySummary,
  ConsumerHouseholdMemberSummary,
  ConsumerNearbyOverview,
  ConsumerNearbyStoreSummary,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const POLICY_VERSION = 'consumer-nearby-policy-v1' as const

interface ProfileRow {
  tenant_id: string
  preferred_city_id: string
  active_household_id: string
  active_household_member_id: string
}

interface StoreRow {
  store_id: string
  merchant_id: string
  category: string
  rating: number
  review_count: number
  recommendation_reason: string
  badges_json: string
  publication_updated_at: string
  name: string
  address: string
  business_hours: string
  store_updated_at: string
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  confidence: number | null
  location_version: number | null
  location_updated_at: string | null
}

function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不是消费者本人')
  }
}

function radians(value: number): number {
  return value * Math.PI / 180
}

function straightLineDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusMeters = 6_371_000
  const latitudeDelta = radians(to.latitude - from.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude))
    * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function storeSummary(
  row: StoreRow,
  location: { latitude: number; longitude: number } | undefined,
): ConsumerNearbyStoreSummary {
  const hasCoordinates = (
    row.latitude !== null
    && row.longitude !== null
    && row.geocode_source !== null
    && row.confidence !== null
    && row.location_version !== null
  )
  const coordinates = hasCoordinates
    ? {
        latitude: row.latitude as number,
        longitude: row.longitude as number,
        source: row.geocode_source as string,
        confidence: row.confidence as number,
        version: row.location_version as number,
      }
    : null
  const distanceMeters = location && coordinates
    ? straightLineDistanceMeters(location, coordinates)
    : null
  return {
    id: row.store_id,
    merchantId: row.merchant_id,
    name: row.name,
    category: row.category,
    address: row.address,
    businessHours: row.business_hours,
    rating: row.rating,
    reviewCount: row.review_count,
    badges: JSON.parse(row.badges_json) as string[],
    reason: row.recommendation_reason,
    distanceMeters,
    distanceMethod: distanceMeters === null ? null : 'STRAIGHT_LINE',
    coordinates,
    actionTarget: `/pages/store/index?storeId=${encodeURIComponent(row.store_id)}`,
  }
}

export function getConsumerNearbyOverview(
  database: DatabaseSync,
  principal: Principal,
  input: {
    cityId?: string | undefined
    householdMemberId?: string | undefined
    location?: {
      latitude: number
      longitude: number
      accuracyMeters?: number | undefined
    } | undefined
    limit: number
  },
): ConsumerNearbyOverview {
  requireConsumer(principal)
  const profile = database.prepare(
    `SELECT tenant_id, preferred_city_id, active_household_id,
            active_household_member_id
     FROM consumer_profiles
     WHERE user_id = ? AND tenant_id = ?`,
  ).get(principal.subject, principal.tenantId) as unknown as ProfileRow | undefined
  if (!profile) throw new DomainError(404, 'consumer_profile_not_found', '消费者档案不存在')
  if (
    (input.cityId && input.cityId !== profile.preferred_city_id)
    || (
      input.householdMemberId
      && input.householdMemberId !== profile.active_household_member_id
    )
  ) {
    throw new DomainError(409, 'consumer_nearby_context_stale', '附近服务上下文已变化，请刷新后重试')
  }
  const city = database.prepare(
    `SELECT id, name, code, service_level, status
     FROM consumer_cities
     WHERE id = ? AND tenant_id = ?`,
  ).get(profile.preferred_city_id, profile.tenant_id) as {
    id: string
    name: string
    code: string
    service_level: ConsumerCitySummary['serviceLevel']
    status: 'ACTIVE' | 'PAUSED'
  } | undefined
  if (!city || city.status !== 'ACTIVE') {
    throw new DomainError(409, 'consumer_city_unavailable', '当前城市暂未开放附近服务')
  }
  const member = database.prepare(
    `SELECT id, name, relation, mode, avatar_key, subtitle,
            dietary_notes_json, permissions_json, status
     FROM consumer_household_members
     WHERE id = ? AND tenant_id = ? AND household_id = ?`,
  ).get(
    profile.active_household_member_id,
    profile.tenant_id,
    profile.active_household_id,
  ) as {
    id: string
    name: string
    relation: string
    mode: ConsumerHouseholdMemberSummary['mode']
    avatar_key: string
    subtitle: string
    dietary_notes_json: string
    permissions_json: string
    status: 'ACTIVE' | 'PAUSED'
  } | undefined
  if (!member || member.status !== 'ACTIVE') {
    throw new DomainError(409, 'consumer_context_invalid', '当前家庭身份不可用')
  }
  const rows = database.prepare(
    `SELECT publications.store_id, publications.merchant_id,
            publications.category, publications.rating,
            publications.review_count, publications.recommendation_reason,
            publications.badges_json,
            publications.updated_at AS publication_updated_at,
            stores.name, stores.address, stores.business_hours,
            stores.updated_at AS store_updated_at,
            locations.latitude, locations.longitude,
            locations.geocode_source, locations.confidence,
            locations.version AS location_version,
            locations.updated_at AS location_updated_at
     FROM consumer_store_publications publications
     JOIN merchant_stores stores
       ON stores.id = publications.store_id
      AND stores.tenant_id = publications.tenant_id
     LEFT JOIN consumer_store_locations locations
       ON locations.store_id = publications.store_id
      AND locations.tenant_id = publications.tenant_id
     WHERE publications.tenant_id = ? AND publications.city_id = ?
       AND publications.visibility_status = 'PUBLISHED'
       AND publications.authorization_scope = 'PLATFORM_DISPLAY'
       AND stores.operating_status = 'OPEN'
     ORDER BY publications.rating DESC, publications.review_count DESC, stores.name`,
  ).all(profile.tenant_id, city.id) as unknown as StoreRow[]
  const stores = rows
    .map((row) => storeSummary(row, input.location))
    .sort((left, right) => {
      if (input.location) {
        if (left.distanceMeters === null && right.distanceMeters !== null) return 1
        if (left.distanceMeters !== null && right.distanceMeters === null) return -1
        if (left.distanceMeters !== null && right.distanceMeters !== null) {
          const distance = left.distanceMeters - right.distanceMeters
          if (distance !== 0) return distance
        }
      }
      return right.rating - left.rating
        || right.reviewCount - left.reviewCount
        || left.name.localeCompare(right.name, 'zh-CN')
    })
    .slice(0, input.limit)
  const points = stores.flatMap((store) => store.coordinates
    ? [{
        storeId: store.id,
        name: store.name,
        latitude: store.coordinates.latitude,
        longitude: store.coordinates.longitude,
        distanceMeters: store.distanceMeters,
      }]
    : [])
  const center = input.location
    ? { latitude: input.location.latitude, longitude: input.location.longitude }
    : points.length
      ? {
          latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
          longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
        }
      : null
  const updatedAt = rows.flatMap((row) => [
    row.publication_updated_at,
    row.store_updated_at,
    row.location_updated_at,
  ]).filter((value): value is string => value !== null).sort().at(-1) ?? new Date().toISOString()
  return {
    city: {
      id: city.id,
      name: city.name,
      code: city.code,
      serviceLevel: city.service_level,
      available: true,
      isCurrent: true,
    },
    activeMember: {
      id: member.id,
      name: member.name,
      relation: member.relation,
      mode: member.mode,
      avatarKey: member.avatar_key,
      subtitle: member.subtitle,
      dietaryNotes: JSON.parse(member.dietary_notes_json) as string[],
      permissions: JSON.parse(member.permissions_json) as string[],
      isCurrent: true,
    },
    mode: input.location ? 'LOCATION' : 'CITY_FALLBACK',
    notice: input.location
      ? '已按当前位置计算直线距离；不代表步行、驾车或实时路程。'
      : `未使用精确位置，当前按${city.name}服务质量与口碑展示。`,
    stores,
    map: { center, points },
    policy: {
      version: POLICY_VERSION,
      selfScopeEnforced: true,
      locationOptional: true,
      preciseLocationNotStored: true,
      publishedStoresOnly: true,
      platformDisplayAuthorizationRequired: true,
      straightLineDistanceOnly: true,
      noPaidRanking: true,
      navigationNotSupported: true,
    },
    updatedAt,
  }
}
