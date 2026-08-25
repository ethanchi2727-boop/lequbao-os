import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('天下摄影消费视觉迁移', () => {
  it('把精细商品卡结构迁移到真实乐趣生活商品投影', async () => {
    const card = await source('components/LifeRetailProductCard.vue');
    expect(card).toContain('discount-badge');
    expect(card).toContain('store-badge');
    expect(card).toContain('marketPriceCents');
    expect(card).toContain('photo-add');
    expect(card).toContain('availableQuantity');
    expect(card).toContain('typeLabel(product.productType)');
    expect(card).not.toContain('product.sold');
    expect(card).not.toContain('热销榜');
  });

  it('把分类胶囊、品类横幅和排序货架接到现有发现接口', async () => {
    const page = await source('pages/page-201/index.vue');
    expect(page).toContain('lifeCategories');
    expect(page).toContain('category-tabs');
    expect(page).toContain('category-banner');
    expect(page).toContain('sort-bar');
    expect(page).toContain('/api/v1/life/discovery/products');
    expect(page).toContain('/api/v1/life/cart/items');
  });

  it('用服务端价格、规格和库存构成精细商品详情', async () => {
    const page = await source('pages/page-209/index.vue');
    expect(page).toContain('discountPercent');
    expect(page).toContain('marketPriceCents');
    expect(page).toContain('preferredVariant');
    expect(page).toContain('product.updatedAt');
    expect(page).toContain('/api/v1/life/discovery/products/');
    expect(page).toContain('/api/v1/life/cart/items');
  });

  it('迁移券卡、汇总、说明和底部规则面板但不复制旧奖励口径', async () => {
    const page = await source('components/LifeServicePage.vue');
    expect(page).toContain('voucher-summary');
    expect(page).toContain('reward-summary');
    expect(page).toContain('guide-panel');
    expect(page).toContain('credentialSummary');
    expect(page).toContain('rewardSummary');
    expect(page).toContain('/api/v1/life/verification-entitlements');
    expect(page).toContain('/api/v1/life/rewards?limit=50');
    expect(page).not.toContain('分50期发放');
    expect(page).not.toContain('订单金额的20%');
  });
});
