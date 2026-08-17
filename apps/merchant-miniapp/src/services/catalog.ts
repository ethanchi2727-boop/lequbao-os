import type {
  MerchantCatalogOverview,
  MerchantServiceSlotSummary,
  MerchantSkuSummary,
  MerchantSpuSummary,
  MerchantSpuType,
  MerchantStockMode,
  ProblemDetails,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-merchant-owner-2026'

interface UniRequestResult<T> {
  statusCode: number
  data: T
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

export interface CreateCatalogSpuInput {
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
}

function request<T>(options: UniApp.RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      header: { Authorization: `Bearer ${AUTH_TOKEN}`, ...options.header },
      success: (response) => {
        const result = response as unknown as UniRequestResult<T | ProblemDetails>
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T)
          return
        }
        const problem = result.data as ProblemDetails
        reject(new Error(problem.detail ?? '请求失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接经营宝商品服务')),
    })
  })
}

function write(
  path: string,
  data: Record<string, unknown>,
  operation: string,
): Promise<MerchantCatalogOverview> {
  return request<MerchantCatalogOverview>({
    url: `${API_BASE}${path}`,
    method: 'POST',
    data,
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `catalog:${operation}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
    },
  })
}

export function fetchCatalogOverview(focusSpuId?: string): Promise<MerchantCatalogOverview> {
  const query = focusSpuId ? `?focusSpuId=${encodeURIComponent(focusSpuId)}` : ''
  return request<MerchantCatalogOverview>({
    url: `${API_BASE}/merchant/catalog/overview${query}`,
    method: 'GET',
  })
}

export function createCatalogSpu(input: CreateCatalogSpuInput): Promise<MerchantCatalogOverview> {
  return write('/merchant/catalog/spus', input as unknown as Record<string, unknown>, 'create-spu')
}

export function publishCatalogSpu(spu: MerchantSpuSummary): Promise<MerchantCatalogOverview> {
  return write(
    `/merchant/catalog/spus/${spu.id}/publish`,
    { expectedVersion: spu.version },
    `publish:${spu.id}:v${spu.version}`,
  )
}

export function changeCatalogSkuPrice(
  sku: MerchantSkuSummary,
  priceFen: number,
  compareAtFen: number | null,
  reason: string,
): Promise<MerchantCatalogOverview> {
  return write(
    `/merchant/catalog/skus/${sku.id}/price`,
    { expectedVersion: sku.version, priceFen, compareAtFen, reason, confirmed: true },
    `price:${sku.id}:v${sku.version}`,
  )
}

export function adjustCatalogSkuStock(
  sku: MerchantSkuSummary,
  delta: number,
  reason: string,
): Promise<MerchantCatalogOverview> {
  return write(
    `/merchant/catalog/skus/${sku.id}/stock`,
    { expectedVersion: sku.version, delta, reason },
    `stock:${sku.id}:v${sku.version}`,
  )
}

export function updateCatalogServiceSlot(
  slot: MerchantServiceSlotSummary,
  capacity: number,
  priceOverrideFen: number | null,
): Promise<MerchantCatalogOverview> {
  return write(
    `/merchant/catalog/slots/${slot.id}/capacity`,
    { expectedVersion: slot.version, capacity, priceOverrideFen, confirmed: true },
    `slot:${slot.id}:v${slot.version}`,
  )
}

export function previewCatalogImport(
  fileName: string,
  rows: CatalogImportInputRow[],
): Promise<MerchantCatalogOverview> {
  return write(
    '/merchant/catalog/imports/preview',
    { fileName, rows },
    `import-preview:${fileName}`,
  )
}

export function applyCatalogImport(
  importId: string,
  expectedVersion: number,
): Promise<MerchantCatalogOverview> {
  return write(
    `/merchant/catalog/imports/${importId}/apply`,
    { expectedVersion, confirmed: true },
    `import-apply:${importId}:v${expectedVersion}`,
  )
}
