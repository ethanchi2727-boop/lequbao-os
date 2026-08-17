import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { canAccessResource, type Principal } from '@lequ/auth'
import type {
  MerchantCatalogImportSummary,
  MerchantCatalogOverview,
  MerchantServiceSlotSummary,
  MerchantSkuSummary,
  MerchantSpuSummary,
  MerchantSpuType,
  MerchantStockMode,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'merchant-catalog-e5'

interface StoreRow {
  id: string
  tenant_id: string
  merchant_id: string
  city_id: string
}

interface CatalogRow {
  id: string
  tenant_id: string
  merchant_id: string
  store_id: string
  name: string
  status: MerchantCatalogOverview['catalog']['status']
  version: number
  updated_at: string
}

interface SpuRow {
  id: string
  catalog_id: string
  spu_type: MerchantSpuSummary['type']
  name: string
  category: string
  description: string
  status: MerchantSpuSummary['status']
  media_completion: number
  sort_order: number
  version: number
  updated_at: string
}

interface SkuRow {
  id: string
  tenant_id: string
  merchant_id: string
  store_id: string
  spu_id: string
  code: string
  name: string
  attributes_json: string
  price_fen: number
  compare_at_fen: number | null
  cost_fen: number | null
  stock_mode: MerchantStockMode
  stock_quantity: number
  low_stock_threshold: number
  status: MerchantSkuSummary['status']
  pricing_rule_version: string
  version: number
  updated_at: string
}

interface SlotRow {
  id: string
  tenant_id: string
  merchant_id: string
  store_id: string
  sku_id: string
  weekday: number
  start_time: string
  end_time: string
  capacity: number
  reserved: number
  price_override_fen: number | null
  status: MerchantServiceSlotSummary['status']
  version: number
}

interface ImportRow {
  id: string
  file_name: string
  status: MerchantCatalogImportSummary['status']
  rows_json: string
  errors_json: string
  total_rows: number
  accepted_rows: number
  version: number
  created_at: string
  applied_at: string | null
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

export interface CatalogImportInputRow {
  type: MerchantSpuType
  name: string
  category: string
  description: string
  mediaCompletion: number
  skuCode: string
  skuName: string
  priceFen: number
  stockMode: MerchantStockMode
  stockQuantity: number
  lowStockThreshold: number
}

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function getStore(database: DatabaseSync, principal: Principal): StoreRow {
  const rows = database.prepare(
    `SELECT id, tenant_id, merchant_id, city_id
     FROM merchant_stores WHERE tenant_id = ? ORDER BY updated_at DESC`,
  ).all(principal.tenantId) as unknown as StoreRow[]
  const row = rows.find((candidate) => canAccessResource(principal, {
    tenantId: candidate.tenant_id,
    cityId: candidate.city_id,
    merchantId: candidate.merchant_id,
    storeId: candidate.id,
  }))
  if (!row) {
    throw new DomainError(404, 'merchant_store_not_found', '当前数据范围内没有可访问的经营门店')
  }
  return row
}

function getCatalog(database: DatabaseSync, principal: Principal): CatalogRow {
  const store = getStore(database, principal)
  const row = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, name, status, version, updated_at
     FROM merchant_catalogs WHERE store_id = ? AND tenant_id = ?`,
  ).get(store.id, principal.tenantId) as unknown as CatalogRow | undefined
  if (!row) {
    throw new DomainError(404, 'merchant_catalog_not_found', '门店商品目录尚未初始化')
  }
  return row
}

function getSpu(
  database: DatabaseSync,
  principal: Principal,
  spuId: string,
): SpuRow {
  const catalog = getCatalog(database, principal)
  const row = database.prepare(
    `SELECT id, catalog_id, spu_type, name, category, description, status,
            media_completion, sort_order, version, updated_at
     FROM merchant_spus WHERE id = ? AND catalog_id = ?`,
  ).get(spuId, catalog.id) as unknown as SpuRow | undefined
  if (!row) throw new DomainError(404, 'merchant_spu_not_found', '商品不存在或不在当前门店目录')
  return row
}

function getSku(
  database: DatabaseSync,
  principal: Principal,
  skuId: string,
): SkuRow {
  const store = getStore(database, principal)
  const row = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, spu_id, code, name,
            attributes_json, price_fen, compare_at_fen, cost_fen, stock_mode,
            stock_quantity, low_stock_threshold, status, pricing_rule_version,
            version, updated_at
     FROM merchant_skus WHERE id = ? AND store_id = ?`,
  ).get(skuId, store.id) as unknown as SkuRow | undefined
  if (!row) throw new DomainError(404, 'merchant_sku_not_found', 'SKU 不存在或不在当前门店范围')
  return row
}

function getSlot(
  database: DatabaseSync,
  principal: Principal,
  slotId: string,
): SlotRow {
  const store = getStore(database, principal)
  const row = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, sku_id, weekday, start_time,
            end_time, capacity, reserved, price_override_fen, status, version
     FROM merchant_service_slots WHERE id = ? AND store_id = ?`,
  ).get(slotId, store.id) as unknown as SlotRow | undefined
  if (!row) throw new DomainError(404, 'merchant_slot_not_found', '预约时段不存在或不在当前门店范围')
  return row
}

function skuSummary(row: SkuRow): MerchantSkuSummary {
  return {
    id: row.id,
    spuId: row.spu_id,
    code: row.code,
    name: row.name,
    attributes: JSON.parse(row.attributes_json) as Record<string, string>,
    priceFen: row.price_fen,
    compareAtFen: row.compare_at_fen,
    costFen: row.cost_fen,
    stockMode: row.stock_mode,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    status: row.status,
    pricingRuleVersion: row.pricing_rule_version,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function slotSummary(row: SlotRow): MerchantServiceSlotSummary {
  return {
    id: row.id,
    skuId: row.sku_id,
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    reserved: row.reserved,
    priceOverrideFen: row.price_override_fen,
    status: row.status,
    version: row.version,
  }
}

export function getMerchantCatalogOverview(
  database: DatabaseSync,
  principal: Principal,
  focusSpuId?: string,
): MerchantCatalogOverview {
  const catalog = getCatalog(database, principal)
  const spuRows = database.prepare(
    `SELECT id, catalog_id, spu_type, name, category, description, status,
            media_completion, sort_order, version, updated_at
     FROM merchant_spus WHERE catalog_id = ?
     ORDER BY sort_order, updated_at DESC, id`,
  ).all(catalog.id) as unknown as SpuRow[]
  const skuRows = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, spu_id, code, name,
            attributes_json, price_fen, compare_at_fen, cost_fen, stock_mode,
            stock_quantity, low_stock_threshold, status, pricing_rule_version,
            version, updated_at
     FROM merchant_skus WHERE store_id = ? ORDER BY updated_at DESC, code`,
  ).all(catalog.store_id) as unknown as SkuRow[]
  const slotRows = database.prepare(
    `SELECT id, tenant_id, merchant_id, store_id, sku_id, weekday, start_time,
            end_time, capacity, reserved, price_override_fen, status, version
     FROM merchant_service_slots WHERE store_id = ?
     ORDER BY weekday, start_time`,
  ).all(catalog.store_id) as unknown as SlotRow[]
  const importRows = database.prepare(
    `SELECT id, file_name, status, rows_json, errors_json, total_rows, accepted_rows,
            version, created_at, applied_at
     FROM merchant_catalog_imports WHERE catalog_id = ?
     ORDER BY created_at DESC LIMIT 20`,
  ).all(catalog.id) as unknown as ImportRow[]
  const spus = spuRows.map((row): MerchantSpuSummary => {
    const skus = skuRows.filter((sku) => sku.spu_id === row.id)
    const skuIds = new Set(skus.map((sku) => sku.id))
    return {
      id: row.id,
      catalogId: row.catalog_id,
      type: row.spu_type,
      name: row.name,
      category: row.category,
      description: row.description,
      status: row.status,
      mediaCompletion: row.media_completion,
      sortOrder: row.sort_order,
      version: row.version,
      skus: skus.map(skuSummary),
      slots: slotRows.filter((slot) => skuIds.has(slot.sku_id)).map(slotSummary),
      updatedAt: row.updated_at,
    }
  })
  const focusSpu = focusSpuId ? spus.find((spu) => spu.id === focusSpuId) ?? null : null
  if (focusSpuId && !focusSpu) {
    throw new DomainError(404, 'merchant_spu_not_found', '商品不存在或不在当前门店目录')
  }
  const activeSkus = skuRows.filter((row) => row.status === 'ACTIVE')
  const finiteActive = activeSkus.filter((row) => row.stock_mode === 'FINITE')
  const lowStockSkus = finiteActive.filter(
    (row) => row.stock_quantity <= row.low_stock_threshold,
  )
  const activeSlots = slotRows.filter((row) => row.status === 'ACTIVE')
  const totalCapacity = activeSlots.reduce((sum, row) => sum + row.capacity, 0)
  const reserved = activeSlots.reduce((sum, row) => sum + row.reserved, 0)
  const updatedAt = [
    catalog.updated_at,
    ...spuRows.map((row) => row.updated_at),
    ...skuRows.map((row) => row.updated_at),
  ].sort().at(-1) ?? catalog.updated_at
  return {
    catalog: {
      id: catalog.id,
      storeId: catalog.store_id,
      name: catalog.name,
      status: catalog.status,
      version: catalog.version,
    },
    metrics: {
      activeSpus: spuRows.filter((row) => row.status === 'ACTIVE').length,
      activeSkus: activeSkus.length,
      lowStockSkus: lowStockSkus.length,
      slotUtilization: totalCapacity ? Math.round(reserved / totalCapacity * 1000) / 10 : 0,
      averageMediaCompletion: spuRows.length
        ? Math.round(spuRows.reduce((sum, row) => sum + row.media_completion, 0) / spuRows.length)
        : 0,
    },
    spus,
    focusSpu,
    imports: importRows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      status: row.status,
      totalRows: row.total_rows,
      acceptedRows: row.accepted_rows,
      errors: JSON.parse(row.errors_json) as MerchantCatalogImportSummary['errors'],
      version: row.version,
      createdAt: row.created_at,
      appliedAt: row.applied_at,
    })),
    updatedAt,
  }
}

function recordCatalogEvent(
  database: DatabaseSync,
  principal: Principal,
  catalog: CatalogRow,
  type: string,
  entityType: string,
  entityId: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(payload)
  const riskLevel = typeof payload.riskLevel === 'string' ? payload.riskLevel : 'L1'
  database.prepare(
    `INSERT INTO merchant_catalog_events
     (id, tenant_id, merchant_id, store_id, catalog_id, actor_id, type,
      entity_type, entity_id, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, catalog.merchant_id, catalog.store_id,
    catalog.id, principal.subject, type, entityType, entityId, summary,
    payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    type, entityType, entityId, riskLevel, summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, principal.tenantId, type, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `merchant.catalog.${type.toLowerCase()}.v1`, entityId, payloadJson, timestamp,
  )
}

function idempotentCatalogMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string | undefined,
): MerchantCatalogOverview {
  const requestHash = hash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== requestHash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1
       WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as MerchantCatalogOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const focusSpuId = operation()
    const overview = getMerchantCatalogOverview(database, principal, focusSpuId)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, requestHash, JSON.stringify(overview), now())
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function createCatalogSpu(
  database: DatabaseSync,
  principal: Principal,
  input: {
    type: MerchantSpuType
    name: string
    category: string
    description: string
    mediaCompletion: number
    sku: {
      code: string
      name: string
      priceFen: number
      stockMode: MerchantStockMode
      stockQuantity: number
      lowStockThreshold: number
    }
  },
  idempotencyKey: string,
): MerchantCatalogOverview {
  return idempotentCatalogMutation(
    database, principal, idempotencyKey, '/api/v1/merchant/catalog/spus', input, () => {
      const catalog = getCatalog(database, principal)
      const duplicate = database.prepare(
        `SELECT id FROM merchant_spus WHERE catalog_id = ? AND name = ?`,
      ).get(catalog.id, input.name)
      if (duplicate) throw new DomainError(409, 'merchant_spu_duplicate', '目录中已存在同名商品')
      const duplicateSku = database.prepare(
        `SELECT id FROM merchant_skus WHERE merchant_id = ? AND code = ?`,
      ).get(catalog.merchant_id, input.sku.code)
      if (duplicateSku) throw new DomainError(409, 'merchant_sku_code_duplicate', 'SKU 编码已被使用')
      if (input.sku.stockMode === 'UNLIMITED' && input.sku.stockQuantity !== 0) {
        throw new DomainError(409, 'stock_mode_invalid', '无限库存 SKU 的库存数量必须为 0')
      }
      const timestamp = now()
      const spuId = randomUUID()
      const skuId = randomUUID()
      const sortOrder = database.prepare(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
         FROM merchant_spus WHERE catalog_id = ?`,
      ).get(catalog.id) as { next_order: number }
      database.prepare(
        `INSERT INTO merchant_spus
         (id, tenant_id, merchant_id, catalog_id, spu_type, name, category,
          description, status, media_completion, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
      ).run(
        spuId, principal.tenantId, catalog.merchant_id, catalog.id, input.type,
        input.name, input.category, input.description, input.mediaCompletion,
        sortOrder.next_order, timestamp, timestamp,
      )
      database.prepare(
        `INSERT INTO merchant_skus
         (id, tenant_id, merchant_id, store_id, spu_id, code, name,
          attributes_json, price_fen, compare_at_fen, cost_fen, stock_mode,
          stock_quantity, low_stock_threshold, status, pricing_rule_version,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, NULL, NULL, ?, ?, ?,
          ?, 'price-rule-v1', ?, ?)`,
      ).run(
        skuId, principal.tenantId, catalog.merchant_id, catalog.store_id, spuId,
        input.sku.code, input.sku.name, input.sku.priceFen, input.sku.stockMode,
        input.sku.stockQuantity, input.sku.lowStockThreshold,
        input.sku.stockMode === 'FINITE' && input.sku.stockQuantity === 0
          ? 'OUT_OF_STOCK'
          : 'ACTIVE',
        timestamp, timestamp,
      )
      recordCatalogEvent(
        database, principal, catalog, 'SPU_CREATED', 'merchant_spu', spuId,
        '商品草稿与首个 SKU 已创建',
        {
          type: input.type,
          skuId,
          skuCode: input.sku.code,
          priceFen: input.sku.priceFen,
          stockMode: input.sku.stockMode,
          riskLevel: 'L1',
        },
        timestamp,
      )
      return spuId
    },
  )
}

export function publishCatalogSpu(
  database: DatabaseSync,
  principal: Principal,
  input: { spuId: string; expectedVersion: number },
  idempotencyKey: string,
): MerchantCatalogOverview {
  const route = `/api/v1/merchant/catalog/spus/${input.spuId}/publish`
  return idempotentCatalogMutation(database, principal, idempotencyKey, route, input, () => {
    const catalog = getCatalog(database, principal)
    const spu = getSpu(database, principal, input.spuId)
    if (spu.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '商品已更新，请刷新后重试')
    }
    if (!['DRAFT', 'PAUSED'].includes(spu.status)) {
      throw new DomainError(409, 'spu_status_invalid', '只有草稿或已暂停商品可以发布')
    }
    if (spu.media_completion < 80) {
      throw new DomainError(409, 'spu_media_incomplete', '发布前商品图文完整度必须达到 80%')
    }
    const skus = database.prepare(
      `SELECT id, stock_mode FROM merchant_skus WHERE spu_id = ?`,
    ).all(spu.id) as Array<{ id: string; stock_mode: MerchantStockMode }>
    if (skus.length === 0) throw new DomainError(409, 'spu_sku_required', '发布前至少配置一个 SKU')
    for (const sku of skus.filter((item) => item.stock_mode === 'SLOT')) {
      const count = database.prepare(
        `SELECT COUNT(*) AS count FROM merchant_service_slots
         WHERE sku_id = ? AND status = 'ACTIVE'`,
      ).get(sku.id) as { count: number }
      if (count.count === 0) {
        throw new DomainError(409, 'service_slot_required', '预约型 SKU 发布前必须配置至少一个可用时段')
      }
    }
    const timestamp = now()
    database.prepare(
      `UPDATE merchant_spus SET status = 'ACTIVE', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).run(timestamp, spu.id)
    recordCatalogEvent(
      database, principal, catalog, 'SPU_PUBLISHED', 'merchant_spu', spu.id,
      '商品已通过完整度、SKU 与预约时段校验并发布',
      { previousStatus: spu.status, mediaCompletion: spu.media_completion, skuCount: skus.length, riskLevel: 'L2' },
      timestamp,
    )
    return spu.id
  })
}

export function changeSkuPrice(
  database: DatabaseSync,
  principal: Principal,
  input: {
    skuId: string
    expectedVersion: number
    priceFen: number
    compareAtFen: number | null
    reason: string
    confirmed: boolean
  },
  idempotencyKey: string,
): MerchantCatalogOverview {
  const route = `/api/v1/merchant/catalog/skus/${input.skuId}/price`
  return idempotentCatalogMutation(database, principal, idempotencyKey, route, input, () => {
    const catalog = getCatalog(database, principal)
    const sku = getSku(database, principal, input.skuId)
    if (sku.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', 'SKU 已更新，请刷新后重试')
    }
    if (!input.confirmed) {
      throw new DomainError(409, 'merchant_confirmation_required', '价格变更会影响在售渠道，请确认新旧价格与生效影响')
    }
    if (input.compareAtFen !== null && input.compareAtFen < input.priceFen) {
      throw new DomainError(409, 'compare_at_price_invalid', '划线价不能低于实际售价')
    }
    const timestamp = now()
    const nextRuleVersion = `price-rule-v${sku.version + 1}`
    database.prepare(
      `UPDATE merchant_skus SET price_fen = ?, compare_at_fen = ?,
       pricing_rule_version = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.priceFen, input.compareAtFen, nextRuleVersion, timestamp, sku.id)
    recordCatalogEvent(
      database, principal, catalog, 'SKU_PRICE_CHANGED', 'merchant_sku', sku.id,
      'SKU 价格已强确认并生成新规则版本',
      {
        previousPriceFen: sku.price_fen,
        priceFen: input.priceFen,
        previousRuleVersion: sku.pricing_rule_version,
        pricingRuleVersion: nextRuleVersion,
        reason: input.reason,
        confirmationCaptured: true,
        riskLevel: 'L2',
      },
      timestamp,
    )
    return sku.spu_id
  })
}

export function adjustSkuStock(
  database: DatabaseSync,
  principal: Principal,
  input: { skuId: string; expectedVersion: number; delta: number; reason: string },
  idempotencyKey: string,
): MerchantCatalogOverview {
  const route = `/api/v1/merchant/catalog/skus/${input.skuId}/stock`
  return idempotentCatalogMutation(database, principal, idempotencyKey, route, input, () => {
    const catalog = getCatalog(database, principal)
    const sku = getSku(database, principal, input.skuId)
    if (sku.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', 'SKU 已更新，请刷新后重试')
    }
    if (sku.stock_mode !== 'FINITE') {
      throw new DomainError(409, 'stock_adjustment_not_supported', '只有有限库存 SKU 支持数量调整')
    }
    const nextStock = sku.stock_quantity + input.delta
    if (nextStock < 0) throw new DomainError(409, 'insufficient_stock', '库存调整后不能小于 0')
    const nextStatus = nextStock === 0 ? 'OUT_OF_STOCK' : sku.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
    const timestamp = now()
    database.prepare(
      `UPDATE merchant_skus SET stock_quantity = ?, status = ?,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(nextStock, nextStatus, timestamp, sku.id)
    recordCatalogEvent(
      database, principal, catalog, 'SKU_STOCK_ADJUSTED', 'merchant_sku', sku.id,
      nextStock <= sku.low_stock_threshold ? 'SKU 库存已调整并触发低库存预警' : 'SKU 库存已调整',
      {
        previousStock: sku.stock_quantity,
        delta: input.delta,
        stockQuantity: nextStock,
        lowStockThreshold: sku.low_stock_threshold,
        status: nextStatus,
        reason: input.reason,
        riskLevel: 'L1',
      },
      timestamp,
    )
    return sku.spu_id
  })
}

export function updateServiceSlot(
  database: DatabaseSync,
  principal: Principal,
  input: {
    slotId: string
    expectedVersion: number
    capacity: number
    priceOverrideFen: number | null
    confirmed: boolean
  },
  idempotencyKey: string,
): MerchantCatalogOverview {
  const route = `/api/v1/merchant/catalog/slots/${input.slotId}/capacity`
  return idempotentCatalogMutation(database, principal, idempotencyKey, route, input, () => {
    const catalog = getCatalog(database, principal)
    const slot = getSlot(database, principal, input.slotId)
    if (slot.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '预约时段已更新，请刷新后重试')
    }
    if (!input.confirmed) {
      throw new DomainError(409, 'merchant_confirmation_required', '时段容量与加价会影响可预约结果，请先确认')
    }
    if (input.capacity < slot.reserved) {
      throw new DomainError(409, 'slot_capacity_below_reserved', '时段容量不能低于已预约数量')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE merchant_service_slots SET capacity = ?, price_override_fen = ?,
       version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(input.capacity, input.priceOverrideFen, timestamp, slot.id)
    recordCatalogEvent(
      database, principal, catalog, 'SERVICE_SLOT_CHANGED', 'merchant_service_slot',
      slot.id, '预约时段容量与价格覆盖已强确认',
      {
        skuId: slot.sku_id,
        weekday: slot.weekday,
        startTime: slot.start_time,
        previousCapacity: slot.capacity,
        capacity: input.capacity,
        reserved: slot.reserved,
        previousPriceOverrideFen: slot.price_override_fen,
        priceOverrideFen: input.priceOverrideFen,
        confirmationCaptured: true,
        riskLevel: 'L2',
      },
      timestamp,
    )
    const sku = getSku(database, principal, slot.sku_id)
    return sku.spu_id
  })
}

function validateImportRows(
  database: DatabaseSync,
  catalog: CatalogRow,
  rows: readonly CatalogImportInputRow[],
): MerchantCatalogImportSummary['errors'] {
  const errors: MerchantCatalogImportSummary['errors'] = []
  const seenCodes = new Set<string>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (row.name.trim().length < 2) errors.push({ row: rowNumber, field: 'name', message: '商品名称至少 2 个字符' })
    if (row.priceFen <= 0) errors.push({ row: rowNumber, field: 'priceFen', message: '售价必须大于 0 分' })
    if (row.mediaCompletion < 0 || row.mediaCompletion > 100) errors.push({ row: rowNumber, field: 'mediaCompletion', message: '图文完整度必须在 0–100' })
    if (seenCodes.has(row.skuCode)) errors.push({ row: rowNumber, field: 'skuCode', message: '导入文件内 SKU 编码重复' })
    seenCodes.add(row.skuCode)
    const existingSku = database.prepare(
      `SELECT id FROM merchant_skus WHERE merchant_id = ? AND code = ?`,
    ).get(catalog.merchant_id, row.skuCode)
    if (existingSku) errors.push({ row: rowNumber, field: 'skuCode', message: 'SKU 编码已存在' })
    const existingSpu = database.prepare(
      `SELECT id FROM merchant_spus WHERE catalog_id = ? AND name = ?`,
    ).get(catalog.id, row.name)
    if (existingSpu) errors.push({ row: rowNumber, field: 'name', message: '商品名称已存在' })
    if (row.stockMode === 'UNLIMITED' && row.stockQuantity !== 0) {
      errors.push({ row: rowNumber, field: 'stockQuantity', message: '无限库存数量必须为 0' })
    }
  })
  return errors
}

export function previewCatalogImport(
  database: DatabaseSync,
  principal: Principal,
  input: { fileName: string; rows: CatalogImportInputRow[] },
  idempotencyKey: string,
): MerchantCatalogOverview {
  return idempotentCatalogMutation(
    database, principal, idempotencyKey, '/api/v1/merchant/catalog/imports/preview', input, () => {
      const catalog = getCatalog(database, principal)
      const errors = validateImportRows(database, catalog, input.rows)
      const timestamp = now()
      const importId = randomUUID()
      database.prepare(
        `INSERT INTO merchant_catalog_imports
         (id, tenant_id, merchant_id, store_id, catalog_id, file_name, status,
          rows_json, errors_json, total_rows, accepted_rows, version, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        importId, principal.tenantId, catalog.merchant_id, catalog.store_id,
        catalog.id, input.fileName, errors.length ? 'FAILED' : 'PREVIEWED',
        JSON.stringify(input.rows), JSON.stringify(errors), input.rows.length,
        errors.length ? 0 : input.rows.length, principal.subject, timestamp,
      )
      recordCatalogEvent(
        database, principal, catalog, 'IMPORT_PREVIEWED', 'merchant_catalog_import',
        importId, errors.length ? '批量导入预检未通过' : '批量导入预检通过',
        {
          fileName: input.fileName,
          totalRows: input.rows.length,
          acceptedRows: errors.length ? 0 : input.rows.length,
          errorCount: errors.length,
          riskLevel: 'L1',
        },
        timestamp,
      )
      return undefined
    },
  )
}

export function applyCatalogImport(
  database: DatabaseSync,
  principal: Principal,
  input: { importId: string; expectedVersion: number; confirmed: boolean },
  idempotencyKey: string,
): MerchantCatalogOverview {
  const route = `/api/v1/merchant/catalog/imports/${input.importId}/apply`
  return idempotentCatalogMutation(database, principal, idempotencyKey, route, input, () => {
    const catalog = getCatalog(database, principal)
    const importRow = database.prepare(
      `SELECT id, file_name, status, rows_json, errors_json, total_rows, accepted_rows,
              version, created_at, applied_at
       FROM merchant_catalog_imports WHERE id = ? AND catalog_id = ?`,
    ).get(input.importId, catalog.id) as unknown as ImportRow | undefined
    if (!importRow) throw new DomainError(404, 'catalog_import_not_found', '批量导入任务不存在')
    if (importRow.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '导入任务已更新，请刷新后重试')
    }
    if (importRow.status !== 'PREVIEWED') {
      throw new DomainError(409, 'catalog_import_not_ready', '只有预检无错误的导入任务可以应用')
    }
    if (!input.confirmed) {
      throw new DomainError(409, 'merchant_confirmation_required', '批量导入会创建商品与 SKU，请先确认预检结果')
    }
    const rows = JSON.parse(importRow.rows_json) as CatalogImportInputRow[]
    const timestamp = now()
    let sortOrder = (database.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM merchant_spus WHERE catalog_id = ?`,
    ).get(catalog.id) as { max_order: number }).max_order
    const insertSpu = database.prepare(
      `INSERT INTO merchant_spus
       (id, tenant_id, merchant_id, catalog_id, spu_type, name, category,
        description, status, media_completion, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
    )
    const insertSku = database.prepare(
      `INSERT INTO merchant_skus
       (id, tenant_id, merchant_id, store_id, spu_id, code, name, attributes_json,
        price_fen, compare_at_fen, cost_fen, stock_mode, stock_quantity,
        low_stock_threshold, status, pricing_rule_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, NULL, NULL, ?, ?, ?, ?,
        'price-rule-v1', ?, ?)`,
    )
    for (const row of rows) {
      sortOrder += 10
      const spuId = randomUUID()
      insertSpu.run(
        spuId, principal.tenantId, catalog.merchant_id, catalog.id, row.type,
        row.name, row.category, row.description, row.mediaCompletion, sortOrder,
        timestamp, timestamp,
      )
      insertSku.run(
        randomUUID(), principal.tenantId, catalog.merchant_id, catalog.store_id,
        spuId, row.skuCode, row.skuName, row.priceFen, row.stockMode,
        row.stockQuantity, row.lowStockThreshold,
        row.stockMode === 'FINITE' && row.stockQuantity === 0 ? 'OUT_OF_STOCK' : 'ACTIVE',
        timestamp, timestamp,
      )
    }
    database.prepare(
      `UPDATE merchant_catalog_imports SET status = 'APPLIED', version = version + 1,
       applied_at = ? WHERE id = ?`,
    ).run(timestamp, importRow.id)
    recordCatalogEvent(
      database, principal, catalog, 'IMPORT_APPLIED', 'merchant_catalog_import',
      importRow.id, `批量导入已创建 ${rows.length} 个商品草稿与 SKU`,
      {
        fileName: importRow.file_name,
        importedRows: rows.length,
        confirmationCaptured: true,
        riskLevel: 'L2',
      },
      timestamp,
    )
    return undefined
  })
}
