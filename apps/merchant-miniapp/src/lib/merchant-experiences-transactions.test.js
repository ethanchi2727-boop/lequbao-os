import { describe, expect, it } from 'vitest';
import experiences from '../generated/merchant-experiences-transactions.json';

describe('商家小程序结算订单售后体验', () => {
  it('八页八布局并且路由唯一', () => {
    expect(experiences).toHaveLength(8);
    expect(new Set(experiences.map((item) => item.id)).size).toBe(8);
    expect(new Set(experiences.map((item) => item.layout)).size).toBe(8);
  });

  it.each(experiences)('$id 具备四项事实、双动作和资金边界', (item) => {
    expect(item.facts).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.actions.every((action) => action.route.startsWith('/merchant/page-'))).toBe(true);
    expect(item.guardrail).toMatch(/不|不能|不得|必须/u);
  });

  it('支付结果和退款详情拒绝客户端合成最终状态', () => {
    const payment = experiences.find((item) => item.id === 'PAGE-285');
    const refund = experiences.find((item) => item.id === 'PAGE-291');
    expect(payment.guardrail).toContain('不得');
    expect(refund.guardrail).toContain('不得');
  });
});
