import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (file) => readFile(new URL(file, import.meta.url), 'utf8');

describe('结算页代金券抵扣与团购详情契约', () => {
  it('结算确认页接入代金券抵扣并以服务端核价为准', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain("import { fetchLifeVouchers, groupVouchers }");
    expect(journey).toContain('voucher-apply-card');
    expect(journey).toContain('voucher-apply-head');
    expect(journey).toContain('vopt');
    expect(journey).toContain('代金券抵扣');
    expect(journey).toContain('张可用');
    expect(journey).toContain('applicableVouchers');
    expect(journey).toContain('toggleVoucher');
    expect(journey).toContain('rewardRedemption');
    expect(journey).toContain("action: 'APPLY'");
    expect(journey).toContain("action: 'SKIP'");
    expect(journey).toContain('rewardGrantIds');
    expect(journey).toContain('rewardRedemptionCents');
    expect(journey).toContain('cashPayableCents');
    expect(journey).toContain('lequ.life.fulfillment.v1');
    expect(journey).toContain('/api/v1/life/checkouts/quote');
  });

  it('代金券抵扣选中态使用概念稿促销红且不引入原生标签', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain('.vopt.on');
    expect(journey).toContain('#f03749');
    expect(journey).toContain('已选 ✓');
    expect(journey).toContain('.voucher-apply-empty');
    expect(journey).toContain('暂无本单可用代金券');
    expect(journey).not.toContain('<img');
    expect(journey).not.toContain('<a ');
  });

  it('团购详情页按确认概念改版并挂接代金券规则页', async () => {
    const journey = await source('components/LifeJourneyPage.vue');
    expect(journey).toContain('voucher-banner');
    expect(journey).toContain('voucherRuleUrl');
    expect(journey).toContain('/pages/voucher/rule/index?amt=');
    expect(journey).toContain('最高可获得');
    expect(journey).toContain('共50期发放完毕');
    expect(journey).toContain('drules');
    expect(journey).toContain('随时退');
    expect(journey).toContain('过期自动退');
    expect(journey).toContain('mrow');
    expect(journey).toContain('购买须知');
    expect(journey).toContain('group-shop-card');
    expect(journey).toContain('groupDiscountText');
    expect(journey).toContain('marketPriceCents');
    expect(journey).toContain('buyNow');
    expect(journey).toContain('马上抢');
  });

  it('代金券数据层透出商家租户以支持结算页可用性过滤', async () => {
    const service = await source('services/life-vouchers.js');
    expect(service).toContain('merchantTenantId');
    expect(service).toContain('/api/v1/life/rewards?limit=');
  });

  it('navigator 内核 a.navigator-wrap 必须有 flex 穿透，防止卡片纵向堆叠', async () => {
    const [journey, wallet] = await Promise.all([
      source('components/LifeJourneyPage.vue'),
      source('pages/voucher/wallet/index.vue'),
    ]);
    expect(journey).toContain('.voucher-banner :deep(.navigator-wrap)');
    expect(wallet).toContain('.cpn :deep(.navigator-wrap)');
  });

  it('首页领券权益条接入真实代金券钱包且所有静态导航均已注册', async () => {
    const [life, pagesRaw] = await Promise.all([
      source('pages/life/index.vue'),
      source('pages.json'),
    ]);
    expect(life).toContain('/pages/voucher/wallet/index');
    expect(life).not.toContain('/pages/page-253/index');
    const pages = JSON.parse(pagesRaw);
    const registered = new Set([
      ...pages.pages.map((page) => `/${page.path}`),
      ...(pages.tabBar?.list ?? []).map((tab) => `/${tab.pagePath}`),
    ]);
    const glob = await import('node:fs/promises').then(async ({ readdir }) => {
      const walk = async (dir) => {
        const out = [];
        for (const entry of await readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
          if (entry.isDirectory()) out.push(...(await walk(`${dir}${entry.name}/`)));
          else if (/\.(vue|js)$/u.test(entry.name)) out.push(`${dir}${entry.name}`);
        }
        return out;
      };
      return walk('./');
    });
    const pattern =
      /(?:navigateTo|redirectTo|switchTab|reLaunch)\(\{\s*url:\s*'(\/pages\/[^'?']+)'/gu;
    for (const file of glob) {
      if (file.includes('.test.')) continue;
      const text = await source(file);
      for (const match of text.matchAll(pattern))
        expect(registered.has(match[1]), `${file} → ${match[1]} 未注册`).toBe(true);
    }
  });
});
