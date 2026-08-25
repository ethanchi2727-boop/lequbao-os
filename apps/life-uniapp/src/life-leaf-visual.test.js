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

  it('presents membership, credentials and encrypted profiles without crossing boundaries', async () => {
    const [journey, service] = await Promise.all(
      ['components/LifeJourneyPage.vue', 'components/LifeServicePage.vue'].map((file) =>
        readFile(new URL(file, import.meta.url), 'utf8'),
      ),
    );
    expect(journey).toContain('member-benefit-grid');
    expect(service).toContain('credential-card');
    expect(service).toContain('privacy-note');
    expect(service).toContain("'/api/v1/life/addresses'");
    expect(service).toContain("'/api/v1/life/invoice-profiles'");
    expect(service).toContain('平台令牌不能替代某一商户的消费者令牌');
    expect(service).toContain('lifeSession.requestMerchant');
    expect(service).toContain("'/api/v1/customer-profile'");
    expect(service).toContain("'/api/v1/customer-profile/consents'");
    expect(service).toContain("'/api/v1/customer-profile/privacy-requests'");
    expect(service).toContain('policyVersion: consent.policyVersion');
    expect(service).toContain("'/api/v1/customer-service/conversations'");
    expect(service).toContain('/messages`');
    expect(service).toContain('/actions/request-human`');
    expect(service).toContain('messageContents[message.id]');
    expect(service).toContain("reasonCode: 'CUSTOMER_REQUESTED_HUMAN'");
    expect(service).toContain('visibleConversations');
    expect(service).toContain('conversation.updatedAt');
    expect(service).toContain('conversation.ticket.dueAt');
    expect(service).toContain('params.conversationId');
    expect(service).toContain('merchantTenantId: order.merchantTenantId');
  });

  it('presents map, aftercare and reward facts without synthesizing controlled results', async () => {
    const service = await readFile(
      new URL('components/LifeServicePage.vue', import.meta.url),
      'utf8',
    );
    expect(service).toContain('map-card');
    expect(service).toContain('aftercare-card');
    expect(service).toContain('ledger-card');
    expect(service).toContain('坐标来自门店主档');
    expect(service).toContain('渠道结果以服务端为准');
    expect(service).toContain('/api/v1/life/rewards?limit=50');
    expect(service).toContain("props.pageId === '246' ? '/aftercare' : ''");
  });

  it('removes legacy product and dining placeholders from all Life leaves', async () => {
    const leaves = await Promise.all(
      ['pages/page-198/index.vue', 'pages/page-207/index.vue', 'pages/page-213/index.vue'].map(
        (file) => readFile(new URL(file, import.meta.url), 'utf8'),
      ),
    );
    expect(leaves.join('\n')).not.toMatch(/\/static\/(?:life-product|local-dining)\.webp/u);
    expect(leaves[0]).toContain('../../assets/v63-retail/category-sprite.webp');
    expect(leaves[1]).toContain('LifeRetailProductCard');
    expect(leaves[2]).toContain('../../assets/v63-retail/product-sprite.webp');
  });
});
