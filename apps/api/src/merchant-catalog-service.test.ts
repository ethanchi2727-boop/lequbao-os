import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`
const managerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.manager}`
const clerkAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.clerk}`

describe('E5 经营宝商品、库存与预约时段', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    if (app) await app.close()
  })

  async function getOverview(focusSpuId?: string, authorization = merchantAuthorization) {
    const query = focusSpuId ? `?focusSpuId=${encodeURIComponent(focusSpuId)}` : ''
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/catalog/overview${query}`,
      headers: { authorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Record<string, any>
  }

  it('返回目录、SPU/SKU、低库存、预约时段和完整度指标', async () => {
    const overview = await getOverview()
    expect(overview.catalog).toMatchObject({
      id: 'catalog-e5-demo',
      storeId: 'store-demo-jingan',
      status: 'ACTIVE',
    })
    expect(overview.metrics).toEqual({
      activeSpus: 3,
      activeSkus: 4,
      lowStockSkus: 1,
      slotUtilization: 58.3,
      averageMediaCompletion: 79,
    })
    expect(overview.spus).toHaveLength(4)
    expect(overview.spus.find((spu: any) => spu.id === 'spu-e5-tasting').slots).toHaveLength(4)
    expect(overview.spus.find((spu: any) => spu.id === 'spu-e5-gift').skus[0])
      .toMatchObject({ stockQuantity: 3, lowStockThreshold: 5 })
  })

  it('创建商品草稿，通过完整度与 SKU 校验后发布并支持幂等重放', async () => {
    const createRequest = {
      method: 'POST' as const,
      url: '/api/v1/merchant/catalog/spus',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:create:tea',
      },
      payload: {
        type: 'PRODUCT',
        name: '雨前龙井礼盒',
        category: '茶礼',
        description: '门店甄选雨前龙井，支持自提与同城配送。',
        mediaCompletion: 92,
        sku: {
          code: 'YHL-TEA-LONGJING',
          name: '标准礼盒',
          priceFen: 26800,
          stockMode: 'FINITE',
          stockQuantity: 20,
          lowStockThreshold: 5,
        },
      },
    }
    const created = await app.inject(createRequest)
    expect(created.statusCode, created.body).toBe(200)
    const replay = await app.inject(createRequest)
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(created.body)
    let overview = created.json() as Record<string, any>
    expect(overview.focusSpu).toMatchObject({
      type: 'PRODUCT',
      name: '雨前龙井礼盒',
      status: 'DRAFT',
      version: 1,
    })

    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/catalog/spus/${overview.focusSpu.id}/publish`,
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:publish:tea',
      },
      payload: { expectedVersion: 1 },
    })
    expect(published.statusCode, published.body).toBe(200)
    overview = published.json() as Record<string, any>
    expect(overview.focusSpu).toMatchObject({ status: 'ACTIVE', version: 2 })
  })

  it('阻止低完整度商品发布，并拒绝店员修改价格', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/spus',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:catalog:create:incomplete',
      },
      payload: {
        type: 'PACKAGE',
        name: '待补图测试套餐',
        category: '测试套餐',
        description: '用于验证发布前的图文完整度质量门禁。',
        mediaCompletion: 42,
        sku: {
          code: 'YHL-INCOMPLETE-TEST',
          name: '测试规格',
          priceFen: 18800,
          stockMode: 'FINITE',
          stockQuantity: 8,
          lowStockThreshold: 2,
        },
      },
    })
    const overview = created.json() as Record<string, any>
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/catalog/spus/${overview.focusSpu.id}/publish`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:catalog:publish:incomplete',
      },
      payload: { expectedVersion: 1 },
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().title).toBe('spu_media_incomplete')

    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/skus/sku-e5-gift/price',
      headers: {
        authorization: clerkAuthorization,
        'idempotency-key': 'e5:catalog:clerk:price',
      },
      payload: {
        expectedVersion: 1,
        priceFen: 34800,
        compareAtFen: 38800,
        reason: '季节原料成本变化',
        confirmed: true,
      },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('价格变更必须强确认并生成新规则版本，库存归零自动售罄', async () => {
    const noConfirmation = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/skus/sku-e5-gift/price',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:price:no-confirm',
      },
      payload: {
        expectedVersion: 1,
        priceFen: 34800,
        compareAtFen: 38800,
        reason: '季节原料成本变化',
        confirmed: false,
      },
    })
    expect(noConfirmation.statusCode).toBe(409)
    expect(noConfirmation.json().title).toBe('merchant_confirmation_required')

    const changed = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/skus/sku-e5-gift/price',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:price:confirmed',
      },
      payload: {
        expectedVersion: 1,
        priceFen: 34800,
        compareAtFen: 38800,
        reason: '季节原料成本变化',
        confirmed: true,
      },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    let overview = changed.json() as Record<string, any>
    expect(overview.focusSpu.skus[0]).toMatchObject({
      priceFen: 34800,
      compareAtFen: 38800,
      pricingRuleVersion: 'price-rule-v2',
      version: 2,
    })

    const stock = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/skus/sku-e5-gift/stock',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:stock:sold-out',
      },
      payload: {
        expectedVersion: 2,
        delta: -3,
        reason: '门店盘点扣减',
      },
    })
    expect(stock.statusCode, stock.body).toBe(200)
    overview = stock.json() as Record<string, any>
    expect(overview.focusSpu.skus[0]).toMatchObject({
      stockQuantity: 0,
      status: 'OUT_OF_STOCK',
      version: 3,
    })
  })

  it('预约容量不能低于已预约数量，确认后保存容量和时段加价', async () => {
    const belowReserved = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/slots/slot-e5-thu-1800/capacity',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:slot:below-reserved',
      },
      payload: {
        expectedVersion: 1,
        capacity: 5,
        priceOverrideFen: null,
        confirmed: true,
      },
    })
    expect(belowReserved.statusCode).toBe(409)
    expect(belowReserved.json().title).toBe('slot_capacity_below_reserved')

    const changed = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/slots/slot-e5-thu-1800/capacity',
      headers: {
        authorization: managerAuthorization,
        'idempotency-key': 'e5:catalog:slot:changed',
      },
      payload: {
        expectedVersion: 1,
        capacity: 12,
        priceOverrideFen: 108800,
        confirmed: true,
      },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const slot = (changed.json() as Record<string, any>).focusSpu.slots
      .find((item: any) => item.id === 'slot-e5-thu-1800')
    expect(slot).toMatchObject({ capacity: 12, reserved: 6, priceOverrideFen: 108800, version: 2 })
  })

  it('批量导入先预检再强确认应用，并保持事件与审计不可篡改', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/imports/preview',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:catalog:import:invalid',
      },
      payload: {
        fileName: '商品导入-错误样例.csv',
        rows: [{
          type: 'PRODUCT',
          name: '礼',
          category: '零售',
          description: '错误样例',
          mediaCompletion: 120,
          skuCode: 'YHL-GIFT-SUMMER',
          skuName: '重复编码',
          priceFen: 0,
          stockMode: 'FINITE',
          stockQuantity: 1,
          lowStockThreshold: 1,
        }],
      },
    })
    expect(invalid.statusCode, invalid.body).toBe(200)
    expect(invalid.json().imports[0]).toMatchObject({ status: 'FAILED', acceptedRows: 0 })
    expect(invalid.json().imports[0].errors.length).toBeGreaterThanOrEqual(3)

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/catalog/imports/preview',
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:catalog:import:preview',
      },
      payload: {
        fileName: '秋季新品-2条.csv',
        rows: [
          {
            type: 'PRODUCT',
            name: '桂花米酿礼盒',
            category: '零售礼盒',
            description: '秋季限定桂花米酿组合礼盒。',
            mediaCompletion: 86,
            skuCode: 'YHL-AUTUMN-GIFT',
            skuName: '标准礼盒',
            priceFen: 29800,
            stockMode: 'FINITE',
            stockQuantity: 24,
            lowStockThreshold: 6,
          },
          {
            type: 'PACKAGE',
            name: '秋日双人午餐',
            category: '午餐套餐',
            description: '工作日秋季限定双人午餐套餐。',
            mediaCompletion: 90,
            skuCode: 'YHL-AUTUMN-LUNCH',
            skuName: '双人版',
            priceFen: 23800,
            stockMode: 'FINITE',
            stockQuantity: 40,
            lowStockThreshold: 10,
          },
        ],
      },
    })
    expect(preview.statusCode, preview.body).toBe(200)
    const importJob = preview.json().imports[0]
    expect(importJob).toMatchObject({ status: 'PREVIEWED', totalRows: 2, acceptedRows: 2, version: 1 })

    const applied = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/catalog/imports/${importJob.id}/apply`,
      headers: {
        authorization: merchantAuthorization,
        'idempotency-key': 'e5:catalog:import:apply',
      },
      payload: { expectedVersion: 1, confirmed: true },
    })
    expect(applied.statusCode, applied.body).toBe(200)
    const overview = applied.json() as Record<string, any>
    expect(overview.spus).toHaveLength(6)
    expect(overview.spus.filter((spu: any) => spu.status === 'DRAFT')).toHaveLength(2)
    expect(overview.imports[0]).toMatchObject({ status: 'APPLIED', version: 2 })

    const events = database.prepare(
      `SELECT COUNT(*) AS count FROM merchant_catalog_events`,
    ).get() as { count: number }
    expect(events.count).toBe(3)
    const audits = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'merchant-catalog-e5'`,
    ).get() as { count: number }
    expect(audits.count).toBe(3)
    expect(() => database.exec("UPDATE merchant_catalog_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
  })
})
