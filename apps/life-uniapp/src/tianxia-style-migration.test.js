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
    // ===== kimi 真理购物车结构（concept-f cart.html 真实 class：pi/pt/bar/clist/ci/bot/paybar/sum） =====
    // ===== 严禁旧 V6.1 作弊锚点 display:none / basket-mark / cart-group / amount-lines / 🛒 emoji =====
    expect(cart).not.toContain('style="display:none"');
    expect(cart).not.toContain('basket-mark');
    expect(cart).not.toContain('cart-group');
    expect(cart).not.toContain('amount-lines');
    expect(cart).not.toContain('🛒');
    // ===== cart.html 真实结构（一个都不能少、一个都不能自创） =====
    expect(cart).toMatch(/class="[^"]*\bpi\b/);       // 自提/配送图标区（cart.html Lx）
    expect(cart).toMatch(/class="[^"]*\bpt\b/);       // 总览标题文案（件数/库存核验）
    expect(cart).toMatch(/class="[^"]*\bbar\b/);      // 满减进度条
    expect(cart).toMatch(/class="[^"]*\bclist\b/);    // 商品行容器
    expect(cart).toMatch(/class="[^"]*\bci\b/);       // 单个商品行（图/标题/规格/价格/step）
    expect(cart).toMatch(/class="[^"]*\bbot\b/);      // 履约选择+配送地址
    expect(cart).toMatch(/class="[^"]*\bpaybar\b/);   // 底部结算条（合计+提交CTA）
    expect(cart).toMatch(/class="[^"]*\bsum\b/);      // 合计金额区块
    // ===== 真实后端核价链路（kimi JS chunk 契约：quote / actions/submit 幂等） =====
    expect(cart).toContain('/api/v1/life/checkouts/quote');
    expect(cart).toContain('/actions/submit');
  });

  it('让结算订单和账户中心使用正式卡片层级且保留真实服务端状态', async () => {
    const [journey, account] = await Promise.all([
      source('components/LifeJourneyPage.vue'),
      source('pages/me/index.vue'),
    ]);
    // ===== 严禁旧 V6.1 display:none 作弊锚点 / service-icon / account-order-head 伪锚点 =====
    expect(account).not.toContain('style="display:none"');
    expect(account).not.toContain('service-icon');
    expect(account).not.toContain('account-order-head');
    // ===== kimi 真理我的页面结构锚点（concept-f me.html 真实 class） =====
    expect(account).toMatch(/class="[^"]*\bme-head\b/);
    expect(account).toMatch(/class="[^"]*\bmstat\b/);
    expect(account).toMatch(/class="[^"]*\bmord\b/);
    expect(account).toMatch(/class="[^"]*\bmsvc\b/);
    expect(account).toMatch(/class="[^"]*\bmlist\b/);
    expect(journey).toContain('delivery-tabs');
    expect(journey).toContain('checkout-amounts');
    expect(journey).toContain('order-card-summary');
    expect(journey).toContain('/api/v1/life/orders?');
    expect(account).toContain('/api/v1/life/orders?limit=10');
    expect(account).toContain('/api/v1/life/invoice-profiles');
  });

  it('把城市定位与门店推荐迁移成正式发现卡片且保留授权距离边界', async () => {
    const page = await source('pages/page-198/index.vue');
    expect(page).toContain('location-mark');
    expect(page).toContain('store-card-foot');
    expect(page).toContain('store.distanceKm !== null');
    expect(page).toContain('/api/v1/life/discovery/stores?limit=30');
    expect(page).toContain("uni.getLocation({ type: 'gcj02' })");
  });

  it('用正式选择面板、有效报告章与商品卡完善规格溯源团购链路', async () => {
    const [variant, trace, event] = await Promise.all([
      source('pages/page-210/index.vue'),
      source('pages/page-211/index.vue'),
      source('pages/page-213/index.vue'),
    ]);
    expect(variant).toContain('selection-summary');
    expect(variant).toContain('confirm-rail');
    expect(variant).toContain('/api/v1/life/cart/items');
    expect(trace).toContain('trace-seal');
    expect(trace).toContain('evidence-node');
    expect(trace).toContain('/trace-report');
    expect(event).toContain('event-banner');
    expect(event).toContain('LifeRetailProductCard');
    expect(event).toContain('productType=GROUP_BUY');
  });

  it('把附近门店、门店货架和团购详情迁移到正式深层页', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain('journey-store-card');
    expect(journey).toContain('journey-product-grid');
    expect(journey).toContain('group-detail-surface');
    expect(journey).toContain('LifeRetailProductCard');
    expect(journey).toContain('/api/v1/life/discovery/stores?limit=30');
    expect(journey).toContain('/api/v1/life/discovery/products?storeId=');
  });

  it('把支付确认和退款进度迁移成服务端状态驱动的正式反馈', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain('payment-status-panel');
    expect(journey).toContain('payment-seal');
    expect(journey).toContain('refund-progress');
    expect(journey).toContain('refundStatusText');
    expect(journey).toContain('/api/v1/life/payment-intents');
    expect(journey).toContain('/refunds');
  });

  it('把售后申请、地址和发票迁移成正式管理卡片且保留持久化接口', async () => {
    const service = await source('components/LifeServicePage.vue');
    expect(service).toContain('aftercare-order-summary');
    expect(service).toContain('aftercare-summary');
    expect(service).toContain('account-safe-banner');
    expect(service).toContain('address-card');
    expect(service).toContain('invoice-card');
    expect(service).toContain('/api/v1/life/addresses');
    expect(service).toContain('/api/v1/life/invoice-profiles');
    expect(service).toContain('/refunds');
  });

  it('把分类入口和商城货架收敛到移动端正式视觉且继续读取真实发现数据', async () => {
    const [category, mall] = await Promise.all([
      source('pages/page-200/index.vue'),
      source('pages/page-207/index.vue'),
    ]);
    expect(category).toContain('search-entry-mark');
    expect(category).toContain('category-grid');
    expect(category).toContain('repeat(4, 1fr)');
    expect(mall).toContain('mall-banner');
    expect(mall).toContain('mall-search-mark');
    expect(mall).toContain('LifeRetailProductCard');
    expect(mall).toContain('/api/v1/life/discovery/products?limit=100');
  });

  it('把门店地图、会员账户和核销结果迁移成正式状态卡且不越过服务端事实', async () => {
    const [service, journey] = await Promise.all([
      source('components/LifeServicePage.vue'),
      source('components/LifeJourneyPage.vue'),
    ]);
    expect(service).toContain('map-summary');
    expect(service).toContain('map-photo-pin');
    expect(service).toContain('verification-result-surface');
    expect(service).toContain('credentialSummary.remaining');
    expect(service).toContain('/api/v1/life/discovery/stores?limit=50');
    expect(service).toContain('/verification-entitlements');
    expect(journey).toContain('member-card');
    expect(journey).toContain('member-rules');
    expect(journey).toContain('detail.availableRewardCents');
    expect(journey).toContain('/api/v1/consumer/membership');
  });

  it('把跨门店购物车、履约选择和消费奖励迁移成正式结算前链路', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain('journey-cart-summary');
    expect(journey).toContain('journey-cart-group');
    expect(journey).toContain('journey-cart-rail');
    expect(journey).toContain('fulfillment-summary');
    expect(journey).toContain('fulfillment-tip');
    expect(journey).toContain('reward-choice-summary');
    expect(journey).toContain('reward-choice-card');
    expect(journey).toContain('/api/v1/life/checkouts/quote');
    expect(journey).toContain('/actions/submit');
    expect(journey).toContain('/api/v1/life/rewards?limit=20');
  });

  it('把隐私订阅授权和订单售后工具迁移成正式安全账户表面', async () => {
    const service = await source('components/LifeServicePage.vue');
    expect(service).toContain('privacy-summary');
    expect(service).toContain('consent-trust-grid');
    expect(service).toContain('privacy-fact-card');
    expect(service).toContain('subscription-record');
    expect(service).toContain('subscription-empty');
    expect(service).toContain('order-tools-summary');
    expect(service).toContain('order-tool-card');
    expect(service).toContain('/api/v1/customer-profile/privacy-requests');
    expect(service).toContain('/api/v1/customer-profile/consents');
    expect(service).toContain('/api/v1/life/orders?limit=50');
  });

  it('把生活助手、客服和工单迁移成正式会话表面且保留按需解密', async () => {
    const service = await source('components/LifeServicePage.vue');
    expect(service).toContain('support-summary');
    expect(service).toContain('support-conversation-card');
    expect(service).toContain('conversation-filters');
    expect(service).toContain('conversation-detail');
    expect(service).toContain('messageContents[message.id]');
    expect(service).toContain('readMessageContent(message)');
    expect(service).toContain('requestConversationHuman');
    expect(service).toContain('/api/v1/customer-service/conversations');
  });

  it('把订单确认、订单搜索和订单详情迁移成正式交易状态表面', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain('checkout-confirm-summary');
    expect(journey).toContain('checkout-group-card');
    expect(journey).toContain('checkout.discountAmountCents');
    expect(journey).toContain('order-list-summary');
    expect(journey).toContain('order-search');
    expect(journey).toContain('orderSearch');
    expect(journey).toContain('order-detail-summary');
    expect(journey).toContain('order-detail-item');
    expect(journey).toContain('paymentStatusText');
    expect(journey).toContain('/api/v1/life/orders?');
  });
});
