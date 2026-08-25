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

  it('把成熟搜索头、历史热词和分类结果切换迁移到真实发现接口', async () => {
    const [search, results] = await Promise.all([
      source('pages/page-203/index.vue'),
      source('pages/page-204/index.vue'),
    ]);
    expect(search).toContain('search-mark');
    expect(search).toContain('历史搜索');
    expect(search).toContain('热门搜索');
    expect(search).toContain('recentLifeSearches');
    expect(results).toContain('result-search-mark');
    expect(results).toContain('result-tabs');
    expect(results).toContain('/api/v1/life/discovery/products?limit=100');
    expect(results).toContain('/api/v1/life/discovery/stores?limit=100');
  });

  it('把商城购物车的信息密度和金额清单接在服务端核价链路上', async () => {
    const cart = await source('pages/cart/index.vue');
    expect(cart).toContain('basket-mark');
    expect(cart).toContain('cart-group');
    expect(cart).toContain('amount-lines');
    expect(cart).toContain('/api/v1/life/checkouts/quote');
    expect(cart).toContain('/actions/submit');
    expect(cart).not.toContain('🛒');
  });

  it('让结算订单和账户中心使用正式卡片层级且保留真实服务端状态', async () => {
    const [journey, account] = await Promise.all([
      source('components/LifeJourneyPage.vue'),
      source('pages/me/index.vue'),
    ]);
    expect(journey).toContain('delivery-tabs');
    expect(journey).toContain('checkout-amounts');
    expect(journey).toContain('order-card-summary');
    expect(journey).toContain('/api/v1/life/orders?');
    expect(account).toContain('service-icon');
    expect(account).toContain('account-order-head');
    expect(account).toContain('/api/v1/life/orders?limit=10');
    expect(account).toContain('/api/v1/life/invoice-profiles');
  });
});
