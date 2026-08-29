import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const NO_NATIVE_HTML = /<(div|span|img|a|p|button)\s/u;
const NO_RPX = /rpx/u;

describe('乐趣生活代金券钱包（V6.5 确认设计落地）', () => {
  it('钱包页用真实奖励接口驱动三栏代金券卡', async () => {
    const page = await source('pages/voucher/wallet/index.vue');
    expect(page).toContain('fetchLifeVouchers');
    expect(page).toContain('vtabs');
    expect(page).toContain('vtab');
    expect(page).toContain('cpn');
    expect(page).toContain('cl-amount');
    expect(page).toContain('cr-desc');
    expect(page).toContain('cuse');
    expect(page).toContain('vempty');
    expect(page).toContain('已到账');
    expect(page).toContain('待到账');
    expect(page).toContain('已失效');
    expect(page).toContain('通用代金券');
    expect(page).toContain('规则说明');
    expect(page).toContain('/pages/voucher/rule/index');
    expect(page).toContain('/pages/voucher/detail/index');
    expect(page).toContain('代金券与人民币 1:1 等值 · 不可提现 · 可抵扣订单');
    expect(page).not.toMatch(NO_NATIVE_HTML);
    expect(page).not.toMatch(NO_RPX);
    expect(page).not.toContain('优惠券');
  });

  it('规则页保留消费奖励五步说明原文', async () => {
    const page = await source('pages/voucher/rule/index.vue');
    expect(page).toContain('vr-hero');
    expect(page).toContain('vr-title');
    expect(page).toContain('下单消费');
    expect(page).toContain('分期发放');
    expect(page).toContain('共50期发放完毕，每期金额不同，累计最高可获订单金额');
    expect(page).toContain('确认到账');
    expect(page).toContain('抵扣使用');
    expect(page).toContain('失效规则');
    expect(page).toContain('退款时代金券将按规则失效，已使用的从资金池扣回');
    expect(page).toContain('本商品最高可获');
    expect(page).not.toMatch(NO_NATIVE_HTML);
    expect(page).not.toMatch(NO_RPX);
  });

  it('明细页按状态分层汇总并列出获得记录', async () => {
    const page = await source('pages/voucher/detail/index.vue');
    expect(page).toContain('累计获得代金券');
    expect(page).toContain('已使用/失效');
    expect(page).toContain('获得记录');
    expect(page).toContain('vsum-grid');
    expect(page).toContain('sec-title');
    expect(page).toContain('vr-amount');
    expect(page).toContain('fetchLifeVouchers');
    expect(page).not.toMatch(NO_NATIVE_HTML);
    expect(page).not.toMatch(NO_RPX);
  });

  it('数据层把奖励账本状态机映射为钱包三栏', async () => {
    const service = await source('services/life-vouchers.js');
    expect(service).toContain("'PENDING'");
    expect(service).toContain("'AVAILABLE'");
    expect(service).toContain("'EXPIRED'");
    expect(service).toContain("'REVERSED'");
    expect(service).toContain("'REDEEMED'");
    expect(service).toContain('availableAmountCents');
    expect(service).toContain('grantedAmountCents');
    expect(service).toContain('redeemedAmountCents');
    expect(service).toContain('reversedAmountCents');
    expect(service).toContain('voucherStatusKey');
    expect(service).toContain('groupVouchers');
    expect(service).toContain('summarizeVouchers');
    expect(service).toContain('fetchLifeVouchers');
    expect(service).toContain('/api/v1/life/rewards?limit=');
    expect(service).toContain('MERCHANT');
    expect(service).toContain('PLATFORM_CAMPAIGN');
  });

  it('自定义导航沿用概念稿骨架并预留微信胶囊位', async () => {
    const nav = await source('components/LifeVoucherNav.vue');
    expect(nav).toContain('pnav');
    expect(nav).toContain('ptitle');
    expect(nav).toContain('capsule-reserve');
    expect(nav).toContain('readLifeChromeMetrics');
    expect(nav).toContain('uni.navigateBack');
    expect(nav).not.toMatch(NO_NATIVE_HTML);
  });

  it('三个页面注册进页面清单且使用自定义导航', async () => {
    const pagesJson = JSON.parse(await source('pages.json'));
    const paths = pagesJson.pages.map((page) => page.path);
    expect(paths).toContain('pages/voucher/wallet/index');
    expect(paths).toContain('pages/voucher/rule/index');
    expect(paths).toContain('pages/voucher/detail/index');
    for (const page of pagesJson.pages) {
      if (page.path.startsWith('pages/voucher/')) {
        expect(page.style.navigationStyle).toBe('custom');
      }
    }
  });

  it('我的页服务网格首格直达代金券钱包', async () => {
    const me = await source('pages/me/index.vue');
    expect(me).toContain('/pages/voucher/wallet/index');
    expect(me).toContain('我的代金券');
    expect(me).toContain('voucher-icon');
  });
});
