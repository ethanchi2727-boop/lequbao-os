import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('乐趣生活 UniApp 架构', () => {
  it('用一份页面清单输出 H5 和微信小程序', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    expect(pkg.scripts['build:h5']).toBe('uni build');
    expect(pkg.scripts['build:mp-weixin']).toContain('mp-weixin');
  });

  it('uses the platform consumer audience and keeps preview data behind build-time flags', async () => {
    const [session, lifePage, mallPage, cartPage, mePage] = await Promise.all(
      [
        'services/life-session.js',
        'pages/life/index.vue',
        'pages/mall/index.vue',
        'pages/cart/index.vue',
        'pages/me/index.vue',
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
    expect(`${lifePage}${mallPage}${cartPage}${mePage}`).not.toContain('/api/v1/consumer/');
  });
});
