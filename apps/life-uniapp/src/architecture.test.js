import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('乐趣生活 UniApp 架构', () => {
  it('用一份页面清单输出 H5 和微信小程序', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    expect(pkg.scripts['build:h5']).toBe('uni build');
    expect(pkg.scripts['build:mp-weixin']).toContain('mp-weixin');
  });

  it('implements the official V6.3 primary-page top operation contract', async () => {
    const [visual, topBar, surface, lifePage, mallPage, communityPage, cartPage, mePage] =
      await Promise.all(
        [
          'services/life-visual.js',
          'components/LifeTopBar.vue',
          'components/LifeSurface.vue',
          'pages/life/index.vue',
          'pages/mall/index.vue',
          'pages/community/index.vue',
          'pages/cart/index.vue',
          'pages/me/index.vue',
        ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
      );
    expect(visual).toContain('getMenuButtonBoundingClientRect');
    expect(topBar).toContain('搜索商品、附近好店');
    expect(topBar).toContain("'/pages/page-198/index'");
    expect(topBar).toContain("'/pages/page-203/index'");
    expect(topBar).toContain('capsule-reserve');
    expect(surface).toContain('LifeTopBar');
    for (const page of [lifePage, mallPage, communityPage, cartPage, mePage]) {
      expect(page).toMatch(/<LifeSurface\s+primary/u);
    }
    expect(lifePage).toContain('theme-color="coral"');
    expect(mallPage).toContain('theme-color="coral"');
    expect(communityPage).toContain('theme-color="blue"');
  });

  it('uses the platform consumer audience and keeps preview data behind build-time flags', async () => {
    const [
      session,
      lifePage,
      mallPage,
      cartPage,
      mePage,
      cityPage,
      categoryPage,
      searchPage,
      selectedPage,
      detailPage,
      variantPage,
      tracePage,
      eventPage,
      journeyPage,
      servicePage,
    ] = await Promise.all(
      [
        'services/life-session.js',
        'pages/life/index.vue',
        'pages/mall/index.vue',
        'pages/cart/index.vue',
        'pages/me/index.vue',
        'pages/page-198/index.vue',
        'pages/page-201/index.vue',
        'pages/page-204/index.vue',
        'pages/page-207/index.vue',
        'pages/page-209/index.vue',
        'pages/page-210/index.vue',
        'pages/page-211/index.vue',
        'pages/page-213/index.vue',
        'components/LifeJourneyPage.vue',
        'components/LifeServicePage.vue',
      ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    );
    expect(session).toContain("VITE_LEQU_DEVELOPMENT_MOCKS === '1'");
    expect(session).toContain('/api/v1/life/auth/sessions/refresh');
    expect(session).toContain('/api/v1/life/auth/sessions/revoke');
    expect(`${lifePage}${mallPage}`).toContain('/api/v1/life/discovery/products');
    expect(cartPage).toContain('/api/v1/life/checkouts/quote');
    expect(mePage).toContain('/api/v1/life/orders?limit=10');
    expect(mePage).toContain('/api/v1/life/payment-intents');
    expect(mePage).toContain('uni.requestPayment');
    expect(mePage).toContain('最终结果以服务端确认');
    expect(mePage).toContain('/aftercare');
    expect(mePage).toContain('/refunds');
    expect(mePage).toContain("fulfillmentStatus === 'NOT_STARTED'");
    expect(mePage).toContain('已有退款正在处理中');
    expect(cityPage).toContain('/api/v1/life/discovery/stores');
    expect(categoryPage).toContain('/api/v1/life/discovery/products');
    expect(searchPage).toContain('/api/v1/life/discovery/stores');
    expect(selectedPage).toContain('/api/v1/life/discovery/products');
    expect(detailPage).toContain('/api/v1/life/discovery/products/');
    expect(variantPage).toContain('/api/v1/life/cart/items');
    expect(tracePage).toContain('/trace-report');
    expect(tracePage).toContain('不会用商品宣传文案替代');
    expect(eventPage).toContain('不虚构活动倒计时或原价');
    expect(journeyPage).toContain('/api/v1/life/checkouts/quote');
    expect(journeyPage).toContain('/api/v1/life/payment-intents');
    expect(journeyPage).toContain('/refunds');
    expect(journeyPage).toContain('最终结果以服务端确认');
    expect(servicePage).toContain('/api/v1/life/verification-entitlements');
    expect(servicePage).toContain('/api/v1/life/invoice-profiles');
    expect(servicePage).toContain("props.pageId === '246' ? '/aftercare' : ''");
    expect(servicePage).toContain('UNUSED_GROUP_BUY_REFUND');
    expect(servicePage).toContain('store.latitude === null');
    expect(servicePage).toContain('平台令牌不能替代某一商户的消费者令牌');
    expect(servicePage).not.toContain("lifeSession.request('/api/v1/customer-service");
    expect(
      `${lifePage}${mallPage}${cartPage}${mePage}${cityPage}${categoryPage}${searchPage}${selectedPage}${detailPage}${variantPage}${tracePage}${eventPage}${journeyPage}${servicePage}`,
    ).not.toMatch(/\/api\/v1\/consumer\/(?:cart|orders|products|storefront)/u);
  });
});
