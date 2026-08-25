import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('乐趣生活 V6.3 high-traffic leaves', () => {
  it('uses official retail assets for category and product detail', async () => {
    const [category, detail] = await Promise.all(
      ['pages/page-200/index.vue', 'pages/page-209/index.vue'].map((file) =>
        readFile(new URL(file, import.meta.url), 'utf8'),
      ),
    );
    expect(category).toContain('../../assets/v63-retail/category-sprite.webp');
    expect(category).toContain('lifeCategories');
    expect(detail).toContain('../../assets/v63-retail/product-sprite.webp');
    expect(detail).toContain('product.salePriceCents');
    expect(detail).toContain('product.availableQuantity');
    expect(detail).toContain("lifeSession.request('/api/v1/life/cart/items'");
    expect(`${category}${detail}`).not.toMatch(/新人专享|会场5折|爆款直降|第二件半价/u);
  });

  it('filters only already-authorized orders and keeps the detail route', async () => {
    const journey = await readFile(
      new URL('components/LifeJourneyPage.vue', import.meta.url),
      'utf8',
    );
    expect(journey).toContain('filteredOrders');
    expect(journey).toContain('order.status === orderFilter.value');
    expect(journey).toContain('/api/v1/life/orders?');
    expect(journey).toContain("go('238', { orderId: order.id })");
  });

  it('shares official product cards across category and search results', async () => {
    const [categoryResults, search, searchResults, journey] = await Promise.all(
      [
        'pages/page-201/index.vue',
        'pages/page-203/index.vue',
        'pages/page-204/index.vue',
        'components/LifeJourneyPage.vue',
      ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    );
    expect(categoryResults).toContain('LifeRetailProductCard');
    expect(searchResults).toContain('LifeRetailProductCard');
    expect(searchResults).toContain('../../assets/v63-retail/category-sprite.webp');
    expect(search).toContain('不跨租户猜测');
    expect(journey).toContain('order-truth-grid');
    expect(journey).toContain('detail.fulfillmentStatus');
    expect(journey).toContain('detail.aftercareStatus');
  });

  it('keeps checkout, payment and refund surfaces bound to server truth', async () => {
    const journey = await readFile(
      new URL('components/LifeJourneyPage.vue', import.meta.url),
      'utf8',
    );
    expect(journey).toContain('checkout-truth');
    expect(journey).toContain('payment-truth');
    expect(journey).toContain('微信客户端结果不等于订单支付成功');
    expect(journey).toContain('refund-card');
    expect(journey).toContain("'/api/v1/life/checkouts/quote'");
    expect(journey).toContain("'/api/v1/life/payment-intents'");
    expect(journey).toContain('/refunds`');
  });
});
